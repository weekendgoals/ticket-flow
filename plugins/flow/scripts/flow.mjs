#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve, relative, isAbsolute } from 'node:path'
import * as github from './tracker/github.mjs'
import { TrackerError } from './tracker/github.mjs'
import { parseEpicBody, parseTicketBody, parseDesignMap, withEpicLine, withBlockedBy, withTicketListed, withTicketChecked, normalizeNewlines } from './issue-body.mjs'
import { CONFIG, ConfigError, apply as applyWorktreeSetup, createWorktree, removeWorktree, worktreePath } from './worktree-setup.mjs'
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
  commitSubjects,
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
  needsHumanComment,
  resetComment,
  countResets,
  countStartWithdrawals,
  startWithdrawnComment,
  releasePrComment,
  localRunLive,
  LOCAL_RUN_END_MARKER,
  mergedComment,
  lastMerge,
  reviewMarker,
  reviewRounds,
  reviewRefusal,
  hasComparedTable,
  reviewedHeadRefusal,
  importantCountMismatch,
  passingAcceptancesByOthers,
  RELEASE_CHECK_MARKER,
} from './ticket-steps.mjs'
import { loadSources, workflowSources, meterTranscripts, meterComment, readMeterComment } from './meter.mjs'
import { ticketStats, readEpicComments, summarize, overallStats, formatStats, combineMeters } from './stats.mjs'
import { COPILOT_REVIEWER_LOGIN, BOTS, configuredBot, copilotUnavailable, botReview, summarizeChecks, sleepSeconds } from './review-bots.mjs'
import {
  LABELS,
  EPIC_LABEL,
  TICKET_LABEL,
  NEEDS_HUMAN_LABEL,
  START_LABEL,
  STATE_LABELS,
  TIER_LABELS,
  MODEL_BY_TIER,
  ticketState,
  ticketTier,
  deriveEpic,
  nextSteps,
  epicBranchProblem,
} from './epic-state.mjs'

const USAGE = `usage: flow <command>

  init                                   create the Flow labels in this repository
  doctor                                 check gh, the repository, the labels and every open epic
  board [<epic>] [--json]                list open epics, or one epic's tickets
  next <epic>                            what can start now, as JSON (exit 1 when the epic is not approved, empty or stuck)
  ticket <n>                             one ticket, parsed, as JSON
  check <n> [--cwd <dir>]                run a ticket's CHECK criteria (exit 1 unless all pass)
  check --file <md> [--epic-file <md>]   the same, for a draft ticket body not yet on GitHub
  link <epic> <n>                        finish linking a ticket to its epic (safe to repeat)
  post <n> --file <md> | --text "<md>"   add a comment (--file - reads it from standard input)
  post <n> --review --important <k> --head <sha> --file <md>
                                         the reviewer's report, as the next numbered review round over <sha>
  label <n> +<label> -<label> ...        add and remove labels
  create-epic --file <md> --title "<t>"
  create-ticket <epic> --file <md> --title "<t>" [--tier easy|hard] [--blocked-by <n>,<n>]
  create-ticket --no-epic --file <md> --title "<t>" [--tier easy|hard] [--repo <owner>/<name>]
                                         (--repo: file it in another repository, such as the plugin's own)
  needs-human <n> --text "<why>"         stop a ticket and ask a person
  reset <n> [--once]                     put a ticket whose run died back to planned; its branch keeps its commits
                                         (--once: if it was reset before, ask a person instead)

  start <n> [--cwd <dir>]                start a ready ticket: its branch, label and first comment (JSON)
  accept <n> [--cwd <dir>]               run the criteria on the committed head and post the result
  deliver <n> [--cwd <dir>]              merge the accepted commit into the epic branch, or open its pull request
  screenshots <n> [--cwd <dir>]          run the screenshots command from .flow.json, commit the images, link them
  merge <n> [--sha <sha>] | merge --epic <epic>
                                         merge the accepted commit into the epic branch (--epic: every accepted ticket, in order)
  meter <n> (--transcripts [<role>=]<path> ... | --workflow <run dir>) [--print]
                                         post what the ticket cost, read from session transcripts
  pr-review-request <pr>                 ask Copilot to review (prints copilot, coderabbit or none)
  pr-wait <pr> [--bot copilot|coderabbit|none] [--timeout <s>] [--interval <s>]
  pr-threads <pr> [--all]                unresolved review threads, as JSON (--all: resolved ones too)
  pr-resolve <thread-id> --text "<reply>"
  pr-checks <pr> [--wait] [--timeout <s>] [--interval <s>] [--grace <s>]

  next, dispatch and the commands below run a whole epic:
  dispatch <epic>                        ask a host to start ready tickets (adds flow:start, up to Parallel:)
  worktree <n> [--remove]                a separate set-up working copy for one ticket, beside the repository
  check-epic <epic> [--tickets <n>,<n>] [--mark]
                                         run the checks of done tickets at the epic branch's head, in a clean copy
  release-pr <epic>                      open the epic's one pull request once every ticket is done
  design-map <epic> [--out <file>]       write the epic's design map for the design comparison

  stats [<epic>] [--since <date>] [--json] [--cwd <dir>]
                                         how the work went: time per step, tokens per model, review rounds,
                                         rework, escaped defects, stops; read from the issues' comments and git`

const VALUE_FLAGS = new Set(['--file', '--epic-file', '--text', '--title', '--tier', '--cwd', '--blocked-by', '--bot', '--timeout', '--interval', '--sha', '--epic', '--tickets', '--out', '--workflow', '--important', '--grace', '--since', '--repo', '--head'])
const REPEATABLE_FLAGS = new Set(['--transcripts'])
const BOOLEAN_FLAGS = new Set(['--json', '--no-epic', '--print', '--wait', '--once', '--mark', '--remove', '--review', '--all'])
const DEFAULT_WAIT_SECONDS = 1800
const DEFAULT_POLL_SECONDS = 30
const DEFAULT_SCREENSHOTS_DIR = '.flow/screenshots/{n}'
const CHECKS_PENDING_EXIT = 3
const NO_CHECKS_EXIT = 4
const DEFAULT_NO_CHECKS_GRACE_SECONDS = 90

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
  if (flags.file !== undefined) return readFileSync(flags.file === '-' ? 0 : flags.file, 'utf8')
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

function epicBranchRefusal(epic) {
  const problem = epicBranchProblem(epic)
  if (problem) return problem
  if (epic.settings.branch && epic.settings.branch === github.defaultBranch())
    return `epic #${epic.number}'s "Branch: ${epic.settings.branch}" is the default branch, and nothing in Flow merges or pushes into the default branch`
  return null
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
  const report = runCriteria({ ticket, ...criteria }, { cwd: flags.cwd || gitTopLevel() })
  report.edits = null
  if (!fromDraft) {
    try {
      report.edits = github.bodyEditHistory(ticket)
    } catch (error) {
      if (!(error instanceof TrackerError)) throw error
      report.problems = [...report.problems, { line: null, text: 'body edit history', why: `the issue body's edit history could not be read (${error.message}), so nothing proves the criteria are the ones that were approved` }]
      report.allPassed = false
    }
  }
  process.stderr.write(`${formatCheckReport(report)}\n`)
  printJson(report)
  return report.allPassed ? 0 : 1
}

function commandPost(positional, flags) {
  const number = issueNumber(positional[0])
  const text = readText(flags)
  if ((flags.important !== undefined || flags.head !== undefined) && !flags.review) throw new UsageError('--important and --head go with --review')
  if (!flags.review) {
    const posted = github.comment(number, text)
    console.log(posted.url || `commented on #${number}`)
    return 0
  }
  if (flags.important === undefined || !/^\d+$/.test(flags.important))
    throw new UsageError('--review needs --important <count>: how many Important findings the report leaves open')
  if (flags.head === undefined || !/^[0-9a-f]{7,40}$/.test(flags.head))
    throw new UsageError('--review needs --head <sha>: the commit the reviewer read up to, so acceptance can tell whether anything came after it')
  const mismatch = importantCountMismatch(text, Number(flags.important))
  if (mismatch) throw new UsageError(`${mismatch}; nothing was posted`)
  const account = github.viewerLogin()
  const comments = github.listComments(number)
  const started = lastStart(comments, account)
  const round = reviewRounds(comments, account, started ? started.createdAt : null).length + 1
  const posted = github.comment(number, `${reviewMarker({ round, important: Number(flags.important), head: flags.head })}\n**Review, round ${round}**\n\n${text}`)
  console.log(posted.url || `review round ${round} posted on #${number}`)
  return 0
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

function useRepository(slug) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(slug)) throw new UsageError(`--repo takes <owner>/<name>, got "${slug}"`)
  process.env.GH_REPO = slug
}

function commandCreateTicketWithoutEpic(positional, flags) {
  if (positional.length) throw new UsageError('give an epic number or --no-epic, not both')
  if (flags.repo !== undefined) useRepository(flags.repo)
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
  if (flags.repo !== undefined) throw new UsageError('--repo goes with --no-epic: an epic\'s tickets live in the epic\'s repository')
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
    ...parsed.criteria.problems.map((problem) => `line ${problem.line ?? '?'}: ${problem.why}: ${problem.text}`),
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
  if (ticket.labels.includes(EPIC_LABEL) || !ticket.labels.includes(TICKET_LABEL)) {
    process.stderr.write(`#${ticketNumber} is not a ticket (it ${ticket.labels.includes(EPIC_LABEL) ? `is an epic` : `has no ${TICKET_LABEL} label`}); nothing was changed\n`)
    return 1
  }
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
  github.removeLabels(number, issue.labels.filter((label) => (STATE_LABELS.includes(label) && label !== NEEDS_HUMAN_LABEL) || label === START_LABEL))
  return github.comment(number, needsHumanComment({ people, text }))
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
  if (!reason && delivery === 'release') reason = epicBranchRefusal(epic)
  if (reason) return refuse(number, state, reason)
  const changes = trackedChanges(root)
  if (changes.length) {
    process.stderr.write(`the working tree has uncommitted changes (${describeChanges(changes)}); commit or stash them first, so nothing unrelated rides into the ticket\n`)
    return 1
  }
  const base = delivery === 'release' ? epic.settings.branch : github.defaultBranch()
  if (!base) return refuse(number, state, 'the default branch of this repository is unknown, so there is nothing to start the ticket from')
  const branch = ticketBranchName(number)
  const cut = cutTicketBranch(root, { branch, base })
  if (!cut.ok) return refuse(number, state, `#${number} cannot start: ${cut.reason}`)
  const tier = ticketTier(issue.labels)
  const model = MODEL_BY_TIER[tier]
  github.addLabels(number, ['flow:in-progress'])
  github.removeLabels(number, ['flow:planned', ...(issue.labels.includes(START_LABEL) ? [START_LABEL] : [])])
  const host = hostName()
  github.comment(number, startedComment({ host, model, branch, base, baseSha: cut.baseSha, resumedAt: cut.resumedAt }))
  printJson({
    ticket: number,
    title: issue.title,
    epic: epic ? epic.number : null,
    delivery,
    branch,
    base,
    baseSha: cut.baseSha,
    resumedAt: cut.resumedAt,
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
  const untracked = untrackedFiles(root)
  if (untracked.length)
    return fail(`the working tree has ${untracked.length} untracked file(s) (${untracked.slice(0, 5).join(', ')}${untracked.length > 5 ? ', …' : ''}); the checks would run with them present although the commit does not contain them, so commit, remove or ignore them first`)
  const sha = resolveCommit(root, 'HEAD')
  const account = github.viewerLogin()
  const comments = github.listComments(number)
  const started = lastStart(comments, account)
  if (!started) return fail(`#${number} has no "Started" comment from ${account}, the account running this, so nobody can tell whether its criteria changed during the work; start it with \`flow start\` under this account`)
  const edits = editsAfter(github.bodyEditHistory(number), started.createdAt)
  if (edits.length) {
    const refusal = editedRefusal({ edits, startedAt: started.createdAt })
    github.comment(number, refusal)
    return fail(refusal.replace(/\*\*/g, ''))
  }
  const rounds = reviewRounds(comments, account, started.createdAt)
  const review = reviewRefusal(rounds)
  if (review) return review.stop ? refuse(number, state, `#${number} cannot be accepted: ${review.reason}`) : fail(`#${number} cannot be accepted yet: ${review.reason}`)
  const unreviewed = reviewedHeadRefusal(rounds, sha)
  if (unreviewed) return fail(`#${number} cannot be accepted yet: ${unreviewed}`)
  if (parsed.criteria.compares.length && !hasComparedTable(comments, started.createdAt))
    return fail(`#${number} has a COMPARE criterion and no comment starting "**Compared:**"; post the comparison table (or "**Compared:** not run — <why>") first, because nothing else shows the design was checked`)
  const began = Date.now()
  const report = runCriteria({ ticket: number, ...parsed.criteria }, { cwd: root })
  github.comment(number, acceptanceComment({ sha, report, seconds: Math.round((Date.now() - began) / 1000) }))
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

function mergeAcceptedTicket({ number, root, expectedSha = null }) {
  const { issue, parsed } = loadTicket(number)
  const { state } = ticketState(issue.labels)
  const { epic, epicIssue } = loadOptionalEpic(parsed.epic)
  const fail = (reason) => ({ code: 1, reason })
  if (deliveryFor(epic) !== 'release') return fail(`#${number} is not in a release epic; it is delivered by its own pull request (\`flow deliver ${number}\`)`)
  if (!ACCEPTABLE_STATES.has(state)) return fail(`#${number} is ${state}; only a ticket in progress or in review can be merged`)
  const comments = github.listComments(number)
  const account = github.viewerLogin()
  const acceptance = lastAcceptance(comments, account)
  if (!acceptance || !acceptance.passed) return fail(`#${number} has no passing acceptance comment from this account; run \`flow accept ${number}\` on the reviewed head first`)
  if (parsed.criteria.compares.length && !hasComparedTable(comments, lastStart(comments, account)?.createdAt)) return fail(`#${number} has a COMPARE criterion and no "**Compared:**" comment; it is not merged without the comparison`)
  const sha = acceptance.sha
  if (expectedSha && !sha.startsWith(expectedSha) && !expectedSha.startsWith(sha))
    return fail(`#${number} was accepted at ${sha.slice(0, 12)}, not at ${expectedSha.slice(0, 12)}; only the commit the acceptance comment names is merged`)
  const branch = ticketBranchName(number)
  fetchOrigin(root)
  if (!resolveCommit(root, sha)) {
    const reason = `the accepted commit ${sha} is not in this clone; fetch the ticket branch, then merge again`
    return { code: refuse(number, state, reason), reason }
  }
  const branchRefusal = epicBranchRefusal(epic)
  if (branchRefusal) return { code: refuse(number, state, branchRefusal), reason: branchRefusal }
  const epicBranch = epic.settings.branch
  const pushed = pushTicketBranch(root, { sha, branch })
  if (!pushed.ok) {
    const reason = `#${number} was not merged: ${pushed.reason}`
    return { code: refuse(number, state, reason), reason }
  }
  const result = mergeIntoEpic(root, { sha, epicBranch, subject: `Merge #${number}: ${issue.title}` })
  if (!result.ok) {
    const text = mergeFailureText({ result, epicBranch, sha })
    markNeedsHuman(number, text)
    return { code: 1, reason: text, needsHuman: true }
  }
  github.addLabels(number, ['flow:done'])
  github.removeLabels(number, issue.labels.filter((label) => STATE_LABELS.includes(label) && label !== 'flow:done'))
  github.comment(number, mergedComment({ sha, mergeSha: result.mergeSha, epicBranch, alreadyMerged: result.kind === 'already-merged', attempts: result.attempts }))
  const checked = withTicketChecked(epicIssue.body, number)
  if (checked !== normalizeNewlines(epicIssue.body)) github.updateIssueBody(epic.number, checked)
  return { code: 0, json: { ticket: number, delivery: 'release', accepted: sha, epicBranch, merge: result.mergeSha, outcome: result.kind, attempts: result.attempts } }
}

function commandDeliver(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  const root = requireRepository(flags)
  const { issue, parsed } = loadTicket(number)
  const { state } = ticketState(issue.labels)
  const { epic } = loadOptionalEpic(parsed.epic)
  const delivery = deliveryFor(epic)
  if (!ACCEPTABLE_STATES.has(state)) {
    process.stderr.write(`#${number} is ${state}; only a ticket in progress or in review can be delivered\n`)
    return 1
  }
  if (delivery === 'release') {
    const merged = mergeAcceptedTicket({ number, root })
    if (merged.code !== 0) {
      process.stderr.write(`${merged.reason}\n`)
      return merged.code
    }
    printJson(merged.json)
    return 0
  }
  const comments = github.listComments(number)
  const account = github.viewerLogin()
  const acceptance = lastAcceptance(comments, account)
  if (!acceptance || !acceptance.passed) {
    process.stderr.write(`#${number} has no passing acceptance comment from this account; run \`flow accept ${number}\` on the reviewed head first\n`)
    return 1
  }
  if (parsed.criteria.compares.length && !hasComparedTable(comments, lastStart(comments, account)?.createdAt)) {
    process.stderr.write(`#${number} has a COMPARE criterion and no "**Compared:**" comment; it is not delivered without the comparison\n`)
    return 1
  }
  const sha = acceptance.sha
  const branch = ticketBranchName(number)
  fetchOrigin(root)
  if (!resolveCommit(root, sha)) return refuse(number, state, `the accepted commit ${sha} is not in this clone; fetch the ticket branch, then run \`flow deliver ${number}\` again`)
  const pushed = pushTicketBranch(root, { sha, branch })
  if (!pushed.ok) return refuse(number, state, `#${number} was not delivered: ${pushed.reason}`)
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

function commandMerge(positional, flags) {
  const root = requireRepository(flags)
  if (flags.epic !== undefined) {
    if (positional.length) throw new UsageError('give a ticket number or --epic, not both')
    const epic = loadEpic(issueNumber(flags.epic, 'an epic number'))
    if (deliveryFor(epic) !== 'release') {
      printJson({ epic: epic.number, merged: [], notMerged: [], reason: 'not a release epic: each ticket has its own pull request' })
      return 0
    }
    const waiting = epic.tickets.filter((ticket) => ACCEPTABLE_STATES.has(ticket.state))
    const merged = []
    const notMerged = []
    const account = github.viewerLogin()
    for (const ticket of waiting) {
      const comments = github.listComments(ticket.number)
      if (!lastAcceptance(comments, account)?.passed) {
        const elsewhere = passingAcceptancesByOthers(comments, account)
        if (elsewhere.length)
          notMerged.push({
            ticket: ticket.number,
            reason: `#${ticket.number} passed acceptance under ${[...new Set(elsewhere.map((entry) => `@${entry.author}`))].join(', ')}, not under ${account}, the account running this; only this account's acceptance names a commit to merge, so run \`flow accept ${ticket.number}\` under it`,
          })
        continue
      }
      const outcome = mergeAcceptedTicket({ number: ticket.number, root })
      if (outcome.code === 0) merged.push(outcome.json)
      else notMerged.push({ ticket: ticket.number, reason: outcome.reason })
    }
    printJson({ epic: epic.number, merged, notMerged })
    return notMerged.length ? 1 : 0
  }
  const number = issueNumber(positional[0], 'a ticket number')
  const outcome = mergeAcceptedTicket({ number, root, expectedSha: flags.sha || null })
  if (outcome.code !== 0) {
    process.stderr.write(`${outcome.reason}\n`)
    return outcome.code
  }
  printJson(outcome.json)
  return 0
}

function commandReset(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  const issue = github.getIssue(number)
  const { state } = ticketState(issue.labels)
  const comments = github.listComments(number)
  const account = github.viewerLogin()
  const refused = (reason, accepted = null) => {
    process.stderr.write(`${reason}\n`)
    printJson({ ticket: number, action: 'refused', reason, accepted })
    return 1
  }
  if (state === 'planned' && issue.labels.includes(START_LABEL)) {
    const withdrawn = countStartWithdrawals(comments, account)
    if (flags.once && withdrawn > 0) {
      markNeedsHuman(number, `A job asked to build this ticket stopped before the ticket started, and that already happened once before. A person looks at the job's log; the ticket itself was never started.`)
      printJson({ ticket: number, action: 'needs-human', withdrawn })
      return 0
    }
    github.removeLabels(number, [START_LABEL])
    github.comment(number, startWithdrawnComment())
    printJson({ ticket: number, action: 'unstarted', withdrawn: withdrawn + 1 })
    return 0
  }
  if (!ACCEPTABLE_STATES.has(state)) return refused(`#${number} is ${state}; only a ticket left in progress or in review can be reset`)
  const branch = ticketBranchName(number)
  const started = lastStart(comments, account)
  const acceptance = lastAcceptance(comments, account)
  if (acceptance && acceptance.passed && (!started || Date.parse(acceptance.at) >= Date.parse(started.createdAt)))
    return refused(`#${number} passed acceptance at ${acceptance.sha.slice(0, 12)} and is waiting to be merged, not abandoned; run \`flow merge ${number}\``, acceptance.sha)
  const earlier = countResets(comments, account)
  if (flags.once && earlier > 0) {
    markNeedsHuman(number, `The run working on this ticket stopped without a result, and it already had once before (it was reset ${earlier} time(s)). \`${branch}\` keeps its commits; a person decides how to go on.`)
    printJson({ ticket: number, action: 'needs-human', resets: earlier })
    return 0
  }
  github.addLabels(number, ['flow:planned'])
  github.removeLabels(number, issue.labels.filter((label) => (STATE_LABELS.includes(label) && label !== 'flow:planned') || label === START_LABEL))
  github.comment(number, resetComment({ host: hostName(), branch }))
  printJson({ ticket: number, action: 'reset', resets: earlier + 1 })
  return 0
}

function failedChecksText(report) {
  const failed = report.checks.filter((check) => check.status !== 'passed').map((check) => `\`${check.check}\` (${check.status})`)
  const problems = report.problems.map((problem) => problem.why)
  return [...failed, ...problems].join('; ')
}

function commandCheckEpic(positional, flags) {
  const epicNumber = issueNumber(positional[0], 'an epic number')
  const root = requireRepository(flags)
  const epic = loadEpic(epicNumber)
  const branchRefusal = epicBranchRefusal(epic) || (epic.settings.branch ? null : `epic #${epicNumber} has no "Branch:" setting, so there is no epic branch to check`)
  if (branchRefusal) {
    process.stderr.write(`${branchRefusal}\n`)
    return 1
  }
  const epicBranch = epic.settings.branch
  const listed = flags.tickets === undefined ? null : parseBlockerList(flags.tickets)
  const outside = (listed || []).filter((number) => !epic.tickets.some((ticket) => ticket.number === number))
  if (outside.length) throw new UsageError(`${outside.map((number) => `#${number}`).join(', ')} is not a ticket of epic #${epicNumber}`)
  const chosen = listed ? epic.tickets.filter((ticket) => listed.includes(ticket.number)) : epic.tickets.filter((ticket) => ticket.state === 'done')
  fetchOrigin(root)
  const head = resolveCommit(root, `origin/${epicBranch}`)
  if (!head) {
    process.stderr.write(`origin/${epicBranch} does not exist, so there is nothing to check\n`)
    return 1
  }
  const path = worktreePath(root, `epic-${epicNumber}-check`)
  const made = createWorktree(root, { path, ref: head })
  if (!made.ok) {
    process.stderr.write(`${made.reason}\n`)
    return 1
  }
  const results = []
  let setupFailure = null
  try {
    try {
      const setup = applyWorktreeSetup({ repo: root, worktree: path })
      if (setup.failure) setupFailure = `${setup.failure.step}: ${setup.failure.detail}`
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error
      setupFailure = error.message
    }
    if (!setupFailure)
      for (const ticket of chosen) {
        const issue = github.getIssue(ticket.number)
        const criteria = parseTicketBody(issue.body, epic.settings.designSources).criteria
        const report = runCriteria({ ticket: ticket.number, ...criteria }, { cwd: path })
        results.push({ ticket: ticket.number, title: ticket.title, passed: report.passed, total: report.total, skipped: report.skipped, allPassed: report.allPassed, failures: report.allPassed ? '' : failedChecksText(report) })
      }
  } finally {
    removeWorktree(root, path)
  }
  const failing = results.filter((result) => !result.allPassed)
  const allPassed = !setupFailure && !failing.length
  const lines = [RELEASE_CHECK_MARKER]
  if (setupFailure) lines.push(`**The epic check could not run** at \`${head.slice(0, 12)}\` of \`${epicBranch}\`: setting up a clean copy failed (${setupFailure}). Nothing was judged.`)
  else {
    lines.push(`**Epic check** at \`${head.slice(0, 12)}\` of \`${epicBranch}\`: ${results.length - failing.length} of ${results.length} ticket(s) still pass their checks.`)
    if (results.length) {
      lines.push('', '| Ticket | Checks | Result |', '|---|---|---|')
      for (const result of results) lines.push(`| #${result.ticket} ${result.title.replace(/\|/g, '\\|')} | ${result.passed} of ${result.total} | ${result.allPassed ? 'pass' : `FAIL: ${result.failures.replace(/\|/g, '\\|')}`} |`)
    }
  }
  github.comment(epicNumber, lines.join('\n'))
  if (flags.mark)
    for (const result of failing)
      markNeedsHuman(
        result.ticket,
        `This ticket's checks fail on the epic branch \`${epicBranch}\` at \`${head.slice(0, 12)}\`, after it was merged: ${result.failures}. It stays merged; whether it needs a fix ticket is a person's call.`,
      )
  printJson({ epic: epicNumber, branch: epicBranch, head, setupFailure, tickets: results, allPassed })
  return allPassed ? 0 : 1
}

function commandWorktree(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  const root = requireRepository(flags)
  const path = worktreePath(root, `ticket-${number}`)
  if (flags.remove) {
    removeWorktree(root, path)
    printJson({ ticket: number, path, removed: true })
    return 0
  }
  const { parsed } = loadTicket(number)
  const { epic } = loadOptionalEpic(parsed.epic)
  const branchRefusal = deliveryFor(epic) === 'release' ? epicBranchRefusal(epic) : null
  if (branchRefusal) {
    process.stderr.write(`${branchRefusal}\n`)
    return 1
  }
  const base = deliveryFor(epic) === 'release' ? epic.settings.branch : github.defaultBranch()
  if (!base) {
    process.stderr.write(`#${number} has no branch to start from (no epic branch, or the default branch is unknown)\n`)
    return 1
  }
  fetchOrigin(root)
  const made = createWorktree(root, { path, ref: `origin/${base}` })
  if (!made.ok) {
    printJson({ ticket: number, path, base, configured: false, failure: { step: 'git worktree add', detail: made.reason } })
    return 1
  }
  let setup
  try {
    setup = applyWorktreeSetup({ repo: root, worktree: path })
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    setup = { configured: true, copied: [], ran: [], failure: { step: CONFIG, detail: error.message } }
  }
  if (setup.failure) removeWorktree(root, path)
  printJson({ ticket: number, path, base, ...setup })
  return setup.failure ? 1 : 0
}

function costTotals(meters) {
  const names = ['input', 'output', 'cacheCreation', 'cacheReads']
  const totals = {}
  for (const name of names) {
    const values = meters.map((meter) => meter.total[name])
    totals[name] = values.some((value) => typeof value !== 'number') ? null : values.reduce((sum, value) => sum + value, 0)
  }
  return totals
}

function shownCount(value) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : 'unknown'
}

function releaseBody({ epic, plan, tickets }) {
  const lines = [`Epic: #${epic.number}`, '']
  if (plan.outcome) lines.push('## Outcome', '', plan.outcome, '')
  if (plan.walkthrough) lines.push('## Walkthrough', '', plan.walkthrough, '')
  lines.push('## Tickets', '', '| Ticket | Merged as |', '|---|---|')
  for (const ticket of tickets) lines.push(`| #${ticket.number} ${ticket.title.replace(/\|/g, '\\|')} | ${ticket.mergeSha ? `\`${ticket.mergeSha.slice(0, 12)}\`` : 'not recorded'} |`)
  const metered = tickets.filter((ticket) => ticket.meter)
  lines.push('', '## Cost', '')
  if (!metered.length) lines.push('No ticket has a cost comment, so the cost is unknown.')
  else {
    const totals = costTotals(metered.map((ticket) => ticket.meter))
    lines.push(
      `Over ${metered.length} of ${tickets.length} ticket(s) with a cost comment: ${shownCount(totals.input)} input, ${shownCount(totals.output)} output, ${shownCount(totals.cacheCreation)} cache writes and ${shownCount(totals.cacheReads)} cache reads (tokens). Each ticket's comment has the figures by step and by model.`,
    )
  }
  lines.push('', ...tickets.map((ticket) => `Closes #${ticket.number}`), `Closes #${epic.number}`, '', 'A person reviews and merges this pull request; nothing runs after the merge.')
  return lines.join('\n')
}

function commandReleasePr(positional) {
  const epicNumber = issueNumber(positional[0], 'an epic number')
  const epicIssue = github.getIssue(epicNumber)
  if (!epicIssue.labels.includes(EPIC_LABEL)) throw new UsageError(`#${epicNumber} is not an epic (it has no ${EPIC_LABEL} label)`)
  const epic = deriveEpic(epicIssue, github.listSubIssues(epicNumber))
  const branchRefusal = deliveryFor(epic) === 'release' ? epicBranchRefusal(epic) : null
  const refusal = !epic.approved
    ? `epic #${epicNumber} is not approved`
    : deliveryFor(epic) !== 'release'
      ? `epic #${epicNumber} is not a release epic; each of its tickets has its own pull request`
      : branchRefusal
        ? branchRefusal
        : !epic.tickets.length
          ? `epic #${epicNumber} has no tickets`
          : epic.tickets.some((ticket) => ticket.state !== 'done')
            ? `not every ticket of epic #${epicNumber} is done (${epic.tickets.filter((ticket) => ticket.state !== 'done').map((ticket) => `#${ticket.number} ${ticket.state}`).join(', ')})`
            : null
  if (refusal) {
    process.stderr.write(`${refusal}; the release pull request opens only when every ticket is merged\n`)
    return 1
  }
  const tickets = epic.tickets.map((ticket) => {
    const comments = github.listComments(ticket.number)
    const merged = lastMerge(comments, github.viewerLogin())
    const meter = combineMeters(comments.map((comment) => readMeterComment(comment.body)).filter(Boolean))
    return { number: ticket.number, title: ticket.title, mergeSha: merged ? merged.mergeSha : null, meter }
  })
  const base = github.defaultBranch()
  const existing = github.findOpenPullRequest(epic.settings.branch)
  const pullRequest =
    existing || github.createPullRequest({ title: epic.title, head: epic.settings.branch, base, body: releaseBody({ epic, plan: parseEpicBody(epicIssue.body), tickets }) })
  github.comment(
    epicNumber,
    releasePrComment({ number: pullRequest.number, url: pullRequest.url, existing: Boolean(existing), epicBranch: epic.settings.branch, base }),
  )
  printJson({ epic: epicNumber, pullRequest: pullRequest.number, url: pullRequest.url, base, existing: Boolean(existing) })
  return 0
}

function commandDesignMap(positional, flags) {
  const epicNumber = issueNumber(positional[0], 'an epic number')
  const epicIssue = github.getIssue(epicNumber)
  const found = parseDesignMap(epicIssue.body)
  if (found.problem) {
    process.stderr.write(`epic #${epicNumber}: ${found.problem}\n`)
    return 1
  }
  if (!found.map) {
    process.stderr.write(`epic #${epicNumber} has no \`\`\`design-map block, so there is nothing to compare against; the plan adds one when it declares Design sources\n`)
    return 1
  }
  const text = `${JSON.stringify(found.map, null, 2)}\n`
  if (flags.out === undefined) process.stdout.write(text)
  else {
    writeFileSync(flags.out, text)
    console.log(flags.out)
  }
  return 0
}

function commandDispatch(positional) {
  const epic = loadEpic(issueNumber(positional[0], 'an epic number'))
  const { result, stuckReason } = nextSteps(epic)
  if (!epic.approved) {
    process.stderr.write(`${stuckReason}\n`)
    return 1
  }
  const branchRefusal = deliveryFor(epic) === 'release' ? epicBranchRefusal(epic) : null
  if (branchRefusal) {
    process.stderr.write(`${branchRefusal}\n`)
    return 1
  }
  if (localRunLive(github.listComments(epic.number), github.viewerLogin())) {
    process.stderr.write(
      `epic #${epic.number} is being built by a /flow:run on someone's machine (its last run comment is not an end), and two hosts would build the same tickets; if that run is gone, post a comment that starts with ${LOCAL_RUN_END_MARKER} on the epic from this account\n`,
    )
    return 1
  }
  const flagged = epic.tickets.filter((ticket) => ticket.state === 'planned' && ticket.labels.includes(START_LABEL)).map((ticket) => ticket.number)
  const width = epic.settings.parallel || 1
  const slots = Math.max(0, width - result.inProgress.length - flagged.length)
  const started = result.ready.filter((number) => !flagged.includes(number)).slice(0, slots)
  for (const number of started) github.addLabels(number, [START_LABEL])
  const busy = result.inProgress.length + flagged.length + started.length
  const state = busy ? 'running' : epic.tickets.length && epic.tickets.every((ticket) => ticket.state === 'done') ? 'built' : 'stopped'
  printJson({ epic: epic.number, parallel: width, started, alreadyAsked: flagged, inProgress: result.inProgress, needsHuman: result.needsHuman, state })
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
  const staged = git(root, ['diff', '--cached', '--name-only', '--', ...paths]).stdout
  if (staged) git(root, ['commit', '--quiet', '-m', `#${number}: screenshots of the built screens`, '--', ...paths])
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
  if (!flags.transcripts && flags.workflow === undefined)
    throw new UsageError("meter needs --transcripts <path> (a transcript file, a directory of them, or a headless run's output) or --workflow <run dir>")
  let sources
  try {
    sources = [...(flags.transcripts ? loadSources(flags.transcripts) : []), ...(flags.workflow !== undefined ? workflowSources(flags.workflow, number) : [])]
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 1
  }
  if (!sources.length) {
    process.stderr.write(`no transcript found for #${number} in ${[...(flags.transcripts || []), ...(flags.workflow !== undefined ? [flags.workflow] : [])].join(', ')}\n`)
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

function commandPrThreads(positional, flags) {
  const pr = issueNumber(positional[0], 'a pull request number')
  printJson(github.listReviewThreads(pr).filter((thread) => flags.all || !thread.resolved))
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
  const graceUntil = Date.now() + (flags.wait ? seconds(flags.grace, DEFAULT_NO_CHECKS_GRACE_SECONDS, '--grace') : 0) * 1000
  const outcome = pollUntil(timing, () => {
    const summary = summarizeChecks(github.pullRequestChecks(pr))
    const noChecksYet = summary.checks.length === 0 && Date.now() < graceUntil
    return { done: summary.pending === 0 && !noChecksYet, summary }
  })
  const { summary } = outcome
  const noChecks = summary.checks.length === 0
  printJson({ pr, noChecks, ...summary })
  if (noChecks) return NO_CHECKS_EXIT
  if (summary.failing.length) return 1
  return summary.pending ? CHECKS_PENDING_EXIT : 0
}

function subjectsOn(root, refs) {
  if (!root) return null
  return commitSubjects(root, refs)
}

function releasePullRequestOf(number) {
  if (!number) return null
  try {
    const pullRequest = github.getPullRequest(number)
    return { number, url: pullRequest.url, merged: pullRequest.merged, mergedAt: pullRequest.mergedAt }
  } catch (error) {
    if (!(error instanceof TrackerError)) throw error
    return { number, url: null, merged: null, mergedAt: null }
  }
}

function epicStats(epicIssue, { root, defaultBranch, defaultSubjects }) {
  const epic = deriveEpic(epicIssue, github.listSubIssues(epicIssue.number))
  const delivery = deliveryFor(epic)
  const epicRecord = readEpicComments(github.listComments(epicIssue.number))
  const refs = [
    ...(defaultBranch ? [`origin/${defaultBranch}`] : []),
    ...(epic.settings.branch ? [`origin/${epic.settings.branch}`] : []),
    ...epic.tickets.map((ticket) => `origin/${ticketBranchName(ticket.number)}`),
  ]
  const subjects = subjectsOn(root, refs)
  const gitProblem = !root
    ? 'this directory is not inside a clone of the repository (give --cwd)'
    : subjects === null
      ? `none of ${refs.slice(0, 2).join(', ')} is in this clone; run \`git fetch origin\` first`
      : null
  const tickets = epic.tickets.map((ticket) =>
    ticketStats({ ticket, comments: github.listComments(ticket.number), subjects, defaultSubjects, delivery, serialWaves: epicRecord.serialWaves }),
  )
  return {
    number: epic.number,
    title: epic.title,
    url: epicIssue.url,
    state: epicIssue.state,
    createdAt: epicIssue.createdAt,
    closedAt: epicIssue.closedAt,
    delivery,
    parallel: epic.settings.parallel ?? null,
    branch: epic.settings.branch || null,
    releasePullRequest: releasePullRequestOf(epicRecord.releasePullRequest),
    serialWaves: epicRecord.serialWaves,
    runStops: epicRecord.runStops,
    gitProblem,
    tickets,
    totals: summarize(tickets),
  }
}

function commandStats(positional, flags) {
  const since = flags.since ?? null
  if (since !== null && Number.isNaN(Date.parse(since))) throw new UsageError(`--since takes a date such as 2026-10-01, got "${since}"`)
  if (since !== null && positional.length) throw new UsageError('give an epic number or --since, not both')
  const root = repositoryRoot(resolve(flags.cwd || process.cwd()))
  let epicIssues
  if (positional.length) {
    const number = issueNumber(positional[0], 'an epic number')
    const issue = github.getIssue(number)
    if (!issue.labels.includes(EPIC_LABEL)) throw new UsageError(`#${number} is not an epic (it has no ${EPIC_LABEL} label)`)
    epicIssues = [issue]
  } else
    epicIssues = github
      .listIssues({ label: EPIC_LABEL, state: 'all' })
      .filter((issue) => since === null || !issue.createdAt || Date.parse(issue.createdAt) >= Date.parse(since))
      .sort((a, b) => a.number - b.number)
  const defaultBranch = github.defaultBranch()
  const defaultSubjects = defaultBranch ? subjectsOn(root, [`origin/${defaultBranch}`]) : null
  const result = overallStats(
    epicIssues.map((issue) => epicStats(issue, { root, defaultBranch, defaultSubjects })),
    since,
  )
  if (flags.json) printJson(result)
  else console.log(formatStats(result))
  return 0
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
      return commandPrThreads(positional, flags)
    case 'pr-resolve':
      return commandPrResolve(positional, flags)
    case 'pr-checks':
      return commandPrChecks(positional, flags)
    case 'merge':
      return commandMerge(positional, flags)
    case 'reset':
      return commandReset(positional, flags)
    case 'check-epic':
      return commandCheckEpic(positional, flags)
    case 'worktree':
      return commandWorktree(positional, flags)
    case 'release-pr':
      return commandReleasePr(positional)
    case 'design-map':
      return commandDesignMap(positional, flags)
    case 'dispatch':
      return commandDispatch(positional)
    case 'stats':
      return commandStats(positional, flags)
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
