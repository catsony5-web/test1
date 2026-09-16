const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const insights = require("../src/features/goals/goals-insights.js");

const now = new Date("2026-09-16T03:00:00.000Z");
const item = (publishedAt, extra = {}) => ({ sourceId: "wordpress", title: "How to monetize a blog", url: "https://wordpress.com/blog/2026/09/15/monetize/", publishedAt, ...extra });
const snapshot = (items = [item("2026-09-15T01:00:00.000Z")]) => ({ schemaVersion: 1, updatedAt: "2026-09-16T00:00:00.000Z", attemptedAt: "2026-09-16T00:00:00.000Z", refreshStatus: "ok", sources: Object.fromEntries(insights.SOURCES.map((source) => [source.id, { state: "ok" }])), items });

test("source URLs allow only exact HTTPS official origins and expected paths", () => {
  assert.ok(insights.safeSourceUrl("https://wordpress.com/blog/a/", "wordpress"));
  for (const url of ["javascript:alert(1)", "http://wordpress.com/blog/a", "https://wordpress.com.evil.test/blog/a", "https://evil.test/", "https://user@wordpress.com/blog/a", "https://wordpress.com/blog/../support/", "https://wordpress.com:444/blog/a", "https://wordpress.com/blog/\\evil"]) assert.equal(insights.safeSourceUrl(url, "wordpress"), "", url);
  assert.equal(insights.safeSourceUrl("https://changelog.shopify.com/", "shopify"), "");
});

test("KST today and rolling periods use publication dates, not refresh dates", () => {
  const items = [
    item("2026-09-15T14:59:59.000Z"),
    item("2026-09-15T15:00:00.000Z"),
    item("2026-09-09T15:00:00.000Z"),
    item("2026-09-09T14:59:59.000Z"),
    item("2026-09-17T01:00:00.000Z")
  ];
  assert.deepEqual(insights.filterItems(items, "today", now), [items[1]]);
  assert.deepEqual(insights.filterItems(items, "7", now), items.slice(0, 3));
  assert.equal(insights.filterItems(items, "30", now).length, 4);
  assert.equal(insights.periodStart("year", now), Date.parse("2025-09-16T15:00:00Z"));
});

test("normalization rejects invalid dates and future entries and strips unrelated private fields", () => {
  assert.equal(insights.isoDate("2026-02-30T00:00:00.000Z"), null);
  assert.equal(insights.normalizeItem(item("2026-09-17T00:00:00.000Z"), now), null);
  const normalized = insights.normalizeSnapshot({ ...snapshot(), transactions: [{ amount: 123 }], hobby: "private", extra: true }, now);
  assert.ok(normalized);
  assert.equal(normalized.transactions, undefined);
  assert.equal(normalized.hobby, undefined);
  assert.deepEqual(Object.keys(normalized.items[0]), ["sourceId", "title", "url", "publishedAt", "topicId"]);
  assert.equal(insights.normalizeSnapshot({ ...snapshot(), attemptedAt: "2026-09-17T00:00:00.000Z" }, now), null);
  assert.equal(insights.normalizeSnapshot({ ...snapshot(), items: new Array(301).fill(item("2026-09-15T00:00:00.000Z")) }, now), null);
});

test("topic mapping stays narrow and cannot trust supplied topic or alleged profitability", () => {
  assert.equal(insights.topicFor("youtube", "Celebrity golf channel launch"), "");
  assert.equal(insights.topicFor("youtube", "Making thumbnails easier on YouTube"), "video");
  assert.equal(insights.topicFor("shopify", "Product variants now support multiple barcodes"), "product");
  assert.equal(insights.topicFor("shopify", "US tax calculation improvements"), "");
  assert.equal(insights.normalizeItem(item("2026-09-15T00:00:00.000Z", { topicId: "profit", monthlyProfit: 1000000 }), now).topicId, "writing");
});

test("stream reader enforces declared and actual size caps", async () => {
  await assert.rejects(insights.readBoundedText(new Response("text", { headers: { "content-length": "99999" } }), 10), /response-too-large/);
  await assert.rejects(insights.readBoundedText(new Response("01234567890"), 10), /response-too-large/);
  assert.equal(await insights.readBoundedText(new Response("한글"), 6), "한글");
});

function uiFixture(fetchImpl = async () => new Response(JSON.stringify(snapshot()))) {
  const panel = { innerHTML: "" };
  const context = vm.createContext({ URL, Intl, Date, TextDecoder, AbortSignal, fetch: fetchImpl, els: { goalPlannerRoot: { querySelector: () => panel } }, escapeHtml: (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])), captureGoalFocus: () => null });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/features/goals/goals-insights.js"), "utf8"), context);
  return { context, panel };
}

test("UI labels official updates separately from ideas, defaults to seven days, and escapes titles", () => {
  const { context } = uiFixture();
  const html = context.renderGoalInsights();
  assert.match(html, /공식 업데이트 \/ 활용 아이디어/);
  assert.match(html, /data-goal-insight-period="7" aria-pressed="true"/);
  assert.match(html, /최근 1년/);
  assert.match(html, /자료가 없을 때는 임의의 트렌드를 만들지 않습니다/);
  const card = context.renderGoalInsightCard({ ...item("2026-09-15T01:00:00.000Z"), topicId: "writing", title: '<img src=x onerror="alert(1)"> monetize blog' });
  assert.ok(!card.includes("<img"));
  assert.match(card, /&lt;img/);
  assert.match(card, /rel="noopener noreferrer" referrerpolicy="no-referrer"/);
  assert.match(card, /의미 · 아이디어/);
});

test("browser refresh requests only the shared static file, retains good data on failure and does not duplicate loads", async () => {
  let calls = 0;
  const { context, panel } = uiFixture(async (url, options) => {
    calls++;
    assert.equal(url, "./data/hobby-insights.json");
    assert.equal(options.credentials, "omit");
    assert.equal(options.body, undefined);
    assert.equal(options.redirect, "error");
    if (calls > 1) throw new Error("offline");
    return new Response(JSON.stringify(snapshot()));
  });
  await context.loadGoalInsights();
  assert.equal(vm.runInContext("goalInsightState.snapshot.items.length", context), 1);
  await context.loadGoalInsights();
  assert.equal(calls, 1);
  await context.loadGoalInsights(true);
  assert.equal(calls, 2);
  assert.equal(vm.runInContext("goalInsightState.snapshot.items.length", context), 1);
  assert.match(panel.innerHTML, /자료를 새로 읽지 못했습니다/);
});

test("filter actions only change the public feed view", () => {
  const { context } = uiFixture();
  assert.equal(context.handleGoalInsightAction({ dataset: { goalAction: "filter-insights", goalInsightPeriod: "30" } }), true);
  assert.equal(vm.runInContext("goalInsightState.period", context), "30");
  assert.equal(context.handleGoalInsightAction({ dataset: { goalAction: "select-side-path" } }), false);
});

test("malformed and older snapshots cannot overwrite a good browser snapshot", async () => {
  const good = snapshot();
  const older = { ...good, updatedAt: "2026-09-14T00:00:00.000Z" };
  const responses = [JSON.stringify(good), "broken-json", JSON.stringify(older)];
  const { context } = uiFixture(async () => new Response(responses.shift()));
  await context.loadGoalInsights();
  for (let retry = 0; retry < 2; retry++) {
    await context.loadGoalInsights(true);
    assert.equal(vm.runInContext("goalInsightState.snapshot.updatedAt", context), good.updatedAt);
    assert.equal(vm.runInContext("goalInsightState.error", context), true);
  }
});

test("successful status requires a recorded successful collection", () => {
  const normalized = insights.normalizeSnapshot({ ...snapshot([]), updatedAt: null }, now);
  assert.equal(normalized.refreshStatus, "stale");
});
