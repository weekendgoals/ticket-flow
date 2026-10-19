import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, realpathSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installFakeGh } from './tracker/fake-gh.mjs'

const FLOW = join(dirname(fileURLToPath(import.meta.url)), 'flow.mjs')
const R = 'repos/{owner}/{repo}'
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-epic-run-')))
after(() => rmSync(directory, { recursive: true, force: true }))
const fake = installFakeGh(join(directory, 'bin'))
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}
let repositoryCount = 0

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }).trim()
}

function commitFile(cwd, path, text, subject) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true })
  writeFileSync(join(cwd, path), text)
  git(cwd, 'add', path)
  git(cwd, 'commit', '-q', '-m', subject)
  return git(cwd, 'rev-parse', 'HEAD')
}

function repository() {
  const root = join(directory, `case-${++repositoryCount}`)
  const remote = join(root, 'origin.git')
  const work = join(root, 'work')
  mkdirSync(root)
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  git(root, 'clone', '-q', remote, work)
  git(work, 'checkout', '-q', '-b', 'main')
  commitFile(work, 'README.md', 'trip planner\n', 'start')
  git(work, 'push', '-q', 'origin', 'main')
  git(work, 'push', '-q', 'origin', 'main:refs/heads/epic/trip-export')
  return { root, remote, work }
}

function ticketBranch({ work }, number, files) {
  git(work, 'checkout', '-q', '-b', `ticket/${number}`, 'origin/epic/trip-export')
  let sha = null
  for (const [path, text] of Object.entries(files)) sha = commitFile(work, path, text, `#${number}: add ${path}`)
  git(work, 'checkout', '-q', 'main')
  return sha
}

function flow(cwd, args, environment = {}) {
  const result = spawnSync(process.execPath, [FLOW, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY, ...fake.env, FLOW_UNATTENDED: '', FLOW_ACCOUNT: '', ...environment } })
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

const epicBody = ({ settings = 'Delivery: release\nBranch: epic/trip-export\nParallel: 2', extra = '' } = {}) => `## Outcome

Travellers can export a trip.

## Settings

${settings}

## Walkthrough

A traveller opens a trip and saves it as a file.

## Tickets

- [ ] #2 — export button
- [ ] #3 — export file
- [ ] #4 — export name
${extra}`

const ticketBody = (criteria, blockedBy = '') => `Epic: #1
${blockedBy}
## Scope

- the export

## Acceptance criteria

\`\`\`criteria
${criteria}
\`\`\`
`

const comment = (body, createdAt = '2026-10-14T10:00:00Z') => ({ id: 1, user: { login: 'flow-bot' }, body, created_at: createdAt })
const accepted = (sha) => comment(`<!-- flow:acceptance sha=${sha} passed=true -->\n**Acceptance passed**`, '2026-10-14T12:00:00Z')
const STARTED = comment('<!-- flow:started -->\n**Started** in an unattended run', '2026-10-14T10:00:00Z')
const epicCheck = (head, { passed = true, all = true, author = 'flow-bot' } = {}) => ({
  ...comment(`<!-- flow:release-check head=${head} passed=${passed} all=${all} -->\n**Epic check** at \`${head.slice(0, 12)}\``, '2026-10-14T13:00:00Z'),
  user: { login: author },
})
const epicHead = (repo) => git(repo.remote, 'rev-parse', 'epic/trip-export')

const DEFAULT_TICKETS = {
  2: { title: 'Export button', labels: ['flow:ticket', 'flow:planned', 'tier:easy'], criteria: '- the button\n  CHECK: test -f button.txt' },
  3: { title: 'Export file', labels: ['flow:ticket', 'flow:planned'], criteria: '- the file\n  CHECK: test -f export.txt' },
  4: { title: 'Export name', labels: ['flow:ticket', 'flow:planned'], criteria: '- the name\n  CHECK: test -f name.txt', blockedBy: 'Blocked by: #2' },
}

function world({ epicLabels = ['flow:epic', 'flow:approved'], epic = {}, tickets = {}, comments = {}, findings = [], closesOrReopens = [], extra = {} } = {}) {
  const epicIssue = issue(1, { title: 'Trip export', body: epicBody(epic), labels: epicLabels })
  const merged = Object.fromEntries(Object.entries(DEFAULT_TICKETS).map(([number, base]) => [number, { ...base, ...(tickets[number] || {}) }]))
  const issues = Object.entries(merged).map(([number, ticket]) => ({
    ...issue(Number(number), { title: ticket.title, body: ticketBody(ticket.criteria, ticket.blockedBy || ''), labels: ticket.labels, assignees: ticket.assignees || [] }),
    state: ticket.state || 'open',
  }))
  const fixtures = {
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true },
    graphql: { data: { viewer: { login: 'flow-bot' } } },
    [`GET ${R}/issues/1`]: epicIssue,
    [`GET ${R}/issues/1/sub_issues?per_page=100`]: [...issues, ...findings],
    [`GET ${R}/issues/1/comments?per_page=100`]: comments[1] || [],
    [`POST ${R}/issues/1/comments`]: { id: 1, html_url: 'https://github.com/o/r/issues/1#issuecomment-1' },
    [`PATCH ${R}/issues/1`]: epicIssue,
    'graphql name={repo} owner={owner}': { data: { repository: { projectsV2: { nodes: [] } } } },
    ...extra,
  }
  for (const found of findings) fixtures[`GET ${R}/issues/${found.number}`] = found
  for (const ticket of issues) {
    const number = ticket.number
    fixtures[`GET ${R}/issues/${number}`] = ticket
    fixtures[`GET ${R}/issues/${number}/comments?per_page=100`] = comments[number] || []
    fixtures[`POST ${R}/issues/${number}/comments`] = { id: number, html_url: `https://github.com/o/r/issues/${number}#issuecomment-${number}` }
    fixtures[`POST ${R}/issues/${number}/labels`] = []
    if (closesOrReopens.includes(number)) fixtures[`PATCH ${R}/issues/${number}`] = { ...ticket, state: ticket.state === 'closed' ? 'open' : 'closed' }
    for (const label of ['flow:planned', 'flow:in-progress', 'flow:in-review', 'flow:start', 'flow:done'])
      fixtures[`DELETE ${R}/issues/${number}/labels/${encodeURIComponent(label)}`] = null
  }
  fake.setFixtures({ ...fixtures, ...extra })
}

const posted = (number) => fake.calls().filter((call) => call.key === `POST ${R}/issues/${number}/comments`).map((call) => JSON.parse(call.stdin).body)
const added = (number) => fake.calls().filter((call) => call.key === `POST ${R}/issues/${number}/labels`).flatMap((call) => JSON.parse(call.stdin).labels)
const removed = (number) => fake.calls().filter((call) => call.key.startsWith(`DELETE ${R}/issues/${number}/labels/`)).map((call) => decodeURIComponent(call.key.split('/labels/')[1]))

beforeEach(() => fake.clearCalls())

test('merge takes the commit the acceptance comment names, and refuses a different one', () => {
  const repo = repository()
  const sha = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] } }, comments: { 2: [STARTED, accepted(sha)] }, closesOrReopens: [2] })
  const wrong = flow(repo.work, ['merge', '2', '--sha', 'a'.repeat(40)])
  assert.equal(wrong.status, 1)
  assert.match(wrong.stderr, /#2 was accepted at [0-9a-f]{12}, not at aaaaaaaaaaaa; only the commit the acceptance comment names is merged/)
  assert.equal(git(repo.remote, 'rev-parse', 'epic/trip-export'), git(repo.remote, 'rev-parse', 'main'))
  const right = flow(repo.work, ['merge', '2', '--sha', sha.slice(0, 12)])
  assert.equal(right.status, 0, right.stderr)
  const head = git(repo.remote, 'rev-parse', 'epic/trip-export')
  assert.equal(git(repo.remote, 'rev-parse', `${head}^2`), sha)
  assert.deepEqual(added(2), ['flow:done'])
  assert.match(posted(2)[0], new RegExp(`^<!-- flow:merged sha=${head} accepted=${sha} -->`))
  const closes = fake.calls().filter((call) => call.key === `PATCH ${R}/issues/2`)
  assert.deepEqual(closes.map((call) => JSON.parse(call.stdin)), [{ state: 'closed', state_reason: 'completed' }], 'a done ticket is closed, so the board counts it')
  const keys = fake.calls().map((call) => call.key)
  assert.ok(keys.indexOf(`POST ${R}/issues/2/labels`) < keys.indexOf(`PATCH ${R}/issues/2`), 'the close follows the label')
})

test('merge still finishes when GitHub refuses to close the ticket, and says how to close it', () => {
  const repo = repository()
  const sha = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] } }, comments: { 2: [STARTED, accepted(sha)] }, extra: { [`PATCH ${R}/issues/2`]: { $exit: 1, $stderr: 'gh: Resource not accessible by integration (HTTP 403)' } } })
  const result = flow(repo.work, ['merge', '2'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /^#2 is done but still open, because GitHub refused to close it \(.*HTTP 403.*\); close it by hand as completed/m)
  assert.match(posted(2)[0], /^<!-- flow:merged /)
})

test('merge --epic merges every accepted ticket in the order the epic lists them, and skips the rest', () => {
  const repo = repository()
  const two = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
  const three = ticketBranch(repo, 3, { 'export.txt': 'e\n' })
  world({
    tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] }, 3: { labels: ['flow:ticket', 'flow:in-review'] }, 4: { labels: ['flow:ticket', 'flow:in-progress'] } },
    comments: { 2: [STARTED, accepted(two)], 3: [STARTED, accepted(three)], 4: [STARTED] },
    closesOrReopens: [2, 3],
  })
  const result = flow(repo.work, ['merge', '--epic', '1'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).merged.map((entry) => entry.ticket), [2, 3])
  const head = git(repo.remote, 'rev-parse', 'epic/trip-export')
  assert.deepEqual(git(repo.remote, 'log', '--merges', '--format=%s', head).split('\n'), ['Merge #3: Export file', 'Merge #2: Export button'])
  assert.deepEqual(posted(4), [])
})

test('merge --epic names a ticket accepted under another account in notMerged instead of skipping it silently', () => {
  const repo = repository()
  const two = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
  const three = ticketBranch(repo, 3, { 'export.txt': 'e\n' })
  const elsewhere = { ...accepted(three), user: { login: 'vadim' } }
  world({
    tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] }, 3: { labels: ['flow:ticket', 'flow:in-review'] } },
    comments: { 2: [STARTED, accepted(two)], 3: [STARTED, elsewhere] },
    closesOrReopens: [2],
  })
  const result = flow(repo.work, ['merge', '--epic', '1'])
  assert.equal(result.status, 1)
  const outcome = JSON.parse(result.stdout)
  assert.deepEqual(outcome.merged.map((entry) => entry.ticket), [2])
  assert.equal(outcome.notMerged.length, 1)
  assert.equal(outcome.notMerged[0].ticket, 3)
  assert.match(outcome.notMerged[0].reason, /#3 passed acceptance under @vadim, not under flow-bot, the account running this/)
  assert.deepEqual(posted(3), [])
})

test('merge refuses a ticket of an incremental epic: that ticket has its own pull request', () => {
  const repo = repository()
  const sha = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
  world({ epic: { settings: 'Delivery: incremental' }, tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] } }, comments: { 2: [accepted(sha)] } })
  const result = flow(repo.work, ['merge', '2'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /delivered by its own pull request/)
})

test('reset puts a ticket whose run died back to planned, keeps its branch, and says so', () => {
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:in-progress', 'tier:easy'] } }, comments: { 2: [STARTED] } })
  const result = flow(directory, ['reset', '2'], { FLOW_UNATTENDED: '1' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { ticket: 2, action: 'reset', resets: 1 })
  assert.deepEqual(added(2), ['flow:planned'])
  assert.deepEqual(removed(2), ['flow:in-progress'])
  assert.match(posted(2)[0], /^<!-- flow:reset -->\n\*\*Reset\*\* by an unattended run: .* `ticket\/2` keeps its commits/)
})

test('reset --once asks a person when the ticket was reset before, and reset refuses a ticket that is not in progress', () => {
  const earlierReset = comment('<!-- flow:reset -->\n**Reset**')
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:in-progress'], assignees: ['ana'] } }, comments: { 2: [STARTED, earlierReset, STARTED] } })
  const result = flow(directory, ['reset', '2', '--once'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).action, 'needs-human')
  assert.deepEqual(added(2), ['flow:needs-human'])
  assert.match(posted(2)[0], /^<!-- flow:needs-human -->\n\*\*This ticket needs a person\.\*\* @ana The run working on this ticket stopped without a result, and it already had once before/)
  fake.clearCalls()
  world()
  const planned = flow(directory, ['reset', '2'])
  assert.equal(planned.status, 1)
  assert.match(planned.stderr, /#2 is planned; only a ticket left in progress or in review can be reset/)
  assert.deepEqual(posted(2), [])
  fake.clearCalls()
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:done'] } } })
  const done = flow(directory, ['reset', '2'])
  assert.equal(done.status, 1)
  assert.match(done.stderr, /#2 is done; only a ticket left in progress or in review can be reset/)
  assert.ok(!fake.calls().some((call) => !call.key.startsWith('GET') && call.key !== 'graphql'), 'a done ticket is neither relabelled nor reopened')
})

test('start takes the flow:start label off when it starts the ticket', () => {
  const repo = repository()
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:planned', 'flow:start'] } } })
  const result = flow(repo.work, ['start', '2'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(removed(2), ['flow:planned', 'flow:start'])
})

test('check-epic runs the checks of the done tickets at the epic head in a clean copy, posts the result on the epic, and --mark asks a person about the failing one', () => {
  const repo = repository()
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, 'button.txt', 'b\n', '#2: the button')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  git(repo.work, 'checkout', '-q', 'main')
  writeFileSync(join(repo.work, 'export.txt'), 'only in the main checkout\n')
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:done'], assignees: ['ana'] } } })
  const result = flow(repo.work, ['check-epic', '1', '--mark'])
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.head, git(repo.remote, 'rev-parse', 'epic/trip-export'))
  assert.deepEqual(report.tickets.map((ticket) => [ticket.ticket, ticket.allPassed]), [[2, true], [3, false]], 'the main checkout\'s files do not count')
  assert.match(posted(1)[0], new RegExp(`^<!-- flow:release-check head=${report.head} passed=false all=true -->\n\\*\\*Epic check\\*\\* at`))
  assert.match(posted(1)[0], /\*\*Epic check\*\* at `[0-9a-f]{12}` of `epic\/trip-export`: 1 of 2 ticket\(s\) still pass their checks\./)
  assert.match(posted(1)[0], /\| #3 Export file \| 0 of 1 \| FAIL: `test -f export\.txt` \(exit 1\) \|/)
  assert.deepEqual(added(3), ['flow:needs-human'])
  assert.match(posted(3)[0], /@ana This ticket's checks fail on the epic branch `epic\/trip-export` .* It stays merged/)
  assert.deepEqual(posted(2), [])
  assert.equal(git(repo.work, 'worktree', 'list').split('\n').length, 1, 'the clean copy is removed')
})

test('a check failing at the epic head says why: the evidence in the table and the JSON, and the end of its output in the hand-off to a person', () => {
  const repo = repository()
  world({
    tickets: {
      2: { labels: ['flow:ticket', 'flow:done'], criteria: "- the end-to-end suite\n  CHECK: for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25; do echo \"line $n\"; done; echo 'Error: port 3000 is already in use (``` fenced)' >&2; exit 7" },
      3: { labels: ['flow:ticket', 'flow:done'], criteria: '- prints yes\n  CHECK: echo no\n  EXPECT: yes' },
    },
  })
  const result = flow(repo.work, ['check-epic', '1', '--mark'])
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.match(report.tickets[0].failures, /^`for n in .*` \(exit 7 — line 24 \/ line 25 \/ Error: port 3000 is already in use \(``` fenced\)\)$/)
  assert.equal(report.tickets[1].failures, '`echo no` (exit 0, but the output does not contain "yes")')
  assert.equal(report.tickets[0].failedChecks[0].tail.split('\n').length, 20)
  const table = posted(1)[0].split('\n').filter((line) => line.startsWith('| #'))
  assert.equal(table.length, 2, 'each cell stays one line')
  assert.match(table[0], /FAIL: `for n in .*` \(exit 7 — line 24 \/ line 25 \/ Error: port 3000 is already in use/)
  assert.doesNotMatch(posted(1)[0], /line 6\b/, 'the table carries the evidence, not the tail')
  const handOff = posted(2)[0]
  assert.match(handOff, /after it was merged: `for n in .*` \(exit 7 — line 24 \/ line 25 \/ Error: port 3000 is already in use \(``` fenced\)\)\. It stays merged; whether it needs a fix ticket is a person's call\.\n\n`for n in .*`, the end of its output:\n\n````text\nline 7\n/)
  assert.match(handOff, /line 25\nError: port 3000 is already in use \(``` fenced\)\n````$/)
  assert.doesNotMatch(handOff, /line 6\n/, 'twenty lines, no more')
  assert.match(posted(3)[0], /the output does not contain "yes"\)\. It stays merged; whether it needs a fix ticket is a person's call\.\n\n`echo no`, the end of its output:\n\n```text\nno\n```$/)
})

test('check-epic --mark reopens a failing ticket that was closed as done, and says so on it', () => {
  const repo = repository()
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, 'button.txt', 'b\n', '#2: the button')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  git(repo.work, 'checkout', '-q', 'main')
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:done'], state: 'closed' }, 3: { labels: ['flow:ticket', 'flow:done'], state: 'closed' } }, closesOrReopens: [3] })
  const result = flow(repo.work, ['check-epic', '1', '--mark'])
  assert.equal(result.status, 1)
  assert.deepEqual(added(3), ['flow:needs-human'])
  assert.deepEqual(fake.calls().filter((call) => call.key.startsWith('PATCH')).map((call) => [call.key, JSON.parse(call.stdin)]), [[`PATCH ${R}/issues/3`, { state: 'open' }]])
  assert.match(posted(3)[0], /It stays merged; .* It was closed as done and is open again, since a closed ticket carries no work\.$/)
})

test('check-epic --tickets judges only the tickets named, and passes with nothing marked', () => {
  const repo = repository()
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, 'button.txt', 'b\n', '#2: the button')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:done'] } } })
  const result = flow(repo.work, ['check-epic', '1', '--tickets', '2', '--mark'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).tickets.map((ticket) => ticket.ticket), [2])
  assert.match(posted(1)[0], /^<!-- flow:release-check head=[0-9a-f]{40} passed=true all=false -->\n/, 'a check of some tickets says so, so it cannot open the release')
  assert.deepEqual(added(2), [])
  assert.equal(flow(repo.work, ['check-epic', '1', '--tickets', '9']).status, 2)
})

test('check-epic runs the .flow.json setup in the clean copy first, and a setup that fails judges nothing and marks nobody', () => {
  const repo = repository()
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, '.gitignore', 'export.txt\n.env\n', 'ignore the generated file')
  commitFile(repo.work, '.flow.json', JSON.stringify({ setup: ['echo made > export.txt'] }), 'say how a copy is set up')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  world({ tickets: { 3: { labels: ['flow:ticket', 'flow:done'] } } })
  const ok = flow(repo.work, ['check-epic', '1', '--mark'])
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  commitFile(repo.work, '.flow.json', JSON.stringify({ copy: ['.env'], setup: ['echo made > export.txt'] }), 'copy a file this machine lacks')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  fake.clearCalls()
  const failed = flow(repo.work, ['check-epic', '1', '--mark'])
  assert.equal(failed.status, 1)
  const report = JSON.parse(failed.stdout)
  assert.match(report.setupFailure, /^copy \.env: .* is not a file in the main checkout/)
  assert.deepEqual(report.tickets, [])
  assert.match(posted(1)[0], /\*\*The epic check could not run\*\*/)
  assert.deepEqual(added(3), [])
})

test('worktree makes a set-up copy for one ticket beside the repository, and removes it', () => {
  const repo = repository()
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, '.gitignore', '.env\n', 'ignore secrets')
  commitFile(repo.work, '.flow.json', JSON.stringify({ copy: ['.env'], setup: ['echo installed > installed.txt'] }), 'setup')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  git(repo.work, 'checkout', '-q', 'main')
  writeFileSync(join(repo.work, '.env'), 'SECRET=1\n')
  world()
  const made = flow(repo.work, ['worktree', '2'])
  assert.equal(made.status, 0, made.stderr + made.stdout)
  const result = JSON.parse(made.stdout)
  assert.equal(result.path, join(repo.root, '.flow-worktrees', 'work', 'ticket-2'))
  assert.equal(result.base, 'epic/trip-export')
  assert.equal(readFileSync(join(result.path, '.env'), 'utf8'), 'SECRET=1\n')
  assert.equal(readFileSync(join(result.path, 'installed.txt'), 'utf8'), 'installed\n')
  const gone = flow(repo.work, ['worktree', '2', '--remove'])
  assert.equal(gone.status, 0)
  assert.ok(!existsSync(result.path))
})

test('worktree reports a setup that fails, and leaves no half set-up copy behind', () => {
  const repo = repository()
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, '.flow.json', JSON.stringify({ setup: ['echo the registry is down >&2; exit 3'] }), 'setup')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  world()
  const made = flow(repo.work, ['worktree', '2'])
  assert.equal(made.status, 1)
  const result = JSON.parse(made.stdout)
  assert.match(result.failure.detail, /exited 3\n[\s\S]*the registry is down/)
  assert.ok(!existsSync(result.path))
})

test('release-pr refuses while a ticket is not done', () => {
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:needs-human'] }, 4: { labels: ['flow:ticket', 'flow:done'] } } })
  const result = flow(repository().work, ['release-pr', '1'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /not every ticket of epic #1 is done \(#3 needs-human\)/)
  assert.ok(!fake.calls().some((call) => call.key === `POST ${R}/pulls`))
})

test('release-pr opens the epic\'s one pull request with its outcome, walkthrough, merge commits and cost over every run, and posts it on the epic', () => {
  const meter = (input) => comment(`<!-- flow:meter -->\n**Cost of #n**\n\n\`\`\`json\n${JSON.stringify({ flowMeter: 1, ticket: 2, roles: {}, models: {}, total: { input, output: 10, cacheCreation: 5, cacheReads: 100 } })}\n\`\`\``)
  const mergedMarker = (sha) => comment(`<!-- flow:merged sha=${sha} accepted=${'b'.repeat(40)} -->\n**Done.**`)
  const repo = repository()
  world({
    tickets: { 2: { labels: ['flow:ticket', 'flow:done'], state: 'closed' }, 3: { labels: ['flow:ticket', 'flow:done'], state: 'closed' }, 4: { labels: ['flow:ticket', 'flow:done'] } },
    comments: { 1: [epicCheck(epicHead(repo))], 2: [mergedMarker('1'.repeat(40)), meter(1000), meter(1000), meter(500)], 3: [mergedMarker('2'.repeat(40)), meter(2500)], 4: [] },
    extra: {
      [`GET ${R}/pulls?head=o%3Aepic%2Ftrip-export&state=open&per_page=100`]: [],
      [`POST ${R}/pulls`]: { number: 40, html_url: 'https://github.com/o/r/pull/40', head: { ref: 'epic/trip-export', sha: 'c'.repeat(40) }, base: { ref: 'main' } },
    },
  })
  const result = flow(repo.work, ['release-pr', '1'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { epic: 1, pullRequest: 40, url: 'https://github.com/o/r/pull/40', base: 'main', existing: false })
  const request = JSON.parse(fake.calls().find((call) => call.key === `POST ${R}/pulls`).stdin)
  assert.deepEqual([request.title, request.head, request.base], ['Trip export', 'epic/trip-export', 'main'])
  assert.match(request.body, /^Epic: #1\n\n## Outcome\n\nTravellers can export a trip\.\n\n## Walkthrough\n\nA traveller opens a trip/)
  assert.match(request.body, /\| #2 Export button \| `111111111111` \|\n\| #3 Export file \| `222222222222` \|\n\| #4 Export name \| not recorded \|/)
  assert.match(request.body, /Over 2 of 3 ticket\(s\) with a cost comment: 4,000 input, 30 output, 15 cache writes and 300 cache reads/, 'a cost comment posted twice counts once; a second run of a ticket adds')
  assert.match(request.body, /Closes #2\nCloses #3\nCloses #4\nCloses #1\n\nA person reviews and merges this pull request\. After a person merges into the default branch, no code work runs: what runs is the GitHub Action's `board` job, which closes `flow:done` tickets left open and writes the project board \(Status, Release, figures\), and the report page's rebuild, which only reads\./)
  assert.match(posted(1)[0], /^<!-- flow:release-pr number=40 -->\n\*\*Release pull request opened:\*\* https:\/\/github\.com\/o\/r\/pull\/40/)
})

test('release-pr reuses a release pull request that is already open', () => {
  const repo = repository()
  world({
    tickets: { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:done'] }, 4: { labels: ['flow:ticket', 'flow:done'] } },
    comments: { 1: [epicCheck(epicHead(repo))] },
    extra: { [`GET ${R}/pulls?head=o%3Aepic%2Ftrip-export&state=open&per_page=100`]: [{ number: 40, html_url: 'https://github.com/o/r/pull/40', head: { ref: 'epic/trip-export', sha: 'c' }, base: { ref: 'main' } }] },
  })
  const result = flow(repo.work, ['release-pr', '1'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).existing, true)
  assert.ok(!fake.calls().some((call) => call.key === `POST ${R}/pulls`))
  assert.match(posted(1)[0], /already open/)
})

test('release-pr opens only at a head the latest epic check from this account passed for every done ticket, and names check-epic as the way on', () => {
  const repo = repository()
  const done = { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:done'] }, 4: { labels: ['flow:ticket', 'flow:done'] } }
  const OPEN_PULLS = `GET ${R}/pulls?head=o%3Aepic%2Ftrip-export&state=open&per_page=100`
  const created = { [OPEN_PULLS]: [], [`POST ${R}/pulls`]: { number: 40, html_url: 'https://github.com/o/r/pull/40', head: { ref: 'epic/trip-export', sha: 'c'.repeat(40) }, base: { ref: 'main' } } }
  const attempt = (comments, extra = created) => {
    fake.clearCalls()
    world({ tickets: done, comments: { 1: comments }, extra })
    return flow(repo.work, ['release-pr', '1'])
  }
  const head = epicHead(repo)
  const older = 'a'.repeat(40)
  for (const [comments, why] of [
    [[], /^epic #1 has no epic check posted by this account; run `flow check-epic 1` first/],
    [[epicCheck(head, { author: 'someone-else' })], /^epic #1 has no epic check posted by this account/],
    [[epicCheck(older)], /^the latest epic check is of `aaaaaaaaaaaa`, not of the head of origin\/epic\/trip-export \(`[0-9a-f]{12}`\); run `flow check-epic 1` first/],
    [[epicCheck(head), epicCheck(older)], /^the latest epic check is of `aaaaaaaaaaaa`/],
    [[epicCheck(head, { passed: false })], /^the latest epic check, at `[0-9a-f]{12}`, did not pass; fix what it names, then run `flow check-epic 1` first/],
    [[epicCheck(head, { all: false })], /^the latest epic check, at `[0-9a-f]{12}`, judged only the tickets it was given; run `flow check-epic 1` first/],
    [[comment('<!-- flow:release-check -->\n**Epic check** at an older version')], /^epic #1 has no epic check posted by this account/],
  ]) {
    const refused = attempt(comments)
    assert.equal(refused.status, 1, refused.stderr)
    assert.match(refused.stderr, why)
    assert.ok(!fake.calls().some((call) => call.key === `POST ${R}/pulls` || call.key === `POST ${R}/issues/1/comments`), refused.stderr)
  }
  const reused = attempt([], { [OPEN_PULLS]: [{ number: 40, html_url: 'https://github.com/o/r/pull/40', head: { ref: 'epic/trip-export', sha: 'c' }, base: { ref: 'main' } }] })
  assert.equal(reused.status, 1, 'reusing an open pull request goes through the same gate')
  assert.deepEqual(posted(1), [])
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, 'late.txt', 'after the check\n', 'a commit after the check')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  git(repo.work, 'checkout', '-q', 'main')
  const moved = attempt([epicCheck(head)])
  assert.equal(moved.status, 1)
  assert.match(moved.stderr, new RegExp(`is of \`${head.slice(0, 12)}\`, not of the head`), 'the branch moved after the check, and the gate reads origin, not the check')
  const opened = attempt([epicCheck(head), epicCheck(epicHead(repo))])
  assert.equal(opened.status, 0, opened.stderr)
  assert.equal(JSON.parse(opened.stdout).pullRequest, 40)
  assert.equal(flow(directory, ['release-pr', '1']).status, 2, 'it needs a repository to read the epic head from')
})

test('worktree replaces a copy an earlier attempt left behind, and says how long it ran, against the setup budget when it failed', () => {
  const repo = repository()
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, '.flow.json', JSON.stringify({ setup: ['echo installed > installed.txt'] }), 'setup')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  git(repo.work, 'checkout', '-q', 'main')
  world()
  const first = JSON.parse(flow(repo.work, ['worktree', '2']).stdout)
  assert.equal(first.replaced, false)
  assert.ok(Number.isInteger(first.elapsedSeconds), JSON.stringify(first))
  assert.equal(first.budgetSeconds, undefined, 'a budget is named only beside a failure')
  writeFileSync(join(first.path, 'half-made.txt'), 'left by a setup that was killed\n')
  const again = flow(repo.work, ['worktree', '2'])
  assert.equal(again.status, 0, again.stderr + again.stdout)
  const replaced = JSON.parse(again.stdout)
  assert.equal(replaced.replaced, true)
  assert.ok(!existsSync(join(replaced.path, 'half-made.txt')), 'nothing of the earlier attempt is kept')
  assert.equal(readFileSync(join(replaced.path, 'installed.txt'), 'utf8'), 'installed\n')
  assert.equal(git(repo.work, 'worktree', 'list').split('\n').length, 2, 'one copy, registered once')
  git(repo.work, 'checkout', '-q', 'epic/trip-export')
  commitFile(repo.work, '.flow.json', JSON.stringify({ setup: ['exit 3'] }), 'a setup that fails')
  git(repo.work, 'push', '-q', 'origin', 'HEAD:epic/trip-export')
  git(repo.work, 'checkout', '-q', 'main')
  const failed = flow(repo.work, ['worktree', '2'])
  assert.equal(failed.status, 1)
  const failure = JSON.parse(failed.stdout)
  assert.deepEqual([failure.replaced, failure.budgetSeconds, Number.isInteger(failure.elapsedSeconds)], [true, 480, true])
  assert.ok(!existsSync(failure.path))
})

test('design-map writes the epic\'s map for the comparison, and names a missing or broken one', () => {
  const map = { landmarks: [{ name: 'hero', design: '.hero', page: '[data-hero]', source: 'designs/trip.html' }], removed: [] }
  world({ epic: { extra: `\n## Design map\n\n\`\`\`design-map\n${JSON.stringify(map, null, 2)}\n\`\`\`\n` } })
  const out = join(directory, 'map.json')
  const written = flow(directory, ['design-map', '1', '--out', out])
  assert.equal(written.status, 0, written.stderr)
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), map)
  world()
  const missing = flow(directory, ['design-map', '1'])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /epic #1 has no ```design-map block/)
  world({ epic: { extra: '\n```design-map\n{ "landmarks": [ { "name": "hero" } ] }\n```\n' } })
  const broken = flow(directory, ['design-map', '1'])
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /the design comparison cannot read the design map: .*has no "design"/)
})

test('dispatch asks for up to Parallel: tickets, counting those already running or asked, and says when the epic is built or stopped', () => {
  world()
  const first = flow(directory, ['dispatch', '1'])
  assert.equal(first.status, 0, first.stderr)
  assert.deepEqual(JSON.parse(first.stdout).started, [2, 3])
  assert.deepEqual([added(2), added(3), added(4)], [['flow:start'], ['flow:start'], []])
  fake.clearCalls()
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:in-progress'] }, 3: { labels: ['flow:ticket', 'flow:planned', 'flow:start'] } } })
  const busy = JSON.parse(flow(directory, ['dispatch', '1']).stdout)
  assert.deepEqual([busy.started, busy.alreadyAsked, busy.state], [[], [3], 'running'])
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:done'] }, 4: { labels: ['flow:ticket', 'flow:done'] } } })
  assert.equal(JSON.parse(flow(directory, ['dispatch', '1']).stdout).state, 'built')
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:needs-human'] }, 3: { labels: ['flow:ticket', 'flow:done'] } } })
  const stopped = JSON.parse(flow(directory, ['dispatch', '1']).stdout)
  assert.deepEqual([stopped.state, stopped.needsHuman], ['stopped', [2]])
  world({ epicLabels: ['flow:epic'] })
  assert.equal(flow(directory, ['dispatch', '1']).status, 1)
})

test('meter --workflow reads one ticket\'s agents out of a workflow run', () => {
  const run = join(directory, 'wf_meter')
  mkdirSync(run, { recursive: true })
  writeFileSync(join(run, 'journal.jsonl'), `${JSON.stringify({ type: 'started', agentId: 'w', label: 'worker:#2' })}\n`)
  writeFileSync(join(run, 'agent-w.jsonl'), `${JSON.stringify({ type: 'assistant', timestamp: '2026-10-15T09:00:00Z', message: { id: 'm', model: 'claude-sonnet-5', usage: { input_tokens: 7, output_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } })}\n`)
  const result = flow(directory, ['meter', '2', '--workflow', run, '--print'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\| worker \| claude-sonnet-5 \| unknown \| 7 \| 3 \|/)
  assert.equal(flow(directory, ['meter', '3', '--workflow', run, '--print']).status, 1)
})

test('reset refuses a ticket that passed acceptance after its start: it is waiting to be merged, not abandoned', () => {
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] } }, comments: { 2: [STARTED, accepted('c'.repeat(40))] } })
  const result = flow(directory, ['reset', '2', '--once'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /passed acceptance at cccccccccccc and is waiting to be merged/)
  assert.deepEqual([added(2), posted(2)], [[], []])
})

test('merge --epic on an incremental epic merges nothing and is not an error', () => {
  const repo = repository()
  world({ epic: { settings: 'Delivery: incremental' } })
  const result = flow(repo.work, ['merge', '--epic', '1'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).merged, [])
})

test('unattended, merge --epic under an unusable Branch: says so once on the epic and hands no ticket to a person', () => {
  const repo = repository()
  const two = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
  const three = ticketBranch(repo, 3, { 'export.txt': 'e\n' })
  world({
    epic: { settings: 'Delivery: release\nBranch: main' },
    tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] }, 3: { labels: ['flow:ticket', 'flow:in-review'] } },
    comments: { 2: [STARTED, accepted(two)], 3: [STARTED, accepted(three)] },
  })
  const result = flow(repo.work, ['merge', '--epic', '1'], { FLOW_UNATTENDED: '1' })
  assert.equal(result.status, 1)
  assert.equal(posted(1).length, 1)
  assert.match(posted(1)[0], /^\*\*Nothing was merged\.\*\* .*"Branch: main"/)
  assert.deepEqual([...posted(2), ...posted(3), ...added(2), ...added(3)], [])
})

test('post --file - reads the comment from standard input', () => {
  world()
  const result = spawnSync(process.execPath, [FLOW, 'post', '1', '--file', '-'], { cwd: directory, input: '**Wave 1:** #2 on sonnet.\n', encoding: 'utf8', env: { ...process.env, ...fake.env } })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(posted(1), ['**Wave 1:** #2 on sonnet.\n'])
})

test('a ticket handed to a person loses flow:start, so starting it again later is a fresh request', () => {
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:planned', 'flow:start'] } } })
  const result = flow(directory, ['needs-human', '2', '--text', 'the ticket contradicts the code'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(removed(2), ['flow:planned', 'flow:start'])
})

test('an epic whose Branch: is the default branch or not under epic/ is refused at every door that pushes or judges, and origin/main never moves', () => {
  for (const branch of ['main', 'feature/x']) {
    const repo = repository()
    const sha = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
    const mainBefore = git(repo.remote, 'rev-parse', 'main')
    world({ epic: { settings: `Delivery: release\nBranch: ${branch}\nParallel: 2` }, tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] }, 3: { labels: ['flow:ticket', 'flow:done'] } }, comments: { 2: [STARTED, accepted(sha)] } })
    const refusal = new RegExp(`"Branch: ${branch.replace('/', '\\/')}" is not an epic branch`)
    for (const args of [['merge', '2'], ['merge', '2', '--sha', sha], ['merge', '--epic', '1'], ['deliver', '2'], ['check-epic', '1'], ['release-pr', '1'], ['dispatch', '1'], ['worktree', '3']]) {
      const result = flow(repo.work, args)
      assert.notEqual(result.status, 0, `${branch}: ${args.join(' ')}`)
      assert.match(`${result.stderr}${result.stdout}`, refusal, `${branch}: ${args.join(' ')}`)
    }
    world({ epic: { settings: `Delivery: release\nBranch: ${branch}` } })
    const start = flow(repo.work, ['start', '3'])
    assert.equal(start.status, 1)
    assert.equal(git(repo.remote, 'rev-parse', 'main'), mainBefore)
    assert.ok(!fake.calls().some((call) => call.key === `POST ${R}/pulls`))
    const next = JSON.parse(flow(repo.work, ['next', '1']).stdout)
    assert.ok(next.problems.some((problem) => refusal.test(problem)), 'next shows it')
    assert.deepEqual(next.ready, [])
  }
})

test('reset on a planned ticket whose start request never started takes flow:start off and says why; a second time it asks a person', () => {
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:planned', 'flow:start'] } } })
  const first = flow(directory, ['reset', '2', '--once'])
  assert.equal(first.status, 0, first.stderr)
  assert.equal(JSON.parse(first.stdout).action, 'unstarted')
  assert.deepEqual(removed(2), ['flow:start'])
  assert.match(posted(2)[0], /^<!-- flow:start-withdrawn -->\n\*\*Start request withdrawn\.\*\*/)
  fake.clearCalls()
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:planned', 'flow:start'] } }, comments: { 2: [comment('<!-- flow:start-withdrawn -->\n**Start request withdrawn.**')] } })
  const second = flow(directory, ['reset', '2', '--once'])
  assert.equal(JSON.parse(second.stdout).action, 'needs-human')
  assert.deepEqual(added(2), ['flow:needs-human'])
})

test('reset answers a refusal in JSON too, naming the accepted commit when that is why', () => {
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] } }, comments: { 2: [STARTED, accepted('c'.repeat(40))] } })
  const accepted2 = flow(directory, ['reset', '2', '--once'])
  assert.equal(accepted2.status, 1)
  assert.deepEqual(JSON.parse(accepted2.stdout), { ticket: 2, action: 'refused', state: 'in-review', reason: JSON.parse(accepted2.stdout).reason, accepted: 'c'.repeat(40) })
  world()
  const planned = JSON.parse(flow(directory, ['reset', '2']).stdout)
  assert.equal(planned.accepted, null)
  assert.equal(planned.state, 'planned', 'a run that died before the ticket started has nothing to undo, and can tell')
})

test('dispatch refuses while a local run is building the epic, and says how to end a run that is gone', () => {
  world({ comments: { 1: [comment('<!-- flow:local-run -->\n**Wave 1:** #2 on sonnet.')] } })
  const live = flow(directory, ['dispatch', '1'])
  assert.equal(live.status, 1)
  assert.match(live.stderr, /being built by a \/flow:run .* post a comment that starts with <!-- flow:local-run-end -->/)
  assert.deepEqual(added(2), [])
  world({ comments: { 1: [comment('<!-- flow:local-run -->\n**Wave 1:**'), comment('<!-- flow:local-run-end -->\n**Run stopped.**')] } })
  assert.equal(flow(directory, ['dispatch', '1']).status, 0)
  world({ comments: { 1: [{ ...comment('<!-- flow:local-run -->\n**Wave 1:**'), user: { login: 'vadim' } }] } })
  assert.equal(flow(directory, ['dispatch', '1']).status, 1, 'a person\'s local run posts as that person, and the Action under FLOW_TOKEN must still see it')
  world({ comments: { 1: [{ ...comment('<!-- flow:local-run -->\n**Wave 1:**'), user: { login: 'vadim' } }, { ...comment('<!-- flow:local-run-end -->\nThat run is gone.'), user: { login: 'ana' } }] } })
  assert.equal(flow(directory, ['dispatch', '1']).status, 0, 'anyone can clear the mark')
  world({ comments: { 1: [comment('> <!-- flow:local-run -->\n> quoted')] } })
  assert.equal(flow(directory, ['dispatch', '1']).status, 0, 'only a mark at the start of a comment counts')
})

test('the git step itself refuses to merge into a branch outside epic/, whatever a caller passes', async () => {
  const { mergeIntoEpic } = await import('./delivery.mjs')
  const repo = repository()
  const sha = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
  const before = git(repo.remote, 'rev-parse', 'main')
  const result = mergeIntoEpic(repo.work, { sha, epicBranch: 'main', subject: 'Merge #2' })
  assert.deepEqual([result.ok, result.kind], [false, 'not-an-epic-branch'])
  assert.equal(git(repo.remote, 'rev-parse', 'main'), before)
})

const finding = (number, { approved = false, body = '## What happened\n\nThe button does nothing.\n' } = {}) =>
  issue(number, { title: `finding ${number}`, body, labels: ['flow:found', ...(approved ? ['flow:approved'] : [])], author: 'reporter' })

test('create-finding --screenshots commits the images to the orphan flow-findings branch, pushes it and links each by commit, leaving the checkout alone', () => {
  const repo = repository()
  const shots = join(repo.root, 'shots')
  mkdirSync(shots)
  writeFileSync(join(shots, 'cart page.png'), 'png bytes')
  writeFileSync(join(shots, 'menu.webp'), 'webp bytes')
  writeFileSync(join(shots, '.DS_Store'), 'ignored')
  const body = join(repo.root, 'finding.md')
  writeFileSync(body, '## What happened\n\nThe cart is empty.\n')
  const head = git(repo.work, 'rev-parse', 'HEAD')
  const fixtures = (number) => ({
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true },
    [`POST ${R}/issues`]: finding(number),
    [`PATCH ${R}/issues/${number}`]: finding(number),
  })
  fake.setFixtures(fixtures(95))
  const first = flow(repo.work, ['create-finding', '--title', 'Empty cart', '--file', body, '--screenshots', shots])
  assert.equal(first.status, 0, first.stderr)
  assert.equal(first.stdout.trim(), '95')
  const tip = git(repo.remote, 'rev-parse', 'flow-findings')
  assert.equal(git(repo.remote, 'rev-list', '--count', 'flow-findings'), '1', 'an orphan branch: nothing of the code rides along')
  assert.deepEqual(git(repo.remote, 'ls-tree', '-r', '--name-only', 'flow-findings').split('\n'), ['README.md', 'findings/95/cart page.png', 'findings/95/menu.webp'])
  assert.match(git(repo.remote, 'show', 'flow-findings:README.md'), /holds only the screenshots of Flow findings/)
  assert.equal(git(repo.remote, 'show', 'flow-findings:findings/95/cart page.png'), 'png bytes')
  const patched = JSON.parse(fake.calls().find((call) => call.key === `PATCH ${R}/issues/95`).stdin).body
  assert.equal(
    patched,
    `## What happened\n\nThe cart is empty.\n\n## Screenshots\n\n1. ![cart page.png](https://github.com/o/r/blob/${tip}/findings/95/cart%20page.png?raw=true)\n2. ![menu.webp](https://github.com/o/r/blob/${tip}/findings/95/menu.webp?raw=true)\n`,
  )
  assert.deepEqual([git(repo.work, 'rev-parse', 'HEAD'), git(repo.work, 'symbolic-ref', '--short', 'HEAD'), git(repo.work, 'status', '--porcelain')], [head, 'main', ''])
  fake.clearCalls()
  fake.setFixtures(fixtures(96))
  const second = flow(repo.work, ['create-finding', '--title', 'Menu', '--file', body, '--screenshots', shots])
  assert.equal(second.status, 0, second.stderr)
  assert.equal(git(repo.remote, 'rev-parse', 'flow-findings^'), tip, 'the next finding adds a commit on top')
  assert.ok(git(repo.remote, 'ls-tree', '-r', '--name-only', 'flow-findings').split('\n').includes('findings/95/menu.webp'), 'earlier findings keep their images')
  writeFileSync(join(shots, 'notes.txt'), 'not an image')
  fake.clearCalls()
  const refused = flow(repo.work, ['create-finding', '--title', 'x', '--file', body, '--screenshots', shots])
  assert.equal(refused.status, 2)
  assert.match(refused.stderr, /holds notes\.txt, which is not a PNG, JPEG or WebP image/)
  assert.deepEqual(fake.calls(), [], 'nothing is filed before the images are known to be images')
})

test('start refuses a finding without asking a person, even unattended: it is not a ticket yet', () => {
  const repo = repository()
  world({ findings: [finding(7, { approved: true })] })
  const result = flow(repo.work, ['start', '7'], { FLOW_UNATTENDED: '1' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /#7 is a finding \(flow:found\), not a ticket, so nothing starts from it/)
  assert.deepEqual([added(7), posted(7)], [[], []])
})

test('findings under an epic leave the run alone: dispatch still says built, and the release pull request opens without them', () => {
  const done = { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:done'] }, 4: { labels: ['flow:ticket', 'flow:done'] } }
  const repo = repository()
  world({
    tickets: done,
    comments: { 1: [epicCheck(epicHead(repo))] },
    findings: [finding(7, { approved: true }), finding(8)],
    extra: {
      [`GET ${R}/pulls?head=o%3Aepic%2Ftrip-export&state=open&per_page=100`]: [],
      [`POST ${R}/pulls`]: { number: 41, html_url: 'https://github.com/o/r/pull/41', head: { ref: 'epic/trip-export', sha: 'c'.repeat(40) }, base: { ref: 'main' } },
    },
  })
  const dispatched = flow(directory, ['dispatch', '1'])
  assert.equal(dispatched.status, 0, dispatched.stderr)
  assert.deepEqual([JSON.parse(dispatched.stdout).state, JSON.parse(dispatched.stdout).started], ['built', []])
  assert.deepEqual([added(7), added(8)], [[], []])
  const released = flow(repo.work, ['release-pr', '1'])
  assert.equal(released.status, 0, released.stderr)
  const request = JSON.parse(fake.calls().find((call) => call.key === `POST ${R}/pulls`).stdin)
  assert.match(request.body, /Closes #2\nCloses #3\nCloses #4\nCloses #1\n/)
  assert.doesNotMatch(request.body, /#7|#8/, 'a finding is neither shipped nor closed by the release')
  const merged = flow(repository().work, ['merge', '--epic', '1'])
  assert.deepEqual(JSON.parse(merged.stdout), { epic: 1, merged: [], notMerged: [] })
  fake.clearCalls()
  world({ tickets: { ...done, 3: { labels: ['flow:ticket', 'flow:in-progress'] } }, findings: [finding(7)] })
  const refused = flow(repo.work, ['release-pr', '1'])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /not every ticket of epic #1 is done \(#3 in-progress\);/)
})

const STANDING_EPIC = `## Outcome

The site stays correct: what people report gets fixed, one small pull request at a time.

## Settings

Delivery: incremental
Parallel: 1

## Ground rules

- Component tests by default; a browser test only for a whole journey.
- Translations last.
- Every ticket is its own pull request into the default branch.

## Tickets
`

test('a standing epic with no Branch and no tickets is created, waits with "no tickets", and a ticket promoted into it starts from the default branch and opens its own pull request', () => {
  const repo = repository()
  const epicFile = join(repo.root, 'standing.md')
  writeFileSync(epicFile, STANDING_EPIC)
  const bugs = issue(1, { title: 'Bugs', body: STANDING_EPIC, labels: ['flow:epic', 'flow:approved'] })
  const reported = finding(7, { approved: true, body: '## What happened\n\nThe export button does nothing.\n\n## Where\n\nhttps://example.com/trips at 390 wide\n' })
  const base = {
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true },
    graphql: { data: { viewer: { login: 'flow-bot' } } },
    'graphql name={repo} owner={owner}': { data: { repository: { projectsV2: { nodes: [] } } } },
    [`GET ${R}/issues/1`]: bugs,
    [`GET ${R}/issues/1/comments?per_page=100`]: [],
  }
  fake.setFixtures({ ...base, [`POST ${R}/issues`]: issue(1, { title: 'Bugs', body: STANDING_EPIC, labels: ['flow:epic'] }) })
  const created = flow(repo.work, ['create-epic', '--file', epicFile, '--title', 'Bugs'])
  assert.equal(created.status, 0, created.stderr)
  assert.equal(created.stdout.trim(), '1')

  fake.setFixtures({ ...base, [`GET ${R}/issues/1/sub_issues?per_page=100`]: [reported], [`GET ${R}/issues/7`]: reported })
  const empty = flow(repo.work, ['next', '1'])
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /epic #1 has no tickets/)
  const idle = flow(repo.work, ['dispatch', '1'])
  assert.equal(idle.status, 0, idle.stderr)
  assert.equal(JSON.parse(idle.stdout).state, 'empty', 'an approved epic waiting for its first ticket is not a stopped run')

  const draft = join(repo.root, 'ticket.md')
  writeFileSync(draft, '## Scope\n\n- make the export button export\n\n## Not in scope\n\n- the format\n\n## Acceptance criteria\n\n```criteria\n- the export exists\n  CHECK: test -f export.txt\n```\n')
  fake.clearCalls()
  fake.setFixtures({
    ...base,
    [`GET ${R}/issues/1/sub_issues?per_page=100`]: [reported],
    [`GET ${R}/issues/7`]: reported,
    [`GET ${R}/issues/7/parent`]: bugs,
    [`PATCH ${R}/issues/7`]: reported,
    [`PUT ${R}/issues/7/labels`]: [],
    [`PATCH ${R}/issues/1`]: bugs,
  })
  const promoted = flow(repo.work, ['promote', '7', '--file', draft, '--tier', 'easy', '--epic', '1'])
  assert.equal(promoted.status, 0, promoted.stderr)
  const body = JSON.parse(fake.calls().find((call) => call.key === `PATCH ${R}/issues/7`).stdin).body
  const labels = JSON.parse(fake.calls().find((call) => call.key === `PUT ${R}/issues/7/labels`).stdin).labels
  assert.deepEqual(labels, ['flow:ticket', 'flow:planned', 'tier:easy'])
  assert.match(JSON.parse(fake.calls().find((call) => call.key === `PATCH ${R}/issues/1`).stdin).body, /## Tickets\n\n- \[ \] #7 — finding 7/)

  const ticketIssue = issue(7, { title: 'finding 7', body, labels })
  const listed = issue(1, { title: 'Bugs', body: `${STANDING_EPIC}\n- [ ] #7 — finding 7\n`, labels: ['flow:epic', 'flow:approved'] })
  const asTicket = (extra) => ({
    ...base,
    [`GET ${R}/issues/1`]: listed,
    [`GET ${R}/issues/1/sub_issues?per_page=100`]: [ticketIssue],
    [`GET ${R}/issues/7`]: ticketIssue,
    [`POST ${R}/issues/7/labels`]: [],
    [`DELETE ${R}/issues/7/labels/flow%3Aplanned`]: null,
    [`POST ${R}/issues/7/comments`]: { id: 7, html_url: null },
    ...extra,
  })
  fake.clearCalls()
  fake.setFixtures(asTicket({}))
  const started = flow(repo.work, ['start', '7'])
  assert.equal(started.status, 0, started.stderr)
  const start = JSON.parse(started.stdout)
  assert.deepEqual([start.delivery, start.base, start.branch, start.baseSha], ['incremental', 'main', 'ticket/7', git(repo.remote, 'rev-parse', 'main')])

  const sha = commitFile(repo.work, 'export.txt', 'trip\n', '#7: the export button exports')
  fake.clearCalls()
  fake.setFixtures(
    asTicket({
      [`GET ${R}/issues/7`]: { ...ticketIssue, labels: ['flow:ticket', 'flow:in-review', 'tier:easy'].map((name) => ({ name })) },
      [`GET ${R}/issues/7/comments?per_page=100`]: [STARTED, accepted(sha)],
      [`GET ${R}/pulls?head=o%3Aticket%2F7&state=open&per_page=100`]: [],
      [`POST ${R}/pulls`]: { number: 50, html_url: 'https://github.com/o/r/pull/50', state: 'open', head: { ref: 'ticket/7', sha }, base: { ref: 'main' } },
    }),
  )
  const delivered = flow(repo.work, ['deliver', '7'])
  assert.equal(delivered.status, 0, delivered.stderr)
  assert.equal(git(repo.remote, 'rev-parse', 'ticket/7'), sha)
  const request = JSON.parse(fake.calls().find((call) => call.key === `POST ${R}/pulls`).stdin)
  assert.deepEqual([request.head, request.base], ['ticket/7', 'main'])
  assert.match(request.body, /^Closes #7\./)
  assert.ok(!fake.calls().some((call) => call.key.includes('epic%2F')), 'no epic branch is involved')
})
