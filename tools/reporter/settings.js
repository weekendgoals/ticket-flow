import { splitRepo, parseEpic } from './report-body.js';

export const SETTINGS_KEY = 'settings';
export const CHOSEN_TARGETS_KEY = 'chosenTargets';
export const DEFAULT_BRANCH = 'flow-findings';

export const DEFAULT_SETTINGS = {
  token: '',
  label: 'flow:found',
  targets: []
};

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeTarget(stored, fallbackId) {
  const repo = text(stored && stored.repo);
  return {
    id: text(stored && stored.id) || fallbackId,
    name: text(stored && stored.name) || repo,
    repo,
    epic: text(stored && stored.epic),
    branch: text(stored && stored.branch) || DEFAULT_BRANCH
  };
}

export function migrateTargets(stored) {
  if (stored && Array.isArray(stored.targets)) return stored.targets;
  const repo = text(stored && stored.repo);
  if (!repo) return [];
  return [{ id: 'target-1', name: repo, repo, epic: stored.epic, branch: stored.branch }];
}

export function normalizeSettings(stored) {
  const targets = migrateTargets(stored)
    .map((target, position) => normalizeTarget(target, `target-${position + 1}`))
    .filter((target) => target.repo);
  return {
    token: text(stored && stored.token),
    label: text(stored && stored.label) || DEFAULT_SETTINGS.label,
    targets
  };
}

export function checkTargets(targets) {
  const names = new Set();
  for (const [position, target] of targets.entries()) {
    if (target.name && names.has(target.name)) {
      throw new Error(`Two targets are named ${target.name}; give each its own name`);
    }
    names.add(target.name);
    try {
      splitRepo(target.repo);
      parseEpic(target.epic);
    } catch (error) {
      throw new Error(`${target.name || `Target ${position + 1}`}: ${error.message}`);
    }
  }
}

export function originOf(url) {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? '' : origin;
  } catch {
    return '';
  }
}

export function chooseTarget(targets, chosen, origin, draftTargetId = '') {
  const byId = (id) => (id ? targets.find((target) => target.id === id) : undefined);
  const remembered = chosen && origin ? chosen[origin] : '';
  return byId(draftTargetId) || byId(remembered) || targets[0] || null;
}

export async function loadStoredSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY];
  const settings = normalizeSettings(raw);
  if (raw && !Array.isArray(raw.targets)) await saveSettings(settings);
  return settings;
}

export async function loadSettings() {
  const settings = await loadStoredSettings();
  checkTargets(settings.targets);
  return settings;
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}

export async function loadChosenTargets() {
  const stored = await chrome.storage.local.get(CHOSEN_TARGETS_KEY);
  const chosen = stored[CHOSEN_TARGETS_KEY];
  return chosen && typeof chosen === 'object' ? chosen : {};
}

export async function rememberTarget(origin, targetId) {
  if (!origin || !targetId) return;
  const chosen = await loadChosenTargets();
  await chrome.storage.local.set({ [CHOSEN_TARGETS_KEY]: { ...chosen, [origin]: targetId } });
}
