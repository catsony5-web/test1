(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoalInsights = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DAY = 86400000;
  const MAX_ITEMS = 300;
  const SOURCES = Object.freeze([
    { id: "youtube", name: "YouTube 공식 블로그", feed: "https://blog.youtube/rss/", origin: "https://blog.youtube", path: "/" },
    { id: "wordpress", name: "WordPress.com 공식 블로그", feed: "https://wordpress.com/blog/feed/", origin: "https://wordpress.com", path: "/blog/" },
    { id: "shopify", name: "Shopify 공식 변경사항", feed: "https://changelog.shopify.com/feed.xml", origin: "https://changelog.shopify.com", path: "/posts/" }
  ]);
  const TOPICS = Object.freeze({
    video: { label: "영상·편집", meaning: "영상 형식과 제작 도구 소식을 내 취미 콘텐츠에 적용해 볼 단서입니다. 인기나 수익 증가를 뜻하지는 않습니다.", experiment: "잘 아는 주제 하나로 짧은 영상 시안 1개를 만들고, 지인 3명에게 이해하기 어려운 부분을 물어보세요.", caution: "음원·사진·출연자 사용 허락과 제작 시간을 먼저 확인하세요. 조회수를 매출로 환산하지 마세요." },
    audience: { label: "취향·발견", meaning: "플랫폼의 문화·발견 관련 소식입니다. 특정 취향의 고객이 무엇을 찾는지 질문을 만드는 참고자료입니다.", experiment: "내 취미의 초보자가 반복해서 묻는 질문 3개를 적고, 하나에 답하는 공개 샘플을 만들어 반응을 기록하세요.", caution: "해외 플랫폼 사례는 국내 수요를 보증하지 않습니다. 게시물 수나 유행 표현만으로 구매 수요를 판단하지 마세요." },
    writing: { label: "글·디지털 콘텐츠", meaning: "글·뉴스레터 운영과 수익화에 관한 공식 자료입니다. 내 경험을 작은 콘텐츠로 전달할 방법을 검토할 수 있습니다.", experiment: "취미 팁 1장을 무료 샘플로 작성하고, 관심 있는 독자 3명에게 더 알고 싶은 주제를 물어보세요.", caution: "유료 구독과 결제에는 비용·정책 조건이 있습니다. 개인정보를 받기 전에 동의와 보관 방식을 정하세요." },
    service: { label: "웹·제작 도구", meaning: "웹 제작 도구의 변화는 작은 제작 서비스를 연습할 재료입니다. 도구 도입이 곧 고객 확보를 뜻하지는 않습니다.", experiment: "가상의 취미 모임을 위한 소개 페이지 1개를 만들고, 제작·수정에 걸린 시간을 따로 기록하세요.", caution: "새 도구의 유료 요금제·상업 이용 조건을 확인하세요. 실제 고객 자료나 가계부를 외부 도구에 올리지 마세요." },
    product: { label: "상품·소규모 판매", meaning: "상품 구성·재고·판매 화면의 공식 업데이트입니다. 소량 판매에서 줄일 수 있는 운영 불편을 찾는 참고자료입니다.", experiment: "판매해 보고 싶은 상품 1개의 재료비·포장비·배송비를 적고, 사진과 설명만 담은 시안을 만들어 피드백을 받아보세요.", caution: "해당 국가·요금제에서만 제공될 수 있습니다. 주문을 받기 전 원가·배송·반품 조건을 확인하고 재고를 크게 늘리지 마세요." }
  });

  function safeSourceUrl(value, sourceId) {
    const source = SOURCES.find((item) => item.id === sourceId);
    if (!source || typeof value !== "string" || value.length > 1200 || /[\u0000-\u0020\\]/.test(value)) return "";
    try {
      const url = new URL(value);
      if (url.origin !== source.origin || url.username || url.password || !url.pathname.startsWith(source.path)) return "";
      url.hash = "";
      return url.href;
    } catch { return ""; }
  }

  function isoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : null;
  }

  function topicFor(sourceId, title) {
    if (sourceId === "shopify") return /\b(product|variants?|inventory|cart|checkout|storefront|bundles?|online store|discounts?|barcodes?)\b/i.test(title) && !/\b(tax|consent|privacy)\b/i.test(title) ? "product" : "";
    if (sourceId === "youtube") {
      if (/\b(shorts|vertical video|thumbnails?|podcast|partner program|creation tools)\b/i.test(title)) return "video";
      return /\b(culture|trends|mainstream)\b/i.test(title) ? "audience" : "";
    }
    if (sourceId === "wordpress") {
      if (/\b(ecommerce|woocommerce|store|products?)\b/i.test(title)) return "product";
      if (/\b(monetiz\w*|newsletter|writing|blogging)\b/i.test(title)) return "writing";
      if (/\b(traffic|audience|seo)\b/i.test(title)) return "audience";
      if (/\b(themes?|studio|website builder)\b/i.test(title)) return "service";
    }
    return "";
  }

  function normalizeItem(value, now = new Date()) {
    if (!value || typeof value.title !== "string" || !value.title.trim() || value.title.length > 400) return null;
    const url = safeSourceUrl(value.url, value.sourceId);
    const publishedAt = isoDate(value.publishedAt);
    const topicId = topicFor(value.sourceId, value.title);
    if (!url || !publishedAt || !topicId || new Date(publishedAt) > now) return null;
    return { sourceId: value.sourceId, title: value.title.trim(), url, publishedAt, topicId };
  }

  function normalizeSnapshot(value, now = new Date()) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.items) || value.items.length > MAX_ITEMS) return null;
    const updatedAt = value.updatedAt === null ? null : isoDate(value.updatedAt);
    const attemptedAt = value.attemptedAt === null ? null : isoDate(value.attemptedAt);
    if ((value.updatedAt !== null && !updatedAt) || (value.attemptedAt !== null && !attemptedAt)) return null;
    if ((updatedAt && (!attemptedAt || updatedAt > attemptedAt)) || (attemptedAt && new Date(attemptedAt) > now)) return null;
    const items = [...new Map(value.items.map((item) => normalizeItem(item, now)).filter(Boolean).map((item) => [item.url, item])).values()]
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    if (value.items.length && (!items.length || !updatedAt)) return null;
    const sources = Object.fromEntries(SOURCES.map((source) => [source.id, { state: value.sources?.[source.id]?.state === "ok" ? "ok" : "failed" }]));
    return { schemaVersion: 1, updatedAt, attemptedAt, refreshStatus: updatedAt && value.refreshStatus === "ok" && Object.values(sources).every((source) => source.state === "ok") ? "ok" : "stale", sources, items };
  }

  function periodStart(period, now = new Date()) {
    const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
    const today = new Date(`${day}T00:00:00+09:00`).getTime();
    return today - (({ today: 1, "7": 7, "30": 30, year: 365 }[period] || 7) - 1) * DAY;
  }

  function filterItems(items, period = "7", now = new Date()) {
    const start = periodStart(period, now);
    return items.filter((item) => new Date(item.publishedAt).getTime() >= start && new Date(item.publishedAt) <= now);
  }

  async function readBoundedText(response, maxBytes) {
    if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("response-too-large");
    if (!response.body?.getReader) throw new Error("response-stream-unavailable");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0, text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error("response-too-large");
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
  }

  return Object.freeze({ SOURCES, TOPICS, MAX_ITEMS, safeSourceUrl, isoDate, topicFor, normalizeItem, normalizeSnapshot, periodStart, filterItems, readBoundedText });
});

let goalInsightState = { snapshot: null, loading: false, attempted: false, error: false, period: "7", visible: 12 };

function goalInsightDate(value, withTime = false) {
  if (!value) return "아직 없음";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) }).format(new Date(value));
}

function renderGoalInsights() {
  return `<section class="goal-insights" data-goal-insights aria-labelledby="goalInsightsTitle">${renderGoalInsightContent()}</section>`;
}

function renderGoalInsightContent() {
  const { snapshot, loading, error, period, visible } = goalInsightState;
  const items = GoalInsights.filterItems(snapshot?.items || [], period);
  const stale = snapshot?.refreshStatus === "stale" || snapshot?.updatedAt && Date.now() - new Date(snapshot.updatedAt).getTime() > 48 * 3600000;
  const status = loading ? "배포된 공개 자료를 불러오는 중입니다." : error ? "자료를 새로 읽지 못했습니다. 이미 받은 자료가 있으면 그대로 표시합니다." : stale ? "최신 수집을 확인하지 못했습니다. 마지막 성공 자료를 표시합니다." : "공식 피드 하루 1회 수집 · 게시일 기준, 한국 시간";
  return `<div class="goal-insights-heading"><div><span class="goal-kicker">PUBLIC SOURCE NOTES</span><h4 id="goalInsightsTitle">부업·상품 아이디어 노트</h4><p>공식 업데이트 / 활용 아이디어. 바이럴 순위나 검증된 수익 정보가 아닙니다.</p></div><button type="button" data-goal-action="refresh-insights" aria-disabled="${loading}">${loading ? "불러오는 중" : "배포 자료 다시 읽기"}</button></div>
    <div class="goal-insights-toolbar"><div class="goal-insights-periods" role="group" aria-label="공개 소식 게시 기간">${[["today", "오늘"], ["7", "최근 7일"], ["30", "최근 30일"], ["year", "최근 1년"]].map(([value, label]) => `<button type="button" data-goal-action="filter-insights" data-goal-insight-period="${value}" aria-pressed="${period === value}">${label}</button>`).join("")}</div><span>${items.length}건</span></div>
    <p class="goal-insights-status" role="status">${escapeHtml(status)}</p>
    <p class="goal-insights-dates">마지막 수집 성공 ${escapeHtml(goalInsightDate(snapshot?.updatedAt, true))} · 마지막 수집 시도 ${escapeHtml(goalInsightDate(snapshot?.attemptedAt, true))}</p>
    ${items.length ? `<div class="goal-insights-list">${items.slice(0, visible).map(renderGoalInsightCard).join("")}</div>${items.length > visible ? `<button type="button" class="goal-insights-more" data-goal-action="more-insights">12건 더 보기 (${Math.min(visible, items.length)}/${items.length})</button>` : ""}` : `<div class="goal-insights-empty"><strong>${loading ? "공개 소식을 확인하고 있습니다" : "이 기간에 확인된 관련 소식이 없습니다"}</strong><p>${loading ? "가계부나 취미 입력 내용은 전송하지 않습니다." : "기간을 넓히거나 아래의 기본 실험 경로를 살펴보세요. 자료가 없을 때는 임의의 트렌드를 만들지 않습니다."}</p></div>`}
    <details class="goal-insights-method"><summary>자료 범위와 아이디어 작성 기준</summary><p>YouTube·WordPress.com·Shopify의 공개 영문 피드에서 제목 키워드로 관련 자료를 골라 최신순으로 표시합니다. 원문 제목·게시일은 출처 자료이며, 의미·작은 실험·주의점은 주제별 규칙으로 작성한 제안입니다. 원문 전체를 분석하거나 수익성을 검증한 결과가 아닙니다.</p><p>최근 1년 중 수집된 자료만 최대 300건 보관하므로 전체 연간 기록은 아닙니다. 국내 판매량·검색량·바이럴 속도 및 상품 수요 순위는 제공하지 않습니다. 국내 이용 가능 여부·지역·요금제 조건은 원문에서 확인하세요. 수집 작업에는 개인 가계부나 취미 입력을 보내지 않습니다.</p></details>`;
}

function renderGoalInsightCard(item) {
  const topic = GoalInsights.TOPICS[item.topicId];
  const source = GoalInsights.SOURCES.find((entry) => entry.id === item.sourceId);
  return `<article class="goal-insight-card"><div class="goal-insight-source"><span>${escapeHtml(topic.label)} · 공식 자료</span><time datetime="${escapeHtml(item.publishedAt)}">${escapeHtml(goalInsightDate(item.publishedAt))}</time></div><h5><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHtml(item.title)} <i class="ti ti-external-link" aria-hidden="true"></i></a></h5><p class="goal-insight-origin">${escapeHtml(source.name)} · 원문 제목</p><dl><div><dt>의미 · 아이디어</dt><dd>${escapeHtml(topic.meaning)}</dd></div><div><dt>작은 실험</dt><dd>${escapeHtml(topic.experiment)}</dd></div><div><dt>주의점</dt><dd>${escapeHtml(topic.caution)}</dd></div></dl></article>`;
}

function updateGoalInsightPanel() {
  const panel = els.goalPlannerRoot?.querySelector("[data-goal-insights]");
  if (!panel) return;
  const focus = typeof captureGoalFocus === "function" ? captureGoalFocus(panel) : null;
  panel.innerHTML = renderGoalInsightContent();
  if (focus) restoreGoalFocus(panel, focus);
}

function handleGoalInsightAction(button) {
  if (button.dataset.goalAction === "filter-insights") {
    if (!["today", "7", "30", "year"].includes(button.dataset.goalInsightPeriod)) return true;
    goalInsightState.period = button.dataset.goalInsightPeriod;
    goalInsightState.visible = 12;
    updateGoalInsightPanel();
    return true;
  }
  if (button.dataset.goalAction === "more-insights") {
    goalInsightState.visible += 12;
    updateGoalInsightPanel();
    return true;
  }
  if (button.dataset.goalAction === "refresh-insights") {
    void loadGoalInsights(true);
    return true;
  }
  return false;
}

async function loadGoalInsights(force = false) {
  if (goalInsightState.loading || goalInsightState.attempted && !force) return;
  goalInsightState.loading = true;
  goalInsightState.attempted = true;
  goalInsightState.error = false;
  updateGoalInsightPanel();
  try {
    const response = await fetch("./data/hobby-insights.json", { cache: "no-cache", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("snapshot-unavailable");
    const incoming = GoalInsights.normalizeSnapshot(JSON.parse(await GoalInsights.readBoundedText(response, 1024 * 1024)));
    if (!incoming) throw new Error("invalid-snapshot");
    const previous = goalInsightState.snapshot;
    if (previous?.updatedAt && (!incoming.updatedAt || incoming.updatedAt < previous.updatedAt)) throw new Error("older-snapshot");
    goalInsightState.snapshot = incoming;
  } catch {
    goalInsightState.error = true;
  } finally {
    goalInsightState.loading = false;
    updateGoalInsightPanel();
  }
}
