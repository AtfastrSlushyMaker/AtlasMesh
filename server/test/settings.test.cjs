const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('failed settings persistence leaves the previous key active and the previous file intact', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-settings-'));
  const file = path.join(directory, 'settings.json');
  const previousFile = process.env.ATLAS_SETTINGS_FILE;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.ATLAS_SETTINGS_FILE = file;
  delete process.env.DEEPSEEK_API_KEY;
  const { loadSettings, updateSettings } = require('../dist/server/services/config.js');
  try {
    loadSettings();
    updateSettings({ DEEPSEEK_API_KEY: 'first-key' });
    const stored = fs.readFileSync(file, 'utf8');
    t.mock.method(fs, 'renameSync', () => { throw new Error('disk unavailable'); });
    assert.throws(() => updateSettings({ DEEPSEEK_API_KEY: 'replacement-key' }), /disk unavailable/);
    assert.equal(process.env.DEEPSEEK_API_KEY, 'first-key');
    assert.equal(fs.readFileSync(file, 'utf8'), stored);
  } finally {
    if (previousFile === undefined) delete process.env.ATLAS_SETTINGS_FILE;
    else process.env.ATLAS_SETTINGS_FILE = previousFile;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
