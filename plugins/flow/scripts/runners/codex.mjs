#!/usr/bin/env node
// codex.mjs — the Codex worker runner: one ticket, implemented by OpenAI's
// Codex CLI instead of a Claude subagent, reported in the exact shape the
// run driver's worker schema expects.
//
//   node codex.mjs <ID> --epic <name> --epic-branch epic/<name> \
//     --default-branch main --repo <abs> --plugin <abs> --label worker:<ID> \
//     [--model <m>] [--codex <bin>] [--timeout <ms>] [--network] [--json] \
//     [--git-timeout <ms>] [--start | --wait [--max-wait <ms>] | --cancel]
//
// Four ways to invoke it, over the same arguments:
//   - no mode flag: the single shot — run the ticket in this process and
//     print the report when it ends. What a human runs.
//   - --start: launch that same single shot as a detached background process
//     (its own session and process group, stdio on a log file) and return at
//     once with {"state":"started","stateDir":…,"attempt":n}. The report
//     lands atomically in a state directory derived from the arguments
//     alone — label, ticket, repository, epic — so --start, --wait and
//     --cancel agree on it without anyone passing a path. Each launch is a
//     numbered attempt with a random nonce, and every file it writes carries
//     that key (see the state directory below). Idempotent: a run launching,
//     running, or finished with its report unread for at most one wait slice
//     plus a minute is attached to, never launched twice — two Codex
//     sessions on one working tree commit each other's edits.
//   - --wait: block at most --max-wait ms (default and ceiling 540000) for
//     the current attempt's report; print it verbatim when it exists,
//     {"state":"pending",…} when the slice ends first, or a worker-shaped
//     halted report carrying "state":"failed" when no run was started or the
//     background process died without a report — a crashed run must never
//     look pending forever, and whatever it left running is stopped first.
//   - --cancel: stop the current attempt — its whole process group, the
//     runner and Codex — mark it consumed, and print a halted report with
//     "state":"cancelled" naming what was stopped and what the working tree
//     holds. Idempotent, and a no-op report when nothing is running. The
//     driver's proxy runs it before reporting anything but a delivered
//     report, and the run skill runs it before touching the tree after a
//     halt: a detached run outlives the proxy that started it, and a Codex
//     still editing the session's tree is how unreviewed work gets committed.
// Why the split: the run driver reaches this script through an agent's shell
// tool, which kills any command after at most 10 minutes (600000 ms), while
// a full ticket routinely needs its hour. Shortening the ticket's budget to
// fit the tool would break the work; slicing the wait does not. A report
// that was delivered, cancelled, or left unread past that bound, and a run
// that died, are not attached to: the next --start opens a new attempt,
// because a later run re-working the ticket must not be handed an earlier
// attempt's answer.
//
// What the runner owns, and Codex never does:
//   - git, entirely: the fetch and the branch before the run, the commit and
//     the push after it. Codex runs in its workspace-write sandbox, where
//     `.git` is read-only and there is NO network (unless --network), so the
//     model's whole write surface is the working tree — it edits files and
//     appends the status entry, and this script commits what it left (the
//     tree was clean at the start, so every change is the ticket's) under
//     an ID-prefixed subject. `branch-pushed` is what this script saw
//     `git push` do, never what the model said. The first live run proved
//     the need: Codex halted at `git checkout -b` with a sandbox denial;
//   - the prompt: the same scoped slice of the ticket skill the driver hands
//     a Claude worker (steps 1–6, no review, no merge, no agents), pointed at
//     the skill file on disk because Codex cannot load a Claude plugin skill
//     by name;
//   - the report: Codex's final message is constrained by --output-schema to
//     the worker schema, read back from the -o file, and then overridden
//     wherever the repository disagrees with it.
//
// Exit 0 when a report was produced, whatever its result — a `blocked` or
// `halted` report is an answer. Exit 1 only when the runner itself could not
// get one (no codex binary, a timeout, no parseable final message); the JSON
// is printed either way so the driver's proxy has something to relay.
// --wait exits with the stored run's code when it prints the report, 0 on
// pending, and 1 on a failure or a cancelled attempt; --start exits 0 once a
// run is launched or attached to, and --cancel exits 0. The JSON alone tells
// them apart — `"state":"pending"` means wait again, anything else is the
// answer — so a proxy never has to interpret an exit code.
//
// Zero dependencies. Every gate downstream — the review, the CHECK re-run,
// the addendum check, the SHA merge, the board's integrated state — reads
// git, so none of them cares which runner produced the branch.

import { spawnSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, renameSync, openSync, closeSync, statSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const TICKET_ID = /^[A-Z][A-Z0-9]*-\d+$/
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/
const MODEL = /^[A-Za-z0-9._-]+$/
const RESULTS = new Set(['branch-pushed', 'blocked', 'abandoned', 'halted'])
const STOPS = new Set(['none', 'blocked-entry', 'important-finding-unfixed', 'document-contradiction', 'merge-conflict', 'permission-prompt', 'other'])
const TIERS = new Set(['prose', 'normal', 'consequence'])

// ---- arguments --------------------------------------------------------------
const argv = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--json' || a === '--network' || a === '--start' || a === '--wait' || a === '--cancel' || a === '--background' || a === '--wave') flags[a.slice(2)] = true
  else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i]
  else positional.push(a)
}
const usage = () => {
  console.error(
    'usage: codex.mjs <ID> --epic <name> --epic-branch epic/<name> --default-branch <b> --repo <abs> --plugin <abs> --label worker:<ID> [--model <m>] [--codex <bin>] [--timeout <ms>] [--network] [--json] [--git-timeout <ms>] [--start | --wait [--max-wait <ms>] | --cancel]',
  )
  process.exit(2)
}
const id = (positional[0] || '').toUpperCase()
const { epic, plugin, repo, label } = flags
const epicBranch = flags['epic-branch']
const defaultBranch = flags['default-branch']
const model = flags.model || null
const codexBin = flags.codex || 'codex'
const timeoutMs = flags.timeout ? Number(flags.timeout) : 60 * 60 * 1000
if (!TICKET_ID.test(id) || !epic || !epicBranch || !defaultBranch || !repo || !plugin || !label) usage()
if (!SAFE_NAME.test(epic) || epic.includes('..') || !SAFE_NAME.test(epicBranch) || !SAFE_NAME.test(defaultBranch)) usage()
if (!repo.startsWith('/') || !plugin.startsWith('/') || /["`\n\r$]/.test(repo + plugin)) usage()
if (model && !MODEL.test(model)) usage()
if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) usage()
// Network git (fetch, push) gets a bound: a hung remote or a credential
// prompt nobody can answer would otherwise hang a detached run with no one
// watching it. Five minutes is generous for one ticket branch.
const gitTimeoutMs = flags['git-timeout'] ? Number(flags['git-timeout']) : 5 * 60 * 1000
if (!Number.isInteger(gitTimeoutMs) || gitTimeoutMs <= 0) usage()
// --background (with --attempt) is internal: it is the process --start
// launches. One mode at a time, and --max-wait only means something to --wait.
if ([flags.start, flags.wait, flags.cancel, flags.background].filter(Boolean).length > 1) usage()
// The wait slice's ceiling sits a minute under the proxy's 600000 ms shell
// limit, leaving room for Node to start and the report to print inside it.
const WAIT_CEILING_MS = 540000
if ('max-wait' in flags && !flags.wait) usage()
const maxWaitMs = 'max-wait' in flags ? Math.min(Number(flags['max-wait']), WAIT_CEILING_MS) : WAIT_CEILING_MS
if (!Number.isInteger(maxWaitMs) || maxWaitMs <= 0) usage()
const mode = flags.start ? 'start' : flags.wait ? 'wait' : flags.cancel ? 'cancel' : flags.background ? 'background' : 'once'

const branch = id.toLowerCase()
const repoRoot = resolve(repo)
const pluginRoot = resolve(plugin)
const started = Date.now()

const git = (args, opts = {}) => {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', ...opts })
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() || (r.error ? r.error.message : ''), timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') }
}
const line = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').slice(0, 400)
// Fetch and push, bounded by --git-timeout: a hung remote would otherwise
// hang a detached run that nobody is watching. No terminal prompt either — a
// credential prompt nobody can answer is the same hang.
const gitNet = (args) => {
  const r = git(args, { timeout: gitTimeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  return r.timedOut ? { ...r, status: null, err: `timed out after ${gitTimeoutMs} ms (--git-timeout)${r.err ? ` — ${r.err}` : ''}` } : r
}

// ---- the worker schema, as the driver defines it ---------------------------
// Kept in the same shape so the driver's proxy agent can relay the object
// unchanged. `runner` is this script's own addition, for the run record.
const WORKER_SCHEMA = {
  type: 'object',
  required: ['ticket', 'result', 'stopCondition', 'tier', 'tierWhy', 'branch', 'built', 'verification', 'deployPreconditions', 'detail'],
  additionalProperties: false,
  properties: {
    ticket: { type: 'string', description: 'the ticket ID you were given' },
    result: {
      type: 'string',
      enum: ['work-done', 'blocked', 'abandoned', 'halted'],
      description:
        '"work-done" ONLY if every step through the appended status entry is done in the working tree. "blocked"/"abandoned" if you wrote that status entry. "halted" for anything else that stopped you. You never commit or push: the runner commits what you left on the ticket branch, pushes it, and observes the result itself.',
    },
    stopCondition: {
      type: 'string',
      enum: ['none', 'blocked-entry', 'important-finding-unfixed', 'document-contradiction', 'merge-conflict', 'permission-prompt', 'other'],
      description: 'what stopped you, when result is not "work-done"; "none" when it is',
    },
    tier: {
      type: 'string',
      enum: ['prose', 'normal', 'consequence'],
      description:
        'the review tier YOUR diff earns under the ticket skill step 7 table: "prose" = documentation and code comments only; "consequence" = the risk list (auth boundaries, secrets, crypto, network exposure, migrations, anything that deletes or rewrites data, payments or billing, anything that can fail open); "normal" = everything else. When in doubt, the HIGHER tier.',
    },
    tierWhy: { type: 'string', description: 'one line: why that tier, naming what the diff can break' },
    branch: { type: 'string', description: 'the branch you were told you are on — the lowercased ticket ID' },
    built: { type: 'string', description: 'one to three sentences: what exists now that did not' },
    verification: { type: 'string', description: 'the exact commands you ran and their counts' },
    deployPreconditions: { type: 'array', items: { type: 'string' }, description: 'anything this ticket created that must exist before the release runs. [] if none.' },
    detail: { type: 'string', description: 'when you stopped: what stopped you, in one or two lines, pointing at the status entry that says why. "" otherwise.' },
  },
}

// ---- the prompt -------------------------------------------------------------
// One paragraph exists only where it is true: the driver says this is a wave
// (\`--wave\` — it made the worktree and ran the setup itself) and the branch
// carries the project's worktree setup. Guessing it from the checkout's shape
// was tried: a serial session in a linked worktree of the user's own has the
// same shape, and was told a setup had run that never did. Everywhere else — every serial run — the prompt is the one it
// was, word for word; an unconditional paragraph changed all of them, and told
// a worker with vendored wheels it could install nothing.
let worktreeNote = ''
try {
  if (flags.wave && existsSync(join(repoRoot, 'epics/worktree.json'))) {
    worktreeNote =
      "THIS IS A PARALLEL RUN'S FRESH WORKTREE, ALREADY SET UP. Before starting you, the run applied the project's `epics/worktree.json` — its `copy` files are here and its `setup` commands (the dependency install) have run — so read that file to know what you have. You have no network: what is not here and cannot be had offline makes its criterion owed, in those words; never passed, and never worked around.\n\n"
  }
} catch {}

// The driver's Claude-worker prompt, adapted for a runner that cannot load a
// plugin skill by name and a sandbox that has no network.
const prompt = `A driver spawned you for this one ticket. You are the implementing worker for ticket ${id} of the \`${epic}\` epic, running under the Ticket Flow methodology. You are working from documents, not from any conversation.

READ FIRST, IN FULL: ${pluginRoot}/skills/ticket/SKILL.md — the ticket skill. Wherever it writes \`\${CLAUDE_PLUGIN_ROOT}\`, that path is ${pluginRoot} (the environment variable CLAUDE_PLUGIN_ROOT is set to it as well). Execute the skill exactly as written, scoped as this prompt scopes it, which the skill's step 0 explicitly allows ("honoring whatever your spawn prompt scopes or forbids").

RUN: steps 1–6 — resolve (\`node "${pluginRoot}/scripts/tickets.mjs" find ${id} --json\`), read, implement, verify with counts, and append the status entry to the status log. Then STOP, with every change saved in the working tree.

GIT IS NOT YOURS. Your sandbox keeps \`.git\` read-only and has no network, so every git write the skill names is done by the runner, not by you: the runner already ran \`git fetch origin --prune\` and already created and checked out \`${branch}\` from \`${epicBranch}\` — you are on it now — and after you finish it commits everything you left in the working tree under a \`${id}: …\` subject and pushes \`${branch}\`, observing the result itself. So: skip step 3's branch commands, do NOT run \`git checkout\`, \`git add\`, \`git commit\` or \`git push\` (they will fail), skip every fetch, pull and \`gh\` command, and open no pull request — a release ticket has none of its own. Reading git (\`git log\`, \`git diff\`, \`git status\`, \`git show\`) is fine. Stay inside the ticket's scope: the runner commits the whole tree, so anything you touch outside scope ships.

${worktreeNote}DO NOT run step 7 (review), step 8 (fix and addendum) or step 10 (the gate and the merge). The driver hires the reviewer once your branch is pushed, gates on its findings, and merges. You do not review your own work, you do not merge, and you spawn no agents — the party under review never picks its judge.

REPORT THE REVIEW TIER for your own diff, from the ticket skill's step 7 table: \`prose\` (documentation and code comments only — nothing any runtime, parser, test or agent reads), \`consequence\` (the risk list: authentication or authorization boundaries, secrets, crypto, network exposure, migrations, anything that deletes or rewrites data, payments or billing, anything that can fail open), or \`normal\` (everything else, including configuration, user-facing strings, CLI output and agent/skill instructions). One line of why. When in doubt, the higher tier — the driver floors the tier in code from your branch's changed files, so your report can raise the review's price but never lower it.

A DEPARTURE FROM WHAT YOUR DOCUMENTS SHOW goes on its own \`**Deviation:**\` line in the status entry, one line per departure, as the skill's step 6 says. A missed estimate — a line count, a size — and a change made in answer to a review finding are not departures: the first goes under \`**Decisions:**\` with its figure, the second in the review addendum, as step 6 says. **The \`**Deviations closed:**\` line that closes one is never yours to write** — not for any departure, including one you fixed yourself in this ticket; record the fix as a deviation like any other. The driver halts before the merge on every \`**Deviation:**\` line your entry carries, closed or not, and a human decides what happens to it. That halt is the mechanism working, not something to avoid by leaving a departure unrecorded.

Your worker label for this run is \`${label}\` — record it in the status entry's Mode line (\`autonomous — driver-spawned worker ${label}\`). Report no token figure anywhere: your status entry's Tokens line reads \`recorded in the run record\`.

The repository is at ${repoRoot}; the epic is \`${epic}\` and its branch is \`${epicBranch}\`. Do NOT start another ticket, do not touch \`${epicBranch}\` or \`${defaultBranch}\`, and do not report on any ticket but this one.

HARD RULE: nothing you do merges, pushes, or retargets toward the default branch (${defaultBranch}). Your entire write surface is the \`${branch}\` branch.

Your FINAL message must be exactly one JSON object matching the schema you were given — nothing else. Report honestly: \`work-done\` only if every step through the appended status entry is done in the working tree. If a stop condition fired — a document/code contradiction, a merge conflict, anything that made the ticket undoable from its documents — write the status entry the skill requires and report it with the matching stopCondition. A halt is the mechanism working, not a failure; inventing progress past one is the only real failure.`

// ---- run --------------------------------------------------------------------
const out = {
  ticket: id,
  result: 'halted',
  stopCondition: 'other',
  tier: 'consequence',
  tierWhy: '',
  branch,
  built: '',
  verification: '',
  deployPreconditions: [],
  detail: '',
  runner: { name: 'codex', model: model || 'default', exitCode: null, usage: null, threadId: null, pushed: false, durationMs: 0, events: 0 },
}
const printReport = (r) => {
  if (flags.json) console.log(JSON.stringify(r, null, 2))
  else {
    console.log(`${r.ticket}: ${r.result}${r.stopCondition !== 'none' ? ` (${r.stopCondition})` : ''} — tier ${r.tier}`)
    if (r.detail) console.log(`  ${r.detail}`)
    if (r.runner && r.runner.usage) console.log(`  codex usage: ${JSON.stringify(r.runner.usage)}`)
  }
}

// ---- the state directory: --start, --wait, --cancel, the background run ----
// Derived from the arguments alone, so the commands the proxy runs — and a
// session's cancel after a halt — agree on it by construction. Label and
// ticket make it readable; the hash of the repository and epic keeps two
// projects' `worker:R-1` runs apart. The repository is hashed by its real
// path: a cancel that spelled the same repository through a symlink would
// otherwise find "nothing to cancel" while Codex kept editing the tree.
const repoKey = (() => {
  try {
    return realpathSync(repoRoot)
  } catch {
    return repoRoot
  }
})()
const stateDir = join(
  tmpdir(),
  'flow-codex-runs',
  `${label.replace(/[^A-Za-z0-9._-]+/g, '_')}--${id}--${createHash('sha256').update(`${repoKey}\n${epic}`).digest('hex').slice(0, 12)}`,
)
// Every --start that launches opens a new ATTEMPT, numbered in order and
// given a random nonce. Its files carry that key, so nothing one attempt
// writes can be read as another's answer — a run presumed dead that later
// finishes writes a report no --wait for the new attempt ever opens:
//   attempt-<n>.json  {n, nonce, pid, startedAt, timeoutMs}; created with
//                     O_EXCL, which is what makes two racing --starts launch
//                     one run: the second finds the file and attaches
//   result-<nonce>.json   {exitCode, report} from that attempt's background run
//   delivered-<n>     a --wait printed attempt n's report
//   cancelled-<n>.json    attempt n was stopped (--cancel, or --wait reaping a
//                     dead run) and its report is that stop; a background run
//                     that finds it stands down before committing anything
//   runner-<n>.log    the background run's stdout and stderr
// The highest n present is the current attempt.
const attemptFile = (n) => join(stateDir, `attempt-${n}.json`)
const resultFile = (nonce) => join(stateDir, `result-${nonce}.json`)
const deliveredFile = (n) => join(stateDir, `delivered-${n}`)
const cancelledFile = (n) => join(stateDir, `cancelled-${n}.json`)
const logFile = (n) => join(stateDir, `runner-${n}.log`)
// A rename within one directory is atomic: a reader sees no file or the whole
// file, never a half-written one that a JSON parse would misread as absent.
const writeAtomic = (file, text) => {
  const part = `${file}.part-${process.pid}`
  writeFileSync(part, text)
  renameSync(part, file)
}
// The background run's own key, passed by --start as --attempt <n>:<nonce>.
let myAttempt = null
if (mode === 'background') {
  const m = /^(\d+):([0-9a-f]{16})$/.exec(flags.attempt || '')
  if (!m) usage()
  myAttempt = { n: Number(m[1]), nonce: m[2] }
} else if ('attempt' in flags) usage()

const finish = (code) => {
  out.runner.durationMs = Date.now() - started
  if (mode === 'background') writeAtomic(resultFile(myAttempt.nonce), JSON.stringify({ exitCode: code, report: out }, null, 2))
  else printReport(out)
  process.exit(code)
}

// The background run answers on every path, a crash included — a run whose
// report never lands is one --wait can only call dead.
if (mode === 'background') {
  process.on('uncaughtException', (e) => {
    out.detail = `the background runner crashed: ${line((e && e.stack) || e)}`
    finish(1)
  })
}

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
// Signal 0 probes without delivering anything; EPERM means alive, not ours.
const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const mtimeAge = (file) => {
  try {
    return Date.now() - statSync(file).mtimeMs
  } catch {
    return Infinity
  }
}
// LAUNCH_GRACE_MS: how long an attempt record may lack its pid before the
// launch is presumed lost (--start records the pid milliseconds after
// creating the record). LATE_GRACE_MS: how far past the runner's own timeout
// a report may be late before a pid that still answers is presumed hung or
// reused — the backstop behind the liveness probe, so a dead run cannot read
// as pending for the proxy's whole wait loop. STALE_REPORT_MS: how old a
// finished report nobody has read may be before --start stops attaching to
// it and opens a new attempt — one wait slice plus a minute, the longest a
// proxy following the start-then-wait contract can take to read its own
// run's report, so an older one belongs to an attempt whose proxy is gone.
const LAUNCH_GRACE_MS = 60 * 1000
const LATE_GRACE_MS = 10 * 60 * 1000
const STALE_REPORT_MS = WAIT_CEILING_MS + 60 * 1000
const currentAttempt = () => {
  let names = []
  try {
    names = readdirSync(stateDir)
  } catch {
    return 0
  }
  return names.reduce((max, f) => {
    const m = /^attempt-(\d+)\.json$/.exec(f)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}
const inspect = () => {
  const n = currentAttempt()
  if (n === 0) return { state: 'absent', n, attempt: null }
  const cancelled = readJson(cancelledFile(n))
  const attempt = readJson(attemptFile(n))
  if (cancelled) return { state: 'cancelled', n, attempt, cancelled }
  if (!attempt || !attempt.nonce) {
    // Created but not yet readable in full — O_EXCL creation is not atomic.
    return mtimeAge(attemptFile(n)) < LAUNCH_GRACE_MS ? { state: 'launching', n, attempt: null } : { state: 'dead', n, attempt: null, why: `attempt ${n}'s record in ${stateDir} is unreadable` }
  }
  const result = readJson(resultFile(attempt.nonce))
  if (result) {
    return { state: existsSync(deliveredFile(n)) ? 'delivered' : 'finished', n, attempt, result, resultAgeMs: mtimeAge(resultFile(attempt.nonce)) }
  }
  if (!Number.isInteger(attempt.pid)) {
    return mtimeAge(attemptFile(n)) < LAUNCH_GRACE_MS ? { state: 'launching', n, attempt } : { state: 'dead', n, attempt, why: `attempt ${n} records no launched process ${LAUNCH_GRACE_MS} ms after it was opened` }
  }
  if (!alive(attempt.pid)) {
    // It may have written its report and exited between the two reads.
    const late = readJson(resultFile(attempt.nonce))
    if (late) return { state: 'finished', n, attempt, result: late, resultAgeMs: 0 }
    return { state: 'dead', n, attempt, why: `the background runner (pid ${attempt.pid}) exited without writing a report` }
  }
  const age = Date.now() - attempt.startedAt
  if (age > attempt.timeoutMs + LATE_GRACE_MS) {
    return { state: 'dead', n, attempt, why: `the background runner (pid ${attempt.pid}) has no report ${age} ms after it started — past its ${attempt.timeoutMs} ms timeout plus ${LATE_GRACE_MS} ms, so it is presumed hung (or its pid reused)` }
  }
  return { state: 'running', n, attempt }
}
const logTail = (n) => {
  try {
    const text = readFileSync(logFile(n), 'utf8').trim()
    return text ? ` — runner log tail: ${line(text.slice(-400))}` : ''
  } catch {
    return ''
  }
}
const printState = (o) => {
  if (flags.json) console.log(JSON.stringify(o, null, 2))
  else console.log(`${id}: ${o.state} — state dir ${o.stateDir}`)
}

// ---- stopping an attempt ------------------------------------------------------
// The background run leads its own process group (detached = setsid), and
// Codex, spawned from it without detaching, is a member — so one group signal
// reaches both, and also a Codex left orphaned when its runner was killed.
// A pid can be reused once its process is gone, so a live leader is
// signalled only when `ps` shows it is this attempt's runner (its argv
// carries the nonce); a group with no live leader cannot have had its id
// reissued, because an id is not handed out while its group has members.
const groupAlive = (pgid) => {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const killAttempt = (attempt) => {
  if (!attempt || !Number.isInteger(attempt.pid)) return 'no process had been recorded for it'
  const pgid = attempt.pid
  if (alive(pgid)) {
    const ps = spawnSync('ps', ['-o', 'command=', '-p', String(pgid)], { encoding: 'utf8' })
    if (ps.status === 0 && !ps.stdout.includes(attempt.nonce)) return `pid ${pgid} is no longer this attempt's runner (the pid was reused), so nothing was signalled`
  }
  if (!groupAlive(pgid)) return `nothing of it was still running (process group ${pgid} is empty)`
  for (const [sig, graceMs] of [['SIGTERM', 5000], ['SIGKILL', 2000]]) {
    try {
      process.kill(-pgid, sig)
    } catch {}
    for (let waited = 0; waited < graceMs && groupAlive(pgid); waited += 100) sleepMs(100)
    if (!groupAlive(pgid)) return `stopped its process group ${pgid} (the runner and Codex) with ${sig}`
  }
  return `process group ${pgid} survived SIGKILL — check it by hand`
}
// What a stopped run leaves in the working tree is not the runner's to
// discard — it may be the only copy of the work — so the report names it.
const treeNote = () => {
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const dirty = git(['status', '--porcelain'])
  const lines = dirty.status === 0 && dirty.out ? dirty.out.split('\n') : []
  // A run stopped between `git add -A` and a finished commit leaves its edits
  // STAGED, and a later plain `git commit` commits the whole index — so staged
  // paths are named apart: they are the ones that would ride into someone
  // else's commit.
  const cached = git(['diff', '--cached', '--name-only'])
  const staged = cached.status === 0 && cached.out ? cached.out.split('\n').length : 0
  return `HEAD is ${head.status === 0 ? head.out : 'unreadable'}; ${lines.length} uncommitted path(s) in the working tree, ${staged} of them staged${lines.length ? ' — unreviewed edits of the stopped run: inspect or discard them before touching the tree' : ''}`
}
// Marks the attempt consumed FIRST — a background run reaching its commit
// step between the mark and the signal stands down instead of committing —
// then stops it, and stores the stop as that attempt's report.
const stopAttempt = (s, why, reportState, tail = '') => {
  const report = { state: reportState, ...out }
  writeAtomic(cancelledFile(s.n), JSON.stringify({ report }, null, 2))
  report.detail = `${line(why)}: ${killAttempt(s.attempt)}; ${treeNote()}${tail}`
  writeAtomic(cancelledFile(s.n), JSON.stringify({ report }, null, 2))
  return report
}

// The background run checks, before each step that touches the repository,
// that it is still the current attempt and was not cancelled — the in-tree
// half of the guarantee that a stopped or superseded run commits nothing.
const standDown = () => {
  if (mode !== 'background') return null
  if (existsSync(cancelledFile(myAttempt.n))) return `attempt ${myAttempt.n} was cancelled`
  const n = currentAttempt()
  if (n !== myAttempt.n) return `attempt ${myAttempt.n} was superseded by attempt ${n}`
  return null
}

if (mode === 'start') {
  mkdirSync(stateDir, { recursive: true })
  for (let tries = 0; ; tries++) {
    const s = inspect()
    // Attach to a run that is launching or running, or that finished with
    // its report not yet read and not yet stale: that is this proxy's run.
    if (s.state === 'launching' || s.state === 'running' || (s.state === 'finished' && s.resultAgeMs <= STALE_REPORT_MS) || tries >= 20) {
      printState({ state: 'started', ticket: id, stateDir, attempt: s.n, pid: s.attempt ? s.attempt.pid : null, attached: true, finished: s.state === 'finished' })
      process.exit(0)
    }
    // Everything else opens a new attempt: nothing started yet; a report
    // already delivered, cancelled, or stale belongs to an attempt the driver
    // has finished with; a dead run has nothing left to wait for — and
    // anything it orphaned is stopped first, so two Codex sessions never
    // share the tree. The clean-tree refusal still stands between the new
    // attempt and whatever the old one left.
    if (s.state === 'dead') stopAttempt(s, `attempt ${s.n} was presumed dead (${s.why}) when attempt ${s.n + 1} opened`, 'failed')
    const n = s.n + 1
    const nonce = randomBytes(8).toString('hex')
    try {
      writeFileSync(attemptFile(n), JSON.stringify({ n, nonce, pid: null, startedAt: Date.now(), timeoutMs, ticket: id, label, repo: repoRoot }, null, 2), { flag: 'wx' })
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      continue // a concurrent --start opened attempt n first: look again, and attach
    }
    const childArgs = [id, '--epic', epic, '--epic-branch', epicBranch, '--default-branch', defaultBranch, '--repo', repo, '--plugin', plugin, '--label', label, '--timeout', String(timeoutMs), '--git-timeout', String(gitTimeoutMs), '--background', '--attempt', `${n}:${nonce}`]
    if (model) childArgs.push('--model', model)
    if (flags.codex) childArgs.push('--codex', codexBin)
    if (flags.network) childArgs.push('--network')
    if (flags.wave) childArgs.push('--wave')
    // detached: a new session and process group, so neither this process
    // exiting nor a kill aimed at the shell command's group reaches it.
    // stdio on a log file, so no pipe the caller reads stays held open.
    const logFd = openSync(logFile(n), 'a')
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...childArgs], { detached: true, stdio: ['ignore', logFd, logFd] })
    closeSync(logFd)
    if (!child.pid) {
      out.detail = `could not launch the background runner with ${line(process.execPath)}`
      const failed = { state: 'failed', ...out }
      writeAtomic(resultFile(nonce), JSON.stringify({ exitCode: 1, report: failed }, null, 2))
      printReport(failed)
      process.exit(1)
    }
    child.unref()
    writeAtomic(attemptFile(n), JSON.stringify({ n, nonce, pid: child.pid, startedAt: Date.now(), timeoutMs, ticket: id, label, repo: repoRoot }, null, 2))
    printState({ state: 'started', ticket: id, stateDir, attempt: n, pid: child.pid, attached: false })
    process.exit(0)
  }
}

if (mode === 'wait') {
  const waitStarted = Date.now()
  const POLL_MS = 250
  for (;;) {
    const s = inspect()
    if (s.state === 'finished' || s.state === 'delivered') {
      try {
        writeFileSync(deliveredFile(s.n), '')
      } catch {}
      printReport(s.result.report)
      process.exit(s.result.exitCode === 0 ? 0 : 1)
    }
    if (s.state === 'cancelled') {
      printReport(s.cancelled.report)
      process.exit(1)
    }
    if (s.state === 'absent') {
      out.detail = `no run was started for ${id} (${label}) — nothing to wait for; run the same command with --start first`
      printReport({ state: 'failed', ...out })
      process.exit(1)
    }
    if (s.state === 'dead') {
      // A dead runner can leave Codex orphaned and still editing the tree:
      // the wait that finds it stops what is left before it reports.
      printReport(stopAttempt(s, s.why, 'failed', logTail(s.n)))
      process.exit(1)
    }
    const waited = Date.now() - waitStarted
    if (waited >= maxWaitMs) {
      printState({ state: 'pending', ticket: id, stateDir, attempt: s.n, pid: s.attempt ? s.attempt.pid : null, runningMs: s.attempt ? Date.now() - s.attempt.startedAt : 0, waitedMs: waited })
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, Math.min(POLL_MS, maxWaitMs - waited)))
  }
}

if (mode === 'cancel') {
  const s = inspect()
  if (s.state === 'absent') {
    out.detail = `no run was started for ${id} (${label}) — nothing to cancel`
    printReport({ state: 'cancelled', ...out })
  } else if (s.state === 'cancelled') {
    printReport(s.cancelled.report)
  } else if (s.state === 'delivered') {
    out.detail = `attempt ${s.n} had already finished and its report was delivered — nothing to cancel; ${treeNote()}`
    printReport({ state: 'cancelled', ...out })
  } else if (s.state === 'finished') {
    printReport(stopAttempt(s, `attempt ${s.n} had already finished (${line(s.result.report && s.result.report.result)}) before the cancel; its unread report is discarded`, 'cancelled'))
  } else {
    printReport(stopAttempt(s, `cancelled attempt ${s.n}${s.why ? ` (${s.why})` : ''}`, 'cancelled'))
  }
  process.exit(0)
}

// The background run may already have been cancelled or superseded while it
// waited to be scheduled; it then touches nothing.
{
  const why = standDown()
  if (why) {
    out.detail = `${why} before it started — the runner touched nothing`
    finish(1)
  }
}

// The runner owns git: fetch and branch now, commit and push at the end.
// The tree must be clean first — every change left after Codex runs is
// committed as the ticket's, which is only true if nothing else was there.
{
  const f = gitNet(['fetch', 'origin', '--prune'])
  if (f.status !== 0) {
    out.detail = `git fetch failed before the run: ${line(f.err)}`
    finish(1)
  }
  const dirty = git(['status', '--porcelain'])
  if (dirty.status !== 0 || dirty.out) {
    out.detail = `the working tree is not clean before the run (${line(dirty.out || dirty.err)}) — the runner commits everything Codex leaves, so it refuses to start over changes that are not the ticket's`
    finish(1)
  }
  const exists = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0
  const co = exists ? git(['checkout', '-q', branch]) : git(['checkout', '-q', '-b', branch, `origin/${epicBranch}`])
  if (co.status !== 0) {
    out.detail = `could not check out ${branch}${exists ? '' : ` from origin/${epicBranch}`}: ${line(co.err)}`
    finish(1)
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'flow-codex-'))
const schemaFile = join(tmp, 'worker-schema.json')
const lastFile = join(tmp, 'last-message.json')
writeFileSync(schemaFile, JSON.stringify(WORKER_SCHEMA))

const codexArgs = [
  'exec',
  '--json',
  '--color',
  'never',
  '-C',
  repoRoot,
  '-s',
  'workspace-write',
  '--output-schema',
  schemaFile,
  '-o',
  lastFile,
  '-c',
  `shell_environment_policy.set.CLAUDE_PLUGIN_ROOT="${pluginRoot}"`,
]
if (flags.network) codexArgs.push('-c', 'sandbox_workspace_write.network_access=true')
if (model) codexArgs.push('-m', model)
codexArgs.push('-')

{
  const why = standDown()
  if (why) {
    rmSync(tmp, { recursive: true, force: true })
    out.detail = `${why} before Codex launched — the runner checked out ${branch} and launched nothing`
    finish(1)
  }
}

const run = spawnSync(codexBin, codexArgs, {
  cwd: repoRoot,
  input: prompt,
  encoding: 'utf8',
  timeout: timeoutMs,
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
})
out.runner.exitCode = run.status

if (run.error) {
  out.detail =
    run.error.code === 'ENOENT'
      ? `codex binary not found (${codexBin}) — install @openai/codex and sign in before a run declares Worker runner: codex`
      : run.error.code === 'ETIMEDOUT'
        ? `codex exceeded the runner timeout of ${timeoutMs} ms`
        : `codex could not be run: ${line(run.error.message)}`
  rmSync(tmp, { recursive: true, force: true })
  finish(1)
}

// ---- parse the event stream -------------------------------------------------
let lastMessage = null
for (const raw of (run.stdout || '').split('\n')) {
  if (!raw.trim()) continue
  let ev
  try {
    ev = JSON.parse(raw)
  } catch {
    continue
  }
  out.runner.events++
  if (ev.type === 'thread.started' && ev.thread_id) out.runner.threadId = ev.thread_id
  if (ev.type === 'turn.completed' && ev.usage) {
    const u = ev.usage
    const prev = out.runner.usage || { input: 0, cached: 0, output: 0 }
    out.runner.usage = {
      input: prev.input + (u.input_tokens || 0),
      cached: prev.cached + (u.cached_input_tokens || 0),
      output: prev.output + (u.output_tokens || 0),
    }
  }
  if (ev.type === 'item.completed' && ev.item && ev.item.type === 'agent_message' && typeof ev.item.text === 'string') lastMessage = ev.item.text
  if (ev.type === 'error' && ev.message) out.detail = `codex error: ${line(ev.message)}`
}

let report = null
for (const text of [existsSync(lastFile) ? readFileSync(lastFile, 'utf8') : null, lastMessage]) {
  if (!text) continue
  try {
    const parsed = JSON.parse(text.trim())
    if (parsed && typeof parsed === 'object') {
      report = parsed
      break
    }
  } catch {
    // not JSON — try the next source
  }
}
rmSync(tmp, { recursive: true, force: true })

// ---- commit what Codex left, then reconcile its report with git -------------
// The tree was clean when Codex started, so every change is the ticket's.
// The subject is ID-prefixed because that prefix is how the board derives
// shipped and integrated state — the one thing a commit must get right.
//
// Two guards come first, because `git add -A` and `git commit` land on
// whatever is checked out. A run that outlived its proxy can find the
// session standing on `epic/<name>` writing a halt record: committing there
// would put an unreviewed `<ID>: …` commit on the epic branch, published by
// its next push past review, the CHECK re-run and the SHA merge. So the
// runner commits (and pushes) only on the ticket branch it checked out, and
// only while its attempt is still current and not cancelled; otherwise it
// commits nothing and says what it found.
{
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const why = standDown() || (head.status !== 0 || head.out !== branch ? `HEAD is ${head.status === 0 ? head.out : 'unreadable'}, not the ticket branch ${branch} the runner checked out — something switched branches during the run` : null)
  if (why) {
    out.result = 'halted'
    out.stopCondition = 'other'
    out.detail = `${why}; the runner committed and pushed nothing — ${treeNote()}`
    finish(1)
  }
}
const changed = git(['status', '--porcelain']).out
let committed = false
if (changed) {
  const subject = `${id}: ${line(report && report.built) || 'ticket work'}`.slice(0, 120)
  const add = git(['add', '-A'])
  const commit = add.status === 0 ? git(['commit', '-q', '-m', subject]) : add
  if (commit.status !== 0) {
    out.detail = `could not commit the working tree Codex left: ${line(commit.err)}`
    finish(1)
  }
  committed = true
}
const commitsAhead = (() => {
  const n = git(['rev-list', '--count', `origin/${epicBranch}..${branch}`])
  return n.status === 0 ? Number(n.out) || 0 : 0
})()

if (!report) {
  out.detail = out.detail || `codex exited ${run.status} without a parseable final JSON report${committed ? ` — its working-tree changes were committed on ${branch} (${commitsAhead} commit(s) ahead) but not pushed` : ''}`
  if (run.status !== 0 && run.stderr) out.detail += ` — stderr: ${line(run.stderr)}`
  finish(1)
}

// Copy the model's fields through the schema's shape, defaulting anything
// malformed toward scrutiny rather than trust.
out.tier = TIERS.has(report.tier) ? report.tier : 'consequence'
out.tierWhy = line(report.tierWhy)
out.built = line(report.built)
out.verification = line(report.verification)
out.deployPreconditions = Array.isArray(report.deployPreconditions) ? report.deployPreconditions.filter((x) => typeof x === 'string').map(line) : []
out.detail = line(report.detail)
const claimed = report.result === 'work-done' ? 'branch-pushed' : RESULTS.has(report.result) ? report.result : 'halted'
out.stopCondition = STOPS.has(report.stopCondition) ? report.stopCondition : claimed === 'branch-pushed' ? 'none' : 'other'
if (report.ticket && String(report.ticket).toUpperCase() !== id) {
  out.result = 'halted'
  out.stopCondition = 'document-contradiction'
  out.detail = `codex reported on ${line(report.ticket)}, not ${id}`
  finish(0)
}

// The push is the runner's, and so is the verdict on it. A branch with
// commits is pushed whatever the model claimed — a BLOCKED entry must reach
// the remote too — but `branch-pushed` is granted only to a work-done
// claim whose push this script watched succeed.
if (commitsAhead > 0) {
  const p = gitNet(['push', '-u', 'origin', branch])
  out.runner.pushed = p.status === 0
  if (p.status !== 0) {
    out.result = 'halted'
    out.stopCondition = 'other'
    out.detail = `git push -u origin ${branch} failed: ${line(p.err)}`
    finish(0)
  }
}

if (claimed === 'branch-pushed') {
  if (commitsAhead === 0) {
    out.result = 'halted'
    out.stopCondition = 'document-contradiction'
    out.detail = `codex reported work-done but left no changes: ${branch} has no commits ahead of origin/${epicBranch}`
  } else {
    out.result = 'branch-pushed'
    out.stopCondition = 'none'
  }
} else {
  out.result = claimed
}
finish(0)
