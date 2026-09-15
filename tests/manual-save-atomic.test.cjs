const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const copy = (value) => JSON.parse(JSON.stringify(value));
const field = (value = "") => ({ value, checked: false, disabled: false, innerHTML: "", textContent: "", querySelectorAll: () => [] });
const submit = () => ({ preventDefault() {} });

function setup() {
  const stored = new Map();
  const alerts = [];
  const batches = [];
  let failWrite = false, renders = 0, gate = null;
  const context = vm.createContext({
    console: { warn() {}, error() {} }, structuredClone,
    window: { setTimeout() {}, BudgetNative: {
      read: async (key) => stored.has(key) ? copy(stored.get(key)) : undefined,
      writeMany: async (entries) => {
        batches.push(copy(entries));
        if (gate) await gate;
        if (failWrite) throw new Error("synthetic commit failure");
        for (const { key, value } of entries) stored.set(key, copy(value));
      }
    } },
    alert: (message) => alerts.push(message), confirm: () => true,
    FormData: class { constructor(form) { this.values = form.values; } get(key) { return this.values[key]; } },
    appSettings: {}, transactions: [], classified: [], reimbursements: {}, importMeta: { lastFileName: "이전 기록" },
    currentFileName: "이전 기록", incomeBulkRows: [], detailBulkRows: [], editingIncomeKey: "income-old",
    editingDetailBulkRecordKey: "expense-old", selectedDetailBulkSubtab: "input", boardQuickAddSectionKey: "food", boardQuickAddFeedback: "",
    boardSections: [{ key: "food", sector: "식비", subcategory: "식사" }],
    normalizeFoodOccasion: (value) => value || "", cssEscape: String,
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || ""),
    expenseRows: (rows) => rows.filter((row) => row.flow !== "income"),
    loanSupportLinkedIncomeAmount: () => 0,
    els: {
      incomeEntryDate: field("2026-09-15"), incomeEntryDescription: field("합성 수입"), incomeEntryAmount: field("3000"),
      incomeBulkPaste: field("2026-09-15 합성 일괄수입 3000"), incomeBulkFeedback: field(), incomeBulkPreview: field(),
      manualSourceType: field("card"), manualFlow: field("expense"), manualDate: field("2026-09-15"),
      manualTime: field("12:00"), manualMerchant: field("합성 직접입력"), manualAmount: field("3000"),
      manualSector: field("식비"), manualSubcategory: field("식사"), pasteEntries: field("2026-09-15\t합성붙여넣기\t3000"),
      detailBulkPaste: field("2026-09-15 합성 과거거래 3000"), detailBulkPreview: field(), detailBulkFeedback: field(),
      detailBulkAllowDuplicates: field(), saveDetailBulkButton: field()
    }
  });
  // Match browser ordering, including the former later quick-add definition.
  for (const file of [
    "src/data/constants.js", "src/data/categories.js", "src/utils/date.js", "src/utils/normalize.js", "src/utils/storage.js",
    "src/components/quick-add.js", "src/features/board/board-cards.js", "src/features/details/details-view.js",
    "src/features/income/income-entry.js", "src/features/income/income-bulk.js", "src/features/income/income-list.js",
    "src/features/transactions/transactions-view.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  context.createAutoSnapshot = async () => ({});
  context.renderSaveStatus = () => {};
  context.reclassify = () => { renders += 1; context.classified = copy(context.transactions); };
  context.setDetailBulkFeedback = (message, type) => { context.els.detailBulkFeedback.textContent = message; context.els.detailBulkFeedback.type = type; };
  context.transactions = [
    context.normalizeStoredTransaction({ recordKey: "income-old", transactionId: "income-stable", sourceType: "transfer", flow: "income", sourceFile: "수입 직접 입력", approvalDate: "2026-09-13", merchant: "합성 이전수입", amount: 1000 }),
    context.normalizeStoredTransaction({ recordKey: "expense-old", transactionId: "expense-stable", sourceType: "manual", flow: "expense", sourceFile: "과거 거래 일괄 입력", approvalDate: "2026-09-13", merchant: "합성 이전거래", amount: 1000 })
  ];
  context.classified = copy(context.transactions);
  context.reimbursements = { "expense-old": 50 };
  const keys = vm.runInContext("({...STORAGE_KEYS})", context);
  stored.set(keys.records, copy(context.transactions));
  stored.set(keys.importMeta, copy(context.importMeta));
  stored.set(keys.reimbursements, copy(context.reimbursements));
  const incomeCard = editCard("data-income-edit-field", { date: "2026-09-15", merchant: "합성 수정수입", amount: "4000" });
  context.els.incomeEntryList = { querySelector: () => ({ closest: () => incomeCard }) };
  const expenseCard = editCard("data-detail-bulk-record-field", {
    date: "2026-09-15", merchant: "합성 수정거래", amount: "4000", reimbursement: "100", sourceType: "manual",
    sector: "식비", subcategory: "식사", installmentMonths: "0", installmentStartMonth: "2026-09"
  });
  context.els.detailBulkRecordList = { querySelector: () => ({ closest: () => expenseCard }) };
  return {
    c: context, stored, keys, alerts, batches, renders: () => renders,
    fail: (value = true) => { failWrite = value; },
    pause: () => { let release; gate = new Promise((resolve) => { release = resolve; }); return () => { release(); gate = null; }; }
  };
}

function editCard(attribute, values) {
  return { querySelector: (selector) => field(values[selector.match(new RegExp(attribute + '="([^"]+)"'))?.[1]] || "") };
}

function ledgerState(c) {
  return copy({ transactions: c.transactions, reimbursements: c.reimbursements, importMeta: c.importMeta,
    currentFileName: c.currentFileName, editingIncomeKey: c.editingIncomeKey, editingDetailBulkRecordKey: c.editingDetailBulkRecordKey,
    boardQuickAddSectionKey: c.boardQuickAddSectionKey, boardQuickAddFeedback: c.boardQuickAddFeedback });
}

const additions = [
  {
    name: "수기 단건", run: (c) => c.handleManualEntry(submit()),
    input: (c) => c.els.manualMerchant.value, keys: ["records", "importMeta"]
  },
  {
    name: "수기 붙여넣기", run: (c) => c.handlePasteEntries(),
    input: (c) => c.els.pasteEntries.value, keys: ["records", "importMeta"]
  },
  {
    name: "수입 단건", run: (c) => c.handleIncomeEntry(submit()),
    input: (c) => c.els.incomeEntryDescription.value, keys: ["records", "importMeta"]
  },
  {
    name: "수입 일괄", prepare(c) { c.incomeBulkRows = [{ date: "2026-09-15", description: "합성 일괄수입", amount: 3000 }]; },
    run: (c) => c.handleIncomeBulkSave(), input: (c) => c.els.incomeBulkPaste.value, keys: ["records", "importMeta"]
  },
  {
    name: "과거 거래 일괄", prepare(c) { c.detailBulkRows = [{ id: "synthetic", date: "2026-09-15", description: "합성 과거거래", amount: 3000, reimbursement: 100, sector: "식비", subcategory: "식사" }]; },
    run: (c) => c.handleDetailBulkSave(), input: (c) => c.els.detailBulkPaste.value, keys: ["records", "reimbursements", "importMeta"]
  },
  {
    name: "분류 보드 직접입력", run: (c) => c.handleBoardQuickAdd({ ...submit(), currentTarget: {
      dataset: { quickAddForm: "food" }, values: { sourceType: "card", date: "2026-09-15", merchant: "합성 보드입력", amount: "3000", reimbursement: "100" }
    } }), input: (c) => c.boardQuickAddSectionKey, keys: ["records", "reimbursements", "importMeta"]
  }
];

for (const scenario of additions) {
  test(`${scenario.name}: 저장 실패는 원본과 입력을 유지하고 재시도는 관련 데이터를 한 번에 저장한다`, async () => {
    const h = setup();
    scenario.prepare?.(h.c);
    const before = ledgerState(h.c), input = scenario.input(h.c), disk = copy([...h.stored]);
    h.fail();
    await scenario.run(h.c);
    assert.deepEqual(ledgerState(h.c), before);
    assert.deepEqual(copy([...h.stored]), disk);
    assert.equal(scenario.input(h.c), input);
    assert.equal(h.renders(), 0);
    assert.equal(h.alerts.length, 1);
    assert.doesNotMatch(h.c.els.incomeBulkFeedback.textContent + h.c.els.detailBulkFeedback.textContent, /저장했습니다/);
    h.fail(false);
    await scenario.run(h.c);
    assert.equal(h.c.transactions.length, before.transactions.length + 1);
    assert.equal(scenario.input(h.c), "");
    assert.equal(h.renders(), 1);
    assert.equal(h.batches.length, 2);
    const committedKeys = new Set(h.batches[1].map(({ key }) => key));
    for (const key of scenario.keys) assert.ok(committedKeys.has(h.keys[key]), `missing ${key}`);
    assert.deepEqual(h.stored.get(h.keys.records), copy(h.c.transactions));
    assert.deepEqual(h.stored.get(h.keys.importMeta), copy(h.c.importMeta));
    assert.deepEqual(h.stored.get(h.keys.reimbursements), copy(h.c.reimbursements));
  });
}

for (const [name, run, editedId, editedAmount] of [
  ["수입 수정", (c) => c.saveIncomeEntryEdit("income-old"), "income-stable", 4000],
  ["과거 거래 수정", (c) => c.saveDetailBulkRecordEdit("expense-old"), "expense-stable", 4000],
  ["수입 삭제", (c) => c.deleteIncomeEntry("income-old"), "income-stable", null],
  ["과거 거래 삭제", (c) => c.deleteDetailBulkRecord("expense-old"), "expense-stable", null]
]) {
  test(`${name}: 실패 시 원본과 편집 상태를 유지하고 성공 때만 변경한다`, async () => {
    const h = setup(), before = ledgerState(h.c), disk = copy([...h.stored]);
    h.fail();
    await run(h.c);
    assert.deepEqual(ledgerState(h.c), before);
    assert.deepEqual(copy([...h.stored]), disk);
    assert.equal(h.renders(), 0);
    h.fail(false);
    await run(h.c);
    const edited = h.c.transactions.find((row) => row.transactionId === editedId);
    if (editedAmount === null) assert.equal(edited, undefined);
    else assert.equal(edited.amount, editedAmount);
    assert.equal(h.renders(), 1);
    assert.deepEqual(h.stored.get(h.keys.records), copy(h.c.transactions));
    assert.deepEqual(h.stored.get(h.keys.reimbursements), copy(h.c.reimbursements));
    if (editedId === "expense-stable") {
      assert.equal(h.c.reimbursements["expense-old"], undefined);
      if (edited) assert.equal(h.c.reimbursements[edited.recordKey], 100);
    }
  });
}

test("수입 수정은 연결된 대출 입금일도 같은 저장에 포함하고 실패 시 둘 다 유지한다", async () => {
  const h = setup();
  h.c.transactions.push(h.c.normalizeStoredTransaction({ recordKey: "linked-loan", transactionId: "loan-stable", loanSupportIncomeTransactionId: "income-stable", loanSupportReceivedDate: "2026-09-13", amount: 500 }));
  h.stored.set(h.keys.records, copy(h.c.transactions));
  h.fail();
  await h.c.saveIncomeEntryEdit("income-old");
  assert.equal(h.c.transactions.at(-1).loanSupportReceivedDate, "2026-09-13");
  h.fail(false);
  await h.c.saveIncomeEntryEdit("income-old");
  assert.equal(h.c.transactions.at(-1).loanSupportReceivedDate, "2026-09-15");
  assert.equal(h.stored.get(h.keys.records).at(-1).loanSupportReceivedDate, "2026-09-15");
});

test("저장 대기 중 재제출은 중복 거래를 만들지 않고 다른 입력은 재시도할 수 있다", async () => {
  const h = setup(), release = h.pause();
  const first = h.c.handleIncomeEntry(submit());
  await h.c.handleIncomeEntry(submit());
  await h.c.handleManualEntry(submit());
  assert.equal(h.c.transactions.length, 2);
  assert.equal(h.c.els.manualMerchant.value, "합성 직접입력");
  release();
  await first;
  assert.equal(h.c.transactions.length, 3);
  assert.equal(h.batches.length, 1);
  await h.c.handleManualEntry(submit());
  assert.equal(h.c.transactions.length, 4);
  assert.equal(h.batches.length, 2);
});

test("예외가 발생해도 제출 잠금은 풀려 입력을 다시 저장할 수 있다", async () => {
  const h = setup();
  h.c.createAutoSnapshot = async () => { throw new Error("synthetic snapshot failure"); };
  await assert.rejects(h.c.handleIncomeEntry(submit()), /snapshot failure/);
  assert.equal(h.c.els.incomeEntryDescription.value, "합성 수입");
  assert.equal(h.batches.length, 0);
  h.c.createAutoSnapshot = async () => ({});
  await h.c.handleIncomeEntry(submit());
  assert.equal(h.c.transactions.length, 3);
});
