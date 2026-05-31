function renderSectorTrend(activeRows, months, sectorNames, selectedSector, selectedMonth) {
  const selectableSectors = sectorNames.filter((sector) => sector !== "수입");
  if (!activeRows.length || !selectableSectors.length) {
    els.sectorTrendSelect.innerHTML = "";
    els.sectorTrendChart.innerHTML = `<div class="empty">섹터별 그래프를 보려면 먼저 엑셀 파일을 불러오세요.</div>`;
    return;
  }

  const points = months.map((month) => {
    const rows = activeRows.filter((item) => item.month === month && item.sector === selectedSector);
    return { month, amount: sumActual(rows) };
  });
  els.sectorTrendChart.innerHTML = renderSectorTrendChart(points, selectedSector, selectedMonth);
  attachSectorTrendHandlers();
}

function attachSectorTrendHandlers() {
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
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSharedSelectedMonth(node.dataset.trendMonth);
        renderSummary();
      }
    });
  });
}

function renderSectorTrendChart(points, sector, selectedMonth = "") {
  if (!points.length) {
    return `<div class="empty">선택한 섹터의 월별 데이터가 없습니다.</div>`;
  }

  const width = 1080;
  const height = 392;
  const padLeft = 88;
  const padRight = 42;
  const padTop = 58;
  const padBottom = 76;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const deltas = points.map((point, index) => index === 0 ? 0 : point.amount - points[index - 1].amount);
  const rawMaxAbs = Math.max(...deltas.map((value) => Math.abs(value)), 0);
  const unit = rawMaxAbs >= 1000000 ? 500000 : rawMaxAbs >= 100000 ? 100000 : rawMaxAbs >= 10000 ? 10000 : 1000;
  const maxAbs = Math.max(Math.ceil(rawMaxAbs / unit) * unit, unit);
  const zeroY = padTop + plotHeight / 2;
  const step = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.max(12, Math.min(48, step * 0.48));
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));
  const changes = points.slice(1).map((point, index) => ({
    month: point.month,
    delta: deltas[index + 1]
  }));
  const biggestRise = changes.reduce((best, item) => item.delta > best.delta ? item : best, { month: "-", delta: 0 });
  const biggestDrop = changes.reduce((best, item) => item.delta < best.delta ? item : best, { month: "-", delta: 0 });
  const foundSelectedIndex = points.findIndex((point) => point.month === selectedMonth);
  const selectedIndex = foundSelectedIndex >= 0 ? foundSelectedIndex : points.length - 1;
  const selectedPoint = points[selectedIndex] || points.at(-1);
  const selectedDelta = deltas[selectedIndex] || 0;
  const selectedCopy = selectedIndex === 0
    ? "기준 월"
    : selectedDelta >= 0
      ? "전월보다 증가"
      : "전월보다 감소";
  const trendAverage = changes.length ? Math.round(changes.reduce((total, item) => total + item.delta, 0) / changes.length) : 0;
  const insightItems = [
    { label: "선택 월", value: selectedPoint.month, hint: `${selectedCopy} · ${selectedIndex === 0 ? "기준" : formatSignedWon(selectedDelta)}`, tone: selectedDelta >= 0 ? "up" : "down" },
    { label: "최대 증가", value: biggestRise.delta > 0 ? biggestRise.month : "없음", hint: biggestRise.delta > 0 ? `전월보다 ${formatSignedWon(biggestRise.delta)}` : "증가한 월 없음", tone: "up" },
    { label: "최대 감소", value: biggestDrop.delta < 0 ? biggestDrop.month : "없음", hint: biggestDrop.delta < 0 ? `전월보다 ${formatSignedWon(biggestDrop.delta)}` : "감소한 월 없음", tone: "down" },
    { label: "평균 증감", value: formatSignedWon(trendAverage), hint: `기간 내 ${Math.max(0, changes.length).toLocaleString("ko-KR")}개월 평균`, tone: "neutral" }
  ];
  const yTicks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
  const valueToY = (value) => zeroY - (value / maxAbs) * (plotHeight / 2);
  const gridLines = yTicks.map((value) => {
    const y = valueToY(value);
    const isZero = value === 0;
    return `
      <line class="${isZero ? "chart-axis trend-zero-line" : "chart-grid trend-grid"}" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
      <text class="trend-axis-label ${isZero ? "zero" : ""}" x="${padLeft - 16}" y="${y + 4}" text-anchor="end">${escapeHtml(isZero ? "0원" : formatCompactWon(value))}</text>
    `;
  }).join("");

  const bars = points.map((point, index) => {
    const delta = deltas[index];
    const barHeight = Math.abs(delta) / maxAbs * (plotHeight / 2 - 18);
    const x = padLeft + index * step + (step - barWidth) / 2;
    const y = delta >= 0 ? zeroY - barHeight : zeroY;
    const labelY = Math.min(height - padBottom - 20, Math.max(padTop + 18, delta >= 0 ? y - 12 : y + barHeight + 22));
    const showMonth = index % labelEvery === 0 || index === points.length - 1;
    const isSelected = point.month === selectedMonth;
    const isPeak = index > 0 && Math.abs(delta) === rawMaxAbs && rawMaxAbs > 0;
    const showValue = isSelected || isPeak;
    const monthLabel = point.month.replace(/^20/, "").replace("-", ".");
    const tooltipY = delta >= 0 ? Math.max(20, y - 44) : Math.min(height - padBottom - 40, y + barHeight + 16);
    const selectionX = Math.max(padLeft, x - 8);
    const selectionY = Math.max(padTop - 4, y - 10);
    const selectionHeight = Math.min(height - padBottom + 10 - selectionY, Math.max(24, barHeight + 20));
    return `
      <g class="trend-bar-group ${isSelected ? "selected" : ""}" data-trend-month="${escapeHtml(point.month)}" tabindex="0" role="button" aria-label="${escapeHtml(point.month)} ${escapeHtml(index === 0 ? "기준" : formatSignedWon(delta))}">
        <title>${escapeHtml(point.month)} · ${escapeHtml(index === 0 ? "기준" : formatSignedWon(delta))}</title>
        <rect class="trend-selection-bg" x="${selectionX}" y="${selectionY}" width="${barWidth + 16}" height="${selectionHeight}" rx="12"></rect>
        <rect class="trend-hit-area" x="${Math.max(0, x - 10)}" y="${padTop - 20}" width="${barWidth + 20}" height="${plotHeight + 54}" rx="12"></rect>
        <rect class="${delta >= 0 ? "trend-bar up" : "trend-bar down"}" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(4, barHeight)}" rx="8"></rect>
        <circle class="trend-zero-dot" cx="${x + barWidth / 2}" cy="${zeroY}" r="${isSelected ? 4 : 2.8}"></circle>
        ${showMonth || isSelected ? `<text class="chart-label ${isSelected ? "selected" : ""}" x="${x + barWidth / 2}" y="${height - 22}" text-anchor="middle">${escapeHtml(monthLabel)}</text>` : ""}
        ${showValue ? `<text class="chart-value trend-delta-label" x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle">${escapeHtml(index === 0 ? "기준" : formatSignedWon(delta))}</text>` : ""}
        <g class="trend-tooltip" transform="translate(${Math.min(width - 196, Math.max(padLeft + 6, x + barWidth / 2 - 82))}, ${tooltipY})">
          <rect width="164" height="42" rx="12"></rect>
          <text x="12" y="17">${escapeHtml(point.month)}</text>
          <text x="12" y="32">${escapeHtml(index === 0 ? "기준 월" : formatSignedWon(delta))}</text>
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
        <span><b class="legend-up"></b>전월보다 증가</span>
        <span><b class="legend-down"></b>전월보다 감소</span>
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
    <div class="trend-chart-frame">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(sector)} 전월 대비 증가 차트">
        <defs>
          <linearGradient id="trendUpGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#e85d75"></stop>
            <stop offset="100%" stop-color="#f4a0ad"></stop>
          </linearGradient>
          <linearGradient id="trendDownGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#51bfa9"></stop>
            <stop offset="100%" stop-color="#9ee3d7"></stop>
          </linearGradient>
        </defs>
        <rect class="trend-plot-bg" x="${padLeft}" y="${padTop - 18}" width="${plotWidth}" height="${plotHeight + 42}" rx="20"></rect>
        ${gridLines}
        <text class="chart-baseline-label" x="${width - padRight}" y="${zeroY - 12}" text-anchor="end">전월 대비 기준선</text>
        ${bars}
      </svg>
    </div>
  `;
}
