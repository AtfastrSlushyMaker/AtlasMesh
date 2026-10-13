const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns/promises');
const { client } = require('../dist/server/lib/http.js');
const { isPrivateAddress, assertPublicUrl, safeGet, safeFetchPage, robotsAllows, SafetyError } = require('../dist/server/osint/safety.js');

test('private address checks cover IPv4-mapped and expanded IPv6 and the entire link-local subnet', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', '0:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:a00:1', 'fe9f::1', 'febf::1', 'fd00::1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '2606:4700:4700::1111', '::ffff:808:808']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('private literals, credentials and non-default ports are refused before a request', async () => {
  for (const url of ['http://[::ffff:7f00:1]/', 'http://[fe90::1]/', 'http://127.0.0.1/',
    'https://user:pass@example.com/', 'https://example.com:9000/']) {
    await assert.rejects(assertPublicUrl(url), SafetyError);
  }
});

test('API redirects are checked and cannot reach metadata addresses', async (t) => {
  let requests = 0;
  t.mock.method(client, 'get', async () => {
    requests++;
    return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } };
  });
  await assert.rejects(safeGet('https://8.8.8.8/'), SafetyError);
  assert.equal(requests, 1);
});

test('socket lookup uses the validated DNS address and cross-origin redirects drop credentials', async (t) => {
  let lookups = 0;
  t.mock.method(dns, 'lookup', async () => {
    lookups++;
    return [{ address: '8.8.8.8', family: 4 }];
  });
  const requests = [];
  t.mock.method(client, 'get', async (url, config) => {
    requests.push({ url, config });
    config.lookup('safe.example', {}, (error, ip, family) => {
      assert.equal(error, null);
      assert.equal(ip, '8.8.8.8');
      assert.equal(family, 4);
    });
    return requests.length === 1
      ? { status: 302, headers: { location: 'https://other.example/final' } }
      : { status: 200, headers: {}, data: { ok: true } };
  });
  const result = await safeGet('https://safe.example/start', { headers: { Authorization: 'token', Cookie: 'secret', Accept: 'application/json' } });
  assert.equal(lookups, 2);
  assert.equal(result.url, 'https://other.example/final');
  assert.equal(requests[1].config.headers.Authorization, undefined);
  assert.equal(requests[1].config.headers.Cookie, undefined);
  assert.equal(requests[1].config.headers.Accept, 'application/json');
  assert.equal(requests[0].config.proxy, false);
  assert.equal(requests[0].config.maxRedirects, 0);
});

test('robots.txt redirects cannot request private addresses', async (t) => {
  t.mock.method(client, 'get', async () => ({ status: 302, headers: { location: 'http://[::ffff:7f00:1]/secret' } }));
  await assert.rejects(robotsAllows('https://8.8.4.4/'), SafetyError);
});

test('a redirected page honours the destination robots.txt before fetching it', async (t) => {
  const visited = [];
  t.mock.method(client, 'get', async (url) => {
    visited.push(url);
    if (url === 'https://1.1.1.1/robots.txt') return { status: 200, headers: {}, data: 'User-agent: *\nAllow: /' };
    if (url === 'https://1.0.0.1/robots.txt') return { status: 200, headers: {}, data: 'User-agent: *\nDisallow: /private' };
    return { status: 302, headers: { location: 'https://1.0.0.1/private' } };
  });
  await assert.rejects(safeFetchPage('https://1.1.1.1/start'), SafetyError);
  assert.equal(visited.includes('https://1.0.0.1/private'), false);
});

test('redirect hops reserve individual HTTP requests and stop at the job budget', async (t) => {
  let requests = 0;
  let budget = 1;
  const exhausted = new Error('budget reached');
  const reserve = () => { if (!budget--) throw exhausted; };
  t.mock.method(client, 'get', async () => {
    requests++;
    return { status: 302, headers: { location: '/next' } };
  });
  await assert.rejects(safeGet('https://9.9.9.9/start', {}, false, reserve), (error) => error === exhausted);
  assert.equal(requests, 1);
});

test('robots requests use the same job budget and do not swallow exhaustion', async (t) => {
  let requests = 0;
  let budget = 1;
  const exhausted = new Error('budget reached');
  const reserve = () => { if (!budget--) throw exhausted; };
  t.mock.method(client, 'get', async () => {
    requests++;
    return { status: 200, headers: {}, data: 'User-agent: *\nAllow: /' };
  });
  await assert.rejects(safeFetchPage('https://149.112.112.112/page', undefined, reserve), (error) => error === exhausted);
  assert.equal(requests, 1);
  await assert.rejects(robotsAllows('https://208.67.222.222/', () => { throw exhausted; }), (error) => error === exhausted);
});
