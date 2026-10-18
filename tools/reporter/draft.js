export const DRAFT_KEY = 'draft';
export const MAX_SCREENSHOTS = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SAVE_DELAY_MS = 300;

const SOURCES = ['capture', 'file', 'paste'];

export function emptyFields() {
  return { title: '', type: 'bug', priority: 'normal', description: '', steps: '', expected: '', selection: '' };
}

export function createDraft(page, now = Date.now()) {
  return { startedAt: now, page, fields: emptyFields(), screenshots: [] };
}

function normalizeScreenshot(stored) {
  if (!stored || typeof stored.dataUrl !== 'string' || typeof stored.mime !== 'string') return null;
  return {
    id: typeof stored.id === 'string' && stored.id ? stored.id : crypto.randomUUID(),
    dataUrl: stored.dataUrl,
    mime: stored.mime,
    caption: typeof stored.caption === 'string' ? stored.caption : '',
    source: SOURCES.includes(stored.source) ? stored.source : 'file',
    addedAt: Number.isFinite(stored.addedAt) ? stored.addedAt : Date.now()
  };
}

export function normalizeDraft(stored) {
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.screenshots)) return null;
  const page = stored.page && typeof stored.page === 'object' ? stored.page : {};
  const fields = emptyFields();
  for (const key of Object.keys(fields)) {
    if (stored.fields && typeof stored.fields[key] === 'string') fields[key] = stored.fields[key];
  }
  return {
    startedAt: Number.isFinite(stored.startedAt) ? stored.startedAt : Date.now(),
    page: {
      url: typeof page.url === 'string' ? page.url : '',
      title: typeof page.title === 'string' ? page.title : '',
      viewport: page.viewport || null,
      userAgent: typeof page.userAgent === 'string' ? page.userAgent : '',
      tabId: Number.isInteger(page.tabId) ? page.tabId : null
    },
    fields,
    screenshots: stored.screenshots.map(normalizeScreenshot).filter(Boolean)
  };
}

export async function loadDraft() {
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  return normalizeDraft(stored[DRAFT_KEY]);
}

export function saveDraft(draft) {
  return chrome.storage.local.set({ [DRAFT_KEY]: draft });
}

export function clearDraft() {
  return chrome.storage.local.remove(DRAFT_KEY);
}

export function relativeTime(startedAt, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
