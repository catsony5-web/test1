// Isolated browser verification using synthetic records and temporary browser profiles.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require(process.env.BUDGET_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const { createPreviewServer } = await import('../scripts/serve.mjs');
  const server = await createPreviewServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, channel: process.env.BUDGET_BROWSER_CHANNEL || 'msedge' });
  const errors = [];
  async function open(viewport = { width: 1280, height: 900 }) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.locator('#adminMenuButton').click();
    await page.locator('#adminTabData').click();
    return page;
  }
  async function read(page) {
    return page.evaluate(() => ({ transactions, reimbursements, monthlyIncome }));
  }
  async function readStored(page) {
    return page.evaluate(async () => ({ transactions: await readPrivateData(STORAGE_KEYS.records), reimbursements: await readPrivateData(STORAGE_KEYS.reimbursements), monthlyIncome: await readPrivateData(STORAGE_KEYS.monthlyIncome) }));
  }
  async function restore(page, payload) {
    await page.locator('#restoreInput').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  }
  async function done(page) {
    await page.waitForFunction(() => !backupRestoreInProgress);
  }
  try {
    const source = await open();
    assert.equal(await source.locator('[data-data-scope]:checked').count(), 13);
    assert.equal(await source.locator('[data-clear-scope]:checked').count(), 1);
    await source.evaluate(async () => {
      const common = { approvalDate: '2026-09-10', approvalTime: '12:00' };
      transactions = [
        { ...common, recordKey: 'synthetic-excel', transactionId: 'synthetic-excel', sourceType: 'card', sourceFile: 'synthetic.xlsx', merchant: '합성 카드 거래', amount: 13500, memo: '엑셀 업로드 후 수정', manualSector: '식비', manualSubcategory: '외식-친구', foodOccasion: 'family' },
        { ...common, recordKey: 'synthetic-manual', transactionId: 'synthetic-manual', sourceType: 'manual', sourceFile: '직접입력', merchant: '합성 수기 거래', amount: 26000, memo: '수기로 수정한 내용', manualSector: '식비', manualSubcategory: '외식-친구', foodOccasion: 'date' },
        { ...common, recordKey: 'synthetic-income', transactionId: 'synthetic-income', sourceType: 'manual', flow: 'income', sourceFile: '수입 직접 입력', merchant: '합성 수입', amount: 3400000, manualSector: '수입', manualSubcategory: '기타수입' }
      ].map(normalizeStoredTransaction);
      reimbursements = { 'synthetic-manual': 6500 };
      monthlyIncome = { '2026-09': 3200000 };
      if (!await safeSaveMany([{ key: STORAGE_KEYS.records, data: transactions }, { key: STORAGE_KEYS.reimbursements, data: reimbursements }, { key: STORAGE_KEYS.monthlyIncome, data: monthlyIncome }])) throw new Error('Synthetic seed failed');
      reclassify();
      setDataScopeSelection('imported');
    });
    const original = await read(source);
    assert.deepEqual(await readStored(source), original, 'synthetic fixtures must be committed before backup');
    const downloadEvent = source.waitForEvent('download');
    await source.locator('#backupButton').click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /전체백업/);
    const payload = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(payload.scopes.length, 13);
    assert.equal(payload.transactions.length, 3);
    assert.equal(payload.sections.incomeInput.records.length, 1);
    assert.equal(payload.sections.directManualTransactions.records[0].memo, '수기로 수정한 내용');
    assert.deepEqual(payload.monthlyIncome, original.monthlyIncome);

    const target = await open({ width: 390, height: 844 });
    await restore(target, payload); await done(target);
    const restored = await read(target);
    const byKey = rows => Object.fromEntries(rows.map(row => [row.recordKey, row]));
    assert.deepEqual(byKey(restored.transactions), byKey(original.transactions));
    assert.deepEqual(restored.reimbursements, original.reimbursements);
    assert.deepEqual(restored.monthlyIncome, original.monthlyIncome);
    await target.evaluate(async () => {
      transactions = transactions.map(row => row.recordKey === 'synthetic-manual' ? { ...row, amount: 28000, memo: '현재 기기에서 바꾼 합성 메모' } : row);
      reimbursements = { 'synthetic-manual': 7000 };
      monthlyIncome = { '2026-09': 3500000 };
      if (!await safeSaveMany([{ key: STORAGE_KEYS.records, data: transactions }, { key: STORAGE_KEYS.reimbursements, data: reimbursements }, { key: STORAGE_KEYS.monthlyIncome, data: monthlyIncome }])) throw new Error('Synthetic edit failed');
      reclassify();
    });
    const edited = await read(target);
    assert.deepEqual(await readStored(target), edited, 'synthetic edits must be committed before comparison');
    await restore(target, payload);
    await target.locator('#backupCompareDialog[open]').waitFor();
    assert.equal(await target.locator('#backupCompareItems fieldset').count(), 2);
    assert.equal(await target.locator('#backupCompareItems input:checked').count(), 0);
    assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await target.locator('#backupCompareDialog').evaluate(dialog => dialog.scrollWidth > dialog.clientWidth), false);
    await fs.mkdir(path.resolve('output/playwright'), { recursive: true });
    await target.locator('#backupCompareDialog').evaluate(dialog => { dialog.scrollTop = 0; });
    await target.screenshot({ path: 'output/playwright/backup-compare-phone.png' });
    await target.locator('#backupCompareForm button[type="submit"]').click();
    assert.equal(await target.locator('#backupCompareDialog').evaluate(dialog => dialog.open), true);
    assert.deepEqual(await read(target), edited, 'unresolved differences must not mutate the ledger');
    await target.locator('#backupCompareCancel').click(); await done(target);
    assert.deepEqual(await read(target), edited, 'cancel must leave all current values intact');
    assert.deepEqual(await readStored(target), edited, 'cancel must leave committed data intact');
    await restore(target, payload);
    await target.locator('#backupCompareDialog[open]').waitFor();
    await target.locator('#backupCompareItems fieldset').filter({ hasText: '합성 수기 거래' }).locator('input[value="backup"]').check();
    await target.locator('#backupCompareItems fieldset').filter({ hasText: '월 수입' }).locator('input[value="current"]').check();
    await target.locator('#backupCompareForm button[type="submit"]').click(); await done(target);
    const chosen = await read(target);
    assert.equal(chosen.transactions.length, 3);
    assert.deepEqual(byKey(chosen.transactions), byKey(original.transactions));
    assert.deepEqual(chosen.reimbursements, original.reimbursements);
    assert.deepEqual(chosen.monthlyIncome, edited.monthlyIncome);
    await target.reload();
    await target.waitForFunction(() => document.querySelector('#incomeEntryDate').value !== '');
    assert.deepEqual(await read(target), chosen, 'chosen values must persist after reload');
    assert.deepEqual(errors, []);
    console.log('Browser verification passed: independent selections, full JSON download, empty-ledger restore, required choices, cancellation, mixed choices, reimbursement pairing, reload persistence, mobile layout.');
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
