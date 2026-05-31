function renderMonthlyFlow() {
  const allRows = buildMonthlyFlowRows();
  els.monthlyFlowTable.className = "monthly-flow-table";
  updateMonthlyYearOptions(allRows);
  renderIncomeEntries();
  renderIncomeBulkPreview(els.incomeBulkFeedback.textContent);
  const rows = filterMonthlyRows(allRows);
  if (!allRows.length) {
    els.monthlyKpis.innerHTML = "";
    els.monthlyFlowChart.innerHTML = "";
    els.monthlyFlowTable.innerHTML = `<tbody><tr><td class="empty">카드/이체 엑셀을 불러오면 년도 지출정리가 표시됩니다.</td></tr></tbody>`;
    return;
  }
  if (!rows.length) {
    els.monthlyKpis.innerHTML = "";
    els.monthlyFlowChart.innerHTML = "";
    els.monthlyFlowTable.innerHTML = `<tbody><tr><td class="empty">선택한 기간에 표시할 월별 기록이 없습니다.</td></tr></tbody>`;
    return;
  }

  const latest = rows[rows.length - 1];
  const sharedMonth = getSharedSelectedMonth(focusedMonthlyMonth || latest.month);
  focusedMonthlyMonth = rows.some((row) => row.month === sharedMonth) ? sharedMonth : latest.month;
  if (canViewDriveSharedMonth("monthly")) setSharedSelectedMonth(focusedMonthlyMonth, { syncControls: false });
  const best = [...rows].sort((a, b) => b.net - a.net)[0];
  const worst = [...rows].sort((a, b) => a.net - b.net)[0];
  const totalSpend = sum(rows, "actualSpend");
  const totalIncome = sum(rows, "income");
  const totalScheduled = sum(rows, "scheduled");
  const rangeLabel = currentMonthlyRangeLabel();

  const hasScheduledExpenses = rows.some((row) => Number(row.scheduled || 0) !== 0);
  els.monthlyFlowTable.className = `monthly-flow-table ${hasScheduledExpenses ? "has-scheduled" : "no-scheduled"}`;
  const kpiCards = [
    renderKpi("최근 월 잔액", formatSignedWon(latest.net), latest.net, latest.month, "balance"),
    renderKpi("현재 자산", formatSignedWon(latest.asset), latest.asset, `${latest.month} 기준 누적`, "balance"),
    renderKpi("누적 실지출", formatWon(totalSpend), totalSpend, rangeLabel, "neutral"),
    renderKpi("누적 총수입", formatWon(totalIncome), totalIncome, rangeLabel, "income"),
    renderKpi("가장 여유", best.month, best.net, formatSignedWon(best.net), "balance"),
    renderKpi("가장 부족", worst.month, worst.net, formatSignedWon(worst.net), "balance")
  ];
  if (hasScheduledExpenses) {
    kpiCards.splice(1, 0, renderKpi("예상 잔액", formatSignedWon(latest.expectedNet), latest.expectedNet, "최근 월 잔액 - 예정 지출", "balance"));
    kpiCards.splice(5, 0, renderKpi("예정 지출", formatWon(totalScheduled), totalScheduled, "선택 기간 예정 합계", "neutral"));
  }
  els.monthlyKpis.innerHTML = kpiCards.join("");

  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.net)), 1);
  const tableRows = rows.map((row) => `
    <tr class="monthly-flow-row ${focusedMonthlyMonth === row.month ? "is-linked-focus" : ""}" data-month-row="${escapeHtml(row.month)}" tabindex="0">
      <td class="month-cell">${escapeHtml(row.month)}</td>
      <td class="amount payment-cell">
        <button type="button" class="monthly-link-button payment-link-button" data-open-detail-month="${escapeHtml(row.month)}" title="${escapeHtml(row.month)} 상세 내역 보기">
          ${formatWon(row.totalPayment)}
        </button>
      </td>
      <td class="amount actual-cell">${formatWon(row.actualSpend)}</td>
      <td class="amount income-cell">
        <button type="button" class="income-link-button" data-open-income-month="${escapeHtml(row.month)}" title="${escapeHtml(row.month)} 수입 기록 보기">
          ${formatWon(row.income)}
        </button>
      </td>
      ${hasScheduledExpenses ? `<td class="amount scheduled-amount">${formatWon(row.scheduled)}</td>` : ""}
      <td class="net-wrap-cell">
        <div class="net-cell ${row.net >= 0 ? "plus" : "minus"}">
          <span class="net-bar" style="width: ${Math.max(4, Math.round(Math.abs(row.net) / maxAbs * 100))}%"></span>
          <strong>${formatSignedWon(row.net)}</strong>
        </div>
      </td>
      ${hasScheduledExpenses ? `<td class="amount expected-cell ${row.expectedNet >= 0 ? "positive" : "negative"}">${formatSignedWon(row.expectedNet)}</td>` : ""}
      <td class="amount asset-cell ${row.asset >= 0 ? "positive" : "negative"}">${formatSignedWon(row.asset)}</td>
    </tr>
  `).join("");

  els.monthlyFlowTable.innerHTML = `
    <thead>
      <tr>
        <th class="month-cell" scope="col">월</th>
        <th class="amount payment-cell" scope="col">총 결제액</th>
        <th class="amount actual-cell" scope="col">실 지출액</th>
        <th class="amount income-cell" scope="col">총수입</th>
        ${hasScheduledExpenses ? `<th class="amount scheduled-amount" scope="col">예정 지출</th>` : ""}
        <th class="net-wrap-cell" scope="col">잔액</th>
        ${hasScheduledExpenses ? `<th class="amount expected-cell" scope="col">예상 잔액</th>` : ""}
        <th class="amount asset-cell" scope="col">자산</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  `;

  els.monthlyFlowChart.innerHTML = renderMonthlyLineChart(rows);
  attachMonthlyFlowHandlers();
  if (focusedMonthlyMonth) setMonthlyFlowHighlight(focusedMonthlyMonth, { persistent: true });
}

function attachMonthlyFlowHandlers() {
  els.monthlyFlowTable.querySelectorAll("[data-month-row]").forEach((row) => {
    const month = row.dataset.monthRow;
    row.addEventListener("mouseenter", () => setMonthlyFlowHighlight(month));
    row.addEventListener("mouseleave", restoreMonthlyFlowFocus);
    row.addEventListener("click", () => focusMonthlyTableRow(month));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      focusMonthlyTableRow(month);
    });
  });
  els.monthlyFlowChart.querySelectorAll("[data-chart-month]").forEach((group) => {
    const month = group.dataset.chartMonth;
    group.addEventListener("mouseenter", () => setMonthlyFlowHighlight(month));
    group.addEventListener("mouseleave", restoreMonthlyFlowFocus);
    group.addEventListener("click", () => focusMonthlyTableRow(month));
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      focusMonthlyTableRow(month);
    });
  });
  els.monthlyFlowTable.querySelectorAll("[data-open-income-month]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openIncomeViewForMonth(button.dataset.openIncomeMonth);
    });
  });
  els.monthlyFlowTable.querySelectorAll("[data-open-detail-month]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetailViewForMonthlyPayment(button.dataset.openDetailMonth);
    });
  });
}

function openDetailViewForMonthlyPayment(month) {
  if (!isValidMonthKey(month)) return;
  focusedMonthlyMonth = month;
  setSharedSelectedMonth(month, { syncControls: false });
  openDetailView({
    sourceView: "monthly",
    sourceLabel: "년도 지출정리",
    month,
    sector: "all",
    subcategory: "all",
    query: "",
    unknownOnly: false,
    entryType: "actual",
    hideZero: false,
    returnTo: {
      source: "monthly",
      month,
      scrollY: window.scrollY || 0
    }
  });
  requestAnimationFrame(() => {
    els.detailGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function focusMonthlyTableRow(month) {
  if (!month) return;
  setSharedSelectedMonth(month, { syncControls: false });
  focusedMonthlyMonth = month;
  setMonthlyFlowHighlight(month, { persistent: true });
  const row = els.monthlyFlowTable.querySelector(`[data-month-row="${cssEscape(month)}"]`);
  if (!row) return;
  row.classList.add("is-scroll-target");
  row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  window.setTimeout(() => row.classList.remove("is-scroll-target"), 1200);
}

function setMonthlyFlowHighlight(month, options = {}) {
  if (!month) return;
  const persistent = Boolean(options.persistent);
  els.monthlyFlowTable.querySelectorAll("[data-month-row]").forEach((row) => {
    const isTarget = row.dataset.monthRow === month;
    row.classList.toggle("is-hovered", isTarget);
    row.classList.toggle("is-linked-focus", persistent && isTarget);
  });
  els.monthlyFlowChart.querySelectorAll("[data-chart-month]").forEach((group) => {
    const isTarget = group.dataset.chartMonth === month;
    group.classList.toggle("is-highlighted", isTarget);
    group.classList.toggle("is-persistent", persistent && isTarget);
  });
}

function restoreMonthlyFlowFocus() {
  els.monthlyFlowTable.querySelectorAll("[data-month-row]").forEach((row) => {
    row.classList.remove("is-hovered");
    row.classList.toggle("is-linked-focus", Boolean(focusedMonthlyMonth && row.dataset.monthRow === focusedMonthlyMonth));
  });
  els.monthlyFlowChart.querySelectorAll("[data-chart-month]").forEach((group) => {
    group.classList.remove("is-highlighted");
    group.classList.toggle("is-persistent", Boolean(focusedMonthlyMonth && group.dataset.chartMonth === focusedMonthlyMonth));
  });
}

function openIncomeView(options = {}) {
  const config = typeof options === "string" ? { month: options } : options;
  const month = isValidMonthKey(config.month) ? config.month : currentMonthKey();
  const source = config.source || "monthly";
  incomeReturnState = {
    source,
    month,
    selectedDate: config.selectedDate || selectedCalendarDate || "",
    scrollToRecords: config.scrollToRecords !== false
  };
  focusedMonthlyMonth = month;
  preferredIncomeMonth = month;
  setSharedSelectedMonth(month, { syncControls: false });
  if (els.incomeMonthFilter) els.incomeMonthFilter.value = month;
  if (els.incomeEntryDate && !normalizeInputDate(els.incomeEntryDate.value)?.startsWith(month)) {
    els.incomeEntryDate.value = defaultDateForMonth(month);
  }
  updateIncomeReturnButton();
  switchView("income");
  renderIncomeEntries();
  requestAnimationFrame(() => {
    const target = config.scrollToRecords === false ? document.querySelector("#incomeView") : els.incomeEntryList;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function openIncomeViewForMonth(month, source = "monthly") {
  openIncomeView({ month, source, scrollToRecords: true });
}

function updateIncomeReturnButton() {
  if (!els.backToMonthlyButton) return;
  const source = incomeReturnState?.source || "monthly";
  const labels = {
    board: "← 대시보드로 돌아가기",
    calendar: "← 소비 달력으로 돌아가기",
    monthly: "← 년도 지출정리로 돌아가기"
  };
  els.backToMonthlyButton.textContent = labels[source] || labels.monthly;
}

function returnToMonthlyFlow() {
  const selectedMonth = els.incomeMonthFilter.value || preferredIncomeMonth;
  focusedMonthlyMonth = selectedMonth && selectedMonth !== "all" ? selectedMonth : "";
  preferredIncomeMonth = selectedMonth || preferredIncomeMonth || currentMonthKey();
  switchView("monthly");
  renderMonthlyFlow();
  requestAnimationFrame(() => {
    if (!focusedMonthlyMonth) return;
    setMonthlyFlowHighlight(focusedMonthlyMonth, { persistent: true });
    els.monthlyFlowTable
      .querySelector(`[data-month-row="${cssEscape(focusedMonthlyMonth)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function returnFromIncomeView() {
  const selectedMonth = els.incomeMonthFilter.value || preferredIncomeMonth || incomeReturnState?.month || currentMonthKey();
  const month = selectedMonth === "all" ? incomeReturnState?.month || preferredIncomeMonth || currentMonthKey() : selectedMonth;
  const source = incomeReturnState?.source || "monthly";
  preferredIncomeMonth = month;
  if (source === "board") {
    if (isValidMonthKey(month)) setSharedSelectedMonth(month, { syncControls: false });
    switchView("board");
    requestAnimationFrame(() => document.querySelector("#boardView")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return;
  }
  if (source === "calendar") {
    if (isValidMonthKey(month)) {
      selectedCalendarMonth = month;
      setSharedSelectedMonth(month, { syncControls: false });
    }
    if (incomeReturnState?.selectedDate?.startsWith(month)) selectedCalendarDate = incomeReturnState.selectedDate;
    switchView("calendar");
    requestAnimationFrame(() => document.querySelector("#calendarView")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return;
  }
  returnToMonthlyFlow();
}

function buildMonthlyFlowRows() {
  const reportRows = reportingExpenseRows(classified);
  const months = unique([
    ...classified.filter((item) => item.status !== "취소/제외").map((item) => item.month).filter(Boolean),
    ...reportRows.map((item) => item.month).filter(Boolean),
    ...Object.keys(monthlyIncome).filter(Boolean),
    ...recurringExpenses.flatMap((item) => [item.startMonth, item.endMonth]).filter(Boolean)
  ]).sort();
  let asset = 0;
  return months.map((month) => {
    const expenses = reportRows.filter((item) => item.month === month);
    const importedIncome = importedIncomeForMonth(month);
    const manualIncome = Number(monthlyIncome[month] || 0);
    const income = importedIncome + manualIncome;
    const totalPayment = sum(expenses, "amount");
    const actualSpend = sumActual(expenses);
    const net = income - actualSpend;
    const scheduled = scheduledTotalForMonth(month);
    const expectedNet = net - scheduled;
    asset += net;
    return {
      month,
      totalPayment,
      actualSpend,
      income,
      net,
      scheduled,
      expectedNet,
      specialIncome: importedIncome,
      asset
    };
  });
}

function updateMonthlyYearOptions(rows) {
  const previous = els.monthlyYearFilter.value || "all";
  const years = unique(rows.map((row) => row.month.slice(0, 4))).sort();
  const options = [
    `<option value="all">전체 연도</option>`,
    `<option value="recent">최근 몇 년</option>`,
    ...years.map((year) => `<option value="year:${escapeHtml(year)}">${escapeHtml(year)}년</option>`)
  ];
  els.monthlyYearFilter.innerHTML = options.join("");
  els.monthlyYearFilter.value = [...els.monthlyYearFilter.options].some((option) => option.value === previous)
    ? previous
    : "all";
  els.monthlyRecentYears.disabled = els.monthlyYearFilter.value !== "recent";
}

function filterMonthlyRows(rows) {
  if (!rows.length) return [];
  const mode = els.monthlyYearFilter.value || "all";
  if (mode === "all") return rows;
  if (mode.startsWith("year:")) {
    const year = mode.slice(5);
    return rows.filter((row) => row.month.startsWith(`${year}-`));
  }
  const years = rows.map((row) => Number(row.month.slice(0, 4))).filter(Number.isFinite);
  const latestYear = Math.max(...years);
  const recentYears = Math.max(1, Number(els.monthlyRecentYears.value || 1));
  const minYear = latestYear - recentYears + 1;
  return rows.filter((row) => Number(row.month.slice(0, 4)) >= minYear);
}

function currentMonthlyRangeLabel() {
  const mode = els.monthlyYearFilter.value || "all";
  if (mode === "all") return "선택 기간 전체";
  if (mode.startsWith("year:")) return `${mode.slice(5)}년`;
  return `최근 ${els.monthlyRecentYears.value || 1}년`;
}
