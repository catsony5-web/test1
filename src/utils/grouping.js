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
  return Boolean(!isLoanRepaymentTransaction(item) && item?.installmentEnabled && Number(item.installmentMonths || 0) > 1);
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

function isLoanRepaymentTransaction(item) {
  return item?.recurringType === "loan" || Number(item?.loanPrincipalAmount || 0) > 0;
}

function loanGrossPrincipalAmount(item) {
  if (!isLoanRepaymentTransaction(item)) return 0;
  return Math.min(
    Math.max(0, Number(item?.amount || 0)),
    Math.max(0, Number(item?.loanPrincipalAmount || 0))
  );
}

function loanGrossInterestAmount(item) {
  if (!isLoanRepaymentTransaction(item)) return 0;
  return Math.max(0, Number(item?.amount || 0) - loanGrossPrincipalAmount(item));
}

function loanSupportPrincipalAmount(item) {
  return Math.min(
    loanGrossPrincipalAmount(item),
    Math.max(0, Number(item?.loanSupportPrincipalAmount || 0))
  );
}

function loanSupportInterestAmount(item) {
  return Math.min(
    loanGrossInterestAmount(item),
    Math.max(0, Number(item?.loanSupportInterestAmount || 0))
  );
}

function loanSupportDueAmount(item) {
  if (!isLoanRepaymentTransaction(item)) return 0;
  return loanSupportPrincipalAmount(item) + loanSupportInterestAmount(item);
}

function loanSupportReceivedAmount(item) {
  if (!isLoanRepaymentTransaction(item)) return 0;
  return Math.max(0, Number(item?.loanSupportReceivedAmount || 0));
}

function loanSupportReceivedMonth(item) {
  return monthKey(item?.loanSupportReceivedDate) || item?.month || "";
}

function loanPrincipalActualAmount(item) {
  if (!isLoanRepaymentTransaction(item)) return 0;
  return Math.max(0, loanGrossPrincipalAmount(item) - loanSupportPrincipalAmount(item));
}

function loanInterestActualAmount(item) {
  if (!isLoanRepaymentTransaction(item)) return 0;
  return Math.max(0, loanGrossInterestAmount(item) - loanSupportInterestAmount(item));
}

function loanSupportLinkedIncomeAmount(transactionId, options = {}) {
  if (!transactionId || typeof transactions === "undefined") return 0;
  const excludedLoanRecordKey = options.excludeLoanRecordKey || "";
  return transactions
    .map(normalizeStoredTransaction)
    .filter((item) => isLoanRepaymentTransaction(item) && !isCanceled(item.cancel))
    .filter((item) => item.loanSupportIncomeTransactionId === transactionId)
    .filter((item) => !excludedLoanRecordKey || item.recordKey !== excludedLoanRecordKey)
    .reduce((total, item) => total + loanSupportReceivedAmount(item), 0);
}

function incomeReportingAmount(item) {
  if (item?.flow !== "income") return Math.max(0, Number(item?.amount || 0));
  return Math.max(0, Number(item.amount || 0) - loanSupportLinkedIncomeAmount(item.transactionId || item.recordKey));
}

function loanSupportSettlementDeltaForMonth(items, month) {
  const due = items
    .filter((item) => item?.month === month)
    .reduce((total, item) => total + loanSupportDueAmount(item), 0);
  const received = loanSupportReceivedForMonth(items, month);
  return received - due;
}

function loanSupportReceivedForMonth(items, month) {
  return items
    .filter((item) => loanSupportReceivedMonth(item) === month)
    .reduce((total, item) => total + loanSupportReceivedAmount(item), 0);
}

function consumptionAmount(item) {
  return isLoanRepaymentTransaction(item) ? loanInterestActualAmount(item) : actualAmount(item);
}

function sumConsumption(items) {
  return items.reduce((total, item) => total + consumptionAmount(item), 0);
}

function sumDebtPrincipal(items) {
  return items.reduce((total, item) => total + loanPrincipalActualAmount(item), 0);
}

function sumLegalDebtPrincipal(items) {
  return items.reduce((total, item) => total + loanGrossPrincipalAmount(item), 0);
}
