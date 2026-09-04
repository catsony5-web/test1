const SUMMARY_FOOD_GROUPS = [
  { key: "coupang", label: "쿠팡 장보기" },
  { key: "delivery", label: "배달" },
  { key: "dining", label: "외식" },
  { key: "other", label: "기타 식비" }
];

function summaryFoodMerchantKind(item) {
  const merchant = String(item?.merchant || "").toLowerCase().replace(/\s+/g, "");
  if (!/쿠팡|coupang/.test(merchant)) return "";
  if (/이츠|eats/.test(merchant)) return "delivery";
  if (/와우|wow|멤버십|membership/.test(merchant)) return "membership";
  return "order";
}

function summaryFoodGroup(item) {
  if (item?.sector !== "식비") return "";
  const merchantKind = summaryFoodMerchantKind(item);
  const subcategory = String(item.subcategory || "");
  if (merchantKind === "delivery" || subcategory.startsWith("배달")) return "delivery";
  if (subcategory.startsWith("외식")) return "dining";
  if (merchantKind === "order") return "coupang";
  return "other";
}

function summaryFoodIsPending(item) {
  return summaryFoodMerchantKind(item) === "order"
    && !(item.manualSector && item.manualSubcategory && item.manualSector !== "미분류");
}

function summaryFoodSourceKey(item) {
  return item.installmentSourceRecordKey || item.recordKey;
}

function summaryFoodDateKey(item, month) {
  const key = normalizeInputDate(item?.approvalDate || item?.date || "");
  if (!key || key.slice(0, 7) !== month) return "";
  const [year, monthNumber, day] = key.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === monthNumber - 1 && date.getDate() === day ? key : "";
}

function summaryFoodTotals(rows) {
  const groups = Object.fromEntries(SUMMARY_FOOD_GROUPS.map(({ key }) => [key, { amount: 0, count: 0 }]));
  const occasions = Object.fromEntries(FOOD_OCCASIONS.map(({ key }) => [key, { amount: 0, count: 0, installmentCount: 0 }]));
  let installmentCount = 0;
  rows.forEach((item) => {
    const group = groups[summaryFoodGroup(item)];
    if (!group) return;
    const amount = consumptionAmount(item);
    const isInstallment = summaryPatternIsSyntheticInstallment(item);
    group.amount += amount;
    if (isInstallment) installmentCount++;
    else group.count++;
    const occasion = occasions[foodOccasionFor(item)];
    if (occasion) {
      occasion.amount += amount;
      if (isInstallment) occasion.installmentCount++;
      else occasion.count++;
    }
  });
  const amount = Object.values(groups).reduce((total, group) => total + group.amount, 0);
  const occasionAmount = Object.values(occasions).reduce((total, occasion) => total + occasion.amount, 0);
  return {
    groups,
    amount,
    count: Object.values(groups).reduce((total, group) => total + group.count, 0),
    installmentCount,
    occasions,
    occasionAmount,
    occasionShare: amount > 0 ? Math.round(occasionAmount / amount * 100) : 0,
    untaggedAmount: amount - occasionAmount
  };
}

function buildSummaryFoodModel(comparison, settings, today = defaultDateForMonth("")) {
  const month = comparison.selectedMonth;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const budget = normalizeFoodBudgetSettings(settings);
  const isCurrentMonth = month === today.slice(0, 7);
  const isPastMonth = month < today.slice(0, 7);
  const cutoffDay = comparison.cutoffDay || dayCount;
  const monthRows = comparison.currentRows.filter((item) => item.month === month
    && item.flow !== "income" && item.status !== "취소/제외" && !isCanceled(item.cancel))
    .filter((item) => {
      const date = summaryFoodDateKey(item, month);
      return !date || Number(date.slice(8)) <= cutoffDay;
    });
  const foodRows = monthRows.filter((item) => item.sector === "식비");
  const pendingRows = monthRows.filter(summaryFoodIsPending);
  const visibleRows = monthRows.filter((item) => item.sector === "식비" || summaryFoodIsPending(item));
  const reviewRows = [...new Map(monthRows.filter((item) => summaryFoodMerchantKind(item) === "order")
    .map((item) => [summaryFoodSourceKey(item), item])).values()];
  const totals = summaryFoodTotals(foodRows);
  const days = Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const rows = visibleRows.filter((item) => summaryFoodDateKey(item, month) === date);
    return {
      date, day, rows,
      ...summaryFoodTotals(rows),
      pendingCount: rows.filter(summaryFoodIsPending).length,
      isFuture: !isPastMonth && (!isCurrentMonth || date > today),
      outsideCoverage: day > cutoffDay
    };
  });
  const firstDayOffset = (new Date(year, monthNumber - 1, 1, 12).getDay() + 6) % 7;
  const weeks = Array.from({ length: Math.ceil((firstDayOffset + dayCount) / 7) }, (_, index) => {
    const weekDays = Array.from({ length: 7 }, (_, offset) => days[index * 7 + offset - firstDayOffset] || null);
    const validDays = weekDays.filter(Boolean);
    const startDay = validDays[0].day;
    const endDay = validDays.at(-1).day;
    const rows = validDays.flatMap((day) => day.rows);
    const weekTotals = summaryFoodTotals(rows);
    // Cumulative rounding keeps partial-week budgets equal to the exact monthly target.
    const target = Math.round(budget.monthlyTarget * endDay / dayCount)
      - Math.round(budget.monthlyTarget * (startDay - 1) / dayCount);
    return {
      index, days: weekDays, rows, startDay, endDay, target,
      startDate: validDays[0].date,
      endDate: validDays.at(-1).date,
      ...weekTotals,
      remaining: target - weekTotals.amount,
      pendingCount: rows.filter(summaryFoodIsPending).length
    };
  });
  const undatedRows = visibleRows.filter((item) => !summaryFoodDateKey(item, month));
  const remainingDays = isCurrentMonth ? Math.max(1, dayCount - Number(today.slice(8)) + 1) : 0;
  const remaining = budget.monthlyTarget - totals.amount;
  const afterDining = remaining - budget.diningCost;
  return {
    month, today, dayCount, cutoffDay, isCurrentMonth, isPastMonth,
    budget, foodRows, pendingRows, reviewRows, totals, days, weeks,
    undatedRows, undatedTotals: summaryFoodTotals(undatedRows),
    remaining, afterDining, remainingDays,
    dailyAfterDining: remainingDays ? Math.floor(Math.max(0, afterDining) / remainingDays) : null,
    hasInstallments: foodRows.some((item) => item.isInstallmentOccurrence)
  };
}

function summaryFoodClassificationUpdates(records, recordKeys, sector, subcategory) {
  if (!categories[sector]?.includes(subcategory) || ["수입", "미분류"].includes(sector)) {
    throw new Error("적용할 섹터와 세부항목을 선택해주세요.");
  }
  const selected = new Set(recordKeys);
  let count = 0;
  const updatedAt = new Date().toISOString();
  const updated = records.map((item) => {
    if (!selected.has(item.recordKey) || item.flow === "income" || isCanceled(item.cancel)
      || summaryFoodMerchantKind(item) !== "order") return item;
    count++;
    return {
      ...item,
      manualSector: sector,
      manualSubcategory: subcategory,
      classificationScope: "transaction",
      updatedAt
    };
  });
  return { records: updated, count };
}
