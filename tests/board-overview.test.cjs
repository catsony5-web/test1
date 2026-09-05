const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadContext, expense } = require("./helpers/board-overview-context.cjs");

test("대시보드·소비달력·월간 분석은 동일한 소비/카드/남은 돈을 보여준다", () => {
  const rows = [expense("food", 250000),
    expense("rent", 400000, undefined, { sourceType: "transfer", sector: "고정 주거비", subcategory: "월세" }),
    expense("savings", 700000, undefined, { sourceType: "transfer", sector: "저축", subcategory: "적금/예금" }),
    expense("insurance", 100000, undefined, { sector: "저축", subcategory: "보험" }),
    expense("loan", 550000, undefined, { sourceType: "transfer", sector: "고정 주거비", subcategory: "대출이자", recurringType: "loan", loanPrincipalAmount: 500000, loanInterestAmount: 50000 })];
  const c = loadContext(rows, { "2026-09": 3000000 });
  c.reimbursements.food = 50000;
  const before = JSON.stringify(rows);
  const model = c.buildBoardOverviewModel("2026-09", "2026-09-05");
  assert.equal(model.snapshot.consumptionSpend, 750000);
  assert.equal(model.snapshot.actualSavings, 700000);
  assert.equal(model.snapshot.freeBalance, 1050000);
  assert.equal(model.billing.expectedAmount, 350000);
  assert.equal(c.calendarExpenseTotals(model.snapshot.expenseRows).consumption, model.snapshot.consumptionSpend);
  assert.equal(c.buildAnalysisMonthSnapshot("2026-09").freeBalance, model.snapshot.freeBalance);
  assert.equal(model.sectors.reduce((sum, item) => sum + item.amount, 0), model.snapshot.consumptionSpend);
  assert.equal(JSON.stringify(rows), before);
  assert.match(c.renderBoardOverviewMetrics(model), /소비지출/);
});

test("미입력 수입은 음수 잔액으로 단정하지 않고 명시적 0원과 구분한다", () => {
  const c = loadContext([expense("food", 30000)]);
  let html = c.renderBoardOverviewMetrics(c.buildBoardOverviewModel("2026-09"));
  assert.match(html, /수입 입력 필요/);
  assert.match(html, /계산 대기/);
  assert.doesNotMatch(html, /-30,000원/);
  c.monthlyIncome["2026-09"] = 0;
  html = c.renderBoardOverviewMetrics(c.buildBoardOverviewModel("2026-09"));
  assert.doesNotMatch(html, /계산 대기/);
  assert.match(html, /-30,000원/);
});

test("진행 월은 전월 동일 날짜까지만 비교하며 월 총액과 비교 금액을 구분한다", () => {
  const c = loadContext([expense("now", 20000), expense("later", 300000, "2026-09-20"),
    expense("before", 40000, "2026-08-03"), expense("before-later", 500000, "2026-08-20")]);
  const m = c.buildBoardOverviewModel("2026-09", "2026-09-05");
  assert.equal(m.snapshot.consumptionSpend, 320000);
  assert.equal(m.analysis.consumptionDelta, -20000);
  const html = c.renderBoardOverviewMetrics(m);
  assert.match(html, /전월과 같은 1~5일/);
  assert.match(html, /비교 금액 20,000원 \/ 전월 40,000원/);
});

test("짧은 달·연도 경계와 미래 월의 비교 상태를 보존한다", () => {
  const c = loadContext([expense("a", 10000, "2026-03-02"), expense("b", 10000, "2026-02-02")]);
  assert.equal(c.buildBoardOverviewModel("2026-03", "2026-03-31").analysis.cutoffDay, 28);
  assert.equal(c.buildBoardOverviewModel("2026-01", "2026-01-05").analysis.comparisonMonth, "2025-12");
  assert.match(c.boardOverviewComparison(c.buildBoardOverviewModel("2026-10", "2026-09-05").analysis), /미래 월/);
  assert.equal(c.buildBoardOverviewModel("invalid"), null);
});

test("TOP 5는 원금·적금과 취소를 빼고 식비 상황 태그를 중복 합산하지 않는다", () => {
  const c = loadContext([
    ...Array.from({ length: 7 }, (_, i) => expense(`food-${i}`, (i + 1) * 10000, undefined, { subcategory: `항목 ${i}`, foodOccasion: "date" })),
    expense("savings", 999999, undefined, { sector: "저축", subcategory: "적금/예금" }),
    expense("canceled", 999999, undefined, { cancel: "취소", status: "취소/제외" })
  ]);
  const m = c.buildBoardOverviewModel("2026-09");
  assert.equal(m.topCategories.length, 5);
  assert.equal(m.topCategories[0].amount, 70000);
  assert.equal(m.snapshot.consumptionSpend, 280000);
  assert.equal(m.sectors.length, 1);
});

test("할부와 카드 청구기간은 기존 카드 예정 모델과 일치한다", () => {
  const c = loadContext([expense("installment", 90000, "2026-08-20", {
    installmentEnabled: true, installmentMonths: 3, installmentStartMonth: "2026-08"
  })]);
  c.appSettings.cardBilling = { startDay: 15, endDay: 14, paymentDay: 25, weekendRule: "none" };
  const m = c.buildBoardOverviewModel("2026-09");
  assert.equal(m.billing.expectedAmount, c.buildCalendarCardBillingModel("2026-09").expectedAmount);
  assert.equal(m.snapshot.consumptionSpend, c.calendarExpenseTotals(m.snapshot.expenseRows).consumption);
  assert.equal(m.billing.periodStart, "2026-08-15");
  assert.equal(m.billing.periodEnd, "2026-09-14");
});

test("미반영 예정액은 소비나 남은 돈에서 다시 차감하지 않는다", () => {
  const c = loadContext([expense("food", 30000)], { "2026-09": 100000 });
  c.recurringOccurrencesForMonth = () => [{ amount: 500000, posted: false }, { amount: 700000, posted: true }];
  const m = c.buildBoardOverviewModel("2026-09");
  assert.equal(m.pendingAmount, 500000);
  assert.equal(m.snapshot.freeBalance, 70000);
  assert.equal(m.pendingCount, 1);
});

test("빈 선택 월·누락된 과거 자료·긴 항목명과 HTML 입력을 안전하게 표시한다", () => {
  const c = loadContext([expense("hostile", 1000, undefined, { sector: '<img src=x onerror=alert(1)>', subcategory: '<script>alert(1)</script>' })]);
  const m = c.buildBoardOverviewModel("2026-09");
  assert.doesNotMatch(c.renderBoardOverviewSectors(m), /<img src=x/);
  assert.doesNotMatch(c.renderBoardOverviewTop(m), /<script>/);
  const empty = c.buildBoardOverviewModel("2026-07");
  assert.match(c.renderBoardOverviewSectors(empty), /소비지출이 없습니다/);
  assert.match(c.renderBoardOverviewFooter(empty), /자료 없음/);
  assert.doesNotMatch(c.renderBoardOverviewFooter(empty), /<svg/);
});

test("대시보드에서 선택 월과 카드 상세 열림 상태를 유지해 이동한다", () => {
  const c = loadContext();
  const buttons = ["calendar", "billing", "recurring"].map((route) => ({ dataset: { boardRoute: route }, addEventListener(type, fn) { this.click = fn; } }));
  c.document = { querySelectorAll: (selector) => selector.includes("data-board-route") ? buttons : [] };
  let month; let view;
  c.setSharedSelectedMonth = (value) => { month = value; };
  c.switchView = (value) => { view = value; };
  c.attachBoardOverviewHandlers("2026-08");
  buttons[1].click();
  assert.equal(month, "2026-08"); assert.equal(view, "calendar");
  assert.equal(c.selectedCalendarMonth, "2026-08"); assert.equal(c.calendarBillingExpanded, true);
  buttons[0].click(); assert.equal(c.calendarBillingExpanded, false);
  buttons[2].click(); assert.equal(view, "recurring");
});

test("운영 HTML은 가로 막대 대시보드를 연결하고 기존 월 이동 버튼을 유지한다", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.equal((html.match(/id="boardGrid"/g) || []).length, 1);
  assert.match(html, /id="boardPrevMonth"/);
  assert.match(html, /id="boardNextMonth"/);
  assert.match(html, /src\/features\/board\/board-overview.js/);
  assert.match(html, /src\/styles\/14-board-overview.css/);
});

test("실제 renderBoard는 새 요약·섹터·TOP·보조 영역을 모두 갱신한다", () => {
  const c = loadContext([expense("food", 30000)]);
  const element = () => ({ innerHTML: "", value: "2026-09", classList: { remove() {} }, querySelectorAll: () => [] });
  c.els = Object.fromEntries(["boardMonth", "boardMetrics", "boardSectorMap", "boardSectorSummary", "boardGrid", "boardSideSummary", "boardSummary", "boardMapTopButton"].map((key) => [key, element()]));
  Object.assign(c, {
    recurringExpenses: [], appMonthOptions: () => ["2026-08", "2026-09"],
    getSharedSelectedMonth: () => "2026-09", canViewDriveSharedMonth: () => false,
    attachBoardSummaryHandlers() {}, attachBoardTopCategoryHandlers() {},
    document: { querySelectorAll: () => [] }
  });
  c.renderBoard();
  assert.match(c.els.boardMetrics.innerHTML, /소비지출/);
  assert.match(c.els.boardMetrics.innerHTML, /계산 대기/);
  assert.match(c.els.boardSectorSummary.innerHTML, /<meter/);
  assert.match(c.els.boardGrid.innerHTML, /TOP 5/);
  assert.match(c.els.boardSummary.innerHTML, /소비와 따로 보기/);
  assert.doesNotMatch(c.els.boardMetrics.innerHTML, /현금 유출/);
});

test("거래가 없어도 명시적인 수입 0원 기록은 미입력 안내로 바꾸지 않는다", () => {
  const c = loadContext([], { "2026-09": 0 });
  c.recurringExpenses = [];
  assert.equal(c.isBoardAppEmpty(), false);
});
