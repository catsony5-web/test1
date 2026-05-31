function groupBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function unique(values) {
  return [...new Set(values)];
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function sumValues(source, keys) {
  return keys.reduce((total, key) => total + Number(source[key] || 0), 0);
}

function hasStructuredInstallment(item) {
  return Boolean(item?.installmentEnabled && Number(item.installmentMonths || 0) > 1);
}

function installmentBaseAmount(item) {
  return Math.max(0, Number(item?.installmentOriginalAmount || item?.amount || 0));
}

function installmentBaseReimbursement(item) {
  const key = item?.installmentSourceRecordKey || item?.recordKey;
  return Math.max(0, toNumber(reimbursements?.[key]));
}

function installmentAmountForIndex(item, index, totalAmount = installmentBaseAmount(item)) {
  const months = Math.max(1, Number(item?.installmentMonths || 1));
  if (months <= 1) return totalAmount;
  const base = Math.floor(totalAmount / months);
  return index === months ? totalAmount - base * (months - 1) : base;
}

function installmentMonthForIndex(startMonth, index) {
  return shiftMonthKey(startMonth, index - 1);
}

function installmentDateForMonth(sourceDate, month) {
  const normalized = normalizeInputDate(sourceDate) || `${month}-01`;
  const day = Number(normalized.slice(8, 10)) || 1;
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function expandInstallmentRows(item) {
  if (!hasStructuredInstallment(item)) return [item];
  const months = Number(item.installmentMonths || 0);
  const startMonth = item.installmentStartMonth || item.month || monthKey(item.approvalDate);
  const originalAmount = installmentBaseAmount(item);
  const originalReimbursement = installmentBaseReimbursement(item);
  const groupId = item.installmentGroupId || item.recordKey;
  return Array.from({ length: months }, (_, offset) => {
    const index = offset + 1;
    const occurrenceMonth = installmentMonthForIndex(startMonth, index);
    const occurrenceAmount = installmentAmountForIndex(item, index, originalAmount);
    const occurrenceReimbursement = installmentAmountForIndex(item, index, originalReimbursement);
    return {
      ...item,
      amount: occurrenceAmount,
      month: occurrenceMonth,
      approvalDate: installmentDateForMonth(item.approvalDate, occurrenceMonth),
      installmentOriginalAmount: originalAmount,
      installmentMonthlyAmount: installmentAmountForIndex(item, 1, originalAmount),
      installmentReimbursementAmount: occurrenceReimbursement,
      installmentMonths: months,
      installmentStartMonth: startMonth,
      installmentGroupId: groupId,
      installmentSourceRecordKey: item.recordKey,
      currentInstallmentIndex: index,
      installmentIndex: index,
      isInstallmentOccurrence: true,
      recordKey: `${item.recordKey}::installment::${index}`
    };
  });
}

function reportingExpenseRows(rows, options = {}) {
  const monthSet = options.months ? new Set(options.months.filter(Boolean)) : null;
  return rows
    .filter((item) => item.status !== "취소/제외" && item.flow !== "income")
    .flatMap((item) => hasStructuredInstallment(item) ? expandInstallmentRows(item) : [item])
    .filter((item) => !monthSet || monthSet.has(item.month));
}
