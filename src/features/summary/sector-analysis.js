function renderSectorAnalysis(activeRows, month, sector, comparison) {
  const body = els.sectorAnalysisBody || els.foodAnalysisCard;
  els.sectorAnalysisTitle.textContent = sector ? `${sector} 리포트` : "각 섹터 리포트";
  els.sectorAnalysisDescription.textContent = month && sector
    ? `${month} 기준으로 ${sector}의 금액, 주요 지표, 세부항목별 소비를 분석합니다.`
    : "선택한 월과 섹터의 소비 패턴을 자세히 분석합니다.";
  if (!month) {
    body.innerHTML = `<div class="empty">각 섹터 리포트를 보려면 먼저 지출 내역을 추가하세요.</div>`;
    return;
  }
  if (!sector) {
    body.innerHTML = `<div class="empty">분석할 섹터를 선택하세요.</div>`;
    return;
  }
  body.innerHTML = sector === "식비"
    ? renderFoodAnalysisBody(activeRows, month, comparison)
    : renderGenericSectorAnalysisBody(activeRows, month, sector, comparison);
  attachSectorAnalysisHandlers(month);
  attachSummaryComparisonDriverHandlers(body, comparison);
}

function renderFoodAnalysisBody(activeRows, month, comparison) {
  const foodRows = activeRows.filter((item) => item.month === month && item.sector === "식비");
  const amountBySubcategory = Object.fromEntries(categories["식비"].map((subcategory) => [subcategory, 0]));
  foodRows.forEach((item) => {
    amountBySubcategory[item.subcategory] = (amountBySubcategory[item.subcategory] || 0) + consumptionAmount(item);
  });

  const total = sumConsumption(foodRows);
  const outside = sumValues(amountBySubcategory, ["외식-혼자", "외식-친구", "외식-단체", "배달-혼자", "배달-친구", "배달-단체"]);
  const grocery = sumValues(amountBySubcategory, ["장보기/마트"]);
  const solo = sumValues(amountBySubcategory, ["외식-혼자", "배달-혼자"]);
  const social = sumValues(amountBySubcategory, ["외식-친구", "외식-단체", "배달-친구", "배달-단체"]);
  const snackCafe = sumValues(amountBySubcategory, ["편의점/간식", "카페/음료"]);
  const detailItems = Object.entries(amountBySubcategory)
    .map(([subcategory, amount]) => ({ subcategory, amount, count: foodRows.filter((item) => item.subcategory === subcategory).length }))
    .filter((item) => item.amount > 0 || item.count > 0)
    .sort((a, b) => b.amount - a.amount);
  const topDetail = detailItems[0] || { subcategory: "-", amount: 0, count: 0 };
  const maxDetailAmount = Math.max(...detailItems.map((item) => item.amount), 1);

  return `
    ${total ? `
      ${renderSectorAnalysisOverview("식비", total, foodRows.length, topDetail, month)}
      ${renderSummaryComparisonDriverPanel(comparison, { idPrefix: "report" })}
      <section class="sector-analysis-block context">
        <div class="analysis-block-head">
          <h4>식비 소비 맥락</h4>
          <p>각 행은 서로 다른 기준이므로 합산하지 않고 따로 비교합니다.</p>
        </div>
        <div class="food-context-grid">
          ${renderFoodContextGroup("소비 방식", "밖에서 먹기", outside, "장보기", grocery, total, "outside", "grocery")}
          ${renderFoodContextGroup("동행 여부", "혼자", solo, "사람과 함께", social, total, "solo", "social")}
          ${renderFoodContextIndicator("간식·카페", "편의점과 카페 소비", snackCafe, total, "snack")}
        </div>
      </section>
      <section class="sector-analysis-block detail">
        <div class="analysis-block-head">
          <h4>세부항목 TOP</h4>
          <p>금액이 큰 세부항목부터 정렬했습니다.</p>
        </div>
        <div class="sector-analysis-bars">
          ${detailItems.map((item) => renderSectorAnalysisBar("식비", item, total, maxDetailAmount)).join("")}
        </div>
      </section>
    ` : `${renderSummaryComparisonDriverPanel(comparison, { idPrefix: "report" })}<div class="empty compact-empty">선택한 월의 식비 기록이 없습니다.</div>`}
  `;
}

function renderGenericSectorAnalysisBody(activeRows, month, sector, comparison) {
  const rows = activeRows.filter((item) => item.month === month && item.sector === sector);
  const total = sumConsumption(rows);
  if (!total) {
    return `${renderSummaryComparisonDriverPanel(comparison, { idPrefix: "report" })}<div class="empty compact-empty">선택한 월의 ${escapeHtml(sector)} 데이터가 없습니다.</div>`;
  }
  const details = [...groupBy(rows, (item) => item.subcategory || "미분류").entries()]
    .map(([subcategory, subRows]) => ({ subcategory, amount: sumConsumption(subRows), count: subRows.length }))
    .sort((a, b) => b.amount - a.amount);
  const maxDetailAmount = Math.max(...details.map((item) => item.amount), 1);
  return `
    ${renderSectorAnalysisOverview(sector, total, rows.length, details[0] || { subcategory: "-", amount: 0, count: 0 }, month)}
    ${renderSummaryComparisonDriverPanel(comparison, { idPrefix: "report" })}
    <section class="sector-analysis-block">
      <div class="analysis-block-head">
        <h4>주요 세부항목</h4>
        <p>상위 세부항목 6개를 요약합니다.</p>
      </div>
      <div class="sector-analysis-grid">
        ${details.slice(0, 6).map((item) => renderSectorAnalysisMetric(sector, item, total, maxDetailAmount)).join("")}
      </div>
    </section>
    <section class="sector-analysis-block detail">
      <div class="analysis-block-head">
        <h4>세부항목 TOP</h4>
        <p>금액이 큰 세부항목부터 정렬했습니다.</p>
      </div>
      <div class="sector-analysis-bars">
        ${details.map((item) => renderSectorAnalysisBar(sector, item, total, maxDetailAmount)).join("")}
      </div>
    </section>
  `;
}

function renderSectorAnalysisOverview(sector, total, count, topDetail, month) {
  const monthRows = reportingExpenseRows(classified, { months: [month] });
  const monthTotal = sumConsumption(monthRows);
  return `
    <section class="sector-analysis-overview ${categoryClass(sector)}">
      <div>
        ${categoryChip(sector)}
        <h4>${escapeHtml(month)} ${escapeHtml(sector)} 리포트</h4>
        <p>선택 월 총지출 대비 ${formatPercent(total, monthTotal)}를 차지합니다.</p>
      </div>
      <dl>
        <div>
          <dt>섹터 지출</dt>
          <dd>${formatWon(total)}</dd>
        </div>
        <div>
          <dt>거래 건수</dt>
          <dd>${count.toLocaleString("ko-KR")}건</dd>
        </div>
        <div>
          <dt>상위 세부항목</dt>
          <dd>${escapeHtml(topDetail.subcategory)} · ${formatWon(topDetail.amount)}</dd>
        </div>
      </dl>
    </section>
  `;
}

function sectorAnalysisIntensity(amount, maxAmount) {
  const ratio = maxAmount ? amount / maxAmount : 0;
  return Math.round(12 + Math.min(1, ratio) * 34);
}

function renderSectorAnalysisMetric(sector, item, total, maxAmount = total) {
  const intensity = sectorAnalysisIntensity(item.amount, maxAmount);
  return `
    <button type="button" class="sector-analysis-metric ${categoryClass(sector)}" style="--analysis-strength: ${intensity}%" data-analysis-sector="${escapeHtml(sector)}" data-analysis-subcategory="${escapeHtml(item.subcategory)}">
      <span title="${escapeHtml(item.subcategory)}">${escapeHtml(item.subcategory)}</span>
      <strong>${formatWon(item.amount)}</strong>
      <small>${formatPercent(item.amount, total)} · ${item.count.toLocaleString("ko-KR")}건</small>
    </button>
  `;
}

function renderSectorAnalysisBar(sector, item, total, maxAmount = total) {
  const width = total ? Math.round(item.amount / total * 100) : 0;
  const intensity = sectorAnalysisIntensity(item.amount, maxAmount);
  return `
    <button type="button" class="sector-analysis-bar-row ${categoryClass(sector)}" style="--analysis-strength: ${intensity}%" data-analysis-sector="${escapeHtml(sector)}" data-analysis-subcategory="${escapeHtml(item.subcategory)}">
      <div class="food-compare-labels">
        <span title="${escapeHtml(item.subcategory)}">${escapeHtml(item.subcategory)} <b>${formatWon(item.amount)}</b></span>
        <span>${width}% · ${item.count.toLocaleString("ko-KR")}건</span>
      </div>
      <div class="sector-ratio-bar">
        <span class="${categoryClass(sector)}" style="width: ${width}%"></span>
      </div>
    </button>
  `;
}

function attachSectorAnalysisHandlers(month) {
  (els.sectorAnalysisBody || els.foodAnalysisCard).querySelectorAll("[data-analysis-sector]").forEach((button) => {
    button.addEventListener("click", () => {
      openDetailView(summaryDetailOptions({
        month,
        sector: button.dataset.analysisSector,
        subcategory: button.dataset.analysisSubcategory === "all" ? "all" : button.dataset.analysisSubcategory
      }));
    });
  });
}

function renderFoodContextGroup(groupLabel, leftLabel, leftAmount, rightLabel, rightAmount, total, leftTone, rightTone) {
  const pairTotal = leftAmount + rightAmount || 1;
  const leftWidth = Math.round(leftAmount / pairTotal * 100);
  const rightWidth = 100 - leftWidth;
  return `
    <section class="food-context-group">
      <span class="food-context-label">${escapeHtml(groupLabel)}</span>
      <div class="food-compare-labels">
        <span>${escapeHtml(leftLabel)} <b>${formatWon(leftAmount)}</b></span>
        <span>${escapeHtml(rightLabel)} <b>${formatWon(rightAmount)}</b></span>
      </div>
      <div class="food-ratio-bar" aria-label="${escapeHtml(leftLabel)}와 ${escapeHtml(rightLabel)} 비교">
        <span class="${escapeHtml(leftTone)}" style="width: ${leftWidth}%"></span>
        <span class="${escapeHtml(rightTone)}" style="width: ${rightWidth}%"></span>
      </div>
      <small>${escapeHtml(leftLabel)} ${total ? Math.round(leftAmount / total * 100) : 0}% · ${escapeHtml(rightLabel)} ${total ? Math.round(rightAmount / total * 100) : 0}%</small>
    </section>
  `;
}

function renderFoodContextIndicator(groupLabel, label, amount, total, tone) {
  const width = total ? Math.round(amount / total * 100) : 0;
  return `
    <section class="food-context-group">
      <span class="food-context-label">${escapeHtml(groupLabel)}</span>
      <div class="food-compare-labels">
        <span>${escapeHtml(label)} <b>${formatWon(amount)}</b></span>
        <span>전체 식비의 ${width}%</span>
      </div>
      <div class="food-ratio-bar single" aria-label="${escapeHtml(label)}">
        <span class="${escapeHtml(tone)}" style="width: ${width}%"></span>
      </div>
    </section>
  `;
}
