const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContext(rows = [], income = { "2026-07": 4000000, "2026-08": 4060000 }) {
  const cardBilling = { startDay: 1, endDay: 31, paymentDay: 25, weekendRule: "none" };
  const context = vm.createContext({
    console, classified: rows, transactions: rows, reimbursements: {}, monthlyIncome: income,
    appSettings: { cardBilling }, defaultAppSettings: () => ({ cardBilling }),
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value)),
    monthlyAnalysisComparisonMode: "previous",
    monthlyAnalysisEvidenceSelection: { key: "", sector: "" },
    els: {}, window: { scrollY: 0 }
  });
  for (const file of [
    "src/data/categories.js", "src/utils/format.js", "src/utils/date.js", "src/utils/dom.js",
    "src/utils/food-occasion.js", "src/utils/normalize.js", "src/utils/grouping.js", "src/utils/storage.js",
    "src/components/chips.js", "src/features/board/board-view.js", "src/features/monthly/monthly-flow.js",
    "src/features/analysis/analysis-core.js", "src/features/analysis/monthly-analysis-core.js",
    "src/features/analysis/monthly-analysis-view.js", "src/features/calendar/calendar-view.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  return context;
}

function expense(key, amount, date = "2026-08-17", extra = {}) {
  return {
    recordKey: key, transactionId: key, merchant: `검증 ${key}`, amount,
    month: date.slice(0, 7), approvalDate: date, approvalTime: "12:00",
    sourceType: "card", flow: "expense", sector: "식비", subcategory: "외식-혼자", status: "분류 완료",
    ...extra
  };
}

function model(context, month = "2026-08", mode = "previous", today = "2026-09-02") {
  return context.buildMonthlyAnalysisModel(month, mode, today);
}

function cashflowRows() {
  return [
    expense("food-jul", 200000, "2026-07-17"),
    expense("food-aug", 280000),
    expense("shop-jul", 100000, "2026-07-18", { sector: "쇼핑", subcategory: "의류" }),
    expense("shop-aug", 220000, "2026-08-18", { sector: "쇼핑", subcategory: "의류" }),
    expense("transport-jul", 20000, "2026-07-19", { sector: "교통비", subcategory: "대중교통" }),
    ...["2026-07", "2026-08"].flatMap((month) => [
      expense(`rent-${month}`, 400000, `${month}-05`, { sector: "고정 주거비", subcategory: "월세" }),
      expense(`savings-${month}`, month === "2026-07" ? 600000 : 700000, `${month}-25`, { sector: "저축", subcategory: "적금/예금" }),
      expense(`loan-${month}`, 550000, `${month}-25`, { sector: "고정 주거비", subcategory: "대출이자", recurringType: "loan", loanPrincipalAmount: 500000 })
    ])
  ];
}

test("월간 분석만 전월을 기본으로 삼고 전년 동월 선택과 연도 경계를 보존한다", () => {
  const context = loadContext();
  assert.equal(context.buildMonthlyAnalysisModel("2026-08").comparisonMonth, "2026-07");
  assert.equal(model(context, "2026-01").comparisonMonth, "2025-12");
  assert.equal(model(context, "2026-08", "year").comparisonMonth, "2025-08");
  assert.equal(context.analysisComparisonDefinition().mode, "year", "shared comparison defaults are unchanged");
  assert.equal(model(context, "invalid"), null);
  const state = fs.readFileSync(path.join(__dirname, "../src/features/app/state.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.match(state, /let monthlyAnalysisComparisonMode = "previous"/);
  assert.match(html, /data-monthly-analysis-comparison="previous" aria-pressed="true"/);
});

test("수입·소비·저축·원금·정산의 영향 합계가 남은 돈 변화와 정확히 일치한다", () => {
  const rows = cashflowRows();
  const before = JSON.stringify(rows);
  const context = loadContext(rows);
  const result = model(context);
  assert.equal(result.current.consumptionSpend, 950000);
  assert.equal(result.previous.consumptionSpend, 770000);
  assert.equal(result.consumptionDelta, 180000);
  assert.equal(result.current.freeBalance, 1910000);
  assert.equal(result.previous.freeBalance, 2130000);
  assert.equal(result.balanceDelta, -220000);
  assert.equal(result.balanceDrivers.reduce((total, item) => total + item.impact, 0), result.balanceDelta);
  assert.equal(result.balanceDrivers.reduce((total, item) => total + item.currentEffect, 0), result.current.freeBalance);
  assert.equal(result.canCompareBalance, true);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(context.buildAnalysisMonthSnapshot("2026-08").freeBalance, result.current.freeBalance);
});

test("저축 증가로 남은 돈이 줄어도 소비 증가라고 설명하지 않는다", () => {
  const rows = [
    expense("food-jul", 120000, "2026-07-17"), expense("food-aug", 120000),
    expense("save-jul", 100000, "2026-07-25", { sector: "저축", subcategory: "적금/예금" }),
    expense("save-aug", 300000, "2026-08-25", { sector: "저축", subcategory: "적금/예금" })
  ];
  const context = loadContext(rows, { "2026-07": 2000000, "2026-08": 2000000 });
  const result = model(context);
  assert.equal(result.consumptionDelta, 0);
  assert.equal(result.balanceDelta, -200000);
  assert.equal(result.balanceDrivers.find((item) => item.key === "actualSavings").impact, -200000);
  assert.match(context.renderMonthlyAnalysisSummary(result), /실제 저축 \+200,000원/);
  assert.doesNotMatch(context.renderMonthlyAnalysisSummary(result), /소비지출[^<]*늘었습니다/);
  assert.match(context.renderMonthlyAnalysisCashflow(result), /소비가 늘어난 것은 아닙니다/);
});

test("미분류·보험·상품권까지 섹터 증감 합계에 포함하고 적금과 원금은 제외한다", () => {
  const rows = [
    expense("insurance-old", 80000, "2026-07-03", { sector: "저축", subcategory: "보험" }),
    expense("insurance", 100000, "2026-08-03", { sector: "저축", subcategory: "보험" }),
    expense("gift", 50000, "2026-08-04", { sector: "저축", subcategory: "상품권/저축성" }),
    expense("unknown-old", 20000, "2026-07-03", { sector: "미분류", subcategory: "미분류" }),
    expense("unknown", 10000, "2026-08-03", { sector: "미분류", subcategory: "미분류" }),
    expense("deposit", 700000, "2026-08-25", { sector: "저축", subcategory: "적금/예금" }),
    expense("loan", 550000, "2026-08-25", { sector: "고정 주거비", subcategory: "대출이자", recurringType: "loan", loanPrincipalAmount: 500000 })
  ];
  const context = loadContext(rows);
  const result = model(context);
  assert.equal(result.sectorChanges.find((item) => item.sector === "저축").current, 150000);
  assert.equal(result.sectorChanges.find((item) => item.sector === "미분류").delta, -10000);
  assert.equal(result.sectorChanges.find((item) => item.sector === "고정 주거비").current, 50000);
  assert.equal(result.sectorChanges.reduce((total, item) => total + item.delta, 0), result.consumptionDelta);
  assert.equal(result.current.actualSavings, 700000);
  assert.equal(result.current.debtRepayment, 500000);
  assert.match(context.renderMonthlyAnalysisSectorChanges(result), /저축 분류의 소비/);
});

test("진행 월은 두 달의 같은 날짜까지 소비만 비교하고 월 수입·잔액 증감은 숨긴다", () => {
  const rows = [
    expense("old-1", 5000, "2026-08-01"), expense("old-2", 12000, "2026-08-02"), expense("old-late", 100000, "2026-08-04"),
    expense("now-1", 20000, "2026-09-01"), expense("now-2", 15000, "2026-09-02", { approvalTime: "" }), expense("future", 50000, "2026-09-04")
  ];
  const context = loadContext(rows, { "2026-08": 4000000, "2026-09": 4000000 });
  const result = model(context, "2026-09");
  assert.equal(result.cutoffDay, 2);
  assert.equal(result.currentPeriod.amount, 35000);
  assert.equal(result.previousPeriod.amount, 17000);
  assert.equal(result.consumptionDelta, 18000);
  assert.equal(result.current.consumptionSpend, 85000, "headline monthly records are not silently pruned");
  assert.equal(result.canCompareBalance, false);
  assert.doesNotMatch(context.renderMonthlyAnalysisMetrics(result), /<em>/);
  assert.match(context.renderMonthlyAnalysisCashflow(result), /남은 돈 계산/);
  assert.doesNotMatch(context.renderMonthlyAnalysisCashflow(result), /남은 돈 변화/);
  const evidence = context.renderMonthlyAnalysisEvidence(result.sectorChanges[0], result);
  assert.doesNotMatch(evidence, /검증 future|검증 old-late/);
});

test("짧은 달과 윤년에는 두 달에 공통인 날짜까지만 비교한다", () => {
  const context = loadContext();
  for (const [month, mode, today, expected] of [
    ["2026-03", "previous", "2026-03-31", 28],
    ["2024-03", "previous", "2024-03-31", 29],
    ["2024-02", "year", "2024-02-29", 28],
    ["2026-08", "previous", "2026-09-02", 0]
  ]) assert.equal(model(context, month, mode, today).cutoffDay, expected);
  context.classified = [expense("feb", 10000, "2026-02-28"), expense("mar-28", 20000, "2026-03-28"), expense("mar-29", 30000, "2026-03-29")];
  const result = model(context, "2026-03", "previous", "2026-03-31");
  assert.equal(result.currentPeriod.amount, 20000);
  assert.equal(result.previousPeriod.amount, 10000);
});

test("날짜 미확인과 잘못된 날짜는 일자 비교에서 제외하되 월 합계와 안내에 남긴다", () => {
  const context = loadContext([
    expense("valid-old", 10000, "2026-08-01"), expense("valid", 20000, "2026-09-01"),
    expense("undated", 7000, "2026-09-01", { approvalDate: "" }),
    expense("invalid", 9000, "2026-09-31")
  ], { "2026-08": 0, "2026-09": 0 });
  const result = model(context, "2026-09");
  assert.equal(result.currentPeriod.amount, 20000);
  assert.equal(result.currentPeriod.undatedCount, 2);
  assert.equal(result.currentPeriod.undatedAmount, 16000);
  assert.equal(result.current.consumptionSpend, 36000);
  assert.match(context.renderMonthlyAnalysisSectorChanges(result), /날짜 확인 필요: 2026-09 2건 16,000원/);
  assert.equal(context.monthlyAnalysisDate(expense("leap", 1, "2024-02-29"), "2024-02"), "2024-02-29");
  assert.equal(context.monthlyAnalysisDate(expense("not-leap", 1, "2025-02-29"), "2025-02"), "");
});

test("비교 자료 없음과 빈 선택 월·미래 월을 소비 0원이나 절약으로 단정하지 않는다", () => {
  const context = loadContext([expense("only", 25000)], {});
  const noComparison = model(context);
  assert.equal(noComparison.canCompareConsumption, false);
  assert.match(context.renderMonthlyAnalysisSectorChanges(noComparison), /전월 비교 자료가 없습니다/);
  assert.equal(model(context, "2026-07").hasCurrent, false);
  assert.match(context.renderMonthlyAnalysisSummary(model(context, "2026-07")), /입력된 기록이 없습니다/);
  const future = model(context, "2026-08", "previous", "2026-07-10");
  assert.equal(future.canCompareConsumption, false);
  assert.equal(future.canCompareBalance, false);
  assert.match(context.renderMonthlyAnalysisSummary(future), /아직 오지 않은 달/);
});

test("수입 미입력과 명시적 0원 입력을 구분하며 섹터 비교는 계속 제공한다", () => {
  const rows = [expense("old", 10000, "2026-07-01"), expense("now", 20000)];
  const context = loadContext(rows, {});
  const missing = model(context);
  assert.equal(missing.canCompareConsumption, true);
  assert.equal(missing.canCompareBalance, false);
  assert.match(context.renderMonthlyAnalysisMetrics(missing), /미입력/);
  context.monthlyIncome = { "2026-07": 0, "2026-08": 0 };
  const recordedZero = model(context);
  assert.equal(recordedZero.canCompareBalance, true);
  assert.equal(recordedZero.balanceDelta, -10000);
  assert.doesNotMatch(context.renderMonthlyAnalysisMetrics(recordedZero), /미입력/);
});

test("늦게 받은 가족 대출 분담금은 정산 조정으로 반영하고 수입에 중복 합산하지 않는다", () => {
  const loan = expense("loan", 550000, "2026-07-25", {
    sector: "고정 주거비", subcategory: "대출이자", recurringType: "loan", loanPrincipalAmount: 500000,
    loanSupportPrincipalAmount: 200000, loanSupportInterestAmount: 20000,
    loanSupportReceivedAmount: 220000, loanSupportReceivedDate: "2026-08-02", loanSupportIncomeTransactionId: "family-cash"
  });
  const payment = expense("family-cash", 220000, "2026-08-02", { flow: "income", sourceType: "transfer", sector: "수입", subcategory: "이체입금" });
  const context = loadContext([loan, payment], { "2026-07": 4000000, "2026-08": 4000000 });
  const result = model(context);
  assert.equal(result.current.income, 4000000);
  assert.equal(result.previous.loanSettlementDelta, -220000);
  assert.equal(result.current.loanSettlementDelta, 220000);
  assert.equal(result.balanceDrivers.find((item) => item.key === "loanSettlementDelta").impact, 440000);
  assert.equal(result.balanceDrivers.reduce((total, item) => total + item.impact, 0), result.balanceDelta);
});

test("정산·할부·식비 태그는 근거 거래와 월 배분액에 유지하고 취소 지출은 제외한다", () => {
  const installment = expense("installment", 90000, "2026-07-03", { installmentEnabled: true, installmentMonths: 3, installmentStartMonth: "2026-07", foodOccasion: "treat" });
  const context = loadContext([installment, expense("canceled", 50000, "2026-08-03", { status: "취소/제외", cancel: "취소" })]);
  context.reimbursements.installment = 30000;
  const result = model(context);
  assert.equal(result.currentPeriod.amount, 20000);
  assert.equal(result.currentPeriod.rows.length, 1);
  const html = context.renderMonthlyAnalysisEvidence(result.sectorChanges[0], result);
  assert.match(html, /지출 상황: 내가 한턱/);
  assert.match(html, /할부 2\/3회/);
  assert.doesNotMatch(html, /검증 canceled/);
  assert.equal(installment.amount, 90000);
  assert.equal(context.reimbursements.installment, 30000);
});

test("증감 막대는 월 총액이 아닌 최대 증감액을 축으로 사용하고 정확한 금액을 적는다", () => {
  const context = loadContext([
    expense("rent-old", 2000000, "2026-07-01", { sector: "고정 주거비", subcategory: "월세" }),
    expense("rent", 2000000, "2026-08-01", { sector: "고정 주거비", subcategory: "월세" }),
    expense("old-food", 200000, "2026-07-17"), expense("food", 218421)
  ]);
  const result = model(context);
  const html = context.renderMonthlyAnalysisSectorChanges(result);
  assert.match(html, /\+18,421원/);
  assert.match(html, /width="120" height="10"/);
  assert.doesNotMatch(html, /waterfall|NaN|Infinity/);
  context.classified[3].amount = 200000;
  assert.doesNotMatch(context.renderMonthlyAnalysisSectorChanges(model(context)), /NaN|Infinity/);
});

test("근거 거래는 사용자 문구를 이스케이프하고 다른 거래·카드 예정액을 바꾸지 않는다", () => {
  const rows = [expense("old", 20000, "2026-07-17"), expense("food", 35000, "2026-08-17", { merchant: "<script>alert(1)</script>", subcategory: "<img>", foodOccasion: "family" })];
  const context = loadContext(rows);
  context.reimbursements.food = 15000;
  const billing = context.buildCalendarCardBillingModel("2026-08").expectedAmount;
  const result = model(context);
  const html = context.renderMonthlyAnalysisEvidence(result.sectorChanges[0], result);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img&gt;/);
  assert.doesNotMatch(html, /<script>|<img>/);
  assert.equal(result.currentPeriod.amount, 20000);
  assert.equal(context.buildCalendarCardBillingModel("2026-08").expectedAmount, billing);
  assert.equal(billing, 35000);
});

test("같은 섹터를 다시 누르면 근거 내역을 닫고 다른 섹터 선택은 하나만 펼친다", () => {
  const context = loadContext(cashflowRows());
  const result = model(context);
  const panels = result.sectorChanges.map(() => ({ hidden: true, innerHTML: "" }));
  const buttons = result.sectorChanges.map((item, index) => {
    const attributes = { "aria-expanded": "false" };
    return {
      dataset: { monthlyChangeIndex: String(index) },
      getAttribute: (name) => attributes[name],
      setAttribute: (name, value) => { attributes[name] = value; },
      addEventListener(name, handler) { this[name] = handler; }
    };
  });
  context.els.monthlyAnalysisBody = {
    querySelectorAll: () => buttons,
    querySelector: (selector) => panels[Number(selector.replace("#monthlyAnalysisEvidence", ""))]
  };
  context.attachMonthlyAnalysisEvidenceHandlers(result);
  buttons[0].click();
  assert.equal(panels[0].hidden, false);
  assert.match(panels[0].innerHTML, /근거 거래/);
  buttons[1].click();
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[0].innerHTML, "");
  assert.equal(panels[1].hidden, false);
  buttons[1].click();
  assert.equal(panels[1].hidden, true);
  assert.equal(context.monthlyAnalysisEvidenceSelection.sector, "");
});

test("월이나 비교 기준을 바꾸면 이전 근거 선택을 초기화한다", () => {
  const context = loadContext(cashflowRows());
  context.fillAnalysisMonthSelect = (select) => select.value;
  context.getSharedSelectedMonth = (value) => value;
  context.currentMonthKey = () => "2026-09";
  context.canViewDriveSharedMonth = () => false;
  context.analysisBillingModelForMonth = () => null;
  context.els.monthlyAnalysisMonth = { value: "2026-08" };
  context.els.monthlyAnalysisBody = { innerHTML: "", querySelectorAll: () => [] };
  context.monthlyAnalysisEvidenceSelection = { key: "2026-08|previous|0", sector: "식비" };
  context.renderMonthlyAnalysis();
  assert.equal(context.monthlyAnalysisEvidenceSelection.sector, "식비");
  context.monthlyAnalysisComparisonMode = "year";
  context.renderMonthlyAnalysis();
  assert.equal(context.monthlyAnalysisEvidenceSelection.sector, "");
  context.monthlyAnalysisEvidenceSelection.sector = "식비";
  context.els.monthlyAnalysisMonth.value = "2026-07";
  context.renderMonthlyAnalysis();
  assert.equal(context.monthlyAnalysisEvidenceSelection.sector, "");
});
