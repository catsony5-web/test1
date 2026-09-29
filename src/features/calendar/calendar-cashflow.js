function calendarCardBillingsForPaymentMonth(month, billingModel = buildCalendarCardBillingModel(month)) {
  return [buildCalendarCardBillingModel(shiftMonthKey(month, -1)), billingModel]
    .filter((billing) => monthKey(billing.paymentDate) === month);
}

function calendarOutflowKind(item, definition = null) {
  if (isLoanRepaymentTransaction(item) || definition?.recurringType === "loan") {
    return (item.loanType || definition?.loanType) === "신용대출" ? "loan" : "";
  }
  return [item.subcategory, definition?.subcategory].some((value) => value === "보험" || value === "보험료")
    ? "insurance"
    : "";
}

function buildCalendarCashOutflowModel(month, billingModel = buildCalendarCardBillingModel(month)) {
  const billings = calendarCardBillingsForPaymentMonth(month, billingModel);
  const definitions = new Map(recurringExpenses.map((item) => [item.id, item]));
  const actualRows = reportingExpenseRows(classified).filter((item) => !isCanceled(item.cancel));
  const cardGroups = billings.map((billing) => ({
    billing,
    rows: billing.rows.map((item) => ({ ...item, scheduled: false, outflowDate: billing.paymentDate }))
  }));
  const insuranceRows = [];
  const loanRows = [];
  const duplicateWarnings = [];
  const warnedOccurrences = new Set();
  const importedCandidates = classified.filter((item) =>
    ["card", "transfer"].includes(item.sourceType)
    && item.flow !== "income"
    && item.status !== "취소/제외"
    && !isCanceled(item.cancel)
    && !item.recurringId
    && Number(item.amount || 0) > 0
  );

  function warnAboutUnlinkedCandidates(item, definition, kind) {
    if (!definition || (!item.scheduled && item.sourceType !== "recurring")) return;
    const occurrenceMonth = item.month || monthKey(item.approvalDate);
    const occurrenceKey = `${definition.id}:${occurrenceMonth}`;
    if (warnedOccurrences.has(occurrenceKey)) return;
    const name = normalizeKeyText(definition.name || item.merchant);
    const candidates = importedCandidates.filter((candidate) =>
      candidate.month === occurrenceMonth
      && !isLoanRepaymentTransaction(candidate)
      && (Number(candidate.amount) === Number(item.amount)
        || (kind === "insurance" && name && normalizeKeyText(candidate.merchant) === name))
    );
    if (!candidates.length) return;
    warnedOccurrences.add(occurrenceKey);
    duplicateWarnings.push({
      name: definition.name || item.merchant,
      month: occurrenceMonth,
      recordKeys: candidates.map((candidate) => candidate.recordKey)
    });
  }

  function addSeparateOrSupplementalRow(item, definition) {
    const kind = calendarOutflowKind(item, definition);
    const date = normalizeDateKey(item.approvalDate);
    if (!kind || !date || item.sourceType === "card") return;
    const isCardPayment = item.sourceType === "recurring" && definition?.paymentType === "카드";
    let included = false;
    if (isCardPayment) {
      cardGroups.forEach((group) => {
        if (date < group.billing.periodStart || date > group.billing.periodEnd) return;
        group.rows.push({ ...item, outflowDate: group.billing.paymentDate });
        included = true;
      });
    } else if (monthKey(date) === month) {
      (kind === "insurance" ? insuranceRows : loanRows).push({ ...item, outflowDate: date });
      included = true;
    }
    if (included) warnAboutUnlinkedCandidates(item, definition, kind);
  }

  // Recorded payments retain their date and amount even if their definition was paused or removed.
  actualRows.forEach((item) => addSeparateOrSupplementalRow(
    { ...item, scheduled: false },
    definitions.get(item.recurringId)
  ));

  const occurrenceMonths = new Set([month]);
  billings.forEach((billing) => {
    occurrenceMonths.add(monthKey(billing.periodStart));
    occurrenceMonths.add(monthKey(billing.periodEnd));
  });
  occurrenceMonths.forEach((occurrenceMonth) => {
    recurringOccurrencesForMonth(occurrenceMonth, { showHidden: true }).forEach((item) => {
      if (item.posted || findDeletedRecurringTransaction(item.id, occurrenceMonth)) return;
      addSeparateOrSupplementalRow({
        ...item,
        recurringId: item.id,
        recordKey: `scheduled-outflow:${item.id}:${occurrenceMonth}`,
        sourceType: "recurring",
        flow: "expense",
        merchant: item.name,
        approvalDate: item.date,
        scheduled: true
      }, item);
    });
  });

  const byOutflowDate = (a, b) => a.outflowDate.localeCompare(b.outflowDate)
    || String(a.merchant || "").localeCompare(String(b.merchant || ""), "ko-KR");
  const cardRows = cardGroups.flatMap((group) => group.rows).sort(byOutflowDate);
  insuranceRows.sort(byOutflowDate);
  loanRows.sort(byOutflowDate);
  const cardAmount = cardGroups.reduce((total, group) => total + Math.max(0, sum(group.rows, "amount")), 0);
  const insuranceAmount = Math.max(0, sum(insuranceRows, "amount"));
  const loanAmount = Math.max(0, sum(loanRows, "amount"));
  return {
    billing: billingModel,
    billings,
    cardRows,
    cardAmount,
    insuranceRows,
    insuranceAmount,
    loanRows,
    loanAmount,
    expectedAmount: cardAmount + insuranceAmount + loanAmount,
    duplicateWarnings
  };
}
