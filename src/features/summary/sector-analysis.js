function buildMonthlyFeedbackModel(activeRows, selectedMonth, comparison) {
  const changedSectors = comparison.sectorDeltas
    .filter((item) => item.currentAmount > 0 || item.comparisonAmount > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const increases = changedSectors.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta);
  const decreases = changedSectors.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta);
  const stable = changedSectors.filter((item) => item.delta === 0 || Math.abs(item.delta) <= Math.max(10000, item.comparisonAmount * 0.1));
  const unknown = summaryComparisonSectorChange(comparison, "미분류");
  const biggestIncrease = increases[0] || null;
  const biggestDecrease = decreases[0] || null;
  const driverSector = biggestIncrease?.sector || biggestDecrease?.sector || changedSectors[0]?.sector || "";
  const driverBreakdown = driverSector ? comparisonBreakdownForSector(comparison, driverSector) : null;
  const attentionDrivers = driverBreakdown
    ? summaryComparisonDriverItems(driverBreakdown.subcategories).filter((item) => item.delta > 0).slice(0, 2)
    : [];
  const total = comparison.totalChange;
  const headline = !comparison.comparisonExists
    ? `${comparison.comparisonMonth || "비교 월"} 기록이 없어 선택 월 소비만 정리했습니다.`
    : total.delta > 0
      ? `총 소비가 ${comparison.comparisonLabel}보다 ${formatWon(total.delta)} 늘었습니다.`
      : total.delta < 0
        ? `총 소비가 ${comparison.comparisonLabel}보다 ${formatWon(Math.abs(total.delta))} 줄었습니다.`
        : `총 소비가 ${comparison.comparisonLabel}과 같았습니다.`;
  return {
    selectedMonth,
    comparisonMonth: comparison.comparisonMonth,
    comparisonLabel: comparison.comparisonLabel,
    comparisonExists: comparison.comparisonExists,
    cutoffDay: comparison.cutoffDay,
    total,
    headline,
    increases,
    decreases,
    stable,
    unknown,
    biggestIncrease,
    biggestDecrease,
    driverSector,
    attentionDrivers,
    currentRows: comparison.currentRows,
    activeRows
  };
}

function monthlyFeedbackSectorSentence(item, direction) {
  if (!item) return `${direction === "up" ? "증가" : "감소"}한 섹터가 없습니다.`;
  const verb = direction === "up" ? "늘어 가장 큰 증가 요인입니다" : "줄어 가장 크게 감소했습니다";
  return `${item.sector}가 ${formatWon(Math.abs(item.delta))} ${verb}.`;
}

function monthlyFeedbackFocus(model) {
  if (model.unknown.currentAmount > 0) {
    return { icon: "ti-alert-circle", title: "미분류 먼저 확인", text: `${formatWon(model.unknown.currentAmount)}의 미분류 소비를 정리하면 분석 정확도가 높아집니다.`, action: "unknown" };
  }
  if (model.biggestIncrease) {
    return { icon: "ti-adjustments-horizontal", title: `${model.biggestIncrease.sector} 결제 확인`, text: `다음 달에는 ${model.biggestIncrease.sector}의 반복 결제와 큰 금액을 먼저 확인해보세요.`, action: "sector", sector: model.biggestIncrease.sector };
  }
  return { icon: "ti-shield-check", title: "현재 흐름 유지", text: "뚜렷한 증가 요인이 없습니다. 다음 달에도 같은 기준으로 변화를 확인해보세요.", action: "detail" };
}

function renderMonthlyFeedback(activeRows, selectedMonth, comparison) {
  if (!els.summaryFeedbackPanel) return;
  const model = buildMonthlyFeedbackModel(activeRows, selectedMonth, comparison);
  if (!selectedMonth || !model.currentRows.length) {
    els.summaryFeedbackPanel.innerHTML = `<div class="empty compact-empty">선택 월의 소비 피드백을 만들 지출 기록이 없습니다.</div>`;
    return;
  }
  const focus = monthlyFeedbackFocus(model);
  const positive = model.stable.find((item) => ![model.biggestIncrease?.sector, model.biggestDecrease?.sector].includes(item.sector)) || null;
  const cutoffNotice = model.cutoffDay
    ? `${selectedMonth} ${model.cutoffDay}일까지의 누적 기록을 ${model.comparisonMonth} 같은 날짜까지 비교했습니다.`
    : `${selectedMonth} 전체 기록을 ${model.comparisonMonth} ${model.comparisonLabel}과 비교했습니다.`;
  els.summaryFeedbackPanel.innerHTML = `
    <section class="summary-feedback-hero">
      <span class="summary-insight-icon"><i class="ti ti-chart-pie" aria-hidden="true"></i></span>
      <div><span>${escapeHtml(selectedMonth)} 소비 요약</span><h4>${escapeHtml(model.headline)}</h4><p>${escapeHtml(cutoffNotice)}</p></div>
      <strong class="${model.total.tone}">${model.comparisonExists ? formatSignedWon(model.total.delta) : "비교 없음"}</strong>
    </section>
    <div class="summary-feedback-grid">
      <section class="summary-feedback-column" aria-labelledby="feedbackChangesTitle">
        <div class="summary-card-heading"><h4 id="feedbackChangesTitle">이번 달 핵심 변화</h4><span>전체 섹터 기준</span></div>
        <article class="summary-feedback-change up">
          <i class="ti ti-arrows-exchange" aria-hidden="true"></i>
          <div><span>가장 큰 증가</span><strong>${escapeHtml(model.biggestIncrease?.sector || "해당 없음")}</strong><p>${escapeHtml(monthlyFeedbackSectorSentence(model.biggestIncrease, "up"))}</p></div>
          <b>${model.biggestIncrease ? formatSignedWon(model.biggestIncrease.delta) : "-"}</b>
        </article>
        <article class="summary-feedback-change down">
          <i class="ti ti-arrows-exchange" aria-hidden="true"></i>
          <div><span>가장 큰 감소</span><strong>${escapeHtml(model.biggestDecrease?.sector || "해당 없음")}</strong><p>${escapeHtml(monthlyFeedbackSectorSentence(model.biggestDecrease, "down"))}</p></div>
          <b>${model.biggestDecrease ? formatSignedWon(model.biggestDecrease.delta) : "-"}</b>
        </article>
        <article class="summary-feedback-change neutral">
          <i class="ti ti-adjustments-horizontal" aria-hidden="true"></i>
          <div><span>함께 볼 변화</span><strong>${escapeHtml(positive?.sector || "변화 적음")}</strong><p>${positive ? `${escapeHtml(positive.sector)} 변화는 ${formatWon(Math.abs(positive.delta))}입니다. 소비 맥락과 함께 판단하세요.` : "뚜렷한 추가 변화가 없습니다."}</p></div>
          <b>${positive ? formatSignedWon(positive.delta) : "-"}</b>
        </article>
      </section>
      <section class="summary-feedback-column" aria-labelledby="feedbackAttentionTitle">
        <div class="summary-card-heading"><h4 id="feedbackAttentionTitle">무엇을 확인하면 좋을까요?</h4><span>근거가 큰 항목부터</span></div>
        <div class="summary-feedback-attention">
          ${model.attentionDrivers.length ? model.attentionDrivers.map((item, index) => `
            <button type="button" data-feedback-driver="${escapeHtml(item.key)}" data-feedback-sector="${escapeHtml(model.driverSector)}">
              <span>${index + 1}</span><div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(model.driverSector)} 안에서 ${formatWon(item.delta)} 늘었습니다.</p></div><b>${formatSignedWon(item.delta)}</b><i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          `).join("") : `<p class="summary-feedback-no-driver">비교 가능한 세부 증가 요인이 없습니다.</p>`}
        </div>
        <article class="summary-feedback-focus">
          <i class="ti ${focus.icon}" aria-hidden="true"></i>
          <div><span>다음 달 중점</span><strong>${escapeHtml(focus.title)}</strong><p>${escapeHtml(focus.text)}</p></div>
          <button type="button" data-feedback-focus="${escapeHtml(focus.action)}" data-feedback-sector="${escapeHtml(focus.sector || "all")}">바로 확인 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        </article>
      </section>
    </div>
    <footer class="summary-feedback-footer">
      <p><i class="ti ti-info-circle" aria-hidden="true"></i> 금액 변화는 판단의 단서이며, 필수지출 여부와 실제 소비 맥락은 상세 내역에서 함께 확인하세요.</p>
      ${model.unknown.currentAmount > 0 ? `<button type="button" data-feedback-unknown>미분류 ${formatWon(model.unknown.currentAmount)} 정리하기</button>` : ""}
    </footer>
  `;
  attachMonthlyFeedbackHandlers(model);
}

function attachMonthlyFeedbackHandlers(model) {
  els.summaryFeedbackPanel.querySelectorAll("[data-feedback-driver]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(summaryDetailOptions({
      month: model.selectedMonth,
      sector: button.dataset.feedbackSector,
      subcategory: button.dataset.feedbackDriver
    })));
  });
  els.summaryFeedbackPanel.querySelector("[data-feedback-focus]")?.addEventListener("click", (event) => {
    const action = event.currentTarget.dataset.feedbackFocus;
    const sector = event.currentTarget.dataset.feedbackSector || "all";
    if (action === "unknown" && typeof showView === "function") {
      showView("unknown");
      return;
    }
    openDetailView(summaryDetailOptions({ month: model.selectedMonth, sector }));
  });
  els.summaryFeedbackPanel.querySelector("[data-feedback-unknown]")?.addEventListener("click", () => {
    if (typeof showView === "function") showView("unknown");
  });
}
