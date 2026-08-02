const ANALYSIS_SPENDING_SECTORS = Object.freeze(
  Object.keys(categories).filter((sector) => !["저축", "수입", "미분류"].includes(sector))
);

const ANALYSIS_DEFAULT_CONSUMPTION_TYPES = Object.freeze({
  "고정 주거비::보험료": "essential",
  "고정 주거비::월세": "essential",
  "고정 주거비::전기": "essential",
  "고정 주거비::가스": "essential",
  "고정 주거비::통신비": "essential",
  "고정 주거비::대출이자": "essential",
  "식비::장보기/마트": "essential",
  "생활용품::소모품": "essential",
  "생활용품::문구/작업용품": "discretionary",
  "생활용품::집 관리": "essential",
  "개인관리::의료": "essential",
  "교통비::대중교통": "essential",
  "교통비::기차": "essential",
  "교통비::고속버스": "essential",
  "교통비::주유/차량": "essential",
  "기타 소비::증명서/행정": "essential",
  "기타 소비::수수료/기타": "essential"
});

const ANALYSIS_CHANGE_MIN_AMOUNT = 10000;
const ANALYSIS_CHANGE_MIN_RATE = 20;

function analysisMonthOptions(extraMonths = []) {
  const source = appMonthOptions(extraMonths);
  if (!source.length) return unique([currentMonthKey(), ...extraMonths]).filter(isValidMonthKey).sort();
  const first = source[0];
  const last = source.at(-1);
  const months = [];
  let cursor = first;
  while (cursor <= last && months.length < 360) {
    months.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }
  return unique([...months, ...extraMonths]).filter(isValidMonthKey).sort();
}

function fillAnalysisMonthSelect(select, preferredMonth = "") {
  if (!select) return "";
  const selected = getSharedSelectedMonth(preferredMonth || select.value || currentMonthKey());
  const months = analysisMonthOptions([selected]);
  select.innerHTML = months
    .map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`)
    .join("");
  syncMonthSelectValue(select, selected);
  return select.value || selected;
}

function moveAnalysisMonth(select, offset, render) {
  if (!select) return;
  const months = analysisMonthOptions([select.value || getSharedSelectedMonth(currentMonthKey())]);
  const current = select.value || getSharedSelectedMonth(months.at(-1) || currentMonthKey());
  const currentIndex = Math.max(0, months.indexOf(current));
  const nextIndex = Math.min(months.length - 1, Math.max(0, currentIndex + offset));
  const nextMonth = months[nextIndex];
  if (!nextMonth || nextMonth === current) return;
  setSharedSelectedMonth(nextMonth, { syncControls: false });
  select.value = nextMonth;
  render();
}

function analysisMonthDisplay(month) {
  if (!isValidMonthKey(month)) return "-";
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function analysisPercent(value, maximum) {
  return maximum ? Number(value || 0) / Number(maximum) * 100 : 0;
}

function analysisPercentText(value, digits = 1) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${number.toFixed(digits)}%`;
}

function analysisSignedPercentPoint(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(1)}%p`;
}

function analysisConsumptionTypeKey(sector, subcategory) {
  return `${sector || ""}::${subcategory || ""}`;
}

function analysisConsumptionTypeFor(item) {
  if (item?.sector === "미분류") return "unknown";
  if (item?.sector === "저축") return "saving";
  const key = analysisConsumptionTypeKey(item?.sector, item?.subcategory);
  const override = appSettings.analysis?.consumptionTypes?.[key];
  if (["essential", "discretionary"].includes(override)) return override;
  return ANALYSIS_DEFAULT_CONSUMPTION_TYPES[key] || "discretionary";
}

function analysisIsSavingsTransaction(item) {
  return typeof isMonthlySavingsTransaction === "function"
    ? isMonthlySavingsTransaction(item)
    : item?.sector === "저축" && item?.subcategory === "적금/예금";
}

function analysisIsFixedCostTransaction(item) {
  if (!item || analysisIsSavingsTransaction(item)) return false;
  return item.sector === "고정 주거비"
    || item.sourceType === "recurring"
    || Boolean(item.recurringId);
}

function analysisRowsForMonth(month) {
  return reportingExpenseRows(classified, { months: [month] });
}

function analysisIncomeForMonth(month) {
  return importedIncomeForMonth(month) + Number(monthlyIncome[month] || 0);
}

function analysisTotalsBy(rows, getKey) {
  const totals = new Map();
  rows.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    totals.set(key, Number(totals.get(key) || 0) + consumptionAmount(item));
  });
  return totals;
}

function analysisMerchantName(item) {
  return String(item?.merchant || item?.description || "내용 없음").trim() || "내용 없음";
}

function analysisMerchantKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}·._,\-/\\]/g, "");
}

function buildAnalysisMonthSnapshot(month) {
  const expenseRows = analysisRowsForMonth(month);
  const savingsRows = expenseRows.filter(analysisIsSavingsTransaction);
  const consumptionRows = expenseRows.filter((item) => !analysisIsSavingsTransaction(item));
  const unknownRows = consumptionRows.filter((item) => item.sector === "미분류" || item.status === "미분류");
  const fixedRows = consumptionRows.filter(analysisIsFixedCostTransaction);
  const income = analysisIncomeForMonth(month);
  const consumptionSpend = sumConsumption(consumptionRows);
  const actualSavings = sumActual(savingsRows);
  const debtRepayment = sumDebtPrincipal(expenseRows);
  const freeBalance = income - consumptionSpend - actualSavings - debtRepayment;
  const assetFormation = actualSavings + debtRepayment + freeBalance;
  const sectorTotals = analysisTotalsBy(consumptionRows, (item) => item.sector);
  const subcategoryTotals = analysisTotalsBy(
    consumptionRows,
    (item) => analysisConsumptionTypeKey(item.sector, item.subcategory)
  );
  const merchantTotals = analysisTotalsBy(consumptionRows, analysisMerchantName);
  const classifiedCount = expenseRows.length - unknownRows.length;
  const dataQuality = expenseRows.length ? classifiedCount / expenseRows.length * 100 : 100;

  return {
    month,
    expenseRows,
    savingsRows,
    consumptionRows,
    unknownRows,
    fixedRows,
    income,
    consumptionSpend,
    actualSavings,
    debtRepayment,
    freeBalance,
    assetFormation,
    assetFormationRate: analysisPercent(assetFormation, income),
    fixedCost: sumConsumption(fixedRows),
    fixedCostRate: analysisPercent(sumConsumption(fixedRows), income),
    totalPayment: sum(expenseRows, "amount"),
    reimbursement: sumReimbursements(expenseRows),
    sectorTotals,
    subcategoryTotals,
    merchantTotals,
    dataQuality,
    classifiedCount
  };
}

function analysisSnapshotHasObservedData(snapshot) {
  return Boolean(snapshot?.expenseRows?.length || snapshot?.income > 0);
}

function analysisComparisonDefinition(mode = "year") {
  return mode === "previous"
    ? { mode: "previous", offset: -1, label: "전월", insightKind: "month-over-month" }
    : { mode: "year", offset: -12, label: "전년 동월", insightKind: "year-over-year" };
}

function buildAnalysisComparison(month, mode = "year") {
  const definition = analysisComparisonDefinition(mode);
  const current = buildAnalysisMonthSnapshot(month);
  const comparisonMonth = shiftMonthKey(month, definition.offset);
  const previous = buildAnalysisMonthSnapshot(comparisonMonth);
  const hasComparison = analysisSnapshotHasObservedData(previous);
  const sectorChanges = ANALYSIS_SPENDING_SECTORS
    .map((sector) => {
      const currentValue = Number(current.sectorTotals.get(sector) || 0);
      const previousValue = Number(previous.sectorTotals.get(sector) || 0);
      return {
        sector,
        current: currentValue,
        previous: previousValue,
        delta: currentValue - previousValue
      };
    })
    .filter((item) => item.current || item.previous);

  return {
    current,
    previous,
    comparisonMode: definition.mode,
    comparisonLabel: definition.label,
    comparisonMonth,
    hasComparison,
    sectorChanges,
    consumptionDelta: current.consumptionSpend - previous.consumptionSpend,
    fixedCostRateDelta: current.fixedCostRate - previous.fixedCostRate
  };
}

function buildAnalysisStructure(month) {
  const snapshot = buildAnalysisMonthSnapshot(month);
  const groups = {
    essential: [],
    discretionary: [],
    unknown: []
  };
  snapshot.consumptionRows.forEach((item) => {
    const type = analysisConsumptionTypeFor(item);
    (groups[type] || groups.discretionary).push(item);
  });
  const essential = sumConsumption(groups.essential);
  const discretionary = sumConsumption(groups.discretionary);
  const unknown = sumConsumption(groups.unknown);
  const assetFormation = snapshot.assetFormation;
  const overrun = Math.max(0, -assetFormation);
  const allocationBase = Math.max(snapshot.income, snapshot.consumptionSpend, 1);
  const targetRatios = analysisTargetRatios();

  return {
    ...snapshot,
    groups,
    essential,
    discretionary,
    unknown,
    overrun,
    allocationBase,
    targetRatios,
    hasTargets: Object.keys(targetRatios).length > 0,
    essentialRate: analysisPercent(essential, snapshot.income),
    discretionaryRate: analysisPercent(discretionary, snapshot.income),
    unknownRate: analysisPercent(unknown, snapshot.income)
  };
}

function analysisTargetRatios() {
  const raw = appSettings.analysis?.targetRatios;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    ANALYSIS_SPENDING_SECTORS
      .map((sector) => [sector, Math.min(100, Math.max(0, Number(raw[sector] || 0)))])
      .filter(([, value]) => value > 0)
  );
}

function analysisMedian(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildAnalysisTargetSuggestion(month) {
  const months = analysisMonthOptions()
    .filter((candidate) => candidate <= month)
    .reverse()
    .filter((candidate) => analysisIncomeForMonth(candidate) > 0)
    .slice(0, 6)
    .reverse();
  const values = Object.fromEntries(ANALYSIS_SPENDING_SECTORS.map((sector) => [sector, []]));

  months.forEach((candidate) => {
    const snapshot = buildAnalysisMonthSnapshot(candidate);
    ANALYSIS_SPENDING_SECTORS.forEach((sector) => {
      values[sector].push(analysisPercent(snapshot.sectorTotals.get(sector) || 0, snapshot.income));
    });
  });

  const ratios = Object.fromEntries(
    ANALYSIS_SPENDING_SECTORS.map((sector) => [
      sector,
      Math.max(0, Math.round(analysisMedian(values[sector]) * 10) / 10)
    ])
  );
  const total = Object.values(ratios).reduce((sumValue, value) => sumValue + value, 0);
  if (total > 100) {
    const scale = 100 / total;
    ANALYSIS_SPENDING_SECTORS.forEach((sector) => {
      ratios[sector] = Math.round(ratios[sector] * scale * 10) / 10;
    });
  }
  return { months, ratios };
}

function buildAnalysisTargetRows(month) {
  const structure = buildAnalysisStructure(month);
  return ANALYSIS_SPENDING_SECTORS.map((sector) => {
    const targetRate = Number(structure.targetRatios[sector] || 0);
    const actualAmountValue = Number(structure.sectorTotals.get(sector) || 0);
    const actualRate = analysisPercent(actualAmountValue, structure.income);
    return {
      sector,
      targetRate,
      targetAmount: structure.income * targetRate / 100,
      actualAmount: actualAmountValue,
      actualRate,
      deltaRate: actualRate - targetRate
    };
  });
}

function analysisInsightTone(delta) {
  if (delta > 0) return "negative";
  if (delta < 0) return "positive";
  return "neutral";
}

function analysisInsightId(type, sector, subcategory, extra = "") {
  return [type, sector, subcategory, extra].filter(Boolean).join("::");
}

function buildAnalysisChangeInsights(month, mode = "year") {
  const definition = analysisComparisonDefinition(mode);
  const current = buildAnalysisMonthSnapshot(month);
  const comparisonMonth = shiftMonthKey(month, definition.offset);
  const previous = buildAnalysisMonthSnapshot(comparisonMonth);
  const previousMonth = shiftMonthKey(month, -1);
  const twoMonthsAgo = shiftMonthKey(month, -2);
  const previousSnapshot = buildAnalysisMonthSnapshot(previousMonth);
  const twoMonthsAgoSnapshot = buildAnalysisMonthSnapshot(twoMonthsAgo);
  const insights = [];
  const seen = new Set();

  const subscriptionRows = current.consumptionRows.filter((item) => item.subcategory === "구독료");
  const previousSixMonths = new Set(Array.from({ length: 6 }, (_, index) => shiftMonthKey(month, -(index + 1))));
  const firstObservedMonth = analysisMonthOptions()[0] || month;
  const hasSixMonthCoverage = firstObservedMonth <= shiftMonthKey(month, -6);
  const historicalSubscriptionMerchants = new Set(
    reportingExpenseRows(classified)
      .filter((item) => item.subcategory === "구독료" && previousSixMonths.has(item.month))
      .map((item) => analysisMerchantKey(analysisMerchantName(item)))
      .filter(Boolean)
  );
  const newSubscriptionRows = subscriptionRows.filter(
    (item) => !historicalSubscriptionMerchants.has(analysisMerchantKey(analysisMerchantName(item)))
  );
  if (newSubscriptionRows.length && hasSixMonthCoverage) {
    const merchantNames = unique(newSubscriptionRows.map(analysisMerchantName));
    const amount = sumConsumption(newSubscriptionRows);
    const id = analysisInsightId("subscription-new", "기타 소비", "구독료");
    seen.add(id);
    insights.push({
      id,
      kind: "subscription-new",
      priority: 5,
      tone: "warning",
      icon: "ti-wallet",
      title: `구독료 ${newSubscriptionRows.length.toLocaleString("ko-KR")}건 신규`,
      reason: merchantNames.slice(0, 2).join(", "),
      context: `최근 6개월에 없던 ${month} 결제`,
      amount,
      month,
      sector: "기타 소비",
      subcategory: "구독료",
      query: merchantNames.length === 1 ? merchantNames[0] : ""
    });
  }

  if (analysisSnapshotHasObservedData(previous)) {
    current.subcategoryTotals.forEach((currentValue, key) => {
      const [sector, subcategory] = key.split("::");
      if (!sector || !subcategory || ["미분류", "저축"].includes(sector)) return;
      const previousValue = Number(previous.subcategoryTotals.get(key) || 0);
      const delta = currentValue - previousValue;
      const absoluteRate = previousValue
        ? Math.abs(delta) / previousValue * 100
        : currentValue >= ANALYSIS_CHANGE_MIN_AMOUNT ? 100 : 0;
      if (Math.abs(delta) < ANALYSIS_CHANGE_MIN_AMOUNT || absoluteRate < ANALYSIS_CHANGE_MIN_RATE) return;
      const id = analysisInsightId(definition.insightKind, sector, subcategory);
      if (seen.has(id)) return;
      seen.add(id);
      const rate = previousValue ? delta / previousValue * 100 : 100;
      insights.push({
        id,
        kind: definition.insightKind,
        priority: delta > 0 ? 3 : 2,
        tone: analysisInsightTone(delta),
        icon: analysisSectorIcon(sector),
        title: previousValue
          ? `${subcategory} ${definition.label} ${rate > 0 ? "+" : ""}${Math.round(rate)}%`
          : `${subcategory} ${definition.label} 대비 신규`,
        reason: `${comparisonMonth} ${formatWon(previousValue)} → ${month} ${formatWon(currentValue)}`,
        context: delta > 0 ? `${definition.label}보다 지출 증가` : `${definition.label}보다 지출 감소`,
        amount: delta,
        month,
        sector,
        subcategory,
        query: ""
      });
    });
  }

  if (
    analysisSnapshotHasObservedData(previousSnapshot)
    && analysisSnapshotHasObservedData(twoMonthsAgoSnapshot)
  ) {
    current.subcategoryTotals.forEach((currentValue, key) => {
      const [sector, subcategory] = key.split("::");
      if (!sector || !subcategory || ["미분류", "저축"].includes(sector)) return;
      const previousValue = Number(previousSnapshot.subcategoryTotals.get(key) || 0);
      const twoMonthsAgoValue = Number(twoMonthsAgoSnapshot.subcategoryTotals.get(key) || 0);
      if (!(currentValue > previousValue && previousValue > twoMonthsAgoValue)) return;
      if (currentValue - twoMonthsAgoValue < ANALYSIS_CHANGE_MIN_AMOUNT) return;
      const id = analysisInsightId("consecutive-rise", sector, subcategory);
      const sameCategoryAlreadyShown = insights.some(
        (insight) => insight.sector === sector && insight.subcategory === subcategory && insight.tone === "negative"
      );
      if (seen.has(id) || sameCategoryAlreadyShown) return;
      seen.add(id);
      insights.push({
        id,
        kind: "consecutive-rise",
        priority: 4,
        tone: "negative",
        icon: analysisSectorIcon(sector),
        title: `${subcategory} 2개월 연속 상승`,
        reason: `${twoMonthsAgo} ${formatWon(twoMonthsAgoValue)} → ${month} ${formatWon(currentValue)}`,
        context: "최근 3개월 연속 비교",
        amount: currentValue - twoMonthsAgoValue,
        month,
        sector,
        subcategory,
        query: ""
      });
    });
  }

  return insights
    .sort((a, b) => b.priority - a.priority || Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 12);
}

function analysisSectorIcon(sector) {
  return {
    "고정 주거비": "ti-building-bank",
    "식비": "ti-tools-kitchen-2",
    "생활용품": "ti-package",
    "쇼핑": "ti-shopping-cart",
    "개인관리": "ti-sparkles",
    "자기개발": "ti-books",
    "교통비": "ti-bus",
    "저축": "ti-pig-money",
    "기타 소비": "ti-dots",
    "미분류": "ti-help-circle"
  }[sector] || "ti-category";
}

function analysisBillingModelForMonth(month) {
  const settings = normalizeCardBillingSettings(appSettings.cardBilling);
  const billingMonth = settings.startDay > settings.endDay ? shiftMonthKey(month, 1) : month;
  return typeof buildCalendarCardBillingModel === "function"
    ? buildCalendarCardBillingModel(billingMonth)
    : null;
}

function analysisDetailOptions(insight, sourceView) {
  return {
    sourceView,
    sourceLabel: sourceView === "monthlyAnalysis" ? "월간 분석" : "소비 구조 분석",
    month: insight.month,
    sector: insight.sector || "all",
    subcategory: insight.subcategory || "all",
    query: insight.query || "",
    hideZero: true,
    entryType: "actual",
    returnTo: {
      source: sourceView,
      month: insight.month,
      scrollY: window.scrollY || 0
    }
  };
}
