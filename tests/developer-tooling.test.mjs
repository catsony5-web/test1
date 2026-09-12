import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { once } from 'node:events';
import { buildWeb } from '../scripts/build-web.mjs';
import { createPreviewServer } from '../scripts/serve.mjs';
import { syncCacheManifest } from '../scripts/sync-cache-manifest.mjs';
import { publicAssetPath, publicAssets, resolvePublicFile } from '../scripts/lib/public-assets.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'budget-tooling-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    'service-worker.js': 'const APP_FILES = ["./", "./index.html", "./app-icon.svg"];',
    'index.html': '<html><link rel="icon" href="app-icon.svg"></html>',
    'manifest.webmanifest': '{"icons":[{"src":"./app-icon.svg"}]}',
    'app-icon.svg': '<svg></svg>', '.nojekyll': '',
    '.env': 'SYNTHETIC_SECRET=fixture', 'backups/private.json': '{"fixture":true}',
    'server/src/private.mjs': '// synthetic development source', 'audit/screen.png': 'fixture'
  };
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), body);
  }
  return root;
}

test('public manifest rejects traversal, private exports and unapproved asset types', () => {
  for (const path of ['./../index.html', './src/../../.env', './.env', './backups/private.json',
    './assets/private.xlsx', './assets/vendor/extra.js', './src/utils/backup.json',
    'https://outside.test/a.js', './index.html?private=1', './src\\utils\\format.js']) {
    assert.throws(() => publicAssetPath(path));
  }
  assert.equal(publicAssetPath('./src/utils/backup.js'), 'src/utils/backup.js');
  assert.equal(publicAssetPath('./src/utils/backup.js?v=182-maintenance'), 'src/utils/backup.js');
});

test('HTML/cache query drift fails validation; sync preserves file boundaries and aligns exact URLs', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'index.html'), '<link rel="icon" href="app-icon.svg?v=2">');
  await assert.rejects(publicAssets(root), /HTML\/cache URL mismatch/);
  await syncCacheManifest(root);
  assert.equal((await publicAssets(root)).length, 5);
  assert.match(await readFile(join(root, 'service-worker.js'), 'utf8'), /app-icon.svg\?v=2/);
  await writeFile(join(root, 'index.html'), '<script src="server/src/private.mjs"></script>');
  await assert.rejects(syncCacheManifest(root), /Not an approved public asset/);
});

test('public manifest rejects missing HTML dependencies and private list additions', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'index.html'), '<script src="src/utils/format.js"></script>');
  await assert.rejects(publicAssets(root), /HTML asset missing/);
  await writeFile(join(root, 'service-worker.js'), 'const APP_FILES = ["./.env"];');
  await assert.rejects(publicAssets(root), /Not an approved public asset/);
});

test('build copies only public assets and clears stale output without changing private input', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist', 'stale.txt'), 'stale');
  const result = await buildWeb(root);
  assert.deepEqual((await readdir(result.output)).sort(), result.files);
  assert.equal(result.files.length, 5);
  assert.equal(await readFile(join(root, '.env'), 'utf8'), 'SYNTHETIC_SECRET=fixture');
});

test('linked asset directories are rejected even if the target is inside the repository', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'target'));
  await writeFile(join(root, 'target', 'format.js'), 'void 0;');
  await mkdir(join(root, 'src'));
  try { await symlink(join(root, 'target'), join(root, 'src', 'utils'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Symlink permission unavailable'); throw error; }
  await assert.rejects(resolvePublicFile(root, 'src/utils/format.js'), /Linked public asset/);
});

function get(server, path, { host, method = 'GET' } = {}) {
  return new Promise((done, fail) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: host ? { Host: host } : {} }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (part) => { body += part; });
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', fail); req.end();
  });
}

test('loopback preview serves public files only and rejects traversal, spoofed host and writes', async (t) => {
  const root = await fixture(t);
  const server = await createPreviewServer(root);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((done) => server.close(done)));
  const page = await get(server, '/?v=fixture');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal((await get(server, '/index.html', { method: 'HEAD' })).body, '');
  for (const path of ['/.env', '/backups/private.json', '/server/src/private.mjs', '/audit/screen.png',
    '/%2e%2e/.env', '/src/../../.env', '/index.html%00', '/%E0%A4%A', '/.git/config']) {
    assert.equal((await get(server, path)).status, 404, path);
  }
  assert.equal((await get(server, '/', { host: 'outside.test' })).status, 403);
  assert.equal((await get(server, '/', { method: 'POST' })).status, 405);
  const worker = await get(server, '/service-worker.js');
  assert.equal(worker.status, 200);
  assert.doesNotMatch(worker.body, /APP_FILES|caches\.|localStorage|indexedDB/);
  assert.match(worker.body, /clients.claim/);
});

test('dist preview serves the actual offline worker instead of the development replacement', async (t) => {
  const root = await fixture(t);
  const { output } = await buildWeb(root);
  const server = await createPreviewServer(output, { production: true });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((done) => server.close(done)));
  assert.equal((await get(server, '/service-worker.js')).body, await readFile(join(root, 'service-worker.js'), 'utf8'));
});
