#!/usr/bin/env node
// codex-review.mjs — the Codex shadow-review runner: one finished ticket,
// reviewed by OpenAI's Codex CLI in a read-only sandbox, from the same packet
// the run driver hands the Claude reviewer, answering in the same shape.
//
//   node codex-review.mjs <ID> --epic <name> --branch <ticket-branch> \
//     --range <range> --head <sha> --repo <abs> --plugin <abs> \
//     [--model <m>] [--effort <e>] [--codex <bin>] [--timeout <ms>] --json
//
// What the runner owns, and Codex never does:
//   - the checkout: Codex reviews a detached worktree at --head, never the
//     caller's checkout. The driver's checkout is not guaranteed to sit at
//     the reviewed head, and a later step may be editing it while Codex reads — a review of files that moved under it is
//     a review of nothing. The worktree is removed on every path;
//   - the prompt: the Claude reviewer's packet, byte for byte where it can be
//     (the driver's packet body and REVIEWER_RULES, pinned by the suite),
//     with one substitution — the status entry is read by SHA
//     (`git show <head>:…`) where the driver reads `origin/<branch>` — the same
//     commit, read without depending on the remote-tracking ref;
//   - the verdict on the report: the report is the `-o` file Codex writes at
//     turn completion and nothing else. `--output-schema` constrains Codex's
//     in-progress messages too, so an interim "I'm reading the diff" message
//     parses as a valid EMPTY review (the planning probe saw four) — falling
//     back to the last streamed message would turn a crash into a clean
//     review. And `reviewedHead` must resolve to the head the runner checked
//     out, or the review is a failure kept verbatim.
//
// Always exit 0 with one JSON object — `reviewed` or `failed` with a reason —
// because a shadow review gates nothing: a failure is a recorded fact, never
// a stop. Exit 2 is a usage error only.
//
// Zero dependencies, and no shared helper with runners/codex.mjs: the Codex
// review is a trial, and keeping it self-contained keeps it removable in one
// delete; the argument discipline is copied.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, writeSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'

const TICKET_ID = /^[A-Z][A-Z0-9]*-\d+$/
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/
const MODEL = /^[A-Za-z0-9._-]+$/
const EFFORT = /^[a-z]+$/
const SHA = /^[0-9a-f]{7,40}$/
// A revision range as git spells it (`A..B`, `A...B`, `A^1...B`,
// `origin/epic/x...abc1234`). It is written into shell commands the model
// types, so nothing that quotes, expands or separates is allowed.
const RANGE = /^[A-Za-z0-9][A-Za-z0-9._\/^~-]*$/

// ---- arguments --------------------------------------------------------------
const argv = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--json') flags.json = true
  else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i]
  else positional.push(a)
}
const usage = () => {
  console.error(
    'usage: codex-review.mjs <ID> --epic <name> --branch <ticket-branch> --range <range> --head <sha> --repo <abs> --plugin <abs> [--model <m>] [--effort <e>] [--codex <bin>] [--timeout <ms>] --json',
  )
  process.exit(2)
}
const id = (positional[0] || '').toUpperCase()
const { epic, branch, range, head, repo, plugin } = flags
const model = flags.model || null
const effort = flags.effort || 'xhigh'
const codexBin = flags.codex || 'codex'
const timeoutMs = flags.timeout ? Number(flags.timeout) : 30 * 60 * 1000
// setTimeout clamps a delay above 2^31-1 ms to 1 ms, which would kill Codex
// the moment it started and report that as a timeout.
const MAX_TIMEOUT_MS = 2 ** 31 - 1
if (!TICKET_ID.test(id) || !epic || !branch || !range || !head || !repo || !plugin) usage()
if (!SAFE_NAME.test(epic) || epic.includes('..') || !SAFE_NAME.test(branch) || branch.includes('..')) usage()
if (!RANGE.test(range) || !SHA.test(head)) usage()
if (!repo.startsWith('/') || !plugin.startsWith('/') || /["`\n\r$]/.test(repo + plugin)) usage()
if ((model && !MODEL.test(model)) || !EFFORT.test(effort)) usage()
if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) usage()

const repoRoot = resolve(repo)
const pluginRoot = resolve(plugin)
const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
const started = Date.now()

const git = (args) => {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' })
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const line = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').slice(0, 400)

// The model: what was asked for, else the top-level `model` key of Codex's
// own config (a `[profile]` table's model is not the default), else the
// honest "config default" — no event Codex prints names the model it used.
const configuredModel = () => {
  let text
  try {
    text = readFileSync(join(codexHome, 'config.toml'), 'utf8')
  } catch {
    return null
  }
  for (const raw of text.split('\n')) {
    if (/^\s*\[/.test(raw)) break
    const m = raw.match(/^\s*model\s*=\s*(?:"([^"]*)"|'([^']*)')\s*(?:#.*)?$/)
    if (m) return line(m[1] ?? m[2]) || null
  }
  return null
}

// ---- the review schema, strict ------------------------------------------------
// The driver's REVIEW_SCHEMA in the form `--output-schema` accepts: every
// property required, `additionalProperties: false` on every object, the one
// optional field (`preExisting[].owner`) nullable instead of omittable, and
// `reviewedHead` required. The suite extracts the driver's schema and holds
// the names, item shapes and enums equal, so the shadow answers in the shape
// the driver gates the Claude reviewer on.
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['important', 'nits', 'nitOverflowCount', 'preExisting', 'checkedAndSound', 'reviewedHead'],
  properties: {
    important: {
      type: 'array',
      description: 'findings that would break behaviour, lose data, or widen an exposure. [] when there are none — an empty list is a normal and welcome result, never something to pad.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'cite', 'summary', 'confirmedOrPlausible', 'failure'],
        properties: {
          file: { type: 'string', description: 'repository-relative path' },
          cite: { type: 'string', description: 'file:line you actually opened — an inference from a name is not a citation' },
          summary: { type: 'string', description: 'one line: what is wrong' },
          confirmedOrPlausible: { type: 'string', enum: ['confirmed', 'plausible'] },
          failure: { type: 'string', description: 'the concrete failure: which input, which state, which wrong output. For "plausible", say what would settle it.' },
        },
      },
    },
    nits: {
      type: 'array',
      maxItems: 5,
      description: 'real but small — at most five, the five that matter',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cite', 'summary'],
        properties: { cite: { type: 'string' }, summary: { type: 'string' } },
      },
    },
    nitOverflowCount: { type: 'integer', description: 'how many further nits you saw and did not list (0 when none)' },
    preExisting: {
      type: 'array',
      description: 'genuine defects in surrounding code this change did not introduce — reported, never blocking',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cite', 'summary', 'owner'],
        properties: {
          cite: { type: 'string' },
          summary: { type: 'string' },
          owner: { type: ['string', 'null'], description: 'the ticket that should inherit it, if you can name one; null otherwise' },
        },
      },
    },
    checkedAndSound: { type: 'string', description: 'one or two lines on what you verified and found correct, so the next reviewer does not re-tread it' },
    reviewedHead: {
      type: 'string',
      description: 'the commit you reviewed: what `git rev-parse HEAD` printed in the repository you were given, 7-40 hex characters, verbatim — never reconstructed from memory. The runner checked that commit out for you and verifies this against it.',
    },
  },
}

// ---- the report ---------------------------------------------------------------
const out = {
  ticket: id,
  outcome: 'failed',
  reason: null,
  detail: '',
  review: null,
  head,
  headVerified: false,
  runner: { name: 'codex', model: model || configuredModel() || 'config default', effort, exitCode: null, usage: null, durationMs: 0, threadId: null, events: 0 },
}

let tmp = null
let worktree = null
let child = null
const cleanup = () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }
  if (worktree) {
    if (git(['worktree', 'remove', '--force', worktree]).status !== 0) {
      rmSync(worktree, { recursive: true, force: true })
      git(['worktree', 'prune'])
    }
    worktree = null
  }
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true })
    tmp = null
  }
}
// The report is written synchronously, all of it, before the process exits.
// `console.log` to a pipe is asynchronous on macOS, and `process.exit` right
// after it drops everything past the first 65,536 bytes — a long review would
// reach the caller as truncated JSON. A pipe the caller left non-blocking
// answers EAGAIN while full, so the write waits briefly and retries.
const writeAll = (text) => {
  const buf = Buffer.from(text, 'utf8')
  const pause = new Int32Array(new SharedArrayBuffer(4))
  let off = 0
  while (off < buf.length) {
    try {
      off += writeSync(1, buf, off, buf.length - off)
    } catch (e) {
      if (e.code !== 'EAGAIN') return // EPIPE: nobody is reading any more
      Atomics.wait(pause, 0, 0, 5)
    }
  }
}
const finish = () => {
  cleanup()
  out.runner.durationMs = Date.now() - started
  if (flags.json) writeAll(`${JSON.stringify(out, null, 2)}\n`)
  else {
    const lines = [`${id}: shadow review ${out.outcome}${out.reason ? ` (${out.reason})` : ''}`]
    if (out.detail) lines.push(`  ${out.detail}`)
    if (out.review) lines.push(`  important: ${Array.isArray(out.review.important) ? out.review.important.length : '?'}`)
    if (out.runner.usage) lines.push(`  codex usage: ${JSON.stringify(out.runner.usage)}`)
    writeAll(`${lines.join('\n')}\n`)
  }
  process.exit(0)
}
const fail = (reason, detail) => {
  out.outcome = 'failed'
  out.reason = reason
  out.detail = detail
  finish()
}
// A runner stopped from outside still removes its worktree and its Codex, and
// still prints its report: one JSON object on every path. The reason is
// `codex-exit` — the closed set has no "interrupted", and what the caller
// needs to know is the same as for a Codex that died: no review exists.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    fail('codex-exit', `the runner received ${sig} and stopped Codex${child ? '' : ' (before it started)'} — no review exists`)
  })
}

// ---- before Codex: the head, the credential, the worktree -----------------------
{
  const verify = () => git(['rev-parse', '--verify', '--quiet', `${head}^{commit}`])
  let v = verify()
  let fetchNote = ''
  if (v.status !== 0) {
    const f = git(['fetch', 'origin', branch])
    fetchNote = f.status === 0 ? ` (after \`git fetch origin ${branch}\`)` : ` (and \`git fetch origin ${branch}\` failed: ${line(f.err)})`
    v = verify()
  }
  if (v.status !== 0 || !/^[0-9a-f]{40}$/.test(v.out)) fail('head-not-found', `${head} does not resolve to a commit in ${repoRoot}${fetchNote} — Codex was not started`)
  out.head = v.out
}

if (!existsSync(join(codexHome, 'auth.json')) && !process.env.OPENAI_API_KEY) {
  fail('signed-out', `codex is not signed in — no ${join(codexHome, 'auth.json')} and no OPENAI_API_KEY; run \`codex login\` — Codex was not started`)
}

// Real path: macOS's tmpdir is a symlink, and git and Codex report resolved paths.
tmp = realpathSync(mkdtempSync(join(tmpdir(), 'flow-codex-review-')))
{
  const wt = join(tmp, 'wt')
  // Hooks off: a project's post-checkout hook (a husky install, say) would
  // run here, before Codex's clock starts, and eat the headroom under the
  // proxy's shell ceiling.
  const add = git(['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', wt, out.head])
  // A worktree that cannot be made leaves the head unreadable in the form
  // Codex reviews, so it is recorded under head-not-found with the cause.
  if (add.status !== 0) fail('head-not-found', `could not check ${out.head} out into a review worktree: ${line(add.err)} — Codex was not started`)
  worktree = wt
}
const schemaFile = join(tmp, 'review-schema.json')
const lastFile = join(tmp, 'report.json')
writeFileSync(schemaFile, JSON.stringify(REVIEW_SCHEMA))

// ---- the prompt -------------------------------------------------------------
// The driver's reviewer packet (run-epic.mjs), with its inputs: the plugin's
// tickets.mjs, the ticket, the epic, the branch, and the repository — here the
// worktree, because that is the checkout Codex reads. The packet body and
// the rules are the driver's text verbatim except the status-entry read,
// which names the head instead of `origin/<branch>`; the suite evaluates the
// driver's own literals and holds this prompt to them.
const TICKETS = `node "${pluginRoot}/scripts/tickets.mjs"`
const repoRootForPacket = worktree
const packetBody = `Read as well — these commands are the scoped reads; the epic's documents grow with every ticket, and reading them whole is cost, not diligence:
- \`${TICKETS} brief ${id}\` — the epic's ground rules (preamble), this ticket's Acceptance criteria and Not in scope, and the open owed items, in one command. Scope is binding: work that strayed outside it is a finding.
- \`git show ${out.head}:epics/${epic}/status.md | awk '/^### /{f=/^### ${id} /} f'\` — this ticket's own status entry, written by the agent that did the work. Do not read the rest of the log: earlier tickets' entries are not this review's context.
- the repository's own agent instruction files for the areas in scope (start with ${repoRootForPacket}/CLAUDE.md and ${repoRootForPacket}/AGENTS.md where they exist). Judge against the project's standards, not your preferences.

Read the diff first, then read enough of each changed file to know whether the change is correct IN CONTEXT — its callers, its tests, what it returns. Findings derived from a diff alone are where false positives come from.

Every Important finding needs a \`file:line\` you actually opened, the concrete failure (which input, which state, which wrong output), and a \`confirmed\` or \`plausible\` label. Cap nits at five and count the rest in nitOverflowCount. Report pre-existing defects separately — they never block this ticket. An empty \`important\` list is a normal, welcome result: bias toward approval, and never manufacture balance.

You REPORT; you never fix. No edits, no commits, no pushes — an agent that can edit its own finding edits it into agreement. Someone else dispositions your findings.

Report no token figure: you cannot see your own counter, and the session observes every agent's spend from the run's own transcripts after the run.`

const REVIEWER_RULES = `- You REPORT. You NEVER fix: no edits, no commits, no pushes. An agent that can edit its own finding edits it into agreement.
- A behaviour claim needs a \`file:line\` citation in the source you opened — not an inference from a name. If you could not point at the line, you do not have a finding.
- Label every finding \`confirmed\` (you traced it) or \`plausible\` (say what would settle it). An unverified finding wastes more time than a missed one.
- Severity: Important = would break behaviour, lose data, or widen an exposure. Nit = real but small, at most five, count the rest. Pre-existing = a real defect this change did not introduce; report it, never block on it.
- The highest-value defect in agent-written code is a test that executes code without checking it — the same session wrote both, so both encode the same misunderstanding. Look for assertions that only prove no exception was thrown, assertions on shape rather than value, and expected values copied from actual output.
- Do not flag style a formatter owns, coverage as a number, speculative performance, or preferences that contradict the project's conventions. Bias toward approval; say the work is sound when it is.`

const prompt = `Review the commit range for one finished ticket. You are a code reviewer with no memory of writing it. READ FIRST, IN FULL: ${pluginRoot}/agents/ticket-reviewer.md — the reviewer agent definition, your bar — and ${pluginRoot}/skills/review/SKILL.md — the \`/flow:review\` skill, the procedure. Wherever either names \`\${CLAUDE_PLUGIN_ROOT}\`, that path is ${pluginRoot}.

You run in a read-only sandbox with no network, in a detached checkout of the reviewed head: do not fetch, pull, edit, commit or push, and open no pull request. The range and the head below are fixed for you — skip any step of the skill that would look them up over the network.

These are the core rules of the reviewer definition, which are not optional:

${REVIEWER_RULES}

Repository: ${worktree}
Ticket: ${id}
Commit range: ${range}
Reviewed head (the runner resolved it and checked it out as this repository's HEAD): ${out.head} — review that commit, not whatever the branch name points at by the time you read it.
${packetBody}

Report \`reviewedHead\`: what \`git rev-parse HEAD\` prints in the repository above when you read the range, verbatim — never reconstructed from memory. The runner verifies it against the head it checked out.

Your final message is exactly one JSON object matching the output schema — nothing else. Only that final message is your report.`

// ---- run Codex --------------------------------------------------------------
const codexArgs = ['exec', '--json', '--color', 'never', '-C', worktree, '-s', 'read-only', '--ephemeral', '--output-schema', schemaFile, '-o', lastFile, '-c', `model_reasoning_effort="${effort}"`]
if (model) codexArgs.push('-m', model)
codexArgs.push('-')

// Its own process group, so a timeout kills Codex AND the shells it started —
// a grandchild holding stdout open would otherwise hold the runner past its
// timeout.
const run = await new Promise((done) => {
  const chunks = []
  let stderr = ''
  let timedOut = false
  let spawnError = null
  let settled = false
  const settle = (code, signal) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    done({ code, signal, timedOut, spawnError, stdout: Buffer.concat(chunks).toString('utf8'), stderr })
  }
  child = spawn(codexBin, codexArgs, { cwd: worktree, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const timer = setTimeout(() => {
    timedOut = true
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
  }, timeoutMs)
  child.on('error', (e) => {
    spawnError = e
    settle(null, null)
  })
  child.stdout.on('data', (d) => chunks.push(d))
  child.stderr.on('data', (d) => {
    stderr = (stderr + d.toString('utf8')).slice(-4000)
  })
  child.stdin.on('error', () => {})
  child.on('close', (code, signal) => settle(code, signal))
  child.stdin.end(prompt)
})
out.runner.exitCode = run.code

// ---- parse the event stream -------------------------------------------------
let turnCompleted = false
let lastError = ''
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
  if (ev.type === 'turn.completed') {
    turnCompleted = true
    if (ev.usage) {
      const u = ev.usage
      const prev = out.runner.usage || { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 }
      out.runner.usage = {
        input: prev.input + (u.input_tokens || 0),
        cached: prev.cached + (u.cached_input_tokens || 0),
        cacheWrite: prev.cacheWrite + (u.cache_write_input_tokens || 0),
        output: prev.output + (u.output_tokens || 0),
        reasoning: prev.reasoning + (u.reasoning_output_tokens || 0),
      }
    }
  }
  if (ev.type === 'error' && ev.message) lastError = line(ev.message)
  if (ev.type === 'turn.failed') lastError = line((ev.error && ev.error.message) || 'turn.failed')
}

const stderrTail = line(run.stderr.trim().split('\n').slice(-3).join(' '))
if (run.spawnError) {
  if (run.spawnError.code === 'ENOENT') fail('codex-missing', `codex binary not found (${codexBin}) — install @openai/codex and sign in`)
  fail('codex-exit', `codex could not be run: ${line(run.spawnError.message)}`)
}
if (run.timedOut) fail('timeout', `codex exceeded the runner timeout of ${timeoutMs} ms and was killed${turnCompleted ? '' : ' before turn.completed'} — any message it streamed is not a report`)
if (run.code !== 0) {
  fail('codex-exit', `codex exited ${run.code === null ? `on signal ${run.signal}` : run.code}${turnCompleted ? '' : ' without turn.completed'}${lastError ? ` — ${lastError}` : ''}${stderrTail ? ` — stderr: ${stderrTail}` : ''} — any message it streamed is not a report`)
}
if (!turnCompleted) fail('no-report', `codex exited 0 without a turn.completed event${lastError ? ` — ${lastError}` : ''} — a report written without a completed turn is not trusted`)
if (!existsSync(lastFile)) fail('no-report', `codex completed its turn but wrote no -o report file${lastError ? ` — ${lastError}` : ''}`)

let review = null
try {
  review = JSON.parse(readFileSync(lastFile, 'utf8').trim())
} catch (e) {
  fail('no-report', `the -o report file is not JSON: ${line(e.message)}`)
}
// A report without the findings array is not a review — the driver's own
// rule, because "no important array" would read as "no Important findings".
if (!review || typeof review !== 'object' || !Array.isArray(review.important)) fail('no-report', 'the -o report file holds no `important` array — not a review')
out.review = review

// ---- verify the head the review names --------------------------------------
{
  const claimed = typeof review.reviewedHead === 'string' ? review.reviewedHead.trim() : ''
  const resolved = SHA.test(claimed) ? git(['rev-parse', '--verify', '--quiet', `${claimed}^{commit}`]) : null
  if (!resolved || resolved.status !== 0 || resolved.out !== out.head) {
    fail('head-mismatch', `the review reports reviewedHead ${JSON.stringify(line(review.reviewedHead))}${resolved && resolved.status === 0 ? ` (${resolved.out})` : ''}, not ${out.head} — the review is kept verbatim and not counted as a review of that head`)
  }
  out.headVerified = true
}
out.outcome = 'reviewed'
out.reason = null
out.detail = ''
finish()
