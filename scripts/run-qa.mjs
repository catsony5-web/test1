import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot } from './lib/public-assets.mjs';

const files = (await readdir(resolve(projectRoot, 'qa'))).filter((name) => /^verify-.*\.cjs$/.test(name)).sort();
if (!files.length) throw new Error('No QA scripts found');
for (const file of files) {
  const result = spawnSync(process.execPath, [resolve(projectRoot, 'qa', file)], { cwd: projectRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
