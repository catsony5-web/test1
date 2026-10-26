// Family support keeps its original transaction identity; only reporting changes.
function familyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function familyMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])(?:$|-)/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function familyPreviousMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
}

function familySources(options = {}) {
  return {
    transactions: options.transactions ?? (typeof transactions === "undefined" ? [] : transactions),
    recurringExpenses: options.recurringExpenses ?? (typeof recurringExpenses === "undefined" ? [] : recurringExpenses),
    adjustments: options.adjustments ?? (typeof familyAdjustments === "undefined" ? [] : familyAdjustments)
  };
}

function familyRecordActive(item) {
  const cancel = String(item?.cancel || "").trim();
  return item && item.status !== "취소/제외" && (!cancel || cancel === "-");
}

function familyIsLoan(item) {
  return item?.recurringType === "loan" || familyNumber(item?.loanPrincipalAmount) > 0;
}

function familyRecordId(item) {
  return String(item?.transactionId || item?.recordKey || "");
}

function familyRecordMonth(item) {
  return familyMonth(item?.month) || familyMonth(item?.approvalDate);
}

function familyTargetMonth(item) {
  return familyMonth(item?.familyTargetMonth) || familyMonth(item?.approvalDate) || familyRecordMonth(item);
}

function familyHistoryAtMonth(history, month) {
  return (Array.isArray(history) ? history : [])
    .filter((entry) => familyMonth(entry?.fromMonth) && entry.fromMonth <= month)
    .sort((left, right) => right.fromMonth.localeCompare(left.fromMonth))[0] || null;
}

function familyLoanAmounts(item) {
  const amount = Math.max(0, familyNumber(item?.amount));
  const principal = Math.min(amount, Math.max(0, familyNumber(item?.loanPrincipalAmount)));
  const supportPrincipal = Math.min(principal, Math.max(0, familyNumber(item?.loanSupportPrincipalAmount)));
  const supportInterest = Math.min(amount - principal, Math.max(0, familyNumber(item?.loanSupportInterestAmount)));
  return { principal, supportPrincipal, supportInterest, due: supportPrincipal + supportInterest };
}

function familyExpenseBurden(item, options = {}) {
  if (!familyRecordActive(item) || item.flow === "income" || familyIsLoan(item)) return 0;
  const amount = Math.max(0, familyNumber(item.amount));
  if (item.familyBurdenAmount != null && item.familyBurdenAmount !== "") {
    return Math.min(amount, Math.max(0, familyNumber(item.familyBurdenAmount)));
  }
  const definition = familySources(options).recurringExpenses.find((entry) => entry.id === (item.recurringId || item.id));
  const revision = familyHistoryAtMonth(definition?.familyBurdenHistory, familyRecordMonth(item));
  return Math.min(amount, Math.max(0, familyNumber(revision?.amount)));
}

function familyUniqueTransactions(records) {
  const seen = new Set();
  return records.filter((item) => {
    const id = familyRecordId(item);
    if (id && seen.has(id)) return false;
    if (id) seen.add(id);
    return true;
  });
}

function familySupportIncomeExcluded(item, options = {}) {
  if (item?.flow !== "income") return 0;
  const amount = Math.max(0, familyNumber(item.amount));
  if (item.incomeKind === "familySupport") return amount;
  const ids = new Set([item.transactionId, item.recordKey].filter(Boolean));
  const linked = familyUniqueTransactions(familySources(options).transactions)
    .filter((record) => familyRecordActive(record) && familyIsLoan(record)
      && ids.has(record.loanSupportIncomeTransactionId || record.loanSupportIncomeRecordKey))
    .reduce((total, record) => total + Math.max(0, familyNumber(record.loanSupportReceivedAmount)), 0);
  return Math.min(amount, linked);
}

function familyReceiptsForSources(sources) {
  const allRecords = familyUniqueTransactions(sources.transactions);
  const records = allRecords.filter(familyRecordActive);
  const incomes = records.filter((item) => item.flow === "income");
  const incomeIds = new Set(allRecords.filter((item) => item.flow === "income")
    .flatMap((item) => [item.transactionId, item.recordKey].filter(Boolean)));
  const receipts = incomes.map((item) => {
    const amount = familySupportIncomeExcluded(item, sources);
    const date = item.approvalDate || `${familyRecordMonth(item)}-01`;
    return {
      ...item, amount, date, receiptDate: date, receiptMonth: familyMonth(date),
      targetMonth: familyTargetMonth(item), id: familyRecordId(item),
      transactionId: familyRecordId(item), name: item.familySender || item.merchant || "가족 지원",
      legacy: item.incomeKind !== "familySupport"
    };
  }).filter((item) => item.amount > 0 && item.receiptMonth && item.targetMonth);
  records.filter((item) => familyIsLoan(item) && item.flow !== "income").forEach((item) => {
    const linkedId = item.loanSupportIncomeTransactionId || item.loanSupportIncomeRecordKey;
    if (linkedId && incomeIds.has(linkedId)) return;
    const amount = Math.max(0, familyNumber(item.loanSupportReceivedAmount));
    const date = item.loanSupportReceivedDate || item.approvalDate || `${familyRecordMonth(item)}-01`;
    const receiptMonth = familyMonth(date);
    if (!amount || !receiptMonth) return;
    receipts.push({
      ...item, amount, date, receiptDate: date, receiptMonth, targetMonth: receiptMonth,
      id: `legacy:${familyRecordId(item)}`, transactionId: "", loanTransactionId: familyRecordId(item),
      name: "가족 지원", legacy: true
    });
  });
  return receipts.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}

function familyEvaluateAdjustments(sources) {
  const loans = familyUniqueTransactions(sources.transactions)
    .filter((item) => familyRecordActive(item) && item.flow !== "income" && familyIsLoan(item));
  const usedByLoan = new Map();
  const seen = new Set();
  return [...sources.adjustments].sort((left, right) =>
    String(left.date || "").localeCompare(String(right.date || ""))
    || String(left.id || "").localeCompare(String(right.id || "")))
    .filter((entry) => {
      if (entry.id && seen.has(entry.id)) return false;
      if (entry.id) seen.add(entry.id);
      return true;
    }).map((entry) => {
      const amount = familyNumber(entry.amount);
      const result = { ...entry, amount, status: "applied", reason: "", effectiveAmount: amount, effectiveDate: entry.date };
      const invalid = (reason) => ({ ...result, status: "invalid", reason, effectiveAmount: 0 });
      if (!entry.id || !familyMonth(entry.date) || !amount) return invalid("날짜와 0이 아닌 조정 금액을 입력해 주세요.");
      if (!["loan_payment", "return", "other"].includes(entry.purpose)) return invalid("조정 용도를 선택해 주세요.");
      if (entry.purpose !== "other" && amount > 0) return invalid("상환 사용·반환 금액은 차감할 음수로 입력해 주세요.");
      if (entry.purpose !== "loan_payment") return result;
      if (!entry.linkedLoanTransactionId) {
        return { ...result, status: "pending", reason: "실제 대출 상환을 연결하면 차감됩니다.", effectiveAmount: 0 };
      }
      const loan = loans.find((item) => [item.transactionId, item.recordKey].includes(entry.linkedLoanTransactionId));
      if (!loan) return invalid("연결한 실제 대출 상환 기록을 찾을 수 없습니다.");
      const loanId = familyRecordId(loan);
      const loanAmounts = familyLoanAmounts(loan);
      const available = Math.max(0, loanAmounts.principal - loanAmounts.supportPrincipal - (usedByLoan.get(loanId) || 0));
      if (-amount > available) return invalid("정기 가족 부담분을 제외한 실제 상환 원금을 초과합니다.");
      usedByLoan.set(loanId, (usedByLoan.get(loanId) || 0) - amount);
      return {
        ...result, loanTransactionId: loanId,
        effectiveDate: loan.approvalDate || `${familyRecordMonth(loan)}-01`,
        paymentDate: loan.approvalDate || `${familyRecordMonth(loan)}-01`
      };
    });
}

function familyLoanReserveUsed(item, options = {}) {
  if (!familyRecordActive(item) || !familyIsLoan(item)) return 0;
  const id = familyRecordId(item);
  return familyEvaluateAdjustments(familySources(options))
    .filter((entry) => entry.status === "applied" && entry.purpose === "loan_payment" && entry.loanTransactionId === id)
    .reduce((total, entry) => total - entry.effectiveAmount, 0);
}

function familyScheduledLoanBurden(definition, month, records, adjustments = []) {
  const prior = records.filter((item) => familyRecordActive(item) && item.recurringId === definition.id
    && item.flow !== "income" && familyIsLoan(item) && familyRecordMonth(item) < month);
  const paidPrincipal = prior.reduce((total, item) => total + familyLoanAmounts(item).principal, 0);
  const available = Math.max(0, familyNumber(definition.loanOpeningBalance) - paidPrincipal);
  if (!available) return 0;
  const history = definition.loanSupportHistory || [];
  const revision = familyHistoryAtMonth(history, month);
  const supportEnabled = history.length
    ? revision && (familyNumber(revision.principal) > 0 || familyNumber(revision.interest) > 0)
    : definition.loanSupportEnabled;
  if (!supportEnabled) return 0;
  const priorIds = new Set(prior.map(familyRecordId));
  const extraSupportPaid = adjustments.filter((entry) => entry.status === "applied"
    && entry.purpose === "loan_payment" && priorIds.has(entry.loanTransactionId))
    .reduce((total, entry) => total - entry.effectiveAmount, 0);
  const remainingSupport = Math.max(0, familyNumber(definition.loanSupportOpeningBalance)
    - prior.reduce((total, item) => total + familyLoanAmounts(item).supportPrincipal, 0) - extraSupportPaid);
  if (!remainingSupport) return 0;
  const principal = Math.min(available, Math.max(0, familyNumber(definition.loanPrincipalAmount)));
  const personalAvailable = Math.max(0, available - remainingSupport);
  const minimumSupportPrincipal = Math.max(0, principal - personalAvailable);
  const supportPrincipal = Math.min(principal, remainingSupport,
    Math.max(minimumSupportPrincipal, familyNumber(revision ? revision.principal : definition.loanSupportPrincipalAmount)));
  const supportInterest = Math.min(Math.max(0, familyNumber(definition.loanInterestAmount)),
    Math.max(0, familyNumber(revision ? revision.interest : definition.loanSupportInterestAmount)));
  return supportPrincipal + supportInterest;
}

function familyObligationsForMonth(month, sources, adjustments = familyEvaluateAdjustments(sources)) {
  const records = familyUniqueTransactions(sources.transactions);
  const monthly = records.filter((item) => item.flow !== "income" && familyRecordMonth(item) === month);
  const occupied = new Set(monthly.filter((item) => familyRecordActive(item)
    || item.sourceType === "recurring" || item.recurringLinkedExisting).map((item) => item.recurringId).filter(Boolean));
  const obligations = monthly.filter(familyRecordActive).map((item) => ({
    date: item.approvalDate || `${month}-01`, month, posted: true, recurringId: item.recurringId || "",
    transactionId: familyRecordId(item), name: item.merchant || "가족 부담 지출",
    amount: familyIsLoan(item) ? familyLoanAmounts(item).due : familyExpenseBurden(item, sources)
  })).filter((entry) => entry.amount > 0);
  sources.recurringExpenses.forEach((definition) => {
    if (occupied.has(definition.id) || definition.paused || !familyMonth(definition.startMonth)
      || definition.startMonth > month || (definition.endMonth && definition.endMonth < month)) return;
    const amount = definition.recurringType === "loan"
      ? familyScheduledLoanBurden(definition, month, records, adjustments)
      : Math.max(0, familyNumber(familyHistoryAtMonth(definition.familyBurdenHistory, month)?.amount));
    if (!amount) return;
    const [year, monthNumber] = month.split("-").map(Number);
    const day = Math.max(1, Math.min(new Date(year, monthNumber, 0).getDate(), familyNumber(definition.dayOfMonth) || 1));
    obligations.push({
      date: `${month}-${String(day).padStart(2, "0")}`, month, amount, posted: false,
      recurringId: definition.id, transactionId: "", name: definition.name || "가족 부담 지출"
    });
  });
  return obligations.sort((left, right) => left.date.localeCompare(right.date));
}

function buildFamilySupportModel(month, options = {}) {
  const sources = familySources(options);
  const selectedMonth = familyMonth(month);
  const receipts = familyReceiptsForSources(sources);
  const adjustments = familyEvaluateAdjustments(sources);
  const records = familyUniqueTransactions(sources.transactions).filter(familyRecordActive);
  const validAdjustments = adjustments.filter((entry) => entry.status === "applied");
  const dates = [selectedMonth,
    ...receipts.flatMap((entry) => [entry.targetMonth, entry.receiptMonth]),
    ...records.map(familyRecordMonth),
    ...sources.recurringExpenses.map((entry) => familyMonth(entry.startMonth)),
    ...validAdjustments.map((entry) => familyMonth(entry.effectiveDate))
  ].filter((entry) => entry && entry <= selectedMonth).sort();
  let cumulativeNeed = 0;
  let obligations = [];
  if (selectedMonth) {
    let cursor = selectedMonth;
    while (cursor >= dates[0]) {
      const monthly = familyObligationsForMonth(cursor, sources, adjustments);
      cumulativeNeed += monthly.reduce((total, entry) => total + entry.amount, 0);
      if (cursor === selectedMonth) obligations = monthly;
      cursor = familyPreviousMonth(cursor);
    }
  }
  const cashReceipts = receipts.filter((entry) => entry.receiptMonth === selectedMonth);
  const monthReceipts = receipts.filter((entry) => entry.targetMonth === selectedMonth);
  const received = monthReceipts.reduce((total, entry) => total + entry.amount, 0);
  const need = obligations.reduce((total, entry) => total + entry.amount, 0);
  const cumulativeReceived = receipts.filter((entry) => entry.targetMonth <= selectedMonth)
    .reduce((total, entry) => total + entry.amount, 0);
  const adjustmentTotal = validAdjustments.filter((entry) => familyMonth(entry.effectiveDate) <= selectedMonth)
    .reduce((total, entry) => total + entry.effectiveAmount, 0);
  const settlementBalance = cumulativeReceived - cumulativeNeed + adjustmentTotal;
  const reserveByLoan = new Map();
  validAdjustments.filter((entry) => entry.purpose === "loan_payment").forEach((entry) => {
    reserveByLoan.set(entry.loanTransactionId, (reserveByLoan.get(entry.loanTransactionId) || 0) - entry.effectiveAmount);
  });
  const cashOutflows = records.filter((item) => item.flow !== "income").map((item) => ({
    month: familyMonth(item.approvalDate) || familyRecordMonth(item),
    amount: familyIsLoan(item)
      ? familyLoanAmounts(item).due + (reserveByLoan.get(familyRecordId(item)) || 0)
      : familyExpenseBurden(item, sources)
  }));
  const balanceThrough = (throughMonth) => receipts.filter((entry) => entry.receiptMonth <= throughMonth)
    .reduce((total, entry) => total + entry.amount, 0)
    - cashOutflows.filter((entry) => entry.month && entry.month <= throughMonth).reduce((total, entry) => total + entry.amount, 0)
    + validAdjustments.filter((entry) => entry.purpose !== "loan_payment" && familyMonth(entry.effectiveDate) <= throughMonth)
      .reduce((total, entry) => total + entry.effectiveAmount, 0);
  const cashBalance = selectedMonth ? balanceThrough(selectedMonth) : 0;
  const previousCashBalance = selectedMonth ? balanceThrough(familyPreviousMonth(selectedMonth)) : 0;
  return {
    month: selectedMonth, need, received, difference: received - need,
    cumulativeNeed, cumulativeReceived, adjustmentTotal, settlementBalance,
    repaymentReserve: Math.max(0, settlementBalance), cashBalance, cashHeld: Math.max(0, cashBalance),
    // Only the user's advances and their later recovery change disposable money.
    cashAdjustment: Math.min(0, cashBalance) - Math.min(0, previousCashBalance),
    obligations, receipts, cashReceipts, monthReceipts, adjustments
  };
}

function familySupportCashAdjustment(month, options = {}) {
  return buildFamilySupportModel(month, options).cashAdjustment;
}
