export const STARTED_MARKER = '<!-- flow:started -->'
export const ACCEPTANCE_MARKER = /^<!-- flow:acceptance sha=([0-9a-f]{7,40}) passed=(true|false)(?: seconds=(\d+))? -->/
export const METER_MARKER = '<!-- flow:meter -->'
export const RESET_MARKER = '<!-- flow:reset -->'
export const START_WITHDRAWN_MARKER = '<!-- flow:start-withdrawn -->'
export const LOCAL_RUN_MARKER = '<!-- flow:local-run -->'
export const LOCAL_RUN_END_MARKER = '<!-- flow:local-run-end -->'
export const MERGED_MARKER = /^<!-- flow:merged sha=([0-9a-f]{7,40}) accepted=([0-9a-f]{7,40}) -->/
export const REVIEW_MARKER = /^<!-- flow:review round=(\d+) important=(\d+) -->/
export const COMPARED_HEADING = '**Compared:**'
export const MAX_REVIEW_ROUNDS = 2
export const RELEASE_CHECK_MARKER = '<!-- flow:release-check -->'
export const RELEASE_PR_MARKER = /^<!-- flow:release-pr number=(\d+) -->/
export const NEEDS_HUMAN_MARKER = '<!-- flow:needs-human -->'
export const NEEDS_HUMAN_LEAD = '**This ticket needs a person.**'
export const SERIAL_WAVE_MARKER = /^<!-- flow:serial wave=([\w:-]+) tickets=(\d+(?:,\d+)*) -->$/m
export const PULL_REQUEST_COMMENT = /^\*\*Pull request (opened|already open|round \d+):?\*\*/
export const UNATTENDED_VARIABLE = 'FLOW_UNATTENDED'

export function isUnattended(environment = process.env) {
  return environment[UNATTENDED_VARIABLE] === '1'
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

export function releasePrNumber(comments, author) {
  const found = lastMatch(comments, author, RELEASE_PR_MARKER)
  return found ? Number(found.match[1]) : null
}

export function localRunLive(comments, author) {
  const mine = byAuthor(comments, author).filter((comment) => comment.body.startsWith(LOCAL_RUN_MARKER) || comment.body.startsWith(LOCAL_RUN_END_MARKER))
  return mine.length > 0 && mine[mine.length - 1].body.startsWith(LOCAL_RUN_MARKER)
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

export function lastStart(comments, author) {
  const found = byAuthor(comments, author).filter((comment) => comment.body.startsWith(STARTED_MARKER))
  return found.length ? found[found.length - 1] : null
}

export function lastAcceptance(comments, author) {
  const found = lastMatch(comments, author, ACCEPTANCE_MARKER)
  return found ? { sha: found.match[1], passed: found.match[2] === 'true', at: found.comment.createdAt } : null
}

export function reviewMarker({ round, important }) {
  return `<!-- flow:review round=${round} important=${important} -->`
}

export function reviewRounds(comments, author, since = null) {
  const sinceTime = since ? Date.parse(since) : null
  return byAuthor(comments, author)
    .filter((comment) => sinceTime === null || Date.parse(comment.createdAt) >= sinceTime)
    .map((comment) => comment.body.match(REVIEW_MARKER))
    .filter(Boolean)
    .map((match) => ({ round: Number(match[1]), important: Number(match[2]) }))
}

export function reviewRefusal(rounds) {
  if (!rounds.length) return { reason: 'no review is posted for this work; post the reviewer\'s report with `flow post <n> --review --important <count> --file <report>` first', stop: false }
  const last = rounds[rounds.length - 1]
  if (last.important === 0) return null
  if (rounds.length >= MAX_REVIEW_ROUNDS)
    return { reason: `review round ${last.round} still has ${last.important} Important finding(s) open after ${rounds.length} rounds; a person decides what happens next`, stop: true }
  return { reason: `review round ${last.round} has ${last.important} Important finding(s) open; fix them and post the second review over the fixes first`, stop: false }
}

export function hasComparedTable(comments) {
  return comments.some((comment) => comment.body.trimStart().startsWith(COMPARED_HEADING))
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

export function needsHumanComment({ people, text }) {
  const mention = people.map((login) => `@${login}`).join(' ')
  return `${NEEDS_HUMAN_MARKER}\n${NEEDS_HUMAN_LEAD} ${mention ? `${mention} ` : ''}${text}`
}

export function editedRefusal({ edits, startedAt }) {
  const who = edits.map((edit) => `${edit.editor ? `@${edit.editor}` : 'someone'} at ${edit.editedAt}`).join(', ')
  return `**Acceptance refused:** the issue body, which holds the acceptance criteria, was edited after work started (${startedAt}) by ${who}. The criteria are the gate, so a person has to confirm the edit before this ticket can pass.`
}
