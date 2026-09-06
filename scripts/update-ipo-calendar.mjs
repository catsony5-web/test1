import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  const now = new Date();
  const window = monthWindow(now);
  const previous = await readPreviousSnapshot();
  const fetched = await fetchAllKindSchedules(window.queryStart, window.queryEnd);
  if (!fetched.length) throw new Error("KRX KIND returned no IPO schedule rows; keeping the previous snapshot.");

  const checkedDate = now.toISOString().slice(0, 10);
  const dart = await fetchDartSchedules({ request: createDartClient(process.env.DART_API_KEY), window, kindItems: fetched, previousItems: previous.items, checkedDate });
  const combined = combineOfficialSchedules(fetched, dart.items, officialIpoSupplements, previous.items, checkedDate);

  const items = mergeScheduleSnapshot(combined, previous.items, {
    now: now.toISOString(),
    rangeStart: window.rangeStart,
    rangeEnd: window.rangeEnd
  });
  if (!items.length) throw new Error("No IPO schedules remained after validation; keeping the previous snapshot.");

  const previousSemantic = semanticScheduleSnapshot(previous.items);
  const nextSemantic = semanticScheduleSnapshot(items);
  if (JSON.stringify(previousSemantic) === JSON.stringify(nextSemantic) && previous.checkedDate === checkedDate) {
    console.log(`IPO schedule unchanged (${items.length} items).`);
    return;
  }

  const payload = {
    schemaVersion: 3,
    updatedAt: now.toISOString(),
    checkedDate,
    coverage: { kindCount: fetched.length, dartCount: dart.items.length, dartCheckedCompanies: dart.checkedCompanies, unresolved: dart.unresolved },
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

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Updated ${path.relative(projectRoot, outputPath)} with ${items.length} items.`);
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

async function readPreviousSnapshot() {
  try {
    const parsed = JSON.parse(await readFile(outputPath, "utf8"));
    return { ...parsed, items: Array.isArray(parsed?.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

await main();
