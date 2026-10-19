#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CONFIG = '.flow.json'
export const SETUP_KEYS = ['copy', 'setup']
export const OTHER_KEYS = ['screenshots', 'screenshotsDir', 'qa']
export const BUDGET_MS = 8 * 60 * 1000
export const WORKTREES_FOLDER = '.flow-worktrees'

export class ConfigError extends Error {}

const USAGE = `usage: worktree-setup.mjs --validate <file | -> [--repo <main checkout>]
  checks a .flow.json; flow worktree and flow check-epic do the setup itself`

export function validateConfig(config, label = CONFIG) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new ConfigError(`${label}: must be a JSON object`)
  const known = [...SETUP_KEYS, ...OTHER_KEYS]
  const unknown = Object.keys(config).filter((key) => !known.includes(key))
  if (unknown.length)
    throw new ConfigError(`${label}: unknown key${unknown.length === 1 ? '' : 's'} ${unknown.map((key) => `"${key}"`).join(', ')} — the keys are ${known.map((key) => `"${key}"`).join(', ')}`)
  const copy = config.copy ?? []
  const setup = config.setup ?? []
  if (!Array.isArray(copy)) throw new ConfigError(`${label}: "copy" must be an array of paths`)
  if (!Array.isArray(setup)) throw new ConfigError(`${label}: "setup" must be an array of shell commands`)
  copy.forEach((path, index) => {
    const at = `${label}: copy[${index}]`
    if (typeof path !== 'string' || !path.trim()) throw new ConfigError(`${at} is not a path`)
    const normalized = normalize(path)
    if (isAbsolute(path) || normalized === '..' || normalized.startsWith(`..${sep}`) || normalized === '.')
      throw new ConfigError(`${at} ("${path}") must be a path inside the repository, relative to its root`)
    if (normalized.split(sep)[0].toLowerCase() === '.git') throw new ConfigError(`${at} ("${path}") is inside .git — nothing there is a file a worktree needs copied`)
  })
  setup.forEach((command, index) => {
    if (typeof command !== 'string' || !command.trim()) throw new ConfigError(`${label}: setup[${index}] is not a command`)
  })
  return { copy: copy.map((path) => normalize(path)), setup }
}

const inside = (root, path) => {
  const realRoot = realpathSync(root)
  const realPath = realpathSync(path)
  return realPath === realRoot || realPath.startsWith(realRoot + sep)
}

const ignoreState = (worktree, relative, timeout) => {
  const status = spawnSync('git', ['-C', worktree, 'check-ignore', '-q', '--', relative], { encoding: 'utf8', timeout }).status
  return status === 0 ? 'ignored' : status === 1 ? 'exposed' : 'unknown'
}
const ignoredIn = (worktree, relative, timeout) => ignoreState(worktree, relative, timeout) === 'ignored'

const tail = (text, count = 20) => String(text || '').trimEnd().split('\n').slice(-count).join('\n')

export function readWorktreeConfig(worktree) {
  const file = join(worktree, CONFIG)
  if (!existsSync(file)) return null
  if (lstatSync(file).isSymbolicLink()) throw new ConfigError(`${CONFIG} is a symbolic link — the setup runs only what is committed on the branch`)
  let config
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new ConfigError(`${CONFIG}: not valid JSON (${error.message})`)
  }
  return validateConfig(config)
}

export function apply(options) {
  const started = Date.now()
  const budgetMs = options.budgetMs ?? BUDGET_MS
  const result = applySteps({ ...options, budgetMs, started })
  return { ...result, budgetMs, elapsedMs: Date.now() - started }
}

function applySteps({ repo, worktree, log = () => {}, budgetMs, started }) {
  const deadline = started + budgetMs
  const config = readWorktreeConfig(worktree)
  if (!config || (!config.copy.length && !config.setup.length)) return { configured: false, copied: [], ran: [], failure: null }
  const { copy, setup } = config
  const copied = []
  const ran = []

  const sweep = () => {
    const removed = []
    const unknown = new Set()
    for (let changed = true; changed; ) {
      changed = false
      for (const relative of copied.filter((path) => !removed.includes(path))) {
        const state = ignoreState(worktree, relative)
        if (state === 'unknown') unknown.add(relative)
        if (state !== 'exposed') continue
        const target = join(worktree, relative)
        try {
          if (inside(worktree, dirname(target)) && lstatSync(target).isFile()) rmSync(target)
        } catch {}
        removed.push(relative)
        changed = true
      }
    }
    return { removed, unknown: [...unknown].filter((path) => !removed.includes(path)) }
  }
  const sweptNote = ({ removed, unknown }) =>
    (removed.length ? `\nRemoved from the worktree, because git no longer ignores ${removed.length === 1 ? 'it' : 'them'} there: ${removed.join(', ')}.` : '') +
    (unknown.length ? `\nNOT CHECKED — git could not say whether it ignores ${unknown.join(', ')} (a path moved, or behind a link); look before running \`git add\` in ${worktree}.` : '')
  const fail = (step, detail) => ({ configured: true, copied, ran, failure: { step, detail: detail + sweptNote(sweep()) } })
  const recheck = (when) => {
    const swept = sweep()
    if (!swept.removed.length && !swept.unknown.length) return null
    return {
      configured: true,
      copied,
      ran,
      failure: {
        step: `copy (re-checked ${when})`,
        detail: `something ${when === 'after the copies' ? 'copied later' : 'a setup command did'} changed what git ignores in the worktree; fix ${CONFIG}.${sweptNote(swept)}`,
      },
    }
  }

  for (const relative of copy) {
    const from = join(repo, relative)
    const to = join(worktree, relative)
    const left = deadline - Date.now()
    if (left <= 0) return fail(`copy ${relative}`, `never started: the setup's ${budgetMs / 1000}-second budget was spent before it.`)
    if (!existsSync(from) || !statSync(from).isFile())
      return fail(`copy ${relative}`, `${from} is not a file in the main checkout. ${CONFIG} lists what every worktree needs; a file that is optional on this machine does not belong in it.`)
    const real = realpathSync(from).slice(realpathSync(repo).length + 1)
    if (lstatSync(from).isSymbolicLink() || !inside(repo, from) || real.split(sep)[0].toLowerCase() === '.git')
      return fail(`copy ${relative}`, `${from} is a symbolic link, or is reached through one that leaves the checkout — it would be read from wherever it points. List the real file.`)
    if (!ignoredIn(worktree, relative, left))
      return fail(
        `copy ${relative}`,
        `git does not ignore ${relative} in the worktree, so a copy of it would be one \`git add -A\` from a commit on the ticket's branch. Add it to .gitignore, or take it out of ${CONFIG}.`,
      )
    try {
      mkdirSync(dirname(to), { recursive: true })
      if (!inside(worktree, dirname(to))) return fail(`copy ${relative}`, `${dirname(to)} resolves outside the worktree (a symbolic link on the way) — nothing is written through it.`)
      if (lstatSync(to, { throwIfNoEntry: false })?.isSymbolicLink()) return fail(`copy ${relative}`, `${to} is a symbolic link in the worktree — the copy would be written to its target. Remove it.`)
      copyFileSync(from, to)
    } catch (error) {
      return fail(`copy ${relative}`, `${error.code || 'error'}: ${error.message}`)
    }
    copied.push(relative)
    log(`copied ${relative}`)
  }
  if (copy.length && Date.now() > deadline) return fail('copy', `the copies outran the setup's ${budgetMs / 1000}-second budget.`)
  const afterCopies = recheck('after the copies')
  if (afterCopies) return afterCopies

  for (const command of setup) {
    const left = deadline - Date.now()
    const budget = `${budgetMs / 1000}-second budget`
    const why = 'it exists because the step that sets a worktree up is one shell call, killed at ten minutes with its answer lost'
    const fix = 'Make the setup faster (an offline or cached install), or set Parallel: 1 on this epic.'
    if (left <= 0) return fail(`setup: ${command}`, `never started: the setup's ${budget} was spent by the commands before it — ${why}. ${fix}`)
    log(`$ ${command}`)
    const run = spawnSync('sh', ['-c', command], { cwd: worktree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: left, killSignal: 'SIGKILL' })
    if (run.error && run.error.code === 'ETIMEDOUT')
      return fail(
        `setup: ${command}`,
        `the setup's ${budget} ran out — ${why}. Processes the command started may still be running in ${worktree}; check before removing it. ${fix}\n${tail(`${run.stdout || ''}\n${run.stderr || ''}`)}`,
      )
    if (run.status !== 0)
      return fail(`setup: ${command}`, `exited ${run.status === null ? `on signal ${run.signal}` : run.status}${run.error ? ` (${run.error.message})` : ''}\n${tail(`${run.stdout || ''}\n${run.stderr || ''}`)}`)
    ran.push(command)
  }
  const afterSetup = setup.length ? recheck('after setup') : null
  if (afterSetup) return afterSetup
  return { configured: true, copied, ran, failure: null }
}

export function worktreePath(repo, name) {
  return join(dirname(repo), WORKTREES_FOLDER, basename(repo), name)
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  return { ok: result.status === 0, stderr: (result.stderr || '').trim(), stdout: (result.stdout || '').trim() }
}

export function removeWorktree(repo, path) {
  runGit(repo, ['worktree', 'remove', '--force', path])
  rmSync(path, { recursive: true, force: true })
  runGit(repo, ['worktree', 'prune'])
}

export function createWorktree(repo, { path, ref }) {
  if (existsSync(path)) removeWorktree(repo, path)
  mkdirSync(dirname(path), { recursive: true })
  const added = runGit(repo, ['worktree', 'add', '--quiet', '--detach', path, ref])
  if (!added.ok) return { ok: false, reason: `git worktree add failed: ${added.stderr}` }
  return { ok: true, path }
}

function validate(source, repo) {
  let text
  try {
    text = readFileSync(source === '-' ? 0 : source, 'utf8')
  } catch (error) {
    throw new ConfigError(`--validate: cannot read ${source} (${error.code || error.message})`)
  }
  let config
  try {
    config = JSON.parse(text)
  } catch (error) {
    throw new ConfigError(`${CONFIG}: not valid JSON (${error.message})`)
  }
  const { copy, setup } = validateConfig(config)
  if (repo) {
    const problems = []
    for (const relative of copy) {
      const from = join(repo, relative)
      if (!existsSync(from) || !statSync(from).isFile()) problems.push(`copy "${relative}": ${from} is not a file in this checkout`)
      else if (spawnSync('git', ['-C', repo, 'check-ignore', '-q', '--', relative]).status !== 0)
        problems.push(`copy "${relative}": git does not ignore it, and a file git does not ignore is never copied`)
    }
    if (problems.length) return { stdout: `${CONFIG} reads, and its setup would fail here:\n${problems.map((problem) => `  ${problem}`).join('\n')}`, code: 1 }
  }
  return { stdout: `${CONFIG} reads: ${copy.length} file${copy.length === 1 ? '' : 's'} to copy, ${setup.length} setup command${setup.length === 1 ? '' : 's'}`, code: 0 }
}

export function run(argv) {
  if (argv[0] !== '--validate' || (argv.length !== 2 && !(argv.length === 4 && argv[2] === '--repo'))) throw new ConfigError(USAGE)
  return validate(argv[1], argv.length === 4 ? resolve(argv[3]) : null)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { stdout, code } = run(process.argv.slice(2))
    console.log(stdout)
    process.exitCode = code
  } catch (error) {
    console.error(`worktree-setup: ${error instanceof ConfigError ? error.message : error.stack}`)
    process.exitCode = 2
  }
}
