import { parseEpicBody, parseTicketBody, rejectedBranchProblem } from './issue-body.mjs'

export const EPIC_LABEL = 'flow:epic'
export const TICKET_LABEL = 'flow:ticket'
export const APPROVED_LABEL = 'flow:approved'
export const NEEDS_HUMAN_LABEL = 'flow:needs-human'
export const START_LABEL = 'flow:start'
export const FOUND_LABEL = 'flow:found'

export const STATE_BY_LABEL = {
  'flow:planned': 'planned',
  'flow:in-progress': 'in-progress',
  'flow:in-review': 'in-review',
  'flow:done': 'done',
  'flow:needs-human': 'needs-human',
}
export const STATE_LABELS = Object.keys(STATE_BY_LABEL)
export const TIER_LABELS = { easy: 'tier:easy', hard: 'tier:hard' }
export const MODEL_BY_TIER = { easy: 'sonnet', hard: 'opus' }

export const LABELS = [
  { name: EPIC_LABEL, color: '5319e7', description: 'Flow epic: the plan for one piece of work' },
  { name: TICKET_LABEL, color: '1d76db', description: 'Flow ticket: one step of an epic' },
  { name: APPROVED_LABEL, color: '0e8a16', description: 'A person signed off this epic plan' },
  { name: 'flow:planned', color: 'c5def5', description: 'Not started yet; ready once the epic is approved and its blockers are done' },
  { name: 'flow:in-progress', color: 'fbca04', description: 'Someone is building this ticket now' },
  { name: 'flow:in-review', color: 'd4c5f9', description: 'Built, being reviewed' },
  { name: 'flow:done', color: '0e8a16', description: 'Merged into the epic branch' },
  { name: NEEDS_HUMAN_LABEL, color: 'd93f0b', description: 'Stopped: a person has to decide something' },
  { name: START_LABEL, color: 'bfdadc', description: 'Asks a host to start building this ticket now; removed when it starts' },
  { name: FOUND_LABEL, color: 'f9d0c4', description: 'A bug or idea with evidence and no criteria yet; a person approves it, then triage makes it a ticket' },
  { name: TIER_LABELS.easy, color: 'ededed', description: 'Straightforward ticket, built by the faster model' },
  { name: TIER_LABELS.hard, color: '555555', description: 'Demanding ticket, built by the strongest model' },
]

export function isFinding(issue) {
  return issue.labels.includes(FOUND_LABEL)
}

export function findingSummary(issue) {
  return {
    number: issue.number,
    title: issue.title,
    approved: issue.labels.includes(APPROVED_LABEL),
    author: issue.author,
    createdAt: issue.createdAt,
  }
}

export function countFindings(findings) {
  const approved = findings.filter((finding) => finding.approved).length
  return { waiting: findings.length - approved, approved }
}

export function findingsLine(findings) {
  const { waiting, approved } = countFindings(findings)
  return `${waiting} waiting, ${approved} approved`
}

export function epicBranchProblem(epic) {
  if ((epic.settings.delivery || 'release') !== 'release' || epic.settings.branch) return null
  if (epic.settings.rejectedBranch) return `epic #${epic.number}: ${rejectedBranchProblem(epic.settings.rejectedBranch)}`
  return `epic #${epic.number} has no "Branch:" setting, so its tickets have no epic branch to start from or merge into`
}

export function ticketState(labels) {
  const states = labels.filter((label) => STATE_LABELS.includes(label)).map((label) => STATE_BY_LABEL[label])
  if (states.length === 1) return { state: states[0], problem: null }
  if (!states.length) return { state: 'unlabelled', problem: 'has no state label (flow:planned, flow:in-progress, …)' }
  return { state: 'conflicting', problem: `has ${states.length} state labels at once (${states.join(', ')}); keep one` }
}

export function ticketTier(labels) {
  return labels.includes(TIER_LABELS.easy) && !labels.includes(TIER_LABELS.hard) ? 'easy' : 'hard'
}

function orderTickets(listed, subIssues) {
  const position = new Map(listed.map((task, index) => [task.number, index]))
  return [...subIssues].sort((a, b) => {
    const pa = position.has(a.number) ? position.get(a.number) : Infinity
    const pb = position.has(b.number) ? position.get(b.number) : Infinity
    return pa === pb ? a.number - b.number : pa - pb
  })
}

function findCycles(graph) {
  const cycles = []
  const seen = new Set()
  const visiting = []
  const finished = new Set()
  const visit = (node) => {
    if (finished.has(node)) return
    const at = visiting.indexOf(node)
    if (at !== -1) {
      const members = visiting.slice(at)
      const key = [...members].sort((a, b) => a - b).join(',')
      if (!seen.has(key)) {
        seen.add(key)
        cycles.push([...members, node])
      }
      return
    }
    visiting.push(node)
    for (const next of graph.get(node) || []) visit(next)
    visiting.pop()
    finished.add(node)
  }
  for (const node of graph.keys()) visit(node)
  return cycles
}

function shownState(ticket, approved, epicProblem) {
  if (ticket.state !== 'planned' || !approved) return ticket.state
  const blocked = Boolean(epicProblem) || ticket.problems.length > 0 || ticket.inCycle || ticket.unfinishedBlockers.length > 0
  return blocked ? 'waiting' : 'ready'
}

export function deriveEpic(epicIssue, allSubIssues) {
  const subIssues = allSubIssues.filter((issue) => !isFinding(issue))
  const findings = allSubIssues.filter((issue) => isFinding(issue) && issue.state !== 'closed').map(findingSummary)
  const plan = parseEpicBody(epicIssue.body)
  const designSources = plan.settings.designSources
  const problems = plan.problems.map((problem) => `epic #${epicIssue.number}: ${problem}`)
  const members = new Set(subIssues.map((issue) => issue.number))
  for (const task of plan.tickets)
    if (!members.has(task.number))
      problems.push(`epic #${epicIssue.number} lists #${task.number} under "## Tickets", but #${task.number} is not one of its sub-issues`)

  const tickets = orderTickets(plan.tickets, subIssues).map((issue) => {
    const parsed = parseTicketBody(issue.body, designSources)
    const { state, problem: stateProblem } = ticketState(issue.labels)
    const ticketProblems = []
    if (stateProblem) ticketProblems.push(`#${issue.number} ${stateProblem}`)
    if (parsed.blockedByProblem) ticketProblems.push(`#${issue.number} ${parsed.blockedByProblem}`)
    for (const problem of parsed.criteria.problems)
      ticketProblems.push(`#${issue.number} has acceptance criteria that cannot decide it: ${problem.why}${problem.line === null ? '' : ` (body line ${problem.line})`}`)
    if (parsed.epic !== null && parsed.epic !== epicIssue.number)
      ticketProblems.push(`#${issue.number} says "Epic: #${parsed.epic}" but is a sub-issue of epic #${epicIssue.number}`)
    const outsideBlockers = parsed.blockedBy.filter((number) => !members.has(number))
    for (const number of outsideBlockers)
      ticketProblems.push(`#${issue.number} is blocked by #${number}, which is not a ticket of epic #${epicIssue.number}; a wait on other work cannot be tracked here`)
    return {
      number: issue.number,
      title: issue.title,
      state,
      tier: ticketTier(issue.labels),
      blockedBy: parsed.blockedBy,
      blockedByProblem: parsed.blockedByProblem,
      outsideBlockers,
      assignees: issue.assignees,
      labels: issue.labels,
      problems: ticketProblems,
    }
  })

  const byNumber = new Map(tickets.map((ticket) => [ticket.number, ticket]))
  const graph = new Map(tickets.map((ticket) => [ticket.number, ticket.blockedBy.filter((number) => members.has(number))]))
  const cycles = findCycles(graph)
  const inCycle = new Set(cycles.flat())
  for (const cycle of cycles)
    problems.push(`epic #${epicIssue.number} has a blocking cycle: ${cycle.map((number) => `#${number}`).join(' → ')}; none of these can ever start`)

  const approved = epicIssue.labels.includes(APPROVED_LABEL)
  const blockingProblem = epicBranchProblem({ number: epicIssue.number, settings: plan.settings })
  if (blockingProblem && !plan.settings.rejectedBranch) problems.push(blockingProblem)
  for (const ticket of tickets) {
    ticket.unfinishedBlockers = ticket.blockedBy.filter((number) => !byNumber.has(number) || byNumber.get(number).state !== 'done')
    ticket.inCycle = inCycle.has(ticket.number)
    ticket.shownState = shownState(ticket, approved, blockingProblem)
    ticket.epicProblem = blockingProblem
    problems.push(...ticket.problems)
  }

  return {
    number: epicIssue.number,
    title: epicIssue.title,
    author: epicIssue.author,
    approved,
    settings: plan.settings,
    tickets,
    findings,
    cycles,
    problems,
  }
}

export function nextSteps(epic) {
  const pick = (...states) => epic.tickets.filter((ticket) => states.includes(ticket.shownState)).map((ticket) => ticket.number)
  const result = {
    epic: epic.number,
    approved: epic.approved,
    ready: pick('ready'),
    waiting: epic.tickets
      .filter((ticket) => ticket.shownState === 'waiting')
      .map((ticket) => ({
        n: ticket.number,
        blockedBy: ticket.unfinishedBlockers,
        ...(ticket.problems.length || ticket.epicProblem ? { problem: ticket.problems[0] || ticket.epicProblem } : {}),
      })),
    inProgress: pick('in-progress', 'in-review'),
    done: pick('done'),
    needsHuman: pick('needs-human'),
    planned: pick('planned'),
    problems: epic.problems,
    delivery: epic.settings.delivery,
    parallel: epic.settings.parallel,
    stops: epic.settings.stops,
    branch: epic.settings.branch,
    tickets: epic.tickets.map((ticket) => ({ n: ticket.number, title: ticket.title, tier: ticket.tier, model: MODEL_BY_TIER[ticket.tier], state: ticket.shownState, startRequested: ticket.labels.includes(START_LABEL) })),
  }
  const unfinished = epic.tickets.filter((ticket) => ticket.state !== 'done').length
  const stuckReason = !epic.approved
    ? `epic #${epic.number} is not approved; a person adds the ${APPROVED_LABEL} label to approve it`
    : !epic.tickets.length
    ? `epic #${epic.number} has no tickets, so there is nothing built and nothing to start`
    : unfinished > 0 && !result.ready.length && !result.inProgress.length
      ? `epic #${epic.number} is stuck: ${unfinished} ticket(s) are not done, none is ready and none is in progress`
      : null
  return { result, stuckReason }
}

export const RELEASE_STAGES = { building: 'Building', open: 'Pull request open', released: 'Released' }

export function isReleaseEpic(settings) {
  return (settings.delivery || 'release') === 'release' && Boolean(settings.branch)
}

export function releaseStage({ settings, closed, releasePullRequestNamed, releaseMerged, releaseDraft = false }) {
  if (!isReleaseEpic(settings)) return null
  if (closed) return releaseMerged ? RELEASE_STAGES.released : null
  return releasePullRequestNamed && !releaseDraft ? RELEASE_STAGES.open : RELEASE_STAGES.building
}
