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
    sellDate: els.ipoSellDate.value,
    sellPrice: els.ipoSellPrice.value,
    sellAmount: els.ipoSellAmount.value,
    sellFee: els.ipoSellFee.value,
    openPrice: els.ipoOpenPrice.value,
    highPrice: els.ipoHighPrice.value,
    closePrice: els.ipoClosePrice.value,
    memo: els.ipoMemo.value.trim(),
    source: "manual",
    sourceLabel: "직접 입력",
    createdAt: ipoRecords.find((item) => item.id === els.ipoId.value)?.createdAt || new Date().toISOString(),
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
  updateIpoComputedPreview();
}

function updateIpoComputedPreview() {
  if (!els.ipoComputedProfit || !els.ipoComputedRate) return;
  const preview = normalizeIpoRecord({
    company: els.ipoCompany?.value || "미리보기",
    offerPrice: els.ipoOfferPrice?.value,
    applicationFee: els.ipoApplicationFee?.value,
    allocatedShares: els.ipoAllocatedShares?.value,
    sellPrice: els.ipoSellPrice?.value,
    sellAmount: els.ipoSellAmount?.value,
    sellFee: els.ipoSellFee?.value
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
  const active = ipoRecords.filter((item) => !item.sellDate);
  const waitingAllocation = ipoRecords.filter((item) => item.subscriptionEnd && item.subscriptionEnd < today && !item.allocatedShares);
  const waitingSell = ipoRecords.filter((item) => Number(item.allocatedShares || 0) > 0 && !item.sellDate);
  const realized = ipoRecords.filter((item) => item.sellDate);
  const realizedProfit = realized.reduce((total, item) => total + Number(item.profit || 0), 0);
  const settlementProfit = realized.reduce((total, item) => total + Number(item.settlementProfit || 0), 0);
  const winCount = realized.filter((item) => Number(item.profit || 0) > 0).length;
  els.ipoSummaryCards.innerHTML = [
    renderIpoSummaryCard("진행 중", `${active.length.toLocaleString("ko-KR")}건`, "청약·배정·매도 대기"),
    renderIpoSummaryCard("배정 대기", `${waitingAllocation.length.toLocaleString("ko-KR")}건`, "청약 종료 후 배정 미입력"),
    renderIpoSummaryCard("매도 대기", `${waitingSell.length.toLocaleString("ko-KR")}건`, "배정 후 매도 미입력"),
    renderIpoSummaryCard("누적 손익", formatSignedWon(realizedProfit), "수수료 제외 손익", realizedProfit),
    renderIpoSummaryCard("최종 정산 손익", formatSignedWon(settlementProfit), `${realized.length.toLocaleString("ko-KR")}건 수수료 반영`, settlementProfit),
    renderIpoSummaryCard("승률", realized.length ? `${Math.round(winCount / realized.length * 100)}%` : "0%", `${winCount}/${realized.length}건 수익`)
  ].join("");
}

function renderIpoSummaryCard(label, value, hint, amount = 0) {
  const tone = amount > 0 ? "positive" : amount < 0 ? "negative" : "";
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
  syncIpoCalendarMonthOptions();
  const month = selectedIpoCalendarMonth || currentMonthKey();
  const events = buildIpoCalendarEvents();
  const monthlyEvents = events.filter((event) => event.date.startsWith(`${month}-`));
  syncSelectedIpoCalendarEvent(month, monthlyEvents);
  els.ipoCalendarGrid.innerHTML = renderIpoCalendarMonth(month, monthlyEvents);
  renderIpoCalendarDetail(month, monthlyEvents);
  attachIpoCalendarHandlers();
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
  return `
    <div class="ipo-calendar-weekdays">
      ${["일", "월", "화", "수", "목", "금", "토"].map((day) => `<span>${day}</span>`).join("")}
    </div>
    <div class="ipo-calendar-month-grid">
      ${cells.join("")}
    </div>
    ${events.length ? "" : `<div class="empty compact-empty">${escapeHtml(formatIpoMonthLabel(month))}에는 등록된 공모주 일정이 없습니다.</div>`}
  `;
}

function renderIpoCalendarDay(date, events) {
  const isSelected = date === selectedIpoCalendarDate;
  return `
    <div class="ipo-calendar-cell ${events.length ? "has-event" : ""} ${isSelected ? "selected" : ""}" data-ipo-calendar-date="${escapeHtml(date)}">
      <strong>${Number(date.slice(-2))}</strong>
      <div class="ipo-calendar-day-events">
        ${events.slice(0, 4).map(renderIpoCalendarEvent).join("")}
        ${events.length > 4 ? `<span class="ipo-calendar-more">+${events.length - 4}건</span>` : ""}
      </div>
    </div>
  `;
}

function buildIpoCalendarEvents() {
  return ipoRecords
    .flatMap((item) => {
      const record = normalizeIpoRecord(item);
      return [
        record.subscriptionStart ? { key: "subscriptionStart", date: record.subscriptionStart, type: "청약", item: record } : null,
        record.subscriptionEnd && record.subscriptionEnd !== record.subscriptionStart ? { key: "subscriptionEnd", date: record.subscriptionEnd, type: "청약 마감", item: record } : null,
        record.refundDate ? { key: "refundDate", date: record.refundDate, type: "환불", item: record } : null,
        record.listingDate ? { key: "listingDate", date: record.listingDate, type: "상장", item: record } : null,
        record.sellDate ? { key: "sellDate", date: record.sellDate, type: "매도", item: record } : null
      ].filter(Boolean);
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date), "ko-KR"));
}

function renderIpoCalendarEvent(event) {
  const status = ipoStatus(event.item);
  const amount = event.type === "매도"
    ? formatSignedWon(event.item.profit)
    : formatWon(event.item.offerPrice || event.item.depositAmount || 0);
  return `
    <button class="ipo-calendar-event ${escapeHtml(ipoCalendarEventClass(event))} ${isSelectedIpoCalendarEvent(event) ? "selected" : ""}" type="button" data-ipo-calendar-date="${escapeHtml(event.date)}" data-ipo-calendar-record="${escapeHtml(event.item.id)}" data-ipo-calendar-event="${escapeHtml(event.key)}">
      <span class="ipo-event-type">${escapeHtml(event.type)}</span>
      <strong>${escapeHtml(event.item.company)}</strong>
      <small>${escapeHtml([event.item.broker, status.label].filter(Boolean).join(" · "))}</small>
      <b class="${Number(event.item.profit || 0) > 0 && event.type === "매도" ? "positive" : Number(event.item.profit || 0) < 0 && event.type === "매도" ? "negative" : ""}">${escapeHtml(amount)}</b>
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
          <small>${escapeHtml(event.item.broker || "증권사 미입력")}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function renderIpoCalendarSelectedRecord(event) {
  const item = event.item;
  const status = ipoStatus(item);
  const detailRows = [
    ["일정", event.type],
    ["상태", status.label],
    ["청약일", formatIpoDateRange(item.subscriptionStart, item.subscriptionEnd)],
    ["환불일", item.refundDate || "-"],
    ["상장일", item.listingDate || "-"],
    ["매도일", item.sellDate || "-"],
    ["증권사", item.broker || "-"],
    ["공모가", formatWon(item.offerPrice)],
    ["청약 주수", item.appliedShares ? `${Number(item.appliedShares).toLocaleString("ko-KR")}주` : "-"],
    ["배정 주수", item.allocatedShares ? `${Number(item.allocatedShares).toLocaleString("ko-KR")}주` : "-"],
    ["청약 수수료", formatWon(item.applicationFee)],
    ["매도 수수료", formatWon(item.sellFee)],
    ["총 매도금액", item.sellAmount ? formatWon(item.sellAmount) : "-"],
    ["손익", item.sellAmount ? formatSignedWon(item.profit) : "-"],
    ["손익률", item.sellAmount ? formatIpoRate(item.profitRate) : "-"],
    ["최종 정산 손익", item.sellAmount ? formatSignedWon(item.settlementProfit) : "-"],
    ["시가/고가/종가", formatIpoMarketPrices(item)]
  ];
  return `
    <article class="ipo-calendar-selected-card ${Number(item.profit || 0) > 0 ? "profit" : Number(item.profit || 0) < 0 ? "loss" : ""}">
      <div class="ipo-calendar-selected-head">
        <div>
          <span class="ipo-event-type">${escapeHtml(event.type)}</span>
          <h4>${escapeHtml(item.company)}</h4>
          <p>${escapeHtml([item.market, item.sourceLabel].filter(Boolean).join(" · ") || "직접 입력")}</p>
        </div>
        <button type="button" data-edit-ipo="${escapeHtml(item.id)}">수정</button>
      </div>
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

function attachIpoCalendarHandlers() {
  els.ipoCalendarGrid.querySelectorAll("[data-ipo-calendar-date]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (node.classList.contains("ipo-calendar-event")) event.stopPropagation();
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
}

function ipoCalendarEventClass(event) {
  if (event.type === "환불") return "refund";
  if (event.type === "상장") return "listing";
  if (event.type === "매도") return Number(event.item.profit || 0) < 0 ? "sell loss" : "sell";
  return "subscription";
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
      return normalizeKeyText([item.company, item.market, item.broker, item.memo, item.sourceLabel].join(" ")).includes(search);
    })
    .sort(sortIpoRecords);
}

function sortIpoRecords(a, b) {
  if (ipoFilters.sort === "profit-desc") return Number(b.profit || 0) - Number(a.profit || 0);
  if (ipoFilters.sort === "profit-asc") return Number(a.profit || 0) - Number(b.profit || 0);
  if (ipoFilters.sort === "listing-desc") return String(b.listingDate || "").localeCompare(String(a.listingDate || ""), "ko-KR");
  if (ipoFilters.sort === "sell-desc") return String(b.sellDate || "").localeCompare(String(a.sellDate || ""), "ko-KR");
  return String(b.subscriptionStart || b.createdAt || "").localeCompare(String(a.subscriptionStart || a.createdAt || ""), "ko-KR");
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
          <strong>${item.sellDate ? formatSignedWon(item.profit) : formatWon(item.depositAmount || item.offerPrice * item.appliedShares || 0)}</strong>
          <span>${item.sellDate ? `수수료 제외 · ${formatIpoRate(item.profitRate)}` : "청약/배정 진행"}</span>
        </div>
      </div>
      <dl class="ipo-card-grid">
        <div><dt>청약일</dt><dd>${escapeHtml(formatIpoDateRange(item.subscriptionStart, item.subscriptionEnd))}</dd></div>
        <div><dt>환불/상장</dt><dd>${escapeHtml([item.refundDate || "-", item.listingDate || "-"].join(" / "))}</dd></div>
        <div><dt>공모가</dt><dd>${formatWon(item.offerPrice)}</dd></div>
        <div><dt>배정</dt><dd>${Number(item.allocatedShares || 0).toLocaleString("ko-KR")}주</dd></div>
        <div><dt>총 매도 금액</dt><dd>${item.sellAmount ? formatWon(item.sellAmount) : "-"}</dd></div>
        <div><dt>최종 정산 손익</dt><dd>${item.sellAmount ? formatSignedWon(item.settlementProfit) : "-"}</dd></div>
        <div><dt>시가/고가/종가</dt><dd>${formatIpoMarketPrices(item)}</dd></div>
      </dl>
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
  els.ipoSellDate.value = item.sellDate;
  els.ipoSellPrice.value = item.sellPrice ? formatPlainNumber(item.sellPrice) : "";
  els.ipoSellAmount.value = item.sellAmount ? formatPlainNumber(item.sellAmount) : "";
  els.ipoSellFee.value = item.sellFee ? formatPlainNumber(item.sellFee) : "";
  els.ipoOpenPrice.value = item.openPrice ? formatPlainNumber(item.openPrice) : "";
  els.ipoHighPrice.value = item.highPrice ? formatPlainNumber(item.highPrice) : "";
  els.ipoClosePrice.value = item.closePrice ? formatPlainNumber(item.closePrice) : "";
  els.ipoMemo.value = item.memo;
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
  const lines = String(els.ipoPasteInput.value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  ipoPasteRows = lines.map(parseIpoPasteLine);
  renderIpoPastePreview();
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
    allocatedShares: parsedCompany.shares || 1,
    sellAmount: parseIpoMoneyValue(sellRaw),
    highPrice: parseIpoMoneyValue(highRaw),
    openPrice: parseIpoMoneyValue(openRaw),
    closePrice: parseIpoMoneyValue(closeRaw),
    depositAmount: parseIpoMoneyValue(depositRaw),
    memo: [memoRaw, profitRaw ? `기존 손익 ${profitRaw}` : "", rateRaw ? `기존 손익률 ${rateRaw}` : ""].filter(Boolean).join(" · "),
    source: "paste",
    sourceLabel: "붙여넣기"
  });
  const error = !row.subscriptionStart ? "날짜 확인 필요" : !row.company ? "종목명 확인 필요" : !row.offerPrice ? "공모가 확인 필요" : "";
  return { ...row, original: line, valid: !error, error };
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
  els.saveIpoPasteButton.disabled = validCount === 0;
  els.ipoPasteFeedback.textContent = ipoPasteRows.length ? `${validCount.toLocaleString("ko-KR")}건 저장 가능` : "";
  if (!ipoPasteRows.length) {
    els.ipoPastePreview.innerHTML = `<tbody><tr><td class="empty">붙여넣기 내용을 파싱하면 미리보기가 표시됩니다.</td></tr></tbody>`;
    return;
  }
  els.ipoPastePreview.innerHTML = `
    <thead><tr><th>상태</th><th>청약일</th><th>종목</th><th>증권사</th><th>공모가</th><th>배정</th><th>총 매도금액</th><th>손익/정산</th><th>삭제</th></tr></thead>
    <tbody>
      ${ipoPasteRows.map((row, index) => `
        <tr class="${row.valid ? "" : "invalid"}">
          <td>${row.valid ? "정상" : escapeHtml(row.error)}</td>
          <td><input data-ipo-paste-index="${index}" data-ipo-paste-field="subscriptionStart" type="date" value="${escapeHtml(row.subscriptionStart)}"></td>
          <td><input data-ipo-paste-index="${index}" data-ipo-paste-field="company" type="text" value="${escapeHtml(row.company)}"></td>
          <td><input data-ipo-paste-index="${index}" data-ipo-paste-field="broker" type="text" value="${escapeHtml(row.broker)}"></td>
          <td><input data-ipo-paste-index="${index}" data-ipo-paste-field="offerPrice" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(row.offerPrice))}"></td>
          <td><input data-ipo-paste-index="${index}" data-ipo-paste-field="allocatedShares" type="number" min="0" value="${escapeHtml(row.allocatedShares || "")}"></td>
          <td><input data-ipo-paste-index="${index}" data-ipo-paste-field="sellAmount" type="text" inputmode="numeric" value="${escapeHtml(row.sellAmount ? formatPlainNumber(row.sellAmount) : "")}"></td>
          <td><span class="ipo-profit-stack"><strong>${escapeHtml(formatSignedWon(row.profit))}</strong><small>정산 ${escapeHtml(formatSignedWon(row.settlementProfit))}</small></span></td>
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

function updateIpoPasteRow(input) {
  const index = Number(input.dataset.ipoPasteIndex);
  const field = input.dataset.ipoPasteField;
  const current = ipoPasteRows[index];
  const next = { ...current, [field]: input.value, source: "paste", sourceLabel: "붙여넣기" };
  ipoPasteRows[index] = normalizeIpoRecord(next);
  ipoPasteRows[index].valid = Boolean(ipoPasteRows[index].subscriptionStart && ipoPasteRows[index].company && ipoPasteRows[index].offerPrice);
  ipoPasteRows[index].error = ipoPasteRows[index].valid ? "" : "필수값 확인 필요";
  renderIpoPastePreview();
}

async function saveIpoPasteRows() {
  const rows = ipoPasteRows.filter((row) => row.valid).map((row) => normalizeIpoRecord({
    ...row,
    id: `ipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  if (!rows.length) return;
  await createAutoSnapshot("공모주 붙여넣기 저장 전");
  ipoRecords = mergeIpoRecords(ipoRecords, rows);
  await saveIpoRecords();
  ipoPasteRows = [];
  els.ipoPasteInput.value = "";
  selectedIpoSubtab = "records";
  renderIpoView();
}

function clearIpoPasteInput() {
  ipoPasteRows = [];
  els.ipoPasteInput.value = "";
  renderIpoPastePreview();
}

async function loadIpoCalendarCandidates() {
  if (!els.ipoCalendarStatus) return;
  els.ipoCalendarStatus.textContent = "일정 데이터를 확인하는 중입니다.";
  try {
    const response = await fetch("./data/ipo-calendar.json", { cache: "no-store" });
    if (!response.ok) throw new Error("ipo-calendar.json not found");
    const payload = await response.json();
    ipoCalendarCandidates = Array.isArray(payload?.items) ? payload.items.map(normalizeIpoRecord) : [];
    els.ipoCalendarStatus.textContent = ipoCalendarCandidates.length
      ? `${ipoCalendarCandidates.length.toLocaleString("ko-KR")}건의 일정 후보를 불러왔습니다.`
      : "불러올 일정 후보가 없습니다.";
  } catch (error) {
    ipoCalendarCandidates = [];
    els.ipoCalendarStatus.textContent = "자동 일정 파일이 아직 없습니다. 직접 입력과 붙여넣기는 정상 사용 가능합니다.";
  }
  renderIpoCalendarCandidates();
}

function renderIpoCalendarCandidates() {
  if (!els.ipoCalendarCandidates) return;
  if (!ipoCalendarCandidates.length) {
    els.ipoCalendarCandidates.innerHTML = `<div class="empty compact-empty">GitHub Actions가 만든 data/ipo-calendar.json이 있으면 공모주 일정 후보가 여기에 표시됩니다.</div>`;
    return;
  }
  els.ipoCalendarCandidates.innerHTML = ipoCalendarCandidates.map((item, index) => `
    <article class="ipo-candidate">
      <div>
        <strong>${escapeHtml(item.company)}</strong>
        <span>${escapeHtml(formatIpoDateRange(item.subscriptionStart, item.subscriptionEnd))} · ${escapeHtml(item.broker || "증권사 미입력")}</span>
      </div>
      <button type="button" data-add-ipo-candidate="${index}">내 기록에 추가</button>
    </article>
  `).join("");
  els.ipoCalendarCandidates.querySelectorAll("[data-add-ipo-candidate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = ipoCalendarCandidates[Number(button.dataset.addIpoCandidate)];
      if (!item) return;
      await createAutoSnapshot("공모주 일정 후보 추가 전");
      ipoRecords.unshift(normalizeIpoRecord({ ...item, id: `ipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, source: "calendar", sourceLabel: "일정 불러오기" }));
      await saveIpoRecords();
      renderIpoView();
    });
  });
}

function ipoStatus(item) {
  if (item.sellDate) return { key: "sold", label: "매도 완료" };
  if (Number(item.allocatedShares || 0) > 0) return { key: "allocated", label: "배정/매도 대기" };
  const today = new Date().toISOString().slice(0, 10);
  if (item.subscriptionEnd && item.subscriptionEnd < today) return { key: "applied", label: "배정 대기" };
  return { key: "planned", label: "청약 예정" };
}

function parseIpoCompanyAndShares(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.+?)\s*[\(\[]?(\d+)\s*(?:개|주)[\)\]]?$/);
  if (!match) return { company: text, shares: 0 };
  return { company: match[1].trim(), shares: Number(match[2] || 0) };
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
