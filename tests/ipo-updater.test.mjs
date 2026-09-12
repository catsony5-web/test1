import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshIpoSnapshot, readPreviousSnapshot, writeSnapshotAtomically } from '../scripts/update-ipo-calendar.mjs';

const now = new Date('2026-09-12T00:00:00Z');
const item = { sourceId: 'synthetic-kind', company: '가상종목', subscriptionStart: '2026-09-14',
  sourceUrl: 'https://kind.krx.co.kr/example', status: 'scheduled' };
const previous = { schemaVersion: 3, updatedAt: '2026-09-11T00:00:00Z', checkedDate: '2026-09-11',
  coverage: { kindCount: 1, dartCount: 0 }, items: [item] };
const dartResult = { items: [], checkedCompanies: 0, unresolved: [] };

test('KRX 403 still checks DART but retains every previous item and successful timestamp', async () => {
  let dartCalls = 0;
  const result = await refreshIpoSnapshot({ previous, now,
    fetchKind: async () => { throw new Error('KRX KIND request failed: HTTP 403'); },
    fetchDart: async () => { dartCalls++; return dartResult; }
  });
  assert.equal(dartCalls, 1);
  assert.equal(result.items, previous.items);
  assert.equal(result.updatedAt, previous.updatedAt);
  assert.equal(result.checkedDate, previous.checkedDate);
  assert.equal(result.items[0].status, 'scheduled');
  assert.deepEqual(result.coverage.refreshStatus.sources, { kind: { state: 'failed', reason: 'HTTP 403' }, dart: { state: 'ok' } });
  assert.equal(result.coverage.refreshStatus.state, 'stale');
  assert.equal(previous.coverage.refreshStatus, undefined);
});

test('DART failure cannot replace prior data with partial KRX rows or disclose raw errors', async () => {
  const result = await refreshIpoSnapshot({ previous, now,
    fetchKind: async () => [{ ...item, company: 'partially updated' }],
    fetchDart: async () => { throw new Error('synthetic-private-provider-error'); }
  });
  assert.equal(result.items, previous.items);
  assert.equal(result.coverage.refreshStatus.sources.dart.reason, 'request-failed');
  assert.ok(!JSON.stringify(result).includes('synthetic-private-provider-error'));
});

test('a failing first refresh without any verified snapshot fails closed', async () => {
  await assert.rejects(refreshIpoSnapshot({ previous: { items: [] }, now,
    fetchKind: async () => { throw new Error('403'); }, fetchDart: async () => dartResult
  }), /no verified snapshot/);
});

test('healthy refresh clears a stale-source warning even when schedule content has not changed', async () => {
  const healthy = await refreshIpoSnapshot({ previous, now, fetchKind: async () => [item], fetchDart: async () => dartResult });
  const settled = await refreshIpoSnapshot({ previous: healthy, now, fetchKind: async () => [item], fetchDart: async () => dartResult }) || healthy;
  const stale = { ...settled, coverage: { ...settled.coverage, refreshStatus: { state: 'stale' } } };
  const recovered = await refreshIpoSnapshot({ previous: stale, now, fetchKind: async () => [item], fetchDart: async () => dartResult });
  assert.equal(recovered.coverage.refreshStatus.state, 'ok');
});

test('corrupt existing snapshot is not silently treated as an empty previous history', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ipo-updater-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'schedule.json');
  await writeFile(file, 'invalid synthetic JSON');
  await assert.rejects(readPreviousSnapshot(file));
  assert.equal(await readFile(file, 'utf8'), 'invalid synthetic JSON');
  assert.deepEqual(await readPreviousSnapshot(join(dir, 'missing.json')), { items: [] });
});

test('atomic snapshot publication leaves previous file intact if serialization fails', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ipo-updater-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'schedule.json');
  await writeSnapshotAtomically(file, previous);
  const cyclic = {}; cyclic.items = cyclic;
  await assert.rejects(writeSnapshotAtomically(file, cyclic));
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), previous);
  assert.deepEqual(await readdir(dir), ['schedule.json']);
  await writeSnapshotAtomically(file, { ...previous, checkedDate: '2026-09-12' });
  assert.equal((await readPreviousSnapshot(file)).checkedDate, '2026-09-12');
});
