import { loadSettings } from './settings.js';
import { fileFinding } from './github.js';
import { SCREENSHOT_MIMES } from './report-body.js';
import {
  MAX_SCREENSHOTS,
  MAX_FILE_BYTES,
  SAVE_DELAY_MS,
  emptyFields,
  createDraft,
  loadDraft,
  saveDraft,
  clearDraft,
  relativeTime
} from './draft.js';

const PENDING_KEY = 'pendingSelection';
const CAP_MESSAGE = `Limit of ${MAX_SCREENSHOTS} screenshots reached. Remove one to add another.`;
const FIELD_NAMES = ['title', 'type', 'priority', 'description', 'steps', 'expected', 'selection'];

const elements = {
  unconfigured: document.getElementById('unconfigured'),
  form: document.getElementById('report'),
  draftBar: document.getElementById('draft-bar'),
  draftText: document.getElementById('draft-text'),
  discard: document.getElementById('discard'),
  shots: document.getElementById('shots'),
  shotsState: document.getElementById('shots-state'),
  shotsCount: document.getElementById('shots-count'),
  capture: document.getElementById('capture'),
  addFiles: document.getElementById('add-files'),
  fileInput: document.getElementById('file-input'),
  pageTitle: document.getElementById('page-title'),
  pageUrl: document.getElementById('page-url'),
  title: document.getElementById('title'),
  type: document.getElementById('type'),
  priority: document.getElementById('priority'),
  description: document.getElementById('description'),
  steps: document.getElementById('steps'),
  expected: document.getElementById('expected'),
  selection: document.getElementById('selection'),
  submit: document.getElementById('submit'),
  status: document.getElementById('status')
};

const state = { draft: null, submitted: false, busy: false, pendingTabId: undefined, saveTimer: null };

function openOptions(event) {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
}

document.getElementById('open-options').addEventListener('click', openOptions);
document.getElementById('open-options-main').addEventListener('click', openOptions);

function epicNote(issue) {
  if (issue.epic === null) return ', with no epic.';
  if (issue.epicProblem) return `, but not under epic #${issue.epic}: ${issue.epicProblem}`;
  return ` under epic #${issue.epic}.`;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', isError);
}

async function readPending() {
  try {
    const stored = await chrome.storage.session.get(PENDING_KEY);
    return stored[PENDING_KEY] || null;
  } catch {
    return null;
  }
}

async function clearPending() {
  try {
    await chrome.storage.session.remove(PENDING_KEY);
  } catch {
    return;
  }
}

function isOwnPage(tab) {
  return Boolean(tab && tab.url && tab.url.startsWith(chrome.runtime.getURL('')));
}

async function resolveTargetTab(pending) {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if ((!active || isOwnPage(active)) && pending && pending.tabId !== undefined) {
    try {
      return await chrome.tabs.get(pending.tabId);
    } catch {
      return active || null;
    }
  }
  return active || null;
}

async function resolveCaptureWindowId() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && !isOwnPage(active)) return active.windowId;
  const remembered = [state.draft && state.draft.page.tabId, state.pendingTabId];
  for (const tabId of remembered) {
    if (tabId === null || tabId === undefined) continue;
    try {
      return (await chrome.tabs.get(tabId)).windowId;
    } catch {
      continue;
    }
  }
  return active ? active.windowId : undefined;
}

async function inspectPage(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        selection: window.getSelection().toString(),
        viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }
      })
    });
    return injection && injection.result ? injection.result : { selection: '', viewport: null };
  } catch {
    return { selection: '', viewport: null };
  }
}

async function captureTab(windowId) {
  const response = await chrome.runtime.sendMessage({ type: 'captureTab', windowId });
  if (!response || response.error) {
    throw new Error(response && response.error ? response.error : 'No response from background');
  }
  return response.dataUrl;
}

function readFields() {
  const fields = {};
  for (const name of FIELD_NAMES) fields[name] = elements[name].value;
  return fields;
}

function fillFields(fields) {
  for (const name of FIELD_NAMES) elements[name].value = fields[name];
}

function fillPage(page) {
  elements.pageTitle.textContent = page.title;
  elements.pageUrl.textContent = page.url;
  if (page.url) elements.pageUrl.href = page.url;
  else elements.pageUrl.removeAttribute('href');
}

function showDraftBar(draft) {
  const where = draft.page.title || draft.page.url || 'an untitled page';
  elements.draftText.textContent = `Draft started ${relativeTime(draft.startedAt)} on ${where}.`;
  elements.draftBar.hidden = false;
}

async function persistDraft() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (!state.draft || state.submitted) return;
  state.draft.fields = readFields();
  try {
    await saveDraft(state.draft);
  } catch (error) {
    setStatus(`Could not save the draft: ${error.message}`, true);
  }
}

function scheduleSave() {
  if (!state.draft || state.submitted) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(persistDraft, SAVE_DELAY_MS);
}

function refreshControls() {
  const count = state.draft ? state.draft.screenshots.length : 0;
  const locked = state.submitted || state.busy || !state.draft;
  const full = count >= MAX_SCREENSHOTS;
  elements.capture.disabled = locked || full;
  elements.addFiles.disabled = locked || full;
  elements.shotsCount.textContent = `${count} of ${MAX_SCREENSHOTS}`;
  elements.shotsState.hidden = count > 0;
  elements.shotsState.textContent = state.busy
    ? 'Capturing screenshot…'
    : 'No screenshots yet. Capture the tab or add files.';
}

function reportListStatus(problems) {
  const full = state.draft && state.draft.screenshots.length >= MAX_SCREENSHOTS;
  const parts = [...problems, ...(full ? [CAP_MESSAGE] : [])];
  if (parts.length > 0) setStatus(parts.join(' '), problems.length > 0);
  else if (elements.status.textContent === CAP_MESSAGE) setStatus('');
}

async function openFullSize(screenshot) {
  try {
    await chrome.tabs.create({ url: screenshot.dataUrl });
  } catch (error) {
    setStatus(`Could not open the screenshot: ${error.message}`, true);
  }
}

async function removeScreenshot(screenshot) {
  state.draft.screenshots = state.draft.screenshots.filter((entry) => entry.id !== screenshot.id);
  renderScreenshots();
  setStatus('');
  reportListStatus([]);
  await persistDraft();
}

function buildThumbnail(screenshot, position) {
  const label = position + 1;
  const item = document.createElement('li');
  item.className = 'thumb';

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'thumb-open';
  open.title = 'Open full size';
  const image = document.createElement('img');
  image.src = screenshot.dataUrl;
  image.alt = `Screenshot ${label}`;
  open.append(image);
  open.addEventListener('click', () => openFullSize(screenshot));

  const badge = document.createElement('span');
  badge.className = 'thumb-index';
  badge.textContent = String(label);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'thumb-remove';
  remove.textContent = '×';
  remove.title = `Remove screenshot ${label}`;
  remove.setAttribute('aria-label', `Remove screenshot ${label}`);
  remove.addEventListener('click', () => removeScreenshot(screenshot));

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.className = 'thumb-caption';
  caption.placeholder = 'Caption, optional';
  caption.autocomplete = 'off';
  caption.value = screenshot.caption;
  caption.setAttribute('aria-label', `Caption for screenshot ${label}`);
  caption.addEventListener('input', () => {
    screenshot.caption = caption.value;
    scheduleSave();
  });
  caption.addEventListener('change', persistDraft);
  caption.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
  });

  item.append(open, badge, remove, caption);
  return item;
}

function renderScreenshots() {
  const screenshots = state.draft ? state.draft.screenshots : [];
  elements.shots.replaceChildren(...screenshots.map(buildThumbnail));
  refreshControls();
}

async function addScreenshots(items, problems = []) {
  if (!state.draft || state.submitted) return;
  const room = MAX_SCREENSHOTS - state.draft.screenshots.length;
  const accepted = items.slice(0, Math.max(room, 0));
  if (accepted.length < items.length) {
    problems.push(`Skipped ${items.length - accepted.length} that did not fit.`);
  }
  for (const item of accepted) {
    state.draft.screenshots.push({
      id: crypto.randomUUID(),
      dataUrl: item.dataUrl,
      mime: item.mime,
      caption: '',
      source: item.source,
      addedAt: Date.now()
    });
  }
  renderScreenshots();
  reportListStatus(problems);
  await persistDraft();
}

async function captureAndAdd(knownWindowId) {
  const draft = state.draft;
  state.busy = true;
  refreshControls();
  setStatus('');
  try {
    const windowId = knownWindowId === undefined ? await resolveCaptureWindowId() : knownWindowId;
    const dataUrl = await captureTab(windowId);
    if (state.draft !== draft) return;
    await addScreenshots([{ dataUrl, mime: 'image/png', source: 'capture' }]);
  } catch (error) {
    setStatus(`Screenshot failed: ${error.message}`, true);
  } finally {
    state.busy = false;
    refreshControls();
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function filesToItems(files, source, problems) {
  const items = [];
  for (const file of files) {
    const name = file.name || 'Pasted image';
    if (!SCREENSHOT_MIMES.includes(file.type)) {
      problems.push(`${name} is not a PNG, JPEG, WebP or GIF image.`);
    } else if (file.size > MAX_FILE_BYTES) {
      problems.push(`${name} is over 10 MB and was skipped.`);
    } else {
      try {
        items.push({ dataUrl: await readAsDataUrl(file), mime: file.type, source });
      } catch {
        problems.push(`${name} could not be read.`);
      }
    }
  }
  return items;
}

async function addFiles(files, source) {
  const problems = [];
  const items = await filesToItems(files, source, problems);
  await addScreenshots(items, problems);
}

function resetForm() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  state.draft = null;
  fillFields(emptyFields());
  fillPage({ title: '', url: '' });
  renderScreenshots();
  elements.draftBar.hidden = true;
  setStatus('');
}

async function beginDraft(pending) {
  const tab = await resolveTargetTab(pending);
  if (!tab) {
    setStatus('No tab to report on.', true);
    elements.submit.disabled = true;
    refreshControls();
    return;
  }
  const draft = createDraft({
    url: tab.url || '',
    title: tab.title || '',
    viewport: null,
    userAgent: navigator.userAgent,
    tabId: tab.id === undefined ? null : tab.id
  });
  state.draft = draft;
  fillFields(draft.fields);
  fillPage(draft.page);
  renderScreenshots();

  const capturing = captureAndAdd(tab.windowId);
  const page = await inspectPage(tab.id);
  if (state.draft !== draft) return;
  draft.page.viewport = page.viewport;
  const pendingText = pending && pending.tabId === tab.id && pending.text ? pending.text : '';
  elements.selection.value = pendingText || page.selection;
  await capturing;
  await persistDraft();
}

async function restoreDraft(draft, pending) {
  state.draft = draft;
  fillFields(draft.fields);
  fillPage(draft.page);
  showDraftBar(draft);
  renderScreenshots();
  reportListStatus([]);
  if (pending && pending.text) {
    elements.selection.value = elements.selection.value
      ? `${elements.selection.value}\n${pending.text}`
      : pending.text;
    await persistDraft();
  }
}

async function start() {
  const settings = await loadSettings();
  if (!settings.token || !settings.repo) {
    elements.unconfigured.hidden = false;
    return;
  }
  elements.form.hidden = false;
  refreshControls();

  const pending = await readPending();
  state.pendingTabId = pending ? pending.tabId : undefined;
  try {
    const stored = await loadDraft();
    if (stored) await restoreDraft(stored, pending);
    else await beginDraft(pending);
  } finally {
    await clearPending();
  }
}

async function dropStoredDraft() {
  try {
    await clearDraft();
  } catch {
    return;
  }
}

async function discardDraft(event) {
  event.preventDefault();
  if (state.busy || state.submitted) return;
  resetForm();
  try {
    await clearDraft();
  } catch (error) {
    setStatus(`Could not discard the draft: ${error.message}`, true);
    return;
  }
  const pending = state.pendingTabId === undefined ? null : { tabId: state.pendingTabId };
  await beginDraft(pending);
}

for (const name of FIELD_NAMES) {
  elements[name].addEventListener('input', scheduleSave);
  elements[name].addEventListener('change', scheduleSave);
}

elements.discard.addEventListener('click', discardDraft);
elements.capture.addEventListener('click', () => captureAndAdd());
elements.addFiles.addEventListener('click', () => elements.fileInput.click());

elements.fileInput.addEventListener('change', async () => {
  const files = Array.from(elements.fileInput.files);
  elements.fileInput.value = '';
  await addFiles(files, 'file');
});

document.addEventListener('paste', async (event) => {
  const files = Array.from(event.clipboardData ? event.clipboardData.files : []).filter((file) =>
    file.type.startsWith('image/')
  );
  if (files.length === 0 || elements.form.hidden) return;
  event.preventDefault();
  await addFiles(files, 'paste');
});

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const draft = state.draft;
  if (!draft || state.submitted || state.busy) return;
  if (draft.screenshots.length === 0) {
    setStatus('Add at least one screenshot.', true);
    return;
  }
  draft.fields = readFields();
  state.busy = true;
  refreshControls();
  elements.submit.disabled = true;
  setStatus('Filing finding…');
  try {
    const settings = await loadSettings();
    const issue = await fileFinding(settings, {
      title: draft.fields.title.trim(),
      type: draft.fields.type,
      priority: draft.fields.priority,
      description: draft.fields.description,
      steps: draft.fields.steps,
      expected: draft.fields.expected,
      selection: draft.fields.selection,
      url: draft.page.url,
      pageTitle: draft.page.title,
      viewport: draft.page.viewport,
      userAgent: draft.page.userAgent,
      screenshots: draft.screenshots.map(({ dataUrl, mime, caption }) => ({ dataUrl, mime, caption }))
    });
    state.submitted = true;
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    await dropStoredDraft();
    elements.draftBar.hidden = true;
    const link = document.createElement('a');
    link.href = issue.html_url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `Filed finding #${issue.number}`;
    elements.status.classList.toggle('error', Boolean(issue.epicProblem));
    elements.status.replaceChildren(link, document.createTextNode(epicNote(issue)));
  } catch (error) {
    setStatus(error.message, true);
    elements.submit.disabled = false;
  } finally {
    state.busy = false;
    refreshControls();
  }
});

start().catch((error) => {
  elements.form.hidden = false;
  setStatus(error.message, true);
});
