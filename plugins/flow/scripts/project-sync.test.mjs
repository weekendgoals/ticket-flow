import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, realpathSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installFakeGh } from './tracker/fake-gh.mjs'
import { LABELS } from './epic-state.mjs'
import { PROJECT_STATUSES } from './project-sync.mjs'

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
const project = (id, title, field) => ({ id, title, field })
const projects = (...nodes) => ({ data: { repository: { projectsV2: { nodes } } } })
const itemsOf = (number, items) => ({ [`graphql issue=${number} name={repo} owner={owner}`]: { data: { repository: { issue: { id: `I_${number}`, projectItems: { nodes: items } } } } } })
const setStatus = (item, option, project = 'PVT_flow') => `graphql field=F_status item=${item} option=${option} project=${project}`
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
  assert.deepEqual(found.stdout.trim().split('\n'), ['project board: Flow board', 'ok'])
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
