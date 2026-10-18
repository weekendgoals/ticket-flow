import * as github from './tracker/github.mjs'
import { TrackerError } from './tracker/github.mjs'
import { RELEASE_STAGES } from './epic-state.mjs'

export const PROJECT_STATUSES = [
  { state: 'planned', option: 'Planned', color: 'GRAY' },
  { state: 'in-progress', option: 'In progress', color: 'YELLOW' },
  { state: 'in-review', option: 'In review', color: 'BLUE' },
  { state: 'done', option: 'Done', color: 'GREEN' },
  { state: 'needs-human', option: 'Needs human', color: 'RED' },
  { state: 'epic', option: 'Epic', color: 'PURPLE' },
]

export const RELEASE_FIELD = 'Release'
export const RELEASE_OPTIONS = [
  { option: RELEASE_STAGES.building, color: 'YELLOW', description: 'Its tickets are being built' },
  { option: RELEASE_STAGES.open, color: 'BLUE', description: 'Every ticket is done; the release pull request waits for a person' },
  { option: RELEASE_STAGES.released, color: 'GREEN', description: 'The release pull request merged into the default branch' },
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
const reportedOnce = new Set()

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()
export const oneLine = (text) => String(text).replace(/\s*\n\s*/g, ' ').trim()

export function explain(error) {
  return PERMISSION_TROUBLE.test(error.message || '') ? `${PERMISSION_HINT}: ${error.message}` : error.message
}

export function statusOptionName(state) {
  const status = PROJECT_STATUSES.find((entry) => entry.state === state)
  return status ? status.option : null
}

function lacking(options, wanted) {
  return wanted.filter((name) => !(options || []).some((option) => sameName(option.name, name)))
}

function missingOptions(project) {
  return lacking(project.statusField && project.statusField.options, PROJECT_STATUSES.map((status) => status.option))
}

export function fieldNamed(board, name) {
  return (board.fields || []).find((field) => sameName(field.name, name)) || null
}

const FIELD_KINDS = { SINGLE_SELECT: 'single select', NUMBER: 'number', TEXT: 'text', DATE: 'date', ITERATION: 'iteration' }
const kindOf = (field) => FIELD_KINDS[field.dataType] || String(field.dataType || 'unknown').toLowerCase()

export function wrongKind(board, field, wanted) {
  return `${board.title} has a field named ${field.name} that is a ${kindOf(field)} field, not a ${FIELD_KINDS[wanted]} one; Flow leaves the field as it is, so rename or remove it and run \`flow init --board\` again`
}

export function releaseFieldOf(board) {
  const field = fieldNamed(board, RELEASE_FIELD)
  if (!field) return { problem: `${board.title} has no ${RELEASE_FIELD} field; \`flow init --board\` adds it`, missing: true }
  if (field.dataType !== 'SINGLE_SELECT') return { problem: wrongKind(board, field, 'SINGLE_SELECT'), field }
  const missing = lacking(field.options, RELEASE_OPTIONS.map((entry) => entry.option))
  if (missing.length) return { problem: `${board.title}'s ${RELEASE_FIELD} field has no options ${missing.join(', ')}; \`flow init --board\` adds them`, field, missingOptions: missing }
  return { field, optionIds: new Map(RELEASE_OPTIONS.map((entry) => [entry.option, field.options.find((option) => sameName(option.name, entry.option)).id])) }
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
    return { board: { id: board.id, title: board.title, fieldId: board.statusField.id, optionIds, fields: board.fields || [] }, kind: 'found', reason: null, repository, projects }
  }
  if (!projects.length) return { board: null, kind: 'none', reason: 'no GitHub Project is linked to this repository', repository, projects }
  const closest = projects.find((project) => project.statusField) || projects[0]
  const missing = missingOptions(closest)
  return { board: null, kind: 'mismatch', title: closest.title, missing, reason: `${closest.title} has no Status options ${missing.join(', ')}`, repository, projects }
}

export function findProjectBoard() {
  if (!lookupOnce) lookupOnce = lookUp()
  return lookupOnce
}

export function projectBoardLine() {
  const found = findProjectBoard()
  if (found.kind === 'found') return `project board: ${found.board.title}, ${releaseLine(found.board)}`
  if (found.kind === 'none') return 'project board: none linked'
  if (found.kind === 'mismatch') return `project board: ${found.reason}`
  return `project board: not checked: ${oneLine(found.reason)}`
}

function releaseLine(board) {
  const release = releaseFieldOf(board)
  if (release.missing) return `no ${RELEASE_FIELD} field (\`flow init --board\` adds it)`
  if (release.problem) return `${RELEASE_FIELD}: ${release.problem}`
  return `${RELEASE_FIELD} field: ${RELEASE_OPTIONS.map((entry) => entry.option).join(', ')}`
}

function report(line) {
  process.stderr.write(`project board not updated: ${oneLine(line)}\n`)
}

export function reportOnce(line) {
  if (reportedOnce.has(line)) return
  reportedOnce.add(line)
  report(line)
}

function noBoard(found) {
  if (found.kind === 'mismatch' && !lookupReported) report(found.reason)
  lookupReported = true
  return false
}

export function boardItem(board, number, state = null) {
  const issue = github.issueProjectItems(number)
  const item = issue.items.find((entry) => entry.projectId === board.id)
  if (item) return { item, added: false }
  const id = github.addProjectItem(board.id, issue.id)
  const optionId = state ? board.optionIds.get(state) : null
  if (optionId) github.setProjectSingleSelect(board.id, id, board.fieldId, optionId)
  return { item: { id, projectId: board.id, status: optionId ? { optionId } : null, release: null }, added: true }
}

export function placeOnBoard(board, number, state) {
  const optionId = board.optionIds.get(state)
  if (!optionId) throw new TrackerError(`#${number} is in the state "${state}", which no Status option stands for`)
  const { item, added } = boardItem(board, number, state)
  if (added) return 'added'
  if (item.status && item.status.optionId === optionId) return 'already right'
  github.setProjectSingleSelect(board.id, item.id, board.fieldId, optionId)
  return 'set'
}

export function placeRelease(board, number, value) {
  const release = releaseFieldOf(board)
  if (release.problem) throw new TrackerError(release.problem)
  const optionId = release.optionIds.get(value)
  if (!optionId) throw new TrackerError(`"${value}" is not one of the ${RELEASE_FIELD} options`)
  const { item } = boardItem(board, number, 'epic')
  if (item.release && item.release.optionId === optionId) return 'already right'
  github.setProjectSingleSelect(board.id, item.id, release.field.id, optionId)
  return 'set'
}

function boardTitle() {
  return lookupOnce && lookupOnce.board ? lookupOnce.board.title : 'the project'
}

export function syncProjectRelease(number, value) {
  try {
    const found = findProjectBoard()
    if (!found.board) return noBoard(found)
    const release = releaseFieldOf(found.board)
    if (release.problem) {
      reportOnce(release.problem)
      return false
    }
    placeRelease(found.board, number, value)
    return true
  } catch (error) {
    report(`#${number} kept its old ${RELEASE_FIELD} in ${boardTitle()}, because ${explain(error)}`)
    return false
  }
}

export function syncProjectStatus(number, state) {
  try {
    const found = findProjectBoard()
    if (!found.board) return noBoard(found)
    if (!found.board.optionIds.get(state)) {
      report(`#${number} is in the state "${state}", which no Status option stands for`)
      return false
    }
    placeOnBoard(found.board, number, state)
    return true
  } catch (error) {
    report(`#${number} kept its old Status in ${boardTitle()}, because ${explain(error)}`)
    return false
  }
}

const newOption = (entry) => ({ name: entry.option, color: entry.color, description: entry.description || '' })

function notSetUp(step) {
  try {
    return step()
  } catch (error) {
    if (!(error instanceof TrackerError) || error.missing) throw error
    throw new TrackerError(`the project board was not set up, because ${oneLine(explain(error))}`)
  }
}

function itemName(item, repositoryId) {
  if (!item.number || item.repositoryId !== repositoryId) return `item ${item.id}`
  return item.kind === 'PullRequest' ? `PR #${item.number}` : `#${item.number}`
}

const STATUS_COMPLETION = { field: (project) => project.statusField, wanted: PROJECT_STATUSES, valueOf: (item) => item.status, added: 'options', restored: 'item statuses' }
const RELEASE_COMPLETION = { field: (project) => fieldNamed(project, RELEASE_FIELD), wanted: RELEASE_OPTIONS, valueOf: (item) => item.release, added: `${RELEASE_FIELD} options`, restored: `${RELEASE_FIELD} values` }

function completeOptions(project, missing, repositoryId, kind = STATUS_COMPLETION) {
  const field = kind.field(project)
  const items = notSetUp(() => github.projectItems(project.id)).filter((item) => kind.valueOf(item) && kind.valueOf(item).name)
  const replaced = notSetUp(() => github.setSingleSelectOptions(field.id, [...field.options, ...kind.wanted.filter((entry) => missing.includes(entry.option)).map(newOption)]))
  const problems = []
  let restored = 0
  for (const item of items) {
    const was = kind.valueOf(item).name
    const option = replaced.options.find((entry) => sameName(entry.name, was))
    try {
      github.setProjectSingleSelect(project.id, item.id, replaced.fieldId, option ? option.id : null)
      restored++
    } catch (error) {
      if (!(error instanceof TrackerError) || error.missing) throw error
      problems.push(
        `${itemName(item, repositoryId)} was "${was}" and could not be set back, because ${oneLine(explain(error))}; \`flow board-sync\` restores every Flow issue from its labels, and a draft or pull request is set by hand`,
      )
    }
  }
  return { lines: [`project board: ${project.title}, added ${kind.added} ${missing.join(', ')}, restored ${restored} ${kind.restored}`], problems, changed: project }
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
      `${project.title} was created but is not ready, because ${oneLine(explain(error))}; link it to the repository by hand (the repository's Projects tab → Link a project) and run \`${initCommand(title)}\` again, which adds the Status options it lacks instead of creating a second project`,
    )
  }
  return { lines: [`project board: created ${project.title} and linked it`, ...BOARD_STEPS_BY_HAND], problems: [], changed: project }
}

const initCommand = (title) => (sameName(title, DEFAULT_BOARD_TITLE) ? 'flow init --board' : `flow init --board "${title}"`)

function adopt(project, repositoryId) {
  if (!project.statusField)
    throw new TrackerError(`the project board was not set up: ${project.title} is linked to this repository but has no Status field; add a single-select field named Status to it, or run \`flow init --board <title>\` with a new title to create a board`)
  const missing = missingOptions(project)
  if (!missing.length) return { lines: [`project board: ${project.title}`], problems: [] }
  return completeOptions(project, missing, repositoryId)
}

function chooseAndSetUp(found, title) {
  const named = found.projects.find((project) => sameName(project.title, title))
  if (named) {
    if (found.kind === 'found' && found.board.id !== named.id)
      return {
        refused: `${found.board.title} is linked to this repository and already carries all six Status options, so Flow writes to it, not to ${named.title}; to use ${named.title}, unlink ${found.board.title} from the repository first, or run \`${initCommand(found.board.title)}\` to keep ${found.board.title}`,
      }
    return adopt(named, found.repository.id)
  }
  if (found.kind === 'found') return { lines: [`project board: ${found.board.title}`], problems: [] }
  const withStatus = found.projects.filter((project) => project.statusField)
  if (withStatus.length === 1) return adopt(withStatus[0], found.repository.id)
  if (withStatus.length > 1)
    return {
      refused: `several projects linked to this repository have a Status field (${withStatus.map((project) => project.title).join(', ')}), and none is titled ${title}; run \`flow init --board "<title>"\` with the title of the one Flow should use`,
    }
  return createBoard(found.repository, title)
}

export function ensureProjectBoard(title = DEFAULT_BOARD_TITLE) {
  const found = findProjectBoard()
  if (found.kind === 'unreadable') throw new TrackerError(`the project board was not set up: ${oneLine(found.reason)}`)
  const outcome = chooseAndSetUp(found, title)
  if (outcome.refused || !outcome.changed) return outcome
  lookupOnce = null
  lookupReported = false
  const after = findProjectBoard()
  if (after.board && after.board.id === outcome.changed.id) return { ...outcome, lines: [...outcome.lines, `Flow writes to: ${after.board.title}`] }
  const writesTo = after.board ? `Flow writes to ${after.board.title} instead` : `Flow writes to no board, because ${oneLine(after.reason)}`
  return { ...outcome, problems: [...outcome.problems, `${outcome.changed.title} was set up, but ${writesTo}; \`flow doctor\` names the board Flow uses`] }
}

export function ensureReleaseField() {
  const found = findProjectBoard()
  if (!found.board) return { lines: [], problems: [] }
  const board = found.board
  const release = releaseFieldOf(board)
  if (!release.problem) return { lines: [], problems: [] }
  if (!release.missing && !release.missingOptions) return { lines: [], problems: [release.problem] }
  let outcome
  if (release.missing) {
    notSetUp(() => github.createProjectField(board.id, RELEASE_FIELD, 'SINGLE_SELECT', RELEASE_OPTIONS.map(newOption)))
    outcome = { lines: [`project board: ${board.title}, added the field ${RELEASE_FIELD} (${RELEASE_OPTIONS.map((entry) => entry.option).join(', ')})`], problems: [] }
  } else outcome = completeOptions(board, release.missingOptions, found.repository.id, RELEASE_COMPLETION)
  lookupOnce = null
  lookupReported = false
  return { lines: outcome.lines, problems: outcome.problems }
}
