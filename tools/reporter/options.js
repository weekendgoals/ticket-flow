import { DEFAULT_SETTINGS, DEFAULT_BRANCH, loadSettings, saveSettings, normalizeSettings, checkTargets } from './settings.js';
import { getRepository } from './github.js';

const token = document.getElementById('token');
const label = document.getElementById('label');
const list = document.getElementById('targets');
const status = document.getElementById('status');

const TARGET_FIELDS = [
  { key: 'name', text: 'Name', help: 'Shown in the popup. Defaults to the repository.' },
  { key: 'repo', text: 'Repository (owner/name)' },
  { key: 'epic', text: 'Epic', help: 'An issue number, usually the open Bugs epic. Leave it empty to file with no epic.' },
  { key: 'branch', text: 'Screenshots branch', placeholder: DEFAULT_BRANCH }
];

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function renumber() {
  for (const [position, legend] of Array.from(list.querySelectorAll('legend')).entries()) {
    legend.textContent = `Target ${position + 1}`;
  }
}

function addTarget(target) {
  const box = document.createElement('fieldset');
  box.className = 'target';
  box.dataset.id = target.id || crypto.randomUUID();
  box.append(document.createElement('legend'));
  for (const field of TARGET_FIELDS) {
    const wrapper = document.createElement('label');
    wrapper.append(field.text);
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.key = field.key;
    input.value = target[field.key] || '';
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.key === 'epic') input.inputMode = 'numeric';
    wrapper.append(input);
    if (field.help) {
      const help = document.createElement('span');
      help.className = 'help muted';
      help.textContent = field.help;
      wrapper.append(help);
    }
    box.append(wrapper);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'secondary target-actions';
  remove.textContent = 'Remove target';
  remove.addEventListener('click', () => {
    box.remove();
    renumber();
  });
  box.append(remove);
  list.append(box);
  renumber();
}

function readTargets() {
  return Array.from(list.querySelectorAll('fieldset.target')).map((box) => {
    const target = { id: box.dataset.id };
    for (const input of box.querySelectorAll('input')) target[input.dataset.key] = input.value.trim();
    if (!target.name) target.name = target.repo;
    return target;
  });
}

function readForm() {
  const targets = readTargets();
  if (targets.length === 0) throw new Error('Add at least one target; the popup needs one to file.');
  checkTargets(targets);
  return normalizeSettings({ token: token.value, label: label.value, targets });
}

async function fill() {
  const settings = await loadSettings();
  token.value = settings.token;
  label.value = settings.label;
  label.placeholder = DEFAULT_SETTINGS.label;
  for (const target of settings.targets) addTarget(target);
  if (settings.targets.length === 0) addTarget({});
}

document.getElementById('add-target').addEventListener('click', () => addTarget({}));

document.getElementById('options').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await saveSettings(readForm());
    setStatus('Saved');
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById('test').addEventListener('click', async () => {
  setStatus('Testing…');
  try {
    const settings = readForm();
    const names = [];
    for (const target of settings.targets) {
      try {
        names.push((await getRepository(settings, target)).full_name);
      } catch (error) {
        throw new Error(`${target.name}: ${error.message}`);
      }
    }
    setStatus(`Token works: ${names.join(', ')}`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

fill();
