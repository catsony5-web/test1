function buildSummaryPriorityModel(matrixRows, sectorNames, selectedMonth, selectedSector, comparison) {
  const row = matrixRows.find((item) => item.month === selectedMonth);
  const total = row?.total || 0;
  const basePoints = (sectorNames || []).map((sector) => {
    const change = summaryComparisonSectorChange(comparison, sector);
    const amount = row?.amounts?.[sector] || 0;
    const share = total ? amount / total : 0;
    const rate = change.comparisonAmount > 0
      ? change.delta / change.comparisonAmount
      : amount > 0 ? null : 0;
    return {
      sector,
      amount,
      share,
      comparisonAmount: change.comparisonAmount,
      delta: change.delta,
      rate,
      rateLabel: change.rateLabel,
      tone: change.tone,
      isSelected: sector === selectedSector
    };
  }).filter((item) => item.amount > 0 || item.comparisonAmount > 0);

  const maxAmount = Math.max(...basePoints.map((item) => item.amount), 1);
  const maxShare = Math.max(...basePoints.map((item) => item.share), 0.01);
  const finiteRates = basePoints.map((item) => item.rate).filter(Number.isFinite);
  const maxRate = Math.max(...finiteRates.map((value) => Math.abs(value)), 0.25);
  const points = basePoints.map((item) => ({
    ...item,
    radius: 25 + Math.sqrt(item.amount / maxAmount) * 28,
    targetX: 80 + item.share / maxShare * 590,
    targetY: item.rate === null
      ? 62
      : 210 - Math.max(-1, Math.min(1, item.rate / maxRate)) * 120
  }));
  layoutSummaryPriorityPoints(points);

  const selected = points.find((item) => item.sector === selectedSector)
    || [...points].sort((a, b) => b.amount - a.amount)[0]
    || null;
  const increases = points.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta);
  const totalIncrease = points.filter((item) => item.delta > 0).reduce((sum, item) => sum + item.delta, 0);
  const leadNames = increases.slice(0, 2).map((item) => item.sector);
  const leadIncrease = increases.slice(0, 2).reduce((sum, item) => sum + item.delta, 0);
  const headline = !comparison.comparisonExists
    ? `${comparison.comparisonMonth || "비교 월"} 기록이 없어 현재 지출 비중만 표시합니다.`
    : leadNames.length
      ? `${leadNames.join(" · ")} 섹터가 증가분의 ${Math.round(totalIncrease ? leadIncrease / totalIncrease * 100 : 0)}%를 차지합니다.`
    : "비교 기간보다 증가한 섹터가 없습니다.";
  return { month: selectedMonth, total, points, selected, headline };
}

function layoutSummaryPriorityPoints(points) {
  points.forEach((point) => {
    point.x = point.targetX;
    point.y = point.targetY;
  });
  for (let pass = 0; pass < 60; pass += 1) {
    for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
        const left = points[leftIndex];
        const right = points[rightIndex];
        const dx = right.x - left.x || 1;
        const dy = right.y - left.y || 1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minimum = left.radius + right.radius + 9;
        if (distance >= minimum) continue;
        const force = (minimum - distance) / 2;
        const unitX = dx / distance;
        const unitY = dy / distance;
        left.x -= unitX * force;
        left.y -= unitY * force;
        right.x += unitX * force;
        right.y += unitY * force;
      }
    }
    points.forEach((point) => {
      point.x += (point.targetX - point.x) * 0.035;
      point.y += (point.targetY - point.y) * 0.035;
      point.x = Math.max(point.radius + 12, Math.min(748 - point.radius, point.x));
      point.y = Math.max(point.radius + 12, Math.min(380 - point.radius, point.y));
    });
  }
}

function summaryPriorityPointLabel(item) {
  const direction = item.delta > 0 ? "증가" : item.delta < 0 ? "감소" : "변화 없음";
  return `${item.sector}, 현재 ${formatWon(item.amount)}, 총지출 비중 ${Math.round(item.share * 100)}%, ${direction} ${formatWon(Math.abs(item.delta))}`;
}

function summaryPriorityBubbleName(sector) {
  return { "고정 주거비": "주거비", "기타 소비": "기타" }[sector] || sector;
}

function renderSummaryPriority(matrixRows, sectorNames, selectedMonth, selectedSector, comparison) {
  if (!els.summarySectorSharePanel) return;
  const model = buildSummaryPriorityModel(matrixRows, sectorNames, selectedMonth, selectedSector, comparison);
  if (!model.points.length || !model.total) {
    els.summarySectorSharePanel.innerHTML = `<div class="empty compact-empty">선택 월의 소비 우선순위를 계산할 지출 기록이 없습니다.</div>`;
    return;
  }
  const selected = model.selected;
  const breakdown = comparisonBreakdownForSector(comparison, selected.sector);
  const drivers = summaryComparisonDriverItems(breakdown.subcategories).slice(0, 2);
  const comparisonName = comparison.comparisonLabel || "비교 기간";
  els.summarySectorSharePanel.innerHTML = `
    <div class="summary-priority-headline">
      <span class="summary-insight-icon"><i class="ti ti-chart-line" aria-hidden="true"></i></span>
      <strong>${escapeHtml(model.headline)}</strong>
    </div>
    <div class="summary-priority-layout">
      <section class="summary-priority-chart" aria-labelledby="summaryPriorityChartTitle">
        <h4 id="summaryPriorityChartTitle" class="sr-only">섹터별 지출 비중과 비교 기간 대비 변화</h4>
        <svg viewBox="0 0 760 470" role="img" aria-label="가로축은 총 지출 비중, 세로축은 비교 기간 대비 증감인 소비 우선순위 차트">
          <rect class="priority-quadrant priority-quadrant-watch" x="380" y="0" width="380" height="220"></rect>
          <rect class="priority-quadrant priority-quadrant-small-rise" x="0" y="0" width="380" height="220"></rect>
          <rect class="priority-quadrant priority-quadrant-stable" x="380" y="220" width="380" height="220"></rect>
          <rect class="priority-quadrant priority-quadrant-down" x="0" y="220" width="380" height="220"></rect>
          <line class="priority-axis" x1="380" y1="18" x2="380" y2="440"></line>
          <line class="priority-axis" x1="18" y1="220" x2="742" y2="220"></line>
          <text class="priority-quadrant-label watch" x="718" y="32" text-anchor="end">우선 확인</text>
          <text class="priority-quadrant-label small-rise" x="28" y="32">작지만 급증</text>
          <text class="priority-quadrant-label stable" x="718" y="414" text-anchor="end">금액은 크지만 안정</text>
          <text class="priority-quadrant-label down" x="28" y="414">감소 유지</text>
          ${model.points.map((item) => `
            <g class="summary-priority-bubble ${categoryClass(item.sector)} ${item.isSelected ? "selected" : ""}" data-priority-sector="${escapeHtml(item.sector)}" transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)})" role="button" tabindex="0" aria-label="${escapeHtml(summaryPriorityPointLabel(item))}">
              <circle r="${item.radius.toFixed(1)}"></circle>
              <text class="priority-bubble-name" y="-2" text-anchor="middle">${escapeHtml(summaryPriorityBubbleName(item.sector))}</text>
              <text class="priority-bubble-delta" y="16" text-anchor="middle">${escapeHtml(item.comparisonAmount ? item.rateLabel : "신규")}</text>
            </g>
          `).join("")}
          <text class="priority-axis-caption x" x="380" y="466" text-anchor="middle">총 지출 비중 · 낮음 → 높음</text>
          <text class="priority-axis-caption y" x="-220" y="14" transform="rotate(-90)" text-anchor="middle">${escapeHtml(comparisonName)} 대비 변화 · 감소 → 증가</text>
        </svg>
        <p class="summary-priority-legend"><span></span>버블 크기 = 현재 금액 · 위치 = 지출 비중과 증감률</p>
      </section>
      <aside class="summary-priority-inspector" aria-live="polite">
        <span>선택 섹터 상세</span>
        <h4>${categoryChip(selected.sector)}<strong>${escapeHtml(selected.sector)}</strong></h4>
        <dl>
          <div><dt>현재 금액</dt><dd>${formatWon(selected.amount)}</dd></div>
          <div><dt>총 지출 비중</dt><dd>${formatPercent(selected.amount, model.total)}</dd></div>
          <div><dt>${escapeHtml(comparisonName)} 대비</dt><dd class="${selected.tone}">${comparison.comparisonExists ? formatSignedWon(selected.delta) : "비교 없음"}</dd></div>
          <div><dt>변화율</dt><dd class="${selected.tone}">${comparison.comparisonExists ? escapeHtml(selected.rateLabel) : "-"}</dd></div>
        </dl>
        <section class="summary-priority-drivers">
          <h5>주요 변화 원인</h5>
          ${comparison.comparisonExists && drivers.length ? drivers.map((item, index) => `
            <button type="button" data-priority-driver="${escapeHtml(item.key)}">
              <span>${index + 1}</span><b>${escapeHtml(item.label)}</b><em class="${item.tone}">${formatSignedWon(item.delta)}</em>
            </button>
          `).join("") : `<p>비교 가능한 변화 원인이 없습니다.</p>`}
        </section>
        <button type="button" class="summary-priority-open-trend" data-priority-open-trend>변화 원인 자세히 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </aside>
    </div>
  `;
  attachSummaryPriorityHandlers(model, breakdown, comparison);
}

function attachSummaryPriorityHandlers(model, breakdown, comparison) {
  const selectBubble = (node) => {
    selectedSummarySector = node.dataset.prioritySector;
    renderSummary();
  };
  els.summarySectorSharePanel.querySelectorAll("[data-priority-sector]").forEach((node) => {
    node.addEventListener("click", () => selectBubble(node));
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectBubble(node);
    });
  });
  els.summarySectorSharePanel.querySelectorAll("[data-priority-driver]").forEach((button) => {
    button.addEventListener("click", () => {
      openDetailView(summaryDetailOptions({
        month: comparison.selectedMonth,
        sector: breakdown.sector,
        subcategory: button.dataset.priorityDriver
      }));
    });
  });
  els.summarySectorSharePanel.querySelector("[data-priority-open-trend]")?.addEventListener("click", () => {
    selectedSummarySector = model.selected.sector;
    selectSummarySubtab("trend");
    renderSummary();
  });
}
