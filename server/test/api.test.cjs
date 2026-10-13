const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WebSocket } = require('ws');

test('production HTTP/WebSocket serves compiled assets and snapshots while protecting settings and validating queries', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlasmesh-api-'));
  const entry = path.resolve(__dirname, '../dist/server/src/index.js');
  const start = path.resolve(__dirname, '../start.cjs');
  // Keep tests independent of upstream APIs, API credentials, and fixed ports.
  const script = `
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (parent?.filename === ${JSON.stringify(entry)} && request.startsWith('../sources/')) {
        return new Proxy({}, { get: (_, key) => {
          if (key === 'isAircraftAuthenticated') return () => false;
          if (key === 'startEarthquakesSource') return (onEntities) => {
            const immediate = setImmediate(() => onEntities([{
              id: 'earthquake:regression', type: 'earthquake',
              position: { lat: 36.8, lon: 10.2, alt: 0 }, timestamp: 1700000000000,
              metadata: { name: 'Regression quake', place: 'Tunis', mag: 5.2 },
            }]));
            return () => clearImmediate(immediate);
          };
          return () => () => {};
        } });
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    const http = require('node:http');
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function(_, callback) {
      this.once('listening', () => process.send({ port: this.address().port }));
      return listen.call(this, 0, '127.0.0.1', callback);
    };
    process.on('message', ({ mode }) => {
      process.env.ATLAS_MODE = mode;
      process.send({ mode });
    });
    require(${JSON.stringify(start)});
  `;
  const child = spawn(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: '',
      ATLAS_MODE: 'showcase',
      RENDER: '',
      OSINT_ACCESS_KEY: 'abcd',
      LLM_BASE_URL: 'https://private-endpoint.example/v1',
      OSINT_DATA_DIR: path.join(directory, 'osint'),
      ATLAS_SETTINGS_FILE: path.join(directory, 'settings.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10000);
      child.once('message', ({ port }) => { clearTimeout(timer); resolve(port); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
    });
    const request = (route, init) => fetch(`http://127.0.0.1:${port}${route}`, init);
    const page = await request('/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const html = await page.text();
    assert.match(html, /<div id="root"><\/div>/);
    const bundle = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
    const stylesheet = html.match(/href="(\/assets\/[^\"]+\.css)"/)?.[1];
    assert.ok(bundle, 'production entry references its JavaScript bundle');
    assert.ok(stylesheet, 'production entry references its stylesheet');
    const workerDirectory = path.resolve(__dirname, '../../client/dist/cesium/Workers');
    const worker = fs.readdirSync(workerDirectory).find((file) => file.endsWith('.js'));
    for (const [route, mime] of [
      [bundle, /javascript/], [stylesheet, /text\/css/],
      ['/cesium/Cesium.js', /javascript/], ['/cesium/Widgets/widgets.css', /text\/css/],
      [`/cesium/Workers/${worker}`, /javascript/],
    ]) {
      const asset = await request(route);
      assert.equal(asset.status, 200, route);
      assert.match(asset.headers.get('content-type'), mime, route);
      const text = await asset.text();
      assert.ok(text.length > 20, route);
      assert.doesNotMatch(text.slice(0, 100), /<!doctype|<html/i, route);
    }
    const terrain = await request('/cesium/Assets/approximateTerrainHeights.json');
    assert.match(terrain.headers.get('content-type'), /application\/json/);
    assert.ok(Object.keys(await terrain.json()).length > 0);
    const tile = await request('/cesium/Assets/Textures/NaturalEarthII/0/0/0.jpg');
    assert.match(tile.headers.get('content-type'), /image\/jpeg/);
    assert.deepEqual([...new Uint8Array(await tile.arrayBuffer()).slice(0, 2)], [0xff, 0xd8]);
    for (const query of [
      'lat=&lon=0', 'lat=91&lon=0', 'lat=0&lon=181',
      'lat=0&lon=0&radiusKm=-1', 'lat=0&lon=0&radiusKm=Infinity',
    ]) assert.equal((await request(`/api/near?${query}`)).status, 400, query);
    assert.equal((await request('/api/near?lat=0&lon=0')).status, 200);
    for (const limit of ['-1', '0', 'Infinity', '1.5']) {
      assert.equal((await request(`/api/entities?limit=${limit}`)).status, 400, limit);
    }
    assert.equal((await request('/api/entities?limit=20001')).status, 200);
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    try {
      await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      const reply = (message, matches) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error('WebSocket reply timed out')); }, 5000);
        const onMessage = (data) => {
          const value = JSON.parse(data.toString());
          if (!matches(value)) return;
          clearTimeout(timer);
          socket.off('message', onMessage);
          resolve(value);
        };
        socket.on('message', onMessage);
        socket.send(JSON.stringify(message));
      });
      const snapshot = await reply({ type: 'subscribe', layers: ['earthquake'] }, (message) => message.type === 'update' && message.snapshot?.includes('earthquake'));
      assert.equal(snapshot.added.length, 1);
      assert.equal(snapshot.added[0].id, 'earthquake:regression');
      assert.deepEqual(snapshot.added[0].position, { lat: 36.8, lon: 10.2, alt: 0 });
      assert.equal((await reply({ type: 'ping' }, (message) => message.type === 'pong')).type, 'pong');
    } finally {
      socket.terminate();
    }
    const settings = await (await request('/api/settings')).json();
    assert.equal(settings.canEdit, false);
    assert.ok(settings.settings.every((setting) => setting.preview === null));
    assert.equal((await request('/api/osint/investigations')).status, 403);
    assert.equal((await request('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-atlas-key': 'abcd' },
      body: JSON.stringify({ values: { AISSTREAM_TOKEN: 'visitor-key' } }),
    })).status, 403);
    await new Promise((resolve) => {
      child.once('message', resolve);
      child.send({ mode: 'full' });
    });
    const locked = await (await request('/api/settings')).json();
    assert.equal(locked.canEdit, false);
    assert.ok(locked.settings.every((setting) => setting.preview === null));
    const unlocked = await (await request('/api/settings', { headers: { 'x-atlas-key': 'abcd' } })).json();
    assert.equal(unlocked.canEdit, true);
    assert.equal(unlocked.settings.find((setting) => setting.key === 'LLM_BASE_URL').preview, 'https://private-endpoint.example/v1');
    assert.equal((await request('/api/osint/investigations')).status, 401);
    assert.equal((await request('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-atlas-key': 'abcd' },
      body: JSON.stringify({ values: [] }),
    })).status, 400);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
