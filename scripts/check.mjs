import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { projectRoot, publicAssets } from './lib/public-assets.mjs';

async function sourceFiles(folder) {
  const entries = await readdir(resolve(projectRoot, folder), { withFileTypes: true });
  const groups = await Promise.all(entries.map((entry) => {
    const file = `${folder}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(file);
    return entry.isFile() && /\.(?:cjs|mjs|js)$/.test(file) ? [file] : [];
  }));
  return groups.flat();
}

const assets = await publicAssets();
const html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
if (!html.includes('http-equiv="Content-Security-Policy"')) throw new Error('Missing Content Security Policy');
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (script[1].trim()) throw new Error('Inline scripts conflict with the application CSP');
}
const files = ['service-worker.js', ...(await Promise.all(['src', 'scripts', 'tests', 'qa'].map(sourceFiles))).flat()];
let cursor = 0;
async function checkNext() {
  while (cursor < files.length) {
    const file = files[cursor++];
    await new Promise((done, fail) => {
      const child = spawn(process.execPath, ['--check', file], { cwd: projectRoot, stdio: 'inherit' });
      child.on('error', fail);
      child.on('exit', (code) => code === 0 ? done() : fail(new Error(`Syntax check failed: ${file}`)));
    });
  }
}
await Promise.all(Array.from({ length: 4 }, checkNext));
console.log(`Checked ${files.length} JS files and ${assets.length} public assets; HTML/CSS/manifest references are complete.`);
