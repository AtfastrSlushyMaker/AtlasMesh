import assert from 'node:assert/strict';
import test from 'node:test';
import { clearOverlays, setOverlay } from '../src/globe/engine.ts';

function viewer() {
  const layers = [];
  let destroyed = false;
  return {
    layers,
    isDestroyed: () => destroyed,
    destroy: () => { destroyed = true; },
    scene: { requestRender() {} },
    imageryLayers: {
      addImageryProvider(provider) {
        const layer = { provider };
        layers.push(layer);
        return layer;
      },
      remove(layer) {
        const at = layers.indexOf(layer);
        if (at < 0) return false;
        layers.splice(at, 1);
        return true;
      },
      raiseToTop(layer) {
        assert.ok(layers.includes(layer), 'labels belong to the current viewer');
      },
    },
  };
}

const radarMetadata = (path = '/v2/radar/first') => ({
  ok: true,
  json: async () => ({ host: 'https://example.com', radar: { past: [{ path }] } }),
});

test('a delayed radar fetch cannot turn a disabled overlay back on', async (t) => {
  let complete;
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => { complete = resolve; }));
  const globe = viewer();
  const pending = setOverlay(globe, 'radar', true, 'satellite');
  await setOverlay(globe, 'radar', false, 'satellite');
  complete(radarMetadata());
  await pending;
  assert.equal(globe.layers.length, 0);
});

test('the newest labels win when the base map changes rapidly', async () => {
  const globe = viewer();
  await Promise.all([
    setOverlay(globe, 'labels', true, 'dark'),
    setOverlay(globe, 'labels', true, 'light'),
  ]);
  assert.equal(globe.layers.length, 1);
  assert.match(globe.layers[0].provider.url, /World_Light_Gray_Reference/);
  clearOverlays(globe);
});

test('imagery and teardown are isolated for each viewer', async () => {
  const first = viewer();
  const second = viewer();
  await setOverlay(first, 'labels', true, 'dark');
  await setOverlay(second, 'labels', true, 'light');
  clearOverlays(first);
  assert.equal(first.layers.length, 0);
  assert.equal(second.layers.length, 1);
  await setOverlay(second, 'clouds', true, 'satellite');
  assert.equal(second.layers.length, 2);
  clearOverlays(second);
});

test('teardown cancels an in-flight overlay without adding it to a destroyed viewer', async (t) => {
  let complete;
  let signal;
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    signal = init.signal;
    return new Promise((resolve) => { complete = resolve; });
  });
  const globe = viewer();
  const pending = setOverlay(globe, 'radar', true, 'satellite');
  clearOverlays(globe);
  globe.destroy();
  complete(radarMetadata());
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(globe.layers.length, 0);
});

test('failed radar refreshes preserve the last loaded imagery', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => radarMetadata());
  const globe = viewer();
  await setOverlay(globe, 'radar', true, 'satellite');
  const original = globe.layers[0];
  globalThis.fetch.mock.mockImplementation(async () => ({ ok: false, status: 503 }));
  await assert.rejects(setOverlay(globe, 'radar', true, 'satellite'), /503/);
  assert.deepEqual(globe.layers, [original]);
  clearOverlays(globe);
});
