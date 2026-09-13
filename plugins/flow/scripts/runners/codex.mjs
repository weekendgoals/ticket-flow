#!/usr/bin/env node
// codex.mjs — the Codex worker runner: one ticket, implemented by OpenAI's
// Codex CLI instead of a Claude subagent, reported in the exact shape the
// run driver's worker schema expects.
//
//   node codex.mjs <ID> --epic <name> --epic-branch epic/<name> \
//     --default-branch main --repo <abs> --plugin <abs> --label worker:<ID> \
//     [--model <m>] [--codex <bin>] [--timeout <ms>] [--network] [--json]
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
//
// Zero dependencies. Every gate downstream — the review, the CHECK re-run,
// the addendum check, the SHA merge, the board's integrated state — reads
// git, so none of them cares which runner produced the branch.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

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
  if (a === '--json' || a === '--network') flags[a.slice(2)] = true
  else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i]
  else positional.push(a)
}
const usage = () => {
  console.error(
    'usage: codex.mjs <ID> --epic <name> --epic-branch epic/<name> --default-branch <b> --repo <abs> --plugin <abs> --label worker:<ID> [--model <m>] [--codex <bin>] [--timeout <ms>] [--network] [--json]',
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

const branch = id.toLowerCase()
const repoRoot = resolve(repo)
const pluginRoot = resolve(plugin)
const started = Date.now()

const git = (args, opts = {}) => {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', ...opts })
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}
const line = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').slice(0, 400)

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
// The driver's Claude-worker prompt, adapted for a runner that cannot load a
// plugin skill by name and a sandbox that has no network.
const prompt = `A driver spawned you for this one ticket. You are the implementing worker for ticket ${id} of the \`${epic}\` epic, running under the Ticket Flow methodology. You are working from documents, not from any conversation.

READ FIRST, IN FULL: ${pluginRoot}/skills/ticket/SKILL.md — the ticket skill. Wherever it writes \`\${CLAUDE_PLUGIN_ROOT}\`, that path is ${pluginRoot} (the environment variable CLAUDE_PLUGIN_ROOT is set to it as well). Execute the skill exactly as written, scoped as this prompt scopes it, which the skill's step 0 explicitly allows ("honoring whatever your spawn prompt scopes or forbids").

RUN: steps 1–6 — resolve (\`node "${pluginRoot}/scripts/tickets.mjs" find ${id} --json\`), read, implement, verify with counts, and append the status entry to the status log. Then STOP, with every change saved in the working tree.

GIT IS NOT YOURS. Your sandbox keeps \`.git\` read-only and has no network, so every git write the skill names is done by the runner, not by you: the runner already ran \`git fetch origin --prune\` and already created and checked out \`${branch}\` from \`${epicBranch}\` — you are on it now — and after you finish it commits everything you left in the working tree under a \`${id}: …\` subject and pushes \`${branch}\`, observing the result itself. So: skip step 3's branch commands, do NOT run \`git checkout\`, \`git add\`, \`git commit\` or \`git push\` (they will fail), skip every fetch, pull and \`gh\` command, and open no pull request — a release ticket has none of its own. Reading git (\`git log\`, \`git diff\`, \`git status\`, \`git show\`) is fine. Stay inside the ticket's scope: the runner commits the whole tree, so anything you touch outside scope ships.

DO NOT run step 7 (review), step 8 (fix and addendum) or step 10 (the gate and the merge). The driver hires the reviewer once your branch is pushed, gates on its findings, and merges. You do not review your own work, you do not merge, and you spawn no agents — the party under review never picks its judge.

REPORT THE REVIEW TIER for your own diff, from the ticket skill's step 7 table: \`prose\` (documentation and code comments only — nothing any runtime, parser, test or agent reads), \`consequence\` (the risk list: authentication or authorization boundaries, secrets, crypto, network exposure, migrations, anything that deletes or rewrites data, payments or billing, anything that can fail open), or \`normal\` (everything else, including configuration, user-facing strings, CLI output and agent/skill instructions). One line of why. When in doubt, the higher tier — the driver floors the tier in code from your branch's changed files, so your report can raise the review's price but never lower it.

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
const finish = (code) => {
  out.runner.durationMs = Date.now() - started
  if (flags.json) console.log(JSON.stringify(out, null, 2))
  else {
    console.log(`${id}: ${out.result}${out.stopCondition !== 'none' ? ` (${out.stopCondition})` : ''} — tier ${out.tier}`)
    if (out.detail) console.log(`  ${out.detail}`)
    if (out.runner.usage) console.log(`  codex usage: ${JSON.stringify(out.runner.usage)}`)
  }
  process.exit(code)
}

// The runner owns git: fetch and branch now, commit and push at the end.
// The tree must be clean first — every change left after Codex runs is
// committed as the ticket's, which is only true if nothing else was there.
{
  const f = git(['fetch', 'origin', '--prune'])
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
  const p = git(['push', '-u', 'origin', branch])
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
