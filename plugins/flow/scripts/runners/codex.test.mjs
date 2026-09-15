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
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, chmodSync, readFileSync, existsSync } from 'node:fs'
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
const branchFile = join(tmp, 'branch.txt')
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
// One line per launch, so a test can count how many Codex sessions ran.
if (process.env.FAKE_CODEX_CALLS_FILE) fs.appendFileSync(process.env.FAKE_CODEX_CALLS_FILE, id + '\\n')
// The runner itself dies mid-run (its parent is the runner: spawnSync, no shell).
if (mode === 'kill-runner') { process.kill(process.ppid, 'SIGKILL'); process.exit(0) }
// A ticket that takes a while — long enough to outlive a short wait slice.
if (process.env.FAKE_CODEX_SLEEP_MS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAKE_CODEX_SLEEP_MS))
if (mode === 'crash') { console.log('not json at all'); process.exit(3) }
// The stub must already be on the ticket branch — the runner checks it out
// before launching — and it never writes to .git, which the real sandbox
// keeps read-only: it edits files and appends the entry, nothing more.
fs.writeFileSync(process.env.FAKE_CODEX_BRANCH_FILE, g('rev-parse', '--abbrev-ref', 'HEAD').trim())
if (mode === 'good' || mode === 'blocked') {
  fs.writeFileSync(repo + '/built-' + branch + '.txt', 'built\\n')
  const outcome = mode === 'good' ? 'DONE' : 'BLOCKED'
  fs.appendFileSync(repo + '/epics/rho/status.md', '\\n### ' + id + ' — build it — 2026-09-13 — ' + outcome + '\\n\\n**Built:** it.\\n\\n**Owed:** Nothing.\\n')
}
const report = mode === 'blocked'
  ? { ticket: id, result: 'blocked', stopCondition: 'blocked-entry', tier: 'normal', tierWhy: 'code', branch, built: '', verification: '', deployPreconditions: [], detail: 'BLOCKED entry written' }
  : { ticket: id, result: 'work-done', stopCondition: 'none', tier: 'normal', tierWhy: 'touches code', branch, built: 'a file', verification: 'node -e 1 → ok 1/1', deployPreconditions: ['RHO_ENV'], detail: '' }
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thr_123' }))
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(report) } }))
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 200, output_tokens: 300 } }))
fs.writeFileSync(last, JSON.stringify(report))
`,
)
chmodSync(fakeCodex, 0o755)

// TMPDIR points into the suite's temp dir, so the runner's state directories
// (under os.tmpdir()) are the suite's to inspect and to clean up.
const stubEnv = (mode, more = {}) => ({ TMPDIR: tmp, FAKE_CODEX_MODE: mode, FAKE_CODEX_ARGS_FILE: argsFile, FAKE_CODEX_PROMPT_FILE: promptFile, FAKE_CODEX_BRANCH_FILE: branchFile, ...more })
const runnerArgs = (id) => [RUNNER, id, '--epic', 'rho', '--epic-branch', 'epic/rho', '--default-branch', 'main', '--repo', repo, '--plugin', PLUGIN, '--label', `worker:${id}`, '--codex', fakeCodex, '--json']
const runRunner = (id, mode, extra = [], more = {}) => {
  const env = stubEnv(mode, more)
  const args = [...runnerArgs(id), ...extra]
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

test('a good run: the runner branches, Codex edits the tree, the runner commits under the ID and pushes, and grants branch-pushed from what it saw', () => {
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
  assert.equal(readFileSync(branchFile, 'utf8'), 'r-1', 'Codex was already on the ticket branch when it started')
  assert.equal(git(repo, 'log', '-1', '--format=%s', 'r-1').trim(), 'R-1: a file', 'the runner commits under the ID-prefixed subject the board keys on')
  assert.equal(git(repo, 'show', 'r-1:built-r-1.txt').trim(), 'built')
  assert.match(git(repo, 'show', 'r-1:epics/rho/status.md'), /### R-1 — build it — 2026-09-13 — DONE/)
  assert.equal(git(repo, 'status', '--porcelain').trim(), '', 'nothing left uncommitted')
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
  assert.match(p, /GIT IS NOT YOURS/)
  assert.match(p, /already created and checked out `r-1` from `epic\/rho`/)
  assert.match(p, /do NOT run `git checkout`, `git add`, `git commit` or `git push`/)
  assert.match(p, /DO NOT run step 7 \(review\), step 8 \(fix and addendum\) or step 10/)
  assert.match(p, /REPORT THE REVIEW TIER/)
  assert.match(p, /worker:R-1/)
  assert.match(p, /toward the default branch \(main\)/)
})

test('--network passes the sandbox network override through', () => {
  const r = runRunner('R-1', 'good', ['--network'])
  const argv = JSON.parse(readFileSync(argsFile, 'utf8'))
  assert.ok(argv.includes('sandbox_workspace_write.network_access=true'))
  // R-1 already exists locally: the runner checks it out rather than
  // recreating it — a resumed ticket keeps its branch — and the stub's
  // second status-log append is a new change, committed on top.
  assert.equal(r.out.result, 'branch-pushed')
  assert.equal(git(repo, 'rev-list', '--count', 'origin/epic/rho..r-1').trim(), '2')
})

test('a report that claims work but left no change is a contradiction, not a push', () => {
  const r = runRunner('R-2', 'liar')
  assert.equal(r.status, 0, 'a report was produced, so the runner itself succeeded')
  assert.equal(r.out.result, 'halted')
  assert.equal(r.out.stopCondition, 'document-contradiction')
  assert.match(r.out.detail, /work-done but left no changes: r-2 has no commits ahead of origin\/epic\/rho/)
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

test('a dirty working tree refuses before Codex runs — the runner commits everything it finds, so nothing else may be there', () => {
  git(repo, 'checkout', '-q', 'epic/rho')
  writeFileSync(join(repo, 'stray.txt'), 'not the ticket\n')
  const r = runRunner('R-4', 'good')
  assert.equal(r.status, 1)
  assert.match(r.out.detail, /working tree is not clean before the run/)
  assert.ok(!existsSync(argsFile) || JSON.parse(readFileSync(argsFile, 'utf8'))[0] !== 'never', 'sanity')
  rmSync(join(repo, 'stray.txt'))
})

// ---- --start / --wait: the hour-long ticket in shell-sized slices -----------
// The driver's proxy reaches the runner through a shell tool that kills any
// command after 10 minutes, so a real run is started once in the background
// and waited on in slices. These cases pin the two halves of that contract:
// the background run survives the command that launched it — its exit and a
// kill of its whole process group — and a wait tells pending, done and
// failed apart by its JSON alone.

const callsFile = join(tmp, 'calls.txt')
const calls = () => (existsSync(callsFile) ? readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).length : 0)
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const pgidOf = (pid) => {
  try {
    return Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim())
  } catch {
    return null
  }
}
// The shell tool's shape, reproduced: a shell in its own process group runs
// the --start command and then lingers, so the group is still there to kill
// after the runner has printed and exited.
const startInGroup = (id, env) =>
  new Promise((resolvePromise, reject) => {
    const t0 = Date.now()
    const shell = spawn('sh', ['-c', '"$0" "$@"; sleep 30', process.execPath, ...runnerArgs(id), '--start'], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...ENV, ...env } })
    let text = ''
    shell.stdout.on('data', (d) => {
      text += d
      try {
        resolvePromise({ out: JSON.parse(text), ms: Date.now() - t0, shPid: shell.pid })
      } catch {}
    })
    shell.on('error', reject)
    shell.on('exit', () => reject(new Error(`the shell exited before --start printed JSON: ${text}`)))
  })

test("--start launches a detached run that outlives its command and a kill of that command's process group; --wait slices report pending, then the report", async () => {
  const env = { FAKE_CODEX_SLEEP_MS: '3000', FAKE_CODEX_CALLS_FILE: callsFile }
  const before = calls()
  const started = await startInGroup('R-5', stubEnv('good', env))
  assert.equal(started.out.state, 'started')
  assert.equal(started.out.attached, false)
  assert.ok(started.out.stateDir.startsWith(join(tmp, 'flow-codex-runs')), started.out.stateDir)
  assert.ok(started.ms < 3000, `--start returned in ${started.ms} ms, before the 3000 ms ticket could have finished`)
  const bg = started.out.pid
  assert.ok(isAlive(bg), 'the background run is alive')

  // The launching runner process exits — the shell moves on to its sleep —
  // while the background run stays alive, in a process group of its own.
  const startStillRunning = () =>
    // (the shell's own command line names --start too; the runner's starts with node)
    execFileSync('ps', ['-A', '-o', 'pgid=,command='], { encoding: 'utf8' })
      .split('\n')
      .some((l) => l.trim().startsWith(`${started.shPid} ${process.execPath} `) && l.includes('--start'))
  try {
    for (let i = 0; i < 50 && startStillRunning(); i++) await pause(100)
    assert.ok(!startStillRunning(), 'the --start process has exited')
    assert.ok(isAlive(bg), 'the background run outlived the process that launched it')
    assert.ok(pgidOf(bg) > 0)
    assert.notEqual(pgidOf(bg), started.shPid, "the background run is not in the shell command's process group")
  } finally {
    // What a shell tool does at its ceiling: kill the command's whole group.
    process.kill(-started.shPid, 'SIGKILL')
  }
  await pause(200)
  assert.ok(isAlive(bg), 'the background run survived the process-group kill')

  const pending = runRunner('R-5', 'good', ['--wait', '--max-wait', '300'], env)
  assert.equal(pending.status, 0)
  assert.equal(pending.out.state, 'pending')
  assert.equal(pending.out.ticket, 'R-5')
  assert.equal(pending.out.pid, bg)
  assert.equal(pending.out.result, undefined, 'a pending slice is not a report')

  // A second --start while the run is live attaches; it does not launch.
  const again = runRunner('R-5', 'good', ['--start'], env)
  assert.equal(again.status, 0)
  assert.equal(again.out.state, 'started')
  assert.equal(again.out.attached, true)
  assert.equal(again.out.pid, bg)

  // Let it finish with nobody waiting, then --start once more: a finished
  // report no --wait has delivered is still this attempt's, so it attaches.
  const result = join(started.out.stateDir, 'result.json')
  for (let i = 0; i < 200 && !existsSync(result); i++) await pause(100)
  assert.ok(existsSync(result), 'the background run wrote its report')
  const finished = runRunner('R-5', 'good', ['--start'], env)
  assert.equal(finished.out.attached, true)
  assert.equal(finished.out.finished, true)

  const done = runRunner('R-5', 'good', ['--wait', '--max-wait', '30000'], env)
  assert.equal(done.status, 0)
  assert.equal(done.out.state, undefined, 'the report is the single shot\'s, unwrapped')
  assert.equal(done.out.result, 'branch-pushed')
  assert.equal(done.out.stopCondition, 'none')
  assert.equal(done.out.runner.pushed, true)
  assert.ok(onRemote('r-5'), 'the background run pushed')
  assert.equal(git(repo, 'log', '-1', '--format=%s', 'r-5').trim(), 'R-5: a file')
  assert.equal(calls() - before, 1, 'three --start calls, one Codex session')
  assert.deepEqual(JSON.parse(readFileSync(result, 'utf8')), { exitCode: 0, report: done.out })
  // A retried --wait gets the same answer, not a failure.
  assert.deepEqual(runRunner('R-5', 'good', ['--wait', '--max-wait', '300'], env).out, done.out)

  // Once the answer was delivered, --start is a new attempt: a resumed run
  // re-working the ticket must not be handed the previous attempt's report.
  const retry = runRunner('R-5', 'good', ['--start'], { FAKE_CODEX_CALLS_FILE: callsFile })
  assert.equal(retry.out.attached, false)
  const second = runRunner('R-5', 'good', ['--wait', '--max-wait', '30000'])
  assert.equal(second.out.result, 'branch-pushed')
  assert.equal(calls() - before, 2)
  assert.equal(git(repo, 'rev-list', '--count', 'origin/epic/rho..r-5').trim(), '2')
})

test('--wait with no started run is a failure report, not a pending one, and launches nothing', () => {
  const before = calls()
  const r = runRunner('R-9', 'good', ['--wait', '--max-wait', '300'], { FAKE_CODEX_CALLS_FILE: callsFile })
  assert.equal(r.status, 1)
  assert.equal(r.out.state, 'failed')
  assert.equal(r.out.ticket, 'R-9')
  assert.equal(r.out.result, 'halted')
  assert.equal(r.out.stopCondition, 'other')
  assert.match(r.out.detail, /no run was started for R-9 \(worker:R-9\) — nothing to wait for; run the same command with --start first/)
  assert.equal(calls(), before)
})

test('a background run that died without a report is a failure, not pending — and the next --start is a fresh attempt', () => {
  const s = runRunner('R-6', 'kill-runner', ['--start'])
  assert.equal(s.out.state, 'started')
  const r = runRunner('R-6', 'kill-runner', ['--wait', '--max-wait', '30000'])
  assert.equal(r.status, 1)
  assert.equal(r.out.state, 'failed')
  assert.equal(r.out.result, 'halted')
  assert.equal(r.out.stopCondition, 'other')
  assert.match(r.out.detail, new RegExp(`the background runner \\(pid ${s.out.pid}\\) exited without writing a report`))

  // The recovery a failure implies works in the failed state.
  const again = runRunner('R-6', 'good', ['--start'])
  assert.equal(again.out.attached, false)
  const done = runRunner('R-6', 'good', ['--wait', '--max-wait', '30000'])
  assert.equal(done.out.result, 'branch-pushed')
})

test('the mode flags refuse nonsense combinations before touching git', () => {
  for (const extra of [['--start', '--wait'], ['--max-wait', '1000'], ['--wait', '--max-wait', 'soon'], ['--start', '--background']]) {
    let status = 0
    try {
      sh(repo, process.execPath, [...runnerArgs('R-1'), ...extra], { TMPDIR: tmp })
    } catch (e) {
      status = e.status
    }
    assert.equal(status, 2, `args ${JSON.stringify(extra)} must be refused`)
  }
})
