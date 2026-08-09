const SUMMARY_PATTERN_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const SUMMARY_PATTERN_PERIODS = [
  { key: "morning", label: "아침", hint: "06–10시", includes: (hour) => hour >= 6 && hour <= 10 },
  { key: "day", label: "낮", hint: "11–16시", includes: (hour) => hour >= 11 && hour <= 16 },
  { key: "evening", label: "저녁", hint: "17–20시", includes: (hour) => hour >= 17 && hour <= 20 },
  { key: "night", label: "야간", hint: "21–05시", includes: (hour) => hour >= 21 || hour <= 5 }
];
const SUMMARY_PATTERN_BANDS = [
  { label: "~5천원", min: 0, max: 5000 },
  { label: "5천원–1만원", min: 5000, max: 10000 },
  { label: "1만원–3만원", min: 10000, max: 30000 },
  { label: "3만원–5만원", min: 30000, max: 50000 },
  { label: "5만원–10만원", min: 50000, max: 100000 },
  { label: "10만원 이상", min: 100000, max: Infinity }
];

function summaryPatternTimeParts(value) {
  const match = String(value || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function summaryPatternTimedRows(rows) {
  return rows.flatMap((item) => {
    if (item.isInstallmentOccurrence && Number(item.currentInstallmentIndex || item.installmentIndex || 0) > 1) return [];
    const time = summaryPatternTimeParts(item.approvalTime);
    return time ? [{ item, time }] : [];
  });
}

function summaryPatternIsSyntheticInstallment(item) {
  return Boolean(item?.isInstallmentOccurrence && Number(item.currentInstallmentIndex || item.installmentIndex || 0) > 1);
}

function summaryPatternDateDayIndex(item) {
  const date = normalizeInputDate(item?.approvalDate || item?.date || "");
  if (!date) return -1;
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? 6 : day - 1;
}

function summaryPatternMerchantGroups(rows) {
  const groups = groupBy(rows, (item) => comparisonMerchantLabel(item));
  return [...groups.entries()].map(([merchant, items]) => ({
    merchant,
    count: items.length,
    amount: sumConsumption(items)
  })).filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || b.amount - a.amount);
}

function buildSummaryPatternSide(rows) {
  const timedRows = summaryPatternTimedRows(rows);
  const datedRows = rows.filter((item) => !summaryPatternIsSyntheticInstallment(item))
    .map((item) => ({ item, dayIndex: summaryPatternDateDayIndex(item) }))
    .filter((entry) => entry.dayIndex >= 0);
  const cells = SUMMARY_PATTERN_PERIODS.map((period) => SUMMARY_PATTERN_DAYS.map((day, dayIndex) => ({
    period: period.key,
    periodLabel: period.label,
    day,
    dayIndex,
    count: timedRows.filter((entry) => period.includes(entry.time.hour) && summaryPatternDateDayIndex(entry.item) === dayIndex).length
  }))).flat();
  const bands = SUMMARY_PATTERN_BANDS.map((band) => ({
    ...band,
    count: rows.filter((item) => {
      const amount = consumptionAmount(item);
      return amount >= band.min && amount < band.max;
    }).length
  }));
  const repeatMerchants = summaryPatternMerchantGroups(rows);
  const totalAmount = sumConsumption(rows);
  const weekendRows = datedRows.filter((entry) => entry.dayIndex >= 5);
  return {
    rows,
    totalCount: rows.length,
    totalAmount,
    timedRows,
    timedCount: timedRows.length,
    datedCount: datedRows.length,
    averageAmount: rows.length ? Math.round(totalAmount / rows.length) : 0,
    weekendShare: datedRows.length ? weekendRows.length / datedRows.length : 0,
    repeatMerchants,
    cells,
    bands
  };
}

function buildSummaryPatternModel(comparison, selectedSector) {
  const currentRows = comparison.currentRows.filter((item) => item.sector === selectedSector);
  const comparisonRows = comparison.comparisonRows.filter((item) => item.sector === selectedSector);
  const current = buildSummaryPatternSide(currentRows);
  const baseline = buildSummaryPatternSide(comparisonRows);
  const peak = [...current.cells].sort((a, b) => b.count - a.count)[0] || null;
  const smallCount = current.bands.slice(0, 2).reduce((sum, item) => sum + item.count, 0);
  return {
    sector: selectedSector,
    current,
    baseline,
    peak,
    smallCount,
    comparisonExists: comparison.comparisonExists,
    comparisonLabel: comparison.comparisonLabel,
    selectedMonth: comparison.selectedMonth,
    comparisonMonth: comparison.comparisonMonth
  };
}

function summaryPatternSignedCount(value, suffix = "건") {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toLocaleString("ko-KR")}${suffix}`;
}

function renderSummaryPattern(comparison, selectedSector) {
  if (!els.summaryPatternPanel) return;
  const model = buildSummaryPatternModel(comparison, selectedSector);
  const { current, baseline } = model;
  if (!selectedSector || !current.totalCount) {
    els.summaryPatternPanel.innerHTML = `<div class="empty compact-empty">선택 월의 ${escapeHtml(selectedSector || "섹터")} 소비 패턴을 분석할 거래가 없습니다.</div>`;
    return;
  }
  const countDelta = current.totalCount - baseline.totalCount;
  const averageDelta = current.averageAmount - baseline.averageAmount;
  const weekendDelta = Math.round((current.weekendShare - baseline.weekendShare) * 100);
  const repeatDelta = current.repeatMerchants.length - baseline.repeatMerchants.length;
  const maxCellCount = Math.max(...current.cells.map((item) => item.count), 1);
  const maxBandCount = Math.max(...current.bands.flatMap((item, index) => [item.count, baseline.bands[index]?.count || 0]), 1);
  const peakText = model.peak?.count
    ? `${model.peak.day}요일 ${model.peak.periodLabel} 거래가 가장 많았습니다.`
    : "시간이 기록된 거래가 없어 시간대 집중도를 계산하지 못했습니다.";
  const repeatText = current.repeatMerchants[0]
    ? `${current.repeatMerchants[0].merchant}을 ${current.repeatMerchants[0].count}회 이용했습니다.`
    : "2회 이상 반복한 가맹점이 없습니다.";
  const smallText = `${formatWon(10000)} 미만 결제가 ${model.smallCount.toLocaleString("ko-KR")}건입니다.`;
  els.summaryPatternPanel.innerHTML = `
    <div class="summary-pattern-conclusion">
      <strong>금액뿐 아니라 결제 빈도와 이용 방식의 변화를 함께 확인하세요.</strong>
      <span>시간 분석 가능 ${current.timedCount.toLocaleString("ko-KR")}건 / 전체 ${current.totalCount.toLocaleString("ko-KR")}건</span>
    </div>
    <div class="summary-pattern-kpis">
      ${renderSummaryPatternKpi("ti-receipt", "거래", `${current.totalCount.toLocaleString("ko-KR")}건`, countDelta, summaryPatternSignedCount(countDelta), model.comparisonExists)}
      ${renderSummaryPatternKpi("ti-wallet", "평균 결제", formatWon(current.averageAmount), averageDelta, formatSignedWon(averageDelta), model.comparisonExists)}
      ${renderSummaryPatternKpi("ti-calendar-month", "주말 비중", `${Math.round(current.weekendShare * 100)}%`, weekendDelta, summaryPatternSignedCount(weekendDelta, "%p"), model.comparisonExists)}
      ${renderSummaryPatternKpi("ti-repeat", "반복 가맹점", `${current.repeatMerchants.length.toLocaleString("ko-KR")}곳`, repeatDelta, summaryPatternSignedCount(repeatDelta, "곳"), model.comparisonExists)}
    </div>
    <div class="summary-pattern-top-grid">
      <section class="summary-pattern-heatmap" aria-labelledby="summaryPatternHeatmapTitle">
        <div class="summary-card-heading">
          <h4 id="summaryPatternHeatmapTitle">요일·시간대별 거래 분포</h4>
          <span>${escapeHtml(selectedSector)} · 시간 기록 기준</span>
        </div>
        ${current.timedCount ? `
          <div class="pattern-heatmap-grid" role="grid" aria-label="${escapeHtml(selectedSector)} 요일 및 시간대별 거래 건수">
            <span></span>${SUMMARY_PATTERN_DAYS.map((day) => `<b role="columnheader">${day}</b>`).join("")}
            ${SUMMARY_PATTERN_PERIODS.map((period) => `
              <span class="pattern-period-label" role="rowheader"><b>${period.label}</b><small>${period.hint}</small></span>
              ${SUMMARY_PATTERN_DAYS.map((day, dayIndex) => {
                const cell = current.cells.find((item) => item.period === period.key && item.dayIndex === dayIndex);
                const level = Math.ceil((cell?.count || 0) / maxCellCount * 5);
                return `<span class="pattern-heat-cell level-${level}" role="gridcell" tabindex="0" aria-label="${day}요일 ${period.label} ${cell?.count || 0}건"><i>${cell?.count || 0}</i></span>`;
              }).join("")}
            `).join("")}
          </div>
          <div class="pattern-heat-legend"><span>적음</span><i></i><i></i><i></i><i></i><i></i><span>많음</span></div>
        ` : `<div class="summary-pattern-time-empty"><i class="ti ti-history" aria-hidden="true"></i><strong>시간대 분석 자료가 없습니다.</strong><p>시간 없는 이체·고정지출은 아래 금액대와 가맹점 분석에는 포함했습니다.</p></div>`}
      </section>
      <section class="summary-pattern-findings" aria-labelledby="summaryPatternFindingsTitle">
        <div class="summary-card-heading"><h4 id="summaryPatternFindingsTitle">패턴 변화</h4><span>${escapeHtml(model.comparisonMonth)} ${escapeHtml(model.comparisonLabel)} 기준</span></div>
        ${[peakText, repeatText, smallText].map((text, index) => `<article><span>${index + 1}</span><p>${escapeHtml(text)}</p></article>`).join("")}
      </section>
    </div>
    <div class="summary-pattern-bottom-grid">
      <section class="summary-pattern-bands" aria-labelledby="summaryPatternBandsTitle">
        <div class="summary-card-heading"><h4 id="summaryPatternBandsTitle">결제 금액대 분포</h4><span><i class="current"></i>${escapeHtml(model.selectedMonth)} <i class="baseline"></i>${escapeHtml(model.comparisonMonth)}</span></div>
        ${current.bands.map((band, index) => `
          <div class="pattern-band-row"><span>${escapeHtml(band.label)}</span><div><i class="current" style="width:${Math.round(band.count / maxBandCount * 100)}%"></i><i class="baseline" style="width:${Math.round((baseline.bands[index]?.count || 0) / maxBandCount * 100)}%"></i></div><b>${band.count.toLocaleString("ko-KR")}건</b></div>
        `).join("")}
      </section>
      <section class="summary-pattern-merchants" aria-labelledby="summaryPatternMerchantsTitle">
        <div class="summary-card-heading"><h4 id="summaryPatternMerchantsTitle">반복 가맹점</h4><span>2회 이상 이용</span></div>
        ${current.repeatMerchants.length ? `<ol>${current.repeatMerchants.slice(0, 5).map((item) => `<li><button type="button" data-pattern-merchant="${escapeHtml(item.merchant)}"><span>${escapeHtml(item.merchant)}</span><b>${item.count.toLocaleString("ko-KR")}회</b><em>${formatWon(item.amount)}</em><i class="ti ti-chevron-right" aria-hidden="true"></i></button></li>`).join("")}</ol>` : `<p class="summary-pattern-no-merchants">반복 이용한 가맹점이 없습니다.</p>`}
      </section>
    </div>
    <button type="button" class="summary-pattern-open-detail" data-pattern-open-detail>관련 거래 보기 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
  `;
  attachSummaryPatternHandlers(model);
}

function renderSummaryPatternKpi(icon, label, value, delta, deltaText, comparisonExists) {
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  return `<article><i class="ti ${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><em class="${tone}">${comparisonExists ? escapeHtml(deltaText) : "비교 없음"}</em></article>`;
}

function attachSummaryPatternHandlers(model) {
  els.summaryPatternPanel.querySelectorAll("[data-pattern-merchant]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(summaryDetailOptions({
      month: model.selectedMonth,
      sector: model.sector,
      query: button.dataset.patternMerchant
    })));
  });
  els.summaryPatternPanel.querySelector("[data-pattern-open-detail]")?.addEventListener("click", () => {
    openDetailView(summaryDetailOptions({ month: model.selectedMonth, sector: model.sector }));
  });
}
