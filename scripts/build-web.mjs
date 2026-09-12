import { copyFile, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectRoot, publicAssets, resolvePublicFile } from './lib/public-assets.mjs';

export async function buildWeb(root = projectRoot) {
  const source = await realpath(root);
  const files = await publicAssets(source);
  const output = resolve(source, 'dist');
  if (relative(source, output) !== 'dist') throw new Error('Invalid build directory');
  try {
    if ((await lstat(output)).isSymbolicLink() || await realpath(output) !== output) {
      throw new Error('Unsafe build directory');
    }
    await rm(output, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const name of files) {
    const input = await resolvePublicFile(source, name);
    const target = resolve(output, name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(input, target);
  }
  return { output, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { files } = await buildWeb();
  console.log(`Built dist/ with ${files.length} public files. No developer or personal-data folders copied.`);
}
