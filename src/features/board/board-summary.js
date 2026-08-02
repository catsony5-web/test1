function renderBoardMetric(label, amount, hint, tone) {
  return `
    <article class="board-metric ${tone}">
      <span class="metric-dot"></span>
      <div>
        <small>${escapeHtml(label)}</small>
        <strong>${formatWon(amount)}</strong>
        <em>${escapeHtml(hint)}</em>
      </div>
    </article>
  `;
}

function boardMetricTrend(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) {
    return { text: "비교 없음", tone: "neutral", icon: "" };
  }
  const rate = (currentValue - previousValue) / Math.abs(previousValue) * 100;
  if (Math.abs(rate) < 0.05) return { text: "0.0%", tone: "neutral", icon: "" };
  return {
    text: formatBoardSignedPercent(rate),
    tone: rate > 0 ? "increase" : "decrease",
    icon: "ti-chevron-down"
  };
}

function renderBoardCoreMetrics({ selectedMonth, totalPayment, reimbursementTotal, totalSpend, debtRepayment, income, net, scheduledTotal, unknownTotal, previous = {} }) {
  return [
    renderBoardCoreMetric("현금 유출", formatWon(totalSpend), totalSpend, previous.totalSpend, "navy", { month: selectedMonth }, "major"),
    renderBoardCoreMetric("총수입", formatWon(income), income, previous.income, "green", { incomeMonth: selectedMonth }, "major"),
    renderBoardCoreMetric("잔액", formatSignedWon(net), net, previous.net, net < 0 ? "red" : "navy", {}, "major"),
    renderBoardCoreMetric("총 결제액", formatWon(totalPayment), totalPayment, previous.totalPayment, "navy", { month: selectedMonth }, "minor"),
    renderBoardCoreMetric("정산받은 금액", formatWon(reimbursementTotal), reimbursementTotal, previous.reimbursementTotal, "navy", { month: selectedMonth }, "minor"),
    renderBoardCoreMetric("내 원금 부담", formatWon(debtRepayment), debtRepayment, previous.debtRepayment, "green", {}, "minor"),
    renderBoardCoreMetric("미분류", formatWon(unknownTotal), unknownTotal, previous.unknownTotal, "navy", { month: selectedMonth, sector: "미분류" }, "minor"),
    renderBoardCoreMetric("예정 지출", formatWon(scheduledTotal), scheduledTotal, previous.scheduledTotal, "navy", {}, "minor")
  ].join("");
}

function renderBoardCoreMetric(label, value, current, previous, tone, detail = {}, variant = "minor") {
  const attrs = detail.incomeMonth
    ? ` data-open-income-month="${escapeHtml(detail.incomeMonth)}"`
    : detail.month || detail.sector
    ? ` data-board-core-month="${escapeHtml(detail.month || "")}" data-board-core-sector="${escapeHtml(detail.sector || "all")}"`
    : "";
  const variantClass = `board-core-${escapeHtml(variant)}`;
  const trend = boardMetricTrend(current, previous);
  const tagOpen = attrs
    ? `<button type="button" class="board-metric board-core-metric ${variantClass} ${escapeHtml(tone)}"${attrs}>`
    : `<article class="board-metric board-core-metric ${variantClass} ${escapeHtml(tone)}">`;
  const tagClose = attrs ? "button" : "article";
  return `
    ${tagOpen}
      <div class="board-core-metric-content">
        <small class="board-core-label">${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span class="board-core-trend-row">
          <em>전월 대비</em>
          <span class="board-core-trend ${trend.tone}">${escapeHtml(trend.text)}${trend.icon ? ` <i class="ti ${trend.icon}" aria-hidden="true"></i>` : ""}</span>
        </span>
      </div>
    </${tagClose}>
  `;
}

function attachBoardMetricHandlers() {
  els.boardMetrics.querySelectorAll("[data-open-income-month]").forEach((button) => {
    button.addEventListener("click", () => {
      openIncomeView({ month: button.dataset.openIncomeMonth || els.boardMonth.value, source: "board", scrollToRecords: true });
    });
  });
  els.boardMetrics.querySelectorAll("[data-board-core-month]").forEach((button) => {
    button.addEventListener("click", () => {
      openDetailView(boardDetailOptions({
        month: button.dataset.boardCoreMonth || els.boardMonth.value,
        sector: button.dataset.boardCoreSector || "all"
      }));
    });
  });
}

function boardLongTermMonthKeys(selectedMonth, count, offset = 0) {
  const anchor = isValidMonthKey(selectedMonth) ? selectedMonth : currentMonthKey();
  return Array.from({ length: count }, (_, index) => shiftMonthKey(anchor, offset - (count - 1 - index)));
}

function formatBoardSignedPercent(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function renderBoardThreeMonthSparkline(points) {
  const width = 240;
  const height = 58;
  const padX = 14;
  const padY = 10;
  const values = points.map((point) => Number(point.amount || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: padX + index * ((width - padX * 2) / Math.max(points.length - 1, 1)),
    y: range > 0
      ? padY + (max - point.amount) / range * (height - padY * 2)
      : height / 2
  }));
  const path = coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const ariaLabel = coordinates.map((point) => `${point.month} ${formatWon(point.amount)}`).join(", ");
  return `
    <svg class="board-long-term-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="최근 3개월 실 지출 변화: ${escapeHtml(ariaLabel)}">
      <path class="board-long-term-sparkline-path" d="${path}"></path>
      ${coordinates.map((point) => `
        <g>
          <title>${escapeHtml(point.month)} ${formatWon(point.amount)}</title>
          <circle class="board-long-term-sparkline-dot" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4"></circle>
        </g>
      `).join("")}
    </svg>
  `;
}

function renderBoardLongTermIndicators(activeRows, selectedMonth) {
  const periodMonths = boardLongTermMonthKeys(selectedMonth, 12);
  const previousMonths = boardLongTermMonthKeys(selectedMonth, 12, -12);
  const periodMonthSet = new Set(periodMonths);
  const previousMonthSet = new Set(previousMonths);
  const periodRows = activeRows.filter((item) => periodMonthSet.has(item.month));
  const previousRows = activeRows.filter((item) => previousMonthSet.has(item.month));
  const monthSummaries = periodMonths.map((month) => ({
    month,
    amount: sumConsumption(periodRows.filter((item) => item.month === month))
  }));
  const total = sumConsumption(periodRows);
  const previousTotal = sumConsumption(previousRows);
  const average = Math.round(total / periodMonths.length);
  const yearRate = previousTotal > 0 ? (total - previousTotal) / previousTotal * 100 : null;
  const comparisonTone = yearRate === null || yearRate === 0 ? "neutral" : yearRate > 0 ? "negative" : "positive";
  const topMonth = [...monthSummaries].sort((a, b) => b.amount - a.amount)[0] || { month: selectedMonth, amount: 0 };
  const topSector = buildSectorSpendRows(periodRows).filter((item) => item.amount > 0)[0] || { sector: "-", amount: 0, count: 0 };
  const recent = monthSummaries.slice(-3);
  return `
    <section class="board-long-term-card" aria-labelledby="boardLongTermTitle">
      <div class="board-long-term-head">
        <div>
          <h3 id="boardLongTermTitle">장기 소비 지표</h3>
        </div>
      </div>
      <div class="board-long-term-grid">
        <div class="board-long-term-item">
          <span class="board-long-term-label"><i class="ti ti-chart-line" aria-hidden="true"></i>최근 12개월 월평균</span>
          <strong>${formatWon(average)}</strong>
          <small class="${comparisonTone}">${yearRate === null ? "전년 동기 비교 없음" : `전년 동기 대비 ${formatBoardSignedPercent(yearRate)}`}</small>
        </div>
        <div class="board-long-term-item board-long-term-trend">
          <span class="board-long-term-label">최근 3개월 변화</span>
          ${renderBoardThreeMonthSparkline(recent)}
          <div class="board-long-term-months">
            ${recent.map((point) => `
              <button type="button" data-board-period-detail="${escapeHtml(point.month)}" aria-label="${escapeHtml(`${point.month} ${formatWon(point.amount)} 상세 내역 보기`)}">
                <span>${escapeHtml(point.month)}</span>
                <b>${formatWon(point.amount)}</b>
              </button>
            `).join("")}
          </div>
        </div>
        <button type="button" class="board-long-term-item" data-board-period-detail="${escapeHtml(topMonth.month)}">
          <span class="board-long-term-label"><i class="ti ti-calendar-month" aria-hidden="true"></i>가장 많이 쓴 달</span>
          <strong>${escapeHtml(topMonth.month)}</strong>
          <small>${formatWon(topMonth.amount)}</small>
        </button>
        <button type="button" class="board-long-term-item" data-board-period-sector="${escapeHtml(topSector.sector === "-" ? "all" : topSector.sector)}">
          <span class="board-long-term-label"><i class="ti ${sectorIconClass(topSector.sector)}" aria-hidden="true"></i>최대 소비 섹터</span>
          <strong>${escapeHtml(topSector.sector)}</strong>
          <small>월평균 ${formatWon(Math.round(topSector.amount / periodMonths.length))} · ${formatPercent(topSector.amount, total)}</small>
        </button>
      </div>
    </section>
  `;
}

function renderBoardPeriodStats(periodRows, periodMonths, preset, selectedMonth, options = {}) {
  const label = options.label || (preset === "all" ? "전체 기간" : preset === "year" ? "올해" : preset === "recent-24" ? "최근 2년" : "최근 1년");
  if (!periodMonths.length) {
    return `
      <section class="board-period-card">
        <div class="board-period-head">
          <div>
            <h3>${escapeHtml(label)} 통계</h3>
            <p>선택한 기간의 누적 지출과 월평균을 보여줍니다.</p>
          </div>
        </div>
        <div class="empty compact-empty">기간 내 지출 기록이 없습니다.</div>
      </section>
    `;
  }
  const allExpenseRows = reportingExpenseRows(classified);
  const monthSummaries = periodMonths.map((month) => {
    const rows = periodRows.filter((item) => item.month === month);
    const spend = sumConsumption(rows);
    const debt = sumDebtPrincipal(rows);
    const income = Number(monthlyIncome[month] || 0) + importedIncomeForMonth(month);
    const settlement = loanSupportSettlementDeltaForMonth(allExpenseRows, month);
    return { month, amount: spend, income, debt, settlement, net: income - spend - debt + settlement, count: rows.length };
  });
  const total = sumConsumption(periodRows);
  const debtRepayment = sumDebtPrincipal(periodRows);
  const totalIncome = periodMonths.reduce((amount, month) => amount + Number(monthlyIncome[month] || 0) + importedIncomeForMonth(month), 0);
  const settlementDelta = periodMonths.reduce((amount, month) => amount + loanSupportSettlementDeltaForMonth(allExpenseRows, month), 0);
  const periodNet = totalIncome - total - debtRepayment + settlementDelta;
  const average = Math.round(total / Math.max(periodMonths.length, 1));
  const topMonth = [...monthSummaries].sort((a, b) => b.amount - a.amount)[0] || { month: selectedMonth, amount: 0 };
  const lowMonth = [...monthSummaries].sort((a, b) => a.amount - b.amount)[0] || { month: selectedMonth, amount: 0 };
  const topSector = buildSectorSpendRows(periodRows)[0] || { sector: "-", amount: 0, count: 0 };
  return `
    <section class="board-period-card">
      <div class="board-period-head">
        <div>
          <h3>${escapeHtml(label)} 통계</h3>
          <p>${escapeHtml(periodMonths[0] || "-")} ~ ${escapeHtml(periodMonths.at(-1) || "-")} 기준으로 소비 흐름을 요약합니다.</p>
        </div>
        <span>${periodMonths.length.toLocaleString("ko-KR")}개월</span>
      </div>
      <div class="board-period-grid">
        <button type="button" data-board-period-detail="${escapeHtml(periodMonths.at(-1) || selectedMonth || "")}">
          <span>기간 분석 반영액</span>
          <strong>${formatWon(total)}</strong>
          <small>대출 원금 제외 · ${periodRows.length.toLocaleString("ko-KR")}건</small>
        </button>
        <button type="button" data-open-income-month="${escapeHtml(periodMonths.at(-1) || selectedMonth || "")}">
          <span>기간 총수입</span>
          <strong>${formatWon(totalIncome)}</strong>
          <small>${periodMonths.length.toLocaleString("ko-KR")}개월 합계</small>
        </button>
        <div>
          <span>기간 잔액</span>
          <strong class="${periodNet >= 0 ? "positive" : "negative"}">${formatSignedWon(periodNet)}</strong>
          <small>총수입 - 분석 반영액 - 내 원금 부담 ${formatWon(debtRepayment)}</small>
        </div>
        <div>
          <span>월평균 분석 반영액</span>
          <strong>${formatWon(average)}</strong>
          <small>기간 월수 기준</small>
        </div>
        <button type="button" data-board-period-detail="${escapeHtml(topMonth.month || selectedMonth || "")}">
          <span>가장 많이 쓴 월</span>
          <strong>${escapeHtml(topMonth.month || "-")}</strong>
          <small>${formatWon(topMonth.amount)}</small>
        </button>
        <button type="button" data-board-period-detail="${escapeHtml(lowMonth.month || selectedMonth || "")}">
          <span>가장 적게 쓴 월</span>
          <strong>${escapeHtml(lowMonth.month || "-")}</strong>
          <small>${formatWon(lowMonth.amount)}</small>
        </button>
        <button type="button" data-board-period-sector="${escapeHtml(topSector.sector || "all")}">
          <span>최다 섹터</span>
          <strong>${escapeHtml(topSector.sector || "-")}</strong>
          <small>${formatWon(topSector.amount)} · ${topSector.count.toLocaleString("ko-KR")}건</small>
        </button>
      </div>
    </section>
  `;
}

function attachBoardPeriodHandlers(root = els.boardPeriodStats, fallbackMonth = els.boardMonth?.value || currentMonthKey(), source = "board") {
  if (!root) return;
  root.querySelectorAll("[data-board-period-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      const month = button.dataset.boardPeriodDetail || fallbackMonth;
      openDetailView(boardDetailOptions({
        sourceView: source,
        month,
        sector: "all",
        subcategory: "all",
        query: "",
        hideZero: false,
        returnTo: { source, month, scrollY: window.scrollY || 0 }
      }));
    });
  });
  root.querySelectorAll("[data-board-period-sector]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(boardDetailOptions({
      sourceView: source,
      month: fallbackMonth,
      sector: button.dataset.boardPeriodSector || "all",
      subcategory: "all",
      query: "",
      hideZero: false,
      returnTo: { source, month: fallbackMonth, scrollY: window.scrollY || 0 }
    })));
  });
  root.querySelectorAll("[data-open-income-month]").forEach((button) => {
    button.addEventListener("click", () => openIncomeView({
      month: button.dataset.openIncomeMonth || fallbackMonth,
      source,
      scrollToRecords: true
    }));
  });
}
