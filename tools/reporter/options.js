import { DEFAULT_SETTINGS, loadSettings, saveSettings, normalizeSettings } from './settings.js';
import { getRepository } from './github.js';

const fields = {
  token: document.getElementById('token'),
  repo: document.getElementById('repo'),
  branch: document.getElementById('branch'),
  label: document.getElementById('label')
};
const status = document.getElementById('status');

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function readForm() {
  const values = {};
  for (const key of Object.keys(fields)) values[key] = fields[key].value;
  return normalizeSettings(values);
}

async function fill() {
  const settings = await loadSettings();
  for (const key of Object.keys(fields)) {
    fields[key].value = settings[key];
    if (key !== 'token') fields[key].placeholder = DEFAULT_SETTINGS[key];
  }
}

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
    const repository = await getRepository(readForm());
    setStatus(`Token works: ${repository.full_name}`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

fill();
