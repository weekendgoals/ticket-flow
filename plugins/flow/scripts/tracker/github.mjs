import { spawnSync } from 'node:child_process'

const REPO = 'repos/{owner}/{repo}'
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

export class TrackerError extends Error {
  constructor(message, { missing = false, httpStatus = null, stderr = '' } = {}) {
    super(message)
    this.name = 'TrackerError'
    this.missing = missing
    this.httpStatus = httpStatus
    this.stderr = stderr
  }
}

function runGh(args, { input = null } = {}) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input: input ?? undefined,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
  })
  if (result.error && result.error.code === 'ENOENT')
    throw new TrackerError('the GitHub CLI `gh` is not installed or not on PATH', { missing: true })
  if (result.error) throw new TrackerError(`gh could not run: ${result.error.message}`)
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim()
    const status = stderr.match(/\(HTTP (\d{3})\)/)
    throw new TrackerError(`gh ${args.slice(0, 3).join(' ')} failed: ${stderr || `exit ${result.status}`}`, {
      httpStatus: status ? Number(status[1]) : null,
      stderr,
    })
  }
  return result.stdout
}

function parseJson(text, what) {
  try {
    return JSON.parse(text)
  } catch {
    throw new TrackerError(`gh returned something that is not JSON for ${what}`)
  }
}

function apiGet(path) {
  return parseJson(runGh(['api', path]), path)
}

function apiList(path) {
  const pages = parseJson(runGh(['api', '--paginate', '--slurp', path]), path)
  return pages.flat()
}

function apiWrite(method, path, payload) {
  const output = runGh(['api', '-X', method, path, '--input', '-'], { input: JSON.stringify(payload) })
  return output.trim() ? parseJson(output, path) : null
}

function normalizeIssue(raw) {
  return {
    number: raw.number,
    id: raw.id,
    title: raw.title,
    body: raw.body || '',
    state: raw.state,
    labels: (raw.labels || []).map((label) => (typeof label === 'string' ? label : label.name)),
    assignees: (raw.assignees || []).map((user) => user.login),
    author: raw.user ? raw.user.login : null,
    url: raw.html_url || null,
  }
}

export function ghVersion() {
  return runGh(['--version']).split('\n')[0].trim()
}

export function authStatus() {
  try {
    runGh(['auth', 'status'])
    return { ok: true, message: '' }
  } catch (error) {
    if (error.missing) throw error
    return { ok: false, message: error.stderr || error.message }
  }
}

export function repoInfo() {
  const raw = apiGet(REPO)
  return { slug: raw.full_name, defaultBranch: raw.default_branch || null, hasIssues: raw.has_issues !== false }
}

export function repoSlug() {
  return repoInfo().slug
}

export function defaultBranch() {
  return repoInfo().defaultBranch
}

export function getIssue(number) {
  return normalizeIssue(apiGet(`${REPO}/issues/${number}`))
}

export function listIssues({ label, state = 'open' }) {
  const query = `labels=${encodeURIComponent(label)}&state=${state}&per_page=100`
  return apiList(`${REPO}/issues?${query}`)
    .filter((raw) => !raw.pull_request)
    .map(normalizeIssue)
}

export function listSubIssues(number) {
  return apiList(`${REPO}/issues/${number}/sub_issues?per_page=100`).map(normalizeIssue)
}

export function createIssue({ title, body, labels = [] }) {
  return normalizeIssue(apiWrite('POST', `${REPO}/issues`, { title, body, labels }))
}

export function updateIssueBody(number, body) {
  return normalizeIssue(apiWrite('PATCH', `${REPO}/issues/${number}`, { body }))
}

export function addSubIssue(parentNumber, childId) {
  apiWrite('POST', `${REPO}/issues/${parentNumber}/sub_issues`, { sub_issue_id: childId })
}

export function setLabels(number, labels) {
  apiWrite('PUT', `${REPO}/issues/${number}/labels`, { labels })
}

export function addLabels(number, labels) {
  if (labels.length) apiWrite('POST', `${REPO}/issues/${number}/labels`, { labels })
}

export function removeLabels(number, labels) {
  for (const label of labels) {
    try {
      runGh(['api', '-X', 'DELETE', `${REPO}/issues/${number}/labels/${encodeURIComponent(label)}`])
    } catch (error) {
      if (error.httpStatus !== 404) throw error
    }
  }
}

export function comment(number, body) {
  const raw = apiWrite('POST', `${REPO}/issues/${number}/comments`, { body })
  return { id: raw.id, url: raw.html_url || null }
}

export function listComments(number) {
  return apiList(`${REPO}/issues/${number}/comments?per_page=100`).map((raw) => ({
    id: raw.id,
    author: raw.user ? raw.user.login : null,
    body: raw.body || '',
    createdAt: raw.created_at,
  }))
}

export function listLabels() {
  return apiList(`${REPO}/labels?per_page=100`).map((raw) => ({ name: raw.name, color: raw.color, description: raw.description || '' }))
}

export function ensureLabels(wanted) {
  const existing = new Set(listLabels().map((label) => label.name))
  const created = []
  for (const label of wanted) {
    if (existing.has(label.name)) continue
    apiWrite('POST', `${REPO}/labels`, label)
    created.push(label.name)
  }
  return { created, existing: wanted.map((label) => label.name).filter((name) => existing.has(name)) }
}

const EDIT_HISTORY_QUERY =
  'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){userContentEdits(first:100){nodes{editedAt editor{login}}}}}}'

export function bodyEditHistory(number) {
  const output = runGh([
    'api',
    'graphql',
    '-f',
    `query=${EDIT_HISTORY_QUERY}`,
    '-F',
    'owner={owner}',
    '-F',
    'name={repo}',
    '-F',
    `number=${number}`,
  ])
  const data = parseJson(output, 'graphql edit history')
  const issue = data && data.data && data.data.repository && data.data.repository.issue
  if (!issue) throw new TrackerError(`issue #${number} has no edit history to read`)
  return issue.userContentEdits.nodes
    .map((node) => ({ editedAt: node.editedAt, editor: node.editor ? node.editor.login : null }))
    .sort((a, b) => a.editedAt.localeCompare(b.editedAt))
}
