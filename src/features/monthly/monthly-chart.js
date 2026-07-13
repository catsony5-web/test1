function monthlyChartStep(maxAbs) {
  const rawStep = Math.max(Number(maxAbs || 0), 2) / 2;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = [1, 1.25, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) || 10;
  return factor * magnitude;
}

function renderMonthlyBalanceSummaryItem(tone, icon, label, row, selected = false) {
  return `
    <div class="balance-summary-item ${tone}"${selected ? " data-monthly-selected-summary" : ""}>
      <span class="balance-summary-icon"><i class="ti ${icon}" aria-hidden="true"></i></span>
      <span class="balance-summary-copy">
        <small>${escapeHtml(label)}</small>
        <b${selected ? " data-monthly-selected-month" : ""}>${escapeHtml(row.month)}</b>
      </span>
      <strong${selected ? " data-monthly-selected-amount" : ""}>${escapeHtml(formatSignedWon(row.net))}</strong>
    </div>
  `;
}

function renderMonthlyLineChart(rows) {
  const width = 980;
  const height = 410;
  const padLeft = 86;
  const padRight = 28;
  const padTop = 34;
  const padBottom = 66;
  const values = rows.map((row) => Number(row.net || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const step = monthlyChartStep(Math.max(Math.abs(min), Math.abs(max)));
  let maxBound = max > 0 ? Math.ceil(max / step) * step : 0;
  let minBound = min < 0 ? -Math.ceil(Math.abs(min) / step) * step : 0;
  if (maxBound === 0 && minBound === 0) {
    maxBound = step;
    minBound = -step;
  }

  const range = maxBound - minBound || step;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const slotWidth = plotWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(6, Math.min(30, slotWidth * 0.56));
  const yFor = (value) => padTop + (maxBound - value) / range * plotHeight;
  const zeroY = yFor(0);
  const points = rows.map((row, index) => ({
    x: padLeft + slotWidth * (index + 0.5),
    y: yFor(Number(row.net || 0))
  }));
  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
  const best = [...rows].sort((a, b) => b.net - a.net)[0];
  const worst = [...rows].sort((a, b) => a.net - b.net)[0];
  const selected = rows.find((row) => row.month === focusedMonthlyMonth) || rows.at(-1);
  const gridValues = [];
  for (let value = maxBound; value > 0; value -= step) gridValues.push(value);
  gridValues.push(0);
  for (let value = -step; value >= minBound; value -= step) gridValues.push(value);

  const chartGroups = points.map((point, index) => {
    const row = rows[index];
    const barY = Math.min(point.y, zeroY);
    const barHeight = Math.max(2, Math.abs(point.y - zeroY));
    const showMonth = index % labelEvery === 0 || index === rows.length - 1;
    const persistent = focusedMonthlyMonth === row.month ? " is-persistent" : "";
    return `
      <g class="balance-point-group${persistent}" data-chart-month="${escapeHtml(row.month)}" data-chart-net="${escapeHtml(String(row.net))}" tabindex="0" role="button" aria-label="${escapeHtml(`${row.month} 월별 상세 행으로 이동, ${formatSignedWon(row.net)}`)}">
        <title>${escapeHtml(row.month)} · ${escapeHtml(formatSignedWon(row.net))}</title>
        <rect class="balance-hit-area" x="${point.x - slotWidth / 2}" y="${padTop}" width="${slotWidth}" height="${plotHeight}" rx="8"></rect>
        <rect class="balance-bar ${row.net >= 0 ? "good" : "bad"}" x="${point.x - barWidth / 2}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="3"></rect>
        ${showMonth ? `<text class="chart-label" x="${point.x}" y="${height - 22}" text-anchor="middle">${escapeHtml(row.month.slice(2))}</text>` : ""}
      </g>
    `;
  }).join("");

  const selectionBands = points.map((point, index) => {
    const row = rows[index];
    const persistent = focusedMonthlyMonth === row.month ? " is-persistent" : "";
    return `<rect class="balance-selection-band${persistent}" data-chart-selection="${escapeHtml(row.month)}" x="${point.x - slotWidth * 0.42}" y="${padTop}" width="${slotWidth * 0.84}" height="${plotHeight}" rx="12"></rect>`;
  }).join("");

  const tooltips = points.map((point, index) => {
    const row = rows[index];
    const tooltipWidth = 164;
    const tooltipHeight = 74;
    const tooltipX = point.x + tooltipWidth + 16 <= width - padRight
      ? point.x + 12
      : point.x - tooltipWidth - 12;
    const tooltipY = row.net >= 0
      ? Math.max(padTop + 8, point.y - tooltipHeight - 12)
      : Math.max(padTop + 8, zeroY - tooltipHeight - 14);
    const previous = rows[index - 1];
    const comparison = previous
      ? `전월 대비 ${formatSignedWon(row.net - previous.net)}`
      : "첫 기록";
    const persistent = focusedMonthlyMonth === row.month ? " is-persistent" : "";
    return `
      <g class="balance-bar-tooltip${persistent}" data-chart-tooltip="${escapeHtml(row.month)}" transform="translate(${tooltipX} ${tooltipY})" aria-hidden="true">
        <rect class="balance-bar-tooltip-bg" width="${tooltipWidth}" height="${tooltipHeight}" rx="10"></rect>
        <text class="balance-bar-tooltip-month" x="12" y="20">${escapeHtml(row.month)}</text>
        <text class="balance-bar-tooltip-value ${row.net >= 0 ? "positive" : "negative"}" x="12" y="42">${escapeHtml(formatSignedWon(row.net))}</text>
        <text class="balance-bar-tooltip-delta" x="12" y="61">${escapeHtml(comparison)}</text>
      </g>
    `;
  }).join("");

  return `
    <div class="balance-summary-grid" aria-label="월별 잔액 요약">
      ${renderMonthlyBalanceSummaryItem("positive", "ti-chart-line", "최고 월 잔액", best)}
      ${renderMonthlyBalanceSummaryItem("negative", "ti-alert-circle", "최저 월 잔액", worst)}
      ${renderMonthlyBalanceSummaryItem("selected", "ti-calendar", "선택 월", selected, true)}
    </div>
    <div class="monthly-chart-scroll" data-monthly-chart-scroll>
      <svg class="balance-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="월별 수입에서 실 지출을 뺀 잔액 막대 차트">
        <rect class="balance-chart-bg" x="0" y="0" width="${width}" height="${height}" rx="14"></rect>
        ${gridValues.filter((value) => value !== 0).map((value) => {
          const y = yFor(value);
          return `
            <g>
              <line class="chart-grid balance-grid" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
              <text class="chart-value balance-axis-label" x="${padLeft - 12}" y="${y + 4}" text-anchor="end">${escapeHtml(formatCompactWon(value))}</text>
            </g>
          `;
        }).join("")}
        ${selectionBands}
        ${chartGroups}
        <line class="chart-axis balance-zero-line" x1="${padLeft}" y1="${zeroY}" x2="${width - padRight}" y2="${zeroY}"></line>
        <text class="chart-baseline-label" x="${padLeft - 12}" y="${zeroY + 4}" text-anchor="end">0원</text>
        ${tooltips}
      </svg>
    </div>
  `;
}
