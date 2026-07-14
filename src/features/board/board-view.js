function renderBoard() {
  const active = reportingExpenseRows(classified);
  const months = appMonthOptions([
    ...classified.filter((item) => item.status !== "취소/제외").map((item) => item.month),
    ...active.map((item) => item.month)
  ]);
  const selectedMonth = getSharedSelectedMonth(els.boardMonth.value || months.at(-1) || currentMonthKey());
  const availableMonths = unique([...months, selectedMonth]).filter(isValidMonthKey).sort();
  if (canViewDriveSharedMonth("board")) setSharedSelectedMonth(selectedMonth, { syncControls: false });

  els.boardMonth.innerHTML = availableMonths.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join("");
  els.boardMonth.value = selectedMonth;

  if (isBoardAppEmpty()) {
    renderBoardEmptyWorkspace(selectedMonth);
    return;
  }

  els.boardMetrics.classList.remove("is-empty-workspace");
  els.boardSideSummary.hidden = true;

  const monthRows = active.filter((item) => item.month === selectedMonth);
  const buckets = buildBoardBuckets(monthRows);
  const fixedSections = boardSections.filter((section) => section.group === "고정비");
  const variableSections = boardSections.filter((section) => section.group === "변동비");
  const fixedRows = fixedSections.flatMap((section) => buckets[section.key] || []);
  const variableRows = variableSections.flatMap((section) => buckets[section.key] || []);
  const fixedTotal = sumActual(fixedRows);
  const variableTotal = sumActual(variableRows);
  const totalPayment = sum(monthRows, "amount");
  const reimbursementTotal = sumReimbursements(monthRows);
  const totalSpend = fixedTotal + variableTotal;
  const income = Number(monthlyIncome[selectedMonth] || 0) + importedIncomeForMonth(selectedMonth);
  const net = income - totalSpend;
  const scheduledTotal = scheduledTotalForMonth(selectedMonth);
  const unknownTotal = sumActual(monthRows.filter((item) => item.sector === "미분류"));
  const previousMonth = previousMonthKey(selectedMonth);
  const previousMonthRows = active.filter((item) => item.month === previousMonth);
  const previousTotalPayment = sum(previousMonthRows, "amount");
  const previousReimbursementTotal = sumReimbursements(previousMonthRows);
  const previousTotalSpend = sumActual(previousMonthRows);
  const previousIncome = Number(monthlyIncome[previousMonth] || 0) + importedIncomeForMonth(previousMonth);
  const sectionStats = boardSections
    .filter((section) => section.key !== "etc-catchall" || (buckets[section.key] || []).length)
    .map((section) => buildBoardSectionStat(section, buckets[section.key] || []));
  const sectorRows = buildSectorSpendRows(monthRows);
  ensureBoardExpandedSectors(selectedMonth, sectorRows);

  els.boardMetrics.innerHTML = renderBoardCoreMetrics({
    selectedMonth,
    totalPayment,
    reimbursementTotal,
    totalSpend,
    fixedTotal,
    variableTotal,
    income,
    net,
    scheduledTotal,
    unknownTotal,
    previous: {
      totalPayment: previousTotalPayment,
      reimbursementTotal: previousReimbursementTotal,
      totalSpend: previousTotalSpend,
      income: previousIncome,
      net: previousIncome - previousTotalSpend,
      scheduledTotal: scheduledTotalForMonth(previousMonth),
      unknownTotal: sumActual(previousMonthRows.filter((item) => item.sector === "미분류"))
    }
  });
  els.boardSectorMap.innerHTML = "";
  els.boardSectorSummary.innerHTML = renderBoardSectorSummary(monthRows, selectedMonth);
  const visibleSectionStats = sectionStats
    .filter((stat) => stat.actualTotal > 0)
    .sort((a, b) => b.actualTotal - a.actualTotal || b.count - a.count);
  els.boardGrid.innerHTML = renderBoardTopCategories(visibleSectionStats, selectedMonth);
  els.boardSideSummary.innerHTML = "";
  attachBoardMetricHandlers();
  attachBoardSummaryHandlers();
  attachBoardTopCategoryHandlers();

  els.boardSummary.innerHTML = renderBoardLongTermIndicators(active, selectedMonth);
  attachBoardPeriodHandlers(els.boardSummary, selectedMonth, "board");
  updateBoardMapTopButton();
}

function isBoardAppEmpty() {
  const hasTransactions = [transactions, classified].some((rows) => Array.isArray(rows) && rows.length > 0);
  const hasIncome = Object.values(monthlyIncome || {}).some((amount) => {
    const value = Number(amount);
    return Number.isFinite(value) && value !== 0;
  });
  const hasRecurringExpenses = Array.isArray(recurringExpenses) && recurringExpenses.length > 0;
  return !hasTransactions && !hasIncome && !hasRecurringExpenses;
}

function renderBoardEmptyWorkspace(selectedMonth) {
  const monthNumber = Number(selectedMonth.slice(5, 7));
  const monthLabel = Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12
    ? `${monthNumber}월`
    : "이번 달";

  els.boardMetrics.classList.add("is-empty-workspace");
  els.boardMetrics.innerHTML = `
    <div class="board-empty-workspace">
      <header class="board-empty-intro">
        <p class="board-empty-kicker">처음 시작하기</p>
        <h3>${escapeHtml(monthLabel)} 소비 시작하기</h3>
        <p>3단계만 따라하면 이번 달 소비를 한눈에 볼 수 있어요.</p>
      </header>

      <ol class="board-empty-steps">
        <li class="board-empty-step is-primary">
          <span class="board-empty-step-number" aria-hidden="true">1</span>
          <span class="board-empty-step-icon" aria-hidden="true"><i class="ti ti-file-spreadsheet"></i></span>
          <div class="board-empty-step-copy">
            <strong>거래 불러오기</strong>
            <span>카드, 이체, 현금 내역을 엑셀로 불러오거나 직접 입력하세요.</span>
          </div>
          <div class="board-empty-step-actions">
            <button type="button" class="primary" data-board-empty-action="import">
              <i class="ti ti-upload" aria-hidden="true"></i>
              <span>엑셀 불러오기</span>
            </button>
            <button type="button" data-board-empty-view="detailBulk">
              <i class="ti ti-pencil-plus" aria-hidden="true"></i>
              <span>직접 입력</span>
            </button>
          </div>
        </li>

        <li class="board-empty-step">
          <span class="board-empty-step-number" aria-hidden="true">2</span>
          <span class="board-empty-step-icon" aria-hidden="true"><i class="ti ti-wallet"></i></span>
          <div class="board-empty-step-copy">
            <strong>수입·고정 지출 확인</strong>
            <span>이번 달 수입과 반복되는 지출을 등록하고 확인하세요.</span>
          </div>
          <div class="board-empty-step-actions">
            <button type="button" data-board-empty-view="income">
              <i class="ti ti-cash-banknote" aria-hidden="true"></i>
              <span>수입 입력</span>
            </button>
            <button type="button" data-board-empty-view="recurring">
              <i class="ti ti-calendar-repeat" aria-hidden="true"></i>
              <span>고정 지출</span>
            </button>
          </div>
        </li>

        <li class="board-empty-step">
          <span class="board-empty-step-number" aria-hidden="true">3</span>
          <span class="board-empty-step-icon" aria-hidden="true"><i class="ti ti-calendar-month"></i></span>
          <div class="board-empty-step-copy">
            <strong>소비 달력 확인</strong>
            <span>날짜별 소비를 확인하고 분류를 정리해 보세요.</span>
          </div>
          <div class="board-empty-step-actions is-single-action">
            <button type="button" data-board-empty-view="calendar">
              <i class="ti ti-calendar" aria-hidden="true"></i>
              <span>소비 달력 보기</span>
            </button>
          </div>
        </li>
      </ol>

      <section class="board-empty-overview" aria-labelledby="boardEmptyOverviewTitle">
        <div class="board-empty-section-head">
          <div>
            <p class="board-empty-kicker">선택 월 기준</p>
            <h4 id="boardEmptyOverviewTitle">${escapeHtml(monthLabel)} 한눈에 보기</h4>
          </div>
        </div>
        <dl class="board-empty-overview-grid">
          <div>
            <dt>실 지출액</dt>
            <dd>0원</dd>
            <span>총 결제 0원 · 정산 0원</span>
          </div>
          <div>
            <dt>수입</dt>
            <dd class="positive">0원</dd>
            <span>수입 입력 전</span>
          </div>
          <div>
            <dt>잔액</dt>
            <dd class="positive">0원</dd>
            <span>수입 - 실 지출액</span>
          </div>
        </dl>
      </section>

      <section class="board-empty-recent" aria-labelledby="boardEmptyRecentTitle">
        <div class="board-empty-section-head">
          <div>
            <p class="board-empty-kicker">최근 거래</p>
            <h4 id="boardEmptyRecentTitle">등록된 거래가 없습니다</h4>
          </div>
          <button type="button" data-board-empty-view="detailBulk">
            <i class="ti ti-plus" aria-hidden="true"></i>
            <span>거래 입력하기</span>
          </button>
        </div>
        <p>거래를 불러오거나 직접 입력하면 최근 내역이 이곳에 표시됩니다.</p>
      </section>
    </div>
  `;

  els.boardSectorMap.innerHTML = "";
  els.boardSectorSummary.innerHTML = "";
  els.boardGrid.innerHTML = "";
  els.boardSideSummary.innerHTML = "";
  els.boardSideSummary.hidden = true;
  els.boardSummary.innerHTML = "";
  updateBoardMapTopButton();
  attachBoardEmptyWorkspaceHandlers();
}

function attachBoardEmptyWorkspaceHandlers() {
  els.boardMetrics.querySelector('[data-board-empty-action="import"]')?.addEventListener("click", () => {
    els.fileInput.click();
  });
  els.boardMetrics.querySelectorAll("[data-board-empty-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.boardEmptyView));
  });
}

function moveBoardMonth(offset) {
  const baseMonth = els.boardMonth?.value || getSharedSelectedMonth(currentMonthKey()) || currentMonthKey();
  const nextMonth = shiftMonthKey(baseMonth, offset);
  if (!isValidMonthKey(nextMonth)) return;
  setSharedSelectedMonth(nextMonth);
  if (els.boardMonth) els.boardMonth.value = nextMonth;
  renderBoard();
}

function boardPeriodMonths(months, selectedMonth, preset = "recent-12") {
  const allMonths = unique([...(months || []), selectedMonth].filter(isValidMonthKey)).sort();
  if (!allMonths.length) return [];
  if (preset === "all") return allMonths;
  if (preset === "year") {
    const anchor = isValidMonthKey(selectedMonth) ? selectedMonth : allMonths.at(-1);
    const year = anchor.slice(0, 4);
    return allMonths.filter((month) => month.startsWith(`${year}-`));
  }
  const count = preset === "recent-24" ? 24 : 12;
  const anchor = isValidMonthKey(selectedMonth) ? selectedMonth : allMonths.at(-1);
  const start = shiftMonthKey(anchor, -(count - 1));
  return allMonths.filter((month) => month >= start && month <= anchor);
}

function updateBoardMapTopButton() {
  if (!els.boardMapTopButton) return;
  els.boardMapTopButton.classList.remove("visible");
}

function renderSectorSpendMap(rows, selectedMonth) {
  const sectorRows = buildSectorSpendRows(rows);
  if (!sectorRows.length) {
    return `
      <section class="sector-map-card">
        <div class="sector-map-head">
          <div>
            <h3>섹터별 소비 맵</h3>
            <p>선택 월의 섹터별 실 지출액 비중을 박스 크기로 보여줍니다.</p>
          </div>
        </div>
        <div class="empty compact-empty">선택한 월의 지출 내역이 없습니다.</div>
      </section>
    `;
  }

  const total = sum(sectorRows, "amount");
  const max = Math.max(...sectorRows.map((item) => item.amount), 1);
  return `
    <section class="sector-map-card">
      <div class="sector-map-head">
        <div>
          <h3>섹터별 소비 맵</h3>
          <p>${escapeHtml(selectedMonth || "-")} 실 지출액 기준 비중을 박스 크기로 보여줍니다.</p>
        </div>
        <strong>${formatWon(total)}</strong>
      </div>
      <div class="sector-treemap" aria-label="섹터별 소비 맵">
        ${sectorRows.map((item) => {
          const ratio = total ? Math.round(item.amount / total * 100) : 0;
          const grow = Math.max(1, Math.round(item.amount / max * 12));
          const basis = Math.max(150, Math.min(460, 130 + ratio * 7));
          return `
            <button type="button" class="sector-tile ${categoryClass(item.sector)}" data-sector-map="${escapeHtml(item.sector)}" style="flex-grow:${grow}; flex-basis:${basis}px;" title="${escapeHtml(item.sector)} ${formatWon(item.amount)} · ${ratio}% · ${item.count}건">
              <span>${escapeHtml(item.sector)}</span>
              <strong>${formatWon(item.amount)}</strong>
              <small>${ratio}% · ${item.count.toLocaleString("ko-KR")}건</small>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function buildSectorSpendRows(rows) {
  const grouped = groupBy(rows, (item) => item.sector || "미분류");
  return [...grouped.entries()]
    .map(([sector, sectorRows]) => ({
      sector,
      amount: sumActual(sectorRows),
      count: sectorRows.length
    }))
    .filter((item) => item.amount > 0 || item.count > 0)
    .sort((a, b) => b.amount - a.amount);
}

function attachSectorMapHandlers() {
  els.boardSectorMap.querySelectorAll("[data-sector-map]").forEach((tile) => {
    tile.addEventListener("click", () => {
      const sector = tile.dataset.sectorMap;
      openDetailView(boardDetailOptions({ sector }));
    });
  });
}

function buildBoardBuckets(rows) {
  const buckets = Object.fromEntries(boardSections.map((section) => [section.key, []]));
  rows.forEach((item) => {
    const section = boardSections.find((candidate) => candidate.match(item)) || boardSections.at(-1);
    if (section) buckets[section.key].push(item);
  });
  return buckets;
}

function expenseRows(rows) {
  return rows.filter((item) => item.status !== "취소/제외" && item.flow !== "income");
}

function importedIncomeForMonth(month) {
  return sum(classified.filter((item) => item.flow === "income" && item.month === month), "amount");
}

function reimbursementFor(item) {
  const amount = Number(item.amount || 0);
  if (item?.isInstallmentOccurrence) {
    return Math.min(amount, Math.max(0, Number(item.installmentReimbursementAmount || 0)));
  }
  const value = Math.max(0, toNumber(reimbursements[item.recordKey]));
  return Math.min(amount, value);
}

function actualAmount(item) {
  return Math.max(0, Number(item.amount || 0) - reimbursementFor(item));
}

function sumActual(items) {
  return items.reduce((total, item) => total + actualAmount(item), 0);
}

function sumReimbursements(items) {
  return items.reduce((total, item) => total + reimbursementFor(item), 0);
}
