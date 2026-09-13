// codex.test.mjs — the Codex worker runner, without Codex.
//
// The runner's own behaviour is what these tests pin: the fetch it owns, the
// prompt it assembles, the sandbox flags it passes, the event stream it
// parses, the push it performs, and the reconciliation of the model's
// report with what the repository actually shows. A stub `codex` binary
// stands in for the real one — it reads the prompt, does (or fails to do)
// the git work, and prints the JSONL events and final message the real CLI
// prints — so the suite needs git and nothing else. What it cannot prove is
// that real Codex follows the ticket skill; that is a live run's job, and
// the gates downstream are built for a worker that does not.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, chmodSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const RUNNER = join(here, 'codex.mjs')
const PLUGIN = realpathSync(join(here, '..', '..'))
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }

const sh = (cwd, cmd, args, env = {}) => execFileSync(cmd, args, { cwd, encoding: 'utf8', env: { ...ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
const git = (cwd, ...args) => sh(cwd, 'git', args)

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'codex-runner-')))
const remote = join(tmp, 'remote.git')
const repo = join(tmp, 'repo')
const promptFile = join(tmp, 'prompt.txt')
const argsFile = join(tmp, 'args.json')
const fakeCodex = join(tmp, 'fake-codex')
after(() => rmSync(tmp, { recursive: true, force: true }))

git(tmp, 'init', '--bare', '--initial-branch=main', remote)
git(tmp, 'init', '--initial-branch=main', repo)
git(repo, 'config', 'user.email', 'test@example.com')
git(repo, 'config', 'user.name', 'Test')
git(repo, 'config', 'commit.gpgsign', 'false')
mkdirSync(join(repo, 'epics/rho'), { recursive: true })
writeFileSync(
  join(repo, 'epics/rho/tickets.md'),
  `# Rho epic — tickets

Delivery: release

## R-1 — build it

**Scope.** Build.

## R-2 — the liar

**Scope.** Claims.

## R-3 — the blocked one

**Scope.** Stops.

## R-4 — the crash

**Scope.** Dies.
`,
)
writeFileSync(join(repo, 'epics/rho/status.md'), '# Rho epic — status log\n')
git(repo, 'add', '.')
git(repo, 'commit', '-m', 'rho epic')
git(repo, 'remote', 'add', 'origin', remote)
git(repo, 'push', '-u', 'origin', 'main')
git(repo, 'remote', 'set-head', 'origin', 'main')
git(repo, 'checkout', '-b', 'epic/rho')
git(repo, 'push', '-u', 'origin', 'epic/rho')

// The stub: behaves per FAKE_CODEX_MODE, records its argv and prompt, and
// speaks the real CLI's protocol — JSONL events on stdout, the final message
// in the -o file.
writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require('fs')
const { execFileSync } = require('child_process')
const argv = process.argv.slice(2)
fs.writeFileSync(process.env.FAKE_CODEX_ARGS_FILE, JSON.stringify(argv))
const prompt = fs.readFileSync(0, 'utf8')
fs.writeFileSync(process.env.FAKE_CODEX_PROMPT_FILE, prompt)
const opt = (f) => argv[argv.indexOf(f) + 1]
const repo = opt('-C')
const last = opt('-o')
const mode = process.env.FAKE_CODEX_MODE
const id = (prompt.match(/ticket ([A-Z]+-\\d+) of/) || [])[1]
const branch = id.toLowerCase()
const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' })
if (mode === 'crash') { console.log('not json at all'); process.exit(3) }
if (mode === 'good' || mode === 'blocked') {
  g('checkout', '-q', '-b', branch, 'epic/rho')
  fs.writeFileSync(repo + '/built-' + branch + '.txt', 'built\\n')
  g('add', 'built-' + branch + '.txt')
  g('commit', '-q', '-m', id + ': build it')
  const outcome = mode === 'good' ? 'DONE' : 'BLOCKED'
  fs.appendFileSync(repo + '/epics/rho/status.md', '\\n### ' + id + ' — build it — 2026-09-13 — ' + outcome + '\\n\\n**Built:** it.\\n\\n**Owed:** Nothing.\\n')
  g('add', 'epics/rho/status.md')
  g('commit', '-q', '-m', id + ': status entry')
  g('checkout', '-q', 'epic/rho')
}
const report = mode === 'blocked'
  ? { ticket: id, result: 'blocked', stopCondition: 'blocked-entry', tier: 'normal', tierWhy: 'code', branch, built: '', verification: '', deployPreconditions: [], detail: 'BLOCKED entry written' }
  : { ticket: id, result: 'work-committed', stopCondition: 'none', tier: 'normal', tierWhy: 'touches code', branch, built: 'a file', verification: 'node -e 1 → ok 1/1', deployPreconditions: ['RHO_ENV'], detail: '' }
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thr_123' }))
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(report) } }))
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 200, output_tokens: 300 } }))
fs.writeFileSync(last, JSON.stringify(report))
`,
)
chmodSync(fakeCodex, 0o755)

const runRunner = (id, mode, extra = []) => {
  const env = { FAKE_CODEX_MODE: mode, FAKE_CODEX_ARGS_FILE: argsFile, FAKE_CODEX_PROMPT_FILE: promptFile }
  const args = [RUNNER, id, '--epic', 'rho', '--epic-branch', 'epic/rho', '--default-branch', 'main', '--repo', repo, '--plugin', PLUGIN, '--label', `worker:${id}`, '--codex', fakeCodex, '--json', ...extra]
  try {
    return { status: 0, out: JSON.parse(sh(repo, process.execPath, args, env)) }
  } catch (e) {
    let out = null
    try {
      out = JSON.parse(String(e.stdout))
    } catch {}
    return { status: e.status, out, stderr: String(e.stderr) }
  }
}
const onRemote = (branch) => git(repo, 'ls-remote', '--heads', 'origin', branch).includes(`refs/heads/${branch}`)

test('a good run: the runner fetches, Codex commits, the runner pushes and grants branch-pushed from what it saw', () => {
  const r = runRunner('R-1', 'good', ['--model', 'gpt-5-codex'])
  assert.equal(r.status, 0)
  assert.equal(r.out.ticket, 'R-1')
  assert.equal(r.out.result, 'branch-pushed')
  assert.equal(r.out.stopCondition, 'none')
  assert.equal(r.out.branch, 'r-1')
  assert.equal(r.out.tier, 'normal')
  assert.deepEqual(r.out.deployPreconditions, ['RHO_ENV'])
  assert.equal(r.out.runner.pushed, true)
  assert.ok(onRemote('r-1'), 'the branch reached the remote')
  assert.deepEqual(r.out.runner.usage, { input: 1000, cached: 200, output: 300 })
  assert.equal(r.out.runner.threadId, 'thr_123')
  assert.equal(r.out.runner.model, 'gpt-5-codex')

  // The sandbox is the runner's: workspace-write, no network, the schema and
  // last-message files, the plugin root in the model's environment.
  const argv = JSON.parse(readFileSync(argsFile, 'utf8'))
  assert.equal(argv[0], 'exec')
  assert.ok(argv.includes('--json'))
  assert.deepEqual(argv.slice(argv.indexOf('-s'), argv.indexOf('-s') + 2), ['-s', 'workspace-write'])
  assert.ok(argv.includes('--output-schema'))
  assert.ok(argv.includes('-o'))
  assert.ok(argv.some((a) => a.startsWith('shell_environment_policy.set.CLAUDE_PLUGIN_ROOT=')))
  assert.ok(!argv.some((a) => a.includes('network_access')), 'no network unless asked')
  assert.deepEqual(argv.slice(argv.indexOf('-m'), argv.indexOf('-m') + 2), ['-m', 'gpt-5-codex'])
  assert.equal(argv[argv.length - 1], '-', 'the prompt rides on stdin')

  // The prompt is the driver's scoped slice of the ticket skill, pointed at
  // the file on disk, with the network facts Codex must know.
  const p = readFileSync(promptFile, 'utf8')
  assert.ok(p.startsWith('A driver spawned you for this one ticket.'))
  assert.match(p, new RegExp(`READ FIRST, IN FULL: ${PLUGIN}/skills/ticket/SKILL.md`))
  assert.match(p, /NETWORK: you have none/)
  assert.match(p, /do NOT push/)
  assert.match(p, /DO NOT run step 7 \(review\), step 8 \(fix and addendum\) or step 10/)
  assert.match(p, /REPORT THE REVIEW TIER/)
  assert.match(p, /worker:R-1/)
  assert.match(p, /toward the default branch \(main\)/)
})

test('--network passes the sandbox network override through', () => {
  const r = runRunner('R-1', 'good', ['--network'])
  const argv = JSON.parse(readFileSync(argsFile, 'utf8'))
  assert.ok(argv.includes('sandbox_workspace_write.network_access=true'))
  // R-1 already exists on the remote; a second run of the stub fails at
  // checkout -b and reports work-committed over no new commits — which the
  // runner refuses, and that refusal is the next test's subject.
  assert.ok(r.out)
})

test('a report that claims work over an empty branch is a contradiction, not a push', () => {
  const r = runRunner('R-2', 'liar')
  assert.equal(r.status, 0, 'a report was produced, so the runner itself succeeded')
  assert.equal(r.out.result, 'halted')
  assert.equal(r.out.stopCondition, 'document-contradiction')
  assert.match(r.out.detail, /work-committed but r-2 has no commits ahead of origin\/epic\/rho/)
  assert.equal(r.out.runner.pushed, false)
  assert.ok(!onRemote('r-2'))
})

test('a BLOCKED report keeps its result, and its branch is still pushed so the entry reaches the remote', () => {
  const r = runRunner('R-3', 'blocked')
  assert.equal(r.status, 0)
  assert.equal(r.out.result, 'blocked')
  assert.equal(r.out.stopCondition, 'blocked-entry')
  assert.equal(r.out.runner.pushed, true)
  assert.ok(onRemote('r-3'))
})

test('no parseable final message is the runner failing, exit 1, with the exit code and stderr on record', () => {
  const r = runRunner('R-4', 'crash')
  assert.equal(r.status, 1)
  assert.equal(r.out.result, 'halted')
  assert.equal(r.out.stopCondition, 'other')
  assert.match(r.out.detail, /codex exited 3 without a parseable final JSON report/)
  assert.equal(r.out.runner.exitCode, 3)
})

test('a missing codex binary is named, with the fix, and exits 1', () => {
  const r = runRunner('R-4', 'good', ['--codex', join(tmp, 'no-such-codex')])
  assert.equal(r.status, 1)
  assert.match(r.out.detail, /codex binary not found .* install @openai\/codex and sign in/)
})

test('usage errors refuse before touching git', () => {
  for (const bad of [[], ['r-1'], ['R-1', '--epic', 'rho']]) {
    let status = 0
    try {
      sh(repo, process.execPath, [RUNNER, ...bad])
    } catch (e) {
      status = e.status
    }
    assert.equal(status, 2, `args ${JSON.stringify(bad)} must be refused`)
  }
})
