export const meta = {
  name: 'flow-run-epic',
  description:
    "The /flow:run driver loop as code: refresh epic/<name>, take the next ticket in document order, spawn one fresh-context worker for it, confirm the merge landed — and halt on any stop condition instead of improvising past it",
  whenToUse:
    'Invoked by the flow:run skill AFTER it has resolved the epic, refused anything but Delivery: release, verified the sign-off traces on origin/epic/<name>, and checked the permission surface and branch protection (or its recorded waiver). Requires args {epic, defaultBranch, repoRoot, pluginRoot, today, workerModel?, reviewerModel?}. Returns {outcome: "completed"|"halted", haltedOn, ticketRecords, ...}; the calling session writes the run record and opens the release pull request. The script never merges, pushes, or retargets toward the default branch, and never opens or merges the release pull request.',
  phases: [
    { title: 'Refresh', detail: 'merge the default branch into epic/<name> between every ticket' },
    { title: 'Select', detail: 'read the next startable ticket in document order' },
    { title: 'Ticket', detail: 'one fresh-context worker per ticket, serially' },
    { title: 'Verify', detail: 'confirm state === integrated from the board, never from the worker' },
  ],
}

// `args` may arrive as the caller's raw JSON string rather than the parsed
// object, depending on the invoking runtime; normalize so both work. A string
// that is not valid JSON falls through and the requires-args check reports it.
const ARGS = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch (e) { return args } })() : args

// ---- args -------------------------------------------------------------------
// Everything mechanical arrives here: a workflow script has no filesystem, no
// shell, and no clock (Date.now() and new Date() throw), so the epic, the
// branch names, the paths and the date all ride in from the session.
const epic = ARGS && ARGS.epic
const defaultBranch = ARGS && ARGS.defaultBranch
const repoRoot = ARGS && ARGS.repoRoot
const pluginRoot = ARGS && ARGS.pluginRoot
const today = ARGS && ARGS.today

if (!epic || !defaultBranch || !repoRoot || !pluginRoot || !today) {
  throw new Error(
    'flow-run-epic requires args: {epic, defaultBranch, repoRoot, pluginRoot, today, workerModel?, reviewerModel?} — e.g. {epic:"payments", defaultBranch:"main", repoRoot:"/Users/x/proj", pluginRoot:"/Users/x/.claude/plugins/.../flow", today:"2026-08-11"}. The flow:run skill supplies all of them from its steps 1-3; run it only after those steps have passed.',
  )
}

// These land inside shell commands in agent prompts. Reject anything that could
// break out of the command, name another branch, or leave the repository —
// whatever upstream produced it.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/
if (!SAFE_NAME.test(epic) || epic.includes('..')) {
  throw new Error(`Unsafe epic name ${JSON.stringify(epic)} — must match ${SAFE_NAME} with no ".." segment`)
}
if (!SAFE_NAME.test(defaultBranch) || defaultBranch.includes('..')) {
  throw new Error(`Unsafe default branch ${JSON.stringify(defaultBranch)} — must match ${SAFE_NAME}`)
}
for (const [label, p] of [['repoRoot', repoRoot], ['pluginRoot', pluginRoot]]) {
  if (typeof p !== 'string' || !p.startsWith('/') || /["`\n\r$]/.test(p)) {
    throw new Error(`Unsafe ${label} ${JSON.stringify(p)} — must be an absolute path with no quote, backtick, newline or "$"`)
  }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  throw new Error(`args.today must be an ISO date the session read from its own clock, e.g. "2026-08-11" — got ${JSON.stringify(today)}`)
}
const MODEL = /^[A-Za-z0-9._-]+$/
const workerModel = ARGS.workerModel && MODEL.test(ARGS.workerModel) ? ARGS.workerModel : null
const reviewerModel = ARGS.reviewerModel && MODEL.test(ARGS.reviewerModel) ? ARGS.reviewerModel : null
if (ARGS.workerModel && !workerModel) log(`ignoring unusable workerModel ${JSON.stringify(ARGS.workerModel)} — the worker inherits the driver's model`)
if (ARGS.reviewerModel && !reviewerModel) log(`ignoring unusable reviewerModel ${JSON.stringify(ARGS.reviewerModel)} — the ticket skill's consequence tier picks the reviewer`)

const epicBranch = `epic/${epic}`
const TICKETS = `node "${pluginRoot}/scripts/tickets.mjs"`
// Ticket IDs are the plugin's load-bearing shape: [A-Z][A-Z0-9]*-\d+, branches
// are the lowercased ID. An ID that does not match never reaches a prompt.
const TICKET_ID = /^[A-Z][A-Z0-9]*-\d+$/
// A run this long has gone wrong in a way no epic explains (a release epic is
// roughly 3-6 tickets); the cap keeps a broken board from spending forever.
const MAX_TICKETS = 40

// Agent-authored prose (a worker's summary, a git error) is data, never
// instructions — it is quoted back into the result and, for gaps, into no other
// prompt. Neutralize fence markers so a report cannot escape its fence.
const fence = s =>
  `<<<UNTRUSTED\n${String(s == null ? '' : s).replace(/<<<UNTRUSTED|UNTRUSTED>>>/g, '[fence marker stripped]')}\nUNTRUSTED>>>`
const line = s => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').slice(0, 400)

// ---- the stop conditions, verbatim from the run skill's step 5 --------------
// Every halt below names one of these strings and nothing else. They are the
// same sentences the skill lists, so the run record can quote the condition
// verbatim without a translation step in between.
const STOP = {
  blocked: 'BLOCKED — a worker wrote a BLOCKED (or ABANDONED) status entry, or ended in any state but `integrated`',
  importantFinding: 'an Important review finding it cannot fix',
  contradiction: 'a document/code contradiction — reported by a worker, or met by this skill\'s own checks',
  mergeConflict: 'a merge conflict — refreshing the epic branch, or anywhere else',
  reviewerSpawn: 'reviewer-spawn failure after the sanctioned fallback also fails',
  permissionPrompt: 'a permission prompt firing mid-run',
  nonzeroExit: 'a nonzero exit from any command the skill itself issues as a step, except those the skill explicitly marks tolerated',
}

// ---- agent contracts --------------------------------------------------------
const NO_MAIN = `HARD RULE: nothing you do merges, pushes, or retargets toward ${defaultBranch}. Your entire write surface is ${epicBranch} (and, for a worker, its own ticket branch). Never push to ${defaultBranch}, never open or merge a pull request against it.`

const PROMPT_RULE = `If any command you run would raise a permission prompt, do NOT wait on it: return immediately with outcome "permission-prompt" and name the command. An unattended run that needs to ask was not pre-authorized, and a run wedged on a prompt looks exactly like a run making progress.`

const REFRESH_SCHEMA = {
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: {
      type: 'string',
      enum: ['refreshed', 'merge-conflict', 'ff-only-failed', 'command-failed', 'permission-prompt'],
      description:
        '"refreshed" ONLY if every command in the sequence exited 0. "merge-conflict" if the merge conflicted (abort it first). "ff-only-failed" if the fast-forward pull failed. "command-failed" for any other nonzero exit. Never guess: report what you saw.',
    },
    failedCommand: { type: 'string', description: 'the exact command that failed, or "" when outcome is refreshed' },
    detail: { type: 'string', description: 'first lines of the error output, verbatim, credentials masked' },
    mergeAborted: { type: 'boolean', description: 'true if you ran `git merge --abort` and it succeeded — required whenever the merge conflicted' },
    headSha: { type: 'string', description: 'the short SHA at the tip of the epic branch when you finished, or ""' },
  },
}

const NEXT_SCHEMA = {
  type: 'object',
  required: ['commandSucceeded', 'tickets'],
  properties: {
    commandSucceeded: { type: 'boolean', description: 'true only if the command exited 0 and printed parseable JSON' },
    tickets: {
      type: 'array',
      description: 'the JSON array the command printed, in the order it printed it — document order. Empty array when it printed [].',
      items: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' }, title: { type: 'string' } },
      },
    },
    failure: { type: 'string', description: 'when commandSucceeded is false: the exit code and the first lines of stderr, verbatim' },
    permissionPrompt: { type: 'boolean', description: 'true if running the command would have required answering a permission prompt' },
  },
}

const FIND_SCHEMA = {
  type: 'object',
  required: ['commandSucceeded', 'state'],
  properties: {
    commandSucceeded: { type: 'boolean' },
    state: { type: 'string', description: 'the `state` field from the JSON, verbatim ("integrated", "in-review", "blocked", ...). "" when the command failed.' },
    prUrl: { type: 'string', description: 'the `pr.url` field when present, else ""' },
    failure: { type: 'string', description: 'when commandSucceeded is false: the exit code and the first lines of stderr, verbatim' },
    permissionPrompt: { type: 'boolean' },
  },
}

const WORKER_SCHEMA = {
  type: 'object',
  required: ['ticket', 'result'],
  properties: {
    ticket: { type: 'string', description: 'the ticket ID you were given' },
    result: {
      type: 'string',
      enum: ['integrated', 'blocked', 'abandoned', 'halted'],
      description:
        '"integrated" ONLY if you merged your own pull request into the epic branch and saw it succeed — never inferred. "blocked"/"abandoned" if you wrote that status entry. "halted" for anything else that stopped you.',
    },
    stopCondition: {
      type: 'string',
      enum: ['none', 'blocked-entry', 'important-finding-unfixed', 'document-contradiction', 'merge-conflict', 'reviewer-spawn-failed', 'permission-prompt', 'other'],
      description: 'what stopped you, when result is not "integrated"; "none" when it is',
    },
    built: { type: 'string', description: 'one to three sentences: what exists now that did not' },
    verification: { type: 'string', description: 'the exact commands you ran and their counts' },
    reviewOutcome: { type: 'string', description: 'findings found / fixed / not fixed with reasons' },
    deployPreconditions: {
      type: 'array',
      items: { type: 'string' },
      description: 'anything this ticket created that must exist before the release runs: a new environment variable, a migration, a script that runs after. [] if none.',
    },
    prUrl: { type: 'string' },
    workerTokens: { type: 'string', description: 'your own harness-reported token figure, e.g. "310k" — "unknown" if the harness exposed none. Never estimate.' },
    reviewerTokens: { type: 'string', description: 'the reviewer\'s harness-reported token figure — "unknown" if it exposed none. Never estimate.' },
    detail: { type: 'string', description: 'when you stopped: what stopped you, in one or two lines, pointing at the status entry that says why' },
  },
}

// ---- the loop ---------------------------------------------------------------
const ticketRecords = []
const refreshes = []
let halted = null // {stopCondition, ticket, where, detail}
let lastRefreshSha = null // set by the refresh that found no ticket left: it is
                          // already the last refresh before the release, so the
                          // ending does not pay for a second one.
const seen = new Set()

log(`Driving ${epicBranch} unattended: one ticket at a time, in document order, each in a fresh-context worker. ${defaultBranch} is never a target — the run's entire merge surface is ${epicBranch}.`)

const refreshEpicBranch = async label => {
  phase('Refresh')
  const r = await agent(
    `Refresh the epic branch of the repository at ${repoRoot} from its default branch. Run exactly this sequence, in this order, and nothing else:

\`\`\`bash
git fetch origin --prune
git checkout ${epicBranch}
git pull --ff-only
git merge --no-edit origin/${defaultBranch}
git push origin ${epicBranch}
\`\`\`

Stop at the FIRST command that exits nonzero and report it — do not continue, do not retry, do not work around it.

If \`git merge\` reports a conflict: run \`git merge --abort\`, set mergeAborted, and report outcome "merge-conflict". Do NOT resolve the conflict — reconciling the default branch with the epic is judgment nobody delegated to you.
If \`git pull --ff-only\` fails: report outcome "ff-only-failed" and change nothing.

${PROMPT_RULE}

${NO_MAIN} \`git push origin ${epicBranch}\` is the only push you make.`,
    { label, phase: 'Refresh', schema: REFRESH_SCHEMA, effort: 'low' },
  )
  if (!r) return { outcome: 'command-failed', detail: 'the refresh agent returned no report — the refresh cannot be assumed to have happened', failedCommand: '' }
  return r
}

const refreshHalt = (r, where) => {
  if (r.outcome === 'merge-conflict') {
    return {
      stopCondition: STOP.mergeConflict,
      where,
      detail: `${line(r.detail)}${r.mergeAborted ? ' (merge aborted)' : ' (the merge was NOT reported as aborted — check the working tree before resuming)'}`,
    }
  }
  if (r.outcome === 'permission-prompt') return { stopCondition: STOP.permissionPrompt, where, detail: line(r.failedCommand || r.detail) }
  if (r.outcome === 'ff-only-failed') {
    return {
      stopCondition: STOP.nonzeroExit,
      where,
      detail: `\`git pull --ff-only\` failed on ${epicBranch}: the local and remote epic branches have diverged, which no step of the run can cause. ${line(r.detail)}`,
    }
  }
  return { stopCondition: STOP.nonzeroExit, where, detail: `${line(r.failedCommand)} — ${line(r.detail)}` }
}

for (let i = 0; i < MAX_TICKETS && !halted; i++) {
  // a. Refresh epic/<name> from the default branch — between every ticket, or
  //    the release merge becomes its own big-bang.
  const refresh = await refreshEpicBranch(`refresh:${i + 1}`)
  refreshes.push({ attempt: i + 1, outcome: refresh.outcome, headSha: refresh.headSha || '' })
  if (refresh.outcome !== 'refreshed') {
    halted = { ticket: null, ...refreshHalt(refresh, `refreshing ${epicBranch} before ticket ${i + 1}`) }
    break
  }

  // b. Take the first ticket `next` hands out — that is document order, and
  //    document order is the plan's de-risking order.
  phase('Select')
  const next = await agent(
    `In the repository at ${repoRoot}, run exactly this command and report what it printed:

\`\`\`bash
${TICKETS} next ${epic} --json
\`\`\`

It prints a JSON array of startable tickets in document order (possibly empty). Report the array verbatim — every id and title, in the printed order — and nothing you inferred. Run no other command; change no file; you are reading a derived board, not acting on it.

${PROMPT_RULE}`,
    { label: `next:${i + 1}`, phase: 'Select', schema: NEXT_SCHEMA, effort: 'low' },
  )
  if (!next || !next.commandSucceeded) {
    halted = next && next.permissionPrompt
      ? { ticket: null, stopCondition: STOP.permissionPrompt, where: `\`tickets.mjs next ${epic} --json\``, detail: line(next.failure) }
      : { ticket: null, stopCondition: STOP.nonzeroExit, where: `\`tickets.mjs next ${epic} --json\``, detail: line(next ? next.failure : 'the agent returned no report') }
    break
  }
  if (!next.tickets.length) {
    log(`No startable tickets left in ${epic} — ${ticketRecords.length} ticket(s) integrated this run.`)
    lastRefreshSha = refresh.headSha || ''
    break
  }

  const ticket = next.tickets[0]
  const id = String(ticket.id || '').trim()
  if (!TICKET_ID.test(id)) {
    halted = {
      ticket: line(id) || null,
      stopCondition: STOP.contradiction,
      where: `\`tickets.mjs next ${epic} --json\``,
      detail: `the next ticket's id ${JSON.stringify(line(id))} does not match the plugin's ticket-ID shape [A-Z][A-Z0-9]*-<n> — the board and the documents disagree`,
    }
    break
  }
  if (seen.has(id)) {
    halted = {
      ticket: id,
      stopCondition: STOP.contradiction,
      where: 'the driver loop',
      detail: `${id} was handed out again after this run already worked it — the board is not advancing, and re-running a ticket destroys its evidence trail`,
    }
    break
  }
  seen.add(id)
  log(`Ticket ${ticketRecords.length + 1}: ${id}${ticket.title ? ` — ${line(ticket.title)}` : ''}`)

  // c. Spawn the worker: a fresh agent, empty context, one ticket. "A driver
  //    spawned you" is the phrase the ticket skill's step 10 keys on to stop
  //    after the merge instead of continuing to the next ticket.
  phase('Ticket')
  const workerLabel = `worker:${id}`
  const worker = await agent(
    `A driver spawned you for this one ticket. Run the \`flow:ticket\` skill for \`${id}\`, exactly as written — you are working from documents, not from any conversation. Stop after your merge into the epic branch and report; the driver owns the loop. Include in your report the reviewer's harness-reported token figure (\`unknown\` if it exposed none) — you hire the reviewer, so only you observe its spend, and the run record needs it. Report your own harness-reported figure the same way.

Your worker label for this run is \`${workerLabel}\` — record it in the status entry's Mode line (\`autonomous — driver-spawned worker ${workerLabel}\`), because the run record names the same label and those two lines together are what makes "the driver never implements" auditable after the fact.

The repository is at ${repoRoot}; the epic is \`${epic}\` and its branch is \`${epicBranch}\`. Everything else you need is in the epic's documents — start at \`${TICKETS} find ${id} --json\`, as the skill's step 1 says.

You do everything the skill says yourself, including spawning your own reviewer and fixing its findings. Do NOT start another ticket, do not refresh the epic branch, and do not report on any ticket but this one.

If you cannot spawn a reviewer at all — including because the Agent tool is not available to you — do NOT merge and do NOT review your own work: write the BLOCKED entry the skill requires and report result "blocked" with stopCondition "reviewer-spawn-failed", saying which spawn attempts failed. An unreviewed ticket is never merged, anywhere.

${NO_MAIN}

Report honestly: \`integrated\` ONLY if you merged your own pull request into ${epicBranch} and saw the merge succeed. If a stop condition fired — an Important review finding you cannot fix, a document/code contradiction, a merge conflict, a reviewer you could not spawn even through the sanctioned fallback, a permission prompt — write the status entry the skill requires and report it with the matching stopCondition. A halt is the mechanism working, not a failure; inventing progress past one is the only real failure.`,
    {
      label: workerLabel,
      phase: 'Ticket',
      // A fresh general-purpose agent, full toolset, empty context — the same
      // worker shape the skill's prose loop spawned.
      agentType: 'general-purpose',
      schema: WORKER_SCHEMA,
      // The epic's optional `Worker model:` preamble line; absent, the worker
      // inherits the session's model.
      ...(workerModel ? { model: workerModel } : {}),
    },
  )

  const record = {
    id,
    title: line(ticket.title || ''),
    workerAgent: workerLabel,
    workerModel: workerModel || 'inherited',
    reviewerModel: reviewerModel || 'per the ticket skill\'s consequence tier',
    workerTokens: worker && worker.workerTokens ? line(worker.workerTokens) : 'unknown',
    reviewerTokens: worker && worker.reviewerTokens ? line(worker.reviewerTokens) : 'unknown',
    built: worker && worker.built ? fence(worker.built) : '',
    verification: worker && worker.verification ? fence(worker.verification) : '',
    reviewOutcome: worker && worker.reviewOutcome ? fence(worker.reviewOutcome) : '',
    deployPreconditions: worker && Array.isArray(worker.deployPreconditions) ? worker.deployPreconditions.map(line) : [],
    prUrl: worker && worker.prUrl ? line(worker.prUrl) : '',
    workerReported: worker ? worker.result : 'no report',
    result: 'halted',
  }
  ticketRecords.push(record)

  if (!worker || worker.result !== 'integrated') {
    const reason = worker ? worker.stopCondition : 'other'
    const stopCondition =
      reason === 'important-finding-unfixed' ? STOP.importantFinding
        : reason === 'document-contradiction' ? STOP.contradiction
        : reason === 'merge-conflict' ? STOP.mergeConflict
        : reason === 'reviewer-spawn-failed' ? STOP.reviewerSpawn
        : reason === 'permission-prompt' ? STOP.permissionPrompt
        : STOP.blocked
    halted = {
      ticket: id,
      stopCondition,
      where: `the worker for ${id}`,
      detail: worker
        ? `worker reported ${worker.result}: ${line(worker.detail || worker.built || '(no detail)')}`
        : 'the worker returned no report — it died, was skipped, or ran out of room; the ticket is NOT integrated',
    }
    break
  }

  // d. Verify the outcome mechanically. The merged pull request into the epic
  //    branch is the only evidence that counts, not the worker's own report.
  phase('Verify')
  const found = await agent(
    `In the repository at ${repoRoot}, run exactly this command and report what it printed:

\`\`\`bash
${TICKETS} find ${id} --json
\`\`\`

Report the \`state\` field verbatim and the \`pr.url\` field if present. Report what the command printed — never what you expect it to print, and never a state you inferred from the git log. Run no other command; change no file.

${PROMPT_RULE}`,
    { label: `verify:${id}`, phase: 'Verify', schema: FIND_SCHEMA, effort: 'low' },
  )
  if (!found || !found.commandSucceeded) {
    halted = found && found.permissionPrompt
      ? { ticket: id, stopCondition: STOP.permissionPrompt, where: `\`tickets.mjs find ${id} --json\``, detail: line(found.failure) }
      : { ticket: id, stopCondition: STOP.nonzeroExit, where: `\`tickets.mjs find ${id} --json\``, detail: line(found ? found.failure : 'the agent returned no report') }
    break
  }
  if (found.state !== 'integrated') {
    halted = {
      ticket: id,
      stopCondition: STOP.blocked,
      where: `verifying ${id} after its worker returned`,
      detail: `the worker reported integrated, but the board reads state "${line(found.state)}" — the merged pull request is the only evidence that counts. Never re-run the ticket, never finish it yourself.`,
    }
    break
  }
  record.result = 'integrated'
  record.prUrl = record.prUrl || line(found.prUrl || '')
  log(`${id}: integrated (confirmed from the board, not from the worker's report).`)
}

if (!halted && ticketRecords.length >= MAX_TICKETS) {
  halted = {
    ticket: null,
    stopCondition: STOP.contradiction,
    where: 'the driver loop',
    detail: `${MAX_TICKETS} tickets ran in one epic — past any release epic's size, so the board and the documents disagree about what is left. Stopping rather than spending further.`,
  }
}

// The last refresh before the release pull request (the ending step's "refresh
// once more") is the loop's own: every pass refreshes BEFORE it asks what is
// left, so the pass that finds nothing left has just refreshed a branch that
// already carries every ticket's merge. Its conflict rule is the same rule,
// enforced by the same code path — the ending never refreshes a second time.
const finalRefresh = halted
  ? 'not reached: the run halted'
  : `done: ${epicBranch} carries origin/${defaultBranch}${lastRefreshSha ? ` at ${line(lastRefreshSha)}` : ''} — the loop's last refresh, run after the last ticket merged`

const integrated = ticketRecords.filter(r => r.result === 'integrated')
if (halted) {
  log(`HALTED on: ${halted.stopCondition}${halted.ticket ? ` (ticket ${halted.ticket})` : ''} — ${halted.detail}`)
  log('Halting on a stop condition is the mechanism working. The run merges nothing more; the session records the halt and opens no release pull request.')
} else {
  log(`Ran to completion: ${integrated.length} ticket(s) integrated into ${epicBranch}. The session writes the run record and OPENS the release pull request — no agent merges it.`)
}

return {
  outcome: halted ? 'halted' : 'completed',
  epic,
  epicBranch,
  defaultBranch,
  date: today,
  haltedOn: halted,
  ticketRecords,
  totals: {
    ticketsAttempted: ticketRecords.length,
    ticketsIntegrated: integrated.length,
    refreshes: refreshes.length,
  },
  refreshes,
  finalRefresh,
  deployPreconditions: [...new Set(ticketRecords.flatMap(r => r.deployPreconditions))],
  // What the session must do next, so a result read on its own still says it.
  next: halted
    ? 'Append the run record to the epic\'s status.md with this stop condition quoted verbatim and the ticket it fired on, commit and push it on the epic branch, report, and stop. Merge nothing more; open no release pull request; never re-run the ticket.'
    : 'Append the run record to the epic\'s status.md, commit and push it on the epic branch, then OPEN the release pull request against the default branch — never merge it, never squash it. The epic branch has already been refreshed.',
}
