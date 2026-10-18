import {
  FINDINGS_README,
  splitRepo,
  parseEpic,
  generateFindingId,
  screenshotPaths,
  stripDataUrlPrefix,
  buildIssueBody
} from './report-body.js';

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2022-11-28';

function repoPath(settings) {
  const { owner, name } = splitRepo(settings.repo);
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function branchPath(branch) {
  return branch.split('/').map(encodeURIComponent).join('/');
}

async function request(settings, method, path, body) {
  if (!settings.token) throw new Error('No GitHub token configured');
  const response = await fetch(API_ORIGIN + path, {
    method,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload && payload.message ? `: ${payload.message}` : '';
    const error = new Error(`GitHub ${method} ${path} failed with ${response.status}${detail}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function getRepository(settings) {
  return request(settings, 'GET', repoPath(settings));
}

export async function ensureFindingsBranch(settings) {
  const base = repoPath(settings);
  try {
    await request(settings, 'GET', `${base}/git/ref/heads/${branchPath(settings.branch)}`);
    return false;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const blob = await request(settings, 'POST', `${base}/git/blobs`, {
    content: FINDINGS_README,
    encoding: 'utf-8'
  });
  const tree = await request(settings, 'POST', `${base}/git/trees`, {
    tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blob.sha }]
  });
  const commit = await request(settings, 'POST', `${base}/git/commits`, {
    message: 'Start findings branch',
    tree: tree.sha,
    parents: []
  });
  await request(settings, 'POST', `${base}/git/refs`, {
    ref: `refs/heads/${settings.branch}`,
    sha: commit.sha
  });
  return true;
}

export async function uploadScreenshots(settings, findingId, screenshots) {
  const paths = screenshotPaths(findingId, screenshots);
  const contents = screenshots.map((screenshot) => stripDataUrlPrefix(screenshot.dataUrl));
  const uploads = [];
  for (const [position, path] of paths.entries()) {
    const response = await request(settings, 'PUT', `${repoPath(settings)}/contents/${path}`, {
      message: `Finding ${findingId}: screenshot ${position + 1} of ${paths.length}`,
      content: contents[position],
      branch: settings.branch
    });
    if (!response || !response.commit || !response.commit.sha) {
      throw new Error(`GitHub gave no commit for ${path}`);
    }
    uploads.push({ path, commitSha: response.commit.sha });
  }
  return uploads;
}

export async function createIssue(settings, report, findingId, uploads) {
  const issue = await request(settings, 'POST', `${repoPath(settings)}/issues`, {
    title: report.title,
    labels: [settings.label],
    body: buildIssueBody(settings, report, findingId, uploads)
  });
  return { id: issue.id, number: issue.number, html_url: issue.html_url };
}

export async function fileUnderEpic(settings, epic, issueId) {
  try {
    await request(settings, 'POST', `${repoPath(settings)}/issues/${epic}/sub_issues`, {
      sub_issue_id: issueId
    });
    return null;
  } catch (error) {
    return error.message;
  }
}

export async function fileFinding(settings, report, now = new Date(), random = Math.random) {
  const epic = parseEpic(settings.epic);
  const findingId = generateFindingId(now, random);
  await ensureFindingsBranch(settings);
  const uploads = await uploadScreenshots(settings, findingId, report.screenshots);
  const issue = await createIssue(settings, report, findingId, uploads);
  const epicProblem = epic === null ? null : await fileUnderEpic(settings, epic, issue.id);
  return { ...issue, findingId, epic, epicProblem, paths: uploads.map((upload) => upload.path) };
}
