const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function shiftMonthKey(month, offset) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function loadComparisonContext() {
  const context = vm.createContext({
    Date,
    shiftMonthKey,
    currentMonthKey: () => "2099-01",
    normalizeInputDate: (value) => String(value || ""),
    sumConsumption: (rows) => rows.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    groupBy: (rows, keyGetter) => {
      const grouped = new Map();
      rows.forEach((row) => {
        const key = keyGetter(row);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
      });
      return grouped;
    }
  });
  const source = fs.readFileSync(
    path.join(__dirname, "../src/features/summary/comparison-analysis.js"),
    "utf8"
  );
  vm.runInContext(source, context);
  return context;
}

function expense(month, amount, sector = "식비") {
  return {
    month,
    amount,
    sector,
    date: `${month}-10`,
    subcategory: "외식",
    merchant: "테스트"
  };
}

test("summary comparison defaults to the exact previous calendar month", () => {
  const context = loadComparisonContext();
  const model = context.buildSummaryComparison(
    [expense("2026-06", 70000), expense("2026-08", 100000)],
    "2026-08",
    "식비"
  );

  assert.equal(model.mode, "previous");
  assert.equal(model.comparisonMonth, "2026-07");
  assert.equal(model.comparisonLabel, "전월");
  assert.equal(model.comparisonExists, false);
  assert.equal(model.totalChange.comparisonAmount, 0);
});

test("previous and year-over-year modes use fixed calendar offsets", () => {
  const context = loadComparisonContext();
  const rows = [
    expense("2025-08", 80000),
    expense("2026-07", 90000),
    expense("2026-08", 100000)
  ];
  const previous = context.buildSummaryComparison(rows, "2026-08", "식비", {
    mode: "previous",
    comparisonMonth: "2025-08"
  });
  const yearOverYear = context.buildSummaryComparison(rows, "2026-08", "식비", {
    mode: "year-over-year",
    comparisonMonth: "2026-07"
  });

  assert.equal(previous.comparisonMonth, "2026-07");
  assert.equal(previous.totalChange.comparisonAmount, 90000);
  assert.equal(yearOverYear.comparisonMonth, "2025-08");
  assert.equal(yearOverYear.comparisonLabel, "전년 동월");
  assert.equal(yearOverYear.totalChange.comparisonAmount, 80000);
});

test("custom comparison stays fixed even when the analysis month reaches it", () => {
  const context = loadComparisonContext();

  assert.equal(
    context.resolveSummaryComparisonMonth("2026-08", "custom", "2026-03"),
    "2026-03"
  );
  assert.equal(
    context.resolveSummaryComparisonMonth("2026-03", "custom", "2026-03"),
    "2026-03"
  );

  const collision = context.buildSummaryComparison(
    [expense("2026-02", 40000), expense("2026-03", 50000)],
    "2026-03",
    "식비",
    { mode: "custom", comparisonMonth: "2026-03" }
  );
  assert.equal(collision.comparisonMonth, "2026-03");
  assert.equal(collision.comparisonLabel, "비교월");
  assert.equal(collision.totalChange.comparisonAmount, 50000);
  assert.equal(collision.totalChange.delta, 0);
});
