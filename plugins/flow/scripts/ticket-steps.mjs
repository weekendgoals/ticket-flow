export const STARTED_MARKER = '<!-- flow:started -->'
export const ACCEPTANCE_MARKER = /<!-- flow:acceptance sha=([0-9a-f]{7,40}) passed=(true|false) -->/
export const METER_MARKER = '<!-- flow:meter -->'
export const RESET_MARKER = '<!-- flow:reset -->'
export const MERGED_MARKER = /<!-- flow:merged sha=([0-9a-f]{7,40}) accepted=([0-9a-f]{7,40}) -->/
export const RELEASE_CHECK_MARKER = '<!-- flow:release-check -->'
export const RELEASE_PR_MARKER = /<!-- flow:release-pr number=(\d+) -->/
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

export function countResets(comments) {
  return comments.filter((comment) => comment.body.startsWith(RESET_MARKER)).length
}

export function mergedComment({ sha, mergeSha, epicBranch, alreadyMerged }) {
  const how = alreadyMerged ? `was already in \`${epicBranch}\` (at \`${mergeSha.slice(0, 12)}\`)` : `merged into \`${epicBranch}\` as \`${mergeSha.slice(0, 12)}\``
  return `<!-- flow:merged sha=${mergeSha} accepted=${sha} -->\n**Done.** The accepted commit \`${sha.slice(0, 12)}\` ${how}.`
}

export function lastMerge(comments) {
  for (let index = comments.length - 1; index >= 0; index--) {
    const match = comments[index].body.match(MERGED_MARKER)
    if (match) return { mergeSha: match[1], accepted: match[2] }
  }
  return null
}

export function lastStart(comments) {
  const found = comments.filter((comment) => comment.body.startsWith(STARTED_MARKER))
  return found.length ? found[found.length - 1] : null
}

export function lastAcceptance(comments) {
  for (let index = comments.length - 1; index >= 0; index--) {
    const match = comments[index].body.match(ACCEPTANCE_MARKER)
    if (match) return { sha: match[1], passed: match[2] === 'true', at: comments[index].createdAt }
  }
  return null
}

export function editsAfter(edits, since) {
  const sinceTime = Date.parse(since)
  return edits.filter((edit) => Date.parse(edit.editedAt) > sinceTime)
}

function cell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

const RESULT_WORDS = { passed: 'pass', failed: 'FAIL', skipped: 'SKIPPED (does not pass)' }

export function acceptanceComment({ sha, report, untrackedCount = 0 }) {
  const lines = [`<!-- flow:acceptance sha=${sha} passed=${report.allPassed} -->`]
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
  if (untrackedCount) lines.push('', `${untrackedCount} file(s) in the working tree are not committed: the checks ran with them present, but they are not part of \`${sha.slice(0, 12)}\`.`)
  return lines.join('\n')
}

export function editedRefusal({ edits, startedAt }) {
  const who = edits.map((edit) => `${edit.editor ? `@${edit.editor}` : 'someone'} at ${edit.editedAt}`).join(', ')
  return `**Acceptance refused:** the issue body, which holds the acceptance criteria, was edited after work started (${startedAt}) by ${who}. The criteria are the gate, so a person has to confirm the edit before this ticket can pass.`
}
