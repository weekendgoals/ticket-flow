// codex.test.mjs — the Codex worker runner, without Codex.
//
// The runner's own behaviour is what these tests pin: the fetch it owns, the
// prompt it assembles, the sandbox flags it passes, the event stream it
// parses, the push it performs, and the reconciliation of the model's
// report with what the repository actually shows. A stub `codex` binary
// stands in for the real one — it reads the prompt, does (or fails to do)
// the git work, and prints the JSONL events and final message the real CLI
// prints — so the suite needs git and POSIX sh, ps and sleep, nothing else. What it cannot prove is
// that real Codex follows the ticket skill; that is a live run's job, and
// the gates downstream are built for a worker that does not.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, chmodSync, readFileSync, existsSync, utimesSync, symlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
if (process.env.FAKE_CODEX_PID_FILE) fs.writeFileSync(process.env.FAKE_CODEX_PID_FILE, String(process.pid))
// The runner itself dies mid-run (its parent is the runner: spawnSync, no shell).
if (mode === 'kill-runner') { process.kill(process.ppid, 'SIGKILL'); process.exit(0) }
// A ticket that takes a while — long enough to outlive a short wait slice.
if (process.env.FAKE_CODEX_SLEEP_MS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAKE_CODEX_SLEEP_MS))
if (mode === 'crash') { console.log('not json at all'); process.exit(3) }
// The stub must already be on the ticket branch — the runner checks it out
// before launching — and it never writes to .git, which the real sandbox
// keeps read-only: it edits files and appends the entry, nothing more.
fs.writeFileSync(process.env.FAKE_CODEX_BRANCH_FILE, g('rev-parse', '--abbrev-ref', 'HEAD').trim())
if (mode === 'good' || mode === 'blocked' || mode === 'switch-branch') {
  fs.writeFileSync(repo + '/built-' + branch + '.txt', 'built\\n')
  const outcome = mode === 'blocked' ? 'BLOCKED' : 'DONE'
  fs.appendFileSync(repo + '/epics/rho/status.md', '\\n### ' + id + ' — build it — 2026-09-13 — ' + outcome + '\\n\\n**Built:** it.\\n\\n**Owed:** Nothing.\\n')
}
// What a halted session does to a run that outlived its proxy: it checks out
// the epic branch in the same tree while Codex's edits are still uncommitted.
if (mode === 'switch-branch') g('checkout', '-q', 'epic/rho')
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
  // An ordinary checkout is a serial run, and a serial run's prompt is the one
  // it always was: the worktree paragraph exists only in a linked worktree
  // whose branch carries epics/worktree.json.
  assert.doesNotMatch(p, /FRESH WORKTREE|worktree\.json/)
  assert.match(p, /already created and checked out `r-1` from `epic\/rho`/)
  assert.match(p, /do NOT run `git checkout`, `git add`, `git commit` or `git push`/)
  assert.match(p, /DO NOT run step 7 \(review\), step 8 \(fix and addendum\) or step 10/)
  assert.match(p, /REPORT THE REVIEW TIER/)
  // The same sentence the driver's Claude worker gets: this runner builds its
  // own prompt, and a worker that closed its own departure would clear the
  // one gate nobody in an unattended run can stand in for.
  assert.match(p, /`\*\*Deviations closed:\*\*` line that closes one is never yours to write/)
  assert.match(p, /halts before the merge on every `\*\*Deviation:\*\*` line your entry carries, closed or not/)
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
// The runner's state directory for a ticket, derived here the way the runner
// derives it, so a test can read an attempt's record or fabricate one.
const stateDirOf = (id, repoPath = repo) =>
  join(tmp, 'flow-codex-runs', `worker_${id}--${id}--${createHash('sha256').update(`${repoPath}\nrho`).digest('hex').slice(0, 12)}`)
const attemptRecord = (id, n) => JSON.parse(readFileSync(join(stateDirOf(id), `attempt-${n}.json`), 'utf8'))
const fabricateAttempt = (id, n, record) => {
  mkdirSync(stateDirOf(id), { recursive: true })
  const file = join(stateDirOf(id), `attempt-${n}.json`)
  writeFileSync(file, JSON.stringify({ n, nonce: 'a'.repeat(16), pid: null, startedAt: Date.now(), timeoutMs: 3600000, ...record }))
  return file
}
// A pid that is certainly dead: a process that has already exited.
const deadPid = () => Number(execFileSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).trim())
const until = async (cond, what, ms = 20000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await pause(50)) if (cond()) return
  assert.fail(`timed out waiting for ${what}`)
}
const runAsync = (id, mode, extra, more = {}) =>
  new Promise((res) => {
    const child = spawn(process.execPath, [...runnerArgs(id), ...extra], { cwd: repo, env: { ...ENV, ...stubEnv(mode, more) }, stdio: ['ignore', 'pipe', 'pipe'] })
    let text = ''
    child.stdout.on('data', (d) => (text += d))
    child.on('exit', (status) => res({ status, out: JSON.parse(text) }))
  })
const resetTree = () => {
  git(repo, 'checkout', '-q', '--', '.')
  git(repo, 'clean', '-fdq')
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
  assert.equal(started.out.attempt, 1)
  const result = join(started.out.stateDir, `result-${attemptRecord('R-5', 1).nonce}.json`)
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
  assert.equal(retry.out.attempt, 2)
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
  const refused = [
    ['--start', '--wait'],
    ['--wait', '--cancel'],
    ['--max-wait', '1000'],
    ['--wait', '--max-wait', 'soon'],
    ['--start', '--background'],
    ['--background'], // the internal mode needs its attempt key
    ['--background', '--attempt', '1:nothex'],
    ['--start', '--attempt', `1:${'a'.repeat(16)}`],
    ['--git-timeout', 'never'],
  ]
  for (const extra of refused) {
    let status = 0
    try {
      sh(repo, process.execPath, [...runnerArgs('R-1'), ...extra], { TMPDIR: tmp })
    } catch (e) {
      status = e.status
    }
    assert.equal(status, 2, `args ${JSON.stringify(extra)} must be refused`)
  }
})

// ---- a run that outlives its proxy must not reach anyone else's branch -----

test('the runner commits only on the ticket branch it checked out: a tree switched to the epic branch mid-run gets no commit, and the report says so', () => {
  resetTree()
  git(repo, 'checkout', '-q', 'epic/rho')
  const epicHead = git(repo, 'rev-parse', 'epic/rho').trim()
  const r = runRunner('R-7', 'switch-branch')
  assert.equal(r.status, 1)
  assert.equal(r.out.result, 'halted')
  assert.equal(r.out.stopCondition, 'other')
  assert.match(r.out.detail, /HEAD is epic\/rho, not the ticket branch r-7 the runner checked out/)
  assert.match(r.out.detail, /the runner committed and pushed nothing — HEAD is epic\/rho; 2 uncommitted path\(s\) in the working tree, 0 of them staged/)
  assert.equal(git(repo, 'rev-parse', 'epic/rho').trim(), epicHead, 'no commit landed on the epic branch')
  assert.equal(git(repo, 'rev-list', '--count', 'origin/epic/rho..r-7').trim(), '0', 'none on the ticket branch either')
  assert.ok(!onRemote('r-7'))
  assert.equal(r.out.runner.pushed, false)
  assert.match(git(repo, 'status', '--porcelain'), /built-r-7\.txt/, "Codex's edits are left in the tree for a human, not discarded")
  resetTree()
})

test('--cancel stops the whole process group — runner and Codex — commits nothing, is idempotent, and a later --start is a fresh attempt', async () => {
  resetTree()
  const pidFile = join(tmp, 'codex-pid-r8')
  const env = { FAKE_CODEX_SLEEP_MS: '8000', FAKE_CODEX_PID_FILE: pidFile }
  const s = runRunner('R-8', 'good', ['--start'], env)
  assert.equal(s.out.attached, false)
  await until(() => existsSync(pidFile), 'the stub Codex to start')
  const codexPid = Number(readFileSync(pidFile, 'utf8'))
  assert.ok(isAlive(codexPid) && isAlive(s.out.pid))

  // The cancel spells the repository through a symlink — a session after a
  // halt need not type the path the driver used — and still finds the run.
  const link = join(tmp, 'repo-link')
  symlinkSync(repo, link)
  const linked = runnerArgs('R-8').map((a) => (a === repo ? link : a))
  const c = { status: 0, out: JSON.parse(sh(repo, process.execPath, [...linked, '--cancel'], stubEnv('good'))) }
  assert.equal(c.status, 0)
  assert.equal(c.out.state, 'cancelled')
  assert.equal(c.out.result, 'halted')
  assert.equal(c.out.stopCondition, 'other')
  assert.match(c.out.detail, new RegExp(`cancelled attempt 1: stopped its process group ${s.out.pid} \\(the runner and Codex\\) with SIG(TERM|KILL); HEAD is r-8; 0 uncommitted path\\(s\\)`))
  await until(() => !isAlive(codexPid) && !isAlive(s.out.pid), 'the runner and Codex to be gone', 3000)
  assert.equal(git(repo, 'rev-list', '--count', 'origin/epic/rho..r-8').trim(), '0')
  assert.ok(!onRemote('r-8'))

  assert.deepEqual(runRunner('R-8', 'good', ['--cancel']).out, c.out, 'a second cancel repeats the first')
  const w = runRunner('R-8', 'good', ['--wait', '--max-wait', '300'])
  assert.equal(w.status, 1)
  assert.deepEqual(w.out, c.out, 'a wait after a cancel is the cancel, not pending')

  const none = runRunner('R-10', 'good', ['--cancel'])
  assert.equal(none.status, 0)
  assert.equal(none.out.state, 'cancelled')
  assert.match(none.out.detail, /no run was started for R-10 \(worker:R-10\) — nothing to cancel/)

  const again = runRunner('R-8', 'good', ['--start'])
  assert.equal(again.out.attached, false)
  assert.equal(again.out.attempt, 2)
  assert.equal(runRunner('R-8', 'good', ['--wait', '--max-wait', '30000']).out.result, 'branch-pushed')

  // A run stopped between `git add -A` and its commit leaves edits STAGED,
  // which a later plain `git commit` would sweep into someone else's commit —
  // so the report counts staged paths apart from the rest.
  writeFileSync(join(repo, 'staged-by-a-stopped-run.txt'), 'x\n')
  writeFileSync(join(repo, 'unstaged-by-a-stopped-run.txt'), 'y\n')
  git(repo, 'add', 'staged-by-a-stopped-run.txt')
  const late = runRunner('R-8', 'good', ['--cancel'])
  assert.match(late.out.detail, /2 uncommitted path\(s\) in the working tree, 1 of them staged/)
  git(repo, 'reset', '-q')
  resetTree()
})

test('a background run cancelled or superseded before its commit stands down and commits nothing', async () => {
  // Each case interferes while attempt 1's Codex is still working: a newer
  // attempt opens, or a cancel has marked the attempt but not yet signalled.
  const cases = [
    ['R-13', () => fabricateAttempt('R-13', 2, { nonce: 'b'.repeat(16) }), /attempt 1 was superseded by attempt 2; the runner committed and pushed nothing/],
    ['R-18', () => writeFileSync(join(stateDirOf('R-18'), 'cancelled-1.json'), '{"report":{}}'), /attempt 1 was cancelled; the runner committed and pushed nothing/],
  ]
  for (const [id, interfere, expected] of cases) {
    resetTree()
    const pidFile = join(tmp, `codex-pid-${id}`)
    runRunner(id, 'good', ['--start'], { FAKE_CODEX_SLEEP_MS: '1000', FAKE_CODEX_PID_FILE: pidFile })
    await until(() => existsSync(pidFile), `${id}'s stub Codex to start`)
    interfere()
    const result = join(stateDirOf(id), `result-${attemptRecord(id, 1).nonce}.json`)
    await until(() => existsSync(result), `${id} attempt 1's report`)
    const { exitCode, report } = JSON.parse(readFileSync(result, 'utf8'))
    assert.equal(exitCode, 1)
    assert.equal(report.result, 'halted')
    assert.match(report.detail, expected)
    assert.equal(git(repo, 'rev-list', '--count', `origin/epic/rho..${id.toLowerCase()}`).trim(), '0', 'nothing committed')
    assert.ok(!onRemote(id.toLowerCase()), 'nothing pushed')
  }
  resetTree()
})

// ---- attempts are keyed, so no attempt can be handed another's answer ------

test('a finished report left unread past one wait slice plus a minute is not attached to: --start opens a new attempt', async () => {
  resetTree()
  const before = calls()
  runRunner('R-11', 'good', ['--start'], { FAKE_CODEX_CALLS_FILE: callsFile })
  const result = join(stateDirOf('R-11'), `result-${attemptRecord('R-11', 1).nonce}.json`)
  await until(() => existsSync(result), "attempt 1's report")
  const old = (Date.now() - 601000) / 1000
  utimesSync(result, old, old)
  const s = runRunner('R-11', 'good', ['--start'], { FAKE_CODEX_CALLS_FILE: callsFile })
  assert.equal(s.out.attached, false, 'an unread report older than 600000 ms belongs to a proxy that is gone')
  assert.equal(s.out.attempt, 2)
  const done = runRunner('R-11', 'good', ['--wait', '--max-wait', '30000'])
  assert.equal(done.out.result, 'branch-pushed')
  assert.equal(calls() - before, 2)
  assert.equal(git(repo, 'rev-list', '--count', 'origin/epic/rho..r-11').trim(), '2', "the new attempt's commit, on top of the first")
})

test("a run presumed dead that writes its report late cannot answer the new attempt's wait — and its orphan is reaped when the new one opens", async () => {
  resetTree()
  const oldNonce = 'c'.repeat(16)
  fabricateAttempt('R-12', 1, { nonce: oldNonce, pid: deadPid() })
  const s = runRunner('R-12', 'good', ['--start'], { FAKE_CODEX_SLEEP_MS: '1500' })
  assert.equal(s.out.attached, false)
  assert.equal(s.out.attempt, 2)
  assert.ok(existsSync(join(stateDirOf('R-12'), 'cancelled-1.json')), 'the dead attempt was stopped and consumed first')
  // The old attempt's writer comes back to life long enough to write its report.
  writeFileSync(join(stateDirOf('R-12'), `result-${oldNonce}.json`), JSON.stringify({ exitCode: 0, report: { ticket: 'R-12', result: 'branch-pushed', detail: 'STALE ANSWER' } }))
  const pending = runRunner('R-12', 'good', ['--wait', '--max-wait', '300'])
  assert.equal(pending.out.state, 'pending')
  assert.equal(pending.out.attempt, 2)
  const done = runRunner('R-12', 'good', ['--wait', '--max-wait', '30000'])
  assert.equal(done.out.result, 'branch-pushed')
  assert.notEqual(done.out.detail, 'STALE ANSWER')
  assert.equal(done.out.runner.name, 'codex')
})

test('two racing --starts over a dead attempt launch exactly one new run', async () => {
  resetTree()
  fabricateAttempt('R-14', 1, { pid: deadPid() })
  const before = calls()
  const more = { FAKE_CODEX_SLEEP_MS: '1000', FAKE_CODEX_CALLS_FILE: callsFile }
  const [a, b] = await Promise.all([runAsync('R-14', 'good', ['--start'], more), runAsync('R-14', 'good', ['--start'], more)])
  assert.deepEqual([a.out.attached, b.out.attached].sort(), [false, true], 'one launched, one attached')
  assert.equal(a.out.attempt, 2)
  assert.equal(b.out.attempt, 2)
  assert.equal(runRunner('R-14', 'good', ['--wait', '--max-wait', '30000']).out.result, 'branch-pushed')
  assert.equal(calls() - before, 1)
})

// ---- the liveness backstops, each driven by a fabricated state -------------

test('an attempt that never recorded its pid is launching for a minute, then a failure — not pending forever', () => {
  const file = fabricateAttempt('R-15', 1, {})
  assert.equal(runRunner('R-15', 'good', ['--wait', '--max-wait', '300']).out.state, 'pending', 'a fresh launch is given its minute')
  const old = (Date.now() - 120000) / 1000
  utimesSync(file, old, old)
  const r = runRunner('R-15', 'good', ['--wait', '--max-wait', '300'])
  assert.equal(r.status, 1)
  assert.equal(r.out.state, 'failed')
  assert.match(r.out.detail, /attempt 1 records no launched process 60000 ms after it was opened: no process had been recorded for it/)
})

test("a live pid far past the run's timeout is presumed hung or reused — a failure, and a reused pid is never signalled", async () => {
  const bystander = spawn('sleep', ['30'], { stdio: 'ignore' })
  try {
    fabricateAttempt('R-16', 1, { pid: bystander.pid, startedAt: Date.now() - (1000 + 11 * 60 * 1000), timeoutMs: 1000 })
    const r = runRunner('R-16', 'good', ['--wait', '--max-wait', '300'])
    assert.equal(r.status, 1)
    assert.equal(r.out.state, 'failed')
    assert.match(r.out.detail, new RegExp(`the background runner \\(pid ${bystander.pid}\\) has no report \\d+ ms after it started — past its 1000 ms timeout plus 600000 ms, so it is presumed hung`))
    assert.match(r.out.detail, new RegExp(`pid ${bystander.pid} is no longer this attempt's runner \\(the pid was reused\\), so nothing was signalled`))
    await pause(100)
    assert.ok(isAlive(bystander.pid), 'the unrelated process that holds the pid is untouched')
  } finally {
    bystander.kill('SIGKILL')
  }
})

// ---- network git is bounded ------------------------------------------------

test('a hung git fetch or git push times out into a report instead of hanging a detached run', () => {
  const repo2 = join(tmp, 'repo2')
  git(tmp, 'clone', '-q', remote, repo2)
  git(repo2, 'config', 'user.email', 'test@example.com')
  git(repo2, 'config', 'user.name', 'Test')
  git(repo2, 'config', 'commit.gpgsign', 'false')
  // An ssh "remote" whose transport just sleeps: git waits on it forever.
  const hang = { GIT_SSH_COMMAND: 'sleep 20;' }
  const args = (id) => [RUNNER, id, '--epic', 'rho', '--epic-branch', 'epic/rho', '--default-branch', 'main', '--repo', repo2, '--plugin', PLUGIN, '--label', `worker:${id}`, '--codex', fakeCodex, '--json', '--git-timeout', '1000']
  const run = (id) => {
    const t0 = Date.now()
    try {
      return { status: 0, out: JSON.parse(sh(repo2, process.execPath, args(id), stubEnv('good', hang))), ms: Date.now() - t0 }
    } catch (e) {
      return { status: e.status, out: JSON.parse(String(e.stdout)), ms: Date.now() - t0 }
    }
  }

  git(repo2, 'remote', 'set-url', 'origin', 'ssh://flow.invalid/remote.git')
  const f = run('R-17')
  assert.equal(f.status, 1)
  assert.match(f.out.detail, /git fetch failed before the run: timed out after 1000 ms \(--git-timeout\)/)
  assert.ok(f.ms < 10000, `returned in ${f.ms} ms, not after the transport's 20 s`)

  git(repo2, 'remote', 'set-url', 'origin', remote)
  git(repo2, 'config', 'remote.origin.pushurl', 'ssh://flow.invalid/remote.git')
  const p = run('R-17')
  assert.equal(p.out.result, 'halted')
  assert.equal(p.out.stopCondition, 'other')
  assert.match(p.out.detail, /git push -u origin r-17 failed: timed out after 1000 ms \(--git-timeout\)/)
  assert.equal(p.out.runner.pushed, false)
  assert.ok(p.ms < 10000, `returned in ${p.ms} ms, not after the transport's 20 s`)
})
