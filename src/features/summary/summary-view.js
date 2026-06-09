function renderSummary() {
  const active = reportingExpenseRows(classified);
  const allMonths = unique(active.map((item) => item.month).filter(Boolean)).sort();
  const months = updateSummaryRangeOptions(allMonths);
  const rangedActive = active.filter((item) => months.includes(item.month));
  const sectorNames = summaryMatrixSectors(rangedActive);
  const selectedSector = updateSummarySectorOptions(sectorNames);
  const selectedMonth = updateSummaryMonthOptions(months);
  const matrixRows = buildSummaryMatrixRows(rangedActive, months, sectorNames);
  renderSectorTrend(rangedActive, months, sectorNames, selectedSector, selectedMonth);
  renderSectorAnalysis(rangedActive, selectedMonth, selectedSector, months);
  renderSummaryMetricCards(matrixRows, sectorNames, selectedMonth, selectedSector);
  renderSummarySectorShare(matrixRows, sectorNames, selectedMonth);
  renderSummaryMatrix(matrixRows, sectorNames, selectedMonth);
  renderSelectedMonthDetail(rangedActive, selectedMonth, sectorNames);
  syncSummarySubtabs();
}

function summaryMonthControls() {
  return [els.summaryMonthSelect, els.summaryDetailMonthSelect, els.sectorAnalysisMonthSelect]
    .filter(Boolean);
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
    button.onclick = () => {
      selectedSummarySubtab = button.dataset.summarySubtab || validTabs[0];
      syncSummarySubtabs();
    };
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.summarySubtabPanel === selectedSummarySubtab;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
  });
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

  return allMonths.filter((month) => {
    if (selectedSummaryStartMonth && month < selectedSummaryStartMonth) return false;
    if (selectedSummaryEndMonth && month > selectedSummaryEndMonth) return false;
    return true;
  });
}

function updateSummarySectorOptions(sectorNames) {
  const selectableSectors = sectorNames.filter((sector) => sector !== "수입");
  const controls = [els.sectorTrendSelect, els.sectorAnalysisSectorSelect].filter(Boolean);
  if (!selectableSectors.length) {
    controls.forEach((control) => {
      control.innerHTML = `<option value="">기록 없음</option>`;
      control.value = "";
    });
    selectedSummarySector = "";
    return "";
  }
  const previous = selectedSummarySector || controls.find((control) => control.value)?.value || "";
  selectedSummarySector = selectableSectors.includes(previous) ? previous : selectableSectors.includes("식비") ? "식비" : selectableSectors[0];
  const optionsHtml = selectableSectors
    .map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`)
    .join("");
  controls.forEach((control) => {
    control.innerHTML = optionsHtml;
    control.value = selectedSummarySector;
  });
  return selectedSummarySector;
}

function summaryMatrixSectors(activeRows) {
  const ordered = ["고정 주거비", "식비", "생활용품", "쇼핑", "개인관리", "자기개발", "교통비", "기타 소비", "미분류"];
  return ordered.filter((sector) => sector !== "저축" || activeRows.some((item) => item.sector === "저축"));
}

function buildSummaryMatrixRows(activeRows, months, sectorNames) {
  return months.map((month) => {
    const monthRows = activeRows.filter((item) => item.month === month);
    const amounts = {};
    const counts = {};
    sectorNames.forEach((sector) => {
      const rows = monthRows.filter((item) => item.sector === sector);
      amounts[sector] = sumActual(rows);
      counts[sector] = rows.length;
    });
    return {
      month,
      total: sumActual(monthRows),
      amounts,
      counts,
      rows: monthRows
    };
  });
}

function renderSummaryMetricCards(matrixRows, sectorNames, selectedMonth, selectedSector = "식비") {
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

  els.summaryMetricCards.innerHTML = [
    renderSummaryMetricCard("선택 월 총지출", formatWon(row.total), selectedMonth, "total", { month: selectedMonth }),
    renderSummaryMetricCard("가장 많이 쓴 섹터", top.sector, formatWon(top.amount), categoryClass(top.sector), { month: selectedMonth, sector: top.sector }),
    renderSummaryMetricCard(`${selectedSector || "선택 섹터"} 비중`, formatPercent(selectedSectorAmount, row.total), formatWon(selectedSectorAmount), categoryClass(selectedSector), { month: selectedMonth, sector: selectedSector }),
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

function renderSummarySectorShare(matrixRows, sectorNames, selectedMonth) {
  if (!els.summarySectorSharePanel) return;
  const row = matrixRows.find((item) => item.month === selectedMonth);
  if (!row || !row.total) {
    els.summarySectorSharePanel.innerHTML = `<div class="empty compact-empty">선택 월의 섹터별 지출 비중을 보려면 지출 내역을 추가하세요.</div>`;
    return;
  }

  const items = sectorNames
    .map((sector) => ({
      sector,
      amount: row.amounts[sector] || 0,
      count: row.counts[sector] || 0,
      ratio: row.total ? (row.amounts[sector] || 0) / row.total : 0
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  els.summarySectorSharePanel.innerHTML = `
    <div class="summary-share-head">
      <div>
        <h3>${escapeHtml(selectedMonth)} 섹터 비중</h3>
        <p>도넛 그래프와 범례로 선택 월의 지출 구성을 비교합니다.</p>
      </div>
    </div>
    <div class="summary-share-body">
      ${renderSummaryDonut(items, row.total, selectedMonth)}
      <div class="summary-share-list">
        ${items.map((item) => renderSummaryShareLegend(item, row.total)).join("")}
      </div>
    </div>
  `;
  attachSummaryShareHandlers(selectedMonth);
}

function renderSummaryDonut(items, total, selectedMonth = "") {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = items.map((item) => {
    const dash = Math.max(0, item.ratio * circumference);
    const segment = `
      <circle class="summary-donut-segment ${categoryClass(item.sector)}" cx="76" cy="76" r="${radius}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" data-summary-share-sector="${escapeHtml(item.sector)}" tabindex="0" role="button" aria-label="${escapeHtml(`${item.sector} ${formatWon(item.amount)} ${formatPercent(item.amount, total)} 상세 내역 보기`)}">
        <title>${escapeHtml(item.sector)} · ${formatWon(item.amount)} · ${formatPercent(item.amount, total)}</title>
      </circle>
    `;
    offset += dash;
    return segment;
  }).join("");
  return `
    <div class="summary-donut-wrap">
      <svg class="summary-donut" viewBox="0 0 152 152" role="img" aria-label="선택 월 섹터별 지출 비중">
        <circle class="summary-donut-track" cx="76" cy="76" r="${radius}"></circle>
        <g transform="rotate(-90 76 76)">
          ${segments}
        </g>
      </svg>
      <div class="summary-donut-center">
        <span>${escapeHtml(selectedMonth || "선택 월")}</span>
        <strong>${items.length.toLocaleString("ko-KR")}개</strong>
        <small>지출 섹터</small>
      </div>
    </div>
  `;
}

function renderSummaryShareLegend(item, total) {
  const percent = formatPercent(item.amount, total);
  return `
    <button type="button" class="summary-share-item" data-summary-share-sector="${escapeHtml(item.sector)}">
      <i class="summary-legend-dot ${categoryClass(item.sector)}" aria-hidden="true"></i>
      <span class="summary-legend-name">${escapeHtml(item.sector)}</span>
      <span class="summary-legend-meta">${percent} · ${item.count.toLocaleString("ko-KR")}건</span>
      <strong>${formatWon(item.amount)}</strong>
    </button>
  `;
}

function attachSummaryShareHandlers(month) {
  els.summarySectorSharePanel.querySelectorAll("[data-summary-share-sector]").forEach((node) => {
    const openSector = () => {
      openDetailView(summaryDetailOptions({
        month,
        sector: node.dataset.summaryShareSector
      }));
    };
    node.addEventListener("click", openSector);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openSector();
      }
    });
  });
}

function renderSummaryMatrix(matrixRows, sectorNames, selectedMonth) {
  els.monthlyTable.className = "summary-matrix-table";
  if (!matrixRows.length) {
    els.monthlyTable.innerHTML = `<tbody><tr><td class="empty">월별 섹터 요약을 보려면 먼저 지출 내역을 추가하세요.</td></tr></tbody>`;
    return;
  }

  const header = [
    `<th class="month-col"><span class="matrix-head-label">월</span></th>`,
    ...sectorNames.map((sector) => `<th><span class="matrix-head-label">${categoryChip(sector)}</span></th>`),
    `<th class="amount total-col"><span class="matrix-head-label">합계</span></th>`
  ].join("");
  const body = matrixRows.map((row) => `
    <tr class="${row.month === selectedMonth ? "selected" : ""}" data-summary-month="${escapeHtml(row.month)}" tabindex="0">
      <td class="month-col"><strong>${escapeHtml(row.month)}</strong><span>${row.rows.length.toLocaleString("ko-KR")}건</span></td>
      ${sectorNames.map((sector) => renderSummaryMatrixCell(row.month, sector, row.amounts[sector] || 0, row.total, row.counts[sector] || 0)).join("")}
      <td class="amount total-col" data-matrix-month="${escapeHtml(row.month)}"><strong>${formatWon(row.total)}</strong><span>${row.rows.length.toLocaleString("ko-KR")}건</span></td>
    </tr>
  `).join("");

  els.monthlyTable.innerHTML = `<thead><tr>${header}</tr></thead><tbody>${body}</tbody>`;
  attachSummaryMatrixHandlers();
}

function renderSummaryMatrixCell(month, sector, amount, total, count = 0) {
  const ratio = total ? Math.round(amount / total * 100) : 0;
  return `
    <td class="amount matrix-cell ${amount ? "" : "is-empty"}" data-matrix-month="${escapeHtml(month)}" data-matrix-sector="${escapeHtml(sector)}" title="${escapeHtml(month)} ${escapeHtml(sector)} ${formatWon(amount)}">
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
    cell.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetailView(summaryDetailOptions({
        month: cell.dataset.matrixMonth,
        sector: cell.dataset.matrixSector
      }));
    });
  });
  els.monthlyTable.querySelectorAll(".total-col[data-matrix-month]").forEach((cell) => {
    cell.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetailView(summaryDetailOptions({ month: cell.dataset.matrixMonth }));
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

function renderSelectedMonthDetail(activeRows, month, sectorNames) {
  if (!month) {
    els.selectedMonthDetailTitle.textContent = "월별 섹터 매트릭스";
    els.selectedMonthSectorCards.innerHTML = `<div class="empty">선택할 월별 지출 기록이 없습니다.</div>`;
    els.detailTable.innerHTML = "";
    return;
  }

  const monthRows = activeRows.filter((item) => item.month === month);
  const monthTotal = sumActual(monthRows);
  els.selectedMonthDetailTitle.textContent = "월별 섹터 매트릭스";
  const activeSectors = sectorNames.filter((sector) => monthRows.some((item) => item.sector === sector));
  els.selectedMonthSectorCards.innerHTML = activeSectors.length
    ? activeSectors.map((sector) => renderSelectedSectorCard(sector, monthRows.filter((item) => item.sector === sector), monthTotal)).join("")
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

function renderSelectedSectorCard(sector, rows, monthTotal) {
  const amount = sumActual(rows);
  const grouped = groupBy(rows, summaryDisplaySubcategory);
  const details = [...grouped.entries()]
    .map(([subcategory, subRows]) => ({ subcategory, amount: sumActual(subRows), count: subRows.length }))
    .sort((a, b) => b.amount - a.amount);
  const visible = details.slice(0, 3);
  const hiddenCount = Math.max(0, details.length - visible.length);
  const intensity = sectorShareIntensity(amount, monthTotal);

  return `
    <article class="selected-sector-card ${categoryClass(sector)} ${sector === "미분류" ? "attention" : ""}" style="--sector-strength: ${intensity}%" data-selected-sector-card="${escapeHtml(sector)}" tabindex="0" role="button" aria-label="${escapeHtml(`${sector} ${formatWon(amount)} 상세 내역 보기`)}">
      <div class="selected-sector-head">
        ${categoryChip(sector)}
        <strong>${formatWon(amount)}</strong>
        <small>${rows.length.toLocaleString("ko-KR")}건 · ${formatPercent(amount, monthTotal)}</small>
      </div>
      <div class="selected-subcategory-list">
        ${visible.map((item) => `
          <button type="button" data-selected-subcategory="${escapeHtml(item.subcategory)}">
            <span title="${escapeHtml(item.subcategory)}">${escapeHtml(item.subcategory)}</span>
            <b>${formatWon(item.amount)}</b>
          </button>
        `).join("")}
        ${hiddenCount ? `<em>외 ${hiddenCount.toLocaleString("ko-KR")}개 세부항목</em>` : ""}
      </div>
    </article>
  `;
}

function sectorShareIntensity(amount, total) {
  const ratio = total ? amount / total : 0;
  return Math.round(8 + Math.min(1, ratio) * 34);
}

function attachSelectedSectorCardHandlers(month) {
  els.selectedMonthSectorCards.querySelectorAll("[data-selected-sector-card]").forEach((card) => {
    const openSector = () => {
      openDetailView(summaryDetailOptions({
        month,
        sector: card.dataset.selectedSectorCard
      }));
    };
    card.addEventListener("click", openSector);
    card.addEventListener("keydown", (event) => {
      if (event.target.closest("[data-selected-subcategory]")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openSector();
      }
    });
    card.querySelectorAll("[data-selected-subcategory]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openDetailView(summaryDetailOptions({
          month,
          sector: card.dataset.selectedSectorCard,
          subcategory: button.dataset.selectedSubcategory
        }));
      });
    });
  });
}

function buildSelectedDetailRows(monthRows, monthTotal) {
  const grouped = groupBy(monthRows, (item) => `${item.sector}|${summaryDisplaySubcategory(item)}`);
  return [...grouped.entries()]
    .map(([key, rows]) => {
      const [sector, subcategory] = key.split("|");
      const amount = sumActual(rows);
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
  return selected;
}
