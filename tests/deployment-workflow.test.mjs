import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Pages publishes verified dist with a read-only build and restricted deploy job', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
  const [build, deploy] = workflow.split('\n  deploy:');
  assert.match(workflow, /workflow_call:/);
  assert.match(build, /ref: main/);
  assert.match(build, /persist-credentials: false/);
  assert.match(build, /run: npm run verify[\s\S]*run: npm run build[\s\S]*path: dist/);
  assert.doesNotMatch(build, /(?:pages|id-token|contents): write/);
  assert.match(deploy, /needs: build/);
  assert.match(deploy, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  assert.match(deploy, /name: github-pages/);
  assert.match(workflow, /cancel-in-progress: false/);
  for (const [, ref] of workflow.matchAll(/uses: actions\/[\w-]+@([^\s]+)/g)) assert.match(ref, /^[a-f0-9]{40}$/);
});

test('scheduled data commits explicitly call dist deployment without passing source secrets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/update-ipo-calendar.yml', import.meta.url), 'utf8');
  const publish = workflow.split('\n  publish:')[1];
  assert.ok(publish);
  assert.match(publish, /needs: update/);
  assert.match(publish, /needs\.update\.outputs\.changed == 'true'/);
  assert.match(publish, /uses: \.\/\.github\/workflows\/deploy-pages\.yml/);
  assert.doesNotMatch(publish, /secrets:/);
  assert.doesNotMatch(workflow, /pages\/builds/);
});
