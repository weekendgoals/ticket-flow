import * as github from './tracker/github.mjs'
import { TrackerError } from './tracker/github.mjs'

export const PROJECT_STATUSES = [
  { state: 'planned', option: 'Planned', color: 'GRAY' },
  { state: 'in-progress', option: 'In progress', color: 'YELLOW' },
  { state: 'in-review', option: 'In review', color: 'BLUE' },
  { state: 'done', option: 'Done', color: 'GREEN' },
  { state: 'needs-human', option: 'Needs human', color: 'RED' },
  { state: 'epic', option: 'Epic', color: 'PURPLE' },
]

export const DEFAULT_BOARD_TITLE = 'Flow'
export const BOARD_STEPS_BY_HAND = [
  'by hand, in the project: use the Board layout and set Swimlanes to "Parent issue", so each epic is one swimlane',
  'by hand, in the project: turn on the auto-add workflow (Workflows → Auto-add to project) for this repository with the filter is:issue label:flow:ticket,flow:epic',
]

const PERMISSION_TROUBLE = /scope|permission|Resource not accessible/i
const PERMISSION_HINT =
  'the GitHub token may not read or write projects (locally run `gh auth refresh -s project`; in the Action give FLOW_TOKEN the Projects permission, read and write)'

let lookupOnce = null
let lookupReported = false

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()
export const oneLine = (text) => String(text).replace(/\s*\n\s*/g, ' ').trim()

export function explain(error) {
  return PERMISSION_TROUBLE.test(error.message || '') ? `${PERMISSION_HINT}: ${error.message}` : error.message
}

export function statusOptionName(state) {
  const status = PROJECT_STATUSES.find((entry) => entry.state === state)
  return status ? status.option : null
}

function missingOptions(project) {
  const options = (project.statusField && project.statusField.options) || []
  return PROJECT_STATUSES.map((status) => status.option).filter((name) => !options.some((option) => sameName(option.name, name)))
}

function lookUp() {
  let linked
  try {
    linked = github.linkedProjects()
  } catch (error) {
    return { board: null, kind: 'unreadable', reason: `could not read the repository's projects, because ${explain(error)}` }
  }
  const { projects } = linked
  const repository = { id: linked.repositoryId, ownerId: linked.ownerId }
  const board = projects.find((project) => project.statusField && !missingOptions(project).length)
  if (board) {
    const optionIds = new Map(
      PROJECT_STATUSES.map((status) => [status.state, board.statusField.options.find((option) => sameName(option.name, status.option)).id]),
    )
    return { board: { id: board.id, title: board.title, fieldId: board.statusField.id, optionIds }, kind: 'found', reason: null, repository }
  }
  if (!projects.length) return { board: null, kind: 'none', reason: 'no GitHub Project is linked to this repository', repository }
  const closest = projects.find((project) => project.statusField) || projects[0]
  const missing = missingOptions(closest)
  return { board: null, kind: 'mismatch', title: closest.title, project: closest, missing, reason: `${closest.title} has no Status options ${missing.join(', ')}`, repository }
}

export function findProjectBoard() {
  if (!lookupOnce) lookupOnce = lookUp()
  return lookupOnce
}

export function projectBoardLine() {
  const found = findProjectBoard()
  if (found.kind === 'found') return `project board: ${found.board.title}`
  if (found.kind === 'none') return 'project board: none linked'
  if (found.kind === 'mismatch') return `project board: ${found.reason}`
  return `project board: not checked: ${oneLine(found.reason)}`
}

function report(line) {
  process.stderr.write(`project board not updated: ${oneLine(line)}\n`)
}

export function placeOnBoard(board, number, state) {
  const optionId = board.optionIds.get(state)
  if (!optionId) throw new TrackerError(`#${number} is in the state "${state}", which no Status option stands for`)
  const issue = github.issueProjectItems(number)
  const item = issue.items.find((entry) => entry.projectId === board.id)
  if (item && item.status && item.status.optionId === optionId) return 'already right'
  const itemId = item ? item.id : github.addProjectItem(board.id, issue.id)
  github.setProjectSingleSelect(board.id, itemId, board.fieldId, optionId)
  return item ? 'set' : 'added'
}

export function syncProjectStatus(number, state) {
  try {
    const found = findProjectBoard()
    if (!found.board) {
      if (found.kind === 'mismatch' && !lookupReported) report(found.reason)
      lookupReported = true
      return false
    }
    if (!found.board.optionIds.get(state)) {
      report(`#${number} is in the state "${state}", which no Status option stands for`)
      return false
    }
    placeOnBoard(found.board, number, state)
    return true
  } catch (error) {
    report(`#${number} kept its old Status in ${lookupOnce && lookupOnce.board ? lookupOnce.board.title : 'the project'}, because ${explain(error)}`)
    return false
  }
}

const newOption = (status) => ({ name: status.option, color: status.color, description: '' })

function notSetUp(step) {
  try {
    return step()
  } catch (error) {
    if (!(error instanceof TrackerError) || error.missing) throw error
    throw new TrackerError(`the project board was not set up, because ${oneLine(explain(error))}`)
  }
}

function completeOptions(project, missing) {
  notSetUp(() =>
    github.setSingleSelectOptions(project.statusField.id, [
      ...project.statusField.options,
      ...PROJECT_STATUSES.filter((status) => missing.includes(status.option)).map(newOption),
    ]),
  )
  return [`project board: ${project.title}, added options ${missing.join(', ')}`]
}

function createBoard(repository, title) {
  if (!repository.id || !repository.ownerId) throw new TrackerError('the project board was not set up, because GitHub did not return the ids of this repository and its owner')
  const project = notSetUp(() => github.createProject(repository.ownerId, title))
  try {
    if (!project.statusField) throw new TrackerError(`${project.title} came without a Status field`)
    github.setSingleSelectOptions(project.statusField.id, PROJECT_STATUSES.map(newOption))
    github.linkProjectToRepository(project.id, repository.id)
  } catch (error) {
    if (!(error instanceof TrackerError) || error.missing) throw error
    throw new TrackerError(
      `${project.title} was created but is not ready, because ${oneLine(explain(error))}; link it to the repository by hand (the repository's Projects tab → Link a project) and run \`flow init --board\` again, which adds the Status options it lacks instead of creating a second project`,
    )
  }
  return [`project board: created ${project.title} and linked it`, ...BOARD_STEPS_BY_HAND]
}

export function ensureProjectBoard(title = DEFAULT_BOARD_TITLE) {
  const found = findProjectBoard()
  if (found.kind === 'found') return [`project board: ${found.board.title}`]
  if (found.kind === 'unreadable') throw new TrackerError(`the project board was not set up: ${oneLine(found.reason)}`)
  if (found.kind === 'none') return createBoard(found.repository, title)
  if (!found.project.statusField)
    throw new TrackerError(
      `the project board was not set up: ${found.project.title} is linked to this repository but has no Status field; add a single-select field named Status to it, or unlink it so \`flow init --board\` creates a board`,
    )
  return completeOptions(found.project, found.missing)
}
