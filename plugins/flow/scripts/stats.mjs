import {
  STARTED_MARKER,
  ACCEPTANCE_MARKER,
  MERGED_MARKER,
  REVIEW_MARKER,
  RESET_MARKER,
  RELEASE_PR_MARKER,
  NEEDS_HUMAN_MARKER,
  NEEDS_HUMAN_LEAD,
  SERIAL_WAVE_MARKER,
  PULL_REQUEST_COMMENT,
  LOCAL_RUN_END_MARKER,
} from './ticket-steps.mjs'
import { readMeterComment } from './meter.mjs'

const TOKEN_FIGURES = ['input', 'output', 'cacheCreation', 'cacheReads']
const STEPS = ['worker', 'review', 'fixes', 'acceptance', 'delivery', 'whole']
const ROLE_OF_STEP = { worker: 'worker', review: 'reviewer', fixes: 'fixes' }
const REVIEW_FIX = /\(review fix\)\s*$/
const FIXES = /\(fixes #(\d+)\)\s*$/
const TICKET_PREFIX = /^#(\d+):/
const RUN_STOPPED_LEAD = '**Run stopped.**'
const SECONDS_PER_DAY = 86400

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

function bothSummed(a, b) {
  return isNumber(a) && isNumber(b) ? a + b : null
}

function bothMax(a, b) {
  return isNumber(a) && isNumber(b) ? Math.max(a, b) : null
}

function figuresOf(raw = {}) {
  const figures = {}
  for (const name of [...TOKEN_FIGURES, 'compactions', 'wallSeconds']) figures[name] = isNumber(raw[name]) ? raw[name] : null
  figures.peakContext = isNumber(raw.peakContext) ? raw.peakContext : null
  return figures
}

function addFigures(a, b) {
  const sum = {}
  for (const name of [...TOKEN_FIGURES, 'compactions', 'wallSeconds']) sum[name] = bothSummed(a[name], b[name])
  sum.peakContext = bothMax(a.peakContext, b.peakContext)
  return sum
}

function mergeNamed(target, named) {
  for (const [name, raw] of Object.entries(named || {})) target[name] = target[name] ? addFigures(target[name], figuresOf(raw)) : figuresOf(raw)
}

export function combineMeters(meters) {
  const distinct = [...new Map(meters.map((meter) => [JSON.stringify(meter), meter])).values()]
  if (!distinct.length) return null
  const roles = {}
  const models = {}
  for (const meter of distinct) {
    mergeNamed(roles, meter.roles)
    mergeNamed(models, meter.models)
  }
  const total = distinct.map((meter) => figuresOf(meter.total)).reduce(addFigures)
  return { runs: distinct.length, roles, models, total }
}

function at(comment) {
  const time = Date.parse(comment.createdAt)
  return Number.isNaN(time) ? null : time
}

function between(from, to) {
  return from !== null && to !== null && to >= from ? Math.round((to - from) / 1000) : null
}

function evidence(comment) {
  return { at: comment.createdAt || null, author: comment.author || null, url: comment.url || null }
}

function stopReason(body) {
  const withoutMarker = body.startsWith(NEEDS_HUMAN_MARKER) ? body.slice(NEEDS_HUMAN_MARKER.length).trimStart() : body
  return withoutMarker
    .slice(NEEDS_HUMAN_LEAD.length)
    .trim()
    .replace(/^(?:@[\w-]+(?:\[bot\])?\s+)+/, '')
    .trim()
}

function isStop(body) {
  return body.startsWith(NEEDS_HUMAN_MARKER) || body.startsWith(NEEDS_HUMAN_LEAD)
}

function readTicketComments(comments) {
  const starts = []
  const acceptances = []
  const merges = []
  const reviews = []
  const pullRequestComments = []
  const meters = []
  const stops = []
  let resets = 0
  for (const comment of comments) {
    const body = comment.body || ''
    if (body.startsWith(STARTED_MARKER)) starts.push(comment)
    if (body.startsWith(RESET_MARKER)) resets++
    if (isStop(body)) stops.push({ ...evidence(comment), reason: stopReason(body) })
    if (PULL_REQUEST_COMMENT.test(body)) pullRequestComments.push(comment)
    const acceptance = body.match(ACCEPTANCE_MARKER)
    if (acceptance) acceptances.push({ comment, sha: acceptance[1], passed: acceptance[2] === 'true', seconds: acceptance[3] === undefined ? null : Number(acceptance[3]) })
    const merged = body.match(MERGED_MARKER)
    if (merged) merges.push({ comment, mergeSha: merged[1], accepted: merged[2] })
    const review = body.match(REVIEW_MARKER)
    if (review) reviews.push({ ...evidence(comment), round: Number(review[1]), important: Number(review[2]) })
    const meter = readMeterSafely(body)
    if (meter) meters.push(meter)
  }
  return { starts, acceptances, merges, reviews, pullRequestComments, meters, stops, resets }
}

function readMeterSafely(body) {
  try {
    return readMeterComment(body)
  } catch {
    return null
  }
}

function deliveryEnd(record, delivery) {
  if (delivery === 'release') return record.merges.length ? record.merges[record.merges.length - 1].comment : null
  return record.pullRequestComments.length ? record.pullRequestComments[record.pullRequestComments.length - 1] : null
}

function stepTimes(record, meter, delivery) {
  const steps = {}
  for (const [step, role] of Object.entries(ROLE_OF_STEP)) steps[step] = meter && meter.roles[role] ? meter.roles[role].wallSeconds : null
  const timed = record.acceptances.map((acceptance) => acceptance.seconds)
  steps.acceptance = timed.length && timed.every(isNumber) ? timed.reduce((sum, value) => sum + value, 0) : null
  const passing = record.acceptances.filter((acceptance) => acceptance.passed)
  const lastPassing = passing.length ? passing[passing.length - 1].comment : null
  const end = deliveryEnd(record, delivery)
  steps.delivery = lastPassing && end ? between(at(lastPassing), at(end)) : null
  steps.whole = record.starts.length && end ? between(at(record.starts[0]), at(end)) : null
  return steps
}

function commitCounts(subjects, ticketNumber) {
  if (!subjects) return { rework: null, reworkCommits: [] }
  const rework = subjects.filter((commit) => {
    const prefix = commit.subject.match(TICKET_PREFIX)
    return prefix && Number(prefix[1]) === ticketNumber && REVIEW_FIX.test(commit.subject)
  })
  return { rework: rework.length, reworkCommits: rework.map((commit) => ({ sha: commit.sha, subject: commit.subject })) }
}

function escapeCounts(defaultSubjects, ticketNumber) {
  if (!defaultSubjects) return { escapes: null, escapeCommits: [] }
  const escapes = defaultSubjects.filter((commit) => {
    const fixes = commit.subject.match(FIXES)
    return fixes && Number(fixes[1]) === ticketNumber
  })
  return { escapes: escapes.length, escapeCommits: escapes.map((commit) => ({ sha: commit.sha, subject: commit.subject })) }
}

export function ticketStats({ ticket, comments, subjects = null, defaultSubjects = null, delivery = 'release', serialWaves = [] }) {
  const record = readTicketComments(comments)
  const meter = combineMeters(record.meters)
  const steps = stepTimes(record, meter, delivery)
  const fallback = serialWaves.filter((wave) => wave.tickets.includes(ticket.number))
  return {
    number: ticket.number,
    title: ticket.title,
    state: ticket.state,
    tier: ticket.tier,
    metered: Boolean(meter),
    meterRuns: meter ? meter.runs : 0,
    steps,
    tokens: Object.fromEntries(TOKEN_FIGURES.map((name) => [name, meter ? meter.total[name] : null])),
    models: meter ? meter.models : {},
    peakContext: meter ? meter.total.peakContext : null,
    compactions: meter ? meter.total.compactions : null,
    reviewRounds: record.reviews.length,
    importantFindings: record.reviews.reduce((sum, review) => sum + review.important, 0),
    reviews: record.reviews,
    pullRequestRounds: record.pullRequestComments.filter((comment) => /^\*\*Pull request round/.test(comment.body)).length,
    acceptanceRuns: record.acceptances.length,
    failedAcceptances: record.acceptances.filter((acceptance) => !acceptance.passed).length,
    resets: record.resets,
    ...commitCounts(subjects, ticket.number),
    ...escapeCounts(defaultSubjects, ticket.number),
    stops: record.stops,
    ranSerially: fallback.map((wave) => ({ wave: wave.wave, reason: wave.reason, url: wave.url })),
    startedAt: record.starts.length ? record.starts[0].createdAt : null,
    endedAt: deliveryEnd(record, delivery)?.createdAt ?? null,
  }
}

export function readEpicComments(comments) {
  const serialWaves = []
  const runStops = []
  let releasePullRequest = null
  for (const comment of comments) {
    const body = comment.body || ''
    const serial = body.match(SERIAL_WAVE_MARKER)
    if (serial) {
      const prose = body.split('\n').filter((line) => line.trim() && !line.startsWith('<!--')).join(' ')
      serialWaves.push({ wave: serial[1], tickets: serial[2].split(',').map(Number), reason: prose.replace(/\*\*/g, ''), url: comment.url || null, at: comment.createdAt || null })
    }
    const lines = body.split('\n')
    const lead = lines[0] === LOCAL_RUN_END_MARKER ? lines.slice(1).join('\n') : body
    if (lead.startsWith(RUN_STOPPED_LEAD)) runStops.push({ ...evidence(comment), reason: lead.slice(RUN_STOPPED_LEAD.length).trim() })
    const release = body.match(RELEASE_PR_MARKER)
    if (release) releasePullRequest = Number(release[1])
  }
  return { serialWaves, runStops, releasePullRequest }
}

function partial(values, combine = (a, b) => a + b) {
  const known = values.filter(isNumber)
  return { value: known.length ? known.reduce(combine) : null, known: known.length, of: values.length }
}

export function summarize(tickets) {
  const steps = Object.fromEntries(STEPS.map((step) => [step, partial(tickets.map((ticket) => ticket.steps[step]))]))
  const tokens = Object.fromEntries(TOKEN_FIGURES.map((name) => [name, partial(tickets.map((ticket) => ticket.tokens[name]))]))
  const models = {}
  for (const ticket of tickets) mergeNamed(models, ticket.models)
  return {
    tickets: tickets.length,
    done: tickets.filter((ticket) => ticket.state === 'done').length,
    metered: tickets.filter((ticket) => ticket.metered).length,
    steps,
    tokens,
    models,
    peakContext: partial(tickets.map((ticket) => ticket.peakContext), Math.max),
    compactions: partial(tickets.map((ticket) => ticket.compactions)),
    reviewRounds: tickets.reduce((sum, ticket) => sum + ticket.reviewRounds, 0),
    importantFindings: tickets.reduce((sum, ticket) => sum + ticket.importantFindings, 0),
    rework: partial(tickets.map((ticket) => ticket.rework)),
    escapes: partial(tickets.map((ticket) => ticket.escapes)),
    stops: tickets.reduce((sum, ticket) => sum + ticket.stops.length, 0),
    ranSerially: tickets.filter((ticket) => ticket.ranSerially.length).map((ticket) => ticket.number),
  }
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function pace(tickets) {
  const finished = tickets.filter((ticket) => ticket.state === 'done' && ticket.startedAt && ticket.endedAt)
  const starts = finished.map((ticket) => Date.parse(ticket.startedAt))
  const ends = finished.map((ticket) => Date.parse(ticket.endedAt))
  const spanSeconds = finished.length ? (Math.max(...ends) - Math.min(...starts)) / 1000 : 0
  return {
    ticketsTimed: finished.length,
    ticketsDone: tickets.filter((ticket) => ticket.state === 'done').length,
    spanSeconds: finished.length ? Math.round(spanSeconds) : null,
    ticketsPerDay: spanSeconds > 0 ? Math.round((finished.length / (spanSeconds / SECONDS_PER_DAY)) * 100) / 100 : null,
    medianTicketSeconds: median(tickets.map((ticket) => ticket.steps.whole).filter(isNumber)),
  }
}

export function overallStats(epics, since = null) {
  const tickets = epics.flatMap((epic) => epic.tickets)
  return { since, epics, totals: summarize(tickets), pace: pace(tickets) }
}

function count(value) {
  return isNumber(value) ? value.toLocaleString('en-US') : 'unknown'
}

export function duration(seconds) {
  if (!isNumber(seconds)) return 'unknown'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}m`
  return `${Math.floor(hours / 24)}d${String(hours % 24).padStart(2, '0')}h`
}

function shownPartial(figure, show = count) {
  if (!figure.known) return 'unknown'
  const shown = show(figure.value)
  return figure.known === figure.of ? shown : `${shown} (${figure.known}/${figure.of})`
}

function table(headers, rows) {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => String(row[column]).length)))
  const render = (cells) => cells.map((cell, column) => String(cell).padEnd(widths[column])).join('  ').trimEnd()
  return [render(headers), render(widths.map((width) => '-'.repeat(width))), ...rows.map(render)].join('\n')
}

const TICKET_HEADERS = ['#', 'state', 'worker', 'review', 'fixes', 'accept', 'deliver', 'whole', 'input', 'output', 'cache w', 'cache r', 'peak', 'compact', 'rounds', 'important', 'rework', 'escapes', 'stops']

function ticketRow(ticket) {
  return [
    `#${ticket.number}`,
    ticket.state,
    ...STEPS.map((step) => duration(ticket.steps[step])),
    ...TOKEN_FIGURES.map((name) => count(ticket.tokens[name])),
    count(ticket.peakContext),
    count(ticket.compactions),
    ticket.reviewRounds,
    ticket.importantFindings,
    count(ticket.rework),
    count(ticket.escapes),
    ticket.stops.length,
  ]
}

function totalRow(label, totals) {
  return [
    label,
    `${totals.done}/${totals.tickets} done`,
    ...STEPS.map((step) => shownPartial(totals.steps[step], duration)),
    ...TOKEN_FIGURES.map((name) => shownPartial(totals.tokens[name])),
    shownPartial(totals.peakContext),
    shownPartial(totals.compactions),
    totals.reviewRounds,
    totals.importantFindings,
    shownPartial(totals.rework),
    shownPartial(totals.escapes),
    totals.stops,
  ]
}

function modelLines(models) {
  const names = Object.keys(models)
  if (!names.length) return ['No ticket has a cost comment, so tokens per model are unknown.']
  return [
    table(
      ['model', 'input', 'output', 'cache writes', 'cache reads', 'largest context'],
      names.map((name) => [name, ...TOKEN_FIGURES.map((figure) => count(models[name][figure])), count(models[name].peakContext)]),
    ),
  ]
}

function paceLine(figures) {
  if (!figures.ticketsTimed) return 'Pace: unknown (no done ticket has both a start and an end comment).'
  return `Pace: ${figures.ticketsPerDay === null ? 'unknown' : figures.ticketsPerDay} ticket(s) per day over ${duration(figures.spanSeconds)} (${figures.ticketsTimed} of ${figures.ticketsDone} done ticket(s) timed); median ticket ${duration(figures.medianTicketSeconds)} from start to end.`
}

function epicLines(epic) {
  const lines = []
  const release = epic.releasePullRequest
  const releaseText = release ? `release pull request #${release.number} ${release.merged === null ? '(state unknown)' : release.merged ? 'merged' : 'not merged'}` : 'no release pull request'
  lines.push(`#${epic.number} ${epic.title} · ${epic.delivery} delivery · parallel ${epic.parallel ?? 'unknown'} · ${releaseText}`, '')
  lines.push(table(TICKET_HEADERS, [...epic.tickets.map(ticketRow), totalRow('total', epic.totals)]))
  lines.push('', ...modelLines(epic.totals.models))
  const stops = epic.tickets.flatMap((ticket) => ticket.stops.map((stop) => ({ ticket: ticket.number, ...stop })))
  if (stops.length) {
    lines.push('', 'Stopped for a person:')
    for (const stop of stops) lines.push(`- #${stop.ticket} ${stop.at || ''}: ${stop.reason}${stop.url ? ` (${stop.url})` : ''}`)
  }
  if (epic.runStops.length) {
    lines.push('', 'Runs that stopped:')
    for (const stop of epic.runStops) lines.push(`- ${stop.at || ''}: ${stop.reason}${stop.url ? ` (${stop.url})` : ''}`)
  }
  if (epic.serialWaves.length) {
    lines.push('', 'Planned side by side, built one at a time:')
    for (const wave of epic.serialWaves) lines.push(`- wave ${wave.wave}: ${wave.tickets.map((number) => `#${number}`).join(', ')}: ${wave.reason}`)
  }
  if (epic.gitProblem) lines.push('', `Rework and escaped defects are unknown: ${epic.gitProblem}.`)
  return lines
}

export function formatStats(result) {
  const lines = ['Times are wall-clock; "unknown" means no comment or commit carries the figure, and "(3/5)" means only 3 of 5 tickets did. Nothing is estimated.', '']
  for (const epic of result.epics) lines.push(...epicLines(epic), '')
  if (result.epics.length !== 1) {
    lines.push(`All ${result.epics.length} epic(s)${result.since ? ` created since ${result.since}` : ''}:`, '')
    lines.push(table(TICKET_HEADERS, [...result.epics.map((epic) => totalRow(`#${epic.number}`, epic.totals)), totalRow('total', result.totals)]))
    lines.push('', ...modelLines(result.totals.models), '')
  }
  lines.push(paceLine(result.pace))
  return lines.join('\n')
}
