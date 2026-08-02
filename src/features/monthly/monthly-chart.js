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

function monthlyIncomeAllocation(row) {
  const income = Math.max(0, Number(row.income || 0));
  const consumption = Math.max(0, Number(row.consumptionSpend || 0));
  const savings = Math.max(0, Number(row.actualSavings || 0));
  const debt = Math.max(0, Number(row.debtRepayment || 0));
  const used = consumption + savings + debt;
  const free = Math.max(0, income - used);
  const deficit = Math.max(0, used - income);
  const base = Math.max(income, used, 1);
  return {
    income,
    consumption,
    savings,
    debt,
    free,
    deficit,
    consumptionRatio: consumption / base,
    savingsRatio: savings / base,
    debtRatio: debt / base,
    freeRatio: free / base
  };
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
          <dt>부채 상환</dt>
          <dd data-monthly-selected-debt>${formatWon(row.debtRepayment)}</dd>
          <small>소비 제외 원금</small>
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
  const padLeft = 78;
  const padRight = 24;
  const allocationTop = 52;
  const allocationHeight = 214;
  const allocationBottom = allocationTop + allocationHeight;
  const assetTop = 344;
  const assetHeight = 108;
  const assetBottom = assetTop + assetHeight;
  const height = 512;
  const width = Math.max(
    860,
    Math.floor(Number(availableWidth) || 0),
    padLeft + padRight + rows.length * 62
  );
  const plotWidth = width - padLeft - padRight;
  const slotWidth = plotWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(20, Math.min(34, slotWidth * 0.52));
  const percentY = (ratio) => allocationBottom - Math.max(0, Math.min(1, Number(ratio || 0))) * allocationHeight;
  const assetBounds = monthlySignedChartBounds(rows.map((row) => row.cumulativeAssetGrowth));
  const assetRange = assetBounds.max - assetBounds.min || assetBounds.step;
  const assetY = (value) => assetTop + (assetBounds.max - Number(value || 0)) / assetRange * assetHeight;
  const assetTicks = monthlyChartTickValues(assetBounds.min, assetBounds.max, assetBounds.step);
  const zeroAssetY = assetY(0);
  const labelEvery = Math.max(1, Math.ceil(rows.length / 12));
  const selected = rows.find((row) => row.month === focusedMonthlyMonth) || rows.at(-1);
  const points = rows.map((row, index) => ({
    row,
    allocation: monthlyIncomeAllocation(row),
    x: padLeft + slotWidth * (index + 0.5),
    assetY: assetY(row.cumulativeAssetGrowth)
  }));

  const selectionBands = points.map(({ row, x }) => {
    const persistent = focusedMonthlyMonth === row.month ? " is-persistent" : "";
    const selectionX = x - slotWidth * 0.43;
    const selectionWidth = slotWidth * 0.86;
    return `
      <rect class="monthly-selection-band allocation${persistent}" data-chart-selection="${escapeHtml(row.month)}" x="${selectionX}" y="${allocationTop - 8}" width="${selectionWidth}" height="${allocationHeight + 16}" rx="10"></rect>
      <rect class="monthly-selection-band asset${persistent}" data-chart-selection="${escapeHtml(row.month)}" x="${selectionX}" y="${assetTop}" width="${selectionWidth}" height="${assetHeight}" rx="10"></rect>
    `;
  }).join("");

  const allocationBars = points.map(({ row, allocation, x }, index) => {
    const startX = x - barWidth / 2;
    const consumptionHeight = allocation.consumptionRatio * allocationHeight;
    const savingsHeight = allocation.savingsRatio * allocationHeight;
    const debtHeight = allocation.debtRatio * allocationHeight;
    const freeHeight = allocation.freeRatio * allocationHeight;
    const consumptionY = allocationBottom - consumptionHeight;
    const savingsY = consumptionY - savingsHeight;
    const debtY = savingsY - debtHeight;
    const freeY = debtY - freeHeight;
    const persistent = focusedMonthlyMonth === row.month ? " is-persistent" : "";
    const showMonth = index % labelEvery === 0 || index === rows.length - 1;
    const ariaLabel = `${row.month}, 수입 ${formatWon(row.income)}, 소비지출 ${formatWon(row.consumptionSpend)}, 실제 저축 ${formatWon(row.actualSavings)}, 부채 상환 ${formatWon(row.debtRepayment)}, 자유 잔액 ${formatSignedWon(row.freeBalance)}, 월 자산 증가 ${formatSignedWon(row.assetGrowth)}, 누적 자산 증가 ${formatSignedWon(row.cumulativeAssetGrowth)}`;
    return `
      <g class="monthly-flow-point-group${persistent}"
        data-chart-month="${escapeHtml(row.month)}"
        data-chart-income="${escapeHtml(String(row.income))}"
        data-chart-consumption="${escapeHtml(String(row.consumptionSpend))}"
        data-chart-savings="${escapeHtml(String(row.actualSavings))}"
        data-chart-debt="${escapeHtml(String(row.debtRepayment))}"
        data-chart-savings-rate="${escapeHtml(monthlySavingsRateLabel(row.actualSavings, row.income))}"
        data-chart-balance="${escapeHtml(String(row.freeBalance))}"
        data-chart-growth="${escapeHtml(String(row.assetGrowth))}"
        data-chart-asset="${escapeHtml(String(row.cumulativeAssetGrowth))}"
        data-chart-consumption-delta="${row.consumptionDelta === null ? "" : escapeHtml(String(row.consumptionDelta))}"
        tabindex="0" role="button" aria-label="${escapeHtml(ariaLabel)}">
        <title>${escapeHtml(ariaLabel)}</title>
        <rect class="monthly-chart-hit-area" x="${x - slotWidth / 2}" y="${allocationTop - 10}" width="${slotWidth}" height="${assetBottom - allocationTop + 10}"></rect>
        <rect class="monthly-allocation-track" x="${startX}" y="${allocationTop}" width="${barWidth}" height="${allocationHeight}" rx="5"></rect>
        ${consumptionHeight > 0 ? `<rect class="monthly-allocation-bar consumption" x="${startX}" y="${consumptionY}" width="${barWidth}" height="${consumptionHeight}" rx="3"></rect>` : ""}
        ${savingsHeight > 0 ? `<rect class="monthly-allocation-bar savings" x="${startX}" y="${savingsY}" width="${barWidth}" height="${savingsHeight}" rx="3"></rect>` : ""}
        ${debtHeight > 0 ? `<rect class="monthly-allocation-bar debt" x="${startX}" y="${debtY}" width="${barWidth}" height="${debtHeight}" rx="3"></rect>` : ""}
        ${freeHeight > 0 ? `<rect class="monthly-allocation-bar free" x="${startX}" y="${freeY}" width="${barWidth}" height="${freeHeight}" rx="3"></rect>` : ""}
        ${allocation.deficit > 0 ? `
          <rect class="monthly-allocation-over" x="${startX - 2}" y="${allocationTop - 2}" width="${barWidth + 4}" height="${allocationHeight + 4}" rx="6"></rect>
          <circle class="monthly-allocation-deficit-dot" cx="${x}" cy="${allocationTop - 8}" r="4"></circle>
        ` : ""}
        <circle class="monthly-asset-point ${row.cumulativeAssetGrowth >= 0 ? "positive" : "negative"}" cx="${x}" cy="${assetY(row.cumulativeAssetGrowth)}" r="4"></circle>
        ${showMonth ? `<text class="chart-label" x="${x}" y="${height - 14}" text-anchor="middle">${escapeHtml(row.month.slice(2))}</text>` : ""}
      </g>
    `;
  }).join("");

  const tooltips = points.map(({ row, allocation, x }) => {
    const tooltipWidth = 230;
    const tooltipHeight = 164;
    const tooltipX = Math.min(width - padRight - tooltipWidth, Math.max(padLeft, x + 12));
    return `
      <g class="monthly-flow-tooltip" data-chart-tooltip="${escapeHtml(row.month)}" transform="translate(${tooltipX} ${allocationTop + 8})" aria-hidden="true">
        <rect class="monthly-flow-tooltip-bg" width="${tooltipWidth}" height="${tooltipHeight}" rx="10"></rect>
        <text class="monthly-flow-tooltip-month" x="12" y="20">${escapeHtml(row.month)}</text>
        <text class="monthly-flow-tooltip-line income" x="12" y="42">수입 ${escapeHtml(formatWon(row.income))}</text>
        <text class="monthly-flow-tooltip-line consumption" x="12" y="62">소비 ${escapeHtml(formatWon(row.consumptionSpend))}</text>
        <text class="monthly-flow-tooltip-line savings" x="12" y="82">저축 ${escapeHtml(formatWon(row.actualSavings))} · ${escapeHtml(monthlySavingsRateLabel(row.actualSavings, row.income))}</text>
        <text class="monthly-flow-tooltip-line debt" x="12" y="102">부채 상환 ${escapeHtml(formatWon(row.debtRepayment))}</text>
        <text class="monthly-flow-tooltip-line ${row.freeBalance >= 0 ? "positive" : "negative"}" x="12" y="122">자유 잔액 ${escapeHtml(formatSignedWon(row.freeBalance))}</text>
        <text class="monthly-flow-tooltip-line ${row.assetGrowth >= 0 ? "positive" : "negative"}" x="12" y="142">자산 증가 ${escapeHtml(formatSignedWon(row.assetGrowth))}</text>
        <text class="monthly-flow-tooltip-line ${allocation.deficit > 0 ? "negative" : "positive"}" x="12" y="160">${allocation.deficit > 0 ? `수입 초과 ${escapeHtml(formatWon(allocation.deficit))}` : `누적 ${escapeHtml(formatSignedWon(row.cumulativeAssetGrowth))}`}</text>
      </g>
    `;
  }).join("");

  const percentTicks = [0, 0.25, 0.5, 0.75, 1];
  return `
    <div class="monthly-chart-legend" aria-label="그래프 범례">
      <span><i class="monthly-legend-swatch consumption" aria-hidden="true"></i>소비지출</span>
      <span><i class="monthly-legend-swatch savings" aria-hidden="true"></i>실제 저축</span>
      <span><i class="monthly-legend-swatch debt" aria-hidden="true"></i>부채 상환</span>
      <span><i class="monthly-legend-swatch free" aria-hidden="true"></i>자유 잔액</span>
      <span><i class="monthly-legend-outline deficit" aria-hidden="true"></i>수입 초과</span>
      <span><i class="monthly-legend-line asset" aria-hidden="true"></i>누적 자산 증가</span>
    </div>
    <div class="monthly-chart-scroll" data-monthly-chart-scroll>
      <svg class="monthly-flow-chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="월별 수입의 소비지출, 실제 저축, 부채 상환, 자유 잔액 배분과 누적 자산 증가 그래프">
        <rect class="monthly-chart-zone allocation" x="0" y="24" width="${width}" height="${allocationBottom - 12}" rx="12"></rect>
        <rect class="monthly-chart-zone asset" x="0" y="${assetTop - 22}" width="${width}" height="${assetHeight + 42}" rx="12"></rect>
        <text class="monthly-chart-section-label" x="${padLeft}" y="18">월별 수입 배분 · 100%</text>
        <text class="monthly-chart-section-label" x="${padLeft}" y="${assetTop - 28}">연간 누적 자산 증가</text>
        ${percentTicks.map((ratio) => {
          const y = percentY(ratio);
          return `
            <line class="chart-grid monthly-allocation-grid" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
            <text class="monthly-axis-label" x="${padLeft - 10}" y="${y + 4}" text-anchor="end">${Math.round(ratio * 100)}%</text>
          `;
        }).join("")}
        ${assetTicks.map((value) => {
          const y = assetY(value);
          return `
            <line class="chart-grid monthly-balance-grid ${value === 0 ? "zero" : ""}" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
            <text class="monthly-axis-label" x="${padLeft - 10}" y="${y + 4}" text-anchor="end">${escapeHtml(formatMonthlyAxisWon(value))}</text>
          `;
        }).join("")}
        ${selectionBands}
        <path class="monthly-asset-line" d="${monthlySvgPath(points.map(({ x, assetY: y }) => ({ x, y })))}"></path>
        <line class="monthly-balance-zero-line" x1="${padLeft}" y1="${zeroAssetY}" x2="${width - padRight}" y2="${zeroAssetY}"></line>
        ${allocationBars}
        ${tooltips}
      </svg>
    </div>
    ${renderMonthlySelectedSummary(selected)}
  `;
}
