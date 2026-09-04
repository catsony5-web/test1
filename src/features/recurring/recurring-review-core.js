function normalizeRecurringReviewStatus(value) {
  return ["keep", "review"].includes(value) ? value : "unknown";
}

function recurringReviewShiftMonth(month, offset) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + Number(offset || 0), 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function recurringReviewMonthEnd(month) {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const lastDay = new Date(Number(match[1]), Number(match[2]), 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function recurringReviewIsActive(item, month) {
  if (!item || item.recurringType === "loan" || item.paused) return false;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) return false;
  if (item.startMonth && item.startMonth > month) return false;
  if (item.endMonth && item.endMonth < month) return false;
  return true;
}

function recurringReviewGroup(item) {
  const text = `${item?.sector || ""} ${item?.subcategory || ""} ${item?.name || ""}`;
  if (/보험/.test(text)) return { key: "insurance", label: "보험", icon: "shield-check" };
  if (/통신|인터넷|휴대폰|구독|멤버십|OTT|넷플릭스|유튜브/.test(text)) {
    return { key: "subscription", label: "통신·구독", icon: "device-mobile" };
  }
  if (/주거|월세|관리비|전기|수도|가스/.test(text)) return { key: "housing", label: "주거", icon: "home-dollar" };
  return { key: `sector:${item?.sector || "other"}`, label: item?.sector || "기타 고정비", icon: "receipt" };
}

function recurringReviewItemState(item, month) {
  const reviewStatus = normalizeRecurringReviewStatus(item?.reviewStatus);
  const nextReviewDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item?.nextReviewDate || "")) ? item.nextReviewDate : "";
  const due = Boolean(nextReviewDate && nextReviewDate <= recurringReviewMonthEnd(month));
  if (reviewStatus === "review") {
    return { key: "review", label: "변경 검토", candidate: true, due };
  }
  if (due) return { key: "due", label: "재점검 필요", candidate: true, due: true };
  if (reviewStatus === "unknown") {
    return { key: "unknown", label: "미확인", candidate: true, due: false };
  }
  return { key: "keep", label: "유지", candidate: false, due: false };
}

function buildRecurringReviewModel(definitions, month, income = 0, options = {}) {
  const source = Array.isArray(definitions) ? definitions : [];
  const expenseDefinitions = source.filter((item) => item?.recurringType !== "loan");
  const activeItems = expenseDefinitions
    .filter((item) => recurringReviewIsActive(item, month))
    .map((item) => ({
      ...item,
      amount: Math.max(0, Number(item.amount || 0)),
      review: recurringReviewItemState(item, month),
      group: recurringReviewGroup(item)
    }));
  const statusOrder = { review: 0, due: 1, unknown: 2, keep: 3 };
  activeItems.sort((a, b) => (statusOrder[a.review.key] - statusOrder[b.review.key])
    || Number(b.amount || 0) - Number(a.amount || 0)
    || String(a.name || "").localeCompare(String(b.name || ""), "ko-KR"));

  const grouped = [];
  const groupMap = new Map();
  activeItems.forEach((item) => {
    if (!groupMap.has(item.group.key)) {
      const group = { ...item.group, amount: 0, items: [] };
      groupMap.set(item.group.key, group);
      grouped.push(group);
    }
    const group = groupMap.get(item.group.key);
    group.items.push(item);
    group.amount += item.amount;
  });

  const monthlyTotal = activeItems.reduce((total, item) => total + item.amount, 0);
  const previousMonth = recurringReviewShiftMonth(month, -1);
  const previousTotal = expenseDefinitions
    .filter((item) => recurringReviewIsActive(item, previousMonth))
    .reduce((total, item) => total + Math.max(0, Number(item.amount || 0)), 0);
  const annualMonths = Array.from({ length: 12 }, (_, index) => recurringReviewShiftMonth(month, index));
  const annualTotal = annualMonths.reduce((total, projectedMonth) => total + expenseDefinitions
    .filter((item) => recurringReviewIsActive(item, projectedMonth))
    .reduce((monthTotal, item) => monthTotal + Math.max(0, Number(item.amount || 0)), 0), 0);
  const candidates = activeItems.filter((item) => item.review.candidate);
  const candidateAmount = candidates.reduce((total, item) => total + item.amount, 0);
  const incomeValue = Math.max(0, Number(income || 0));
  const incomeKnown = options.incomeKnown === true && incomeValue > 0;

  return {
    month,
    previousMonth,
    definitions: expenseDefinitions,
    items: activeItems,
    groups: grouped,
    candidates,
    monthlyTotal,
    previousTotal,
    monthlyChange: monthlyTotal - previousTotal,
    annualTotal,
    income: incomeValue,
    incomeKnown,
    incomeRatio: incomeKnown ? monthlyTotal / incomeValue * 100 : null,
    candidateAmount,
    candidateCount: candidates.length,
    reviewedCount: activeItems.length - candidates.length,
    insuranceCandidateCount: candidates.filter((item) => item.group.key === "insurance").length
  };
}
