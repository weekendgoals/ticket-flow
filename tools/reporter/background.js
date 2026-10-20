import {
  AREA_NOTICE_KEY,
  refusedNotice,
  cropRect,
  base64FromBytes,
  storeAreaScreenshot,
  pickArea
} from './capture-area.js';

const MENU_ID = 'report-selection';
const PENDING_KEY = 'pendingSelection';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Report a finding',
    contexts: ['selection']
  });
});

async function showReporter() {
  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 520,
      height: 760
    });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  await chrome.storage.session.set({
    [PENDING_KEY]: { text: info.selectionText, tabId: tab ? tab.id : undefined }
  });
  await showReporter();
});

const KEEP_ALIVE_MS = 20000;

async function askForArea(tabId) {
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), KEEP_ALIVE_MS);
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: pickArea });
    return injection ? injection.result : null;
  } finally {
    clearInterval(keepAlive);
  }
}

async function cropCapture(dataUrl, selection) {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const rect = cropRect(selection, image);
  if (!rect) return null;
  const canvas = new OffscreenCanvas(rect.width, rect.height);
  canvas.getContext('2d').drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return `data:image/png;base64,${base64FromBytes(new Uint8Array(await blob.arrayBuffer()))}`;
}

async function captureArea(tabId, windowId) {
  await chrome.windows.update(windowId, { focused: true }).catch(() => {});
  await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  let selection;
  try {
    selection = await askForArea(tabId);
  } catch (error) {
    return refusedNotice(error && error.message);
  }
  if (!selection) return null;
  try {
    const dataUrl = await cropCapture(await chrome.tabs.captureVisibleTab(windowId, { format: 'png' }), selection);
    return dataUrl ? await storeAreaScreenshot(dataUrl) : null;
  } catch (error) {
    return `Area capture failed: ${error.message}`;
  }
}

async function captureAreaAndReturn(tabId, windowId) {
  const notice = await captureArea(tabId, windowId);
  if (notice) await chrome.storage.session.set({ [AREA_NOTICE_KEY]: notice });
  await showReporter();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'captureArea') {
    sendResponse({ started: true });
    captureAreaAndReturn(message.tabId, message.windowId);
    return false;
  }
  if (!message || message.type !== 'captureTab') return false;
  const windowId = message.windowId ?? (sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT);
  chrome.tabs
    .captureVisibleTab(windowId, { format: 'png' })
    .then((dataUrl) => sendResponse({ dataUrl }))
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});
