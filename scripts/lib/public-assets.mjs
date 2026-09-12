import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const rootAssets = new Set(['index.html', 'service-worker.js', 'manifest.webmanifest', 'app-icon.svg', '.nojekyll']);
const assetPatterns = [
  /^src\/(?:data|utils|components|features)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/,
  /^src\/styles\/[a-z0-9-]+\.css$/,
  /^assets\/tabler\/icons\/[a-z0-9-]+\.svg$/,
  /^assets\/tabler\/(?:tabler-icons\.min\.css|LICENSE)$/,
  /^assets\/vendor\/(?:xlsx\.full\.min\.js|xlsx\.LICENSE)$/,
  /^data\/ipo-calendar\.json$/
];

export function publicAssetPath(value) {
  if (value === './') return 'index.html';
  if (typeof value !== 'string' || !value.startsWith('./')) throw new Error('Public assets must use relative paths');
  const name = value.match(/^\.\/([^?#]+)(?:\?v=[A-Za-z0-9._-]+)?$/)?.[1];
  if (!name) throw new Error(`Invalid public asset URL: ${value}`);
  if (!rootAssets.has(name) && !assetPatterns.some((pattern) => pattern.test(name))) {
    throw new Error(`Not an approved public asset: ${value}`);
  }
  return name;
}

export function cacheAssetEntries(worker) {
  const source = worker.match(/const APP_FILES\s*=\s*(\[[\s\S]*?\]);/)?.[1];
  if (!source) throw new Error('service-worker.js must declare the APP_FILES JSON array');
  const entries = JSON.parse(source);
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('Public asset list is empty');
  entries.forEach(publicAssetPath);
  return entries;
}

export function htmlAssetUrls(html) {
  const urls = [];
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const reference = tag[0].match(/\b(?:src|href)=["']([^"']+)["']/i)?.[1];
    if (!reference) continue;
    const url = `./${reference.replace(/^\.\//, '')}`;
    publicAssetPath(url);
    urls.push(url);
  }
  return urls;
}

export async function resolvePublicFile(root, name) {
  publicAssetPath(`./${name}`);
  const canonicalRoot = await realpath(root);
  const file = resolve(canonicalRoot, name);
  let parent = canonicalRoot;
  // Reject directory junctions as well as file symlinks; both can escape the public tree.
  for (const part of name.split('/')) {
    parent = resolve(parent, part);
    if ((await lstat(parent)).isSymbolicLink()) throw new Error(`Linked public asset is not allowed: ${name}`);
  }
  const actual = await realpath(file);
  const local = relative(canonicalRoot, actual);
  if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`) || actual !== file) {
    throw new Error(`Public asset escapes the project: ${name}`);
  }
  if (!(await lstat(actual)).isFile()) throw new Error(`Public asset is not a file: ${name}`);
  return actual;
}

export async function publicAssets(root = projectRoot) {
  const worker = await readFile(resolve(root, 'service-worker.js'), 'utf8');
  const entries = cacheAssetEntries(worker);
  const names = [...new Set([...entries.map(publicAssetPath), ...rootAssets])].sort();
  await Promise.all(names.map((name) => resolvePublicFile(root, name)));

  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const available = new Set(names);
  for (const url of htmlAssetUrls(html)) {
    const name = publicAssetPath(url);
    if (!available.has(name)) throw new Error(`HTML asset missing from APP_FILES: ${name}`);
    if (!entries.includes(url)) throw new Error(`HTML/cache URL mismatch: ${url}. Run npm run cache:sync.`);
  }
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons || []) {
    if (!available.has(publicAssetPath(icon.src))) throw new Error('Manifest icon missing from APP_FILES');
  }
  // Icon styles also fetch assets at runtime; validate their relative references.
  for (const name of names.filter((file) => file.endsWith('.css'))) {
    const css = await readFile(resolve(root, name), 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
      if (match[1].startsWith('data:') || match[1].startsWith('#')) continue;
      const target = relative(root, resolve(root, dirname(name), match[1].split(/[?#]/)[0])).split(sep).join('/');
      if (!available.has(target)) throw new Error(`CSS asset missing from APP_FILES: ${name} -> ${match[1]}`);
    }
  }
  return names;
}
