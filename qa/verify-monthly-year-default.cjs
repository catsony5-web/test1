const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/features/monthly/monthly-flow.js"), "utf8");

function createSelect() {
  return {
    options: [],
    value: "",
    set innerHTML(markup) {
      this.options = [...markup.matchAll(/<option value="([^"]+)"/g)]
        .map((match) => ({ value: match[1] }));
    }
  };
}

function createHarness(currentMonth) {
  const monthlyYearFilter = createSelect();
  const context = vm.createContext({
    console,
    els: {
      monthlyYearFilter,
      monthlyStartYear: null,
      monthlyEndYear: null,
      monthlyPrevYear: { disabled: false },
      monthlyNextYear: { disabled: false }
    },
    currentMonthKey: () => currentMonth,
    escapeHtml: (value) => String(value),
    unique: (values) => [...new Set(values)]
  });
  vm.runInContext(source, context, { filename: "src/features/monthly/monthly-flow.js" });
  return { context, monthlyYearFilter };
}

const rowsWithCurrentYear = [
  { month: "2025-12" },
  { month: "2026-08" },
  { month: "2033-02" }
];
const currentYearHarness = createHarness("2026-08");
currentYearHarness.context.updateMonthlyYearOptions(rowsWithCurrentYear);
assert.equal(
  currentYearHarness.monthlyYearFilter.value,
  "year:2026",
  "the first monthly view should prefer the real-time current year over a future recurring end year"
);

currentYearHarness.monthlyYearFilter.value = "year:2033";
currentYearHarness.context.updateMonthlyYearOptions(rowsWithCurrentYear);
assert.equal(
  currentYearHarness.monthlyYearFilter.value,
  "year:2033",
  "a future year selected manually must remain selected on subsequent renders"
);

const fallbackHarness = createHarness("2026-08");
fallbackHarness.context.updateMonthlyYearOptions([{ month: "2024-01" }, { month: "2025-12" }]);
assert.equal(
  fallbackHarness.monthlyYearFilter.value,
  "year:2025",
  "when the current year is unavailable, the latest available year remains the fallback"
);

console.log("Monthly year default verification passed.");
