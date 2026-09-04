const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, structuredClone });
[
  "src/utils/date.js",
  "src/utils/food-occasion.js",
  "src/utils/normalize.js",
  "src/utils/storage.js",
  "src/features/ipo/ipo-view.js"
].forEach((relativePath) => {
  vm.runInContext(fs.readFileSync(path.join(root, relativePath), "utf8"), context, { filename: relativePath });
});

const buildPerformance = context.buildIpoMonthlyPerformance;
const records = [
  { id: "gain-a", company: "수익 A", sellDate: "2024-07-29", settlementProfit: 10000, allocationResult: "allocated" },
  { id: "loss-a", company: "손실 A", sellDate: "2024-08-08", settlementProfit: -4000, allocationResult: "allocated" },
  { id: "gain-b", company: "수익 B", sellDate: "2024-10-24", settlementProfit: 6000, allocationResult: "allocated" },
  { id: "gain-c", company: "수익 C", sellDate: "2025-01-10", settlementProfit: 5000, allocationResult: "allocated" },
  { id: "unallocated", company: "미배정", sellDate: "2025-02-01", settlementProfit: -100000, allocationResult: "unallocated" },
  { id: "waiting", company: "매도 대기", sellDate: "", settlementProfit: 90000, allocationResult: "allocated" }
];

const allTime = buildPerformance(records, "all");
assert.deepEqual([...allTime.years], ["2024", "2025"]);
assert.equal(allTime.realizedCount, 4, "미배정과 매도 대기 기록은 실현 집계에서 제외해야 한다.");
assert.equal(allTime.months.length, 7, "전체 기간은 첫 매도 월부터 마지막 매도 월까지 빈 달을 포함해야 한다.");
assert.equal(allTime.months.find((item) => item.key === "2024-09").profit, 0);
assert.equal(allTime.months.find((item) => item.key === "2024-08").cumulativeProfit, 6000, "손실 월에는 누적선이 내려가야 한다.");
assert.equal(allTime.settlementProfit, 17000);

const year2024 = buildPerformance(records, "2024");
assert.equal(year2024.months.length, 12, "연도 필터는 1월부터 12월까지 흐름을 유지해야 한다.");
assert.equal(year2024.months[0].key, "2024-01");
assert.equal(year2024.months.at(-1).key, "2024-12");
assert.equal(year2024.months.at(-1).cumulativeProfit, 12000, "연도별 누적은 해당 연도 안에서 다시 계산해야 한다.");
assert.equal(year2024.months.find((item) => item.key === "2024-08").maxLoss.company, "손실 A");
assert.equal(year2024.months.find((item) => item.key === "2024-07").maxGain.company, "수익 A");

const invalidYear = buildPerformance(records, "2030");
assert.equal(invalidYear.selectedYear, "all", "기록에 없는 연도 필터는 전체 기간으로 복구해야 한다.");

const customRange = buildPerformance(records, "custom", "2024-08", "2024-10");
assert.equal(customRange.selectedPeriod, "custom");
assert.equal(customRange.months.length, 3, "직접 설정은 시작 월과 종료 월을 모두 포함해야 한다.");
assert.equal(customRange.realizedCount, 2);
assert.equal(customRange.months[0].cumulativeProfit, -4000, "직접 설정 누적은 선택한 시작 월에서 0원 기준으로 다시 계산해야 한다.");
assert.equal(customRange.months.at(-1).cumulativeProfit, 2000);

const reversedRange = buildPerformance(records, "custom", "2024-10", "2024-08");
assert.equal(reversedRange.rangeIssue, "order", "시작 월이 종료 월보다 늦으면 오류 상태를 반환해야 한다.");
assert.equal(reversedRange.months.length, 0);

const emptyRange = buildPerformance(records, "custom", "2024-09", "2024-09");
assert.equal(emptyRange.rangeIssue, "");
assert.equal(emptyRange.months.length, 1);
assert.equal(emptyRange.realizedCount, 0, "기록이 없는 유효 기간은 빈 기간으로 구분해야 한다.");

const empty = buildPerformance([], "all");
assert.equal(empty.months.length, 0);
assert.equal(empty.settlementProfit, 0);

const getJumpEvent = context.getIpoSummaryJumpEvent;
const pendingAllocation = {
  id: "pending-allocation",
  company: "배정 대기 종목",
  subscriptionStart: "2026-02-18",
  subscriptionEnd: "2026-02-20",
  refundDate: "2026-02-24",
  allocationResult: "pending"
};
assert.equal(getJumpEvent(pendingAllocation, "allocation", "2026-08-02").key, "subscriptionEnd");
assert.equal(getJumpEvent(pendingAllocation, "allocation", "2026-08-02").date, "2026-02-20");

const waitingSell = {
  id: "waiting-sell",
  company: "매도 대기 종목",
  subscriptionStart: "2026-01-10",
  subscriptionEnd: "2026-01-12",
  listingDate: "2026-03-05",
  allocatedShares: 1,
  allocationResult: "allocated"
};
assert.equal(getJumpEvent(waitingSell, "sell", "2026-08-02").key, "listingDate");
assert.equal(getJumpEvent(waitingSell, "sell", "2026-08-02").date, "2026-03-05");

const nearestActive = {
  id: "nearest-active",
  company: "진행 종목",
  subscriptionStart: "2026-07-20",
  subscriptionEnd: "2026-07-22",
  refundDate: "2026-08-04",
  listingDate: "2026-08-12",
  allocationResult: "pending"
};
assert.equal(getJumpEvent(nearestActive, "active", "2026-08-02").key, "refundDate", "진행 중 카드는 오늘과 가장 가까운 등록 일정으로 이동해야 한다.");
assert.equal(getJumpEvent({ id: "no-date", company: "날짜 없음" }, "active", "2026-08-02"), null);

console.log("IPO cumulative performance checks passed.");
