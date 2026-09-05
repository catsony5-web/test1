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
  const { month, snapshot, analysis, billing } = model;
  const incomeKnown = analysis.currentIncomeKnown;
  const periodHint = analysis.isCurrentMonth ? "진행 중 · 선택 월에 등록된 전체 내역" : analysis.isFutureMonth ? "미래 월에 등록된 내역" : "선택 월 전체 내역";
  return `
    <article class="board-overview-hero" aria-labelledby="boardConsumptionTitle">
      <span class="board-overview-eyebrow">${escapeHtml(month)} · ${periodHint}</span>
      <h3 id="boardConsumptionTitle">소비지출</h3>
      <strong class="board-overview-total">${formatWon(snapshot.consumptionSpend)}</strong>
      <p class="board-overview-comparison">${escapeHtml(boardOverviewComparison(analysis))}</p>
      ${analysis.cutoffDay ? `<small>비교 금액 ${formatWon(analysis.currentPeriod.amount)} / 전월 ${formatWon(analysis.previousPeriod.amount)}${analysis.currentPeriod.undatedCount + analysis.previousPeriod.undatedCount > 0 ? " · 날짜 미확인 거래는 비교에서 제외" : ""}</small>` : ""}
      <div class="board-overview-hero-footer"><span>정산금 차감 후 · 적금/예금·대출 원금 제외</span><button type="button" data-board-route="calendar">소비 달력 보기 <span aria-hidden="true">→</span></button></div>
    </article>
    <div class="board-overview-money">
      <button type="button" class="board-overview-money-row" data-board-route="billing">
        <span><b>카드 결제 예정액</b><small>정산금 차감 전 · 소비에 다시 더하지 않음</small></span>
        <strong>${formatWon(billing.expectedAmount)} <span aria-hidden="true">›</span></strong>
      </button>
      <p class="board-overview-billing-note">이용 기간 ${escapeHtml(billing.periodStart.slice(5))}~${escapeHtml(billing.periodEnd.slice(5))} · 결제일 ${escapeHtml(billing.paymentDate.slice(5))}<br>등록 내역 기준 예상액으로 카드사 확정 청구액과 다를 수 있습니다.</p>
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

function renderBoardOverviewSectors(model) {
  const { sectors, snapshot } = model;
  return `<section class="board-overview-panel" aria-labelledby="boardSectorTitle">
    <header class="board-overview-panel-head"><div><h3 id="boardSectorTitle">어디에 썼나요?</h3><p>섹터별 소비 · 선택 월 전체</p></div><span>${sectors.length}개 섹터</span></header>
    <div class="board-overview-sector-list">
      ${sectors.length ? sectors.map((item) => {
        const share = snapshot.consumptionSpend > 0 ? Math.min(100, item.amount / snapshot.consumptionSpend * 100) : 0;
        return `<button type="button" class="board-overview-sector" data-board-summary-sector="${escapeHtml(item.sector)}" aria-label="${escapeHtml(item.sector)}, ${formatWon(item.amount)}, ${share.toFixed(1)}%, 상세 내역 보기">
          <span class="board-overview-sector-name"><i class="ti ${sectorIconClass(item.sector)}" aria-hidden="true"></i><b>${escapeHtml(item.sector)}</b></span>
          <span class="board-overview-sector-amount">${formatWon(item.amount)}<small>${share.toFixed(1)}%</small></span>
          <meter min="0" max="100" value="${share}" aria-label="${escapeHtml(item.sector)} 소비 비중">${share.toFixed(1)}%</meter>
        </button>`;
      }).join("") : `<div class="board-overview-empty">이 달에 기록된 소비지출이 없습니다.<br>거래를 입력하면 섹터별 금액을 볼 수 있습니다.</div>`}
    </div>
    <p class="board-overview-panel-foot">금액이 큰 순서입니다. 항목을 누르면 해당 섹터의 거래를 확인할 수 있습니다.</p>
  </section>`;
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

function renderBoardOverviewFooter(model) {
  const { snapshot } = model;
  // 완료된 달만 추이에 포함해 진행 월을 소비 감소로 오해하지 않도록 한다.
  const endMonth = model.analysis.isCurrentMonth || model.analysis.isFutureMonth ? shiftMonthKey(model.today.slice(0, 7), -1) : model.month;
  const points = boardLongTermMonthKeys(endMonth, 3).map((month) => {
    const monthSnapshot = buildAnalysisMonthSnapshot(month);
    return { month, amount: monthSnapshot.consumptionSpend, hasData: monthSnapshot.expenseRows.length > 0 };
  });
  return `<div class="board-overview-bottom">
    <section class="board-overview-panel"><header class="board-overview-panel-head"><div><h3>다음으로 확인할 것</h3><p>소비 합계와 따로 확인하세요</p></div></header>
      <button type="button" class="board-overview-check" data-board-route="recurring"><span><b>미반영 고정 지출 예정</b><small>${model.pendingCount}건 · 대출 등 등록된 예정 항목 포함</small></span><strong>${formatWon(model.pendingAmount)} <span aria-hidden="true">›</span></strong></button>
      <button type="button" class="board-overview-check" data-board-unknown><span><b>미분류 내역 확인</b><small>${model.unknownCount ? `${model.unknownCount}건 · 분류하면 소비 구성이 더 정확해져요` : "분류가 필요한 내역이 없습니다"}</small></span><strong>${formatWon(model.unknownAmount)} <span aria-hidden="true">›</span></strong></button>
    </section>
    <section class="board-overview-panel"><header class="board-overview-panel-head"><div><h3>최근 완료된 3개월 소비</h3><p>진행 중인 달은 제외 · 자료 없음과 0원 구분</p></div></header>
      ${points.every((point) => point.hasData) ? renderBoardThreeMonthSparkline(points) : ""}
      <div class="board-overview-history">${points.map((point) => `<div><span>${escapeHtml(point.month)}</span><strong>${point.hasData ? formatWon(point.amount) : "자료 없음"}</strong></div>`).join("")}</div>
    </section>
  </div>
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
