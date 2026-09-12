const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(context, file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context); }

test('native storage never accesses browser plaintext storage, including on failure', async () => {
  const data = new Map();
  let failed = false;
  const context = vm.createContext({ structuredClone, window: { BudgetNative: {
    read: async (key) => { if (failed) throw new Error('locked'); return data.get(key); },
    writeMany: async (entries) => entries.forEach(({ key, value }) => data.set(key, value))
  } }, localStorage: { getItem() { assert.fail('plaintext read'); }, setItem() { assert.fail('plaintext write'); } } });
  load(context, 'src/utils/storage.js');
  await context.writePrivateDataMany([{ key: 'monthly-card-budget-records-v1', value: [123] }]);
  assert.deepEqual(await context.readPrivateData('monthly-card-budget-records-v1'), [123]);
  failed = true;
  await assert.rejects(context.safeLoad('monthly-card-budget-records-v1', []), /locked/);
});

function ledger() {
  let succeed = true, renders = 0;
  const context = vm.createContext({ window: { BudgetNative: {} }, transactions: [],
    normalizeInputDate: (v) => v, normalizeInputTime: (v) => v, monthKey: (v) => v.slice(0, 7),
    toNumber: Number, normalizeKeyText: (v) => v.trim(), normalizeFoodOccasion: () => '',
    safeSave: async () => succeed, reclassify: () => renders++ });
  load(context, 'src/data/constants.js');
  load(context, 'src/utils/normalize.js');
  load(context, 'src/features/transactions/transactions-view.js');
  const item = { id: 'a'.repeat(64), kind: 'card', source: 'samsung-kakao', amount: 5600,
    date: '2026-09-05', time: '10:02', merchant: '가상문구점' };
  return { context, item, fail: () => { succeed = false; }, renders: () => renders };
}

test('reviewed card commits once, including replay after inbox deletion failure', async () => {
  const { context, item } = ledger();
  await context.importReviewedNotification(item);
  await context.importReviewedNotification(item);
  assert.equal(context.transactions.length, 1);
  assert.match(context.transactions[0].memo, /원장 미대조/);
  assert.equal(context.transactions[0].sourceType, 'card');
});

test('failed notice commit leaves current ledger unchanged', async () => {
  const { context, item, fail, renders } = ledger(); fail();
  await assert.rejects(context.importReviewedNotification(item), /commit failed/);
  assert.equal(context.transactions.length, 0);
  assert.equal(renders(), 0);
});

test('ambiguous duplicate, bank debit, cancellation and invalid notice are rejected', async () => {
  const { context, item } = ledger();
  await context.importReviewedNotification(item);
  await assert.rejects(context.importReviewedNotification({ ...item, id: 'b'.repeat(64) }), /duplicate/);
  for (const changes of [{ kind: 'bank' }, { kind: 'cancellation' }, { source: 'unknown' }, { amount: -1 }, { id: '' }]) {
    await assert.rejects(context.importReviewedNotification({ ...item, ...changes }));
  }
  assert.equal(context.transactions.length, 1);
});

test('backup parser rejects prototype keys and oversized files before applying anything', async () => {
  let applied = false, alerted = false;
  const context = vm.createContext({ console: { error() {} }, alert: () => { alerted = true; },
    normalizeBackupPayload: () => { applied = true; } });
  load(context, 'src/utils/backup.js');
  for (const file of [
    { size: 100, text: async () => '{"app":"monthly-card-budget","__proto__":{"polluted":true}}' },
    { size: 33 * 1024 * 1024, text: async () => { assert.fail('oversized file read'); } }
  ]) await context.restoreLocalData({ target: { files: [file], value: 'file' } });
  assert.equal(applied, false);
  assert.equal(alerted, true);
});

test('updated offline SheetJS still reads and writes Korean transaction sheets', () => {
  const XLSX = require('../assets/vendor/xlsx.full.min.js');
  assert.equal(XLSX.version, '0.20.3');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['날짜', '내용', '금액'], ['2026-09-05', '가상서점', 12300]]), '내역');
  const loaded = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.equal(XLSX.utils.sheet_to_json(loaded.Sheets['내역'])[0]['금액'], 12300);
});
