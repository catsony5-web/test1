function summaryComparisonRowDay(item) {
  const date = normalizeInputDate(item?.approvalDate || item?.date || "");
  if (!date) return 0;
  return Number(date.slice(8, 10)) || 0;
}

function summaryRowsForComparisonMonth(rows, month, cutoffDay = 0) {
  return rows.filter((item) => {
    if (item.month !== month) return false;
    if (!cutoffDay) return true;
    const day = summaryComparisonRowDay(item);
    return !day || day <= cutoffDay;
  });
}

function formatSummaryComparisonChange(currentAmount, comparisonAmount) {
  const current = Number(currentAmount || 0);
  const comparison = Number(comparisonAmount || 0);
  const delta = current - comparison;
  let rateLabel = "0%";
  if (!comparison && current > 0) rateLabel = "신규";
  else if (comparison > 0 && !current) rateLabel = "-100%";
  else if (comparison > 0) {
    const rate = Math.round(delta / comparison * 100);
    rateLabel = `${rate > 0 ? "+" : ""}${rate.toLocaleString("ko-KR")}%`;
  }
  return {
    currentAmount: current,
    comparisonAmount: comparison,
    delta,
    rateLabel,
    tone: delta > 0 ? "up" : delta < 0 ? "down" : "neutral"
  };
}

function buildSummaryComparisonGroups(currentRows, comparisonRows, keyGetter) {
  const currentGroups = groupBy(currentRows, keyGetter);
  const comparisonGroups = groupBy(comparisonRows, keyGetter);
  const keys = [...new Set([...currentGroups.keys(), ...comparisonGroups.keys()])]
    .map((key) => String(key || "").trim())
    .filter(Boolean);

  return keys.map((key) => {
    const currentItems = currentGroups.get(key) || [];
    const comparisonItems = comparisonGroups.get(key) || [];
    return {
      key,
      label: key,
      currentCount: currentItems.length,
      comparisonCount: comparisonItems.length,
      ...formatSummaryComparisonChange(sumActual(currentItems), sumActual(comparisonItems))
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function comparisonSubcategoryLabel(item) {
  return typeof summaryDisplaySubcategory === "function"
    ? summaryDisplaySubcategory(item)
    : item?.subcategory || "미분류";
}

function comparisonMerchantLabel(item) {
  return String(item?.merchant || item?.description || item?.sourceLabel || "가맹점 정보 없음").trim();
}

function comparisonBreakdownForSector(model, sector) {
  const currentRows = model.currentRows.filter((item) => item.sector === sector);
  const comparisonRows = model.comparisonRows.filter((item) => item.sector === sector);
  return {
    sector,
    comparisonExists: model.comparisonExists,
    currentRows,
    comparisonRows,
    ...formatSummaryComparisonChange(sumActual(currentRows), sumActual(comparisonRows)),
    subcategories: buildSummaryComparisonGroups(currentRows, comparisonRows, comparisonSubcategoryLabel),
    merchants: buildSummaryComparisonGroups(currentRows, comparisonRows, comparisonMerchantLabel)
  };
}

function buildSummaryComparison(activeRows, selectedMonth, selectedSector, options = {}) {
  const mode = options.mode === "custom" ? "custom" : "previous";
  const comparisonMonth = options.comparisonMonth || previousMonthKey(selectedMonth);
  const cutoffDay = selectedMonth === currentMonthKey() ? new Date().getDate() : 0;
  const currentRows = summaryRowsForComparisonMonth(activeRows, selectedMonth, cutoffDay);
  const comparisonRows = summaryRowsForComparisonMonth(activeRows, comparisonMonth, cutoffDay);
  const sectorNames = [...new Set(activeRows.map((item) => item.sector).filter(Boolean))];
  const sectorDeltas = sectorNames.map((sector) => {
    const currentSectorRows = currentRows.filter((item) => item.sector === sector);
    const comparisonSectorRows = comparisonRows.filter((item) => item.sector === sector);
    return {
      sector,
      currentCount: currentSectorRows.length,
      comparisonCount: comparisonSectorRows.length,
      ...formatSummaryComparisonChange(sumActual(currentSectorRows), sumActual(comparisonSectorRows))
    };
  });
  const model = {
    mode,
    selectedMonth,
    selectedSector,
    comparisonMonth,
    comparisonLabel: mode === "custom" ? "비교월" : "전월",
    cutoffDay,
    currentRows,
    comparisonRows,
    currentExists: activeRows.some((item) => item.month === selectedMonth),
    comparisonExists: activeRows.some((item) => item.month === comparisonMonth),
    sectorDeltas,
    totalChange: formatSummaryComparisonChange(sumActual(currentRows), sumActual(comparisonRows))
  };
  model.selectedSectorChange = comparisonBreakdownForSector(model, selectedSector);
  return model;
}

function summaryComparisonSectorChange(model, sector) {
  return model.sectorDeltas.find((item) => item.sector === sector)
    || { sector, currentCount: 0, comparisonCount: 0, ...formatSummaryComparisonChange(0, 0) };
}

function summaryComparisonDriverItems(items) {
  const changed = items.filter((item) => item.delta !== 0);
  const increases = changed.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 2);
  const decreases = changed.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);
  return [...increases, ...decreases];
}

function renderSummaryComparisonDriverGroup(title, kind, items) {
  const drivers = summaryComparisonDriverItems(items);
  return `
    <section class="comparison-driver-group">
      <div class="comparison-driver-group-head">
        <h5>${escapeHtml(title)}</h5>
        <span>${drivers.length.toLocaleString("ko-KR")}개 요인</span>
      </div>
      <div class="comparison-driver-list">
        ${drivers.length ? drivers.map((item) => `
          <button type="button" class="comparison-driver-row ${item.tone}" data-comparison-driver data-comparison-kind="${escapeHtml(kind)}" data-comparison-key="${escapeHtml(item.key)}">
            <span class="comparison-driver-name" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
            <span class="comparison-driver-values"><b>${formatSignedWon(item.delta)}</b><small>${escapeHtml(item.rateLabel)}</small></span>
            <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        `).join("") : `<p class="comparison-driver-empty">금액 변화가 없습니다.</p>`}
      </div>
    </section>
  `;
}

function renderSummaryComparisonDriverPanel(model, options = {}) {
  const change = model.selectedSectorChange;
  const headingId = `${options.idPrefix || "summary"}ComparisonDriverTitle`;
  const baselineText = `${model.comparisonMonth || "-"} ${model.comparisonLabel}`;
  if (!model.selectedMonth || !model.selectedSector) return "";

  return `
    <section class="summary-comparison-drivers" aria-labelledby="${headingId}">
      <div class="comparison-driver-head">
        <div>
          <span>증감 요인 분석</span>
          <h4 id="${headingId}">${escapeHtml(model.selectedSector)} · ${escapeHtml(baselineText)} 대비</h4>
        </div>
        <div class="comparison-driver-total ${change.tone}">
          <span>${escapeHtml(model.selectedMonth)}</span>
          <strong>${model.comparisonExists ? formatSignedWon(change.delta) : "-"}</strong>
          <small>${model.comparisonExists ? escapeHtml(change.rateLabel) : "비교 없음"}</small>
        </div>
      </div>
      ${model.comparisonExists ? `
        <div class="comparison-driver-grid">
          ${renderSummaryComparisonDriverGroup("세부항목 변화", "subcategory", change.subcategories)}
          ${renderSummaryComparisonDriverGroup("가맹점 변화", "merchant", change.merchants)}
        </div>
      ` : `<div class="comparison-baseline-empty"><strong>${escapeHtml(model.comparisonMonth || "비교 월")}</strong>에 비교 가능한 지출 기록이 없습니다.</div>`}
    </section>
  `;
}

function attachSummaryComparisonDriverHandlers(root, model) {
  root?.querySelectorAll("[data-comparison-driver]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.comparisonKind;
      const key = button.dataset.comparisonKey || "";
      openDetailView(summaryDetailOptions({
        month: model.selectedMonth,
        sector: model.selectedSector,
        ...(kind === "subcategory" ? { subcategory: key } : { query: key === "가맹점 정보 없음" ? "" : key })
      }));
    });
  });
}
