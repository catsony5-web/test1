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

function renderBoardCoreMetrics({ selectedMonth, totalPayment, reimbursementTotal, totalSpend, fixedTotal, variableTotal, income, net, scheduledTotal, unknownTotal, unknownCount }) {
  return [
    renderBoardCoreMetric("실 지출액", formatWon(totalSpend), `총 결제 ${formatWon(totalPayment)} · 정산 ${formatWon(reimbursementTotal)}`, "navy", { month: selectedMonth }, "hero"),
    renderBoardCoreMetric("잔액", formatSignedWon(net), "총수입 - 실 지출액", net >= 0 ? "green" : "red", {}, "hero"),
    renderBoardCoreMetric("총수입", formatWon(income), `${selectedMonth || "-"} 입력/이체 수입`, "green", { incomeMonth: selectedMonth }, "primary"),
    renderBoardCoreMetric("미분류", formatWon(unknownTotal), `확인 필요 ${unknownCount.toLocaleString("ko-KR")}건`, unknownTotal > 0 ? "red" : "green", { month: selectedMonth, sector: "미분류" }, "primary"),
    renderBoardCoreMetric("예정 지출", formatWon(scheduledTotal), "실 지출 미포함 · 고정 지출 예정", scheduledTotal > 0 ? "blue" : "navy", {}, "compact"),
    renderBoardCoreMetric("고정비", formatWon(fixedTotal), "주거비, 보험료, 통신비 등", "mint", { month: selectedMonth, sector: "고정 주거비" }, "compact"),
    renderBoardCoreMetric("변동비", formatWon(variableTotal), "식비, 교통비, 생활비 등", "blue", { month: selectedMonth }, "compact")
  ].join("");
}

function renderBoardCoreMetric(label, value, hint, tone, detail = {}, variant = "primary") {
  const attrs = detail.incomeMonth
    ? ` data-open-income-month="${escapeHtml(detail.incomeMonth)}"`
    : detail.month || detail.sector
    ? ` data-board-core-month="${escapeHtml(detail.month || "")}" data-board-core-sector="${escapeHtml(detail.sector || "all")}"`
    : "";
  const variantClass = `board-core-${escapeHtml(variant)}`;
  const tagOpen = attrs
    ? `<button type="button" class="board-metric board-core-metric ${variantClass} ${escapeHtml(tone)}"${attrs}>`
    : `<article class="board-metric board-core-metric ${variantClass} ${escapeHtml(tone)}">`;
  const tagClose = attrs ? "button" : "article";
  return `
    ${tagOpen}
      <span class="metric-dot"></span>
      <div>
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <em>${escapeHtml(hint)}</em>
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

function renderBoardPeriodStats(periodRows, periodMonths, preset, selectedMonth) {
  if (!els.boardPeriodStats) return "";
  const label = preset === "all" ? "전체 기간" : preset === "year" ? "올해" : preset === "recent-24" ? "최근 2년" : "최근 1년";
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
  const monthSummaries = periodMonths.map((month) => {
    const rows = periodRows.filter((item) => item.month === month);
    const spend = sumActual(rows);
    const income = Number(monthlyIncome[month] || 0) + importedIncomeForMonth(month);
    return { month, amount: spend, income, net: income - spend, count: rows.length };
  });
  const total = sumActual(periodRows);
  const totalIncome = periodMonths.reduce((amount, month) => amount + Number(monthlyIncome[month] || 0) + importedIncomeForMonth(month), 0);
  const periodNet = totalIncome - total;
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
          <span>기간 총 실지출</span>
          <strong>${formatWon(total)}</strong>
          <small>${periodRows.length.toLocaleString("ko-KR")}건 누적</small>
        </button>
        <button type="button" data-open-income-month="${escapeHtml(periodMonths.at(-1) || selectedMonth || "")}">
          <span>기간 총수입</span>
          <strong>${formatWon(totalIncome)}</strong>
          <small>${periodMonths.length.toLocaleString("ko-KR")}개월 합계</small>
        </button>
        <div>
          <span>기간 잔액</span>
          <strong class="${periodNet >= 0 ? "positive" : "negative"}">${formatSignedWon(periodNet)}</strong>
          <small>총수입 - 실지출</small>
        </div>
        <div>
          <span>월평균 실지출</span>
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

function attachBoardPeriodHandlers() {
  if (!els.boardPeriodStats) return;
  els.boardPeriodStats.querySelectorAll("[data-board-period-detail]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(boardDetailOptions({
      month: button.dataset.boardPeriodDetail || els.boardMonth.value
    })));
  });
  els.boardPeriodStats.querySelectorAll("[data-board-period-sector]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(boardDetailOptions({
      month: els.boardMonth.value,
      sector: button.dataset.boardPeriodSector || "all"
    })));
  });
  els.boardPeriodStats.querySelectorAll("[data-open-income-month]").forEach((button) => {
    button.addEventListener("click", () => openIncomeView({
      month: button.dataset.openIncomeMonth || els.boardMonth.value,
      source: "board",
      scrollToRecords: true
    }));
  });
}
