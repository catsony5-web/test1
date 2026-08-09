const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sourceFiles = [
  "src/features/summary/comparison-analysis.js",
  "src/features/summary/summary-priority.js",
  "src/features/summary/summary-pattern.js",
  "src/features/summary/sector-analysis.js",
  "src/features/summary/summary-period.js"
];

const context = vm.createContext({
  console,
  selectedSummaryPeriodCell: "",
  normalizeInputDate(value) {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  },
  groupBy(items, getKey) {
    const groups = new Map();
    items.forEach((item) => {
      const key = getKey(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return groups;
  },
  consumptionAmount(item) {
    return Number(item?.amount || 0);
  },
  sumConsumption(items) {
    return items.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  },
  shiftMonthKey(month, offset) {
    const [year, monthNumber] = String(month).split("-").map(Number);
    const serial = year * 12 + monthNumber - 1 + Number(offset || 0);
    const nextYear = Math.floor(serial / 12);
    const nextMonth = serial - nextYear * 12 + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  },
  currentMonthKey() {
    return "2099-01";
  },
  summaryDisplaySubcategory(item) {
    return item?.subcategory || "미분류";
  },
  formatWon(value) {
    return `${Number(value || 0).toLocaleString("ko-KR")}원`;
  },
  summaryComparisonMonthOffset(comparison) {
    const serial = (month) => {
      const [year, monthNumber] = String(month).split("-").map(Number);
      return year * 12 + monthNumber - 1;
    };
    return serial(comparison.comparisonMonth) - serial(comparison.selectedMonth);
  }
});

sourceFiles.forEach((relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
});

const get = (name) => vm.runInContext(name, context);
const buildSummaryComparison = get("buildSummaryComparison");
const buildSummaryPriorityModel = get("buildSummaryPriorityModel");
const buildSummaryPatternModel = get("buildSummaryPatternModel");
const buildMonthlyFeedbackModel = get("buildMonthlyFeedbackModel");
const buildSummaryPeriodModel = get("buildSummaryPeriodModel");

function expense(month, sector, amount, extra = {}) {
  return {
    month,
    sector,
    amount,
    approvalDate: `${month}-01`,
    merchant: `${sector} 가맹점`,
    subcategory: `${sector} 세부항목`,
    ...extra
  };
}

function verifyPriorityModel() {
  const activeRows = [
    expense("2026-03", "식비", 100),
    expense("2026-03", "쇼핑", 200),
    expense("2026-02", "쇼핑", 250),
    expense("2026-02", "교통비", 50),
    expense("2025-03", "식비", 9999)
  ];
  const comparison = buildSummaryComparison(activeRows, "2026-03", "식비", {
    mode: "custom",
    comparisonMonth: "2026-02"
  });
  const matrixRows = [{
    month: "2026-03",
    total: 300,
    amounts: { 식비: 100, 쇼핑: 200, 교통비: 0 }
  }];
  const model = buildSummaryPriorityModel(
    matrixRows,
    ["식비", "쇼핑", "교통비"],
    "2026-03",
    "식비",
    comparison
  );
  const food = model.points.find((item) => item.sector === "식비");
  const transport = model.points.find((item) => item.sector === "교통비");

  assert.equal(comparison.mode, "custom", "priority must keep custom comparison mode");
  assert.equal(comparison.comparisonMonth, "2026-02", "priority must use the chosen comparison month");
  assert.equal(food.comparisonAmount, 0, "custom comparison must not fall back to prior-year rows");
  assert.equal(food.rateLabel, "신규", "a current-only sector must be labeled 신규");
  assert.equal(food.rate, null, "a 신규 sector must not invent a numeric growth rate");
  assert.equal(transport.rateLabel, "-100%", "a baseline-only sector must be labeled -100%");
  assert.equal(transport.rate, -1, "a baseline-only sector must map to a -100% rate");
  assert.ok(Math.abs(food.share - 1 / 3) < 1e-12, "share must use the selected month's total");
  assert.equal(model.selected.sector, "식비", "the requested sector must stay selected");
  model.points.forEach((point) => {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), "bubble layout must stay finite");
  });
}

function verifyPatternModel() {
  const currentRows = [
    expense("2026-03", "식비", 1000, {
      approvalDate: "2026-03-02",
      approvalTime: "09:30",
      merchant: "반복 카페"
    }),
    expense("2026-03", "식비", 2000, {
      approvalDate: "2026-03-03",
      approvalTime: "25:00",
      merchant: "반복 카페"
    }),
    expense("2026-03", "식비", 4000, {
      approvalDate: "2026-03-07",
      approvalTime: "",
      merchant: "토요 마트"
    }),
    expense("2026-03", "식비", 5000, {
      approvalDate: "2026-03-04",
      approvalTime: "18:10",
      merchant: "할부 가맹점",
      isInstallmentOccurrence: true,
      currentInstallmentIndex: 2
    })
  ];
  const comparison = {
    currentRows,
    comparisonRows: [expense("2025-03", "식비", 3000, {
      approvalDate: "2025-03-03",
      approvalTime: "12:15",
      merchant: "기준 식당"
    })],
    comparisonExists: true,
    comparisonLabel: "전년 동월",
    selectedMonth: "2026-03",
    comparisonMonth: "2025-03"
  };
  const model = buildSummaryPatternModel(comparison, "식비");
  const mondayMorning = model.current.cells.find((cell) => cell.dayIndex === 0 && cell.period === "morning");

  assert.equal(model.current.totalCount, 4, "all selected-sector transactions must remain in amount/count analysis");
  assert.equal(model.current.timedCount, 1, "invalid, blank, and later installment occurrence times must be excluded");
  assert.equal(mondayMorning.count, 1, "a valid Monday morning time must land in the correct cell");
  assert.equal(model.current.cells.reduce((sum, cell) => sum + cell.count, 0), 1, "each valid time must be counted once");
  assert.equal(model.current.repeatMerchants.length, 1, "only merchants used at least twice must be repeated");
  assert.equal(model.current.repeatMerchants[0].merchant, "반복 카페");
  assert.equal(model.current.repeatMerchants[0].count, 2);
  assert.equal(model.current.repeatMerchants[0].amount, 3000);
  assert.equal(model.current.weekendShare, 1 / 3, "weekend share must exclude synthetic later installment dates");

  const noTimeModel = buildSummaryPatternModel({
    ...comparison,
    currentRows: [
      expense("2026-04", "식비", 1000, { approvalDate: "2026-04-01", approvalTime: "" }),
      expense("2026-04", "식비", 2000, { approvalDate: "2026-04-02", approvalTime: "not-a-time" })
    ],
    comparisonRows: [],
    comparisonExists: false,
    selectedMonth: "2026-04",
    comparisonMonth: "2025-04"
  }, "식비");
  assert.equal(noTimeModel.current.totalCount, 2, "time-less transactions must still count in pattern totals");
  assert.equal(noTimeModel.current.timedCount, 0, "a time-less selection must report zero timed rows");
  assert.ok(noTimeModel.current.cells.every((cell) => cell.count === 0), "a time-less selection must leave every heatmap cell empty");
  assert.equal(noTimeModel.current.totalAmount, 3000, "time-less transactions must still count in amount analysis");
}

function verifyMonthlyFeedbackModel() {
  const activeRows = [
    expense("2026-03", "식비", 150, { subcategory: "점심" }),
    expense("2026-03", "쇼핑", 500, { subcategory: "의류" }),
    expense("2025-03", "식비", 100, { subcategory: "점심" }),
    expense("2025-03", "쇼핑", 100, { subcategory: "의류" })
  ];
  const comparison = buildSummaryComparison(activeRows, "2026-03", "식비");
  const model = buildMonthlyFeedbackModel(activeRows, "2026-03", comparison);

  assert.equal(model.currentRows.length, 2, "feedback must cover the whole selected month, not only the selected sector");
  assert.equal(model.total.currentAmount, 650, "feedback total must include every sector in the month");
  assert.equal(model.total.delta, 450, "feedback total delta must include every sector");
  assert.equal(model.biggestIncrease.sector, "쇼핑", "feedback must find the largest change across all sectors");
  assert.equal(model.driverSector, "쇼핑", "feedback drivers must follow the month-wide largest change");
  assert.equal(model.attentionDrivers[0].label, "의류", "feedback must expose the leading subcategory cause");

  const rowsWithoutBaseline = [
    expense("2026-04", "식비", 120),
    expense("2026-04", "교통비", 80)
  ];
  const noBaselineComparison = buildSummaryComparison(rowsWithoutBaseline, "2026-04", "식비");
  const noBaselineModel = buildMonthlyFeedbackModel(rowsWithoutBaseline, "2026-04", noBaselineComparison);
  assert.equal(noBaselineModel.comparisonExists, false, "feedback must preserve a missing comparison state");
  assert.equal(noBaselineModel.total.currentAmount, 200, "missing comparison data must not hide current-month totals");
  assert.match(noBaselineModel.headline, /기록이 없어/, "missing comparison feedback must explain why comparison is unavailable");
}

function verifyPeriodModel() {
  const activeRows = [
    expense("2025-11", "식비", 40),
    expense("2025-11", "쇼핑", 10),
    expense("2025-12", "식비", 100),
    expense("2025-12", "쇼핑", 200),
    expense("2026-02", "식비", 90),
    expense("2026-02", "쇼핑", 30),
    expense("2026-03", "식비", 160),
    expense("2026-03", "쇼핑", 120)
  ];
  const comparison = buildSummaryComparison(activeRows, "2026-03", "식비", {
    mode: "custom",
    comparisonMonth: "2025-12"
  });
  const model = buildSummaryPeriodModel(
    activeRows,
    ["2026-02", "2026-03"],
    ["식비", "쇼핑"],
    "2026-03",
    "식비",
    comparison
  );
  const febFood = model.rows[0].cells.find((cell) => cell.sector === "식비");
  const marchFood = model.rows[1].cells.find((cell) => cell.sector === "식비");
  const foodFlow = model.flows.find((flow) => flow.sector === "식비");

  assert.equal(febFood.baselineMonth, "2025-11", "each visible month must shift by the custom comparison offset");
  assert.equal(febFood.comparisonAmount, 40, "period heatmap must read a baseline outside the visible range");
  assert.equal(febFood.delta, 50);
  assert.equal(marchFood.baselineMonth, "2025-12");
  assert.equal(marchFood.comparisonAmount, 100);
  assert.equal(marchFood.delta, 60);
  assert.equal(model.selectedCell.delta, 60, "the selected heatmap cell must use the selected month change");
  assert.strictEqual(foodFlow.selectedPoint, marchFood, "flow and heatmap must share the same period cell model");
  assert.deepEqual(
    foodFlow.points.map((point) => point.delta),
    [febFood.delta, marchFood.delta],
    "flow values must exactly match heatmap values"
  );
}

verifyPriorityModel();
verifyPatternModel();
verifyMonthlyFeedbackModel();
verifyPeriodModel();

console.log("Summary redesign verification passed.");
