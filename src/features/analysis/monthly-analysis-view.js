function setupMonthlyAnalysisControls() {
  els.monthlyAnalysisComparisonButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.monthlyAnalysisComparison === "previous" ? "previous" : "year";
      if (monthlyAnalysisComparisonMode === nextMode) return;
      monthlyAnalysisComparisonMode = nextMode;
      renderMonthlyAnalysis();
    });
  });
  els.monthlyAnalysisMonth?.addEventListener("change", () => {
    setSharedSelectedMonth(els.monthlyAnalysisMonth.value, { syncControls: false });
    renderMonthlyAnalysis();
  });
  els.monthlyAnalysisPrevMonth?.addEventListener("click", () => {
    moveAnalysisMonth(els.monthlyAnalysisMonth, -1, renderMonthlyAnalysis);
  });
  els.monthlyAnalysisNextMonth?.addEventListener("click", () => {
    moveAnalysisMonth(els.monthlyAnalysisMonth, 1, renderMonthlyAnalysis);
  });
  els.monthlyAnalysisOpenDetails?.addEventListener("click", () => {
    const month = els.monthlyAnalysisMonth?.value || getSharedSelectedMonth(currentMonthKey());
    openDetailView(analysisDetailOptions({ month, sector: "all", subcategory: "all" }, "monthlyAnalysis"));
  });
}

function renderMonthlyAnalysis() {
  if (!els.monthlyAnalysisMonth || !els.monthlyAnalysisBody) return;
  const month = fillAnalysisMonthSelect(
    els.monthlyAnalysisMonth,
    getSharedSelectedMonth(els.monthlyAnalysisMonth.value || currentMonthKey())
  );
  if (canViewDriveSharedMonth("monthlyAnalysis")) setSharedSelectedMonth(month, { syncControls: false });

  const comparison = buildMonthlyAnalysisModel(month, monthlyAnalysisComparisonMode);
  if (!comparison) return;
  const billingModel = analysisBillingModelForMonth(month);
  const selectionKey = `${month}|${comparison.comparisonMode}|${comparison.cutoffDay}`;
  if (monthlyAnalysisEvidenceSelection.key !== selectionKey
    || !comparison.sectorChanges.some((item) => item.sector === monthlyAnalysisEvidenceSelection.sector)) {
    monthlyAnalysisEvidenceSelection = { key: selectionKey, sector: "" };
  }
  syncMonthlyAnalysisComparisonControls(comparison);
  els.monthlyAnalysisBody.innerHTML = [
    renderMonthlyAnalysisSummary(comparison),
    renderMonthlyAnalysisMetrics(comparison),
    `<p class="monthly-analysis-record-note">월 전체 입력 기록 기준입니다. 남은 돈은 실제 계좌 잔고가 아니며, 카드 결제 예정액을 다시 차감하지 않습니다.</p>`,
    `<div class="monthly-analysis-main">
      <section class="analysis-panel monthly-analysis-changes" aria-labelledby="monthlyAnalysisChangesTitle">
        <div class="analysis-panel-head">
          <div>
            <h3 id="monthlyAnalysisChangesTitle">소비는 어디서 달라졌나요?</h3>
            <p>${escapeHtml(comparison.previousPeriod.label)} → ${escapeHtml(comparison.currentPeriod.label)} 비교</p>
          </div>
          <span class="analysis-unit">단위: 원</span>
        </div>
        ${renderMonthlyAnalysisSectorChanges(comparison)}
      </section>
      ${renderMonthlyAnalysisCashflow(comparison)}
    </div>`,
    renderMonthlyAnalysisBilling(billingModel, comparison.current)
  ].join("");
  attachMonthlyAnalysisEvidenceHandlers(comparison);
}

function syncMonthlyAnalysisComparisonControls(comparison) {
  els.monthlyAnalysisComparisonButtons?.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.monthlyAnalysisComparison === comparison.comparisonMode));
  });
  if (els.monthlyAnalysisComparisonStatus) {
    els.monthlyAnalysisComparisonStatus.textContent = comparison.isCurrentMonth
      ? `소비: 두 달 모두 1~${comparison.cutoffDay}일 · 수입·남은 돈은 월 입력 기록`
      : comparison.isFutureMonth ? "미래 월 · 입력 기록 참고용" : `비교 월 ${comparison.comparisonMonth} · 월 전체 기록`;
  }
}

function renderMonthlyAnalysisSummary(comparison) {
  let title = "이 달에 입력된 기록이 없습니다.";
  let detail = "수입과 소비 기록을 입력하면 남은 돈과 변화의 이유를 확인할 수 있습니다.";
  if (comparison.isFutureMonth) {
    title = "아직 오지 않은 달의 입력 기록입니다.";
    detail = "미래 날짜의 기록은 참고용으로 표시하며, 확정 결산이나 증감으로 해석하지 않습니다.";
  } else if (comparison.hasCurrent && comparison.isCurrentMonth) {
    title = `1~${comparison.cutoffDay}일에 확인된 소비는 ${formatWon(comparison.currentPeriod.amount)}입니다.`;
    detail = comparison.canCompareConsumption
      ? `${comparison.comparisonLabel} 같은 기간 대비 ${monthlyAnalysisChangeText(comparison.consumptionDelta)}. `
      : `${comparison.comparisonLabel} 자료가 없어 증감은 비교하지 않습니다. `;
    detail += "수입·남은 돈은 월 입력 기록 기준이며, 동일 기간 증감은 표시하지 않습니다.";
  } else if (comparison.canCompareBalance) {
    title = `기록 기준 남은 돈은 ${comparison.comparisonLabel} 대비 ${monthlyAnalysisChangeText(comparison.balanceDelta)}.`;
    const changes = comparison.balanceDrivers.filter((item) => item.change !== 0)
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
    detail = changes.length
      ? `주요 변화: ${changes.slice(0, 2).map((item) => `${item.label} ${formatSignedWon(item.change)}`).join(" · ")}. 전체 변화는 아래 계산에 반영했습니다.`
      : "수입·소비·저축·원금 상환·가족 정산에 변동이 없습니다.";
  } else if (comparison.hasCurrent) {
    title = comparison.canCompareConsumption
      ? `소비지출은 ${comparison.comparisonLabel} 대비 ${monthlyAnalysisChangeText(comparison.consumptionDelta)}.`
      : `입력된 소비지출은 ${formatWon(comparison.current.consumptionSpend)}입니다.`;
    detail = comparison.hasComparison
      ? "수입 기록이 없는 달이 있어 남은 돈의 증감은 비교하지 않습니다."
      : `${comparison.comparisonLabel} 자료가 없어 증감은 비교하지 않습니다.`;
    if (!comparison.currentIncomeKnown) detail += " 수입 미입력 상태의 남은 돈은 지출만 반영한 참고 금액입니다.";
  }
  return `<section class="analysis-brief monthly-analysis-brief" aria-label="월간 분석 요약">
    <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>
  </section>`;
}

function monthlyAnalysisChangeText(value) {
  return value ? `${formatWon(Math.abs(value))} ${value > 0 ? "늘었습니다" : "줄었습니다"}` : "변동이 없습니다";
}

function renderMonthlyAnalysisMetrics(model) {
  const snapshot = model.current;
  const metrics = [
    {
      key: "income", label: "수입",
      value: model.currentIncomeKnown ? formatWon(snapshot.income) : "미입력",
      note: "날짜별 수입 + 월 단위 수입 합계",
      delta: model.canCompareBalance ? snapshot.income - model.previous.income : null
    },
    {
      key: "consumption", label: "소비지출",
      value: formatWon(snapshot.consumptionSpend),
      note: "월 전체 기록 · 정산 차감 · 대출 이자 포함",
      delta: model.canCompareConsumption && !model.isCurrentMonth ? model.consumptionDelta : null
    },
    {
      key: "balance", label: "남은 돈 · 기록 기준",
      value: model.hasCurrent ? formatSignedWon(snapshot.freeBalance) : "—",
      note: model.currentIncomeKnown ? "소비·저축·원금 상환·가족 정산 반영" : "수입 미입력 · 수입을 0원으로 둔 참고값",
      delta: model.canCompareBalance ? model.balanceDelta : null
    }
  ];
  return `<section class="analysis-metric-strip monthly-analysis-metrics" aria-label="월간 핵심 지표">
    ${metrics.map((metric) => `<article class="analysis-metric" data-monthly-metric="${metric.key}"><div>
      <span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong>
      ${metric.delta !== null ? `<em>${escapeHtml(model.comparisonLabel)} ${formatSignedWon(metric.delta)}</em>` : ""}
      <small>${escapeHtml(metric.note)}</small>
    </div></article>`).join("")}
  </section>`;
}

function monthlyAnalysisSectorLabel(sector) {
  return sector === "저축" ? "저축 분류의 소비" : sector;
}

function renderMonthlyAnalysisSectorChanges(model) {
  if (!model.canCompareConsumption) {
    const message = model.isFutureMonth ? "미래 월은 증감을 비교하지 않습니다."
      : !model.hasCurrent ? "선택한 달의 기록이 없습니다." : `${model.comparisonLabel} 비교 자료가 없습니다.`;
    return `<div class="analysis-empty"><i class="ti ti-calendar" aria-hidden="true"></i><strong>${escapeHtml(message)}</strong><span>자료가 없는 달을 0원 소비로 판단하지 않습니다.</span></div>`;
  }
  const maximum = Math.max(1, ...model.sectorChanges.map((item) => Math.abs(item.delta)));
  const undated = [model.currentPeriod, model.previousPeriod].filter((period) => period.undatedCount);
  return `<div class="monthly-change-totals">
    <span>${escapeHtml(model.previousPeriod.label)}<strong>${formatWon(model.previousPeriod.amount)}</strong></span>
    <span>${escapeHtml(model.currentPeriod.label)}<strong>${formatWon(model.currentPeriod.amount)}</strong></span>
    <span>소비 변화<strong>${formatSignedWon(model.consumptionDelta)}</strong></span>
  </div>
  ${undated.length ? `<p class="monthly-analysis-notice">날짜 확인 필요: ${undated.map((period) => `${escapeHtml(period.month)} ${period.undatedCount}건 ${formatWon(period.undatedAmount)}`).join(" · ")}. 일자 비교에서는 제외하고 월 전체 기록에는 포함했습니다.</p>` : ""}
  <p class="monthly-change-help">왼쪽은 소비 감소, 오른쪽은 증가입니다. 항목을 누르면 두 기간의 근거 거래가 펼쳐집니다.</p>
  <ul class="monthly-change-list">${model.sectorChanges.map((item, index) => {
    const width = Math.abs(item.delta) / maximum * 120;
    const expanded = monthlyAnalysisEvidenceSelection.sector === item.sector;
    const tone = item.delta > 0 ? "increase" : item.delta < 0 ? "decrease" : "neutral";
    return `<li>
      <button type="button" class="monthly-change-button is-${tone}" data-monthly-change-index="${index}" aria-expanded="${expanded}" aria-controls="monthlyAnalysisEvidence${index}" aria-label="${escapeHtml(monthlyAnalysisSectorLabel(item.sector))} ${formatSignedWon(item.delta)}, 근거 거래 ${expanded ? "닫기" : "보기"}">
        <span class="monthly-change-sector">${escapeHtml(monthlyAnalysisSectorLabel(item.sector))}</span>
        <svg class="monthly-change-bar" viewBox="0 0 240 18" preserveAspectRatio="none" aria-hidden="true"><line x1="120" y1="0" x2="120" y2="18"></line><rect x="${item.delta < 0 ? 120 - width : 120}" y="4" width="${width}" height="10" rx="2"></rect></svg>
        <strong>${formatSignedWon(item.delta)}</strong>
        <small>${escapeHtml(model.comparisonMonth)} ${formatWon(item.previous)} → ${escapeHtml(model.month)} ${formatWon(item.current)}</small>
      </button>
      <div id="monthlyAnalysisEvidence${index}" class="monthly-analysis-evidence" ${expanded ? "" : "hidden"}>${expanded ? renderMonthlyAnalysisEvidence(item, model) : ""}</div>
    </li>`;
  }).join("")}</ul>
  ${!model.sectorChanges.length ? `<p class="monthly-change-help">두 기간에 등록된 소비지출이 없습니다.</p>` : ""}
  ${model.sectorChanges.some((item) => item.sector === "저축") ? `<p class="monthly-change-help">저축 분류의 보험·상품권 등은 소비에 포함하고, 적금·예금은 제외했습니다.</p>` : ""}`;
}

function renderMonthlyAnalysisCashflow(model) {
  const compare = model.canCompareBalance;
  return `<aside class="analysis-panel monthly-analysis-cashflow" aria-labelledby="monthlyAnalysisCashflowTitle">
    <div class="analysis-panel-head"><div><h3 id="monthlyAnalysisCashflowTitle">${compare ? "남은 돈이 달라진 이유" : "남은 돈 계산"}</h3><p>${compare ? "오른쪽 금액은 남은 돈에 미친 영향입니다." : `${escapeHtml(model.month)} 월 전체 입력 기록 기준`}</p></div></div>
    <dl class="monthly-cashflow-list">${model.balanceDrivers.map((item) => `<div>
      <dt>${escapeHtml(item.label)}<small>${compare ? `${formatSignedWon(item.change)} 변화 · ` : ""}${!model.currentIncomeKnown && item.key === "income" ? "미입력 · 0원으로 계산" : escapeHtml(item.note)}</small></dt>
      <dd>${formatSignedWon(compare ? item.impact : item.currentEffect)}</dd>
    </div>`).join("")}</dl>
    <div class="monthly-cashflow-result"><span>${compare ? "남은 돈 변화" : "남은 돈 · 참고값"}</span><strong>${formatSignedWon(compare ? model.balanceDelta : model.current.freeBalance)}</strong>
      ${compare ? `<small>${escapeHtml(model.comparisonMonth)} ${formatSignedWon(model.previous.freeBalance)} → ${escapeHtml(model.month)} ${formatSignedWon(model.current.freeBalance)}</small>` : ""}
    </div>
    <p class="monthly-change-help">저축·원금 상환으로 남은 돈이 줄어도 소비가 늘어난 것은 아닙니다. 가족 정산 조정은 수령 시점 차이를 반영합니다.</p>
  </aside>`;
}

function renderMonthlyAnalysisEvidence(change, model) {
  return `<h4>${escapeHtml(monthlyAnalysisSectorLabel(change.sector))} 근거 거래</h4><div class="monthly-evidence-columns">
    ${[{ period: model.currentPeriod, rows: change.currentRows, amount: change.current }, { period: model.previousPeriod, rows: change.previousRows, amount: change.previous }].map(({ period, rows, amount }) => {
      const sorted = [...rows].sort((a, b) => `${b.approvalDate} ${b.approvalTime}`.localeCompare(`${a.approvalDate} ${a.approvalTime}`));
      return `<section aria-label="${escapeHtml(period.label)} 근거 거래"><div class="monthly-evidence-heading"><h5>${escapeHtml(period.label)}</h5><strong>${formatWon(amount)}</strong><small>내역 ${rows.length}건</small></div>
        ${rows.length ? `<ul>${sorted.map((item) => `<li><div><strong>${escapeHtml(analysisMerchantName(item))}</strong><b>${formatWon(consumptionAmount(item))}</b></div>
          <p>${escapeHtml(monthlyAnalysisDate(item, period.month) || "날짜 확인 필요")} · ${escapeHtml(item.subcategory || "미분류")}</p>${foodOccasionBadge(item)}
          ${isLoanRepaymentTransaction(item) ? `<p>대출 이자 중 내 부담액만 포함 · 원금 제외</p>` : reimbursementFor(item) ? `<p>결제 ${formatWon(item.amount)} · 정산 ${formatWon(reimbursementFor(item))}</p>` : ""}
          ${item.isInstallmentOccurrence ? `<p>할부 ${item.currentInstallmentIndex}/${item.installmentMonths}회 · 이달 배분액</p>` : ""}
        </li>`).join("")}</ul>` : `<p class="monthly-evidence-empty">이 기간에 등록된 거래가 없습니다.</p>`}
      </section>`;
    }).join("")}</div><p class="monthly-change-help">정산금을 뺀 소비지출 기준입니다. 상황 태그는 거래 맥락이며, 금액에 이미 포함되어 있습니다.</p>`;
}

function attachMonthlyAnalysisEvidenceHandlers(model) {
  const buttons = els.monthlyAnalysisBody.querySelectorAll("[data-monthly-change-index]");
  buttons.forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.monthlyChangeIndex);
    const selected = model.sectorChanges[index];
    if (!selected) return;
    monthlyAnalysisEvidenceSelection.sector = button.getAttribute("aria-expanded") === "true" ? "" : selected.sector;
    buttons.forEach((entry) => {
      const itemIndex = Number(entry.dataset.monthlyChangeIndex);
      const item = model.sectorChanges[itemIndex];
      const expanded = monthlyAnalysisEvidenceSelection.sector === item.sector;
      entry.setAttribute("aria-expanded", String(expanded));
      entry.setAttribute("aria-label", `${monthlyAnalysisSectorLabel(item.sector)} ${formatSignedWon(item.delta)}, 근거 거래 ${expanded ? "닫기" : "보기"}`);
      const panel = els.monthlyAnalysisBody.querySelector(`#monthlyAnalysisEvidence${itemIndex}`);
      panel.hidden = !expanded;
      panel.innerHTML = expanded ? renderMonthlyAnalysisEvidence(item, model) : "";
    });
  }));
}

function renderAnalysisInsightList(insights, sourceView, visibleCount = insights.length) {
  if (!insights.length) {
    return `
      <div class="analysis-empty analysis-empty-compact">
        <i class="ti ti-shield-check" aria-hidden="true"></i>
        <strong>기준을 넘는 변화가 없습니다.</strong>
        <span>10,000원·20% 이상 변화와 반복 상승을 확인합니다.</span>
      </div>
    `;
  }
  return `
    <div class="analysis-insight-list">
      ${insights.slice(0, visibleCount).map((insight, index) => `
        <article class="analysis-insight-row analysis-tone-${escapeHtml(insight.tone)}">
          <span class="analysis-insight-icon"><i class="ti ${escapeHtml(insight.icon)}" aria-hidden="true"></i></span>
          <div class="analysis-insight-copy">
            <strong>${escapeHtml(insight.title)}</strong>
            <span>${escapeHtml(insight.reason)}</span>
            <small>${escapeHtml(insight.context)}</small>
          </div>
          <b class="analysis-insight-amount">${formatSignedWon(insight.amount)}</b>
          <button type="button" class="analysis-row-action" data-analysis-insight-index="${index}">
            거래 내역 보기 <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        </article>
      `).join("")}
    </div>
  `;
}

function attachAnalysisInsightHandlers(container, insights, sourceView) {
  container?.querySelectorAll("[data-analysis-insight-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const insight = insights[Number(button.dataset.analysisInsightIndex)];
      if (insight) openDetailView(analysisDetailOptions(insight, sourceView));
    });
  });
}

function renderMonthlyAnalysisBilling(model, snapshot) {
  if (!model) return "";
  const adjusted = model.paymentDate !== model.scheduledPaymentDate;
  return `
    <section class="analysis-panel analysis-billing-panel" aria-labelledby="monthlyAnalysisBillingTitle">
      <div class="analysis-panel-head">
        <div>
          <h3 id="monthlyAnalysisBillingTitle">다음 카드 결제 주기</h3>
          <p>정산금 차감 전 카드 거래 기준의 예정액입니다. 위 소비지출과 남은 돈 계산에 다시 더하거나 빼지 않습니다.</p>
        </div>
        <strong class="analysis-billing-amount">${formatWon(model.expectedAmount)}</strong>
      </div>
      <div class="analysis-billing-timeline" role="list">
        ${renderAnalysisBillingPoint("사용 시작", model.periodStart, "", "start")}
        ${renderAnalysisBillingPoint("사용 마감", model.periodEnd, `${model.rows.length.toLocaleString("ko-KR")}건`, "cutoff")}
        ${renderAnalysisBillingPoint("결제일", model.paymentDate, adjusted ? "주말 다음 월요일 적용" : "", "payment")}
      </div>
      <footer class="analysis-data-quality">
        <span><i class="ti ti-shield-check" aria-hidden="true"></i> 분류 완료 ${analysisPercentText(snapshot.dataQuality, 0)}</span>
        <span>분석 대상 ${snapshot.expenseRows.length.toLocaleString("ko-KR")}건</span>
        <span>미분류 ${snapshot.unknownRows.length.toLocaleString("ko-KR")}건</span>
      </footer>
    </section>
  `;
}

function renderAnalysisBillingPoint(label, date, note, tone) {
  return `
    <div class="analysis-billing-point analysis-billing-${escapeHtml(tone)}" role="listitem">
      <span class="analysis-billing-dot"></span>
      <small>${escapeHtml(formatAnalysisDate(date))}</small>
      <strong>${escapeHtml(label)}</strong>
      <em>${escapeHtml(note)}</em>
    </div>
  `;
}

function formatAnalysisDate(date) {
  const normalized = normalizeInputDate(date);
  return normalized ? `${Number(normalized.slice(5, 7))}/${Number(normalized.slice(8, 10))}` : "-";
}
