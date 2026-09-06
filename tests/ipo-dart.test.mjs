import test from "node:test";
import assert from "node:assert/strict";
import { createDartClient, dartDateRange, dartSearchWindows, parseDartOffering, fetchDartSchedules, ipoCompanyKey } from "../scripts/ipo-dart.mjs";
import { combineOfficialSchedules, mergeScheduleSnapshot, scheduleFingerprint } from "../scripts/ipo-calendar-lib.mjs";

const receipt = "20260902000001";
const filing = { corp_code: "01234567", corp_name: "합성테스트", corp_cls: "E", rcept_no: receipt, rcept_dt: "20260902", report_nm: "[기재정정]증권신고서(지분증권)", rm: "" };
function payload({ date = "2026년 09월 10일 ~ 2026년 09월 11일", method = "일반공모", price = "13,800" } = {}) {
  const base = { corp_code: filing.corp_code, corp_name: filing.corp_name, corp_cls: "E", rcept_no: receipt };
  return { status: "000", group: [
    { title: "일반사항", list: [{ ...base, sbd: date, pymd: "2026.09.15" }] },
    { title: "증권의종류", list: [{ ...base, slmthn: method, slprc: price, slta: "27,600,000,000" }] },
    { title: "인수인정보", list: [{ ...base, actnmn: "합성증권 주식회사", actsen: "대표" }] }
  ] };
}
function dart() { return parseDartOffering(payload(), filing, "2026-09-06"); }
function kind(extra = {}) {
  return { sourceId: "kind-1", company: filing.corp_name, market: "코스닥", sourceName: "KRX KIND", sourceUrl: "https://kind.krx.co.kr/example", subscriptionStart: "2026-09-10", subscriptionEnd: "2026-09-11", offerPrice: 0, status: "scheduled", ...extra };
}

test("DART preliminary issue price is not promoted to a confirmed offer price", () => {
  const item = dart();
  assert.equal(item.subscriptionStart, "2026-09-10");
  assert.equal(item.subscriptionEnd, "2026-09-11");
  assert.equal(item.paymentDate, "2026-09-15");
  assert.equal(item.offerPrice, 0);
  assert.equal(item.reportedOfferPrice, 13800);
  assert.equal(item.priceStatus, "pending");
  assert.equal(item.broker, "합성증권");
  assert.equal(item.sources[0].checkedDate, "2026-09-06");
  assert.equal(item.listingDate, "");
});

test("only matching issuance-conditions-confirmed filing can confirm a price", () => {
  const confirmed = parseDartOffering(payload(), { ...filing, report_nm: "[발행조건확정]증권신고서(지분증권)" }, "2026-09-06");
  assert.equal(confirmed.offerPrice, 13800);
  const stale = parseDartOffering(payload(), { ...filing, rcept_no: "20260903000001", report_nm: "[발행조건확정]증권신고서(지분증권)" }, "2026-09-06");
  assert.equal(stale.offerPrice, 0);
  assert.equal(stale.reviewNotes.length, 1);
});

test("private placements and rights offerings are not IPOs", () => {
  for (const method of ["주주배정 후 실권주 일반공모", "제3자배정", "주주배정"]) {
    assert.equal(parseDartOffering(payload({ method }), filing, "2026-09-06"), null);
  }
});

test("date parser supports official formats but rejects ambiguous and impossible dates", () => {
  assert.deepEqual(dartDateRange("2026-09-10~2026-09-11"), { start: "2026-09-10", end: "2026-09-11" });
  assert.deepEqual(dartDateRange("2026.09.10"), { start: "2026-09-10", end: "2026-09-10" });
  for (const value of ["2026.02.30", "2026.09.10 ~ 11", "미정", "2026-09-11~2026-09-10"]) {
    assert.deepEqual(dartDateRange(value), { start: "", end: "" });
  }
  assert.equal(parseDartOffering(payload({ date: "미정" }), filing, "2026-09-06").reviewNotes.length, 1);
});

test("withdrawal flag wins over old structured scheduled dates", () => {
  assert.equal(parseDartOffering(payload(), { ...filing, rm: "철" }, "2026-09-06").status, "cancelled");
});

test("KRX missing company is supplied by DART with an official source", () => {
  const result = combineOfficialSchedules([], [dart()], [], [], "2026-09-06");
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceId, "dart-01234567");
  assert.equal(result[0].sourceName, "DART");
});

test("same IPO joins sources, fills unknowns and keeps the existing record ID", () => {
  const combined = combineOfficialSchedules([kind()], [dart()], [], [], "2026-09-06");
  assert.equal(combined.length, 1);
  assert.equal(combined[0].sourceId, "kind-1");
  assert.equal(combined[0].paymentDate, "2026-09-15");
  assert.equal(combined[0].sources.length, 2);
  assert.equal(combined[0].conflicts.length, 0);
  const later = combineOfficialSchedules([kind()], [dart()], [], [dart()], "2026-09-07");
  assert.equal(later[0].sourceId, "dart-01234567");
  assert.ok(later[0].aliases.includes("kind-1"));
  const absentKind = combineOfficialSchedules([], [dart()], [], combined, "2026-09-07");
  assert.equal(absentKind[0].sourceId, "kind-1");
});

test("conflicting dates are retained as explicit source comparisons, not overwritten", () => {
  const combined = combineOfficialSchedules([kind({ subscriptionEnd: "2026-09-12" })], [dart()], [], [], "2026-09-06");
  assert.equal(combined[0].subscriptionEnd, "2026-09-12");
  assert.equal(combined[0].conflicts[0].field, "subscriptionEnd");
  assert.equal(combined[0].conflicts[0].values[1].value, "2026-09-11");
  const snapshot = mergeScheduleSnapshot(combined, [], { now: "2026-09-06T00:00:00Z" });
  assert.equal(snapshot[0].conflicts.length, 1);
  assert.equal(snapshot[0].sources.length, 2);
  assert.equal(snapshot[0].reportedOfferPrice, 13800);
});

test("broker supplement requires source and preserves verified price band", () => {
  assert.throws(() => combineOfficialSchedules([], [], [{ company: "A" }], [], "2026-09-06"), /HTTPS source/);
  const supplement = { ...dart(), sourceId: "broker-a", sourceName: "공식 주관사", sourceUrl: "https://www.daishin.com/example", offerPriceLow: 13800, offerPriceHigh: 15800 };
  const combined = combineOfficialSchedules([kind()], [], [supplement], [], "2026-09-06");
  assert.equal(combined[0].offerPriceLow, 13800);
  assert.equal(combined[0].offerPrice, 0);
});

test("checked dates do not masquerade as changed financial schedules", () => {
  const first = dart();
  const second = structuredClone(first);
  second.sources[0].checkedDate = "2026-09-07";
  assert.equal(scheduleFingerprint(first), scheduleFingerprint(second));
  second.conflicts = [{ field: "paymentDate", values: [] }];
  assert.notEqual(scheduleFingerprint(first), scheduleFingerprint(second));
});

test("company keys normalize corporate markers and SPAC variants conservatively", () => {
  assert.equal(ipoCompanyKey("케이비제34호기업인수목적 주식회사"), ipoCompanyKey("KB제34호스팩"));
  assert.notEqual(ipoCompanyKey("한국제16호스팩"), ipoCompanyKey("한국제17호스팩"));
});

test("DART search windows cover the period once without exceeding 90 days", () => {
  const ranges = dartSearchWindows("2024-10-01", "2026-09-06");
  const date = (v) => Date.parse(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T00:00:00Z`);
  assert.equal(ranges[0].bgn_de, "20241001");
  assert.equal(ranges.at(-1).end_de, "20260906");
  ranges.forEach((range, index) => {
    assert.ok(date(range.end_de) - date(range.bgn_de) <= 89 * 86400000);
    if (index) assert.equal(date(range.bgn_de) - date(ranges[index - 1].end_de), 86400000);
  });
});

test("DART client validates credentials and returns safe errors without URLs or keys", async () => {
  assert.throws(() => createDartClient(""), /DART_API_KEY/);
  const key = "a".repeat(40);
  const client = createDartClient(key, async (url) => { throw new Error(`failed ${url}`); });
  await assert.rejects(client("list.json", {}), (error) => !error.message.includes(key) && !error.message.includes("crtfc_key") && /network/.test(error.message));
  const limited = createDartClient(key, async () => ({ ok: true, json: async () => ({ status: "020", message: key }) }));
  await assert.rejects(limited("list.json", {}), (error) => /020/.test(error.message) && !error.message.includes(key));
  const empty = createDartClient(key, async () => ({ ok: true, json: async () => ({ status: "013" }) }));
  assert.deepEqual((await empty("list.json", {})).list, []);
});

test("DART collection reads every list page and excludes unrelated listed companies", async () => {
  const calls = [];
  const request = async (endpoint, params) => {
    calls.push({ endpoint, params });
    if (endpoint === "estkRs.json") return payload();
    return { status: "000", total_page: 2, list: params.page_no === "1" ? [{ ...filing, corp_code: "99999999", corp_cls: "Y", corp_name: "기존 상장회사" }] : [filing] };
  };
  const result = await fetchDartSchedules({ request, window: { queryStart: "2026-09-01", queryEnd: "2026-09-06" }, kindItems: [], checkedDate: "2026-09-06" });
  assert.equal(result.items.length, 1);
  assert.equal(calls.filter((call) => call.endpoint === "list.json").length, 2);
  assert.equal(calls.filter((call) => call.endpoint === "estkRs.json").length, 1);
});

test("structured data delays are counted and transport failures abort the collection", async () => {
  const options = { window: { queryStart: "2026-09-01", queryEnd: "2026-09-06" }, kindItems: [], checkedDate: "2026-09-06" };
  const request = async (endpoint) => endpoint === "list.json" ? { status: "000", total_page: 1, list: [filing] } : { status: "013" };
  assert.equal((await fetchDartSchedules({ ...options, request })).unresolved.length, 1);
  await assert.rejects(fetchDartSchedules({ ...options, request: async () => { throw new Error("network"); } }), /network/);
});
