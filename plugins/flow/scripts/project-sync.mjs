import * as github from './tracker/github.mjs'

export const PROJECT_STATUSES = [
  { state: 'planned', option: 'Planned' },
  { state: 'in-progress', option: 'In progress' },
  { state: 'in-review', option: 'In review' },
  { state: 'done', option: 'Done' },
  { state: 'needs-human', option: 'Needs human' },
  { state: 'epic', option: 'Epic' },
]

const PERMISSION_TROUBLE = /scope|permission|Resource not accessible/i
const PERMISSION_HINT =
  'the GitHub token may not read or write projects (locally run `gh auth refresh -s project`; in the Action give FLOW_TOKEN the Projects permission, read and write)'

let lookupOnce = null
let lookupReported = false

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()
const oneLine = (text) => String(text).replace(/\s*\n\s*/g, ' ').trim()

function explain(error) {
  return PERMISSION_TROUBLE.test(error.message || '') ? `${PERMISSION_HINT}: ${error.message}` : error.message
}

function missingOptions(project) {
  const options = (project.statusField && project.statusField.options) || []
  return PROJECT_STATUSES.map((status) => status.option).filter((name) => !options.some((option) => sameName(option.name, name)))
}

function lookUp() {
  let projects
  try {
    projects = github.linkedProjects()
  } catch (error) {
    return { board: null, kind: 'unreadable', reason: `could not read the repository's projects, because ${explain(error)}` }
  }
  const board = projects.find((project) => project.statusField && !missingOptions(project).length)
  if (board) {
    const optionIds = new Map(
      PROJECT_STATUSES.map((status) => [status.state, board.statusField.options.find((option) => sameName(option.name, status.option)).id]),
    )
    return { board: { id: board.id, title: board.title, fieldId: board.statusField.id, optionIds }, kind: 'found', reason: null }
  }
  if (!projects.length) return { board: null, kind: 'none', reason: 'no GitHub Project is linked to this repository' }
  const closest = projects.find((project) => project.statusField) || projects[0]
  const missing = missingOptions(closest)
  return { board: null, kind: 'mismatch', title: closest.title, missing, reason: `${closest.title} has no Status options ${missing.join(', ')}` }
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

export function syncProjectStatus(number, state) {
  try {
    const found = findProjectBoard()
    if (!found.board) {
      if (found.kind === 'mismatch' && !lookupReported) report(found.reason)
      lookupReported = true
      return false
    }
    const optionId = found.board.optionIds.get(state)
    if (!optionId) {
      report(`#${number} is in the state "${state}", which no Status option stands for`)
      return false
    }
    const issue = github.issueProjectItems(number)
    const item = issue.items.find((entry) => entry.projectId === found.board.id)
    const itemId = item ? item.id : github.addProjectItem(found.board.id, issue.id)
    github.setProjectSingleSelect(found.board.id, itemId, found.board.fieldId, optionId)
    return true
  } catch (error) {
    report(`#${number} kept its old Status in ${lookupOnce && lookupOnce.board ? lookupOnce.board.title : 'the project'}, because ${explain(error)}`)
    return false
  }
}
