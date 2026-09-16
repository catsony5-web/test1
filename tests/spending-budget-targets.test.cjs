const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../src/features/budget/spending-budget-core.js");

const profile = (extra = {}) => ({
  ageGroup: "under40", living: "alone", incomeStability: "stable", netIncome: 2500000,
  housingCost: 500000, otherFixed: 150000, ownPrincipal: 100000, savingsGoal: 500000, reserve: 100000, ...extra
});
const model = (extra = {}) => core.build({ month: "2026-09", today: "2026-09-16", ...extra });

test("missing and blank profile amounts stay unknown; explicit zero is a valid input", () => {
  for (const netIncome of [undefined, null, "", "  ", " , ", "bad", -1, Infinity]) {
    const result = core.recommend(profile({ netIncome }));
    assert.equal(result.ready, false);
    assert.ok(result.missing.includes("netIncome"));
  }
  const zero = core.recommend(profile({ netIncome: 0 }));
  assert.equal(zero.ready, true);
  assert.equal(zero.canApply, false);
  assert.ok(zero.deficit > 0);
  assert.equal(core.recommend(profile({ living: "" })).ready, false);
});

test("recommendation includes fixed consumption once and reserves savings, principal and buffer separately", () => {
  const result = core.recommend(profile());
  assert.equal(result.capacity, 1800000);
  assert.equal(result.fixed, 650000);
  assert.equal(result.monthlyLimit, 1800000);
  assert.equal(result.canApply, true);
  assert.equal(result.foodTarget, null, "household food/lodging is not invented as a personal food goal");
  assert.equal(result.savingsTarget, 500000);
  const single = core.recommend(profile({ netIncome: 4000000 }));
  assert.equal(single.monthlyLimit, Math.round(1689000 * .816 + 500000));
  assert.equal(single.basis, "single-household");
});

test("unaffordable fixed costs produce an explicit deficit and disable applying a recommendation", () => {
  const result = core.recommend(profile({ netIncome: 1000000 }));
  assert.equal(result.capacity, 300000);
  assert.equal(result.deficit, 350000);
  assert.equal(result.canApply, false);
  assert.ok(result.monthlyLimit <= result.capacity);
});

test("age group provides labeled household context without arbitrary percentage changes", () => {
  const young = core.recommend(profile());
  const older = core.recommend(profile({ ageGroup: "over60" }));
  assert.equal(young.monthlyLimit, older.monthlyLimit);
  assert.equal(young.ageAverage, 2824000);
  assert.equal(older.ageAverage, 2212000);
  assert.equal(core.recommend(profile({ ageGroup: "undisclosed" })).ageAverage, null);
  for (const living of ["family", "shared"]) {
    const result = core.recommend(profile({ living }));
    assert.equal(result.singleAverage, null);
    assert.equal(result.basis, "income");
    assert.equal(result.monthlyLimit, result.capacity);
  }
});

test("personal median requires three complete months and explicit confirmation", () => {
  const history = [{ total: 1200000, food: 300000 }, { total: 1400000, food: 400000 }, { total: 3900000, food: 700000 }];
  assert.equal(core.recommend(profile(), history).basis, "single-household");
  assert.equal(core.recommend(profile({ historyConfirmed: true }), history.slice(1)).basis, "single-household");
  const result = core.recommend(profile({ historyConfirmed: true }), history);
  assert.equal(result.basis, "history");
  assert.equal(result.monthlyLimit, 1400000);
  assert.equal(result.foodTarget, 400000);
  assert.equal(core.recommend(profile({ historyConfirmed: true, otherFixed: 800000 }), history).foodTarget, 100000);
});

test("month targets preserve older months and do not track changing income or profile values", () => {
  const settings = core.normalizeSettings({ monthlyLimit: 1500000, savingsTarget: 500000,
    profile: profile(), monthlyTargets: {
      "2026-08": { monthlyLimit: 1200000, foodTarget: 300000, savingsTarget: 500000 },
      "2026-09": { monthlyLimit: 1000000, foodTarget: 250000, savingsTarget: 400000, source: "recommendation" },
      "bad": { monthlyLimit: 9000000 }
    }
  });
  assert.equal(Object.keys(settings.monthlyTargets).length, 2);
  assert.equal(core.targetsForMonth(settings, "2026-08").monthlyLimit, 1200000);
  assert.equal(core.targetsForMonth(settings, "2026-09").monthlyLimit, 1000000);
  assert.equal(core.targetsForMonth(settings, "2026-10", 350000).foodTarget, 350000);
  assert.equal(model({ settings, income: 999999 }).cap, model({ settings, income: 9999999 }).cap);
  assert.equal(model({ settings, foodTarget: 900000 }).foodTarget, 250000);
  assert.equal(model({ settings, income: 2000000 }).incomeSupport, 1600000);
  assert.deepEqual(core.normalizeSettings(JSON.parse(JSON.stringify(settings))), settings);
});

test("food reservations reduce both budgets once and follow the actual classification after linking", () => {
  const settings = { monthlyLimit: 1000000, plans: [
    { id: "food", month: "2026-09", date: "2026-09-20", amount: 80000, sector: "식비" },
    { id: "legacy", month: "2026-09", amount: 90000 },
    { id: "other", month: "2026-09", amount: 60000, sector: "기타" }
  ] };
  const rows = [{ key: "meal", date: "2026-09-15", amount: 100000, sector: "식비", group: "외식" }];
  const before = model({ settings, rows, foodTarget: 300000, scenarioAmount: 50000 });
  assert.equal(before.remaining, 670000);
  assert.equal(before.foodRemaining, 120000);
  assert.equal(before.scenario.foodAfter, 70000);
  assert.equal(before.scenario.budgetAfter, 620000);
  settings.plans[0].recordKey = "meal";
  const linked = model({ settings, rows, foodTarget: 300000 });
  assert.equal(linked.remaining, 750000);
  assert.equal(linked.foodPending, 0);
  assert.equal(linked.foodRemaining, 200000);
  rows[0].sector = "생활용품";
  assert.equal(model({ settings, rows, foodTarget: 300000 }).foodRemaining, 300000);
  rows[0].sector = "식비";
  rows[0].amount = -10000;
  assert.equal(model({ settings, rows, foodTarget: 300000 }).foodRemaining, 310000);
});

test("budget content is located only in its own sixth summary tab, not the dashboard or pattern detail", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const html = read("index.html");
  assert.doesNotMatch(html, /id="boardSpendingBudget"/);
  assert.equal((html.match(/id="summarySpendingBudget"/g) || []).length, 1);
  assert.match(html, /id="summarySubtabBudget"[^>]*>[\s\S]*?<div id="summarySpendingBudget"/);
  assert.match(html, /<option value="budget">예산 점검/);
  assert.doesNotMatch(read("src/features/board/board-view.js"), /renderSpendingBudget\(/);
  assert.match(read("src/features/summary/summary-view.js"), /budget:\s*"budget"/);
});
