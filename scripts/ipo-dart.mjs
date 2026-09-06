// Official APIs: /api/list.json (C001) and /api/estkRs.json.
// Credentials stay in the scheduled job; never include request URLs in errors.
export function createDartClient(apiKey, fetchImpl = fetch) {
  if (!/^[a-zA-Z0-9]{40}$/.test(String(apiKey || "").trim())) throw new Error("DART_API_KEY is missing or invalid. Set the repository Actions secret.");
  let requests = 0;
  return async (endpoint, params) => {
    if (!['list.json', 'estkRs.json'].includes(endpoint)) throw new Error("Unsupported DART endpoint.");
    if (++requests > 800) throw new Error("DART per-run request budget exceeded; previous snapshot retained.");
    const url = new URL(`https://opendart.fss.or.kr/api/${endpoint}`);
    url.search = new URLSearchParams({ ...params, crtfc_key: apiKey.trim() }).toString();
    let response;
    let payload;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), redirect: "error" });
      if (response.ok) payload = await response.json();
    } catch {
      throw new Error(`DART ${endpoint}: network or response error; previous snapshot retained.`);
    }
    if (!response.ok) throw new Error(`DART ${endpoint}: HTTP ${response.status}.`);
    if (payload?.status === "013") return { status: "013", list: [], group: [] };
    if (payload?.status !== "000") {
      const code = /^\d{3}$/.test(String(payload?.status)) ? payload.status : "unknown";
      throw new Error(`DART ${endpoint}: status ${code}; previous snapshot retained.`);
    }
    return payload;
  };
}

export function dartDateRange(value) {
  const text = String(value || "");
  const dates = [...text.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)]
    .map((match) => `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`);
  const valid = dates.filter((date) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  });
  if (!valid.length || valid.length !== dates.length || valid.length > 2) return { start: "", end: "" };
  if (valid.length === 1 && /[~∼～]/.test(text)) return { start: "", end: "" };
  const [start, end = start] = valid;
  return start <= end ? { start, end } : { start: "", end: "" };
}

function money(value) {
  const text = String(value || "").trim();
  return /^\d[\d,]*$/.test(text) ? Number(text.replaceAll(",", "")) : 0;
}

export function ipoCompanyKey(value) {
  return String(value || "").normalize("NFKC").replace(/주식회사|\(주\)|㈜/g, "")
    .replace(/기업인수목적/g, "스팩").replace(/엔에이치/g, "NH").replace(/케이비/g, "KB")
    .replace(/\s+/g, "").toUpperCase();
}

export function dartSearchWindows(from, to) {
  const windows = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  while (cursor <= last) {
    // At most 90 inclusive days: within the API's three-month search limit.
    const end = new Date(Math.min(last.getTime(), cursor.getTime() + 89 * 86400000));
    windows.push({ bgn_de: cursor.toISOString().slice(0, 10).replaceAll("-", ""), end_de: end.toISOString().slice(0, 10).replaceAll("-", "") });
    cursor = new Date(end.getTime() + 86400000);
  }
  return windows;
}

export function parseDartOffering(payload, filing, checkedDate) {
  if (!Array.isArray(payload.group)) throw new Error("DART offering response has no groups.");
  const general = payload.group.find((group) => group.title === "일반사항")?.list;
  const securities = payload.group.find((group) => group.title === "증권의종류")?.list;
  const underwriters = payload.group.find((group) => group.title === "인수인정보")?.list || [];
  if (!Array.isArray(general) || !Array.isArray(securities)) throw new Error("DART offering response is missing required groups.");
  const eligible = general.filter((row) => securities.some((security) => security.rcept_no === row.rcept_no
    && /일반공모/.test(security.slmthn || "") && !/주주|제3자/.test(security.slmthn || "")))
    .sort((a, b) => String(b.rcept_no).localeCompare(String(a.rcept_no)));
  const row = eligible[0];
  if (!row) return null;
  const range = dartDateRange(row.sbd);
  const securityRows = securities.filter((entry) => entry.rcept_no === row.rcept_no);
  const prices = [...new Set(securityRows.map((entry) => money(entry.slprc)).filter(Boolean))];
  const reportedOfferPrice = prices.length === 1 ? prices[0] : 0;
  const confirmed = row.rcept_no === filing.rcept_no && /발행조건확정/.test(filing.report_nm || "");
  const cancelled = /철회/.test(filing.report_nm || "") || /철/.test(filing.rm || "");
  const brokers = [...new Set(underwriters.filter((entry) => entry.rcept_no === row.rcept_no)
    .map((entry) => String(entry.actnmn || "").replace(/주식회사|\(주\)/g, "").trim()).filter((value) => value && value !== "-"))];
  return {
    sourceId: `dart-${filing.corp_code}`,
    company: row.corp_name || filing.corp_name,
    corpCode: filing.corp_code,
    market: ({ Y: "유가증권", K: "코스닥", N: "코넥스" })[row.corp_cls] || "상장시장 확인 필요",
    filingDate: `${row.rcept_no.slice(0, 4)}-${row.rcept_no.slice(4, 6)}-${row.rcept_no.slice(6, 8)}`,
    subscriptionStart: range.start, subscriptionEnd: range.end,
    paymentDate: dartDateRange(row.pymd).start,
    listingDate: "", bookbuildingStart: "", bookbuildingEnd: "",
    broker: brokers.join(", "),
    offerPrice: confirmed ? reportedOfferPrice : 0,
    reportedOfferPrice,
    offeringAmountMillions: confirmed ? securityRows.reduce((sum, entry) => sum + money(entry.slta), 0) / 1000000 : 0,
    priceStatus: confirmed && reportedOfferPrice ? "confirmed" : "pending",
    status: cancelled ? "cancelled" : "scheduled",
    sourceName: "DART", sourceUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${filing.rcept_no}`,
    sources: [{ name: "DART", url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${filing.rcept_no}`, checkedDate, reportDate: filing.rcept_dt }],
    reviewNotes: [
      ...(!range.start ? ["청약일을 자동 해석하지 못했습니다. 공식 원문을 확인하세요."] : []),
      ...(row.rcept_no !== filing.rcept_no && !cancelled ? ["최신 공시와 구조화 자료의 접수번호가 다릅니다. 정정 내용을 확인하세요."] : [])
    ]
  };
}

export async function fetchDartSchedules({ request, window, kindItems, previousItems = [], checkedDate }) {
  const filings = new Map();
  for (const range of dartSearchWindows(window.queryStart, window.queryEnd)) {
    let page = 1;
    let totalPages = 1;
    do {
      const payload = await request("list.json", { ...range, pblntf_detail_ty: "C001", last_reprt_at: "N", page_no: String(page), page_count: "100", sort: "date", sort_mth: "desc" });
      if (payload.status === "013") break;
      if (!Array.isArray(payload.list) || !Number.isInteger(Number(payload.total_page)) || Number(payload.total_page) < 1) throw new Error("DART filing list schema changed.");
      for (const filing of payload.list) {
        if (!/^\d{8}$/.test(filing.corp_code) || !/^\d{14}$/.test(filing.rcept_no)) throw new Error("DART filing identity is invalid.");
        const previous = filings.get(filing.corp_code);
        if (!previous || previous.rcept_no < filing.rcept_no) filings.set(filing.corp_code, filing);
      }
      totalPages = Number(payload.total_page);
    } while (++page <= totalPages);
  }
  const knownNames = new Set(kindItems.map((item) => ipoCompanyKey(item.company)));
  const knownCodes = new Set(previousItems.map((item) => item.corpCode).filter(Boolean));
  const candidates = [...filings.values()].filter((filing) => ["E", "N"].includes(filing.corp_cls)
    || knownNames.has(ipoCompanyKey(filing.corp_name)) || knownCodes.has(filing.corp_code));
  const items = [];
  const unresolved = [];
  for (const filing of candidates) {
    const payload = await request("estkRs.json", { corp_code: filing.corp_code, bgn_de: window.queryStart.replaceAll("-", ""), end_de: window.queryEnd.replaceAll("-", "") });
    if (payload.status === "013") {
      // Do not silently describe an incomplete source as a complete IPO calendar.
      unresolved.push({ company: filing.corp_name, receipt: filing.rcept_no });
      continue;
    }
    const item = parseDartOffering(payload, filing, checkedDate);
    if (item) items.push(item);
  }
  return { items, unresolved, checkedCompanies: candidates.length };
}
