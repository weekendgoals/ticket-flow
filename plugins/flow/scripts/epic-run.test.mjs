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
  const result = spawnSync(process.execPath, [FLOW, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY, ...fake.env, FLOW_UNATTENDED: '', ...environment } })
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

const DEFAULT_TICKETS = {
  2: { title: 'Export button', labels: ['flow:ticket', 'flow:planned', 'tier:easy'], criteria: '- the button\n  CHECK: test -f button.txt' },
  3: { title: 'Export file', labels: ['flow:ticket', 'flow:planned'], criteria: '- the file\n  CHECK: test -f export.txt' },
  4: { title: 'Export name', labels: ['flow:ticket', 'flow:planned'], criteria: '- the name\n  CHECK: test -f name.txt', blockedBy: 'Blocked by: #2' },
}

function world({ epicLabels = ['flow:epic', 'flow:approved'], epic = {}, tickets = {}, comments = {}, extra = {} } = {}) {
  const epicIssue = issue(1, { title: 'Trip export', body: epicBody(epic), labels: epicLabels })
  const merged = Object.fromEntries(Object.entries(DEFAULT_TICKETS).map(([number, base]) => [number, { ...base, ...(tickets[number] || {}) }]))
  const issues = Object.entries(merged).map(([number, ticket]) => issue(Number(number), { title: ticket.title, body: ticketBody(ticket.criteria, ticket.blockedBy || ''), labels: ticket.labels, assignees: ticket.assignees || [] }))
  const fixtures = {
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true },
    graphql: { data: { viewer: { login: 'flow-bot' } } },
    [`GET ${R}/issues/1`]: epicIssue,
    [`GET ${R}/issues/1/sub_issues?per_page=100`]: issues,
    [`GET ${R}/issues/1/comments?per_page=100`]: comments[1] || [],
    [`POST ${R}/issues/1/comments`]: { id: 1, html_url: 'https://github.com/o/r/issues/1#issuecomment-1' },
    [`PATCH ${R}/issues/1`]: epicIssue,
    ...extra,
  }
  for (const ticket of issues) {
    const number = ticket.number
    fixtures[`GET ${R}/issues/${number}`] = ticket
    fixtures[`GET ${R}/issues/${number}/comments?per_page=100`] = comments[number] || []
    fixtures[`POST ${R}/issues/${number}/comments`] = { id: number, html_url: `https://github.com/o/r/issues/${number}#issuecomment-${number}` }
    fixtures[`POST ${R}/issues/${number}/labels`] = []
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
  world({ tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] } }, comments: { 2: [STARTED, accepted(sha)] } })
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
})

test('merge --epic merges every accepted ticket in the order the epic lists them, and skips the rest', () => {
  const repo = repository()
  const two = ticketBranch(repo, 2, { 'button.txt': 'b\n' })
  const three = ticketBranch(repo, 3, { 'export.txt': 'e\n' })
  world({
    tickets: { 2: { labels: ['flow:ticket', 'flow:in-review'] }, 3: { labels: ['flow:ticket', 'flow:in-review'] }, 4: { labels: ['flow:ticket', 'flow:in-progress'] } },
    comments: { 2: [STARTED, accepted(two)], 3: [STARTED, accepted(three)], 4: [STARTED] },
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
  assert.match(posted(1)[0], /^<!-- flow:release-check -->\n\*\*Epic check\*\* at `[0-9a-f]{12}` of `epic\/trip-export`: 1 of 2 ticket\(s\) still pass their checks\./)
  assert.match(posted(1)[0], /\| #3 Export file \| 0 of 1 \| FAIL: `test -f export\.txt` \(failed\) \|/)
  assert.deepEqual(added(3), ['flow:needs-human'])
  assert.match(posted(3)[0], /@ana This ticket's checks fail on the epic branch `epic\/trip-export` .* It stays merged/)
  assert.deepEqual(posted(2), [])
  assert.equal(git(repo.work, 'worktree', 'list').split('\n').length, 1, 'the clean copy is removed')
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
  const result = flow(directory, ['release-pr', '1'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /not every ticket of epic #1 is done \(#3 needs-human\)/)
  assert.ok(!fake.calls().some((call) => call.key === `POST ${R}/pulls`))
})

test('release-pr opens the epic\'s one pull request with its outcome, walkthrough, merge commits and cost over every run, and posts it on the epic', () => {
  const meter = (input) => comment(`<!-- flow:meter -->\n**Cost of #n**\n\n\`\`\`json\n${JSON.stringify({ flowMeter: 1, ticket: 2, roles: {}, models: {}, total: { input, output: 10, cacheCreation: 5, cacheReads: 100 } })}\n\`\`\``)
  const mergedMarker = (sha) => comment(`<!-- flow:merged sha=${sha} accepted=${'b'.repeat(40)} -->\n**Done.**`)
  world({
    tickets: { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:done'] }, 4: { labels: ['flow:ticket', 'flow:done'] } },
    comments: { 2: [mergedMarker('1'.repeat(40)), meter(1000), meter(1000), meter(500)], 3: [mergedMarker('2'.repeat(40)), meter(2500)], 4: [] },
    extra: {
      [`GET ${R}/pulls?head=o%3Aepic%2Ftrip-export&state=open&per_page=100`]: [],
      [`POST ${R}/pulls`]: { number: 40, html_url: 'https://github.com/o/r/pull/40', head: { ref: 'epic/trip-export', sha: 'c'.repeat(40) }, base: { ref: 'main' } },
    },
  })
  const result = flow(directory, ['release-pr', '1'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { epic: 1, pullRequest: 40, url: 'https://github.com/o/r/pull/40', base: 'main', existing: false })
  const request = JSON.parse(fake.calls().find((call) => call.key === `POST ${R}/pulls`).stdin)
  assert.deepEqual([request.title, request.head, request.base], ['Trip export', 'epic/trip-export', 'main'])
  assert.match(request.body, /^Epic: #1\n\n## Outcome\n\nTravellers can export a trip\.\n\n## Walkthrough\n\nA traveller opens a trip/)
  assert.match(request.body, /\| #2 Export button \| `111111111111` \|\n\| #3 Export file \| `222222222222` \|\n\| #4 Export name \| not recorded \|/)
  assert.match(request.body, /Over 2 of 3 ticket\(s\) with a cost comment: 4,000 input, 30 output, 15 cache writes and 300 cache reads/, 'a cost comment posted twice counts once; a second run of a ticket adds')
  assert.match(request.body, /Closes #2\nCloses #3\nCloses #4\nCloses #1\n\nA person reviews and merges this pull request; nothing runs after the merge\./)
  assert.match(posted(1)[0], /^<!-- flow:release-pr number=40 -->\n\*\*Release pull request opened:\*\* https:\/\/github\.com\/o\/r\/pull\/40/)
})

test('release-pr reuses a release pull request that is already open', () => {
  world({
    tickets: { 2: { labels: ['flow:ticket', 'flow:done'] }, 3: { labels: ['flow:ticket', 'flow:done'] }, 4: { labels: ['flow:ticket', 'flow:done'] } },
    extra: { [`GET ${R}/pulls?head=o%3Aepic%2Ftrip-export&state=open&per_page=100`]: [{ number: 40, html_url: 'https://github.com/o/r/pull/40', head: { ref: 'epic/trip-export', sha: 'c' }, base: { ref: 'main' } }] },
  })
  const result = flow(directory, ['release-pr', '1'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).existing, true)
  assert.ok(!fake.calls().some((call) => call.key === `POST ${R}/pulls`))
  assert.match(posted(1)[0], /already open/)
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
  assert.match(result.stdout, /\| worker \| claude-sonnet-5 \| 7 \| 3 \|/)
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
