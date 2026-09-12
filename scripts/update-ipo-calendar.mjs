import { readFile, open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  mergeScheduleSnapshot,
  monthWindow,
  parseKindIpoHtml,
  parseKindTotalCount,
  semanticScheduleSnapshot,
  combineOfficialSchedules
} from "./ipo-calendar-lib.mjs";
import { createDartClient, fetchDartSchedules } from "./ipo-dart.mjs";
import { officialIpoSupplements } from "./ipo-official-supplements.mjs";

const KIND_LIST_URL = "https://kind.krx.co.kr/listinvstg/pubofrprogcom.do";
const KIND_MAIN_URL = `${KIND_LIST_URL}?method=searchPubofrProgComMain`;
const PAGE_SIZE = 100;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "data", "ipo-calendar.json");

async function main() {
  const previous = await readPreviousSnapshot();
  const payload = await refreshIpoSnapshot({ previous });
  if (!payload) {
    console.log(`IPO schedule unchanged (${previous.items.length} items).`);
    return;
  }
  await writeSnapshotAtomically(outputPath, payload);
  if (payload.coverage.refreshStatus.state === "stale") {
    const failed = Object.entries(payload.coverage.refreshStatus.sources)
      .filter(([, status]) => status.state === "failed").map(([source]) => source.toUpperCase());
    console.warn(`::warning::${failed.join(", ")} schedule refresh failed; previous verified schedules retained.`);
  }
  console.log(`Updated ${path.relative(projectRoot, outputPath)} with ${payload.items.length} items.`);
}

export async function refreshIpoSnapshot({ previous, now = new Date(), fetchKind = fetchAllKindSchedules,
  fetchDart = (options) => fetchDartSchedules({ ...options, request: createDartClient(process.env.DART_API_KEY) }) }) {
  const window = monthWindow(now);
  const checkedDate = now.toISOString().slice(0, 10);
  const sources = {};
  let fetched = [], dart;
  try {
    fetched = await fetchKind(window.queryStart, window.queryEnd);
    if (!Array.isArray(fetched) || !fetched.length) throw new Error("Empty KRX response");
    sources.kind = { state: "ok" };
  } catch (error) {
    sources.kind = { state: "failed", reason: sourceFailureReason(error) };
  }
  try {
    // Previous names are discovery hints only; failed-source data is never treated as a fresh response.
    dart = await fetchDart({ window, kindItems: sources.kind.state === "ok" ? fetched : previous.items,
      previousItems: previous.items, checkedDate });
    if (!dart || !Array.isArray(dart.items)) throw new Error("Invalid DART response");
    sources.dart = { state: "ok" };
  } catch (error) {
    sources.dart = { state: "failed", reason: sourceFailureReason(error) };
  }
  const refreshStatus = { state: Object.values(sources).some((source) => source.state === "failed") ? "stale" : "ok",
    attemptedAt: now.toISOString(), sources };
  if (refreshStatus.state === "stale") {
    if (!previous.items.length) throw new Error("Official source refresh failed and no verified snapshot is available.");
    // Do not infer missing, cancelled or deleted listings from an incomplete source response.
    return { ...previous, coverage: { ...previous.coverage, refreshStatus } };
  }
  const combined = combineOfficialSchedules(fetched, dart.items, officialIpoSupplements, previous.items, checkedDate);

  const items = mergeScheduleSnapshot(combined, previous.items, {
    now: now.toISOString(),
    rangeStart: window.rangeStart,
    rangeEnd: window.rangeEnd
  });
  if (!items.length) throw new Error("No IPO schedules remained after validation; keeping the previous snapshot.");

  const previousSemantic = semanticScheduleSnapshot(previous.items);
  const nextSemantic = semanticScheduleSnapshot(items);
  if (JSON.stringify(previousSemantic) === JSON.stringify(nextSemantic) && previous.checkedDate === checkedDate
      && previous.coverage?.refreshStatus?.state !== "stale") {
    return null;
  }

  const payload = {
    schemaVersion: 3,
    updatedAt: now.toISOString(),
    checkedDate,
    coverage: { kindCount: fetched.length, dartCount: dart.items.length, dartCheckedCompanies: dart.checkedCompanies, unresolved: dart.unresolved, refreshStatus },
    source: {
      name: "KRX KIND + DART",
      url: KIND_MAIN_URL,
      notice: "공식 자료를 대조한 참고 일정입니다. 자료 반영 지연·누락 및 정정이 있을 수 있으며 청약 전 주관사 안내를 확인하세요."
    },
    range: {
      from: window.rangeStart,
      to: window.rangeEnd,
      label: "최근 3개월 · 향후 12개월"
    },
    itemCount: items.length,
    items
  };

  return payload;
}

function sourceFailureReason(error) {
  const status = String(error?.message || "").match(/\bHTTP (\d{3})\b/)?.[1];
  return status ? `HTTP ${status}` : error?.name === "TimeoutError" ? "timeout" : "request-failed";
}

export async function writeSnapshotAtomically(file, payload) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const handle = await open(temporary, "wx");
    created = true;
    try { await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, "utf8"); }
    finally { await handle.close(); }
    await rename(temporary, file);
  } finally {
    if (created) await rm(temporary, { force: true });
  }
}

async function fetchAllKindSchedules(fromDate, toDate) {
  const firstHtml = await fetchKindPage(1, fromDate, toDate);
  const firstItems = parseKindIpoHtml(firstHtml);
  const total = parseKindTotalCount(firstHtml) || firstItems.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = [...firstItems];

  for (let page = 2; page <= totalPages; page += 1) {
    await delay(250);
    items.push(...parseKindIpoHtml(await fetchKindPage(page, fromDate, toDate)));
  }

  const unique = [...new Map(items.map((item) => [item.sourceId, item])).values()];
  if (unique.length !== total) throw new Error("KRX KIND row count mismatch; previous snapshot retained.");
  return unique;
}

async function fetchKindPage(pageIndex, fromDate, toDate) {
  const body = new URLSearchParams({
    method: "searchPubofrProgComSub",
    forward: "pubofrprogcom_sub",
    currentPageSize: String(PAGE_SIZE),
    pageIndex: String(pageIndex),
    orderMode: "1",
    orderStat: "D",
    marketType: "",
    repMajAgntDesignAdvserComp: "",
    searchCorpName: "",
    fromDate,
    toDate
  });
  const response = await fetch(KIND_LIST_URL, {
    method: "POST",
    headers: {
      accept: "text/html, */*; q=0.01",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer: KIND_MAIN_URL,
      "user-agent": "Mozilla/5.0 (compatible; IPOCalendarUpdater/1.0; +https://github.com/catsony5-web/test1)"
    },
    body,
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`KRX KIND request failed: HTTP ${response.status}`);
  return response.text();
}

export async function readPreviousSnapshot(file = outputPath) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(parsed?.items)) throw new Error("Invalid existing schedule snapshot; refresh stopped.");
    return parsed;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { items: [] };
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
