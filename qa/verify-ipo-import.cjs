const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, structuredClone });
[
  "src/utils/date.js",
  "src/utils/normalize.js",
  "src/utils/storage.js",
  "src/utils/backup.js"
].forEach((relativePath) => {
  vm.runInContext(fs.readFileSync(path.join(root, relativePath), "utf8"), context, { filename: relativePath });
});

const normalize = context.normalizeIpoRecord;
const merge = context.mergeIpoRecords;

const legacy = normalize({
  id: "legacy",
  company: "기존 기록",
  offerPrice: 10000,
  allocatedShares: 3,
  sellDate: "2025-01-01",
  sellAmount: 15000,
  applicationFee: 2000
});
assert.equal(legacy.profit, 5000, "무버전 기록은 기존 1주 기준 손익을 유지해야 한다.");
assert.equal(legacy.settlementProfit, 3000);

const quantityV2 = normalize({
  id: "quantity-v2",
  company: "수량 계산",
  calculationVersion: "quantity-v2",
  offerPrice: 10000,
  allocatedShares: 3,
  sellDate: "2025-01-01",
  sellPrice: 15000,
  applicationFee: 2000,
  allocationResult: "allocated"
});
assert.equal(quantityV2.totalSellAmount, 45000);
assert.equal(quantityV2.profit, 15000);
assert.equal(quantityV2.settlementProfit, 13000);

const reported = normalize({
  id: "reported",
  company: "수량 미확인 기록",
  calculationVersion: "reported",
  offerPrice: 10000,
  allocatedShares: 0,
  sellDate: "2025-01-23",
  sellAmount: 8000,
  applicationFee: 1000,
  reportedProfit: -2500,
  reportedProfitRate: -25,
  allocationResult: "allocated"
});
assert.equal(reported.profit, -2500);
assert.equal(reported.settlementProfit, -2500, "reported 방식은 확정 손익을 다시 차감하지 않아야 한다.");

const unallocated = normalize({
  id: "unallocated",
  company: "미배정",
  calculationVersion: "quantity-v2",
  offerPrice: 9000,
  allocatedShares: 0,
  sellDate: "2025-03-06",
  sellAmount: 17586,
  applicationFee: 2000,
  allocationResult: "unallocated"
});
assert.equal(unallocated.profit, 0);
assert.equal(unallocated.settlementProfit, 0);

[
  ["4주 배정 예제", 1000, 4, 1500, 2000, 0],
  ["3주 배정 예제", 2000, 3, 5000, 9000, 7000],
  ["2주 배정 예제 A", 3000, 2, 8000, 10000, 8000],
  ["2주 배정 예제 B", 4000, 2, 10000, 12000, 10000],
  ["16주 배정 예제", 2000, 16, 3500, 24000, 22000]
].forEach(([company, offerPrice, allocatedShares, sellPrice, profit, settlementProfit]) => {
  const record = normalize({
    company,
    calculationVersion: "quantity-v2",
    allocationResult: "allocated",
    offerPrice,
    allocatedShares,
    sellDate: "2025-12-01",
    sellPrice,
    applicationFee: 2000
  });
  assert.equal(record.profit, profit, `${company} 매매손익`);
  assert.equal(record.settlementProfit, settlementProfit, `${company} 정산손익`);
});

const imported = normalize({
  id: "first-id",
  sourceRecordId: "row-001",
  company: "같은 종목",
  baseCompany: "같은 종목",
  broker: "A증권",
  calculationVersion: "quantity-v2",
  allocationResult: "allocated",
  offerPrice: 10000,
  allocatedShares: 1,
  sellDate: "2025-01-01",
  sellPrice: 12000,
  memo: "첫 가져오기"
});
let merged = merge([], [imported]);
merged = merge(merged, [{ ...imported, id: "second-id", memo: "재가져오기" }]);
assert.equal(merged.length, 1, "같은 원본 ID는 중복 생성되면 안 된다.");
assert.equal(merged[0].id, "first-id", "기존 앱 ID를 보존해야 한다.");
assert.equal(merged[0].memo, "재가져오기", "정리 TSV의 최신 값을 반영해야 한다.");

merged = merge(merged, [{ ...imported, id: "third-id", sourceRecordId: "row-002", broker: "B증권" }]);
assert.equal(merged.length, 2, "같은 종목이라도 다른 원본 ID/계좌는 별도 기록이어야 한다.");

const roundTrip = normalize(JSON.parse(JSON.stringify(quantityV2)));
assert.equal(roundTrip.calculationVersion, "quantity-v2");
assert.equal(roundTrip.totalSellAmount, 45000);
assert.equal(roundTrip.profit, 15000);

console.log("IPO model/import regression checks passed.");
