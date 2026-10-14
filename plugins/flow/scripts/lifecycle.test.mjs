import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, realpathSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installFakeGh } from './tracker/fake-gh.mjs'

const FLOW = join(dirname(fileURLToPath(import.meta.url)), 'flow.mjs')
const R = 'repos/{owner}/{repo}'
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-lifecycle-')))
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

const epicBody = (settings = 'Delivery: release\nBranch: epic/trip-export') => `## Outcome

Travellers can export a trip.

## Settings

${settings}

## Tickets

- [ ] #2 — export button
- [ ] #3 — export file
`

const ticketBody = (epic, { blockedBy = '', criteria = '- the file exists\n  CHECK: test -f export.txt' } = {}) => `${epic ? `Epic: #${epic}\n` : ''}${blockedBy}
## Scope

- the export

## Not in scope

- sharing

## Acceptance criteria

\`\`\`criteria
${criteria}
\`\`\`
`

const comment = (body, createdAt = '2026-10-14T10:00:00Z') => ({ id: 1, user: { login: 'flow-bot' }, body, created_at: createdAt })
const noEdits = { data: { repository: { issue: { userContentEdits: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } } }
const edits = (nodes) => ({ data: { repository: { issue: { userContentEdits: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } } })

function world({ epicLabels = ['flow:epic', 'flow:approved'], settings, ticket2 = {}, ticket3 = {}, comments = [], history = noEdits, extra = {} } = {}) {
  const epic = issue(1, { title: 'Trip export', body: epicBody(settings), labels: epicLabels })
  const two = issue(2, { title: 'Export button', body: ticketBody(1, ticket2), labels: ticket2.labels || ['flow:ticket', 'flow:planned', 'tier:easy'] })
  const three = issue(3, { title: 'Export file', body: ticketBody(1, { blockedBy: 'Blocked by: #2\n', ...ticket3 }), labels: ticket3.labels || ['flow:ticket', 'flow:planned'] })
  fake.setFixtures({
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true },
    graphql: { data: { viewer: { login: 'flow-bot' } } },
    [`GET ${R}/issues/1`]: epic,
    [`GET ${R}/issues/2`]: two,
    [`GET ${R}/issues/3`]: three,
    [`GET ${R}/issues/1/sub_issues?per_page=100`]: [two, three],
    [`GET ${R}/issues/2/comments?per_page=100`]: comments,
    'graphql name={repo} number=2 owner={owner}': history,
    [`POST ${R}/issues/2/labels`]: [],
    [`DELETE ${R}/issues/2/labels/flow%3Aplanned`]: null,
    [`DELETE ${R}/issues/2/labels/flow%3Ain-progress`]: null,
    [`DELETE ${R}/issues/2/labels/flow%3Ain-review`]: null,
    [`POST ${R}/issues/2/comments`]: { id: 9, html_url: 'https://github.com/o/r/issues/2#issuecomment-9' },
    [`POST ${R}/issues/3/labels`]: [],
    [`DELETE ${R}/issues/3/labels/flow%3Aplanned`]: null,
    [`POST ${R}/issues/3/comments`]: { id: 10, html_url: 'https://github.com/o/r/issues/3#issuecomment-10' },
    [`PATCH ${R}/issues/1`]: epic,
    ...extra,
  })
}

const posted = (number) => fake.calls().filter((call) => call.key === `POST ${R}/issues/${number}/comments`).map((call) => JSON.parse(call.stdin).body)
const labelCalls = () => fake.calls().filter((call) => /labels/.test(call.key)).map((call) => (call.stdin ? `${call.key} ${call.stdin}` : call.key))

beforeEach(() => fake.clearCalls())

test('start cuts ticket/<n> from the epic branch on origin, labels it in progress and posts who builds it', () => {
  const { work } = repository()
  const epicHead = git(work, 'rev-parse', 'origin/epic/trip-export')
  commitFile(work, 'local.txt', 'not pushed\n', 'a local commit nobody else has')
  world()
  const result = flow(work, ['start', '2'])
  assert.equal(result.status, 0, result.stderr)
  const started = JSON.parse(result.stdout)
  assert.deepEqual(
    { branch: started.branch, base: started.base, delivery: started.delivery, model: started.model, host: started.host, baseSha: started.baseSha },
    { branch: 'ticket/2', base: 'epic/trip-export', delivery: 'release', model: 'sonnet', host: 'attended session', baseSha: epicHead },
  )
  assert.equal(git(work, 'symbolic-ref', '--short', 'HEAD'), 'ticket/2')
  assert.equal(git(work, 'rev-parse', 'HEAD'), epicHead, 'cut from origin, not from whatever was checked out')
  assert.deepEqual(labelCalls(), [`POST ${R}/issues/2/labels {"labels":["flow:in-progress"]}`, `DELETE ${R}/issues/2/labels/flow%3Aplanned`])
  const [body] = posted(2)
  assert.match(body, /^<!-- flow:started -->\n\*\*Started\*\* in an attended session · worker model sonnet · branch `ticket\/2` from `epic\/trip-export`/)
})

test('start says it is an unattended run when FLOW_UNATTENDED=1, and a hard ticket names opus', () => {
  const { work } = repository()
  world({ ticket2: { labels: ['flow:ticket', 'flow:planned', 'tier:hard'] } })
  const result = flow(work, ['start', '2'], { FLOW_UNATTENDED: '1' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).model, 'opus')
  assert.match(posted(2)[0], /in an unattended run · worker model opus/)
})

test('start on an incremental epic cuts from the default branch', () => {
  const { work } = repository()
  world({ settings: 'Delivery: incremental\nBranch: epic/trip-export' })
  const result = flow(work, ['start', '2'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).base, 'main')
})

test('start refuses a ticket that is not ready and changes nothing in an attended session', () => {
  const { work } = repository()
  world()
  const waiting = flow(work, ['start', '3'])
  assert.equal(waiting.status, 1)
  assert.match(waiting.stderr, /#3 is waiting for #2 to be done/)
  world({ epicLabels: ['flow:epic'] })
  const unapproved = flow(work, ['start', '2'])
  assert.equal(unapproved.status, 1)
  assert.match(unapproved.stderr, /epic #1 is not approved yet/)
  assert.deepEqual(posted(2), [])
  assert.deepEqual(posted(3), [])
  assert.equal(git(work, 'symbolic-ref', '--short', 'HEAD'), 'main')
})

test('start in an unattended run turns a refusal into needs-human, mentioning the epic author', () => {
  const { work } = repository()
  world()
  const result = flow(work, ['start', '3'], { FLOW_UNATTENDED: '1' })
  assert.equal(result.status, 1)
  const [body] = posted(3)
  assert.match(body, /^\*\*This ticket needs a person\.\*\* @vadim #3 is waiting for #2 to be done/)
  assert.ok(labelCalls().includes(`POST ${R}/issues/3/labels {"labels":["flow:needs-human"]}`))
})

test('start refuses a dirty working tree, a ticket already started, and a criteria block that cannot decide it', () => {
  const { work } = repository()
  writeFileSync(join(work, 'README.md'), 'edited\n')
  world()
  const dirty = flow(work, ['start', '2'])
  assert.equal(dirty.status, 1)
  assert.match(dirty.stderr, /uncommitted changes \(README\.md\)/)
  git(work, 'checkout', '-q', '--', 'README.md')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-progress'] } })
  assert.match(flow(work, ['start', '2']).stderr, /#2 is already in progress/)
  world({ ticket2: { criteria: '- prose only' } })
  assert.match(flow(work, ['start', '2']).stderr, /#2 has acceptance criteria that cannot decide it/)
})

test('start on a ticket whose branch already exists carries on from that branch, and says so', () => {
  const { work, root } = repository()
  const epicHead = git(work, 'rev-parse', 'origin/epic/trip-export')
  const other = join(root, 'other')
  git(root, 'clone', '-q', join(root, 'origin.git'), other)
  git(other, 'checkout', '-q', '-b', 'ticket/2', 'origin/epic/trip-export')
  const earlier = commitFile(other, 'export.txt', 'half done\n', '#2: half of the export')
  git(other, 'push', '-q', 'origin', 'ticket/2')
  world()
  const result = flow(work, ['start', '2'])
  assert.equal(result.status, 0, result.stderr)
  const started = JSON.parse(result.stdout)
  assert.deepEqual([started.resumedAt, started.baseSha], [earlier, epicHead])
  assert.equal(git(work, 'rev-parse', 'HEAD'), earlier)
  assert.equal(git(work, 'symbolic-ref', '--short', 'HEAD'), 'ticket/2')
  assert.match(posted(2)[0], /^<!-- flow:started -->\n\*\*Resumed\*\* in an attended session · worker model sonnet · branch `ticket\/2` carries on from its commit/)
})

test('start refuses a ticket branch that moved both here and on origin, because there is no one head to carry on from', () => {
  const { work, root } = repository()
  const other = join(root, 'other')
  git(root, 'clone', '-q', join(root, 'origin.git'), other)
  git(other, 'checkout', '-q', '-b', 'ticket/2', 'origin/epic/trip-export')
  commitFile(other, 'a.txt', 'a\n', '#2: one way')
  git(other, 'push', '-q', 'origin', 'ticket/2')
  git(work, 'checkout', '-q', '-b', 'ticket/2', 'origin/epic/trip-export')
  commitFile(work, 'b.txt', 'b\n', '#2: the other way')
  git(work, 'checkout', '-q', 'main')
  world()
  const result = flow(work, ['start', '2'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /ticket\/2 here and on origin have both moved since they parted/)
  assert.deepEqual(posted(2), [])
})

test('start takes a ticket with no epic as approved and cuts it from the default branch', () => {
  const { work } = repository()
  const lone = issue(7, { title: 'Fix typo', body: ticketBody(null), labels: ['flow:ticket', 'flow:planned', 'tier:easy'] })
  fake.setFixtures({
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true },
    [`GET ${R}/issues/7`]: lone,
    [`POST ${R}/issues/7/labels`]: [],
    [`DELETE ${R}/issues/7/labels/flow%3Aplanned`]: null,
    [`POST ${R}/issues/7/comments`]: { id: 1 },
  })
  const result = flow(work, ['start', '7'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual([JSON.parse(result.stdout).delivery, JSON.parse(result.stdout).base, JSON.parse(result.stdout).epic], ['incremental', 'main', null])
})

const STARTED = comment('<!-- flow:started -->\n**Started** in an attended session', '2026-10-14T10:00:00Z')
const review = (round, important, createdAt = '2026-10-14T11:00:00Z') => comment(`<!-- flow:review round=${round} important=${important} -->\n**Review, round ${round}**`, createdAt)
const REVIEWED = review(1, 0)
const by = (login, entry) => ({ ...entry, user: { login } })

function startedTicket() {
  const repo = repository()
  git(repo.work, 'checkout', '-q', '-b', 'ticket/2', 'origin/epic/trip-export')
  return repo
}

test('accept runs the criteria on the committed head and posts the results with the commit', () => {
  const { work } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [STARTED, REVIEWED] })
  const result = flow(work, ['accept', '2'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).sha, sha)
  const [body] = posted(2)
  assert.match(body, new RegExp(`^<!-- flow:acceptance sha=${sha} passed=true -->`))
  assert.match(body, /1 of 1 checks passed/)
  assert.match(body, /\| 1 \| the file exists \| `test -f export.txt` \| pass \|/)
})

test('accept posts a failing result and exits 1 when a check fails', () => {
  const { work } = startedTicket()
  commitFile(work, 'other.txt', 'x\n', '#2: something else')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [STARTED, REVIEWED] })
  const result = flow(work, ['accept', '2'])
  assert.equal(result.status, 1)
  assert.match(posted(2)[0], /passed=false -->\n\*\*Acceptance failed\*\*/)
})

test('accept refuses when the issue body was edited after work started, naming who edited it', () => {
  const { work } = startedTicket()
  commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  world({
    ticket2: { labels: ['flow:ticket', 'flow:in-review'] },
    comments: [STARTED],
    history: edits([
      { editedAt: '2026-10-14T09:00:00Z', editor: { login: 'planner' } },
      { editedAt: '2026-10-14T11:30:00Z', editor: { login: 'mallory' } },
    ]),
  })
  const result = flow(work, ['accept', '2'])
  assert.equal(result.status, 1)
  const [body] = posted(2)
  assert.match(body, /^\*\*Acceptance refused:\*\* .*edited after work started \(2026-10-14T10:00:00Z\) by @mallory at 2026-10-14T11:30:00Z/)
  assert.doesNotMatch(body, /planner/)
  assert.doesNotMatch(body, /flow:acceptance/, 'a refusal is never an acceptance')
})

test('accept refuses uncommitted changes, the wrong branch, and a ticket nobody started', () => {
  const { work } = startedTicket()
  commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  writeFileSync(join(work, 'export.txt'), 'changed\n')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [STARTED] })
  assert.match(flow(work, ['accept', '2']).stderr, /uncommitted changes \(export\.txt\)/)
  git(work, 'checkout', '-q', '--', 'export.txt')
  git(work, 'checkout', '-q', 'main')
  assert.match(flow(work, ['accept', '2']).stderr, /check out ticket\/2 first/)
  git(work, 'checkout', '-q', 'ticket/2')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [] })
  assert.match(flow(work, ['accept', '2']).stderr, /has no "Started" comment/)
  assert.deepEqual(posted(2), [])
})

const accepted = (sha, passed = true) => comment(`<!-- flow:acceptance sha=${sha} passed=${passed} -->\n**Acceptance passed**`, '2026-10-14T12:00:00Z')

test('deliver merges the accepted commit into the epic branch with --no-ff, labels it done and ticks it off the epic', () => {
  const { work, remote } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  commitFile(work, 'later.txt', 'after acceptance\n', '#2: not accepted')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [STARTED, accepted(sha)] })
  const result = flow(work, ['deliver', '2'])
  assert.equal(result.status, 0, result.stderr)
  const outcome = JSON.parse(result.stdout)
  assert.equal(outcome.outcome, 'merged')
  const epicHead = git(remote, 'rev-parse', 'epic/trip-export')
  assert.equal(outcome.merge, epicHead)
  assert.equal(git(remote, 'log', '-1', '--format=%s', epicHead), 'Merge #2: Export button')
  assert.equal(git(remote, 'rev-parse', `${epicHead}^2`), sha, 'the accepted commit, never the branch tip')
  assert.equal(git(remote, 'rev-parse', 'ticket/2'), sha)
  assert.ok(labelCalls().includes(`POST ${R}/issues/2/labels {"labels":["flow:done"]}`))
  assert.ok(labelCalls().includes(`DELETE ${R}/issues/2/labels/flow%3Ain-review`))
  assert.match(posted(2)[0], new RegExp(`^<!-- flow:merged sha=[0-9a-f]{40} accepted=${sha} -->\\n\\*\\*Done\\.\\*\\* The accepted commit \`${sha.slice(0, 12)}\` merged into \`epic/trip-export\``))
  const patch = fake.calls().find((call) => call.key === `PATCH ${R}/issues/1`)
  assert.match(JSON.parse(patch.stdin).body, /- \[x\] #2 — export button\n- \[ \] #3/)
  assert.equal(git(work, 'symbolic-ref', '--short', 'HEAD'), 'ticket/2', 'the checkout is left alone')
  assert.equal(git(work, 'worktree', 'list').split('\n').length, 1, 'the temporary worktree is gone')
})

test('deliver refuses without a passing acceptance', () => {
  const { work } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [STARTED, accepted(sha, false)] })
  const result = flow(work, ['deliver', '2'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /no passing acceptance comment/)
})

test('deliver retries a push the epic branch moved under, and merges on top of the new head', () => {
  const { root, work, remote } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  const other = join(root, 'other')
  git(root, 'clone', '-q', remote, other)
  git(other, 'checkout', '-q', 'epic/trip-export')
  const hookFile = join(remote, 'hooks', 'pre-receive')
  writeFileSync(
    hookFile,
    `#!/bin/sh\nread old new ref\nif [ "$ref" = refs/heads/epic/trip-export ] && [ ! -f "${join(root, 'moved')}" ]; then\n  touch "${join(root, 'moved')}"\n  cd "${other}" && unset GIT_DIR GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES && echo b > b.txt && git add b.txt && git -c user.name=o -c user.email=o@x commit -qm "#3: someone else" && git push -q origin HEAD:epic/trip-export\nfi\nexit 0\n`,
  )
  execFileSync('chmod', ['+x', hookFile])
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [STARTED, accepted(sha)] })
  const result = flow(work, ['deliver', '2'])
  rmSync(hookFile)
  assert.equal(result.status, 0, result.stderr)
  const outcome = JSON.parse(result.stdout)
  assert.deepEqual(outcome.attempts, ['stale', 'merged'])
  const epicHead = git(remote, 'rev-parse', 'epic/trip-export')
  assert.equal(git(remote, 'rev-parse', `${epicHead}^2`), sha)
  assert.equal(git(remote, 'log', '-1', '--format=%s', `${epicHead}^1`), '#3: someone else')
})

test('deliver stops on a merge conflict, merges nothing, and asks a person naming the files', () => {
  const { root, work, remote } = startedTicket()
  const sha = commitFile(work, 'README.md', 'ticket version\n', '#2: rewrite the readme')
  const other = join(root, 'other')
  git(root, 'clone', '-q', remote, other)
  git(other, 'checkout', '-q', 'epic/trip-export')
  commitFile(other, 'README.md', 'epic version\n', '#3: rewrite it too')
  git(other, 'push', '-q', 'origin', 'epic/trip-export')
  const before = git(remote, 'rev-parse', 'epic/trip-export')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'], assignees: [] }, comments: [STARTED, accepted(sha)] })
  const result = flow(work, ['deliver', '2'])
  assert.equal(result.status, 1)
  assert.equal(git(remote, 'rev-parse', 'epic/trip-export'), before)
  const [body] = posted(2)
  assert.match(body, /^\*\*This ticket needs a person\.\*\* @vadim Merging `[0-9a-f]{12}` into `epic\/trip-export` conflicts in `README\.md`/)
  assert.ok(labelCalls().includes(`POST ${R}/issues/2/labels {"labels":["flow:needs-human"]}`))
})

test('deliver is safe to repeat: an accepted commit already in the epic branch is reported, not merged twice', () => {
  const { work, remote } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [STARTED, accepted(sha)] })
  assert.equal(flow(work, ['deliver', '2']).status, 0)
  const head = git(remote, 'rev-parse', 'epic/trip-export')
  fake.clearCalls()
  const again = flow(work, ['deliver', '2'])
  assert.equal(again.status, 0, again.stderr)
  assert.equal(JSON.parse(again.stdout).outcome, 'already-merged')
  assert.equal(git(remote, 'rev-parse', 'epic/trip-export'), head)
})

test('deliver on an incremental epic pushes the accepted commit and opens a pull request that closes the ticket', () => {
  const { work, remote } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  world({
    settings: 'Delivery: incremental\nBranch: epic/trip-export',
    ticket2: { labels: ['flow:ticket', 'flow:in-review'] },
    comments: [STARTED, accepted(sha)],
    extra: {
      [`GET ${R}/pulls?head=o%3Aticket%2F2&state=open&per_page=100`]: [],
      [`POST ${R}/pulls`]: { number: 40, html_url: 'https://github.com/o/r/pull/40', state: 'open', head: { ref: 'ticket/2', sha }, base: { ref: 'main' } },
    },
  })
  const result = flow(work, ['deliver', '2'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(git(remote, 'rev-parse', 'ticket/2'), sha)
  const request = JSON.parse(fake.calls().find((call) => call.key === `POST ${R}/pulls`).stdin)
  assert.deepEqual([request.title, request.head, request.base], ['#2: Export button', 'ticket/2', 'main'])
  assert.match(request.body, /^Closes #2\./)
  assert.match(posted(2)[0], /\*\*Pull request opened:\*\* https:\/\/github.com\/o\/r\/pull\/40/)
  assert.ok(!labelCalls().some((call) => call.includes('flow:done')), 'done comes after the pull request loop')
})

test('screenshots does nothing without a command in .flow.json, and says so', () => {
  const { work } = startedTicket()
  world()
  const result = flow(work, ['screenshots', '2'])
  assert.equal(result.status, 0)
  assert.equal(JSON.parse(result.stdout).reason, 'no "screenshots" command in .flow.json')
  assert.deepEqual(fake.calls(), [])
})

test('screenshots runs the command, commits the PNGs on the ticket branch, pushes, and links each by commit', () => {
  const { work, remote } = startedTicket()
  commitFile(work, '.flow.json', JSON.stringify({ screenshots: 'mkdir -p "$FLOW_SCREENSHOTS_DIR" && printf png > "$FLOW_SCREENSHOTS_DIR/home page.png" && printf png > "$FLOW_SCREENSHOTS_DIR/a.png"' }), '#2: screenshots config')
  world()
  const result = flow(work, ['screenshots', '2'])
  assert.equal(result.status, 0, result.stderr)
  const { commit, screenshots } = JSON.parse(result.stdout)
  assert.deepEqual(screenshots.map((shot) => shot.path), ['.flow/screenshots/2/a.png', '.flow/screenshots/2/home page.png'])
  assert.equal(git(remote, 'rev-parse', 'ticket/2'), commit)
  assert.equal(git(work, 'log', '-1', '--format=%s'), '#2: screenshots of the built screens')
  const [body] = posted(2)
  assert.match(body, new RegExp(`!\\[\\.flow/screenshots/2/home page\\.png\\]\\(https://github\\.com/o/r/blob/${commit}/\\.flow/screenshots/2/home%20page\\.png\\?raw=true\\)`))
})

test('screenshots uses the directory the command prints, and fails when no PNG appears', () => {
  const { work } = startedTicket()
  commitFile(work, '.flow.json', JSON.stringify({ screenshots: 'mkdir -p shots && printf png > shots/x.png && echo shots' }), '#2: config')
  world()
  const result = flow(work, ['screenshots', '2'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).screenshots.map((shot) => shot.path), ['shots/x.png'])
  commitFile(work, '.flow.json', JSON.stringify({ screenshots: 'true' }), '#2: config')
  const empty = flow(work, ['screenshots', '2'])
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /wrote no PNG into \.flow\/screenshots\/2/)
  assert.ok(!existsSync(join(work, '.flow', 'screenshots', '2')))
})

test('deliver gives up after the first try and two retries all lose the race, and asks a person', () => {
  const { root, work, remote } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  const other = join(root, 'other')
  git(root, 'clone', '-q', remote, other)
  git(other, 'checkout', '-q', 'epic/trip-export')
  const hookFile = join(remote, 'hooks', 'pre-receive')
  writeFileSync(
    hookFile,
    `#!/bin/sh\nread old new ref\nif [ "$ref" = refs/heads/epic/trip-export ] && [ -z "$INNER_PUSH" ]; then\n  cd "${other}" && unset GIT_DIR GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES && git pull -q --ff-only origin epic/trip-export && date +%s%N >> moves.txt && git add moves.txt && git -c user.name=o -c user.email=o@x commit -qm "#3: keeps moving" && INNER_PUSH=1 git push -q origin HEAD:epic/trip-export\nfi\nexit 0\n`,
  )
  execFileSync('chmod', ['+x', hookFile])
  world({ ticket2: { labels: ['flow:ticket', 'flow:in-review'] }, comments: [STARTED, accepted(sha)] })
  const result = flow(work, ['deliver', '2'])
  rmSync(hookFile)
  assert.equal(result.status, 1)
  assert.equal(git(remote, 'log', '-1', '--format=%s', 'epic/trip-export'), '#3: keeps moving')
  assert.match(posted(2)[0], /^\*\*This ticket needs a person\.\*\* @vadim Could not push the merge into `epic\/trip-export`: the branch moved under every attempt \(3 tries\)/)
})

const IN_REVIEW = ['flow:ticket', 'flow:in-review']

test('accept refuses untracked files, because the checks would see what the commit does not hold, and names them nowhere public', () => {
  const { work } = startedTicket()
  commitFile(work, 'other.txt', 'x\n', '#2: not the export')
  writeFileSync(join(work, 'export.txt'), 'only on disk\n')
  world({ ticket2: { labels: IN_REVIEW }, comments: [STARTED, REVIEWED] })
  const result = flow(work, ['accept', '2'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /1 untracked file\(s\) \(export\.txt\)/)
  assert.deepEqual(posted(2), [])
})

test('a start comment from another account does not move the edit line: a forged later start is ignored', () => {
  const { work } = startedTicket()
  commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  world({
    ticket2: { labels: IN_REVIEW },
    comments: [STARTED, REVIEWED, by('mallory', comment('<!-- flow:started -->\n**Started**', '2026-10-14T12:00:00Z'))],
    history: edits([{ editedAt: '2026-10-14T11:30:00Z', editor: { login: 'mallory' } }]),
  })
  const result = flow(work, ['accept', '2'])
  assert.equal(result.status, 1)
  assert.match(posted(2)[0], /edited after work started \(2026-10-14T10:00:00Z\) by @mallory/)
})

test('accept refuses a ticket started under another account, and names the account running it', () => {
  const { work } = startedTicket()
  commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  world({ ticket2: { labels: IN_REVIEW }, comments: [by('someone-else', STARTED), REVIEWED] })
  const result = flow(work, ['accept', '2'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /no "Started" comment from flow-bot/)
})

test('deliver ignores an acceptance quoted in a reply and one posted by another account', () => {
  const { work, remote } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  const quoted = comment(`> <!-- flow:acceptance sha=${sha} passed=true -->\n> looks good`, '2026-10-14T12:00:00Z')
  const foreign = by('mallory', accepted(sha))
  for (const forged of [quoted, foreign]) {
    world({ ticket2: { labels: IN_REVIEW }, comments: [STARTED, forged] })
    const result = flow(work, ['deliver', '2'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /no passing acceptance comment from this account/)
  }
  assert.equal(git(remote, 'rev-parse', 'epic/trip-export'), git(remote, 'rev-parse', 'main'), 'nothing was merged')
})

test('accept requires a posted review, refuses while Important findings are open, and asks a person after two rounds', () => {
  const { work } = startedTicket()
  commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  world({ ticket2: { labels: IN_REVIEW }, comments: [STARTED] })
  assert.match(flow(work, ['accept', '2']).stderr, /no review is posted for this work/)
  world({ ticket2: { labels: IN_REVIEW }, comments: [STARTED, review(1, 2)] })
  const open = flow(work, ['accept', '2'], { FLOW_UNATTENDED: '1' })
  assert.match(open.stderr, /review round 1 has 2 Important finding\(s\) open; fix them and post the second review/)
  assert.deepEqual(posted(2), [], 'one open round is work to do, not a stop')
  world({ ticket2: { labels: IN_REVIEW }, comments: [STARTED, review(1, 2), review(2, 1, '2026-10-14T11:30:00Z')] })
  const stuck = flow(work, ['accept', '2'], { FLOW_UNATTENDED: '1' })
  assert.equal(stuck.status, 1)
  assert.match(posted(2)[0], /^\*\*This ticket needs a person\.\*\* @vadim #2 cannot be accepted: review round 2 still has 1 Important finding\(s\) open after 2 rounds/)
  world({ ticket2: { labels: IN_REVIEW }, comments: [STARTED, review(1, 2), review(2, 0, '2026-10-14T11:30:00Z')] })
  assert.equal(flow(work, ['accept', '2']).status, 0)
})

test('post --review numbers the rounds since the ticket started and records the open Important count', () => {
  const { work } = startedTicket()
  const report = join(work, '..', 'report.md')
  writeFileSync(report, '**Important.** None.')
  world({ comments: [comment('<!-- flow:review round=1 important=3 -->', '2026-10-14T09:00:00Z'), STARTED, review(1, 1)] })
  const result = flow(work, ['post', '2', '--review', '--important', '0', '--file', report])
  assert.equal(result.status, 0, result.stderr)
  assert.match(posted(2)[0], /^<!-- flow:review round=2 important=0 -->\n\*\*Review, round 2\*\*\n\n\*\*Important\.\*\* None\./)
  assert.equal(flow(work, ['post', '2', '--review', '--file', report]).status, 2)
})

const COMPARING = {
  settings: 'Delivery: release\nBranch: epic/trip-export\nDesign sources: designs/trip.html',
  ticket2: { labels: IN_REVIEW, criteria: '- the page matches\n  COMPARE: designs/trip.html @ 1440' },
}

test('a ticket with a design comparison is not accepted or delivered without a posted Compared table', () => {
  const { work } = startedTicket()
  const sha = commitFile(work, 'page.html', '<main></main>\n', '#2: the page')
  world({ ...COMPARING, comments: [STARTED, REVIEWED] })
  const refused = flow(work, ['accept', '2'])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /COMPARE criterion and no comment starting "\*\*Compared:\*\*"/)
  world({ ...COMPARING, comments: [STARTED, REVIEWED, accepted(sha)] })
  const undelivered = flow(work, ['deliver', '2'])
  assert.equal(undelivered.status, 1)
  assert.match(undelivered.stderr, /no "\*\*Compared:\*\*" comment; it is not merged without the comparison/)
  const table = by('ana', comment('**Compared:**\n\n| landmark | design | page |', '2026-10-14T11:10:00Z'))
  world({ ...COMPARING, comments: [STARTED, REVIEWED, table] })
  assert.equal(flow(work, ['accept', '2']).status, 0)
})

test('deliver refuses an accepted commit this clone does not have, and changes nothing', () => {
  const { work, remote } = startedTicket()
  world({ ticket2: { labels: IN_REVIEW }, comments: [STARTED, accepted('f'.repeat(40))] })
  const result = flow(work, ['deliver', '2'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /the accepted commit f{40} is not in this clone/)
  assert.equal(git(remote, 'rev-parse', 'epic/trip-export'), git(remote, 'rev-parse', 'main'))
})

test('the Done comment says when the merge was made again on a moved epic branch', () => {
  const { root, work, remote } = startedTicket()
  const sha = commitFile(work, 'export.txt', 'trip\n', '#2: write the export')
  const other = join(root, 'other')
  git(root, 'clone', '-q', remote, other)
  git(other, 'checkout', '-q', 'epic/trip-export')
  const hookFile = join(remote, 'hooks', 'pre-receive')
  writeFileSync(
    hookFile,
    `#!/bin/sh\nread old new ref\nif [ "$ref" = refs/heads/epic/trip-export ] && [ ! -f "${join(root, 'moved')}" ]; then\n  touch "${join(root, 'moved')}"\n  cd "${other}" && unset GIT_DIR GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES && echo b > b.txt && git add b.txt && git -c user.name=o -c user.email=o@x commit -qm "#3: someone else" && git push -q origin HEAD:epic/trip-export\nfi\nexit 0\n`,
  )
  execFileSync('chmod', ['+x', hookFile])
  world({ ticket2: { labels: IN_REVIEW }, comments: [STARTED, accepted(sha)] })
  const result = flow(work, ['deliver', '2'])
  rmSync(hookFile)
  assert.equal(result.status, 0, result.stderr)
  assert.match(posted(2)[0], /`epic\/trip-export` moved while this was merging, so the merge was made again on its new head \(2 tries\)/)
})

test('screenshots commits only the images, never something else that was already staged', () => {
  const { work, remote } = startedTicket()
  commitFile(work, '.flow.json', JSON.stringify({ screenshots: 'mkdir -p "$FLOW_SCREENSHOTS_DIR" && printf png > "$FLOW_SCREENSHOTS_DIR/a.png"' }), '#2: config')
  writeFileSync(join(work, 'secrets.env'), 'TOKEN=1\n')
  git(work, 'add', 'secrets.env')
  world()
  const result = flow(work, ['screenshots', '2'])
  assert.equal(result.status, 0, result.stderr)
  const files = git(remote, 'ls-tree', '-r', '--name-only', 'ticket/2')
  assert.match(files, /\.flow\/screenshots\/2\/a\.png/)
  assert.doesNotMatch(files, /secrets\.env/)
  assert.equal(git(work, 'diff', '--cached', '--name-only'), 'secrets.env', 'what was staged stays staged, uncommitted')
})

test('screenshots fails on a failing command and on a directory outside the repository, posting nothing', () => {
  const { work, root } = startedTicket()
  commitFile(work, '.flow.json', JSON.stringify({ screenshots: 'echo broken >&2; exit 3' }), '#2: config')
  world()
  const failed = flow(work, ['screenshots', '2'])
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /the screenshots command failed \(exit 3\):\nbroken/)
  const outside = join(root, 'shots')
  commitFile(work, '.flow.json', JSON.stringify({ screenshots: `mkdir -p "${outside}" && printf png > "${outside}/a.png" && echo "${outside}"` }), '#2: config')
  const escaped = flow(work, ['screenshots', '2'])
  assert.equal(escaped.status, 1)
  assert.match(escaped.stderr, /outside the repository, so they cannot be committed/)
  assert.deepEqual(posted(2), [])
})

test('an unattended start on a dirty working tree exits nonzero without touching the ticket: the host is at fault, not the ticket', () => {
  const { work } = repository()
  writeFileSync(join(work, 'README.md'), 'edited by the host\n')
  world()
  const result = flow(work, ['start', '2'], { FLOW_UNATTENDED: '1' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /uncommitted changes \(README\.md\)/)
  assert.deepEqual(posted(2), [])
  assert.deepEqual(labelCalls(), [])
})
