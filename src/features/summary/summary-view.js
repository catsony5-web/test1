function renderSummary() {
  const active = reportingExpenseRows(classified);
  const allMonths = unique(active.map((item) => item.month).filter(Boolean)).sort();
  const months = updateSummaryRangeOptions(allMonths);
  const rangedActive = active.filter((item) => months.includes(item.month));
  const sectorNames = summaryMatrixSectors(rangedActive);
  const selectedSector = updateSummarySectorOptions(sectorNames);
  const selectedMonth = updateSummaryMonthOptions(months);
  const comparisonMonth = updateSummaryComparisonControls(allMonths, selectedMonth);
  const comparison = buildSummaryComparison(active, selectedMonth, selectedSector, {
    mode: selectedSummaryComparisonMode,
    comparisonMonth
  });
  renderSummaryComparisonNotice(comparison);
  const matrixRows = buildSummaryMatrixRows(rangedActive, months, sectorNames);
  renderSectorTrend(active, months, sectorNames, selectedSector, selectedMonth, comparison);
  renderSummaryPriority(matrixRows, sectorNames, selectedMonth, selectedSector, comparison);
  renderSummaryPattern(comparison, selectedSector);
  renderMonthlyFeedback(active, selectedMonth, comparison);
  renderSummaryPeriod(active, months, sectorNames, selectedMonth, selectedSector, comparison);
  renderSummaryMatrix(matrixRows, sectorNames, selectedMonth, selectedSector, comparisonMonth);
  syncSummarySubtabs();
}

const summaryMobileToDesktopSubtab = Object.freeze({
  trend: "trend",
  priority: "share",
  patterns: "detail",
  report: "report",
  period: "matrix"
});

function summaryMobileValueForSubtab(subtab) {
  return Object.entries(summaryMobileToDesktopSubtab)
    .find(([, desktopSubtab]) => desktopSubtab === subtab)?.[0] || "trend";
}

function selectSummarySubtab(subtab, { focus = false } = {}) {
  const button = document.querySelector(`[data-summary-subtab="${cssEscape(subtab)}"]`);
  if (!button) return;
  selectedSummarySubtab = subtab;
  syncSummarySubtabs();
  if (focus) button.focus();
}

function selectSummarySubtabFromMobile(mobileValue) {
  selectSummarySubtab(summaryMobileToDesktopSubtab[mobileValue] || "trend");
}

function summaryMonthControls() {
  return [els.summaryMonthSelect].filter(Boolean);
}

function summaryMonthButtonPairs() {
  return [
    { select: els.summaryMonthSelect, prev: els.summaryPrevMonth, next: els.summaryNextMonth }
  ].filter((pair) => pair.select || pair.prev || pair.next);
}

function summarySelectableMonths() {
  const control = summaryMonthControls().find((item) => item.options?.length);
  return [...(control?.options || [])].map((option) => option.value).filter(isValidMonthKey);
}

function syncSummaryMonthStepButtons(months, selectedMonth) {
  summaryMonthButtonPairs().forEach(({ select, prev, next }) => {
    const current = select?.value || selectedMonth;
    const index = months.indexOf(current);
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= months.length - 1;
  });
}

function moveSummaryMonth(control, offset) {
  const months = summarySelectableMonths();
  if (!months.length) return;
  const current = control?.value || selectedSummaryMonth || getSharedSelectedMonth(months.at(-1));
  const currentIndex = months.includes(current)
    ? months.indexOf(current)
    : offset > 0 ? -1 : months.length;
  const nextIndex = currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= months.length) return;

  setSharedSelectedMonth(months[nextIndex]);
  renderSummary();
}

function updateSummaryComparisonControls(allMonths, selectedMonth) {
  selectedSummaryComparisonMode = normalizeSummaryComparisonMode(selectedSummaryComparisonMode);
  if (selectedSummaryComparisonMode === "custom") {
    selectedSummaryComparisonMonth = resolveSummaryComparisonMonth(
      selectedMonth,
      "custom",
      selectedSummaryComparisonMonth
    );
  }
  const customSelection = isValidMonthKey(selectedSummaryComparisonMonth)
    ? selectedSummaryComparisonMonth
    : shiftMonthKey(selectedMonth, -1);
  const customMonths = [...new Set([...allMonths, customSelection])]
    .filter((month) => isValidMonthKey(month))
    .sort();

  els.summaryComparePreviousButton?.setAttribute("aria-pressed", selectedSummaryComparisonMode === "previous" ? "true" : "false");
  els.summaryCompareYearButton?.setAttribute("aria-pressed", selectedSummaryComparisonMode === "year-over-year" ? "true" : "false");
  els.summaryCompareCustomButton?.setAttribute("aria-pressed", selectedSummaryComparisonMode === "custom" ? "true" : "false");
  if (els.summaryComparisonMonthField) els.summaryComparisonMonthField.hidden = selectedSummaryComparisonMode !== "custom";
  if (els.summaryComparisonMonthSelect) {
    els.summaryComparisonMonthSelect.innerHTML = customMonths.length
      ? customMonths.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join("")
      : `<option value="">비교할 월 없음</option>`;
    els.summaryComparisonMonthSelect.value = customSelection;
    els.summaryComparisonMonthSelect.disabled = !customMonths.length;
  }
  return resolveSummaryComparisonMonth(
    selectedMonth,
    selectedSummaryComparisonMode,
    customSelection
  );
}

function setSummaryComparisonMode(mode) {
  const nextMode = normalizeSummaryComparisonMode(mode);
  if (selectedSummaryComparisonMode === nextMode) return;
  selectedSummaryComparisonMode = nextMode;
  renderSummary();
  if (nextMode === "custom") requestAnimationFrame(() => els.summaryComparisonMonthSelect?.focus());
}

function renderSummaryComparisonNotice(comparison) {
  if (!els.summaryComparisonNotice) return;
  let text = "분석 월과 비교 기준을 선택하세요.";
  if (comparison.selectedMonth && comparison.comparisonMonth) {
    text = comparison.cutoffDay
      ? `진행 중인 ${comparison.selectedMonth} · ${comparison.cutoffDay}일까지 ${comparison.comparisonMonth}와 동일 일자 비교 중`
      : `${comparison.selectedMonth} 전체 월을 ${comparison.comparisonMonth} ${comparison.comparisonLabel}과 비교 중`;
    if (!comparison.comparisonExists) text += " · 비교 월 지출 기록 없음";
  }
  els.summaryComparisonNotice.querySelector("span").textContent = text;
}

function syncSummarySubtabs() {
  const buttons = [...document.querySelectorAll("[data-summary-subtab]")];
  const panels = [...document.querySelectorAll("[data-summary-subtab-panel]")];
  const validTabs = buttons.map((button) => button.dataset.summarySubtab).filter(Boolean);
  if (!validTabs.length) return;
  if (!validTabs.includes(selectedSummarySubtab)) selectedSummarySubtab = validTabs[0];

  buttons.forEach((button) => {
    const isActive = button.dataset.summarySubtab === selectedSummarySubtab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
    button.onclick = () => {
      selectSummarySubtab(button.dataset.summarySubtab || validTabs[0]);
    };
    button.onkeydown = (event) => {
      const currentIndex = buttons.indexOf(button);
      let nextIndex = currentIndex;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % buttons.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = buttons.length - 1;
      else return;

      event.preventDefault();
      selectSummarySubtab(buttons[nextIndex].dataset.summarySubtab || validTabs[0], { focus: true });
    };
  });

  if (els.summaryMobileViewSelect) {
    els.summaryMobileViewSelect.value = summaryMobileValueForSubtab(selectedSummarySubtab);
  }

  panels.forEach((panel) => {
    const isActive = panel.dataset.summarySubtabPanel === selectedSummarySubtab;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
  });
  syncSummaryContextVisibility();
}

function syncSummaryContextVisibility() {
  const sectorVisible = ["trend", "share", "detail"].includes(selectedSummarySubtab);
  const rangeVisible = ["trend", "matrix"].includes(selectedSummarySubtab);
  if (els.summarySectorPicker) els.summarySectorPicker.hidden = !sectorVisible;
  document.querySelector(".summary-context-range")?.toggleAttribute("hidden", !rangeVisible);
  document.querySelectorAll(".summary-custom-range-field").forEach((field) => {
    field.hidden = !rangeVisible || selectedSummaryRangePreset !== "custom";
  });
  if (!sectorVisible) closeSummarySectorPicker();
}

function updateSummaryRangeOptions(allMonths) {
  const validPresets = ["recent-12", "recent-24", "all", "custom"];
  const presetControl = els.summaryRangePreset;
  selectedSummaryRangePreset = validPresets.includes(selectedSummaryRangePreset || presetControl?.value)
    ? selectedSummaryRangePreset || presetControl?.value
    : "recent-12";
  if (presetControl) presetControl.value = selectedSummaryRangePreset;

  if (!allMonths.length) {
    els.summaryStartMonth.innerHTML = `<option value="">전체</option>`;
    els.summaryEndMonth.innerHTML = `<option value="">전체</option>`;
    selectedSummaryStartMonth = "";
    selectedSummaryEndMonth = "";
    if (presetControl) presetControl.disabled = true;
    els.summaryStartMonth.disabled = true;
    els.summaryEndMonth.disabled = true;
    document.querySelectorAll(".summary-custom-range-field").forEach((field) => {
      field.hidden = true;
    });
    return [];
  }

  const optionHtml = (placeholder) => [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...allMonths.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`)
  ].join("");
  els.summaryStartMonth.innerHTML = optionHtml("처음부터");
  els.summaryEndMonth.innerHTML = optionHtml("끝까지");

  const latestMonth = allMonths.at(-1);
  const presetStartMonth = (monthCount) => {
    const threshold = shiftMonthKey(latestMonth, -(monthCount - 1));
    return allMonths.find((month) => month >= threshold) || allMonths[0];
  };

  if (selectedSummaryRangePreset === "all") {
    selectedSummaryStartMonth = "";
    selectedSummaryEndMonth = "";
  } else if (selectedSummaryRangePreset === "recent-12") {
    selectedSummaryStartMonth = presetStartMonth(12);
    selectedSummaryEndMonth = latestMonth;
  } else if (selectedSummaryRangePreset === "recent-24") {
    selectedSummaryStartMonth = presetStartMonth(24);
    selectedSummaryEndMonth = latestMonth;
  } else {
    const hasStart = allMonths.includes(selectedSummaryStartMonth || els.summaryStartMonth.value);
    const hasEnd = allMonths.includes(selectedSummaryEndMonth || els.summaryEndMonth.value);
    selectedSummaryStartMonth = hasStart ? selectedSummaryStartMonth || els.summaryStartMonth.value : "";
    selectedSummaryEndMonth = hasEnd ? selectedSummaryEndMonth || els.summaryEndMonth.value : "";
    if (selectedSummaryStartMonth && selectedSummaryEndMonth && selectedSummaryStartMonth > selectedSummaryEndMonth) {
      selectedSummaryEndMonth = selectedSummaryStartMonth;
    }
  }

  if (presetControl) {
    presetControl.disabled = false;
    presetControl.value = selectedSummaryRangePreset;
  }
  els.summaryStartMonth.value = selectedSummaryStartMonth;
  els.summaryEndMonth.value = selectedSummaryEndMonth;
  const isCustomRange = selectedSummaryRangePreset === "custom";
  els.summaryStartMonth.disabled = !isCustomRange;
  els.summaryEndMonth.disabled = !isCustomRange;
  document.querySelectorAll(".summary-custom-range-field").forEach((field) => {
    field.hidden = !isCustomRange;
  });

  return allMonths.filter((month) => {
    if (selectedSummaryStartMonth && month < selectedSummaryStartMonth) return false;
    if (selectedSummaryEndMonth && month > selectedSummaryEndMonth) return false;
    return true;
  });
}

function updateSummarySectorOptions(sectorNames) {
  const selectableSectors = sectorNames.filter((sector) => sector !== "수입");
  if (!selectableSectors.length) {
    selectedSummarySector = "";
    els.summarySectorPickerMenu.innerHTML = `<p class="summary-sector-picker-empty">선택할 섹터가 없습니다.</p>`;
    els.summarySectorPickerButton.disabled = true;
    els.summarySectorPickerText.textContent = "기록 없음";
    els.summarySectorPickerIcon.className = "ti ti-category summary-sector-icon";
    return "";
  }
  const previous = selectedSummarySector || "";
  selectedSummarySector = selectableSectors.includes(previous) ? previous : selectableSectors.includes("식비") ? "식비" : selectableSectors[0];
  els.summarySectorPickerButton.disabled = false;
  els.summarySectorPickerText.textContent = selectedSummarySector;
  els.summarySectorPickerIcon.className = `ti ${sectorIconClass(selectedSummarySector)} summary-sector-icon ${categoryClass(selectedSummarySector)}`;
  els.summarySectorPickerMenu.innerHTML = selectableSectors.map((sector) => `
    <button type="button" role="option" aria-selected="${sector === selectedSummarySector ? "true" : "false"}" data-summary-sector-option="${escapeHtml(sector)}">
      <i class="ti ${sectorIconClass(sector)} summary-sector-icon ${categoryClass(sector)}" aria-hidden="true"></i>
      <span>${escapeHtml(sector)}</span>
    </button>
  `).join("");
  return selectedSummarySector;
}

function openSummarySectorPicker({ focusSelected = false } = {}) {
  if (els.summarySectorPickerButton.disabled) return;
  els.summarySectorPickerMenu.hidden = false;
  els.summarySectorPickerButton.setAttribute("aria-expanded", "true");
  if (focusSelected) {
    requestAnimationFrame(() => {
      const selected = els.summarySectorPickerMenu.querySelector('[aria-selected="true"]');
      (selected || els.summarySectorPickerMenu.querySelector("[data-summary-sector-option]"))?.focus();
    });
  }
}

function closeSummarySectorPicker({ restoreFocus = false } = {}) {
  els.summarySectorPickerMenu.hidden = true;
  els.summarySectorPickerButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) els.summarySectorPickerButton.focus();
}

function toggleSummarySectorPicker() {
  if (els.summarySectorPickerMenu.hidden) openSummarySectorPicker();
  else closeSummarySectorPicker();
}

function selectSummarySector(sector) {
  if (!sector || sector === selectedSummarySector) {
    closeSummarySectorPicker({ restoreFocus: true });
    return;
  }
  selectedSummarySector = sector;
  closeSummarySectorPicker();
  renderSummary();
  requestAnimationFrame(() => els.summarySectorPickerButton.focus());
}

function moveSummarySectorPickerFocus(current, offset) {
  const options = [...els.summarySectorPickerMenu.querySelectorAll("[data-summary-sector-option]")];
  if (!options.length) return;
  const index = Math.max(0, options.indexOf(current));
  options[(index + offset + options.length) % options.length].focus();
}

function summaryMatrixSectors(activeRows) {
  if (!activeRows.length) return [];
  const ordered = ["고정 주거비", "식비", "생활용품", "쇼핑", "개인관리", "자기개발", "교통비", "저축", "기타 소비", "미분류"];
  return ordered.filter((sector) => sector !== "저축" || activeRows.some((item) => item.sector === "저축"));
}

function buildSummaryMatrixRows(activeRows, months, sectorNames) {
  return months.map((month) => {
    const monthRows = activeRows.filter((item) => item.month === month);
    const amounts = {};
    const counts = {};
    sectorNames.forEach((sector) => {
      const rows = monthRows.filter((item) => item.sector === sector);
      amounts[sector] = sumConsumption(rows);
      counts[sector] = rows.length;
    });
    return {
      month,
      total: sumConsumption(monthRows),
      amounts,
      counts,
      rows: monthRows
    };
  });
}

function renderSummaryMetricCards(matrixRows, sectorNames, selectedMonth, selectedSector = "식비", comparison) {
  const row = matrixRows.find((item) => item.month === selectedMonth);
  if (!row) {
    els.summaryMetricCards.innerHTML = "";
    return;
  }

  const ranked = sectorNames
    .map((sector) => ({ sector, amount: row.amounts[sector] || 0 }))
    .sort((a, b) => b.amount - a.amount);
  const top = ranked[0] || { sector: "-", amount: 0 };
  const selectedSectorAmount = row.amounts[selectedSector] || 0;
  const unknownAmount = row.amounts["미분류"] || 0;
  const selectedChange = comparison?.selectedSectorChange || formatSummaryComparisonChange(selectedSectorAmount, 0);
  const totalChange = comparison?.totalChange || formatSummaryComparisonChange(row.total, 0);
  const totalComparisonHint = comparison?.comparisonExists
    ? `${comparison.comparisonMonth} 대비 ${formatSignedWon(totalChange.delta)}`
    : `${comparison?.comparisonMonth || "비교 월"} 기록 없음`;
  const sectorComparisonHint = comparison?.comparisonExists
    ? `${formatWon(selectedSectorAmount)} · ${formatSignedWon(selectedChange.delta)}`
    : `${formatWon(selectedSectorAmount)} · 비교 없음`;

  els.summaryMetricCards.innerHTML = [
    renderSummaryMetricCard("선택 월 총지출", formatWon(row.total), totalComparisonHint, "total", { month: selectedMonth }),
    renderSummaryMetricCard("가장 많이 쓴 섹터", top.sector, formatWon(top.amount), categoryClass(top.sector), { month: selectedMonth, sector: top.sector }),
    renderSummaryMetricCard(`${selectedSector || "선택 섹터"} 비중`, formatPercent(selectedSectorAmount, row.total), sectorComparisonHint, categoryClass(selectedSector), { month: selectedMonth, sector: selectedSector }),
    renderSummaryMetricCard("미분류 금액", formatWon(unknownAmount), `${formatPercent(unknownAmount, row.total)} · 확인 필요`, unknownAmount > 0 ? "unknown" : "neutral", { month: selectedMonth, sector: "미분류" })
  ].join("");
  attachSummaryMetricHandlers();
}

function renderSummaryMetricCard(label, value, hint, tone, detail = {}) {
  return `
    <button type="button" class="summary-metric-card ${escapeHtml(tone)}" data-summary-card-month="${escapeHtml(detail.month || "")}" data-summary-card-sector="${escapeHtml(detail.sector || "all")}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </button>
  `;
}

function attachSummaryMetricHandlers() {
  els.summaryMetricCards.querySelectorAll("[data-summary-card-month]").forEach((card) => {
    card.addEventListener("click", () => {
      openDetailView(summaryDetailOptions({
        month: card.dataset.summaryCardMonth,
        sector: card.dataset.summaryCardSector || "all"
      }));
    });
  });
}

function renderSummarySectorShare(matrixRows, sectorNames, selectedMonth, selectedSector, comparison) {
  if (!els.summarySectorSharePanel) return;
  const row = matrixRows.find((item) => item.month === selectedMonth);
  if (!row || !row.total) {
    els.summarySectorSharePanel.innerHTML = `<div class="empty compact-empty">선택 월의 섹터별 지출 비중을 보려면 지출 내역을 추가하세요.</div>`;
    return;
  }

  const items = sectorNames
    .map((sector) => {
      const change = summaryComparisonSectorChange(comparison, sector);
      return {
        sector,
        amount: row.amounts[sector] || 0,
        count: row.counts[sector] || 0,
        ratio: row.total ? (row.amounts[sector] || 0) / row.total : 0,
        change,
        hasBaseline: comparison.comparisonExists
      };
    })
    .filter((item) => item.amount > 0 || item.change.comparisonAmount > 0)
    .sort((a, b) => b.amount - a.amount);
  const unknown = items.find((item) => item.sector === "미분류") || { sector: "미분류", amount: 0, count: 0, ratio: 0, change: summaryComparisonSectorChange(comparison, "미분류"), hasBaseline: comparison.comparisonExists };
  const interest = items.find((item) => item.sector === selectedSector) || { sector: selectedSector || "선택 섹터", amount: 0, count: 0, ratio: 0, change: summaryComparisonSectorChange(comparison, selectedSector), hasBaseline: comparison.comparisonExists };
  const maxAmount = Math.max(...items.map((item) => item.amount), 1);

  els.summarySectorSharePanel.innerHTML = `
    <div class="summary-share-layout">
      <section class="summary-sector-ranking" aria-labelledby="summarySectorRankingTitle">
        <div class="summary-share-head">
          <div>
            <h3 id="summarySectorRankingTitle">${escapeHtml(selectedMonth)} 섹터 구성</h3>
            <p>${escapeHtml(comparison.comparisonMonth)} ${escapeHtml(comparison.comparisonLabel)} 대비 증감까지 함께 비교합니다.</p>
          </div>
          <span>${items.length.toLocaleString("ko-KR")}개 섹터</span>
        </div>
        <div class="summary-ranking-list" role="list">
          ${items.map((item, index) => renderSummaryRankingRow(item, index, row.total, maxAmount, item.sector === selectedSector)).join("")}
        </div>
      </section>
      <aside class="summary-month-checks" aria-labelledby="summaryMonthChecksTitle">
        <h3 id="summaryMonthChecksTitle">이번 달 확인</h3>
        <section class="summary-unknown-callout ${unknown.amount ? "attention" : "clear"}">
          <div>
            <span>미분류</span>
            <strong>${formatPercent(unknown.amount, row.total)}</strong>
          </div>
          <p>${unknown.amount ? `${formatWon(unknown.amount)} · ${unknown.count.toLocaleString("ko-KR")}건을 확인해 주세요.` : "미분류 지출이 없습니다."}</p>
          ${unknown.amount ? `<button type="button" data-summary-open-unknown>미분류 해결하기 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>` : ""}
        </section>
        <section class="summary-interest-check ${categoryClass(interest.sector)}">
          <div class="summary-interest-title">
            <span>관심 섹터</span>
            ${categoryChip(interest.sector)}
          </div>
          <dl>
            <div><dt>금액</dt><dd>${formatWon(interest.amount)}</dd></div>
            <div><dt>비중</dt><dd>${formatPercent(interest.amount, row.total)}</dd></div>
            <div><dt>${escapeHtml(comparison.comparisonLabel)} 증감</dt><dd class="summary-comparison-value ${interest.hasBaseline ? interest.change.tone : "neutral"}">${interest.hasBaseline ? `${formatSignedWon(interest.change.delta)} · ${escapeHtml(interest.change.rateLabel)}` : "비교 없음"}</dd></div>
            <div><dt>거래</dt><dd>${interest.count.toLocaleString("ko-KR")}건</dd></div>
          </dl>
          <button type="button" data-summary-share-sector="${escapeHtml(interest.sector)}">상세 내역 보기 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        </section>
      </aside>
    </div>
  `;
  attachSummaryShareHandlers(selectedMonth);
}

function renderSummaryRankingRow(item, index, total, maxAmount, isSelected) {
  const width = item.amount ? Math.max(2, Math.round(item.amount / maxAmount * 100)) : 0;
  return `
    <button type="button" class="summary-ranking-row ${isSelected ? "selected" : ""}" data-summary-share-sector="${escapeHtml(item.sector)}" role="listitem">
      <span class="summary-ranking-index">${index + 1}</span>
      <span class="summary-ranking-sector"><i class="summary-legend-dot ${categoryClass(item.sector)}" aria-hidden="true"></i>${escapeHtml(item.sector)}</span>
      <span class="summary-ranking-bar" aria-hidden="true"><b class="${categoryClass(item.sector)}" style="width:${width}%"></b></span>
      <strong>${formatWon(item.amount)}</strong>
      <span class="summary-ranking-delta ${item.hasBaseline ? item.change.tone : "neutral"}">${item.hasBaseline ? formatSignedWon(item.change.delta) : "-"}<small>${item.hasBaseline ? escapeHtml(item.change.rateLabel) : "비교 없음"}</small></span>
      <span class="summary-ranking-ratio">${formatPercent(item.amount, total)}</span>
      <span class="summary-ranking-count">${item.count.toLocaleString("ko-KR")}건</span>
      <i class="ti ti-chevron-right" aria-hidden="true"></i>
    </button>
  `;
}

function attachSummaryShareHandlers(month) {
  els.summarySectorSharePanel.querySelectorAll("[data-summary-share-sector]").forEach((node) => {
    node.addEventListener("click", () => {
      openDetailView(summaryDetailOptions({
        month,
        sector: node.dataset.summaryShareSector
      }));
    });
  });
  els.summarySectorSharePanel.querySelector("[data-summary-open-unknown]")?.addEventListener("click", () => {
    switchView("unknown");
    document.querySelector("#unknownView")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderSummaryMatrix(matrixRows, sectorNames, selectedMonth, selectedSector, comparisonMonth) {
  els.monthlyTable.className = "summary-matrix-table";
  if (!matrixRows.length) {
    els.monthlyTable.innerHTML = `<tbody><tr><td class="empty">월별 섹터 요약을 보려면 먼저 지출 내역을 추가하세요.</td></tr></tbody>`;
    return;
  }

  const header = [
    `<th class="month-col"><span class="matrix-head-label">월</span></th>`,
    ...sectorNames.map((sector) => `<th class="${sector === selectedSector ? "selected-sector" : ""}"><span class="matrix-head-label">${categoryChip(sector)}</span></th>`),
    `<th class="amount total-col"><span class="matrix-head-label">합계</span></th>`
  ].join("");
  const body = matrixRows.map((row) => `
    <tr class="${row.month === selectedMonth ? "selected" : ""} ${row.month === comparisonMonth ? "comparison" : ""}" data-summary-month="${escapeHtml(row.month)}" tabindex="0">
      <td class="month-col"><strong>${escapeHtml(row.month)}</strong><span>${row.rows.length.toLocaleString("ko-KR")}건${row.month === comparisonMonth ? " · 비교" : ""}</span></td>
      ${sectorNames.map((sector) => renderSummaryMatrixCell(row.month, sector, row.amounts[sector] || 0, row.total, row.counts[sector] || 0, sector === selectedSector)).join("")}
      <td class="amount total-col" data-matrix-month="${escapeHtml(row.month)}" role="button" tabindex="0" aria-label="${escapeHtml(`${row.month} 전체 지출 ${formatWon(row.total)} 상세 내역 보기`)}"><strong>${formatWon(row.total)}</strong><span>${row.rows.length.toLocaleString("ko-KR")}건</span></td>
    </tr>
  `).join("");

  els.monthlyTable.innerHTML = `<thead><tr>${header}</tr></thead><tbody>${body}</tbody>`;
  attachSummaryMatrixHandlers();
}

function renderSummaryMatrixCell(month, sector, amount, total, count = 0, isSelectedSector = false) {
  const ratio = total ? Math.round(amount / total * 100) : 0;
  return `
    <td class="amount matrix-cell ${amount ? "" : "is-empty"} ${isSelectedSector ? "selected-sector" : ""}" data-matrix-month="${escapeHtml(month)}" data-matrix-sector="${escapeHtml(sector)}" title="${escapeHtml(month)} ${escapeHtml(sector)} ${formatWon(amount)}" role="button" tabindex="0" aria-label="${escapeHtml(`${month} ${sector} ${formatWon(amount)} 상세 내역 보기`)}">
      <div class="matrix-cell-main">
        <strong>${formatWon(amount)}</strong>
        <span>${ratio}% · ${count.toLocaleString("ko-KR")}건</span>
      </div>
      <i class="matrix-bar"><b class="${categoryClass(sector)}" style="width: ${ratio}%"></b></i>
    </td>
  `;
}

function attachSummaryMatrixHandlers() {
  els.monthlyTable.querySelectorAll("[data-matrix-sector]").forEach((cell) => {
    const openCell = (event) => {
      event.stopPropagation();
      openDetailView(summaryDetailOptions({
        month: cell.dataset.matrixMonth,
        sector: cell.dataset.matrixSector
      }));
    };
    cell.addEventListener("click", openCell);
    cell.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCell(event);
    });
  });
  els.monthlyTable.querySelectorAll(".total-col[data-matrix-month]").forEach((cell) => {
    const openTotal = (event) => {
      event.stopPropagation();
      openDetailView(summaryDetailOptions({ month: cell.dataset.matrixMonth }));
    };
    cell.addEventListener("click", openTotal);
    cell.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openTotal(event);
    });
  });
  els.monthlyTable.querySelectorAll("[data-summary-month]").forEach((row) => {
    const selectMonth = () => {
      setSharedSelectedMonth(row.dataset.summaryMonth);
      renderSummary();
    };
    row.addEventListener("click", selectMonth);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectMonth();
      }
    });
  });
}

function renderSelectedMonthDetail(activeRows, month, sectorNames, comparison) {
  if (!month) {
    els.selectedMonthDetailTitle.textContent = "월별 섹터 매트릭스";
    els.selectedMonthSectorCards.innerHTML = `<div class="empty">선택할 월별 지출 기록이 없습니다.</div>`;
    els.detailTable.innerHTML = "";
    return;
  }

  const monthRows = activeRows.filter((item) => item.month === month);
  const monthTotal = sumConsumption(monthRows);
  els.selectedMonthDetailTitle.textContent = "월별 섹터 매트릭스";
  const sectorRows = sectorNames
    .map((sector) => ({
      sector,
      rows: monthRows.filter((item) => item.sector === sector),
      comparison: comparisonBreakdownForSector(comparison, sector)
    }))
    .filter((item) => item.rows.length)
    .sort((a, b) => sumConsumption(b.rows) - sumConsumption(a.rows));
  const availableSectors = sectorRows.map((item) => item.sector);
  if (!availableSectors.includes(expandedSummaryDetailSector)) {
    expandedSummaryDetailSector = availableSectors.includes(selectedSummarySector)
      ? selectedSummarySector
      : availableSectors[0] || "";
  }
  els.selectedMonthSectorCards.innerHTML = sectorRows.length
    ? sectorRows.map(({ sector, rows, comparison: sectorComparison }) => renderSelectedSectorCard(sector, rows, monthTotal, sector === expandedSummaryDetailSector, sectorComparison)).join("")
    : `<div class="empty">선택한 월의 지출 기록이 없습니다.</div>`;
  attachSelectedSectorCardHandlers(month);

  const detailRows = buildSelectedDetailRows(monthRows, monthTotal);
  renderObjectTable(els.detailTable, detailRows, ["섹터", "세부항목", "금액", "건수", "비중"], {
    amountColumns: ["금액"],
    renderCell(key, value, row) {
      if (key === "섹터") return categoryChip(value);
      if (key === "세부항목") return subcategoryPill(row.섹터, value);
      return escapeHtml(value);
    }
  });
}

function renderSelectedSectorCard(sector, rows, monthTotal, isExpanded, sectorComparison) {
  const amount = sumConsumption(rows);
  const grouped = groupBy(rows, summaryDisplaySubcategory);
  const details = [...grouped.entries()]
    .map(([subcategory, subRows]) => ({ subcategory, amount: sumConsumption(subRows), count: subRows.length }))
    .sort((a, b) => b.amount - a.amount);
  const visible = details.slice(0, 3).map((item) => ({
    ...item,
    change: sectorComparison.subcategories.find((change) => change.key === item.subcategory)
      || formatSummaryComparisonChange(item.amount, 0)
  }));
  const hiddenCount = Math.max(0, details.length - visible.length);
  const panelId = `summary-sector-panel-${categoryClass(sector)}`;

  return `
    <article class="selected-sector-row ${categoryClass(sector)} ${sector === "미분류" ? "attention" : ""} ${isExpanded ? "expanded" : ""}">
      <button type="button" class="selected-sector-toggle" data-selected-sector-toggle="${escapeHtml(sector)}" aria-expanded="${isExpanded ? "true" : "false"}" aria-controls="${panelId}">
        <span class="selected-sector-name">${categoryChip(sector)}<small>${rows.length.toLocaleString("ko-KR")}건</small></span>
        <span class="selected-sector-amount"><strong>${formatWon(amount)}</strong><small>${formatPercent(amount, monthTotal)}</small><em class="selected-sector-change ${sectorComparison.comparisonExists ? sectorComparison.tone : "neutral"}">${sectorComparison.comparisonExists ? formatSignedWon(sectorComparison.delta) : "비교 없음"}</em></span>
        <i class="ti ti-chevron-down" aria-hidden="true"></i>
      </button>
      <div id="${panelId}" class="selected-sector-detail" ${isExpanded ? "" : "hidden"}>
        <div class="selected-subcategory-list">
        ${visible.map((item) => `
          <button type="button" data-selected-subcategory="${escapeHtml(item.subcategory)}">
            <span title="${escapeHtml(item.subcategory)}">${escapeHtml(item.subcategory)}<small>${item.count.toLocaleString("ko-KR")}건</small></span>
            <b>${formatWon(item.amount)}<small>${formatPercent(item.amount, amount)}</small><em class="selected-subcategory-change ${sectorComparison.comparisonExists ? item.change.tone : "neutral"}">${sectorComparison.comparisonExists ? formatSignedWon(item.change.delta) : "비교 없음"}</em></b>
            <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        `).join("")}
        ${hiddenCount ? `<em>외 ${hiddenCount.toLocaleString("ko-KR")}개 세부항목</em>` : ""}
        </div>
        <button type="button" class="selected-sector-open-detail" data-selected-sector-detail="${escapeHtml(sector)}">${escapeHtml(sector)} 전체 상세 내역 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </div>
    </article>
  `;
}

function attachSelectedSectorCardHandlers(month) {
  els.selectedMonthSectorCards.querySelectorAll("[data-selected-sector-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const sector = button.dataset.selectedSectorToggle;
      if (expandedSummaryDetailSector === sector) return;
      expandedSummaryDetailSector = sector;
      selectedSummarySector = sector;
      renderSummary();
    });
  });
  els.selectedMonthSectorCards.querySelectorAll("[data-selected-sector-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      openDetailView(summaryDetailOptions({
        month,
        sector: button.dataset.selectedSectorDetail
      }));
    });
  });
  els.selectedMonthSectorCards.querySelectorAll("[data-selected-subcategory]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".selected-sector-row");
      const sector = card?.querySelector("[data-selected-sector-toggle]")?.dataset.selectedSectorToggle || "all";
        openDetailView(summaryDetailOptions({
          month,
          sector,
          subcategory: button.dataset.selectedSubcategory
        }));
    });
  });
}

function buildSelectedDetailRows(monthRows, monthTotal) {
  const grouped = groupBy(monthRows, (item) => `${item.sector}|${summaryDisplaySubcategory(item)}`);
  return [...grouped.entries()]
    .map(([key, rows]) => {
      const [sector, subcategory] = key.split("|");
      const amount = sumConsumption(rows);
      return { 섹터: sector, 세부항목: subcategory, 금액: amount, 건수: rows.length, 비중: formatPercent(amount, monthTotal) };
    })
    .sort((a, b) => b.금액 - a.금액);
}

function summaryDisplaySubcategory(item) {
  const sector = item?.sector || "미분류";
  const subcategory = item?.subcategory || "미분류";
  if (sector !== "고정 주거비") return subcategory;
  const text = [
    item.merchant,
    item.description,
    item.memo,
    item.sourceLabel,
    item.sourceFile
  ].filter(Boolean).join(" ");
  if (/월세|임대료|rent/i.test(text)) return "월세";
  if (/보험|실비|치아|운전자|화재/i.test(text)) return "보험료";
  return subcategory;
}

function updateSummaryMonthOptions(months) {
  const controls = summaryMonthControls();
  if (!months.length) {
    controls.forEach((control) => {
      control.innerHTML = `<option value="">기록 없음</option>`;
      control.value = "";
    });
    selectedSummaryMonth = "";
    syncSummaryMonthStepButtons([], "");
    return "";
  }
  const previousControlValue = controls.find((control) => control.value)?.value || "";
  const previous = getSharedSelectedMonth(selectedSummaryMonth || previousControlValue || months.at(-1));
  const selected = months.includes(previous) ? previous : months.at(-1);
  selectedSummaryMonth = selected;
  if (canViewDriveSharedMonth("summary")) {
    setSharedSelectedMonth(selected, { syncControls: false });
  }
  const optionsHtml = months
    .map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`)
    .join("");
  controls.forEach((control) => {
    control.innerHTML = optionsHtml;
    control.value = selected;
  });
  syncSummaryMonthStepButtons(months, selected);
  return selected;
}
