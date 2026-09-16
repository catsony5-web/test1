const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../src/features/budget/spending-budget-core.js");

function build(overrides = {}) {
  return core.build({
    month: "2026-09", today: "2026-09-16", settings: { monthlyLimit: 300000 },
    rows: [], pending: [], income: null, ...overrides
  });
}

function row(key, date, amount, extra = {}) {
  return { key, date, amount, sector: "식비", group: "외식", ...extra };
}

test("pure core is available as CommonJS and a classic browser global", () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/features/budget/spending-budget-core.js"), "utf8"), context);
  assert.equal(typeof context.SpendingBudgetCore.build, "function");
  assert.equal(typeof context.SpendingBudgetCore.normalizeSettings, "function");
  assert.equal(core.MAX_PLANS, 500);
  assert.equal(context.SpendingBudgetCore.MAX_PLANS, core.MAX_PLANS);
  assert.equal(context.SpendingBudgetCore.build({ month: "2026-09", today: "2026-09-16" }).remaining, null);
});

test("settings normalize amounts, valid dates, text, duplicate IDs and bounded plan counts", () => {
  const result = core.normalizeSettings({
    monthlyLimit: "1,500,000", savingsTarget: -1,
    plans: [
      { id: "a", label: "  여행\n숙소  ", month: "2026-09", date: "2026-09-21", amount: "150,000", recordKey: " x " },
      { id: "a", month: "2026-09", amount: 999 },
      { id: "bad-date", month: "2026-02", date: "2026-02-29", amount: 100 },
      { id: "derive", date: "2024-02-29", amount: 200 },
      { id: "conflict", month: "2026-10", date: "2026-09-21", amount: 300 },
      { id: "bad", month: "2026-13", amount: 100 },
      { id: "negative", month: "2026-09", amount: -100 },
      null
    ]
  });
  assert.equal(result.monthlyLimit, 1500000);
  assert.equal(result.savingsTarget, 0);
  assert.equal(result.plans.length, 4);
  assert.deepEqual(result.plans[0], { id: "a", label: "여행 숙소", month: "2026-09", date: "2026-09-21", amount: 150000, recordKey: "x" });
  assert.equal(result.plans[1].date, "");
  assert.equal(result.plans[2].month, "2024-02");
  assert.equal(result.plans[3].date, "");
  assert.deepEqual(core.normalizeSettings(null), { monthlyLimit: 0, savingsTarget: 0, plans: [] });
  assert.equal(core.normalizeSettings({ monthlyLimit: Infinity }).monthlyLimit, 0);
  assert.equal(core.normalizeSettings({ monthlyLimit: 1e20 }).monthlyLimit, 1e12);
  assert.equal(core.normalizeSettings({ plans: Array.from({ length: 550 }, (_, i) => ({ id: String(i), month: "2026-09", amount: 1 })) }).plans.length, 500);
});

test("monthly consumption combines refunds, all sectors, known reservations and future records exactly once", () => {
  const result = build({
    rows: [row("food", "2026-09-15", 50000), row("refund", "2026-09-16", -10000),
      row("fixed", "2026-09-05", 90000, { sector: "주거", group: "월세" }), row("future", "2026-09-20", 20000)],
    pending: [row("utility", "2026-09-25", 30000, { sector: "주거", group: "공과금" })],
    settings: { monthlyLimit: 300000, plans: [{ id: "trip", month: "2026-09", date: "2026-09-22", amount: 40000 }] }
  });
  assert.equal(result.actual, 130000);
  assert.equal(result.futureRecorded, 20000);
  assert.equal(result.monthTotal, 150000);
  assert.equal(result.pendingAmount, 30000);
  assert.equal(result.planAmount, 40000);
  assert.equal(result.committed, 220000);
  assert.equal(result.remaining, 80000);
  assert.equal(result.groups.reduce((total, group) => total + group.amount, 0), 180000);
  assert.equal(result.sectors.find((sector) => sector.label === "식비").amount, 60000);
  assert.equal(result.currentWeek.amount, 40000);
  assert.equal(result.currentWeek.futureRecorded, 20000);
  assert.equal(result.currentWeek.remaining, 10000);
});

test("Monday-Sunday weeks clip at month boundaries and cumulative targets add to the exact cap", () => {
  const september = build({ today: "2026-09-01", settings: { monthlyLimit: 100 } });
  assert.equal(september.currentWeek.start, "2026-09-01");
  assert.equal(september.currentWeek.end, "2026-09-06");
  assert.equal(september.currentWeek.target, 20);
  assert.equal(september.weeks.at(-1).start, "2026-09-28");
  assert.equal(september.weeks.at(-1).end, "2026-09-30");
  assert.equal(september.weeks.reduce((total, week) => total + week.target, 0), 100);
  const sundayStart = build({ month: "2026-02", today: "2026-02-01", settings: { monthlyLimit: 101 } });
  assert.equal(sundayStart.currentWeek.days, 1);
  assert.equal(sundayStart.currentWeek.end, "2026-02-01");
  assert.equal(sundayStart.weeks[1].start, "2026-02-02");
  assert.equal(sundayStart.weeks.reduce((total, week) => total + week.target, 0), 101);
});

test("leap-year month end is valid and remaining days include today", () => {
  const result = build({ month: "2024-02", today: "2024-02-29", rows: [row("leap", "2024-02-29", 1000)] });
  assert.equal(result.dayCount, 29);
  assert.equal(result.daysRemaining, 1);
  assert.equal(result.currentWeek.start, "2024-02-26");
  assert.equal(result.currentWeek.end, "2024-02-29");
  assert.equal(result.currentWeek.amount, 1000);
  assert.equal(result.dailyAllowance, 299000);
  assert.equal(core.build({ month: "2026-02", today: "2026-02-29" }), null);
  assert.equal(core.build({ month: "2026-13", today: "2026-09-16" }), null);
  assert.equal(core.build(null), null);
});

test("past and future selected months do not claim a current week", () => {
  const past = build({ month: "2026-08", rows: [row("past", "2026-08-31", 15000)] });
  assert.equal(past.period, "past");
  assert.equal(past.currentWeek, null);
  assert.equal(past.actual, 15000);
  assert.equal(past.daysRemaining, 0);
  assert.equal(past.dailyAllowance, null);
  const future = build({ month: "2026-10", rows: [row("future", "2026-10-01", 15000), row("undated", "", 5000)] });
  assert.equal(future.period, "future");
  assert.equal(future.currentWeek, null);
  assert.equal(future.actual, 0);
  assert.equal(future.futureRecorded, 20000);
  assert.equal(future.remaining, 280000);
  assert.equal(future.daysRemaining, 31);
  assert.equal(future.weeks[0].amount, 0);
  assert.equal(future.weeks[0].futureRecorded, 15000);
});

test("same-key actual and pending entries cannot be double counted; keyless rows remain distinct", () => {
  const result = build({
    rows: [row("a", "2026-09-16", 10000), row("a", "2026-09-16", 10000), row("", "2026-09-16", 10), row("", "2026-09-16", 20)],
    pending: [row("a", "2026-09-16", 10000), row("b", "2026-09-18", 30000), row("b", "2026-09-18", 30000)]
  });
  assert.equal(result.actual, 10030);
  assert.equal(result.pendingAmount, 30000);
  assert.equal(result.committed, 40030);
});

test("linked plans stop reserving only when their real row exists; missing links stay reserved and warn", () => {
  const result = build({
    rows: [row("posted", "2026-09-15", 9000), row("future", "2026-09-20", 5000)],
    settings: { monthlyLimit: 300000, plans: [
      { id: "linked", month: "2026-09", amount: 10000, recordKey: "posted" },
      { id: "future-link", month: "2026-09", amount: 10000, recordKey: "future" },
      { id: "missing", month: "2026-09", date: "2026-09-17", amount: 20000, recordKey: "deleted" },
      { id: "unlinked", month: "2026-09", amount: 30000 },
      { id: "another-month", month: "2026-10", amount: 40000 }
    ] }
  });
  assert.equal(result.planAmount, 50000);
  assert.equal(result.plans.length, 4);
  assert.equal(result.plans[0].reserved, false);
  assert.equal(result.plans[1].linked, true);
  assert.equal(result.plans[2].missingLink, true);
  assert.equal(result.currentWeek.planAmount, 20000);
  assert.ok(result.warnings.some((warning) => warning.includes("연결된 실제 내역")));
});

test("multiple plans linked to one real transaction warn once without charging the payment twice", () => {
  const result = build({
    rows: [row("paid", "2026-09-15", 50000)],
    settings: { monthlyLimit: 300000, plans: [
      { id: "a", month: "2026-09", amount: 30000, recordKey: "paid" },
      { id: "b", month: "2026-09", amount: 40000, recordKey: "paid" },
      { id: "c", month: "2026-09", amount: 10000, recordKey: "paid" }
    ] }
  });
  assert.equal(result.actual, 50000);
  assert.equal(result.planAmount, 0);
  assert.equal(result.remaining, 250000);
  assert.ok(result.plans.every((plan) => plan.linked && !plan.reserved));
  assert.deepEqual(result.warnings, ["한 실제 거래로 여러 예약을 완료 처리했습니다. 합산 결제가 맞는지 확인하세요."]);
});

test("duplicate missing links and links in another month do not produce a false completed-plan warning", () => {
  const result = build({
    rows: [row("paid", "2026-09-15", 50000)],
    settings: { monthlyLimit: 300000, plans: [
      { id: "paid", month: "2026-09", amount: 30000, recordKey: "paid" },
      { id: "next-month", month: "2026-10", amount: 40000, recordKey: "paid" },
      { id: "missing-a", month: "2026-09", amount: 10000, recordKey: "missing" },
      { id: "missing-b", month: "2026-09", amount: 20000, recordKey: "missing" }
    ] }
  });
  assert.equal(result.planAmount, 30000);
  assert.equal(result.remaining, 220000);
  assert.equal(result.warnings.some((warning) => warning.includes("여러 예약을 완료")), false);
  assert.ok(result.warnings.some((warning) => warning.includes("찾지 못한 예정 소비 2건")));
});

test("undated or invalid-date costs remain in monthly totals, not a fabricated week", () => {
  const result = build({
    rows: [row("no-date", "", 10000), row("invalid", "2026-09-31", 20000), row("other-month", "2026-08-16", 90000)],
    pending: [row("pending", "", 30000)]
  });
  assert.equal(result.actual, 30000);
  assert.equal(result.pendingAmount, 30000);
  assert.equal(result.currentWeek.amount, 0);
  assert.equal(result.weeks.reduce((total, week) => total + week.committed, 0), 0);
  assert.equal(result.remaining, 240000);
  assert.ok(result.warnings.some((warning) => warning.includes("기록 2건")));
});

test("income reference uses larger savings commitment, separate principal, and signed family adjustment", () => {
  const result = build({ settings: { monthlyLimit: 300000, savingsTarget: 30000 }, income: 100000, actualSavings: 40000, debtPrincipal: 20000, familyAdjustment: -5000 });
  assert.equal(result.incomeSupport, 35000);
  assert.equal(result.cap, 300000);
  assert.equal(build({ income: 100000, settings: { savingsTarget: 50000 }, actualSavings: 10000, debtPrincipal: 20000, familyAdjustment: 5000 }).incomeSupport, 35000);
  assert.equal(build({ income: null }).incomeSupport, null);
  assert.equal(build({ income: undefined }).incomeSupport, null);
  assert.equal(build({ income: "unknown" }).incomeSupport, null);
  assert.equal(build({ income: "  " }).incomeSupport, null);
  assert.equal(build({ income: 0, debtPrincipal: 10000 }).incomeSupport, -10000);
});

test("additional purchase scenario shows both budgets and does not extrapolate an exceptional expense", () => {
  const result = build({
    rows: [row("food", "2026-09-01", 20000), row("trip", "2026-09-02", 200000, { sector: "여행", group: "숙소" })],
    pending: [row("food-pending", "2026-09-30", 10000)], foodTarget: 50000, scenarioAmount: 15000
  });
  assert.equal(result.actual, 220000);
  assert.equal(result.remaining, 70000);
  assert.equal(result.daysRemaining, 15);
  assert.equal(result.dailyAllowance, 4666);
  assert.equal(result.foodCommitted, 30000);
  assert.deepEqual(result.scenario, { amount: 15000, budgetAfter: 55000, foodAfter: 5000 });
  assert.equal(Object.hasOwn(result, "forecast"), false);
  assert.equal(build({ rows: [row("over", "2026-09-16", 310000)] }).dailyAllowance, 0);
});

test("unset limits remain unknown rather than displaying fabricated zero budgets", () => {
  const result = build({ settings: { monthlyLimit: 0 }, rows: [row("one", "2026-09-15", 10000)], scenarioAmount: 5000 });
  assert.equal(result.hasLimit, false);
  assert.equal(result.actual, 10000);
  assert.equal(result.remaining, null);
  assert.equal(result.dailyAllowance, null);
  assert.equal(result.currentWeek.target, null);
  assert.equal(result.currentWeek.remaining, null);
  assert.equal(result.scenario.budgetAfter, null);
  assert.equal(result.scenario.foodAfter, null);
});

test("supplied food groups are used without merchant inference, nonfood Coupang stays nonfood", () => {
  const result = build({ rows: [
    row("grocery", "2026-09-15", 10000, { group: "쿠팡 장보기" }),
    row("household", "2026-09-15", 20000, { sector: "생활용품", group: "생활용품", merchant: "쿠팡" })
  ], foodTarget: 100000 });
  assert.equal(result.foodCommitted, 10000);
  assert.equal(result.groups.find((group) => group.label === "쿠팡 장보기").weekAmount, 10000);
  assert.equal(result.scenario.foodAfter, 90000);
});

test("normalization and builds never mutate input rows, plans or settings", () => {
  const source = {
    month: "2026-09", today: "2026-09-16", rows: [row("food", "2026-09-15", 1000)],
    pending: [row("pending", "2026-09-17", 2000)], settings: { monthlyLimit: 300000, plans: [{ id: "a", month: "2026-09", amount: 3000 }] }
  };
  const before = structuredClone(source);
  const result = core.build(source);
  assert.deepEqual(source, before);
  result.plans[0].amount = 999;
  assert.deepEqual(source, before);
  assert.equal(core.build(source).planAmount, 3000);
});

test("a future record becomes actual on its date without changing monthly availability", () => {
  const source = {
    rows: [row("future", "2026-09-20", 45000)],
    pending: [row("future", "2026-09-20", 45000)],
    settings: { monthlyLimit: 300000, plans: [{ id: "linked", month: "2026-09", date: "2026-09-20", amount: 50000, recordKey: "future" }] }
  };
  const before = build({ ...source, today: "2026-09-19" });
  const after = build({ ...source, today: "2026-09-20" });
  assert.equal(before.actual, 0);
  assert.equal(before.futureRecorded, 45000);
  assert.equal(after.actual, 45000);
  assert.equal(after.futureRecorded, 0);
  assert.equal(before.pendingAmount, 0);
  assert.equal(after.planAmount, 0);
  assert.equal(before.remaining, 255000);
  assert.equal(after.remaining, before.remaining);
  assert.equal(after.currentWeek.remaining, before.currentWeek.remaining);
});

test("weekly allocation conserves every day and won across all calendar alignments", () => {
  for (let year = 2024; year <= 2030; year++) {
    for (let monthNumber = 1; monthNumber <= 12; monthNumber++) {
      const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const result = build({ month, today: `${month}-01`, settings: { monthlyLimit: 1000003 } });
      assert.equal(result.weeks.reduce((total, week) => total + week.days, 0), result.dayCount);
      assert.equal(result.weeks.reduce((total, week) => total + week.target, 0), 1000003);
      assert.equal(result.weeks[0].start, `${month}-01`);
      assert.equal(result.weeks.at(-1).end, `${month}-${result.dayCount}`);
      for (const week of result.weeks.slice(1)) assert.equal(new Date(`${week.start}T00:00:00Z`).getUTCDay(), 1);
      for (const week of result.weeks.slice(0, -1)) assert.equal(new Date(`${week.end}T00:00:00Z`).getUTCDay(), 0);
    }
  }
});
