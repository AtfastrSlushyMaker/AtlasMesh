const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { redactSecrets } = require('../dist/server/lib/secrets.js');
const { sources } = require('../dist/server/services/sources.js');

test('secret redaction covers configured keys, URL encodings and unsaved drafts', () => {
  const previous = process.env.DEEPSEEK_API_KEY;
  const configured = 'fabricated+$ key/with?punctuation';
  const draft = 'unsaved+$ key/with?punctuation';
  process.env.DEEPSEEK_API_KEY = configured;
  try {
    const variants = [configured, encodeURIComponent(configured), encodeURIComponent(configured).toLowerCase(),
      new URLSearchParams({ key: configured }).toString().slice(4), draft, encodeURIComponent(draft)];
    assert.equal(redactSecrets(variants.join(' | '), [draft]), variants.map(() => '[redacted]').join(' | '));
    assert.equal(redactSecrets('ordinary upstream timeout'), 'ordinary upstream timeout');
    assert.equal(redactSecrets('malformed \ud800 draft', ['\ud800']), 'malformed [redacted] draft');
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  }
});

test('public source health redacts complete credentials before its message limit', () => {
  const previous = process.env.S2_API_KEY;
  const key = 'fabricated-semantic-scholar-token-long-enough-to-cross-the-message-limit';
  process.env.S2_API_KEY = key;
  try {
    sources.register({ id: 'redaction-test', type: 'aircraft', label: 'Test', provider: 'Test', url: 'https://example.com', refreshMs: 1000 });
    sources.reportError('redaction-test', `Upstream ${'x'.repeat(170)} key=${key} encoded=${encodeURIComponent(key)} failed`);
    const entry = sources.list().find((source) => source.id === 'redaction-test');
    assert.equal(entry.status, 'error');
    assert.equal(entry.lastError.length, 200);
    assert.ok(entry.lastError.includes('[redacted]'));
    assert.equal(entry.lastError.includes('fabricated-semantic'), false);
    assert.equal(JSON.stringify(entry).includes(key), false);
    // Also cover an encoded credential independent of the raw-string fixture.
    process.env.S2_API_KEY = 'fabricated/key+query';
    sources.reportError('redaction-test', `Invalid key ${encodeURIComponent(process.env.S2_API_KEY)}`);
    assert.equal(sources.list().find((source) => source.id === 'redaction-test').lastError, 'Invalid key [redacted]');
  } finally {
    if (previous === undefined) delete process.env.S2_API_KEY;
    else process.env.S2_API_KEY = previous;
  }
});

test('AIS key-test errors redact an unsaved tested key before truncation', async () => {
  const modulePath = require.resolve('ws');
  const originalModule = require.cache[modulePath];
  const sockets = [];
  class FakeSocket extends EventEmitter {
    constructor() { super(); sockets.push(this); }
    close() {}
    send() {}
  }
  require.cache[modulePath] = { ...originalModule, exports: FakeSocket };
  const adapterPath = require.resolve('../dist/server/services/settingsTest.js');
  delete require.cache[adapterPath];
  try {
    const { testSetting } = require(adapterPath);
    const draft = 'fabricated-unsaved-ais-token-that-crosses-message-limit';
    const result = testSetting('AISSTREAM_TOKEN', draft);
    sockets[0].emit('message', Buffer.from(`error ${'x'.repeat(110)} key=${draft}`));
    const response = await result;
    assert.equal(response.ok, false);
    assert.equal(response.message.includes('fabricated'), false);
    assert.ok(response.message.includes('[redacted]'));
    assert.ok(response.message.length <= 160);
  } finally {
    require.cache[modulePath] = originalModule;
    delete require.cache[adapterPath];
  }
});

test('demo feeds do not direct visitors to enter server API keys', () => {
  const previousMode = process.env.ATLAS_MODE;
  const previousToken = process.env.AISSTREAM_TOKEN;
  try {
    process.env.ATLAS_MODE = 'showcase';
    delete process.env.AISSTREAM_TOKEN;
    sources.register({ id: 'demo-key-note', type: 'ship', label: 'Ships', provider: 'Test', url: 'https://example.com', refreshMs: 1000, requires: ['AISSTREAM_TOKEN'] });
    const source = sources.list().find((source) => source.id === 'demo-key-note');
    assert.equal(source.status, 'disabled');
    assert.equal(source.note, 'This feed is unavailable on the public demo.');
    assert.doesNotMatch(source.note, /Settings|AISSTREAM_TOKEN/);
  } finally {
    if (previousMode === undefined) delete process.env.ATLAS_MODE;
    else process.env.ATLAS_MODE = previousMode;
    if (previousToken === undefined) delete process.env.AISSTREAM_TOKEN;
    else process.env.AISSTREAM_TOKEN = previousToken;
  }
});
