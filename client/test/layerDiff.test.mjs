import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomDataSource } from 'cesium';
import { applyLayerDiff, clearLayerEntities } from '../src/globe/layerDiff.ts';

const entity = (id) => ({
  id,
  type: 'satellite',
  position: { lat: 0, lon: 0 },
  timestamp: 1,
  metadata: {},
});
const diff = (added = [], options = {}) => ({ added, updated: [], removed: [], ...options });

function layer() {
  const ds = new CustomDataSource('satellite');
  const entities = new Map();
  const index = new Map();
  const orbits = new Map();
  const removed = [];
  const spec = {
    type: 'satellite',
    create(e, source) {
      if (e.metadata.invalid) return null;
      orbits.set(e.id, { tle: 'sample' });
      source.entities.add({ id: `${e.id}:trail` });
      return source.entities.add({ id: e.id });
    },
    onRemove(id, source) {
      removed.push(id);
      orbits.delete(id);
      source.entities.removeById(`${id}:trail`);
    },
  };
  const apply = (message) => applyLayerDiff(message, ds, entities, spec, index);
  return { ds, entities, index, orbits, removed, spec, apply };
}

test('reconnect snapshots remove stale graphics and orbital state together', () => {
  const globe = layer();
  globe.apply(diff([entity('old'), entity('retained')]));
  globe.apply(diff([entity('retained'), entity('new')], { snapshot: ['satellite'] }));
  assert.deepEqual(globe.removed.sort(), ['old', 'retained']);
  assert.deepEqual([...globe.entities.keys()].sort(), ['new', 'retained']);
  assert.deepEqual([...globe.orbits.keys()].sort(), ['new', 'retained']);
  assert.deepEqual([...globe.index.keys()].sort(), ['new', 'retained']);
  assert.equal(globe.ds.entities.getById('old:trail'), undefined);
});

test('disabling a layer releases graphics, search records and auxiliary state', () => {
  const globe = layer();
  globe.apply(diff([entity('first'), entity('second')]));
  clearLayerEntities(globe.ds, globe.entities, globe.spec, globe.index);
  assert.equal(globe.ds.entities.values.length, 0);
  assert.equal(globe.entities.size, 0);
  assert.equal(globe.index.size, 0);
  assert.equal(globe.orbits.size, 0);
});

test('an entity that cannot be rendered is not left searchable', () => {
  const globe = layer();
  const invalid = { ...entity('invalid'), metadata: { invalid: true } };
  globe.apply(diff([invalid]));
  assert.equal(globe.index.has('invalid'), false);
  globe.apply(diff([entity('valid')]));
  globe.apply(diff([], { updated: [{ ...entity('valid'), metadata: { invalid: true } }] }));
  assert.equal(globe.index.has('valid'), false);
  assert.equal(globe.entities.has('valid'), false);
  assert.equal(globe.orbits.size, 0);
});

test('chunked snapshots clear once and retain subsequent chunks', () => {
  const globe = layer();
  globe.apply(diff([entity('old')]));
  globe.apply(diff([entity('first')], { snapshot: ['satellite'] }));
  globe.apply(diff([entity('second')]));
  assert.deepEqual([...globe.entities.keys()], ['first', 'second']);
  globe.apply(diff([], { removed: ['first'] }));
  assert.equal(globe.index.has('first'), false);
  assert.equal(globe.orbits.has('first'), false);
  assert.equal(globe.ds.entities.getById('first:trail'), undefined);
});
