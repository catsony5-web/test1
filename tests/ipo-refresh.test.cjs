const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(overrides = {}) {
  let expire, clearCount = 0;
  const button = { disabled: false, setAttribute() {}, removeAttribute() {} };
  const c = vm.createContext({
    console: { warn() {} }, AbortController,
    setTimeout: (fn) => { expire = fn; return 1; }, clearTimeout: () => clearCount++,
    ipoRecords: [], ipoCalendarCandidates: [], ipoCalendarPayload: null,
    selectedIpoScheduleIds: new Set(), IPO_STORAGE_KEY: 'synthetic-ipo',
    toNumber: (value) => Number(value || 0), normalizeInputDate: (value) => value || '',
    normalizeKeyText: (value) => String(value).toLowerCase(), normalizeIpoRecord: (value) => value,
    createAutoSnapshot: async () => {}, safeSave: async () => true,
    els: { ipoCalendarStatus: {}, loadIpoCalendarButton: button }, ...overrides
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/features/ipo/ipo-view.js'), 'utf8'), c);
  for (const name of ['renderIpoView', 'renderIpoCalendarCandidates', 'renderIpoCalendarSyncMeta', 'renderIpoCalendar', 'syncIpoScheduleSelection']) c[name] = () => {};
  return { c, button, expire: () => expire(), clearCount: () => clearCount };
}

const item = { sourceId: 'synthetic', company: '가상종목', subscriptionStart: '2026-09-12' };
const payload = { updatedAt: '2026-09-12T00:00:00Z', source: { name: '합성 출처' }, items: [item] };

test('overlapping calendar loads share one request and publish normalized metadata together', async () => {
  let resolve, calls = 0;
  const f = fixture({ fetch: () => { calls++; return new Promise((done) => { resolve = done; }); } });
  const first = f.c.loadIpoCalendarCandidates();
  const second = f.c.loadIpoCalendarCandidates({ silent: true });
  assert.equal(first, second);
  assert.equal(calls, 1);
  resolve({ ok: true, json: async () => payload });
  await first;
  assert.equal(f.c.ipoCalendarPayload, payload);
  assert.equal(f.c.ipoCalendarCandidates[0].sourceName, '합성 출처');
  assert.equal(f.button.disabled, false);
  assert.equal(f.clearCount(), 1);
});

test('timed-out loading keeps previous schedules, releases the button and permits retry', async () => {
  const f = fixture({ fetch: (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  const previous = [{ sourceId: 'previous' }];
  f.c.ipoCalendarCandidates = previous;
  const pending = f.c.loadIpoCalendarCandidates();
  f.expire();
  await pending;
  assert.equal(f.c.ipoCalendarCandidates, previous);
  assert.equal(f.button.disabled, false);
  assert.match(f.c.els.ipoCalendarStatus.textContent, /응답 시간이 초과/);
  f.c.fetch = async () => ({ ok: true, json: async () => payload });
  await f.c.loadIpoCalendarCandidates();
  assert.equal(f.c.ipoCalendarPayload, payload);
});

test('malformed fresh data cannot replace either previous schedules or their metadata', async () => {
  const f = fixture({ fetch: async () => ({ ok: true, json: async () => ({
    updatedAt: 'new', items: [{ sourceId: { toString: null }, company: 'invalid' }]
  }) }) });
  const previous = [{ sourceId: 'previous' }], oldPayload = { updatedAt: 'old' };
  f.c.ipoCalendarCandidates = previous;
  f.c.ipoCalendarPayload = oldPayload;
  await f.c.loadIpoCalendarCandidates();
  assert.equal(f.c.ipoCalendarCandidates, previous);
  assert.equal(f.c.ipoCalendarPayload, oldPayload);
});

test('a null schedule cannot silently replace a valid calendar with an empty list', async () => {
  const f = fixture({ fetch: async () => ({ ok: true, json: async () => payload }) });
  await f.c.loadIpoCalendarCandidates();
  const previous = f.c.ipoCalendarCandidates;
  f.c.fetch = async () => ({ ok: true, json: async () => ({ items: [null] }) });
  await f.c.loadIpoCalendarCandidates();
  assert.equal(f.c.ipoCalendarCandidates, previous);
  assert.equal(f.c.ipoCalendarPayload, payload);
  assert.match(f.c.els.ipoCalendarStatus.textContent, /마지막으로 확인한 공개 일정을 유지/);
});

test('malformed schedule identities and record shapes preserve the previous valid calendar', async () => {
  const f = fixture({ fetch: async () => ({ ok: true, json: async () => payload }) });
  await f.c.loadIpoCalendarCandidates();
  const previous = f.c.ipoCalendarCandidates;
  for (const malformed of [[], {}, { ...item, sourceId: 42 }, { ...item, sourceId: ' ' },
    { ...item, sourceId: { toString: null } }, { ...item, company: {} }, { ...item, company: '\t' }]) {
    f.c.fetch = async () => ({ ok: true, json: async () => ({ items: [item, malformed] }) });
    await f.c.loadIpoCalendarCandidates();
    assert.equal(f.c.ipoCalendarCandidates, previous);
    assert.equal(f.c.ipoCalendarPayload, payload);
    assert.equal(f.button.disabled, false);
    assert.match(f.c.els.ipoCalendarStatus.textContent, /마지막으로 확인한 공개 일정을 유지/);
  }
});

test('offline cached and source-stale responses are identified instead of claiming a fresh check', async () => {
  const f = fixture({ fetch: async () => ({ ok: true, headers: { get: () => 'offline' }, json: async () => payload }) });
  await f.c.loadIpoCalendarCandidates();
  assert.match(f.c.els.ipoCalendarStatus.textContent, /새로 확인하지 못해 마지막으로 저장된/);
  f.c.fetch = async () => ({ ok: true, json: async () => ({ ...payload, coverage: { refreshStatus: { state: 'stale' } } }) });
  await f.c.loadIpoCalendarCandidates();
  assert.match(f.c.els.ipoCalendarStatus.textContent, /공식 출처 갱신이 지연/);
});

test('failed schedule addition leaves memory unchanged and reports no success', async () => {
  const f = fixture({ safeSave: async () => false });
  f.c.ipoCalendarCandidates = [f.c.normalizeIpoScheduleItem(item)];
  assert.equal(await f.c.addIpoScheduleToRecords(item.sourceId), false);
  assert.equal(f.c.ipoRecords.length, 0);
  assert.match(f.c.els.ipoCalendarStatus.textContent, /저장하지 못했습니다/);
});

test('schedule addition is not visible before commit and double activation adds only once', async () => {
  let save;
  const f = fixture({ safeSave: () => new Promise((done) => { save = done; }) });
  f.c.ipoCalendarCandidates = [f.c.normalizeIpoScheduleItem(item)];
  const pending = f.c.addIpoScheduleToRecords(item.sourceId);
  await Promise.resolve();
  assert.equal(f.c.ipoRecords.length, 0);
  assert.equal(await f.c.addIpoScheduleToRecords(item.sourceId), false);
  save(true);
  assert.equal(await pending, true);
  assert.equal(f.c.ipoRecords.length, 1);
});

test('failed schedule update preserves personal records and selected changes', async () => {
  const f = fixture({ safeSave: async () => false });
  const record = { id: 'local', scheduleId: item.sourceId, subscriptionStart: '2026-09-01' };
  f.c.ipoRecords = [record];
  f.c.ipoCalendarCandidates = [f.c.normalizeIpoScheduleItem(item)];
  f.c.selectedIpoScheduleIds.add(item.sourceId);
  assert.equal(await f.c.applyIpoScheduleUpdates([item.sourceId]), false);
  assert.equal(f.c.ipoRecords[0], record);
  assert.equal(f.c.selectedIpoScheduleIds.has(item.sourceId), true);
});

test('snapshot failure prevents schedule commit and does not leave a stuck save guard', async () => {
  let calls = 0;
  const f = fixture({ createAutoSnapshot: async () => { throw new Error('storage unavailable'); }, safeSave: async () => { calls++; return true; } });
  f.c.ipoCalendarCandidates = [f.c.normalizeIpoScheduleItem(item)];
  assert.equal(await f.c.addIpoScheduleToRecords(item.sourceId), false);
  assert.equal(calls, 0);
  f.c.createAutoSnapshot = async () => {};
  assert.equal(await f.c.addIpoScheduleToRecords(item.sourceId), true);
});
