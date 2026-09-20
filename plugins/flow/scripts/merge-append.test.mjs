// merge-append.test.mjs — the append-only merge driver, against REAL git.
//
// The pure function is three lines; what needs proving is what git does with
// it, because the driver it replaced (git's built-in `union`) was also
// "obviously right" and corrupted every merge it touched. So these tests build
// throwaway repositories, wire the driver exactly as the run driver's merge
// step does (`-c merge.flow-append.driver=…` on the command, the attribute in
// .git/info/attributes), and read the merged file. Needs `git` and nothing else.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeAppend } from './merge-append.mjs'

const DRIVER = join(dirname(fileURLToPath(import.meta.url)), 'merge-append.mjs')
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
const LOG = 'epics/e/status.md'
const BASE = '# E epic — status log\n\n## Baseline — 2026-09-19\n\nstart\n'
// Two entries that share their whole tail — the shape that broke `union`.
const entry = (id, owed = 'Nothing.') => `\n### ${id} — thing ${id} — 2026-09-19 — DONE\n\n**Built:** the ${id} thing.\n\n**Verified:** 11 passing.\n\n**Decisions:** none.\n\n**Owed:** ${owed}\n`
const addendum = id => `\n**Addendum — review — 2026-09-19 — opus/high:** ${id} clean; nothing deferred. Tokens: recorded in the run record\n`

function repo(attribute = 'flow-append', driver = DRIVER) {
  const dir = mkdtempSync(join(tmpdir(), 'flow-merge-'))
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q', '--initial-branch=epic')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  mkdirSync(join(dir, 'epics/e'), { recursive: true })
  writeFileSync(join(dir, LOG), BASE)
  git('add', '.')
  git('commit', '-qm', 'e: the plan')
  if (attribute) appendFileSync(join(dir, '.git/info/attributes'), `${LOG} merge=${attribute}\n`)
  const branch = (name, text, from = 'epic') => {
    git('checkout', '-q', '-b', name, from)
    appendFileSync(join(dir, LOG), text)
    git('commit', '-qam', `${name.toUpperCase()}: work`)
    git('checkout', '-q', 'epic')
  }
  // The merge exactly as the run driver's merge step issues it.
  const merge = name => spawnSync('git', ['-c', 'merge.flow-append.name=append-only log', '-c', `merge.flow-append.driver=node "${driver}" --driver %O %A %B`, 'merge', '--no-ff', '-q', name, '-m', `Merge ${name}`], { cwd: dir, encoding: 'utf8', env: ENV })
  return { dir, git, branch, merge, log: () => readFileSync(join(dir, LOG), 'utf8'), done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('two entries with a shared tail merge WHOLE, in merge order — the case union corrupted', () => {
  const r = repo()
  try {
    r.branch('a-1', entry('A-1', 'B-3 inherits the migration script.') + addendum('A-1'))
    r.branch('b-2', entry('B-2') + addendum('B-2'))
    assert.equal(r.merge('a-1').status, 0)
    assert.equal(r.merge('b-2').status, 0)
    assert.equal(r.log(), BASE + entry('A-1', 'B-3 inherits the migration script.') + addendum('A-1') + entry('B-2') + addendum('B-2'))
  } finally {
    r.done()
  }
})

test('the same fixture under git\'s own union driver loses lines — the reason this driver exists', () => {
  const r = repo('union')
  try {
    r.branch('a-1', entry('A-1', 'B-3 inherits the migration script.'))
    r.branch('b-2', entry('B-2'))
    r.merge('a-1')
    assert.equal(r.merge('b-2').status, 0, 'union reports a CLEAN merge')
    assert.equal((r.log().match(/\*\*Decisions:\*\* none\./g) || []).length, 1, 'two entries, one Decisions line: union emits a shared line once')
    const a1 = r.log().slice(r.log().indexOf('### A-1'), r.log().indexOf('### B-2'))
    assert.doesNotMatch(a1, /\*\*Owed:\*\*/, "A-1's obligation is no longer inside A-1's entry")
  } finally {
    r.done()
  }
})

test('a wave of three merges whole, whatever the entries share', () => {
  // (Byte-identical files on two branches never reach a driver — git resolves
  // "both sides made the same change" itself — and never happen here either:
  // an entry opens with its own ticket ID.)
  const r = repo()
  try {
    const ids = ['A-1', 'B-2', 'C-3']
    for (const id of ids) r.branch(id.toLowerCase(), entry(id))
    for (const id of ids) assert.equal(r.merge(id.toLowerCase()).status, 0, id)
    assert.equal(r.log(), BASE + ids.map(id => entry(id)).join(''))
    assert.equal((r.log().match(/\*\*Owed:\*\* Nothing\./g) || []).length, 3)
  } finally {
    r.done()
  }
})

test('a side that edited the log instead of appending is a real conflict, and the merge fails', () => {
  const r = repo()
  try {
    r.branch('a-1', entry('A-1'))
    r.git('checkout', '-q', '-b', 'b-2', 'epic')
    writeFileSync(join(r.dir, LOG), BASE.replace('start', 'rewritten') + entry('B-2'))
    r.git('commit', '-qam', 'B-2: rewrote the baseline')
    r.git('checkout', '-q', 'epic')
    r.merge('a-1')
    const m = r.merge('b-2')
    assert.notEqual(m.status, 0)
    assert.match(m.stdout + m.stderr, /one side did more than append|CONFLICT|conflict/i)
  } finally {
    r.done()
  }
})

test('reached through a SYMLINKED path the driver still runs — a driver that exits 0 having done nothing drops the whole entry from a clean merge', () => {
  // The first cut asked "am I the program being run?" by comparing
  // import.meta.url (realpath-resolved) with process.argv[1] (as given); under
  // a symlinked plugin path they differ, the body never ran, git kept ours, and
  // B-2's entry was gone. `--driver` cannot be wrong about a path.
  const link = join(mkdtempSync(join(tmpdir(), 'flow-link-')), 'scripts')
  symlinkSync(dirname(DRIVER), link)
  const r = repo('flow-append', join(link, 'merge-append.mjs'))
  try {
    r.branch('a-1', entry('A-1'))
    r.branch('b-2', entry('B-2'))
    assert.equal(r.merge('a-1').status, 0)
    assert.equal(r.merge('b-2').status, 0)
    assert.equal(r.log(), BASE + entry('A-1') + entry('B-2'))
  } finally {
    r.done()
  }
})

test('it fails CLOSED: told to act and handed anything but three readable files, it exits nonzero and git records a conflict', () => {
  assert.equal(spawnSync('node', [DRIVER, '--driver'], { encoding: 'utf8' }).status, 2)
  assert.notEqual(spawnSync('node', [DRIVER, '--driver', '/nonexistent/o', '/nonexistent/a', '/nonexistent/b'], { encoding: 'utf8' }).status, 0)
  // Without the flag it is a module and does nothing — which is why the flag,
  // and not the file's path, is what the merge command relies on.
  assert.equal(spawnSync('node', [DRIVER, 'x', 'y', 'z'], { encoding: 'utf8' }).status, 0)
})

test('without the -c driver the attribute is inert: git falls back to its ordinary merge, which conflicts the ordinary way on the second branch', () => {
  const r = repo()
  try {
    r.branch('a-1', entry('A-1'))
    r.branch('b-2', entry('B-2'))
    const plain = name => spawnSync('git', ['merge', '--no-ff', '-q', name, '-m', 'm'], { cwd: r.dir, encoding: 'utf8', env: ENV })
    assert.equal(plain('a-1').status, 0)
    const second = plain('b-2')
    assert.notEqual(second.status, 0, 'no silent merge: the fallback is a visible conflict')
    assert.match(second.stdout + second.stderr, /CONFLICT/)
  } finally {
    r.done()
  }
})

test('mergeAppend: a missing final newline on ours does not glue two entries together', () => {
  assert.equal(mergeAppend('a\n', 'a\nours', 'a\ntheirs\n'), 'a\nours\ntheirs\n')
  assert.equal(mergeAppend('a\n', 'a\nours\n', 'a\n\ntheirs\n'), 'a\nours\n\ntheirs\n')
  assert.equal(mergeAppend('a\n', 'b\n', 'a\nx\n'), null)
})

// The two shell sequences a wave relies on are cut out of run-epic.mjs, not
// retyped, and run by a real shell against a real repository — on CI under GNU
// tools, locally under BSD's.
const RUN_EPIC = readFileSync(join(dirname(DRIVER), '..', 'workflows', 'run-epic.mjs'), 'utf8')
const instantiate = text => text.replaceAll('${id}', 'PAY-2').replaceAll('${epicBranch}', 'epic/payments').replaceAll('${epic}', 'payments').replaceAll('\\`', '`').replaceAll('\\$', '$')
function workRepo() {
  const root = mkdtempSync(join(tmpdir(), 'flow-wave-'))
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] })
  git(root, 'init', '-q', '--bare', 'origin.git')
  git(root, 'clone', '-q', 'origin.git', 'work')
  const work = join(root, 'work')
  git(work, 'config', 'user.email', 'test@example.com')
  git(work, 'config', 'user.name', 'Test')
  git(work, 'checkout', '-q', '-b', 'epic/payments')
  mkdirSync(join(work, 'epics/payments'), { recursive: true })
  writeFileSync(join(work, 'epics/payments/status.md'), '# log\n')
  git(work, 'add', '.')
  git(work, 'commit', '-qm', 'payments: the plan')
  git(work, 'push', '-q', '-u', 'origin', 'epic/payments')
  return { root, work, git: (...a) => git(work, ...a), done: () => rmSync(root, { recursive: true, force: true }) }
}

test("the wave's merge guard, as emitted: a present entry passes; an absent one takes the merge back to where the branch STOOD — a local commit survives", () => {
  // It must read a heading as loosely as the board does, tell PAY-2 from
  // PAY-20, and undo the merge with ORIG_HEAD — not `origin/<epic>`: `pull
  // --ff-only` succeeds when local is ahead, so a commit a human made on the
  // epic branch mid-run is on local and not on origin, and a reset to origin
  // would destroy it together with the merge.
  const cut = RUN_EPIC.match(/\\ngrep -qE ([^`]*?exit 1; \})`/)
  assert.ok(cut, 'the guard line is where this test expects it in run-epic.mjs')
  const guard = instantiate(`grep -qE ${cut[1]}`)
  assert.match(guard, /git reset --hard ORIG_HEAD/)
  const r = workRepo()
  try {
    writeFileSync(join(r.work, 'NOTES.md'), 'a human committed this on the epic branch while the run was going\n')
    r.git('add', '.')
    r.git('commit', '-qm', 'payments: a local commit origin has not seen')
    const local = r.git('rev-parse', 'HEAD').trim()
    const after = heading => {
      r.git('checkout', '-q', '-b', 'pay-2', 'epic/payments')
      appendFileSync(join(r.work, 'epics/payments/status.md'), `${heading}\n`)
      r.git('commit', '-qam', 'PAY-2: work')
      r.git('checkout', '-q', 'epic/payments')
      r.git('merge', '-q', '--no-ff', 'pay-2', '-m', 'Merge pay-2') // a real merge: this is what sets ORIG_HEAD
      const run = spawnSync('sh', ['-c', guard], { cwd: r.work, encoding: 'utf8', env: ENV })
      const result = [run.status, r.git('rev-parse', 'HEAD').trim() === local ? 'merge undone, local commit kept' : 'merge in place']
      r.git('reset', '-q', '--hard', local)
      r.git('branch', '-q', '-D', 'pay-2')
      return result
    }
    assert.deepEqual(after('### PAY-2 — thing — 2026-09-20 — DONE'), [0, 'merge in place'])
    assert.deepEqual(after('###  PAY-2— thing — 2026-09-20 — DONE'), [0, 'merge in place'], 'as loosely as STATUS_HEADING reads it')
    assert.deepEqual(after('### PAY-20 — other — 2026-09-20 — DONE'), [1, 'merge undone, local commit kept'], 'PAY-20 is not PAY-2')
    assert.deepEqual(after('no heading at all'), [1, 'merge undone, local commit kept'])
  } finally {
    r.done()
  }
})

test("the wave's setup step, as emitted: it ends on the driver git will actually USE — a later rule that outranks our line is outranked back", () => {
  // In a gitattributes file the LAST matching line wins. The first cut grepped
  // the file for our line and skipped the append when it was there — so with
  // `epics/** merge=union` below it, git would merge the log with the very
  // driver this one replaced, and the heading guard would pass.
  const cut = RUN_EPIC.match(/async function waveSetup\(\) \{[\s\S]*?\\`\\`\\`bash\n([\s\S]*?)\\`\\`\\`/)
  assert.ok(cut, 'the setup sequence is where this test expects it in run-epic.mjs')
  const setup = instantiate(cut[1])
  const r = workRepo()
  try {
    const attr = () => r.git('check-attr', 'merge', '--', 'epics/payments/status.md').trim()
    const run = () => spawnSync('sh', ['-ec', setup], { cwd: r.work, encoding: 'utf8', env: ENV })
    assert.equal(run().status, 0)
    assert.match(attr(), /merge: flow-append$/)
    const lines = () => readFileSync(join(r.work, '.git/info/attributes'), 'utf8').trim().split('\n').length
    const once = lines()
    assert.equal(run().status, 0)
    assert.equal(lines(), once, 'idempotent: git already answers flow-append, so nothing is appended')
    appendFileSync(join(r.work, '.git/info/attributes'), 'epics/** merge=union\n')
    assert.match(attr(), /merge: union$/, 'the fixture really does outrank our line')
    assert.equal(run().status, 0)
    assert.match(attr(), /merge: flow-append$/)
  } finally {
    r.done()
  }
})
