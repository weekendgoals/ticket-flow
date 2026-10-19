export const STARTED_MARKER = '<!-- flow:started -->'
export const ACCEPTANCE_MARKER = /^<!-- flow:acceptance sha=([0-9a-f]{7,40}) passed=(true|false)(?: seconds=(\d+))? -->/
export const METER_MARKER = '<!-- flow:meter -->'
export const RESET_MARKER = '<!-- flow:reset -->'
const START_WITHDRAWN_MARKER = '<!-- flow:start-withdrawn -->'
export const LOCAL_RUN_MARKER = '<!-- flow:local-run -->'
export const LOCAL_RUN_END_MARKER = '<!-- flow:local-run-end -->'
export const MERGED_MARKER = /^<!-- flow:merged sha=([0-9a-f]{7,40}) accepted=([0-9a-f]{7,40}) -->/
export const REVIEW_MARKER = /^<!-- flow:review round=(\d+) important=(\d+)(?: head=([0-9a-f]{7,40}))? -->/
export const COMPARED_HEADING = '**Compared:**'
const MAX_REVIEW_ROUNDS = 2
export const RELEASE_CHECK_MARKER = /^<!-- flow:release-check head=([0-9a-f]{7,40}) passed=(true|false) all=(true|false) -->/
export const RELEASE_PR_MARKER = /^<!-- flow:release-pr number=(\d+) -->/
export const NEEDS_HUMAN_MARKER = '<!-- flow:needs-human -->'
export const NEEDS_HUMAN_LEAD = '**This ticket needs a person.**'
export const PARKED_LEAD = '**This ticket is parked.**'
export const SERIAL_WAVE_MARKER = /^<!-- flow:serial wave=([\w:-]+) tickets=(\d+(?:,\d+)*) -->$/m
export const PULL_REQUEST_COMMENT = /^\*\*Pull request (opened|already open|round \d+):?\*\*/
export const UNATTENDED_VARIABLE = 'FLOW_UNATTENDED'
export const HANDOFF_MARKER = '<!-- flow:handoff -->'
const HANDOFF_LEAD = '**Handoff.**'
export const MAX_HANDOFF_LENGTH = 1200

export function isUnattended(environment = process.env) {
  return environment[UNATTENDED_VARIABLE] === '1'
}

export function parksInstead(stops, environment = process.env) {
  return stops === 'none' && isUnattended(environment)
}

export function hostName(environment = process.env) {
  return isUnattended(environment) ? 'unattended run' : 'attended session'
}

const STATE_REFUSALS = {
  'in-progress': 'is already in progress; if nobody is working on it any more, run `flow reset` on it and start again: the branch keeps its commits',
  'in-review': 'is already built and in review; finish it rather than starting it again',
  done: 'is already done',
  'needs-human': 'is waiting for a person (flow:needs-human); once they have decided, replace that label with flow:planned to start again',
  unlabelled: 'has no state label; give it flow:planned to make it startable',
  conflicting: 'has more than one state label; keep one',
}

export function startRefusal({ ticket, state, parsed, epic }) {
  if (state !== 'planned') return `#${ticket} ${STATE_REFUSALS[state] || `is ${state}`}`
  const criteriaProblems = parsed.criteria.problems
  if (criteriaProblems.length)
    return `#${ticket} has acceptance criteria that cannot decide it (${criteriaProblems.map((problem) => problem.why).join('; ')}); fix the issue body first`
  if (!epic) {
    if (parsed.blockedByProblem) return `#${ticket} ${parsed.blockedByProblem}`
    if (parsed.blockedBy.length) return `#${ticket} has no epic but says it is blocked by ${parsed.blockedBy.map((n) => `#${n}`).join(', ')}; a ticket with no epic cannot wait on others, so remove the line or put it in an epic`
    return null
  }
  const entry = epic.tickets.find((candidate) => candidate.number === ticket)
  if (!entry) return `#${ticket} says it belongs to epic #${epic.number}, but it is not one of that epic's sub-issues; run \`flow link ${epic.number} ${ticket}\``
  if (!epic.approved) return `epic #${epic.number} is not approved yet; a person adds the flow:approved label to approve it`
  if (entry.problems.length) return entry.problems.join('; ')
  if (entry.epicProblem) return entry.epicProblem
  if (entry.inCycle) return `#${ticket} is part of a blocking cycle, so it can never start; fix the "Blocked by" lines`
  if (entry.unfinishedBlockers.length) return `#${ticket} is waiting for ${entry.unfinishedBlockers.map((n) => `#${n}`).join(', ')} to be done`
  return null
}

export function deliveryFor(epic) {
  if (!epic) return 'incremental'
  return epic.settings.delivery || 'release'
}

export function startedComment({ host, model, branch, base, baseSha, resumedAt = null }) {
  if (resumedAt)
    return `${STARTED_MARKER}\n**Resumed** in an ${host} · worker model ${model} · branch \`${branch}\` carries on from its commit \`${resumedAt.slice(0, 12)}\` (it left \`${base}\` at \`${baseSha.slice(0, 12)}\`)`
  return `${STARTED_MARKER}\n**Started** in an ${host} · worker model ${model} · branch \`${branch}\` from \`${base}\` at \`${baseSha.slice(0, 12)}\``
}

export function resetComment({ host, branch }) {
  return `${RESET_MARKER}\n**Reset** by an ${host}: the run working on this ticket stopped without a result. It is planned again; \`${branch}\` keeps its commits, and the next start carries on from them.`
}

export function countResets(comments, author) {
  return byAuthor(comments, author).filter((comment) => comment.body.startsWith(RESET_MARKER)).length
}

export function countStartWithdrawals(comments, author) {
  return byAuthor(comments, author).filter((comment) => comment.body.startsWith(START_WITHDRAWN_MARKER)).length
}

export function startWithdrawnComment() {
  return `${START_WITHDRAWN_MARKER}\n**Start request withdrawn.** The job asked to build this ticket stopped before the ticket started, so \`flow:start\` is taken off; the ticket is planned, and the next start request builds it.`
}

export function releasePrComment({ number, url, existing, epicBranch, base }) {
  return `<!-- flow:release-pr number=${number} -->\n**Release pull request ${existing ? 'already open' : 'opened'}:** ${url} (\`${epicBranch}\` into \`${base}\`). A person reviews and merges it.`
}

export function localRunLive(comments) {
  const marks = comments.filter((comment) => comment.body.startsWith(LOCAL_RUN_MARKER) || comment.body.startsWith(LOCAL_RUN_END_MARKER))
  return marks.length > 0 && marks[marks.length - 1].body.startsWith(LOCAL_RUN_MARKER)
}

export function mergedComment({ sha, mergeSha, epicBranch, alreadyMerged, attempts = [] }) {
  const how = alreadyMerged ? `was already in \`${epicBranch}\` (at \`${mergeSha.slice(0, 12)}\`)` : `merged into \`${epicBranch}\` as \`${mergeSha.slice(0, 12)}\``
  const retried = attempts.length > 1 ? `\n\n\`${epicBranch}\` moved while this was merging, so the merge was made again on its new head (${attempts.length} tries).` : ''
  return `<!-- flow:merged sha=${mergeSha} accepted=${sha} -->\n**Done.** The accepted commit \`${sha.slice(0, 12)}\` ${how}.${retried}`
}

export function sameLogin(a, b) {
  const plain = (login) => String(login || '').toLowerCase().replace(/\[bot\]$/, '')
  return plain(a) !== '' && plain(a) === plain(b)
}

function byAuthor(comments, author) {
  return comments.filter((comment) => sameLogin(comment.author, author))
}

function lastMatch(comments, author, marker) {
  const mine = byAuthor(comments, author)
  for (let index = mine.length - 1; index >= 0; index--) {
    const match = mine[index].body.match(marker)
    if (match) return { match, comment: mine[index] }
  }
  return null
}

export function lastMerge(comments, author) {
  const found = lastMatch(comments, author, MERGED_MARKER)
  return found ? { mergeSha: found.match[1], accepted: found.match[2] } : null
}

export function releaseCheckMarker({ head, passed, all }) {
  return `<!-- flow:release-check head=${head} passed=${passed} all=${all} -->`
}

export function lastReleaseCheck(comments, author) {
  const found = lastMatch(comments, author, RELEASE_CHECK_MARKER)
  return found ? { head: found.match[1], passed: found.match[2] === 'true', all: found.match[3] === 'true' } : null
}

export function releaseCheckRefusal({ check, head, epic, epicBranch }) {
  const rerun = `run \`flow check-epic ${epic}\` first, because the release pull request carries only a head where every done ticket's checks passed`
  if (!check) return `epic #${epic} has no epic check posted by this account; ${rerun}`
  if (!sameCommit(check.head, head)) return `the latest epic check is of \`${check.head.slice(0, 12)}\`, not of the head of origin/${epicBranch} (\`${head.slice(0, 12)}\`); ${rerun}`
  if (!check.passed) return `the latest epic check, at \`${head.slice(0, 12)}\`, did not pass; fix what it names, then ${rerun}`
  if (!check.all) return `the latest epic check, at \`${head.slice(0, 12)}\`, judged only the tickets it was given; ${rerun}`
  return null
}

export function handoffComment(text) {
  return `${HANDOFF_MARKER}\n${HANDOFF_LEAD}\n\n${text.trim()}`
}

export function handoffText(body) {
  const text = String(body || '').replace(/\r\n?/g, '\n')
  if (!text.startsWith(HANDOFF_MARKER)) return null
  const rest = text.slice(HANDOFF_MARKER.length).trimStart()
  return (rest.startsWith(HANDOFF_LEAD) ? rest.slice(HANDOFF_LEAD.length) : rest).trim()
}

export function lastHandoff(comments, author) {
  const found = byAuthor(comments, author).filter((comment) => comment.body.startsWith(HANDOFF_MARKER))
  if (!found.length) return null
  const latest = found[found.length - 1]
  return { text: handoffText(latest.body), url: latest.url || null, at: latest.createdAt || null }
}

export function lastStart(comments, author) {
  const found = byAuthor(comments, author).filter((comment) => comment.body.startsWith(STARTED_MARKER))
  return found.length ? found[found.length - 1] : null
}

export function passingAcceptancesByOthers(comments, author) {
  return comments
    .filter((comment) => !sameLogin(comment.author, author))
    .map((comment) => ({ comment, match: comment.body.match(ACCEPTANCE_MARKER) }))
    .filter(({ match }) => match && match[2] === 'true')
    .map(({ comment, match }) => ({ author: comment.author, sha: match[1] }))
}

export function lastAcceptance(comments, author) {
  const found = lastMatch(comments, author, ACCEPTANCE_MARKER)
  return found ? { sha: found.match[1], passed: found.match[2] === 'true', at: found.comment.createdAt } : null
}

export function reviewMarker({ round, important, head }) {
  return `<!-- flow:review round=${round} important=${important} head=${head} -->`
}

function sameCommit(a, b) {
  return Boolean(a && b) && a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a))
}

export function reviewedHeadRefusal(rounds, head) {
  const last = rounds[rounds.length - 1]
  if (!last.head) return `the latest review (round ${last.round}) does not name the commit it read up to; post it again with \`--head <sha>\``
  if (!sameCommit(last.head, head)) return `the latest review is of ${last.head.slice(0, 12)}, not HEAD (${head.slice(0, 12)}); have the commits after it reviewed and post that review first`
  return null
}

const IMPORTANT_SECTION = /\*\*Important\.\*\*([\s\S]*?)\*\*Nits\.\*\*/
const IMPORTANT_HEADING = /\*\*Important\.\*\*/g
const NONE = /^none\.?$/i

export function importantCountMismatch(report, important) {
  const headings = (report.match(IMPORTANT_HEADING) || []).length
  if (headings > 1) return `the report has ${headings} "**Important.**" sections, and a second one could hold findings the count leaves out; post one report with one`
  const section = report.match(IMPORTANT_SECTION)
  if (!section) return 'the report has no "**Important.**" section followed by "**Nits.**", so nothing shows how many Important findings it leaves open'
  const saysNone = NONE.test(section[1].trim())
  if (saysNone && important > 0) return `--important ${important}, but the report's Important section reads "None"`
  if (!saysNone && important === 0) return '--important 0, but the report\'s Important section lists findings; count them, or write "None" when there are none'
  return null
}

export function reviewRounds(comments, author, since = null) {
  const sinceTime = since ? Date.parse(since) : null
  return byAuthor(comments, author)
    .filter((comment) => sinceTime === null || Date.parse(comment.createdAt) >= sinceTime)
    .map((comment) => comment.body.match(REVIEW_MARKER))
    .filter(Boolean)
    .map((match) => ({ round: Number(match[1]), important: Number(match[2]), head: match[3] || null }))
}

export function reviewRefusal(rounds) {
  if (!rounds.length) return { reason: 'no review is posted for this work; post the reviewer\'s report with `flow post <n> --review --important <count> --head <sha> --file <report>` first', stop: false }
  const last = rounds[rounds.length - 1]
  if (last.important === 0) return null
  if (rounds.length >= MAX_REVIEW_ROUNDS)
    return { reason: `review round ${last.round} still has ${last.important} Important finding(s) open after ${rounds.length} rounds; a person decides what happens next`, stop: true }
  return { reason: `review round ${last.round} has ${last.important} Important finding(s) open; fix them and post the second review over the fixes first`, stop: false }
}

export function hasComparedTable(comments, since) {
  if (!since) return false
  const sinceTime = Date.parse(since)
  return comments.some((comment) => Date.parse(comment.createdAt) >= sinceTime && comment.body.trimStart().startsWith(COMPARED_HEADING))
}

export function editsAfter(edits, since) {
  const sinceTime = Date.parse(since)
  return edits.filter((edit) => Date.parse(edit.editedAt) > sinceTime)
}

function cell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

const RESULT_WORDS = { passed: 'pass', failed: 'FAIL', skipped: 'SKIPPED (does not pass)' }

export function acceptanceComment({ sha, report, seconds = null }) {
  const lines = [`<!-- flow:acceptance sha=${sha} passed=${report.allPassed}${Number.isInteger(seconds) ? ` seconds=${seconds}` : ''} -->`]
  lines.push(`**Acceptance ${report.allPassed ? 'passed' : 'failed'}** at \`${sha.slice(0, 12)}\`: ${report.passed} of ${report.total} checks passed${report.skipped ? `, ${report.skipped} skipped` : ''}.`)
  if (report.checks.length) {
    lines.push('', '| # | Criterion | Command | Result | Evidence |', '|---|---|---|---|---|')
    for (const check of report.checks)
      lines.push(`| ${check.n} | ${cell(check.criterion || '—')} | \`${cell(check.check)}\` | ${RESULT_WORDS[check.status]} | ${cell(check.evidence)} |`)
  }
  if (report.compares.length) {
    lines.push('', 'Design comparisons are run by hand and are not counted above; each needs its **Compared:** table posted on this issue:')
    for (const compare of report.compares) lines.push(`- ${compare.criterion || compare.compare}: \`COMPARE: ${compare.compare}\``)
  }
  if (report.problems.length) {
    lines.push('', 'Lines in the criteria that cannot run, which fail acceptance:')
    for (const problem of report.problems) lines.push(`- line ${problem.line ?? '?'}: ${problem.why}`)
  }
  return lines.join('\n')
}

export function needsHumanComment({ people, text, parked = false }) {
  if (parked) return `${NEEDS_HUMAN_MARKER}\n${PARKED_LEAD} ${text}`
  const mention = people.map((login) => `@${login}`).join(' ')
  return `${NEEDS_HUMAN_MARKER}\n${NEEDS_HUMAN_LEAD} ${mention ? `${mention} ` : ''}${text}`
}

export function isStopComment(body) {
  return body.startsWith(NEEDS_HUMAN_MARKER) || body.startsWith(NEEDS_HUMAN_LEAD) || body.startsWith(PARKED_LEAD)
}

export function stopText(body) {
  const withoutMarker = body.startsWith(NEEDS_HUMAN_MARKER) ? body.slice(NEEDS_HUMAN_MARKER.length).trimStart() : body
  const lead = [NEEDS_HUMAN_LEAD, PARKED_LEAD].find((candidate) => withoutMarker.startsWith(candidate)) || ''
  return withoutMarker
    .slice(lead.length)
    .trim()
    .replace(/^(?:@[\w-]+(?:\[bot\])?\s+)+/, '')
    .trim()
}

export function isParkedComment(body) {
  const withoutMarker = body.startsWith(NEEDS_HUMAN_MARKER) ? body.slice(NEEDS_HUMAN_MARKER.length).trimStart() : body
  return withoutMarker.startsWith(PARKED_LEAD)
}

export function lastStop(comments, author) {
  const found = byAuthor(comments, author).filter((comment) => isStopComment(comment.body))
  if (!found.length) return null
  const latest = found[found.length - 1]
  return { reason: stopText(latest.body).split('\n')[0].trim(), parked: isParkedComment(latest.body), url: latest.url || null }
}

export function editedRefusal({ edits, startedAt }) {
  const who = edits.map((edit) => `${edit.editor ? `@${edit.editor}` : 'someone'} at ${edit.editedAt}`).join(', ')
  return `**Acceptance refused:** the issue body, which holds the acceptance criteria, was edited after work started (${startedAt}) by ${who}. The criteria are the gate, so a person has to confirm the edit before this ticket can pass.`
}

export const RUN_FINISHED_LEAD = '**Run finished: built.**'
export const RUN_STOPPED_LEAD = '**Run stopped.**'

export function lastReleasePullRequest(comments, author) {
  const found = lastMatch(comments, author, RELEASE_PR_MARKER)
  return found ? Number(found.match[1]) : null
}

function asSentence(text) {
  const trimmed = String(text).trim()
  const capital = `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`
  return /[.!?]$/.test(capital) ? capital : `${capital}.`
}

function numbered(tickets) {
  return tickets.map((ticket) => `#${ticket.number}`).join(', ')
}

function named(ticket) {
  return `#${ticket.number} ${ticket.title}`
}

function notBuiltState(ticket) {
  if (ticket.unfinishedBlockers && ticket.unfinishedBlockers.length && ['planned', 'waiting'].includes(ticket.state)) return `waiting for ${numbered(ticket.unfinishedBlockers.map((number) => ({ number })))}`
  return ticket.state
}

function askReport({ outcome, reason, delivery, tickets, releasePullRequest }) {
  if (outcome === 'built') {
    if (releasePullRequest) return `${RUN_FINISHED_LEAD} Release pull request: ${releasePullRequest.url}. A person reviews and merges it.`
    return `${RUN_FINISHED_LEAD}${delivery === 'incremental' ? ' Every ticket was delivered by its own pull request.' : ''}`
  }
  const waiting = tickets.filter((ticket) => ticket.state === 'needs-human')
  const notDone = tickets.filter((ticket) => ticket.state !== 'done')
  return `${RUN_STOPPED_LEAD} ${reason ? asSentence(reason) : 'Nothing more can start.'}${waiting.length ? ` These tickets need a person: ${numbered(waiting)}.` : ''}${notDone.length ? ` Not done: ${numbered(notDone)}.` : ''}`
}

function noStopsReport({ outcome, reason, tickets, releasePullRequest, people }) {
  const lead = outcome === 'built' ? RUN_FINISHED_LEAD : `${RUN_STOPPED_LEAD} ${reason ? asSentence(reason) : 'Nothing more can start.'}`
  const mention = people.map((login) => `@${login}`).join(' ')
  const lines = [lead, '', `${mention ? `${mention} ` : ''}Under \`Stops: none\` this run asked nobody while it ran: what it decided and what it parked is below, to read once, here and on the release pull request.`]
  const built = tickets.filter((ticket) => ticket.state === 'done')
  const parked = tickets.filter((ticket) => ticket.state === 'needs-human')
  const notBuilt = tickets.filter((ticket) => ticket.state !== 'done' && ticket.state !== 'needs-human')
  lines.push('', `**Built:** ${built.length ? built.map(named).join(', ') : 'none'}.`)
  if (parked.length) {
    lines.push('', '**Parked**, for a person to decide (relabel a ticket `flow:planned` to have it built again from its branch):')
    for (const ticket of parked) lines.push(`- ${named(ticket)}: ${ticket.stop && ticket.stop.reason ? ticket.stop.reason : 'no parking comment from this account'}`)
  } else lines.push('', '**Parked:** none.')
  if (notBuilt.length) lines.push('', `**Not built:** ${notBuilt.map((ticket) => `${named(ticket)} (${notBuiltState(ticket)})`).join(', ')}.`)
  lines.push('', `**Release pull request:** ${releasePullRequest ? releasePullRequest.url || `#${releasePullRequest.number}` : 'none opened'}.`)
  return lines.join('\n')
}

export function runReport({ stops, outcome, reason = null, delivery, tickets, releasePullRequest = null, people = [], local = false }) {
  const text = stops === 'none' ? noStopsReport({ outcome, reason, tickets, releasePullRequest, people }) : askReport({ outcome, reason, delivery, tickets, releasePullRequest })
  return local ? `${LOCAL_RUN_END_MARKER}\n${text}` : text
}
