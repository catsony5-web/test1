function buildBoardOverviewModel(month, today = defaultDateForMonth("")) {
  const analysis = buildMonthlyAnalysisModel(month, "previous", today);
  if (!analysis) return null;
  const snapshot = analysis.current;
  const sectors = buildSectorSpendRows(snapshot.consumptionRows).filter((item) => item.amount > 0);
  const grouped = groupBy(snapshot.consumptionRows, (item) => JSON.stringify([item.sector || "미분류", item.subcategory || "미분류"]));
  const topCategories = [...grouped.entries()].map(([key, rows]) => {
    const [sector, subcategory] = JSON.parse(key);
    return { sector, subcategory, amount: sumConsumption(rows), count: rows.filter((row) => consumptionAmount(row) > 0).length };
  }).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const pending = recurringOccurrencesForMonth(month, { showHidden: true }).filter((item) => !item.posted);
  return {
    month, today, analysis, snapshot, sectors, topCategories,
    billing: buildCalendarCardBillingModel(month),
    pendingCount: pending.length,
    pendingAmount: sum(pending, "amount"),
    unknownAmount: sumConsumption(snapshot.unknownRows),
    unknownCount: snapshot.unknownRows.length
  };
}

function boardOverviewComparison(analysis) {
  if (analysis.isFutureMonth) return "미래 월 기록 · 소비 비교는 아직 하지 않습니다";
  if (!analysis.canCompareConsumption) return "비교할 소비 기록이 부족합니다";
  const period = analysis.cutoffDay ? `전월과 같은 1~${analysis.cutoffDay}일` : "전월 전체";
  const delta = analysis.consumptionDelta;
  const change = delta === 0 ? "같은 금액" : `${formatWon(Math.abs(delta))} ${delta > 0 ? "더 사용" : "덜 사용"}`;
  return `${period} 비교 · ${change}`;
}

function renderBoardOverviewMetrics(model) {
  const { month, snapshot, analysis } = model;
  const incomeKnown = analysis.currentIncomeKnown;
  const comparisonTone = analysis.canCompareConsumption && analysis.consumptionDelta !== 0
    ? (analysis.consumptionDelta > 0 ? "is-increase" : "is-decrease") : "";
  const periodHint = analysis.isCurrentMonth ? "진행 중 · 선택 월에 등록된 전체 내역" : analysis.isFutureMonth ? "미래 월에 등록된 내역" : "선택 월 전체 내역";
  return `
    <article class="board-overview-hero" aria-labelledby="boardConsumptionTitle">
      <div class="board-overview-hero-copy">
      <span class="board-overview-eyebrow">${escapeHtml(month)} · ${periodHint}</span>
      <h3 id="boardConsumptionTitle">${analysis.isCurrentMonth ? "이번 달" : "선택 월"} 소비지출</h3>
      <strong class="board-overview-total">${formatWon(snapshot.consumptionSpend)}</strong>
      <p class="board-overview-comparison ${comparisonTone}">${escapeHtml(boardOverviewComparison(analysis))}</p>
      ${analysis.cutoffDay ? `<small>비교 금액 ${formatWon(analysis.currentPeriod.amount)} / 전월 ${formatWon(analysis.previousPeriod.amount)}${analysis.currentPeriod.undatedCount + analysis.previousPeriod.undatedCount > 0 ? " · 날짜 미확인 거래는 비교에서 제외" : ""}</small>` : ""}
      </div>
      ${renderBoardOverviewTrend(model)}
      <div class="board-overview-hero-footer"><span>정산금 차감 후 · 적금/예금·대출 원금 제외</span><button type="button" data-board-route="calendar">소비 달력 보기 <span aria-hidden="true">→</span></button></div>
    </article>
    <div class="board-overview-money">
      <button type="button" class="board-overview-money-row" data-open-income-month="${escapeHtml(month)}">
        <span><b>수입</b><small>${incomeKnown ? "선택 월에 기록한 수입" : "수입을 입력하면 남은 돈도 확인할 수 있어요"}</small></span>
        <strong class="${incomeKnown ? "board-overview-positive" : "board-overview-missing"}">${incomeKnown ? formatWon(snapshot.income) : "수입 입력 필요"} <span aria-hidden="true">›</span></strong>
      </button>
      <article class="board-overview-money-row">
        <span><b>기록 기준 남은 돈</b><small>소비·저축·내 원금 부담과 가족 정산 반영</small></span>
        <strong class="${!incomeKnown ? "board-overview-missing" : snapshot.freeBalance < 0 ? "board-overview-negative" : "board-overview-positive"}">${incomeKnown ? formatSignedWon(snapshot.freeBalance) : "계산 대기"}</strong>
      </article>
      <p class="board-overview-balance-note">통장 잔액이나 앞으로 써도 되는 예산은 아닙니다. 미반영 예정 지출은 아직 차감하지 않았습니다.</p>
    </div>`;
}

function buildBoardDailySeries(rows, month, dayCount) {
  if (!isValidMonthKey(month)) return { values: [], undatedCount: 0 };
  const [year, monthNumber] = month.split("-").map(Number);
  const days = Math.max(0, Math.min(new Date(year, monthNumber, 0).getDate(), Math.floor(Number(dayCount) || 0)));
  const values = Array(days).fill(0);
  let undatedCount = 0;
  rows.forEach((row) => {
    const date = monthlyAnalysisDate(row, month);
    if (!date) { undatedCount += 1; return; }
    const index = Number(date.slice(8)) - 1;
    if (index < days) values[index] += consumptionAmount(row);
  });
  for (let index = 1; index < values.length; index += 1) values[index] += values[index - 1];
  return { values, undatedCount };
}

function renderBoardOverviewTrend(model) {
  const { analysis } = model;
  if (!analysis.canCompareConsumption) return `<div class="board-overview-trend board-overview-trend-empty"><i class="ti ti-chart-line" aria-hidden="true"></i><p>${escapeHtml(boardOverviewComparison(analysis))}</p></div>`;
  const days = analysis.cutoffDay || 31;
  const current = buildBoardDailySeries(analysis.currentPeriod.rows, model.month, days);
  const previous = buildBoardDailySeries(analysis.previousPeriod.rows, analysis.comparisonMonth, days);
  if (!analysis.currentPeriod.rows.some((row) => monthlyAnalysisDate(row, model.month))
    || !analysis.previousPeriod.rows.some((row) => monthlyAnalysisDate(row, analysis.comparisonMonth))) {
    return `<div class="board-overview-trend board-overview-trend-empty"><p>날짜가 확인된 거래가 부족해 추이를 표시하지 않습니다.</p></div>`;
  }
  const maximum = Math.max(1, ...current.values, ...previous.values);
  const length = Math.max(current.values.length, previous.values.length);
  const points = (values) => [0, ...values].map((amount, index) => `${8 + index / length * 264},${144 - amount / maximum * 128}`).join(" ");
  const undated = current.undatedCount + previous.undatedCount;
  return `<figure class="board-overview-trend">
    <figcaption class="board-overview-chart-legend"><span class="is-previous">전월${analysis.cutoffDay ? " 같은 기간" : ""}</span><span class="is-current">선택 월</span></figcaption>
    <svg class="board-overview-line-chart" viewBox="0 0 280 154" role="img" aria-label="날짜별 누적 소비지출: 선택 월 ${formatWon(current.values.at(-1) || 0)}, 전월 ${formatWon(previous.values.at(-1) || 0)}">
      <line class="board-overview-line-baseline" x1="8" y1="144" x2="272" y2="144" />
      <polyline class="board-overview-line-previous" points="${points(previous.values)}" fill="none" />
      <polyline class="board-overview-line-current" points="${points(current.values)}" fill="none" />
    </svg>
    <div class="board-overview-chart-range"><span>1일</span><span>누적 소비 · ${length}일</span></div>
    ${undated ? `<small>날짜 미확인 ${undated}건은 추이에서 제외</small>` : ""}
  </figure>`;
}

function buildBoardSectorShares(model) {
  const total = model.sectors.reduce((amount, item) => amount + item.amount, 0);
  const canShowShare = model.snapshot.consumptionSpend > 0 && total > 0 && model.sectors.every((item) => item.amount >= 0);
  return model.sectors.map((item) => ({ ...item, share: canShowShare ? item.amount / total * 100 : null }));
}

function renderBoardOverviewSectors(model) {
  const sectors = buildBoardSectorShares(model);
  const leading = sectors[0];
  const canShowDonut = leading && leading.share !== null;
  let offset = 0;
  const segments = canShowDonut ? sectors.map((item) => {
    const segment = `<circle cx="160" cy="160" r="125" pathLength="100" fill="none" stroke="var(--sector-${categoryClass(item.sector)}-solid)" stroke-width="50" stroke-dasharray="${Math.max(0, item.share - Math.min(0.5, item.share / 5))} ${100 - Math.max(0, item.share - Math.min(0.5, item.share / 5))}" stroke-dashoffset="${-offset}" transform="rotate(-90 160 160)"><title>${escapeHtml(item.sector)} ${formatWon(item.amount)} · ${item.share.toFixed(1)}%</title></circle>`;
    offset += item.share;
    return segment;
  }).join("") : "";
  return `<section class="board-overview-panel board-overview-sector-panel" aria-labelledby="boardSectorTitle">
    <header class="board-overview-panel-head"><div><h3 id="boardSectorTitle">소비의 모양</h3><p>어디에 썼나요? · 선택 월 전체 소비</p></div><span>${sectors.length}개 섹터</span></header>
    <div class="${canShowDonut ? "board-overview-sector-layout" : "board-overview-sector-fallback"}">
    ${canShowDonut ? `<div class="board-overview-donut-wrap"><svg class="board-overview-donut" viewBox="0 0 320 320" role="img" aria-label="섹터별 소비 비중. 가장 많이 쓴 섹터 ${escapeHtml(leading.sector)}, ${leading.share.toFixed(1)}%">${segments}</svg><div class="board-overview-donut-label"><b>${escapeHtml(leading.sector)}</b><strong>${leading.share.toFixed(1)}%</strong><small>${formatWon(leading.amount)}</small></div></div>` : ""}
    <div class="board-overview-sector-list">
      ${sectors.length ? sectors.map((item, index) => {
        const shareLabel = item.share === null ? "비중 제외" : `${item.share.toFixed(1)}%`;
        return `<button type="button" class="board-overview-sector ${index === 0 ? "is-leading" : ""}" style="--board-sector-color:var(--sector-${categoryClass(item.sector)}-solid)" data-board-summary-sector="${escapeHtml(item.sector)}" aria-label="${escapeHtml(item.sector)}, ${formatWon(item.amount)}, ${shareLabel}, 상세 내역 보기">
          <span class="board-overview-sector-dot" aria-hidden="true"></span><b class="board-overview-sector-name">${escapeHtml(item.sector)}</b>
          <strong class="board-overview-sector-amount">${formatWon(item.amount)}</strong><small class="board-overview-sector-share">${shareLabel}</small>
        </button>`;
      }).join("") : `<div class="board-overview-empty">이 달에 기록된 소비지출이 없습니다.<br>거래를 입력하면 섹터별 금액을 볼 수 있습니다.</div>`}
    </div>
    </div>
    <p class="board-overview-panel-foot">${sectors.length && !canShowDonut ? "순소비가 0원 이하이거나 환급이 있어 비중 대신 금액을 표시합니다. " : ""}섹터를 선택해 거래 자세히 보기 <span aria-hidden="true">→</span></p>
  </section>`;
}

function renderBoardOverviewBilling(model) {
  const { billing } = model;
  const start = Date.parse(`${billing.periodStart}T12:00:00Z`);
  const due = Date.parse(`${billing.paymentDate}T12:00:00Z`);
  const today = Date.parse(`${model.today}T12:00:00Z`);
  const progress = due > start ? Math.max(0, Math.min(100, (today - start) / (due - start) * 100)) : 0;
  const dueLabel = `${Number(billing.paymentDate.slice(5, 7))}월 ${Number(billing.paymentDate.slice(8))}일`;
  const timelineLabel = today < start ? "이용 기간 시작 전" : today > due ? "결제일 지남" : `오늘 ${Number(model.today.slice(5, 7))}.${Number(model.today.slice(8))}`;
  return `<div class="board-overview-next">
    <article class="board-overview-billing" aria-labelledby="boardBillingTitle">
      <header><i class="ti ti-wallet" aria-hidden="true"></i><h3 id="boardBillingTitle">${today > due ? "선택 월" : "다음"} 카드 결제</h3></header>
      <p class="board-overview-due">${dueLabel}</p><strong class="board-overview-billing-total">${formatWon(billing.expectedAmount)}</strong>
      <div class="board-overview-timeline" aria-label="${escapeHtml(timelineLabel)} · 결제일 ${escapeHtml(billing.paymentDate)}">
        <div class="board-overview-timeline-track" aria-hidden="true"><span style="width:${progress}%"></span></div>
        <div class="board-overview-timeline-labels"><span>${escapeHtml(timelineLabel)}</span><span>결제일 ${dueLabel}</span></div>
      </div>
      <button type="button" data-board-route="billing">청구 상세 보기 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      <p class="board-overview-billing-note">이용 기간 ${escapeHtml(billing.periodStart.slice(5))}~${escapeHtml(billing.periodEnd.slice(5))} · 등록 내역 기준 예상액<br>카드사 확정 청구액과 다를 수 있으며, 소비지출에 다시 더하지 않습니다.</p>
    </article>
    <button type="button" class="board-overview-check" data-board-unknown><i class="ti ti-alert-circle" aria-hidden="true"></i><span><b>${model.unknownCount ? `미분류 ${model.unknownCount}건 정리하기` : "미분류 내역 없음"}</b><small>${model.unknownCount ? `${formatWon(model.unknownAmount)} · 소비 구성을 더 정확하게` : "분류가 필요한 내역이 없습니다"}</small></span><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
    <button type="button" class="board-overview-check" data-board-route="recurring"><i class="ti ti-repeat" aria-hidden="true"></i><span><b>고정 지출 확인</b><small>미반영 예정 ${model.pendingCount}건 · ${formatWon(model.pendingAmount)}</small></span><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
  </div>`;
}

function renderBoardOverviewTop(model) {
  return `<section class="board-overview-panel" aria-labelledby="boardTopTitle">
    <header class="board-overview-panel-head"><div><h3 id="boardTopTitle">많이 쓴 항목 TOP 5</h3><p>정산 후 소비지출 기준</p></div><button type="button" data-open-detail-month="${escapeHtml(model.month)}">전체 내역 <span aria-hidden="true">→</span></button></header>
    <ol class="board-overview-top-list">${model.topCategories.map((item, index) => `
      <li><button type="button" data-board-top-sector="${escapeHtml(item.sector)}" data-board-top-subcategory="${escapeHtml(item.subcategory)}">
        <span class="board-overview-rank">${index + 1}</span><span class="board-overview-top-name"><b>${escapeHtml(item.subcategory)}</b><small>${escapeHtml(item.sector)} · ${item.count}건</small></span><strong>${formatWon(item.amount)}</strong><span aria-hidden="true">›</span>
      </button></li>`).join("")}</ol>
    ${!model.topCategories.length ? `<div class="board-overview-empty">순위를 표시할 소비 내역이 없습니다.</div>` : ""}
    <p class="board-overview-panel-foot">내 소비를 이해하는 순위입니다. 필요한 지출까지 과소비로 판단하지 않습니다.</p>
  </section>`;
}

function buildBoardHistoryPoints(model) {
  // 완료된 달만 추이에 포함해 진행 월을 소비 감소로 오해하지 않도록 한다.
  const endMonth = model.analysis.isCurrentMonth || model.analysis.isFutureMonth ? shiftMonthKey(model.today.slice(0, 7), -1) : model.month;
  return boardLongTermMonthKeys(endMonth, 3).map((month) => {
    const monthSnapshot = buildAnalysisMonthSnapshot(month);
    return { month, amount: monthSnapshot.consumptionSpend, hasData: monthSnapshot.expenseRows.length > 0,
      dailySeries: buildBoardDailySeries(monthSnapshot.consumptionRows, month, 31) };
  });
}

function renderBoardHistoryMonth(point, maximum) {
  const daily = point.dailySeries.values.map((amount, index, values) => amount - (values[index - 1] || 0));
  const hasDatedSpending = daily.some((amount) => amount !== 0);
  const bars = hasDatedSpending ? `<svg class="board-overview-history-bars" viewBox="0 0 155 48" role="img" aria-label="${escapeHtml(point.month)} 날짜별 소비지출${point.dailySeries.undatedCount ? ", 날짜 미확인 제외" : ""}">${daily.map((amount, index) => `<rect x="${index * 5}" y="${46 - Math.max(0, amount) / maximum * 42}" width="3" height="${Math.max(0, amount) / maximum * 42}" rx="1.5"><title>${index + 1}일 ${formatWon(amount)}</title></rect>`).join("")}</svg>` : "";
  return `<button type="button" class="board-overview-history-month" data-open-detail-month="${escapeHtml(point.month)}"><span class="board-overview-history-value"><span>${escapeHtml(analysisMonthDisplay(point.month))}</span><strong>${point.hasData ? formatWon(point.amount) : "자료 없음"}</strong></span>${bars}</button>`;
}

function renderBoardOverviewFooter(model) {
  const { snapshot } = model;
  const points = buildBoardHistoryPoints(model);
  const maximum = Math.max(1, ...points.flatMap((point) => point.dailySeries.values.map((value, index, values) => value - (values[index - 1] || 0))));
  return `<section class="board-overview-history-panel"><header class="board-overview-panel-head"><div><h3>최근 완료된 3개월 소비</h3><p>진행 중인 달 제외 · 막대는 날짜별 소비</p></div></header>
    <div class="board-overview-history"><div class="board-overview-history-pair">${points.slice(0, 2).map((point) => renderBoardHistoryMonth(point, maximum)).join("")}</div>${renderBoardHistoryMonth(points[2], maximum)}</div>
  </section>
  <details class="board-overview-top-details"><summary>많이 쓴 항목 TOP 5 <span>자세히 보기</span></summary>${renderBoardOverviewTop(model)}</details>
  <details class="board-overview-extras"><summary>정산·저축·대출 원금 및 계산 기준 <span>소비와 따로 보기</span></summary>
    <dl><div><dt>정산받은 금액</dt><dd>${formatWon(snapshot.reimbursement)}</dd></div><div><dt>적금·예금</dt><dd>${formatWon(snapshot.actualSavings)}</dd></div><div><dt>내 대출 원금 부담</dt><dd>${formatWon(snapshot.debtRepayment)}</dd></div><div><dt>가족 정산 조정</dt><dd>${formatSignedWon(snapshot.loanSettlementDelta)}</dd></div></dl>
    <p>남은 돈 = 수입 − 소비지출 − 적금·예금 − 내 대출 원금 부담 + 가족 정산 조정. 월세·보험·식비·대출 이자는 소비에 포함됩니다. 카드 결제 예정액은 별도 청구 기준이므로 다시 차감하지 않습니다.</p>
  </details>`;
}

function attachBoardOverviewHandlers(month) {
  document.querySelectorAll("#boardView [data-board-route]").forEach((button) => {
    button.addEventListener("click", () => {
      setSharedSelectedMonth(month, { syncControls: false });
      const route = button.dataset.boardRoute;
      if (route === "calendar" || route === "billing") {
        selectedCalendarMonth = month;
        calendarBillingExpanded = route === "billing";
        switchView("calendar");
      } else switchView(route);
    });
  });
  document.querySelectorAll("#boardView [data-board-unknown]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(boardDetailOptions({ month, sector: "미분류" })));
  });
}
