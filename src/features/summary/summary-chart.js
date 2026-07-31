function renderSectorTrend(activeRows, months, sectorNames, selectedSector, selectedMonth, comparison) {
  const selectableSectors = sectorNames.filter((sector) => sector !== "수입");
  if (!activeRows.length || !selectableSectors.length) {
    els.sectorTrendChart.innerHTML = `<div class="empty">섹터별 그래프를 보려면 먼저 엑셀 파일을 불러오세요.</div>`;
    return;
  }

  const comparisonOffset = summaryComparisonMonthOffset(comparison);
  const points = months.map((month) => {
    const comparisonMonth = shiftMonthKey(month, comparisonOffset);
    const cutoffDay = month === comparison.selectedMonth ? comparison.cutoffDay : 0;
    const currentRows = summaryRowsForComparisonMonth(activeRows, month, cutoffDay)
      .filter((item) => item.sector === selectedSector);
    const comparisonRows = summaryRowsForComparisonMonth(activeRows, comparisonMonth, cutoffDay)
      .filter((item) => item.sector === selectedSector);
    return {
      month,
      comparisonMonth,
      currentAmount: sumActual(currentRows),
      comparisonAmount: sumActual(comparisonRows),
      currentExists: activeRows.some((item) => item.month === month),
      comparisonExists: activeRows.some((item) => item.month === comparisonMonth)
    };
  });
  els.sectorTrendChart.innerHTML = renderSectorTrendChart(points, selectedSector, selectedMonth, comparison);
  attachSectorTrendHandlers(comparison);
}

function summaryComparisonMonthOffset(comparison) {
  const selectedIndex = summaryMonthSerial(comparison?.selectedMonth);
  const comparisonIndex = summaryMonthSerial(comparison?.comparisonMonth);
  if (selectedIndex === null || comparisonIndex === null) return -12;
  return comparisonIndex - selectedIndex;
}

function summaryMonthSerial(month) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function attachSectorTrendHandlers(comparison) {
  els.sectorTrendChart.querySelectorAll("[data-trend-month]").forEach((node) => {
    node.addEventListener("mouseenter", () => node.classList.add("is-hovered"));
    node.addEventListener("mouseleave", () => node.classList.remove("is-hovered"));
    node.addEventListener("focus", () => node.classList.add("is-hovered"));
    node.addEventListener("blur", () => node.classList.remove("is-hovered"));
    node.addEventListener("click", () => {
      setSharedSelectedMonth(node.dataset.trendMonth);
      renderSummary();
    });
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setSharedSelectedMonth(node.dataset.trendMonth);
      renderSummary();
    });
  });
  els.sectorTrendChart.querySelector("[data-trend-detail-month]")?.addEventListener("click", (event) => {
    openDetailView(summaryDetailOptions({
      month: event.currentTarget.dataset.trendDetailMonth,
      sector: event.currentTarget.dataset.trendDetailSector
    }));
  });
  attachSummaryComparisonDriverHandlers(els.sectorTrendChart, comparison);
}

function sectorTrendChartStep(maxValue, targetTicks = 4) {
  const rawStep = Math.max(Number(maxValue || 0), 4) / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = [1, 1.25, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) || 10;
  return factor * magnitude;
}

function renderSectorTrendChart(points, sector, selectedMonth = "", comparison) {
  if (!points.length) return `<div class="empty">선택한 섹터의 월별 데이터가 없습니다.</div>`;

  const width = 1080;
  const height = 390;
  const padLeft = 84;
  const padRight = 28;
  const padTop = 42;
  const padBottom = 62;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const rawMax = Math.max(...points.flatMap((point) => [point.currentAmount, point.comparisonAmount]), 0);
  const axisStep = sectorTrendChartStep(rawMax, 4);
  const axisMax = Math.max(axisStep, Math.ceil(rawMax / axisStep) * axisStep);
  const valueToY = (value) => padTop + (axisMax - Math.max(0, Number(value || 0))) / axisMax * plotHeight;
  const zeroY = padTop + plotHeight;
  const slotWidth = plotWidth / Math.max(points.length, 1);
  const pairGap = Math.max(3, Math.min(7, slotWidth * 0.08));
  const barWidth = Math.max(9, Math.min(24, (slotWidth - pairGap - 10) / 2));
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));
  const validChanges = points
    .filter((point) => point.comparisonExists)
    .map((point) => ({ ...point, delta: point.currentAmount - point.comparisonAmount }));
  const biggestRise = validChanges.reduce((best, item) => item.delta > best.delta ? item : best, { month: "-", delta: 0 });
  const biggestDrop = validChanges.reduce((best, item) => item.delta < best.delta ? item : best, { month: "-", delta: 0 });
  const averageChange = validChanges.length
    ? Math.round(validChanges.reduce((total, item) => total + item.delta, 0) / validChanges.length)
    : 0;
  const selectedPoint = points.find((point) => point.month === selectedMonth) || points.at(-1);
  const selectedDelta = selectedPoint.currentAmount - selectedPoint.comparisonAmount;
  const comparisonName = comparison.mode === "custom" ? "비교 간격" : "전년 동월";
  const selectedCopy = !selectedPoint.comparisonExists
    ? "비교 기록 없음"
    : selectedDelta > 0
      ? `${comparisonName}보다 증가`
      : selectedDelta < 0
        ? `${comparisonName}보다 감소`
        : `${comparisonName}과 동일`;
  const insightItems = [
    {
      label: "선택 월",
      value: selectedPoint.month,
      hint: selectedPoint.comparisonExists
        ? `${selectedPoint.comparisonMonth} 대비 ${formatSignedWon(selectedDelta)}`
        : `${selectedPoint.comparisonMonth} 기록 없음`,
      tone: selectedPoint.comparisonExists ? (selectedDelta > 0 ? "up" : selectedDelta < 0 ? "down" : "neutral") : "neutral"
    },
    {
      label: "최대 증가",
      value: biggestRise.delta > 0 ? biggestRise.month : "없음",
      hint: biggestRise.delta > 0 ? `${comparisonName}보다 ${formatSignedWon(biggestRise.delta)}` : "증가한 월 없음",
      tone: biggestRise.delta > 0 ? "up" : "neutral"
    },
    {
      label: "최대 감소",
      value: biggestDrop.delta < 0 ? biggestDrop.month : "없음",
      hint: biggestDrop.delta < 0 ? `${comparisonName}보다 ${formatSignedWon(biggestDrop.delta)}` : "감소한 월 없음",
      tone: biggestDrop.delta < 0 ? "down" : "neutral"
    },
    {
      label: "평균 증감",
      value: formatSignedWon(averageChange),
      hint: `비교 가능 ${validChanges.length.toLocaleString("ko-KR")}개월 평균`,
      tone: averageChange > 0 ? "up" : averageChange < 0 ? "down" : "neutral"
    }
  ];
  const yTicks = Array.from({ length: 5 }, (_, index) => axisMax / 4 * index);
  const gridLines = yTicks.map((value) => {
    const y = valueToY(value);
    return `
      <line class="${value === 0 ? "chart-axis trend-zero-line" : "chart-grid trend-grid"}" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
      <text class="trend-axis-label ${value === 0 ? "zero" : ""}" x="${padLeft - 14}" y="${y + 4}" text-anchor="end">${escapeHtml(value === 0 ? "0원" : formatCompactWon(value))}</text>
    `;
  }).join("");

  const bars = points.map((point, index) => {
    const centerX = padLeft + slotWidth * (index + 0.5);
    const comparisonX = centerX - pairGap / 2 - barWidth;
    const currentX = centerX + pairGap / 2;
    const comparisonY = valueToY(point.comparisonAmount);
    const currentY = valueToY(point.currentAmount);
    const isSelected = point.month === selectedPoint.month;
    const showMonth = index % labelEvery === 0 || index === points.length - 1 || isSelected;
    const monthLabel = point.month.replace(/^20/, "").replace("-", ".");
    const selectionX = centerX - slotWidth * 0.43;
    const tooltipWidth = 214;
    const tooltipX = Math.min(width - padRight - tooltipWidth, Math.max(padLeft + 4, centerX - tooltipWidth / 2));
    return `
      <g class="trend-bar-group ${isSelected ? "selected" : ""}" data-trend-month="${escapeHtml(point.month)}" tabindex="0" role="button"
        aria-label="${escapeHtml(`${point.month} ${formatWon(point.currentAmount)}, ${point.comparisonMonth} ${point.comparisonExists ? formatWon(point.comparisonAmount) : "기록 없음"}`)}">
        <title>${escapeHtml(point.month)} · ${formatWon(point.currentAmount)} / ${escapeHtml(point.comparisonMonth)} · ${point.comparisonExists ? formatWon(point.comparisonAmount) : "기록 없음"}</title>
        <rect class="trend-selection-bg" x="${selectionX}" y="${padTop - 14}" width="${slotWidth * 0.86}" height="${plotHeight + 38}" rx="10"></rect>
        <rect class="trend-hit-area" x="${selectionX}" y="${padTop - 16}" width="${slotWidth * 0.86}" height="${plotHeight + 44}" rx="10"></rect>
        ${point.comparisonExists
          ? `<rect class="trend-bar comparison" x="${comparisonX}" y="${comparisonY}" width="${barWidth}" height="${Math.max(3, zeroY - comparisonY)}" rx="4"></rect>`
          : `<line class="trend-missing-baseline" x1="${comparisonX}" y1="${zeroY - 5}" x2="${comparisonX + barWidth}" y2="${zeroY - 5}"></line>`}
        <rect class="trend-bar current" x="${currentX}" y="${currentY}" width="${barWidth}" height="${Math.max(3, zeroY - currentY)}" rx="4"></rect>
        ${showMonth ? `<text class="chart-label ${isSelected ? "selected" : ""}" x="${centerX}" y="${height - 20}" text-anchor="middle">${escapeHtml(monthLabel)}</text>` : ""}
        <g class="trend-tooltip" transform="translate(${tooltipX}, ${padTop + 8})">
          <rect width="${tooltipWidth}" height="68" rx="10"></rect>
          <text x="12" y="18">${escapeHtml(point.month)} ${escapeHtml(sector)} ${escapeHtml(formatWon(point.currentAmount))}</text>
          <text x="12" y="38">${escapeHtml(point.comparisonMonth)} ${point.comparisonExists ? escapeHtml(formatWon(point.comparisonAmount)) : "기록 없음"}</text>
          <text x="12" y="57">차이 ${point.comparisonExists ? escapeHtml(formatSignedWon(point.currentAmount - point.comparisonAmount)) : "-"}</text>
        </g>
      </g>
    `;
  }).join("");

  return `
    <div class="trend-chart-topline">
      <div class="trend-chart-meta">
        ${categoryChip(sector)}
        <span>${escapeHtml(points[0].month)} - ${escapeHtml(points.at(-1).month)} · ${points.length.toLocaleString("ko-KR")}개월</span>
      </div>
      <div class="trend-legend">
        <span><b class="legend-comparison"></b>${escapeHtml(comparisonName)}</span>
        <span><b class="legend-current"></b>선택 기간</span>
      </div>
    </div>
    <div class="trend-insight-row">
      ${insightItems.map((item) => `
        <article class="trend-insight-card ${escapeHtml(item.tone)}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.hint)}</small>
        </article>
      `).join("")}
    </div>
    <div class="trend-workspace">
      <div class="trend-chart-frame">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(sector)} 월별 ${escapeHtml(comparisonName)} 비교 막대 차트">
          <rect class="trend-plot-bg" x="${padLeft}" y="${padTop - 14}" width="${plotWidth}" height="${plotHeight + 38}" rx="12"></rect>
          ${gridLines}
          ${bars}
        </svg>
      </div>
      <aside class="trend-selected-inspector" aria-label="선택한 달 요약">
        <span>선택한 달</span>
        <h4><i class="ti ti-calendar-month" aria-hidden="true"></i>${escapeHtml(selectedPoint.month)}</h4>
        <div class="trend-selected-delta ${selectedPoint.comparisonExists ? (selectedDelta > 0 ? "up" : selectedDelta < 0 ? "down" : "neutral") : "neutral"}">
          <span>${escapeHtml(selectedCopy)}</span>
          <strong>${selectedPoint.comparisonExists ? formatSignedWon(selectedDelta) : "-"}</strong>
        </div>
        <dl>
          <div><dt>${escapeHtml(selectedPoint.month)} ${escapeHtml(sector)}</dt><dd>${formatWon(selectedPoint.currentAmount)}</dd></div>
          <div><dt>${escapeHtml(selectedPoint.comparisonMonth)} ${escapeHtml(sector)}</dt><dd>${selectedPoint.comparisonExists ? formatWon(selectedPoint.comparisonAmount) : "-"}</dd></div>
        </dl>
        <button type="button" data-trend-detail-month="${escapeHtml(selectedPoint.month)}" data-trend-detail-sector="${escapeHtml(sector)}">상세 내역 보기 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </aside>
    </div>
    ${renderSummaryComparisonDriverPanel(comparison, { idPrefix: "trend" })}
  `;
}
