const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContext(rows = []) {
  const cardBilling = { startDay: 1, endDay: 31, paymentDay: 25, weekendRule: "none" };
  const context = vm.createContext({
    console,
    classified: rows,
    transactions: [],
    recurringExpenses: [],
    recurringOccurrencesForMonth: () => [],
    reimbursements: {},
    monthlyIncome: { "2026-08": 4000000 },
    appSettings: { cardBilling },
    defaultAppSettings: () => ({ cardBilling }),
    calendarBillingExpanded: false
  });
  for (const file of [
    "src/data/categories.js",
    "src/utils/format.js",
    "src/utils/date.js",
    "src/utils/dom.js",
    "src/utils/food-occasion.js",
    "src/utils/normalize.js",
    "src/utils/grouping.js",
    "src/utils/storage.js",
    "src/components/chips.js",
    "src/features/board/board-view.js",
    "src/features/monthly/monthly-flow.js",
    "src/features/analysis/analysis-core.js",
    "src/features/calendar/calendar-cashflow.js",
    "src/features/calendar/calendar-view.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  return context;
}

function expense(key, amount, day, extra = {}) {
  return {
    recordKey: key,
    transactionId: key,
    merchant: `합성 테스트 ${key}`,
    amount,
    month: "2026-08",
    approvalDate: `2026-08-${String(day).padStart(2, "0")}`,
    approvalTime: "12:00",
    sourceType: "transfer",
    flow: "expense",
    sector: "식비",
    subcategory: "장보기/마트",
    status: "분류완료",
    ...extra
  };
}

function previewRows() {
  return [
    expense("card", 1250000, 8, { sourceType: "card" }),
    expense("rent", 600000, 7, { sector: "고정 주거비", subcategory: "월세" }),
    expense("insurance", 100000, 5, { sector: "고정 주거비", subcategory: "보험료" }),
    expense("loan", 550000, 25, { recurringType: "loan", loanType: "신용대출", loanPrincipalAmount: 500000, loanInterestAmount: 50000 }),
    expense("savings", 700000, 27, { sector: "저축", subcategory: "적금/예금" })
  ];
}

function monthSummary(context, month = "2026-08") {
  const rows = context.reportingExpenseRows(context.classified, { months: [month] });
  const byDate = context.groupBy(rows, (item) => item.approvalDate);
  const installments = context.buildCalendarInstallmentModel(month);
  return context.renderCalendarMonthSummary(month, rows, byDate, installments.rows);
}

function metric(html, key) {
  const match = html.match(new RegExp(`data-calendar-metric="${key}"[^>]*>([\\s\\S]*?)</(?:article|button)>`));
  assert.ok(match, `metric ${key} exists`);
  return match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

test("소비·원금·저축을 분리하고 자유 잔액은 월간 분석과 일치한다", () => {
  const rows = previewRows();
  const before = JSON.stringify(rows);
  const context = loadContext(rows);
  context.reimbursements.card = 200000;
  const totals = context.calendarExpenseTotals(rows);
  assert.equal(totals.consumption, 1800000);
  assert.equal(totals.principal, 500000);
  assert.equal(totals.savings, 700000);
  const html = monthSummary(context);
  assert.match(metric(html, "spend"), /소비지출 1,800,000원/);
  assert.match(metric(html, "balance"), /자유 잔액 \+1,000,000원/);
  assert.match(metric(html, "card-billing"), /1,900,000원/);
  assert.equal(context.buildCalendarCardBillingModel("2026-08").expectedAmount, 1250000);
  assert.equal(context.buildAnalysisMonthSnapshot("2026-08").freeBalance, 1000000);
  assert.equal(JSON.stringify(rows), before, "rendering must not mutate saved transactions");
  assert.equal(context.reimbursements.card, 200000);
});

test("식비 상황 태그를 바꿔도 소비지출과 카드 결제 예정액·자유 잔액은 그대로다", () => {
  const rows = previewRows();
  const context = loadContext(rows);
  context.reimbursements.card = 200000;
  const before = monthSummary(context);
  for (const foodOccasion of ["family", "date", "celebration", "treat", ""]) {
    rows[0].foodOccasion = foodOccasion;
    const after = monthSummary(context);
    for (const key of ["spend", "card-billing", "balance"]) assert.equal(metric(after, key), metric(before, key));
  }
});

test("저축 분류의 보험·상품권은 소비에 남기고 적금·예금만 제외한다", () => {
  const context = loadContext();
  const rows = [
    expense("insurance", 100000, 1, { sector: "저축", subcategory: "보험" }),
    expense("gift", 50000, 2, { sector: "저축", subcategory: "상품권/저축성" }),
    expense("deposit", 700000, 3, { sector: "저축", subcategory: "적금/예금" }),
    expense("unstructured-loan", 550000, 4, { sector: "고정 주거비", subcategory: "대출이자" })
  ];
  const totals = context.calendarExpenseTotals(rows);
  assert.equal(totals.consumption, 700000);
  assert.equal(totals.savings, 700000);
  assert.equal(totals.principal, 0, "do not infer principal without a registered loan breakdown");
});

test("소비와 따로 보기는 상단 요약과 분리해 달력의 마지막 영역에서 갱신한다", () => {
  const context = loadContext(previewRows());
  const html = context.renderCalendarAssetSummary("2026-08", context.classified);
  assert.match(html, /대출 원금 상환<\/span><strong>500,000원/);
  assert.match(html, /저축<\/span><strong>700,000원/);
  assert.doesNotMatch(monthSummary(context), /소비와 따로 보기/);
  const emptyMonth = context.renderCalendarAssetSummary("2026-09", []);
  assert.match(emptyMonth, /대출 원금 상환<\/span><strong>0원/);
  assert.match(emptyMonth, /저축<\/span><strong>0원/);
  const markup = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(markup, /id="calendarMonthlyMemo"[\s\S]*?<section id="calendarAssetSummary"[^>]*><\/section>\s*<\/div>\s*<\/section>/);
});

test("N빵 정산금은 소비에서만 빼고 카드 결제 예정액은 보존한다", () => {
  const context = loadContext([expense("split", 31900, 8, { sourceType: "card" })]);
  context.reimbursements.split = context.calendarSplitCalculation(31900, 3).reimbursement;
  assert.equal(context.calendarExpenseTotals(context.classified).consumption, 10634);
  assert.equal(context.buildCalendarCardBillingModel("2026-08").expectedAmount, 31900);
  assert.match(monthSummary(context), /정산금 차감 전/);
});

test("보험과 신용대출은 정산 전 결제액과 정산 후 소비를 구분하고 원금을 별도로 둔다", () => {
  const rows = [
    expense("insurance", 100000, 5, { sector: "고정 주거비", subcategory: "보험료" }),
    expense("credit-loan", 550000, 25, {
      recurringType: "loan", loanType: "신용대출", loanPrincipalAmount: 500000,
      loanInterestAmount: 50000, loanSupportInterestAmount: 20000
    })
  ];
  const context = loadContext(rows);
  context.reimbursements.insurance = 30000;
  const before = JSON.stringify(rows);
  const totals = context.calendarExpenseTotals(rows);
  assert.equal(totals.consumption, 100000);
  assert.equal(totals.principal, 500000);
  assert.equal(context.buildCalendarCashOutflowModel("2026-08").expectedAmount, 650000);
  const html = monthSummary(context);
  assert.match(metric(html, "spend"), /소비지출 100,000원/);
  assert.match(metric(html, "card-billing"), /650,000원/);
  assert.match(context.renderCalendarAssetSummary("2026-08", rows), /대출 원금 상환<\/span><strong>500,000원/);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(context.reimbursements.insurance, 30000);
});

test("할부는 해당 월 회차만 소비와 카드 예정액에 반영한다", () => {
  const item = expense("installment", 31900, 31, {
    sourceType: "card", installmentEnabled: true, installmentMonths: 3,
    installmentStartMonth: "2026-08", installmentOriginalAmount: 31900
  });
  const context = loadContext([item]);
  context.reimbursements.installment = 21266;
  const months = ["2026-08", "2026-09", "2026-10"];
  let totalConsumption = 0;
  let totalBilling = 0;
  for (const [index, month] of months.entries()) {
    const rows = context.reportingExpenseRows(context.classified, { months: [month] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, index === 2 ? 10634 : 10633);
    const consumption = context.calendarExpenseTotals(rows).consumption;
    assert.equal(consumption, index === 2 ? 3544 : 3545);
    totalConsumption += consumption;
    totalBilling += context.buildCalendarCardBillingModel(month).expectedAmount;
    const installments = context.buildCalendarInstallmentModel(month);
    assert.equal(installments.amount, rows[0].amount);
    assert.equal(installments.rows.length, 1);
    assert.equal(installments.rows[0].date, `${month}-25`);
    assert.equal(context.buildCalendarCashOutflowModel(month).expectedAmount, installments.amount,
      "할부는 카드 청구에 포함되므로 결제 예정액에 다시 더하지 않는다");
    assert.match(metric(monthSummary(context, month), "installment"), new RegExp(context.formatWon(installments.amount)));
  }
  assert.equal(totalConsumption, 10634);
  assert.equal(totalBilling, 31900);
});

test("1원을 3개월로 나눈 할부도 마지막 회차의 원 단위 잔액을 잃지 않는다", () => {
  const context = loadContext([expense("tiny-installment", 1, 1, {
    sourceType: "card", installmentEnabled: true, installmentMonths: 3,
    installmentStartMonth: "2026-08", installmentOriginalAmount: 1
  })]);
  const amounts = ["2026-08", "2026-09", "2026-10"].map((month) => {
    const installments = context.buildCalendarInstallmentModel(month);
    assert.equal(installments.amount, context.buildCalendarCashOutflowModel(month).expectedAmount);
    return installments.amount;
  });
  assert.deepEqual(amounts, [0, 0, 1]);
  assert.equal(amounts.reduce((total, amount) => total + amount, 0), 1);
});

test("월말 주말 결제는 실제 결제월로 이월하고 그 달의 두 청구 회차를 보존한다", () => {
  const context = loadContext([expense("weekend-installment", 90000, 10, {
    sourceType: "card", month: "2026-05", approvalDate: "2026-05-10",
    installmentEnabled: true, installmentMonths: 3,
    installmentStartMonth: "2026-05", installmentOriginalAmount: 90000
  })]);
  context.appSettings.cardBilling = { startDay: 1, endDay: 31, paymentDay: 31, weekendRule: "next-monday" };
  const may = context.buildCalendarInstallmentModel("2026-05");
  const june = context.buildCalendarInstallmentModel("2026-06");
  assert.equal(may.amount, 0);
  assert.equal(may.rows.length, 0);
  assert.deepEqual(Array.from(june.rows, (item) => item.date).sort(), ["2026-06-01", "2026-06-30"]);
  assert.equal(june.amount, 60000);
  assert.equal(context.buildCalendarCashOutflowModel("2026-06").expectedAmount, 60000);
  const mayConsumption = context.reportingExpenseRows(context.classified, { months: ["2026-05"] });
  assert.equal(context.calendarExpenseTotals(mayConsumption).consumption, 30000,
    "결제일이 이월되어도 사용월의 소비 회차는 옮기지 않는다");
});

test("원금·저축 전용일은 평균 소비일수와 가장 많이 쓴 날에서 제외한다", () => {
  const rows = [
    expense("meal", 40000, 2),
    expense("principal-only", 900000, 3, { recurringType: "loan", loanPrincipalAmount: 900000 }),
    expense("deposit", 2000000, 4, { sector: "저축", subcategory: "적금/예금" }),
    expense("refunded", 50000, 5)
  ];
  const context = loadContext(rows);
  context.reimbursements.refunded = 50000;
  const html = monthSummary(context, "2026-08");
  assert.match(metric(html, "average"), /40,000원.*소비 발생 1일 기준/);
  assert.match(metric(html, "top-day"), /2026-08-02.*40,000원.*1건/);
  assert.match(metric(html, "spend"), /40,000원/);
  assert.match(metric(html, "installment"), /0원/);
  assert.doesNotMatch(html, /data-calendar-metric="scheduled"/);
  context.classified = rows.slice(1, 3);
  const noConsumption = monthSummary(context);
  assert.match(metric(noConsumption, "average"), /0원.*소비지출 없음/);
  assert.match(metric(noConsumption, "top-day"), /가장 많이 쓴 날 - 0원/);
});

test("가족 분담금이 다음 달 들어와도 월별 자유 잔액을 보존한다", () => {
  const loan = expense("shared-loan", 550000, 25, {
    recurringType: "loan", loanPrincipalAmount: 500000, loanInterestAmount: 50000,
    loanSupportPrincipalAmount: 200000, loanSupportInterestAmount: 20000,
    loanSupportReceivedAmount: 220000, loanSupportReceivedDate: "2026-09-03"
  });
  const context = loadContext([loan]);
  const totals = context.calendarExpenseTotals([loan]);
  assert.equal(totals.consumption, 30000);
  assert.equal(totals.principal, 300000);
  assert.match(metric(monthSummary(context), "balance"), /\+3,450,000원/);
  assert.match(metric(monthSummary(context, "2026-09"), "balance"), /\+220,000원/);
  assert.equal(context.buildAnalysisMonthSnapshot("2026-08").freeBalance, 3450000);
  assert.equal(context.buildAnalysisMonthSnapshot("2026-09").freeBalance, 220000);
  const detail = context.renderCalendarLoanBreakdown(loan);
  assert.match(detail, /내 이자.*30,000원/);
  assert.match(detail, /내 원금.*300,000원/);
  assert.match(detail, /가족 분담 220,000원/);
});

test("취소·제외 거래와 수입은 소비 및 카드 결제 예정에서 제외한다", () => {
  const context = loadContext([
    expense("meal", 20000, 1, { sourceType: "card" }),
    expense("cancelled", 500000, 2, { sourceType: "card", cancel: "취소", status: "취소/제외" }),
    expense("income", 1000000, 3, { flow: "income", sector: "수입", sourceType: "card" })
  ]);
  const active = context.reportingExpenseRows(context.classified);
  assert.equal(active.length, 1);
  assert.equal(context.calendarExpenseTotals(active).consumption, 20000);
  assert.equal(context.buildCalendarCardBillingModel("2026-08").expectedAmount, 20000);
});

test("청구기간 경계·이전 연도·주말 결제일 계산은 바꾸지 않는다", () => {
  const context = loadContext([
    expense("before", 99999, 1, { sourceType: "card", month: "2025-12", approvalDate: "2025-12-13" }),
    expense("start", 10000, 1, { sourceType: "card", month: "2025-12", approvalDate: "2025-12-14" }),
    expense("end", 20000, 1, { sourceType: "card", month: "2026-01", approvalDate: "2026-01-13" }),
    expense("after", 99999, 1, { sourceType: "card", month: "2026-01", approvalDate: "2026-01-14" })
  ]);
  context.appSettings.cardBilling = { startDay: 14, endDay: 13, paymentDay: 25, weekendRule: "next-monday" };
  const billing = context.buildCalendarCardBillingModel("2026-01");
  assert.equal(billing.periodStart, "2025-12-14");
  assert.equal(billing.periodEnd, "2026-01-13");
  assert.equal(billing.expectedAmount, 30000);
  assert.equal(billing.paymentDate, "2026-01-26");
});

test("달력 색상·일별 금액은 소비 기준이며 표시 토글은 합계를 바꾸지 않는다", () => {
  const context = loadContext([...previewRows(), expense("installment", 12000, 10, {
    sourceType: "card", installmentEnabled: true, installmentMonths: 3,
    installmentStartMonth: "2026-08", installmentOriginalAmount: 12000
  })]);
  context.reimbursements.card = 200000;
  context.reimbursements.installment = 6000;
  let timelineInstallments;
  const element = () => ({ value: "", innerHTML: "", querySelectorAll: () => [] });
  Object.assign(context, {
    els: { calendarMonth: element(), calendarMonthSummary: element(), calendarAssetSummary: element(), spendingCalendar: element() },
    recurringExpenses: [],
    selectedCalendarMonth: "2026-08",
    selectedCalendarDate: "2026-08-25",
    calendarShowIncome: true,
    calendarShowAssetMoves: true,
    appMonthOptions: () => ["2026-08"],
    getSharedSelectedMonth: (month) => month,
    canViewDriveSharedMonth: () => false,
    attachCalendarWorkspaceHandlers: () => {},
    recurringOccurrencesForMonth: () => [],
    renderCalendarBillingDetail: () => {},
    renderCalendarMonthlyMemo: () => {},
    renderCalendarCurrentMonthLabel: () => {},
    attachCalendarSummaryHandlers: () => {},
    renderDayTimeline: (date, rows, installments) => { timelineInstallments = installments; }
  });
  context.renderCalendar();
  const cell = (date) => context.els.spendingCalendar.innerHTML.match(new RegExp(`data-calendar-date="${date}"([\\s\\S]*?)</button>`))[1];
  assert.match(cell("2026-08-25"), /data-spend-level="2"/);
  assert.match(cell("2026-08-25"), /<strong>50,000원<\/strong>/);
  assert.match(cell("2026-08-25"), /원금 500,000원/);
  assert.match(cell("2026-08-25"), /할부[^<]*4,000원/);
  assert.doesNotMatch(cell("2026-08-10"), /할부[^<]*4,000원/);
  assert.equal(timelineInstallments.length, 1);
  assert.equal(timelineInstallments[0].date, "2026-08-25");
  assert.equal(timelineInstallments[0].amount, 4000);
  assert.match(cell("2026-08-27"), /data-spend-level="0"/);
  assert.match(cell("2026-08-27"), /저축 700,000원/);
  assert.doesNotMatch(cell("2026-08-27"), /<strong>/);
  const before = context.els.calendarMonthSummary.innerHTML;
  const assetsBefore = context.els.calendarAssetSummary.innerHTML;
  context.calendarShowAssetMoves = false;
  context.renderCalendar();
  assert.equal(context.els.calendarMonthSummary.innerHTML, before);
  assert.equal(context.els.calendarAssetSummary.innerHTML, assetsBefore);
  assert.doesNotMatch(cell("2026-08-25"), /원금 500,000원/);
  assert.match(cell("2026-08-25"), /<strong>50,000원<\/strong>/);
  assert.doesNotMatch(cell("2026-08-27"), /저축 700,000원/);
  context.selectedCalendarDate = "2026-08-10";
  context.renderCalendar();
  assert.equal(timelineInstallments.length, 0, "승인일에는 결제일의 할부 예정 행을 중복 표시하지 않는다");
});

test("대출 상세는 총 상환액과 소비에 포함되는 이자를 함께 설명한다", () => {
  const context = loadContext();
  const loan = previewRows().find((item) => item.recordKey === "loan");
  const html = context.renderCalendarLoanBreakdown(loan);
  assert.match(html, /이자<\/span><strong>50,000원/);
  assert.match(html, /원금<\/span><strong>500,000원/);
  assert.match(html, /총 상환 550,000원 중 소비지출에는 이자 50,000원만 반영/);
  assert.match(html, /소비 포함/);
  assert.match(html, /소비 제외/);
});
