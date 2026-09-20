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

test("the wave's merge guard, exactly as the driver emits it, under THIS system's grep: a present entry passes, an absent one undoes the merge", () => {
  // The line is cut out of run-epic.mjs, not retyped, and run by a real shell
  // against a real repository — on CI that is GNU grep, locally BSD's. It must
  // read a heading as loosely as the board does, tell PAY-2 from PAY-20, and,
  // when the entry is missing, leave the epic branch LEVEL with origin: a bad
  // merge left on the local branch is pushed by the next run's refresh.
  const source = readFileSync(join(dirname(DRIVER), '..', 'workflows', 'run-epic.mjs'), 'utf8')
  const cut = source.match(/\\ngrep -qE ([^`]*?exit 1; \})`/)
  assert.ok(cut, 'the guard line is where this test expects it in run-epic.mjs')
  const guard = `grep -qE ${cut[1]}`.replaceAll('${id}', 'PAY-2').replaceAll('${epicBranch}', 'epic/payments').replaceAll('${epic}', 'payments')
  const root = mkdtempSync(join(tmpdir(), 'flow-guard-'))
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
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
    const ahead = () => Number(git(work, 'rev-list', '--count', 'origin/epic/payments..HEAD').trim())
    const after = heading => {
      appendFileSync(join(work, 'epics/payments/status.md'), `${heading}\n`)
      git(work, 'commit', '-qam', 'a merge, stood in for')
      const r = spawnSync('sh', ['-c', guard], { cwd: work, encoding: 'utf8', env: ENV })
      const result = [r.status, ahead()]
      git(work, 'reset', '-q', '--hard', 'origin/epic/payments')
      return result
    }
    assert.deepEqual(after('### PAY-2 — thing — 2026-09-20 — DONE'), [0, 1], 'present: the merge stays, for the push')
    assert.deepEqual(after('###  PAY-2— thing — 2026-09-20 — DONE'), [0, 1], 'as loosely as STATUS_HEADING reads it')
    assert.deepEqual(after('### PAY-20 — other — 2026-09-20 — DONE'), [1, 0], 'PAY-20 is not PAY-2 — and the merge is undone')
    assert.deepEqual(after('no heading at all'), [1, 0])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
