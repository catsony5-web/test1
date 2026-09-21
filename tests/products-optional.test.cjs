const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const copy = (value) => JSON.parse(JSON.stringify(value));

function setup() {
  const context = vm.createContext({
    console,
    products: [],
    productFilters: { category: "all", name: "all", store: "", status: "all", search: "", sort: "recent", trendName: "토너" },
    els: { productTrendSelect: { value: "토너" }, productTrendChart: { innerHTML: "" } }
  });
  for (const file of [
    "src/data/constants.js", "src/utils/date.js", "src/utils/dom.js", "src/utils/format.js",
    "src/utils/normalize.js", "src/features/products/products-view.js", "src/utils/storage.js", "src/utils/backup.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  return context;
}

function product(context, values = {}) {
  return context.normalizeProduct({ id: "product-1", name: "토너", createdAt: "2026-09-01T00:00:00Z", ...values });
}

test("name-only products retain blank optional data and backward-compatible storage defaults", () => {
  const c = setup();
  const item = product(c);
  for (const key of ["purchaseDate", "expiryDate", "startDate", "endDate", "store", "link", "memo"]) {
    assert.equal(item[key], "", key);
  }
  assert.equal(item.price, 0);
  assert.equal(item.priceKnown, false);
  assert.equal(item.volume, 0);
  assert.equal(item.quantity, 1);
  assert.equal(item.unit, "ml");
  assert.equal(item.expectedDays, 0);
  assert.equal(c.productUnitPrice(item), null);
  assert.equal(c.productUsageStatus(item), "unknown");
  assert.equal(c.productUsageDays(item), 0);
  assert.equal(c.nextProductPurchaseDate(item), "");
  assert.deepEqual(copy(c.normalizeProduct(copy(item))), copy(item));
});

test("price flags distinguish explicit zero, unknown zero, and legacy positive prices", () => {
  const c = setup();
  for (const [values, known] of [
    [{}, false], [{ price: 0 }, false], [{ price: 12000 }, true],
    [{ price: 0, priceKnown: true }, true], [{ price: 12000, priceKnown: false }, false]
  ]) {
    const item = product(c, values);
    assert.equal(c.hasProductPrice(values), known);
    assert.equal(item.priceKnown, known);
    assert.equal(c.normalizeProduct(copy(item)).priceKnown, known);
  }
});

test("storage and backup round-trips preserve partial products and explicit free prices", async () => {
  const c = setup();
  c.products = [product(c), product(c, { id: "free", price: 0, priceKnown: true, volume: 100 })];
  let saved;
  c.safeSave = async (_key, rows) => { saved = copy(rows); return true; };
  c.safeLoad = async () => copy(saved);
  assert.equal(await c.saveProducts(), true);
  assert.deepEqual(copy(await c.loadProducts()), copy(c.products));
  const backup = copy(c.buildBackupSection("products"));
  const restored = c.normalizeBackupSection("products", backup);
  assert.deepEqual(copy(restored.products), copy(c.products));
  assert.equal(restored.products[0].priceKnown, false);
  assert.equal(restored.products[1].priceKnown, true);
});

test("unit prices require known price, positive volume, and a unit but allow free products", () => {
  const c = setup();
  assert.equal(c.productUnitPrice(product(c, { price: 10000, volume: 100, quantity: 2 })), 50);
  assert.equal(c.productUnitPrice(product(c, { price: 0, priceKnown: true, volume: 100 })), 0);
  for (const item of [
    product(c, { volume: 100 }), product(c, { price: 10000 }),
    product(c, { price: 10000, volume: 0 }), { price: 10000, volume: 100 },
    { price: 10000, volume: -1, unit: "ml" }, { price: 10000, volume: "bad", unit: "ml" }
  ]) {
    assert.equal(c.productUnitPrice(item), null);
  }
});

test("usage status distinguishes unknown, using, and done without inventing dates", () => {
  const c = setup();
  assert.equal(c.productUsageStatus(product(c, { purchaseDate: "2026-09-01" })), "unknown");
  assert.equal(c.productUsageStatus(product(c, { startDate: "2026-09-01" })), "using");
  assert.equal(c.productUsageStatus(product(c, { endDate: "2026-09-01" })), "done");
  assert.equal(c.productUsageStatus(product(c, { startDate: "2026-09-01", endDate: "2026-09-02" })), "done");
});

test("usage days require both dates and reject reversed ranges", () => {
  const c = setup();
  assert.equal(c.productUsageDays({ startDate: "2026-09-01" }), 0);
  assert.equal(c.productUsageDays({ endDate: "2026-09-01" }), 0);
  assert.equal(c.productUsageDays({ startDate: "2026-09-02", endDate: "2026-09-01" }), 0);
  assert.equal(c.productUsageDays({ startDate: "2026-09-01", endDate: "2026-09-01" }), 1);
  assert.equal(c.productUsageDays({ startDate: "2026-09-01", endDate: "2026-09-03" }), 3);
});

test("usage filters exclude records whose status is unknown from using", () => {
  const c = setup();
  c.products = [
    product(c, { id: "unknown", purchaseDate: "2026-09-01" }),
    product(c, { id: "using", startDate: "2026-09-01" }),
    product(c, { id: "done", endDate: "2026-09-01" })
  ];
  for (const status of ["unknown", "using", "done"]) {
    c.productFilters.status = status;
    assert.deepEqual(copy(c.filteredProducts().map((item) => item.id)), [status]);
  }
  c.productFilters.status = "all";
  assert.equal(c.filteredProducts().length, 3);
});

test("unit-price sorting puts explicit free products first and missing data last", () => {
  const c = setup();
  c.products = [
    product(c, { id: "unknown", volume: 100 }),
    product(c, { id: "paid", price: 10000, volume: 100 }),
    product(c, { id: "free", price: 0, priceKnown: true, volume: 100 }),
    product(c, { id: "no-volume", price: 10000 })
  ];
  c.productFilters.sort = "unit-asc";
  assert.deepEqual(copy(c.filteredProducts().map((item) => item.id)), ["free", "paid", "unknown", "no-volume"]);
});

test("trend requires two same-name records with known prices and purchase dates", () => {
  const c = setup();
  c.products = [
    product(c, { id: "known", price: 10000, purchaseDate: "2026-09-01" }),
    product(c, { id: "unknown-price", purchaseDate: "2026-09-02" }),
    product(c, { id: "unknown-date", price: 12000 }),
    product(c, { id: "other-name", name: "샴푸", price: 12000, purchaseDate: "2026-09-02" })
  ];
  c.renderProductTrend();
  assert.match(c.els.productTrendChart.innerHTML, /구매일과 가격이 입력된 기록이 2개 이상/);
  assert.doesNotMatch(c.els.productTrendChart.innerHTML, /<svg/);
  c.products.push(product(c, { id: "free", price: 0, priceKnown: true, purchaseDate: "2026-09-03" }));
  c.renderProductTrend();
  assert.equal((c.els.productTrendChart.innerHTML.match(/class="product-price-dot"/g) || []).length, 2);
  assert.equal((c.els.productTrendChart.innerHTML.match(/class="product-unit-dot"/g) || []).length, 0);
});

test("chart omits unknown prices and missing dates without fabricating zero points", () => {
  const c = setup();
  const html = c.renderProductTrendChart([
    product(c, { price: 10000, purchaseDate: "2026-09-01", volume: 100 }),
    product(c, { purchaseDate: "2026-09-02", volume: 100 }),
    product(c, { price: 10000, volume: 100 }),
    product(c, { price: 0, priceKnown: true, purchaseDate: "2026-09-03", volume: 100 })
  ]);
  assert.equal((html.match(/class="product-price-dot"/g) || []).length, 2);
  assert.equal((html.match(/class="product-unit-dot"/g) || []).length, 2);
  assert.doesNotMatch(html, /2026-09-02|NaN|Infinity/);
});

test("unit-price chart breaks at missing capacity and between different units", () => {
  const c = setup();
  const rows = [
    { volume: 100, unit: "ml" }, { volume: 100, unit: "ml" }, {},
    { volume: 100, unit: "ml" }, { volume: 100, unit: "g" }, { volume: 100, unit: "g" }
  ].map((values, index) => product(c, { price: 10000, purchaseDate: `2026-09-0${index + 1}`, ...values }));
  const html = c.renderProductTrendChart(rows);
  assert.equal((html.match(/class="product-price-dot"/g) || []).length, 6);
  assert.equal((html.match(/class="product-unit-dot"/g) || []).length, 5);
  const segments = [...html.matchAll(/<polyline class="product-unit-line" points="([^"]+)"/g)];
  assert.equal(segments.length, 2);
  assert.ok(segments.every(([, points]) => points.split(" ").length === 2));
  assert.match(html, /같은 단위의 연속 기록만 연결/);
  assert.match(html, /100원\/ml/);
  assert.match(html, /100원\/g/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
