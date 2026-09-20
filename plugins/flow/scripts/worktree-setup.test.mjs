// worktree-setup.test.mjs — REAL git, real worktrees, in throwaway directories.
// The refusal that matters here asks git a question (`check-ignore`, in a
// linked worktree, where `.git` is a file), and an assumption about git's
// answer is tested against git — the merge driver's suite says why.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'worktree-setup.mjs')
const base = realpathSync(mkdtempSync(join(tmpdir(), 'flow-worktree-setup-')))
after(() => rmSync(base, { recursive: true, force: true }))

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout
}
const cli = (...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  return { out: r.stdout, err: r.stderr, code: r.status }
}

// A main checkout with `config` committed, local untracked `files`, and a
// linked worktree cut from the commit — the shape the run's worktree step makes.
function project(name, { config, gitignore = '.env\nnode_modules/\n', files = { '.env': 'SECRET=1\n' } } = {}) {
  const repo = join(base, name, 'repo')
  const worktree = join(base, name, 'wt')
  mkdirSync(join(repo, 'epics'), { recursive: true })
  git(repo, 'init', '-q', '--initial-branch=main')
  writeFileSync(join(repo, '.gitignore'), gitignore)
  writeFileSync(join(repo, 'README.md'), 'x\n')
  if (config !== undefined) writeFileSync(join(repo, 'epics/worktree.json'), typeof config === 'string' ? config : JSON.stringify(config))
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'init')
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true })
    writeFileSync(join(repo, rel), text)
  }
  git(repo, 'worktree', 'add', '-q', '--detach', worktree, 'HEAD')
  return { repo, worktree, args: ['--repo', repo, '--worktree', worktree] }
}

test('copies the listed files and runs the setup commands in the worktree, in order', () => {
  const p = project('happy', {
    config: { copy: ['.env', 'apps/web/.env.local'], setup: ['echo one > node_modules.marker', 'test -f node_modules.marker && echo two >> node_modules.marker'] },
    gitignore: '.env\n.env.local\nnode_modules.marker\n',
    files: { '.env': 'SECRET=1\n', 'apps/web/.env.local': 'WEB=1\n' },
  })
  const r = cli(...p.args)
  assert.equal(r.code, 0, r.err + r.out)
  assert.equal(readFileSync(join(p.worktree, '.env'), 'utf8'), 'SECRET=1\n')
  assert.equal(readFileSync(join(p.worktree, 'apps/web/.env.local'), 'utf8'), 'WEB=1\n', 'parent directories are made')
  assert.equal(readFileSync(join(p.worktree, 'node_modules.marker'), 'utf8'), 'one\ntwo\n')
  assert.ok(!existsSync(join(p.repo, 'node_modules.marker')), 'commands run in the worktree, never the main checkout')
  assert.match(r.out, /2 files copied, 2 commands run/)
  assert.equal(git(p.worktree, 'status', '--porcelain'), '', 'nothing the setup left is one `git add -A` from a commit')
})

test('a project that declares nothing gets the worktree it always got', () => {
  const p = project('absent')
  const r = cli(...p.args)
  assert.equal(r.code, 0)
  assert.match(r.out, /no epics\/worktree\.json on this branch/)
  assert.ok(!existsSync(join(p.worktree, '.env')))
  assert.equal(JSON.parse(cli(...p.args, '--json').out).configured, false)
})

test('the config is read as committed on the branch, never from the main checkout\'s working tree', () => {
  const p = project('committed', { config: { setup: ['echo committed > marker'] }, gitignore: 'marker\n.env\n' })
  writeFileSync(join(p.repo, 'epics/worktree.json'), JSON.stringify({ setup: ['echo uncommitted > marker'] }))
  assert.equal(cli(...p.args).code, 0)
  assert.equal(readFileSync(join(p.worktree, 'marker'), 'utf8'), 'committed\n')
})

test('a file git does not ignore is never copied', () => {
  const p = project('unignored', { config: { copy: ['.env'] }, gitignore: 'node_modules/\n' })
  const r = cli(...p.args)
  assert.equal(r.code, 1)
  assert.match(r.out, /git does not ignore \.env in the worktree/)
  assert.ok(!existsSync(join(p.worktree, '.env')), 'refused before the copy, not after')
  // a tracked file is the same refusal: check-ignore does not call it ignored
  const t = project('tracked', { config: { copy: ['README.md'] } })
  assert.equal(cli(...t.args).code, 1)
})

test('what git calls ignored is asked of real git: a negated pattern and a tracked file under a pattern are both refused', () => {
  const neg = project('negated', { config: { copy: ['keep.env'] }, gitignore: '*.env\n!keep.env\n', files: { 'keep.env': 'K=1\n' } })
  assert.equal(cli(...neg.args).code, 1)
  assert.ok(!existsSync(join(neg.worktree, 'keep.env')))
  // tracked, and matching a pattern: check-ignore does not report tracked paths, so the committed copy is never overwritten
  const repo = join(base, 'tracked-pattern', 'repo')
  const worktree = join(base, 'tracked-pattern', 'wt')
  mkdirSync(join(repo, 'epics'), { recursive: true })
  git(repo, 'init', '-q', '--initial-branch=main')
  writeFileSync(join(repo, 'sample.env'), 'COMMITTED=1\n')
  writeFileSync(join(repo, 'epics/worktree.json'), JSON.stringify({ copy: ['sample.env'] }))
  git(repo, 'add', '-A')
  writeFileSync(join(repo, '.gitignore'), '*.env\n')
  git(repo, 'add', '.gitignore')
  git(repo, 'commit', '-q', '-m', 'init')
  writeFileSync(join(repo, 'sample.env'), 'LOCAL-SECRET=1\n')
  git(repo, 'worktree', 'add', '-q', '--detach', worktree, 'HEAD')
  assert.equal(cli('--repo', repo, '--worktree', worktree).code, 1)
  assert.equal(readFileSync(join(worktree, 'sample.env'), 'utf8'), 'COMMITTED=1\n')
})

test('a copy that names a directory, or that the filesystem refuses, fails with a FAILED line and exit 1 — never a stack', () => {
  const dir = project('directory', { config: { copy: ['secrets'] }, gitignore: 'secrets/\nblocked.env\n', files: { 'secrets/a': 'x' } })
  const d = cli(...dir.args)
  assert.equal(d.code, 1)
  assert.match(d.out, /FAILED at copy secrets/)
  const fs = project('fs-error', { config: { copy: ['blocked.env'] }, gitignore: 'blocked.env\n', files: { 'blocked.env': 'x' } })
  mkdirSync(join(fs.worktree, 'blocked.env')) // the destination is an (ignored) directory
  const r = cli(...fs.args)
  assert.equal(r.code, 1, r.err)
  assert.match(r.out, /FAILED at copy blocked\.env\n\w+: /)
  assert.equal(r.err, '')
})

test('the setup has a budget that ends before the shell call around it does, and says so', () => {
  const p = project('slow', { config: { setup: ['echo started', 'sleep 5', 'echo never > marker'] }, gitignore: 'marker\n.env\n' })
  const r = cli(...p.args, '--budget-ms', '400')
  assert.equal(r.code, 1)
  assert.match(r.out, /FAILED at setup: sleep 5\nthe setup's 0-second budget ran out — it exists because the run's worktree step is one shell call/)
  assert.ok(!existsSync(join(p.worktree, 'marker')))
  assert.equal(cli(...p.args, '--budget-ms', 'soon').code, 2)
})

test('a listed file the main checkout does not have fails by name, and nothing after it runs', () => {
  const p = project('missing', { config: { copy: ['.env'], setup: ['echo ran > marker'] }, files: {} })
  const r = cli(...p.args)
  assert.equal(r.code, 1)
  assert.match(r.out, /FAILED at copy \.env/)
  assert.ok(!existsSync(join(p.worktree, 'marker')))
})

test('a failing command stops the setup, exits 1 and shows the tail of its output', () => {
  const p = project('failing', { config: { setup: ['echo before', 'echo the reason >&2; exit 7', 'echo after > marker'] } })
  const r = cli(...p.args)
  assert.equal(r.code, 1)
  assert.match(r.out, /FAILED at setup: echo the reason >&2; exit 7\nexited 7\n[\s\S]*the reason/)
  assert.ok(!existsSync(join(p.worktree, 'marker')), 'never partial success under a later command')
  const j = JSON.parse(cli(...p.args, '--json').out)
  assert.deepEqual(j.ran, ['echo before'])
  assert.equal(j.failure.step, 'setup: echo the reason >&2; exit 7')
})

test('a config it cannot read as the documented shape is exit 2, by entry', () => {
  for (const [config, re] of [
    ['{ not json', /not valid JSON/],
    [[], /must be a JSON object/],
    [{ comands: ['npm ci'] }, /unknown key "comands"/],
    [{ copy: '.env' }, /"copy" must be an array/],
    [{ copy: ['../outside/.env'] }, /copy\[0\] \("\.\.\/outside\/\.env"\) must be a path inside the repository/],
    [{ copy: ['/etc/passwd'] }, /must be a path inside the repository/],
    [{ copy: ['a/../../b'] }, /must be a path inside the repository/],
    [{ copy: ['.git/hooks/pre-commit.env'] }, /is inside \.git/],
    [{ setup: [''] }, /setup\[0\] is not a command/],
  ]) {
    const p = project(`bad-${Math.random().toString(36).slice(2)}`, { config })
    const r = cli(...p.args)
    assert.equal(r.code, 2, JSON.stringify(config))
    assert.match(r.err, re)
  }
})

test('--validate reads a file or stdin, and copies and runs nothing', () => {
  const good = join(base, 'good.json')
  writeFileSync(good, JSON.stringify({ copy: ['.env'], setup: ['npm ci', 'exit 1'] }))
  const r = cli('--validate', good)
  assert.equal(r.code, 0)
  assert.match(r.out, /1 file to copy, 2 setup commands/)
  const piped = spawnSync(process.execPath, [SCRIPT, '--validate', '-'], { input: '{"comands":[]}', encoding: 'utf8' })
  assert.equal(piped.status, 2)
  assert.match(piped.stderr, /unknown key "comands"/)
  assert.equal(cli('--validate', join(base, 'nowhere.json')).code, 2)
  // with --repo: the two failures shape cannot see, asked of the main checkout
  const p = project('validate-repo', { config: { copy: ['.env', 'gone.env', 'README.md'] }, gitignore: '*.env\n' })
  const v = cli('--validate', join(p.repo, 'epics/worktree.json'), '--repo', p.repo)
  assert.equal(v.code, 1)
  assert.match(v.out, /copy "gone\.env": .* is not a file in this checkout/)
  assert.match(v.out, /copy "README\.md": git does not ignore it/)
  assert.doesNotMatch(v.out, /copy "\.env"/)
  assert.ok(!existsSync(join(p.worktree, '.env')), 'it copies nothing')
})

test('usage errors: missing flags, a path that is no directory, and the main checkout given as the worktree', () => {
  const p = project('usage')
  assert.equal(cli().code, 2)
  assert.equal(cli('--repo', p.repo).code, 2)
  assert.equal(cli('--repo', p.repo, '--worktree', join(base, 'nowhere')).code, 2)
  const same = cli('--repo', p.repo, '--worktree', p.repo)
  assert.equal(same.code, 2)
  assert.match(same.err, /never the main checkout/)
})
