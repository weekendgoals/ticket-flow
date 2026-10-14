import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, realpathSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installFakeGh } from './tracker/fake-gh.mjs'
import { LABELS } from './epic-state.mjs'

const FLOW = join(dirname(fileURLToPath(import.meta.url)), 'flow.mjs')
const R = 'repos/{owner}/{repo}'
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-cli-')))
after(() => rmSync(directory, { recursive: true, force: true }))
const fake = installFakeGh(join(directory, 'bin'))
const workdir = join(directory, 'work')
mkdirSync(workdir)
beforeEach(() => fake.clearCalls())

function flow(...args) {
  const result = spawnSync(process.execPath, [FLOW, ...args], {
    cwd: workdir,
    encoding: 'utf8',
    env: { ...process.env, ...fake.env },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function issue(number, { title = `issue ${number}`, body = '', labels = [], assignees = [], author = 'vadim' } = {}) {
  return {
    number,
    id: 5000 + number,
    title,
    body,
    state: 'open',
    labels: labels.map((name) => ({ name })),
    assignees: assignees.map((login) => ({ login })),
    user: { login: author },
    html_url: `https://github.com/o/r/issues/${number}`,
  }
}

const epicBody = (tickets, settings = 'Delivery: release\nBranch: epic/trip-export') => `## Outcome

Travellers can export a trip.

## Settings

${settings}

## Walkthrough

A traveller exports a trip.

## Tickets

${tickets.map((number) => `- [ ] #${number} — ticket ${number}`).join('\n')}
`

const DECIDABLE = '```criteria\n- it works\n  CHECK: true\n```'

const ticketBody = (epic, { blockedBy = null, criteria = DECIDABLE } = {}) => `Epic: #${epic}
${blockedBy === null ? '' : `${blockedBy}\n`}
## Scope

- the work

## Not in scope

- other work

## Acceptance criteria

${criteria}
`

const ticket = (number, epic, state, extra = {}) =>
  issue(number, {
    title: `ticket ${number}`,
    body: ticketBody(epic, extra),
    labels: ['flow:ticket', `flow:${state}`, ...(extra.tier ? [`tier:${extra.tier}`] : [])],
    assignees: extra.assignees || [],
  })

function world({ epics = [], others = [], labels = LABELS.map((label) => label.name), repo = {}, extra = {} }) {
  const fixtures = {
    '--version': 'gh version 2.96.0 (2026-07-02)\n',
    'auth status': '',
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true, ...repo },
    [`GET ${R}/labels?per_page=100`]: labels.map((name) => ({ name, color: 'ededed', description: '' })),
    [`GET ${R}/issues?labels=flow%3Aepic&state=open&per_page=100`]: epics.map(({ epic }) => epic),
  }
  const noEdits = { data: { repository: { issue: { userContentEdits: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } } }
  const add = (raw) => {
    fixtures[`GET ${R}/issues/${raw.number}`] = raw
    fixtures[`graphql name={repo} number=${raw.number} owner={owner}`] = noEdits
  }
  for (const { epic, tickets } of epics) {
    add(epic)
    fixtures[`GET ${R}/issues/${epic.number}/sub_issues?per_page=100`] = tickets
    tickets.forEach(add)
  }
  others.forEach(add)
  fake.setFixtures({ ...fixtures, ...extra })
}

const epicLabels = (approved = true) => ['flow:epic', ...(approved ? ['flow:approved'] : [])]

const tripExport = () => ({
  epic: issue(1, { title: 'Trip export', body: epicBody([2, 3, 4, 5, 6]), labels: epicLabels() }),
  tickets: [
    ticket(2, 1, 'done'),
    ticket(3, 1, 'planned', { blockedBy: 'Blocked by: #2', tier: 'easy' }),
    ticket(4, 1, 'planned', { blockedBy: 'Blocked by: #3' }),
    ticket(5, 1, 'in-progress'),
    ticket(6, 1, 'planned'),
  ],
})

const brokenEpic = () => ({
  epic: issue(10, { title: 'Broken', body: epicBody([11, 12, 13, 14]), labels: epicLabels() }),
  tickets: [
    ticket(11, 10, 'planned', { blockedBy: 'Blocked by: #12 and #13' }),
    ticket(12, 10, 'planned', { blockedBy: 'Blocked by: #99' }),
    ticket(13, 10, 'planned', { blockedBy: 'Blocked by: #14' }),
    ticket(14, 10, 'planned', { blockedBy: 'Blocked by: #13' }),
  ],
})

test('init creates the eleven labels, and a second run creates none', () => {
  world({ labels: ['flow:epic', 'bug'], extra: { [`POST ${R}/labels`]: {} } })
  const first = flow('init')
  assert.equal(first.status, 0, first.stderr)
  const posted = fake.calls().filter((call) => call.key === `POST ${R}/labels`).map((call) => JSON.parse(call.stdin))
  assert.equal(posted.length, 10)
  assert.ok(posted.every((label) => /^[0-9a-f]{6}$/.test(label.color) && label.description.length > 0))
  assert.match(first.stdout, /10 label\(s\) created, 1 already there/)
  assert.equal(LABELS.length, 11)
  assert.ok(!LABELS.some((label) => label.name === 'flow:ready'), 'ready is worked out, never a label')
  fake.clearCalls()
  world({ extra: { [`POST ${R}/labels`]: {} } })
  const second = flow('init')
  assert.equal(second.status, 0)
  assert.match(second.stdout, /all 11 labels already there/)
  assert.equal(fake.calls().filter((call) => call.key === `POST ${R}/labels`).length, 0)
})

test('doctor prints ok and exits 0 on a healthy repository', () => {
  world({ epics: [tripExport()] })
  const result = flow('doctor')
  assert.equal(result.status, 0, result.stdout)
  assert.equal(result.stdout.trim(), 'ok')
})

test('doctor names a missing gh and stops there', () => {
  const result = spawnSync(process.execPath, [FLOW, 'doctor'], { cwd: workdir, encoding: 'utf8', env: { ...process.env, PATH: join(directory, 'nothing-here') } })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /`gh` is not installed or not on PATH/)
})

test('doctor names a gh that is not signed in', () => {
  world({ extra: { 'auth status': { $exit: 1, $stderr: 'You are not logged into any GitHub hosts.' } } })
  const result = flow('doctor')
  assert.equal(result.status, 1)
  assert.match(result.stdout, /not signed in to GitHub; run `gh auth login`/)
  assert.ok(!fake.calls().some((call) => call.key.startsWith('GET')), 'nothing else is asked of an unauthenticated gh')
})

test('doctor names issues turned off, an unknown default branch and missing labels, one sentence each', () => {
  world({ repo: { has_issues: false, default_branch: null }, labels: ['flow:epic'] })
  const result = flow('doctor')
  assert.equal(result.status, 1)
  const lines = result.stdout.trim().split('\n')
  assert.equal(lines.length, 3, result.stdout)
  assert.match(lines[0], /o\/r has issues turned off/)
  assert.match(lines[1], /default branch of o\/r is unknown/)
  assert.match(lines[2], /Labels missing: flow:ticket, .*tier:hard; run `flow init`/)
})

test('doctor names an unreadable Blocked by line, a blocker outside the epic, and a cycle', () => {
  world({ epics: [tripExport(), brokenEpic()] })
  const result = flow('doctor')
  assert.equal(result.status, 1)
  assert.match(result.stdout, /#11 has a "Blocked by" line that cannot be read: "Blocked by: #12 and #13"/)
  assert.match(result.stdout, /#12 is blocked by #99, which is not a ticket of epic #10/)
  assert.match(result.stdout, /epic #10 has a blocking cycle: #13 → #14 → #13/)
  assert.ok(!/epic #1[^0-9]/.test(result.stdout), 'the healthy epic adds nothing')
})

test('board lists open epics with approval, progress and branch', () => {
  world({ epics: [tripExport(), { epic: issue(20, { title: 'Empty', body: epicBody([], 'Delivery: incremental'), labels: epicLabels(false) }), tickets: [] }] })
  const result = flow('board')
  assert.equal(result.status, 0, result.stderr)
  const lines = result.stdout.trim().split('\n')
  assert.equal(lines[0], 'default branch: main')
  assert.match(lines[2], /^#\s+title\s+approved\s+done\s+branch$/)
  assert.match(lines[4], /^#1\s+Trip export\s+yes\s+1\/5\s+epic\/trip-export$/)
  assert.match(lines[5], /^#20\s+Empty\s+no\s+0\/0\s+\(none set\)$/)
  const board = JSON.parse(flow('board', '--json').stdout)
  assert.equal(board.defaultBranch, 'main')
  assert.deepEqual(board.epics[0], { number: 1, title: 'Trip export', approved: true, done: 1, total: 5, branch: 'epic/trip-export', problems: 0 })
})

test('board with an epic lists its tickets in plan order, with tier, derived state and blockers', () => {
  world({ epics: [tripExport()] })
  const result = flow('board', '1')
  assert.equal(result.status, 0, result.stderr)
  const lines = result.stdout.trim().split('\n')
  assert.match(lines[0], /^#1 Trip export$/)
  assert.match(lines[1], /approved · branch epic\/trip-export from main · release delivery · parallel 1/)
  assert.match(lines.find((line) => line.startsWith('#2 ')), /hard\s+done\s+—$/)
  assert.match(lines.find((line) => line.startsWith('#3 ')), /easy\s+ready\s+#2$/)
  assert.match(lines.find((line) => line.startsWith('#4 ')), /hard\s+waiting\s+#3$/)
  assert.match(lines.find((line) => line.startsWith('#5 ')), /in-progress/)
})

test('board with an epic prints its problems under the table', () => {
  world({ epics: [brokenEpic()] })
  const result = flow('board', '10')
  assert.match(result.stdout, /#11\s+ticket 11\s+hard\s+waiting\s+unreadable line/)
  assert.match(result.stdout, /^! epic #10 has a blocking cycle/m)
})

test('board refuses an issue that is not an epic', () => {
  world({ others: [issue(30, { labels: ['bug'] })] })
  const result = flow('board', '30')
  assert.equal(result.status, 2)
  assert.match(result.stderr, /#30 is not an epic/)
})

test('next lists ready, waiting, in-progress and done tickets, and exits 0 while work can move', () => {
  world({ epics: [tripExport()] })
  const result = flow('next', '1')
  assert.equal(result.status, 0, result.stderr)
  const next = JSON.parse(result.stdout)
  assert.deepEqual(next.ready, [3, 6])
  assert.deepEqual(next.waiting, [{ n: 4, blockedBy: [3] }])
  assert.deepEqual(next.inProgress, [5])
  assert.deepEqual(next.done, [2])
  assert.deepEqual(next.problems, [])
  assert.deepEqual([next.delivery, next.parallel], ['release', 1])
  assert.deepEqual(next.tickets.find((ticket) => ticket.n === 5), { n: 5, title: next.tickets.find((ticket) => ticket.n === 5).title, tier: 'hard', model: 'opus', state: 'in-progress' })
})

test('next on an unapproved epic reports approved false, nothing ready, and exits 1', () => {
  const unapproved = tripExport()
  unapproved.epic = issue(1, { title: 'Trip export', body: epicBody([2, 3, 4, 5, 6]), labels: epicLabels(false) })
  world({ epics: [unapproved] })
  const result = flow('next', '1')
  assert.equal(result.status, 1)
  const next = JSON.parse(result.stdout)
  assert.equal(next.approved, false)
  assert.deepEqual(next.ready, [])
  assert.deepEqual(next.waiting, [])
  assert.deepEqual(next.planned, [3, 4, 6])
  assert.match(result.stderr, /epic #1 is not approved/)
  assert.match(flow('board', '1').stdout, /#3\s+ticket 3\s+easy\s+planned/)
})

test('approving an epic on GitHub is the only step: its planned tickets become ready with no label change', () => {
  world({ epics: [tripExport()] })
  const next = JSON.parse(flow('next', '1').stdout)
  assert.equal(next.approved, true)
  assert.deepEqual(next.ready, [3, 6])
  assert.ok(!fake.calls().some((call) => !call.key.startsWith('GET') && !call.key.startsWith('graphql')), 'next writes nothing')
})

test('next exits 0 on a built epic, where every ticket is done', () => {
  world({ epics: [{ epic: issue(40, { body: epicBody([41, 42]), labels: epicLabels() }), tickets: [ticket(41, 40, 'done'), ticket(42, 40, 'done')] }] })
  const result = flow('next', '40')
  assert.equal(result.status, 0)
  assert.deepEqual(JSON.parse(result.stdout).done, [41, 42])
})

test('next exits 1 on a stuck epic: unreadable line, outside blocker and cycle all wait, nothing can start', () => {
  world({ epics: [brokenEpic()] })
  const result = flow('next', '10')
  assert.equal(result.status, 1)
  const next = JSON.parse(result.stdout)
  assert.deepEqual(next.ready, [])
  assert.deepEqual(next.waiting.map((entry) => entry.n), [11, 12, 13, 14])
  assert.match(next.waiting[0].problem, /cannot be read/)
  assert.deepEqual(next.waiting[1].blockedBy, [99])
  assert.equal(next.problems.length, 3)
  assert.match(result.stderr, /epic #10 is stuck: 4 ticket\(s\) are not done, none is ready and none is in progress/)
})

test('next exits 1 when the only unfinished ticket needs a person', () => {
  world({ epics: [{ epic: issue(50, { body: epicBody([51, 52]), labels: epicLabels() }), tickets: [ticket(51, 50, 'done'), ticket(52, 50, 'needs-human')] }] })
  const result = flow('next', '50')
  assert.equal(result.status, 1)
  assert.deepEqual(JSON.parse(result.stdout).needsHuman, [52])
})

test('next treats a ticket in review as in progress, so the epic is not stuck', () => {
  world({ epics: [{ epic: issue(60, { body: epicBody([61]), labels: epicLabels() }), tickets: [ticket(61, 60, 'in-review')] }] })
  const result = flow('next', '60')
  assert.equal(result.status, 0)
  assert.deepEqual(JSON.parse(result.stdout).inProgress, [61])
})

test('next exits 1 on an epic with no tickets: nothing is built and nothing can start', () => {
  world({ epics: [{ epic: issue(20, { body: epicBody([]), labels: epicLabels() }), tickets: [] }] })
  const result = flow('next', '20')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /has no tickets/)
})

const CRITERIA = `- the export prints its count
\`\`\`criteria
- the export prints its count
  CHECK: node -e "console.log('exported 3 trips')"
  EXPECT: exported 3 trips
- the page matches the design
  COMPARE: designs/map.html @ 1440
\`\`\``

test('ticket prints the parsed ticket with its criteria and body edit history', () => {
  const epic = issue(1, { body: epicBody([3], 'Design sources: designs/map.html'), labels: epicLabels() })
  world({
    epics: [{ epic, tickets: [ticket(3, 1, 'planned', { blockedBy: 'Blocked by: #2', tier: 'easy', criteria: CRITERIA })] }],
    extra: {
      'graphql name={repo} number=3 owner={owner}': {
        data: { repository: { issue: { userContentEdits: { nodes: [{ editedAt: '2026-10-14T08:00:00Z', editor: { login: 'vadim' } }] } } } },
      },
    },
  })
  const result = flow('ticket', '#3')
  assert.equal(result.status, 0, result.stderr)
  const parsed = JSON.parse(result.stdout)
  assert.equal(parsed.epic, 1)
  assert.equal(parsed.state, 'planned')
  assert.equal(parsed.tier, 'easy')
  assert.equal(parsed.model, 'sonnet')
  assert.deepEqual(parsed.blockedBy, [2])
  assert.equal(parsed.scope, '- the work')
  assert.equal(parsed.notInScope, '- other work')
  assert.equal(parsed.criteria.checks[0].expect, 'exported 3 trips')
  assert.equal(parsed.criteria.compares[0].source, 'designs/map.html')
  assert.deepEqual(parsed.criteria.problems, [])
  assert.deepEqual(parsed.edits, [{ editedAt: '2026-10-14T08:00:00Z', editor: 'vadim' }])
})

test('check runs the criteria from the issue: JSON ledger on stdout, a table on stderr, exit 0 when all pass', () => {
  const epic = issue(1, { body: epicBody([3], 'Design sources: designs/map.html'), labels: epicLabels() })
  world({ epics: [{ epic, tickets: [ticket(3, 1, 'in-progress', { criteria: CRITERIA })] }] })
  const result = flow('check', '3')
  assert.equal(result.status, 0, result.stderr)
  const ledger = JSON.parse(result.stdout)
  assert.equal(ledger.ticket, 3)
  assert.equal(ledger.total, 1)
  assert.equal(ledger.passed, 1)
  assert.equal(ledger.compares.length, 1)
  assert.match(result.stderr, /✓ 1\/1 the export prints its count/)
  assert.match(result.stderr, /1\/1 checks passed; 1 comparison\(s\) are manual/)
})

test('check exits 1 when a criterion fails, and runs commands in --cwd', () => {
  const place = join(directory, 'elsewhere')
  mkdirSync(place, { recursive: true })
  writeFileSync(join(place, 'answer.txt'), 'forty-two\n')
  const criteria = '```criteria\n- the answer is there\n  CHECK: cat answer.txt\n  EXPECT: forty-two\n```'
  world({ epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels() }), tickets: [ticket(3, 1, 'in-progress', { criteria })] }] })
  const red = flow('check', '3')
  assert.equal(red.status, 1)
  assert.equal(JSON.parse(red.stdout).passed, 0)
  const green = flow('check', '3', '--cwd', place)
  assert.equal(green.status, 0, green.stderr)
})

test('check runs from the repository root by default', () => {
  const repo = join(directory, 'repo')
  mkdirSync(join(repo, 'deep/inside'), { recursive: true })
  execFileSync('git', ['init', '-q', repo])
  writeFileSync(join(repo, 'root-marker.txt'), 'at the root\n')
  const criteria = '```criteria\n- the marker\n  CHECK: cat root-marker.txt\n```'
  world({ epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels() }), tickets: [ticket(3, 1, 'in-progress', { criteria })] }] })
  const result = spawnSync(process.execPath, [FLOW, 'check', '3'], { cwd: join(repo, 'deep/inside'), encoding: 'utf8', env: { ...process.env, ...fake.env } })
  assert.equal(result.status, 0, result.stderr)
})

test('check exits 1 on a malformed criterion even with nothing to run', () => {
  const criteria = '- it runs\n  CHECK: true'
  world({ epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels() }), tickets: [ticket(3, 1, 'in-progress', { criteria })] }] })
  const result = flow('check', '3')
  assert.equal(result.status, 1)
  const reasons = JSON.parse(result.stdout).problems.map((problem) => problem.why)
  assert.ok(reasons.some((why) => /outside the ```criteria block/.test(why)), reasons.join('\n'))
})

test('check fails a ticket whose criteria block was deleted, and carries the body edits that show who did it', () => {
  world({
    epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels() }), tickets: [ticket(3, 1, 'in-progress', { criteria: '' })] }],
    extra: {
      'graphql name={repo} number=3 owner={owner}': {
        data: { repository: { issue: { userContentEdits: { pageInfo: { hasNextPage: false }, nodes: [{ editedAt: '2026-10-14T09:30:00Z', editor: { login: 'someone' } }] } } } },
      },
    },
  })
  const result = flow('check', '3')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.total, 0)
  assert.equal(report.allPassed, false)
  assert.match(report.problems[0].why, /no ```criteria block/)
  assert.deepEqual(report.edits, [{ editedAt: '2026-10-14T09:30:00Z', editor: 'someone' }])
  assert.match(result.stderr, /nothing decides this ticket/)
})

test('check runs the criteria even when the edit history cannot be read, and fails with that named', () => {
  world({
    epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels() }), tickets: [ticket(3, 1, 'in-progress')] }],
    extra: { 'graphql name={repo} number=3 owner={owner}': { $exit: 1, $stderr: 'gh: Something went wrong (HTTP 502)' } },
  })
  const result = flow('check', '3')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.deepEqual([report.total, report.passed, report.edits, report.allPassed], [1, 1, null, false])
  assert.match(report.problems[0].why, /edit history could not be read .*HTTP 502/)
})

test('a planned ticket whose criteria cannot decide it waits, with the reason, instead of being ready', () => {
  const broken = issue(3, { title: 'ticket 3', body: 'Epic: #1\n## Acceptance criteria\n', labels: ['flow:ticket', 'flow:planned'] })
  world({ epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels() }), tickets: [broken] }] })
  const result = flow('next', '1')
  assert.equal(result.status, 1)
  const next = JSON.parse(result.stdout)
  assert.deepEqual(next.ready, [])
  assert.equal(next.waiting[0].n, 3)
  assert.match(next.waiting[0].problem, /#3 has acceptance criteria that cannot decide it: no ```criteria block/)
  const doctor = flow('doctor')
  assert.equal(doctor.status, 1)
  assert.match(doctor.stdout, /#3 has acceptance criteria that cannot decide it/)
})

test('check fails an empty criteria block, and passes one that holds only a design comparison', () => {
  const empty = '```criteria\n- prose only\n```'
  world({ epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels() }), tickets: [ticket(3, 1, 'in-progress', { criteria: empty })] }] })
  const red = flow('check', '3')
  assert.equal(red.status, 1)
  assert.match(JSON.parse(red.stdout).problems[0].why, /no CHECK or COMPARE line/)
  const compareOnly = '```criteria\n- the whole page matches\n  COMPARE: designs/map.html @ 1440\n```'
  world({ epics: [{ epic: issue(1, { body: epicBody([3], 'Design sources: designs/map.html'), labels: epicLabels() }), tickets: [ticket(3, 1, 'in-progress', { criteria: compareOnly })] }] })
  const manual = flow('check', '3')
  assert.equal(manual.status, 0, manual.stderr)
  assert.equal(JSON.parse(manual.stdout).compares.length, 1)
})

test('check --file runs a draft ticket body before anything exists on GitHub, so a CHECK can be proven red', () => {
  world({})
  const epicFile = join(directory, 'draft-epic.md')
  writeFileSync(epicFile, epicBody([], 'Design sources: designs/map.html'))
  const draft = join(directory, 'draft-ticket.md')
  writeFileSync(draft, ticketBody(0, { criteria: CRITERIA.replace("console.log('exported 3 trips')", 'process.exit(1)') }))
  const red = flow('check', '--file', draft, '--epic-file', epicFile)
  assert.equal(red.status, 1)
  const ledger = JSON.parse(red.stdout)
  assert.equal(ledger.ticket, draft)
  assert.equal(ledger.checks[0].status, 'failed')
  assert.deepEqual(ledger.problems, [], 'the COMPARE path is checked against the draft epic settings')
  assert.equal(fake.calls().length, 0, 'GitHub is not asked anything')
  const withoutEpic = JSON.parse(flow('check', '--file', draft).stdout)
  assert.match(withoutEpic.problems[0].why, /declare no "Design sources:"/)
  assert.equal(flow('check', '3', '--file', draft).status, 2)
  assert.equal(flow('check', '3', '--epic-file', epicFile).status, 2)
})

test('post adds a comment from --text or --file', () => {
  world({ extra: { [`POST ${R}/issues/3/comments`]: { id: 1, html_url: 'https://github.com/o/r/issues/3#issuecomment-1' } } })
  const result = flow('post', '3', '--text', 'Started on `opus`, branch `3-export`.')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /issuecomment-1/)
  assert.deepEqual(JSON.parse(fake.calls()[0].stdin), { body: 'Started on `opus`, branch `3-export`.' })
  const file = join(directory, 'comment.md')
  writeFileSync(file, '## Review\n\nNo findings.\n')
  fake.clearCalls()
  assert.equal(flow('post', '3', '--file', file).status, 0)
  assert.deepEqual(JSON.parse(fake.calls()[0].stdin), { body: '## Review\n\nNo findings.\n' })
  assert.equal(flow('post', '3').status, 2)
})

test('label adds and removes labels, touching only what changes', () => {
  world({
    others: [issue(3, { labels: ['flow:ticket', 'flow:planned'] })],
    extra: { [`POST ${R}/issues/3/labels`]: [], [`DELETE ${R}/issues/3/labels/flow%3Aplanned`]: null },
  })
  const result = flow('label', '3', '+flow:in-progress', '-flow:planned', '-flow:done')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /#3: flow:ticket, flow:in-progress/)
  const writes = fake.calls().filter((call) => !call.key.startsWith('GET'))
  assert.deepEqual(writes.map((call) => call.key), [`POST ${R}/issues/3/labels`, `DELETE ${R}/issues/3/labels/flow%3Aplanned`])
  assert.deepEqual(JSON.parse(writes[0].stdin), { labels: ['flow:in-progress'] })
})

test('label refuses a change that would leave two state labels', () => {
  world({ others: [issue(3, { labels: ['flow:ticket', 'flow:planned'] })] })
  const result = flow('label', '3', '+flow:in-progress')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /would carry 2 state labels \(flow:planned, flow:in-progress\)/)
  assert.ok(!fake.calls().some((call) => !call.key.startsWith('GET')), 'nothing was written')
})

test('create-epic creates an issue labelled flow:epic and prints its number', () => {
  const file = join(directory, 'epic.md')
  writeFileSync(file, epicBody([]))
  world({ extra: { [`POST ${R}/issues`]: issue(70) } })
  const result = flow('create-epic', '--file', file, '--title', 'Trip export')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '70')
  const sent = JSON.parse(fake.calls()[0].stdin)
  assert.equal(sent.title, 'Trip export')
  assert.deepEqual(sent.labels, ['flow:epic'])
})

test('create-epic refuses settings it cannot read, before anything is created', () => {
  const file = join(directory, 'bad-epic.md')
  writeFileSync(file, epicBody([], 'Delivery: sometimes'))
  world({})
  const result = flow('create-epic', '--file', file, '--title', 'Bad')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /neither release nor incremental/)
  assert.equal(fake.calls().length, 0)
})

test('create-ticket creates the ticket, links it as a sub-issue and adds it to the epic list', () => {
  const file = join(directory, 'ticket.md')
  writeFileSync(file, '## Scope\n\n- the button\n\n## Acceptance criteria\n\n```criteria\n- works\n  CHECK: true\n```\n')
  const epic = issue(1, { body: epicBody([2]), labels: epicLabels(false) })
  world({
    epics: [{ epic, tickets: [ticket(2, 1, 'planned')] }],
    extra: {
      [`POST ${R}/issues`]: issue(71),
      [`POST ${R}/issues/1/sub_issues`]: {},
      [`PATCH ${R}/issues/1`]: epic,
    },
  })
  const result = flow('create-ticket', '1', '--file', file, '--title', 'The download button', '--tier', 'easy', '--blocked-by', '2')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '71')
  const writes = fake.calls().filter((call) => !call.key.startsWith('GET'))
  assert.deepEqual(writes.map((call) => call.key), [`POST ${R}/issues`, `POST ${R}/issues/1/sub_issues`, `PATCH ${R}/issues/1`])
  const created = JSON.parse(writes[0].stdin)
  assert.equal(created.title, 'The download button')
  assert.deepEqual(created.labels, ['flow:ticket', 'flow:planned', 'tier:easy'])
  assert.match(created.body, /^Epic: #1\nBlocked by: #2\n/)
  assert.deepEqual(JSON.parse(writes[1].stdin), { sub_issue_id: 5071 })
  assert.match(JSON.parse(writes[2].stdin).body, /- \[ \] #2 — ticket 2\n- \[ \] #71 — The download button/)
})

test('create-ticket --no-epic creates a lone ticket with no Epic line and links it to nothing', () => {
  const file = join(directory, 'lone.md')
  writeFileSync(file, '## Scope\n\n- the typo\n\n## Acceptance criteria\n\n```criteria\n- fixed\n  CHECK: true\n```\n')
  world({ extra: { [`POST ${R}/issues`]: issue(80) } })
  const result = flow('create-ticket', '--no-epic', '--file', file, '--title', 'Fix the typo', '--tier', 'easy')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '80')
  assert.deepEqual(fake.calls().map((call) => call.key), [`POST ${R}/issues`])
  const created = JSON.parse(fake.calls()[0].stdin)
  assert.deepEqual(created.labels, ['flow:ticket', 'flow:planned', 'tier:easy'])
  assert.match(created.body, /^## Scope/)
})

test('create-ticket --no-epic refuses blockers, an Epic line and a missing criteria block, creating nothing', () => {
  world({})
  const file = join(directory, 'lone-bad.md')
  writeFileSync(file, '## Scope\n\n- x\n\n## Acceptance criteria\n\n```criteria\n- x\n  CHECK: true\n```\n')
  assert.match(flow('create-ticket', '--no-epic', '--file', file, '--title', 'x', '--blocked-by', '3').stderr, /cannot be blocked by other tickets/)
  writeFileSync(file, 'Epic: #4\n\n## Scope\n\n- x\n\n## Acceptance criteria\n\n```criteria\n- x\n  CHECK: true\n```\n')
  assert.match(flow('create-ticket', '--no-epic', '--file', file, '--title', 'x').stderr, /says "Epic: #4"; create it with `flow create-ticket 4`/)
  writeFileSync(file, '## Scope\n\n- x\n')
  const missing = flow('create-ticket', '--no-epic', '--file', file, '--title', 'x')
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /no ```criteria block/)
  assert.ok(!fake.calls().some((call) => call.key === `POST ${R}/issues`))
})

test('create-ticket defaults to the hard tier', () => {
  const file = join(directory, 'ticket-hard.md')
  writeFileSync(file, '## Scope\n\n- x\n\n## Acceptance criteria\n\n```criteria\n- x\n  CHECK: false\n```\n')
  const epic = issue(1, { body: epicBody([]), labels: epicLabels(false) })
  world({ epics: [{ epic, tickets: [] }], extra: { [`POST ${R}/issues`]: issue(72), [`POST ${R}/issues/1/sub_issues`]: {}, [`PATCH ${R}/issues/1`]: epic } })
  assert.equal(flow('create-ticket', '1', '--file', file, '--title', 'x').status, 0)
  assert.deepEqual(JSON.parse(fake.calls().find((call) => call.key === `POST ${R}/issues`).stdin).labels, ['flow:ticket', 'flow:planned', 'tier:hard'])
})

test('create-ticket refuses a blocker outside the epic, an unreadable Blocked by line and a malformed criterion, creating nothing', () => {
  const epic = issue(1, { body: epicBody([2]), labels: epicLabels(false) })
  world({ epics: [{ epic, tickets: [ticket(2, 1, 'planned')] }] })
  const plain = join(directory, 'plain.md')
  writeFileSync(plain, '## Scope\n\n- x\n')
  const outside = flow('create-ticket', '1', '--file', plain, '--title', 'x', '--blocked-by', '2,9')
  assert.equal(outside.status, 1)
  assert.match(outside.stderr, /blocked by #9, which is not a ticket of epic #1/)
  const prose = join(directory, 'prose.md')
  writeFileSync(prose, 'Blocked by: #2 once it lands\n\n## Scope\n\n- x\n')
  const unreadable = flow('create-ticket', '1', '--file', prose, '--title', 'x')
  assert.equal(unreadable.status, 1)
  assert.match(unreadable.stderr, /cannot be read/)
  const noCriteria = flow('create-ticket', '1', '--file', plain, '--title', 'x')
  assert.equal(noCriteria.status, 1)
  assert.match(noCriteria.stderr, /no ```criteria block/)
  const malformed = join(directory, 'malformed.md')
  writeFileSync(malformed, '## Acceptance criteria\n\n```criteria\n- x\n  EXPECT: orphan\n```\n')
  const bad = flow('create-ticket', '1', '--file', malformed, '--title', 'x')
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /no CHECK line above it/)
  assert.ok(!fake.calls().some((call) => !call.key.startsWith('GET')), 'nothing was created')
})

test('create-ticket refuses an epic whose settings cannot be read, with the same sentences as create-epic', () => {
  const file = join(directory, 'ticket-under-bad-epic.md')
  writeFileSync(file, '## Acceptance criteria\n\n```criteria\n- x\n  CHECK: false\n```\n')
  world({ epics: [{ epic: issue(1, { body: epicBody([], 'Delivery: maybe'), labels: epicLabels(false) }), tickets: [] }] })
  const result = flow('create-ticket', '1', '--file', file, '--title', 'x')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /epic #1: "Delivery: maybe" is neither release nor incremental/)
  assert.ok(!fake.calls().some((call) => !call.key.startsWith('GET')), 'nothing was created')
})

test('create-ticket that cannot link names flow link as the recovery, and flow link finishes the job', () => {
  const file = join(directory, 'ticket-unlinked.md')
  writeFileSync(file, '## Acceptance criteria\n\n```criteria\n- x\n  CHECK: false\n```\n')
  const epic = issue(1, { body: epicBody([2]), labels: epicLabels(false) })
  const created = issue(73, { title: 'Half made', body: 'Epic: #1\n\n## Acceptance criteria\n', labels: ['flow:ticket', 'flow:planned'] })
  world({
    epics: [{ epic, tickets: [ticket(2, 1, 'planned')] }],
    others: [created],
    extra: {
      [`POST ${R}/issues`]: created,
      [`POST ${R}/issues/1/sub_issues`]: { $exit: 1, $stderr: 'gh: Validation Failed (HTTP 422)' },
    },
  })
  const failed = flow('create-ticket', '1', '--file', file, '--title', 'Half made')
  assert.equal(failed.status, 1)
  assert.equal(failed.stdout.trim(), '73', 'the number of what was created is still printed')
  assert.match(failed.stderr, /created #73, but could not link it to epic #1: .*HTTP 422/)
  assert.match(failed.stderr, /Finish with `flow link 1 73`; running create-ticket again would create a duplicate/)

  fake.clearCalls()
  world({
    epics: [{ epic, tickets: [ticket(2, 1, 'planned')] }],
    others: [created],
    extra: { [`POST ${R}/issues/1/sub_issues`]: {}, [`PATCH ${R}/issues/1`]: epic },
  })
  const linked = flow('link', '1', '73')
  assert.equal(linked.status, 0, linked.stderr)
  const writes = fake.calls().filter((call) => !call.key.startsWith('GET'))
  assert.deepEqual(writes.map((call) => call.key), [`POST ${R}/issues/1/sub_issues`, `PATCH ${R}/issues/1`])
  assert.deepEqual(JSON.parse(writes[0].stdin), { sub_issue_id: 5073 })
  assert.match(JSON.parse(writes[1].stdin).body, /- \[ \] #2 — ticket 2\n- \[ \] #73 — Half made/)
})

test('flow link is a no-op on a ticket already linked and listed, and refuses one that names another epic', () => {
  world({ epics: [tripExport()], others: [issue(80, { body: 'Epic: #7\n', labels: ['flow:ticket', 'flow:planned'] }), issue(81, { labels: ['flow:epic'] }), issue(82, { labels: ['bug'] })] })
  const again = flow('link', '1', '3')
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout, /#3 was already linked to epic #1/)
  assert.ok(!fake.calls().some((call) => !call.key.startsWith('GET')), 'nothing was written')
  const wrong = flow('link', '1', '80')
  assert.equal(wrong.status, 1)
  assert.match(wrong.stderr, /#80 says "Epic: #7", not #1/)
  const epicByTypo = flow('link', '1', '81')
  assert.equal(epicByTypo.status, 1)
  assert.match(epicByTypo.stderr, /#81 is not a ticket \(it is an epic\); nothing was changed/)
  assert.match(flow('link', '1', '82').stderr, /#82 is not a ticket \(it has no flow:ticket label\)/)
  assert.ok(!fake.calls().some((call) => !call.key.startsWith('GET')), 'nothing was written')
})

test('create-ticket refuses a parent that is not an epic', () => {
  const file = join(directory, 'orphan.md')
  writeFileSync(file, '## Scope\n\n- x\n')
  world({ others: [issue(30, { labels: ['bug'] })] })
  const result = flow('create-ticket', '30', '--file', file, '--title', 'x')
  assert.equal(result.status, 2)
  assert.match(result.stderr, /#30 is not an epic/)
})

test('needs-human swaps the state label and mentions the assignee', () => {
  world({
    epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels(), author: 'owner' }), tickets: [ticket(3, 1, 'in-progress', { assignees: ['ana'] })] }],
    extra: {
      [`POST ${R}/issues/3/labels`]: [],
      [`DELETE ${R}/issues/3/labels/flow%3Ain-progress`]: null,
      [`POST ${R}/issues/3/comments`]: { id: 2, html_url: 'https://github.com/o/r/issues/3#issuecomment-2' },
    },
  })
  const result = flow('needs-human', '3', '--text', 'The plan says the export is CSV; the code only writes JSON.')
  assert.equal(result.status, 0, result.stderr)
  const writes = fake.calls().filter((call) => !call.key.startsWith('GET'))
  assert.deepEqual(writes.map((call) => call.key), [`POST ${R}/issues/3/labels`, `DELETE ${R}/issues/3/labels/flow%3Ain-progress`, `POST ${R}/issues/3/comments`])
  assert.deepEqual(JSON.parse(writes[0].stdin), { labels: ['flow:needs-human'] })
  assert.equal(JSON.parse(writes[2].stdin).body, '**This ticket needs a person.** @ana The plan says the export is CSV; the code only writes JSON.')
})

test('needs-human mentions the epic author when nobody is assigned', () => {
  world({
    epics: [{ epic: issue(1, { body: epicBody([3]), labels: epicLabels(), author: 'owner' }), tickets: [ticket(3, 1, 'in-review')] }],
    extra: {
      [`POST ${R}/issues/3/labels`]: [],
      [`DELETE ${R}/issues/3/labels/flow%3Ain-review`]: null,
      [`POST ${R}/issues/3/comments`]: { id: 3, html_url: null },
    },
  })
  assert.equal(flow('needs-human', '3', '--text', 'Merge conflict in the router.').status, 0)
  const commentCall = fake.calls().find((call) => call.key === `POST ${R}/issues/3/comments`)
  assert.match(JSON.parse(commentCall.stdin).body, /@owner Merge conflict in the router\./)
})

test('usage errors exit 2 and print the usage', () => {
  world({})
  for (const args of [['frobnicate'], ['next'], ['next', 'abc'], ['check', '3', '--bogus'], ['label', '3'], ['label', '3', 'flow:planned'], ['label', '3', '--json'], ['link', '1'], ['create-ticket', '1', '--file', 'x', '--title', 'y', '--tier', 'medium']]) {
    const result = flow(...args)
    assert.equal(result.status, 2, args.join(' '))
    assert.match(result.stderr, /usage: flow <command>/)
  }
})

test('a GitHub failure is reported as one sentence and exit 1, never a stack trace', () => {
  world({ extra: { [`GET ${R}/issues/3`]: { $exit: 1, $stderr: 'gh: Not Found (HTTP 404)' } } })
  const result = flow('ticket', '3')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^flow: gh api .* failed: gh: Not Found \(HTTP 404\)\n$/)
})
