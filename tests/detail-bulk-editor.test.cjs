const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const copy = (value) => JSON.parse(JSON.stringify(value));
const defaults = { sector: "식비", subcategory: "외식-혼자", sourceType: "card", reimbursement: 0, autoSuggest: false };
const sourceText = "2026-10-10 합성 식사 12000";

function control(value = "") {
  return {
    value: String(value), checked: false, disabled: false, hidden: false, open: false,
    innerHTML: "", textContent: "", dataset: {}, type: "text",
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, focus() {},
    querySelectorAll: () => [], querySelector: () => null, closest: () => null
  };
}

function setup() {
  const stored = new Map(), batches = [], alerts = [], validated = [], rendered = [];
  let failWrite = false, numericValid = true, reclassifications = 0, snapshots = 0;
  let editorFields = [];
  const editor = control();
  const outputs = Object.fromEntries(["actual", "monthly", "error", "title", "position", "calculation", "payment", "refund"].map((name) => [name, control()]));
  editor.querySelectorAll = (selector) => selector.includes("data-detail-bulk-field") ? editorFields : [];
  editor.querySelector = (selector) => editorFields.find((field) =>
    selector.includes('data-detail-bulk-field="' + field.dataset.detailBulkField + '"'))
    || outputs[selector.match(/data-detail-bulk-(actual|monthly|error|title|position|calculation|payment|refund)/)?.[1]] || null;
  const els = {
    detailBulkPaste: control(sourceText), detailBulkEditor: editor, detailBulkPreview: control(),
    detailBulkFeedback: control(), detailBulkReviewStatus: control(), detailBulkAllowDuplicates: control(), saveDetailBulkButton: control(),
    detailBulkSource: control(), detailBulkDefaults: control(), detailBulkBackButton: control(),
    detailBulkSaveSummary: control(), detailBulkSourceSummary: control(), detailBulkDefaultsSummary: control(),
    detailBulkSteps: [], detailBulkListMonth: control(), detailBulkListSector: control(), detailBulkListSubcategory: control()
  };
  const c = vm.createContext({
    console: { warn() {}, error() {} }, structuredClone,
    alert(message) { alerts.push(message); }, confirm: () => true,
    requestAnimationFrame: (callback) => callback(),
    window: { setTimeout() {}, BudgetNative: {
      read: async (key) => stored.has(key) ? copy(stored.get(key)) : undefined,
      writeMany: async (entries) => {
        batches.push(copy(entries));
        if (failWrite) throw new Error("synthetic storage failure");
        for (const { key, value } of entries) stored.set(key, copy(value));
      }
    } },
    appSettings: {}, transactions: [], classified: [], reimbursements: {}, importMeta: {},
    currentFileName: "기존 기록", detailBulkRows: [], detailBulkParsedText: sourceText,
    selectedDetailBulkRowId: "", selectedDetailBulkSubtab: "input", els,
    normalizeFoodOccasion: (value) => value || "", cssEscape: String,
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || ""),
    expenseRows: (rows) => rows.filter((row) => row.flow !== "income"),
    NumericInput: {
      validate(root) { validated.push(root); return numericValid; }, refresh() {}, enhance() {},
      read(input) { return Number(String(input?.value || "").replaceAll(",", "")); }
    }
  });
  for (const file of [
    "src/data/constants.js", "src/data/categories.js", "src/utils/date.js", "src/utils/normalize.js",
    "src/utils/format.js", "src/utils/dom.js", "src/utils/storage.js", "src/components/chips.js",
    "src/features/details/details-view.js", "src/features/transactions/transactions-view.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), c, { filename: file });
  c.createAutoSnapshot = async () => { snapshots++; };
  c.renderSaveStatus = () => {};
  c.reclassify = () => { reclassifications++; c.classified = copy(c.transactions); };
  const renderPreview = c.renderDetailBulkPreview;
  c.renderDetailBulkPreview = (options) => { rendered.push(options); };
  c.transactions = [c.normalizeStoredTransaction({
    recordKey: "existing-income", transactionId: "stable-income", sourceType: "transfer", flow: "income",
    approvalDate: "2026-10-01", merchant: "합성 수입", amount: 5000
  })];
  c.classified = copy(c.transactions);
  const keys = vm.runInContext("({...STORAGE_KEYS})", c);
  stored.set(keys.records, copy(c.transactions));
  stored.set(keys.reimbursements, {});
  stored.set(keys.importMeta, {});
  function row(id, overrides = {}) {
    return c.validateDetailBulkRow({ id, date: "2026-10-10", description: "합성 " + id, amount: 12000, ...defaults, ...overrides });
  }
  function edit(values, rowId = c.selectedDetailBulkRowId) {
    const index = c.detailBulkRows.findIndex((item) => item.id === rowId);
    editorFields = Object.entries(values).map(([name, value]) => {
      const input = control(value);
      input.dataset = { detailBulkField: name, detailBulkRow: rowId, detailBulkIndex: String(index) };
      if (typeof value === "boolean") { input.type = "checkbox"; input.checked = value; }
      return input;
    });
    return Object.fromEntries(editorFields.map((field) => [field.dataset.detailBulkField, field]));
  }
  return { c, row, edit, keys, stored, batches, alerts, validated, rendered, outputs, renderPreview,
    fail(value = true) { failWrite = value; }, invalid(value = true) { numericValid = !value; },
    snapshots: () => snapshots, reclassifications: () => reclassifications };
}

test("잘못 붙여넣은 날짜와 금액을 고치면 이전 오류가 남지 않는다", () => {
  const { c } = setup();
  for (const text of ["날짜 없음 합성 식사 12000", "2026-10-10 합성 식사 금액 없음"]) {
    const [invalid] = c.parseDetailBulkText(text, defaults);
    assert.equal(invalid.valid, false);
    const fixed = c.validateDetailBulkRow({ ...invalid, date: "2026-10-10", description: "합성 식사", amount: 12000 });
    assert.equal(fixed.valid, true);
    assert.equal(fixed.error, "");
    assert.equal(fixed.actualAmount, 12000);
  }
});

test("행 이동 전 편집기의 정산금과 할부 수정값을 선택한 거래에 반영한다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first"), h.row("second")];
  c.selectedDetailBulkRowId = "first";
  h.edit({ amount: "30,000", reimbursement: "6,000", installmentEnabled: true, installmentMonths: "3", installmentStartMonth: "2026-11" });
  c.selectDetailBulkRow("second");
  assert.equal(c.selectedDetailBulkRowId, "second");
  const first = c.detailBulkRows.find((row) => row.id === "first");
  assert.equal(first.amount, 30000);
  assert.equal(first.reimbursement, 6000);
  assert.equal(first.actualAmount, 24000);
  assert.equal(first.installmentMonthlyAmount, 10000);
  assert.equal(first.installmentStartMonth, "2026-11");
  assert.equal(c.detailBulkRows[1].amount, 12000);
  assert.ok(h.validated.includes(c.els.detailBulkEditor));
});

test("잘못 입력한 숫자를 고치기 전에는 다른 행으로 이동하지 않는다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first"), h.row("second")];
  c.selectedDetailBulkRowId = "first";
  const fields = h.edit({ amount: "잘못된 숫자" });
  h.invalid();
  c.selectDetailBulkRow("second");
  assert.equal(c.selectedDetailBulkRowId, "first");
  assert.equal(fields.amount.value, "잘못된 숫자");
  assert.equal(c.detailBulkRows[0].amount, 12000);
});

test("오류가 있는 선택 행도 삭제할 수 있고 다음·이전 행을 안정된 ID로 선택한다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first"), h.row("middle"), h.row("last")];
  c.selectedDetailBulkRowId = "middle";
  h.edit({ amount: "잘못된 숫자" });
  h.invalid();
  c.deleteDetailBulkRow("middle");
  assert.deepEqual(copy(c.detailBulkRows.map((row) => row.id)), ["first", "last"]);
  assert.equal(c.selectedDetailBulkRowId, "last");
  c.deleteDetailBulkRow("last");
  assert.equal(c.selectedDetailBulkRowId, "first");
  c.deleteDetailBulkRow("first");
  assert.equal(c.selectedDetailBulkRowId, "");
  assert.equal(c.detailBulkRows.length, 0);
  assert.equal(h.validated.length, 0);
});

test("오래된 검토 결과는 붙여넣기 원문을 바꾼 후 그대로 저장할 수 없다", async () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first")];
  c.selectedDetailBulkRowId = "first";
  c.els.detailBulkPaste.value = "2026-10-11 합성 새 거래 9000";
  const before = copy(c.transactions);
  await c.handleDetailBulkSave();
  assert.deepEqual(copy(c.transactions), before);
  assert.equal(h.batches.length, 0);
  assert.equal(h.snapshots(), 0);
  assert.equal(c.detailBulkRows.length, 1);
  assert.equal(c.selectedDetailBulkSubtab, "input");
  assert.match(c.els.detailBulkFeedback.textContent, /다시|변경/);
});

test("선택 편집값 저장 실패는 초안을 보존하고 재시도 성공만 원자적으로 반영한다", async () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first")];
  c.selectedDetailBulkRowId = "first";
  const fields = h.edit({ date: "2026-10-09", description: "합성 수정 식사", amount: "30,000", reimbursement: "6,000",
    installmentEnabled: true, installmentMonths: "3", installmentStartMonth: "2026-11" });
  const before = copy(c.transactions), disk = copy([...h.stored]);
  h.fail();
  await c.handleDetailBulkSave();
  assert.deepEqual(copy(c.transactions), before);
  assert.deepEqual(copy([...h.stored]), disk);
  assert.equal(c.detailBulkRows[0].amount, 30000);
  assert.equal(c.detailBulkRows[0].reimbursement, 6000);
  assert.equal(c.selectedDetailBulkRowId, "first");
  assert.equal(c.detailBulkParsedText, sourceText);
  assert.equal(c.els.detailBulkPaste.value, sourceText);
  assert.equal(fields.amount.value, "30,000");
  assert.equal(c.selectedDetailBulkSubtab, "input");
  assert.equal(h.reclassifications(), 0);
  h.fail(false);
  await c.handleDetailBulkSave();
  const added = c.transactions.find((row) => row.merchant === "합성 수정 식사");
  assert.ok(added);
  assert.equal(added.approvalDate, "2026-10-09");
  assert.equal(added.amount, 30000);
  assert.equal(added.installmentMonths, 3);
  assert.equal(added.installmentStartMonth, "2026-11");
  assert.equal(added.installmentMonthlyAmount, 10000);
  assert.equal(c.reimbursements[added.recordKey], 6000);
  assert.equal(c.transactions.find((row) => row.transactionId === "stable-income").amount, 5000);
  assert.deepEqual(new Set(h.batches[1].map(({ key }) => key)), new Set([
    h.keys.records, h.keys.reimbursements, h.keys.importMeta, h.keys.settings,
    h.keys.records + ":last-good", h.keys.reimbursements + ":last-good", h.keys.importMeta + ":last-good"
  ]));
  assert.deepEqual(h.stored.get(h.keys.records), copy(c.transactions));
  assert.equal(c.detailBulkRows.length, 0);
  assert.equal(c.selectedDetailBulkRowId, "");
  assert.equal(c.detailBulkParsedText, "");
  assert.equal(c.els.detailBulkPaste.value, "");
  assert.equal(c.selectedDetailBulkSubtab, "records");
  assert.equal(h.reclassifications(), 1);
});

for (const allowDuplicates of [false, true]) {
  test("일괄 저장은 오류 행을 제외하고 중복 포함 선택(" + allowDuplicates + ")을 지킨다", async () => {
    const h = setup(), { c } = h;
    c.detailBulkRows = [h.row("first", { description: "합성 중복 거래" }),
      h.row("duplicate", { description: "합성 중복 거래" }), h.row("invalid", { amount: 0 })];
    c.els.detailBulkAllowDuplicates.checked = allowDuplicates;
    await c.handleDetailBulkSave();
    const added = c.transactions.filter((row) => row.flow === "expense");
    assert.equal(added.length, allowDuplicates ? 2 : 1);
    assert.ok(added.every((row) => row.amount === 12000));
    assert.equal(c.importMeta.lastSkippedCount, allowDuplicates ? 0 : 1);
    assert.equal(h.batches.length, 1);
  });
}


test("편집 중 합계와 할부 상태를 갱신해도 입력 컨트롤을 새로 만들지 않는다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first")];
  c.selectedDetailBulkRowId = "first";
  c.els.detailBulkEditor.innerHTML = "existing-editor";
  const fields = h.edit({ date: "2026-10-18", description: "저녁 식사", amount: "30,000", reimbursement: "6,000", installmentEnabled: true,
    installmentMonths: "3", installmentStartMonth: "2026-11" });
  c.handleDetailBulkEditorChange({ target: fields.amount });
  assert.equal(h.outputs.title.textContent, "저녁 식사 수정");
  assert.equal(h.outputs.position.textContent, "10월 18일 · 1건 중 1번째");
  assert.equal(h.outputs.payment.textContent, "30,000원");
  assert.equal(h.outputs.refund.textContent, "6,000원");
  assert.equal(h.outputs.calculation.hidden, false);
  assert.equal(c.detailBulkRows[0].actualAmount, 24000);
  assert.equal(h.outputs.actual.textContent, "24,000원");
  assert.equal(h.outputs.monthly.textContent, "10,000원");
  assert.equal(h.outputs.error.hidden, true);
  assert.equal(fields.installmentMonths.disabled, false);
  assert.equal(c.els.detailBulkEditor.innerHTML, "existing-editor");
  assert.equal(c.els.detailBulkEditor.querySelector('[data-detail-bulk-field="amount"]'), fields.amount);
  assert.deepEqual(copy(h.rendered.at(-1)), { renderEditor: false });
  fields.installmentEnabled.checked = false;
  c.handleDetailBulkEditorChange({ target: fields.installmentEnabled });
  assert.equal(h.outputs.monthly.textContent, "-");
  assert.equal(fields.installmentMonths.disabled, true);
  assert.equal(fields.installmentStartMonth.disabled, true);
});

test("섹터 변경 시 이전 세부항목을 남기지 않고 새 섹터의 항목으로 교체한다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first")];
  c.selectedDetailBulkRowId = "first";
  const fields = h.edit({ sector: "교통비", subcategory: "외식-혼자", installmentEnabled: false,
    installmentMonths: "2", installmentStartMonth: "2026-10" });
  c.handleDetailBulkEditorChange({ target: fields.sector });
  assert.equal(c.detailBulkRows[0].sector, "교통비");
  assert.equal(c.detailBulkRows[0].subcategory, "대중교통");
  assert.match(fields.subcategory.innerHTML, /value="대중교통" selected/);
  assert.doesNotMatch(fields.subcategory.innerHTML, /외식-혼자/);
});

test("저장 요약은 오류·중복 제외 후 정산금을 뺀 내 소비 합계를 안내한다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first", { description: "합성 중복", amount: 30000, reimbursement: 6000 }),
    h.row("duplicate", { description: "합성 중복", amount: 30000, reimbursement: 6000 }), h.row("invalid", { amount: 0 })];
  c.markDetailBulkDuplicateRows();
  c.updateDetailBulkSaveButton();
  assert.equal(c.els.saveDetailBulkButton.textContent, "1건 저장");
  assert.equal(c.els.detailBulkSaveSummary.textContent, "1건 · 내 소비 합계 24,000원");
  c.els.detailBulkAllowDuplicates.checked = true;
  c.updateDetailBulkSaveButton();
  assert.equal(c.els.detailBulkSaveSummary.textContent, "2건 · 내 소비 합계 48,000원");
  c.els.detailBulkPaste.value += "\n2026-10-11 합성 새 기록 1000";
  c.updateDetailBulkSaveButton();
  assert.equal(c.els.saveDetailBulkButton.disabled, true);
});


test("편집기 변경 직후 다른 거래를 누를 때 클릭 대상인 표 행과 버튼을 보존한다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first"), h.row("second")];
  c.selectedDetailBulkRowId = "first";
  c.els.detailBulkMonth = control("2026-10");
  c.els.detailBulkSourceType = control("card");
  c.els.detailBulkSector = control("식비");
  const rows = c.detailBulkRows.map((row) => {
    const node = control(), button = control();
    node.dataset.detailBulkRow = row.id;
    node.cells = Array.from({ length: 4 }, () => control());
    node.querySelector = () => button;
    return { node, button };
  });
  c.els.detailBulkPreview.querySelectorAll = () => rows.map(({ node }) => node);
  Object.defineProperty(c.els.detailBulkPreview, "innerHTML", {
    set() { assert.fail("변경 이벤트에서 행을 교체하면 이어지는 클릭 대상이 사라진다"); }
  });
  c.detailBulkRows[0].description = "합성 수정 내용";
  c.detailBulkRows[0].amount = 25000;
  h.renderPreview({ renderEditor: false });
  assert.equal(rows[0].button.textContent, "합성 수정 내용");
  assert.equal(rows[0].node.cells[2].textContent, "25,000원");
  assert.equal(c.els.detailBulkPreview.querySelectorAll()[1], rows[1].node);
  assert.equal(rows[1].node.querySelector(), rows[1].button);
});

test("할부 개월 수가 잘못되어도 할부 적용을 해제할 수 있다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first", { installmentEnabled: true, installmentMonths: 3 })];
  c.selectedDetailBulkRowId = "first";
  const fields = h.edit({ installmentEnabled: false, installmentMonths: "1", installmentStartMonth: "2026-10" });
  c.NumericInput.validate = () => fields.installmentMonths.disabled || Number(fields.installmentMonths.value) >= 2;
  c.handleDetailBulkEditorChange({ target: fields.installmentEnabled });
  assert.equal(c.detailBulkRows[0].installmentEnabled, false);
  assert.equal(c.detailBulkRows[0].valid, true);
  assert.equal(fields.installmentMonths.disabled, true);
  assert.equal(h.outputs.monthly.textContent, "-");
});


test("돌려받은 돈이 결제액보다 크면 계산식을 숨기고 수정 후 다시 보여준다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first", { amount: 18000 })];
  c.selectedDetailBulkRowId = "first";
  const fields = h.edit({ amount: "18,000", reimbursement: "20,000", installmentEnabled: false,
    installmentMonths: "2", installmentStartMonth: "2026-10" });
  c.handleDetailBulkEditorChange({ target: fields.reimbursement });
  assert.equal(h.outputs.calculation.hidden, true);
  assert.equal(h.outputs.error.hidden, false);
  assert.equal(c.detailBulkRows[0].valid, false);
  fields.reimbursement.value = "6,000";
  c.handleDetailBulkEditorChange({ target: fields.reimbursement });
  assert.equal(h.outputs.calculation.hidden, false);
  assert.equal(h.outputs.refund.textContent, "6,000원");
  assert.equal(h.outputs.actual.textContent, "12,000원");
  assert.equal(h.outputs.error.hidden, true);
});


test("부분 저장은 수정 중인 오류 거래와 원문에 남은 거래만 보존하고 재저장 시 중복 추가하지 않는다", async () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("ready", { description: "저장할 점심" }), h.row("pending", {
    description: "수정 전 저녁", amount: 18000, reimbursement: 20000, original: "2026-10-10 수정 전 저녁 18000"
  })];
  c.selectedDetailBulkRowId = "pending";
  h.edit({ date: "2026-10-18", description: "수정한 저녁", amount: "60,000", reimbursement: "70,000",
    sector: "쇼핑", subcategory: "전자기기/소품", sourceType: "transfer", installmentEnabled: true,
    installmentMonths: "3", installmentStartMonth: "2026-11" });
  await c.handleDetailBulkSave();
  assert.equal(c.transactions.filter((row) => row.flow === "expense").length, 1);
  assert.equal(c.detailBulkRows.length, 1);
  const pending = c.detailBulkRows[0];
  assert.equal(pending.id, "pending");
  assert.equal(c.selectedDetailBulkRowId, "pending");
  assert.equal(pending.description, "수정한 저녁");
  assert.equal(pending.amount, 60000);
  assert.equal(pending.reimbursement, 70000);
  assert.equal(pending.sector, "쇼핑");
  assert.equal(pending.sourceType, "transfer");
  assert.equal(pending.installmentMonths, 3);
  assert.equal(pending.installmentStartMonth, "2026-11");
  assert.equal(c.selectedDetailBulkSubtab, "input");
  assert.equal(c.els.detailBulkPaste.value, "2026-10-18\t수정한 저녁\t60,000");
  assert.equal(c.detailBulkParsedText, c.els.detailBulkPaste.value);
  assert.doesNotMatch(c.detailBulkParsedText, /저장할 점심|수정 전|18,?000/);
  assert.equal(c.isDetailBulkSourceChanged(), false);
  assert.match(c.els.detailBulkFeedback.textContent, /1건.*저장.*미저장 1건.*남겼/);
  h.edit({ reimbursement: "6,000" });
  await c.handleDetailBulkSave();
  const expenses = c.transactions.filter((row) => row.flow === "expense");
  assert.equal(expenses.length, 2);
  assert.equal(expenses.filter((row) => row.merchant === "저장할 점심").length, 1);
  const saved = expenses.find((row) => row.merchant === "수정한 저녁");
  assert.equal(saved.amount, 60000);
  assert.equal(saved.manualSector, "쇼핑");
  assert.equal(saved.installmentMonths, 3);
  assert.equal(c.reimbursements[saved.recordKey], 6000);
  assert.equal(c.detailBulkRows.length, 0);
  assert.equal(c.els.detailBulkPaste.value, "");
  assert.equal(c.selectedDetailBulkSubtab, "records");
});

test("부분 저장 실패는 정상·오류 초안과 원문을 보존하고 성공한 재시도만 정상 행을 제거한다", async () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("ready"), h.row("pending", { amount: 0, reimbursement: 500 })];
  c.selectedDetailBulkRowId = "pending";
  c.markDetailBulkDuplicateRows();
  const before = copy(c.detailBulkRows), records = copy(c.transactions), text = c.els.detailBulkPaste.value;
  h.fail();
  await c.handleDetailBulkSave();
  assert.deepEqual(copy(c.detailBulkRows), before);
  assert.deepEqual(copy(c.transactions), records);
  assert.equal(c.els.detailBulkPaste.value, text);
  assert.equal(c.detailBulkParsedText, text);
  assert.equal(c.selectedDetailBulkRowId, "pending");
  h.fail(false);
  await c.handleDetailBulkSave();
  assert.deepEqual(copy(c.detailBulkRows.map((row) => row.id)), ["pending"]);
  assert.equal(c.transactions.filter((row) => row.flow === "expense").length, 1);
});

test("중복으로 제외한 초안을 남기고 사용자가 포함을 선택했을 때 그 초안만 저장한다", async () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first", { description: "같은 거래" }), h.row("duplicate", { description: "같은 거래" })];
  await c.handleDetailBulkSave();
  assert.deepEqual(copy(c.detailBulkRows.map((row) => row.id)), ["duplicate"]);
  assert.equal(c.detailBulkRows[0].duplicate, true);
  assert.equal(c.selectedDetailBulkRowId, "duplicate");
  assert.equal(c.transactions.filter((row) => row.flow === "expense").length, 1);
  c.els.detailBulkAllowDuplicates.checked = true;
  await c.handleDetailBulkSave();
  assert.equal(c.transactions.filter((row) => row.flow === "expense").length, 2);
  assert.equal(c.detailBulkRows.length, 0);
});

test("검토 상태는 오류·중복 선택·원문 변경을 반영하고 저장 결과 안내를 덮어쓰지 않는다", () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("first", { description: "같은 거래" }), h.row("duplicate", { description: "같은 거래" }), h.row("error", { reimbursement: 20000 })];
  c.markDetailBulkDuplicateRows();
  c.setDetailBulkFeedback("1건을 저장하고 나머지는 남겼습니다.", "warning");
  c.updateDetailBulkSaveButton();
  assert.equal(c.els.detailBulkReviewStatus.textContent, "저장 가능 1건 · 확인 필요 1건 · 중복 제외 1건");
  c.els.detailBulkAllowDuplicates.checked = true;
  c.updateDetailBulkSaveButton();
  assert.equal(c.els.detailBulkReviewStatus.textContent, "저장 가능 2건 · 확인 필요 1건 · 중복 포함 1건");
  c.detailBulkRows[2] = c.validateDetailBulkRow({ ...c.detailBulkRows[2], reimbursement: 0 });
  c.updateDetailBulkSaveButton();
  assert.match(c.els.detailBulkReviewStatus.textContent, /저장 가능 3건 · 확인 필요 0건/);
  c.els.detailBulkPaste.value += "\n2026-10-10 새 거래 2000";
  c.updateDetailBulkSaveButton();
  assert.match(c.els.detailBulkReviewStatus.textContent, /원문이 바뀌었습니다/);
  assert.equal(c.els.saveDetailBulkButton.disabled, true);
  assert.equal(c.els.detailBulkFeedback.textContent, "1건을 저장하고 나머지는 남겼습니다.");
});

test("저장된 거래의 미리보기는 입력을 교체하지 않고 금액·제목·할부 상태를 갱신한다", () => {
  const h = setup(), { c } = h;
  const fields = Object.fromEntries(Object.entries({ date: "2026-10-18", merchant: "<img src=x> 저녁", amount: "24,000", reimbursement: "6,000", installmentEnabled: "", installmentMonths: "3", installmentStartMonth: "2026-11" }).map(([name, value]) => [name, control(value)]));
  const outputs = Object.fromEntries(["title", "position", "calculation", "payment", "refund", "actual", "monthly", "error"].map((name) => [name, control()]));
  const form = control();
  form.innerHTML = "existing-fields";
  form.querySelector = (selector) => fields[selector.match(/data-detail-bulk-record-field="([^"]+)"/)?.[1]] || outputs[selector.match(/data-detail-bulk-record-([a-z]+)/)?.[1]] || null;
  fields.installmentEnabled.checked = true;
  c.updateDetailBulkRecordEditPreview(form);
  assert.equal(outputs.title.textContent, "<img src=x> 저녁 수정");
  assert.equal(outputs.position.textContent, "2026-10-18 · 저장된 거래");
  assert.equal(outputs.actual.textContent, "18,000원");
  assert.equal(outputs.monthly.textContent, "8,000원");
  assert.equal(outputs.calculation.hidden, false);
  assert.equal(form.innerHTML, "existing-fields");
  fields.reimbursement.value = "30,000";
  c.updateDetailBulkRecordEditPreview(form);
  assert.equal(outputs.calculation.hidden, true);
  assert.equal(outputs.error.hidden, false);
  fields.reimbursement.value = "6,000";
  fields.amount.value = "24000.5";
  c.updateDetailBulkRecordEditPreview(form);
  assert.equal(outputs.calculation.hidden, true);
  fields.amount.value = "24,000";
  fields.installmentEnabled.checked = false;
  c.updateDetailBulkRecordEditPreview(form);
  assert.equal(outputs.calculation.hidden, false);
  assert.equal(fields.installmentMonths.disabled, true);
  assert.equal(fields.installmentStartMonth.disabled, true);
  assert.equal(outputs.monthly.textContent, "-");
});


test("병합에서 거래 ID 중복으로 제외된 초안은 정산금을 저장하지 않고 목록에 남긴다", async () => {
  const h = setup(), { c } = h;
  c.detailBulkRows = [h.row("ready"), h.row("skipped", { reimbursement: 3000 })];
  const build = c.buildDetailBulkTransaction;
  let skippedKey = "";
  c.buildDetailBulkTransaction = (row, now) => {
    const transaction = build(row, now);
    if (row.id === "skipped") {
      transaction.transactionId = "stable-income";
      skippedKey = transaction.recordKey;
    }
    return transaction;
  };
  await c.handleDetailBulkSave();
  assert.equal(c.transactions.filter((row) => row.flow === "expense").length, 1);
  assert.deepEqual(copy(c.detailBulkRows.map((row) => row.id)), ["skipped"]);
  assert.equal(c.detailBulkRows[0].reimbursement, 3000);
  assert.equal(c.reimbursements[skippedKey], undefined);
  assert.equal(h.stored.get(h.keys.reimbursements)[skippedKey], undefined);
  assert.equal(c.importMeta.lastAddedCount, 1);
  assert.equal(c.importMeta.lastSkippedCount, 1);
});
