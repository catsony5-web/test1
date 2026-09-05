const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContext(rows = [], income = {}) {
  const cardBilling = { startDay: 1, endDay: 31, paymentDay: 25, weekendRule: "none" };
  const context = vm.createContext({
    console, classified: rows, transactions: rows, reimbursements: {}, monthlyIncome: income,
    appSettings: { cardBilling }, defaultAppSettings: () => ({ cardBilling }),
    recurringOccurrencesForMonth: () => [],
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))
  });
  for (const file of [
    "src/data/categories.js", "src/utils/format.js", "src/utils/date.js", "src/utils/dom.js",
    "src/utils/food-occasion.js", "src/utils/normalize.js", "src/utils/grouping.js", "src/utils/storage.js",
    "src/components/chips.js", "src/features/board/board-view.js", "src/features/board/board-summary.js",
    "src/features/monthly/monthly-flow.js", "src/features/analysis/analysis-core.js",
    "src/features/analysis/monthly-analysis-core.js", "src/features/calendar/calendar-view.js",
    "src/features/board/board-overview.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../..", file), "utf8"), context, { filename: file });
  return context;
}

function expense(key, amount, date = "2026-09-03", extra = {}) {
  return { recordKey: key, transactionId: key, merchant: `합성 거래 ${key}`, amount,
    month: date.slice(0, 7), approvalDate: date, approvalTime: "12:00", sourceType: "card",
    flow: "expense", sector: "식비", subcategory: "장보기/마트", status: "분류 완료", ...extra };
}
module.exports = { loadContext, expense };
