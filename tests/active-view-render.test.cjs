const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const RENDERERS = {
  board: "renderBoard", monthlyAnalysis: "renderMonthlyAnalysis", spendingStructure: "renderSpendingStructureAnalysis",
  goals: "renderGoals", monthly: "renderMonthlyFlow", summary: "renderSummary", details: "renderDetailView",
  detailBulk: "renderDetailBulkView", calendar: "renderCalendar", income: "renderIncomeEntries", recurring: "renderRecurring",
  products: "renderProducts", ipo: "renderIpoView", unknown: "renderUnknown", rules: "renderRules", transactions: "renderTransactions"
};
const field = (value = "") => ({ value, textContent: "", innerHTML: "", disabled: false, querySelectorAll: () => [] });
const copy = (value) => JSON.parse(JSON.stringify(value));
function load(context, file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
}

function setup() {
  const calls = [];
  const rendered = new Map();
  const views = Object.keys(RENDERERS).map((name) => {
    const classes = new Set(name === "board" ? ["active"] : []);
    return { id: `${name}View`, classList: { contains: (value) => classes.has(value),
      add: (value) => classes.add(value), remove: (value) => classes.delete(value) } };
  });
  const c = vm.createContext({
    document: {
      querySelector: (selector) => selector === ".view.active"
        ? views.find((view) => view.classList.contains("active")) : views.find((view) => `#${view.id}` === selector),
      querySelectorAll: (selector) => selector === ".view" ? views : []
    },
    els: {
      fileName: field(), totalAmount: field(), transactionCount: field(), unknownCount: field(), exportButton: field(),
      manualSourceType: field("card"), manualFlow: field("expense"), manualDate: field("2026-10-11"),
      manualTime: field("12:00"), manualMerchant: field("합성 상점"), manualAmount: field("3000"),
      manualSector: field("식비"), manualSubcategory: field("식사"), incomeBulkFeedback: field(),
      incomeBulkPreview: field(), saveIncomeBulkButton: field(), incomeBulkPaste: field()
    },
    transactions: [], classified: [], rules: [], incomeBulkRows: [], importMeta: {}, currentFileName: "",
    selectedAppMonth: "2026-10", workbookExportInProgress: false, calendarDetailReturnState: null,
    RECORD_STORAGE_KEY: "records", IMPORT_META_STORAGE_KEY: "importMeta", SMART_AUTO_CONFIDENCE: 1, SMART_DISPLAY_CONFIDENCE: 1,
    NumericInput: { refresh() {}, validate: () => true },
    closeAdminMenu() {}, updateBoardMapTopButton() {}, renderSaveStatus() {},
    reportingExpenseRows: (rows) => rows.filter((row) => row.flow !== "income"),
    sumConsumption: (rows) => rows.reduce((total, row) => total + row.amount, 0), formatWon: (value) => `${value}원`,
    normalizeCategoryAssignment: (sector, subcategory) => ({ sector, subcategory }), normalizeKeyText: String,
    normalizeInputDate: String, toNumber: Number, isCanceled: () => false,
    buildSmartSuggestionModel: () => ({}), suggestCategory: () => null,
    saveRules: async () => true, createAutoSnapshot: async () => ({}), safeSaveMany: async () => true,
    mergeTransactions: (current, incoming) => ({ records: [...current, ...incoming], added: incoming.length, skipped: 0 }),
    alert() {}, renderIncomeBulkPreview() {}
  });
  for (const file of ["src/features/app/render-all.js", "src/features/app/appearance.js",
    "src/features/classification/classifier.js", "src/features/transactions/transactions-view.js"]) load(c, file);
  for (const [view, renderer] of Object.entries(RENDERERS)) {
    c[renderer] = () => {
      calls.push(view);
      rendered.set(view, { month: c.selectedAppMonth, rows: copy(c.classified) });
    };
  }
  c.buildManualTransaction = ({ date, merchant, amount, sector, subcategory, flow }) => ({
    recordKey: `record-${c.transactions.length}`, approvalDate: date, month: date.slice(0, 7), merchant,
    amount: Number(amount), manualSector: sector, manualSubcategory: subcategory, flow
  });
  return { c, calls, rendered, views };
}

test("초기 화면과 저장 완료는 현재 화면만 계산하고, 숨긴 화면은 진입 시 최신 거래를 표시한다", async () => {
  const { c, calls, rendered } = setup();
  c.reclassify();
  assert.deepEqual(calls, ["board"]);
  assert.equal(c.els.exportButton.disabled, true);
  assert.equal(c.els.transactionCount.textContent, "0건");

  c.switchView("calendar");
  calls.length = 0;
  let release;
  c.safeSaveMany = () => new Promise((resolve) => { release = resolve; });
  const saving = c.handleManualEntry({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
  assert.equal(c.transactions.length, 0, "커밋 전에는 원본 거래를 바꾸지 않는다");
  release(true);
  await saving;
  assert.deepEqual(calls, ["calendar"]);
  assert.equal(c.els.totalAmount.textContent, "3000원");
  assert.equal(c.els.transactionCount.textContent, "1건");
  assert.equal(c.els.exportButton.disabled, false);
  assert.equal(rendered.get("calendar").rows[0].merchant, "합성 상점");
  assert.equal(rendered.get("board").rows.length, 0, "숨긴 화면은 저장 중 재작성하지 않는다");

  c.selectedAppMonth = "2026-09";
  for (const view of Object.keys(RENDERERS)) {
    calls.length = 0;
    c.switchView(view);
    assert.deepEqual(calls, [view]);
    assert.equal(rendered.get(view).rows.length, 1);
    assert.equal(rendered.get(view).month, "2026-09");
  }
});

test("저장 실패 후에는 화면과 입력을 유지하고, 재시도 성공 후 다른 화면에서도 저장 내용을 확인한다", async () => {
  const { c, calls, rendered } = setup();
  c.switchView("details");
  calls.length = 0;
  c.safeSaveMany = async () => false;
  await c.handleManualEntry({ preventDefault() {} });
  assert.deepEqual(calls, []);
  assert.equal(c.els.manualMerchant.value, "합성 상점");
  assert.equal(c.transactions.length, 0);
  c.safeSaveMany = async () => true;
  await c.handleManualEntry({ preventDefault() {} });
  assert.deepEqual(calls, ["details"]);
  c.switchView("board");
  assert.equal(rendered.get("board").rows[0].amount, 3000);
});

test("수입 화면을 바로 열어도 미리보기가 초기화되고 일괄 저장 후 입력과 버튼 상태가 갱신된다", async () => {
  const { c, calls, rendered } = setup();
  load(c, "src/features/income/income-bulk.js");
  c.switchView("income");
  assert.equal(c.els.saveIncomeBulkButton.disabled, true);
  assert.match(c.els.incomeBulkPreview.innerHTML, /붙여넣기 내용을 파싱/);
  c.incomeBulkRows = [{ date: "2026-10-11", description: "합성 급여", amount: 2500000 }];
  c.els.incomeBulkPaste.value = "2026-10-11 합성 급여 2500000";
  calls.length = 0;
  await c.handleIncomeBulkSave();
  assert.deepEqual(calls, ["income"]);
  assert.equal(rendered.get("income").rows[0].flow, "income");
  assert.equal(c.els.saveIncomeBulkButton.disabled, true);
  assert.equal(c.els.incomeBulkPaste.value, "");
  assert.match(c.els.incomeBulkFeedback.textContent, /수입 1건을 저장/);
  assert.match(c.els.incomeBulkPreview.innerHTML, /붙여넣기 내용을 파싱/);
});

test("년도 지출정리 진입은 숨긴 수입 화면의 입력 미리보기를 다시 만들지 않는다", () => {
  const { c, calls } = setup();
  load(c, "src/features/monthly/monthly-flow.js");
  for (const key of ["monthlyFlowChart", "monthlyFlowTable", "monthlyKpis", "monthlyPeriodStats", "monthlyRangeStatus"]) c.els[key] = field();
  c.buildMonthlyFlowRows = () => [];
  c.updateMonthlyYearOptions = () => {};
  c.filterMonthlyRows = () => [];
  c.els.incomeBulkPreview.innerHTML = "수정 중인 수입 미리보기";
  c.renderIncomeBulkPreview = () => { throw new Error("숨긴 수입 화면을 다시 작성함"); };
  c.switchView("monthly");
  assert.deepEqual(calls, []);
  assert.equal(c.els.incomeBulkPreview.innerHTML, "수정 중인 수입 미리보기");
  assert.match(c.els.monthlyFlowTable.innerHTML, /년도 지출정리가 표시/);
});

test("내보내기 진행 상태는 현재 화면 갱신과 독립적으로 유지된다", () => {
  const { c, calls, views } = setup();
  c.classified = [{ amount: 1000 }];
  c.workbookExportInProgress = true;
  views.forEach((view) => view.classList.remove("active"));
  c.renderAll();
  assert.equal(c.els.exportButton.disabled, true);
  assert.deepEqual(calls, []);
  assert.equal(c.els.totalAmount.textContent, "1000원");
});

test("아직 열지 않아 월 옵션이 비어 있는 화면도 공유 월을 보존하고 진입 시 선택 상자를 채운다", () => {
  const controls = new Map();
  const classes = new Map(Object.keys(RENDERERS).map((name) => [name, new Set(name === "board" ? ["active"] : [])]));
  const views = [...classes].map(([name, values]) => ({ id: `${name}View`, classList: {
    contains: (value) => values.has(value), add: (value) => values.add(value), remove: (value) => values.delete(value)
  } }));
  function control(selector) {
    if (controls.has(selector)) return controls.get(selector);
    let options = [], value = "", html = "";
    const item = {
      ...field(), get options() { return options; },
      get value() { return value; }, set value(next) { value = options.some((option) => option.value === next) ? next : ""; },
      get innerHTML() { return html; }, set innerHTML(next) {
        html = next;
        options = [...next.matchAll(/<option value="([^"]*)"/g)].map((match) => ({ value: match[1] }));
        value = options[0]?.value || "";
      }, classList: { toggle() {} }, setAttribute() {}, removeAttribute() {}
    };
    controls.set(selector, item);
    return item;
  }
  const c = vm.createContext({
    structuredClone, defaultRules: [], GoalPlannerCore: { defaultPlan: () => ({}) }, categories: { 식비: ["식사"] },
    document: {
      querySelector: (selector) => selector === ".view.active" ? views.find((view) => view.classList.contains("active"))
        : views.find((view) => `#${view.id}` === selector) || control(selector),
      querySelectorAll: (selector) => selector === ".view" ? views : []
    },
    unique: (items) => [...new Set(items)], escapeHtml: String, expenseRows: (rows) => rows,
    currentMonthKey: () => "2026-10", closeAdminMenu() {}, updateBoardMapTopButton() {},
    shiftMonthKey: (month, offset) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset); return date.toISOString().slice(0, 7); }
  });
  for (const file of ["src/features/app/state.js", "src/features/app/render-all.js", "src/features/app/appearance.js",
    "src/features/details/details-view.js", "src/features/summary/summary-view.js", "src/features/analysis/analysis-core.js"]) load(c, file);
  for (const renderer of Object.values(RENDERERS)) c[renderer] = () => {};
  c.renderDetailBulkView = () => c.fillDetailBulkMonthControl();
  c.renderSummary = () => c.updateSummaryMonthOptions(["2026-08", "2026-09", "2026-10"]);
  c.renderMonthlyAnalysis = () => c.fillAnalysisMonthSelect(control("#monthlyAnalysisMonth"));
  c.renderSpendingStructureAnalysis = () => c.fillAnalysisMonthSelect(control("#spendingStructureMonth"));
  c.renderDetailView = () => c.syncDetailFilterControls([], []);
  c.renderIncomeBulkPreview = () => {};
  vm.runInContext('classified = [{ month: "2026-10", amount: 1 }]; detailFilters.month = "2026-10";', c);
  c.setSharedSelectedMonth("2026-08");
  assert.equal(control("#detailBulkMonth").value, "", "아직 없는 옵션에 선택값을 강제로 쓰지 않는다");
  assert.equal(c.getSharedSelectedMonth(), "2026-08");
  for (const [view, selector] of [["detailBulk", "#detailBulkMonth"], ["monthlyAnalysis", "#monthlyAnalysisMonth"],
    ["spendingStructure", "#spendingStructureMonth"], ["summary", "#summaryMonthSelect"], ["details", "#detailMonth"]]) {
    assert.equal(control(selector).options.length, 0);
    c.switchView(view);
    assert.equal(control(selector).value, "2026-08", `${view}의 첫 진입 선택 월`);
    assert.equal(c.getSharedSelectedMonth(), "2026-08");
  }
  c.setSharedSelectedMonth("2026-09");
  c.switchView("detailBulk");
  assert.equal(control("#detailBulkMonth").value, "2026-09");
});
