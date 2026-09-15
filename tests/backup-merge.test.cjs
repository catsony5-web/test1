const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IMPORTED = "importedExcelTransactions";
const copy = (value) => JSON.parse(JSON.stringify(value));
function setup() {
  const context = vm.createContext({
    structuredClone, console: { error() {}, warn() {} }, window: {},
    transactions: [], reimbursements: {}, monthlyIncome: {}, importMeta: {}, currentFileName: "",
    appSettings: {}, products: [], recurringExpenses: [], rules: [], ipoRecords: [], calendarMemos: {}, goalPlan: {},
    applyAppSettings() {}, normalizeProduct: (value) => ({ ...value }),
    createAutoSnapshot() { throw new Error("Planning must never create snapshots"); },
    safeSaveMany() { throw new Error("Planning must never write storage"); }
  });
  for (const file of ["src/data/constants.js", "src/utils/date.js", "src/utils/normalize.js", "src/utils/food-occasion.js", "src/utils/storage.js", "src/utils/backup.js", "src/utils/backup-merge.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  context.createAutoSnapshot = () => { throw new Error("Planning must never create snapshots"); };
  context.safeSaveMany = () => { throw new Error("Planning must never write storage"); };
  return context;
}
function purchase(key = "record-a", overrides = {}) {
  return {
    recordKey: key, transactionId: `tx-${key}`, sourceType: "card", sourceFile: "synthetic.xlsx", flow: "expense",
    approvalDate: "2026-09-10", month: "2026-09", merchant: "합성 상점", amount: 10000,
    ...overrides
  };
}
function bundle(records, reimbursements = {}, extraSections = {}) {
  return { sections: { [IMPORTED]: { records, reimbursements }, ...extraSections } };
}
function state(context) {
  return copy({ transactions: context.transactions, reimbursements: context.reimbursements, monthlyIncome: context.monthlyIncome, products: context.products });
}

test("merge preparation and resolution are pure, and equal records ignore identity/provenance-only differences", () => {
  const c = setup();
  c.transactions = [purchase("existing", { approvalNo: "approval-1", cardNumber: "1111", importedAt: "2026-09-10T01:00:00Z" })];
  c.reimbursements = { existing: 1000 };
  const incoming = bundle([purchase("backup-key", { approvalNo: "approval-1", cardNumber: "1111", importedAt: "2026-09-11T01:00:00Z", sourceFile: "later-copy.xlsx" })], { "backup-key": 1000 });
  const before = state(c);
  const originalBundle = copy(incoming);
  const plan = c.buildBackupMergePlan(incoming, [IMPORTED]);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.summary.unchangedTransactions, 1);
  const result = c.resolveBackupMergePlan(plan, {});
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].recordKey, "existing");
  assert.equal(result.transactions[0].importedAt, c.transactions[0].importedAt);
  assert.deepEqual(state(c), before);
  assert.deepEqual(incoming, originalBundle);
});

test("changed amounts, dates, classification and notes require explicit choice before any section is applied", () => {
  for (const changes of [{ amount: 12000 }, { approvalDate: "2026-09-11", month: "2026-09" }, { manualSector: "식비", manualSubcategory: "외식" }, { memo: "백업 메모" }]) {
    const c = setup();
    c.transactions = [purchase()];
    c.products = [{ id: "current-product" }];
    const incoming = bundle([purchase("record-a", changes)], {}, { products: { products: [{ id: "backup-product" }] } });
    const before = state(c);
    const plan = c.buildBackupMergePlan(incoming, [IMPORTED, "products"]);
    assert.equal(plan.conflicts.length, 1);
    assert.throws(() => c.applyRestorePayload(incoming, [IMPORTED, "products"], { mode: "merge" }), /모든 항목/);
    assert.deepEqual(state(c), before, "A missing choice must not partially apply a non-conflicting section");
  }
});

test("current choice keeps the current transaction and its reimbursement together", () => {
  const c = setup();
  c.transactions = [purchase("record-a", { memo: "현재 메모" })];
  c.reimbursements = { "record-a": 3000, unrelated: 500 };
  const incoming = bundle([purchase("record-a", { amount: 8000, memo: "백업 메모" })], { "record-a": 2000 });
  const plan = c.buildBackupMergePlan(incoming, [IMPORTED]);
  c.applyRestorePayload(incoming, [IMPORTED], { mode: "merge", mergePlan: plan, mergeChoices: { [plan.conflicts[0].id]: "current" } });
  assert.equal(c.transactions[0].amount, 10000);
  assert.equal(c.transactions[0].memo, "현재 메모");
  assert.deepEqual(copy(c.reimbursements), { "record-a": 3000, unrelated: 500 });
});

test("backup choice applies business fields and reimbursement while preserving existing identity and links", () => {
  const c = setup();
  c.transactions = [purchase("current-key", {
    transactionId: "stable-id", loanLinkedExisting: true, recurringId: "existing-loan", recurringType: "loan",
    loanSupportIncomeTransactionId: "existing-income", installmentGroupId: "existing-group", memo: "현재"
  })];
  c.reimbursements = { "current-key": 3000 };
  const incoming = bundle([purchase("old-backup-key", { transactionId: "stable-id", amount: 12000, memo: "백업" })], { "old-backup-key": 2500 });
  const plan = c.buildBackupMergePlan(incoming, [IMPORTED]);
  const choice = { [plan.conflicts[0].id]: "backup" };
  c.applyRestorePayload(incoming, [IMPORTED], { mode: "merge", mergePlan: plan, mergeChoices: choice });
  const record = c.transactions[0];
  assert.equal(record.amount, 12000);
  assert.equal(record.memo, "백업");
  assert.equal(record.recordKey, "current-key");
  assert.equal(record.transactionId, "stable-id");
  assert.equal(record.recurringId, "existing-loan");
  assert.equal(record.loanSupportIncomeTransactionId, "existing-income");
  assert.equal(record.installmentGroupId, "existing-group");
  assert.deepEqual(copy(c.reimbursements), { "current-key": 2500 });
});

test("a matching card restore signature compares content even when both backup identifiers differ", () => {
  const c = setup();
  c.transactions = [purchase("current", { approvalNo: "same-approval", cardNumber: "1111" })];
  const incoming = bundle([purchase("backup", { approvalNo: "same-approval", cardNumber: "1111", memo: "수정 메모" })]);
  const plan = c.buildBackupMergePlan(incoming, [IMPORTED]);
  assert.equal(plan.conflicts.length, 1);
  const result = c.resolveBackupMergePlan(plan, { [plan.conflicts[0].id]: "backup" });
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].recordKey, "current");
  assert.equal(result.transactions[0].transactionId, "tx-current");
  assert.equal(result.transactions[0].memo, "수정 메모");
});

test("a special source filename that changes the transaction scope requires a choice", () => {
  const c = setup();
  c.transactions = [purchase("same-record")];
  const incoming = { sections: { pastBulkTransactions: {
    records: [purchase("same-record", { sourceFile: "과거 거래 일괄 입력" })], reimbursements: {}
  } } };
  const plan = c.buildBackupMergePlan(incoming, ["pastBulkTransactions"]);
  assert.equal(plan.conflicts.length, 1);
  const result = c.resolveBackupMergePlan(plan, { [plan.conflicts[0].id]: "backup" });
  assert.equal(c.getTransactionDataSection(result.transactions[0]), "pastBulkTransactions");
  assert.equal(c.getTransactionDataSection(c.transactions[0]), IMPORTED);
});

test("a reimbursement-only difference needs a choice and backup without reimbursement clears the current amount", () => {
  const c = setup();
  c.transactions = [purchase()];
  c.reimbursements = { "record-a": 2500 };
  const incoming = bundle([purchase()]);
  const plan = c.buildBackupMergePlan(incoming, [IMPORTED]);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].current.reimbursement, 2500);
  assert.equal(plan.conflicts[0].incoming.reimbursement, 0);
  const resolved = c.resolveBackupMergePlan(plan, { [plan.conflicts[0].id]: "backup" });
  assert.equal(Object.hasOwn(resolved.reimbursements, "record-a"), false);
  assert.equal(c.reimbursements["record-a"], 2500, "Preparation must preserve current globals");
});

test("new transactions and their reimbursements are added while unrelated scopes and similar payments survive", () => {
  const c = setup();
  c.transactions = [purchase("first"), purchase("manual", { sourceType: "manual", sourceFile: "직접입력" })];
  c.monthlyIncome = { "2026-09": 1000000 };
  const incoming = bundle([purchase("second")], { second: 1000 }, { incomeInput: { records: [], monthlyIncome: { "2026-09": 2000000 } } });
  const plan = c.buildBackupMergePlan(incoming, [IMPORTED]);
  assert.equal(plan.conflicts.length, 0);
  c.applyRestorePayload(incoming, [IMPORTED], { mode: "merge", mergePlan: plan });
  assert.equal(c.transactions.length, 3);
  assert.equal(c.reimbursements.second, 1000);
  assert.equal(c.monthlyIncome["2026-09"], 1000000);
});

test("monthly income conflicts support separate current and backup choices, and absent months remain", () => {
  const c = setup();
  c.monthlyIncome = { "2026-07": 100, "2026-08": 200, "2026-09": 300 };
  const incoming = { sections: { incomeInput: { records: [], monthlyIncome: { "2026-08": 250, "2026-09": 350, "2026-10": 400 } } } };
  const plan = c.buildBackupMergePlan(incoming, ["incomeInput"]);
  assert.equal(plan.conflicts.length, 2);
  assert.ok(plan.conflicts.every((entry) => entry.kind === "monthly-income"));
  assert.throws(() => c.resolveBackupMergePlan(plan, { "monthly-income:2026-08": "backup" }), /모든 항목/);
  const result = c.resolveBackupMergePlan(plan, { "monthly-income:2026-08": "current", "monthly-income:2026-09": "backup" });
  assert.deepEqual(copy(result.monthlyIncome), { "2026-07": 100, "2026-08": 200, "2026-09": 350, "2026-10": 400 });
});

test("new loan support references are remapped to the matched existing income identity", () => {
  const c = setup();
  const currentIncome = purchase("current-income", {
    transactionId: "current-income-id", sourceType: "manual", sourceFile: "수입 직접 입력", flow: "income", approvalNo: "manual-1", cardNumber: "1111"
  });
  c.transactions = [currentIncome];
  const incomingIncome = { ...currentIncome, recordKey: "backup-income", transactionId: "backup-income-id" };
  const loan = purchase("new-loan", { sourceType: "recurring", sourceFile: "고정 지출", recurringId: "loan-definition", loanSupportIncomeTransactionId: "backup-income-id" });
  const legacyLoan = purchase("legacy-loan", { sourceType: "recurring", sourceFile: "고정 지출", recurringId: "legacy-loan-definition", loanSupportIncomeRecordKey: "backup-income" });
  const incoming = { sections: {
    incomeInput: { records: [incomingIncome], reimbursements: {}, monthlyIncome: {} },
    recurringPostedTransactions: { records: [loan, legacyLoan], reimbursements: {} }
  } };
  const plan = c.buildBackupMergePlan(incoming, ["incomeInput", "recurringPostedTransactions"]);
  assert.equal(plan.conflicts.length, 0);
  const result = c.resolveBackupMergePlan(plan);
  assert.equal(result.transactions.length, 3);
  assert.equal(result.transactions.find((record) => record.recordKey === "new-loan").loanSupportIncomeTransactionId, "current-income-id");
  assert.equal(result.transactions.find((record) => record.recordKey === "legacy-loan").loanSupportIncomeTransactionId, "current-income-id");
});

test("changed current baseline or backup request invalidates a reviewed plan before mutation", () => {
  const c = setup();
  c.transactions = [purchase()];
  const incoming = bundle([purchase("record-a", { amount: 12000 })]);
  const plan = c.buildBackupMergePlan(incoming, [IMPORTED]);
  const choices = { [plan.conflicts[0].id]: "backup" };
  c.transactions[0].memo = "미리보기 이후 변경";
  assert.throws(() => c.applyRestorePayload(incoming, [IMPORTED], { mode: "merge", mergePlan: plan, mergeChoices: choices }), /현재 기록이 변경/);
  assert.equal(c.transactions[0].memo, "미리보기 이후 변경");
  const fresh = c.buildBackupMergePlan(incoming, [IMPORTED]);
  incoming.sections[IMPORTED].records[0].amount = 99999;
  assert.throws(() => c.applyRestorePayload(incoming, [IMPORTED], { mode: "merge", mergePlan: fresh, mergeChoices: choices }), /백업 파일 또는 복원 항목/);
  assert.equal(c.transactions[0].amount, 10000);
});

test("ambiguous legacy income-reference aliases cannot silently link a loan to a different income", () => {
  const c = setup();
  const incomeFields = { sourceType: "manual", sourceFile: "수입 직접 입력", flow: "income", cardNumber: "1111" };
  const first = purchase("shared-reference", { ...incomeFields, transactionId: "current-a", approvalNo: "manual-a" });
  const second = purchase("current-b", { ...incomeFields, transactionId: "current-b-id", approvalNo: "manual-b" });
  c.transactions = [first, second];
  const incoming = { sections: {
    incomeInput: { records: [
      { ...first, transactionId: "backup-a" },
      { ...second, recordKey: "backup-b", transactionId: "shared-reference" }
    ], monthlyIncome: {} },
    recurringPostedTransactions: { records: [purchase("new-loan", {
      sourceType: "recurring", sourceFile: "고정 지출", recurringId: "loan-definition", loanSupportIncomeRecordKey: "shared-reference"
    })] }
  } };
  const before = state(c);
  assert.throws(() => c.buildBackupMergePlan(incoming, ["incomeInput", "recurringPostedTransactions"]), /연결 식별자가 서로 다른 수입/);
  assert.deepEqual(state(c), before);
});

test("invalid choices, ambiguous identity matches and conflicting duplicates fail closed", () => {
  const c = setup();
  c.transactions = [purchase()];
  const incoming = bundle([purchase("record-a", { memo: "new" })]);
  const plan = c.buildBackupMergePlan(incoming, [IMPORTED]);
  assert.throws(() => c.resolveBackupMergePlan(plan, { unknown: "backup" }), /없는 항목/);
  assert.throws(() => c.resolveBackupMergePlan(plan, { [plan.conflicts[0].id]: "skip" }), /모든 항목/);
  assert.throws(() => c.buildBackupMergePlan(bundle([purchase(), purchase("record-a", { amount: 15000 })]), [IMPORTED]), /내용이 서로 다른 중복/);
  c.transactions.push(purchase("record-b"));
  assert.throws(() => c.buildBackupMergePlan(bundle([purchase("record-a", { transactionId: "tx-record-b" })]), [IMPORTED]), /서로 다른 현재 거래/);
  assert.equal(c.transactions.length, 2);
});

test("invalid monthly-income amounts and unsafe backup keys do not produce an applicable plan", () => {
  const c = setup();
  for (const income of [{ "2026-13": 100 }, { "2026-09": -1 }, { "2026-09": null }, { "2026-09": {} }, { "2026-09": false }, { "2026-09": " " }]) {
    assert.throws(() => c.buildBackupMergePlan({ sections: { incomeInput: { records: [], monthlyIncome: income } } }, ["incomeInput"]), /올바르지 않은/);
  }
  const unsafe = JSON.parse('{"sections":{"products":{"products":[],"__proto__":{"polluted":true}}}}');
  assert.throws(() => c.buildBackupMergePlan(unsafe, ["products"]), /안전하지 않은/);
  assert.equal({}.polluted, undefined);
});
