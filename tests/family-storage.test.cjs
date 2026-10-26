const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const copy = (value) => JSON.parse(JSON.stringify(value));

function setup() {
  const batches = [];
  const c = vm.createContext({ structuredClone, console: { warn() {}, error() {} }, window: {},
    alert() {}, confirm: () => true, els: {}, defaultRules: [], transactions: [], reimbursements: {},
    familyAdjustments: [], monthlyIncome: {}, importMeta: {}, currentFileName: "", recurringExpenses: [],
    rules: [], products: [], ipoRecords: [], calendarMemos: {}, goalPlan: {}, appSettings: {} });
  vm.runInContext(read("src/features/app/state.js").split("\nconst els =")[0], c);
  for (const file of ["src/data/constants.js", "src/data/categories.js", "src/utils/date.js", "src/utils/food-occasion.js",
    "src/utils/normalize.js", "src/features/family/family-core.js", "src/features/goals/goals-core.js", "src/utils/storage.js", "src/features/products/products-view.js", "src/features/recurring/recurring-review-core.js",
    "src/utils/backup.js", "src/utils/backup-merge.js"]) vm.runInContext(read(file), c, { filename: file });
  Object.assign(c, { applyAppSettings() {}, renderSnapshotPanel() {}, normalizeTheme: (value) => value,
    loadAutoSnapshots: async () => [], createAutoSnapshot: async () => ({}),
    safeSaveMany: async (entries) => { batches.push(copy(entries)); return true; } });
  c.appSettings = c.defaultAppSettings();
  return { c, batches, scopes: copy(vm.runInContext("DATA_SCOPE_META.map(({key}) => key)", c)), keys: copy(vm.runInContext("STORAGE_KEYS", c)) };
}

const adjustment = (extra = {}) => ({ id: "synthetic-adjustment", date: "2026-09-08", amount: -12000,
  purpose: "return", memo: "가상 반환", linkedLoanTransactionId: "", ...extra });
const transaction = (extra = {}) => ({ recordKey: "synthetic-receipt", transactionId: "synthetic-receipt-id",
  sourceType: "manual", flow: "income", approvalDate: "2026-09-06", merchant: "가상 지원 입금", amount: 48000,
  incomeKind: "familySupport", incomeKindSource: "manual", familyTargetMonth: "2026-08", familySender: "가상 지원자", ...extra });
const recurring = (extra = {}) => ({ id: "synthetic-recurring", name: "가상 공과금", amount: 36000,
  startMonth: "2026-09", sector: "고정 주거비", subcategory: "관리비", createdAt: "2026-08-01T00:00:00Z",
  familyBurdenHistory: [{ fromMonth: "2026-09", amount: 18000 }], ...extra });

test("legacy normalization keeps provenance and IDs while defaulting family fields", () => {
  const { c } = setup();
  const original = transaction({ incomeKind: undefined, incomeKindSource: undefined, familyTargetMonth: undefined, familySender: undefined });
  const row = c.normalizeStoredTransaction(original);
  assert.equal(row.incomeKind, "normal");
  assert.equal(row.incomeKindSource, "");
  assert.equal(row.familyTargetMonth, "2026-09");
  assert.equal(row.familySender, "");
  assert.equal(row.familyBurdenAmount, null);
  assert.equal(row.flow, "income");
  assert.equal(row.recordKey, original.recordKey);
  assert.equal(row.transactionId, original.transactionId);
  assert.equal(c.getTransactionDataSection(row), "incomeInput");
  assert.deepEqual(copy(c.normalizeRecurringExpense(recurring({ familyBurdenHistory: undefined })).familyBurdenHistory), []);
  assert.deepEqual(copy(c.normalizeRecurringExpense(recurring()).loanSupportHistory), []);
  assert.deepEqual(copy(c.normalizeAppSettings({}).familySupportKeywords), []);
});

test("adjustment normalization preserves signed amounts, pending links and explicit timestamps without regenerating IDs", () => {
  const { c } = setup();
  const raw = adjustment({ purpose: "loan_payment", createdAt: "2026-09-08T00:00:00Z" });
  const row = c.normalizeFamilyAdjustment(raw);
  assert.equal(row.id, raw.id);
  assert.equal(row.amount, -12000);
  assert.equal(row.linkedLoanTransactionId, "");
  assert.equal(row.createdAt, raw.createdAt);
  assert.equal(row.updatedAt, "");
  assert.deepEqual(copy(c.normalizeFamilyAdjustments([raw, raw])), [copy(row)]);
  assert.throws(() => c.normalizeFamilyAdjustments([raw, { ...raw, amount: 10 }]), /같은 ID/);
  for (const invalid of [{ id: "" }, { date: "2026-02-30" }, { amount: Infinity }, { amount: "" }]) {
    assert.throws(() => c.normalizeFamilyAdjustment({ ...raw, ...invalid }));
  }
});

test("effective histories retain zero changes, order by month and reject contradictory duplicates", () => {
  const { c } = setup();
  const history = [{ fromMonth: "2026-11", amount: 0 }, { fromMonth: "2026-09", amount: 16000 }];
  assert.deepEqual(copy(c.normalizeFamilyBurdenHistory(history)), [history[1], history[0]]);
  assert.throws(() => c.normalizeFamilyBurdenHistory([history[0], { ...history[0], amount: 1 }]), /같은 적용 월/);
  assert.throws(() => c.normalizeFamilyBurdenHistory([{ fromMonth: "2026-13", amount: 1 }]));
  assert.throws(() => c.normalizeLoanSupportHistory([{ fromMonth: "2026-09", principal: -1, interest: 0 }]));
  const loan = [{ fromMonth: "2026-09", principal: 4000, interest: 500 }];
  assert.deepEqual(copy(c.normalizeRecurringExpense(recurring({ loanSupportHistory: loan })).loanSupportHistory), loan);
  assert.equal(c.normalizeStoredTransaction(transaction({ familyBurdenAmount: 0 })).familyBurdenAmount, 0);
  assert.equal(c.normalizeStoredTransaction(transaction({ familyBurdenAmount: -1 })).familyBurdenAmount, null);
});

test("full JSON backup and clean restore retain family receipts, snapshots, histories, adjustments and keywords", async () => {
  const { c, scopes } = setup();
  c.transactions = [transaction(), transaction({ recordKey: "synthetic-imported", transactionId: "synthetic-imported-id",
    sourceType: "transfer", sourceFile: "synthetic.xlsx", familyBurdenAmount: 7000 })].map(c.normalizeStoredTransaction);
  c.familyAdjustments = c.normalizeFamilyAdjustments([adjustment()]);
  c.recurringExpenses = [c.normalizeRecurringExpense(recurring({ loanSupportHistory: [{ fromMonth: "2026-09", principal: 1000, interest: 200 }] }))];
  c.appSettings = c.normalizeAppSettings({ familySupportKeywords: [" 가상입금 ", "가상입금", "", 123] });
  const snapshot = copy(c.collectSnapshotData());
  const balanceBefore = copy(c.buildFamilySupportModel("2026-09"));
  const payload = copy(await c.buildBackupPayload(scopes));
  assert.deepEqual(payload.sections.familyAdjustments.familyAdjustments, snapshot.familyAdjustments);
  assert.equal(payload.sections.incomeInput.records[0].flow, "income");
  assert.equal(payload.sections.importedExcelTransactions.records[0].transactionId, "synthetic-imported-id");
  assert.deepEqual(payload.settings.familySupportKeywords, ["가상입금"]);
  Object.assign(c, { transactions: [], familyAdjustments: [], recurringExpenses: [], appSettings: c.defaultAppSettings() });
  c.applyRestorePayload(c.normalizeBackupPayload(payload), scopes, { mode: "overwrite" });
  const byId = (rows) => Object.fromEntries(rows.map((row) => [row.transactionId, copy(row)]));
  assert.deepEqual(byId(c.transactions), byId(snapshot.records));
  assert.deepEqual(copy(c.familyAdjustments), snapshot.familyAdjustments);
  assert.deepEqual(copy(c.recurringExpenses), snapshot.recurringExpenses);
  assert.deepEqual(copy(c.appSettings.familySupportKeywords), snapshot.settings.familySupportKeywords);
  const balanceAfter = copy(c.buildFamilySupportModel("2026-09"));
  for (const key of ["need", "received", "cumulativeNeed", "cumulativeReceived", "adjustmentTotal", "settlementBalance", "cashBalance", "cashAdjustment"]) {
    assert.equal(balanceAfter[key], balanceBefore[key], key);
  }
  c.familyAdjustments = [];
  c.applyRestorePayload(snapshot, ["familyAdjustments"], { mode: "overwrite" });
  assert.deepEqual(copy(c.familyAdjustments), snapshot.familyAdjustments);
});

test("selected and legacy backups do not clear unselected family data", async () => {
  const { c } = setup();
  c.transactions = [c.normalizeStoredTransaction(transaction())];
  c.familyAdjustments = c.normalizeFamilyAdjustments([adjustment()]);
  const original = copy(c.familyAdjustments);
  const selected = copy(await c.buildBackupPayload(["incomeInput"]));
  assert.equal(Object.hasOwn(selected, "familyAdjustments"), false);
  assert.equal(Object.hasOwn(selected.sections, "familyAdjustments"), false);
  c.applyRestorePayload(c.normalizeBackupPayload({ version: 2, records: [], monthlyIncome: {} }), ["incomeInput", "familyAdjustments"]);
  assert.deepEqual(copy(c.familyAdjustments), original);
  c.applyClearScopes(["incomeInput"]);
  assert.deepEqual(copy(c.familyAdjustments), original);
  c.applyClearScopes(["familyAdjustments"]);
  assert.deepEqual(copy(c.familyAdjustments), []);
});

test("same adjustment ID requires an explicit merge choice and never duplicates", () => {
  const { c } = setup();
  c.familyAdjustments = c.normalizeFamilyAdjustments([adjustment()]);
  const bundle = c.normalizeBackupPayload({ familyAdjustments: [adjustment({ amount: -7000 })] });
  const plan = c.buildBackupMergePlan(bundle, ["familyAdjustments"]);
  assert.equal(plan.conflicts[0].kind, "family-adjustment");
  assert.throws(() => c.applyRestorePayload(bundle, ["familyAdjustments"], { mode: "merge", mergePlan: plan }), /모든 항목/);
  assert.equal(c.familyAdjustments[0].amount, -12000);
  c.applyRestorePayload(bundle, ["familyAdjustments"], { mode: "merge", mergePlan: plan, mergeChoices: { [plan.conflicts[0].id]: "backup" } });
  assert.equal(c.familyAdjustments.length, 1);
  assert.equal(c.familyAdjustments[0].id, "synthetic-adjustment");
  assert.equal(c.familyAdjustments[0].amount, -7000);
  bundle.sections.familyAdjustments.familyAdjustments[0].updatedAt = "2026-09-09T00:00:00Z";
  const again = c.buildBackupMergePlan(bundle, ["familyAdjustments"]);
  assert.equal(again.conflicts.length, 0);
  c.applyRestorePayload(bundle, ["familyAdjustments"], { mode: "merge", mergePlan: again });
  assert.equal(c.familyAdjustments.length, 1);
});

test("loan adjustment references follow matched current transaction IDs while unlinked entries remain pending", () => {
  const { c } = setup();
  const current = c.normalizeStoredTransaction(transaction({ flow: "expense", recurringType: "loan", recordKey: "current-loan", transactionId: "current-loan-id",
    approvalNo: "manual-synthetic-loan", cardNumber: "synthetic-2468" }));
  c.transactions = [current];
  const incoming = { ...current, recordKey: "backup-loan", transactionId: "backup-loan-id" };
  const bundle = c.normalizeBackupPayload({ records: [incoming], familyAdjustments: [
    adjustment({ purpose: "loan_payment", linkedLoanTransactionId: "backup-loan-id" }),
    adjustment({ id: "pending-adjustment", purpose: "loan_payment" })] });
  c.applyRestorePayload(bundle, ["directManualTransactions", "familyAdjustments"], { mode: "merge" });
  assert.equal(c.transactions.length, 1);
  assert.equal(c.familyAdjustments[0].linkedLoanTransactionId, "current-loan-id");
  assert.equal(c.familyAdjustments[1].linkedLoanTransactionId, "");
});

test("recurring burden history conflicts preserve other definition fields and restore both history types", () => {
  const { c } = setup();
  c.recurringExpenses = [c.normalizeRecurringExpense(recurring())];
  const bundle = c.normalizeBackupPayload({ recurringExpenses: [recurring({ name: "가상 이전 이름", amount: 999,
    familyBurdenHistory: [{ fromMonth: "2026-10", amount: 15000 }], loanSupportHistory: [{ fromMonth: "2026-10", principal: 1200, interest: 100 }] })] });
  const plan = c.buildBackupMergePlan(bundle, ["recurringDefinitions"]);
  assert.equal(plan.conflicts[0].kind, "recurring-family-burden");
  c.applyRestorePayload(bundle, ["recurringDefinitions"], { mode: "merge", mergePlan: plan, mergeChoices: { [plan.conflicts[0].id]: "backup" } });
  assert.equal(c.recurringExpenses.length, 1);
  assert.equal(c.recurringExpenses[0].name, "가상 공과금");
  assert.equal(c.recurringExpenses[0].amount, 36000);
  assert.equal(c.recurringExpenses[0].familyBurdenHistory[0].fromMonth, "2026-10");
  assert.equal(c.recurringExpenses[0].loanSupportHistory[0].principal, 1200);
});

test("family changes invalidate an already prepared merge plan", () => {
  const { c } = setup();
  c.familyAdjustments = c.normalizeFamilyAdjustments([adjustment()]);
  const bundle = c.normalizeBackupPayload({ familyAdjustments: [adjustment()] });
  const plan = c.buildBackupMergePlan(bundle, ["familyAdjustments"]);
  c.familyAdjustments[0].amount = 1;
  assert.throws(() => c.resolveBackupMergePlan(plan), /현재 기록이 변경/);
});

test("selected family writes use the existing atomic batch and restore memory on failure", async () => {
  const { c, batches, keys } = setup();
  c.transactions = [c.normalizeStoredTransaction(transaction())];
  c.familyAdjustments = c.normalizeFamilyAdjustments([adjustment()]);
  c.recurringExpenses = [c.normalizeRecurringExpense(recurring())];
  const scopes = ["incomeInput", "familyAdjustments", "recurringDefinitions", "settings"];
  await c.saveSelectedScopes(scopes);
  const writes = Object.fromEntries(batches[0].map(({ key, data }) => [key, data]));
  assert.equal(writes[keys.records][0].incomeKind, "familySupport");
  assert.equal(writes[keys.familyAdjustments][0].amount, -12000);
  assert.equal(writes[keys.recurringExpenses][0].familyBurdenHistory[0].amount, 18000);
  const previous = c.familyAdjustments;
  c.safeSaveMany = async () => false;
  assert.equal(await c.persistDataScopeChange(["familyAdjustments"], () => c.applyClearScopes(["familyAdjustments"]), "가상 복원 전"), false);
  assert.equal(c.familyAdjustments, previous);
});

test("family adjustments load and save through storage adapters rather than direct localStorage", async () => {
  const { c, batches, keys } = setup();
  const store = new Map([[keys.familyAdjustments, [adjustment()]]]);
  const calls = [];
  c.window.BudgetNative = { read: async (key) => { calls.push(key); return store.get(key); } };
  assert.equal((await c.loadFamilyAdjustments())[0].amount, -12000);
  assert.equal(calls.includes(keys.familyAdjustments), true);
  c.familyAdjustments = c.normalizeFamilyAdjustments([adjustment({ purpose: "loan_payment" })]);
  await c.saveFamilyAdjustments();
  assert.equal(batches[0][0].key, keys.familyAdjustments);
  assert.equal(batches[0][0].data[0].purpose, "loan_payment");
  assert.equal(vm.runInContext("FAMILY_ADJUSTMENTS_STORAGE_KEY", c), keys.familyAdjustments);
});
