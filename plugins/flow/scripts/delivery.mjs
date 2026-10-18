import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PUSH_RETRIES = 2

export class GitError extends Error {
  constructor(message, { stderr = '' } = {}) {
    super(message)
    this.name = 'GitError'
    this.stderr = stderr
  }
}

export function git(cwd, args, { allowFailure = false, env = {} } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env } })
  if (result.error) throw new GitError(`git could not run: ${result.error.message}`)
  const outcome = { ok: result.status === 0, status: result.status, stdout: result.stdout.trimEnd(), stderr: result.stderr.trim() }
  if (!outcome.ok && !allowFailure) throw new GitError(`git ${args.join(' ')} failed: ${outcome.stderr || `exit ${result.status}`}`, { stderr: outcome.stderr })
  return outcome
}

export function repositoryRoot(cwd) {
  const found = git(cwd, ['rev-parse', '--show-toplevel'], { allowFailure: true })
  return found.ok ? found.stdout : null
}

export function trackedChanges(cwd) {
  return git(cwd, ['status', '--porcelain', '--untracked-files=no']).stdout.split('\n').filter(Boolean)
}

export function untrackedFiles(cwd) {
  return git(cwd, ['ls-files', '--others', '--exclude-standard']).stdout.split('\n').filter(Boolean)
}

export function currentBranch(cwd) {
  const found = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true })
  return found.ok ? found.stdout : null
}

export function resolveCommit(cwd, ref) {
  const found = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFailure: true })
  return found.ok ? found.stdout : null
}

function isAncestor(cwd, ancestor, descendant) {
  return git(cwd, ['merge-base', '--is-ancestor', ancestor, descendant], { allowFailure: true }).ok
}

export function commitSubjects(cwd, refs) {
  const present = refs.filter((ref) => resolveCommit(cwd, ref))
  if (!present.length) return null
  return git(cwd, ['log', '--no-merges', '--format=%H%x09%s', ...present, '--'])
    .stdout.split('\n')
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf('\t')
      return { sha: line.slice(0, at), subject: line.slice(at + 1) }
    })
}

export function fetchOrigin(cwd) {
  git(cwd, ['fetch', '--quiet', '--prune', 'origin'])
}

export function ticketBranchName(number) {
  return `ticket/${number}`
}

export function cutTicketBranch(cwd, { branch, base }) {
  fetchOrigin(cwd)
  const baseSha = resolveCommit(cwd, `origin/${base}`)
  if (!baseSha) return { ok: false, reason: `origin/${base} does not exist, so there is nothing to start the ticket from` }
  const local = resolveCommit(cwd, `refs/heads/${branch}`)
  const remote = resolveCommit(cwd, `refs/remotes/origin/${branch}`)
  if (!local && !remote) {
    git(cwd, ['checkout', '--quiet', '--no-track', '-b', branch, baseSha])
    return { ok: true, baseSha, resumedAt: null }
  }
  let head = local || remote
  if (local && remote && local !== remote) {
    if (isAncestor(cwd, local, remote)) head = remote
    else if (!isAncestor(cwd, remote, local))
      return { ok: false, reason: `${branch} here and on origin have both moved since they parted, so there is no one head to carry on from; a person keeps one of them` }
  }
  const checkedOut = git(cwd, ['checkout', '--quiet', '--no-track', '-B', branch, head], { allowFailure: true })
  if (!checkedOut.ok) return { ok: false, reason: `${branch} exists but could not be checked out here: ${checkedOut.stderr}` }
  const forkPoint = git(cwd, ['merge-base', head, baseSha], { allowFailure: true })
  return { ok: true, baseSha: forkPoint.ok ? forkPoint.stdout : baseSha, resumedAt: head }
}

function pushRejectedAsStale(stderr) {
  return /\[rejected\]|non-fast-forward|fetch first|stale info|failed to push some refs/i.test(stderr)
}

export function pushTicketBranch(cwd, { sha, branch }) {
  const pushed = git(cwd, ['push', '--quiet', 'origin', `${sha}:refs/heads/${branch}`], { allowFailure: true })
  if (pushed.ok) return { ok: true }
  return { ok: false, reason: `origin/${branch} has commits the accepted ${sha.slice(0, 12)} does not, so it was not overwritten: ${pushed.stderr}` }
}

function conflictedFiles(worktree) {
  return git(worktree, ['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter(Boolean)
}

function attemptMerge(cwd, { sha, epicBranch, subject }) {
  fetchOrigin(cwd)
  const epicHead = resolveCommit(cwd, `origin/${epicBranch}`)
  if (!epicHead) return { kind: 'missing-epic-branch' }
  if (isAncestor(cwd, sha, epicHead)) return { kind: 'already-merged', mergeSha: epicHead }
  const worktree = mkdtempSync(join(tmpdir(), 'flow-merge-'))
  try {
    git(cwd, ['worktree', 'add', '--quiet', '--detach', worktree, epicHead])
    const merged = git(worktree, ['merge', '--no-ff', '--no-edit', '-m', subject, sha], { allowFailure: true })
    if (!merged.ok) {
      const files = conflictedFiles(worktree)
      git(worktree, ['merge', '--abort'], { allowFailure: true })
      return files.length ? { kind: 'conflict', files } : { kind: 'merge-failed', reason: merged.stderr || merged.stdout }
    }
    const mergeSha = git(worktree, ['rev-parse', 'HEAD']).stdout
    const pushed = git(worktree, ['push', '--quiet', 'origin', `HEAD:refs/heads/${epicBranch}`], { allowFailure: true })
    if (pushed.ok) return { kind: 'merged', mergeSha }
    return pushRejectedAsStale(pushed.stderr) ? { kind: 'stale', reason: pushed.stderr } : { kind: 'push-failed', reason: pushed.stderr }
  } finally {
    git(cwd, ['worktree', 'remove', '--force', worktree], { allowFailure: true })
    rmSync(worktree, { recursive: true, force: true })
    git(cwd, ['worktree', 'prune'], { allowFailure: true })
  }
}

export const FINDINGS_BRANCH = 'flow-findings'
export const FINDINGS_BRANCH_README = `# flow-findings

This branch holds only the screenshots of Flow findings, one folder per issue:
\`findings/<issue number>/\`. \`flow create-finding --screenshots\` commits them
here so the links in the issue point at the commit they were filed in. It is
never merged anywhere and holds no code.
`

function remoteBranchHead(cwd, branch) {
  const listed = git(cwd, ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], { allowFailure: true })
  if (listed.status === 2) return { ok: true, sha: null }
  if (!listed.ok) return { ok: false, reason: `origin could not be read: ${listed.stderr || `exit ${listed.status}`}` }
  const fetched = git(cwd, ['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { allowFailure: true })
  if (!fetched.ok) return { ok: false, reason: `${branch} could not be fetched from origin: ${fetched.stderr}` }
  return { ok: true, sha: resolveCommit(cwd, `refs/remotes/origin/${branch}`) }
}

function commitFiles(cwd, { parent, files, readme, message }) {
  const scratch = mkdtempSync(join(tmpdir(), 'flow-side-branch-'))
  const env = { GIT_INDEX_FILE: join(scratch, 'index') }
  const stage = (source, path) => {
    const blob = git(cwd, ['hash-object', '-w', '--', source]).stdout
    git(cwd, ['update-index', '--add', '--cacheinfo', '100644', blob, path], { env })
  }
  try {
    if (parent) git(cwd, ['read-tree', parent], { env })
    else {
      writeFileSync(join(scratch, 'README.md'), readme)
      stage(join(scratch, 'README.md'), 'README.md')
    }
    for (const file of files) stage(file.source, file.path)
    const tree = git(cwd, ['write-tree'], { env }).stdout
    return git(cwd, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]).stdout
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export function commitToSideBranch(cwd, { branch, files, readme, message, retries = PUSH_RETRIES }) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const head = remoteBranchHead(cwd, branch)
    if (!head.ok) return head
    const sha = commitFiles(cwd, { parent: head.sha, files, readme, message })
    const pushed = git(cwd, ['push', '--quiet', 'origin', `${sha}:refs/heads/${branch}`], { allowFailure: true })
    if (pushed.ok) return { ok: true, sha, created: !head.sha }
    if (!pushRejectedAsStale(pushed.stderr)) return { ok: false, reason: `pushing ${branch} failed: ${pushed.stderr}` }
  }
  return { ok: false, reason: `${branch} on origin moved under every one of ${retries + 1} attempts to push` }
}

export function mergeIntoEpic(cwd,{ sha, epicBranch, subject, retries = PUSH_RETRIES }) {
  if (!/^epic\//.test(String(epicBranch || '')))
    return { ok: false, kind: 'not-an-epic-branch', reason: `${epicBranch} is not an epic branch, and nothing here merges into any other branch` }
  if (!resolveCommit(cwd, sha)) return { ok: false, kind: 'unknown-commit', reason: `commit ${sha} is not in this clone; fetch the ticket branch first` }
  const attempts = []
  for (let attempt = 0; attempt <= retries; attempt++) {
    const outcome = attemptMerge(cwd, { sha, epicBranch, subject })
    attempts.push(outcome.kind)
    if (outcome.kind === 'merged' || outcome.kind === 'already-merged') return { ok: true, ...outcome, attempts }
    if (outcome.kind !== 'stale') return { ok: false, ...outcome, attempts }
  }
  return { ok: false, kind: 'stale', attempts, reason: `origin/${epicBranch} moved under every one of ${retries + 1} attempts to push the merge` }
}
