import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Node's module mocks let these tests render the real Settings component with
// controlled store snapshots, without adding a browser or test dependency.
if (!process.env.ATLASMESH_SETTINGS_TEST_WORKER) {
  test('Settings protects demo and unresolved server configuration', () => {
    const env = {
      ...process.env,
      ATLASMESH_SETTINGS_TEST_WORKER: '1',
      TSX_TSCONFIG_PATH: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
    };
    // The outer runner's context makes a nested --test invocation skip its
    // runner. This subprocess needs its own runner so failures affect status.
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', '--import', 'tsx', '--test', fileURLToPath(import.meta.url),
    ], {
      encoding: 'utf8',
      env,
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
} else {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { mock } = await import('node:test');
  const defaults = {
    theme: 'day', units: 'metric', clock: 'utc', quality: 'balanced', motion: 'system', welcomeDone: false,
    intelDefaults: { maxDepth: 2, maxRequestsPerJob: 60, maxNodes: 400, minConfidence: 0.6 },
  };
  let state;
  mock.module('../src/state.ts', { namedExports: {
    DEFAULT_PREFS: defaults,
    useApp: (select) => select(state),
    setApp() {},
    setPrefs() {},
  } });
  const { Settings } = await import('../src/shell/Settings.tsx');

  function render(mode, section) {
    state = {
      settings: section,
      server: mode ? { mode, repoUrl: '', image: '' } : null,
      prefs: defaults,
      basemap: 'satellite', lighting: true,
      overlays: { labels: true, radar: false, clouds: false, nightlights: false },
    };
    return renderToStaticMarkup(React.createElement(Settings));
  }

  for (const mode of ['showcase', null]) {
    test(`${mode ?? 'unresolved'} config hides credential and Intel settings, including retained selections`, () => {
      for (const section of ['general', 'globe', 'about', 'keys', 'intel']) {
        const html = render(mode, section);
        const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];
        assert.ok(nav);
        assert.match(nav, />General<|>General<\/button>/);
        assert.match(nav, /Globe &amp; map/);
        assert.match(nav, /About &amp; data/);
        assert.doesNotMatch(nav, /API keys|Intel workspace/);
        assert.doesNotMatch(html, /type="password"|id="s-keys"|id="s-intel"|Requests per run/);
        if (section === 'keys' || section === 'intel') assert.match(html, /id="s-general"/);
      }
    });
  }

  test('demo General settings explain how to run a local copy', () => {
    const html = render('showcase', 'general');
    assert.match(html, /This is the public demo/);
    assert.match(html, /docker run/);
    assert.match(html, /git clone/);
  });

  test('explicit full configuration preserves local API key and Intel settings', () => {
    const keys = render('full', 'keys');
    assert.match(keys, /id="s-keys"/);
    assert.match(keys, /API keys/);
    const intel = render('full', 'intel');
    assert.match(intel, /id="s-intel"/);
    assert.match(intel, /Requests per run/);
    assert.match(intel, /id="device-key"[^>]*type="password"/);
  });
}
