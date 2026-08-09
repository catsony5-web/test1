function buildSummaryPeriodModel(activeRows, months, sectorNames, selectedMonth, selectedSector, comparison) {
  const comparisonOffset = summaryComparisonMonthOffset(comparison);
  const rows = months.map((month) => {
    const baselineMonth = shiftMonthKey(month, comparisonOffset);
    const cutoffDay = month === selectedMonth ? comparison.cutoffDay : 0;
    const currentRows = summaryRowsForComparisonMonth(activeRows, month, cutoffDay);
    const baselineRows = summaryRowsForComparisonMonth(activeRows, baselineMonth, cutoffDay);
    const cells = sectorNames.map((sector) => {
      const sectorRows = currentRows.filter((item) => item.sector === sector);
      const baselineSectorRows = baselineRows.filter((item) => item.sector === sector);
      return {
        month,
        baselineMonth,
        sector,
        currentRows: sectorRows,
        baselineRows: baselineSectorRows,
        baselineExists: activeRows.some((item) => item.month === baselineMonth),
        ...formatSummaryComparisonChange(sumConsumption(sectorRows), sumConsumption(baselineSectorRows))
      };
    });
    return { month, baselineMonth, currentRows, baselineRows, cells };
  });
  const allCells = rows.flatMap((row) => row.cells);
  const maxAbsDelta = Math.max(...allCells.map((cell) => Math.abs(cell.delta)), 1);
  const flows = sectorNames.map((sector) => {
    const points = rows.map((row) => row.cells.find((cell) => cell.sector === sector));
    const recent = points.slice(-3).map((item) => item.currentAmount);
    const previous = points.slice(-6, -3).map((item) => item.currentAmount);
    const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const recentAverage = average(recent);
    const previousAverage = average(previous);
    const flowDelta = recentAverage - previousAverage;
    const threshold = Math.max(10000, previousAverage * 0.1);
    const selectedPoint = points.find((item) => item.month === selectedMonth) || points.at(-1);
    return {
      sector,
      points,
      selectedPoint,
      recentAverage,
      previousAverage,
      flowDelta,
      hasEnoughHistory: points.length >= 6,
      status: points.length < 6 || Math.abs(flowDelta) <= threshold ? "stable" : flowDelta > 0 ? "up" : "down"
    };
  }).filter((flow) => flow.points.some((point) => point.currentAmount > 0 || point.comparisonAmount > 0));
  const requestedKey = selectedSummaryPeriodCell || `${selectedMonth}|${selectedSector}`;
  const selectedCell = allCells.find((cell) => `${cell.month}|${cell.sector}` === requestedKey)
    || allCells.find((cell) => cell.month === selectedMonth && cell.sector === selectedSector)
    || [...allCells].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
    || null;
  const biggestIncrease = [...allCells].filter((cell) => cell.baselineExists && cell.delta > 0).sort((a, b) => b.delta - a.delta)[0] || null;
  const biggestDecrease = [...allCells].filter((cell) => cell.baselineExists && cell.delta < 0).sort((a, b) => a.delta - b.delta)[0] || null;
  return {
    months,
    sectorNames,
    rows,
    flows,
    selectedCell,
    maxAbsDelta,
    biggestIncrease,
    biggestDecrease,
    selectedMonth,
    selectedSector,
    comparisonLabel: comparison.comparisonLabel,
    cutoffDay: comparison.cutoffDay
  };
}

function summaryPeriodCellTone(cell) {
  if (!cell.baselineExists || cell.delta === 0) return "neutral";
  return cell.delta > 0 ? "up" : "down";
}

function summaryPeriodSparkline(points) {
  const values = points.map((point) => point.currentAmount);
  const width = 230;
  const height = 46;
  const pad = 5;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const coords = values.map((value, index) => ({
    x: pad + index / Math.max(1, values.length - 1) * (width - pad * 2),
    y: pad + (max - value) / span * (height - pad * 2)
  }));
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${path}"></path>${coords.map((point, index) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${index === coords.length - 1 ? 3.8 : 2.3}"></circle>`).join("")}</svg>`;
}

function summaryPeriodSelectedDriver(cell) {
  if (!cell) return null;
  return buildSummaryComparisonGroups(cell.currentRows, cell.baselineRows, comparisonSubcategoryLabel)
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null;
}

function renderSummaryPeriod(activeRows, months, sectorNames, selectedMonth, selectedSector, comparison) {
  if (!els.summaryPeriodPanel) return;
  const model = buildSummaryPeriodModel(activeRows, months, sectorNames, selectedMonth, selectedSector, comparison);
  if (!model.rows.length || !model.sectorNames.length) {
    els.summaryPeriodPanel.innerHTML = `<div class="empty compact-empty">기간 변화를 분석할 지출 기록이 없습니다.</div>`;
    return;
  }
  selectedSummaryPeriodMode = selectedSummaryPeriodMode === "flow" ? "flow" : "heatmap";
  const increaseCount = model.flows.filter((flow) => flow.status === "up").length;
  const decreaseCount = model.flows.filter((flow) => flow.status === "down").length;
  els.summaryPeriodPanel.innerHTML = `
    <div class="summary-period-toolbar">
      <div class="summary-period-modes" role="group" aria-label="기간 분석 보기 방식">
        <button type="button" data-period-mode="heatmap" aria-pressed="${selectedSummaryPeriodMode === "heatmap"}"><i class="ti ti-adjustments-horizontal" aria-hidden="true"></i>변화 지도</button>
        <button type="button" data-period-mode="flow" aria-pressed="${selectedSummaryPeriodMode === "flow"}"><i class="ti ti-chart-line" aria-hidden="true"></i>흐름 보드</button>
      </div>
      <p><strong>${model.months.length.toLocaleString("ko-KR")}개월</strong> 동안 증가 흐름 ${increaseCount}개 · 감소 흐름 ${decreaseCount}개 섹터</p>
    </div>
    ${selectedSummaryPeriodMode === "heatmap" ? renderSummaryPeriodHeatmap(model) : renderSummaryPeriodFlow(model)}
  `;
  attachSummaryPeriodHandlers(model);
}

function renderSummaryPeriodHeatmap(model) {
  const selected = model.selectedCell;
  const driver = summaryPeriodSelectedDriver(selected);
  return `
    <div class="summary-period-layout">
      <section class="summary-period-map" aria-labelledby="summaryPeriodMapTitle">
        <div class="summary-card-heading"><h4 id="summaryPeriodMapTitle">기간 변화 지도</h4><span>단위: 비교 기준 대비 증감액</span></div>
        <div class="summary-period-map-scroll" tabindex="0" aria-label="월별 섹터 변화 지도, 가로로 스크롤할 수 있습니다">
          <table>
            <thead><tr><th>월</th>${model.sectorNames.map((sector) => `<th>${categoryChip(sector)}<span>${escapeHtml(sector)}</span></th>`).join("")}</tr></thead>
            <tbody>${model.rows.map((row) => `<tr class="${row.month === model.selectedMonth ? "selected" : ""}"><th>${escapeHtml(row.month)}${row.month === model.selectedMonth && model.cutoffDay ? `<small>${model.cutoffDay}일까지</small>` : ""}</th>${row.cells.map((cell) => {
              const tone = summaryPeriodCellTone(cell);
              const intensity = Math.round(Math.abs(cell.delta) / model.maxAbsDelta * 100);
              const isSelected = selected && cell.month === selected.month && cell.sector === selected.sector;
              return `<td><button type="button" class="period-map-cell ${tone} ${isSelected ? "selected" : ""}" style="--period-mix:${Math.round(18 + intensity * .55)}%" data-period-cell="${escapeHtml(`${cell.month}|${cell.sector}`)}" aria-label="${escapeHtml(`${cell.month} ${cell.sector}, ${cell.baselineExists ? formatSignedWon(cell.delta) : "비교 기록 없음"}`)}"><strong>${cell.baselineExists ? formatSignedWon(cell.delta) : "-"}</strong><small>${cell.baselineExists ? escapeHtml(cell.rateLabel) : "비교 없음"}</small></button></td>`;
            }).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="summary-period-map-legend"><span>감소</span><i class="down strong"></i><i class="down"></i><i class="neutral"></i><i class="up"></i><i class="up strong"></i><span>증가</span></div>
      </section>
      ${selected ? `<aside class="summary-period-inspector" aria-live="polite">
        <span>${escapeHtml(selected.month)}</span>
        <h4>${categoryChip(selected.sector)}<strong>${escapeHtml(selected.sector)}</strong></h4>
        <p>${escapeHtml(selected.baselineMonth)} ${escapeHtml(model.comparisonLabel)} 대비</p>
        <dl><div><dt>현재 금액</dt><dd>${formatWon(selected.currentAmount)}</dd></div><div><dt>증감액</dt><dd class="${summaryPeriodCellTone(selected)}">${selected.baselineExists ? formatSignedWon(selected.delta) : "비교 없음"}</dd></div><div><dt>증감률</dt><dd class="${summaryPeriodCellTone(selected)}">${selected.baselineExists ? escapeHtml(selected.rateLabel) : "-"}</dd></div></dl>
        <section><h5>가장 큰 변화 원인</h5>${driver ? `<strong>${escapeHtml(driver.label)}</strong><p>${formatSignedWon(driver.delta)} · ${escapeHtml(driver.rateLabel)}</p>` : `<p>세부 변화 요인이 없습니다.</p>`}</section>
        <button type="button" data-period-detail="${escapeHtml(`${selected.month}|${selected.sector}`)}">관련 거래 보기 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </aside>` : ""}
    </div>
  `;
}

function renderSummaryPeriodFlow(model) {
  const sortedFlows = [...model.flows].sort((a, b) => (b.selectedPoint?.delta || 0) - (a.selectedPoint?.delta || 0));
  const selectedFlow = sortedFlows.find((flow) => flow.sector === model.selectedCell?.sector) || sortedFlows[0];
  const statusText = { up: "증가 흐름", down: "감소 흐름", stable: "안정" };
  return `
    <section class="summary-period-flow" aria-labelledby="summaryPeriodFlowTitle">
      <div class="summary-period-flow-summary">
        <article class="up"><i class="ti ti-arrows-exchange" aria-hidden="true"></i><span>가장 큰 증가</span><strong>${escapeHtml(model.biggestIncrease?.sector || "-")} ${model.biggestIncrease ? formatSignedWon(model.biggestIncrease.delta) : ""}</strong></article>
        <article class="down"><i class="ti ti-arrows-exchange" aria-hidden="true"></i><span>가장 큰 감소</span><strong>${escapeHtml(model.biggestDecrease?.sector || "-")} ${model.biggestDecrease ? formatSignedWon(model.biggestDecrease.delta) : ""}</strong></article>
        <article><i class="ti ti-chart-line" aria-hidden="true"></i><span>선택 섹터</span><strong>${escapeHtml(selectedFlow?.sector || "-")}</strong></article>
      </div>
      <div class="summary-card-heading"><h4 id="summaryPeriodFlowTitle">섹터 흐름 보드</h4><span>${escapeHtml(model.months[0])}–${escapeHtml(model.months.at(-1))}</span></div>
      <div class="summary-flow-table" role="table" aria-label="섹터별 월간 흐름">
        <div class="summary-flow-head" role="row"><span>섹터</span><span>선택 월 금액</span><span>비교 기준 대비</span><span>기간 흐름</span><span>상태</span></div>
        ${sortedFlows.map((flow, index) => {
          const point = flow.selectedPoint;
          const isSelected = flow.sector === selectedFlow?.sector;
          return `<article class="summary-flow-row ${flow.status} ${isSelected ? "selected" : ""}" role="row">
            <button type="button" data-period-flow-sector="${escapeHtml(flow.sector)}" aria-expanded="${isSelected}" aria-label="${escapeHtml(`${flow.sector}, ${point ? formatWon(point.currentAmount) : "0원"}, ${statusText[flow.status]}`)}">
              <span class="flow-rank">${index + 1}</span><span class="flow-sector">${categoryChip(flow.sector)}<strong>${escapeHtml(flow.sector)}</strong></span><b>${point ? formatWon(point.currentAmount) : "0원"}</b><em class="${summaryPeriodCellTone(point)}">${point?.baselineExists ? formatSignedWon(point.delta) : "비교 없음"}</em><span class="flow-sparkline">${summaryPeriodSparkline(flow.points)}</span><span class="flow-status">${statusText[flow.status]}</span><i class="ti ti-chevron-down" aria-hidden="true"></i>
            </button>
            ${isSelected ? `<div class="summary-flow-detail"><p>${flow.hasEnoughHistory ? `최근 3개월 평균이 직전 3개월보다 ${formatWon(Math.abs(flow.flowDelta))} ${flow.flowDelta > 0 ? "높습니다" : flow.flowDelta < 0 ? "낮습니다" : "같습니다"}.` : "흐름 판단에는 6개월 이상의 기록이 필요합니다."}</p><button type="button" data-period-detail="${escapeHtml(`${point?.month || model.selectedMonth}|${flow.sector}`)}">월별 상세 보기 <i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>` : ""}
          </article>`;
        }).join("")}
      </div>
      <p class="summary-flow-note">안정은 최근 3개월 평균 변화가 1만원 또는 직전 평균의 10% 이내인 경우입니다.</p>
    </section>
  `;
}

function attachSummaryPeriodHandlers(model) {
  els.summaryPeriodPanel.querySelectorAll("[data-period-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.periodMode === "flow" ? "flow" : "heatmap";
      if (mode === selectedSummaryPeriodMode) return;
      selectedSummaryPeriodMode = mode;
      renderSummary();
    });
  });
  els.summaryPeriodPanel.querySelectorAll("[data-period-cell]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSummaryPeriodCell = button.dataset.periodCell;
      renderSummary();
    });
  });
  els.summaryPeriodPanel.querySelectorAll("[data-period-flow-sector]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSummarySector = button.dataset.periodFlowSector;
      selectedSummaryPeriodCell = `${model.selectedMonth}|${selectedSummarySector}`;
      renderSummary();
    });
  });
  els.summaryPeriodPanel.querySelectorAll("[data-period-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      const [month, sector] = String(button.dataset.periodDetail || "").split("|");
      openDetailView(summaryDetailOptions({ month, sector }));
    });
  });
}
