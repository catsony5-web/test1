import { createHash } from "node:crypto";

const KIND_DETAIL_BASE_URL = "https://kind.krx.co.kr/listinvstg/pubofrprogcomdetail.do";
const SCHEDULE_FIELDS = [
  ["company", "종목명"],
  ["market", "시장"],
  ["bookbuildingStart", "수요예측 시작"],
  ["bookbuildingEnd", "수요예측 종료"],
  ["subscriptionStart", "청약 시작"],
  ["subscriptionEnd", "청약 종료"],
  ["paymentDate", "납입일"],
  ["offerPrice", "확정 공모가"],
  ["offeringAmountMillions", "공모금액"],
  ["listingDate", "상장 예정일"],
  ["broker", "주관사"]
];

export function parseKindIpoHtml(html) {
  const source = String(html || "");
  const body = source.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || source;
  const rows = [];
  const rowPattern = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(body))) {
    const attributes = rowMatch[1] || "";
    const rowHtml = rowMatch[2] || "";
    const sourceId = attributes.match(/fnDetailView\(['"]([^'"]+)['"]\)/i)?.[1] || "";
    if (!sourceId) continue;

    const cells = [...rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (cells.length < 9) continue;

    const companyAttributes = cells[0][1] || "";
    const company = decodeHtml(companyAttributes.match(/title=["']([^"']+)["']/i)?.[1] || stripHtml(cells[0][2]));
    const market = decodeHtml(cells[0][2].match(/alt=["']([^"']+)["']/i)?.[1] || "");
    const bookbuilding = parseKindDateRange(cells[2][2]);
    const subscription = parseKindDateRange(cells[3][2]);
    const rowText = stripHtml(rowHtml);

    rows.push({
      sourceId,
      company,
      market,
      filingDate: parseKindDate(cells[1][2]),
      bookbuildingStart: bookbuilding.start,
      bookbuildingEnd: bookbuilding.end,
      subscriptionStart: subscription.start,
      subscriptionEnd: subscription.end,
      paymentDate: parseKindDate(cells[4][2]),
      offerPrice: parseKindMoney(cells[5][2]),
      offeringAmountMillions: parseKindMoney(cells[6][2]),
      listingDate: parseKindDate(cells[7][2]),
      broker: normalizeBroker(stripHtml(cells[8][2])),
      priceStatus: parseKindMoney(cells[5][2]) > 0 ? "confirmed" : "pending",
      status: /철회|취소/.test(rowText) ? "cancelled" : "scheduled",
      sourceName: "KRX KIND",
      sourceUrl: `${KIND_DETAIL_BASE_URL}?method=searchProgComDetailMain&bzProcsNo=${encodeURIComponent(sourceId)}`
    });
  }

  return rows;
}

export function parseKindTotalCount(html) {
  const value = String(html || "").match(/전체\s*<em>\s*([\d,]+)\s*<\/em>\s*건/i)?.[1] || "";
  return Number(value.replace(/,/g, "")) || 0;
}

export function mergeScheduleSnapshot(currentItems, previousItems, options = {}) {
  const now = options.now || new Date().toISOString();
  const rangeStart = options.rangeStart || "0000-01-01";
  const rangeEnd = options.rangeEnd || "9999-12-31";
  const previousById = new Map((previousItems || []).map((item) => [String(item.sourceId || ""), item]));
  const currentIds = new Set();
  const merged = [];

  for (const rawItem of currentItems || []) {
    const item = normalizeScheduleItem(rawItem);
    if (!item.sourceId || !item.company || !isScheduleInRange(item, rangeStart, rangeEnd)) continue;
    currentIds.add(item.sourceId);
    const previous = previousById.get(item.sourceId);
    const changes = previous ? diffSchedules(previous, item) : [];
    const fingerprint = scheduleFingerprint(item);
    merged.push({
      ...item,
      fingerprint,
      changeStatus: previous ? (changes.length ? "changed" : "unchanged") : "new",
      changes,
      sourceUpdatedAt: previous && previous.fingerprint === fingerprint
        ? previous.sourceUpdatedAt || previous.updatedAt || now
        : now,
      missingSince: ""
    });
  }

  for (const previous of previousItems || []) {
    const sourceId = String(previous?.sourceId || "");
    if (!sourceId || currentIds.has(sourceId) || !isScheduleInRange(previous, rangeStart, rangeEnd)) continue;
    const missingSince = previous.missingSince || now;
    if (daysBetween(missingSince, now) > 30) continue;
    merged.push({
      ...normalizeScheduleItem(previous),
      fingerprint: previous.fingerprint || scheduleFingerprint(previous),
      status: previous.status === "cancelled" ? "cancelled" : "unavailable",
      changeStatus: "review",
      changes: [],
      sourceUpdatedAt: previous.sourceUpdatedAt || previous.updatedAt || now,
      missingSince
    });
  }

  return merged.sort(compareSchedules);
}

export function scheduleFingerprint(item) {
  const canonical = Object.fromEntries(SCHEDULE_FIELDS.map(([key]) => [key, normalizeComparableValue(item?.[key])]));
  canonical.status = String(item?.status || "scheduled");
  canonical.priceStatus = String(item?.priceStatus || "pending");
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 20);
}

export function semanticScheduleSnapshot(items) {
  return (items || []).map((item) => ({
    sourceId: item.sourceId,
    fingerprint: item.fingerprint || scheduleFingerprint(item),
    status: item.status || "scheduled",
    changeStatus: item.changeStatus || "unchanged",
    missingSince: item.missingSince || ""
  }));
}

export function monthWindow(baseDate = new Date()) {
  const base = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
  const rangeStart = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 3, 1));
  const rangeEnd = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 13, 0));
  const queryStart = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 23, 1));
  return {
    rangeStart: formatIsoDate(rangeStart),
    rangeEnd: formatIsoDate(rangeEnd),
    queryStart: formatIsoDate(queryStart),
    queryEnd: formatIsoDate(new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate())))
  };
}

function normalizeScheduleItem(item) {
  const offerPrice = Math.max(0, Number(item?.offerPrice || 0));
  return {
    sourceId: String(item?.sourceId || "").trim(),
    company: String(item?.company || "").trim(),
    market: String(item?.market || "").trim(),
    filingDate: normalizeIsoDate(item?.filingDate),
    bookbuildingStart: normalizeIsoDate(item?.bookbuildingStart),
    bookbuildingEnd: normalizeIsoDate(item?.bookbuildingEnd),
    subscriptionStart: normalizeIsoDate(item?.subscriptionStart),
    subscriptionEnd: normalizeIsoDate(item?.subscriptionEnd),
    paymentDate: normalizeIsoDate(item?.paymentDate || item?.refundDate),
    offerPrice,
    offeringAmountMillions: Math.max(0, Number(item?.offeringAmountMillions || 0)),
    listingDate: normalizeIsoDate(item?.listingDate),
    broker: normalizeBroker(item?.broker),
    priceStatus: offerPrice > 0 ? "confirmed" : String(item?.priceStatus || "pending"),
    status: ["scheduled", "cancelled", "unavailable"].includes(String(item?.status)) ? String(item.status) : "scheduled",
    sourceName: String(item?.sourceName || "KRX KIND"),
    sourceUrl: String(item?.sourceUrl || ""),
    sourceUpdatedAt: String(item?.sourceUpdatedAt || ""),
    missingSince: String(item?.missingSince || "")
  };
}

function diffSchedules(previous, current) {
  return SCHEDULE_FIELDS.flatMap(([key, label]) => {
    const before = normalizeComparableValue(previous?.[key]);
    const after = normalizeComparableValue(current?.[key]);
    return before === after ? [] : [{ field: key, label, before, after }];
  });
}

function parseKindDateRange(value) {
  const dates = stripHtml(value).match(/\d{4}-\d{2}-\d{2}/g) || [];
  return { start: dates[0] || "", end: dates[1] || dates[0] || "" };
}

function parseKindDate(value) {
  return stripHtml(value).match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

function parseKindMoney(value) {
  const text = stripHtml(value);
  if (!text || text === "-") return 0;
  return Number(text.replace(/[^\d.-]/g, "")) || 0;
}

function stripHtml(value) {
  return decodeHtml(String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function normalizeBroker(value) {
  return String(value || "")
    .replace(/주식회사/g, "")
    .replace(/\(주\)/g, "")
    .replace(/엔에이치투자증권/g, "NH투자증권")
    .replace(/아이비케이투자증권/g, "IBK투자증권")
    .replace(/엘에스증권/g, "LS증권")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function isScheduleInRange(item, start, end) {
  const dates = [
    item.bookbuildingStart,
    item.bookbuildingEnd,
    item.subscriptionStart,
    item.subscriptionEnd,
    item.paymentDate,
    item.listingDate,
    item.filingDate
  ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))).sort();
  if (!dates.length) return false;
  return dates.at(-1) >= start && dates[0] <= end;
}

function compareSchedules(a, b) {
  const dateA = a.subscriptionStart || a.listingDate || a.filingDate || "9999-12-31";
  const dateB = b.subscriptionStart || b.listingDate || b.filingDate || "9999-12-31";
  return dateA.localeCompare(dateB, "ko-KR") || a.company.localeCompare(b.company, "ko-KR");
}

function normalizeComparableValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return String(value || "").trim();
}

function normalizeIsoDate(value) {
  const matched = String(value || "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || "";
  if (!matched || Number.isNaN(Date.parse(`${matched}T00:00:00Z`))) return "";
  return matched;
}

function daysBetween(from, to) {
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return 0;
  return Math.floor((toTime - fromTime) / 86400000);
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}
