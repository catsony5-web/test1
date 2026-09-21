const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function probeDates() {
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");
  const context = vm.createContext({});
  for (const file of ["src/utils/date.js", "src/features/products/products-view.js"]) {
    vm.runInContext(fs.readFileSync(path.join(process.argv[1], file), "utf8"), context, { filename: file });
  }
  const cases = [
    ["2026-09-21", 0], ["2026-09-21", 1], ["2026-09-21", -1],
    ["2026-01-31", 1], ["2026-12-31", 1], ["2026-01-01", -1],
    ["2024-02-28", 1], ["2024-02-28", 2], ["2024-03-01", -1],
    ["2026-02-28", 1], ["2100-02-28", 1],
    ["2026-03-07", 2], ["2026-03-09", -2],
    ["2026-10-31", 2], ["2026-11-02", -2], ["invalid", 1]
  ];
  const products = [
    { startDate: "2026-09-21", expectedDays: 1 },
    { startDate: "2026-01-31", expectedDays: 2 },
    { purchaseDate: "2024-02-28", expectedDays: 3 },
    { startDate: "2026-03-07", expectedDays: 3 },
    { startDate: "2026-10-31", expectedDays: 3 },
    { startDate: "2026-09-21", expectedDays: 2, endDate: "2026-10-01" }
  ];
  process.stdout.write(JSON.stringify({
    dates: cases.map(([date, days]) => context.addDays(date, days)),
    products: products.map((product) => context.nextProductPurchaseDate(product)),
    offsets: ["2026-03-07", "2026-03-09", "2026-10-31", "2026-11-02"]
      .map((date) => new Date(`${date}T00:00:00`).getTimezoneOffset())
  }));
}

for (const timezone of ["Asia/Seoul", "UTC", "America/New_York"]) {
  test(`날짜 이동과 상품 예상일은 ${timezone}에서 월·연도·윤년·서머타임 경계를 지킨다`, () => {
    const result = spawnSync(process.execPath, ["-e", `(${probeDates.toString()})()`, path.resolve(__dirname, "..")], {
      encoding: "utf8", env: { ...process.env, TZ: timezone }
    });
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(result.stdout);
    assert.deepEqual(actual.dates, [
      "2026-09-21", "2026-09-22", "2026-09-20", "2026-02-01", "2027-01-01", "2025-12-31",
      "2024-02-29", "2024-03-01", "2024-02-29", "2026-03-01", "2100-03-01",
      "2026-03-09", "2026-03-07", "2026-11-02", "2026-10-31", ""
    ]);
    assert.deepEqual(actual.products, ["2026-09-21", "2026-02-01", "2024-03-01", "2026-03-09", "2026-11-02", "2026-10-01"]);
    assert.deepEqual(actual.offsets, timezone === "America/New_York" ? [300, 240, 240, 300]
      : Array(4).fill(timezone === "Asia/Seoul" ? -540 : 0));
  });
}
