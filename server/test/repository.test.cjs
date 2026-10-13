const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('deleting an investigation cancels its pending persistence and ignores unknown filesystem paths', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlasmesh-repository-'));
  process.env.OSINT_DATA_DIR = path.join(directory, 'osint');
  try {
    const { repo } = require('../dist/server/osint/repository.js');
    const investigation = { id: 'inv_test', title: 'Pending', nodes: {}, edges: {}, jobs: [] };
    repo.save(investigation);
    assert.equal(repo.delete(investigation.id), true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(repo.get(investigation.id), undefined);
    assert.equal(fs.existsSync(path.join(process.env.OSINT_DATA_DIR, 'inv_test.json')), false);
    const settings = path.join(directory, 'settings.json');
    fs.writeFileSync(settings, '{"saved":true}');
    assert.equal(repo.delete('../settings'), false);
    assert.equal(fs.readFileSync(settings, 'utf8'), '{"saved":true}');
    const pending = { id: 'inv_flush', title: 'Restart', nodes: {}, edges: {}, jobs: [] };
    repo.save(pending);
    repo.flush();
    const flushed = JSON.parse(fs.readFileSync(path.join(process.env.OSINT_DATA_DIR, 'inv_flush.json'), 'utf8'));
    assert.equal(flushed.title, 'Restart');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
