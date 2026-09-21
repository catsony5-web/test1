const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scope = "importedExcelTransactions";

function setup(mode = "merge") {
  const writes = [], alerts = [], snapshots = [];
  const context = vm.createContext({
    structuredClone, console: { error() {}, warn() {} }, window: {},
    transactions: [], reimbursements: {}, monthlyIncome: {}, importMeta: {}, currentFileName: "",
    recurringExpenses: [], rules: [], products: [], ipoRecords: [], calendarMemos: {}, goalPlan: {}, appSettings: {},
    alert: (message) => alerts.push(message), confirm: () => true,
    els: { dataScopeControls: [{ checked: true, dataset: { dataScope: scope } }],
      restoreModeControls: [{ checked: true, value: mode }] }
  });
  for (const file of ["src/data/constants.js", "src/data/categories.js", "src/utils/date.js", "src/utils/food-occasion.js",
    "src/utils/normalize.js", "src/utils/grouping.js", "src/utils/storage.js", "src/utils/backup.js", "src/utils/backup-merge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  Object.assign(context, {
    renderRestorePreview() {}, reclassify() {}, applyAppSettings() {}, confirmDangerousDataAction: () => true,
    createAutoSnapshot: async (reason) => { snapshots.push(reason); return {}; },
    safeSaveMany: async (entries) => { writes.push(structuredClone(entries)); return true; }
  });
  context.transactions = [context.normalizeStoredTransaction(record({ recordKey: "existing", merchant: "기존 기록" }))];
  context.reimbursements = { existing: 10 };
  return { context, writes, alerts, snapshots };
}

function record(changes = {}) {
  return { recordKey: "incoming", merchant: "합성 상점", sourceType: "card", sourceFile: "synthetic.xlsx",
    approvalDate: "2026-09-10", month: "2026-09", amount: 100, ...changes };
}

function payload(rows, format = "sections") {
  if (format !== "sections") return { app: "monthly-card-budget", version: 2, [format]: rows };
  return { app: "monthly-card-budget", version: 5, sections: { [scope]: { records: rows, reimbursements: {} } } };
}

async function restore(context, value) {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  const target = { files: [{ size: Buffer.byteLength(json), text: async () => json }], disabled: false, value: "synthetic" };
  await context.restoreLocalData({ target });
  assert.equal(target.disabled, false);
  assert.equal(target.value, "");
}

test("invalid backup transaction fields are rejected before any snapshot, save or state change", async () => {
  const invalid = [
    null, [], "not a transaction", record({ merchant: { text: "synthetic" } }),
    record({ approvalDate: [] }), record({ recordKey: 123 }), record({ memo: true }),
    record({ amount: "Infinity" }), record({ amount: "NaN" }), record({ amount: [] }),
    record({ loanPrincipalAmount: {} }), record({ installmentOriginalAmount: true }),
    record({ installmentEnabled: "false" }), record({ loanLinkedExisting: 1 }),
    record({ installmentEnabled: true, installmentMonths: 4294967296 }),
    record({ installmentEnabled: true, installmentMonths: 61 }),
    record({ installmentEnabled: true, installmentMonths: 2.5 }),
    record({ installmentEnabled: true, installmentMonths: 1 }),
    record({ installmentEnabled: true }), record({ installmentMonths: -1 })
  ];
  for (const format of ["sections", "transactions", "records"]) {
    for (const mode of ["merge", "overwrite"]) {
      for (const bad of invalid) {
        const { context, writes, alerts, snapshots } = setup(mode);
        const before = JSON.stringify({ transactions: context.transactions, reimbursements: context.reimbursements });
        const original = context.transactions;
        await restore(context, payload([record({ recordKey: "valid-before-invalid" }), bad], format));
        assert.equal(writes.length, 0, `${format}/${mode}: invalid transaction must not be saved`);
        assert.equal(snapshots.length, 0);
        assert.equal(context.transactions, original);
        assert.equal(JSON.stringify({ transactions: context.transactions, reimbursements: context.reimbursements }), before);
        assert.match(alerts.at(-1), /백업 복원을 완료하지 못했습니다/);
      }
    }
  }
});

test("malformed transaction collections and JSON number overflow cannot overwrite existing records", async () => {
  const invalid = [
    { app: "monthly-card-budget", records: {} },
    { app: "monthly-card-budget", transactions: null },
    { app: "monthly-card-budget", sections: { [scope]: { records: {} } } },
    { app: "monthly-card-budget", sections: { [scope]: { transactions: "invalid" } } },
    { app: "monthly-card-budget", sections: { [scope]: "invalid" } },
    { app: "monthly-card-budget", sections: { [scope]: [] } },
    JSON.stringify(payload([record()])).replace('"amount":100', '"amount":1e400')
  ];
  for (const value of invalid) {
    const { context, writes, snapshots } = setup("overwrite");
    const original = context.transactions;
    await restore(context, value);
    assert.equal(writes.length, 0);
    assert.equal(snapshots.length, 0);
    assert.equal(context.transactions, original);
  }
});

test("valid legacy and section backups retain optional defaults and finite numeric strings", async () => {
  for (const format of ["sections", "transactions", "records"]) {
    for (const mode of ["merge", "overwrite"]) {
      const { context, writes, alerts } = setup(mode);
      const rows = [record({ amount: "100.5", memo: null }),
        record({ recordKey: "installment", amount: "6000", installmentEnabled: true, installmentMonths: "60", installmentStartMonth: "2026-09" })];
      await restore(context, payload(rows, format));
      assert.equal(writes.length, 1);
      assert.equal(context.transactions.length, mode === "merge" ? 3 : 2);
      const restored = context.transactions.find((item) => item.recordKey === "incoming");
      assert.equal(restored.amount, 100.5);
      assert.equal(restored.memo, "");
      assert.equal(restored.installmentMonths, 0);
      const installments = context.expandInstallmentRows(context.transactions.find((item) => item.recordKey === "installment"));
      assert.equal(installments.length, 60);
      assert.equal(installments.reduce((sum, item) => sum + item.amount, 0), 6000);
      assert.match(alerts.at(-1), /불러왔습니다/);
    }
  }
});

test("snapshot-style restoration validates section transactions even without prior normalization", () => {
  const { context } = setup();
  const original = context.transactions;
  assert.throws(() => context.applyRestorePayload(payload([record({ merchant: {} })]), [scope]), /문자열/);
  assert.equal(context.transactions, original);
});

test("installment expansion stays bounded for previously stored invalid month counts", () => {
  const { context } = setup();
  for (const months of [4294967296, Infinity, NaN, -1, 0, 1, 2.5, 61, "Infinity", [2]]) {
    const item = record({ installmentEnabled: true, installmentMonths: months });
    assert.equal(context.hasStructuredInstallment(item), false);
    const rows = context.expandInstallmentRows(item);
    assert.equal(rows.length, 1);
    assert.equal(rows[0], item, "Do not invent or truncate installment payments");
  }
  for (const months of [2, 60]) {
    assert.equal(context.expandInstallmentRows(record({ installmentEnabled: true, installmentMonths: months })).length, months);
  }
});
