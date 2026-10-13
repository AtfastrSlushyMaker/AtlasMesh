const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const feedHttp = require('../dist/server/lib/http.js');
const { sources } = require('../dist/server/services/sources.js');
const { startAirportSource } = require('../dist/server/sources/airports.js');
const { startWeatherSource } = require('../dist/server/sources/weather.js');
const { startISSSource } = require('../dist/server/sources/iss.js');
const { startAircraftSource, isAircraftAuthenticated } = require('../dist/server/sources/aircraft.js');
const { startLaunchesSource } = require('../dist/server/sources/launches.js');
const { startCameraSource } = require('../dist/server/sources/cameras.js');
const { startIXPSource } = require('../dist/server/sources/ixp.js');

async function firstBatch(start) {
  let stop;
  let timeout;
  try {
    return await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Source did not emit a batch')), 1000);
      stop = start(resolve);
    });
  } finally {
    clearTimeout(timeout);
    stop?.();
  }
}

test('OpenFlights preserves quoted commas and escaped quotes without shifting coordinates', async (t) => {
  t.mock.method(feedHttp, 'fetchCached', async () =>
    '1,"Example, \"\"International\"\" Airport","City, Region","Country","ABC","ABCD",36.8,10.2,0,1,"E","Africa/Tunis","airport","OurAirports"\n');
  const entities = await firstBatch(startAirportSource);
  assert.equal(entities.length, 1);
  assert.equal(entities[0].id, 'airport:ABC');
  assert.equal(entities[0].metadata.name, 'Example, "International" Airport');
  assert.equal(entities[0].metadata.city, 'City, Region');
  assert.deepEqual(entities[0].position, { lat: 36.8, lon: 10.2, alt: 0 });
});

test('weather observation times use UTC Unix seconds across city time zones', async (t) => {
  const observedAt = 1791855000;
  t.mock.method(feedHttp.client, 'get', async (url) => {
    assert.equal(new URL(url).searchParams.get('timeformat'), 'unixtime');
    const count = new URL(url).searchParams.get('latitude').split(',').length;
    return { data: Array.from({ length: count }, () => ({
      timezone: 'America/New_York', current: { time: observedAt, weather_code: 0, temperature_2m: 20 },
    })) };
  });
  const entities = await firstBatch(startWeatherSource);
  assert.equal(entities.length, 60);
  assert.ok(entities.every((entity) => entity.timestamp === observedAt * 1000));
});

test('ISS outages report errors without inventing a fresh orbit or replacing the last observation', async (t) => {
  t.mock.method(feedHttp.client, 'get', async () => { throw new Error('upstream unavailable'); });
  let finish;
  const warning = new Promise((resolve) => { finish = resolve; });
  t.mock.method(console, 'warn', (...args) => finish(args));
  const emitted = [];
  const stop = startISSSource((batch) => emitted.push(batch));
  try {
    const args = await warning;
    assert.equal(args[0], '[ISS] API error:');
    assert.match(args[1], /upstream unavailable/);
    assert.deepEqual(emitted, []);
  } finally {
    stop();
  }
});

test('a feed fails immediately after its last good batch and recovers on its next good batch', () => {
  const id = 'test-feed';
  sources.register({ id, type: 'weather', label: 'Test', provider: 'Test', url: 'https://example.com', refreshMs: 60000 });
  sources.reportData(id, 60);
  const updatedAt = sources.list().find((source) => source.id === id).lastUpdate;
  sources.reportError(id, 'upstream unavailable');
  const failed = sources.list().find((source) => source.id === id);
  assert.equal(failed.status, 'error');
  assert.equal(failed.count, 60);
  assert.equal(failed.lastUpdate, updatedAt);
  sources.reportData(id, 60);
  const recovered = sources.list().find((source) => source.id === id);
  assert.equal(recovered.status, 'live');
  assert.equal(recovered.lastError, null);
});

test('OpenSky needs complete credentials and obtains a new token when they change', async (t) => {
  const keys = ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET', 'OPENSKY_USERNAME', 'OPENSKY_PASSWORD'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.OPENSKY_CLIENT_ID = 'first';
  assert.equal(isAircraftAuthenticated(), false);
  process.env.OPENSKY_CLIENT_SECRET = 'secret-one';
  assert.equal(isAircraftAuthenticated(), true);
  const requestedIds = [];
  const tokensUsed = [];
  t.mock.method(feedHttp.client, 'post', async (_url, body) => {
    const id = new URLSearchParams(body).get('client_id');
    requestedIds.push(id);
    return { data: { access_token: `token-${id}`, expires_in: 1800 } };
  });
  t.mock.method(feedHttp.client, 'get', async (_url, config) => {
    tokensUsed.push(config.headers.Authorization);
    return { data: { states: [] } };
  });
  try {
    await firstBatch(startAircraftSource);
    process.env.OPENSKY_CLIENT_ID = 'second';
    process.env.OPENSKY_CLIENT_SECRET = 'secret-two';
    await firstBatch(startAircraftSource);
    assert.deepEqual(requestedIds, ['first', 'second']);
    assert.deepEqual(tokensUsed, ['Bearer token-first', 'Bearer token-second']);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('stopping AIS cancels a pending reconnect and does not reopen a socket', async (t) => {
  const modulePath = require.resolve('ws');
  const originalModule = require.cache[modulePath];
  const sockets = [];
  class FakeSocket extends EventEmitter {
    constructor() { super(); sockets.push(this); }
    terminate() {}
    send() {}
  }
  require.cache[modulePath] = { ...originalModule, exports: FakeSocket };
  const adapterPath = require.resolve('../dist/server/sources/ais.js');
  delete require.cache[adapterPath];
  const { startAISSource } = require(adapterPath);
  const previousToken = process.env.AISSTREAM_TOKEN;
  process.env.AISSTREAM_TOKEN = 'test';
  t.mock.method(console, 'warn', () => {});
  let reconnect;
  let canceled = false;
  t.mock.method(global, 'setTimeout', (callback) => { reconnect = callback; return 123; });
  t.mock.method(global, 'clearTimeout', (handle) => { if (handle === 123) canceled = true; });
  try {
    const stop = startAISSource(() => {});
    sockets[0].emit('close');
    stop();
    assert.equal(canceled, true);
    reconnect(); // A callback already queued by the event loop must also be safe.
    assert.equal(sockets.length, 1);
  } finally {
    if (previousToken === undefined) delete process.env.AISSTREAM_TOKEN;
    else process.env.AISSTREAM_TOKEN = previousToken;
    require.cache[modulePath] = originalModule;
    delete require.cache[adapterPath];
  }
});

test('power and wind layers share a single parsed global catalogue during startup', async (t) => {
  let calls = 0;
  t.mock.method(feedHttp, 'fetchCached', async () => {
    calls++;
    return 'gppd_idnr,name,latitude,longitude,capacity_mw,commissioning_year,primary_fuel,country_long,owner\n' +
      'TEST001,Example,36.8,10.2,100,2020,Wind,Tunisia,Example Company\n';
  });
  const { loadPlants } = require('../dist/server/sources/powerplants.js');
  const [power, wind] = await Promise.all([loadPlants(), loadPlants()]);
  assert.equal(calls, 1);
  assert.equal(power, wind);
  assert.equal(power[0].capacityMw, 100);
});

test('expired disk data cannot make a failed launch refresh look newly retrieved', async (t) => {
  const url = `https://example.com/launches-${crypto.randomUUID()}`;
  const cacheDir = path.resolve(process.env.ATLAS_CACHE_DIR || path.join(process.cwd(), '.cache'));
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const file = path.join(cacheDir, `${hash}.cache`);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ url, data: { results: [] } }));
  t.after(() => fs.unlinkSync(file));
  const request = t.mock.method(feedHttp.client, 'get', async () => { throw new Error('launch API unavailable'); });
  assert.deepEqual(await feedHttp.fetchCached(url, 20 * 60 * 1000), { results: [] });
  assert.equal(request.mock.calls.length, 0);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  fs.utimesSync(file, yesterday, yesterday);
  await assert.rejects(feedHttp.fetchCached(url, 20 * 60 * 1000), /launch API unavailable/);
  let finish;
  const warning = new Promise((resolve) => { finish = resolve; });
  t.mock.method(console, 'warn', (...args) => finish(args));
  const emitted = [];
  const stop = startLaunchesSource((batch) => emitted.push(batch), { url });
  try {
    const args = await warning;
    assert.equal(args[0], '[Launches] Error:');
    assert.match(args[1], /launch API unavailable/);
    assert.deepEqual(emitted, []);
  } finally {
    stop();
  }
});

test('partial camera outages retain failed providers and keep the feed error visible', async (t) => {
  let refresh;
  let failed = false;
  t.mock.method(feedHttp, 'poll', (fn) => { refresh = fn; return () => {}; });
  t.mock.method(feedHttp, 'fetchCached', async (url) => {
    if (url.includes('tfl.gov.uk')) {
      if (failed) throw new Error('TfL unavailable');
      return [{ id: 'one', lat: 51.5, lon: 0, commonName: 'TfL camera',
        additionalProperties: [{ key: 'imageUrl', value: 'https://example.com/tfl.jpg' }] }];
    }
    if (url.includes('digitraffic.fi')) return { features: [] };
    if (url.includes('/d1/')) {
      if (failed) throw new Error('district unavailable');
      return { data: [{ cctv: { index: 1, inService: 'true',
        location: { latitude: '40', longitude: '-120', locationName: 'Caltrans camera' },
        imageData: { static: { currentImageURL: 'https://example.com/caltrans.jpg' } },
      } }] };
    }
    return { data: [] };
  });
  sources.register({ id: 'camera', type: 'camera', label: 'Cameras', provider: 'Test', url: 'https://example.com', refreshMs: 60000 });
  const events = [];
  const batches = [];
  t.mock.method(console, 'warn', (_tag, message) => {
    events.push('error');
    sources.reportError('camera', message);
  });
  startCameraSource((batch) => {
    events.push('data');
    batches.push(batch);
    sources.reportData('camera', batch.length);
  });
  await refresh();
  failed = true;
  events.length = 0;
  await refresh();
  assert.deepEqual(batches[1].map((entity) => entity.id), ['camera:tfl:one', 'camera:caltrans:1:1']);
  assert.deepEqual(events, ['data', 'error', 'error']);
  assert.equal(sources.list().find((source) => source.id === 'camera').status, 'error');
  failed = false;
  await refresh();
  assert.equal(sources.list().find((source) => source.id === 'camera').status, 'live');
});

test('IXPs use associated facility coordinates with explicit attribution and two daily catalogue requests', async (t) => {
  const requests = [];
  t.mock.method(feedHttp, 'fetchCached', async (url, ttl) => {
    requests.push(url);
    assert.equal(ttl, 24 * 60 * 60 * 1000);
    if (new URL(url).pathname === '/api/ix') {
      assert.equal(new URL(url).searchParams.get('depth'), '1');
      return { data: [
        { id: 1, name: 'Example exchange', city: 'Ashburn', country: 'US', fac_set: [1, 2], net_count: 345 },
        { id: 2, name: 'Zero coordinate exchange', city: 'Example', country: 'GH', fac_set: [3] },
        { id: 3, name: 'Unmapped exchange', fac_set: [4, 5] },
      ] };
    }
    assert.equal(new URL(url).pathname, '/api/fac');
    return { data: [
      { id: 1, name: 'Other site', city: 'London', country: 'GB', latitude: 51.5, longitude: 0 },
      { id: 2, name: 'Associated Ashburn site', city: 'Ashburn', country: 'US', latitude: 39.016363, longitude: -77.459023 },
      { id: 3, name: 'Zero coordinate site', city: 'Example', country: 'GH', latitude: 0, longitude: 0 },
      { id: 4, latitude: null, longitude: null },
      { id: 5, latitude: 91, longitude: 181 },
    ] };
  });
  const entities = await firstBatch(startIXPSource);
  assert.equal(requests.length, 2);
  assert.equal(entities.length, 2);
  assert.equal(entities[0].id, 'ixp:1');
  assert.deepEqual(entities[0].position, { lat: 39.016363, lon: -77.459023, alt: 0 });
  assert.equal(entities[0].metadata.facilityName, 'Associated Ashburn site');
  assert.equal(entities[0].metadata.facilitySourceUrl, 'https://www.peeringdb.com/fac/2');
  assert.match(entities[0].metadata.locationNote, /associated PeeringDB facility/);
  assert.deepEqual(entities[1].position, { lat: 0, lon: 0, alt: 0 });
});

for (const reason of ['missing coordinates', 'failed facility catalogue']) {
  test(`IXP ${reason} reports an error without a false empty snapshot and retries after ten minutes`, async (t) => {
    t.mock.method(feedHttp, 'fetchCached', async (url) => {
      if (new URL(url).pathname === '/api/ix') return { data: [{ id: 1, fac_set: [1] }] };
      if (reason === 'failed facility catalogue') throw new Error('facility API unavailable');
      return { data: [{ id: 1, latitude: null, longitude: null }] };
    });
    let finish;
    const warning = new Promise((resolve) => { finish = resolve; });
    t.mock.method(console, 'warn', (...args) => finish(args));
    let retryMs;
    t.mock.method(global, 'setTimeout', (_callback, ms) => { retryMs = ms; return 123; });
    t.mock.method(global, 'clearTimeout', () => {});
    const batches = [];
    const stop = startIXPSource((batch) => batches.push(batch));
    try {
      const args = await warning;
      assert.equal(args[0], '[IXP] Error:');
      assert.match(args[1], reason === 'missing coordinates' ? /No exchange locations could be mapped/ : /facility API unavailable/);
      assert.deepEqual(batches, []);
      assert.equal(retryMs, 10 * 60 * 1000);
    } finally {
      stop();
    }
  });
}
