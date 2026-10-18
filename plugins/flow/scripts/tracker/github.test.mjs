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
  assert.equal(fixtureKey(['api', 'graphql', '--input', '-'], JSON.stringify({ query: 'q', variables: { field: 'F_1', options: [{ name: 'A' }], count: 2 } })), 'graphql count=2 field=F_1')
  assert.equal(fixtureKey(['auth', 'status']), 'auth status')
})

test('getIssue reads one issue and returns it in the tracker shape', () => {
  fake.setFixtures({ [`GET ${R}/issues/5`]: rawIssue(5, { body: null, created_at: '2026-10-01T09:00:00Z', closed_at: null }) })
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
    createdAt: '2026-10-01T09:00:00Z',
    closedAt: null,
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

test('parentIssue reads the parent of a sub-issue, and an issue with none is null rather than a failure', () => {
  fake.setFixtures({
    [`GET ${R}/issues/7/parent`]: rawIssue(1, { labels: [{ name: 'flow:epic' }] }),
    [`GET ${R}/issues/8/parent`]: { $exit: 1, $stderr: 'gh: Not Found (HTTP 404)' },
    [`GET ${R}/issues/9/parent`]: { $exit: 1, $stderr: 'gh: Server Error (HTTP 500)' },
  })
  assert.equal(github.parentIssue(7).number, 1)
  assert.equal(github.parentIssue(8), null)
  assert.throws(() => github.parentIssue(9), (error) => error instanceof github.TrackerError && error.httpStatus === 500)
})

test('closeIssue closes an issue as not planned unless told another reason', () => {
  fake.setFixtures({ [`PATCH ${R}/issues/7`]: rawIssue(7, { state: 'closed' }) })
  assert.equal(github.closeIssue(7).state, 'closed')
  github.closeIssue(7, 'completed')
  assert.deepEqual(fake.calls().map((call) => JSON.parse(call.stdin)), [{ state: 'closed', state_reason: 'not_planned' }, { state: 'closed', state_reason: 'completed' }])
})

test('removeSubIssue sends the child id to the parent\'s sub_issue endpoint', () => {
  fake.setFixtures({ [`DELETE ${R}/issues/1/sub_issue`]: rawIssue(7) })
  github.removeSubIssue(1, 9007)
  const [call] = fake.calls()
  assert.equal(call.key, `DELETE ${R}/issues/1/sub_issue`)
  assert.deepEqual(JSON.parse(call.stdin), { sub_issue_id: 9007 })
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
    [`GET ${R}/issues/7/comments?per_page=100`]: [{ id: 1, user: { login: 'ana' }, body: 'hi', created_at: '2026-10-14T10:00:00Z', html_url: 'https://github.com/o/r/issues/7#issuecomment-1' }],
    [`GET ${R}/labels?per_page=100`]: [{ name: 'tier:easy', color: 'ededed', description: null }],
  })
  assert.deepEqual(github.listComments(7), [{ id: 1, author: 'ana', body: 'hi', createdAt: '2026-10-14T10:00:00Z', url: 'https://github.com/o/r/issues/7#issuecomment-1' }])
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
    [`GET ${R}/pulls/41`]: { number: 41, html_url: 'https://github.com/o/r/pull/41', state: 'closed', head: { ref: 'epic/x', sha: 'def' }, base: { ref: 'main' }, merged_at: '2026-10-15T08:00:00Z', merge_commit_sha: 'fed' },
    [`GET ${R}/pulls/40/reviews?per_page=100`]: [{ id: 3, user: { login: 'copilot-pull-request-reviewer[bot]' }, state: 'COMMENTED', commit_id: 'abc', submitted_at: '2026-10-14T12:00:00Z' }],
  })
  assert.deepEqual(github.getPullRequest(40), { number: 40, url: 'https://github.com/o/r/pull/40', state: 'open', head: 'ticket/2', headSha: 'abc', base: 'main', merged: false, mergedAt: null, mergeCommitSha: null })
  assert.deepEqual(github.getPullRequest(41), { number: 41, url: 'https://github.com/o/r/pull/41', state: 'closed', head: 'epic/x', headSha: 'def', base: 'main', merged: true, mergedAt: '2026-10-15T08:00:00Z', mergeCommitSha: 'fed' })
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

test('viewerLogin takes FLOW_ACCOUNT as it is, asking GitHub nothing', () => {
  fake.setFixtures({})
  assert.equal(github.viewerLogin({ FLOW_ACCOUNT: ' github-actions[bot] ' }), 'github-actions[bot]')
  assert.equal(fake.calls().length, 0)
})

test('linkedProjects reads the linked projects with their Status options, and a project without that field has none', () => {
  fake.setFixtures({
    'graphql name={repo} owner={owner}': {
      data: {
        repository: {
          id: 'R_1',
          owner: { id: 'U_1' },
          projectsV2: {
            nodes: [
              { id: 'PVT_1', title: 'Flow board', field: { id: 'F_1', options: [{ id: 'O_1', name: 'Planned', color: 'GRAY', description: 'not started' }] } },
              { id: 'PVT_2', title: 'Roadmap', field: null },
            ],
          },
        },
      },
    },
  })
  assert.deepEqual(github.linkedProjects(), {
    repositoryId: 'R_1',
    ownerId: 'U_1',
    projects: [
      { id: 'PVT_1', title: 'Flow board', statusField: { id: 'F_1', options: [{ id: 'O_1', name: 'Planned', color: 'GRAY', description: 'not started' }] } },
      { id: 'PVT_2', title: 'Roadmap', statusField: null },
    ],
  })
  assert.match(fake.calls()[0].args.find((arg) => arg.startsWith('query=')), /repository\(owner:\$owner,name:\$name\)\{id owner\{id\} projectsV2\(first:20\).*field\(name:"Status"\).*options\{id name color description\}/)
})

test('linkedProjects turns a GraphQL error into a TrackerError', () => {
  fake.setFixtures({ 'graphql name={repo} owner={owner}': { data: null, errors: [{ message: "The 'projectsV2' field requires one of the following scopes: ['read:project']" }] } })
  assert.throws(() => github.linkedProjects(), (error) => error instanceof github.TrackerError && /read:project/.test(error.message))
})

test('issueProjectItems returns the issue node id and the project of each of its items', () => {
  fake.setFixtures({
    'graphql issue=3 name={repo} owner={owner}': {
      data: {
        repository: {
          issue: {
            id: 'I_3',
            projectItems: {
              nodes: [
                { id: 'PVTI_1', project: { id: 'PVT_1' }, fieldValueByName: { optionId: 'O_2', name: 'In review' } },
                { id: 'PVTI_2', project: { id: 'PVT_2' }, fieldValueByName: null },
              ],
            },
          },
        },
      },
    },
  })
  assert.deepEqual(github.issueProjectItems(3), {
    id: 'I_3',
    items: [
      { id: 'PVTI_1', projectId: 'PVT_1', status: { optionId: 'O_2', name: 'In review' } },
      { id: 'PVTI_2', projectId: 'PVT_2', status: null },
    ],
  })
  const call = fake.calls()[0]
  assert.deepEqual(call.args.slice(-2), ['-F', 'issue=3'])
  assert.match(call.args.find((arg) => arg.startsWith('query=')), /fieldValueByName\(name:"Status"\)\{\.\.\. on ProjectV2ItemFieldSingleSelectValue\{optionId name\}\}/)
})

test('addProjectItem adds the issue to the project and returns the new item id', () => {
  fake.setFixtures({ 'graphql content=I_3 project=PVT_1': { data: { addProjectV2ItemById: { item: { id: 'PVTI_9' } } } } })
  assert.equal(github.addProjectItem('PVT_1', 'I_3'), 'PVTI_9')
  assert.match(fake.calls()[0].args.find((arg) => arg.startsWith('query=')), /addProjectV2ItemById/)
  assert.ok(!fake.calls()[0].args.includes('owner={owner}'), 'a mutation by node id names no repository')
})

test('setProjectSingleSelect sends the project, item, field and option ids', () => {
  fake.setFixtures({ 'graphql field=F_1 item=PVTI_9 option=O_1 project=PVT_1': { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_9' } } } } })
  github.setProjectSingleSelect('PVT_1', 'PVTI_9', 'F_1', 'O_1')
  assert.equal(fake.calls().length, 1)
  assert.match(fake.calls()[0].args.find((arg) => arg.startsWith('query=')), /updateProjectV2ItemFieldValue.*singleSelectOptionId:\$option/)
})

test('createProject creates a project under the owner node and returns it with its Status field', () => {
  fake.setFixtures({
    'graphql ownerId=U_1 title=Flow': {
      data: { createProjectV2: { projectV2: { id: 'PVT_9', title: 'Flow', field: { id: 'F_9', options: [{ id: 'O_t', name: 'Todo', color: 'GREEN', description: '' }] } } } },
    },
  })
  assert.deepEqual(github.createProject('U_1', 'Flow'), { id: 'PVT_9', title: 'Flow', statusField: { id: 'F_9', options: [{ id: 'O_t', name: 'Todo', color: 'GREEN', description: '' }] } })
  assert.match(fake.calls()[0].args.find((arg) => arg.startsWith('query=')), /createProjectV2\(input:\{ownerId:\$ownerId,title:\$title\}\)/)
  assert.ok(!fake.calls()[0].args.includes('owner={owner}'))
})

test('setSingleSelectOptions sends the whole option list as JSON, each with its name, colour and description', () => {
  fake.setFixtures({ 'graphql field=F_9': { data: { updateProjectV2Field: { projectV2Field: { id: 'F_9', options: [{ id: 'O_a', name: 'Todo' }, { id: 'O_b', name: 'Epic' }] } } } } })
  const options = github.setSingleSelectOptions('F_9', [
    { id: 'O_t', name: 'Todo', color: 'GREEN', description: 'kept' },
    { name: 'Epic', color: 'PURPLE', description: '' },
  ])
  assert.deepEqual(options, { fieldId: 'F_9', options: [{ id: 'O_a', name: 'Todo' }, { id: 'O_b', name: 'Epic' }] })
  const call = fake.calls()[0]
  assert.deepEqual(call.args, ['api', 'graphql', '--input', '-'])
  const sent = JSON.parse(call.stdin)
  assert.match(sent.query, /updateProjectV2Field\(input:\{fieldId:\$field,singleSelectOptions:\$options\}\)/)
  assert.deepEqual(sent.variables, {
    field: 'F_9',
    options: [
      { name: 'Todo', color: 'GREEN', description: 'kept' },
      { name: 'Epic', color: 'PURPLE', description: '' },
    ],
  })
})

test('a GraphQL error sent back for a JSON request is a TrackerError too', () => {
  fake.setFixtures({ 'graphql field=F_9': { data: null, errors: [{ message: "Your token has not been granted the required scopes: ['project']" }] } })
  assert.throws(() => github.setSingleSelectOptions('F_9', [{ name: 'Epic', color: 'PURPLE', description: '' }]), (error) => error instanceof github.TrackerError && /project/.test(error.message))
})

test('linkProjectToRepository links the project to the repository by their node ids', () => {
  fake.setFixtures({ 'graphql project=PVT_9 repository=R_1': { data: { linkProjectV2ToRepository: { repository: { id: 'R_1' } } } } })
  github.linkProjectToRepository('PVT_9', 'R_1')
  assert.equal(fake.calls().length, 1)
  assert.match(fake.calls()[0].args.find((arg) => arg.startsWith('query=')), /linkProjectV2ToRepository\(input:\{projectId:\$project,repositoryId:\$repository\}\)/)
})

test('projectItems pages through every item of a project with its issue number and Status', () => {
  const page = (nodes, hasNextPage, endCursor = null) => ({ data: { node: { items: { pageInfo: { hasNextPage, endCursor }, nodes } } } })
  fake.setFixtures({
    'graphql project=PVT_1': page([{ id: 'PVTI_1', content: { __typename: 'Issue', number: 3, repository: { id: 'R_1' } }, fieldValueByName: { optionId: 'O_1', name: 'Todo' } }], true, 'c1'),
    'graphql cursor=c1 project=PVT_1': page([{ id: 'PVTI_2', content: {}, fieldValueByName: null }], false),
  })
  assert.deepEqual(github.projectItems('PVT_1'), [
    { id: 'PVTI_1', kind: 'Issue', number: 3, repositoryId: 'R_1', status: { optionId: 'O_1', name: 'Todo' } },
    { id: 'PVTI_2', kind: null, number: null, repositoryId: null, status: null },
  ])
  assert.deepEqual(fake.calls().map((call) => call.key), ['graphql project=PVT_1', 'graphql cursor=c1 project=PVT_1'])
  assert.match(fake.calls()[0].args.find((arg) => arg.startsWith('query=')), /items\(first:100,after:\$cursor\).*fieldValueByName\(name:"Status"\)/)
})
