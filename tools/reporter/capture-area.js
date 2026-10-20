import { MAX_SCREENSHOTS, loadDraft, saveDraft } from './draft.js';

export const MIN_AREA_CSS_PIXELS = 4;
export const AREA_NOTICE_KEY = 'areaNotice';
export const REFUSED_NOTICE = 'This page does not allow area capture; use Capture or paste an image.';
export const FULL_NOTICE = `Limit of ${MAX_SCREENSHOTS} screenshots reached. Remove one to add another.`;
export const NO_DRAFT_NOTICE = 'The draft was gone when the area was captured; capture it again.';

export function cropRect(selection, image) {
  if (!selection || !image || !image.width || !image.height) return null;
  if (!(selection.width >= MIN_AREA_CSS_PIXELS) || !(selection.height >= MIN_AREA_CSS_PIXELS)) return null;
  const ratio = selection.devicePixelRatio || 1;
  const scaleX = selection.innerWidth ? image.width / selection.innerWidth : ratio;
  const scaleY = selection.innerHeight ? image.height / selection.innerHeight : ratio;
  const clampX = (value) => Math.min(Math.max(value, 0), image.width);
  const clampY = (value) => Math.min(Math.max(value, 0), image.height);
  const left = clampX(Math.floor(selection.x * scaleX));
  const top = clampY(Math.floor(selection.y * scaleY));
  const right = clampX(Math.ceil((selection.x + selection.width) * scaleX));
  const bottom = clampY(Math.ceil((selection.y + selection.height) * scaleY));
  if (right - left < 1 || bottom - top < 1) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function base64FromBytes(bytes) {
  const chunk = 0x8000;
  let binary = '';
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  }
  return btoa(binary);
}

export async function storeAreaScreenshot(dataUrl, now = Date.now()) {
  const draft = await loadDraft();
  if (!draft) return NO_DRAFT_NOTICE;
  if (draft.screenshots.length >= MAX_SCREENSHOTS) return FULL_NOTICE;
  draft.screenshots.push({
    id: crypto.randomUUID(),
    dataUrl,
    mime: 'image/png',
    caption: '',
    source: 'area',
    addedAt: now
  });
  await saveDraft(draft);
  return null;
}

export async function takeAreaNotice() {
  try {
    const stored = await chrome.storage.session.get(AREA_NOTICE_KEY);
    if (!stored[AREA_NOTICE_KEY]) return '';
    await chrome.storage.session.remove(AREA_NOTICE_KEY);
    return stored[AREA_NOTICE_KEY];
  } catch {
    return '';
  }
}

export function pickArea() {
  const LAYER_ID = 'flow-reporter-area';
  const MIN = 4;
  const previous = document.getElementById(LAYER_ID);
  if (previous) previous.remove();
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.id = LAYER_ID;
    layer.style.cssText =
      'all:initial;position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.3);user-select:none;';
    const box = document.createElement('div');
    box.style.cssText =
      'all:initial;position:fixed;display:none;pointer-events:none;border:1px solid #ffffff;outline:1px dashed #000000;box-shadow:0 0 0 100vmax rgba(0,0,0,0.3);';
    layer.append(box);
    let origin = null;
    let area = null;

    const finish = (answer) => {
      window.removeEventListener('keydown', onKey, true);
      layer.remove();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(answer)));
    };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    };
    layer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      layer.setPointerCapture(event.pointerId);
      origin = { x: event.clientX, y: event.clientY };
      area = null;
    });
    layer.addEventListener('pointermove', (event) => {
      if (!origin) return;
      const x = Math.min(origin.x, event.clientX);
      const y = Math.min(origin.y, event.clientY);
      area = { x, y, width: Math.abs(event.clientX - origin.x), height: Math.abs(event.clientY - origin.y) };
      layer.style.background = 'transparent';
      box.style.display = 'block';
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${area.width}px`;
      box.style.height = `${area.height}px`;
    });
    layer.addEventListener('pointerup', () => {
      if (!origin) return;
      origin = null;
      if (!area || area.width < MIN || area.height < MIN) {
        finish(null);
        return;
      }
      finish({
        ...area,
        devicePixelRatio: window.devicePixelRatio,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight
      });
    });
    window.addEventListener('keydown', onKey, true);
    document.documentElement.append(layer);
  });
}
