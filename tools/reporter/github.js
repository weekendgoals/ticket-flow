import {
  splitRepo,
  parseEpic,
  generateFindingId,
  screenshotNames,
  bytesFromDataUrl,
  buildIssueBody
} from './report-body.js';

const API_ORIGIN = 'https://api.github.com';
const UPLOADS_ORIGIN = 'https://uploads.github.com';
const API_VERSION = '2022-11-28';

function repoPath(target) {
  const { owner, name } = splitRepo(target.repo);
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
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

export function getRepository(settings, target) {
  return request(settings, 'GET', repoPath(target));
}

async function uploadAttachment(settings, repositoryId, name, mime, bytes) {
  if (!settings.token) throw new Error('No GitHub token configured');
  const query = new URLSearchParams({ content_type: mime, name, repository_id: String(repositoryId) });
  const response = await fetch(`${UPLOADS_ORIGIN}/user-attachments/assets?${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.token}`,
      'Content-Type': 'application/octet-stream'
    },
    body: bytes
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload && payload.message ? `: ${payload.message}` : '';
    throw new Error(`GitHub upload of ${name} failed with ${response.status}${detail}`);
  }
  if (!payload || typeof payload.url !== 'string') throw new Error(`GitHub took ${name} but gave no attachment url`);
  return payload.url;
}

export async function uploadScreenshots(settings, target, findingId, screenshots) {
  const names = screenshotNames(findingId, screenshots);
  const repository = await getRepository(settings, target);
  if (!repository || !repository.id) throw new Error(`GitHub gave no id for ${target.repo}`);
  const uploads = [];
  for (const [position, name] of names.entries()) {
    const screenshot = screenshots[position];
    const url = await uploadAttachment(settings, repository.id, name, screenshot.mime, bytesFromDataUrl(screenshot.dataUrl));
    uploads.push({ name, url });
  }
  return uploads;
}

export async function createIssue(settings, target, report, findingId, uploads) {
  const issue = await request(settings, 'POST', `${repoPath(target)}/issues`, {
    title: report.title,
    labels: [settings.label],
    body: buildIssueBody(report, findingId, uploads)
  });
  return { id: issue.id, number: issue.number, html_url: issue.html_url };
}

export async function fileUnderEpic(settings, target, epic, issueId) {
  try {
    await request(settings, 'POST', `${repoPath(target)}/issues/${epic}/sub_issues`, {
      sub_issue_id: issueId
    });
    return null;
  } catch (error) {
    return error.message;
  }
}

export async function fileFinding(settings, target, report, now = new Date(), random = Math.random) {
  if (!target) throw new Error('No target chosen');
  splitRepo(target.repo);
  const epic = parseEpic(target.epic);
  const findingId = generateFindingId(now, random);
  const uploads = await uploadScreenshots(settings, target, findingId, report.screenshots);
  const issue = await createIssue(settings, target, report, findingId, uploads);
  const epicProblem = epic === null ? null : await fileUnderEpic(settings, target, epic, issue.id);
  return {
    ...issue,
    repo: target.repo,
    findingId,
    epic,
    epicProblem,
    screenshots: uploads.map((upload) => upload.url)
  };
}
