export const meta = {
  name: 'flow-run-epic',
  description:
    'Build an approved Flow epic with nobody watching: read what is ready from GitHub, build each ready ticket with /flow:ticket on its own model (side by side in separate working copies when the epic says Parallel: 2 or 3), have a separate reviewer judge it, merge the accepted commits into the epic branch one at a time, and end at the release pull request a person merges',
  whenToUse:
    'Started by the flow:run skill after its checks passed. Requires args {epic, repoRoot, pluginRoot}. Returns {outcome: "built" | "stopped", releasePullRequest, needsHuman, tickets}. It never merges toward the default branch.',
  phases: [
    { title: 'Wave', detail: 'one round: read what is ready from GitHub, build up to Parallel: tickets, review them, merge them in order' },
    { title: 'Release', detail: 'check every ticket at the epic head, open the release pull request, answer its review' },
  ],
}

const ARGS = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return args } })() : args
const SAFE_PATH = (path) => typeof path === 'string' && path.startsWith('/') && !/["`$\\\n\r]/.test(path)
const epic = ARGS && /^\d+$/.test(String(ARGS.epic ?? '').replace(/^#/, '')) ? Number(String(ARGS.epic).replace(/^#/, '')) : null
const repoRoot = ARGS && ARGS.repoRoot
const pluginRoot = ARGS && ARGS.pluginRoot
if (!epic || !SAFE_PATH(repoRoot) || !SAFE_PATH(pluginRoot))
  throw new Error(
    'flow-run-epic needs args {epic: <issue number>, repoRoot: <absolute path>, pluginRoot: <absolute path>}, paths without quotes, backticks, "$" or line breaks; the flow:run skill supplies them',
  )

const FLOW = `FLOW_UNATTENDED=1 node "${pluginRoot}/scripts/flow.mjs"`
const PROXY = { model: 'sonnet', effort: 'low' }
const WORKER_MODELS = new Set(['sonnet', 'opus'])
const MAX_IDLE_ROUNDS = 3
const LOCAL_RUN_MARKER = '<!-- flow:local-run -->'
const LOCAL_RUN_END_MARKER = '<!-- flow:local-run-end -->'

const BOARD_SCHEMA = {
  type: 'object',
  properties: {
    exitCode: { type: 'number' },
    approved: { type: 'boolean' },
    delivery: { type: ['string', 'null'] },
    parallel: { type: ['number', 'null'] },
    ready: { type: 'array', items: { type: 'number' } },
    inProgress: { type: 'array', items: { type: 'number' } },
    done: { type: 'array', items: { type: 'number' } },
    needsHuman: { type: 'array', items: { type: 'number' } },
    waiting: { type: 'array', items: { type: 'number' } },
    planned: { type: 'array', items: { type: 'number' } },
    tickets: {
      type: 'array',
      items: { type: 'object', properties: { n: { type: 'number' }, model: { type: 'string' }, state: { type: 'string' } }, required: ['n', 'model', 'state'] },
    },
  },
  required: ['exitCode', 'approved', 'ready', 'inProgress', 'done', 'needsHuman', 'waiting', 'planned', 'tickets'],
}
const COMMAND_SCHEMA = {
  type: 'object',
  properties: { exitCode: { type: 'number' }, output: { type: 'string' } },
  required: ['exitCode', 'output'],
}
const STEP_SCHEMA = {
  type: 'object',
  properties: {
    result: { type: 'string', enum: ['review', 'accepted', 'delivered', 'stopped'] },
    range: { type: 'string' },
    sha: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['result', 'summary'],
}
const PR_ROUND_SCHEMA = {
  type: 'object',
  properties: { result: { type: 'string', enum: ['clean', 'pushed', 'stopped'] }, summary: { type: 'string' } },
  required: ['result', 'summary'],
}

function commandPrompt(command, what) {
  return [
    `Run this one command from the repository at ${repoRoot} and report what it did. Change nothing else, and do not try to fix anything it complains about.`,
    '',
    '```bash',
    `cd "${repoRoot}" && ${command}`,
    '```',
    '',
    `${what} Return its exit code and its standard output exactly as printed (the last 4000 characters when it is longer).`,
    'It can run longer than one shell call allows: if it is still running after a few minutes, run it again in the background with its output sent to a file, wait for it to finish, and read the file.',
  ].join('\n')
}

async function runCommand(command, label, what = '') {
  const result = await agent(commandPrompt(command, what), { ...PROXY, label, schema: COMMAND_SCHEMA })
  if (!result) return { exitCode: -1, output: '', json: null }
  let json = null
  try {
    json = JSON.parse(result.output)
  } catch {
    const start = result.output.indexOf('{')
    const end = result.output.lastIndexOf('}')
    if (start !== -1 && end > start)
      try {
        json = JSON.parse(result.output.slice(start, end + 1))
      } catch {}
  }
  return { ...result, json }
}

async function readBoard(round) {
  const prompt = [
    commandPrompt(`${FLOW} next ${epic}`, 'It prints JSON, and exits 1 when the epic is not approved, has no tickets or is stuck; that is an answer, not a failure.'),
    '',
    'Fill every field from that JSON: approved, delivery, parallel, ready, inProgress, done, needsHuman, planned, tickets (each with n, model, state), and waiting as just the ticket numbers ("n" of each entry). Never fill a field from memory or guess one.',
  ].join('\n')
  return agent(prompt, { ...PROXY, label: `next:#${epic}:${round}`, schema: BOARD_SCHEMA })
}

function skillPrompt(ticket, argumentsText, root, extra = []) {
  const where =
    root === repoRoot
      ? [`The repository is ${repoRoot}: run every command there.`]
      : [
          `Work only in ${root}: a separate copy of the repository, set up for this ticket, because other tickets are being built beside it.`,
          `Run \`cd "${root}"\` before every command and treat that directory as the repository root. Never change anything in ${repoRoot}.`,
        ]
  return [
    `You are building ticket #${ticket} of epic #${epic} in an unattended run: nobody reads this conversation, so never wait for an answer.`,
    ...where,
    '',
    `Invoke the Skill tool with skill "flow:ticket" and args "${argumentsText}". If you have no Skill tool, read ${pluginRoot}/skills/ticket/SKILL.md and follow it, with $ARGUMENTS = "${argumentsText}" and \${CLAUDE_PLUGIN_ROOT} = ${pluginRoot}.`,
    'Stop where the skill tells you to stop.',
    ...extra,
    '',
    'Then return:',
    '- result "review" and range "<base>..<head>" when the skill ended with a REVIEW line;',
    '- result "accepted" and sha when it ended with an ACCEPTED line;',
    '- result "delivered" when the ticket was merged or its pull request opened;',
    '- result "stopped" when it asked a person (flow needs-human) or refused to start;',
    'and in summary one sentence on what happened.',
  ].join('\n')
}

function reviewPrompt(ticket, range, root, round) {
  return [
    `Review ticket #${ticket} of epic #${epic}${round === 2 ? ': the fixes made after the first review only' : ''}.`,
    `Repository: ${root}. Commit range: ${range}.`,
    `The ticket body (scope, what is not in scope, the acceptance criteria): \`${FLOW} ticket ${ticket}\`.`,
    `The epic's ground rules, settings and design sources: \`gh issue view ${epic} --json body\`.`,
    'The project\'s instruction files: CLAUDE.md and AGENTS.md at the repository root and in the directories the range touches.',
    `When the ticket has a COMPARE criterion, its comparison table is a comment on #${ticket} that starts "**Compared:**" (\`gh issue view ${ticket} --comments\`); read only that comment there.`,
    '',
    'Report in your three sections. Nobody will answer questions: decide from what the repository shows.',
  ].join('\n')
}

function workerArguments(ticket, wide, after = '') {
  return `#${ticket} --unattended ${after || '--until-review'}${wide ? ' --no-merge' : ''}`
}

function finished(step) {
  return step && ['accepted', 'delivered', 'stopped'].includes(step.result)
}

async function buildTicket({ ticket, model, root, wide, phaseName }) {
  const options = (role, round = '') => ({ label: `${role}:#${ticket}${round}`, phase: phaseName })
  log(`#${ticket}: building on ${model}`)
  const built = await agent(skillPrompt(ticket, workerArguments(ticket, wide), root), { ...options('worker'), model, schema: STEP_SCHEMA })
  if (!built) return { ticket, outcome: 'died', step: 'build' }
  if (finished(built)) return { ticket, outcome: built.result, sha: built.sha || null, summary: built.summary }
  if (built.result !== 'review' || !built.range) return { ticket, outcome: 'died', step: 'build', summary: built.summary }
  let range = built.range
  for (const round of [1, 2]) {
    log(`#${ticket}: review round ${round} over ${range}`)
    const report = await agent(reviewPrompt(ticket, range, root, round), { ...options('reviewer', round === 2 ? ':2' : ''), agentType: 'flow:ticket-reviewer' })
    if (!report) return { ticket, outcome: 'died', step: `review ${round}` }
    const after = await agent(
      skillPrompt(ticket, workerArguments(ticket, wide, `--after-review ${round}`), root, ['', `The reviewer read the range ${range}; post its report with \`--head ${range.split('..')[1] || range}\`.`, `The reviewer's report for round ${round}, exactly as it wrote it:`, '', '<review-report>', String(report), '</review-report>']),
      { ...options('fixes', round === 2 ? ':2' : ''), model, schema: STEP_SCHEMA },
    )
    if (!after) return { ticket, outcome: 'died', step: `fixes ${round}` }
    if (finished(after)) return { ticket, outcome: after.result, sha: after.sha || null, summary: after.summary }
    if (after.result !== 'review' || !after.range || round === 2) return { ticket, outcome: 'died', step: `fixes ${round}`, summary: after.summary }
    range = after.range
  }
  return { ticket, outcome: 'died', step: 'review' }
}

async function postOnEpic(text, label) {
  return runCommand(`${FLOW} post ${epic} --file - <<'FLOW_TEXT'\n${text}\nFLOW_TEXT`, label, 'It adds one comment to the epic issue.')
}

async function makeWorktrees(tickets, wave) {
  const made = await parallel(tickets.map((entry) => () => runCommand(`${FLOW} worktree ${entry.n}`, `worktree:#${entry.n}`, 'It prints JSON with the path of a new working copy and, on failure, why.')))
  const failures = []
  const roots = new Map()
  made.forEach((result, index) => {
    const ticket = tickets[index].n
    if (result && result.exitCode === 0 && result.json && SAFE_PATH(result.json.path)) roots.set(ticket, result.json.path)
    else failures.push(`#${ticket}: ${result && result.json && result.json.failure ? `${result.json.failure.step} — ${String(result.json.failure.detail).split('\n')[0]}` : 'the working copy could not be made'}`)
  })
  if (!failures.length) return { roots, failures }
  await removeWorktrees([...roots.keys()])
  log(`wave ${wave}: separate working copies failed (${failures.join('; ')}); this wave runs one ticket at a time`)
  return { roots: null, failures }
}

async function removeWorktrees(tickets) {
  await parallel(tickets.map((ticket) => () => runCommand(`${FLOW} worktree ${ticket} --remove`, `worktree-remove:#${ticket}`)))
}

async function askPerson(ticket, text) {
  const asked = await runCommand(`${FLOW} needs-human ${ticket} --file - <<'FLOW_TEXT'\n${text}\nFLOW_TEXT`, `needs-human:#${ticket}`, 'It hands the ticket to a person.')
  if (asked.exitCode === 0) {
    toldPerson.add(ticket)
    log(`#${ticket}: handed to a person`)
    return true
  }
  failedHandOffs.set(ticket, (failedHandOffs.get(ticket) || 0) + 1)
  log(`#${ticket}: handing it to a person failed (exit ${asked.exitCode})`)
  return false
}

function handedOff(ticket) {
  return toldPerson.has(ticket) || (failedHandOffs.get(ticket) || 0) >= MAX_FAILED_HAND_OFFS
}

async function recover(ticket, why) {
  settled.add(ticket)
  log(`#${ticket}: ${why}; putting it back to planned once, or asking a person if that already happened`)
  const reset = await runCommand(`${FLOW} reset ${ticket} --once`, `reset:#${ticket}`, 'It prints JSON whose "action" says what it did, also when it refuses.')
  const action = reset.json ? reset.json.action : null
  if (action === 'reset') {
    resetSince.add(ticket)
    settled.delete(ticket)
    return 'reset'
  }
  if (action === 'needs-human') {
    toldPerson.add(ticket)
    return 'needs-human'
  }
  if (action === 'refused' && reset.json.accepted) return 'accepted'
  if ((action === 'unstarted' || (action === 'refused' && reset.json.state === 'planned')) && !rebuiltUnstarted.has(ticket)) {
    rebuiltUnstarted.add(ticket)
    resetSince.add(ticket)
    settled.delete(ticket)
    log(`#${ticket}: it never started, so there is nothing to undo; it is built once more`)
    return 'reset'
  }
  const told = await askPerson(ticket, `The run building this ticket stopped without a result, and it could not be put back to planned${reset.json && reset.json.reason ? `: ${reset.json.reason}` : '.'}`)
  return told ? 'needs-human' : 'unreached'
}

async function mergeAndCheck(tickets, delivered, release, wave) {
  const merged = []
  for (const ticket of tickets) {
    const merge = await runCommand(`${FLOW} merge ${ticket}`, `merge:#${ticket}`, 'It merges the commit the acceptance comment names into the epic branch and prints JSON, or explains on standard error why not.')
    if (merge.exitCode === 0) {
      merged.push(ticket)
      log(`#${ticket}: merged into the epic branch`)
    } else log(`#${ticket}: not merged (exit ${merge.exitCode}); the ticket says why`)
  }
  const landed = release ? [...delivered, ...merged] : merged
  if (!landed.length) return merged
  const check = await runCommand(
    `${FLOW} check-epic ${epic} --tickets ${landed.join(',')} --mark`,
    `check-epic:#${epic}:${wave}`,
    'It runs the landed tickets\' checks at the epic branch head and prints JSON; a failing ticket is handed to a person by the command itself.',
  )
  log(check.exitCode === 0 ? `wave ${wave}: every landed ticket still passes at the epic head` : `wave ${wave}: the epic check failed or could not run; see the epic issue`)
  return merged
}

async function runWave({ chosen, wide, wave, release }) {
  const phaseName = `Wave ${wave}`
  phase(phaseName)
  let roots = null
  if (wide) {
    const made = await makeWorktrees(chosen, wave)
    roots = made.roots
    if (!roots)
      await postOnEpic(
        `${LOCAL_RUN_MARKER}\n<!-- flow:serial wave=${wave} tickets=${chosen.map((entry) => entry.n).join(',')} -->\n**Wave ${wave} runs one ticket at a time.** The separate working copies for building side by side could not be set up (${made.failures.join('; ')}), so this wave is built in the main checkout instead. Nothing was stopped for this.`,
        `post:#${epic}:fallback:${wave}`,
      )
  }
  const sideBySide = Boolean(roots)
  await postOnEpic(
    `${LOCAL_RUN_MARKER}\n**Wave ${wave}:** ${chosen.map((entry) => `#${entry.n} on ${entry.model}`).join(', ')}${sideBySide ? ', side by side' : chosen.length > 1 ? ', one at a time' : ''}.`,
    `post:#${epic}:wave:${wave}`,
  )
  let results
  if (sideBySide)
    results = await parallel(chosen.map((entry) => () => buildTicket({ ticket: entry.n, model: entry.model, root: roots.get(entry.n), wide: true, phaseName })))
  else {
    results = []
    for (const entry of chosen) results.push(await buildTicket({ ticket: entry.n, model: entry.model, root: repoRoot, wide: false, phaseName }))
  }
  results = results.map((result, index) => result || { ticket: chosen[index].n, outcome: 'died', step: 'unknown' })
  if (sideBySide) await removeWorktrees(chosen.map((entry) => entry.n))
  for (const result of results) if (result.outcome === 'died') result.recovery = await recover(result.ticket, `the run building it stopped without a result (${result.step})`)
  const toMerge = results.filter((result) => result.outcome === 'accepted' || result.recovery === 'accepted').map((result) => result.ticket)
  const delivered = results.filter((result) => result.outcome === 'delivered').map((result) => result.ticket)
  const merged = await mergeAndCheck(toMerge, delivered, release, wave)
  for (const result of results) if (merged.includes(result.ticket)) result.merged = true
  return results
}

function workerModel(board, ticket) {
  const entry = board.tickets.find((candidate) => candidate.n === ticket)
  return entry && WORKER_MODELS.has(entry.model) ? entry.model : 'opus'
}

const MAX_FAILED_HAND_OFFS = 2
const records = []
const startedHere = new Set()
const settled = new Set()
const resetSince = new Set()
const rebuiltUnstarted = new Set()
const toldPerson = new Set()
const failedHandOffs = new Map()
let board = null
let round = 0
let idleRounds = 0
let stopReason = null
for (;;) {
  round++
  board = (await readBoard(round)) || (await readBoard(`${round}:retry`))
  if (!board) {
    stopReason = 'nobody could read the board from GitHub'
    break
  }
  if (!board.approved) {
    stopReason = `epic #${epic} is not approved`
    break
  }
  if (idleRounds >= MAX_IDLE_ROUNDS) {
    stopReason = `${MAX_IDLE_ROUNDS} rounds in a row changed nothing`
    break
  }
  const release = board.delivery !== 'incremental'
  const orphaned = board.inProgress.filter((ticket) => startedHere.has(ticket) && !handedOff(ticket))
  if (orphaned.length) {
    const toMerge = []
    let progressed = false
    for (const ticket of orphaned) {
      if (settled.has(ticket)) {
        if (await askPerson(ticket, 'This run could not finish this ticket: it is still in progress after the run already tried to recover it once.')) progressed = true
        continue
      }
      const recovery = await recover(ticket, 'it is still in progress, and nothing in this run is working on it')
      if (recovery !== 'unreached') progressed = true
      if (recovery === 'accepted') toMerge.push(ticket)
    }
    if (toMerge.length) await mergeAndCheck(toMerge, [], release, `${round}:recovered`)
    idleRounds = progressed ? 0 : idleRounds + 1
    continue
  }
  if (!board.ready.length) {
    const unreached = board.inProgress.filter((ticket) => startedHere.has(ticket))
    const outside = board.inProgress.filter((ticket) => !startedHere.has(ticket))
    const reasons = [
      ...(unreached.length ? [`${unreached.map((ticket) => `#${ticket}`).join(', ')} stopped in this run and could not be handed to a person (asking failed twice)`] : []),
      ...(outside.length ? [`${outside.map((ticket) => `#${ticket}`).join(', ')} is in progress outside this run`] : []),
    ]
    if (reasons.length) stopReason = `${reasons.join('; ')}; nothing else is ready`
    break
  }
  const width = board.parallel >= 1 && board.parallel <= 3 ? board.parallel : 1
  const chosen = []
  for (const ticket of board.ready) {
    if (chosen.length >= width) break
    if (startedHere.has(ticket) && !resetSince.has(ticket)) {
      if (handedOff(ticket)) continue
      await askPerson(ticket, 'This run started this ticket before, it is still planned, and nothing put it back: its start fails without saying so. A person looks at why.')
      continue
    }
    chosen.push({ n: ticket, model: workerModel(board, ticket) })
  }
  if (!chosen.length) {
    idleRounds++
    continue
  }
  for (const entry of chosen) {
    startedHere.add(entry.n)
    resetSince.delete(entry.n)
  }
  const results = await runWave({ chosen, wide: chosen.length > 1, wave: round, release })
  records.push(...results)
  const changed = results.some((result) => ['delivered', 'accepted', 'stopped'].includes(result.outcome) || (result.recovery && result.recovery !== 'unreached') || result.merged)
  idleRounds = changed ? 0 : idleRounds + 1
}

phase('Release')
const final = (await readBoard('final')) || board
const ticketsLeft = final ? final.tickets.filter((ticket) => ticket.state !== 'done').map((ticket) => ticket.n) : []
const built = Boolean(final && final.approved && final.tickets.length && !ticketsLeft.length)
let releasePullRequest = null
let outcome = built ? 'built' : 'stopped'

if (built && final.delivery !== 'incremental') {
  const check = await runCommand(`${FLOW} check-epic ${epic} --mark`, `check-epic:#${epic}:release`, 'It runs every done ticket\'s checks at the epic branch head and prints JSON.')
  if (check.exitCode !== 0) {
    outcome = 'stopped'
    stopReason = 'the checks at the epic head failed or could not run, so no release pull request was opened'
  } else {
    const opened = await runCommand(`${FLOW} release-pr ${epic}`, `release-pr:#${epic}`, 'It opens the release pull request and prints JSON with its number and url.')
    if (opened.exitCode === 0 && opened.json && opened.json.pullRequest) {
      releasePullRequest = { number: opened.json.pullRequest, url: opened.json.url }
      for (const prRound of [1, 2]) {
        const answered = await agent(
          [
            `Epic #${epic}'s release pull request is #${releasePullRequest.number}. The repository is ${repoRoot}.`,
            `Invoke the Skill tool with skill "flow:ticket" and args "--pr-loop ${releasePullRequest.number} --wait --unattended". If you have no Skill tool, read ${pluginRoot}/skills/ticket/SKILL.md and follow its pull request loop, with \${CLAUDE_PLUGIN_ROOT} = ${pluginRoot}.`,
            'Run one round and stop. Return result "clean" when no review thread is open and every check passed, "pushed" when you pushed fixes, "stopped" when you asked a person; and one sentence of summary.',
          ].join('\n'),
          { label: `pr-loop:#${epic}:${prRound}`, model: 'opus', schema: PR_ROUND_SCHEMA },
        )
        if (!answered || answered.result !== 'pushed') break
      }
    } else {
      outcome = 'stopped'
      stopReason = 'the release pull request could not be opened; the epic issue or the command output says why'
    }
  }
}

const needsHuman = final ? final.needsHuman : []
const closing =
  outcome === 'built'
    ? `**Run finished: built.**${releasePullRequest ? ` Release pull request: ${releasePullRequest.url}. A person reviews and merges it.` : ' Every ticket was delivered by its own pull request.'}`
    : `**Run stopped.** ${stopReason || 'Nothing more can start.'}${needsHuman.length ? ` These tickets need a person: ${needsHuman.map((ticket) => `#${ticket}`).join(', ')}.` : ''}${ticketsLeft.length ? ` Not done: ${ticketsLeft.map((ticket) => `#${ticket}`).join(', ')}.` : ''}`
await postOnEpic(`${LOCAL_RUN_END_MARKER}\n${closing}`, `post:#${epic}:end`)
log(closing.replace(/\*\*/g, ''))

return { outcome, epic, releasePullRequest, needsHuman, notDone: ticketsLeft, stopReason, rounds: round, tickets: records }
