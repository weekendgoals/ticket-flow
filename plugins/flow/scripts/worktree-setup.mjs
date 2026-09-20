#!/usr/bin/env node
// worktree-setup.mjs — make a fresh git worktree able to verify anything.
//
// A parallel run gives every ticket a worktree of its own, and a fresh
// worktree has only what git tracks: no installed dependencies, no build
// output, no local `.env`. The worker was told to install what the project's
// instructions say, which is a guess made once per ticket by the party whose
// verification depends on it. This script replaces the guess with the
// project's own word:
//
//   epics/worktree.json
//   { "copy":  [".env", "apps/web/.env.local"],
//     "setup": ["npm ci", "npm run build:types"] }
//
// `copy` names files, relative to the repository root, copied from the main
// checkout into the worktree at the same path. `setup` names shell commands run
// in the worktree's root, in order, each through `sh -c`. Both are optional.
//
// The file is read from the WORKTREE — that is, as committed on the epic
// branch the worktree was cut from — never from the main checkout's working
// tree, so what runs is what was pushed and a reviewer can read it.
//
// A file git does not ignore is never copied. The files worth copying are
// secrets, and an untracked, un-ignored `.env` in a worktree is one `git add
// -A` from a commit on the ticket's branch — so the refusal is here, at the
// door the copy walks through, and not a sentence in a worker's prompt.
//
// Exit: 0 when everything listed was applied, or when there is no
// `epics/worktree.json` at all (a project that declares nothing gets the
// worktree it always got); 1 when a copy or a command failed, or the setup's
// eight-minute budget ran out; 2 on a usage
// error or a file this script cannot read as the shape above. Never partial
// success under exit 0: a worktree half set up is a worker verifying against
// something nobody chose.
//
// Zero dependencies, no configuration beyond that file, stores nothing.

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CONFIG = 'epics/worktree.json'

class UsageError extends Error {}

const USAGE = `usage:
  worktree-setup.mjs --repo <main checkout> --worktree <worktree root> [--json]
  worktree-setup.mjs --validate <file | -> [--repo <main checkout>]`

// Refused by entry, for the reason the design map is: "malformed config" over
// a ten-line file tells the reader to re-read what the script just read.
export function validateConfig(config, label = CONFIG) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new UsageError(`${label}: must be a JSON object with "copy" and/or "setup"`)
  const unknown = Object.keys(config).filter((k) => k !== 'copy' && k !== 'setup')
  // An unknown key is refused rather than ignored: `"comands"` ignored is a
  // worktree with nothing installed and exit 0.
  if (unknown.length) throw new UsageError(`${label}: unknown key${unknown.length === 1 ? '' : 's'} ${unknown.map((k) => `"${k}"`).join(', ')} — the keys are "copy" and "setup"`)
  const copy = config.copy ?? []
  const setup = config.setup ?? []
  if (!Array.isArray(copy)) throw new UsageError(`${label}: "copy" must be an array of paths`)
  if (!Array.isArray(setup)) throw new UsageError(`${label}: "setup" must be an array of shell commands`)
  copy.forEach((p, i) => {
    const at = `${label}: copy[${i}]`
    if (typeof p !== 'string' || !p.trim()) throw new UsageError(`${at} is not a path`)
    const n = normalize(p)
    // Inside the repository, on both sides: `..` out of the main checkout reads
    // somebody's home directory, and out of the worktree writes beside it.
    if (isAbsolute(p) || n === '..' || n.startsWith(`..${sep}`) || n === '.') throw new UsageError(`${at} ("${p}") must be a path inside the repository, relative to its root`)
    // git applies ignore patterns inside `.git/` too, so `*.env` would wave
    // `.git/hooks/x.env` through the check below. In a linked worktree `.git`
    // is a file and the copy merely crashes; pointed at an ordinary clone it
    // would write a hook. Refused by shape, not by luck.
    if (n.split(sep)[0] === '.git') throw new UsageError(`${at} ("${p}") is inside .git — nothing there is a file a worktree needs copied`)
  })
  setup.forEach((c, i) => {
    if (typeof c !== 'string' || !c.trim()) throw new UsageError(`${label}: setup[${i}] is not a command`)
  })
  return { copy: copy.map((p) => normalize(p)), setup }
}

const tail = (text, n = 20) => String(text || '').trimEnd().split('\n').slice(-n).join('\n')

// The whole setup has one clock, and it ends before the caller's does: the
// run's worktree step is ONE shell call by a proxy whose tool kills a command
// at ten minutes and loses its answer — so a slow install would halt the
// ticket with no words at all, and re-running by hand (no ceiling there) would
// then succeed and show the human nothing to repair. Eight minutes, said in
// the failure, is a halt that names its cause.
export const BUDGET_MS = 8 * 60 * 1000

export function apply({ repo, worktree, log = () => {}, budgetMs = BUDGET_MS }) {
  const deadline = Date.now() + budgetMs
  const file = join(worktree, CONFIG)
  if (!existsSync(file)) return { configured: false, copied: [], ran: [], failure: null }
  let config
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new UsageError(`${CONFIG}: not valid JSON (${e.message})`)
  }
  const { copy, setup } = validateConfig(config)
  const copied = []
  const ran = []

  for (const rel of copy) {
    const from = join(repo, rel)
    const to = join(worktree, rel)
    if (!existsSync(from) || !statSync(from).isFile()) {
      return { configured: true, copied, ran, failure: { step: `copy ${rel}`, detail: `${from} is not a file in the main checkout. ${CONFIG} lists what every worktree needs; a file that is optional on this machine does not belong in it.` } }
    }
    // Asked of the WORKTREE's git, because that is the tree a worker will run
    // `git add` in. Exit 0 is "ignored"; anything else — not ignored, tracked,
    // or git failing — is a refusal, since only one answer makes the copy safe.
    const ignored = spawnSync('git', ['-C', worktree, 'check-ignore', '-q', '--', rel], { encoding: 'utf8' })
    if (ignored.status !== 0) {
      return {
        configured: true,
        copied,
        ran,
        failure: { step: `copy ${rel}`, detail: `git does not ignore ${rel} in the worktree, so a copy of it would be one \`git add -A\` from a commit on the ticket's branch. Add it to .gitignore on the epic branch, or take it out of ${CONFIG}.` },
      }
    }
    // A filesystem error is a failed copy like any other — exit 1 with a
    // `FAILED at` line the proxy is told to relay, not a stack on stderr.
    try {
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
    } catch (e) {
      return { configured: true, copied, ran, failure: { step: `copy ${rel}`, detail: `${e.code || 'error'}: ${e.message}` } }
    }
    copied.push(rel)
    log(`copied ${rel}`)
  }

  for (const command of setup) {
    log(`$ ${command}`)
    const left = deadline - Date.now()
    const r = left > 0 ? spawnSync('sh', ['-c', command], { cwd: worktree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: left, killSignal: 'SIGKILL' }) : { status: null, error: { code: 'ETIMEDOUT' } }
    if (r.error && r.error.code === 'ETIMEDOUT') {
      return {
        configured: true,
        copied,
        ran,
        failure: {
          step: `setup: ${command}`,
          detail: `the setup's ${Math.round(budgetMs / 1000)}-second budget ran out — it exists because the run's worktree step is one shell call that is killed at ten minutes with its answer lost. Processes the command started may still be running in ${worktree}; check before removing it. Make the setup faster (an offline or cached install), or do not declare Parallel: on this project.\n${tail(`${r.stdout || ''}\n${r.stderr || ''}`)}`,
        },
      }
    }
    if (r.status !== 0) {
      return {
        configured: true,
        copied,
        ran,
        failure: { step: `setup: ${command}`, detail: `exited ${r.status === null ? `on signal ${r.signal}` : r.status}${r.error ? ` (${r.error.message})` : ''}\n${tail(`${r.stdout || ''}\n${r.stderr || ''}`)}` },
      }
    }
    ran.push(command)
  }
  return { configured: true, copied, ran, failure: null }
}

// `--validate` is the run's preflight: a malformed file would otherwise halt
// every ticket of the first wave at its worktree step, after launch. It reads a
// file or stdin (`git show origin/epic/<name>:epics/worktree.json | … --validate -`),
// copies nothing and runs nothing.
function validate(source, repo) {
  let text
  try {
    text = readFileSync(source === '-' ? 0 : source, 'utf8')
  } catch (e) {
    throw new UsageError(`--validate: cannot read ${source} (${e.code || e.message})`)
  }
  let config
  try {
    config = JSON.parse(text)
  } catch (e) {
    throw new UsageError(`${CONFIG}: not valid JSON (${e.message})`)
  }
  const { copy, setup } = validateConfig(config)
  // With --repo, the two failures shape cannot see, asked of the main
  // checkout: a listed file this machine does not have, and one git does not
  // ignore. The second is an approximation — the worktree's own .gitignore is
  // the epic branch's, and the real refusal stays at the copy — but the usual
  // case is one .gitignore on both, and it is the usual case a preflight is for.
  if (repo) {
    const problems = []
    for (const rel of copy) {
      const from = join(repo, rel)
      if (!existsSync(from) || !statSync(from).isFile()) problems.push(`copy "${rel}": ${from} is not a file in this checkout`)
      else if (spawnSync('git', ['-C', repo, 'check-ignore', '-q', '--', rel]).status !== 0) problems.push(`copy "${rel}": git does not ignore it, and a file git does not ignore is never copied`)
    }
    if (problems.length) return { stdout: `${CONFIG} reads, and its setup would fail here:\n${problems.map((p) => `  ${p}`).join('\n')}`, code: 1 }
  }
  return { stdout: `${CONFIG} reads: ${copy.length} file${copy.length === 1 ? '' : 's'} to copy, ${setup.length} setup command${setup.length === 1 ? '' : 's'}`, code: 0 }
}

export function run(argv) {
  if (argv[0] === '--validate') {
    if (argv.length !== 2 && !(argv.length === 4 && argv[2] === '--repo')) throw new UsageError(USAGE)
    return validate(argv[1], argv.length === 4 ? resolve(argv[3]) : null)
  }
  const flags = { '--repo': null, '--worktree': null, '--budget-ms': null }
  let json = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') json = true
    else if (Object.prototype.hasOwnProperty.call(flags, a)) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} needs a value\n${USAGE}`)
      flags[a] = v
    } else throw new UsageError(`unknown argument "${a}"\n${USAGE}`)
  }
  if (!flags['--repo'] || !flags['--worktree']) throw new UsageError(USAGE)
  const repo = resolve(flags['--repo'])
  const worktree = resolve(flags['--worktree'])
  for (const [label, p] of [['--repo', repo], ['--worktree', worktree]]) {
    if (!existsSync(p) || !statSync(p).isDirectory()) throw new UsageError(`${label}: ${p} is not a directory`)
  }
  // Copying a file onto itself truncates nothing, but "set up" the main
  // checkout would run the project's install in the tree a human works in.
  if (repo === worktree) throw new UsageError('--repo and --worktree are the same directory — this script sets up a worktree, never the main checkout')

  const lines = []
  const budgetMs = flags['--budget-ms'] === null ? BUDGET_MS : Number(flags['--budget-ms'])
  if (!Number.isInteger(budgetMs) || budgetMs <= 0) throw new UsageError(`--budget-ms "${flags['--budget-ms']}" is not a whole number of milliseconds`)
  const result = apply({ repo, worktree, log: (l) => lines.push(l), budgetMs })
  const code = result.failure ? 1 : 0
  if (json) return { stdout: JSON.stringify(result, null, 2), code }
  if (!result.configured) return { stdout: `no ${CONFIG} on this branch — nothing to set up; the worktree has only what git tracks`, code }
  const out = [...lines]
  if (result.failure) out.push(`FAILED at ${result.failure.step}\n${result.failure.detail}`)
  else out.push(`worktree set up from ${CONFIG}: ${result.copied.length} file${result.copied.length === 1 ? '' : 's'} copied, ${result.ran.length} command${result.ran.length === 1 ? '' : 's'} run`)
  return { stdout: out.join('\n'), code }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // process.exitCode, never process.exit(): stdout on a pipe is asynchronous.
  try {
    const { stdout, code } = run(process.argv.slice(2))
    console.log(stdout)
    process.exitCode = code
  } catch (e) {
    console.error(`worktree-setup: ${e instanceof UsageError ? e.message : e.stack}`)
    process.exitCode = 2
  }
}
