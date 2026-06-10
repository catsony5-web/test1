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
    unknownCount: monthRows.filter((item) => item.sector === "미분류").length
  });
  els.boardSectorMap.innerHTML = "";
  els.boardSectorSummary.innerHTML = renderBoardSectorSummary(monthRows, selectedMonth);
  const visibleSectionStats = sectionStats
    .filter((stat) => stat.actualTotal > 0 || stat.count > 0)
    .sort((a, b) => b.actualTotal - a.actualTotal || b.count - a.count);
  els.boardGrid.innerHTML = renderBoardTopCategories(visibleSectionStats, selectedMonth);
  els.boardSideSummary.innerHTML = renderBoardSideSummary(sectorRows, selectedMonth, {
    totalSpend,
    unknownTotal,
    income,
    net,
    fixedTotal,
    variableTotal
  });
  attachBoardMetricHandlers();
  attachBoardSummaryHandlers();
  attachBoardSideHandlers();
  attachBoardTopCategoryHandlers();

  els.boardSummary.innerHTML = renderBoardFinalSummary({
    selectedMonth,
    totalPayment,
    reimbursementTotal,
    totalSpend,
    fixedTotal,
    variableTotal,
    income,
    net
  });
  attachBoardFinalSummaryHandlers();
  updateBoardMapTopButton();
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
