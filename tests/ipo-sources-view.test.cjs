const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function context() {
  const state = vm.createContext({
    console, ipoRecords: [], ipoCalendarCandidates: [], ipoCalendarPayload: null, selectedIpoScheduleIds: new Set(),
    toNumber: (value) => Number(value || 0), normalizeInputDate: (value) => value || "", normalizeKeyText: (value) => String(value).toLowerCase(),
    formatWon: (value) => `${value}원`, escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    normalizeIpoRecord: (value) => value, createAutoSnapshot: async () => {}, saveIpoRecords: async () => {},
    els: { ipoCalendarStatus: {} }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/features/ipo/ipo-view.js"), "utf8"), state);
  state.renderIpoView = () => {};
  state.renderIpoCalendarCandidates = () => {};
  return state;
}

test("public source metadata survives normalization and URLs remain HTTP(S) only", () => {
  const c = context();
  const row = c.normalizeIpoScheduleItem({ sourceId: "dart-a", company: "A", reportedOfferPrice: 13800,
    sourceUrl: "javascript:alert(1)", sources: [{ name: "DART", url: "https://dart.fss.or.kr/example", checkedDate: "2026-09-06" }, { name: "bad", url: "javascript:bad" }] });
  assert.equal(row.sources.length, 1);
  assert.equal(row.sourceUrl, "");
  assert.equal(c.renderIpoSchedulePrice(row), "신고서 기재 13800원 · 확정 전");
  assert.match(c.renderIpoScheduleSources(row), /DART 원문 · 확인 2026-09-06/);
});

test("conflicts are visible and prevent both add and batch apply", async () => {
  const c = context();
  const row = c.normalizeIpoScheduleItem({ sourceId: "a", company: "A", subscriptionStart: "2026-09-10", conflicts: [{ field: "subscriptionStart", label: "청약 시작", values: [{ source: "DART", value: "2026-09-11" }] }] });
  c.ipoCalendarCandidates = [row];
  assert.equal(c.getIpoScheduleReviews()[0].state, "review");
  assert.match(c.renderIpoScheduleReviewNotes(row), /청약 시작: DART 2026-09-11/);
  await c.addIpoScheduleToRecords("a");
  assert.equal(c.ipoRecords.length, 0);
  c.ipoRecords = [{ id: "personal", scheduleId: "a", subscriptionStart: "2026-09-01" }];
  assert.equal(c.getIpoScheduleReviews()[0].actionable, false);
  await c.applyIpoScheduleUpdates(["a"]);
  assert.equal(c.ipoRecords[0].subscriptionStart, "2026-09-01");
});

test("a new source alias keeps personal schedules linked without duplication", () => {
  const c = context();
  const record = { id: "personal", scheduleId: "dart-a" };
  c.ipoRecords = [record];
  assert.equal(c.findIpoRecordForSchedule({ sourceId: "kind-a", aliases: ["dart-a"] }), record);
});

test("schedule refresh leaves personal dates intact when the source field is unknown", async () => {
  const c = context();
  const row = c.normalizeIpoScheduleItem({ sourceId: "dart-a", company: "A", subscriptionStart: "2026-09-10", subscriptionEnd: "2026-09-11", reportedOfferPrice: 13800 });
  c.ipoCalendarCandidates = [row];
  c.ipoRecords = [{ id: "personal", scheduleId: "dart-a", listingDate: "2026-09-30", offerPrice: 15000, allocatedShares: 5, sellAmount: 100000, applicationFee: 2000, broker: "선택 증권사" }];
  await c.applyIpoScheduleUpdates(["dart-a"]);
  const record = c.ipoRecords[0];
  assert.equal(record.subscriptionStart, "2026-09-10");
  assert.equal(record.listingDate, "2026-09-30");
  assert.equal(record.offerPrice, 15000);
  assert.equal(record.allocatedShares, 5);
  assert.equal(record.sellAmount, 100000);
  assert.equal(record.applicationFee, 2000);
  assert.equal(record.broker, "선택 증권사");
});

test("review notes escape externally supplied source text", () => {
  const c = context();
  assert.ok(!c.renderIpoScheduleReviewNotes({ reviewNotes: ['<script>bad</script>'] }).includes("<script>"));
});
