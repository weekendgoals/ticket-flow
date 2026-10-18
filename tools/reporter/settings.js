export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS = {
  token: '',
  repo: 'weekendgoals/weekendgoals',
  branch: 'tickets',
  label: 'agent-ticket'
};

export function normalizeSettings(stored) {
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = stored && typeof stored[key] === 'string' ? stored[key].trim() : '';
    if (value) merged[key] = value;
  }
  return merged;
}

export async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}
