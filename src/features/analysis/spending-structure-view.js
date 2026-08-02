let spendingChangesExpanded = false;
let spendingTargetFeedback = "";

function setupSpendingStructureControls() {
  els.spendingStructureMonth?.addEventListener("change", () => {
    spendingChangesExpanded = false;
    setSharedSelectedMonth(els.spendingStructureMonth.value, { syncControls: false });
    renderSpendingStructureAnalysis();
  });
  els.spendingStructurePrevMonth?.addEventListener("click", () => {
    spendingChangesExpanded = false;
    moveAnalysisMonth(els.spendingStructureMonth, -1, renderSpendingStructureAnalysis);
  });
  els.spendingStructureNextMonth?.addEventListener("click", () => {
    spendingChangesExpanded = false;
    moveAnalysisMonth(els.spendingStructureMonth, 1, renderSpendingStructureAnalysis);
  });
  els.spendingTargetOpenButton?.addEventListener("click", openSpendingTargetDialog);
  els.spendingTargetDialogClose?.addEventListener("click", closeSpendingTargetDialog);
  els.spendingTargetCancelButton?.addEventListener("click", closeSpendingTargetDialog);
  els.spendingTargetSuggestionButton?.addEventListener("click", applySpendingTargetSuggestion);
  els.spendingTypeResetButton?.addEventListener("click", resetSpendingTypeControls);
  els.spendingTargetForm?.addEventListener("submit", saveSpendingAnalysisSettings);
  els.spendingTargetDialog?.addEventListener("click", (event) => {
    if (event.target === els.spendingTargetDialog) closeSpendingTargetDialog();
  });
  els.spendingTargetDialog?.addEventListener("close", () => {
    document.body.classList.remove("analysis-dialog-open");
  });
}

function renderSpendingStructureAnalysis() {
  if (!els.spendingStructureMonth || !els.spendingStructureBody) return;
  const month = fillAnalysisMonthSelect(
    els.spendingStructureMonth,
    getSharedSelectedMonth(els.spendingStructureMonth.value || currentMonthKey())
  );
  if (canViewDriveSharedMonth("spendingStructure")) setSharedSelectedMonth(month, { syncControls: false });

  const structure = buildAnalysisStructure(month);
  const targetRows = buildAnalysisTargetRows(month);
  const insights = buildAnalysisChangeInsights(month);
  const visibleCount = spendingChangesExpanded ? insights.length : Math.min(3, insights.length);
  els.spendingStructureBody.innerHTML = [
    renderSpendingStructureSummary(structure, targetRows),
    `<div class="spending-structure-main">
      <section class="analysis-panel analysis-allocation-panel" aria-labelledby="spendingAllocationTitle">
        <div class="analysis-panel-head">
          <div>
            <h3 id="spendingAllocationTitle">수입 ${formatWon(structure.income)} 배분</h3>
            <p>실제 소비를 필수·재량·미분류로 나누고 남은 금액을 자산 형성으로 표시합니다.</p>
          </div>
        </div>
        ${renderSpendingAllocation(structure)}
      </section>
      <section class="analysis-panel analysis-target-panel" aria-labelledby="spendingTargetTitle">
        <div class="analysis-panel-head">
          <div>
            <h3 id="spendingTargetTitle">목표 대비 섹터</h3>
            <p>모든 행은 선택 월 수입을 기준으로 같은 축에서 비교합니다.</p>
          </div>
          <span class="analysis-target-status ${structure.hasTargets ? "is-set" : ""}">
            ${structure.hasTargets ? `목표 합계 ${analysisPercentText(sumValues(structure.targetRatios, ANALYSIS_SPENDING_SECTORS))}` : "목표 미설정"}
          </span>
        </div>
        ${renderSpendingTargetTable(structure, targetRows)}
      </section>
    </div>`,
    `<div class="spending-structure-lower">
      ${renderSpendingConcentration(structure)}
      <section class="analysis-panel analysis-change-panel" aria-labelledby="spendingChangeTitle">
        <div class="analysis-panel-head">
          <div>
            <h3 id="spendingChangeTitle">확인할 변화</h3>
            <p>전년 동월 변화·연속 상승·신규 구독을 설명 가능한 규칙으로 찾았습니다.</p>
          </div>
          <span class="analysis-change-count">${insights.length.toLocaleString("ko-KR")}건</span>
        </div>
        ${renderAnalysisInsightList(insights, "spendingStructure", visibleCount)}
        ${insights.length > 3 ? `
          <button type="button" class="analysis-more-button" data-toggle-spending-changes aria-expanded="${String(spendingChangesExpanded)}">
            ${spendingChangesExpanded ? "접기" : "더 많은 변화 보기"}
            <i class="ti ti-chevron-${spendingChangesExpanded ? "up" : "down"}" aria-hidden="true"></i>
          </button>
        ` : ""}
      </section>
    </div>`,
    `<footer class="analysis-data-quality analysis-structure-quality">
      <span><i class="ti ti-shield-check" aria-hidden="true"></i> 분류 완료 ${analysisPercentText(structure.dataQuality, 0)}</span>
      <span>분석 대상 ${structure.expenseRows.length.toLocaleString("ko-KR")}건</span>
      <span>직접 입력·할부 월 배분 포함</span>
    </footer>`
  ].join("");

  attachAnalysisInsightHandlers(els.spendingStructureBody, insights, "spendingStructure");
  els.spendingStructureBody.querySelector("[data-toggle-spending-changes]")?.addEventListener("click", () => {
    spendingChangesExpanded = !spendingChangesExpanded;
    renderSpendingStructureAnalysis();
  });
  els.spendingStructureBody.querySelector("[data-open-spending-targets]")?.addEventListener("click", openSpendingTargetDialog);
}

function renderSpendingStructureSummary(structure, targetRows) {
  let message = `${analysisMonthDisplay(structure.month)}에 분석할 소비 기록이 없습니다.`;
  let tone = "neutral";
  if (structure.expenseRows.length || structure.income) {
    if (!structure.income) {
      message = `수입이 입력되지 않아 배분 비율과 목표 금액을 계산할 수 없습니다. 소비지출은 ${formatWon(structure.consumptionSpend)}입니다.`;
      tone = "warning";
    } else if (structure.assetFormation >= 0) {
      message = `수입의 ${analysisPercentText(structure.assetFormationRate)}를 자산으로 형성했습니다.`;
      tone = "positive";
    } else {
      message = `소비가 수입을 ${formatWon(structure.overrun)} 초과했습니다.`;
      tone = "negative";
    }
    if (structure.hasTargets) {
      const highestOverrun = [...targetRows]
        .filter((row) => row.targetRate > 0)
        .sort((a, b) => b.deltaRate - a.deltaRate)[0];
      if (highestOverrun?.deltaRate > 0.05) {
        message += ` ${highestOverrun.sector}는 목표보다 ${analysisSignedPercentPoint(highestOverrun.deltaRate)} 높습니다.`;
      } else {
        message += " 설정한 섹터 목표 범위 안에서 소비했습니다.";
      }
    } else {
      message += " 목표를 설정하면 섹터별 초과 원인을 함께 비교할 수 있습니다.";
    }
  }
  return `
    <section class="analysis-brief analysis-tone-${tone}" aria-label="소비 구조 요약">
      <i class="ti ti-chart-pie" aria-hidden="true"></i>
      <strong>${escapeHtml(message)}</strong>
    </section>
  `;
}

function renderSpendingAllocation(structure) {
  if (!structure.income && !structure.consumptionSpend) {
    return `
      <div class="analysis-empty">
        <i class="ti ti-chart-pie" aria-hidden="true"></i>
        <strong>배분할 수입과 소비가 없습니다.</strong>
        <span>수입 또는 거래를 입력하면 소비 구조를 표시합니다.</span>
      </div>
    `;
  }
  const assetAmount = Math.max(0, structure.assetFormation);
  const segments = [
    { key: "essential", label: "필수 소비", amount: structure.essential, tone: "essential" },
    { key: "discretionary", label: "재량 소비", amount: structure.discretionary, tone: "discretionary" },
    { key: "unknown", label: "미분류", amount: structure.unknown, tone: "unknown" },
    { key: "asset", label: "자산 형성", amount: assetAmount, tone: "asset" }
  ].filter((item) => item.amount > 0);
  const incomeMarker = Math.min(100, Math.max(0, analysisPercent(structure.income, structure.allocationBase)));
  return `
    <div class="analysis-allocation-wrap">
      <div class="analysis-allocation-bar" aria-label="수입 배분 막대">
        ${segments.map((segment) => {
          const width = analysisPercent(segment.amount, structure.allocationBase);
          return `
            <div class="analysis-allocation-segment allocation-${segment.tone}" style="width:${Math.max(0, width)}%" title="${escapeHtml(`${segment.label} ${formatWon(segment.amount)}`)}">
              ${width >= 11 ? `<strong>${escapeHtml(segment.label)}</strong><span>${analysisPercentText(analysisPercent(segment.amount, structure.income))}</span>` : ""}
            </div>
          `;
        }).join("")}
        ${structure.overrun > 0 ? `<span class="analysis-income-marker" style="left:${incomeMarker}%"><em>수입 100%</em></span>` : ""}
      </div>
      ${structure.overrun > 0 ? `<p class="analysis-allocation-warning"><i class="ti ti-alert-circle" aria-hidden="true"></i> 수입 초과 소비 ${formatWon(structure.overrun)}</p>` : ""}
      <div class="analysis-allocation-legend">
        ${segments.map((segment) => `
          <div>
            <span class="allocation-swatch allocation-${segment.tone}"></span>
            <small>${escapeHtml(segment.label)}</small>
            <strong>${formatWon(segment.amount)}</strong>
            <em>${analysisPercentText(analysisPercent(segment.amount, structure.income))}</em>
          </div>
        `).join("")}
      </div>
      <div class="analysis-definition-row">
        <span><b>필수 소비</b> 주거·공과금·장보기 등</span>
        <span><b>재량 소비</b> 외식·쇼핑·여가 등</span>
        <span><b>자산 형성</b> 실제 저축 + 부채 상환 + 자유 잔액</span>
        <button type="button" data-open-spending-targets>분류 기준 조정</button>
      </div>
    </div>
  `;
}

function renderSpendingTargetTable(structure, rows) {
  if (!structure.income) {
    return `
      <div class="analysis-empty analysis-empty-compact">
        <i class="ti ti-cash-banknote" aria-hidden="true"></i>
        <strong>수입을 입력하면 목표 금액을 계산합니다.</strong>
        <span>목표 비율은 저장할 수 있지만 실제 비교에는 해당 월 수입이 필요합니다.</span>
      </div>
    `;
  }
  const maximum = Math.max(
    10,
    ...rows.flatMap((row) => [row.actualRate, row.targetRate])
  ) * 1.08;
  return `
    ${!structure.hasTargets ? `
      <div class="analysis-target-empty">
        <span>목표가 아직 없습니다. 최근 6개월 중앙값을 제안으로 불러올 수 있습니다.</span>
        <button type="button" data-open-spending-targets>목표 설정</button>
      </div>
    ` : ""}
    <div class="analysis-target-table" role="table" aria-label="목표 대비 섹터 소비">
      <div class="analysis-target-table-head" role="row">
        <span role="columnheader">섹터</span>
        <span role="columnheader">목표</span>
        <span role="columnheader">실제</span>
        <span role="columnheader">차이</span>
        <span role="columnheader">같은 축 비교</span>
      </div>
      ${rows.map((row) => {
        const actualWidth = Math.min(100, row.actualRate / maximum * 100);
        const targetPosition = Math.min(100, row.targetRate / maximum * 100);
        const hasTarget = row.targetRate > 0;
        const tone = !hasTarget ? "neutral" : row.deltaRate > 0 ? "negative" : "positive";
        return `
          <div class="analysis-target-row analysis-tone-${tone}" role="row">
            <span class="analysis-target-sector" role="cell"><i class="ti ${escapeHtml(analysisSectorIcon(row.sector))}" aria-hidden="true"></i>${escapeHtml(row.sector)}</span>
            <span role="cell">${hasTarget ? `${analysisPercentText(row.targetRate)}<small>${formatWon(row.targetAmount)}</small>` : "<em>미설정</em>"}</span>
            <span role="cell"><strong>${formatWon(row.actualAmount)}</strong><small>${analysisPercentText(row.actualRate)}</small></span>
            <span role="cell" class="analysis-target-delta">${hasTarget ? analysisSignedPercentPoint(row.deltaRate) : "-"}</span>
            <span class="analysis-bullet-track" role="cell" aria-label="${escapeHtml(`${row.sector} 실제 ${analysisPercentText(row.actualRate)}`)}">
              <i style="width:${actualWidth}%"></i>
              ${hasTarget ? `<b style="left:${targetPosition}%" title="목표 ${analysisPercentText(row.targetRate)}"></b>` : ""}
            </span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderSpendingConcentration(structure) {
  const merchantRows = [...structure.merchantTotals.entries()]
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount);
  const topThree = merchantRows.slice(0, 3);
  const topThreeAmount = topThree.reduce((total, item) => total + item.amount, 0);
  const topThreeRate = analysisPercent(topThreeAmount, structure.consumptionSpend);
  const recurringRows = structure.consumptionRows.filter(
    (item) => item.sourceType === "recurring" || Boolean(item.recurringId)
  );
  return `
    <section class="analysis-panel analysis-concentration-panel" aria-labelledby="spendingConcentrationTitle">
      <div class="analysis-panel-head">
        <div>
          <h3 id="spendingConcentrationTitle">지출 집중도</h3>
          <p>가맹점·고정비·반복 결제 비중을 함께 확인합니다.</p>
        </div>
      </div>
      <div class="analysis-concentration-metrics">
        ${renderConcentrationMetric("ti-shopping-cart", "상위 3개 가맹점", analysisPercentText(topThreeRate), `${formatWon(topThreeAmount)} / ${formatWon(structure.consumptionSpend)}`, topThreeRate)}
        ${renderConcentrationMetric("ti-building-bank", "고정비 비중", analysisPercentText(analysisPercent(structure.fixedCost, structure.consumptionSpend)), `${formatWon(structure.fixedCost)} / ${formatWon(structure.consumptionSpend)}`, analysisPercent(structure.fixedCost, structure.consumptionSpend))}
        ${renderConcentrationMetric("ti-repeat", "반복 결제", `${recurringRows.length.toLocaleString("ko-KR")}건`, `이번 달 ${formatWon(sumConsumption(recurringRows))}`, analysisPercent(sumConsumption(recurringRows), structure.consumptionSpend))}
      </div>
      <div class="analysis-merchant-list" role="list" aria-label="상위 가맹점">
        ${topThree.length ? topThree.map((item, index) => `
          <div role="listitem">
            <span>${index + 1}</span>
            <strong>${escapeHtml(item.merchant)}</strong>
            <b>${formatWon(item.amount)}</b>
            <i style="width:${Math.min(100, analysisPercent(item.amount, topThree[0]?.amount || 1))}%"></i>
          </div>
        `).join("") : `<p class="analysis-list-empty">표시할 가맹점이 없습니다.</p>`}
      </div>
    </section>
  `;
}

function renderConcentrationMetric(icon, label, value, note, percent) {
  return `
    <article>
      <i class="ti ${escapeHtml(icon)}" aria-hidden="true"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
      <em><i style="width:${Math.min(100, Math.max(0, percent))}%"></i></em>
    </article>
  `;
}

function openSpendingTargetDialog() {
  if (!els.spendingTargetDialog) return;
  spendingTargetFeedback = "";
  const month = els.spendingStructureMonth?.value || getSharedSelectedMonth(currentMonthKey());
  renderSpendingTargetDialog(month);
  if (typeof els.spendingTargetDialog.showModal === "function") {
    els.spendingTargetDialog.showModal();
  } else {
    els.spendingTargetDialog.setAttribute("open", "");
  }
  document.body.classList.add("analysis-dialog-open");
  requestAnimationFrame(() => {
    els.spendingTargetDialog.querySelector("input, select, button")?.focus();
  });
}

function closeSpendingTargetDialog() {
  if (!els.spendingTargetDialog) return;
  if (typeof els.spendingTargetDialog.close === "function" && els.spendingTargetDialog.open) {
    els.spendingTargetDialog.close();
  } else {
    els.spendingTargetDialog.removeAttribute("open");
  }
  document.body.classList.remove("analysis-dialog-open");
}

function renderSpendingTargetDialog(month) {
  if (!els.spendingTargetFields || !els.spendingTypeFields) return;
  const targets = analysisTargetRatios();
  const suggestion = buildAnalysisTargetSuggestion(month);
  els.spendingTargetFields.innerHTML = ANALYSIS_SPENDING_SECTORS.map((sector) => `
    <label class="analysis-target-input-row">
      <span><i class="ti ${escapeHtml(analysisSectorIcon(sector))}" aria-hidden="true"></i>${escapeHtml(sector)}</span>
      <input type="number" min="0" max="100" step="0.1" inputmode="decimal" value="${escapeHtml(targets[sector] || "")}" data-analysis-target-sector="${escapeHtml(sector)}" aria-label="${escapeHtml(`${sector} 목표 비율`)}">
      <b>%</b>
    </label>
  `).join("");
  els.spendingTypeFields.innerHTML = ANALYSIS_SPENDING_SECTORS.map((sector) => {
    const subcategories = categories[sector] || [];
    return `
      <details class="analysis-type-sector">
        <summary><i class="ti ${escapeHtml(analysisSectorIcon(sector))}" aria-hidden="true"></i>${escapeHtml(sector)}<span>${subcategories.length.toLocaleString("ko-KR")}개</span></summary>
        <div>
          ${subcategories.map((subcategory) => {
            const key = analysisConsumptionTypeKey(sector, subcategory);
            const selected = appSettings.analysis?.consumptionTypes?.[key]
              || ANALYSIS_DEFAULT_CONSUMPTION_TYPES[key]
              || "discretionary";
            return `
              <label>
                <span>${escapeHtml(subcategory)}</span>
                <select data-analysis-type-key="${escapeHtml(key)}" aria-label="${escapeHtml(`${subcategory} 소비 유형`)}">
                  <option value="essential" ${selected === "essential" ? "selected" : ""}>필수 소비</option>
                  <option value="discretionary" ${selected === "discretionary" ? "selected" : ""}>재량 소비</option>
                </select>
              </label>
            `;
          }).join("")}
        </div>
      </details>
    `;
  }).join("");
  if (els.spendingTargetSuggestionNote) {
    els.spendingTargetSuggestionNote.textContent = suggestion.months.length
      ? `${suggestion.months[0]}~${suggestion.months.at(-1)} 중 수입이 있는 ${suggestion.months.length}개월 중앙값`
      : "제안을 만들 수 있는 수입·소비 데이터가 없습니다.";
  }
  syncSpendingTargetTotal();
  setSpendingTargetFeedback(spendingTargetFeedback);
  els.spendingTargetFields.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", syncSpendingTargetTotal);
  });
}

function applySpendingTargetSuggestion() {
  const month = els.spendingStructureMonth?.value || getSharedSelectedMonth(currentMonthKey());
  const suggestion = buildAnalysisTargetSuggestion(month);
  if (!suggestion.months.length) {
    setSpendingTargetFeedback("수입이 있는 최근 월이 없어 목표 제안을 만들 수 없습니다.", "warning");
    return;
  }
  els.spendingTargetFields?.querySelectorAll("[data-analysis-target-sector]").forEach((input) => {
    input.value = suggestion.ratios[input.dataset.analysisTargetSector] || "";
  });
  syncSpendingTargetTotal();
  setSpendingTargetFeedback("최근 6개월 중앙값을 불러왔습니다. 저장 전 자유롭게 조정하세요.", "success");
}

function resetSpendingTypeControls() {
  els.spendingTypeFields?.querySelectorAll("[data-analysis-type-key]").forEach((select) => {
    select.value = ANALYSIS_DEFAULT_CONSUMPTION_TYPES[select.dataset.analysisTypeKey] || "discretionary";
  });
  setSpendingTargetFeedback("필수·재량 구분을 기본값으로 되돌렸습니다. 저장해야 반영됩니다.", "success");
}

function syncSpendingTargetTotal() {
  if (!els.spendingTargetTotal) return;
  const total = [...(els.spendingTargetFields?.querySelectorAll("[data-analysis-target-sector]") || [])]
    .reduce((sumValue, input) => sumValue + Math.max(0, toNumber(input.value)), 0);
  const remaining = 100 - total;
  els.spendingTargetTotal.textContent = `소비 목표 합계 ${analysisPercentText(total)} · 자산 형성 목표 ${analysisPercentText(Math.max(0, remaining))}`;
  els.spendingTargetTotal.classList.toggle("is-invalid", total > 100.001);
}

async function saveSpendingAnalysisSettings(event) {
  event.preventDefault();
  const targetRatios = {};
  els.spendingTargetFields?.querySelectorAll("[data-analysis-target-sector]").forEach((input) => {
    const value = Math.min(100, Math.max(0, toNumber(input.value)));
    if (value > 0) targetRatios[input.dataset.analysisTargetSector] = value;
  });
  const total = Object.values(targetRatios).reduce((sumValue, value) => sumValue + value, 0);
  if (total > 100.001) {
    setSpendingTargetFeedback("섹터 소비 목표의 합계는 100%를 넘을 수 없습니다.", "error");
    return;
  }

  const consumptionTypes = {};
  els.spendingTypeFields?.querySelectorAll("[data-analysis-type-key]").forEach((select) => {
    const key = select.dataset.analysisTypeKey;
    const value = select.value === "essential" ? "essential" : "discretionary";
    const defaultValue = ANALYSIS_DEFAULT_CONSUMPTION_TYPES[key] || "discretionary";
    if (value !== defaultValue) consumptionTypes[key] = value;
  });

  appSettings.analysis = {
    ...appSettings.analysis,
    targetRatios,
    consumptionTypes
  };
  await saveSettings();
  closeSpendingTargetDialog();
  renderSpendingStructureAnalysis();
}

function setSpendingTargetFeedback(message, tone = "") {
  spendingTargetFeedback = message || "";
  if (!els.spendingTargetFeedback) return;
  els.spendingTargetFeedback.textContent = spendingTargetFeedback;
  els.spendingTargetFeedback.dataset.tone = tone;
}
