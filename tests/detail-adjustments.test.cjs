const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const copy = (value) => JSON.parse(JSON.stringify(value));

function control(value = "", dataset = {}) {
  const listeners = new Map();
  return {
    value, dataset, disabled: false, checked: false,
    addEventListener(type, listener) { listeners.set(type, listener); },
    fire(type) { return listeners.get(type)?.(); }
  };
}

function setup() {
  const stored = new Map(), batches = [], alerts = [];
  let failWrite = false, gate = null, renders = 0, reclassifications = 0;
  const c = vm.createContext({
    console: { warn() {}, error() {} }, structuredClone,
    alert(message) { alerts.push(message); },
    window: { BudgetNative: {
      read: async (key) => stored.has(key) ? copy(stored.get(key)) : undefined,
      writeMany: async (entries) => {
        batches.push(copy(entries));
        if (gate) await gate;
        if (failWrite) throw new Error("synthetic storage failure");
        for (const { key, value } of entries) stored.set(key, copy(value));
      }
    } },
    appSettings: {}, transactions: [], classified: [], reimbursements: { expense: 50, other: 25 },
    detailInstallmentEditRecordKey: "expense",
    normalizeFoodOccasion: (value) => value || "",
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || ""),
    NumericInput: { validate: () => true },
    renderAll() { renders++; },
    renderDetailView() { renders++; }
  });
  for (const file of [
    "src/data/constants.js", "src/utils/date.js", "src/utils/normalize.js", "src/utils/grouping.js",
    "src/utils/storage.js", "src/components/quick-add.js", "src/features/board/board-cards.js",
    "src/features/transactions/transactions-view.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), c, { filename: file });
  c.renderSaveStatus = () => {};
  c.createAutoSnapshot = async () => ({});
  c.reclassify = () => { reclassifications++; c.classified = copy(c.transactions); c.renderAll(); };
  c.transactions = [
    c.normalizeStoredTransaction({ recordKey: "expense", transactionId: "stable-expense", approvalDate: "2026-09-13", merchant: "합성 거래", amount: 1000 }),
    c.normalizeStoredTransaction({ recordKey: "income", transactionId: "stable-income", approvalDate: "2026-09-13", merchant: "합성 수입", amount: 2000, flow: "income" })
  ];
  c.classified = copy(c.transactions);
  const keys = vm.runInContext("({ ...STORAGE_KEYS })", c);
  stored.set(keys.records, copy(c.transactions));
  stored.set(keys.reimbursements, copy(c.reimbursements));

  const reimbursement = control("300", { recordKey: "expense" });
  const otherReimbursement = control("25", { recordKey: "other" });
  otherReimbursement.disabled = true;
  c.attachReimbursementHandlers({ querySelectorAll: () => [reimbursement, otherReimbursement] });

  const fields = { enabled: control(), months: control("3"), startMonth: control("2026-09") };
  fields.enabled.checked = true;
  const saveButton = control("", { installmentSave: "expense" });
  const cancelButton = control();
  const row = {
    dataset: { installmentRow: "expense" },
    querySelector(selector) {
      return selector === ".installment-preview" ? { textContent: "" }
        : fields[selector.match(/data-installment-field="([^"]+)"/)?.[1]];
    },
    querySelectorAll(selector) {
      if (selector === "[data-installment-field]") return Object.values(fields);
      if (selector === "[data-installment-save]") return [saveButton];
      if (selector === "[data-detail-installment-cancel]") return [cancelButton];
      if (selector === "input, button") return [...Object.values(fields), saveButton, cancelButton];
      throw new Error(`Unexpected selector: ${selector}`);
    }
  };
  c.attachInstallmentHandlers({ querySelectorAll: () => [row] });
  return {
    c, keys, stored, batches, alerts, reimbursement, otherReimbursement, row, fields, saveButton, cancelButton,
    renders: () => renders, reclassifications: () => reclassifications,
    fail(value = true) { failWrite = value; },
    pause() { let release; gate = new Promise((resolve) => { release = resolve; }); return () => { release(); gate = null; }; }
  };
}

test("정산금 저장 실패는 메모리·입력을 유지하고 재시도 성공에만 반영한다", async () => {
  const h = setup(), before = h.c.reimbursements;
  h.fail();
  await h.reimbursement.fire("change");
  assert.equal(h.c.reimbursements, before);
  assert.deepEqual(h.stored.get(h.keys.reimbursements), copy(before));
  assert.equal(h.reimbursement.value, "300");
  assert.equal(h.reimbursement.disabled, false);
  assert.equal(h.otherReimbursement.disabled, true);
  assert.equal(h.renders(), 0);
  assert.equal(h.alerts.length, 1);
  h.fail(false);
  await h.reimbursement.fire("change");
  assert.deepEqual(copy(h.c.reimbursements), { expense: 300, other: 25 });
  assert.deepEqual(h.stored.get(h.keys.reimbursements), copy(h.c.reimbursements));
  assert.equal(h.renders(), 1);
});

test("정산금 0원 삭제도 저장 실패 시 유지하고 성공 뒤에만 삭제한다", async () => {
  const h = setup();
  h.reimbursement.value = "0";
  h.fail();
  await h.reimbursement.fire("change");
  assert.equal(h.c.reimbursements.expense, 50);
  h.fail(false);
  await h.reimbursement.fire("change");
  assert.deepEqual(copy(h.c.reimbursements), { other: 25 });
  assert.deepEqual(h.stored.get(h.keys.reimbursements), { other: 25 });
});

test("정산금 저장 대기 중 재입력은 중복 저장하지 않고 잠금을 복원한다", async () => {
  const h = setup(), release = h.pause();
  const pending = h.reimbursement.fire("change");
  assert.equal(h.reimbursement.disabled, true);
  assert.equal(h.c.reimbursements.expense, 50);
  await h.reimbursement.fire("change");
  release();
  await pending;
  assert.equal(h.batches.length, 1);
  assert.equal(h.reimbursement.disabled, false);
  assert.equal(h.otherReimbursement.disabled, true);
  assert.equal(h.renders(), 1);
});

test("할부 저장 실패는 원본·편집기를 유지하고 재시도 성공에만 닫는다", async () => {
  const h = setup(), before = h.c.transactions, classified = h.c.classified;
  h.fail();
  await h.saveButton.fire("click");
  assert.equal(h.c.transactions, before);
  assert.equal(h.c.classified, classified);
  assert.deepEqual(h.stored.get(h.keys.records), copy(before));
  assert.equal(h.c.detailInstallmentEditRecordKey, "expense");
  assert.equal(h.fields.months.value, "3");
  assert.equal(h.fields.enabled.checked, true);
  assert.equal(h.saveButton.disabled, false);
  assert.equal(h.renders(), 0);
  assert.equal(h.reclassifications(), 0);
  assert.equal(h.alerts.length, 1);
  h.fail(false);
  await h.saveButton.fire("click");
  const updated = h.c.transactions[0];
  assert.equal(updated.installmentEnabled, true);
  assert.equal(updated.installmentMonths, 3);
  assert.equal(updated.installmentMonthlyAmount, 333);
  assert.equal(updated.recordKey, before[0].recordKey);
  assert.equal(updated.transactionId, before[0].transactionId);
  assert.deepEqual(copy(h.c.transactions[1]), copy(before[1]));
  assert.equal(before[0].installmentEnabled, false);
  assert.deepEqual(h.stored.get(h.keys.records), copy(h.c.transactions));
  assert.equal(h.c.detailInstallmentEditRecordKey, "");
  assert.equal(h.reclassifications(), 1);
  assert.equal(h.renders(), 1);
});

test("할부 저장 대기 중 중복 클릭을 막고 기존 비활성 상태를 보존한다", async () => {
  const h = setup(), before = h.c.transactions, release = h.pause();
  h.fields.startMonth.disabled = true;
  const pending = h.saveButton.fire("click");
  assert.equal(h.c.transactions, before);
  assert.equal(h.c.detailInstallmentEditRecordKey, "expense");
  assert.ok(h.row.querySelectorAll("input, button").every((node) => node.disabled));
  await h.saveButton.fire("click");
  release();
  await pending;
  assert.equal(h.batches.length, 1);
  assert.equal(h.fields.startMonth.disabled, true);
  assert.equal(h.saveButton.disabled, false);
  assert.equal(h.cancelButton.disabled, false);
  assert.equal(h.renders(), 1);
});

test("할부 저장 대상이 없거나 입력 검사가 실패하면 편집기를 유지한다", async () => {
  for (const invalid of ["missing", "validation"]) {
    const h = setup(), before = h.c.transactions;
    if (invalid === "missing") h.saveButton.dataset.installmentSave = "missing";
    else h.c.NumericInput.validate = () => false;
    await h.saveButton.fire("click");
    assert.equal(h.c.transactions, before);
    assert.equal(h.c.detailInstallmentEditRecordKey, "expense");
    assert.equal(h.batches.length, 0);
    assert.equal(h.renders(), 0);
    assert.equal(h.saveButton.disabled, false);
  }
});

test("예외가 생겨도 정산금·할부 원본과 입력을 보존하고 저장 잠금을 해제한다", async () => {
  for (const field of ["reimbursement", "installment"]) {
    const h = setup(), before = h.c.transactions, reimbursements = h.c.reimbursements;
    const save = h.c.safeSave;
    h.c.safeSave = async () => { throw new Error("synthetic unexpected failure"); };
    const run = () => field === "reimbursement" ? h.reimbursement.fire("change") : h.saveButton.fire("click");
    await assert.rejects(run(), /synthetic unexpected failure/);
    assert.equal(h.c.transactions, before);
    assert.equal(h.c.reimbursements, reimbursements);
    assert.equal(h.c.detailInstallmentEditRecordKey, "expense");
    assert.equal(h.reimbursement.disabled, false);
    assert.equal(h.saveButton.disabled, false);
    assert.equal(h.renders(), 0);
    h.c.safeSave = save;
    await run();
    assert.equal(h.batches.length, 1);
    assert.equal(h.renders(), 1);
  }
});
