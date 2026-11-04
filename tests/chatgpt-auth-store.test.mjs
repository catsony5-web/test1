import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProtectedAuthStore } from '../scripts/lib/chatgpt-auth-store.mjs';

const protection = {
  protect: async (bytes) => Buffer.from(bytes).map((byte) => byte ^ 173),
  unprotect: async (bytes) => Buffer.from(bytes).map((byte) => byte ^ 173)
};
test('credential store writes protected bytes and rejects concurrent owners without a stale lock after close', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ledger-synthetic-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await createProtectedAuthStore({ directory, protection });
  const fixture = { version: 1, token: 'synthetic-private-token' };
  await store.write(fixture);
  assert.deepEqual(await store.read(), fixture);
  assert.equal((await readFile(join(directory, 'profiles.dpapi'))).includes(Buffer.from('synthetic-private-token')), false);
  await assert.rejects(createProtectedAuthStore({ directory, protection }));
  await store.close();
  const reopened = await createProtectedAuthStore({ directory, protection });
  assert.deepEqual(await reopened.read(), fixture); await reopened.close();
  assert.deepEqual(await readdir(directory), ['profiles.dpapi']);
});

test('failed ownership/cancel check before atomic rename preserves earlier credential bytes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ledger-synthetic-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await createProtectedAuthStore({ directory, protection });
  try {
    await store.write({ version: 1, token: 'synthetic-old' });
    await assert.rejects(store.write({ version: 1, token: 'synthetic-new' }, () => { throw new Error('Canceled'); }));
    assert.deepEqual(await store.read(), { version: 1, token: 'synthetic-old' });
    assert.deepEqual(await readdir(directory), ['profiles.dpapi']);
  } finally { await store.close(); }
});
