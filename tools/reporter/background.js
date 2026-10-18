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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'captureTab') return false;
  const windowId = message.windowId ?? (sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT);
  chrome.tabs
    .captureVisibleTab(windowId, { format: 'png' })
    .then((dataUrl) => sendResponse({ dataUrl }))
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});
