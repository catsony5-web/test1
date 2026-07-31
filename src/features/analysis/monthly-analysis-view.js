function setupMonthlyAnalysisControls() {
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

  const comparison = buildAnalysisComparison(month);
  const billingModel = analysisBillingModelForMonth(month);
  const insights = buildAnalysisChangeInsights(month).slice(0, 3);
  els.monthlyAnalysisBody.innerHTML = [
    renderMonthlyAnalysisSummary(comparison),
    renderMonthlyAnalysisMetrics(comparison.current, billingModel),
    `<div class="monthly-analysis-main">
      <section class="analysis-panel analysis-waterfall-panel" aria-labelledby="monthlyAnalysisWaterfallTitle">
        <div class="analysis-panel-head">
          <div>
            <h3 id="monthlyAnalysisWaterfallTitle">전년 동월 대비 지출 변화 요인</h3>
            <p>${escapeHtml(comparison.comparisonMonth)}과 ${escapeHtml(month)}의 소비지출 차이를 섹터별로 분해합니다.</p>
          </div>
          <span class="analysis-unit">단위: 원</span>
        </div>
        ${renderMonthlyAnalysisWaterfall(comparison)}
      </section>
      <aside class="analysis-panel analysis-insight-panel" aria-labelledby="monthlyAnalysisInsightTitle">
        <div class="analysis-panel-head">
          <div>
            <h3 id="monthlyAnalysisInsightTitle">이번 달 핵심</h3>
            <p>변화 폭과 반복 여부를 함께 확인했습니다.</p>
          </div>
        </div>
        ${renderAnalysisInsightList(insights, "monthlyAnalysis")}
      </aside>
    </div>`,
    renderMonthlyAnalysisBilling(billingModel, comparison.current)
  ].join("");
  attachAnalysisInsightHandlers(els.monthlyAnalysisBody, insights, "monthlyAnalysis");
}

function renderMonthlyAnalysisSummary(comparison) {
  const current = comparison.current;
  let message = `${analysisMonthDisplay(current.month)}에 분석할 소비 기록이 없습니다.`;
  let tone = "neutral";
  if (current.expenseRows.length || current.income) {
    if (!current.income) {
      message = `수입이 입력되지 않아 자산 형성률을 계산할 수 없습니다. 소비지출은 ${formatWon(current.consumptionSpend)}입니다.`;
      tone = "warning";
    } else if (current.assetFormation >= 0) {
      message = `수입의 ${analysisPercentText(current.assetFormationRate)}를 자산으로 형성했습니다.`;
      tone = "positive";
    } else {
      message = `소비지출이 수입을 ${formatWon(Math.abs(current.assetFormation))} 초과했습니다.`;
      tone = "negative";
    }
    if (comparison.hasComparison && current.income && comparison.previous.income) {
      const direction = comparison.fixedCostRateDelta > 0 ? "높아졌습니다" : comparison.fixedCostRateDelta < 0 ? "낮아졌습니다" : "같습니다";
      message += ` 고정비 부담은 전년 동월보다 ${analysisPercentText(Math.abs(comparison.fixedCostRateDelta))}p ${direction}.`;
    } else if (comparison.hasComparison && current.income && !comparison.previous.income) {
      message += " 전년 동월 수입이 없어 고정비 부담 비교는 표시하지 않습니다.";
    } else if (!comparison.hasComparison) {
      message += " 전년 동월 자료가 없어 증감 비교는 표시하지 않습니다.";
    }
  }
  return `
    <section class="analysis-brief analysis-tone-${tone}" aria-label="월간 분석 요약">
      <i class="ti ti-chart-line" aria-hidden="true"></i>
      <strong>${escapeHtml(message)}</strong>
    </section>
  `;
}

function renderMonthlyAnalysisMetrics(snapshot, billingModel) {
  const metrics = [
    {
      icon: "ti-wallet",
      label: "월 잉여금",
      value: formatSignedWon(snapshot.freeBalance),
      note: "수입 − 소비지출 − 실제 저축",
      tone: snapshot.freeBalance >= 0 ? "positive" : "negative"
    },
    {
      icon: "ti-pig-money",
      label: "자산 형성률",
      value: snapshot.income ? analysisPercentText(snapshot.assetFormationRate) : "계산 불가",
      note: "(실제 저축 + 자유 잔액) ÷ 수입",
      tone: snapshot.income && snapshot.assetFormationRate >= 0 ? "positive" : "neutral"
    },
    {
      icon: "ti-building-bank",
      label: "고정비 부담",
      value: snapshot.income ? analysisPercentText(snapshot.fixedCostRate) : "계산 불가",
      note: "고정 주거비·반영된 반복 지출 ÷ 수입",
      tone: snapshot.income && snapshot.fixedCostRate > 50 ? "negative" : "neutral"
    },
    {
      icon: "ti-wallet",
      label: "카드 결제 예정",
      value: formatWon(billingModel?.expectedAmount || 0),
      note: billingModel
        ? `${formatAnalysisDate(billingModel.periodStart)}~${formatAnalysisDate(billingModel.periodEnd)} 사용분`
        : "결제 주기 설정 기준",
      tone: "neutral"
    }
  ];
  return `
    <section class="analysis-metric-strip" aria-label="월간 핵심 지표">
      ${metrics.map((metric) => `
        <article class="analysis-metric analysis-tone-${metric.tone}">
          <span class="analysis-metric-icon"><i class="ti ${escapeHtml(metric.icon)}" aria-hidden="true"></i></span>
          <div>
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
            <small>${escapeHtml(metric.note)}</small>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderMonthlyAnalysisWaterfall(comparison) {
  if (!comparison.hasComparison) {
    return `
      <div class="analysis-empty">
        <i class="ti ti-calendar" aria-hidden="true"></i>
        <strong>전년 동월 비교 데이터가 없습니다.</strong>
        <span>전월 값으로 대신하지 않고 동일한 달의 자료가 생기면 비교합니다.</span>
      </div>
    `;
  }

  const ordered = [...comparison.sectorChanges]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const primary = ordered.slice(0, 5);
  const rest = ordered.slice(5);
  if (rest.length) {
    primary.push({
      sector: "기타 섹터",
      delta: rest.reduce((total, item) => total + item.delta, 0),
      current: rest.reduce((total, item) => total + item.current, 0),
      previous: rest.reduce((total, item) => total + item.previous, 0)
    });
  }

  const items = [];
  let running = comparison.previous.consumptionSpend;
  items.push({
    label: comparison.comparisonMonth,
    type: "total",
    start: 0,
    end: running,
    value: running
  });
  primary.forEach((item) => {
    const next = running + item.delta;
    items.push({
      label: analysisWaterfallLabel(item.sector),
      type: item.delta > 0 ? "increase" : item.delta < 0 ? "decrease" : "neutral",
      start: running,
      end: next,
      value: item.delta
    });
    running = next;
  });
  items.push({
    label: comparison.current.month,
    type: "total",
    start: 0,
    end: comparison.current.consumptionSpend,
    value: comparison.current.consumptionSpend
  });

  const width = Math.max(760, items.length * 104);
  const height = 390;
  const margin = { top: 54, right: 26, bottom: 78, left: 76 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const domainValues = [
    0,
    comparison.previous.consumptionSpend,
    comparison.current.consumptionSpend,
    ...items.flatMap((item) => [item.start, item.end])
  ];
  const rawMinimum = Math.min(...domainValues);
  const rawMaximum = Math.max(...domainValues);
  const rawRange = Math.max(1, rawMaximum - rawMinimum);
  const domainMinimum = rawMinimum < 0 ? rawMinimum - rawRange * 0.12 : 0;
  const domainMaximum = rawMaximum + rawRange * 0.18;
  const domainRange = Math.max(1, domainMaximum - domainMinimum);
  const y = (value) => margin.top + (domainMaximum - value) / domainRange * plotHeight;
  const baseline = y(0);
  const plotBottom = margin.top + plotHeight;
  const step = plotWidth / items.length;
  const barWidth = Math.min(62, step * 0.62);
  const grids = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = domainMinimum + domainRange * ratio;
    const gridY = y(value);
    return `
      <line class="analysis-chart-grid" x1="${margin.left}" y1="${gridY}" x2="${width - margin.right}" y2="${gridY}"></line>
      <text class="analysis-chart-axis-label" x="${margin.left - 12}" y="${gridY + 4}" text-anchor="end">${escapeHtml(formatCompactWon(value))}</text>
    `;
  }).join("");
  const bars = items.map((item, index) => {
    const centerX = margin.left + step * index + step / 2;
    const topY = Math.min(y(item.start), y(item.end));
    const bottomY = Math.max(y(item.start), y(item.end));
    const barHeight = Math.max(3, bottomY - topY);
    const labelY = item.type === "decrease"
      ? Math.min(plotBottom - 8, bottomY + 18)
      : Math.max(22, topY - 10);
    const connector = index < items.length - 1
      ? `<line class="analysis-waterfall-connector" x1="${centerX + barWidth / 2}" y1="${y(item.end)}" x2="${centerX + step - barWidth / 2}" y2="${y(item.end)}"></line>`
      : "";
    return `
      <g class="analysis-waterfall-item analysis-waterfall-${item.type}">
        <rect x="${centerX - barWidth / 2}" y="${topY}" width="${barWidth}" height="${barHeight}" rx="5"></rect>
        ${connector}
        <text class="analysis-waterfall-value" x="${centerX}" y="${labelY}" text-anchor="middle">${escapeHtml(formatCompactWon(item.value))}</text>
        <text class="analysis-waterfall-label" x="${centerX}" y="${plotBottom + 30}" text-anchor="middle">${escapeHtml(item.label)}</text>
      </g>
    `;
  }).join("");

  return `
    <div class="analysis-chart-scroll" role="img" aria-label="${escapeHtml(`${comparison.comparisonMonth} 대비 ${comparison.current.month} 지출 변화 요인`)}" tabindex="0">
      <svg class="analysis-waterfall-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        ${grids}
        <line class="analysis-chart-baseline" x1="${margin.left}" y1="${baseline}" x2="${width - margin.right}" y2="${baseline}"></line>
        ${bars}
      </svg>
    </div>
    <div class="analysis-waterfall-totals">
      <span><small>${escapeHtml(comparison.comparisonMonth)} 소비지출</small><strong>${formatWon(comparison.previous.consumptionSpend)}</strong></span>
      <span class="${comparison.consumptionDelta > 0 ? "negative" : comparison.consumptionDelta < 0 ? "positive" : ""}"><small>총 변화</small><strong>${formatSignedWon(comparison.consumptionDelta)}</strong></span>
      <span><small>${escapeHtml(comparison.current.month)} 소비지출</small><strong>${formatWon(comparison.current.consumptionSpend)}</strong></span>
    </div>
  `;
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
          <p>등록된 결제 주기와 카드 거래만 반영합니다.</p>
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

function analysisWaterfallLabel(sector) {
  return {
    "고정 주거비": "주거비",
    "생활용품": "생활용품",
    "개인관리": "개인관리",
    "자기개발": "자기개발",
    "기타 소비": "기타 소비",
    "기타 섹터": "그 외"
  }[sector] || sector;
}
