import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installFakeGh, fixtureKey } from './fake-gh.mjs'
import * as github from './github.mjs'

const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-github-')))
after(() => rmSync(directory, { recursive: true, force: true }))
const fake = installFakeGh(join(directory, 'bin'))
const originalPath = process.env.PATH
Object.assign(process.env, fake.env)
after(() => {
  process.env.PATH = originalPath
})

beforeEach(() => fake.clearCalls())

const rawIssue = (number, extra = {}) => ({
  number,
  id: 9000 + number,
  title: `issue ${number}`,
  body: `body ${number}`,
  state: 'open',
  labels: [{ name: 'flow:ticket' }],
  assignees: [{ login: 'ana' }],
  user: { login: 'vadim' },
  html_url: `https://github.com/o/r/issues/${number}`,
  ...extra,
})

const R = 'repos/{owner}/{repo}'

test('the fixture key names the method and path, or the graphql variables', () => {
  assert.equal(fixtureKey(['api', `${R}/issues/3`]), `GET ${R}/issues/3`)
  assert.equal(fixtureKey(['api', '-X', 'PATCH', `${R}/issues/3`, '--input', '-']), `PATCH ${R}/issues/3`)
  assert.equal(fixtureKey(['api', '--paginate', '--slurp', `${R}/labels`]), `GET ${R}/labels`)
  assert.equal(fixtureKey(['api', 'graphql', '-f', 'query=q', '-F', 'owner={owner}', '-F', 'number=4']), 'graphql number=4 owner={owner}')
  assert.equal(fixtureKey(['auth', 'status']), 'auth status')
})

test('getIssue reads one issue and returns it in the tracker shape', () => {
  fake.setFixtures({ [`GET ${R}/issues/5`]: rawIssue(5, { body: null }) })
  assert.deepEqual(github.getIssue(5), {
    number: 5,
    id: 9005,
    title: 'issue 5',
    body: '',
    state: 'open',
    labels: ['flow:ticket'],
    assignees: ['ana'],
    author: 'vadim',
    url: 'https://github.com/o/r/issues/5',
  })
  assert.deepEqual(fake.calls()[0].args, ['api', `${R}/issues/5`])
})

test('listing pages through every result and leaves pull requests out of an issue list', () => {
  fake.setFixtures({ [`GET ${R}/issues?labels=flow%3Aepic&state=open&per_page=100`]: [rawIssue(1), rawIssue(2, { pull_request: {} })] })
  assert.deepEqual(github.listIssues({ label: 'flow:epic' }).map((issue) => issue.number), [1])
  assert.deepEqual(fake.calls()[0].args.slice(0, 3), ['api', '--paginate', '--slurp'])
})

test('listSubIssues reads the sub-issues endpoint', () => {
  fake.setFixtures({ [`GET ${R}/issues/1/sub_issues?per_page=100`]: [rawIssue(3), rawIssue(4)] })
  assert.deepEqual(github.listSubIssues(1).map((issue) => issue.number), [3, 4])
})

test('writes send their JSON on stdin, so numbers stay numbers and text is never shell-quoted', () => {
  fake.setFixtures({
    [`POST ${R}/issues`]: rawIssue(7),
    [`POST ${R}/issues/1/sub_issues`]: {},
    [`PATCH ${R}/issues/1`]: rawIssue(1),
    [`PUT ${R}/issues/7/labels`]: [],
    [`POST ${R}/issues/7/labels`]: [],
    [`POST ${R}/issues/7/comments`]: { id: 55, html_url: 'https://github.com/o/r/issues/7#issuecomment-55' },
  })
  assert.equal(github.createIssue({ title: 'T', body: "it's `quoted` $HOME", labels: ['flow:ticket'] }).number, 7)
  github.addSubIssue(1, 9007)
  github.updateIssueBody(1, 'new body')
  github.setLabels(7, ['flow:ready'])
  github.addLabels(7, ['tier:easy'])
  assert.deepEqual(github.comment(7, 'hello'), { id: 55, url: 'https://github.com/o/r/issues/7#issuecomment-55' })
  const calls = fake.calls()
  assert.deepEqual(calls.map((call) => call.key), [
    `POST ${R}/issues`,
    `POST ${R}/issues/1/sub_issues`,
    `PATCH ${R}/issues/1`,
    `PUT ${R}/issues/7/labels`,
    `POST ${R}/issues/7/labels`,
    `POST ${R}/issues/7/comments`,
  ])
  assert.deepEqual(JSON.parse(calls[0].stdin), { title: 'T', body: "it's `quoted` $HOME", labels: ['flow:ticket'] })
  assert.deepEqual(JSON.parse(calls[1].stdin), { sub_issue_id: 9007 })
  assert.deepEqual(JSON.parse(calls[3].stdin), { labels: ['flow:ready'] })
})

test('addLabels with nothing to add makes no call', () => {
  fake.setFixtures({})
  github.addLabels(7, [])
  assert.deepEqual(fake.calls(), [])
})

test('removeLabels deletes each label and treats one already gone as removed', () => {
  fake.setFixtures({
    [`DELETE ${R}/issues/7/labels/flow%3Aready`]: null,
    [`DELETE ${R}/issues/7/labels/flow%3Ain-progress`]: { $exit: 1, $stderr: 'gh: Label does not exist (HTTP 404)' },
  })
  github.removeLabels(7, ['flow:ready', 'flow:in-progress'])
  assert.equal(fake.calls().length, 2)
})

test('any other failure is a TrackerError carrying the HTTP status', () => {
  fake.setFixtures({ [`DELETE ${R}/issues/7/labels/flow%3Aready`]: { $exit: 1, $stderr: 'gh: Resource not accessible by integration (HTTP 403)' } })
  assert.throws(
    () => github.removeLabels(7, ['flow:ready']),
    (error) => error instanceof github.TrackerError && error.httpStatus === 403 && /not accessible/.test(error.message),
  )
})

test('ensureLabels creates only what is missing, so running it twice changes nothing', () => {
  fake.setFixtures({
    [`GET ${R}/labels?per_page=100`]: [{ name: 'flow:epic', color: '5319e7', description: '' }],
    [`POST ${R}/labels`]: {},
  })
  const result = github.ensureLabels([
    { name: 'flow:epic', color: '5319e7', description: 'Epic' },
    { name: 'flow:ticket', color: '1d76db', description: 'Ticket' },
  ])
  assert.deepEqual(result, { created: ['flow:ticket'], existing: ['flow:epic'] })
  const posts = fake.calls().filter((call) => call.key === `POST ${R}/labels`)
  assert.deepEqual(JSON.parse(posts[0].stdin), { name: 'flow:ticket', color: '1d76db', description: 'Ticket' })
})

test('listComments and listLabels return plain records', () => {
  fake.setFixtures({
    [`GET ${R}/issues/7/comments?per_page=100`]: [{ id: 1, user: { login: 'ana' }, body: 'hi', created_at: '2026-10-14T10:00:00Z' }],
    [`GET ${R}/labels?per_page=100`]: [{ name: 'tier:easy', color: 'ededed', description: null }],
  })
  assert.deepEqual(github.listComments(7), [{ id: 1, author: 'ana', body: 'hi', createdAt: '2026-10-14T10:00:00Z' }])
  assert.deepEqual(github.listLabels(), [{ name: 'tier:easy', color: 'ededed', description: '' }])
})

test('repoInfo, repoSlug and defaultBranch read the repository record', () => {
  fake.setFixtures({ [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true } })
  assert.deepEqual(github.repoInfo(), { slug: 'o/r', defaultBranch: 'main', hasIssues: true })
  assert.equal(github.repoSlug(), 'o/r')
  assert.equal(github.defaultBranch(), 'main')
})

test('bodyEditHistory asks GraphQL for the edits and returns them oldest first', () => {
  fake.setFixtures({
    'graphql name={repo} number=7 owner={owner}': {
      data: {
        repository: {
          issue: {
            userContentEdits: {
              nodes: [
                { editedAt: '2026-10-14T12:00:00Z', editor: { login: 'ana' } },
                { editedAt: '2026-10-13T09:00:00Z', editor: null },
              ],
            },
          },
        },
      },
    },
  })
  assert.deepEqual(github.bodyEditHistory(7), [
    { editedAt: '2026-10-13T09:00:00Z', editor: null },
    { editedAt: '2026-10-14T12:00:00Z', editor: 'ana' },
  ])
  const call = fake.calls()[0]
  assert.match(call.args.find((arg) => arg.startsWith('query=')), /userContentEdits/)
})

test('bodyEditHistory follows every page, so an issue edited more than 100 times loses none of its history', () => {
  const page = (nodes, hasNextPage) => ({ data: { repository: { issue: { userContentEdits: { pageInfo: { hasNextPage, endCursor: hasNextPage ? 'c1' : null }, nodes } } } } })
  const first = Array.from({ length: 100 }, (_, index) => ({ editedAt: `2026-10-01T00:00:${String(index % 60).padStart(2, '0')}Z`, editor: { login: 'a' } }))
  fake.setFixtures({
    'graphql name={repo} number=8 owner={owner}': { $exit: 0, $raw: JSON.stringify([page(first, true), page([{ editedAt: '2026-10-20T00:00:00Z', editor: { login: 'late' } }], false)]) },
  })
  const edits = github.bodyEditHistory(8)
  assert.equal(edits.length, 101)
  assert.equal(edits[100].editor, 'late')
  const call = fake.calls()[0]
  assert.ok(call.args.includes('--paginate') && call.args.includes('--slurp'))
  assert.match(call.args.find((arg) => arg.startsWith('query=')), /\$endCursor:String.*after:\$endCursor.*pageInfo\{hasNextPage endCursor\}/)
})

test('the fake gh fails loudly on a call nobody prepared for, so a test cannot pass by accident', () => {
  fake.setFixtures({})
  assert.throws(() => github.getIssue(404), (error) => error instanceof github.TrackerError && /fake gh: no fixture for "GET repos\/\{owner\}\/\{repo\}\/issues\/404"/.test(error.message))
  assert.equal(fake.calls()[0].key, `GET ${R}/issues/404`, 'and the call is still recorded')
})

test('authStatus reports a signed-out gh without throwing', () => {
  fake.setFixtures({ 'auth status': { $exit: 1, $stderr: 'You are not logged into any GitHub hosts.' } })
  assert.deepEqual(github.authStatus(), { ok: false, message: 'You are not logged into any GitHub hosts.' })
  fake.setFixtures({ 'auth status': '' })
  assert.deepEqual(github.authStatus(), { ok: true, message: '' })
})

test('a missing gh is a TrackerError that says so', () => {
  const saved = process.env.PATH
  process.env.PATH = join(directory, 'empty')
  try {
    assert.throws(() => github.ghVersion(), (error) => error instanceof github.TrackerError && error.missing === true && /not installed/.test(error.message))
  } finally {
    process.env.PATH = saved
  }
})

test('pull requests and their reviews come back in the tracker shape', () => {
  fake.setFixtures({
    [`GET ${R}/pulls/40`]: { number: 40, html_url: 'https://github.com/o/r/pull/40', state: 'open', head: { ref: 'ticket/2', sha: 'abc' }, base: { ref: 'main' } },
    [`GET ${R}/pulls/40/reviews?per_page=100`]: [{ id: 3, user: { login: 'copilot-pull-request-reviewer[bot]' }, state: 'COMMENTED', commit_id: 'abc', submitted_at: '2026-10-14T12:00:00Z' }],
  })
  assert.deepEqual(github.getPullRequest(40), { number: 40, url: 'https://github.com/o/r/pull/40', state: 'open', head: 'ticket/2', headSha: 'abc', base: 'main' })
  assert.deepEqual(github.listPullRequestReviews(40), [{ id: 3, author: 'copilot-pull-request-reviewer[bot]', state: 'COMMENTED', commit: 'abc', submittedAt: '2026-10-14T12:00:00Z' }])
})

test('findOpenPullRequest asks for the head branch qualified by the repository owner', () => {
  fake.setFixtures({ [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true }, [`GET ${R}/pulls?head=o%3Aticket%2F2&state=open&per_page=100`]: [] })
  assert.equal(github.findOpenPullRequest('ticket/2'), null)
})

test('viewerLogin asks GitHub once which account gh is signed in as, and remembers it for the rest of the command', () => {
  fake.setFixtures({ graphql: { data: { viewer: { login: 'flow-bot' } } } })
  assert.equal(github.viewerLogin(), 'flow-bot')
  assert.equal(github.viewerLogin(), 'flow-bot')
  assert.equal(fake.calls().length, 1)
  assert.match(fake.calls()[0].args.find((arg) => arg.startsWith('query=')), /viewer\{login\}/)
})
