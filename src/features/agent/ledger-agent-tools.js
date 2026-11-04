(function (root) {
  "use strict";

  const MAX_CHANGES = 50;
  const refs = new Map();
  const cards = new Map();
  const plans = new Map();
  let sessionId = newId();
  let sessionIdentity = storageIdentity();
  let applying = false;

  const string = { type: "string" };
  const monthSchema = { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" };
  const dateSchema = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
  const amountSchema = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
  const editProperties = {
    ref: string, amount: amountSchema, date: dateSchema, merchant: string, memo: string,
    sector: string, subcategory: string, reimbursement: amountSchema,
    incomeKind: { type: "string", enum: ["normal", "familySupport"] },
    familyTargetMonth: monthSchema, familySender: string
  };
  const definitions = [
    definition("ledger_context", "가계부에서 조회 가능한 월, 분류, 카드 별칭, 계산 기준을 확인합니다. 기록을 수정하지 않습니다.", {}),
    definition("search_transactions", "현재 가계부에서 거래를 검색합니다. ref는 현재 대화에서만 유효합니다. 반환한 total은 전체 검색 건수이며 items는 한 페이지입니다.", {
      query: string, month: monthSchema, from: dateSchema, to: dateSchema,
      flow: { type: "string", enum: ["all", "income", "expense", "familySupport"] },
      sector: string, subcategory: string, cardRef: string,
      minAmount: amountSchema, maxAmount: amountSchema, includeCanceled: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0, maximum: 10000 }
    }),
    definition("monthly_metrics", "앱의 기존 계산식으로 한 달 수입, 소비, 정산, 저축, 대출, 자유 잔액과 예정지출을 조회합니다. 취소 경고가 있으면 확정 합계라고 단정하지 마세요.", { month: monthSchema }, ["month"]),
    definition("compare_spending", "두 달의 본인 소비를 비교하고 분류별 증감 및 근거 거래를 반환합니다. cutoffDay를 지정하면 두 달 모두 같은 일자까지만 비교합니다.", {
      month: monthSchema, comparisonMonth: monthSchema, sector: string, subcategory: string,
      cutoffDay: { type: "integer", minimum: 1, maximum: 31 }
    }, ["month", "comparisonMonth"]),
    definition("family_settlement", "정산 대상월 기준 가족 필요액, 받은 금액, 누적 정산과 현금 보관액을 조회합니다.", { month: monthSchema }, ["month"]),
    definition("propose_changes", "기존 거래의 변경 전후 미리보기만 만듭니다. 아직 저장하지 않으며 사용자가 적용 버튼을 눌러야 합니다. 연결된 대출·고정지출·할부의 금액 변경은 전용 화면에서 처리해야 합니다.", {
      changes: { type: "array", minItems: 1, maxItems: MAX_CHANGES, items: {
        type: "object", properties: editProperties, required: ["ref"], additionalProperties: false
      } }
    }, ["changes"])
  ];

  function definition(name, description, properties, required = []) {
    return { type: "function", name, description, strict: false,
      parameters: { type: "object", properties, required, additionalProperties: false } };
  }

  function newId() {
    return root.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fail(message) { throw new Error(message); }
  function object(value, fields) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]"
      || Object.keys(value).some((key) => !fields.includes(key))) fail("지원하지 않는 요청 항목입니다.");
  }
  function text(value, label, maximum = 500, empty = true) {
    if (typeof value !== "string" || value.length > maximum || /\u0000/.test(value) || (!empty && !value.trim())) {
      fail(`${label} 형식을 확인해주세요.`);
    }
    return value;
  }
  function money(value, label, minimum = 0) {
    if (!Number.isSafeInteger(value) || value < minimum) fail(`${label}은 ${minimum} 이상의 원 단위 정수로 입력해주세요.`);
    return value;
  }
  function month(value) {
    if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)
      || Number(value.slice(0, 4)) < 1900 || Number(value.slice(0, 4)) > 9999) fail("월은 YYYY-MM 형식으로 입력해주세요.");
    return value;
  }
  function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("날짜는 YYYY-MM-DD 형식으로 입력해주세요.");
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail("존재하지 않는 날짜입니다.");
    month(value.slice(0, 7));
    return value;
  }
  function storageIdentity() {
    return `${root.BudgetNative ? "native" : "browser"}:${root.BudgetCloud?.generation?.() || "local"}`;
  }
  function ensureSession() {
    if (sessionIdentity !== storageIdentity()) {
      clearSession();
      fail("가계부 또는 동기화 상태가 바뀌었습니다. 최신 기록을 다시 조회해주세요.");
    }
    if (root.BudgetCloud?.isApplying?.()) fail("다른 기기의 기록을 반영 중입니다. 잠시 후 다시 시도해주세요.");
  }
  function sourceRecords() { return transactions.map(normalizeStoredTransaction); }
  function sourceKey(item) { return item.installmentSourceRecordKey || item.recordKey; }
  function reference(item) {
    const key = sourceKey(item);
    if (!key) fail("식별할 수 없는 거래입니다. 가계부 내역에서 확인해주세요.");
    for (const [ref, existing] of refs) if (existing === key) return ref;
    const ref = `t_${sessionId}_${refs.size + 1}`;
    refs.set(ref, key);
    return ref;
  }
  function cardReference(item) {
    const number = String(item.cardNumber || "");
    if (!number) return "";
    for (const [ref, existing] of cards) if (existing === number) return ref;
    const ref = `c_${sessionId}_${cards.size + 1}`;
    cards.set(ref, number);
    return ref;
  }
  function canceled(item) { return isCanceled(item.cancel) || item.status === "취소/제외" || Number(item.amount) < 0; }
  function projected(item, reimbursementValue) {
    const isIncome = item.flow === "income";
    const result = {
      ref: reference(item), date: normalizeInputDate(item.approvalDate) || "", month: item.month || "",
      merchant: String(item.merchant || ""), memo: String(item.memo || ""), amount: Number(item.amount || 0),
      reimbursement: reimbursementValue === undefined ? Math.max(0, reimbursementFor(item)) : reimbursementValue,
      consumption: isIncome ? 0 : consumptionAmount(item), income: isIncome ? incomeReportingAmount(item) : 0,
      sector: item.sector || item.manualSector || "미분류", subcategory: item.subcategory || item.manualSubcategory || "미분류",
      classificationMode: item.manualSector && item.manualSubcategory ? "manual" : "automatic",
      flow: isIncome ? "income" : "expense", incomeKind: item.incomeKind || "normal",
      cardRef: cardReference(item), canceled: canceled(item), installment: Boolean(item.isInstallmentOccurrence || item.installmentEnabled)
    };
    if (item.incomeKind === "familySupport") {
      result.familyTargetMonth = item.familyTargetMonth || result.month;
      result.familySender = String(item.familySender || "");
      result.sector = "가족 지원";
      result.subcategory = "가족 입금";
    } else if (isIncome) {
      result.sector = "수입";
      result.subcategory = "이체입금";
    }
    return result;
  }
  function warnings(rows = classified) {
    const affected = rows.filter(canceled);
    const leaked = affected.filter((item) => item.flow !== "income" && item.status !== "취소/제외");
    const refunds = affected.filter((item) => Number(item.amount) < 0);
    const result = [];
    if (leaked.length) result.push({ code: "CANCELED_RECORD_IN_METRICS", count: leaked.length,
      message: "취소 표시와 앱 분류 상태가 일치하지 않는 거래가 있습니다. 앱의 현재 계산값이며 확정 소비액으로 단정할 수 없습니다.",
      refs: leaked.slice(0, 10).map(reference) });
    if (refunds.length) result.push({ code: "REFUND_REQUIRES_RECONCILIATION", count: refunds.length,
      message: "음수 취소·환불 기록이 있습니다. 원결제 및 정산금 반환 여부를 확인해야 합니다. 원결제를 임의로 상계하지 않았습니다.",
      refs: refunds.slice(0, 10).map(reference) });
    return result;
  }
  function coverage(rows) {
    const dates = rows.map((item) => normalizeInputDate(item.approvalDate)).filter(Boolean).sort();
    return { firstRecordedDate: dates[0] || null, lastRecordedDate: dates.at(-1) || null,
      message: "기록이 없는 날짜의 지출 여부는 알 수 없습니다. 마지막 기록일은 수집 완료일을 의미하지 않습니다." };
  }
  function context() {
    ensureSession();
    classified.forEach(cardReference);
    return {
      today: new Date().toLocaleDateString("sv-SE"),
      months: [...new Set(classified.map((item) => item.month).filter(Boolean))].sort(),
      categories: clone(categories), cards: [...cards.keys()].map((ref, index) => ({ ref, label: `카드 ${index + 1}` })),
      transactionCount: transactions.length, coverage: coverage(classified), warnings: warnings(),
      accounting: "금액은 원화입니다. 본인 소비는 앱의 정산·가족 부담·대출원금·할부 계산을 따릅니다. 가족지원은 수입에서 제외하고 예정지출은 실제지출과 분리합니다.",
      changes: "변경 제안은 미리보기이며, 실제 사용자가 적용 버튼을 누르기 전에는 저장되지 않습니다."
    };
  }
  function search(args) {
    object(args, Object.keys(definitions[1].parameters.properties));
    if (args.month !== undefined) month(args.month);
    if (args.from !== undefined) date(args.from);
    if (args.to !== undefined) date(args.to);
    if (args.from && args.to && args.from > args.to) fail("조회 시작일이 종료일보다 늦습니다.");
    for (const key of ["query", "sector", "subcategory", "cardRef"]) if (args[key] !== undefined) text(args[key], key);
    if (args.flow !== undefined && !["all", "income", "expense", "familySupport"].includes(args.flow)) fail("조회할 기록 종류를 확인해주세요.");
    if (args.includeCanceled !== undefined && typeof args.includeCanceled !== "boolean") fail("취소 포함 여부를 확인해주세요.");
    for (const key of ["minAmount", "maxAmount"]) if (args[key] !== undefined) money(args[key], key);
    if (args.minAmount !== undefined && args.maxAmount !== undefined && args.minAmount > args.maxAmount) fail("최소 금액이 최대 금액보다 큽니다.");
    const limit = args.limit ?? 25, offset = args.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) fail("조회 건수 또는 시작 위치를 확인해주세요.");
    if (args.cardRef && !cards.has(args.cardRef)) fail("카드 별칭이 만료되었습니다. 가계부 정보를 다시 조회해주세요.");
    const rows = classified.filter((item) => {
      const day = normalizeInputDate(item.approvalDate) || "";
      if (!args.includeCanceled && canceled(item)) return false;
      if (args.month && item.month !== args.month || args.from && day < args.from || args.to && day > args.to) return false;
      if (args.sector && item.sector !== args.sector || args.subcategory && item.subcategory !== args.subcategory) return false;
      if (args.cardRef && String(item.cardNumber || "") !== cards.get(args.cardRef)) return false;
      if (args.flow === "familySupport" && !(item.flow === "income" && item.incomeKind === "familySupport")) return false;
      if (args.flow === "income" && (item.flow !== "income" || item.incomeKind === "familySupport")) return false;
      if (args.flow === "expense" && item.flow === "income") return false;
      if (args.minAmount !== undefined && Math.abs(item.amount) < args.minAmount || args.maxAmount !== undefined && Math.abs(item.amount) > args.maxAmount) return false;
      return matchesRecordSearch(item, args.query || "", [item.sector, item.subcategory]);
    }).sort((a, b) => String(b.approvalDate).localeCompare(String(a.approvalDate)));
    return { items: rows.slice(offset, offset + limit).map((item) => projected(item)), total: rows.length,
      offset, limit, hasMore: offset + limit < rows.length, warnings: warnings(rows) };
  }
  function metrics(args) {
    object(args, ["month"]);
    month(args.month);
    const row = buildMonthlyFlowRow(args.month, reportingExpenseRows(classified));
    return { ...row, savingsRate: row.income > 0 ? row.actualSavings / row.income * 100 : null,
      basis: "앱의 년도 지출정리와 동일한 계산식 · 예정지출 별도",
      coverage: coverage(classified.filter((item) => item.month === args.month)),
      warnings: warnings(classified.filter((item) => item.month === args.month)) };
  }
  function compare(args) {
    object(args, ["month", "comparisonMonth", "sector", "subcategory", "cutoffDay"]);
    month(args.month); month(args.comparisonMonth);
    for (const key of ["sector", "subcategory"]) if (args[key] !== undefined) text(args[key], key);
    if (args.cutoffDay !== undefined && (!Number.isInteger(args.cutoffDay) || args.cutoffDay < 1 || args.cutoffDay > 31)) fail("비교 종료일은 1~31일로 입력해주세요.");
    const rows = reportingExpenseRows(classified).filter((item) => !isMonthlySavingsTransaction(item))
      .filter((item) => !args.sector || item.sector === args.sector)
      .filter((item) => !args.subcategory || item.subcategory === args.subcategory);
    const select = (selectedMonth) => rows.filter((item) => item.month === selectedMonth
      && (!args.cutoffDay || Number(normalizeInputDate(item.approvalDate)?.slice(8) || 0) <= args.cutoffDay));
    const current = select(args.month), previous = select(args.comparisonMonth);
    const currentAmount = sumConsumption(current), comparisonAmount = sumConsumption(previous);
    const groups = (getKey) => {
      const totals = new Map();
      for (const [items, key] of [[current, "currentAmount"], [previous, "comparisonAmount"]]) for (const item of items) {
        const label = String(getKey(item) || "미분류");
        if (!totals.has(label)) totals.set(label, { label, currentAmount: 0, comparisonAmount: 0 });
        totals.get(label)[key] += consumptionAmount(item);
      }
      return [...totals.values()].map((item) => ({ ...item, delta: item.currentAmount - item.comparisonAmount }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 30);
    };
    return { month: args.month, comparisonMonth: args.comparisonMonth, cutoffDay: args.cutoffDay || null,
      sector: args.sector || null, subcategory: args.subcategory || null,
      currentAmount, comparisonAmount, delta: currentAmount - comparisonAmount,
      percentageChange: comparisonAmount > 0 ? (currentAmount - comparisonAmount) / comparisonAmount * 100 : null,
      currentCount: current.length, comparisonCount: previous.length,
      countBasis: "할부 월별 배분을 포함한 보고 행 수입니다. 실제 방문 횟수나 원결제 건수와 다를 수 있습니다.",
      sectors: groups((item) => item.sector), subcategories: groups((item) => item.subcategory), merchants: groups((item) => item.merchant),
      evidence: { current: current.slice(0, 20).map((item) => projected(item)), comparison: previous.slice(0, 20).map((item) => projected(item)), limitPerPeriod: 20 },
      coverage: { current: coverage(current), comparison: coverage(previous) },
      warnings: warnings(classified.filter((item) => [args.month, args.comparisonMonth].includes(item.month))) };
  }
  function family(args) {
    object(args, ["month"]); month(args.month);
    const model = buildFamilySupportModel(args.month);
    const fields = ["month", "need", "received", "difference", "cumulativeNeed", "cumulativeReceived", "adjustmentTotal",
      "settlementBalance", "repaymentReserve", "cashBalance", "cashHeld", "cashAdjustment"];
    return { ...Object.fromEntries(fields.map((key) => [key, model[key]])),
      receiptCount: model.monthReceipts.length, obligationCount: model.obligations.length,
      basis: "입금은 정산 대상월 기준, 현금 보관액은 실제 입금·지출일 기준입니다. 지원금은 수입에서 제외합니다." };
  }

  function stateSnapshot() {
    return JSON.stringify({ identity: storageIdentity(), transactions, classified, reimbursements, recurringExpenses,
      familyAdjustments, monthlyIncome, rules: typeof rules === "undefined" ? [] : rules, appSettings });
  }
  function storageKeys() {
    return [RECORD_STORAGE_KEY, REIMBURSEMENT_STORAGE_KEY, RECURRING_STORAGE_KEY,
      FAMILY_ADJUSTMENTS_STORAGE_KEY, INCOME_STORAGE_KEY, SETTINGS_STORAGE_KEY];
  }
  async function persistedState() {
    if (typeof readPrivateData !== "function") fail("저장소를 확인할 수 없습니다. 앱을 다시 열어주세요.");
    const values = await Promise.all(storageKeys().map((key) => readPrivateData(key)));
    return { values, signature: JSON.stringify(values) };
  }
  function linked(item, records) {
    return Boolean(item.recurringId || item.installmentEnabled || item.installmentGroupId || item.recurringType === "loan"
      || item.loanType || Number(item.loanPrincipalAmount) || Number(item.loanInterestAmount)
      || Number(item.loanSupportReceivedAmount) || item.loanSupportIncomeTransactionId
      || records.some((other) => other.loanSupportIncomeTransactionId && [item.recordKey, item.transactionId].includes(other.loanSupportIncomeTransactionId))
      || familyAdjustments.some((entry) => entry.linkedLoanTransactionId && [item.recordKey, item.transactionId].includes(entry.linkedLoanTransactionId)));
  }
  function editPlan(args) {
    object(args, ["changes"]);
    if (!Array.isArray(args.changes) || !args.changes.length || args.changes.length > MAX_CHANGES) fail(`한 번에 1~${MAX_CHANGES}개의 기존 거래만 수정할 수 있습니다.`);
    const records = sourceRecords(), next = records.map((item) => ({ ...item })), nextReimbursements = { ...reimbursements };
    const seen = new Set(), candidates = [], changes = [];
    for (const edit of args.changes) {
      object(edit, Object.keys(editProperties));
      if (typeof edit.ref !== "string" || !refs.has(edit.ref) || seen.has(edit.ref)) fail("거래 참조가 없거나 중복되었습니다. 거래를 다시 조회해주세요.");
      seen.add(edit.ref);
      const key = refs.get(edit.ref), matches = records.map((item, index) => item.recordKey === key ? index : -1).filter((index) => index >= 0);
      if (matches.length !== 1) fail("거래가 없거나 식별자가 중복되었습니다. 가계부 내역에서 확인해주세요.");
      const index = matches[0], original = records[index], updated = next[index], fields = Object.keys(edit).filter((field) => field !== "ref");
      if (original.transactionId && records.filter((item) => item.transactionId === original.transactionId).length !== 1) fail("거래 ID가 중복되었습니다. 가계부 내역에서 중복 기록을 먼저 확인해주세요.");
      if (!fields.length) fail("변경할 항목을 지정해주세요.");
      if (canceled(original)) fail("취소·환불 거래는 거래 상세 화면에서 원결제를 확인한 뒤 수정해주세요.");
      if (linked(original, records) && fields.some((field) => !["merchant", "memo", "sector", "subcategory"].includes(field))) {
        fail("대출·고정지출·할부 연결 거래의 금액·날짜·정산은 해당 전용 화면에서 수정해주세요. 연결된 계산을 함께 유지해야 합니다.");
      }
      for (const [field, maximum, allowEmpty] of [["merchant", 500, false], ["memo", 10000, true], ["familySender", 500, true]]) {
        if (Object.hasOwn(edit, field)) updated[field] = text(edit[field], field, maximum, allowEmpty).trim();
      }
      if (Object.hasOwn(edit, "amount")) updated.amount = money(edit.amount, "금액", 1);
      if (Object.hasOwn(edit, "date")) { updated.approvalDate = date(edit.date); updated.month = edit.date.slice(0, 7); }
      if (Object.hasOwn(edit, "sector") || Object.hasOwn(edit, "subcategory")) {
        if (original.flow === "income") fail("수입은 지출 분류로 바꿀 수 없습니다. 가족 지원 전환을 사용해주세요.");
        if (typeof edit.sector !== "string" || typeof edit.subcategory !== "string" || edit.sector === "수입"
          || !Object.hasOwn(categories, edit.sector) || !categories[edit.sector].includes(edit.subcategory)) fail("지원하는 지출 분류와 세부항목을 함께 지정해주세요.");
        updated.manualSector = edit.sector; updated.manualSubcategory = edit.subcategory;
        updated.classificationScope = "transaction";
        if (edit.sector !== "식비") updated.foodOccasion = "";
      }
      if (["incomeKind", "familyTargetMonth", "familySender"].some((field) => Object.hasOwn(edit, field))) {
        if (original.flow !== "income") fail("수입 기록만 가족 지원 입금으로 전환할 수 있습니다.");
        if (Object.hasOwn(edit, "incomeKind")) {
          if (!["normal", "familySupport"].includes(edit.incomeKind)) fail("지원하는 입금 종류가 아닙니다.");
          updated.incomeKind = edit.incomeKind; updated.incomeKindSource = "manual";
        }
        if (Object.hasOwn(edit, "familyTargetMonth")) updated.familyTargetMonth = month(edit.familyTargetMonth);
        if (updated.incomeKind === "familySupport") {
          updated.familyTargetMonth = edit.familyTargetMonth || (original.incomeKind === "familySupport" ? original.familyTargetMonth : updated.month);
          updated.familySender = edit.familySender ?? (original.familySender || original.merchant);
        } else { updated.familyTargetMonth = ""; updated.familySender = ""; }
      }
      if (Object.hasOwn(edit, "reimbursement")) {
        if (original.flow === "income") fail("수입에는 N빵 정산금액을 지정할 수 없습니다.");
        nextReimbursements[key] = money(edit.reimbursement, "정산금액");
        if (!nextReimbursements[key]) delete nextReimbursements[key];
      }
      if (Number(nextReimbursements[key] || 0) > updated.amount) fail("금액을 정산받은 금액보다 작게 수정할 수 없습니다.");
      if (Number(updated.familyBurdenAmount || 0) > updated.amount - Number(nextReimbursements[key] || 0)) fail("금액과 정산금액이 가족 부담액보다 작습니다. 가족 정산 화면에서 먼저 확인해주세요.");
      candidates.push({ ref: edit.ref, key, index, original, fields });
    }
    // Use the same pure classification pass as saving. A merchant edit can change
    // rule-based or suggested categories, which must be visible before approval.
    const proposedClassified = new Map(classifyTransactions(next).map((item) => [item.recordKey, item]));
    for (const { ref, key, index, original, fields } of candidates) {
      const updated = next[index];
      const classifiedOriginal = classified.find((item) => item.recordKey === key) || original;
      const before = projected({ ...classifiedOriginal, ...original });
      const after = projected(proposedClassified.get(key), Number(nextReimbursements[key] || 0));
      // Preview calculations must use the proposed reimbursement, not the live lookup.
      after.consumption = updated.flow === "income" ? 0 : Math.max(0, updated.amount - after.reimbursement - familyExpenseBurden(updated));
      if (isLoanRepaymentTransaction(updated)) after.consumption = consumptionAmount(updated);
      after.income = updated.flow === "income" ? (updated.incomeKind === "familySupport" ? 0 : incomeReportingAmount(updated)) : 0;
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      updated.updatedAt = new Date().toISOString();
      for (const field of ["sector", "subcategory", "classificationMode"]) if (before[field] !== after[field] && !fields.includes(field)) fields.push(field);
      changes.push({ ref, before, after, fields });
    }
    if (!changes.length) fail("변경할 내용이 없습니다.");
    return { next, nextReimbursements, changes };
  }
  async function createPlan(args) {
    ensureSession();
    const snapshot = stateSnapshot(), identity = storageIdentity(), epoch = sessionId;
    const proposed = editPlan(args);
    const persisted = await persistedState();
    ensureSession();
    if (epoch !== sessionId || snapshot !== stateSnapshot()) fail("미리보기 중 기록이 바뀌었습니다. 다시 조회해주세요.");
    const storedRecords = Array.isArray(persisted.values[0]) ? persisted.values[0].map(normalizeStoredTransaction) : [];
    if (JSON.stringify(storedRecords) !== JSON.stringify(sourceRecords())
      || JSON.stringify(persisted.values[1] || {}) !== JSON.stringify(reimbursements)) {
      fail("저장된 기록과 화면이 다릅니다. 최신 가계부를 다시 불러온 뒤 수정해주세요.");
    }
    const planId = `p_${newId()}`;
    plans.set(planId, { ...proposed, snapshot, identity, epoch, persisted: persisted.signature,
      expectedRecordsJson: JSON.stringify(persisted.values[0] ?? null),
      expectedReimbursementsJson: JSON.stringify(persisted.values[1] ?? null),
      preview: { planId, status: "pending", changes: proposed.changes,
        message: "변경 전후를 확인한 뒤 적용 버튼을 눌러주세요. 아직 저장하지 않았습니다." } });
    return getPlan(planId);
  }
  function getPlan(id) { ensureSession(); const plan = plans.get(id); return plan ? clone(plan.preview) : null; }
  function getPlans() { return [...plans.keys()].map(getPlan); }
  async function applyPlan(id) {
    ensureSession();
    const plan = plans.get(id);
    if (!plan || plan.preview.status !== "pending") fail("적용 가능한 미리보기가 없습니다. 이미 적용했거나 만료되었습니다.");
    if (applying) fail("다른 변경을 저장하고 있습니다. 잠시 후 다시 시도해주세요.");
    applying = true;
    try {
      const result = await runManualTransactionSave(async () => {
        ensureSession();
        if (plan.epoch !== sessionId || plan.identity !== storageIdentity() || plan.snapshot !== stateSnapshot()) fail("미리보기 이후 기록이 바뀌었습니다. 최신 기록으로 다시 제안해주세요.");
        const persisted = await persistedState();
        ensureSession();
        if (plan.epoch !== sessionId || plan.snapshot !== stateSnapshot() || persisted.signature !== plan.persisted) fail("저장된 기록이 바뀌었습니다. 최신 기록으로 다시 제안해주세요.");
        const saved = await safeSaveMany([
          { key: RECORD_STORAGE_KEY, data: plan.next, protectIncomeRecords: true, expectedJson: plan.expectedRecordsJson },
          { key: REIMBURSEMENT_STORAGE_KEY, data: plan.nextReimbursements, expectedJson: plan.expectedReimbursementsJson }
        ]);
        if (!saved) fail("변경을 저장하지 못했습니다. 기록은 적용하지 않았습니다. 저장 상태를 확인해주세요.");
        transactions = plan.next;
        reimbursements = plan.nextReimbursements;
        plan.preview.status = "applied";
        plan.preview.message = "변경을 저장했습니다.";
        // A rendering error cannot turn a committed save into an apparent retryable failure.
        try { reclassify(); } catch { plan.preview.message = "변경은 저장했습니다. 화면을 새로 열어 확인해주세요."; }
        return { planId: id, status: "applied", changedCount: plan.changes.length, message: plan.preview.message };
      });
      if (!result) fail("다른 입력을 저장 중입니다. 잠시 후 적용해주세요.");
      return result;
    } finally { applying = false; }
  }
  function clearSession() {
    refs.clear(); cards.clear(); plans.clear();
    sessionId = newId(); sessionIdentity = storageIdentity();
  }
  async function execute(name, args = {}) {
    ensureSession();
    const handlers = { ledger_context: (input) => { object(input, []); return context(); },
      search_transactions: search, monthly_metrics: metrics, compare_spending: compare,
      family_settlement: family, propose_changes: createPlan };
    if (!Object.hasOwn(handlers, name)) fail("지원하지 않는 가계부 도구입니다.");
    return handlers[name](args);
  }

  root.LedgerAgentTools = Object.freeze({ definitions, context, execute, createPlan, getPlan, getPlans, applyPlan, clearSession });
})(globalThis);
