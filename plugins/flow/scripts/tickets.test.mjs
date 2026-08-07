// Tests for tickets.mjs, run with:  node --test plugins/flow/scripts/
//
// Everything the board reports is derived from string parsing of headings,
// commit subjects and branch names — so these tests build a real throwaway git
// repository (with a local bare "remote") and assert the derived states, rather
// than unit-testing parsers against strings that may drift from real usage.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'tickets.mjs')

// Neutralise the developer's own git config (commit signing, hooks) so the
// fixture behaves identically everywhere.
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }

const sh = (cwd, cmd, args) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] })
const git = (cwd, ...args) => sh(cwd, 'git', args)
const run = (cwd, ...args) => sh(cwd, process.execPath, [SCRIPT, ...args])
const runFail = (cwd, ...args) => {
  try {
    sh(cwd, process.execPath, [SCRIPT, ...args])
    return null
  } catch (e) {
    return { status: e.status, stderr: String(e.stderr) }
  }
}

// ── fixture ──────────────────────────────────────────────────────────────────
// alpha epic, four tickets:
//   A-1  commit subject on origin/main            -> shipped
//   A-2  valid DONE heading in status.md          -> done
//   A-3  local branch with commits; its status
//        heading is malformed (missing date) and
//        must NOT count as done                   -> in-progress
//   A-4  nothing anywhere; stale ✅ in title       -> todo, glyph stripped

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'tickets-test-')))
const remote = join(tmp, 'remote.git')
const repo = join(tmp, 'repo')
after(() => rmSync(tmp, { recursive: true, force: true }))

git(tmp, 'init', '--bare', '--initial-branch=main', remote)
git(tmp, 'init', '--initial-branch=main', repo)
git(repo, 'config', 'user.email', 'test@example.com')
git(repo, 'config', 'user.name', 'Test')
git(repo, 'config', 'commit.gpgsign', 'false')

mkdirSync(join(repo, 'epics/alpha'), { recursive: true })
writeFileSync(
  join(repo, 'epics/alpha/tickets.md'),
  `# Alpha epic — tickets

Release mode: serial

## A-1 — ship the walking skeleton

**Scope.** The skeleton.

## A-2 — persist the results

**Scope.** Persistence.

## A-3 — handle the error path

**Scope.** Errors.

## A-4 — polish the output ✅

**Scope.** Polish.
`,
)
writeFileSync(
  join(repo, 'epics/alpha/status.md'),
  `# Alpha epic — status log

### A-2 — persist the results — 2026-08-01 — DONE

**Built:** persistence.

### A-3 — handle the error path — DONE

Malformed on purpose: no date, so this heading must not parse.
`,
)

// gamma: integration + autonomous, with a prose-decorated Release mode line —
// the tolerant-parse case, and the fixture for run-mode exposure.
mkdirSync(join(repo, 'epics/gamma'), { recursive: true })
writeFileSync(
  join(repo, 'epics/gamma/tickets.md'),
  `# Gamma epic — tickets

Release mode: integration — these tickets share a schema change and cannot ship alone.

Run mode: autonomous

## G-1 — expand the schema

**Scope.** Expansion.
`,
)

git(repo, 'add', '.')
git(repo, 'commit', '-m', 'A-1: ship the walking skeleton')
git(repo, 'remote', 'add', 'origin', remote)
git(repo, 'push', '-u', 'origin', 'main')
git(repo, 'remote', 'set-head', 'origin', 'main')

git(repo, 'checkout', '-b', 'a-3')
writeFileSync(join(repo, 'errors.txt'), 'wip\n')
git(repo, 'add', 'errors.txt')
git(repo, 'commit', '-m', 'A-3: wip on the error path')
git(repo, 'checkout', 'main')

// ── tests ────────────────────────────────────────────────────────────────────

test('board derives each state from git, not from any stored status', () => {
  const data = JSON.parse(run(repo, 'list', '--json'))
  const state = Object.fromEntries(data.tickets.map((t) => [t.id, t.state]))

  assert.equal(state['A-1'], 'shipped', 'commit subject on origin/main means shipped')
  assert.equal(state['A-2'], 'done', 'valid DONE heading, nothing shipped')
  assert.equal(state['A-3'], 'in-progress', 'malformed DONE heading must not count; local branch with commits wins')
  assert.equal(state['A-4'], 'todo')

  assert.equal(data.defaultBranch, 'main')
  assert.equal(data.onMainCapped, false)
  assert.deepEqual(data.duplicates, {})
})

test('a stale status glyph in a ticket heading is stripped from the title', () => {
  const data = JSON.parse(run(repo, 'list', '--json'))
  const a4 = data.tickets.find((t) => t.id === 'A-4')
  assert.equal(a4.title, 'polish the output')
})

test('find resolves a lowercase ID to absolute paths', () => {
  const out = JSON.parse(run(repo, 'find', 'a-2', '--json'))
  assert.equal(out.id, 'A-2')
  assert.equal(out.epic, 'alpha')
  assert.equal(out.branch, 'a-2')
  assert.equal(out.repoRoot, repo)
  assert.equal(out.ticketsDoc, join(repo, 'epics/alpha/tickets.md'))
  assert.equal(out.statusDoc, join(repo, 'epics/alpha/status.md'))
  assert.equal(out.statusDocExists, true)
})

test('find refuses an unknown ID and lists what it knows', () => {
  const fail = runFail(repo, 'find', 'A-99')
  assert.equal(fail.status, 1)
  assert.match(fail.stderr, /no ticket "A-99"/)
  assert.match(fail.stderr, /A-1/)
})

test('next proposes the first unstarted ticket in document order', () => {
  const open = JSON.parse(run(repo, 'next', '--json'))
  assert.deepEqual(open.map((t) => t.id), ['A-4', 'G-1'])
})

test('mode lines parse tolerantly and expose in find and list', () => {
  const g = JSON.parse(run(repo, 'find', 'G-1', '--json'))
  assert.equal(g.releaseMode, 'integration', 'prose after the value must not break the parse')
  assert.equal(g.runMode, 'autonomous')

  const a = JSON.parse(run(repo, 'find', 'A-2', '--json'))
  assert.equal(a.releaseMode, 'serial')
  assert.equal(a.runMode, null)

  const data = JSON.parse(run(repo, 'list', '--json'))
  assert.deepEqual(data.modes.gamma, { releaseMode: 'integration', runMode: 'autonomous' })
  assert.deepEqual(data.modes.alpha, { releaseMode: 'serial', runMode: null })
})

test('an epic with no mode lines defaults to serial, attended', () => {
  mkdirSync(join(repo, 'epics/delta'), { recursive: true })
  writeFileSync(join(repo, 'epics/delta/tickets.md'), '# Delta\n\n## D-1 — bare epic\n\n**Scope.** Bare.\n')
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(data.modes.delta, { releaseMode: 'serial', runMode: null })
  } finally {
    rmSync(join(repo, 'epics/delta'), { recursive: true, force: true })
  }
})

test('autonomous + serial is refused by find and failed by doctor', () => {
  mkdirSync(join(repo, 'epics/rogue'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/rogue/tickets.md'),
    '# Rogue\n\nRelease mode: serial\n\nRun mode: autonomous\n\n## R-1 — unattended to main\n\n**Scope.** No.\n',
  )
  try {
    const find = runFail(repo, 'find', 'R-1')
    assert.equal(find.status, 1)
    assert.match(find.stderr, /autonomous/)
    assert.match(find.stderr, /integration topology/)

    const doc = runFail(repo, 'doctor', '--json')
    assert.equal(doc.status, 1, 'a mode contradiction is a doctor fail')
  } finally {
    rmSync(join(repo, 'epics/rogue'), { recursive: true, force: true })
  }
})

test('an unrecognised mode value is a doctor warning, never a silent default', () => {
  mkdirSync(join(repo, 'epics/typo'), { recursive: true })
  writeFileSync(join(repo, 'epics/typo/tickets.md'), '# Typo\n\nRelease mode: sequential\n\n## T-1 — typo mode\n\n**Scope.** T.\n')
  try {
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    const warn = rows.find((r) => r.msg.includes('sequential'))
    assert.ok(warn, 'doctor must flag the unrecognised value')
    assert.equal(warn.level, 'warn')
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.equal(data.modes.typo.releaseMode, 'sequential', 'the raw value is exposed, not coerced')
  } finally {
    rmSync(join(repo, 'epics/typo'), { recursive: true, force: true })
  }
})

test('a ticket ID defined in two epics is flagged on the board and refused by find', () => {
  mkdirSync(join(repo, 'epics/beta'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/beta/tickets.md'),
    `# Beta epic — tickets

## A-1 — a colliding ID

**Scope.** Collision.
`,
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(data.duplicates, { 'A-1': ['alpha', 'beta'] })

    const fail = runFail(repo, 'find', 'A-1')
    assert.equal(fail.status, 1)
    assert.match(fail.stderr, /more than one epic/)
    assert.match(fail.stderr, /alpha, beta/)

    // Unambiguous IDs still resolve while the collision exists.
    assert.equal(JSON.parse(run(repo, 'find', 'A-2', '--json')).epic, 'alpha')
  } finally {
    rmSync(join(repo, 'epics/beta'), { recursive: true, force: true })
  }
})

test('current is null in a checkout not named for an epic', () => {
  const out = run(repo, 'current')
  assert.match(out, /not an epic folder/)
})

test('doctor flags the near-miss status heading that the board silently ignores', () => {
  const rows = JSON.parse(run(repo, 'doctor', '--json'))
  const msgs = rows.map((r) => r.msg)

  const nearMiss = rows.find((r) => r.msg.includes('status.md') && r.msg.includes('A-3'))
  assert.ok(nearMiss, `expected a warning about the malformed A-3 heading, got:\n${msgs.join('\n')}`)
  assert.equal(nearMiss.level, 'warn')
  assert.match(nearMiss.msg, /reads as not done/)

  assert.ok(rows.some((r) => r.level === 'warn' && /CLAUDE\.md or AGENTS\.md/.test(r.msg)))
  assert.ok(rows.some((r) => r.level === 'ok' && /remote origin/.test(r.msg)))
  assert.ok(!rows.some((r) => r.level === 'fail'), 'fixture repo has all hard preconditions')
})

test('doctor fails hard when there is no origin remote', () => {
  const bare = join(tmp, 'no-remote')
  git(tmp, 'init', '--initial-branch=main', bare)
  const fail = runFail(bare, 'doctor')
  assert.equal(fail.status, 1)
})
