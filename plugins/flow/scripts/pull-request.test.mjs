import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, realpathSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installFakeGh } from './tracker/fake-gh.mjs'
import { COPILOT_REVIEWER_LOGIN } from './review-bots.mjs'

const FLOW = join(dirname(fileURLToPath(import.meta.url)), 'flow.mjs')
const R = 'repos/{owner}/{repo}'
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-pr-')))
after(() => rmSync(directory, { recursive: true, force: true }))
const fake = installFakeGh(join(directory, 'bin'))
const plain = join(directory, 'plain')
const rabbit = join(directory, 'rabbit')
mkdirSync(plain)
mkdirSync(rabbit)
writeFileSync(join(rabbit, '.coderabbit.yaml'), 'reviews: {}\n')
beforeEach(() => fake.clearCalls())

function flow(cwd, ...args) {
  const result = spawnSync(process.execPath, [FLOW, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...fake.env } })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

const HEAD = 'a'.repeat(40)
const pull = { number: 40, html_url: 'https://github.com/o/r/pull/40', state: 'open', head: { ref: 'ticket/2', sha: HEAD }, base: { ref: 'main' } }
const review = (login, commit, state = 'COMMENTED') => ({ id: 1, user: { login }, state, commit_id: commit, submitted_at: '2026-10-14T12:00:00Z' })

test('pr-review-request asks Copilot by its reviewer login and prints copilot', () => {
  fake.setFixtures({ [`POST ${R}/pulls/40/requested_reviewers`]: {} })
  const result = flow(plain, 'pr-review-request', '40')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'copilot')
  const [call] = fake.calls()
  assert.deepEqual(JSON.parse(call.stdin), { reviewers: ['copilot-pull-request-reviewer[bot]'] })
  assert.equal(COPILOT_REVIEWER_LOGIN, 'copilot-pull-request-reviewer[bot]')
})

test('pr-review-request prints none and exits 0 when the repository has no Copilot', () => {
  fake.setFixtures({ [`POST ${R}/pulls/40/requested_reviewers`]: { $exit: 1, $stderr: 'gh: Reviews may only be requested from collaborators. (HTTP 422)' } })
  const result = flow(plain, 'pr-review-request', '40')
  assert.equal(result.status, 0)
  assert.equal(result.stdout.trim(), 'none')
})

test('pr-review-request does not hide a failure that is not about Copilot', () => {
  fake.setFixtures({ [`POST ${R}/pulls/40/requested_reviewers`]: { $exit: 1, $stderr: 'gh: Bad credentials (HTTP 401)' } })
  const result = flow(plain, 'pr-review-request', '40')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Bad credentials/)
})

test('pr-review-request leaves the review to CodeRabbit where it is configured, and calls nothing', () => {
  fake.setFixtures({})
  const result = flow(rabbit, 'pr-review-request', '40')
  assert.equal(result.stdout.trim(), 'coderabbit')
  assert.deepEqual(fake.calls(), [])
})

test('pr-wait returns the bot review of the current head, ignoring older commits and other reviewers', () => {
  fake.setFixtures({
    [`GET ${R}/pulls/40`]: pull,
    [`GET ${R}/pulls/40/reviews?per_page=100`]: {
      $sequence: [
        [review('copilot-pull-request-reviewer[bot]', 'b'.repeat(40)), review('ana', HEAD, 'APPROVED')],
        [review('copilot-pull-request-reviewer[bot]', 'b'.repeat(40)), review('copilot-pull-request-reviewer[bot]', HEAD, 'COMMENTED')],
      ],
    },
  })
  const result = flow(plain, 'pr-wait', '40', '--interval', '0', '--timeout', '30')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { pr: 40, bot: 'copilot', state: 'COMMENTED', head: HEAD, submittedAt: '2026-10-14T12:00:00Z' })
  assert.equal(fake.calls().filter((call) => call.key.endsWith('/reviews?per_page=100')).length, 2)
})

test('pr-wait waits for CodeRabbit where it is configured', () => {
  fake.setFixtures({ [`GET ${R}/pulls/40`]: pull, [`GET ${R}/pulls/40/reviews?per_page=100`]: [review('coderabbitai[bot]', HEAD)] })
  assert.equal(JSON.parse(flow(rabbit, 'pr-wait', '40', '--interval', '0').stdout).bot, 'coderabbit')
})

test('pr-wait reports timeout and exits 1 when no review arrives, and none when there is no bot', () => {
  fake.setFixtures({ [`GET ${R}/pulls/40`]: pull, [`GET ${R}/pulls/40/reviews?per_page=100`]: [] })
  const late = flow(plain, 'pr-wait', '40', '--timeout', '0', '--interval', '0')
  assert.equal(late.status, 1)
  assert.equal(JSON.parse(late.stdout).state, 'timeout')
  fake.clearCalls()
  const none = flow(plain, 'pr-wait', '40', '--bot', 'none')
  assert.equal(none.status, 0)
  assert.equal(JSON.parse(none.stdout).state, 'none')
  assert.deepEqual(fake.calls(), [])
})

const threadPage = (nodes, cursor) => ({
  data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: cursor !== null, endCursor: cursor }, nodes } } } },
})
const thread = (id, { resolved = false, path = 'src/a.ts', line = 3, body = 'fix this' } = {}) => ({
  id,
  isResolved: resolved,
  isOutdated: false,
  path,
  line,
  comments: { nodes: [{ body, url: `https://github.com/o/r/pull/40#discussion_${id}`, author: { login: 'copilot-pull-request-reviewer' } }, { body: 'reply', url: 'u', author: { login: 'ana' } }] },
})

test('pr-threads follows every page and lists only unresolved threads, with path, line, body, author and id', () => {
  fake.setFixtures({
    'graphql name={repo} owner={owner} pr=40': threadPage([thread('T1'), thread('T2', { resolved: true })], 'c1'),
    'graphql cursor=c1 name={repo} owner={owner} pr=40': threadPage([thread('T3', { path: 'src/b.ts', line: null, body: 'and this' })], null),
  })
  const result = flow(plain, 'pr-threads', '40')
  assert.equal(result.status, 0, result.stderr)
  const threads = JSON.parse(result.stdout)
  assert.deepEqual(threads.map((entry) => [entry.id, entry.path, entry.line, entry.author, entry.body]), [
    ['T1', 'src/a.ts', 3, 'copilot-pull-request-reviewer', 'fix this'],
    ['T3', 'src/b.ts', null, 'copilot-pull-request-reviewer', 'and this'],
  ])
  assert.equal(threads[0].comments.length, 2)
  const queries = fake.calls().map((call) => call.args.find((arg) => arg.startsWith('query=')))
  assert.ok(queries.every((query) => /reviewThreads\(first:100,after:\$cursor\)/.test(query)))
})

test('pr-threads refuses a page that claims more but gives no way on, instead of looping forever', () => {
  fake.setFixtures({
    'graphql name={repo} owner={owner} pr=40': { data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: true, endCursor: null }, nodes: [] } } } } },
  })
  const result = flow(plain, 'pr-threads', '40')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /no way to the next one/)
})

test('pr-resolve replies on the thread, then resolves it', () => {
  fake.setFixtures({
    'graphql body=Fixed in abc123 thread=T1': { data: { addPullRequestReviewThreadReply: { comment: { url: 'https://github.com/o/r/pull/40#discussion_r9' } } } },
    'graphql thread=T1': { data: { resolveReviewThread: { thread: { id: 'T1', isResolved: true } } } },
  })
  const result = flow(plain, 'pr-resolve', 'T1', '--text', 'Fixed in abc123')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { thread: 'T1', reply: 'https://github.com/o/r/pull/40#discussion_r9', resolved: true })
  const queries = fake.calls().map((call) => call.args.find((arg) => arg.startsWith('query=')))
  assert.match(queries[0], /addPullRequestReviewThreadReply/)
  assert.match(queries[1], /resolveReviewThread/)
})

test('pr-resolve needs a reply, because a thread closed without one leaves the reviewer guessing', () => {
  const result = flow(plain, 'pr-resolve', 'T1')
  assert.equal(result.status, 2)
  assert.match(result.stderr, /needs --text/)
})

test('pr-resolve reports a GraphQL refusal as a failure', () => {
  fake.setFixtures({ 'graphql body=ok thread=T9': { errors: [{ message: 'Could not resolve to a node' }] } })
  const result = flow(plain, 'pr-resolve', 'T9', '--text', 'ok')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Could not resolve to a node/)
})

const CHECKS_KEY = 'pr checks 40 --json bucket,link,name,state,workflow'
const check = (name, bucket) => ({ name, workflow: 'tests', state: bucket.toUpperCase(), bucket, link: `https://ci/${name}` })

test('pr-checks reads gh pr checks as JSON even when gh exits nonzero for failing or pending checks', () => {
  fake.setFixtures({ [CHECKS_KEY]: { $exit: 1, $stdout: [check('unit', 'pass'), check('lint', 'fail'), check('e2e', 'skipping')] } })
  const failing = flow(plain, 'pr-checks', '40')
  assert.equal(failing.status, 1)
  const summary = JSON.parse(failing.stdout)
  assert.deepEqual([summary.passing, summary.skipped, summary.pending, summary.failing.map((entry) => entry.name)], [1, 1, 0, ['lint']])
  fake.setFixtures({ [CHECKS_KEY]: { $exit: 8, $stdout: [check('unit', 'pending')] } })
  const pending = flow(plain, 'pr-checks', '40')
  assert.equal(pending.status, 3)
  assert.equal(JSON.parse(pending.stdout).pending, 1)
})

test('pr-checks --wait polls until nothing is pending', () => {
  fake.setFixtures({
    [CHECKS_KEY]: { $sequence: [{ $exit: 8, $stdout: [check('unit', 'pending')] }, { $exit: 8, $stdout: [check('unit', 'pending')] }, [check('unit', 'pass')]] },
  })
  const result = flow(plain, 'pr-checks', '40', '--wait', '--interval', '0', '--timeout', '30')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).passing, 1)
  assert.equal(fake.calls().length, 3)
})

test('pr-checks never reads "no checks" as green: it exits 4, and under --wait it first waits for checks to appear', () => {
  const none = { $exit: 1, $stderr: "no checks reported on the 'ticket/2' branch" }
  fake.setFixtures({ [CHECKS_KEY]: none })
  const once = flow(plain, 'pr-checks', '40')
  assert.equal(once.status, 4)
  assert.deepEqual([JSON.parse(once.stdout).noChecks, JSON.parse(once.stdout).checks], [true, []])
  fake.clearCalls()
  const afterGrace = flow(plain, 'pr-checks', '40', '--wait', '--interval', '0', '--grace', '0')
  assert.equal(afterGrace.status, 4)
  fake.setFixtures({ [CHECKS_KEY]: { $sequence: [none, none, { $exit: 8, $stdout: [check('unit', 'pending')] }, [check('unit', 'pass')]] } })
  fake.clearCalls()
  const appeared = flow(plain, 'pr-checks', '40', '--wait', '--interval', '0', '--timeout', '30', '--grace', '30')
  assert.equal(appeared.status, 0, appeared.stderr)
  assert.equal(JSON.parse(appeared.stdout).noChecks, false)
  assert.equal(fake.calls().length, 4)
})

test('pr-checks does not take a gh failure for a result', () => {
  fake.setFixtures({ [CHECKS_KEY]: { $exit: 1, $stderr: 'GraphQL: Could not resolve to a PullRequest with the number of 40.' } })
  const result = flow(plain, 'pr-checks', '40')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Could not resolve to a PullRequest/)
  assert.equal(result.stdout, '')
})

test('pr-wait follows the head when it moves between probes, and takes only a review of the new head', () => {
  const moved = { ...pull, head: { ref: 'ticket/2', sha: 'c'.repeat(40) } }
  fake.setFixtures({
    [`GET ${R}/pulls/40`]: { $sequence: [pull, moved, moved] },
    [`GET ${R}/pulls/40/reviews?per_page=100`]: {
      $sequence: [[], [review('copilot-pull-request-reviewer[bot]', HEAD)], [review('copilot-pull-request-reviewer[bot]', HEAD), review('copilot-pull-request-reviewer[bot]', 'c'.repeat(40), 'APPROVED')]],
    },
  })
  const result = flow(plain, 'pr-wait', '40', '--interval', '0', '--timeout', '30')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual([JSON.parse(result.stdout).state, JSON.parse(result.stdout).head], ['APPROVED', 'c'.repeat(40)])
})

test('pr-threads flags a thread with more comments than one page holds', () => {
  const long = thread('T7')
  long.comments.totalCount = 140
  fake.setFixtures({ 'graphql name={repo} owner={owner} pr=40': threadPage([long, thread('T8')], null) })
  const threads = JSON.parse(flow(plain, 'pr-threads', '40').stdout)
  assert.deepEqual(threads.map((entry) => entry.moreComments), [true, false])
})
