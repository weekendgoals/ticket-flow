#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve, relative, isAbsolute } from 'node:path'
import * as github from './tracker/github.mjs'
import { TrackerError } from './tracker/github.mjs'
import { parseEpicBody, parseTicketBody, withEpicLine, withBlockedBy, withTicketListed, withTicketChecked, normalizeNewlines } from './issue-body.mjs'
import { runCriteria, formatCheckReport, CHECK_TIMEOUT_MS, CHECK_MAX_BUFFER } from './checks.mjs'
import {
  GitError,
  git,
  repositoryRoot,
  trackedChanges,
  untrackedFiles,
  currentBranch,
  resolveCommit,
  fetchOrigin,
  ticketBranchName,
  cutTicketBranch,
  pushTicketBranch,
  mergeIntoEpic,
} from './delivery.mjs'
import {
  isUnattended,
  hostName,
  startRefusal,
  deliveryFor,
  startedComment,
  lastStart,
  lastAcceptance,
  editsAfter,
  acceptanceComment,
  editedRefusal,
} from './ticket-steps.mjs'
import { loadSources, meterTranscripts, meterComment } from './meter.mjs'
import { COPILOT_REVIEWER_LOGIN, BOTS, configuredBot, copilotUnavailable, botReview, summarizeChecks, sleepSeconds } from './review-bots.mjs'
import {
  LABELS,
  EPIC_LABEL,
  TICKET_LABEL,
  NEEDS_HUMAN_LABEL,
  STATE_LABELS,
  TIER_LABELS,
  MODEL_BY_TIER,
  ticketState,
  ticketTier,
  deriveEpic,
  nextSteps,
} from './epic-state.mjs'

const USAGE = `usage: flow <command>

  init                                   create the Flow labels in this repository
  doctor                                 check gh, the repository, the labels and every open epic
  board [<epic>] [--json]                list open epics, or one epic's tickets
  next <epic>                            what can start now, as JSON (exit 1 when the epic is stuck)
  ticket <n>                             one ticket, parsed, as JSON
  check <n> [--cwd <dir>]                run a ticket's CHECK criteria (exit 1 unless all pass)
  check --file <md> [--epic-file <md>]   the same, for a draft ticket body not yet on GitHub
  link <epic> <n>                        finish linking a ticket to its epic (safe to repeat)
  post <n> --file <md> | --text "<md>"   add a comment
  label <n> +<label> -<label> ...        add and remove labels
  create-epic --file <md> --title "<t>"
  create-ticket <epic> --file <md> --title "<t>" [--tier easy|hard] [--blocked-by <n>,<n>]
  create-ticket --no-epic --file <md> --title "<t>" [--tier easy|hard]
  needs-human <n> --text "<why>"         stop a ticket and ask a person

  start <n> [--cwd <dir>]                start a ready ticket: its branch, label and first comment (JSON)
  accept <n> [--cwd <dir>]               run the criteria on the committed head and post the result
  deliver <n> [--cwd <dir>]              merge the accepted commit into the epic branch, or open its pull request
  screenshots <n> [--cwd <dir>]          run the screenshots command from .flow.json, commit the images, link them
  meter <n> --transcripts [<role>=]<path> ... [--print]
                                         post what the ticket cost, read from session transcripts
  pr-review-request <pr>                 ask Copilot to review (prints copilot, coderabbit or none)
  pr-wait <pr> [--bot copilot|coderabbit|none] [--timeout <s>] [--interval <s>]
  pr-threads <pr>                        unresolved review threads, as JSON
  pr-resolve <thread-id> --text "<reply>"
  pr-checks <pr> [--wait] [--timeout <s>] [--interval <s>]`

const VALUE_FLAGS = new Set(['--file', '--epic-file', '--text', '--title', '--tier', '--cwd', '--blocked-by', '--bot', '--timeout', '--interval'])
const REPEATABLE_FLAGS = new Set(['--transcripts'])
const BOOLEAN_FLAGS = new Set(['--json', '--no-epic', '--print', '--wait'])
const DEFAULT_WAIT_SECONDS = 1800
const DEFAULT_POLL_SECONDS = 30
const DEFAULT_SCREENSHOTS_DIR = '.flow/screenshots/{n}'
const CHECKS_PENDING_EXIT = 3

class UsageError extends Error {}

function parseArguments(argv) {
  const positional = []
  const flags = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (VALUE_FLAGS.has(arg)) {
      if (index + 1 >= argv.length) throw new UsageError(`${arg} needs a value`)
      flags[arg.slice(2)] = argv[++index]
    } else if (REPEATABLE_FLAGS.has(arg)) {
      if (index + 1 >= argv.length) throw new UsageError(`${arg} needs a value`)
      const values = []
      while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) values.push(argv[++index])
      if (!values.length) throw new UsageError(`${arg} needs a value`)
      flags[arg.slice(2)] = [...(flags[arg.slice(2)] || []), ...values]
    } else if (BOOLEAN_FLAGS.has(arg)) flags[arg.slice(2)] = true
    else if (arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`)
    else positional.push(arg)
  }
  return { positional, flags }
}

function issueNumber(value, what = 'issue number') {
  const text = String(value ?? '').replace(/^#/, '')
  if (!/^\d+$/.test(text)) throw new UsageError(`expected ${what}, got "${value ?? ''}"`)
  return Number(text)
}

function readText(flags) {
  if (flags.file !== undefined && flags.text !== undefined) throw new UsageError('give --file or --text, not both')
  if (flags.file !== undefined) return readFileSync(flags.file, 'utf8')
  if (flags.text !== undefined) return flags.text
  throw new UsageError('give --file <md> or --text "<md>"')
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function formatTable(headers, rows) {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => String(row[column]).length)))
  const render = (cells) => cells.map((cell, column) => String(cell).padEnd(widths[column])).join('  ').trimEnd()
  return [render(headers), render(widths.map((width) => '-'.repeat(width))), ...rows.map(render)].join('\n')
}

function loadEpic(number) {
  const issue = github.getIssue(number)
  if (!issue.labels.includes(EPIC_LABEL)) throw new UsageError(`#${number} is not an epic (it has no ${EPIC_LABEL} label)`)
  return deriveEpic(issue, github.listSubIssues(number))
}

function loadTicket(number) {
  const issue = github.getIssue(number)
  const firstPass = parseTicketBody(issue.body)
  let designSources = null
  let epicAuthor = null
  if (firstPass.epic !== null) {
    const epic = github.getIssue(firstPass.epic)
    designSources = parseEpicBody(epic.body).settings.designSources
    epicAuthor = epic.author
  }
  return { issue, parsed: parseTicketBody(issue.body, designSources), epicAuthor }
}

function gitTopLevel() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : process.cwd()
}

function commandInit() {
  const { created, existing } = github.ensureLabels(LABELS)
  for (const name of created) console.log(`created ${name}`)
  console.log(created.length ? `${created.length} label(s) created, ${existing.length} already there` : `all ${existing.length} labels already there`)
}

function commandDoctor() {
  const problems = []
  const finish = () => {
    if (!problems.length) {
      console.log('ok')
      return 0
    }
    for (const problem of problems) console.log(problem)
    return 1
  }
  try {
    github.ghVersion()
  } catch (error) {
    if (!error.missing) throw error
    problems.push('The GitHub CLI `gh` is not installed or not on PATH; Flow reads and writes every ticket through it (https://cli.github.com).')
    return finish()
  }
  const auth = github.authStatus()
  if (!auth.ok) {
    problems.push('`gh` is not signed in to GitHub; run `gh auth login`.')
    return finish()
  }
  let repo
  try {
    repo = github.repoInfo()
  } catch (error) {
    problems.push(`Cannot read this repository on GitHub (${error.message}); run Flow inside a clone whose remote is on GitHub.`)
    return finish()
  }
  if (!repo.hasIssues) problems.push(`${repo.slug} has issues turned off, and Flow keeps every epic and ticket there; turn them on under Settings → General → Features.`)
  if (!repo.defaultBranch) problems.push(`The default branch of ${repo.slug} is unknown, so nobody can say where epic branches start or where release pull requests go.`)
  const present = new Set(github.listLabels().map((label) => label.name))
  const missing = LABELS.map((label) => label.name).filter((name) => !present.has(name))
  if (missing.length) problems.push(`Labels missing: ${missing.join(', ')}; run \`flow init\`.`)
  if (repo.hasIssues)
    for (const epicIssue of github.listIssues({ label: EPIC_LABEL })) {
      const epic = deriveEpic(epicIssue, github.listSubIssues(epicIssue.number))
      for (const problem of epic.problems) problems.push(`${problem}.`)
    }
  return finish()
}

function commandBoard(positional, flags) {
  if (positional.length) {
    const epic = loadEpic(issueNumber(positional[0], 'an epic number'))
    const defaultBranch = github.defaultBranch()
    if (flags.json) return printJson({ defaultBranch, ...epic })
    console.log(`#${epic.number} ${epic.title}`)
    console.log(`${epic.approved ? 'approved' : 'not approved'} · branch ${epic.settings.branch || '(none set)'} from ${defaultBranch || '(unknown default branch)'} · ${epic.settings.delivery || 'unreadable'} delivery · parallel ${epic.settings.parallel ?? 'unreadable'}`)
    console.log('')
    if (!epic.tickets.length) console.log('no tickets')
    else
      console.log(
        formatTable(
          ['#', 'title', 'tier', 'state', 'blocked by'],
          epic.tickets.map((ticket) => [
            `#${ticket.number}`,
            ticket.title,
            ticket.tier,
            ticket.shownState,
            ticket.blockedByProblem ? 'unreadable line' : ticket.blockedBy.map((number) => `#${number}`).join(', ') || '—',
          ]),
        ),
      )
    if (epic.problems.length) {
      console.log('')
      for (const problem of epic.problems) console.log(`! ${problem}`)
    }
    return
  }
  const defaultBranch = github.defaultBranch()
  const epics = github.listIssues({ label: EPIC_LABEL }).map((issue) => deriveEpic(issue, github.listSubIssues(issue.number)))
  const rows = epics.map((epic) => ({
    number: epic.number,
    title: epic.title,
    approved: epic.approved,
    done: epic.tickets.filter((ticket) => ticket.state === 'done').length,
    total: epic.tickets.length,
    branch: epic.settings.branch,
    problems: epic.problems.length,
  }))
  if (flags.json) return printJson({ defaultBranch, epics: rows })
  console.log(`default branch: ${defaultBranch || '(unknown)'}`)
  if (!rows.length) return console.log('no open epics')
  console.log('')
  console.log(
    formatTable(
      ['#', 'title', 'approved', 'done', 'branch'],
      rows.map((row) => [
        `#${row.number}`,
        row.title,
        row.approved ? 'yes' : 'no',
        `${row.done}/${row.total}`,
        `${row.branch || '(none set)'}${row.problems ? `  (${row.problems} problem(s): flow board ${row.number})` : ''}`,
      ]),
    ),
  )
}

function commandNext(positional) {
  const epic = loadEpic(issueNumber(positional[0], 'an epic number'))
  const { result, stuckReason } = nextSteps(epic)
  printJson(result)
  if (stuckReason) {
    process.stderr.write(`${stuckReason}\n`)
    return 1
  }
  return 0
}

function commandTicket(positional) {
  const number = issueNumber(positional[0], 'a ticket number')
  const { issue, parsed } = loadTicket(number)
  const { state } = ticketState(issue.labels)
  const tier = ticketTier(issue.labels)
  printJson({
    number: issue.number,
    title: issue.title,
    url: issue.url,
    epic: parsed.epic,
    state,
    tier,
    model: MODEL_BY_TIER[tier],
    labels: issue.labels,
    assignees: issue.assignees,
    blockedBy: parsed.blockedBy,
    blockedByProblem: parsed.blockedByProblem,
    scope: parsed.scope,
    notInScope: parsed.notInScope,
    acceptanceCriteria: parsed.acceptanceCriteria,
    notes: parsed.notes,
    criteria: parsed.criteria,
    edits: github.bodyEditHistory(number),
  })
}

function draftCriteria(flags) {
  const designSources = flags['epic-file'] === undefined ? null : parseEpicBody(readFileSync(flags['epic-file'], 'utf8')).settings.designSources
  return parseTicketBody(readFileSync(flags.file, 'utf8'), designSources).criteria
}

function commandCheck(positional, flags) {
  const fromDraft = flags.file !== undefined
  if (fromDraft && positional.length) throw new UsageError('give a ticket number or --file, not both')
  if (!fromDraft && flags['epic-file'] !== undefined) throw new UsageError('--epic-file goes with --file')
  const ticket = fromDraft ? flags.file : issueNumber(positional[0], 'a ticket number')
  const criteria = fromDraft ? draftCriteria(flags) : loadTicket(ticket).parsed.criteria
  const edits = fromDraft ? null : github.bodyEditHistory(ticket)
  const report = { ...runCriteria({ ticket, ...criteria }, { cwd: flags.cwd || gitTopLevel() }), edits }
  process.stderr.write(`${formatCheckReport(report)}\n`)
  printJson(report)
  return report.allPassed ? 0 : 1
}

function commandPost(positional, flags) {
  const number = issueNumber(positional[0])
  const posted = github.comment(number, readText(flags))
  console.log(posted.url || `commented on #${number}`)
}

function commandLabel(argv) {
  const number = issueNumber(argv[0])
  const changes = argv.slice(1)
  if (!changes.length) throw new UsageError('give at least one +<label> or -<label>')
  const add = []
  const remove = []
  for (const change of changes) {
    if (/^\+[^+]/.test(change)) add.push(change.slice(1))
    else if (/^-[^-]/.test(change)) remove.push(change.slice(1))
    else if (change.startsWith('--')) throw new UsageError(`unknown option ${change}`)
    else throw new UsageError(`"${change}" is neither +<label> nor -<label>`)
  }
  const issue = github.getIssue(number)
  const after = [...new Set([...issue.labels.filter((label) => !remove.includes(label)), ...add])]
  const states = after.filter((label) => STATE_LABELS.includes(label))
  if (states.length > 1) {
    process.stderr.write(`#${number} would carry ${states.length} state labels (${states.join(', ')}); remove the old one in the same command\n`)
    return 1
  }
  github.addLabels(number, add.filter((label) => !issue.labels.includes(label)))
  github.removeLabels(number, remove.filter((label) => issue.labels.includes(label)))
  console.log(`#${number}: ${after.join(', ') || '(no labels)'}`)
  return 0
}

function commandCreateEpic(flags) {
  if (!flags.title) throw new UsageError('create-epic needs --title')
  if (flags.file === undefined) throw new UsageError('create-epic needs --file')
  const body = readFileSync(flags.file, 'utf8')
  const { problems } = parseEpicBody(body)
  if (problems.length) {
    for (const problem of problems) process.stderr.write(`${problem}\n`)
    return 1
  }
  const created = github.createIssue({ title: flags.title, body, labels: [EPIC_LABEL] })
  console.log(created.number)
  return 0
}

function parseBlockerList(value) {
  if (value === undefined || value.trim() === '') return []
  return value.split(',').map((part) => issueNumber(part.trim(), 'a blocking ticket number'))
}

function commandCreateTicketWithoutEpic(positional, flags) {
  if (positional.length) throw new UsageError('give an epic number or --no-epic, not both')
  if (!flags.title) throw new UsageError('create-ticket needs --title')
  if (flags.file === undefined) throw new UsageError('create-ticket needs --file')
  if (flags['blocked-by'] !== undefined) throw new UsageError('a ticket with no epic cannot be blocked by other tickets')
  const tier = flags.tier || 'hard'
  if (!TIER_LABELS[tier]) throw new UsageError(`--tier must be easy or hard, got "${tier}"`)
  const body = normalizeNewlines(readFileSync(flags.file, 'utf8'))
  const parsed = parseTicketBody(body)
  const problems = [
    ...(parsed.epic !== null ? [`the body says "Epic: #${parsed.epic}"; create it with \`flow create-ticket ${parsed.epic}\` instead`] : []),
    ...(parsed.blockedByProblem ? [parsed.blockedByProblem] : []),
    ...(parsed.blockedBy.length ? ['a ticket with no epic cannot be blocked by other tickets; remove the "Blocked by" line'] : []),
    ...parsed.criteria.problems.map((problem) => `line ${problem.line ?? '?'}: ${problem.why}: ${problem.text}`),
  ]
  if (problems.length) {
    for (const problem of problems) process.stderr.write(`${problem}\n`)
    return 1
  }
  const created = github.createIssue({ title: flags.title, body, labels: [TICKET_LABEL, 'flow:planned', TIER_LABELS[tier]] })
  console.log(created.number)
  return 0
}

function commandCreateTicket(positional, flags) {
  if (flags['no-epic']) return commandCreateTicketWithoutEpic(positional, flags)
  const epicNumber = issueNumber(positional[0], 'an epic number')
  if (!flags.title) throw new UsageError('create-ticket needs --title')
  if (flags.file === undefined) throw new UsageError('create-ticket needs --file')
  const tier = flags.tier || 'hard'
  if (!TIER_LABELS[tier]) throw new UsageError(`--tier must be easy or hard, got "${tier}"`)
  const blockers = parseBlockerList(flags['blocked-by'])
  const epic = github.getIssue(epicNumber)
  if (!epic.labels.includes(EPIC_LABEL)) throw new UsageError(`#${epicNumber} is not an epic (it has no ${EPIC_LABEL} label)`)
  const epicPlan = parseEpicBody(epic.body)
  if (epicPlan.problems.length) {
    for (const problem of epicPlan.problems) process.stderr.write(`epic #${epicNumber}: ${problem}\n`)
    return 1
  }
  let body
  try {
    body = withBlockedBy(withEpicLine(readFileSync(flags.file, 'utf8'), epicNumber), blockers)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 1
  }
  const parsed = parseTicketBody(body, epicPlan.settings.designSources)
  const problems = [
    ...(parsed.blockedByProblem ? [parsed.blockedByProblem] : []),
    ...parsed.criteria.problems.map((problem) => `line ${problem.line}: ${problem.why}: ${problem.text}`),
  ]
  const members = new Set(github.listSubIssues(epicNumber).map((issue) => issue.number))
  const outside = parsed.blockedBy.filter((number) => !members.has(number))
  if (outside.length)
    problems.push(`blocked by ${outside.map((number) => `#${number}`).join(', ')}, which is not a ticket of epic #${epicNumber}; create the blocking tickets first`)
  if (problems.length) {
    for (const problem of problems) process.stderr.write(`${problem}\n`)
    return 1
  }
  const created = github.createIssue({ title: flags.title, body, labels: [TICKET_LABEL, 'flow:planned', TIER_LABELS[tier]] })
  try {
    github.addSubIssue(epicNumber, created.id)
    github.updateIssueBody(epicNumber, withTicketListed(epic.body, created.number, flags.title))
  } catch (error) {
    process.stderr.write(
      `created #${created.number}, but could not link it to epic #${epicNumber}: ${error.message}\nFinish with \`flow link ${epicNumber} ${created.number}\`; running create-ticket again would create a duplicate.\n`,
    )
    console.log(created.number)
    return 1
  }
  console.log(created.number)
  return 0
}

function commandLink(positional) {
  const epicNumber = issueNumber(positional[0], 'an epic number')
  const ticketNumber = issueNumber(positional[1], 'a ticket number')
  const epic = github.getIssue(epicNumber)
  if (!epic.labels.includes(EPIC_LABEL)) throw new UsageError(`#${epicNumber} is not an epic (it has no ${EPIC_LABEL} label)`)
  const ticket = github.getIssue(ticketNumber)
  const named = parseTicketBody(ticket.body).epic
  if (named !== null && named !== epicNumber) {
    process.stderr.write(`#${ticketNumber} says "Epic: #${named}", not #${epicNumber}; nothing was changed\n`)
    return 1
  }
  const done = []
  if (named === null) {
    github.updateIssueBody(ticketNumber, withEpicLine(ticket.body, epicNumber))
    done.push(`wrote "Epic: #${epicNumber}" into #${ticketNumber}`)
  }
  if (!github.listSubIssues(epicNumber).some((issue) => issue.number === ticketNumber)) {
    github.addSubIssue(epicNumber, ticket.id)
    done.push(`made #${ticketNumber} a sub-issue of #${epicNumber}`)
  }
  const listed = withTicketListed(epic.body, ticketNumber, ticket.title)
  if (listed !== normalizeNewlines(epic.body)) {
    github.updateIssueBody(epicNumber, listed)
    done.push(`listed #${ticketNumber} under the epic's tickets`)
  }
  console.log(done.length ? done.join('; ') : `#${ticketNumber} was already linked to epic #${epicNumber}`)
  return 0
}

function markNeedsHuman(number, text) {
  const { issue, epicAuthor } = loadTicket(number)
  const people = issue.assignees.length ? issue.assignees : [epicAuthor || issue.author].filter(Boolean)
  github.addLabels(number, issue.labels.includes(NEEDS_HUMAN_LABEL) ? [] : [NEEDS_HUMAN_LABEL])
  github.removeLabels(number, issue.labels.filter((label) => STATE_LABELS.includes(label) && label !== NEEDS_HUMAN_LABEL))
  const mention = people.map((login) => `@${login}`).join(' ')
  return github.comment(number, `**This ticket needs a person.** ${mention ? `${mention} ` : ''}${text}`)
}

function commandNeedsHuman(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  if (!flags.text) throw new UsageError('needs-human needs --text "<why>"')
  const posted = markNeedsHuman(number, flags.text)
  console.log(posted.url || `#${number} marked ${NEEDS_HUMAN_LABEL}`)
}

const STATES_A_REFUSAL_STOPS = new Set(['planned', 'in-progress', 'in-review', 'unlabelled'])

function refuse(number, state, reason) {
  process.stderr.write(`${reason}\n`)
  if (isUnattended() && STATES_A_REFUSAL_STOPS.has(state)) {
    markNeedsHuman(number, reason)
    process.stderr.write(`#${number} is now marked ${NEEDS_HUMAN_LABEL}\n`)
  }
  return 1
}

function requireRepository(flags) {
  const root = repositoryRoot(resolve(flags.cwd || process.cwd()))
  if (!root) throw new UsageError(`${flags.cwd || 'the current directory'} is not inside a git repository`)
  return root
}

function describeChanges(changes) {
  return `${changes.slice(0, 5).map((line) => line.slice(3)).join(', ')}${changes.length > 5 ? ` and ${changes.length - 5} more` : ''}`
}

function loadOptionalEpic(epicNumber) {
  if (epicNumber === null) return { epic: null, epicIssue: null }
  const epicIssue = github.getIssue(epicNumber)
  if (!epicIssue.labels.includes(EPIC_LABEL)) return { epic: null, epicIssue, notAnEpic: true }
  return { epic: deriveEpic(epicIssue, github.listSubIssues(epicNumber)), epicIssue }
}

function commandStart(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  const root = requireRepository(flags)
  const { issue, parsed } = loadTicket(number)
  const { state } = ticketState(issue.labels)
  const { epic, notAnEpic } = loadOptionalEpic(parsed.epic)
  if (notAnEpic) return refuse(number, state, `#${number} says "Epic: #${parsed.epic}", but #${parsed.epic} is not an epic`)
  const delivery = deliveryFor(epic)
  let reason = startRefusal({ ticket: number, state, parsed, epic })
  if (!reason && delivery === 'release' && !epic.settings.branch)
    reason = `epic #${epic.number} has no "Branch:" setting, so there is no epic branch to build on`
  const changes = reason ? [] : trackedChanges(root)
  if (changes.length)
    reason = `the working tree has uncommitted changes (${describeChanges(changes)}); commit or stash them first, so nothing unrelated rides into the ticket`
  if (reason) return refuse(number, state, reason)
  const base = delivery === 'release' ? epic.settings.branch : github.defaultBranch()
  if (!base) return refuse(number, state, 'the default branch of this repository is unknown, so there is nothing to start the ticket from')
  const branch = ticketBranchName(number)
  const cut = cutTicketBranch(root, { branch, base })
  if (!cut.ok) return refuse(number, state, `#${number} cannot start: ${cut.reason}`)
  const tier = ticketTier(issue.labels)
  const model = MODEL_BY_TIER[tier]
  github.addLabels(number, ['flow:in-progress'])
  github.removeLabels(number, ['flow:planned'])
  const host = hostName()
  github.comment(number, startedComment({ host, model, branch, base, baseSha: cut.baseSha }))
  printJson({
    ticket: number,
    title: issue.title,
    epic: epic ? epic.number : null,
    delivery,
    branch,
    base,
    baseSha: cut.baseSha,
    tier,
    model,
    host,
    unattended: isUnattended(),
  })
  return 0
}

const ACCEPTABLE_STATES = new Set(['in-progress', 'in-review'])

function commandAccept(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  const root = requireRepository(flags)
  const { issue, parsed } = loadTicket(number)
  const { state } = ticketState(issue.labels)
  const fail = (reason) => {
    process.stderr.write(`${reason}\n`)
    return 1
  }
  if (!ACCEPTABLE_STATES.has(state)) return fail(`#${number} is ${state}; only a ticket in progress or in review can be accepted`)
  const branch = ticketBranchName(number)
  if (currentBranch(root) !== branch) return fail(`check out ${branch} first: acceptance runs on that branch's committed head`)
  const changes = trackedChanges(root)
  if (changes.length) return fail(`the working tree has uncommitted changes (${describeChanges(changes)}); acceptance judges the committed head, so commit or discard them first`)
  const sha = resolveCommit(root, 'HEAD')
  const started = lastStart(github.listComments(number))
  if (!started) return fail(`#${number} has no "Started" comment, so nobody can tell whether its criteria changed during the work; it was not started with \`flow start\``)
  const edits = editsAfter(github.bodyEditHistory(number), started.createdAt)
  if (edits.length) {
    const refusal = editedRefusal({ edits, startedAt: started.createdAt })
    github.comment(number, refusal)
    return fail(refusal.replace(/\*\*/g, ''))
  }
  const report = runCriteria({ ticket: number, ...parsed.criteria }, { cwd: root })
  github.comment(number, acceptanceComment({ sha, report, untrackedCount: untrackedFiles(root).length }))
  process.stderr.write(`${formatCheckReport(report)}\n`)
  printJson({ sha, ...report })
  return report.allPassed ? 0 : 1
}

function mergeFailureText({ result, epicBranch, sha }) {
  if (result.kind === 'conflict')
    return `Merging \`${sha.slice(0, 12)}\` into \`${epicBranch}\` conflicts in ${result.files.map((file) => `\`${file}\``).join(', ')}. Nothing was merged; a person resolves the conflict on the ticket branch.`
  if (result.kind === 'stale') return `Could not push the merge into \`${epicBranch}\`: the branch moved under every attempt (${result.attempts.length} tries). Nothing was merged.`
  if (result.kind === 'missing-epic-branch') return `The epic branch \`${epicBranch}\` does not exist on origin, so there is nothing to merge into.`
  return `Merging \`${sha.slice(0, 12)}\` into \`${epicBranch}\` failed: ${result.reason || result.kind}. Nothing was merged.`
}

function commandDeliver(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  const root = requireRepository(flags)
  const { issue, parsed } = loadTicket(number)
  const { state } = ticketState(issue.labels)
  const { epic, epicIssue } = loadOptionalEpic(parsed.epic)
  const delivery = deliveryFor(epic)
  if (!ACCEPTABLE_STATES.has(state)) {
    process.stderr.write(`#${number} is ${state}; only a ticket in progress or in review can be delivered\n`)
    return 1
  }
  const acceptance = lastAcceptance(github.listComments(number))
  if (!acceptance || !acceptance.passed) {
    process.stderr.write(`#${number} has no passing acceptance comment; run \`flow accept ${number}\` on the reviewed head first\n`)
    return 1
  }
  const sha = acceptance.sha
  const branch = ticketBranchName(number)
  fetchOrigin(root)
  if (!resolveCommit(root, sha)) return refuse(number, state, `the accepted commit ${sha} is not in this clone; fetch the ticket branch, then run \`flow deliver ${number}\` again`)
  const pushed = pushTicketBranch(root, { sha, branch })
  if (!pushed.ok) return refuse(number, state, `#${number} was not delivered: ${pushed.reason}`)
  if (delivery === 'release') {
    const epicBranch = epic.settings.branch
    if (!epicBranch) return refuse(number, state, `epic #${epic.number} has no "Branch:" setting, so there is no epic branch to merge into`)
    const result = mergeIntoEpic(root, { sha, epicBranch, subject: `Merge #${number}: ${issue.title}` })
    if (!result.ok) {
      const text = mergeFailureText({ result, epicBranch, sha })
      process.stderr.write(`${text}\n`)
      markNeedsHuman(number, text)
      return 1
    }
    github.addLabels(number, ['flow:done'])
    github.removeLabels(number, issue.labels.filter((label) => STATE_LABELS.includes(label) && label !== 'flow:done'))
    const how = result.kind === 'already-merged' ? `was already in \`${epicBranch}\` (at \`${result.mergeSha.slice(0, 12)}\`)` : `merged into \`${epicBranch}\` as \`${result.mergeSha.slice(0, 12)}\``
    github.comment(number, `**Done.** The accepted commit \`${sha.slice(0, 12)}\` ${how}.`)
    const checked = withTicketChecked(epicIssue.body, number)
    if (checked !== normalizeNewlines(epicIssue.body)) github.updateIssueBody(epic.number, checked)
    printJson({ ticket: number, delivery, accepted: sha, epicBranch, merge: result.mergeSha, outcome: result.kind, attempts: result.attempts })
    return 0
  }
  const base = github.defaultBranch()
  const existing = github.findOpenPullRequest(branch)
  const pullRequest =
    existing ||
    github.createPullRequest({
      title: `#${number}: ${issue.title}`,
      head: branch,
      base,
      body: `Closes #${number}.\n\nAcceptance passed at ${sha}; the results are on the issue.`,
    })
  github.comment(number, `**Pull request ${existing ? 'already open' : 'opened'}:** ${pullRequest.url} (into \`${base}\`). A person merges it.`)
  printJson({ ticket: number, delivery, accepted: sha, pullRequest: pullRequest.number, url: pullRequest.url, base })
  return 0
}

function readFlowConfig(root) {
  const file = join(root, '.flow.json')
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new UsageError(`.flow.json is not valid JSON: ${error.message}`)
  }
}

function insideDirectory(root, path) {
  const offset = relative(root, path)
  return offset !== '' && !offset.startsWith('..') && !isAbsolute(offset)
}

function commandScreenshots(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  const root = requireRepository(flags)
  const config = readFlowConfig(root)
  if (!config.screenshots) {
    printJson({ ticket: number, screenshots: [], reason: 'no "screenshots" command in .flow.json' })
    return 0
  }
  const branch = ticketBranchName(number)
  if (currentBranch(root) !== branch) {
    process.stderr.write(`check out ${branch} first: the screenshots are committed on the ticket branch\n`)
    return 1
  }
  const configuredDirectory = resolve(root, String(config.screenshotsDir || DEFAULT_SCREENSHOTS_DIR).replaceAll('{n}', String(number)))
  const run = spawnSync(config.screenshots, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS,
    maxBuffer: CHECK_MAX_BUFFER,
    env: { ...process.env, FLOW_TICKET: String(number), FLOW_SCREENSHOTS_DIR: configuredDirectory },
  })
  if (run.status !== 0 || run.error) {
    const output = `${run.stdout || ''}${run.stderr || ''}`.trim().split('\n').slice(-5).join('\n')
    process.stderr.write(`the screenshots command failed (${run.error ? run.error.message : `exit ${run.status}`}):\n${output}\n`)
    return 1
  }
  const printed = (run.stdout || '').trim().split('\n').filter(Boolean).pop()
  const printedDirectory = printed ? resolve(root, printed.trim()) : null
  const directory = printedDirectory && existsSync(printedDirectory) && statSync(printedDirectory).isDirectory() ? printedDirectory : configuredDirectory
  if (!insideDirectory(root, directory)) {
    process.stderr.write(`the screenshots are in ${directory}, outside the repository, so they cannot be committed\n`)
    return 1
  }
  const images = existsSync(directory) ? readdirSync(directory).filter((name) => name.toLowerCase().endsWith('.png')).sort() : []
  if (!images.length) {
    process.stderr.write(`the screenshots command wrote no PNG into ${relative(root, directory)}\n`)
    return 1
  }
  const paths = images.map((name) => relative(root, join(directory, name)))
  git(root, ['add', '--force', '--', ...paths])
  const staged = git(root, ['diff', '--cached', '--name-only']).stdout
  if (staged) git(root, ['commit', '--quiet', '-m', `#${number}: screenshots of the built screens`])
  const sha = resolveCommit(root, 'HEAD')
  const pushed = git(root, ['push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`], { allowFailure: true })
  if (!pushed.ok) {
    process.stderr.write(`the screenshots are committed, but pushing ${branch} failed: ${pushed.stderr}\n`)
    return 1
  }
  const slug = github.repoSlug()
  const links = paths.map((path) => ({ path, url: `https://github.com/${slug}/blob/${sha}/${path.split('/').map(encodeURIComponent).join('/')}?raw=true` }))
  github.comment(number, [`**Screenshots** of the built screens, at \`${sha.slice(0, 12)}\`:`, '', ...links.map((link) => `![${link.path}](${link.url})`)].join('\n'))
  printJson({ ticket: number, commit: sha, screenshots: links })
  return 0
}

function commandMeter(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  if (!flags.transcripts) throw new UsageError('meter needs --transcripts <path> (a transcript file, a directory of them, or a headless run\'s stream output)')
  let sources
  try {
    sources = loadSources(flags.transcripts)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 1
  }
  if (!sources.length) {
    process.stderr.write(`no .jsonl transcript found in ${flags.transcripts.join(', ')}\n`)
    return 1
  }
  const body = meterComment({ ticket: number, sourceCount: sources.length, meter: meterTranscripts(sources) })
  if (flags.print) {
    console.log(body)
    return 0
  }
  const posted = github.comment(number, body)
  console.log(posted.url || `commented on #${number}`)
  return 0
}

function seconds(value, fallback, name) {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) throw new UsageError(`${name} takes whole seconds, got "${value}"`)
  return Number(value)
}

function pollUntil({ timeout, interval }, probe) {
  const deadline = Date.now() + timeout * 1000
  for (;;) {
    const outcome = probe()
    if (outcome.done || Date.now() >= deadline) return outcome
    sleepSeconds(Math.min(interval, Math.max(0, (deadline - Date.now()) / 1000)))
  }
}

function commandPrReviewRequest(positional, flags) {
  const pr = issueNumber(positional[0], 'a pull request number')
  const root = repositoryRoot(resolve(flags.cwd || process.cwd())) || resolve(flags.cwd || process.cwd())
  if (configuredBot(root) === 'coderabbit') {
    console.log('coderabbit')
    return 0
  }
  try {
    github.requestReviewers(pr, [COPILOT_REVIEWER_LOGIN])
  } catch (error) {
    if (!(error instanceof TrackerError) || !copilotUnavailable(error)) throw error
    process.stderr.write(`Copilot cannot review here (${error.message}); no review bot was asked\n`)
    console.log('none')
    return 0
  }
  console.log('copilot')
  return 0
}

function commandPrWait(positional, flags) {
  const pr = issueNumber(positional[0], 'a pull request number')
  const root = repositoryRoot(resolve(flags.cwd || process.cwd())) || resolve(flags.cwd || process.cwd())
  const bot = flags.bot || configuredBot(root)
  if (bot === 'none') {
    printJson({ pr, bot, state: 'none' })
    return 0
  }
  if (!BOTS[bot]) throw new UsageError(`--bot must be copilot, coderabbit or none, got "${bot}"`)
  const timing = { timeout: seconds(flags.timeout, DEFAULT_WAIT_SECONDS, '--timeout'), interval: seconds(flags.interval, DEFAULT_POLL_SECONDS, '--interval') }
  const outcome = pollUntil(timing, () => {
    const pullRequest = github.getPullRequest(pr)
    const review = botReview(github.listPullRequestReviews(pr), bot, pullRequest.headSha)
    return { done: Boolean(review), review, headSha: pullRequest.headSha }
  })
  if (!outcome.review) {
    printJson({ pr, bot, state: 'timeout', head: outcome.headSha })
    return 1
  }
  printJson({ pr, bot, state: outcome.review.state, head: outcome.headSha, submittedAt: outcome.review.submittedAt })
  return 0
}

function commandPrThreads(positional) {
  const pr = issueNumber(positional[0], 'a pull request number')
  printJson(github.listReviewThreads(pr).filter((thread) => !thread.resolved))
}

function commandPrResolve(positional, flags) {
  const threadId = positional[0]
  if (!threadId) throw new UsageError('pr-resolve needs a thread id (from flow pr-threads)')
  if (!flags.text) throw new UsageError('pr-resolve needs --text "<reply>": say what was done, or why nothing was')
  const reply = github.replyToReviewThread(threadId, flags.text)
  const resolved = github.resolveReviewThread(threadId)
  printJson({ thread: threadId, reply: reply.url, resolved: resolved.resolved })
}

function commandPrChecks(positional, flags) {
  const pr = issueNumber(positional[0], 'a pull request number')
  const timing = flags.wait
    ? { timeout: seconds(flags.timeout, DEFAULT_WAIT_SECONDS, '--timeout'), interval: seconds(flags.interval, DEFAULT_POLL_SECONDS, '--interval') }
    : { timeout: 0, interval: 0 }
  const outcome = pollUntil(timing, () => {
    const summary = summarizeChecks(github.pullRequestChecks(pr))
    return { done: summary.pending === 0, summary }
  })
  const { summary } = outcome
  printJson({ pr, ...summary })
  if (summary.failing.length) return 1
  return summary.pending ? CHECKS_PENDING_EXIT : 0
}

function main(argv) {
  const [command, ...rest] = argv
  if (!command || command === 'help' || command === '--help') {
    console.log(USAGE)
    return command ? 0 : 2
  }
  if (command === 'label') return commandLabel(rest)
  const { positional, flags } = parseArguments(rest)
  switch (command) {
    case 'init':
      return commandInit()
    case 'doctor':
      return commandDoctor()
    case 'board':
      return commandBoard(positional, flags)
    case 'next':
      return commandNext(positional)
    case 'ticket':
      return commandTicket(positional)
    case 'check':
      return commandCheck(positional, flags)
    case 'post':
      return commandPost(positional, flags)
    case 'create-epic':
      return commandCreateEpic(flags)
    case 'create-ticket':
      return commandCreateTicket(positional, flags)
    case 'link':
      return commandLink(positional)
    case 'needs-human':
      return commandNeedsHuman(positional, flags)
    case 'start':
      return commandStart(positional, flags)
    case 'accept':
      return commandAccept(positional, flags)
    case 'deliver':
      return commandDeliver(positional, flags)
    case 'screenshots':
      return commandScreenshots(positional, flags)
    case 'meter':
      return commandMeter(positional, flags)
    case 'pr-review-request':
      return commandPrReviewRequest(positional, flags)
    case 'pr-wait':
      return commandPrWait(positional, flags)
    case 'pr-threads':
      return commandPrThreads(positional)
    case 'pr-resolve':
      return commandPrResolve(positional, flags)
    case 'pr-checks':
      return commandPrChecks(positional, flags)
    default:
      throw new UsageError(`unknown command "${command}"`)
  }
}

try {
  process.exitCode = main(process.argv.slice(2)) ?? 0
} catch (error) {
  if (error instanceof UsageError) {
    process.stderr.write(`flow: ${error.message}\n\n${USAGE}\n`)
    process.exitCode = 2
  } else if (error instanceof TrackerError || error instanceof GitError) {
    process.stderr.write(`flow: ${error.message}\n`)
    process.exitCode = 1
  } else throw error
}
