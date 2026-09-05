const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContext() {
  const foodBudget = { monthlyTarget: 250000, diningCost: 20000 };
  const context = vm.createContext({
    console, reimbursements: {}, transactions: [], rules: [],
    defaultAppSettings: () => ({ foodBudget }),
    appSettings: { foodBudget },
    summaryFoodSelection: { month: "", date: "", week: 0 },
    summaryFoodSelectedOrders: new Set(),
    summaryFoodReviewPendingOnly: true,
    summaryFoodReviewCategory: { sector: "식비", subcategory: "장보기/마트" },
    summaryFoodFeedback: { message: "", type: "" },
    summaryFoodSaving: false
  });
  for (const file of [
    "src/data/categories.js", "src/data/rules.js",
    "src/utils/format.js", "src/utils/date.js", "src/utils/dom.js",
    "src/utils/food-occasion.js",
    "src/utils/normalize.js", "src/utils/grouping.js", "src/utils/storage.js", "src/components/chips.js",
    "src/features/board/board-view.js", "src/features/classification/smart-suggestions.js",
    "src/features/summary/comparison-analysis.js", "src/features/summary/summary-pattern.js",
    "src/features/summary/summary-food-core.js", "src/features/summary/summary-food-view.js",
    "src/features/calendar/calendar-view.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  return context;
}

function expense(key, amount, day = 17, extra = {}) {
  return {
    recordKey: key, transactionId: key,
    sourceType: "card", flow: "expense", status: "분류완료",
    month: "2026-08", approvalDate: `2026-08-${String(day).padStart(2, "0")}`,
    approvalTime: "12:30", approvalNo: key,
    merchant: "테스트 식당", sector: "식비", subcategory: "외식-혼자",
    amount, ...extra
  };
}

function model(context, rows, month = "2026-08", extra = {}, today = "2026-08-20") {
  return context.buildSummaryFoodModel({ selectedMonth: month, currentRows: rows, ...extra }, context.appSettings.foodBudget, today);
}

test("월~일 달력은 월 밖 날짜를 합산하지 않고 부분 주 예산까지 월 목표와 일치한다", () => {
  const context = loadContext();
  const result = model(context, []);
  assert.equal(result.weeks.length, 6);
  assert.equal(result.weeks[0].days.slice(0, 5).every((day) => day === null), true);
  assert.equal(result.weeks[0].startDate, "2026-08-01");
  assert.equal(result.weeks[0].endDate, "2026-08-02");
  assert.equal(result.weeks[5].startDate, "2026-08-31");
  assert.equal(result.weeks[5].endDate, "2026-08-31");
  assert.equal(result.weeks.reduce((sum, week) => sum + week.target, 0), 250000);
  assert.equal(result.days.length, 31);
});

test("윤년과 연말을 포함한 모든 월의 날짜가 한 번씩만 배치된다", () => {
  const context = loadContext();
  for (const year of [2024, 2025, 2026, 2027, 2028]) {
    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const result = model(context, [], key);
      const dates = result.weeks.flatMap((week) => week.days.filter(Boolean).map((day) => day.date));
      assert.equal(dates.length, new Date(year, month, 0).getDate());
      assert.equal(new Set(dates).size, dates.length);
      assert.ok(dates.every((date) => date.startsWith(key)));
      assert.equal(result.weeks.reduce((sum, week) => sum + week.target, 0), 250000);
    }
  }
});

test("쿠팡 장보기·배달·외식·기타 식비는 중복 없이 합산하고 생활용품은 제외한다", () => {
  const context = loadContext();
  const rows = [
    expense("grocery", 40000, 17, { merchant: "쿠팡", subcategory: "장보기/마트" }),
    expense("eats", 18000, 17, { merchant: "쿠팡이츠", subcategory: "배달-혼자" }),
    expense("dining", 25000),
    expense("mart", 12000, 17, { merchant: "동네 마트", subcategory: "장보기/마트" }),
    expense("coffee", 5000, 17, { merchant: "카페", subcategory: "카페/음료" }),
    expense("household", 30000, 17, { merchant: "쿠팡", sector: "생활용품", subcategory: "소모품", manualSector: "생활용품", manualSubcategory: "소모품" })
  ];
  context.reimbursements.grocery = 10000;
  const result = model(context, rows);
  assert.equal(result.totals.amount, 90000);
  assert.equal(result.totals.groups.coupang.amount, 30000);
  assert.equal(result.totals.groups.delivery.amount, 18000);
  assert.equal(result.totals.groups.dining.amount, 25000);
  assert.equal(result.totals.groups.other.amount, 17000);
  assert.equal(result.totals.count, 5);
  assert.equal(result.days[16].amount, 90000);
  assert.equal(result.weeks.reduce((sum, week) => sum + week.amount, 0), result.totals.amount);
  assert.equal(result.pendingRows.length, 1);
});

test("시간 없는 거래도 새 달력에는 포함하고 기존 시간대 표에서는 제외한다", () => {
  const context = loadContext();
  const row = expense("no-time", 8000, 3, { approvalTime: "" });
  assert.equal(model(context, [row]).days[2].amount, 8000);
  assert.equal(context.buildSummaryPatternSide([row]).timedCount, 0);
});

test("잘못된 날짜는 다른 날로 넘기지 않고 날짜 확인 필요 합계에 남긴다", () => {
  const context = loadContext();
  const result = model(context, [expense("valid", 3000), expense("invalid", 5000, 32), expense("missing", 2000, 1, { approvalDate: "" })]);
  assert.equal(result.undatedRows.length, 2);
  assert.equal(result.undatedTotals.amount, 7000);
  assert.equal(result.weeks.reduce((sum, week) => sum + week.amount, 0) + result.undatedTotals.amount, 10000);
});

test("수입·취소·제외 거래와 진행 월 기준일 이후 거래는 집계하지 않는다", () => {
  const context = loadContext();
  const rows = [
    expense("before", 10000, 10), expense("later", 90000, 25),
    expense("income", 30000, 10, { flow: "income" }),
    expense("excluded", 40000, 10, { status: "취소/제외" }),
    expense("cancel", 50000, 10, { cancel: "취소", manualSector: "식비", manualSubcategory: "외식-혼자" })
  ];
  const result = model(context, rows, "2026-08", { cutoffDay: 20 });
  assert.equal(result.totals.amount, 10000);
  assert.equal(result.days[24].outsideCoverage, true);
  assert.equal(result.remainingDays, 12);
  assert.equal(result.afterDining, 220000);
  assert.equal(result.dailyAfterDining, Math.floor(220000 / 12));
});

test("식비가 없어도 쿠팡 미확인 내역과 예산 설정을 보여준다", () => {
  const context = loadContext();
  const result = model(context, [expense("unknown", 50000, 3, { merchant: "쿠팡", sector: "미분류", subcategory: "미분류", status: "미분류" })]);
  context.syncSummaryFoodSelection(result);
  assert.equal(result.totals.amount, 0);
  assert.equal(result.pendingRows.length, 1);
  assert.equal(result.reviewRows.length, 1);
  assert.equal(result.days[2].rows.length, 1);
  assert.match(context.renderSummaryFoodBudget(result), /확인 전에는 외식 여유를 확정할 수 없습니다/);
  assert.match(context.renderSummaryFood(result), /2026-08 식비 달력/);
});

test("쿠팡이츠·와우 멤버십은 일반 주문 빠른 분류 대상이 아니다", () => {
  const context = loadContext();
  for (const merchant of ["쿠팡이츠", "Coupang Eats", "쿠팡(와우멤버십)", "Coupang WOW"]) {
    assert.notEqual(context.summaryFoodMerchantKind({ merchant }), "order");
    assert.equal(context.summaryFoodIsPending({ merchant }), false);
  }
  assert.equal(context.summaryFoodMerchantKind({ merchant: "쿠팡 프레쉬" }), "order");
});

test("할부 배분액과 정산은 월 합계에 포함하되 이후 회차를 새 주문으로 세지 않는다", () => {
  const context = loadContext();
  const source = expense("installment", 90000, 3, {
    merchant: "쿠팡", subcategory: "장보기/마트",
    month: "2026-07", approvalDate: "2026-07-03",
    installmentEnabled: true, installmentMonths: 3, installmentStartMonth: "2026-07"
  });
  context.reimbursements.installment = 30000;
  const rows = context.reportingExpenseRows([source], { months: ["2026-08"] });
  const result = model(context, rows);
  assert.equal(result.totals.amount, 20000);
  assert.equal(result.totals.count, 0);
  assert.equal(result.totals.installmentCount, 1);
  assert.equal(context.summaryFoodSourceKey(result.reviewRows[0]), "installment");
});

test("빠른 분류는 선택 거래의 분류만 바꾸며 총 결제액·정산 연결·다른 주문을 보존한다", () => {
  const context = loadContext();
  const rows = [expense("one", 35000, 3, { merchant: "쿠팡", memo: "생활용품" }), expense("two", 45000, 7, { merchant: "쿠팡" })];
  const original = JSON.stringify(rows);
  const result = context.summaryFoodClassificationUpdates(rows, ["one"], "생활용품", "소모품");
  assert.equal(result.count, 1);
  assert.equal(result.records[0].manualSector, "생활용품");
  assert.equal(result.records[0].classificationScope, "transaction");
  for (const key of ["amount", "recordKey", "transactionId", "approvalNo", "approvalDate", "memo"]) assert.equal(result.records[0][key], rows[0][key]);
  assert.strictEqual(result.records[1], rows[1]);
  assert.equal(result.records.reduce((sum, row) => sum + row.amount, 0), 80000);
  assert.equal(JSON.stringify(rows), original);
  assert.throws(() => context.summaryFoodClassificationUpdates(rows, ["one"], "수입", "이체입금"));
});

test("거래 한정 분류는 저장·백업 정규화 후에도 유지하며 자동 추천의 학습에서 제외한다", () => {
  const context = loadContext();
  const row = expense("one", 30000, 3, { merchant: "쿠팡", manualSector: "생활용품", manualSubcategory: "소모품", sector: "생활용품", subcategory: "소모품", classificationScope: "transaction" });
  const normalized = context.normalizeStoredTransaction(JSON.parse(JSON.stringify(row)));
  assert.equal(normalized.classificationScope, "transaction");
  const samples = context.buildSmartSuggestionModel([row, expense("mart", 9000, 3, { merchant: "동네 마트" })]);
  assert.equal(samples.some((sample) => sample.merchant === "쿠팡"), false);
  assert.equal(samples.some((sample) => sample.merchant === "동네 마트"), true);
});

test("지난달과 미래 월은 남은 하루 예산을 계산하지 않고 가정임을 표시한다", () => {
  const context = loadContext();
  const past = model(context, [], "2026-08", {}, "2026-09-02");
  const future = model(context, [], "2026-10", {}, "2026-09-02");
  assert.equal(past.dailyAfterDining, null);
  assert.equal(future.dailyAfterDining, null);
  assert.match(context.renderSummaryFoodBudget(past), /지난달 기록/);
  assert.match(context.renderSummaryFoodBudget(future), /예정 월/);
});

test("예산 초과를 음수 잔액으로 표시하고 하루 사용 가능액은 음수가 되지 않는다", () => {
  const context = loadContext();
  const result = model(context, [expense("over", 300000)]);
  assert.equal(result.remaining, -50000);
  assert.equal(result.afterDining, -70000);
  assert.equal(result.dailyAfterDining, 0);
  assert.match(context.renderSummaryFoodBudget(result), /70,000원 초과/);
});

test("기존 백업에 식비 목표가 없어도 기본값을 적용하고 잘못된 설정을 제한한다", () => {
  const context = loadContext();
  for (const value of [undefined, null, {}, { monthlyTarget: "", diningCost: null }]) {
    const settings = context.normalizeFoodBudgetSettings(value);
    assert.equal(settings.monthlyTarget, 250000);
    assert.equal(settings.diningCost, 20000);
  }
  const clamped = context.normalizeFoodBudgetSettings({ monthlyTarget: Infinity, diningCost: -100 });
  assert.equal(clamped.monthlyTarget, 250000);
  assert.equal(clamped.diningCost, 0);
});

test("선택 월을 변경하면 날짜와 주문 선택을 초기화하고 긴 거래 문구는 이스케이프한다", () => {
  const context = loadContext();
  const result = model(context, [expense("html", 10000, 17, { merchant: '<script>alert("x")</script>', memo: "<img src=x>" })]);
  context.syncSummaryFoodSelection(result);
  context.summaryFoodSelection.date = "2026-08-17";
  const html = context.renderSummaryFoodInspector(result);
  assert.doesNotMatch(html, /<script>|<img src=x>/);
  assert.match(html, /&lt;script&gt;/);
  context.summaryFoodSelectedOrders.add("html");
  context.syncSummaryFoodSelection(model(context, [], "2026-09", {}, "2026-09-02"));
  assert.equal(context.summaryFoodSelection.date, "2026-09-02");
  assert.equal(context.summaryFoodSelectedOrders.size, 0);
});

test("분류 저장 실패 시 메모리 값을 되돌리고 성공 안내나 재분류를 실행하지 않는다", async () => {
  const context = loadContext();
  const rows = [expense("one", 30000, 3, { merchant: "쿠팡" })];
  context.transactions = rows;
  context.summaryFoodSelectedOrders.add("one");
  context.els = { summaryPatternPanel: { querySelectorAll: () => [], querySelector: () => null } };
  context.createAutoSnapshot = async () => {};
  context.saveTransactions = async () => false;
  context.renderSummary = () => {};
  context.reclassify = () => assert.fail("must not reclassify after a failed save");
  await context.saveSummaryFoodClassification({ preventDefault() {} }, model(context, rows));
  assert.strictEqual(context.transactions, rows);
  assert.equal(context.summaryFoodSaving, false);
  assert.equal(context.summaryFoodFeedback.type, "error");
});

test("식비 목표 저장 실패 시 이전 목표를 보존하고 다시 저장할 수 있다", async () => {
  const context = loadContext();
  const previous = context.appSettings.foodBudget;
  const submit = { disabled: false };
  const status = { textContent: "" };
  const fields = {
    '[data-food-budget="monthlyTarget"]': { value: "300000" },
    '[data-food-budget="diningCost"]': { value: "25000" },
    "[data-food-budget-submit]": submit
  };
  context.els = { summaryPatternPanel: { querySelector: () => status } };
  context.saveSettings = async () => { throw new Error("storage unavailable"); };
  context.renderSummary = () => assert.fail("must not show an unsaved budget");
  await context.saveSummaryFoodBudget({
    preventDefault() {},
    currentTarget: { checkValidity: () => true, querySelector: (selector) => fields[selector] }
  });
  assert.strictEqual(context.appSettings.foodBudget, previous);
  assert.equal(submit.disabled, false);
  assert.match(status.textContent, /저장하지 못했습니다/);
});

test("식비 목표 저장 중 다른 섹터로 이동해도 저장한 목표를 되돌리지 않는다", async () => {
  const context = loadContext();
  const fields = {
    '[data-food-budget="monthlyTarget"]': { value: "300000" },
    '[data-food-budget="diningCost"]': { value: "25000" },
    "[data-food-budget-submit]": { disabled: false }
  };
  context.els = { summaryPatternPanel: { querySelector: () => null } };
  context.saveSettings = async () => {};
  let renderCount = 0;
  context.renderSummary = () => { renderCount++; };
  await context.saveSummaryFoodBudget({
    preventDefault() {},
    currentTarget: { checkValidity: () => true, querySelector: (selector) => fields[selector] }
  });
  assert.equal(context.appSettings.foodBudget.monthlyTarget, 300000);
  assert.equal(context.appSettings.foodBudget.diningCost, 25000);
  assert.equal(renderCount, 1);
});

test("지출 상황은 정해진 네 가지 단일 태그만 저장하며 기존 백업도 열 수 있다", () => {
  const context = loadContext();
  for (const tag of ["family", "date", "celebration", "treat"]) {
    const saved = context.normalizeStoredTransaction(expense("tag", 25000, 17, { foodOccasion: tag }));
    assert.equal(saved.foodOccasion, tag);
    assert.equal(context.normalizeStoredTransaction(JSON.parse(JSON.stringify(saved))).foodOccasion, tag);
    const reimported = context.mergeTransactions([saved], [expense("tag", 25000, 17)]);
    assert.equal(reimported.skipped, 1);
    assert.equal(reimported.records[0].foodOccasion, tag);
  }
  for (const tag of [undefined, null, "", "unknown", "__proto__", ["family", "treat"], { key: "family" }]) {
    assert.equal(context.normalizeFoodOccasion(tag), "");
    assert.equal(context.normalizeStoredTransaction(expense("old", 25000, 17, { foodOccasion: tag })).foodOccasion, "");
  }
});

test("상황별 식비는 정산 후 내 부담액이며 원래 월·주·일 합계에 중복으로 더하지 않는다", () => {
  const context = loadContext();
  const rows = [
    expense("family", 40000, 17, { foodOccasion: "family" }),
    expense("date", 20000, 17, { foodOccasion: "date" }),
    expense("celebration", 10000, 17, { foodOccasion: "celebration" }),
    expense("treat", 15000, 17, { foodOccasion: "treat" }),
    expense("normal", 25000)
  ];
  context.reimbursements.family = 10000;
  const result = model(context, rows);
  const untagged = model(context, rows.map(({ foodOccasion, ...row }) => row));
  assert.equal(result.totals.amount, 100000);
  assert.equal(result.totals.amount, untagged.totals.amount);
  assert.equal(result.totals.occasionAmount, 75000);
  assert.equal(result.totals.untaggedAmount, 25000);
  assert.equal(result.totals.occasionShare, 75);
  assert.equal(result.totals.occasions.family.amount, 30000);
  assert.equal(result.totals.occasions.treat.count, 1);
  assert.equal(result.days[16].amount, untagged.days[16].amount);
  assert.equal(result.days[16].occasionAmount, 75000);
  assert.equal(result.weeks[3].occasionAmount, 75000);
  assert.equal(result.remaining, untagged.remaining);
  assert.equal(result.afterDining, untagged.afterDining);
});

test("상황 합계는 식비 지출만 포함하고 수입·취소·분석 범위 밖 거래를 제외한다", () => {
  const context = loadContext();
  const rows = [
    expense("food", 12000, 10, { foodOccasion: "date" }),
    expense("gift", 80000, 10, { sector: "기타 소비", subcategory: "경조사·선물", foodOccasion: "celebration" }),
    expense("income", 50000, 10, { flow: "income", foodOccasion: "family" }),
    expense("canceled", 30000, 10, { cancel: "취소", foodOccasion: "treat" }),
    expense("future", 60000, 25, { foodOccasion: "family" })
  ];
  const result = model(context, rows, "2026-08", { cutoffDay: 20 });
  assert.equal(result.totals.amount, 12000);
  assert.equal(result.totals.occasionAmount, 12000);
  assert.equal(context.foodOccasionBadge(rows[1]), "");
  assert.equal(context.foodOccasionBadge(rows[2]), "");
  assert.match(context.foodOccasionBadge(rows[0]), /지출 상황: 데이트/);
});

test("상황 태그가 없거나 전액 정산된 식비의 비중은 0%로 표시한다", () => {
  const context = loadContext();
  const empty = model(context, []);
  assert.equal(empty.totals.occasionShare, 0);
  assert.equal(empty.totals.occasionAmount, 0);
  assert.match(context.renderSummaryFoodOccasions(empty), /상황별 식비/);
  assert.doesNotMatch(context.renderSummaryFoodOccasions(empty), /NaN|Infinity/);
  context.reimbursements.refunded = 20000;
  const refunded = model(context, [expense("refunded", 20000, 17, { foodOccasion: "treat" })]);
  assert.equal(refunded.totals.occasionAmount, 0);
  assert.equal(refunded.totals.occasionShare, 0);
  assert.equal(refunded.totals.occasions.treat.count, 1);
});

test("식비 할부의 상황 태그는 월 배분액으로 집계하고 다음 회차를 새 결제로 세지 않는다", () => {
  const context = loadContext();
  const source = expense("dining-installment", 90000, 3, {
    foodOccasion: "family", month: "2026-07", approvalDate: "2026-07-03",
    installmentEnabled: true, installmentMonths: 3, installmentStartMonth: "2026-07"
  });
  context.reimbursements["dining-installment"] = 30000;
  const result = model(context, context.reportingExpenseRows([source], { months: ["2026-08"] }));
  assert.equal(result.totals.occasions.family.amount, 20000);
  assert.equal(result.totals.occasions.family.count, 0);
  assert.equal(result.totals.occasions.family.installmentCount, 1);
  assert.equal(result.totals.occasionShare, 100);
  assert.match(context.renderSummaryFoodOccasions(result), /할부 배분 1건/);
});

test("소비 달력에서 상황 태그를 저장·변경·해제해도 결제·정산·분류 규칙은 변하지 않는다", async () => {
  const context = loadContext();
  context.transactions = [expense("tag-edit", 26400, 17, { manualSector: "식비", manualSubcategory: "외식-친구" })];
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/data/constants.js"), "utf8"), context);
  context.reimbursements["tag-edit"] = 13200;
  context.createAutoSnapshot = async () => {};
  context.safeSaveMany = async (entries) => {
    assert.deepEqual(Array.from(entries, (entry) => entry.key), [
      "monthly-card-budget-records-v1", "monthly-card-budget-reimbursements-v1"
    ], "상황 태그는 거래·정산금만 저장하며 가맹점 규칙을 저장하지 않는다");
    return true;
  };
  context.setSharedSelectedMonth = () => {};
  context.reclassify = () => {};
  const values = {
    date: "2026-08-17", time: "12:30", merchant: "테스트 식당", amount: "26400",
    reimbursement: "13200", memo: "", sector: "식비", subcategory: "외식-친구", foodOccasion: "treat"
  };
  const form = { elements: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])) };
  form.elements.saveRule = { checked: false };
  for (const tag of ["treat", "family", ""]) {
    form.elements.foodOccasion.value = tag;
    await context.saveCalendarTransactionEdit("tag-edit", form);
    const saved = context.transactions[0];
    assert.equal(saved.foodOccasion, tag);
    assert.equal(saved.amount, 26400);
    assert.equal(context.reimbursements["tag-edit"], 13200);
    assert.equal(saved.manualSector, "식비");
    assert.equal(saved.manualSubcategory, "외식-친구");
    assert.equal(saved.recordKey, "tag-edit");
    assert.equal(saved.transactionId, "tag-edit");
    assert.equal(context.rules.length, 0);
    assert.ok(saved.updatedAt);
  }
  form.elements.sector.value = "생활용품";
  form.elements.subcategory.value = "소모품";
  form.elements.foodOccasion.value = "treat";
  await context.saveCalendarTransactionEdit("tag-edit", form);
  assert.equal(context.transactions[0].foodOccasion, "");
});

test("상황 합계와 배지는 3번 화면에 표시하며 주간 식비 표 아래에 배치한다", () => {
  const context = loadContext();
  const result = model(context, [expense("occasion-view", 26400, 17, { foodOccasion: "treat" })]);
  context.syncSummaryFoodSelection(result);
  context.summaryFoodSelection.date = "2026-08-17";
  assert.match(context.renderSummaryFoodInspector(result), /지출 상황: 내가 한턱/);
  assert.match(context.renderSummaryFoodInspector(result), /선택 기간의 상황 태그 식비/);
  assert.match(context.renderSummaryFoodBudget(result), /이 중 상황 태그 식비/);
  const html = context.renderSummaryFood(result);
  assert.ok(html.indexOf('id="summaryFoodWeeklyTitle"') < html.indexOf('id="summaryFoodOccasionsTitle"'));
  assert.match(html, /식비 합계에 이미 포함된 금액/);
});
