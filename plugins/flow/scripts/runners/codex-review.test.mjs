// codex-review.test.mjs — the Codex shadow-review runner, without Codex.
//
// What these tests pin is the runner's own behaviour: the head it resolves,
// the credential it requires, the detached worktree it reviews in and removes,
// the sandbox flags it passes, the packet it assembles, the event stream it
// parses, and — the load-bearing part — which output counts as a report. A
// stub `codex` binary stands in for the real one: it records its argv, its
// prompt and the checkout it was pointed at, and prints the JSONL events and
// writes the `-o` file the way codex-cli 0.154.0 does, including the
// schema-valid interim messages the planning probe saw. So the suite needs git
// and nothing else, and never calls the real Codex. What it cannot prove is
// that real Codex reviews well; only a live run shows that.
//
// The core cases are named with the phrase "shadow runner"; extra coverage
// goes under other names.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, chmodSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const RUNNER = join(here, 'codex-review.mjs')
const PLUGIN = realpathSync(join(here, '..', '..'))
const DRIVER = join(PLUGIN, 'workflows', 'run-epic.mjs')

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'codex-review-runner-')))
after(() => rmSync(tmp, { recursive: true, force: true }))
const remote = join(tmp, 'remote.git')
const repo = join(tmp, 'repo')
const other = join(tmp, 'other')
const codexHome = join(tmp, 'codex-home')
const emptyHome = join(tmp, 'empty-home')
const rec = {
  args: join(tmp, 'args.json'),
  prompt: join(tmp, 'prompt.txt'),
  checkout: join(tmp, 'checkout.json'),
  schema: join(tmp, 'schema.json'),
}
const fakeCodex = join(tmp, 'fake-codex')

const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', CODEX_HOME: codexHome }
delete ENV.OPENAI_API_KEY
const sh = (cwd, cmd, args, env = ENV) => execFileSync(cmd, args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] })
const git = (cwd, ...args) => sh(cwd, 'git', args).trim()

// ---- a throwaway repository with one ticket branch ----------------------------
git(tmp, 'init', '--bare', '--initial-branch=main', remote)
git(tmp, 'init', '--initial-branch=main', repo)
for (const [k, v] of [['user.email', 'test@example.com'], ['user.name', 'Test'], ['commit.gpgsign', 'false']]) git(repo, 'config', k, v)
mkdirSync(join(repo, 'epics/rho'), { recursive: true })
writeFileSync(join(repo, 'epics/rho/tickets.md'), '# Rho epic — tickets\n\nDelivery: release\n\n## R-1 — build it\n\n**Scope.** Build.\n')
writeFileSync(join(repo, 'epics/rho/status.md'), '# Rho epic — status log\n')
git(repo, 'add', '.')
git(repo, 'commit', '-m', 'rho epic')
git(repo, 'remote', 'add', 'origin', remote)
git(repo, 'push', '-u', 'origin', 'main')
git(repo, 'checkout', '-b', 'epic/rho')
git(repo, 'push', '-u', 'origin', 'epic/rho')
const BASE = git(repo, 'rev-parse', 'HEAD')
git(repo, 'checkout', '-b', 'r-1')
writeFileSync(join(repo, 'built.txt'), 'built\n')
writeFileSync(join(repo, 'epics/rho/status.md'), '# Rho epic — status log\n\n### R-1 — build it — 2026-09-15 — DONE\n\n**Owed:** Nothing.\n')
git(repo, 'add', '.')
git(repo, 'commit', '-m', 'R-1: build it')
const HEAD = git(repo, 'rev-parse', 'HEAD')
// The caller's checkout moves on after the reviewed head — a later step
// editing it — so a review that read the checkout would see this file.
git(repo, 'checkout', '-q', 'epic/rho')
writeFileSync(join(repo, 'mid-fix.txt'), 'uncommitted work in the caller checkout\n')

mkdirSync(codexHome)
mkdirSync(emptyHome)
writeFileSync(join(codexHome, 'auth.json'), '{}')
writeFileSync(join(codexHome, 'config.toml'), 'model = "gpt-stub"\nmodel_reasoning_effort = "high"\n\n[profiles.fast]\nmodel = "not-the-default"\n')

// ---- the stub -------------------------------------------------------------------
// Speaks codex-cli 0.154.0's protocol: JSONL events on stdout, schema-valid
// interim agent messages (the probe's finding), one turn.completed carrying
// the five usage keys, and the report in the -o file only at turn completion.
writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require('fs')
const { execFileSync, spawn } = require('child_process')
const argv = process.argv.slice(2)
fs.writeFileSync(process.env.REC_ARGS, JSON.stringify(argv))
const prompt = fs.readFileSync(0, 'utf8')
fs.writeFileSync(process.env.REC_PROMPT, prompt)
const opt = (f) => argv[argv.indexOf(f) + 1]
const dir = opt('-C')
const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim()
fs.writeFileSync(process.env.REC_CHECKOUT, JSON.stringify({
  cwd: process.cwd(), dir, head: g('rev-parse', 'HEAD'), gitDir: g('rev-parse', '--absolute-git-dir'),
  commonDir: fs.realpathSync(g('rev-parse', '--path-format=absolute', '--git-common-dir')),
  sawMidFix: fs.existsSync(dir + '/mid-fix.txt'), sawBuilt: fs.existsSync(dir + '/built.txt'),
}))
fs.writeFileSync(process.env.REC_SCHEMA, fs.readFileSync(opt('--output-schema'), 'utf8'))
const mode = process.env.FAKE_MODE
const say = (o) => console.log(JSON.stringify(o))
const empty = { important: [], nits: [], nitOverflowCount: 0, preExisting: [], checkedAndSound: "I'm reading the reviewer bar and procedure first.", reviewedHead: '' }
say({ type: 'thread.started', thread_id: 'thr_shadow' })
say({ type: 'turn.started' })
say({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: JSON.stringify(empty) } })
if (mode === 'crash') { console.error('stream disconnected'); process.exit(1) }
if (mode === 'hang') {
  // A grandchild holding stdout open, as a shell Codex started would.
  spawn('sleep', ['30'], { stdio: 'inherit' })
  setTimeout(() => {}, 30000)
  return
}
const findings = {
  important: [{ file: 'built.txt', cite: 'built.txt:1', summary: 'the file says built but builds nothing', confirmedOrPlausible: 'confirmed', failure: 'reading built.txt yields "built" with no artifact behind it' }],
  nits: [{ cite: 'epics/rho/status.md:5', summary: 'Owed line is terse' }],
  nitOverflowCount: 2,
  preExisting: [{ cite: 'epics/rho/tickets.md:3', summary: 'delivery line predates the ticket', owner: null }],
  checkedAndSound: 'the status entry matches the diff',
  reviewedHead: g('rev-parse', 'HEAD'),
}
const clean = { important: [], nits: [], nitOverflowCount: 0, preExisting: [], checkedAndSound: 'the diff does what the ticket says', reviewedHead: g('rev-parse', 'HEAD').slice(0, 12) }
// 'large': a long review — the JSON the runner prints is far past a 64 KB pipe buffer.
const report = mode === 'findings' ? findings : mode === 'wrong-head' ? { ...clean, reviewedHead: g('rev-parse', 'HEAD^') } : mode === 'large' ? { ...clean, checkedAndSound: 'x'.repeat(300000) } : clean
if (mode !== 'no-turn') say({ type: 'turn.completed', usage: { input_tokens: 4770, cached_input_tokens: 4024, cache_write_input_tokens: 747, output_tokens: 123, reasoning_output_tokens: 98 } })
if (mode !== 'no-o') fs.writeFileSync(opt('-o'), JSON.stringify(report))
if (mode === 'exit-with-o') { console.error('exited after writing the report'); process.exit(1) }
`,
)
chmodSync(fakeCodex, 0o755)

const runRunner = (mode, extra = [], env = {}) => {
  for (const f of Object.values(rec)) rmSync(f, { force: true })
  const base = ['R-1', '--epic', 'rho', '--branch', 'r-1', '--range', `origin/epic/rho...${HEAD.slice(0, 7)}`, '--head', HEAD.slice(0, 7), '--repo', repo, '--plugin', PLUGIN, '--codex', fakeCodex, '--json']
  const r = { status: 0, out: null, stdout: '' }
  try {
    r.stdout = sh(repo, process.execPath, [RUNNER, ...base, ...extra], { ...ENV, FAKE_MODE: mode, REC_ARGS: rec.args, REC_PROMPT: rec.prompt, REC_CHECKOUT: rec.checkout, REC_SCHEMA: rec.schema, ...env })
  } catch (e) {
    r.status = e.status
    r.stdout = String(e.stdout)
    r.stderr = String(e.stderr)
  }
  try {
    r.out = JSON.parse(r.stdout)
  } catch {}
  return r
}
const read = (f) => JSON.parse(readFileSync(f, 'utf8'))
const worktreeCount = () => git(repo, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length
// Every outcome leaves the caller's repository with its one worktree and the
// review checkout gone from disk.
const assertWorktreeGone = () => {
  assert.equal(worktreeCount(), 1, 'the review worktree is removed from git')
  if (existsSync(rec.checkout)) assert.equal(existsSync(read(rec.checkout).dir), false, 'the review worktree is removed from disk')
}
const USAGE = { input: 4770, cached: 4024, cacheWrite: 747, output: 123, reasoning: 98 }

// ---- driver source extraction ------------------------------------------------------
// run-epic.mjs cannot be imported (a module body with a top-level return), so
// the literals the runner must match are cut out of its source and evaluated.
const driverSource = readFileSync(DRIVER, 'utf8')
const templateLiteral = (name) => {
  const marker = `const ${name} = \``
  const start = driverSource.indexOf(marker)
  assert.ok(start >= 0, `${name} is defined in run-epic.mjs`)
  let i = start + marker.length
  let depth = 0
  for (; i < driverSource.length; i++) {
    const c = driverSource[i]
    if (c === '\\') {
      i++
      continue
    }
    if (depth === 0 && c === '$' && driverSource[i + 1] === '{') {
      depth = 1
      i++
      continue
    }
    if (depth > 0) {
      if (c === '{') depth++
      else if (c === '}') depth--
      continue
    }
    if (c === '`') break
  }
  return driverSource.slice(start + marker.length, i)
}
const objectLiteral = (name) => {
  const marker = `const ${name} = `
  const start = driverSource.indexOf(marker)
  assert.ok(start >= 0, `${name} is defined in run-epic.mjs`)
  const end = driverSource.indexOf('\n}\n', start)
  return new Function(`return (${driverSource.slice(start + marker.length, end + 2)})`)()
}

// ---- the core cases -------------------------------------------------------------

test('shadow runner: a clean review is reviewed, in a detached worktree at the head, with usage, model and effort recorded', () => {
  const r = runRunner('clean')
  assert.equal(r.status, 0)
  assert.equal(r.out.ticket, 'R-1')
  assert.equal(r.out.outcome, 'reviewed')
  assert.equal(r.out.reason, null)
  assert.equal(r.out.head, HEAD, 'the head is reported as the full SHA it resolved to')
  assert.equal(r.out.headVerified, true, 'a 12-character reviewedHead resolving to the head verifies')
  assert.deepEqual(r.out.review.important, [])
  assert.equal(r.out.review.checkedAndSound, 'the diff does what the ticket says', 'the turn-complete report, not the interim message')
  assert.equal(r.out.runner.name, 'codex')
  assert.equal(r.out.runner.model, 'gpt-stub', 'no --model: the top-level model key of $CODEX_HOME/config.toml, not a profile table')
  assert.equal(r.out.runner.effort, 'xhigh', 'effort defaults to xhigh')
  assert.equal(r.out.runner.exitCode, 0)
  assert.deepEqual(r.out.runner.usage, USAGE)
  assert.equal(r.out.runner.threadId, 'thr_shadow')
  assert.equal(r.out.runner.events, 4)
  assert.ok(Number.isInteger(r.out.runner.durationMs) && r.out.runner.durationMs >= 0)

  const seen = read(rec.checkout)
  assert.notEqual(seen.dir, repo, 'Codex is never pointed at the caller checkout')
  assert.equal(seen.cwd, seen.dir)
  assert.equal(seen.head, HEAD, 'the worktree sits at the reviewed head')
  assert.notEqual(seen.gitDir, seen.commonDir, 'a linked worktree of the caller repository')
  assert.equal(seen.commonDir, join(repo, '.git'))
  assert.equal(seen.sawMidFix, false, 'the caller checkout’s uncommitted work is invisible to the review')
  assert.equal(seen.sawBuilt, true, 'the reviewed commit’s files are there')
  assert.equal(git(repo, 'symbolic-ref', '--short', 'HEAD'), 'epic/rho', 'the caller checkout did not move')
  assertWorktreeGone()
})

test('shadow runner: findings come back verbatim', () => {
  const r = runRunner('findings')
  assert.equal(r.out.outcome, 'reviewed')
  assert.equal(r.out.headVerified, true)
  assert.deepEqual(r.out.review, {
    important: [{ file: 'built.txt', cite: 'built.txt:1', summary: 'the file says built but builds nothing', confirmedOrPlausible: 'confirmed', failure: 'reading built.txt yields "built" with no artifact behind it' }],
    nits: [{ cite: 'epics/rho/status.md:5', summary: 'Owed line is terse' }],
    nitOverflowCount: 2,
    preExisting: [{ cite: 'epics/rho/tickets.md:3', summary: 'delivery line predates the ticket', owner: null }],
    checkedAndSound: 'the status entry matches the diff',
    reviewedHead: HEAD,
  })
  assertWorktreeGone()
})

test('shadow runner: a schema-valid interim message followed by a crash is a failure, never an empty review', () => {
  const r = runRunner('crash')
  assert.equal(r.status, 0, 'a shadow failure is a recorded fact, not a runner error')
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'codex-exit')
  assert.match(r.out.detail, /codex exited 1 without turn\.completed .*stderr: stream disconnected/)
  assert.equal(r.out.review, null, 'the interim message parsed as a review and was still not taken')
  assert.equal(r.out.headVerified, false)
  assert.equal(r.out.runner.exitCode, 1)
  assert.equal(r.out.runner.usage, null)
  assertWorktreeGone()
})

test('shadow runner: a timeout kills Codex and the shells it started, and is a failure', () => {
  const t0 = Date.now()
  const r = runRunner('hang', ['--timeout', '800'])
  assert.ok(Date.now() - t0 < 15000, 'the runner did not wait for the grandchild holding stdout')
  assert.equal(r.status, 0)
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'timeout')
  assert.match(r.out.detail, /exceeded the runner timeout of 800 ms/)
  assert.equal(r.out.review, null)
  assertWorktreeGone()
})

test('shadow runner: a completed turn with no -o report file is no-report, never the last streamed message', () => {
  const r = runRunner('no-o')
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'no-report')
  assert.match(r.out.detail, /wrote no -o report file/)
  assert.equal(r.out.review, null)
  assert.deepEqual(r.out.runner.usage, USAGE, 'usage is still recorded for a failed review')
  assertWorktreeGone()
})

test('shadow runner: a reviewedHead that resolves to another commit is head-mismatch, with the review kept verbatim', () => {
  const r = runRunner('wrong-head')
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'head-mismatch')
  assert.equal(r.out.headVerified, false)
  assert.equal(r.out.review.reviewedHead, BASE, 'kept verbatim')
  assert.equal(r.out.review.checkedAndSound, 'the diff does what the ticket says')
  assert.match(r.out.detail, new RegExp(`reviewedHead "${BASE}" \\(${BASE}\\), not ${HEAD}`))
  assertWorktreeGone()
})

test('shadow runner: a missing codex binary is codex-missing', () => {
  const r = runRunner('clean', ['--codex', join(tmp, 'no-such-codex')])
  assert.equal(r.status, 0)
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'codex-missing')
  assert.match(r.out.detail, /codex binary not found .*no-such-codex/)
  assert.equal(existsSync(rec.args), false)
  assertWorktreeGone()
})

test('shadow runner: no credential is signed-out, and Codex is not started', () => {
  const r = runRunner('clean', [], { CODEX_HOME: emptyHome })
  assert.equal(r.status, 0)
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'signed-out')
  assert.match(r.out.detail, new RegExp(`no ${emptyHome}/auth\\.json and no OPENAI_API_KEY`))
  assert.equal(r.out.runner.model, 'config default', 'no --model and no config.toml')
  assert.equal(existsSync(rec.args), false, 'the stub never ran')
  assertWorktreeGone()
})

test('shadow runner: argv is read-only, networkless, schema-bound, -o, effort and model as given, prompt on stdin', () => {
  const r = runRunner('clean', ['--model', 'gpt-5-codex', '--effort', 'high'])
  assert.equal(r.out.outcome, 'reviewed')
  assert.equal(r.out.runner.model, 'gpt-5-codex')
  assert.equal(r.out.runner.effort, 'high')
  const argv = read(rec.args)
  const at = (f) => argv[argv.indexOf(f) + 1]
  assert.deepEqual(argv, [
    'exec', '--json', '--color', 'never', '-C', at('-C'), '-s', 'read-only', '--ephemeral',
    '--output-schema', at('--output-schema'), '-o', at('-o'), '-c', 'model_reasoning_effort="high"', '-m', 'gpt-5-codex', '-',
  ])
  assert.equal(at('-C'), read(rec.checkout).dir)
  assert.ok(!argv.some((a) => /network/i.test(a)), 'no network configuration of any kind')
  assert.ok(!at('-o').startsWith(at('-C')) && !at('--output-schema').startsWith(at('-C')), 'the runner’s files live outside the reviewed checkout')
  assert.ok(readFileSync(rec.prompt, 'utf8').includes('Ticket: R-1'), 'the prompt arrived on stdin')
  assertWorktreeGone()
})

test('shadow runner: the prompt carries the driver’s packet body and reviewer rules verbatim, with the one status-read substitution', () => {
  const r = runRunner('clean')
  assert.equal(r.out.outcome, 'reviewed')
  const prompt = readFileSync(rec.prompt, 'utf8')
  const worktree = read(rec.checkout).dir
  const inputs = { TICKETS: `node "${PLUGIN}/scripts/tickets.mjs"`, id: 'R-1', epic: 'rho', branch: 'r-1', repoRoot: worktree, root: worktree }
  const evaluate = (text) => new Function(...Object.keys(inputs), `return \`${text}\``)(...Object.values(inputs))

  const driverBody = evaluate(templateLiteral('packetBody'))
  const from = 'git show origin/r-1:epics/rho/status.md'
  assert.equal(driverBody.split(from).length, 2, 'the driver packet reads the status entry off origin/<branch> exactly once')
  const body = driverBody.replace(from, `git show ${HEAD}:epics/rho/status.md`)
  assert.ok(prompt.includes(body), 'the packet body, substituted, is in the prompt verbatim')
  assert.ok(!prompt.includes('origin/r-1'), 'nothing in the prompt needs the pushed branch')

  const rules = evaluate(templateLiteral('REVIEWER_RULES'))
  assert.ok(rules.startsWith('- You REPORT. You NEVER fix'))
  assert.ok(prompt.includes(rules), 'the reviewer rules are in the prompt verbatim')

  assert.ok(prompt.includes(`Repository: ${worktree}\nTicket: R-1\nCommit range: origin/epic/rho...${HEAD.slice(0, 7)}\nReviewed head`), 'the header names the reviewed checkout, ticket and range')
  assert.match(prompt, new RegExp(`Reviewed head .*: ${HEAD} — review that commit`))
  assert.ok(prompt.includes(`${PLUGIN}/agents/ticket-reviewer.md`) && prompt.includes(`${PLUGIN}/skills/review/SKILL.md`), 'the reviewer definition and review skill under --plugin')
  assert.match(prompt, /Report `reviewedHead`: what `git rev-parse HEAD` prints/)
  assertWorktreeGone()
})

test('shadow runner: the output schema is the driver’s REVIEW_SCHEMA made strict — same names, item shapes and enums', () => {
  const r = runRunner('clean')
  assert.equal(r.out.outcome, 'reviewed')
  const strict = read(rec.schema)
  const driver = objectLiteral('REVIEW_SCHEMA')
  assert.ok(driver.properties.reviewedHead && !driver.required.includes('reviewedHead'), 'the driver schema is the one extracted')

  // Walk both schemas together. Strict means: every object closed and every
  // property required; a property the driver leaves optional becomes nullable
  // — except reviewedHead, which the runner requires outright.
  const compare = (d, s, path) => {
    assert.deepEqual(s.type, d.type, `${path}: type`)
    assert.deepEqual(s.enum, d.enum, `${path}: enum`)
    assert.equal(s.maxItems, d.maxItems, `${path}: maxItems`)
    if (d.type === 'array') compare(d.items, s.items, `${path}[]`)
    if (d.type === 'object') {
      assert.equal(s.additionalProperties, false, `${path}: closed`)
      assert.deepEqual(Object.keys(s.properties).sort(), Object.keys(d.properties).sort(), `${path}: property names`)
      assert.deepEqual([...s.required].sort(), Object.keys(d.properties).sort(), `${path}: every property required`)
      for (const k of Object.keys(d.properties)) {
        const dk = d.properties[k]
        const sk = s.properties[k]
        const p = `${path}.${k}`
        if (!d.required.includes(k) && k !== 'reviewedHead') {
          assert.deepEqual(sk.type, [dk.type, 'null'], `${p}: optional in the driver, nullable here`)
          compare({ ...dk, type: sk.type }, sk, p)
        } else compare(dk, sk, p)
      }
    }
  }
  compare(driver, strict, 'review')
  assert.equal(strict.properties.reviewedHead.type, 'string')
  assert.equal(strict.properties.preExisting.items.properties.owner.type[1], 'null')
  assertWorktreeGone()
})

// ---- further coverage ---------------------------------------------------------------

test('a head the repository lacks is fetched once from origin/<branch>; one that still does not resolve is head-not-found before Codex starts', () => {
  // A commit that exists only on the remote.
  git(repo, 'push', '-q', 'origin', 'r-1')
  git(tmp, 'clone', '-q', '--branch', 'r-1', remote, other)
  const o = other
  for (const [k, v] of [['user.email', 'test@example.com'], ['user.name', 'Test'], ['commit.gpgsign', 'false']]) git(o, 'config', k, v)
  writeFileSync(join(o, 'fix.txt'), 'fix\n')
  git(o, 'add', '.')
  git(o, 'commit', '-q', '-m', 'R-1: a fix pushed from elsewhere')
  git(o, 'push', '-q', 'origin', 'r-1')
  const remoteOnly = git(o, 'rev-parse', 'HEAD')
  assert.throws(() => git(repo, 'cat-file', '-e', `${remoteOnly}^{commit}`), 'not local yet')

  const fetched = runRunner('clean', ['--head', remoteOnly])
  assert.equal(fetched.out.outcome, 'reviewed')
  assert.equal(fetched.out.head, remoteOnly)
  assert.equal(read(rec.checkout).head, remoteOnly)
  assertWorktreeGone()

  const missing = runRunner('clean', ['--head', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'])
  assert.equal(missing.status, 0)
  assert.equal(missing.out.outcome, 'failed')
  assert.equal(missing.out.reason, 'head-not-found')
  assert.match(missing.out.detail, /does not resolve to a commit .*after `git fetch origin r-1`.*Codex was not started/)
  assert.equal(existsSync(rec.args), false)
  assertWorktreeGone()
})

test('an -o file written without turn.completed is no-report', () => {
  const r = runRunner('no-turn')
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'no-report')
  assert.match(r.out.detail, /without a turn\.completed event/)
  assert.equal(r.out.review, null)
  assertWorktreeGone()
})

test('OPENAI_API_KEY alone is a credential', () => {
  const r = runRunner('clean', [], { CODEX_HOME: emptyHome, OPENAI_API_KEY: 'sk-test' })
  assert.equal(r.out.outcome, 'reviewed')
  assertWorktreeGone()
})

test('usage errors exit 2 before touching git or Codex', () => {
  const good = ['R-1', '--epic', 'rho', '--branch', 'r-1', '--range', 'a...b', '--head', HEAD, '--repo', repo, '--plugin', PLUGIN]
  const bad = [
    [],
    ['r-x', ...good.slice(1)],
    good.filter((a, i) => i !== 5 && i !== 6), // no --range
    good.map((a) => (a === HEAD ? 'HEAD' : a)), // a head that is not a SHA
    good.map((a) => (a === 'a...b' ? 'a...b; rm -rf /' : a)),
    good.map((a) => (a === repo ? 'relative/repo' : a)),
    [...good, '--effort', 'x"y'],
    [...good, '--timeout', '-5'],
    // setTimeout clamps anything above 2^31-1 ms to 1 ms: Codex would be killed at once and reported as a timeout.
    [...good, '--timeout', '2147483648'],
  ]
  for (const args of bad) {
    rmSync(rec.args, { force: true })
    let status = 0
    try {
      sh(repo, process.execPath, [RUNNER, ...args, '--codex', fakeCodex, '--json'])
    } catch (e) {
      status = e.status
    }
    assert.equal(status, 2, `args ${JSON.stringify(args)} must be refused`)
    assert.equal(existsSync(rec.args), false)
  }
  assert.equal(worktreeCount(), 1)
})

test('a nonzero Codex exit is codex-exit with no review, even when an -o file was written', () => {
  const r = runRunner('exit-with-o')
  assert.equal(r.status, 0)
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'codex-exit')
  assert.match(r.out.detail, /codex exited 1 — stderr: exited after writing the report/)
  assert.equal(r.out.review, null, 'the report file of a turn that did not end cleanly is not taken')
  assert.deepEqual(r.out.runner.usage, USAGE)
  assertWorktreeGone()
})

test('a head that is not local and a fetch that fails is head-not-found, with the fetch failure named', () => {
  const r = runRunner('clean', ['--head', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', '--branch', 'no-such-branch'])
  assert.equal(r.status, 0)
  assert.equal(r.out.outcome, 'failed')
  assert.equal(r.out.reason, 'head-not-found')
  assert.match(r.out.detail, /and `git fetch origin no-such-branch` failed: .*no-such-branch.*Codex was not started/)
  assert.equal(existsSync(rec.args), false)
  assertWorktreeGone()
})

test('a report larger than a pipe buffer reaches the caller whole', () => {
  const r = runRunner('large')
  assert.ok(r.stdout.length > 300000, `stdout carried ${r.stdout.length} bytes`)
  assert.equal(r.out.outcome, 'reviewed')
  assert.equal(r.out.review.checkedAndSound.length, 300000)
  assertWorktreeGone()
})

test('a runner stopped by a signal still prints its failed report and removes the worktree and Codex', async () => {
  for (const f of Object.values(rec)) rmSync(f, { force: true })
  const args = [RUNNER, 'R-1', '--epic', 'rho', '--branch', 'r-1', '--range', `origin/epic/rho...${HEAD.slice(0, 7)}`, '--head', HEAD, '--repo', repo, '--plugin', PLUGIN, '--codex', fakeCodex, '--json']
  const child = spawn(process.execPath, args, { cwd: repo, env: { ...ENV, FAKE_MODE: 'hang', REC_ARGS: rec.args, REC_PROMPT: rec.prompt, REC_CHECKOUT: rec.checkout, REC_SCHEMA: rec.schema }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  child.stdout.on('data', (d) => (stdout += d))
  const exited = new Promise((done) => child.on('close', (code) => done(code)))
  const t0 = Date.now()
  while (!existsSync(rec.checkout)) {
    assert.ok(Date.now() - t0 < 10000, 'Codex started')
    await new Promise((r) => setTimeout(r, 50))
  }
  child.kill('SIGTERM')
  const code = await exited
  assert.ok(Date.now() - t0 < 15000, 'the runner did not wait for Codex or its shells')
  assert.equal(code, 0)
  const out = JSON.parse(stdout)
  assert.equal(out.outcome, 'failed')
  assert.equal(out.reason, 'codex-exit')
  assert.match(out.detail, /the runner received SIGTERM and stopped Codex/)
  assert.equal(out.review, null)
  assertWorktreeGone()
})

test('shadow runner: the prompt says the sandbox cannot render a page, so a fidelity table is audited and said to be unrendered', () => {
  // The review skill tells a reviewer to re-run the differ where the project
  // can serve a page. This one never can — no network, no server — and an
  // audit that is silent about not having rendered reads as a confirmation.
  const r = runRunner('clean')
  assert.equal(r.out.outcome, 'reviewed')
  const prompt = readFileSync(rec.prompt, 'utf8')
  assert.match(prompt, /You cannot serve or render a page/)
  assert.match(prompt, /say in your report that the page was not rendered/)
  assertWorktreeGone()
})
