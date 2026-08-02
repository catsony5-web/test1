import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeScheduleSnapshot,
  monthWindow,
  parseKindIpoHtml,
  parseKindTotalCount
} from "../scripts/ipo-calendar-lib.mjs";

const fixture = `
  <table><tbody>
    <tr class="first" onclick="fnDetailView('20260000000001')">
      <td title="테스트바이오"><img alt="코스닥">테스트바이오</td>
      <td>2026-07-01</td>
      <td>2026-07-20<br> ~ 2026-07-24</td>
      <td>2026-07-30<br> ~ 2026-07-31</td>
      <td>2026-08-04</td>
      <td>-</td>
      <td>-</td>
      <td>2026-08-18</td>
      <td>삼성증권(주)</td>
    </tr>
    <tr onclick="fnDetailView('20260000000002')">
      <td title="테스트스팩"><img alt="코스닥">테스트스팩</td>
      <td>2026-07-02</td>
      <td>2026-07-10 ~ 2026-07-11</td>
      <td>2026-07-15 ~ 2026-07-16</td>
      <td>2026-07-20</td>
      <td>2,000</td>
      <td>10,000</td>
      <td>2026-07-27</td>
      <td>한국투자증권 주식회사</td>
    </tr>
  </tbody></table>
  <div>전체 <em>2</em>건 : <strong>1</strong>/1</div>
`;

test("KIND HTML rows are normalized without external parser dependencies", () => {
  const rows = parseKindIpoHtml(fixture);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    sourceId: "20260000000001",
    company: "테스트바이오",
    market: "코스닥",
    filingDate: "2026-07-01",
    bookbuildingStart: "2026-07-20",
    bookbuildingEnd: "2026-07-24",
    subscriptionStart: "2026-07-30",
    subscriptionEnd: "2026-07-31",
    paymentDate: "2026-08-04",
    offerPrice: 0,
    offeringAmountMillions: 0,
    listingDate: "2026-08-18",
    broker: "삼성증권",
    priceStatus: "pending",
    status: "scheduled",
    sourceName: "KRX KIND",
    sourceUrl: "https://kind.krx.co.kr/listinvstg/pubofrprogcomdetail.do?method=searchProgComDetailMain&bzProcsNo=20260000000001"
  });
  assert.equal(rows[1].offerPrice, 2000);
  assert.equal(rows[1].broker, "한국투자증권");
  assert.equal(parseKindTotalCount(fixture), 2);
});

test("snapshot comparison records field changes and preserves missing schedules for review", () => {
  const current = parseKindIpoHtml(fixture);
  const previous = [
    { ...current[0], listingDate: "2026-08-17", fingerprint: "old", sourceUpdatedAt: "2026-08-01T00:00:00.000Z" },
    { ...current[1], sourceId: "missing", company: "일시누락", missingSince: "" }
  ];
  const merged = mergeScheduleSnapshot(current, previous, {
    now: "2026-08-02T00:00:00.000Z",
    rangeStart: "2026-05-01",
    rangeEnd: "2027-08-31"
  });
  const changed = merged.find((item) => item.sourceId === current[0].sourceId);
  const missing = merged.find((item) => item.sourceId === "missing");
  assert.equal(changed.changeStatus, "changed");
  assert.equal(changed.changes[0].field, "listingDate");
  assert.equal(missing.status, "unavailable");
  assert.equal(missing.changeStatus, "review");
});

test("month window uses month boundaries for stable scheduled updates", () => {
  assert.deepEqual(monthWindow(new Date("2026-08-02T12:00:00Z")), {
    rangeStart: "2026-05-01",
    rangeEnd: "2027-08-31",
    queryStart: "2024-09-01",
    queryEnd: "2026-08-02"
  });
});
