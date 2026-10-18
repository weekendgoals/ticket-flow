import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, realpathSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installFakeGh } from './tracker/fake-gh.mjs'
import { LABELS } from './epic-state.mjs'
import { PROJECT_STATUSES, RELEASE_OPTIONS } from './project-sync.mjs'

const FLOW = join(dirname(fileURLToPath(import.meta.url)), 'flow.mjs')
const R = 'repos/{owner}/{repo}'
const PROJECT_LOOKUP = 'graphql name={repo} owner={owner}'
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-project-sync-')))
after(() => rmSync(directory, { recursive: true, force: true }))
const fake = installFakeGh(join(directory, 'bin'))
const workdir = join(directory, 'work')
mkdirSync(workdir)
beforeEach(() => fake.clearCalls())

function flow(...args) {
  const result = spawnSync(process.execPath, [FLOW, ...args], { cwd: workdir, encoding: 'utf8', env: { ...process.env, ...fake.env } })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function issue(number, { title = `issue ${number}`, body = '', labels = [] } = {}) {
  return { number, id: 5000 + number, title, body, state: 'open', labels: labels.map((name) => ({ name })), assignees: [], user: { login: 'vadim' }, html_url: null }
}

const epicBody = (tickets) => `## Outcome

Travellers can export a trip.

## Settings

Delivery: release
Branch: epic/trip-export

## Walkthrough

A traveller exports a trip.

## Tickets

${tickets.map((number) => `- [ ] #${number} — ticket ${number}`).join('\n')}
`

const ticketBody = (epic) => `Epic: #${epic}

## Scope

- the work

## Acceptance criteria

\`\`\`criteria
- it works
  CHECK: true
\`\`\`
`

const optionId = (name) => `OPT_${name.replace(/\s+/g, '_').toLowerCase()}`
const statusField = (names) => ({ id: 'F_status', options: names.map((name) => ({ id: optionId(name), name })) })
const FLOW_OPTIONS = PROJECT_STATUSES.map((status) => status.option)
const RELEASE_NAMES = RELEASE_OPTIONS.map((entry) => entry.option)
const releaseId = (name) => `REL_${name.replace(/\s+/g, '_').toLowerCase()}`
const releaseField = (names = RELEASE_NAMES, dataType = 'SINGLE_SELECT') => ({ id: 'F_release', name: 'Release', dataType, options: dataType === 'SINGLE_SELECT' ? names.map((name) => ({ id: releaseId(name), name })) : undefined })
const project = (id, title, field, fields = [releaseField()]) => ({ id, title, field, fields: { nodes: fields } })
const projects = (...nodes) => ({ data: { repository: { id: 'R_repo', owner: { id: 'U_owner' }, projectsV2: { nodes } } } })
const onBoard = (id, option = null, project = 'PVT_flow', release = null) => ({ id, project: { id: project }, fieldValueByName: option ? { optionId: option, name: option } : null, release: release ? { optionId: release, name: release } : null })
const itemsOf = (number, items) => ({ [`graphql issue=${number} name={repo} owner={owner}`]: { data: { repository: { issue: { id: `I_${number}`, projectItems: { nodes: items } } } } } })
const setStatus = (item, option, project = 'PVT_flow') => `graphql field=F_status item=${item} option=${option} project=${project}`
const setRelease = (item, option, project = 'PVT_flow') => `graphql field=F_release item=${item} option=${option} project=${project}`
const SET_RESPONSE = { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'x' } } } }

function world(extra = {}) {
  fake.setFixtures({
    '--version': 'gh version 2.96.0 (2026-07-02)\n',
    'auth status': '',
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true },
    [`GET ${R}/labels?per_page=100`]: LABELS.map((label) => ({ name: label.name, color: 'ededed', description: '' })),
    [`GET ${R}/issues?labels=flow%3Aepic&state=open&per_page=100`]: [],
    [`GET ${R}/issues/3`]: issue(3, { labels: ['flow:ticket', 'flow:in-progress'] }),
    [`POST ${R}/issues/3/labels`]: [],
    [`DELETE ${R}/issues/3/labels/flow%3Ain-progress`]: null,
    ...extra,
  })
}

const projectLines = (stderr) => stderr.split('\n').filter((line) => line.startsWith('project board'))
const lookups = () => fake.calls().filter((call) => call.key === PROJECT_LOOKUP).length

test('a state change sets the Status of the issue on the linked project whose options match, with that option id', () => {
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_other', 'Roadmap', statusField(['Todo', 'Done'])), project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    ...itemsOf(3, [{ id: 'PVTI_elsewhere', project: { id: 'PVT_other' } }, { id: 'PVTI_3', project: { id: 'PVT_flow' } }]),
    [setStatus('PVTI_3', 'OPT_in_review')]: SET_RESPONSE,
  })
  const result = flow('label', '3', '+flow:in-review', '-flow:in-progress')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(projectLines(result.stderr), [])
  const set = fake.calls().find((call) => call.key.startsWith('graphql field='))
  assert.equal(set.key, setStatus('PVTI_3', 'OPT_in_review'))
  assert.match(set.args.find((arg) => arg.startsWith('query=')), /updateProjectV2ItemFieldValue/)
  assert.ok(!fake.calls().some((call) => call.key.startsWith('graphql content=')), 'an issue already on the board is not added again')
  assert.equal(lookups(), 1)
})

test('the six Status names are one list, matched without regard to case', () => {
  assert.deepEqual(FLOW_OPTIONS, ['Planned', 'In progress', 'In review', 'Done', 'Needs human', 'Epic'])
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(['planned', 'In Progress', 'In Review', 'DONE', 'Needs Human', 'epic']))),
    ...itemsOf(3, [{ id: 'PVTI_3', project: { id: 'PVT_flow' } }]),
    [setStatus('PVTI_3', 'OPT_needs_human')]: SET_RESPONSE,
    [`POST ${R}/issues/3/comments`]: { id: 1, html_url: null },
  })
  const result = flow('needs-human', '3', '--text', 'The plan and the code disagree.')
  assert.equal(result.status, 0, result.stderr)
  assert.ok(fake.calls().some((call) => call.key === setStatus('PVTI_3', 'OPT_needs_human')))
})

test('an issue not yet on the board is added first, then its Status is set', () => {
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    ...itemsOf(3, []),
    'graphql content=I_3 project=PVT_flow': { data: { addProjectV2ItemById: { item: { id: 'PVTI_new' } } } },
    [setStatus('PVTI_new', 'OPT_done')]: SET_RESPONSE,
  })
  const result = flow('label', '3', '+flow:done', '-flow:in-progress')
  assert.equal(result.status, 0, result.stderr)
  const keys = fake.calls().map((call) => call.key).filter((key) => key.startsWith('graphql'))
  assert.deepEqual(keys, [PROJECT_LOOKUP, 'graphql issue=3 name={repo} owner={owner}', 'graphql content=I_3 project=PVT_flow', setStatus('PVTI_new', 'OPT_done')])
})

test('with no project linked the labels change, nothing is said, and the exit code is the same', () => {
  world({ [PROJECT_LOOKUP]: projects() })
  const result = flow('label', '3', '+flow:in-review', '-flow:in-progress')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /#3: flow:ticket, flow:in-review/)
  assert.equal(result.stderr, '')
  assert.deepEqual(fake.calls().map((call) => call.key).filter((key) => !key.startsWith('GET')), [`POST ${R}/issues/3/labels`, `DELETE ${R}/issues/3/labels/flow%3Ain-progress`, PROJECT_LOOKUP])
})

test('a project whose Status lacks Flow options is named with the missing ones, and nothing is written to it', () => {
  world({ [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(['Todo', 'In Progress', 'Done']))) })
  const result = flow('label', '3', '+flow:in-review', '-flow:in-progress')
  assert.equal(result.status, 0)
  assert.deepEqual(projectLines(result.stderr), ['project board not updated: Flow board has no Status options Planned, In review, Needs human, Epic'])
  assert.deepEqual(fake.calls().map((call) => call.key).filter((key) => key.startsWith('graphql')), [PROJECT_LOOKUP])
})

test('a token that cannot read projects says nothing on a state change, and the command still succeeds', () => {
  world({
    [PROJECT_LOOKUP]: {
      $exit: 1,
      $stderr: "gh: Your token has not been granted the required scopes to execute this query. The 'projectsV2' field requires one of the following scopes: ['read:project'], but your token has only been granted the: ['repo'] scopes.",
    },
  })
  const result = flow('label', '3', '+flow:in-review', '-flow:in-progress')
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  assert.ok(fake.calls().some((call) => call.key === `DELETE ${R}/issues/3/labels/flow%3Ain-progress`))
})

test('a found board that refuses to take a new issue prints one line with the scope hint, and the command still succeeds', () => {
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    ...itemsOf(3, []),
    'graphql content=I_3 project=PVT_flow': { $exit: 1, $stderr: "gh: Your token has not been granted the required scopes to execute this query. The 'addProjectV2ItemById' field requires one of the following scopes: ['project']" },
  })
  const result = flow('label', '3', '+flow:in-review', '-flow:in-progress')
  assert.equal(result.status, 0)
  const lines = projectLines(result.stderr)
  assert.equal(lines.length, 1, result.stderr)
  assert.match(lines[0], /^project board not updated: #3 kept its old Status in Flow board, because the GitHub token may not read or write projects \(locally run `gh auth refresh -s project`/)
  assert.ok(!fake.calls().some((call) => call.key.startsWith('graphql field=')), 'no Status is set on an item that was never added')
})

test('a refused Status change prints one line and leaves the labels changed and the exit code alone', () => {
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    ...itemsOf(3, [{ id: 'PVTI_3', project: { id: 'PVT_flow' } }]),
    [setStatus('PVTI_3', 'OPT_in_review')]: { data: null, errors: [{ message: 'Resource not accessible by integration' }] },
  })
  const result = flow('label', '3', '+flow:in-review', '-flow:in-progress')
  assert.equal(result.status, 0)
  const lines = projectLines(result.stderr)
  assert.equal(lines.length, 1, result.stderr)
  assert.match(lines[0], /^project board not updated: #3 kept its old Status in Flow board, because .*Resource not accessible by integration/)
})

test('a state change on an issue whose board item already shows that Status writes nothing to the board', () => {
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    ...itemsOf(3, [onBoard('PVTI_3', 'OPT_in_review')]),
  })
  const result = flow('label', '3', '+flow:in-review', '-flow:in-progress')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.deepEqual(fake.calls().map((call) => call.key).filter((key) => key.startsWith('graphql')), [PROJECT_LOOKUP, 'graphql issue=3 name={repo} owner={owner}'])
})

test('a label change that moves no state touches no project', () => {
  world({ [`POST ${R}/issues/3/labels`]: [] })
  const result = flow('label', '3', '+tier:easy')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(projectLines(result.stderr), [])
  assert.ok(!fake.calls().some((call) => call.key.startsWith('graphql')))
})

test('create-epic adds the epic to the board as Epic, create-ticket adds the ticket as Planned', () => {
  const epicFile = join(directory, 'epic.md')
  writeFileSync(epicFile, epicBody([]))
  const ticketFile = join(directory, 'ticket.md')
  writeFileSync(ticketFile, ticketBody(40))
  const epic = issue(40, { title: 'Trip export', body: epicBody([]), labels: ['flow:epic'] })
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    [`POST ${R}/issues`]: { $sequence: [epic, issue(41, { labels: ['flow:ticket', 'flow:planned'] })] },
    [`GET ${R}/issues/40`]: epic,
    [`GET ${R}/issues/40/sub_issues?per_page=100`]: [],
    [`POST ${R}/issues/40/sub_issues`]: {},
    [`PATCH ${R}/issues/40`]: epic,
    ...itemsOf(40, []),
    ...itemsOf(41, []),
    'graphql content=I_40 project=PVT_flow': { data: { addProjectV2ItemById: { item: { id: 'PVTI_40' } } } },
    'graphql content=I_41 project=PVT_flow': { data: { addProjectV2ItemById: { item: { id: 'PVTI_41' } } } },
    [setStatus('PVTI_40', 'OPT_epic')]: SET_RESPONSE,
    [setStatus('PVTI_41', 'OPT_planned')]: SET_RESPONSE,
  })
  const created = flow('create-epic', '--title', 'Trip export', '--file', epicFile)
  assert.equal(created.status, 0, created.stderr)
  assert.equal(created.stdout.trim(), '40')
  const ticket = flow('create-ticket', '40', '--title', 'The button', '--file', ticketFile)
  assert.equal(ticket.status, 0, ticket.stderr)
  assert.equal(ticket.stdout.trim(), '41')
  const keys = fake.calls().map((call) => call.key)
  assert.ok(keys.includes(setStatus('PVTI_40', 'OPT_epic')))
  assert.ok(keys.includes(setStatus('PVTI_41', 'OPT_planned')))
  assert.ok(keys.indexOf(`POST ${R}/issues/40/sub_issues`) !== -1, 'the ticket is still linked to its epic')
})

test('doctor names the project board it found, none linked, or the Status options it lacks, and its exit code does not change', () => {
  world({ [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))) })
  const found = flow('doctor')
  assert.equal(found.status, 0, found.stdout)
  assert.deepEqual(found.stdout.trim().split('\n'), ['project board: Flow board, Release field: Building, Pull request open, Released', 'ok'])
  world({ [PROJECT_LOOKUP]: projects() })
  const none = flow('doctor')
  assert.equal(none.status, 0, none.stdout)
  assert.deepEqual(none.stdout.trim().split('\n'), ['project board: none linked', 'ok'])
  world({ [PROJECT_LOOKUP]: projects(project('PVT_plain', 'Roadmap', null), project('PVT_flow', 'Flow board', statusField(['Planned', 'Done']))) })
  const lacking = flow('doctor')
  assert.equal(lacking.status, 0, lacking.stdout)
  assert.deepEqual(lacking.stdout.trim().split('\n'), ['project board: Flow board has no Status options In progress, In review, Needs human, Epic', 'ok'])
  world({ [PROJECT_LOOKUP]: { $exit: 1, $stderr: "gh: The 'projectsV2' field requires one of the following scopes: ['read:project']" } })
  const unreadable = flow('doctor')
  assert.equal(unreadable.status, 0, unreadable.stdout)
  assert.match(unreadable.stdout, /^project board: not checked: could not read the repository's projects, because .*gh auth refresh -s project/)
})

const graphqlKeys = () => fake.calls().map((call) => call.key).filter((key) => key.startsWith('graphql'))
const SCOPE_ERROR = "gh: Your token has not been granted the required scopes to execute this query. The 'createProjectV2' field requires one of the following scopes: ['project']"
const createdProject = (title) => ({
  data: {
    createProjectV2: {
      projectV2: {
        id: 'PVT_new',
        title,
        field: {
          id: 'F_new',
          options: [
            { id: 'O_todo', name: 'Todo', color: 'GREEN', description: '' },
            { id: 'O_ip', name: 'In Progress', color: 'YELLOW', description: '' },
            { id: 'O_done', name: 'Done', color: 'PURPLE', description: '' },
          ],
        },
      },
    },
  },
})
const fieldUpdated = { data: { updateProjectV2Field: { projectV2Field: { id: 'F', options: [] } } } }
const linked = { data: { linkProjectV2ToRepository: { repository: { id: 'R_repo' } } } }
const sentOptions = (key) => JSON.parse(fake.calls().find((call) => call.key === key).stdin).variables.options

test('init --board with a linked board whose Status already matches names it and changes nothing', () => {
  world({ [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))) })
  const result = flow('init', '--board')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.trim().split('\n'), ['all 12 labels already there', 'project board: Flow board'])
  assert.deepEqual(graphqlKeys(), [PROJECT_LOOKUP])
})

const roadmapField = {
  id: 'F_status',
  options: [
    { id: 'O_todo', name: 'Todo', color: 'GREEN', description: 'not yet' },
    { id: 'O_ip', name: 'In Progress', color: 'YELLOW', description: '' },
    { id: 'O_done', name: 'Done', color: 'PURPLE', description: 'shipped' },
  ],
}
const boardItems = (nodes) => ({ data: { node: { items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } })
const itemWith = (id, number, name, { kind = 'Issue', repository = 'R_repo' } = {}) => ({
  id,
  content: number ? { __typename: kind, number, repository: { id: repository } } : { __typename: 'DraftIssue' },
  fieldValueByName: name ? { optionId: `OLD_${name}`, name } : null,
})
const replacedOptions = (names) => ({
  data: { updateProjectV2Field: { projectV2Field: { id: 'F_status', options: names.map((name) => ({ id: `NEW_${name.replace(/\s+/g, '_')}`, name })) } } },
})
const ROADMAP_NAMES = ['Todo', 'In Progress', 'Done', 'Planned', 'In review', 'Needs human', 'Epic']
const lookupThen = (before, after) => ({ $sequence: [before, after] })
const roadmapBefore = projects(project('PVT_road', 'Roadmap', roadmapField))
const roadmapAfter = projects(project('PVT_road', 'Roadmap', statusField(ROADMAP_NAMES)))

test('init --board adds the missing Status options to a linked project, keeping every existing option and setting each item back to its Status under the new ids', () => {
  world({
    [PROJECT_LOOKUP]: lookupThen(roadmapBefore, roadmapAfter),
    'graphql project=PVT_road': boardItems([itemWith('PVTI_a', 7, 'Todo'), itemWith('PVTI_b', 8, 'In Progress'), itemWith('PVTI_draft', null, null), itemWith('PVTI_c', null, 'Done')]),
    'graphql field=F_status': replacedOptions(ROADMAP_NAMES),
    [setStatus('PVTI_a', 'NEW_Todo', 'PVT_road')]: SET_RESPONSE,
    [setStatus('PVTI_b', 'NEW_In_Progress', 'PVT_road')]: SET_RESPONSE,
    [setStatus('PVTI_c', 'NEW_Done', 'PVT_road')]: SET_RESPONSE,
  })
  const result = flow('init', '--board')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'all 12 labels already there',
    'project board: Roadmap, added options Planned, In review, Needs human, Epic, restored 3 item statuses',
    'Flow writes to: Roadmap',
  ])
  assert.deepEqual(graphqlKeys(), [
    PROJECT_LOOKUP,
    'graphql project=PVT_road',
    'graphql field=F_status',
    setStatus('PVTI_a', 'NEW_Todo', 'PVT_road'),
    setStatus('PVTI_b', 'NEW_In_Progress', 'PVT_road'),
    setStatus('PVTI_c', 'NEW_Done', 'PVT_road'),
    PROJECT_LOOKUP,
  ])
  assert.deepEqual(sentOptions('graphql field=F_status'), [
    { name: 'Todo', color: 'GREEN', description: 'not yet' },
    { name: 'In Progress', color: 'YELLOW', description: '' },
    { name: 'Done', color: 'PURPLE', description: 'shipped' },
    { name: 'Planned', color: 'GRAY', description: '' },
    { name: 'In review', color: 'BLUE', description: '' },
    { name: 'Needs human', color: 'RED', description: '' },
    { name: 'Epic', color: 'PURPLE', description: '' },
  ])
})

test('init --board names an item GitHub refuses to set back, restores the others, and exits 1', () => {
  world({
    [PROJECT_LOOKUP]: lookupThen(roadmapBefore, roadmapAfter),
    'graphql project=PVT_road': boardItems([
      itemWith('PVTI_a', 7, 'Todo'),
      itemWith('PVTI_b', 8, 'In Progress', { kind: 'PullRequest' }),
      itemWith('PVTI_c', 9, 'Done', { repository: 'R_elsewhere' }),
      itemWith('PVTI_d', 10, 'Todo'),
    ]),
    'graphql field=F_status': replacedOptions(ROADMAP_NAMES),
    [setStatus('PVTI_a', 'NEW_Todo', 'PVT_road')]: SET_RESPONSE,
    [setStatus('PVTI_b', 'NEW_In_Progress', 'PVT_road')]: { data: null, errors: [{ message: 'Resource not accessible by integration' }] },
    [setStatus('PVTI_c', 'NEW_Done', 'PVT_road')]: { data: null, errors: [{ message: 'Something went wrong' }] },
    [setStatus('PVTI_d', 'NEW_Todo', 'PVT_road')]: SET_RESPONSE,
  })
  const result = flow('init', '--board')
  assert.equal(result.status, 1)
  assert.match(result.stdout, /restored 2 item statuses\nFlow writes to: Roadmap/)
  const lines = result.stderr.trim().split('\n')
  assert.equal(lines.length, 2, result.stderr)
  assert.match(
    lines[0],
    /^PR #8 was "In Progress" and could not be set back, because the GitHub token may not .*Resource not accessible by integration; `flow board-sync` restores every Flow issue from its labels, and a draft or pull request is set by hand$/,
  )
  assert.match(lines[1], /^item PVTI_c was "Done" and could not be set back, because /)
  assert.deepEqual(
    graphqlKeys().filter((key) => key.includes('item=')),
    [setStatus('PVTI_a', 'NEW_Todo', 'PVT_road'), setStatus('PVTI_b', 'NEW_In_Progress', 'PVT_road'), setStatus('PVTI_c', 'NEW_Done', 'PVT_road'), setStatus('PVTI_d', 'NEW_Todo', 'PVT_road')],
  )
})

test('init --board picks the linked project with the title given, adopts the only one with a Status field, and refuses to guess among several', () => {
  const linkedTwo = projects(project('PVT_road', 'Roadmap', roadmapField), project('PVT_ops', 'Ops', statusField(['Todo'])), project('PVT_plain', 'Notes', null))
  world({ [PROJECT_LOOKUP]: linkedTwo })
  const guess = flow('init', '--board')
  assert.equal(guess.status, 2)
  assert.match(guess.stderr, /^flow: several projects linked to this repository have a Status field \(Roadmap, Ops\), and none is titled Flow; run `flow init --board "<title>"`/)
  assert.deepEqual(graphqlKeys(), [PROJECT_LOOKUP])
  fake.clearCalls()
  world({
    [PROJECT_LOOKUP]: lookupThen(linkedTwo, projects(project('PVT_road', 'Roadmap', statusField(ROADMAP_NAMES)), project('PVT_ops', 'Ops', statusField(['Todo'])))),
    'graphql project=PVT_road': boardItems([]),
    'graphql field=F_status': replacedOptions(ROADMAP_NAMES),
  })
  const named = flow('init', '--board', 'roadmap')
  assert.equal(named.status, 0, named.stderr)
  assert.match(named.stdout, /project board: Roadmap, added options Planned, In review, Needs human, Epic, restored 0 item statuses\nFlow writes to: Roadmap$/m)
  fake.clearCalls()
  world({ [PROJECT_LOOKUP]: projects(project('PVT_plain', 'Notes', null), project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS)), project('PVT_ops', 'Ops', statusField(['Todo']))) })
  const matching = flow('init', '--board')
  assert.equal(matching.status, 0, matching.stderr)
  assert.match(matching.stdout, /project board: Flow board$/m)
  assert.deepEqual(graphqlKeys(), [PROJECT_LOOKUP])
})

test('init --board changes nothing and exits 2 when the board of the title asked for is not the one Flow writes to', () => {
  world({ [PROJECT_LOOKUP]: projects(project('PVT_road', 'Roadmap', statusField(FLOW_OPTIONS)), project('PVT_flow', 'Flow', statusField(['Todo']))) })
  const result = flow('init', '--board')
  assert.equal(result.status, 2)
  assert.match(
    result.stderr,
    /^flow: Roadmap is linked to this repository and already carries all six Status options, so Flow writes to it, not to Flow; to use Flow, unlink Roadmap from the repository first, or run `flow init --board "Roadmap"` to keep Roadmap$/m,
  )
  assert.deepEqual(graphqlKeys(), [PROJECT_LOOKUP])
})

test('init --board with no project linked creates one with the title given, gives it the six options, links it, and names the two steps left by hand', () => {
  world({
    [PROJECT_LOOKUP]: lookupThen(projects(), projects(project('PVT_new', 'Trip board', statusField(FLOW_OPTIONS)))),
    'graphql ownerId=U_owner title=Trip board': createdProject('Trip board'),
    'graphql field=F_new': fieldUpdated,
    'graphql project=PVT_new repository=R_repo': linked,
  })
  const result = flow('init', '--board', 'Trip board')
  assert.equal(result.status, 0, result.stderr)
  const lines = result.stdout.trim().split('\n')
  assert.deepEqual(lines.slice(0, 2), ['all 12 labels already there', 'project board: created Trip board and linked it'])
  assert.equal(lines.length, 5)
  assert.match(lines[2], /Board layout and set Swimlanes to "Parent issue"/)
  assert.match(lines[3], /auto-add workflow .* is:issue label:flow:ticket,flow:epic$/)
  assert.equal(lines[4], 'Flow writes to: Trip board')
  assert.deepEqual(graphqlKeys(), [PROJECT_LOOKUP, 'graphql ownerId=U_owner title=Trip board', 'graphql field=F_new', 'graphql project=PVT_new repository=R_repo', PROJECT_LOOKUP])
  assert.deepEqual(
    sentOptions('graphql field=F_new'),
    PROJECT_STATUSES.map((status) => ({ name: status.option, color: status.color, description: '' })),
  )
  fake.clearCalls()
  world({
    [PROJECT_LOOKUP]: projects(),
    'graphql ownerId=U_owner title=Trip board': createdProject('Trip board'),
    'graphql field=F_new': fieldUpdated,
    'graphql project=PVT_new repository=R_repo': linked,
  })
  const unseen = flow('init', '--board', 'Trip board')
  assert.equal(unseen.status, 1)
  assert.match(unseen.stderr, /^Trip board was set up, but Flow writes to no board, because no GitHub Project is linked to this repository; `flow doctor` names the board Flow uses$/m)
})

test('init --board stops with exit 1 and the scope hint when the token may not touch projects, and a half-made board says how to finish it', () => {
  world({ [PROJECT_LOOKUP]: { $exit: 1, $stderr: "gh: The 'projectsV2' field requires one of the following scopes: ['read:project']" } })
  const unreadable = flow('init', '--board')
  assert.equal(unreadable.status, 1)
  assert.match(unreadable.stderr, /^flow: the project board was not set up: could not read the repository's projects, because .*gh auth refresh -s project/)
  world({ [PROJECT_LOOKUP]: projects(), 'graphql ownerId=U_owner title=Flow': { $exit: 1, $stderr: SCOPE_ERROR } })
  const refused = flow('init', '--board')
  assert.equal(refused.status, 1)
  assert.match(refused.stdout, /all 12 labels already there/)
  assert.match(refused.stderr, /^flow: the project board was not set up, because the GitHub token may not read or write projects \(locally run `gh auth refresh -s project`/)
  world({
    [PROJECT_LOOKUP]: projects(),
    'graphql ownerId=U_owner title=Trip board': createdProject('Trip board'),
    'graphql field=F_new': fieldUpdated,
    'graphql project=PVT_new repository=R_repo': { data: null, errors: [{ message: 'Resource not accessible by integration' }] },
  })
  const halfway = flow('init', '--board', 'Trip board')
  assert.equal(halfway.status, 1)
  assert.match(halfway.stderr, /^flow: Trip board was created but is not ready, because .*Resource not accessible by integration; link it to the repository by hand .* run `flow init --board "Trip board"` again/)
})

test('init without --board touches no project, and a title without --board is refused', () => {
  world({})
  const plain = flow('init')
  assert.equal(plain.status, 0, plain.stderr)
  assert.deepEqual(graphqlKeys(), [])
  const stray = flow('init', 'Trip board')
  assert.equal(stray.status, 2)
  assert.match(stray.stderr, /a title goes with --board/)
})

function boardWorld(extra = {}) {
  const epic = issue(40, { title: 'Trip export', body: epicBody([41, 42, 43, 44, 45]), labels: ['flow:epic', 'flow:approved'] })
  const subs = [
    issue(41, { labels: ['flow:ticket', 'flow:in-review'] }),
    issue(42, { labels: ['flow:ticket', 'flow:done'] }),
    issue(43, { labels: ['flow:ticket', 'flow:planned'] }),
    issue(44, { labels: ['flow:found'] }),
    issue(45, { labels: ['flow:ticket'] }),
  ]
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    [`GET ${R}/issues?labels=flow%3Aepic&state=open&per_page=100`]: [epic],
    [`GET ${R}/issues/40`]: epic,
    [`GET ${R}/issues/40/sub_issues?per_page=100`]: subs,
    [`GET ${R}/issues?labels=flow%3Aticket&state=open&per_page=100`]: [subs[0], subs[1], issue(50, { labels: ['flow:ticket', 'flow:in-progress'] })],
    ...itemsOf(40, [onBoard('PVTI_40', 'OPT_epic', 'PVT_flow', releaseId('Building'))]),
    [`GET ${R}/issues/40/comments?per_page=100`]: [],
    [`PATCH ${R}/issues/42`]: { ...subs[1], state: 'closed' },
    ...itemsOf(41, [onBoard('PVTI_41x', 'OPT_planned', 'PVT_other'), onBoard('PVTI_41', 'OPT_in_review')]),
    ...itemsOf(42, [onBoard('PVTI_42', 'OPT_planned')]),
    ...itemsOf(43, []),
    ...itemsOf(50, [onBoard('PVTI_50')]),
    'graphql content=I_43 project=PVT_flow': { data: { addProjectV2ItemById: { item: { id: 'PVTI_43' } } } },
    [setStatus('PVTI_42', 'OPT_done')]: SET_RESPONSE,
    [setStatus('PVTI_43', 'OPT_planned')]: SET_RESPONSE,
    [setStatus('PVTI_50', 'OPT_in_progress')]: SET_RESPONSE,
    ...extra,
  })
}

const writes = () => graphqlKeys().filter((key) => key.startsWith('graphql field=') || key.startsWith('graphql content='))

test('board-sync sets every epic and ticket whose Status is wrong or missing, leaves the right ones alone, and skips findings and unreadable states', () => {
  boardWorld()
  const result = flow('board-sync')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.trim().split('\n'), [
    '#42 → Done',
    '#42 closed as completed: it is done',
    '#43 → Planned (added to the board)',
    '#45 skipped: it has no state label (flow:planned, flow:in-progress, …)',
    '#50 → In progress',
    '3 set, 2 already right, 2 skipped, 1 closed',
  ])
  assert.deepEqual(JSON.parse(fake.calls().find((call) => call.key === `PATCH ${R}/issues/42`).stdin), { state: 'closed', state_reason: 'completed' })
  assert.deepEqual(writes(), [setStatus('PVTI_42', 'OPT_done'), 'graphql content=I_43 project=PVT_flow', setStatus('PVTI_43', 'OPT_planned'), setStatus('PVTI_50', 'OPT_in_progress')])
  assert.ok(!graphqlKeys().includes('graphql issue=44 name={repo} owner={owner}'), 'a finding is not looked up on the board')
  assert.equal(lookups(), 1)
})

test('board-sync of one epic reads only that epic, and --json gives the counts and each change', () => {
  boardWorld()
  const result = flow('board-sync', '40', '--json')
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.board, 'Flow board')
  assert.deepEqual([report.set, report.alreadyRight, report.skipped, report.failed], [2, 2, 2, 0])
  assert.deepEqual(report.changes, [
    { number: 42, status: 'Done', added: false },
    { number: 43, status: 'Planned', added: true },
  ])
  assert.deepEqual(report.alreadyRightIssues, [40, 41])
  assert.deepEqual(report.closed, [42])
  assert.deepEqual(report.releases, [])
  assert.deepEqual(report.skippedIssues.map((entry) => entry.number), [44, 45])
  assert.ok(!fake.calls().some((call) => call.key.includes('flow%3Aticket')), 'tickets with no epic are read only when no epic is named')
})

test('board-sync with no matching board linked exits 1 with one sentence naming init --board, and writes nothing', () => {
  boardWorld({ [PROJECT_LOOKUP]: projects() })
  const none = flow('board-sync')
  assert.equal(none.status, 1)
  assert.equal(none.stdout, '')
  assert.match(none.stderr, /^flow: there is no project board to sync, because no GitHub Project is linked to this repository; `flow init --board` creates one/)
  assert.deepEqual(graphqlKeys(), [PROJECT_LOOKUP])
  boardWorld({ [PROJECT_LOOKUP]: projects(project('PVT_road', 'Roadmap', statusField(['Todo', 'Done']))) })
  const lacking = flow('board-sync')
  assert.equal(lacking.status, 1)
  assert.match(lacking.stderr, /Roadmap has no Status options Planned, In progress, In review, Needs human, Epic; `flow init --board`/)
})

test('board-sync prints a refused issue, goes on with the rest, and exits 1 at the end', () => {
  boardWorld({ [setStatus('PVTI_42', 'OPT_done')]: { data: null, errors: [{ message: 'Resource not accessible by integration' }] } })
  const result = flow('board-sync')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^#42 kept its old Status, because the GitHub token may not read or write projects .*Resource not accessible by integration$/m)
  assert.deepEqual(
    result.stdout.trim().split('\n').filter((line) => !line.includes('skipped:')),
    ['#42 closed as completed: it is done', '#43 → Planned (added to the board)', '#50 → In progress', '2 set, 2 already right, 2 skipped, 1 closed, 1 failed'],
  )
  assert.ok(writes().includes(setStatus('PVTI_50', 'OPT_in_progress')))
})

test('board-sync closes the done tickets of a release epic only, and leaves a closed one and an incremental epic\'s tickets alone', () => {
  const incrementalBody = epicBody([61]).replace('Delivery: release\nBranch: epic/trip-export', 'Delivery: incremental')
  const incremental = issue(60, { title: 'Small fixes', body: incrementalBody, labels: ['flow:epic', 'flow:approved'] })
  const closedDone = { ...issue(46, { labels: ['flow:ticket', 'flow:done'] }), state: 'closed' }
  boardWorld({
    [`GET ${R}/issues?labels=flow%3Aepic&state=open&per_page=100`]: [issue(40, { title: 'Trip export', body: epicBody([41, 42, 43, 44, 45, 46]), labels: ['flow:epic', 'flow:approved'] }), incremental],
    [`GET ${R}/issues/40/sub_issues?per_page=100`]: [issue(42, { labels: ['flow:ticket', 'flow:done'] }), closedDone],
    [`GET ${R}/issues/60/sub_issues?per_page=100`]: [issue(61, { labels: ['flow:ticket', 'flow:done'] })],
    [`GET ${R}/issues?labels=flow%3Aticket&state=open&per_page=100`]: [],
    ...itemsOf(46, [onBoard('PVTI_46', 'OPT_done')]),
    ...itemsOf(60, [onBoard('PVTI_60', 'OPT_epic')]),
    ...itemsOf(61, [onBoard('PVTI_61', 'OPT_done')]),
  })
  const result = flow('board-sync', '--json')
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.closed, [42])
  assert.deepEqual(report.releases, [], 'an incremental epic gets no Release value')
  assert.deepEqual(fake.calls().filter((call) => call.key.startsWith('PATCH')).map((call) => call.key), [`PATCH ${R}/issues/42`])
  assert.ok(!fake.calls().some((call) => call.key === `GET ${R}/issues/60/comments?per_page=100`), 'an incremental epic\'s comments are not read for a Release value')
})

const releaseComment = (number) => ({ id: 9, user: { login: 'flow-bot' }, body: `<!-- flow:release-pr number=${number} -->\n**Release pull request opened**`, created_at: '2026-10-16T10:00:00Z' })

test('board-sync derives each release epic\'s Release: Building, Pull request open while the epic is open, Released once it closed with its pull request merged', () => {
  const epic = issue(40, { title: 'Trip export', body: epicBody([42]), labels: ['flow:epic', 'flow:approved'] })
  const only = (extra) => ({
    [`GET ${R}/issues/40/sub_issues?per_page=100`]: [],
    ...itemsOf(40, [onBoard('PVTI_40', 'OPT_epic', 'PVT_flow', releaseId('Building'))]),
    ...extra,
  })
  boardWorld(only({ [`GET ${R}/issues/40`]: epic }))
  const building = flow('board-sync', '40')
  assert.equal(building.status, 0, building.stderr)
  assert.deepEqual(building.stdout.trim().split('\n'), ['0 set, 1 already right, 0 skipped'])
  assert.ok(!graphqlKeys().some((key) => key.startsWith('graphql field=F_release')), 'a Release already right is not written')
  boardWorld(only({ [`GET ${R}/issues/40`]: epic, [`GET ${R}/issues/40/comments?per_page=100`]: [releaseComment(77)], [setRelease('PVTI_40', releaseId('Pull request open'))]: SET_RESPONSE }))
  const open = flow('board-sync', '40', '--json')
  assert.equal(open.status, 0, open.stderr)
  assert.deepEqual(JSON.parse(open.stdout).releases, [{ number: 40, release: 'Pull request open' }])
  boardWorld(
    only({
      [`GET ${R}/issues/40`]: { ...epic, state: 'closed' },
      [`GET ${R}/issues/40/comments?per_page=100`]: [releaseComment(77)],
      [`GET ${R}/pulls/77`]: { number: 77, state: 'closed', merged_at: '2026-10-17T10:00:00Z', merge_commit_sha: 'abc', head: { ref: 'epic/trip-export' }, base: { ref: 'main' } },
      [setRelease('PVTI_40', releaseId('Released'))]: SET_RESPONSE,
    }),
  )
  const released = flow('board-sync', '40')
  assert.equal(released.status, 0, released.stderr)
  assert.deepEqual(released.stdout.trim().split('\n'), ['#40 Release → Released', '0 set, 1 already right, 0 skipped, 1 Release set'])
})

test('board-sync on a board with no Release field still sets every Status, and says once that init --board adds the field', () => {
  boardWorld({ [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS), [])) })
  const result = flow('board-sync')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(projectLines(result.stderr), ['project board not updated: Flow board has no Release field; `flow init --board` adds it'])
  assert.ok(!fake.calls().some((call) => call.key === `GET ${R}/issues/40/comments?per_page=100`))
})

test('create-epic sets a release epic\'s Release to Building, an incremental epic gets none, and release-pr sets Pull request open', () => {
  const epicFile = join(directory, 'release-epic.md')
  writeFileSync(epicFile, epicBody([]))
  const incrementalFile = join(directory, 'incremental-epic.md')
  writeFileSync(incrementalFile, epicBody([]).replace('Delivery: release\nBranch: epic/trip-export', 'Delivery: incremental'))
  const created = issue(40, { title: 'Trip export', body: epicBody([]), labels: ['flow:epic'] })
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    [`POST ${R}/issues`]: created,
    ...itemsOf(40, [onBoard('PVTI_40', 'OPT_epic')]),
    [setRelease('PVTI_40', releaseId('Building'))]: SET_RESPONSE,
  })
  assert.equal(flow('create-epic', '--title', 'Trip export', '--file', epicFile).status, 0)
  assert.ok(graphqlKeys().includes(setRelease('PVTI_40', releaseId('Building'))))
  fake.clearCalls()
  assert.equal(flow('create-epic', '--title', 'Small fixes', '--file', incrementalFile).status, 0)
  assert.ok(!graphqlKeys().some((key) => key.startsWith('graphql field=F_release')), 'an incremental epic ships ticket by ticket, so it has no Release value')
  fake.clearCalls()
  const epic = issue(40, { title: 'Trip export', body: epicBody([42]), labels: ['flow:epic', 'flow:approved'] })
  world({
    [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS))),
    [`GET ${R}/issues/40`]: epic,
    [`GET ${R}/issues/40/sub_issues?per_page=100`]: [issue(42, { body: ticketBody(40), labels: ['flow:ticket', 'flow:done'] })],
    [`GET ${R}/issues/42/comments?per_page=100`]: [],
    graphql: { data: { viewer: { login: 'flow-bot' } } },
    [`GET ${R}/pulls?head=o%3Aepic%2Ftrip-export&state=open&per_page=100`]: [],
    [`POST ${R}/pulls`]: { number: 77, html_url: 'https://github.com/o/r/pull/77', state: 'open', head: { ref: 'epic/trip-export' }, base: { ref: 'main' } },
    [`POST ${R}/issues/40/comments`]: { id: 1, html_url: null },
    ...itemsOf(40, [onBoard('PVTI_40', 'OPT_epic', 'PVT_flow', releaseId('Building'))]),
    [setRelease('PVTI_40', releaseId('Pull request open'))]: SET_RESPONSE,
  })
  const opened = flow('release-pr', '40')
  assert.equal(opened.status, 0, opened.stderr)
  const keys = fake.calls().map((call) => call.key)
  assert.ok(keys.indexOf(setRelease('PVTI_40', releaseId('Pull request open'))) > keys.indexOf(`POST ${R}/pulls`), 'the Release moves once the pull request exists')
})

test('init --board adds the Release field a board lacks, completes its options keeping each epic\'s value, and refuses one of another kind', () => {
  const bare = projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS), []))
  world({
    [PROJECT_LOOKUP]: lookupThen(bare, projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS)))),
    'graphql dataType=SINGLE_SELECT name=Release project=PVT_flow': { data: { createProjectV2Field: { projectV2Field: releaseField() } } },
  })
  const created = flow('init', '--board')
  assert.equal(created.status, 0, created.stderr)
  assert.deepEqual(created.stdout.trim().split('\n'), ['all 12 labels already there', 'project board: Flow board', 'project board: Flow board, added the field Release (Building, Pull request open, Released)'])
  assert.deepEqual(
    JSON.parse(fake.calls().find((call) => call.key === 'graphql dataType=SINGLE_SELECT name=Release project=PVT_flow').stdin).variables.options,
    RELEASE_OPTIONS.map((entry) => ({ name: entry.option, color: entry.color, description: entry.description })),
  )
  fake.clearCalls()
  const partial = projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS), [releaseField(['Building'])]))
  world({
    [PROJECT_LOOKUP]: lookupThen(partial, projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS)))),
    'graphql project=PVT_flow': boardItems([{ ...itemWith('PVTI_40', 40, 'Epic'), release: { optionId: releaseId('Building'), name: 'Building' } }, itemWith('PVTI_41', 41, 'Planned')]),
    'graphql field=F_release': { data: { updateProjectV2Field: { projectV2Field: { id: 'F_release', options: RELEASE_NAMES.map((name) => ({ id: `NEW_${name}`, name })) } } } },
    [setRelease('PVTI_40', 'NEW_Building')]: SET_RESPONSE,
  })
  const completed = flow('init', '--board')
  assert.equal(completed.status, 0, completed.stderr)
  assert.match(completed.stdout, /project board: Flow board, added Release options Pull request open, Released, restored 1 Release values$/m)
  assert.deepEqual(graphqlKeys(), [PROJECT_LOOKUP, 'graphql project=PVT_flow', 'graphql field=F_release', setRelease('PVTI_40', 'NEW_Building')])
  fake.clearCalls()
  world({ [PROJECT_LOOKUP]: projects(project('PVT_flow', 'Flow board', statusField(FLOW_OPTIONS), [releaseField(RELEASE_NAMES, 'TEXT')])) })
  const wrong = flow('init', '--board')
  assert.equal(wrong.status, 1)
  assert.match(wrong.stderr, /^Flow board has a field named Release that is a text field, not a single select one; Flow leaves the field as it is/m)
  assert.deepEqual(graphqlKeys(), [PROJECT_LOOKUP])
})
