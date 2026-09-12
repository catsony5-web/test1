import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectRoot, cacheAssetEntries, htmlAssetUrls, publicAssetPath, resolvePublicFile } from './lib/public-assets.mjs';

export async function syncCacheManifest(root = projectRoot) {
  const workerPath = await resolvePublicFile(root, 'service-worker.js');
  const indexPath = await resolvePublicFile(root, 'index.html');
  const worker = await readFile(workerPath, 'utf8');
  const entries = cacheAssetEntries(worker);
  const references = new Map();
  for (const url of htmlAssetUrls(await readFile(indexPath, 'utf8'))) {
    const name = publicAssetPath(url);
    if (references.has(name) && references.get(name) !== url) throw new Error(`Conflicting HTML asset versions: ${name}`);
    references.set(name, url);
  }
  const existingPaths = new Set(entries.map(publicAssetPath));
  const synced = entries.map((entry) => references.get(publicAssetPath(entry)) || entry);
  for (const [name, url] of references) {
    if (!existingPaths.has(name)) synced.push(url);
  }
  await Promise.all(synced.map((url) => resolvePublicFile(root, publicAssetPath(url))));
  const updated = worker.replace(/const APP_FILES\s*=\s*\[[\s\S]*?\];/, `const APP_FILES = ${JSON.stringify(synced, null, 2)};`);
  if (updated !== worker) await writeFile(workerPath, updated);
  return synced.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Synchronized ${await syncCacheManifest()} cache URLs. Verify the release CACHE_NAME before deploying.`);
}
