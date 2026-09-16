const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function controls(attribute, datasetKey) {
  return [...read("index.html").matchAll(/<input\b[^>]*>/g)].flatMap(([tag]) => {
    const value = new RegExp(`${attribute}="([^"]+)"`).exec(tag)?.[1];
    return value ? [{ dataset: { [datasetKey]: value }, checked: /\bchecked(?:\s|>|=)/.test(tag) }] : [];
  });
}

function setup() {
  const downloads = [], savedBatches = [], alerts = [], snapshotReasons = [];
  const context = vm.createContext({
    structuredClone, console: { warn() {}, error() {} },
    window: { BudgetNative: { exportFile: async (json, name) => downloads.push({ payload: JSON.parse(json), name }) } },
    alert: (message) => alerts.push(message), confirm: () => true,
    els: { dataScopeControls: controls("data-data-scope", "dataScope"), clearDataScopeControls: controls("data-clear-scope", "clearScope"), restoreModeControls: [{ checked: true, value: "merge" }] },
    defaultRules: [], transactions: [], reimbursements: {}, monthlyIncome: {}, importMeta: {}, currentFileName: "",
    recurringExpenses: [], rules: [], products: [], ipoRecords: [], calendarMemos: {}, goalPlan: {}, appSettings: {}
  });
  // Load the production defaults without instantiating the complete browser UI state.
  vm.runInContext(read("src/features/app/state.js").split("\nconst els =")[0], context);
  const files = ["src/data/constants.js", "src/data/categories.js", "src/utils/date.js", "src/utils/food-occasion.js",
    "src/utils/normalize.js", "src/features/goals/goals-core.js", "src/features/budget/spending-budget-core.js", "src/utils/storage.js", "src/features/products/products-view.js",
    "src/features/recurring/recurring-review-core.js", "src/utils/backup.js", "src/utils/backup-merge.js"];
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  Object.assign(context, {
    applyAppSettings() {}, reclassify() {}, renderRestorePreview() {},
    loadAutoSnapshots: async () => [{ id: "synthetic-snapshot", createdAt: "2026-09-15T00:00:00Z", reason: "합성 이전 기록", appVersion: "synthetic-old",
      data: { records: [{ recordKey: "SNAPSHOT_ONLY_NOT_LIVE", amount: 999999 }] } }],
    createAutoSnapshot: async (reason) => { snapshotReasons.push(reason); return {}; },
    safeSaveMany: async (entries) => { savedBatches.push(copy(entries)); return true; }
  });
  const scopes = vm.runInContext("DATA_SCOPE_META.map(({key}) => key)", context);
  const keys = vm.runInContext("({...STORAGE_KEYS})", context);
  return { context, scopes: copy(scopes), keys: copy(keys), downloads, savedBatches, alerts, snapshotReasons };
}

function seed(context) {
  const common = { approvalDate: "2026-09-10", approvalTime: "12:30", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-14T12:00:00Z" };
  context.transactions = [
    { ...common, recordKey: "excel-edited", transactionId: "excel-edited", sourceType: "card", sourceFile: "synthetic.xlsx", approvalNo: "bank-100", cardNumber: "synthetic-0000",
      merchant: "수정한 합성 식당", amount: 13500, memo: "엑셀 가져오기 후 수정한 메모", manualSector: "식비", manualSubcategory: "외식-친구", classificationScope: "transaction", foodOccasion: "family" },
    { ...common, recordKey: "manual-expense", sourceType: "manual", sourceFile: "직접입력", approvalNo: "manual-200", merchant: "합성 수기 식사", amount: 26000,
      memo: "수기로 추가하고 수정한 내용", manualSector: "식비", manualSubcategory: "외식-친구", classificationScope: "transaction", foodOccasion: "date" },
    { ...common, recordKey: "bulk-expense", sourceType: "manual", sourceFile: "과거 거래 일괄 입력", approvalNo: "direct-bulk-300", merchant: "합성 과거 거래", amount: 42000,
      memo: "붙여넣기 후 수정", manualSector: "식비", manualSubcategory: "외식-단체", foodOccasion: "celebration" },
    { ...common, recordKey: "manual-income", sourceType: "manual", flow: "income", sourceFile: "수입 직접 입력", approvalNo: "manual-income-400", merchant: "합성 급여", amount: 3400000,
      memo: "수입 금액 수정", manualSector: "수입", manualSubcategory: "기타수입" },
    { ...common, recordKey: "bulk-income", sourceType: "transfer", flow: "income", sourceFile: "수입 일괄 입력", merchant: "합성 환급", amount: 75000, memo: "일괄 수입 기록" },
    { ...common, recordKey: "recurring-posted", sourceType: "recurring", recurringId: "rent-definition", merchant: "합성 월세", amount: 600000 },
    { ...common, recordKey: "legacy-cash", sourceType: "cash", merchant: "합성 기타 현금", amount: 3000, memo: "이전 기록" }
  ].map(context.normalizeStoredTransaction);
  context.reimbursements = { "excel-edited": 2000, "manual-expense": 6500, "bulk-expense": 500 };
  context.monthlyIncome = { "2026-08": 2800000, "2026-09": 3200000 };
  context.importMeta = { lastFileName: "synthetic.xlsx", synthetic: true };
  context.currentFileName = "synthetic.xlsx";
  context.rules = [{ sector: "식비", subcategory: "외식-친구", keywords: ["합성 수기 식사"], priority: 1, origin: "manual" }];
  context.appSettings = context.defaultAppSettings();
  return {
    transactions: copy(context.transactions), reimbursements: copy(context.reimbursements),
    monthlyIncome: copy(context.monthlyIncome), importMeta: copy(context.importMeta)
  };
}

function empty(context) {
  Object.assign(context, { transactions: [], reimbursements: {}, monthlyIncome: {}, importMeta: {}, currentFileName: "",
    recurringExpenses: [], rules: [], products: [], ipoRecords: [], calendarMemos: {}, goalPlan: {}, appSettings: {} });
}

function assertRestored(context, original) {
  const byKey = (rows) => Object.fromEntries(rows.map((row) => [row.recordKey, copy(row)]));
  assert.deepEqual(byKey(context.transactions), byKey(original.transactions));
  assert.deepEqual(copy(context.reimbursements), original.reimbursements);
  assert.deepEqual(copy(context.monthlyIncome), original.monthlyIncome);
  assert.deepEqual(copy(context.importMeta), original.importMeta);
  assert.equal(context.currentFileName, "synthetic.xlsx");
}

test("full backup JSON round-trip restores handwritten records, income and all edited transaction fields", async () => {
  const { context: c, scopes } = setup();
  const original = seed(c);
  const payload = copy(await c.buildBackupPayload(scopes));
  assert.equal(payload.sections.directManualTransactions.records[0].amount, 26000);
  assert.equal(payload.sections.incomeInput.records.length, 2);
  assert.deepEqual(payload.sections.incomeInput.monthlyIncome, original.monthlyIncome);
  assert.equal(payload.sections.importedExcelTransactions.records[0].memo, "엑셀 가져오기 후 수정한 메모");
  assert.equal(payload.sections.directManualTransactions.records[0].foodOccasion, "date");
  empty(c);
  const normalized = c.normalizeBackupPayload(JSON.parse(JSON.stringify(payload)));
  await c.applyRestorePayload(normalized, scopes, { mode: "merge" });
  assertRestored(c, original);
});

test("legacy flat backups still restore their transactions, reimbursements and monthly income", async () => {
  for (const recordField of ["transactions", "records"]) {
    const { context: c, scopes } = setup();
    const original = seed(c);
    const legacy = { app: "monthly-card-budget", version: 2, [recordField]: original.transactions,
      reimbursements: original.reimbursements, monthlyIncome: original.monthlyIncome, importMeta: original.importMeta,
      scopes: ["importedTransactions", "manualTransactions", "income"] };
    empty(c);
    const bundle = c.normalizeBackupPayload(JSON.parse(JSON.stringify(legacy)));
    await c.applyRestorePayload(bundle, scopes, { mode: "merge" });
    assertRestored(c, original);
  }
});

test("snapshot history entries are metadata and do not add historical records to restored live data", async () => {
  const { context: c, scopes } = setup();
  const original = seed(c);
  const payload = copy(await c.buildBackupPayload(scopes));
  assert.deepEqual(payload.snapshots, [{ id: "synthetic-snapshot", createdAt: "2026-09-15T00:00:00Z", reason: "합성 이전 기록", appVersion: "synthetic-old" }]);
  assert.equal(JSON.stringify(payload).includes("SNAPSHOT_ONLY_NOT_LIVE"), false);
  assert.equal(Object.hasOwn(payload.sections, "snapshots"), false);
  empty(c);
  const bundle = c.normalizeBackupPayload(JSON.parse(JSON.stringify(payload)));
  await c.applyRestorePayload(bundle, scopes, { mode: "merge" });
  assertRestored(c, original);
});

test("default full backup ignores narrowed restore checkboxes while selected backup obeys them", async () => {
  const { context: c, scopes, downloads } = setup();
  const original = seed(c);
  c.setDataScopeSelection("imported");
  assert.deepEqual(copy(c.selectedDataScopes()), ["importedExcelTransactions"]);
  await c.backupLocalData();
  await c.backupLocalData({ selectedOnly: true });
  assert.equal(downloads.length, 2);
  assert.deepEqual(downloads[0].payload.scopes, scopes);
  assert.equal(downloads[0].payload.transactions.length, original.transactions.length);
  assert.deepEqual(downloads[0].payload.monthlyIncome, original.monthlyIncome);
  assert.deepEqual(downloads[1].payload.scopes, ["importedExcelTransactions"]);
  assert.deepEqual(downloads[1].payload.transactions.map((row) => row.recordKey), ["excel-edited"]);
  assert.equal(Object.hasOwn(downloads[1].payload, "monthlyIncome"), false);
  assert.deepEqual(downloads[1].payload.reimbursements, { "excel-edited": 2000 });
  assertRestored(c, original);
});

test("full backup also works with no restore items checked and waits for queued writes", async () => {
  const { context: c, downloads } = setup();
  seed(c);
  c.els.dataScopeControls.forEach((input) => { input.checked = false; });
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const pendingSave = c.queuePrivateWrite(async () => {
    await gate;
    c.transactions = c.transactions.map((row) => row.recordKey === "manual-expense" ? { ...row, amount: 28000, memo: "대기 중 저장 완료" } : row);
  });
  const backup = c.backupLocalData();
  await Promise.resolve();
  assert.equal(downloads.length, 0);
  finish(); await pendingSave; await backup;
  assert.equal(downloads.length, 1);
  const saved = downloads[0].payload.transactions.find((row) => row.recordKey === "manual-expense");
  assert.equal(saved.amount, 28000);
  assert.equal(saved.memo, "대기 중 저장 완료");
});

test("markup defaults select every restore scope and only Excel transactions for clearing", () => {
  const { context: c, scopes } = setup();
  assert.equal(c.els.dataScopeControls.length, scopes.length);
  assert.equal(c.els.clearDataScopeControls.length, scopes.length);
  assert.deepEqual(copy(c.selectedDataScopes()).sort(), [...scopes].sort());
  assert.deepEqual(copy(c.selectedClearDataScopes()), ["importedExcelTransactions"]);
});

test("clear selection is independent and clearing Excel preserves handwritten entries and income", async () => {
  const { context: c, keys, savedBatches, snapshotReasons } = setup();
  const original = seed(c);
  c.setDataScopeSelection("all");
  assert.deepEqual(copy(c.selectedClearDataScopes()), ["importedExcelTransactions"]);
  await c.clearRecords();
  assert.deepEqual(c.transactions.map((row) => row.recordKey).sort(), original.transactions.filter((row) => row.recordKey !== "excel-edited").map((row) => row.recordKey).sort());
  assert.deepEqual(copy(c.monthlyIncome), original.monthlyIncome);
  assert.deepEqual(copy(c.reimbursements), { "manual-expense": 6500, "bulk-expense": 500 });
  assert.deepEqual(copy(c.importMeta), {});
  assert.equal(snapshotReasons.length, 1);
  assert.equal(savedBatches.length, 1);
  assert.ok(savedBatches[0].some(({ key }) => key === keys.records));
  assert.equal(savedBatches[0].some(({ key }) => key === keys.monthlyIncome), false);
});

test("an empty clear selection never inherits selected backup or restore scopes", async () => {
  const { context: c, savedBatches, alerts } = setup();
  const original = seed(c);
  c.setDataScopeSelection("all");
  c.els.clearDataScopeControls.forEach((input) => { input.checked = false; });
  await c.clearRecords();
  assert.equal(savedBatches.length, 0);
  assertRestored(c, original);
  assert.ok(alerts.some((message) => message.includes("초기화할 데이터 항목")));
});
