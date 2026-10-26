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

function runGh(args, { input = null, acceptedExitCodes = [] } = {}) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input: input ?? undefined,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
  })
  if (result.error && result.error.code === 'ENOENT')
    throw new TrackerError('the GitHub CLI `gh` is not installed or not on PATH', { missing: true })
  if (result.error) throw new TrackerError(`gh could not run: ${result.error.message}`)
  const accepted = acceptedExitCodes.includes(result.status) && (result.stdout || '').trim() !== ''
  if (result.status !== 0 && !accepted) {
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
    createdAt: raw.created_at || null,
    closedAt: raw.closed_at || null,
    stateReason: raw.state_reason || null,
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

export function listRecentlyClosedIssues({ label, pages }) {
  const issues = []
  for (let page = 1; page <= pages; page++) {
    const query = `labels=${encodeURIComponent(label)}&state=closed&sort=updated&direction=desc&per_page=100&page=${page}`
    const found = apiGet(`${REPO}/issues?${query}`)
    issues.push(...found.filter((raw) => !raw.pull_request).map(normalizeIssue))
    if (found.length < 100) return { issues, capped: false }
  }
  return { issues, capped: true }
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

export function closeIssue(number, reason = 'not_planned') {
  return normalizeIssue(apiWrite('PATCH', `${REPO}/issues/${number}`, { state: 'closed', state_reason: reason }))
}

export function reopenIssue(number) {
  return normalizeIssue(apiWrite('PATCH', `${REPO}/issues/${number}`, { state: 'open' }))
}

export function removeSubIssue(parentNumber, childId) {
  apiWrite('DELETE', `${REPO}/issues/${parentNumber}/sub_issue`, { sub_issue_id: childId })
}

export function parentIssue(number) {
  try {
    return normalizeIssue(apiGet(`${REPO}/issues/${number}/parent`))
  } catch (error) {
    if (error instanceof TrackerError && error.httpStatus === 404) return null
    throw error
  }
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
    url: raw.html_url || null,
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
  'query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){issue(number:$number){userContentEdits(first:100,after:$endCursor){pageInfo{hasNextPage endCursor}nodes{editedAt editor{login}}}}}}'

export function bodyEditHistory(number) {
  const output = runGh([
    'api',
    'graphql',
    '--paginate',
    '--slurp',
    '-f',
    `query=${EDIT_HISTORY_QUERY}`,
    '-F',
    'owner={owner}',
    '-F',
    'name={repo}',
    '-F',
    `number=${number}`,
  ])
  const pages = parseJson(output, 'graphql edit history')
  return pages
    .flatMap((page) => {
      const issue = page && page.data && page.data.repository && page.data.repository.issue
      if (!issue) throw new TrackerError(`issue #${number} has no edit history to read`)
      return issue.userContentEdits.nodes
    })
    .map((node) => ({ editedAt: node.editedAt, editor: node.editor ? node.editor.login : null }))
    .sort((a, b) => a.editedAt.localeCompare(b.editedAt))
}

function graphqlData(response) {
  if (response.errors && response.errors.length) throw new TrackerError(`GitHub GraphQL refused the request: ${response.errors.map((error) => error.message).join('; ')}`)
  return response.data
}

function graphql(query, variables, { inRepository = true } = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`, ...(inRepository ? ['-F', 'owner={owner}', '-F', 'name={repo}'] : [])]
  for (const [name, value] of Object.entries(variables)) {
    if (value === null || value === undefined) continue
    args.push(typeof value === 'number' ? '-F' : '-f', `${name}=${value}`)
  }
  return graphqlData(parseJson(runGh(args), 'graphql'))
}

function graphqlWithInput(query, variables) {
  return graphqlData(parseJson(runGh(['api', 'graphql', '--input', '-'], { input: JSON.stringify({ query, variables }) }), 'graphql'))
}

function normalizePullRequest(raw) {
  return {
    number: raw.number,
    url: raw.html_url || null,
    state: raw.state,
    draft: Boolean(raw.draft),
    nodeId: raw.node_id || null,
    head: raw.head ? raw.head.ref : null,
    headSha: raw.head ? raw.head.sha : null,
    base: raw.base ? raw.base.ref : null,
    merged: Boolean(raw.merged_at),
    mergedAt: raw.merged_at || null,
    mergeCommitSha: raw.merged_at ? raw.merge_commit_sha || null : null,
    body: raw.body ?? null,
  }
}

export function getPullRequest(number) {
  return normalizePullRequest(apiGet(`${REPO}/pulls/${number}`))
}

export function findOpenPullRequest(head) {
  const owner = repoSlug().split('/')[0]
  const found = apiList(`${REPO}/pulls?head=${encodeURIComponent(`${owner}:${head}`)}&state=open&per_page=100`)
  return found.length ? normalizePullRequest(found[0]) : null
}

export function createPullRequest({ title, head, base, body, draft = false }) {
  return normalizePullRequest(apiWrite('POST', `${REPO}/pulls`, { title, head, base, body, ...(draft ? { draft: true } : {}) }))
}

const READY_FOR_REVIEW_MUTATION = 'mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{number isDraft}}}'
const CONVERT_TO_DRAFT_MUTATION = 'mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{number isDraft}}}'

function setDraft(number, nodeId, draft) {
  const [mutation, field] = draft ? [CONVERT_TO_DRAFT_MUTATION, 'convertPullRequestToDraft'] : [READY_FOR_REVIEW_MUTATION, 'markPullRequestReadyForReview']
  const data = graphqlWithInput(mutation, { id: nodeId })
  const changed = data && data[field] && data[field].pullRequest
  if (!changed || changed.isDraft !== draft) throw new TrackerError(`GitHub did not ${draft ? `convert pull request #${number} to a draft` : `mark pull request #${number} ready for review`}`)
}

export function updatePullRequest(number, { body, ready = false, draft = false }) {
  const updated = normalizePullRequest(apiWrite('PATCH', `${REPO}/pulls/${number}`, { body }))
  if (ready && updated.draft) {
    setDraft(number, updated.nodeId, false)
    return { ...updated, draft: false }
  }
  if (draft && !updated.draft) {
    setDraft(number, updated.nodeId, true)
    return { ...updated, draft: true }
  }
  return updated
}

export function requestReviewers(number, reviewers) {
  const pull = apiWrite('POST', `${REPO}/pulls/${number}/requested_reviewers`, { reviewers })
  return ((pull && pull.requested_reviewers) || []).map((reviewer) => reviewer.login)
}

export function listPullRequestReviews(number) {
  return apiList(`${REPO}/pulls/${number}/reviews?per_page=100`).map((raw) => ({
    id: raw.id,
    author: raw.user ? raw.user.login : null,
    state: raw.state,
    commit: raw.commit_id || null,
    submittedAt: raw.submitted_at || null,
  }))
}

const REVIEW_THREADS_QUERY =
  'query($owner:String!,$name:String!,$pr:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$pr){reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor}nodes{id isResolved isOutdated path line comments(first:100){totalCount nodes{body url author{login}}}}}}}}'

export function listReviewThreads(number) {
  const threads = []
  let cursor = null
  for (;;) {
    const data = graphql(REVIEW_THREADS_QUERY, { pr: number, cursor })
    const pullRequest = data && data.repository && data.repository.pullRequest
    if (!pullRequest) throw new TrackerError(`pull request #${number} was not found`)
    const page = pullRequest.reviewThreads
    for (const node of page.nodes) {
      const comments = node.comments.nodes.map((comment) => ({ author: comment.author ? comment.author.login : null, body: comment.body, url: comment.url }))
      threads.push({
        id: node.id,
        resolved: node.isResolved,
        outdated: node.isOutdated,
        path: node.path,
        line: node.line,
        author: comments.length ? comments[0].author : null,
        body: comments.length ? comments[0].body : '',
        comments,
        moreComments: (node.comments.totalCount ?? comments.length) > comments.length,
      })
    }
    if (!page.pageInfo.hasNextPage) return threads
    if (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor) throw new TrackerError(`GitHub returned a review thread page with no way to the next one for pull request #${number}`)
    cursor = page.pageInfo.endCursor
  }
}

const REPLY_TO_THREAD_MUTATION =
  'mutation($thread:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$thread,body:$body}){comment{url}}}'
const RESOLVE_THREAD_MUTATION = 'mutation($thread:ID!){resolveReviewThread(input:{threadId:$thread}){thread{id isResolved}}}'

export function replyToReviewThread(threadId, body) {
  const data = graphql(REPLY_TO_THREAD_MUTATION, { thread: threadId, body }, { inRepository: false })
  return { url: data.addPullRequestReviewThreadReply.comment.url }
}

export function resolveReviewThread(threadId) {
  const data = graphql(RESOLVE_THREAD_MUTATION, { thread: threadId }, { inRepository: false })
  return { resolved: data.resolveReviewThread.thread.isResolved }
}

const CHECK_FIELDS = 'bucket,link,name,state,workflow'
const PR_CHECKS_FAILING_EXIT = 1
const PR_CHECKS_PENDING_EXIT = 8
const NO_CHECKS_REPORTED = /no checks reported/i

export function pullRequestChecks(number) {
  let output
  try {
    output = runGh(['pr', 'checks', String(number), '--json', CHECK_FIELDS], { acceptedExitCodes: [PR_CHECKS_FAILING_EXIT, PR_CHECKS_PENDING_EXIT] })
  } catch (error) {
    if (NO_CHECKS_REPORTED.test(error.stderr || '')) return []
    throw error
  }
  if (!output.trim()) return []
  return parseJson(output, `pr checks ${number}`).map((check) => ({
    name: check.name,
    workflow: check.workflow || '',
    state: check.state,
    bucket: check.bucket,
    link: check.link || null,
  }))
}

const VIEWER_QUERY = 'query{viewer{login}}'
const ACCOUNT_VARIABLE = 'FLOW_ACCOUNT'
const ACCOUNT_HINT = `set ${ACCOUNT_VARIABLE} to the login Flow posts as: github-actions[bot] for the Actions token, <app-slug>[bot] for a GitHub App token, the owner's login for a personal access token`
let viewerLoginOnce = null

export function viewerLogin(environment = process.env) {
  const named = String(environment[ACCOUNT_VARIABLE] || '').trim()
  if (named) return named
  if (viewerLoginOnce) return viewerLoginOnce
  let data
  try {
    data = graphql(VIEWER_QUERY, {}, { inRepository: false })
  } catch (error) {
    if (!(error instanceof TrackerError) || error.missing) throw error
    throw new TrackerError(`GitHub would not say which account \`gh\` is signed in as (${error.message}), and Flow trusts its own comments only from that account; ${ACCOUNT_HINT}`)
  }
  const login = data && data.viewer && data.viewer.login
  if (!login) throw new TrackerError(`GitHub did not say which account \`gh\` is signed in as; ${ACCOUNT_HINT}`)
  viewerLoginOnce = login
  return login
}

const STATUS_FIELD_SELECTION = 'field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name color description}}}'
const FIELD_SELECTION = '... on ProjectV2FieldCommon{id name dataType} ... on ProjectV2SingleSelectField{options{id name color description}}'
const FIELDS_SELECTION = `fields(first:100){pageInfo{hasNextPage} nodes{${FIELD_SELECTION}}}`
const LINKED_PROJECTS_QUERY = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id owner{id} projectsV2(first:20){nodes{id title ${STATUS_FIELD_SELECTION} ${FIELDS_SELECTION}}}}}`
const RELEASE_VALUE_SELECTION = 'release:fieldValueByName(name:"Release"){... on ProjectV2ItemFieldSingleSelectValue{optionId name}}'

const normalizeOption = (option) => ({ id: option.id, name: option.name, color: option.color || null, description: option.description || '' })

function normalizeField(node) {
  return { id: node.id, name: node.name, dataType: node.dataType || null, options: Array.isArray(node.options) ? node.options.map(normalizeOption) : null }
}

function normalizeProject(node) {
  if (node.fields && node.fields.pageInfo && node.fields.pageInfo.hasNextPage)
    throw new TrackerError(`the project ${node.title} has more than 100 fields, and Flow reads only the first 100, so it cannot tell whether the fields it needs exist`)
  return {
    id: node.id,
    title: node.title,
    statusField: node.field && node.field.id ? { id: node.field.id, options: (node.field.options || []).map(normalizeOption) } : null,
    fields: ((node.fields && node.fields.nodes) || []).filter((field) => field && field.id && field.name).map(normalizeField),
  }
}

function selectValue(value) {
  return value && value.optionId ? { optionId: value.optionId, name: value.name || null } : null
}

export function linkedProjects() {
  const data = graphql(LINKED_PROJECTS_QUERY, {})
  const repository = data && data.repository
  if (!repository) throw new TrackerError('GitHub did not return this repository')
  const nodes = (repository.projectsV2 && repository.projectsV2.nodes) || []
  return { repositoryId: repository.id || null, ownerId: (repository.owner && repository.owner.id) || null, projects: nodes.filter(Boolean).map(normalizeProject) }
}

const ISSUE_PROJECT_ITEMS_QUERY =
  `query($owner:String!,$name:String!,$issue:Int!){repository(owner:$owner,name:$name){issue(number:$issue){id projectItems(first:20){nodes{id project{id} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{optionId name}} ${RELEASE_VALUE_SELECTION}}}}}}`

export function issueProjectItems(number) {
  const data = graphql(ISSUE_PROJECT_ITEMS_QUERY, { issue: number })
  const issue = data && data.repository && data.repository.issue
  if (!issue) throw new TrackerError(`issue #${number} was not found`)
  const nodes = (issue.projectItems && issue.projectItems.nodes) || []
  return {
    id: issue.id,
    items: nodes.filter(Boolean).map((node) => ({
      id: node.id,
      projectId: node.project ? node.project.id : null,
      status: selectValue(node.fieldValueByName),
      release: selectValue(node.release),
    })),
  }
}

const ADD_PROJECT_ITEM_MUTATION = 'mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}'
const SET_SINGLE_SELECT_MUTATION =
  'mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}){projectV2Item{id}}}'
const CREATE_PROJECT_MUTATION = `mutation($ownerId:ID!,$title:String!){createProjectV2(input:{ownerId:$ownerId,title:$title}){projectV2{id title ${STATUS_FIELD_SELECTION}}}}`
const SET_FIELD_OPTIONS_MUTATION =
  'mutation($field:ID!,$options:[ProjectV2SingleSelectFieldOptionInput!]!){updateProjectV2Field(input:{fieldId:$field,singleSelectOptions:$options}){projectV2Field{... on ProjectV2SingleSelectField{id options{id name}}}}}'
const SET_NUMBER_MUTATION =
  'mutation($project:ID!,$item:ID!,$field:ID!,$value:Float!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{number:$value}}){projectV2Item{id}}}'
const CREATE_FIELD_MUTATION = `mutation($project:ID!,$name:String!,$dataType:ProjectV2CustomFieldType!,$options:[ProjectV2SingleSelectFieldOptionInput!]){createProjectV2Field(input:{projectId:$project,name:$name,dataType:$dataType,singleSelectOptions:$options}){projectV2Field{${FIELD_SELECTION}}}}`
const LINK_PROJECT_MUTATION = 'mutation($project:ID!,$repository:ID!){linkProjectV2ToRepository(input:{projectId:$project,repositoryId:$repository}){repository{id}}}'

export function addProjectItem(projectId, contentId) {
  const data = graphql(ADD_PROJECT_ITEM_MUTATION, { project: projectId, content: contentId }, { inRepository: false })
  const item = data && data.addProjectV2ItemById && data.addProjectV2ItemById.item
  if (!item) throw new TrackerError('GitHub did not return the new project item')
  return item.id
}

export function setProjectSingleSelect(projectId, itemId, fieldId, optionId) {
  graphql(SET_SINGLE_SELECT_MUTATION, { project: projectId, item: itemId, field: fieldId, option: optionId }, { inRepository: false })
}

export function setProjectNumber(projectId, itemId, fieldId, value) {
  graphql(SET_NUMBER_MUTATION, { project: projectId, item: itemId, field: fieldId, value }, { inRepository: false })
}

export function createProject(ownerId, title) {
  const data = graphql(CREATE_PROJECT_MUTATION, { ownerId, title }, { inRepository: false })
  const project = data && data.createProjectV2 && data.createProjectV2.projectV2
  if (!project) throw new TrackerError('GitHub did not return the new project')
  return normalizeProject(project)
}

export function setSingleSelectOptions(fieldId, options) {
  const data = graphqlWithInput(SET_FIELD_OPTIONS_MUTATION, {
    field: fieldId,
    options: options.map((option) => ({ name: option.name, color: option.color || 'GRAY', description: option.description || '' })),
  })
  const field = data && data.updateProjectV2Field && data.updateProjectV2Field.projectV2Field
  if (!field) throw new TrackerError('GitHub did not return the changed field')
  return { fieldId: field.id || fieldId, options: (field.options || []).map((option) => ({ id: option.id, name: option.name })) }
}

const PROJECT_ITEMS_QUERY =
  `query($project:ID!,$cursor:String){node(id:$project){... on ProjectV2{items(first:100,after:$cursor){pageInfo{hasNextPage endCursor}nodes{id content{__typename ... on Issue{number repository{id}} ... on PullRequest{number repository{id}}} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{optionId name}} ${RELEASE_VALUE_SELECTION}}}}}}`

export function projectItems(projectId) {
  const items = []
  let cursor = null
  for (;;) {
    const data = graphql(PROJECT_ITEMS_QUERY, { project: projectId, cursor }, { inRepository: false })
    const page = data && data.node && data.node.items
    if (!page) throw new TrackerError(`GitHub did not return the items of project ${projectId}`)
    for (const node of page.nodes.filter(Boolean))
      items.push({
        id: node.id,
        kind: node.content && node.content.__typename ? node.content.__typename : null,
        number: node.content && node.content.number ? node.content.number : null,
        repositoryId: node.content && node.content.repository ? node.content.repository.id : null,
        status: selectValue(node.fieldValueByName),
        release: selectValue(node.release),
      })
    if (!page.pageInfo.hasNextPage) return items
    if (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor) throw new TrackerError(`GitHub returned a page of project items with no way to the next one`)
    cursor = page.pageInfo.endCursor
  }
}

export function linkProjectToRepository(projectId, repositoryId) {
  graphql(LINK_PROJECT_MUTATION, { project: projectId, repository: repositoryId }, { inRepository: false })
}

export function createProjectField(projectId, name, dataType, options = null) {
  const variables = { project: projectId, name, dataType }
  if (options) variables.options = options.map((option) => ({ name: option.name, color: option.color || 'GRAY', description: option.description || '' }))
  const data = graphqlWithInput(CREATE_FIELD_MUTATION, variables)
  const field = data && data.createProjectV2Field && data.createProjectV2Field.projectV2Field
  if (!field || !field.id) throw new TrackerError(`GitHub did not return the new field ${name}`)
  return normalizeField(field)
}
