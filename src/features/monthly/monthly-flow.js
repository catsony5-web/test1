let monthlyYearFilterInitialized = false;

function renderMonthlyFlow() {
  const reportRows = reportingExpenseRows(classified);
  const allRows = buildMonthlyFlowRows(reportRows);
  els.monthlyFlowTable.className = "monthly-flow-table";
  updateMonthlyYearOptions(allRows);
  renderIncomeEntries();
  renderIncomeBulkPreview(els.incomeBulkFeedback.textContent);
  const rows = filterMonthlyRows(allRows, reportRows);
  if (!allRows.length) {
    els.monthlyKpis.innerHTML = "";
    if (els.monthlyPeriodStats) els.monthlyPeriodStats.innerHTML = "";
    els.monthlyFlowChart.innerHTML = "";
    els.monthlyFlowTable.innerHTML = `<tbody><tr><td class="empty">카드/이체 엑셀을 불러오면 년도 지출정리가 표시됩니다.</td></tr></tbody>`;
    if (els.monthlyRangeStatus) els.monthlyRangeStatus.textContent = "";
    return;
  }
  if (!rows.length) {
    els.monthlyKpis.innerHTML = "";
    if (els.monthlyPeriodStats) els.monthlyPeriodStats.innerHTML = "";
    els.monthlyFlowChart.innerHTML = "";
    els.monthlyFlowTable.innerHTML = `<tbody><tr><td class="empty">선택한 기간에 표시할 월별 기록이 없습니다.</td></tr></tbody>`;
    if (els.monthlyRangeStatus) els.monthlyRangeStatus.textContent = "";
    return;
  }

  const latest = latestMeaningfulMonthlyRow(rows);
  const sharedMonth = getSharedSelectedMonth(focusedMonthlyMonth || latest.month);
  focusedMonthlyMonth = rows.some((row) => row.month === sharedMonth) ? sharedMonth : latest.month;
  if (canViewDriveSharedMonth("monthly")) setSharedSelectedMonth(focusedMonthlyMonth, { syncControls: false });
  const totalPayment = sum(rows, "totalPayment");
  const totalConsumption = sum(rows, "consumptionSpend");
  const totalSavings = sum(rows, "actualSavings");
  const totalIncome = sum(rows, "income");
  const totalReimbursement = sum(rows, "reimbursement");
  const totalScheduled = sum(rows, "scheduled");
  const periodAssetGrowth = totalIncome - totalConsumption;
  const totalFreeBalance = periodAssetGrowth - totalSavings;
  const averageConsumption = Math.round(totalConsumption / Math.max(rows.length, 1));
  const averageSavings = Math.round(totalSavings / Math.max(rows.length, 1));
  const rangeLabel = currentMonthlyRangeLabel();

  if (els.monthlyRangeStatus) {
    els.monthlyRangeStatus.textContent = `${rangeLabel} · ${rows[0].month} ~ ${rows.at(-1).month} · ${rows.length.toLocaleString("ko-KR")}개월`;
  }

  const hasScheduledExpenses = rows.some((row) => Number(row.scheduled || 0) !== 0);
  els.monthlyFlowTable.className = `monthly-flow-table ${hasScheduledExpenses ? "has-scheduled" : "no-scheduled"}`;
  const kpiCards = [
    renderKpi("기간 순자산 증가", formatSignedWon(periodAssetGrowth), periodAssetGrowth, "총수입 - 소비지출", "balance"),
    renderKpi("기간 총수입", formatWon(totalIncome), totalIncome, rangeLabel, "income"),
    renderKpi("기간 소비지출", formatWon(totalConsumption), totalConsumption, "저축 이체 제외", "spend"),
    renderKpi("기간 실제 저축액", formatWon(totalSavings), totalSavings, `저축률 ${monthlySavingsRateLabel(totalSavings, totalIncome)}`, "savings"),
  ];
  els.monthlyKpis.innerHTML = kpiCards.join("");
  if (els.monthlyPeriodStats) {
    const freeBalanceTone = totalFreeBalance > 0 ? "positive" : totalFreeBalance < 0 ? "negative" : "";
    const insightItems = [
      `
        <div>
          <span>월평균 소비지출</span>
          <strong>${formatWon(averageConsumption)}</strong>
          <small>${rows.length.toLocaleString("ko-KR")}개월 기준</small>
        </div>
      `,
      `
        <div>
          <span>월평균 실제 저축</span>
          <strong>${formatWon(averageSavings)}</strong>
          <small>적금/예금 분류 기준</small>
        </div>
      `,
      `
        <div>
          <span>기간 자유 잔액</span>
          <strong class="${freeBalanceTone}">${formatSignedWon(totalFreeBalance)}</strong>
          <small>수입 - 소비 - 실제 저축</small>
        </div>
      `,
      `
        <div>
          <span>정산받은 금액</span>
          <strong>${formatWon(totalReimbursement)}</strong>
          <small>전체 결제 ${formatWon(totalPayment)}</small>
        </div>
      `
    ];
    if (hasScheduledExpenses) {
      insightItems.push(`
        <div>
          <span>예정 지출</span>
          <strong>${formatWon(totalScheduled)}</strong>
          <small>선택 기간 예정 합계</small>
        </div>
      `);
    }
    els.monthlyPeriodStats.innerHTML = `
      <section class="monthly-insight-strip" aria-label="선택 기간 보조 지표">
        ${insightItems.join("")}
      </section>
    `;
  }

  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.freeBalance)), 1);
  const maxConsumption = Math.max(...rows.map((row) => row.consumptionSpend), 1);
  const maxSavings = Math.max(...rows.map((row) => row.actualSavings), 1);
  const maxIncome = Math.max(...rows.map((row) => row.income), 1);
  const tableRows = rows.map((row) => `
    <tr class="monthly-flow-row ${focusedMonthlyMonth === row.month ? "is-linked-focus" : ""} ${monthlyRowHasActivity(row) ? "" : "is-empty-month"}" data-month-row="${escapeHtml(row.month)}" tabindex="0">
      <td class="month-cell" data-label="월">${escapeHtml(row.month)}</td>
      <td class="amount income-cell" data-label="총수입">
        <div class="monthly-table-value">
          <span class="monthly-table-meter income" style="--monthly-meter: ${monthlyMeterPercent(row.income, maxIncome)}%"></span>
          <button type="button" class="income-link-button" data-open-income-month="${escapeHtml(row.month)}" title="${escapeHtml(row.month)} 수입 기록 보기">
            ${formatWon(row.income)}
          </button>
        </div>
      </td>
      <td class="amount consumption-cell" data-label="소비지출">
        <div class="monthly-table-value">
          <span class="monthly-table-meter consumption" style="--monthly-meter: ${monthlyMeterPercent(row.consumptionSpend, maxConsumption)}%"></span>
          <strong>${formatWon(row.consumptionSpend)}</strong>
          ${monthlyRowHasActivity(row) ? renderMonthlyDelta(row.consumptionDelta) : ""}
          ${row.totalPayment > 0 ? `
            <button type="button" class="monthly-link-button monthly-payment-detail" data-open-detail-month="${escapeHtml(row.month)}" title="${escapeHtml(row.month)} 전체 결제 상세 보기">
              전체 결제 ${formatWon(row.totalPayment)} · 상세
            </button>
          ` : ""}
        </div>
      </td>
      <td class="amount savings-cell" data-label="실제 저축">
        <div class="monthly-table-value">
          <span class="monthly-table-meter savings" style="--monthly-meter: ${monthlyMeterPercent(row.actualSavings, maxSavings)}%"></span>
          <strong>${formatWon(row.actualSavings)}</strong>
          <small class="monthly-savings-rate-inline">저축률 ${monthlySavingsRateLabel(row.actualSavings, row.income)}</small>
        </div>
      </td>
      ${hasScheduledExpenses ? `<td class="amount scheduled-amount" data-label="예정 지출">${formatWon(row.scheduled)}</td>` : ""}
      <td class="net-wrap-cell balance-cell" data-label="자유 잔액">
        <div class="net-cell ${row.freeBalance >= 0 ? "plus" : "minus"}">
          <span class="net-bar" style="width: ${Math.max(4, Math.round(Math.abs(row.freeBalance) / maxAbs * 100))}%"></span>
          <strong>${formatSignedWon(row.freeBalance)}</strong>
        </div>
      </td>
      <td class="amount savings-rate-cell" data-label="저축률">${monthlySavingsRateLabel(row.actualSavings, row.income)}</td>
      ${hasScheduledExpenses ? `<td class="amount expected-cell ${row.expectedFreeBalance >= 0 ? "positive" : "negative"}" data-label="예상 자유 잔액">${formatSignedWon(row.expectedFreeBalance)}</td>` : ""}
      <td class="amount asset-cell ${row.cumulativeAssetGrowth >= 0 ? "positive" : "negative"}" data-label="누적 자산 증가">${formatSignedWon(row.cumulativeAssetGrowth)}</td>
    </tr>
  `).join("");

  els.monthlyFlowTable.innerHTML = `
    <thead>
      <tr>
        <th class="month-cell" scope="col">월</th>
        <th class="amount income-cell" scope="col">총수입</th>
        <th class="amount consumption-cell" scope="col">소비지출</th>
        <th class="amount savings-cell" scope="col">실제 저축</th>
        ${hasScheduledExpenses ? `<th class="amount scheduled-amount" scope="col">예정 지출</th>` : ""}
        <th class="net-wrap-cell balance-cell" scope="col">자유 잔액</th>
        <th class="amount savings-rate-cell" scope="col">저축률</th>
        ${hasScheduledExpenses ? `<th class="amount expected-cell" scope="col">예상 자유 잔액</th>` : ""}
        <th class="amount asset-cell" scope="col">누적 자산 증가</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  `;

  els.monthlyFlowChart.innerHTML = renderMonthlyFlowChart(rows);
  attachMonthlyFlowHandlers();
  if (focusedMonthlyMonth) {
    setMonthlyFlowHighlight(focusedMonthlyMonth, { persistent: true });
    requestAnimationFrame(() => scrollMonthlyChartToMonth(focusedMonthlyMonth));
  }
}

function monthlyMeterPercent(value, maximum) {
  const amount = Math.max(0, Number(value || 0));
  if (!amount || !maximum) return 0;
  return Math.max(4, Math.round(amount / maximum * 100));
}

function monthlySavingsRateLabel(savings, income) {
  const incomeAmount = Number(income || 0);
  return incomeAmount > 0 ? formatPercent(savings, incomeAmount) : "—";
}

function renderMonthlyDelta(delta) {
  if (delta === null || delta === undefined) {
    return `<small class="monthly-cell-delta steady">기간 첫 달</small>`;
  }
  const amount = Number(delta || 0);
  const tone = amount > 0 ? "increase" : amount < 0 ? "decrease" : "steady";
  const label = amount === 0 ? "전월과 동일" : `전월 대비 ${formatSignedWon(amount)}`;
  return `<small class="monthly-cell-delta ${tone}">${escapeHtml(label)}</small>`;
}

function attachMonthlyFlowHandlers() {
  els.monthlyFlowTable.querySelectorAll("[data-month-row]").forEach((row) => {
    const month = row.dataset.monthRow;
    row.addEventListener("mouseenter", () => setMonthlyFlowHighlight(month));
    row.addEventListener("mouseleave", restoreMonthlyFlowFocus);
    row.addEventListener("focus", () => setMonthlyFlowHighlight(month));
    row.addEventListener("blur", restoreMonthlyFlowFocus);
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
    group.addEventListener("focus", () => setMonthlyFlowHighlight(month));
    group.addEventListener("blur", restoreMonthlyFlowFocus);
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
  scrollMonthlyChartToMonth(month, { behavior: "smooth" });
  const row = els.monthlyFlowTable.querySelector(`[data-month-row="${cssEscape(month)}"]`);
  if (!row) return;
  row.classList.add("is-scroll-target");
  row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  window.setTimeout(() => row.classList.remove("is-scroll-target"), 1200);
}

function scrollMonthlyChartToMonth(month, options = {}) {
  const scrollArea = els.monthlyFlowChart?.querySelector("[data-monthly-chart-scroll]");
  if (!month || !scrollArea || scrollArea.scrollWidth <= scrollArea.clientWidth) return;
  const group = els.monthlyFlowChart.querySelector(`[data-chart-month="${cssEscape(month)}"]`);
  if (!group) return;
  const chartRect = scrollArea.getBoundingClientRect();
  const groupRect = group.getBoundingClientRect();
  const targetLeft = scrollArea.scrollLeft
    + groupRect.left
    - chartRect.left
    - ((chartRect.width - groupRect.width) / 2);
  scrollArea.scrollTo({
    left: Math.max(0, targetLeft),
    behavior: options.behavior === "smooth" ? "smooth" : "auto"
  });
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
  els.monthlyFlowChart.querySelectorAll("[data-chart-selection]").forEach((selection) => {
    const isTarget = selection.dataset.chartSelection === month;
    selection.classList.toggle("is-highlighted", isTarget);
    selection.classList.toggle("is-persistent", persistent && isTarget);
  });
  els.monthlyFlowChart.querySelectorAll("[data-chart-tooltip]").forEach((tooltip) => {
    const isTarget = tooltip.dataset.chartTooltip === month;
    tooltip.classList.toggle("is-highlighted", !persistent && isTarget);
  });
  if (persistent) updateMonthlyChartSelectedSummary(month);
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
  els.monthlyFlowChart.querySelectorAll("[data-chart-selection]").forEach((selection) => {
    selection.classList.remove("is-highlighted");
    selection.classList.toggle("is-persistent", Boolean(focusedMonthlyMonth && selection.dataset.chartSelection === focusedMonthlyMonth));
  });
  els.monthlyFlowChart.querySelectorAll("[data-chart-tooltip]").forEach((tooltip) => {
    tooltip.classList.remove("is-highlighted");
  });
}

function updateMonthlyChartSelectedSummary(month) {
  const group = els.monthlyFlowChart.querySelector(`[data-chart-month="${cssEscape(month)}"]`);
  const summary = els.monthlyFlowChart.querySelector("[data-monthly-selected-summary]");
  if (!group || !summary) return;
  const consumptionDeltaText = group.dataset.chartConsumptionDelta;
  const hasPreviousMonth = consumptionDeltaText !== "";
  const values = {
    month,
    income: Number(group.dataset.chartIncome || 0),
    consumption: Number(group.dataset.chartConsumption || 0),
    savings: Number(group.dataset.chartSavings || 0),
    balance: Number(group.dataset.chartBalance || 0),
    growth: Number(group.dataset.chartGrowth || 0),
    asset: Number(group.dataset.chartAsset || 0),
    delta: Number(consumptionDeltaText || 0),
    rate: group.dataset.chartSavingsRate || "—"
  };
  const textByField = {
    month: values.month,
    income: formatWon(values.income),
    consumption: formatWon(values.consumption),
    savings: formatWon(values.savings),
    balance: formatSignedWon(values.balance),
    growth: formatSignedWon(values.growth),
    asset: formatSignedWon(values.asset),
    rate: values.rate,
    delta: !hasPreviousMonth ? "기간 첫 달" : values.delta === 0 ? "전월과 동일" : `전월 대비 ${formatSignedWon(values.delta)}`
  };
  Object.entries(textByField).forEach(([field, text]) => {
    const target = summary.querySelector(`[data-monthly-selected-${field}]`);
    if (target) target.textContent = text;
  });
  setMonthlySignedTone(summary.querySelector("[data-monthly-selected-balance]"), values.balance);
  setMonthlySignedTone(summary.querySelector("[data-monthly-selected-growth]"), values.growth);
  setMonthlySignedTone(summary.querySelector("[data-monthly-selected-asset]"), values.asset);
  const deltaLabel = summary.querySelector("[data-monthly-selected-delta]");
  if (deltaLabel) {
    deltaLabel.classList.toggle("increase", values.delta > 0);
    deltaLabel.classList.toggle("decrease", values.delta < 0);
  }
}

function setMonthlySignedTone(element, value) {
  if (!element) return;
  element.classList.toggle("positive", value >= 0);
  element.classList.toggle("negative", value < 0);
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

function buildMonthlyFlowRows(reportRows = reportingExpenseRows(classified)) {
  const months = unique([
    ...classified.filter((item) => item.status !== "취소/제외").map((item) => item.month).filter(Boolean),
    ...reportRows.map((item) => item.month).filter(Boolean),
    ...Object.keys(monthlyIncome).filter(Boolean),
    ...recurringExpenses.flatMap((item) => [item.startMonth, item.endMonth]).filter(Boolean)
  ]).filter(isValidMonthKey).sort();
  return months.map((month) => buildMonthlyFlowRow(month, reportRows));
}

function buildMonthlyFlowRow(month, reportRows) {
  const expenses = reportRows.filter((item) => item.month === month);
  const savingsExpenses = expenses.filter(isMonthlySavingsTransaction);
  const consumptionExpenses = expenses.filter((item) => !isMonthlySavingsTransaction(item));
  const importedIncome = importedIncomeForMonth(month);
  const manualIncome = Number(monthlyIncome[month] || 0);
  const income = importedIncome + manualIncome;
  const totalPayment = sum(expenses, "amount");
  const reimbursement = sumReimbursements(expenses);
  const consumptionSpend = sumActual(consumptionExpenses);
  const actualSavings = sumActual(savingsExpenses);
  const freeBalance = income - consumptionSpend - actualSavings;
  const assetGrowth = income - consumptionSpend;
  const scheduled = scheduledTotalForMonth(month);
  return {
    month,
    totalPayment,
    reimbursement,
    consumptionSpend,
    actualSavings,
    income,
    freeBalance,
    assetGrowth,
    scheduled,
    expectedFreeBalance: freeBalance - scheduled,
    specialIncome: importedIncome
  };
}

function isMonthlySavingsTransaction(item) {
  return item?.sector === "저축" && item?.subcategory === "적금/예금";
}

function updateMonthlyYearOptions(rows) {
  const previous = els.monthlyYearFilter.value || "all";
  const previousStartYear = els.monthlyStartYear?.value || "";
  const previousEndYear = els.monthlyEndYear?.value || "";
  const years = unique(rows.map((row) => row.month.slice(0, 4))).sort();
  const options = [
    `<option value="all">전체 연도</option>`,
    `<option value="range">직접 기간</option>`,
    ...years.map((year) => `<option value="year:${escapeHtml(year)}">${escapeHtml(year)}년</option>`)
  ];
  els.monthlyYearFilter.innerHTML = options.join("");
  const previousExists = [...els.monthlyYearFilter.options].some((option) => option.value === previous);
  const latestYearValue = years.length ? `year:${years.at(-1)}` : "all";
  els.monthlyYearFilter.value = monthlyYearFilterInitialized && previousExists ? previous : latestYearValue;
  if (years.length) monthlyYearFilterInitialized = true;
  updateMonthlyRangeYearOptions(years, previousStartYear, previousEndYear);
  updateMonthlyYearNavigation(years);
}

function updateMonthlyRangeYearOptions(years, previousStartYear = "", previousEndYear = "") {
  if (!els.monthlyStartYear || !els.monthlyEndYear) return;
  const yearOptions = years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}년</option>`).join("");
  els.monthlyStartYear.innerHTML = yearOptions;
  els.monthlyEndYear.innerHTML = yearOptions;

  const firstYear = years[0] || "";
  const lastYear = years[years.length - 1] || firstYear;
  els.monthlyStartYear.value = years.includes(previousStartYear) ? previousStartYear : firstYear;
  els.monthlyEndYear.value = years.includes(previousEndYear) ? previousEndYear : lastYear;

  const rangeEnabled = els.monthlyYearFilter.value === "range";
  els.monthlyStartYear.disabled = !rangeEnabled;
  els.monthlyEndYear.disabled = !rangeEnabled;
  els.monthlyStartYear.closest("label")?.toggleAttribute("hidden", !rangeEnabled);
  els.monthlyEndYear.closest("label")?.toggleAttribute("hidden", !rangeEnabled);
}

function updateMonthlyYearNavigation(years) {
  const mode = els.monthlyYearFilter.value || "all";
  const selectedYear = mode.startsWith("year:") ? mode.slice(5) : "";
  const index = years.indexOf(selectedYear);
  if (els.monthlyPrevYear) els.monthlyPrevYear.disabled = index <= 0;
  if (els.monthlyNextYear) els.monthlyNextYear.disabled = index < 0 || index >= years.length - 1;
}

function moveMonthlyYear(offset) {
  const years = [...els.monthlyYearFilter.options]
    .map((option) => option.value)
    .filter((value) => value.startsWith("year:"))
    .map((value) => value.slice(5));
  const selectedYear = els.monthlyYearFilter.value.startsWith("year:")
    ? els.monthlyYearFilter.value.slice(5)
    : "";
  const currentIndex = years.indexOf(selectedYear);
  const targetIndex = currentIndex + Number(offset || 0);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= years.length) return;
  const targetYear = years[targetIndex];
  const monthNumber = isValidMonthKey(focusedMonthlyMonth) ? focusedMonthlyMonth.slice(5) : "12";
  els.monthlyYearFilter.value = `year:${targetYear}`;
  setSharedSelectedMonth(`${targetYear}-${monthNumber}`, { syncControls: false });
  renderMonthlyFlow();
}

function filterMonthlyRows(rows, reportRows = reportingExpenseRows(classified)) {
  if (!rows.length) return [];
  const months = monthlyMonthsForFilter(rows);
  const rowByMonth = new Map(rows.map((row) => [row.month, row]));
  let cumulativeAssetGrowth = 0;
  let previousRow = null;
  return months.map((month) => {
    const base = rowByMonth.get(month) || buildMonthlyFlowRow(month, reportRows);
    cumulativeAssetGrowth += base.assetGrowth;
    const row = {
      ...base,
      cumulativeAssetGrowth,
      totalPaymentDelta: previousRow ? base.totalPayment - previousRow.totalPayment : null,
      consumptionDelta: previousRow ? base.consumptionSpend - previousRow.consumptionSpend : null,
      savingsDelta: previousRow ? base.actualSavings - previousRow.actualSavings : null,
      incomeDelta: previousRow ? base.income - previousRow.income : null,
      freeBalanceDelta: previousRow ? base.freeBalance - previousRow.freeBalance : null,
      assetGrowthDelta: previousRow ? base.assetGrowth - previousRow.assetGrowth : null
    };
    previousRow = row;
    return row;
  });
}

function monthlyMonthsForFilter(rows) {
  const mode = els.monthlyYearFilter.value || "all";
  if (mode === "all") return monthlyMonthKeysBetween(rows[0].month, rows.at(-1).month);
  if (mode.startsWith("year:")) {
    const year = mode.slice(5);
    return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  }
  if (mode === "range") {
    const startYear = Number(els.monthlyStartYear?.value || 0);
    const endYear = Number(els.monthlyEndYear?.value || 0);
    if (!startYear || !endYear) return monthlyMonthKeysBetween(rows[0].month, rows.at(-1).month);
    const minYear = Math.min(startYear, endYear);
    const maxYear = Math.max(startYear, endYear);
    return monthlyMonthKeysBetween(`${minYear}-01`, `${maxYear}-12`);
  }
  return monthlyMonthKeysBetween(rows[0].month, rows.at(-1).month);
}

function monthlyMonthKeysBetween(startMonth, endMonth) {
  if (!isValidMonthKey(startMonth) || !isValidMonthKey(endMonth) || startMonth > endMonth) return [];
  const months = [];
  for (let month = startMonth; month <= endMonth && months.length < 600; month = shiftMonthKey(month, 1)) {
    months.push(month);
  }
  return months;
}

function latestMeaningfulMonthlyRow(rows) {
  return [...rows].reverse().find(monthlyRowHasActivity) || rows.at(-1);
}

function monthlyRowHasActivity(row) {
  return [row.totalPayment, row.consumptionSpend, row.actualSavings, row.income, row.scheduled]
    .some((value) => Number(value || 0) !== 0);
}

function currentMonthlyRangeLabel() {
  const mode = els.monthlyYearFilter.value || "all";
  if (mode === "all") return "전체 기록";
  if (mode.startsWith("year:")) return `${mode.slice(5)}년`;
  if (mode === "range") {
    const startYear = els.monthlyStartYear?.value || "";
    const endYear = els.monthlyEndYear?.value || "";
    if (startYear && endYear) {
      const ordered = [startYear, endYear].sort();
      return `${ordered[0]}년 ~ ${ordered[1]}년`;
    }
  }
  return "선택 기간";
}
