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

test("운영 HTML은 새 대시보드를 연결하고 기존 월 이동 버튼을 유지한다", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.equal((html.match(/id="boardGrid"/g) || []).length, 1);
  assert.match(html, /id="boardPrevMonth"/);
  assert.match(html, /id="boardNextMonth"/);
  assert.match(html, /src\/features\/board\/board-overview.js/);
  assert.match(html, /src\/styles\/14-board-overview.css/);
});

test("실제 renderBoard는 소비·섹터·결제·하단 상세 영역을 모두 갱신한다", () => {
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
  assert.match(c.els.boardSectorSummary.innerHTML, /role="img"/);
  assert.match(c.els.boardSectorSummary.innerHTML, /data-board-summary-sector="식비"/);
  assert.match(c.els.boardGrid.innerHTML, /data-board-route="billing"/);
  assert.match(c.els.boardGrid.innerHTML, /data-board-route="recurring"/);
  assert.match(c.els.boardGrid.innerHTML, /data-board-unknown/);
  assert.doesNotMatch(c.els.boardGrid.innerHTML, /TOP 5/);
  assert.match(c.els.boardSummary.innerHTML, /TOP 5/);
  assert.match(c.els.boardSummary.innerHTML, /소비와 따로 보기/);
  assert.doesNotMatch(c.els.boardMetrics.innerHTML, /현금 유출/);
});

test("거래가 없어도 명시적인 수입 0원 기록은 미입력 안내로 바꾸지 않는다", () => {
  const c = loadContext([], { "2026-09": 0 });
  c.recurringExpenses = [];
  assert.equal(c.isBoardAppEmpty(), false);
});

test("일별 소비 곡선은 실제 날짜의 정산 후 금액만 누적하고 미확인 날짜를 별도로 센다", () => {
  const rows = [
    expense("first", 1000, "2026-09-01"),
    expense("second", 2000, "2026-09-02"),
    expense("after-cutoff", 9000, "2026-09-20"),
    expense("undated", 5000, "2026-09-03", { approvalDate: "" }),
    expense("invalid", 7000, "2026-09-31")
  ];
  const c = loadContext(rows);
  c.reimbursements.first = 200;
  const before = JSON.stringify(rows);
  const series = c.buildBoardDailySeries(rows, "2026-09", 5);
  assert.deepEqual(Array.from(series.values), [800, 2800, 2800, 2800, 2800]);
  assert.equal(series.undatedCount, 2);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(Array.from(c.buildBoardDailySeries([], "2026-09", 5).values), [0, 0, 0, 0, 0]);
});

test("누적 소비 곡선은 다른 달의 거래를 선택 월 금액에 섞지 않는다", () => {
  const c = loadContext();
  const series = c.buildBoardDailySeries([
    expense("before", 5000, "2026-08-02"),
    expense("selected", 1000, "2026-09-02"),
    expense("next", 7000, "2026-10-02")
  ], "2026-09", 3);
  assert.deepEqual(Array.from(series.values), [0, 1000, 1000]);
});

test("비교 그래프는 실제 두 달의 기록이 있을 때만 SVG를 표시한다", () => {
  const c = loadContext([
    expense("current", 20000, "2026-09-03"),
    expense("previous", 30000, "2026-08-02")
  ]);
  const html = c.renderBoardOverviewTrend(c.buildBoardOverviewModel("2026-09", "2026-09-05"));
  assert.match(html, /<svg/);
  assert.match(html, /role="img"/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.doesNotMatch(c.renderBoardOverviewTrend(c.buildBoardOverviewModel("2026-10", "2026-09-05")), /<svg/);
  const missing = loadContext([expense("only", 1000)]);
  assert.doesNotMatch(missing.renderBoardOverviewTrend(missing.buildBoardOverviewModel("2026-09", "2026-09-05")), /<svg/);
});

test("결제 패널은 기존 청구 금액과 날짜 및 미분류·고정지출 이동을 보존한다", () => {
  const c = loadContext([expense("card", 90000, "2026-08-20")]);
  c.appSettings.cardBilling = { startDay: 15, endDay: 14, paymentDay: 25, weekendRule: "none" };
  c.recurringOccurrencesForMonth = () => [{ amount: 50000, posted: false }];
  const model = c.buildBoardOverviewModel("2026-09", "2026-09-05");
  const html = c.renderBoardOverviewBilling(model);
  assert.match(html, /90,000원/);
  for (const date of [model.billing.periodStart, model.billing.periodEnd, model.billing.paymentDate]) {
    const [month, day] = date.slice(5).split("-").map(Number);
    assert.ok(html.includes(date) || html.includes(date.slice(5)) || html.includes(`${month}/${day}`) || html.includes(`${month}.${day}`), `결제 날짜 ${date}가 표시되어야 한다`);
  }
  assert.match(html, /data-board-route="billing"/);
  assert.match(html, /data-board-route="recurring"/);
  assert.match(html, /data-board-unknown/);
  assert.doesNotMatch(html, /TOP 5/);
});

test("미분류 이동은 선택 월 필터를 유지한다", () => {
  const c = loadContext();
  const button = { addEventListener(type, handler) { this.click = handler; } };
  c.document = { querySelectorAll: (selector) => selector.includes("data-board-unknown") ? [button] : [] };
  c.boardDetailOptions = (options) => options;
  let opened;
  c.openDetailView = (options) => { opened = options; };
  c.attachBoardOverviewHandlers("2026-08");
  button.click();
  assert.equal(opened.month, "2026-08");
  assert.equal(opened.sector, "미분류");
});

test("일별 곡선 길이는 실제 월 일수로 제한하고 잘못된 월을 그리지 않는다", () => {
  const c = loadContext();
  assert.equal(c.buildBoardDailySeries([], "2026-02", 31).values.length, 28);
  assert.equal(c.buildBoardDailySeries([], "2028-02", 31).values.length, 29);
  const invalid = c.buildBoardDailySeries([], "invalid", 31);
  assert.equal(invalid.values.length, 0);
  assert.equal(invalid.undatedCount, 0);
});

test("섹터 도넛은 실제 금액과 건수를 유지하고 양수 비중 합계가 100%다", () => {
  const c = loadContext([
    expense("food-one", 60000), expense("food-two", 40000),
    expense("transit", 100000, undefined, { sector: "교통비" })
  ]);
  const model = c.buildBoardOverviewModel("2026-09", "2026-09-05");
  const shares = c.buildBoardSectorShares(model);
  assert.equal(shares.length, 2);
  assert.ok(Math.abs(shares.reduce((total, item) => total + item.share, 0) - 100) < 0.000001);
  const food = shares.find((item) => item.sector === "식비");
  assert.equal(food.amount, 100000);
  assert.equal(food.count, 2);
  assert.equal(food.share, 50);
  const html = c.renderBoardOverviewSectors(model);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="[^"]*식비/);
  assert.match(html, /data-board-summary-sector="식비"/);
  assert.match(html, /data-board-summary-sector="교통비"/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("음수 섹터나 0원 합계는 오해를 주는 도넛 없이 금액 목록만 표시한다", () => {
  const c = loadContext([expense("food", 100000)]);
  const model = c.buildBoardOverviewModel("2026-09", "2026-09-05");
  model.snapshot.consumptionSpend = 50000;
  model.sectors = [{ sector: "식비", amount: 100000, count: 1 }, { sector: "교통비", amount: -50000, count: 1 }];
  const shares = c.buildBoardSectorShares(model);
  assert.ok(shares.every((item) => item.share === null));
  const html = c.renderBoardOverviewSectors(model);
  assert.doesNotMatch(html, /role="img"/);
  assert.match(html, /data-board-summary-sector="식비"/);
  assert.match(html, /data-board-summary-sector="교통비"/);
  assert.match(html, /-50,000원/);
  model.snapshot.consumptionSpend = 0;
  model.sectors = [{ sector: "식비", amount: 0, count: 1 }];
  assert.ok(c.buildBoardSectorShares(model).every((item) => item.share === null));
  assert.doesNotMatch(c.renderBoardOverviewSectors(model), /role="img"/);
});

test("최근 3개월은 완료된 달만 선택하고 자료 없음·명시적 0원·날짜 미확인을 구분한다", () => {
  const c = loadContext([
    expense("zero", 0, "2026-07-02"),
    expense("aug-first", 10000, "2026-08-01"),
    expense("aug-twentieth", 30000, "2026-08-20"),
    expense("aug-undated", 50000, "2026-08-01", { approvalDate: "" }),
    expense("in-progress", 999999, "2026-09-02")
  ]);
  const points = c.buildBoardHistoryPoints(c.buildBoardOverviewModel("2026-09", "2026-09-05"));
  assert.deepEqual(Array.from(points, (item) => item.month), ["2026-06", "2026-07", "2026-08"]);
  assert.equal(points[0].hasData, false);
  assert.equal(points[1].hasData, true);
  assert.equal(points[1].amount, 0);
  assert.equal(points[2].amount, 90000);
  assert.equal(points[2].dailySeries.undatedCount, 1);
  assert.equal(points[2].dailySeries.values.length, 31);
  assert.equal(points[2].dailySeries.values.at(-1), 40000);
  const daily = Array.from(points[2].dailySeries.values).map((amount, index, values) => amount - (index ? values[index - 1] : 0));
  assert.equal(daily[0], 10000);
  assert.equal(daily[19], 30000);
  assert.equal(daily.filter((amount) => amount !== 0).length, 2);
  const future = c.buildBoardHistoryPoints(c.buildBoardOverviewModel("2026-12", "2026-09-05"));
  assert.deepEqual(Array.from(future, (item) => item.month), ["2026-06", "2026-07", "2026-08"]);
  const past = c.buildBoardHistoryPoints(c.buildBoardOverviewModel("2026-03", "2026-09-05"));
  assert.deepEqual(Array.from(past, (item) => item.month), ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(Array.from(past, (item) => item.dailySeries.values.length), [31, 28, 31]);
});

test("하단으로 옮긴 TOP 5와 섹터 항목에서 선택 월의 상세 내역을 연다", () => {
  const c = loadContext();
  const button = (dataset) => ({ dataset, addEventListener(type, handler) { this.click = handler; } });
  const all = button({ openDetailMonth: "2026-07" });
  const top = button({ boardTopSector: "식비", boardTopSubcategory: "장보기/마트" });
  const sector = button({ boardSummarySector: "교통비" });
  const select = (selector) => selector.includes("data-open-detail-month") ? [all]
    : selector.includes("data-board-top-sector") ? [top]
      : selector.includes("data-board-summary-sector") ? [sector] : [];
  c.els = {
    boardMonth: { value: "2026-08" },
    boardSummary: { querySelectorAll: select },
    boardSectorSummary: { querySelectorAll: select },
    boardGrid: { querySelectorAll: () => [] }
  };
  c.document = { querySelectorAll: select };
  c.boardDetailOptions = (options) => options;
  let opened;
  c.openDetailView = (options) => { opened = options; };
  c.attachBoardTopCategoryHandlers();
  c.attachBoardSummaryHandlers();
  all.click();
  assert.equal(opened.month, "2026-07");
  top.click();
  assert.equal(opened.month, "2026-08");
  assert.equal(opened.sector, "식비");
  assert.equal(opened.subcategory, "장보기/마트");
  sector.click();
  assert.equal(opened.month, "2026-08");
  assert.equal(opened.sector, "교통비");
  assert.equal(opened.subcategory, "all");
});
