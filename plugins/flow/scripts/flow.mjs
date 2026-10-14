#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import * as github from './tracker/github.mjs'
import { TrackerError } from './tracker/github.mjs'
import { parseEpicBody, parseTicketBody, withEpicLine, withBlockedBy, withTicketListed } from './issue-body.mjs'
import { buildLedger, formatLedger } from './checks.mjs'
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
  post <n> --file <md> | --text "<md>"   add a comment
  label <n> +<label> -<label> ...        add and remove labels
  create-epic --file <md> --title "<t>"
  create-ticket <epic> --file <md> --title "<t>" [--tier easy|hard] [--blocked-by <n>,<n>]
  needs-human <n> --text "<why>"         stop a ticket and ask a person`

const VALUE_FLAGS = new Set(['--file', '--text', '--title', '--tier', '--cwd', '--blocked-by'])
const BOOLEAN_FLAGS = new Set(['--json'])

class UsageError extends Error {}

function parseArguments(argv) {
  const positional = []
  const flags = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (VALUE_FLAGS.has(arg)) {
      if (index + 1 >= argv.length) throw new UsageError(`${arg} needs a value`)
      flags[arg.slice(2)] = argv[++index]
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
    if (flags.json) return printJson(epic)
    console.log(`#${epic.number} ${epic.title}`)
    console.log(`${epic.approved ? 'approved' : 'not approved'} · branch ${epic.settings.branch || '(none set)'} · ${epic.settings.delivery || 'unreadable'} delivery · parallel ${epic.settings.parallel ?? 'unreadable'}`)
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
  if (flags.json) return printJson(rows)
  if (!rows.length) return console.log('no open epics')
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

function commandCheck(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  const { parsed } = loadTicket(number)
  const ledger = buildLedger({ ticket: number, ...parsed.criteria }, { cwd: flags.cwd || gitTopLevel() })
  process.stderr.write(`${formatLedger(ledger)}\n`)
  printJson(ledger)
  return ledger.allPassed ? 0 : 1
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
    if (/^\+.+/.test(change)) add.push(change.slice(1))
    else if (/^-.+/.test(change)) remove.push(change.slice(1))
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

function commandCreateTicket(positional, flags) {
  const epicNumber = issueNumber(positional[0], 'an epic number')
  if (!flags.title) throw new UsageError('create-ticket needs --title')
  if (flags.file === undefined) throw new UsageError('create-ticket needs --file')
  const tier = flags.tier || 'hard'
  if (!TIER_LABELS[tier]) throw new UsageError(`--tier must be easy or hard, got "${tier}"`)
  const blockers = parseBlockerList(flags['blocked-by'])
  const epic = github.getIssue(epicNumber)
  if (!epic.labels.includes(EPIC_LABEL)) throw new UsageError(`#${epicNumber} is not an epic (it has no ${EPIC_LABEL} label)`)
  let body
  try {
    body = withBlockedBy(withEpicLine(readFileSync(flags.file, 'utf8'), epicNumber), blockers)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return 1
  }
  const parsed = parseTicketBody(body, parseEpicBody(epic.body).settings.designSources)
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
    process.stderr.write(`created #${created.number}, but could not link it to epic #${epicNumber}: ${error.message}\n`)
    console.log(created.number)
    return 1
  }
  console.log(created.number)
  return 0
}

function commandNeedsHuman(positional, flags) {
  const number = issueNumber(positional[0], 'a ticket number')
  if (!flags.text) throw new UsageError('needs-human needs --text "<why>"')
  const { issue, epicAuthor } = loadTicket(number)
  const people = issue.assignees.length ? issue.assignees : [epicAuthor || issue.author].filter(Boolean)
  github.addLabels(number, issue.labels.includes(NEEDS_HUMAN_LABEL) ? [] : [NEEDS_HUMAN_LABEL])
  github.removeLabels(number, issue.labels.filter((label) => STATE_LABELS.includes(label) && label !== NEEDS_HUMAN_LABEL))
  const mention = people.map((login) => `@${login}`).join(' ')
  const posted = github.comment(number, `**This ticket needs a person.** ${mention ? `${mention} ` : ''}${flags.text}`)
  console.log(posted.url || `#${number} marked ${NEEDS_HUMAN_LABEL}`)
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
    case 'needs-human':
      return commandNeedsHuman(positional, flags)
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
  } else if (error instanceof TrackerError) {
    process.stderr.write(`flow: ${error.message}\n`)
    process.exitCode = 1
  } else throw error
}
