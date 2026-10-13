const assert = require('node:assert/strict');
const test = require('node:test');
const { WebSocket } = require('ws');
const { store, haversineKm } = require('../dist/server/services/store.js');
const { canEditSettings, isShowcase } = require('../dist/server/lib/access.js');
const { MAX_BUFFERED_BYTES, sendSocketMessage } = require('../dist/server/lib/socket.js');

function entity(type, timestamp, position = { lat: 36, lon: 10 }) {
  return { id: `${type}:test`, type, timestamp, position, metadata: { name: 'Test' } };
}

test('stationary observations publish fresh timestamps without rebroadcasting static datasets', () => {
  store.processForType('ship', []);
  store.processForType('airport', []);
  store.processForType('ship', [entity('ship', 100)]);
  const observed = store.processForType('ship', [entity('ship', 200)]);
  assert.equal(observed.updated.length, 1);
  assert.equal(observed.updated[0].timestamp, 200);
  store.processForType('airport', [entity('airport', 100)]);
  const refreshed = store.processForType('airport', [entity('airport', 200)]);
  assert.equal(refreshed.updated.length, 0);
  assert.equal(store.getById('airport:test').timestamp, 200);
});

test('invalid geographic positions are excluded and antipodal distances remain finite', () => {
  const diff = store.processForType('weather', [entity('weather', 100, { lat: 91, lon: 10 })]);
  assert.equal(diff.added.length, 0);
  assert.equal(store.count('weather'), 0);
  const distance = haversineKm(-82, 0, 82, 180);
  assert.equal(Number.isFinite(distance), true);
  assert.ok(Math.abs(distance - Math.PI * 6371) < 0.001);
});

test('local settings reject foreign browser origins and keep Vite proxy and key access working', () => {
  const names = ['RENDER', 'ATLAS_MODE', 'OSINT_ACCESS_KEY', 'ATLAS_ALLOW_SETTINGS', 'ALLOWED_ORIGINS'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const request = (headers = {}, remoteAddress = '127.0.0.1') => ({
    protocol: 'http', socket: { remoteAddress }, get: (name) => headers[name.toLowerCase()],
  });
  try {
    for (const name of names) delete process.env[name];
    assert.equal(canEditSettings(request()), true);
    assert.equal(canEditSettings(request({ host: 'localhost:3000', origin: 'http://evil.example' })), false);
    assert.equal(canEditSettings(request({ host: 'localhost:5173', origin: 'http://localhost:5173' })), true);
    assert.equal(canEditSettings(request({ host: 'localhost:3000', origin: 'null' })), false);
    assert.equal(canEditSettings(request({ 'x-forwarded-for': '203.0.113.5' })), false);
    process.env.ATLAS_ALLOW_SETTINGS = '1';
    assert.equal(canEditSettings(request({ host: 'localhost:3000', origin: 'http://localhost:3000' }, '172.18.0.1')), true);
    assert.equal(canEditSettings(request({ host: 'localhost:3000', origin: 'http://evil.example' }, '172.18.0.1')), false);
    process.env.OSINT_ACCESS_KEY = 'workspace-key';
    assert.equal(canEditSettings(request()), false);
    assert.equal(canEditSettings(request({ 'x-atlas-key': 'workspace-key' }, '203.0.113.5')), true);
    process.env.ATLAS_MODE = 'showcase';
    assert.equal(canEditSettings(request({ 'x-atlas-key': 'workspace-key' })), false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('Render defaults to showcase and only allows explicit full mode with an access key', () => {
  const names = ['RENDER', 'ATLAS_MODE', 'OSINT_ACCESS_KEY'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.equal(isShowcase(), false);
    process.env.RENDER = 'true';
    assert.equal(isShowcase(), true);
    process.env.ATLAS_MODE = 'full';
    assert.equal(isShowcase(), true);
    process.env.OSINT_ACCESS_KEY = 'private-workspace';
    assert.equal(isShowcase(), false);
    process.env.ATLAS_MODE = 'showcase';
    assert.equal(isShowcase(), true);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('WebSocket output terminates stalled clients instead of dropping diffs or buffering indefinitely', () => {
  let sent;
  let terminated = 0;
  const ws = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(payload, callback) { sent = payload; callback(); },
    terminate() { terminated++; },
  };
  assert.equal(sendSocketMessage(ws, { type: 'pong' }), true);
  assert.deepEqual(JSON.parse(sent), { type: 'pong' });
  ws.bufferedAmount = MAX_BUFFERED_BYTES;
  sent = null;
  assert.equal(sendSocketMessage(ws, { type: 'update' }), false);
  assert.equal(terminated, 1);
  assert.equal(sent, null);
  ws.readyState = WebSocket.CLOSED;
  assert.equal(sendSocketMessage(ws, { type: 'update' }), false);
});
