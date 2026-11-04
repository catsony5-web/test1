const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function context() {
  const c = vm.createContext({
    console, transactions: [], classified: [], recurringExpenses: [], familyAdjustments: [],
    monthlyIncome: {}, reimbursements: {}, appSettings: { familySupportKeywords: ["합성 보내는이"] },
    rules: [], sortedClassificationRules: () => [], buildSmartSuggestionModel: () => ({}),
    saveRules() {}, renderAll() {}, scheduledTotalForMonth: () => 0, scheduledPersonalTotalForMonth: () => 0,
    isValidMonthKey: (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    window: {}, els: {}
  });
  for (const file of [
    "src/data/categories.js", "src/data/field-aliases.js", "src/utils/date.js", "src/utils/format.js", "src/utils/food-occasion.js",
    "src/utils/normalize.js", "src/components/chips.js", "src/utils/grouping.js", "src/features/family/family-core.js",
    "src/utils/storage.js", "src/features/board/board-view.js", "src/features/monthly/monthly-flow.js",
    "src/features/analysis/analysis-core.js", "src/features/transactions/transactions-view.js", "src/features/import/excel-import.js", "src/features/classification/classifier.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), c, { filename: file });
  c.saveRules = () => {};
  return c;
}

function record(id, amount, extra = {}) {
  return { transactionId: id, recordKey: id, amount, approvalDate: "2038-03-05", month: "2038-03",
    sourceType: "transfer", flow: "expense", merchant: "합성 항목", status: "직접입력", ...extra };
}

test("가족 입금과 가족 보험료는 소득·소비·저축률 및 자유 잔액에서 분리된다", () => {
  const c = context();
  c.transactions = [
    record("pay", 8000, { flow: "income" }),
    record("family-a", 250, { flow: "income", incomeKind: "familySupport" }),
    record("family-b", 350, { flow: "income", incomeKind: "familySupport" }),
    record("insurance", 400, { familyBurdenAmount: 400, sector: "보험", subcategory: "보험료" }),
    record("own-food", 1000, { sector: "식비", subcategory: "외식-혼자" }),
    record("savings", 2000, { sector: "저축", subcategory: "적금/예금" })
  ];
  c.classified = c.transactions;
  const row = c.buildMonthlyFlowRow("2038-03", c.reportingExpenseRows(c.classified));
  assert.equal(row.income, 8000);
  assert.equal(row.consumptionSpend, 1000);
  assert.equal(row.actualSavings, 2000);
  assert.equal(row.freeBalance, 5000);
  assert.equal(row.familyReceived, 600);
  assert.equal(row.familyCashHeld, 200);
  assert.equal(row.actualSavings / row.income, 0.25);
  assert.equal(c.buildAnalysisMonthSnapshot("2038-03").freeBalance, 5000);
});

test("입금 자동분류는 사용자가 설정한 송금인과 이체입금에만 적용하고 수동 결정을 유지한다", () => {
  const c = context();
  const incoming = record("imported", 600, { flow: "income", merchant: "합성 보내는이 송금" });
  const result = c.classifyFamilySupportImport(incoming);
  assert.equal(result.incomeKind, "familySupport");
  assert.equal(result.familyTargetMonth, "2038-03");
  assert.equal(result.transactionId, incoming.transactionId);
  assert.equal(c.classifyFamilySupportImport({ ...incoming, flow: "expense" }).incomeKind, undefined);
  assert.equal(c.classifyFamilySupportImport({ ...incoming, sourceType: "card" }).incomeKind, undefined);
  assert.equal(c.classifyFamilySupportImport({ ...incoming, incomeKind: "normal", incomeKindSource: "manual" }).incomeKind, "normal");
  c.appSettings.familySupportKeywords = [];
  assert.equal(c.classifyFamilySupportImport(incoming).incomeKind, undefined);
});

test("은행의 입금액·출금액 열을 일반 금액 열과 구분한다", () => {
  const c = context();
  for (const labels of [["입금액", "출금액"], ["입금금액(원)", "출금금액(원)"]]) {
    const map = c.headerMap(["거래일자", "거래내용", ...labels]);
    assert.equal(map.date, 0);
    assert.equal(map.merchant, 1);
    assert.equal(map.deposit, 2);
    assert.equal(map.withdrawal, 3);
    assert.equal(map.amount, undefined);
  }
  assert.equal(c.headerMap(["이용일자", "가맹점명", "승인금액"]).amount, 2);
});

test("가족 입금으로 전환한 기존 수입 분류는 원래 거래 식별자와 메모를 보존한다", () => {
  const c = context();
  c.transactions = [record("converted", 300, { flow: "income", incomeKind: "familySupport", familyTargetMonth: "2038-02",
    manualSector: "수입", manualSubcategory: "기타수입", memo: "가상 메모" })];
  c.reclassify();
  assert.equal(c.classified.length, 1);
  assert.equal(c.classified[0].sector, "가족 지원");
  assert.equal(c.classified[0].transactionId, "converted");
  assert.equal(c.classified[0].memo, "가상 메모");
  assert.equal(c.incomeReportingAmount(c.classified[0]), 0);
  const months = c.buildMonthlyFlowRows().map((row) => row.month);
  assert.deepEqual(Array.from(months), ["2038-02", "2038-03"]);
  assert.equal(c.buildMonthlyFlowRow("2038-02", []).familyReceived, 300);
});

test("가족 입금과 조정만 있는 최신 월도 연도·기간별 내역에 포함한다", () => {
  const c = context();
  c.transactions = [
    record("salary", 8000, { flow: "income" }),
    record("family-only", 600, { flow: "income", incomeKind: "familySupport", month: "2038-04", approvalDate: "2038-04-02" })
  ];
  c.classified = c.transactions;
  c.els.monthlyYearFilter = { value: "year:2038" };
  const rows = c.buildMonthlyFlowRows();
  assert.equal(c.latestMeaningfulMonthlyRow(rows).month, "2038-04");
  assert.equal(c.monthlyMonthsForFilter(rows).at(-1), "2038-04");
  c.els.monthlyYearFilter.value = "range";
  c.els.monthlyStartYear = { value: "2038" };
  c.els.monthlyEndYear = { value: "2038" };
  assert.equal(c.monthlyMonthsForFilter(rows).at(-1), "2038-04");
  assert.equal(c.monthlyRowHasActivity(c.buildMonthlyFlowRow("2038-05", [])), false, "보관 잔액의 이월만으로 활동 월을 늘리지 않는다");

  c.transactions[1].familyTargetMonth = "2038-03";
  assert.equal(c.latestMeaningfulMonthlyRow(c.buildMonthlyFlowRows()).month, "2038-04", "정산 대상월이 이전이어도 실제 입금월을 표시한다");
  c.familyAdjustments = [{ id: "synthetic-adjustment", date: "2038-05-03", amount: 25, purpose: "other", memo: "합성 조정" }];
  assert.equal(c.monthlyMonthsForFilter(c.buildMonthlyFlowRows()).at(-1), "2038-05");
});
