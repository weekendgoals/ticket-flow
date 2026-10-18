const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const TICKETS_README = 'Screenshots filed by the report extension.\n';
const NONE = '_none_';
const EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export const SCREENSHOT_MIMES = Object.keys(EXTENSIONS);

export function splitRepo(repo) {
  const parts = String(repo || '').trim().split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Repository must look like owner/name');
  }
  return { owner: parts[0], name: parts[1] };
}

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

export function generateTicketId(now = new Date(), random = Math.random) {
  const pad = (value) => String(value).padStart(2, '0');
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += alphabet[Math.floor(random() * alphabet.length)];
  }
  return `${date}-${time}-${suffix}`;
}

export async function ensureTicketsBranch(settings) {
  const base = repoPath(settings);
  try {
    await request(settings, 'GET', `${base}/git/ref/heads/${branchPath(settings.branch)}`);
    return false;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const blob = await request(settings, 'POST', `${base}/git/blobs`, {
    content: TICKETS_README,
    encoding: 'utf-8'
  });
  const tree = await request(settings, 'POST', `${base}/git/trees`, {
    tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blob.sha }]
  });
  const commit = await request(settings, 'POST', `${base}/git/commits`, {
    message: 'Start tickets branch',
    tree: tree.sha,
    parents: []
  });
  await request(settings, 'POST', `${base}/git/refs`, {
    ref: `refs/heads/${settings.branch}`,
    sha: commit.sha
  });
  return true;
}

export function screenshotPath(ticketId, index, ext) {
  return `tickets/${ticketId}/screenshot-${index}.${ext}`;
}

export function extensionForMime(mime) {
  const ext = EXTENSIONS[mime];
  if (!ext) throw new Error(`Unsupported screenshot type: ${mime || 'unknown'}`);
  return ext;
}

export function screenshotPaths(ticketId, screenshots) {
  if (!Array.isArray(screenshots) || screenshots.length === 0) {
    throw new Error('Attach at least one screenshot');
  }
  return screenshots.map((screenshot, position) =>
    screenshotPath(ticketId, position + 1, extensionForMime(screenshot.mime))
  );
}

export function stripDataUrlPrefix(dataUrl) {
  const marker = ';base64,';
  const index = dataUrl.indexOf(marker);
  if (!dataUrl.startsWith('data:') || index === -1) {
    throw new Error('Screenshot is not a base64 data URL');
  }
  return dataUrl.slice(index + marker.length);
}

export async function uploadScreenshots(settings, ticketId, screenshots) {
  const paths = screenshotPaths(ticketId, screenshots);
  const contents = screenshots.map((screenshot) => stripDataUrlPrefix(screenshot.dataUrl));
  for (const [position, path] of paths.entries()) {
    await request(settings, 'PUT', `${repoPath(settings)}/contents/${path}`, {
      message: `Ticket ${ticketId}: screenshot ${position + 1} of ${paths.length}`,
      content: contents[position],
      branch: settings.branch
    });
  }
  return paths;
}

export function formatViewport(viewport) {
  if (!viewport || !viewport.w || !viewport.h) return null;
  const ratio = viewport.dpr || 1;
  return `${viewport.w}×${viewport.h} @${ratio}x`;
}

export function quoteLines(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return NONE;
  return trimmed.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
}

export function buildIssueBody(settings, report, ticketId) {
  const { owner, name } = splitRepo(settings.repo);
  const paths = screenshotPaths(ticketId, report.screenshots);
  const viewport = formatViewport(report.viewport);
  const header = [
    `**Page:** ${report.url}`,
    `**Title:** ${report.pageTitle}`,
    `**Type:** ${report.type}`,
    `**Priority:** ${report.priority}`,
    ...(viewport ? [`**Viewport:** ${viewport}`] : []),
    `**User agent:** ${report.userAgent}`,
    `**Ticket:** ${ticketId}`
  ];
  const description = (report.description || '').trim() || NONE;
  const screenshotLines = paths.map((path, position) => {
    const link = `https://github.com/${owner}/${name}/blob/${settings.branch}/${path}?raw=true`;
    const caption = (report.screenshots[position].caption || '').trim();
    return `${position + 1}. [${path}](${link})${caption ? ` — ${caption}` : ''}`;
  });
  return [
    header.join('\n'),
    '',
    '## Description',
    '',
    description,
    '',
    '## Selected text',
    '',
    quoteLines(report.selection),
    '',
    '## Screenshots',
    '',
    ...screenshotLines
  ].join('\n');
}

export async function createIssue(settings, report, ticketId) {
  const issue = await request(settings, 'POST', `${repoPath(settings)}/issues`, {
    title: report.title,
    labels: [settings.label],
    body: buildIssueBody(settings, report, ticketId)
  });
  return { number: issue.number, html_url: issue.html_url };
}

export async function fileTicket(settings, report, now = new Date(), random = Math.random) {
  const ticketId = generateTicketId(now, random);
  await ensureTicketsBranch(settings);
  const paths = await uploadScreenshots(settings, ticketId, report.screenshots);
  const issue = await createIssue(settings, report, ticketId);
  return { ...issue, ticketId, paths };
}
