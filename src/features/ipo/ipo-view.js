const IPO_NORMALIZED_TSV_COLUMNS = [
  "원본ID", "매도일", "상장일", "공모주", "기본종목", "증권사", "공모가", "수량", "1주매도가",
  "총매도금액", "청약수수료", "고가", "시가", "종가", "원본손익률", "원본손익", "계산방식", "배정결과", "메모"
];
const IPO_IMPORT_REFERENCE_PATTERN = /(?:원본|PDF)\s*(?:기재\s*)?(?:결산\s*)?합계\s*[:：]?\s*([+-]?[\d,]+)\s*원?\s*[.·-]?\s*/;
let ipoImportReferenceTotal = null;
const IPO_SCHEDULE_MANAGED_FIELDS = [
  { local: "market", source: "market", label: "시장" },
  { local: "broker", source: "broker", label: "주관사" },
  { local: "subscriptionStart", source: "subscriptionStart", label: "청약 시작" },
  { local: "subscriptionEnd", source: "subscriptionEnd", label: "청약 종료" },
  { local: "refundDate", source: "paymentDate", label: "환불/납입일" },
  { local: "listingDate", source: "listingDate", label: "상장 예정일" },
  { local: "offerPrice", source: "offerPrice", label: "확정 공모가", requireValue: true }
];
const IPO_CALENDAR_COMPACT_EVENT_LIMIT = 2;

function handleIpoSubmit(event) {
  event.preventDefault();
  saveIpoFromForm();
}

async function saveIpoFromForm() {
  const company = els.ipoCompany.value.trim();
  if (!company) {
    alert("공모주 종목명을 입력해주세요.");
    return;
  }
  const existingRecord = ipoRecords.find((item) => item.id === els.ipoId.value);
  const record = normalizeIpoRecord({
    id: els.ipoId.value || `ipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    company,
    market: els.ipoMarket.value.trim(),
    broker: els.ipoBroker.value.trim(),
    subscriptionStart: els.ipoSubscriptionStart.value,
    subscriptionEnd: els.ipoSubscriptionEnd.value,
    refundDate: els.ipoRefundDate.value,
    listingDate: els.ipoListingDate.value,
    offerPrice: els.ipoOfferPrice.value,
    appliedShares: els.ipoAppliedShares.value,
    depositAmount: els.ipoDepositAmount.value,
    applicationFee: els.ipoApplicationFee.value,
    allocatedShares: els.ipoAllocatedShares.value,
    allocationResult: els.ipoAllocationResult.value,
    sellDate: els.ipoSellDate.value,
    sellPrice: els.ipoSellPrice.value,
    sellAmount: els.ipoSellAmount.value,
    sellFee: els.ipoSellFee.value,
    openPrice: els.ipoOpenPrice.value,
    highPrice: els.ipoHighPrice.value,
    closePrice: els.ipoClosePrice.value,
    memo: els.ipoMemo.value.trim(),
    imageData: ipoImageDraftData,
    imageName: ipoImageDraftName,
    sourceRecordId: existingRecord?.sourceRecordId || "",
    baseCompany: existingRecord?.baseCompany || company,
    calculationVersion: existingRecord ? existingRecord.calculationVersion : "quantity-v2",
    reportedProfit: existingRecord?.reportedProfit,
    reportedProfitRate: existingRecord?.reportedProfitRate,
    hasReportedProfit: existingRecord?.hasReportedProfit,
    hasReportedProfitRate: existingRecord?.hasReportedProfitRate,
    rawSellValue: existingRecord?.rawSellValue || "",
    source: existingRecord?.source || "manual",
    sourceLabel: existingRecord?.sourceLabel || "직접 입력",
    scheduleId: existingRecord?.scheduleId || "",
    scheduleFingerprint: existingRecord?.scheduleFingerprint || "",
    scheduleStatus: existingRecord?.scheduleStatus || "",
    scheduleSourceUrl: existingRecord?.scheduleSourceUrl || "",
    scheduleSyncedAt: existingRecord?.scheduleSyncedAt || "",
    createdAt: existingRecord?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await createAutoSnapshot("공모주 기록 저장 전");
  const index = ipoRecords.findIndex((item) => item.id === record.id);
  if (index >= 0) ipoRecords[index] = record;
  else ipoRecords.unshift(record);
  await saveIpoRecords();
  resetIpoForm();
  selectedIpoSubtab = "records";
  renderIpoView();
}

function renderIpoView() {
  if (!els.ipoList) return;
  syncIpoSubtabs();
  syncIpoFilters();
  updateIpoComputedPreview();
  renderIpoSummary();
  renderIpoCumulativePerformance();
  renderIpoPerformance();
  renderIpoCalendar();
  renderIpoList();
  renderIpoPastePreview();
}

function syncIpoSubtabs() {
  const tabs = Array.from(els.ipoSubtabs || []);
  const panels = Array.from(els.ipoSubtabPanels || []);
  const available = tabs.map((tab) => tab.dataset.ipoSubtab);
  if (!available.includes(selectedIpoSubtab)) selectedIpoSubtab = "dashboard";
  tabs.forEach((tab) => {
    const isActive = tab.dataset.ipoSubtab === selectedIpoSubtab;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.ipoPanel !== selectedIpoSubtab;
  });
}

function resetIpoForm() {
  els.ipoForm?.reset();
  els.ipoId.value = "";
  editingIpoId = "";
  els.saveIpoButton.textContent = "공모주 기록 저장";
  els.cancelIpoEditButton.hidden = true;
  if (els.ipoAllocationResult) els.ipoAllocationResult.value = "";
  clearIpoImageDraft();
  updateIpoComputedPreview();
}

async function handleIpoImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("이미지 파일만 첨부할 수 있습니다.");
    clearIpoImageDraft();
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    alert("이미지는 8MB 이하 파일을 사용해주세요.");
    clearIpoImageDraft();
    return;
  }
  try {
    const dataUrl = await readIpoImageFile(file);
    const compressed = await compressIpoImage(dataUrl);
    setIpoImageDraft(compressed, file.name);
  } catch (error) {
    console.error(error);
    alert("이미지를 불러오지 못했습니다.");
    clearIpoImageDraft();
  }
}

function readIpoImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function compressIpoImage(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 1200;
      const maxHeight = 900;
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function setIpoImageDraft(dataUrl = "", imageName = "") {
  ipoImageDraftData = /^data:image\//.test(String(dataUrl || "")) ? String(dataUrl) : "";
  ipoImageDraftName = String(imageName || "").trim();
  renderIpoImagePreview();
}

function clearIpoImageDraft() {
  ipoImageDraftData = "";
  ipoImageDraftName = "";
  if (els.ipoImage) els.ipoImage.value = "";
  renderIpoImagePreview();
}

function renderIpoImagePreview() {
  if (!els.ipoImagePreview) return;
  if (!ipoImageDraftData) {
    els.ipoImagePreview.classList.add("empty");
    els.ipoImagePreview.innerHTML = "첨부한 이미지가 여기에 표시됩니다.";
    return;
  }
  els.ipoImagePreview.classList.remove("empty");
  els.ipoImagePreview.innerHTML = `
    <img src="${escapeHtml(ipoImageDraftData)}" alt="${escapeHtml(ipoImageDraftName || "공모주 참고 이미지")}">
    ${ipoImageDraftName ? `<span>${escapeHtml(ipoImageDraftName)}</span>` : ""}
  `;
}

function renderIpoAttachedImage(item, className = "") {
  if (!item?.imageData) return "";
  const classes = ["ipo-attached-image", className].filter(Boolean).join(" ");
  return `
    <figure class="${escapeHtml(classes)}">
      <img src="${escapeHtml(item.imageData)}" alt="${escapeHtml(item.imageName || `${item.company} 참고 이미지`)}">
      ${item.imageName ? `<figcaption>${escapeHtml(item.imageName)}</figcaption>` : ""}
    </figure>
  `;
}

function updateIpoComputedPreview() {
  if (!els.ipoComputedProfit || !els.ipoComputedRate) return;
  const editingRecord = ipoRecords.find((item) => item.id === els.ipoId?.value);
  const preview = normalizeIpoRecord({
    company: els.ipoCompany?.value || "미리보기",
    offerPrice: els.ipoOfferPrice?.value,
    applicationFee: els.ipoApplicationFee?.value,
    allocatedShares: els.ipoAllocatedShares?.value,
    allocationResult: els.ipoAllocationResult?.value,
    sellPrice: els.ipoSellPrice?.value,
    sellAmount: els.ipoSellAmount?.value,
    sellFee: els.ipoSellFee?.value,
    calculationVersion: editingRecord ? editingRecord.calculationVersion : "quantity-v2",
    reportedProfit: editingRecord?.reportedProfit,
    reportedProfitRate: editingRecord?.reportedProfitRate,
    hasReportedProfit: editingRecord?.hasReportedProfit,
    hasReportedProfitRate: editingRecord?.hasReportedProfitRate
  });
  els.ipoComputedProfit.textContent = formatSignedWon(preview.profit);
  els.ipoComputedProfit.className = preview.profit > 0 ? "positive" : preview.profit < 0 ? "negative" : "";
  els.ipoComputedRate.textContent = `${formatIpoRate(preview.profitRate)}`;
  if (els.ipoComputedSettlementProfit) {
    els.ipoComputedSettlementProfit.textContent = formatSignedWon(preview.settlementProfit);
    els.ipoComputedSettlementProfit.className = preview.settlementProfit > 0 ? "positive" : preview.settlementProfit < 0 ? "negative" : "";
  }
}

function renderIpoSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const active = ipoRecords.filter((item) => !isIpoUnallocated(item) && !isIpoRealized(item));
  const waitingAllocation = ipoRecords.filter((item) => !isIpoUnallocated(item) && item.subscriptionEnd && item.subscriptionEnd < today && !item.allocatedShares);
  const waitingSell = ipoRecords.filter((item) => !isIpoUnallocated(item) && Number(item.allocatedShares || 0) > 0 && !isIpoRealized(item));
  const performance = getIpoPerformanceMetrics();
  const summaryGroups = {
    active: createIpoSummaryGroup("active", "진행 중", active),
    allocation: createIpoSummaryGroup("allocation", "배정 대기", waitingAllocation),
    sell: createIpoSummaryGroup("sell", "매도 대기", waitingSell)
  };
  if (!summaryGroups[selectedIpoSummaryGroup]?.targets.length || summaryGroups[selectedIpoSummaryGroup].targets.length < 2) {
    selectedIpoSummaryGroup = "";
  }
  const cards = [
    renderIpoSummaryCard("진행 중", `${active.length.toLocaleString("ko-KR")}건`, "청약·배정·매도 대기", 0, summaryGroups.active),
    renderIpoSummaryCard("배정 대기", `${waitingAllocation.length.toLocaleString("ko-KR")}건`, "청약 종료 후 배정 미입력", 0, summaryGroups.allocation),
    renderIpoSummaryCard("매도 대기", `${waitingSell.length.toLocaleString("ko-KR")}건`, "배정 후 매도 미입력", 0, summaryGroups.sell),
    renderIpoSummaryCard("누적 손익", formatSignedWon(performance.realizedProfit), "수수료 제외 손익", performance.realizedProfit),
    renderIpoSummaryCard("최종 정산 손익", formatSignedWon(performance.settlementProfit), `${performance.realizedCount.toLocaleString("ko-KR")}건 수수료 반영`, performance.settlementProfit),
    renderIpoSummaryCard("승률", `${performance.winRate}%`, `${performance.winCount}/${performance.realizedCount}건 정산 수익`)
  ];
  if (selectedIpoSummaryGroup) cards.push(renderIpoSummaryJumpPanel(summaryGroups[selectedIpoSummaryGroup]));
  els.ipoSummaryCards.innerHTML = cards.join("");
  attachIpoSummaryHandlers(summaryGroups);
}

function createIpoSummaryGroup(key, label, items) {
  const targets = items
    .map((item) => ({ item, event: getIpoSummaryJumpEvent(item, key) }))
    .filter((target) => target.event)
    .sort((a, b) => a.event.date.localeCompare(b.event.date, "ko-KR") || a.item.company.localeCompare(b.item.company, "ko-KR"));
  return { key, label, items, targets };
}

function getIpoSummaryJumpEvent(item, groupKey, today = new Date().toISOString().slice(0, 10)) {
  const events = buildIpoRecordCalendarEvents(item);
  if (!events.length) return null;
  const priorities = groupKey === "allocation"
    ? ["subscriptionEnd", "refundDate", "subscriptionStart", "listingDate", "listingAndSell", "sellDate"]
    : groupKey === "sell"
      ? ["listingDate", "listingAndSell", "refundDate", "subscriptionEnd", "subscriptionStart", "sellDate"]
      : [];
  for (const key of priorities) {
    const event = events.find((candidate) => candidate.key === key);
    if (event) return event;
  }
  const todayTime = Date.parse(`${today}T00:00:00`);
  return [...events].sort((a, b) => {
    const distanceA = Math.abs(Date.parse(`${a.date}T00:00:00`) - todayTime);
    const distanceB = Math.abs(Date.parse(`${b.date}T00:00:00`) - todayTime);
    return distanceA - distanceB || a.date.localeCompare(b.date, "ko-KR");
  })[0];
}

function renderIpoSummaryJumpPanel(group) {
  return `
    <section class="ipo-summary-jump-panel" aria-label="${escapeHtml(group.label)} 종목 선택">
      <div class="ipo-summary-jump-head">
        <div>
          <span>${escapeHtml(group.label)}</span>
          <strong>이동할 종목을 선택하세요</strong>
        </div>
        <button type="button" data-close-ipo-summary aria-label="종목 선택 목록 닫기"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
      <div class="ipo-summary-jump-list">
        ${group.targets.map(({ item, event }) => `
          <button type="button" data-ipo-summary-record="${escapeHtml(item.id)}" data-ipo-summary-group="${escapeHtml(group.key)}">
            <span class="ipo-event-type">${escapeHtml(event.type)}</span>
            <strong>${escapeHtml(item.company)}</strong>
            <small>${escapeHtml([item.broker, formatIpoDisplayDate(event.date)].filter(Boolean).join(" · "))}</small>
            <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function attachIpoSummaryHandlers(groups) {
  els.ipoSummaryCards.querySelectorAll("[data-ipo-summary-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = groups[button.dataset.ipoSummaryAction];
      if (!group?.targets.length) return;
      if (group.targets.length === 1) {
        jumpToIpoCalendarEvent(group.targets[0].event);
        return;
      }
      selectedIpoSummaryGroup = selectedIpoSummaryGroup === group.key ? "" : group.key;
      renderIpoSummary();
      if (selectedIpoSummaryGroup) {
        requestAnimationFrame(() => {
          const firstTarget = els.ipoSummaryCards.querySelector("[data-ipo-summary-record]");
          firstTarget?.focus({ preventScroll: true });
          firstTarget?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "center"
          });
        });
      }
    });
  });
  els.ipoSummaryCards.querySelector("[data-close-ipo-summary]")?.addEventListener("click", () => {
    const returnGroup = selectedIpoSummaryGroup;
    selectedIpoSummaryGroup = "";
    renderIpoSummary();
    requestAnimationFrame(() => els.ipoSummaryCards.querySelector(`[data-ipo-summary-action="${returnGroup}"]`)?.focus());
  });
  els.ipoSummaryCards.querySelectorAll("[data-ipo-summary-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = groups[button.dataset.ipoSummaryGroup];
      const target = group?.targets.find((candidate) => candidate.item.id === button.dataset.ipoSummaryRecord);
      if (target) jumpToIpoCalendarEvent(target.event);
    });
  });
}

function jumpToIpoCalendarEvent(event) {
  if (!event?.date || !event?.item?.id) return;
  selectedIpoSummaryGroup = "";
  selectedIpoSubtab = "dashboard";
  selectedIpoCalendarMonth = monthKey(event.date);
  selectedIpoCalendarDate = event.date;
  selectedIpoCalendarRecordId = event.item.id;
  selectedIpoCalendarEventKey = event.key;
  renderIpoView();
  requestAnimationFrame(() => {
    document.querySelector(".ipo-calendar-panel")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
    const selectedEvent = [...els.ipoCalendarGrid.querySelectorAll(".ipo-calendar-event")].find((node) =>
      node.dataset.ipoCalendarDate === selectedIpoCalendarDate
      && node.dataset.ipoCalendarRecord === selectedIpoCalendarRecordId
      && node.dataset.ipoCalendarEvent === selectedIpoCalendarEventKey
    );
    selectedEvent?.focus({ preventScroll: true });
  });
}

function getIpoPerformanceMetrics() {
  const realized = ipoRecords.filter(isIpoRealized);
  const realizedProfit = realized.reduce((total, item) => total + Number(item.profit || 0), 0);
  const settlementProfit = realized.reduce((total, item) => total + Number(item.settlementProfit || 0), 0);
  const winCount = realized.filter((item) => Number(item.settlementProfit || 0) > 0).length;
  const realizedCount = realized.length;
  return {
    realizedProfit,
    settlementProfit,
    winCount,
    realizedCount,
    winRate: realizedCount ? Math.round(winCount / realizedCount * 100) : 0,
    averageSettlementProfit: realizedCount ? Math.round(settlementProfit / realizedCount) : 0
  };
}

function renderIpoCumulativePerformance() {
  if (!els.ipoCumulativePerformance) return;
  const performance = getIpoPerformanceMetrics();
  const tone = performance.settlementProfit > 0 ? "positive" : performance.settlementProfit < 0 ? "negative" : "";
  els.ipoCumulativePerformance.innerHTML = `
    <div class="ipo-cumulative-primary">
      <span><i class="ti ti-chart-line" aria-hidden="true"></i> 전체 기간 누적</span>
      <strong class="${tone}">${escapeHtml(formatSignedWon(performance.settlementProfit))}</strong>
      <small>최종 정산손익 · 청약 및 매도 수수료 반영</small>
    </div>
    <dl>
      <div><dt>실현</dt><dd>${performance.realizedCount.toLocaleString("ko-KR")}건</dd></div>
      <div><dt>승률</dt><dd>${performance.winRate}%</dd></div>
      <div><dt>평균 정산손익</dt><dd class="${tone}">${escapeHtml(formatSignedWon(performance.averageSettlementProfit))}</dd></div>
    </dl>
  `;
}

function hydrateIpoPerformanceSelection() {
  const preference = appSettings.ipoPerformance || defaultAppSettings().ipoPerformance;
  selectedIpoPerformancePeriod = preference.filter || "all";
  selectedIpoPerformanceStartMonth = preference.startMonth || "";
  selectedIpoPerformanceEndMonth = preference.endMonth || "";
}

async function persistIpoPerformanceSelection() {
  appSettings.ipoPerformance = {
    filter: selectedIpoPerformancePeriod,
    startMonth: selectedIpoPerformanceStartMonth,
    endMonth: selectedIpoPerformanceEndMonth
  };
  await saveSettings();
}

function isIpoPerformanceMonthKey(value) {
  const text = String(value || "");
  const monthNumber = Number(text.slice(5));
  return /^\d{4}-\d{2}$/.test(text) && monthNumber >= 1 && monthNumber <= 12;
}

function getIpoPerformanceRangeIssue(startMonth, endMonth) {
  if (!isIpoPerformanceMonthKey(startMonth) || !isIpoPerformanceMonthKey(endMonth)) return "missing";
  if (startMonth > endMonth) return "order";
  return "";
}

function getIpoRealizedRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .filter((item) => isIpoRealized(item) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.sellDate || "")))
    .sort((a, b) => a.sellDate.localeCompare(b.sellDate));
}

function getIpoPerformanceMonthBounds(records = []) {
  const realized = getIpoRealizedRecords(records);
  return {
    startMonth: realized.length ? monthKey(realized[0].sellDate) : "",
    endMonth: realized.length ? monthKey(realized.at(-1).sellDate) : ""
  };
}

async function handleIpoPerformancePeriodChange() {
  selectedIpoPerformancePeriod = els.ipoPerformanceYearFilter?.value || "all";
  if (selectedIpoPerformancePeriod === "custom") {
    const bounds = getIpoPerformanceMonthBounds(ipoRecords);
    if (!isIpoPerformanceMonthKey(selectedIpoPerformanceStartMonth)) {
      selectedIpoPerformanceStartMonth = bounds.startMonth;
    }
    if (!isIpoPerformanceMonthKey(selectedIpoPerformanceEndMonth)) {
      selectedIpoPerformanceEndMonth = bounds.endMonth;
    }
  }
  selectedIpoPerformanceMonth = "";
  renderIpoView();
  await persistIpoPerformanceSelection();
}

async function handleIpoPerformanceRangeChange() {
  selectedIpoPerformanceStartMonth = els.ipoPerformanceStartMonth?.value || "";
  selectedIpoPerformanceEndMonth = els.ipoPerformanceEndMonth?.value || "";
  selectedIpoPerformanceMonth = "";
  renderIpoView();
  await persistIpoPerformanceSelection();
}

async function resetIpoPerformanceRange() {
  selectedIpoPerformancePeriod = "all";
  selectedIpoPerformanceMonth = "";
  renderIpoView();
  await persistIpoPerformanceSelection();
}

function buildIpoMonthlyPerformance(records = [], periodFilter = "all", customStartMonth = "", customEndMonth = "") {
  const realized = getIpoRealizedRecords(records);
  const years = [...new Set(realized.map((item) => item.sellDate.slice(0, 4)))].sort();
  const requestedPeriod = String(periodFilter || "all");
  const selectedPeriod = requestedPeriod === "custom"
    ? "custom"
    : requestedPeriod !== "all" && years.includes(requestedPeriod) ? requestedPeriod : "all";
  const rangeStart = selectedPeriod === "custom" ? String(customStartMonth || "") : "";
  const rangeEnd = selectedPeriod === "custom" ? String(customEndMonth || "") : "";
  const rangeIssue = selectedPeriod === "custom" ? getIpoPerformanceRangeIssue(rangeStart, rangeEnd) : "";
  const scopedRecords = selectedPeriod === "all"
    ? realized
    : selectedPeriod === "custom"
      ? rangeIssue ? [] : realized.filter((item) => {
        const key = monthKey(item.sellDate);
        return key >= rangeStart && key <= rangeEnd;
      })
      : realized.filter((item) => item.sellDate.startsWith(`${selectedPeriod}-`));
  const monthKeys = [];

  if (selectedPeriod === "custom" && !rangeIssue) {
    for (let cursor = rangeStart, guard = 0; cursor <= rangeEnd && guard < 600; cursor = shiftMonthKey(cursor, 1), guard += 1) {
      monthKeys.push(cursor);
    }
  } else if (scopedRecords.length && selectedPeriod === "all") {
    const firstMonth = monthKey(scopedRecords[0].sellDate);
    const lastMonth = monthKey(scopedRecords.at(-1).sellDate);
    for (let cursor = firstMonth, guard = 0; cursor <= lastMonth && guard < 600; cursor = shiftMonthKey(cursor, 1), guard += 1) {
      monthKeys.push(cursor);
    }
  } else if (scopedRecords.length) {
    for (let month = 1; month <= 12; month += 1) {
      monthKeys.push(`${selectedPeriod}-${String(month).padStart(2, "0")}`);
    }
  }

  const recordsByMonth = new Map(monthKeys.map((month) => [month, []]));
  scopedRecords.forEach((item) => {
    const key = monthKey(item.sellDate);
    if (!recordsByMonth.has(key)) recordsByMonth.set(key, []);
    recordsByMonth.get(key).push(item);
  });

  let cumulativeProfit = 0;
  const months = monthKeys.map((key) => {
    const monthRecords = recordsByMonth.get(key) || [];
    const profit = monthRecords.reduce((total, item) => total + Number(item.settlementProfit || 0), 0);
    cumulativeProfit += profit;
    const gains = monthRecords.filter((item) => Number(item.settlementProfit || 0) > 0);
    const losses = monthRecords.filter((item) => Number(item.settlementProfit || 0) < 0);
    return {
      key,
      profit,
      cumulativeProfit,
      count: monthRecords.length,
      maxGain: gains.sort((a, b) => Number(b.settlementProfit || 0) - Number(a.settlementProfit || 0))[0] || null,
      maxLoss: losses.sort((a, b) => Number(a.settlementProfit || 0) - Number(b.settlementProfit || 0))[0] || null
    };
  });

  return {
    years,
    selectedYear: selectedPeriod,
    selectedPeriod,
    rangeStart,
    rangeEnd,
    rangeIssue,
    availableStartMonth: realized.length ? monthKey(realized[0].sellDate) : "",
    availableEndMonth: realized.length ? monthKey(realized.at(-1).sellDate) : "",
    months,
    realizedCount: scopedRecords.length,
    settlementProfit: cumulativeProfit,
    positiveMonthCount: months.filter((item) => item.profit > 0).length,
    negativeMonthCount: months.filter((item) => item.profit < 0).length
  };
}

function renderIpoPerformance() {
  if (!els.ipoPerformanceChart || !els.ipoPerformanceDetail) return;
  const performance = buildIpoMonthlyPerformance(
    ipoRecords,
    selectedIpoPerformancePeriod,
    selectedIpoPerformanceStartMonth,
    selectedIpoPerformanceEndMonth
  );
  selectedIpoPerformancePeriod = performance.selectedPeriod;
  syncIpoPerformancePeriodControls(performance);

  const emptyMessage = performance.rangeIssue === "missing"
    ? "시작 월과 종료 월을 모두 선택해 주세요."
    : performance.rangeIssue === "order"
      ? "시작 월은 종료 월보다 빠르거나 같아야 합니다."
      : performance.selectedPeriod === "custom" && !performance.realizedCount
        ? "선택 기간에 실현 기록이 없습니다."
        : !performance.months.length
          ? "매도 완료 기록이 쌓이면 월별 손익과 누적 정산손익을 그래프로 보여드립니다."
          : "";
  if (emptyMessage) {
    selectedIpoPerformanceMonth = "";
    els.ipoPerformanceChart.innerHTML = `
      <div class="empty compact-empty" role="status">${escapeHtml(emptyMessage)}</div>
    `;
    els.ipoPerformanceDetail.innerHTML = "";
    return;
  }

  if (!performance.months.some((item) => item.key === selectedIpoPerformanceMonth)) {
    selectedIpoPerformanceMonth = performance.months.filter((item) => item.count > 0).at(-1)?.key
      || performance.months.at(-1).key;
  }
  els.ipoPerformanceChart.innerHTML = renderIpoPerformanceChart(performance);
  els.ipoPerformanceDetail.innerHTML = renderIpoPerformanceMonthDetail(performance, selectedIpoPerformanceMonth);
  attachIpoPerformanceHandlers();
}

function syncIpoPerformancePeriodControls(performance) {
  if (!els.ipoPerformanceYearFilter) return;
  els.ipoPerformanceYearFilter.innerHTML = [
    `<option value="all">전체 기간</option>`,
    ...performance.years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}년</option>`),
    `<option value="custom">직접 설정</option>`
  ].join("");
  els.ipoPerformanceYearFilter.value = selectedIpoPerformancePeriod;

  const isCustom = selectedIpoPerformancePeriod === "custom";
  if (els.ipoPerformanceCustomRange) els.ipoPerformanceCustomRange.hidden = !isCustom;
  if (els.resetIpoPerformanceRange) els.resetIpoPerformanceRange.hidden = selectedIpoPerformancePeriod === "all";
  [els.ipoPerformanceStartMonth, els.ipoPerformanceEndMonth].filter(Boolean).forEach((input) => {
    input.min = performance.availableStartMonth;
    input.max = performance.availableEndMonth;
    input.disabled = !isCustom;
  });
  if (els.ipoPerformanceStartMonth) els.ipoPerformanceStartMonth.value = selectedIpoPerformanceStartMonth;
  if (els.ipoPerformanceEndMonth) els.ipoPerformanceEndMonth.value = selectedIpoPerformanceEndMonth;

  const feedback = performance.rangeIssue === "missing"
    ? "시작 월과 종료 월을 모두 선택해 주세요."
    : performance.rangeIssue === "order"
      ? "시작 월은 종료 월보다 빠르거나 같아야 합니다."
      : "";
  if (els.ipoPerformanceRangeFeedback) els.ipoPerformanceRangeFeedback.textContent = feedback;
  [els.ipoPerformanceStartMonth, els.ipoPerformanceEndMonth].filter(Boolean).forEach((input) => {
    input.setAttribute("aria-invalid", feedback ? "true" : "false");
  });
}

function ipoPerformanceChartStep(maxValue, targetTicks = 3) {
  const rawStep = Math.max(Number(maxValue || 0), 1) / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = [1, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) || 10;
  return factor * magnitude;
}

function renderIpoPerformanceChart(performance) {
  const months = performance.months;
  const padLeft = 76;
  const padRight = 88;
  const plotTop = 34;
  const plotHeight = 238;
  const plotBottom = plotTop + plotHeight;
  const height = 332;
  const width = Math.max(760, padLeft + padRight + months.length * 64);
  const plotWidth = width - padLeft - padRight;
  const slotWidth = plotWidth / Math.max(months.length, 1);
  const maxMonthlyAbs = Math.max(...months.map((item) => Math.abs(item.profit)), 1);
  const monthlyStep = ipoPerformanceChartStep(maxMonthlyAbs, 2);
  const monthlyLimit = Math.max(monthlyStep, Math.ceil(maxMonthlyAbs / monthlyStep) * monthlyStep);
  const monthlyY = (value) => plotTop + (monthlyLimit - Number(value || 0)) / (monthlyLimit * 2) * plotHeight;
  const zeroY = monthlyY(0);
  const cumulativeValues = [0, ...months.map((item) => item.cumulativeProfit)];
  const cumulativeAbs = Math.max(...cumulativeValues.map((value) => Math.abs(value)), 1);
  const cumulativeStep = ipoPerformanceChartStep(cumulativeAbs, 3);
  const cumulativeMin = Math.min(...cumulativeValues) < 0
    ? -Math.ceil(Math.abs(Math.min(...cumulativeValues)) / cumulativeStep) * cumulativeStep
    : 0;
  const cumulativeMax = Math.max(...cumulativeValues) > 0
    ? Math.ceil(Math.max(...cumulativeValues) / cumulativeStep) * cumulativeStep
    : 0;
  const safeCumulativeMin = cumulativeMin === cumulativeMax ? -cumulativeStep : cumulativeMin;
  const safeCumulativeMax = cumulativeMin === cumulativeMax ? cumulativeStep : cumulativeMax;
  const cumulativeRange = safeCumulativeMax - safeCumulativeMin;
  const cumulativeY = (value) => plotTop + (safeCumulativeMax - Number(value || 0)) / cumulativeRange * plotHeight;
  const points = months.map((item, index) => ({
    ...item,
    x: padLeft + slotWidth * (index + 0.5),
    barY: monthlyY(item.profit),
    lineY: cumulativeY(item.cumulativeProfit)
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.lineY.toFixed(2)}`).join(" ");
  const activeMonths = months.filter((item) => item.count > 0);
  const periodRange = activeMonths.length
    ? `${activeMonths[0].key} ~ ${activeMonths.at(-1).key}`
    : "매도 기록 없음";
  const periodLabel = performance.selectedPeriod === "all"
    ? "전체 기간"
    : performance.selectedPeriod === "custom"
      ? `${performance.rangeStart} ~ ${performance.rangeEnd}`
      : `${performance.selectedPeriod}년`;
  const totalTone = performance.settlementProfit > 0 ? "positive" : performance.settlementProfit < 0 ? "negative" : "";
  const monthlyTicks = [monthlyLimit, 0, -monthlyLimit];
  const cumulativeTicks = [...new Set([safeCumulativeMax, 0, safeCumulativeMin])]
    .filter((value) => value >= safeCumulativeMin && value <= safeCumulativeMax);
  const barWidth = Math.max(18, Math.min(30, slotWidth * 0.45));

  return `
    <div class="ipo-performance-overview">
      <div>
        <span>${escapeHtml(periodLabel)} 최종 누적</span>
        <strong class="${totalTone}">${escapeHtml(formatSignedWon(performance.settlementProfit))}</strong>
        <small>${escapeHtml(periodRange)}</small>
      </div>
      <dl>
        <div><dt>실현</dt><dd>${performance.realizedCount.toLocaleString("ko-KR")}건</dd></div>
        <div><dt>수익 월</dt><dd>${performance.positiveMonthCount.toLocaleString("ko-KR")}개월</dd></div>
        <div><dt>손실 월</dt><dd>${performance.negativeMonthCount.toLocaleString("ko-KR")}개월</dd></div>
      </dl>
    </div>
    <div class="ipo-performance-chart-scroll" tabindex="0" aria-label="공모주 누적 성과 그래프, 가로로 스크롤할 수 있습니다">
      <svg class="ipo-performance-chart-svg" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(periodLabel)} 월별 정산손익 막대와 누적 정산손익 선 그래프, 최종 누적 ${escapeHtml(formatSignedWon(performance.settlementProfit))}">
        ${monthlyTicks.map((value) => {
          const y = monthlyY(value);
          return `
            <line class="ipo-performance-grid ${value === 0 ? "zero" : ""}" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
            <text class="ipo-performance-axis-label" x="${padLeft - 10}" y="${y + 4}" text-anchor="end">${escapeHtml(formatCompactWon(value))}</text>
          `;
        }).join("")}
        ${cumulativeTicks.map((value) => {
          const y = cumulativeY(value);
          return `<text class="ipo-performance-axis-label cumulative" x="${width - padRight + 10}" y="${y + 4}" text-anchor="start">${escapeHtml(formatCompactWon(value))}</text>`;
        }).join("")}
        <text class="ipo-performance-axis-title" x="${padLeft}" y="18">월 손익</text>
        <text class="ipo-performance-axis-title cumulative" x="${width - padRight}" y="18" text-anchor="end">누적</text>
        ${points.map((point) => point.key === selectedIpoPerformanceMonth ? `
          <rect class="ipo-performance-selection" x="${point.x - slotWidth * 0.42}" y="${plotTop - 8}" width="${slotWidth * 0.84}" height="${plotHeight + 16}" rx="8"></rect>
        ` : "").join("")}
        ${points.map((point) => {
          const barHeight = point.profit === 0 ? 0 : Math.max(2, Math.abs(point.barY - zeroY));
          const barY = point.profit >= 0 ? zeroY - barHeight : zeroY;
          const tone = point.profit > 0 ? "positive" : point.profit < 0 ? "negative" : "neutral";
          return barHeight ? `<rect class="ipo-performance-bar ${tone}" x="${point.x - barWidth / 2}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="4"></rect>` : "";
        }).join("")}
        <path class="ipo-performance-line" d="${linePath}"></path>
        ${points.map((point) => {
          const tone = point.cumulativeProfit > 0 ? "positive" : point.cumulativeProfit < 0 ? "negative" : "neutral";
          const selected = point.key === selectedIpoPerformanceMonth ? " selected" : "";
          const monthLabel = performance.selectedPeriod === "all" || performance.selectedPeriod === "custom"
            ? point.key.slice(2).replace("-", ".")
            : `${Number(point.key.slice(5))}월`;
          const ariaLabel = `${formatIpoMonthLabel(point.key)}, 월 정산손익 ${formatSignedWon(point.profit)}, 선택 기간 누적 ${formatSignedWon(point.cumulativeProfit)}, 실현 ${point.count}건`;
          return `
            <g class="ipo-performance-month-target${selected}" data-ipo-performance-month="${escapeHtml(point.key)}" tabindex="0" focusable="true" role="button" aria-label="${escapeHtml(ariaLabel)}">
              <title>${escapeHtml(ariaLabel)}</title>
              <rect class="ipo-performance-hit-area" x="${point.x - slotWidth / 2}" y="${plotTop - 10}" width="${slotWidth}" height="${plotHeight + 58}"></rect>
              <circle class="ipo-performance-point ${tone}" cx="${point.x}" cy="${point.lineY}" r="${selected ? 5 : 4}"></circle>
              <text class="ipo-performance-month-label${selected}" x="${point.x}" y="${plotBottom + 32}" text-anchor="middle">${escapeHtml(monthLabel)}</text>
            </g>
          `;
        }).join("")}
      </svg>
    </div>
  `;
}

function renderIpoPerformanceMonthDetail(performance, monthKeyValue) {
  const month = performance.months.find((item) => item.key === monthKeyValue) || performance.months.at(-1);
  if (!month) return "";
  const profitTone = month.profit > 0 ? "positive" : month.profit < 0 ? "negative" : "";
  const cumulativeTone = month.cumulativeProfit > 0 ? "positive" : month.cumulativeProfit < 0 ? "negative" : "";
  const gainLabel = month.maxGain
    ? `${escapeHtml(month.maxGain.baseCompany || month.maxGain.company)}<small class="positive">${escapeHtml(formatSignedWon(month.maxGain.settlementProfit))}</small>`
    : `<span class="ipo-performance-none">해당 없음</span>`;
  const lossLabel = month.maxLoss
    ? `${escapeHtml(month.maxLoss.baseCompany || month.maxLoss.company)}<small class="negative">${escapeHtml(formatSignedWon(month.maxLoss.settlementProfit))}</small>`
    : `<span class="ipo-performance-none">해당 없음</span>`;
  return `
    <section class="ipo-performance-selected" aria-label="${escapeHtml(formatIpoMonthLabel(month.key))} 누적 성과 상세">
      <div class="ipo-performance-selected-month">
        <span>선택 월</span>
        <strong>${escapeHtml(formatIpoMonthLabel(month.key))}</strong>
      </div>
      <dl>
        <div><dt>월 정산손익</dt><dd class="${profitTone}">${escapeHtml(formatSignedWon(month.profit))}</dd></div>
        <div><dt>선택 기간 누적</dt><dd class="${cumulativeTone}">${escapeHtml(formatSignedWon(month.cumulativeProfit))}</dd></div>
        <div><dt>실현</dt><dd>${month.count.toLocaleString("ko-KR")}건</dd></div>
        <div><dt>최대 수익 종목</dt><dd class="ipo-performance-stock">${gainLabel}</dd></div>
        <div><dt>최대 손실 종목</dt><dd class="ipo-performance-stock">${lossLabel}</dd></div>
      </dl>
    </section>
  `;
}

function attachIpoPerformanceHandlers() {
  els.ipoPerformanceChart?.querySelectorAll("[data-ipo-performance-month]").forEach((target) => {
    const selectMonth = (restoreFocus = false) => {
      selectedIpoPerformanceMonth = target.dataset.ipoPerformanceMonth || "";
      renderIpoPerformance();
      if (restoreFocus) {
        requestAnimationFrame(() => {
          els.ipoPerformanceChart?.querySelector(`[data-ipo-performance-month="${selectedIpoPerformanceMonth}"]`)?.focus();
        });
      }
    };
    target.addEventListener("click", () => selectMonth(false));
    target.addEventListener("keydown", (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      selectMonth(true);
    });
  });
}

function renderIpoSummaryCard(label, value, hint, amount = 0, navigation = null) {
  const tone = amount > 0 ? "positive" : amount < 0 ? "negative" : "";
  if (navigation) {
    const targetCount = navigation.targets.length;
    const actionLabel = targetCount === 1 ? "해당 일정으로 이동" : targetCount > 1 ? "종목 선택 목록 열기" : "이동할 일정 없음";
    const isExpanded = selectedIpoSummaryGroup === navigation.key;
    return `
      <button class="ipo-summary-card ipo-summary-action" type="button" data-ipo-summary-action="${escapeHtml(navigation.key)}" aria-label="${escapeHtml(`${label} ${value}, ${actionLabel}`)}" aria-expanded="${isExpanded}" ${targetCount ? "" : "disabled"}>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint)}</small>
        ${targetCount ? `<i class="ti ${isExpanded ? "ti-chevron-down" : "ti-chevron-right"}" aria-hidden="true"></i>` : ""}
      </button>
    `;
  }
  return `
    <article class="ipo-summary-card ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `;
}

function renderIpoCalendar() {
  if (!els.ipoCalendarGrid) return;
  if (els.ipoPublicScheduleToggle) els.ipoPublicScheduleToggle.checked = showPublicIpoSchedules;
  syncIpoCalendarDensityControls();
  els.ipoCalendarGrid.dataset.density = ipoCalendarDensity;
  syncIpoCalendarMonthOptions();
  const month = selectedIpoCalendarMonth || currentMonthKey();
  const events = buildIpoCalendarEvents();
  const monthlyEvents = events.filter((event) => event.date.startsWith(`${month}-`));
  syncSelectedIpoCalendarEvent(month, monthlyEvents);
  els.ipoCalendarGrid.innerHTML = renderIpoCalendarMonth(month, monthlyEvents);
  renderIpoCalendarDetail(month, monthlyEvents);
  attachIpoCalendarHandlers();
}

function setIpoCalendarDensity(mode) {
  ipoCalendarDensity = mode === "full" ? "full" : "compact";
  renderIpoCalendar();
}

function syncIpoCalendarDensityControls() {
  [
    [els.ipoCalendarCompactView, "compact"],
    [els.ipoCalendarFullView, "full"]
  ].forEach(([button, mode]) => {
    if (!button) return;
    const isActive = ipoCalendarDensity === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function syncIpoCalendarMonthOptions() {
  if (!els.ipoCalendarMonthSelect) return;
  const months = unique([
    currentMonthKey(),
    selectedIpoCalendarMonth,
    ...buildIpoCalendarEvents().map((event) => monthKey(event.date))
  ].filter(Boolean)).sort();
  if (!selectedIpoCalendarMonth || !months.includes(selectedIpoCalendarMonth)) {
    selectedIpoCalendarMonth = months.includes(currentMonthKey()) ? currentMonthKey() : months[0] || currentMonthKey();
  }
  els.ipoCalendarMonthSelect.innerHTML = months
    .map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(formatIpoMonthLabel(month))}</option>`)
    .join("");
  els.ipoCalendarMonthSelect.value = selectedIpoCalendarMonth;
}

function moveIpoCalendarMonth(offset) {
  selectedIpoCalendarMonth = shiftMonthKey(selectedIpoCalendarMonth || currentMonthKey(), offset);
  selectedIpoCalendarDate = "";
  selectedIpoCalendarRecordId = "";
  selectedIpoCalendarEventKey = "";
  renderIpoView();
}

function syncSelectedIpoCalendarEvent(month, monthlyEvents) {
  const selectedStillVisible = selectedIpoCalendarDate
    && selectedIpoCalendarDate.startsWith(`${month}-`)
    && monthlyEvents.some((event) => event.date === selectedIpoCalendarDate);
  if (!selectedStillVisible) {
    selectedIpoCalendarDate = monthlyEvents[0]?.date || (month === currentMonthKey() ? new Date().toISOString().slice(0, 10) : `${month}-01`);
    selectedIpoCalendarRecordId = monthlyEvents[0]?.item.id || "";
    selectedIpoCalendarEventKey = monthlyEvents[0]?.key || "";
    return;
  }
  const selectedRecordVisible = monthlyEvents.some((event) =>
    event.date === selectedIpoCalendarDate
    && event.item.id === selectedIpoCalendarRecordId
    && event.key === selectedIpoCalendarEventKey
  );
  if (!selectedRecordVisible) {
    const firstEvent = monthlyEvents.find((event) => event.date === selectedIpoCalendarDate);
    selectedIpoCalendarRecordId = firstEvent?.item.id || "";
    selectedIpoCalendarEventKey = firstEvent?.key || "";
  }
}

function renderIpoCalendarMonth(month, events) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const leadingDays = firstDay.getDay();
  const eventsByDate = groupBy(events, (event) => event.date);
  const cells = [];
  for (let i = 0; i < leadingDays; i += 1) cells.push(`<div class="ipo-calendar-cell muted" aria-hidden="true"></div>`);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const dayEvents = eventsByDate.get(date) || [];
    cells.push(renderIpoCalendarDay(date, dayEvents));
  }
  const trailingDays = (7 - (leadingDays + daysInMonth) % 7) % 7;
  for (let i = 0; i < trailingDays; i += 1) cells.push(`<div class="ipo-calendar-cell muted" aria-hidden="true"></div>`);
  return `
    <div class="ipo-calendar-weekdays">
      ${["일", "월", "화", "수", "목", "금", "토"].map((day) => `<span>${day}</span>`).join("")}
    </div>
    <div class="ipo-calendar-month-grid">
      ${cells.join("")}
    </div>
    ${events.length ? "" : `<div class="empty compact-empty">${escapeHtml(formatIpoMonthLabel(month))}에는 표시할 공개 일정이나 내 기록이 없습니다.</div>`}
  `;
}

function renderIpoCalendarDay(date, events) {
  const isSelected = date === selectedIpoCalendarDate;
  const compact = ipoCalendarDensity === "compact";
  const visibleEvents = compact ? events.slice(0, IPO_CALENDAR_COMPACT_EVENT_LIMIT) : events;
  const hiddenCount = events.length - visibleEvents.length;
  return `
    <div class="ipo-calendar-cell ${events.length ? "has-event" : ""} ${isSelected ? "selected" : ""}" data-ipo-calendar-date="${escapeHtml(date)}">
      <strong>${Number(date.slice(-2))}</strong>
      <div class="ipo-calendar-day-events">
        ${visibleEvents.map(renderIpoCalendarEvent).join("")}
        ${hiddenCount > 0 ? `<button class="ipo-calendar-more" type="button" data-ipo-calendar-date="${escapeHtml(date)}" aria-label="${escapeHtml(formatIpoDisplayDate(date))}의 나머지 일정 ${hiddenCount}건 보기">+${hiddenCount}건</button>` : ""}
      </div>
    </div>
  `;
}

function buildIpoCalendarEvents() {
  const personalEvents = ipoRecords.flatMap(buildIpoRecordCalendarEvents);
  const publicEvents = showPublicIpoSchedules
    ? ipoCalendarCandidates
      .filter((item) => !findIpoRecordForSchedule(item))
      .flatMap(buildIpoScheduleCalendarEvents)
    : [];
  return [...personalEvents, ...publicEvents]
    .sort((a, b) => String(a.date).localeCompare(String(b.date), "ko-KR"));
}

function buildIpoRecordCalendarEvents(item) {
  const record = normalizeIpoRecord(item);
  const listingAndSellSameDay = record.listingDate
    && record.sellDate
    && record.listingDate === record.sellDate
    && !isIpoUnallocated(record);
  return [
    record.subscriptionStart ? { key: "subscriptionStart", date: record.subscriptionStart, type: "청약", item: record } : null,
    record.subscriptionEnd && record.subscriptionEnd !== record.subscriptionStart ? { key: "subscriptionEnd", date: record.subscriptionEnd, type: "청약 마감", item: record } : null,
    record.refundDate ? { key: "refundDate", date: record.refundDate, type: "환불·납입", item: record } : null,
    listingAndSellSameDay ? { key: "listingAndSell", date: record.listingDate, type: "상장·매도", item: record } : null,
    record.listingDate && !listingAndSellSameDay ? { key: "listingDate", date: record.listingDate, type: "상장", item: record } : null,
    record.sellDate && !listingAndSellSameDay && !isIpoUnallocated(record) ? { key: "sellDate", date: record.sellDate, type: "매도", item: record } : null
  ].filter(Boolean);
}

function buildIpoScheduleCalendarEvents(item) {
  const statusSuffix = item.status === "cancelled" ? " 취소" : "";
  return [
    item.subscriptionStart ? { key: "subscriptionStart", date: item.subscriptionStart, type: `청약 시작${statusSuffix}`, item, publicSchedule: true } : null,
    item.subscriptionEnd ? { key: "subscriptionEnd", date: item.subscriptionEnd, type: `청약 마감${statusSuffix}`, item, publicSchedule: true } : null,
    item.paymentDate ? { key: "paymentDate", date: item.paymentDate, type: `납입${statusSuffix}`, item, publicSchedule: true } : null,
    item.listingDate ? { key: "listingDate", date: item.listingDate, type: `상장 예정${statusSuffix}`, item, publicSchedule: true } : null
  ].filter(Boolean);
}

function renderIpoCalendarEvent(event) {
  if (event.publicSchedule) {
    return `
      <button class="ipo-calendar-event ${escapeHtml(ipoCalendarEventClass(event))} ${isSelectedIpoCalendarEvent(event) ? "selected" : ""}" type="button" data-ipo-calendar-date="${escapeHtml(event.date)}" data-ipo-calendar-record="${escapeHtml(event.item.id)}" data-ipo-calendar-event="${escapeHtml(event.key)}">
        <span class="ipo-event-type">${escapeHtml(event.type)}</span>
        <strong>${escapeHtml(event.item.company)}</strong>
        <small>${escapeHtml([event.item.broker, "KRX 공개"].filter(Boolean).join(" · "))}</small>
        <b>${escapeHtml(renderIpoSchedulePrice(event.item))}</b>
      </button>
    `;
  }
  const status = ipoStatus(event.item);
  const isSaleEvent = ipoCalendarEventIncludesSale(event);
  const settlementProfit = Number(event.item.settlementProfit || 0);
  const amount = isSaleEvent
    ? formatSignedWon(settlementProfit)
    : formatWon(event.item.offerPrice || event.item.depositAmount || 0);
  return `
    <button class="ipo-calendar-event ${escapeHtml(ipoCalendarEventClass(event))} ${isSelectedIpoCalendarEvent(event) ? "selected" : ""}" type="button" data-ipo-calendar-date="${escapeHtml(event.date)}" data-ipo-calendar-record="${escapeHtml(event.item.id)}" data-ipo-calendar-event="${escapeHtml(event.key)}">
      <span class="ipo-event-type">${escapeHtml(event.type)}</span>
      <strong>${escapeHtml(event.item.company)}</strong>
      <small>${escapeHtml([event.item.broker, status.label].filter(Boolean).join(" · "))}</small>
      <b class="${settlementProfit > 0 && isSaleEvent ? "positive" : settlementProfit < 0 && isSaleEvent ? "negative" : ""}">${escapeHtml(amount)}</b>
    </button>
  `;
}

function isSelectedIpoCalendarEvent(event) {
  return event.date === selectedIpoCalendarDate
    && event.item.id === selectedIpoCalendarRecordId
    && event.key === selectedIpoCalendarEventKey;
}

function renderIpoCalendarDetail(month, monthlyEvents) {
  if (!els.ipoCalendarDetail) return;
  const dayEvents = monthlyEvents.filter((event) => event.date === selectedIpoCalendarDate);
  const selectedEvent = dayEvents.find((event) =>
    event.item.id === selectedIpoCalendarRecordId && event.key === selectedIpoCalendarEventKey
  ) || dayEvents[0] || null;
  const titleDate = selectedIpoCalendarDate || `${month}-01`;
  els.ipoCalendarDetail.innerHTML = `
    <div class="ipo-calendar-detail-head">
      <div>
        <span>선택 일정</span>
        <h4>${escapeHtml(formatIpoDisplayDate(titleDate))}</h4>
      </div>
      <small>${dayEvents.length ? `${dayEvents.length.toLocaleString("ko-KR")}건` : "일정 없음"}</small>
    </div>
    ${dayEvents.length ? renderIpoCalendarDetailList(dayEvents, selectedEvent) : `<div class="empty compact-empty">선택한 날짜에 등록된 공모주 일정이 없습니다.</div>`}
    ${selectedEvent ? renderIpoCalendarSelectedRecord(selectedEvent) : ""}
  `;
}

function renderIpoCalendarDetailList(dayEvents, selectedEvent) {
  return `
    <div class="ipo-calendar-detail-list">
      ${dayEvents.map((event) => `
        <button class="${isSelectedIpoCalendarEvent(event) || event === selectedEvent ? "selected" : ""}" type="button" data-ipo-calendar-date="${escapeHtml(event.date)}" data-ipo-calendar-record="${escapeHtml(event.item.id)}" data-ipo-calendar-event="${escapeHtml(event.key)}">
          <span>${escapeHtml(event.type)}</span>
          <strong>${escapeHtml(event.item.company)}</strong>
          <small>${escapeHtml([event.item.broker || "증권사 미입력", event.publicSchedule ? "KRX 공개" : "내 기록"].join(" · "))}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function renderIpoCalendarSelectedRecord(event) {
  if (event.publicSchedule) return renderIpoPublicScheduleDetail(event);
  const item = event.item;
  const status = ipoStatus(item);
  const detailRows = [
    ["일정", event.type],
    ["상태", status.label],
    ["청약일", formatIpoDateRange(item.subscriptionStart, item.subscriptionEnd)],
    ["환불/납입일", item.refundDate || "-"],
    ["상장일", item.listingDate || "-"],
    ["매도일", item.sellDate || "-"],
    ["증권사", item.broker || "-"],
    ["공모가", formatWon(item.offerPrice)],
    ["청약 주수", item.appliedShares ? `${Number(item.appliedShares).toLocaleString("ko-KR")}주` : "-"],
    ["배정 주수", item.allocatedShares ? `${Number(item.allocatedShares).toLocaleString("ko-KR")}주` : "-"],
    ["청약 수수료", formatWon(item.applicationFee)],
    ["매도 수수료", formatWon(item.sellFee)],
    ["배정 결과", ipoAllocationLabel(item)],
    ["총 매도금액", ipoTotalSellAmount(item) ? formatWon(ipoTotalSellAmount(item)) : "-"],
    ["손익", isIpoRealized(item) ? formatSignedWon(item.profit) : "-"],
    ["손익률", isIpoRealized(item) ? formatIpoRate(item.profitRate) : "-"],
    ["최종 정산 손익", isIpoRealized(item) ? formatSignedWon(item.settlementProfit) : "-"],
    ["시가/고가/종가", formatIpoMarketPrices(item)]
  ];
  return `
    <article class="ipo-calendar-selected-card ${Number(item.settlementProfit || 0) > 0 ? "profit" : Number(item.settlementProfit || 0) < 0 ? "loss" : ""}">
      <div class="ipo-calendar-selected-head">
        <div>
          <span class="ipo-event-type">${escapeHtml(event.type)}</span>
          <h4>${escapeHtml(item.company)}</h4>
          <p>${escapeHtml([item.market, item.sourceLabel].filter(Boolean).join(" · ") || "직접 입력")}</p>
        </div>
        <button type="button" data-edit-ipo="${escapeHtml(item.id)}">수정</button>
      </div>
      ${renderIpoAttachedImage(item, "compact")}
      <dl class="ipo-calendar-detail-grid">
        ${detailRows.map(([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(String(value))}</dd>
          </div>
        `).join("")}
      </dl>
      ${item.memo ? `<p class="ipo-card-memo">${escapeHtml(item.memo)}</p>` : ""}
    </article>
  `;
}

function renderIpoPublicScheduleDetail(event) {
  const item = event.item;
  const detailRows = [
    ["일정", event.type],
    ["공개 상태", ipoScheduleStatusLabel(item)],
    ["수요예측", formatIpoDateRange(item.bookbuildingStart, item.bookbuildingEnd)],
    ["청약일", formatIpoDateRange(item.subscriptionStart, item.subscriptionEnd)],
    ["납입일", item.paymentDate || "-"],
    ["상장 예정일", item.listingDate || "-"],
    ["시장", item.market || "-"],
    ["주관사", item.broker || "-"],
    ["공모가", renderIpoSchedulePrice(item)],
    ["공모금액", item.offeringAmountMillions ? `${Number(item.offeringAmountMillions).toLocaleString("ko-KR")}백만원` : "확정 전"]
  ];
  return `
    <article class="ipo-calendar-selected-card public-schedule-card">
      <div class="ipo-calendar-selected-head">
        <div>
          <span class="ipo-event-type">KRX 공개 일정</span>
          <h4>${escapeHtml(item.company)}</h4>
          <p>${escapeHtml([item.market, ipoScheduleStatusLabel(item)].filter(Boolean).join(" · "))}</p>
        </div>
        <button type="button" data-add-ipo-schedule="${escapeHtml(item.sourceId)}">내 기록에 추가</button>
      </div>
      <dl class="ipo-calendar-detail-grid">
        ${detailRows.map(([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(String(value))}</dd>
          </div>
        `).join("")}
      </dl>
      <div class="ipo-public-source-row">
        <span>개인 배정·매도 정보와 분리된 공개 참고 일정입니다.</span>
        ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">KIND 원문 보기 <i class="ti ti-world-www" aria-hidden="true"></i></a>` : ""}
      </div>
    </article>
  `;
}

function attachIpoCalendarHandlers() {
  els.ipoCalendarGrid.querySelectorAll("[data-ipo-calendar-date]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (node.classList.contains("ipo-calendar-event") || node.classList.contains("ipo-calendar-more")) event.stopPropagation();
      const target = event.currentTarget;
      selectedIpoCalendarDate = target.dataset.ipoCalendarDate || "";
      selectedIpoCalendarRecordId = target.dataset.ipoCalendarRecord || "";
      selectedIpoCalendarEventKey = target.dataset.ipoCalendarEvent || "";
      renderIpoCalendar();
    });
  });
  els.ipoCalendarDetail?.querySelectorAll("[data-ipo-calendar-date]").forEach((node) => {
    node.addEventListener("click", (event) => {
      const target = event.currentTarget;
      selectedIpoCalendarDate = target.dataset.ipoCalendarDate || "";
      selectedIpoCalendarRecordId = target.dataset.ipoCalendarRecord || "";
      selectedIpoCalendarEventKey = target.dataset.ipoCalendarEvent || "";
      renderIpoCalendar();
    });
  });
  els.ipoCalendarDetail?.querySelectorAll("[data-edit-ipo]").forEach((button) => {
    button.addEventListener("click", () => editIpoRecord(button.dataset.editIpo));
  });
  els.ipoCalendarDetail?.querySelectorAll("[data-add-ipo-schedule]").forEach((button) => {
    button.addEventListener("click", () => addIpoScheduleToRecords(button.dataset.addIpoSchedule));
  });
}

function ipoCalendarEventClass(event) {
  const publicClass = event.publicSchedule ? " public-schedule" : "";
  const cancelledClass = event.item?.status === "cancelled" ? " cancelled" : "";
  if (event.key === "refundDate" || event.key === "paymentDate") return `refund${publicClass}${cancelledClass}`;
  if (event.key === "listingDate") return `listing${publicClass}${cancelledClass}`;
  if (event.key === "listingAndSell") return `${Number(event.item.settlementProfit || 0) < 0 ? "listing-sell loss" : "listing-sell"}${publicClass}`;
  if (event.key === "sellDate") return `${Number(event.item.settlementProfit || 0) < 0 ? "sell loss" : "sell"}${publicClass}`;
  return `subscription${publicClass}${cancelledClass}`;
}

function ipoCalendarEventIncludesSale(event) {
  return event.key === "sellDate" || event.key === "listingAndSell";
}

function syncIpoFilters() {
  const currentMonth = ipoFilters.month || els.ipoMonthFilter.value || "all";
  const currentBroker = ipoFilters.broker || els.ipoBrokerFilter.value || "all";
  const months = unique(ipoRecords.flatMap((item) => [
    monthKey(item.subscriptionStart),
    monthKey(item.listingDate),
    monthKey(item.sellDate)
  ]).filter(Boolean)).sort().reverse();
  const brokers = unique(ipoRecords.map((item) => item.broker).filter(Boolean)).sort((a, b) => a.localeCompare(b, "ko-KR"));
  els.ipoMonthFilter.innerHTML = [`<option value="all">전체 월</option>`, ...months.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)].join("");
  els.ipoBrokerFilter.innerHTML = [`<option value="all">전체 증권사</option>`, ...brokers.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)].join("");
  ipoFilters.month = ["all", ...months].includes(currentMonth) ? currentMonth : "all";
  ipoFilters.broker = ["all", ...brokers].includes(currentBroker) ? currentBroker : "all";
  els.ipoStatusFilter.value = ipoFilters.status;
  els.ipoMonthFilter.value = ipoFilters.month;
  els.ipoBrokerFilter.value = ipoFilters.broker;
  els.ipoSearchInput.value = ipoFilters.search;
  els.ipoSortSelect.value = ipoFilters.sort;
}

function readIpoFilters() {
  ipoFilters.status = els.ipoStatusFilter.value || "all";
  ipoFilters.month = els.ipoMonthFilter.value || "all";
  ipoFilters.broker = els.ipoBrokerFilter.value || "all";
  ipoFilters.search = els.ipoSearchInput.value.trim();
  ipoFilters.sort = els.ipoSortSelect.value || "subscription-desc";
}

function filteredIpoRecords() {
  const search = normalizeKeyText(ipoFilters.search);
  return ipoRecords
    .map(normalizeIpoRecord)
    .filter((item) => {
      if (ipoFilters.status !== "all" && ipoStatus(item).key !== ipoFilters.status) return false;
      if (ipoFilters.month !== "all") {
        const months = [monthKey(item.subscriptionStart), monthKey(item.listingDate), monthKey(item.sellDate)];
        if (!months.includes(ipoFilters.month)) return false;
      }
      if (ipoFilters.broker !== "all" && item.broker !== ipoFilters.broker) return false;
      if (!search) return true;
      return normalizeKeyText([item.company, item.baseCompany, item.market, item.broker, item.memo, item.sourceLabel].join(" ")).includes(search);
    })
    .sort(sortIpoRecords);
}

function sortIpoRecords(a, b) {
  if (ipoFilters.sort === "profit-desc") return Number(b.profit || 0) - Number(a.profit || 0);
  if (ipoFilters.sort === "profit-asc") return Number(a.profit || 0) - Number(b.profit || 0);
  if (ipoFilters.sort === "listing-desc") return String(b.listingDate || "").localeCompare(String(a.listingDate || ""), "ko-KR");
  if (ipoFilters.sort === "sell-desc") return String(b.sellDate || "").localeCompare(String(a.sellDate || ""), "ko-KR");
  return String(b.subscriptionStart || b.sellDate || b.createdAt || "").localeCompare(String(a.subscriptionStart || a.sellDate || a.createdAt || ""), "ko-KR");
}

function renderIpoList() {
  const rows = filteredIpoRecords();
  if (!ipoRecords.length) {
    els.ipoList.innerHTML = `<div class="empty compact-empty">공모주 기록을 추가하면 청약 일정, 배정, 매도 손익을 여기서 볼 수 있습니다.</div>`;
    return;
  }
  if (!rows.length) {
    els.ipoList.innerHTML = `<div class="empty compact-empty">현재 필터에 맞는 공모주 기록이 없습니다.</div>`;
    return;
  }
  els.ipoList.innerHTML = rows.map(renderIpoCard).join("");
  attachIpoListHandlers();
}

function renderIpoCard(item) {
  const status = ipoStatus(item);
  return `
    <article class="ipo-card ${Number(item.profit || 0) > 0 ? "profit" : Number(item.profit || 0) < 0 ? "loss" : ""}">
      <div class="ipo-card-head">
        <div>
          <span class="ipo-status-badge">${escapeHtml(status.label)}</span>
          <h3>${escapeHtml(item.company)}</h3>
          <p>${escapeHtml([item.market, item.broker, item.sourceLabel].filter(Boolean).join(" · ") || "직접 입력")}</p>
        </div>
        <div class="ipo-card-profit">
          <strong>${isIpoRealized(item) ? formatSignedWon(item.profit) : formatWon(item.depositAmount || item.offerPrice * item.appliedShares || 0)}</strong>
          <span>${isIpoRealized(item) ? `수수료 제외 · ${formatIpoRate(item.profitRate)}` : isIpoUnallocated(item) ? "손익 집계 제외" : "청약/배정 진행"}</span>
        </div>
      </div>
      <dl class="ipo-card-grid">
        <div><dt>청약일</dt><dd>${escapeHtml(formatIpoDateRange(item.subscriptionStart, item.subscriptionEnd))}</dd></div>
        <div><dt>환불/상장</dt><dd>${escapeHtml([item.refundDate || "-", item.listingDate || "-"].join(" / "))}</dd></div>
        <div><dt>공모가</dt><dd>${formatWon(item.offerPrice)}</dd></div>
        <div><dt>배정</dt><dd>${escapeHtml(ipoAllocationLabel(item))} · ${Number(item.allocatedShares || 0).toLocaleString("ko-KR")}주</dd></div>
        <div><dt>총 매도 금액</dt><dd>${ipoTotalSellAmount(item) ? formatWon(ipoTotalSellAmount(item)) : "-"}</dd></div>
        <div><dt>최종 정산 손익</dt><dd>${isIpoRealized(item) ? formatSignedWon(item.settlementProfit) : "-"}</dd></div>
        <div><dt>시가/고가/종가</dt><dd>${formatIpoMarketPrices(item)}</dd></div>
      </dl>
      ${renderIpoAttachedImage(item)}
      ${item.memo ? `<p class="ipo-card-memo">${escapeHtml(item.memo)}</p>` : ""}
      <div class="ipo-card-actions">
        <button type="button" data-edit-ipo="${escapeHtml(item.id)}">수정</button>
        <button type="button" class="danger-outline" data-delete-ipo="${escapeHtml(item.id)}">삭제</button>
      </div>
    </article>
  `;
}

function attachIpoListHandlers() {
  els.ipoList.querySelectorAll("[data-edit-ipo]").forEach((button) => {
    button.addEventListener("click", () => editIpoRecord(button.dataset.editIpo));
  });
  els.ipoList.querySelectorAll("[data-delete-ipo]").forEach((button) => {
    button.addEventListener("click", () => deleteIpoRecord(button.dataset.deleteIpo));
  });
}

function editIpoRecord(id) {
  const item = ipoRecords.find((record) => record.id === id);
  if (!item) return;
  editingIpoId = id;
  els.ipoId.value = item.id;
  els.ipoCompany.value = item.company;
  els.ipoMarket.value = item.market;
  els.ipoBroker.value = item.broker;
  els.ipoSubscriptionStart.value = item.subscriptionStart;
  els.ipoSubscriptionEnd.value = item.subscriptionEnd;
  els.ipoRefundDate.value = item.refundDate;
  els.ipoListingDate.value = item.listingDate;
  els.ipoOfferPrice.value = formatPlainNumber(item.offerPrice);
  els.ipoAppliedShares.value = item.appliedShares || "";
  els.ipoDepositAmount.value = item.depositAmount ? formatPlainNumber(item.depositAmount) : "";
  els.ipoApplicationFee.value = item.applicationFee ? formatPlainNumber(item.applicationFee) : "";
  els.ipoAllocatedShares.value = item.allocatedShares || "";
  els.ipoAllocationResult.value = item.allocationResult || (item.allocatedShares ? "allocated" : "pending");
  els.ipoSellDate.value = item.sellDate;
  els.ipoSellPrice.value = item.sellPrice ? formatPlainNumber(item.sellPrice) : "";
  els.ipoSellAmount.value = item.sellAmount ? formatPlainNumber(item.sellAmount) : "";
  els.ipoSellFee.value = item.sellFee ? formatPlainNumber(item.sellFee) : "";
  els.ipoOpenPrice.value = item.openPrice ? formatPlainNumber(item.openPrice) : "";
  els.ipoHighPrice.value = item.highPrice ? formatPlainNumber(item.highPrice) : "";
  els.ipoClosePrice.value = item.closePrice ? formatPlainNumber(item.closePrice) : "";
  els.ipoMemo.value = item.memo;
  setIpoImageDraft(item.imageData, item.imageName);
  els.saveIpoButton.textContent = "수정 저장";
  els.cancelIpoEditButton.hidden = false;
  selectedIpoSubtab = "entry";
  syncIpoSubtabs();
  updateIpoComputedPreview();
  els.ipoForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteIpoRecord(id) {
  const item = ipoRecords.find((record) => record.id === id);
  if (!item) return;
  if (!confirm(`${item.company} 공모주 기록을 삭제할까요?`)) return;
  await createAutoSnapshot("공모주 기록 삭제 전");
  ipoRecords = ipoRecords.filter((record) => record.id !== id);
  await saveIpoRecords();
  renderIpoView();
}

function handleIpoPasteParse() {
  const lines = String(els.ipoPasteInput.value || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, ""))
    .filter((line) => line.trim());
  const headerCells = lines.length ? parseIpoPasteCells(lines[0]) : [];
  const isNormalizedTsv = IPO_NORMALIZED_TSV_COLUMNS.every((column) => headerCells.includes(column));
  ipoImportReferenceTotal = null;
  if (isNormalizedTsv) {
    const headerIndexes = new Map(headerCells.map((column, index) => [column, index]));
    ipoPasteRows = lines.slice(1).map((line) => parseNormalizedIpoPasteLine(line, headerIndexes));
    ipoImportReferenceTotal = extractIpoImportReferenceTotal(ipoPasteRows);
    ipoPasteRows = ipoPasteRows.map((row) => ({ ...row, memo: stripIpoImportReferenceTotal(row.memo) }));
  } else {
    ipoPasteRows = lines.map(parseIpoPasteLine);
  }
  renderIpoPastePreview();
}

function parseNormalizedIpoPasteLine(line, headerIndexes) {
  const cells = parseIpoPasteCells(line);
  const read = (column) => {
    const index = headerIndexes.get(column);
    return index === undefined ? "" : String(cells[index] || "").trim();
  };
  const sourceRecordId = read("원본ID");
  const calculationVersion = normalizeIpoCalculationVersion(read("계산방식")) || "quantity-v2";
  const allocationResult = normalizeIpoAllocationResult(read("배정결과"));
  const sellPriceRaw = read("1주매도가");
  const sellAmountRaw = read("총매도금액");
  const row = normalizeIpoRecord({
    id: sourceRecordId ? ipoImportRecordId(sourceRecordId) : "",
    sourceRecordId,
    company: read("공모주"),
    baseCompany: read("기본종목") || read("공모주"),
    broker: read("증권사"),
    listingDate: normalizeIpoLooseDate(read("상장일")),
    sellDate: normalizeIpoLooseDate(read("매도일")),
    offerPrice: parseIpoMoneyValue(read("공모가")),
    allocatedShares: parseIpoMoneyValue(read("수량")),
    allocationResult,
    sellPrice: parseIpoMoneyValue(sellPriceRaw),
    sellAmount: parseIpoMoneyValue(sellAmountRaw),
    applicationFee: parseIpoMoneyValue(read("청약수수료")),
    sellFee: parseIpoMoneyValue(read("매도수수료")),
    highPrice: parseIpoMoneyValue(read("고가")),
    openPrice: parseIpoMoneyValue(read("시가")),
    closePrice: parseIpoMoneyValue(read("종가")),
    reportedProfitRate: parseIpoMoneyValue(read("원본손익률")),
    reportedProfit: parseIpoMoneyValue(read("원본손익")),
    calculationVersion,
    rawSellValue: [sellPriceRaw, sellAmountRaw].filter(Boolean).join(" / "),
    memo: read("메모"),
    source: "history-import",
    sourceLabel: "과거 기록 가져오기"
  });
  return decorateIpoPasteRow(row, line, "normalized");
}

function parseIpoPasteLine(line) {
  const cells = parseIpoPasteCells(line);
  const [dateRaw, companyRaw, brokerRaw, offerRaw, feeRaw, sellRaw, highRaw, openRaw, closeRaw, rateRaw, profitRaw, depositRaw, memoRaw] = cells;
  const parsedCompany = parseIpoCompanyAndShares(companyRaw || "");
  const subscriptionStart = normalizeIpoLooseDate(dateRaw);
  const row = normalizeIpoRecord({
    company: parsedCompany.company,
    broker: brokerRaw || "",
    subscriptionStart,
    subscriptionEnd: subscriptionStart,
    offerPrice: parseIpoMoneyValue(offerRaw),
    applicationFee: parseIpoMoneyValue(feeRaw),
    allocatedShares: parsedCompany.hasShares ? parsedCompany.shares : 1,
    allocationResult: parsedCompany.hasShares && parsedCompany.shares === 0 ? "unallocated" : "allocated",
    sellAmount: parseIpoMoneyValue(sellRaw),
    highPrice: parseIpoMoneyValue(highRaw),
    openPrice: parseIpoMoneyValue(openRaw),
    closePrice: parseIpoMoneyValue(closeRaw),
    depositAmount: parseIpoMoneyValue(depositRaw),
    memo: [memoRaw, profitRaw ? `기존 손익 ${profitRaw}` : "", rateRaw ? `기존 손익률 ${rateRaw}` : ""].filter(Boolean).join(" · "),
    source: "paste",
    sourceLabel: "붙여넣기"
  });
  return decorateIpoPasteRow(row, line, "legacy");
}

function decorateIpoPasteRow(row, original, importFormat) {
  const error = validateIpoPasteRow(row, importFormat);
  return {
    ...row,
    original,
    importFormat,
    valid: !error,
    error,
    reviewState: ipoImportReviewState(row, importFormat)
  };
}

function validateIpoPasteRow(row, importFormat) {
  if (importFormat === "normalized" && !row.sourceRecordId) return "원본 ID 확인 필요";
  if (!row.company) return "종목명 확인 필요";
  if (!row.offerPrice) return "공모가 확인 필요";
  if (importFormat === "legacy" && !row.subscriptionStart) return "날짜 확인 필요";
  if (importFormat === "normalized" && !row.sellDate && !isIpoUnallocated(row)) return "매도일 확인 필요";
  if (importFormat === "normalized" && row.calculationVersion === "quantity-v2" && !isIpoUnallocated(row) && !row.allocatedShares) return "수량 확인 필요";
  return "";
}

function ipoImportReviewState(row, importFormat) {
  if (isIpoUnallocated(row)) return { key: "unallocated", label: "미배정" };
  if (importFormat === "legacy") return { key: "legacy", label: "기존 형식" };
  if (row.calculationVersion === "reported") return { key: "confirmed", label: "확정" };
  if (row.hasReportedProfit && Math.round(row.reportedProfit) !== Math.round(row.settlementProfit)) {
    return { key: "recalculated", label: "재계산" };
  }
  return { key: "confirmed", label: "확정" };
}

function ipoImportRecordId(sourceRecordId) {
  let hash = 2166136261;
  for (const character of String(sourceRecordId || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `ipo-import-${(hash >>> 0).toString(36)}`;
}

function parseIpoPasteCells(line) {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  const wideCells = line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  if (wideCells.length >= 6) return wideCells;
  return parseLooseIpoPasteLine(line);
}

function parseLooseIpoPasteLine(line) {
  const text = String(line || "").trim();
  const dateMatch = text.match(/^((?:\d{4}[./-])?\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{4}\d{2}\d{2})\s+/);
  if (!dateMatch) return text.split(/\s+/).map((cell) => cell.trim()).filter(Boolean);
  const dateRaw = dateMatch[1];
  const rest = text.slice(dateMatch[0].length).trim();
  const tokens = rest.split(/\s+/).filter(Boolean);
  const amountStart = tokens.findIndex((token) => isIpoMoneyToken(token));
  if (amountStart < 0) return [dateRaw, rest];
  const leading = tokens.slice(0, amountStart);
  const amounts = tokens.slice(amountStart);
  const brokerRaw = leading.pop() || "";
  const companyRaw = leading.join(" ");
  return [dateRaw, companyRaw, brokerRaw, ...amounts];
}

function parseIpoMoneyValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const normalized = text.replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return "";
  return normalized;
}

function isIpoMoneyToken(value) {
  return /^[+-]?\d[\d,]*(?:\.\d+)?원?$/.test(String(value || "").trim());
}

function renderIpoPastePreview() {
  if (!els.ipoPastePreview) return;
  const validCount = ipoPasteRows.filter((row) => row.valid).length;
  const recalculatedCount = ipoPasteRows.filter((row) => row.reviewState?.key === "recalculated").length;
  const unallocatedCount = ipoPasteRows.filter((row) => row.reviewState?.key === "unallocated").length;
  els.saveIpoPasteButton.disabled = validCount === 0;
  els.ipoPasteFeedback.textContent = ipoPasteRows.length
    ? `${validCount.toLocaleString("ko-KR")}건 저장 가능 · 재계산 ${recalculatedCount.toLocaleString("ko-KR")}건 · 미배정 ${unallocatedCount.toLocaleString("ko-KR")}건`
    : "";
  renderIpoImportSummary();
  if (!ipoPasteRows.length) {
    els.ipoPastePreview.innerHTML = `<tbody><tr><td class="empty">붙여넣기 내용을 파싱하면 미리보기가 표시됩니다.</td></tr></tbody>`;
    return;
  }
  els.ipoPastePreview.innerHTML = `
    <thead><tr><th>검수</th><th>매도/기준일</th><th>종목</th><th>증권사</th><th>공모가</th><th>수량</th><th>1주 / 총매도</th><th>매매 / 정산손익</th><th>삭제</th></tr></thead>
    <tbody>
      ${ipoPasteRows.map((row, index) => `
        <tr class="${row.valid ? "" : "invalid"}">
          <td>${row.valid ? `<span class="ipo-import-state ${escapeHtml(row.reviewState.key)}">${escapeHtml(row.reviewState.label)}</span>` : `<span class="ipo-import-state invalid">${escapeHtml(row.error)}</span>`}</td>
          <td><input aria-label="${escapeHtml(row.company)} 매도 또는 기준일" data-ipo-paste-index="${index}" data-ipo-paste-field="${row.importFormat === "normalized" ? "sellDate" : "subscriptionStart"}" type="date" value="${escapeHtml(row.importFormat === "normalized" ? row.sellDate : row.subscriptionStart)}"></td>
          <td><input aria-label="공모주 종목" data-ipo-paste-index="${index}" data-ipo-paste-field="company" type="text" value="${escapeHtml(row.company)}"><small>${escapeHtml(row.baseCompany && row.baseCompany !== row.company ? `기본 ${row.baseCompany}` : row.sourceRecordId || "")}</small></td>
          <td><input aria-label="증권사" data-ipo-paste-index="${index}" data-ipo-paste-field="broker" type="text" value="${escapeHtml(row.broker)}"></td>
          <td><input aria-label="공모가" data-ipo-paste-index="${index}" data-ipo-paste-field="offerPrice" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(row.offerPrice))}"></td>
          <td><input aria-label="배정 수량" data-ipo-paste-index="${index}" data-ipo-paste-field="allocatedShares" type="number" min="0" value="${escapeHtml(row.allocatedShares || "")}"></td>
          <td><span class="ipo-sell-stack"><input aria-label="1주 매도가" data-ipo-paste-index="${index}" data-ipo-paste-field="sellPrice" type="text" inputmode="numeric" value="${escapeHtml(row.sellPrice ? formatPlainNumber(row.sellPrice) : "")}" placeholder="1주"><input aria-label="총 매도금액" data-ipo-paste-index="${index}" data-ipo-paste-field="sellAmount" type="text" inputmode="numeric" value="${escapeHtml(row.sellAmount ? formatPlainNumber(row.sellAmount) : "")}" placeholder="총액"><small>합계 ${escapeHtml(formatWon(ipoTotalSellAmount(row)))}</small></span></td>
          <td><span class="ipo-profit-stack"><strong>${escapeHtml(formatSignedWon(row.profit))}</strong><small>정산 ${escapeHtml(formatSignedWon(row.settlementProfit))}</small>${row.hasReportedProfit ? `<small>원본 ${escapeHtml(formatSignedWon(row.reportedProfit))}</small>` : ""}</span></td>
          <td><button type="button" data-delete-ipo-paste="${index}">삭제</button></td>
        </tr>
      `).join("")}
    </tbody>
  `;
  els.ipoPastePreview.querySelectorAll("[data-ipo-paste-index]").forEach((input) => {
    input.addEventListener("input", () => updateIpoPasteRow(input));
  });
  els.ipoPastePreview.querySelectorAll("[data-delete-ipo-paste]").forEach((button) => {
    button.addEventListener("click", () => {
      ipoPasteRows.splice(Number(button.dataset.deleteIpoPaste), 1);
      renderIpoPastePreview();
    });
  });
}

function renderIpoImportSummary() {
  if (!els.ipoImportSummary) return;
  const normalizedRows = ipoPasteRows.filter((row) => row.importFormat === "normalized");
  if (!normalizedRows.length) {
    els.ipoImportSummary.innerHTML = "";
    return;
  }
  const reportedTotal = normalizedRows
    .filter((row) => row.hasReportedProfit && !isIpoUnallocated(row))
    .reduce((total, row) => total + Number(row.reportedProfit || 0), 0);
  const recalculatedTotal = normalizedRows
    .filter((row) => !isIpoUnallocated(row))
    .reduce((total, row) => total + Number(row.settlementProfit || 0), 0);
  const referenceTotal = ipoImportReferenceTotal;
  const hasReferenceTotal = Number.isFinite(referenceTotal);
  const referenceDifference = hasReferenceTotal ? recalculatedTotal - referenceTotal : null;
  els.ipoImportSummary.innerHTML = `
    <div><span>원본 결산 합계</span><strong>${hasReferenceTotal ? escapeHtml(formatSignedWon(referenceTotal)) : "메모 없음"}</strong></div>
    <div><span>원본 행 합계</span><strong>${escapeHtml(formatSignedWon(reportedTotal))}</strong></div>
    <div><span>정리 후 정산손익</span><strong>${escapeHtml(formatSignedWon(recalculatedTotal))}</strong></div>
    <div><span>원본 합계 대비</span><strong class="${referenceDifference > 0 ? "positive" : referenceDifference < 0 ? "negative" : ""}">${hasReferenceTotal ? escapeHtml(formatSignedWon(referenceDifference)) : "비교값 없음"}</strong></div>
  `;
}

function extractIpoImportReferenceTotal(rows) {
  for (const row of rows) {
    const match = String(row.memo || "").match(IPO_IMPORT_REFERENCE_PATTERN);
    if (!match) continue;
    const value = Number(match[1].replaceAll(",", ""));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function stripIpoImportReferenceTotal(memo) {
  return String(memo || "").replace(IPO_IMPORT_REFERENCE_PATTERN, "").trim();
}

function updateIpoPasteRow(input) {
  const index = Number(input.dataset.ipoPasteIndex);
  const field = input.dataset.ipoPasteField;
  const current = ipoPasteRows[index];
  const next = normalizeIpoRecord({ ...current, [field]: input.value });
  ipoPasteRows[index] = decorateIpoPasteRow(next, current.original, current.importFormat);
  renderIpoPastePreview();
}

async function saveIpoPasteRows() {
  const rows = ipoPasteRows.filter((row) => row.valid).map((row) => normalizeIpoRecord({
    ...row,
    id: row.sourceRecordId ? ipoImportRecordId(row.sourceRecordId) : `ipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  if (!rows.length) return;
  await createAutoSnapshot("공모주 붙여넣기 저장 전");
  ipoRecords = mergeIpoRecords(ipoRecords, rows);
  await saveIpoRecords();
  ipoPasteRows = [];
  ipoImportReferenceTotal = null;
  els.ipoPasteInput.value = "";
  if (els.ipoHistoryImport) els.ipoHistoryImport.open = false;
  selectedIpoSubtab = "records";
  renderIpoView();
}

function clearIpoPasteInput() {
  ipoPasteRows = [];
  ipoImportReferenceTotal = null;
  els.ipoPasteInput.value = "";
  renderIpoPastePreview();
}

async function loadIpoCalendarCandidates(options = {}) {
  if (!els.ipoCalendarStatus) return;
  const silent = options?.silent === true;
  const button = els.loadIpoCalendarButton;
  if (!silent) els.ipoCalendarStatus.textContent = "KRX 공개 일정을 새로 확인하는 중입니다.";
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    const response = await fetch("./data/ipo-calendar.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`ipo-calendar.json HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.items)) throw new Error("invalid ipo-calendar.json schema");
    ipoCalendarPayload = payload;
    ipoCalendarCandidates = payload.items.map(normalizeIpoScheduleItem).filter((item) => item.sourceId && item.company);
    const reviews = getIpoScheduleReviews();
    syncIpoScheduleSelection(reviews);
    els.ipoCalendarStatus.textContent = `${ipoCalendarCandidates.length.toLocaleString("ko-KR")}건을 확인했습니다. 새 일정 ${reviews.filter((review) => review.state === "new").length.toLocaleString("ko-KR")}건 · 변경 ${reviews.filter((review) => review.state === "changed" || review.state === "review").length.toLocaleString("ko-KR")}건`;
  } catch (error) {
    console.error(error);
    els.ipoCalendarStatus.textContent = ipoCalendarCandidates.length
      ? "새로고침에 실패해 마지막으로 확인한 공개 일정을 유지합니다."
      : "공개 일정 파일을 불러오지 못했습니다. 내 기록과 직접 입력 기능은 그대로 사용할 수 있습니다.";
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
  renderIpoCalendarCandidates();
  renderIpoCalendarSyncMeta();
  renderIpoCalendar();
}

function normalizeIpoScheduleItem(item) {
  const sourceId = String(item?.sourceId || "").trim();
  const offerPrice = Math.max(0, toNumber(item?.offerPrice));
  return {
    id: `ipo-schedule-${sourceId}`,
    sourceId,
    company: String(item?.company || "").trim(),
    market: String(item?.market || "").trim(),
    broker: String(item?.broker || "").trim(),
    filingDate: normalizeInputDate(item?.filingDate),
    bookbuildingStart: normalizeInputDate(item?.bookbuildingStart),
    bookbuildingEnd: normalizeInputDate(item?.bookbuildingEnd),
    subscriptionStart: normalizeInputDate(item?.subscriptionStart),
    subscriptionEnd: normalizeInputDate(item?.subscriptionEnd || item?.subscriptionStart),
    paymentDate: normalizeInputDate(item?.paymentDate),
    listingDate: normalizeInputDate(item?.listingDate),
    offerPrice,
    offeringAmountMillions: Math.max(0, toNumber(item?.offeringAmountMillions)),
    priceStatus: offerPrice > 0 ? "confirmed" : "pending",
    status: ["scheduled", "cancelled", "unavailable"].includes(String(item?.status)) ? String(item.status) : "scheduled",
    changeStatus: String(item?.changeStatus || "unchanged"),
    changes: Array.isArray(item?.changes) ? item.changes : [],
    fingerprint: String(item?.fingerprint || "").trim(),
    sourceName: String(item?.sourceName || ipoCalendarPayload?.source?.name || "KRX KIND"),
    sourceUrl: String(item?.sourceUrl || "").trim(),
    sourceUpdatedAt: String(item?.sourceUpdatedAt || ipoCalendarPayload?.updatedAt || "").trim()
  };
}

function getIpoScheduleReviews() {
  return ipoCalendarCandidates.map((schedule) => {
    const record = findIpoRecordForSchedule(schedule);
    const differences = record ? getIpoScheduleDifferences(record, schedule) : [];
    const sourceNeedsReview = ["cancelled", "unavailable"].includes(schedule.status);
    const state = sourceNeedsReview ? "review" : !record ? "new" : differences.length ? "changed" : "synced";
    return {
      schedule,
      record,
      differences,
      state,
      actionable: Boolean(record) && (differences.length > 0 || sourceNeedsReview)
    };
  });
}

function findIpoRecordForSchedule(schedule) {
  const direct = ipoRecords.find((record) => record.scheduleId && record.scheduleId === schedule.sourceId);
  if (direct) return direct;
  const companyKey = normalizeKeyText(schedule.company);
  const legacyMatches = ipoRecords.filter((record) =>
    !record.scheduleId
    && record.source === "calendar"
    && normalizeKeyText(record.baseCompany || record.company) === companyKey
  );
  return legacyMatches.length === 1 ? legacyMatches[0] : null;
}

function getIpoScheduleDifferences(record, schedule) {
  const differences = IPO_SCHEDULE_MANAGED_FIELDS.flatMap((field) => {
    const incoming = schedule[field.source];
    if (field.requireValue && !incoming) return [];
    if (field.local === "broker" && record.broker) return [];
    const current = record[field.local];
    if (String(current || "") === String(incoming || "")) return [];
    return [{ ...field, current, incoming }];
  });
  if (["cancelled", "unavailable"].includes(schedule.status) && record.scheduleStatus !== schedule.status) {
    differences.push({ local: "scheduleStatus", source: "status", label: "공개 일정 상태", current: record.scheduleStatus || "scheduled", incoming: schedule.status });
  }
  return differences;
}

function syncIpoScheduleSelection(reviews) {
  const actionableIds = new Set(reviews.filter((review) => review.actionable).map((review) => review.schedule.sourceId));
  selectedIpoScheduleIds = new Set([...selectedIpoScheduleIds].filter((sourceId) => actionableIds.has(sourceId)));
}

function renderIpoCalendarCandidates() {
  if (!els.ipoCalendarCandidates) return;
  const reviews = getIpoScheduleReviews();
  syncIpoScheduleSelection(reviews);
  renderIpoScheduleSummary(reviews);
  if (!reviews.length) {
    els.ipoCalendarCandidates.innerHTML = `<div class="empty compact-empty">현재 조회 범위에 표시할 KRX 공개 일정이 없습니다.</div>`;
    syncIpoScheduleActionButtons(reviews);
    return;
  }
  els.ipoCalendarCandidates.innerHTML = reviews.map(renderIpoScheduleReview).join("");
  attachIpoScheduleReviewHandlers(reviews);
  syncIpoScheduleActionButtons(reviews);
}

function renderIpoScheduleReview(review) {
  const { schedule, record, differences, state, actionable } = review;
  const stateLabels = { new: "새 일정", changed: "변경 있음", synced: "반영 완료", review: schedule.status === "cancelled" ? "취소/철회" : "확인 필요" };
  const canAdd = state === "new" && schedule.status === "scheduled";
  return `
    <article class="ipo-candidate ipo-schedule-review ${escapeHtml(state)}">
      <div class="ipo-schedule-review-main">
        <div class="ipo-schedule-review-title">
          ${actionable ? `<input type="checkbox" data-select-ipo-schedule="${escapeHtml(schedule.sourceId)}" aria-label="${escapeHtml(schedule.company)} 변경 선택" ${selectedIpoScheduleIds.has(schedule.sourceId) ? "checked" : ""}>` : ""}
          <div>
            <span class="ipo-schedule-state ${escapeHtml(state)}">${escapeHtml(stateLabels[state])}</span>
            <strong>${escapeHtml(schedule.company)}</strong>
          </div>
        </div>
        <span>${escapeHtml(formatIpoDateRange(schedule.subscriptionStart, schedule.subscriptionEnd))} · ${escapeHtml(schedule.broker || "주관사 미정")}</span>
        <div class="ipo-schedule-facts">
          <span><i class="ti ti-calendar" aria-hidden="true"></i> 상장 ${escapeHtml(schedule.listingDate || "미정")}</span>
          <span><i class="ti ti-cash" aria-hidden="true"></i> ${escapeHtml(renderIpoSchedulePrice(schedule))}</span>
          <span>${escapeHtml(schedule.market || "시장 미정")}</span>
        </div>
        ${differences.length ? `<dl class="ipo-schedule-diffs">${differences.map(renderIpoScheduleDifference).join("")}</dl>` : ""}
        ${record && state === "synced" ? `<small>내 기록 ${escapeHtml(record.company)}과 최신 일정이 일치합니다.</small>` : ""}
      </div>
      <div class="ipo-schedule-review-actions">
        ${canAdd ? `<button type="button" data-add-ipo-schedule="${escapeHtml(schedule.sourceId)}">내 기록에 추가</button>` : ""}
        ${actionable ? `<button type="button" data-apply-ipo-schedule="${escapeHtml(schedule.sourceId)}">이 변경 반영</button>` : ""}
        ${schedule.sourceUrl ? `<a href="${escapeHtml(schedule.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(schedule.company)} KIND 원문 보기"><i class="ti ti-world-www" aria-hidden="true"></i></a>` : ""}
      </div>
    </article>
  `;
}

function renderIpoScheduleDifference(difference) {
  return `
    <div>
      <dt>${escapeHtml(difference.label)}</dt>
      <dd><del>${escapeHtml(formatIpoScheduleFieldValue(difference.local, difference.current))}</del><i class="ti ti-arrow-right" aria-hidden="true"></i><ins>${escapeHtml(formatIpoScheduleFieldValue(difference.local, difference.incoming))}</ins></dd>
    </div>
  `;
}

function renderIpoScheduleSummary(reviews) {
  if (!els.ipoScheduleSummary) return;
  const values = [
    ["새 일정", reviews.filter((review) => review.state === "new").length, "new"],
    ["변경", reviews.filter((review) => review.state === "changed").length, "changed"],
    ["확인 필요", reviews.filter((review) => review.state === "review").length, "review"],
    ["반영 완료", reviews.filter((review) => review.state === "synced").length, "synced"]
  ];
  els.ipoScheduleSummary.innerHTML = values.map(([label, count, state]) => `<span class="${state}"><b>${Number(count).toLocaleString("ko-KR")}</b>${label}</span>`).join("");
}

function attachIpoScheduleReviewHandlers(reviews) {
  els.ipoCalendarCandidates.querySelectorAll("[data-select-ipo-schedule]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) selectedIpoScheduleIds.add(input.dataset.selectIpoSchedule);
      else selectedIpoScheduleIds.delete(input.dataset.selectIpoSchedule);
      syncIpoScheduleActionButtons(reviews);
    });
  });
  els.ipoCalendarCandidates.querySelectorAll("[data-add-ipo-schedule]").forEach((button) => {
    button.addEventListener("click", () => addIpoScheduleToRecords(button.dataset.addIpoSchedule));
  });
  els.ipoCalendarCandidates.querySelectorAll("[data-apply-ipo-schedule]").forEach((button) => {
    button.addEventListener("click", () => applyIpoScheduleUpdates([button.dataset.applyIpoSchedule]));
  });
}

function syncIpoScheduleActionButtons(reviews = getIpoScheduleReviews()) {
  const actionable = reviews.filter((review) => review.actionable);
  const selectedCount = actionable.filter((review) => selectedIpoScheduleIds.has(review.schedule.sourceId)).length;
  if (els.selectChangedIpoSchedules) {
    els.selectChangedIpoSchedules.disabled = actionable.length === 0;
    els.selectChangedIpoSchedules.textContent = actionable.length && selectedCount === actionable.length ? "선택 해제" : "변경 선택";
  }
  if (els.applySelectedIpoSchedules) {
    els.applySelectedIpoSchedules.disabled = selectedCount === 0;
    els.applySelectedIpoSchedules.textContent = selectedCount ? `선택 ${selectedCount.toLocaleString("ko-KR")}건 반영` : "선택 반영";
  }
}

function toggleIpoScheduleSelection() {
  const actionable = getIpoScheduleReviews().filter((review) => review.actionable);
  const allSelected = actionable.length && actionable.every((review) => selectedIpoScheduleIds.has(review.schedule.sourceId));
  selectedIpoScheduleIds = allSelected ? new Set() : new Set(actionable.map((review) => review.schedule.sourceId));
  renderIpoCalendarCandidates();
}

async function addIpoScheduleToRecords(sourceId) {
  const schedule = ipoCalendarCandidates.find((item) => item.sourceId === sourceId);
  if (!schedule || schedule.status !== "scheduled") return;
  const existing = findIpoRecordForSchedule(schedule);
  if (existing) {
    els.ipoCalendarStatus.textContent = `${schedule.company}은(는) 이미 내 기록에 연결되어 있습니다.`;
    return;
  }
  await createAutoSnapshot("공모주 공개 일정 추가 전");
  ipoRecords.unshift(normalizeIpoRecord({
    id: `ipo-calendar-${schedule.sourceId}`,
    company: schedule.company,
    baseCompany: schedule.company,
    market: schedule.market,
    broker: schedule.broker,
    subscriptionStart: schedule.subscriptionStart,
    subscriptionEnd: schedule.subscriptionEnd,
    refundDate: schedule.paymentDate,
    listingDate: schedule.listingDate,
    offerPrice: schedule.offerPrice,
    allocationResult: "pending",
    calculationVersion: "quantity-v2",
    source: "calendar",
    sourceLabel: "KRX 공개 일정",
    scheduleId: schedule.sourceId,
    scheduleFingerprint: schedule.fingerprint,
    scheduleStatus: schedule.status,
    scheduleSourceUrl: schedule.sourceUrl,
    scheduleSyncedAt: new Date().toISOString()
  }));
  await saveIpoRecords();
  els.ipoCalendarStatus.textContent = `${schedule.company} 일정을 내 기록에 추가했습니다.`;
  renderIpoView();
  renderIpoCalendarCandidates();
}

async function applyIpoScheduleUpdates(sourceIds) {
  const requested = new Set((sourceIds || []).filter(Boolean));
  const reviews = getIpoScheduleReviews().filter((review) => review.actionable && requested.has(review.schedule.sourceId));
  if (!reviews.length) return;
  await createAutoSnapshot("공모주 공개 일정 변경 반영 전");
  const reviewByRecordId = new Map(reviews.map((review) => [review.record.id, review]));
  ipoRecords = ipoRecords.map((record) => {
    const review = reviewByRecordId.get(record.id);
    if (!review) return record;
    const next = { ...record };
    IPO_SCHEDULE_MANAGED_FIELDS.forEach((field) => {
      const incoming = review.schedule[field.source];
      if (field.requireValue && !incoming) return;
      if (field.local === "broker" && record.broker) return;
      next[field.local] = incoming;
    });
    return normalizeIpoRecord({
      ...next,
      scheduleId: review.schedule.sourceId,
      scheduleFingerprint: review.schedule.fingerprint,
      scheduleStatus: review.schedule.status,
      scheduleSourceUrl: review.schedule.sourceUrl,
      scheduleSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
  await saveIpoRecords();
  reviews.forEach((review) => selectedIpoScheduleIds.delete(review.schedule.sourceId));
  els.ipoCalendarStatus.textContent = `${reviews.length.toLocaleString("ko-KR")}건의 공개 일정 변경을 내 기록에 반영했습니다.`;
  renderIpoView();
  renderIpoCalendarCandidates();
}

function renderIpoCalendarSyncMeta() {
  if (!els.ipoCalendarSyncMeta) return;
  if (!ipoCalendarPayload) {
    els.ipoCalendarSyncMeta.textContent = "공개 일정이 아직 연결되지 않았습니다.";
    return;
  }
  const sourceName = ipoCalendarPayload.source?.name || "KRX KIND";
  const rangeLabel = ipoCalendarPayload.range?.label || "최근 일정";
  const updated = formatIpoSyncTimestamp(ipoCalendarPayload.updatedAt);
  els.ipoCalendarSyncMeta.innerHTML = `<span><i class="ti ti-database" aria-hidden="true"></i>${escapeHtml(sourceName)} · ${escapeHtml(rangeLabel)}</span><span>데이터 변경 ${escapeHtml(updated)}</span><span>공개 일정은 투자 참고용이며 실제 일정은 달라질 수 있습니다.</span>`;
}

function renderIpoSchedulePrice(schedule) {
  return Number(schedule?.offerPrice || 0) > 0 ? formatWon(schedule.offerPrice) : "공모가 확정 전";
}

function ipoScheduleStatusLabel(schedule) {
  if (schedule?.status === "cancelled") return "취소/철회";
  if (schedule?.status === "unavailable") return "출처 확인 필요";
  return schedule?.priceStatus === "confirmed" ? "공모가 확정" : "일정 예정";
}

function formatIpoScheduleFieldValue(field, value) {
  if (field === "offerPrice") return Number(value || 0) ? formatWon(value) : "확정 전";
  if (field === "scheduleStatus") return value === "cancelled" ? "취소/철회" : value === "unavailable" ? "확인 필요" : "정상";
  return String(value || "미정");
}

function formatIpoSyncTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시각 미확인";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function ipoStatus(item) {
  if (isIpoUnallocated(item)) return { key: "unallocated", label: "미배정" };
  if (isIpoRealized(item)) return { key: "sold", label: "매도 완료" };
  if (Number(item.allocatedShares || 0) > 0) return { key: "allocated", label: "배정/매도 대기" };
  const today = new Date().toISOString().slice(0, 10);
  if (item.subscriptionEnd && item.subscriptionEnd < today) return { key: "applied", label: "배정 대기" };
  return { key: "planned", label: "청약 예정" };
}

function isIpoUnallocated(item) {
  return normalizeIpoAllocationResult(item?.allocationResult) === "unallocated";
}

function isIpoRealized(item) {
  return Boolean(item?.sellDate) && !isIpoUnallocated(item);
}

function ipoTotalSellAmount(item) {
  return Math.max(0, toNumber(item?.totalSellAmount || item?.sellAmount));
}

function ipoAllocationLabel(item) {
  const allocationResult = normalizeIpoAllocationResult(item?.allocationResult);
  if (allocationResult === "unallocated") return "미배정";
  if (allocationResult === "allocated" || Number(item?.allocatedShares || 0) > 0) return "배정";
  return "대기/미확인";
}

function parseIpoCompanyAndShares(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.+?)\s*[\(\[]?(\d+)\s*(?:개|주)[\)\]]?$/);
  if (!match) return { company: text, shares: 0, hasShares: false };
  return { company: match[1].trim(), shares: Number(match[2] || 0), hasShares: true };
}

function normalizeIpoLooseDate(value) {
  const normalized = normalizeInputDate(value);
  if (normalized) return normalized;
  const text = String(value || "").trim();
  const korean = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) {
    const year = new Date().getFullYear();
    return `${year}-${korean[1].padStart(2, "0")}-${korean[2].padStart(2, "0")}`;
  }
  return "";
}

function formatIpoDateRange(start, end) {
  if (!start && !end) return "-";
  if (!end || start === end) return start || end;
  return `${start} ~ ${end}`;
}

function formatIpoMonthLabel(month) {
  const [year, monthNumber] = String(month || "").split("-");
  if (!year || !monthNumber) return month || "";
  return `${year}년 ${monthNumber}월`;
}

function formatIpoDisplayDate(date) {
  const [year, month, day] = String(date || "").split("-");
  if (!year || !month || !day) return date || "";
  return `${year}년 ${month}월 ${day}일`;
}

function formatIpoRate(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}%`;
}

function formatIpoMarketPrices(item) {
  const values = [
    item.openPrice ? `시 ${formatWon(item.openPrice)}` : "",
    item.highPrice ? `고 ${formatWon(item.highPrice)}` : "",
    item.closePrice ? `종 ${formatWon(item.closePrice)}` : ""
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "자동/수동 입력 대기";
}
