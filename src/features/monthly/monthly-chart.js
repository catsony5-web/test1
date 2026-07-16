function monthlyChartStep(maxValue, targetTicks = 4) {
  const rawStep = Math.max(Number(maxValue || 0), 4) / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = [1, 1.25, 2, 2.5, 5, 10].find((candidate) => normalized <= candidate) || 10;
  return factor * magnitude;
}

function formatMonthlyAxisWon(value, signed = true) {
  if (Number(value || 0) === 0) return "0원";
  const label = formatCompactWon(value);
  return signed ? label : label.replace(/^\+/, "");
}

function monthlySignedChartBounds(values) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const step = monthlyChartStep(Math.max(Math.abs(min), Math.abs(max)), 3);
  if (min === 0 && max === 0) return { min: -step, max: step, step };
  return {
    min: min < 0 ? -Math.ceil(Math.abs(min) / step) * step : 0,
    max: max > 0 ? Math.ceil(max / step) * step : 0,
    step
  };
}

function monthlyChartTickValues(min, max, step) {
  const values = [];
  for (let value = max; value >= min && values.length < 12; value -= step) values.push(value);
  return values;
}

function monthlySvgPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function renderMonthlySelectedSummary(row) {
  const delta = Number(row.consumptionDelta || 0);
  const deltaText = row.consumptionDelta === null
    ? "기간 첫 달"
    : delta === 0 ? "전월과 동일" : `전월 대비 ${formatSignedWon(delta)}`;
  const deltaTone = delta > 0 ? "increase" : delta < 0 ? "decrease" : "";
  return `
    <section class="monthly-selected-summary" data-monthly-selected-summary aria-label="선택 월 핵심 금액">
      <div class="monthly-selected-heading">
        <span>선택 월</span>
        <strong data-monthly-selected-month>${escapeHtml(row.month)}</strong>
      </div>
      <dl>
        <div>
          <dt>총수입</dt>
          <dd data-monthly-selected-income>${formatWon(row.income)}</dd>
        </div>
        <div>
          <dt>소비지출</dt>
          <dd data-monthly-selected-consumption>${formatWon(row.consumptionSpend)}</dd>
          <small class="${deltaTone}" data-monthly-selected-delta>${escapeHtml(deltaText)}</small>
        </div>
        <div>
          <dt>실제 저축</dt>
          <dd data-monthly-selected-savings>${formatWon(row.actualSavings)}</dd>
          <small>저축률 <span data-monthly-selected-rate>${monthlySavingsRateLabel(row.actualSavings, row.income)}</span></small>
        </div>
        <div>
          <dt>자유 잔액</dt>
          <dd class="${row.freeBalance >= 0 ? "positive" : "negative"}" data-monthly-selected-balance>${formatSignedWon(row.freeBalance)}</dd>
        </div>
        <div>
          <dt>월 자산 증가</dt>
          <dd class="${row.assetGrowth >= 0 ? "positive" : "negative"}" data-monthly-selected-growth>${formatSignedWon(row.assetGrowth)}</dd>
        </div>
        <div>
          <dt>누적 자산 증가</dt>
          <dd class="${row.cumulativeAssetGrowth >= 0 ? "positive" : "negative"}" data-monthly-selected-asset>${formatSignedWon(row.cumulativeAssetGrowth)}</dd>
        </div>
      </dl>
    </section>
  `;
}

function renderMonthlyFlowChart(rows, availableWidth = 0) {
  const padLeft = 82;
  const padRight = 24;
  const cashTop = 44;
  const cashHeight = 226;
  const cashBottom = cashTop + cashHeight;
  const balanceTop = 344;
  const balanceHeight = 108;
  const balanceBottom = balanceTop + balanceHeight;
  const height = 512;
  const width = Math.max(
    860,
    Math.floor(Number(availableWidth) || 0),
    padLeft + padRight + rows.length * 62
  );
  const plotWidth = width - padLeft - padRight;
  const slotWidth = plotWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(16, Math.min(26, slotWidth * 0.4));
  const cashValues = rows.flatMap((row) => [row.consumptionSpend + row.actualSavings, row.income]);
  const cashStep = monthlyChartStep(Math.max(...cashValues, 1), 4);
  const cashMax = Math.max(cashStep, Math.ceil(Math.max(...cashValues, 0) / cashStep) * cashStep);
  const cashY = (value) => cashTop + (cashMax - Number(value || 0)) / cashMax * cashHeight;
  const cashTicks = monthlyChartTickValues(0, cashMax, cashStep);
  const balanceBounds = monthlySignedChartBounds(rows.map((row) => row.cumulativeAssetGrowth));
  const balanceRange = balanceBounds.max - balanceBounds.min || balanceBounds.step;
  const balanceY = (value) => balanceTop + (balanceBounds.max - Number(value || 0)) / balanceRange * balanceHeight;
  const balanceTicks = monthlyChartTickValues(balanceBounds.min, balanceBounds.max, balanceBounds.step);
  const zeroBalanceY = balanceY(0);
  const labelEvery = Math.max(1, Math.ceil(rows.length / 12));
  const selected = rows.find((row) => row.month === focusedMonthlyMonth) || rows.at(-1);
  const savingsLegendLabel = rows.every((row) => Number(row.actualSavings || 0) === 0)
    ? "실제 저축 0원"
    : "실제 저축";
  const points = rows.map((row, index) => ({
    row,
    x: padLeft + slotWidth * (index + 0.5),
    incomeY: cashY(row.income),
    assetY: balanceY(row.cumulativeAssetGrowth)
  }));

  const selectionBands = points.map(({ row, x }) => {
    const persistent = focusedMonthlyMonth === row.month ? " is-persistent" : "";
    const selectionX = x - slotWidth * 0.43;
    const selectionWidth = slotWidth * 0.86;
    return `
      <rect class="monthly-selection-band cash${persistent}" data-chart-selection="${escapeHtml(row.month)}" x="${selectionX}" y="${cashTop}" width="${selectionWidth}" height="${cashHeight}" rx="10"></rect>
      <rect class="monthly-selection-band asset${persistent}" data-chart-selection="${escapeHtml(row.month)}" x="${selectionX}" y="${balanceTop}" width="${selectionWidth}" height="${balanceHeight}" rx="10"></rect>
    `;
  }).join("");

  const cashBars = points.map(({ row, x }, index) => {
    const startX = x - barWidth / 2;
    const consumptionY = cashY(row.consumptionSpend);
    const allocated = row.consumptionSpend + row.actualSavings;
    const allocatedY = cashY(allocated);
    const incomeY = cashY(row.income);
    const persistent = focusedMonthlyMonth === row.month ? " is-persistent" : "";
    const showMonth = index % labelEvery === 0 || index === rows.length - 1;
    const ariaLabel = `${row.month}, 수입 ${formatWon(row.income)}, 소비지출 ${formatWon(row.consumptionSpend)}, 실제 저축 ${formatWon(row.actualSavings)}, 자유 잔액 ${formatSignedWon(row.freeBalance)}, 월 자산 증가 ${formatSignedWon(row.assetGrowth)}, 누적 자산 증가 ${formatSignedWon(row.cumulativeAssetGrowth)}`;
    return `
      <g class="monthly-flow-point-group${persistent}"
        data-chart-month="${escapeHtml(row.month)}"
        data-chart-income="${escapeHtml(String(row.income))}"
        data-chart-consumption="${escapeHtml(String(row.consumptionSpend))}"
        data-chart-savings="${escapeHtml(String(row.actualSavings))}"
        data-chart-savings-rate="${escapeHtml(monthlySavingsRateLabel(row.actualSavings, row.income))}"
        data-chart-balance="${escapeHtml(String(row.freeBalance))}"
        data-chart-growth="${escapeHtml(String(row.assetGrowth))}"
        data-chart-asset="${escapeHtml(String(row.cumulativeAssetGrowth))}"
        data-chart-consumption-delta="${row.consumptionDelta === null ? "" : escapeHtml(String(row.consumptionDelta))}"
        tabindex="0" role="button" aria-label="${escapeHtml(ariaLabel)}">
        <title>${escapeHtml(ariaLabel)}</title>
        <rect class="monthly-chart-hit-area" x="${x - slotWidth / 2}" y="${cashTop}" width="${slotWidth}" height="${balanceBottom - cashTop}"></rect>
        <rect class="monthly-cash-bar consumption" x="${startX}" y="${consumptionY}" width="${barWidth}" height="${Math.max(0, cashBottom - consumptionY)}" rx="3"></rect>
        <rect class="monthly-cash-bar savings" x="${startX}" y="${allocatedY}" width="${barWidth}" height="${Math.max(0, consumptionY - allocatedY)}" rx="3"></rect>
        <line class="monthly-balance-gap-outline" x1="${x}" y1="${incomeY}" x2="${x}" y2="${allocatedY}"></line>
        <line class="monthly-balance-gap ${row.freeBalance >= 0 ? "positive" : "negative"}" x1="${x}" y1="${incomeY}" x2="${x}" y2="${allocatedY}"></line>
        <circle class="monthly-income-point" cx="${x}" cy="${incomeY}" r="3.5"></circle>
        <circle class="monthly-asset-point ${row.cumulativeAssetGrowth >= 0 ? "positive" : "negative"}" cx="${x}" cy="${balanceY(row.cumulativeAssetGrowth)}" r="4"></circle>
        ${showMonth ? `<text class="chart-label" x="${x}" y="${height - 14}" text-anchor="middle">${escapeHtml(row.month.slice(2))}</text>` : ""}
      </g>
    `;
  }).join("");

  const tooltips = points.map(({ row, x }) => {
    const tooltipWidth = 220;
    const tooltipHeight = 144;
    const tooltipX = Math.min(width - padRight - tooltipWidth, Math.max(padLeft, x + 12));
    return `
      <g class="monthly-flow-tooltip" data-chart-tooltip="${escapeHtml(row.month)}" transform="translate(${tooltipX} ${cashTop + 10})" aria-hidden="true">
        <rect class="monthly-flow-tooltip-bg" width="${tooltipWidth}" height="${tooltipHeight}" rx="10"></rect>
        <text class="monthly-flow-tooltip-month" x="12" y="20">${escapeHtml(row.month)}</text>
        <text class="monthly-flow-tooltip-line income" x="12" y="42">수입 ${escapeHtml(formatWon(row.income))}</text>
        <text class="monthly-flow-tooltip-line consumption" x="12" y="62">소비 ${escapeHtml(formatWon(row.consumptionSpend))}</text>
        <text class="monthly-flow-tooltip-line savings" x="12" y="82">저축 ${escapeHtml(formatWon(row.actualSavings))} · ${escapeHtml(monthlySavingsRateLabel(row.actualSavings, row.income))}</text>
        <text class="monthly-flow-tooltip-line ${row.freeBalance >= 0 ? "positive" : "negative"}" x="12" y="102">자유 잔액 ${escapeHtml(formatSignedWon(row.freeBalance))}</text>
        <text class="monthly-flow-tooltip-line ${row.assetGrowth >= 0 ? "positive" : "negative"}" x="12" y="122">자산 증가 ${escapeHtml(formatSignedWon(row.assetGrowth))}</text>
        <text class="monthly-flow-tooltip-line ${row.cumulativeAssetGrowth >= 0 ? "positive" : "negative"}" x="12" y="140">누적 ${escapeHtml(formatSignedWon(row.cumulativeAssetGrowth))}</text>
      </g>
    `;
  }).join("");

  return `
    <div class="monthly-chart-legend" aria-label="그래프 범례">
      <span><i class="monthly-legend-swatch consumption" aria-hidden="true"></i>소비지출</span>
      <span><i class="monthly-legend-swatch savings" aria-hidden="true"></i>${savingsLegendLabel}</span>
      <span><i class="monthly-legend-line income" aria-hidden="true"></i>총수입</span>
      <span><i class="monthly-legend-gap" aria-hidden="true"></i>남은 금액 차이</span>
      <span><i class="monthly-legend-line asset" aria-hidden="true"></i>누적 자산 증가</span>
    </div>
    <div class="monthly-chart-scroll" data-monthly-chart-scroll>
      <svg class="monthly-flow-chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="월별 수입, 소비지출, 실제 저축, 자유 잔액과 누적 자산 증가 그래프">
        <rect class="monthly-chart-zone cash" x="0" y="24" width="${width}" height="${cashBottom - 14}" rx="12"></rect>
        <rect class="monthly-chart-zone asset" x="0" y="${balanceTop - 22}" width="${width}" height="${balanceHeight + 42}" rx="12"></rect>
        <text class="monthly-chart-section-label" x="${padLeft}" y="18">월별 수입 배분</text>
        <text class="monthly-chart-section-label" x="${padLeft}" y="${balanceTop - 28}">연간 누적 자산 증가</text>
        ${cashTicks.map((value) => {
          const y = cashY(value);
          return `
            <line class="chart-grid monthly-cash-grid" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
            <text class="monthly-axis-label" x="${padLeft - 10}" y="${y + 4}" text-anchor="end">${escapeHtml(formatMonthlyAxisWon(value, false))}</text>
          `;
        }).join("")}
        ${balanceTicks.map((value) => {
          const y = balanceY(value);
          return `
            <line class="chart-grid monthly-balance-grid ${value === 0 ? "zero" : ""}" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
            <text class="monthly-axis-label" x="${padLeft - 10}" y="${y + 4}" text-anchor="end">${escapeHtml(formatMonthlyAxisWon(value))}</text>
          `;
        }).join("")}
        ${selectionBands}
        <path class="monthly-income-line" d="${monthlySvgPath(points.map(({ x, incomeY }) => ({ x, y: incomeY })))}"></path>
        <path class="monthly-asset-line" d="${monthlySvgPath(points.map(({ x, assetY }) => ({ x, y: assetY })))}"></path>
        <line class="monthly-balance-zero-line" x1="${padLeft}" y1="${zeroBalanceY}" x2="${width - padRight}" y2="${zeroBalanceY}"></line>
        ${cashBars}
        ${tooltips}
      </svg>
    </div>
    ${renderMonthlySelectedSummary(selected)}
  `;
}
