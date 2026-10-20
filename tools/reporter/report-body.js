export const FINDINGS_README = 'Screenshots for findings filed from the reporter extension and by Flow; never merged.\n';
export const FINGERPRINT_DESCRIPTION_LENGTH = 60;
export const TITLE_LENGTH = 80;

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

export function parseEpic(value) {
  const text = String(value || '').trim().replace(/^#/, '');
  if (!text) return null;
  if (!/^[1-9][0-9]*$/.test(text)) throw new Error('Epic must be an issue number, such as 12');
  return Number(text);
}

export function generateFindingId(now = new Date(), random = Math.random) {
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

export function extensionForMime(mime) {
  const ext = EXTENSIONS[mime];
  if (!ext) throw new Error(`Unsupported screenshot type: ${mime || 'unknown'}`);
  return ext;
}

export function screenshotPath(findingId, index, ext) {
  return `findings/${findingId}/screenshot-${index}.${ext}`;
}

export function screenshotPaths(findingId, screenshots) {
  if (!Array.isArray(screenshots) || screenshots.length === 0) {
    throw new Error('Attach at least one screenshot');
  }
  return screenshots.map((screenshot, position) =>
    screenshotPath(findingId, position + 1, extensionForMime(screenshot.mime))
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

export function screenshotLink(repo, commitSha, path) {
  const { owner, name } = splitRepo(repo);
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${owner}/${name}/blob/${commitSha}/${encoded}?raw=true`;
}

export function urlPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url || '').trim();
  }
}

export function fingerprint(url, description) {
  const words = String(description || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const start = words.slice(0, FINGERPRINT_DESCRIPTION_LENGTH).trim();
  return `${urlPath(url)}|${start}`.replace(/-{2,}/g, '-');
}

export function fingerprintLine(url, description) {
  return `<!-- flow:finding fingerprint=${fingerprint(url, description)} -->`;
}

export function formatViewport(viewport) {
  if (!viewport || !viewport.w || !viewport.h) return null;
  return `${viewport.w}×${viewport.h}`;
}

export function quoteLines(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  return trimmed.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
}

export function issueTitle(fields, page) {
  const typed = (fields.title || '').trim();
  if (typed) return typed;
  const line = (fields.description || '').split(/\r?\n/).map((text) => text.trim()).find(Boolean) || '';
  if (!line) return (page && page.title ? page.title : '').trim();
  if (line.length <= TITLE_LENGTH) return line;
  const room = line.slice(0, TITLE_LENGTH);
  const space = room.lastIndexOf(' ');
  const cut = space > 0 ? room.slice(0, space) : room.slice(0, TITLE_LENGTH - 1);
  return `${cut.trimEnd()}…`;
}

export function whereLine(report) {
  const viewport = formatViewport(report.viewport);
  const page = report.pageTitle ? `${report.url} — ${report.pageTitle}` : report.url;
  const parts = [page, viewport ? `viewport ${viewport}` : 'viewport unknown'];
  if (report.userAgent) parts.push(report.userAgent);
  return parts.join(', ');
}

function textOrNone(text) {
  return (text || '').trim() || NONE;
}

function section(heading, body) {
  return [`## ${heading}`, '', body, ''];
}

export function buildIssueBody(target, report, findingId, uploads) {
  const lines = uploads.map((upload, position) => {
    const caption = (report.screenshots[position].caption || '').trim();
    const link = screenshotLink(target.repo, upload.commitSha, upload.path);
    return `${position + 1}. [${upload.path}](${link})${caption ? ` — ${caption}` : ''}`;
  });
  return [
    fingerprintLine(report.url, report.description),
    '',
    ...section('What happened', textOrNone(report.description)),
    ...section('Where', `${whereLine(report)}\nfinding id: ${findingId}`),
    '## Screenshots',
    '',
    ...lines
  ].join('\n');
}
