function monthlyAnalysisHasIncome(month) {
  return (Object.prototype.hasOwnProperty.call(monthlyIncome, month)
    && Number.isFinite(Number(monthlyIncome[month])))
    || classified.some((item) => item.month === month && item.flow === "income"
      && item.status !== "취소/제외" && !isCanceled(item.cancel) && incomeReportingAmount(item) > 0);
}

function monthlyAnalysisDate(item, month) {
  const value = normalizeInputDate(item.approvalDate || item.date || "");
  if (!value || value.slice(0, 7) !== month) return "";
  const [year, monthNumber, day] = value.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === monthNumber - 1 && date.getDate() === day ? value : "";
}

function monthlyAnalysisPeriod(snapshot, cutoffDay) {
  const undatedRows = cutoffDay
    ? snapshot.consumptionRows.filter((item) => !monthlyAnalysisDate(item, snapshot.month)) : [];
  const rows = cutoffDay ? snapshot.consumptionRows.filter((item) => {
    const date = monthlyAnalysisDate(item, snapshot.month);
    return date && Number(date.slice(8)) <= cutoffDay;
  }) : snapshot.consumptionRows;
  return {
    month: snapshot.month,
    label: `${snapshot.month} ${cutoffDay ? `1~${cutoffDay}일` : "전체"}`,
    rows,
    amount: sumConsumption(rows),
    undatedCount: undatedRows.length,
    undatedAmount: sumConsumption(undatedRows)
  };
}

function buildMonthlyAnalysisModel(month, mode = "previous", today = defaultDateForMonth("")) {
  if (!isValidMonthKey(month)) return null;
  const definition = analysisComparisonDefinition(mode === "year" ? "year" : "previous");
  const comparisonMonth = shiftMonthKey(month, definition.offset);
  const current = buildAnalysisMonthSnapshot(month);
  const previous = buildAnalysisMonthSnapshot(comparisonMonth);
  const currentIncomeKnown = monthlyAnalysisHasIncome(month);
  const previousIncomeKnown = monthlyAnalysisHasIncome(comparisonMonth);
  const hasCurrent = Boolean(current.expenseRows.length || currentIncomeKnown || current.loanSettlementDelta);
  const hasComparison = Boolean(previous.expenseRows.length || previousIncomeKnown || previous.loanSettlementDelta);
  const isCurrentMonth = month === today.slice(0, 7);
  const isFutureMonth = month > today.slice(0, 7);
  const [comparisonYear, comparisonMonthNumber] = comparisonMonth.split("-").map(Number);
  const cutoffDay = isCurrentMonth
    ? Math.min(Number(today.slice(8)), new Date(comparisonYear, comparisonMonthNumber, 0).getDate()) : 0;
  const currentPeriod = monthlyAnalysisPeriod(current, cutoffDay);
  const previousPeriod = monthlyAnalysisPeriod(previous, cutoffDay);
  const currentTotals = analysisTotalsBy(currentPeriod.rows, (item) => item.sector || "미분류");
  const previousTotals = analysisTotalsBy(previousPeriod.rows, (item) => item.sector || "미분류");
  const sectorChanges = [...new Set([...currentTotals.keys(), ...previousTotals.keys()])].map((sector) => {
    const currentAmount = currentTotals.get(sector) || 0;
    const previousAmount = previousTotals.get(sector) || 0;
    return {
      sector,
      current: currentAmount,
      previous: previousAmount,
      delta: currentAmount - previousAmount,
      currentRows: currentPeriod.rows.filter((item) => (item.sector || "미분류") === sector),
      previousRows: previousPeriod.rows.filter((item) => (item.sector || "미분류") === sector)
    };
  }).filter((item) => item.current !== 0 || item.previous !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.sector.localeCompare(b.sector, "ko-KR"));
  const balanceDrivers = [
    { key: "income", label: "수입", factor: 1, note: "들어온 돈" },
    { key: "consumptionSpend", label: "소비지출", factor: -1, note: "정산금 차감 후 · 대출 이자 포함" },
    { key: "actualSavings", label: "실제 저축", factor: -1, note: "적금·예금 · 소비 아님" },
    { key: "debtRepayment", label: "내 대출 원금 부담", factor: -1, note: "빚을 갚은 돈 · 소비 아님" },
    { key: "loanSettlementDelta", label: "가족 정산 조정", factor: 1, note: "대출 분담금의 약정액과 실제 수령액 차이" }
  ].map((driver) => ({
    ...driver,
    current: current[driver.key],
    previous: previous[driver.key],
    change: current[driver.key] - previous[driver.key],
    impact: (current[driver.key] - previous[driver.key]) * driver.factor,
    currentEffect: current[driver.key] * driver.factor
  }));
  return {
    month, comparisonMonth, current, previous, currentPeriod, previousPeriod,
    comparisonMode: definition.mode,
    comparisonLabel: definition.label,
    currentIncomeKnown, previousIncomeKnown, hasCurrent, hasComparison,
    isCurrentMonth, isFutureMonth, cutoffDay,
    canCompareConsumption: hasCurrent && hasComparison && !isFutureMonth,
    canCompareBalance: hasCurrent && hasComparison && !isCurrentMonth && !isFutureMonth
      && currentIncomeKnown && previousIncomeKnown,
    consumptionDelta: currentPeriod.amount - previousPeriod.amount,
    balanceDelta: current.freeBalance - previous.freeBalance,
    sectorChanges,
    balanceDrivers
  };
}
