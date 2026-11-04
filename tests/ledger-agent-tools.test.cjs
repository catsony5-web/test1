const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// All dates, labels, identifiers and amounts below are invented fixtures.
function row(id, amount = 100, extra = {}) {
  return { recordKey: id, transactionId: `synthetic-${id}`, merchant: `가상 거래 ${id}`,
    approvalDate: "2044-02-10", month: "2044-02", approvalTime: "12:00", amount,
    flow: "expense", sourceType: "card", cancel: "", sector: "식비", subcategory: "외식-혼자", status: "직접입력",
    manualSector: "식비", manualSubcategory: "외식-혼자", ...extra };
}

function setup(rows = [row("synthetic-a")], options = {}) {
  const stored = new Map();
  const state = { saves: 0, renders: 0, entries: [], failSave: false, beforeSave: null, busy: false };
  const c = vm.createContext({
    console, crypto: webcrypto, structuredClone, Date,
    transactions: clone(rows), classified: clone(rows), reimbursements: clone(options.reimbursements || {}),
    recurringExpenses: clone(options.recurringExpenses || []), familyAdjustments: [], monthlyIncome: {},
    appSettings: {}, rules: [],
    buildSmartSuggestionModel: () => [], suggestCategory: () => null, ruleTypeLabel: () => "사용자 규칙",
    saveRules: () => true, renderAll: () => {},
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value),
    recurringOccurrencesForMonth: () => [], scheduledTotalForMonth: () => 0, scheduledPersonalTotalForMonth: () => 0,
    readPrivateData: async (key) => clone(stored.get(key)),
    safeSaveMany: async (entries) => {
      state.entries = clone(entries);
      state.beforeSave?.();
      if (state.failSave || entries.some((entry) => entry.expectedJson !== JSON.stringify(stored.get(entry.key) ?? null))) return false;
      state.saves++;
      entries.forEach((entry) => stored.set(entry.key, clone(entry.data)));
      return true;
    },
    runManualTransactionSave: async (operation) => state.busy ? undefined : operation(),
    reclassify: () => { state.renders++; c.classified = clone(c.transactions); }
  });
  c.window = c;
  for (const file of [
    "src/data/constants.js", "src/data/categories.js", "src/utils/format.js", "src/utils/date.js",
    "src/utils/food-occasion.js", "src/utils/normalize.js", "src/utils/grouping.js",
    "src/components/chips.js", "src/features/board/board-view.js", "src/features/family/family-core.js",
    "src/features/monthly/monthly-flow.js", "src/features/classification/classifier.js",
    "src/features/transactions/transactions-view.js", "src/features/agent/ledger-agent-tools.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), c, { filename: file });
  c.runManualTransactionSave = async (operation) => state.busy ? undefined : operation();
  c.reclassify = () => { state.renders++; c.classified = c.classifyTransactions(c.transactions); };
  c.transactions = c.transactions.map(c.normalizeStoredTransaction);
  const keys = vm.runInContext("STORAGE_KEYS", c);
  stored.set(keys.records, clone(c.transactions));
  stored.set(keys.reimbursements, clone(c.reimbursements));
  stored.set(keys.recurringExpenses, clone(c.recurringExpenses));
  stored.set(keys.familyAdjustments, []);
  stored.set(keys.monthlyIncome, {});
  stored.set(keys.settings, {});
  return { c, tools: c.LedgerAgentTools, state, stored, keys };
}

async function refOf(tools, query) {
  return (await tools.execute("search_transactions", { query })).items[0].ref;
}

function enableRealClassification(c) {
  c.buildSmartSuggestionModel = () => [];
  c.suggestCategory = () => null;
  c.ruleTypeLabel = () => "사용자 규칙";
  c.saveRules = () => true;
  c.renderAll = () => {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src/features/classification/classifier.js"), "utf8"), c);
  c.reclassify();
}

test("read tools project only allowed fields and opaque references without saving", async () => {
  const source = row("synthetic-hidden-key", 100, {
    cardNumber: "9999000000009900", approvalNo: "SYNTHETIC_PRIVATE_APPROVAL", sourceFile: "SYNTHETIC_PRIVATE_FILE",
    memo: "가상 메모", importedAt: "2044-02-11T01:00:00Z"
  });
  const { tools, state } = setup([source]);
  const context = tools.context();
  const result = await tools.execute("search_transactions", { query: "가상 메모" });
  assert.equal(result.total, 1);
  assert.match(result.items[0].ref, /^t_/);
  assert.match(result.items[0].cardRef, /^c_/);
  const encoded = JSON.stringify({ context, result });
  for (const field of ["cardNumber", "approvalNo", "sourceFile", "transactionId", "recordKey", "importedAt"]) assert.equal(encoded.includes(`"${field}"`), false);
  for (const secret of [source.cardNumber, source.approvalNo, source.sourceFile]) assert.equal(encoded.includes(secret), false);
  assert.equal(state.saves, 0);
  assert.equal(tools.definitions.some((tool) => /apply/.test(tool.name)), false);
  await assert.rejects(tools.execute("apply_changes", {}), /지원하지 않는/);
});

test("search supports bounded pagination, date, amount, family flow, and card aliases", async () => {
  const { tools } = setup([
    row("synthetic-a", 30, { cardNumber: "9999" }), row("synthetic-b", 50, { cardNumber: "8888" }),
    row("synthetic-c", 80, { flow: "income", incomeKind: "familySupport" })
  ]);
  const { cards } = tools.context();
  const page = await tools.execute("search_transactions", { limit: 1 });
  assert.equal(page.total, 3); assert.equal(page.items.length, 1); assert.equal(page.hasMore, true);
  assert.equal((await tools.execute("search_transactions", { minAmount: 40, maxAmount: 70 })).total, 1);
  assert.equal((await tools.execute("search_transactions", { cardRef: cards[0].ref })).total, 1);
  assert.equal((await tools.execute("search_transactions", { flow: "familySupport" })).total, 1);
  assert.equal((await tools.execute("search_transactions", { flow: "income" })).total, 0);
  await assert.rejects(tools.execute("search_transactions", { limit: 101 }), /조회 건수/);
  await assert.rejects(tools.execute("search_transactions", { from: "2044-02-30" }), /존재하지/);
  await assert.rejects(tools.execute("search_transactions", { from: "2044-03-02", to: "2044-03-01" }), /시작일/);
  await assert.rejects(tools.execute("search_transactions", { arbitrary: "field" }), /지원하지/);
});

test("monthly totals reuse installment, reimbursement, family and principal accounting", async () => {
  const { c, tools } = setup([
    row("synthetic-meal", 100),
    row("synthetic-installment", 240, { installmentEnabled: true, installmentMonths: 3, installmentStartMonth: "2044-02", installmentOriginalAmount: 240 }),
    row("synthetic-income", 1000, { flow: "income", sector: "수입", manualSector: "", manualSubcategory: "" }),
    row("synthetic-family", 200, { flow: "income", incomeKind: "familySupport", familyTargetMonth: "2044-02" }),
    row("synthetic-loan", 100, { recurringType: "loan", loanPrincipalAmount: 90, loanInterestAmount: 10, loanSupportPrincipalAmount: 30, loanSupportInterestAmount: 2 }),
    row("synthetic-fixed", 50, { familyBurdenAmount: 30 }),
    row("synthetic-saving", 40, { sector: "저축", subcategory: "적금/예금", manualSector: "저축", manualSubcategory: "적금/예금" })
  ], { reimbursements: { "synthetic-meal": 20, "synthetic-installment": 30 } });
  const metric = await tools.execute("monthly_metrics", { month: "2044-02" });
  assert.equal(metric.income, 1000);
  assert.equal(metric.consumptionSpend, 178);
  assert.equal(metric.actualSavings, 40);
  assert.equal(metric.debtRepayment, 60);
  assert.equal(metric.savingsRate, 4);
  const family = await tools.execute("family_settlement", { month: "2044-02" });
  assert.equal(family.received, 200);
  assert.equal(family.need, c.buildFamilySupportModel("2044-02").need);
  assert.equal(Object.hasOwn(family, "receipts"), false);
});

test("same-day comparison excludes savings and exposes complete totals beyond evidence limits", async () => {
  const rows = Array.from({ length: 25 }, (_, index) => row(`synthetic-${index}`, 10));
  rows.push(row("synthetic-previous", 120, { approvalDate: "2044-01-10", month: "2044-01" }));
  rows.push(row("synthetic-later", 80, { approvalDate: "2044-01-25", month: "2044-01" }));
  rows.push(row("synthetic-save", 50, { sector: "저축", subcategory: "적금/예금" }));
  const { tools } = setup(rows);
  const result = await tools.execute("compare_spending", { month: "2044-02", comparisonMonth: "2044-01", cutoffDay: 15 });
  assert.equal(result.currentAmount, 250);
  assert.equal(result.comparisonAmount, 120);
  assert.equal(result.delta, 130);
  assert.equal(result.currentCount, 25);
  assert.equal(result.evidence.current.length, 20);
  assert.equal(result.cutoffDay, 15);
});

test("cancellation anomalies are reported without secretly changing shared app metrics", async () => {
  const { tools } = setup([
    row("synthetic-original", 60),
    row("synthetic-refund", -60, { cancel: "취소", status: "취소/제외" }),
    row("synthetic-manual-cancel", 20, { cancel: "취소", status: "직접입력" })
  ]);
  const metric = await tools.execute("monthly_metrics", { month: "2044-02" });
  assert.equal(metric.consumptionSpend, 80);
  assert.deepEqual(Array.from(metric.warnings, (entry) => entry.code), ["CANCELED_RECORD_IN_METRICS", "REFUND_REQUIRES_RECONCILIATION"]);
  assert.equal((await tools.execute("search_transactions", {})).total, 1);
  assert.equal((await tools.execute("search_transactions", { includeCanceled: true })).total, 3);
});

test("proposals do not mutate data and apply atomically once with original identities", async () => {
  const { c, tools, state } = setup([row("synthetic-a", 100)], { reimbursements: { "synthetic-a": 10 } });
  const ref = await refOf(tools, "synthetic-a"), before = JSON.stringify(c.transactions);
  const plan = await tools.execute("propose_changes", { changes: [{ ref, amount: 120, date: "2044-02-29", memo: "가상 변경", reimbursement: 20 }] });
  assert.equal(plan.status, "pending");
  assert.equal(plan.changes[0].before.amount, 100);
  assert.equal(plan.changes[0].after.amount, 120);
  assert.equal(plan.changes[0].after.consumption, 100);
  assert.equal(state.saves, 0);
  assert.equal(JSON.stringify(c.transactions), before);
  plan.changes[0].after.amount = 999;
  assert.equal(tools.getPlan(plan.planId).changes[0].after.amount, 120);
  assert.equal(JSON.stringify(tools.getPlan(plan.planId)).includes("expectedRecordsJson"), false);
  const result = await tools.applyPlan(plan.planId);
  assert.equal(result.status, "applied"); assert.equal(state.saves, 1);
  assert.equal(c.transactions[0].amount, 120);
  assert.equal(c.transactions[0].recordKey, "synthetic-a");
  assert.equal(c.transactions[0].transactionId, "synthetic-synthetic-a");
  assert.equal(c.reimbursements["synthetic-a"], 20);
  assert.equal(state.entries.length, 2);
  assert.ok(state.entries.every((entry) => typeof entry.expectedJson === "string"));
  await assert.rejects(tools.applyPlan(plan.planId), /이미 적용/);
  assert.equal(state.saves, 1);
});

test("family conversion keeps the original income record and no longer counts as income", async () => {
  const { c, tools } = setup([row("synthetic-income", 180, { flow: "income", manualSector: "", manualSubcategory: "", memo: "가상 기존 메모" })]);
  const ref = await refOf(tools, "synthetic-income");
  const plan = await tools.createPlan({ changes: [{ ref, incomeKind: "familySupport", familyTargetMonth: "2044-01", familySender: "가상 가족" }] });
  assert.equal(plan.changes[0].before.income, 180);
  assert.equal(plan.changes[0].after.income, 0);
  await tools.applyPlan(plan.planId);
  assert.equal(c.transactions.length, 1);
  assert.equal(c.transactions[0].recordKey, "synthetic-income");
  assert.equal(c.transactions[0].approvalDate, "2044-02-10");
  assert.equal(c.transactions[0].memo, "가상 기존 메모");
  assert.equal(c.transactions[0].familyTargetMonth, "2044-01");
  assert.equal(c.incomeReportingAmount(c.transactions[0]), 0);
});

test("invalid or unrelated changes cannot become a proposal", async () => {
  const { tools } = setup();
  const ref = await refOf(tools, "synthetic-a");
  for (const edit of [
    { ref, amount: -1 }, { ref, amount: 1.2 }, { ref, amount: Number.MAX_SAFE_INTEGER + 1 },
    { ref, date: "2043-02-29" }, { ref, merchant: " " }, { ref, reimbursement: 101 },
    { ref, transactionId: "replacement" }, { ref, sector: "가상 존재하지 않는 분류", subcategory: "가상 항목" },
    { ref, sector: "식비" }, { ref, incomeKind: "familySupport" }, { ref: "missing", memo: "가상 메모" }
  ]) await assert.rejects(tools.createPlan({ changes: [edit] }));
  await assert.rejects(tools.createPlan({ changes: [{ ref, memo: "가상" }, { ref, memo: "중복 가상" }] }), /중복/);
  assert.equal(tools.getPlans().length, 0);
});

test("linked loan, installment, recurring and linked income financial edits are blocked", async () => {
  for (const extra of [{ installmentEnabled: true }, { recurringId: "synthetic-recurring" }, { recurringType: "loan", loanPrincipalAmount: 80 }]) {
    const { tools } = setup([row("synthetic-linked", 100, extra)]);
    const ref = await refOf(tools, "synthetic-linked");
    await assert.rejects(tools.createPlan({ changes: [{ ref, amount: 110 }] }), /전용 화면/);
    assert.equal((await tools.createPlan({ changes: [{ ref, memo: "가상 확인 메모" }] })).status, "pending");
  }
  const { tools } = setup([
    row("synthetic-income", 100, { flow: "income" }),
    row("synthetic-loan", 100, { loanSupportIncomeTransactionId: "synthetic-synthetic-income" })
  ]);
  await assert.rejects(tools.createPlan({ changes: [{ ref: await refOf(tools, "synthetic-income"), incomeKind: "familySupport" }] }), /전용 화면/);
});

test("stale memory, persisted data and changed vault identity each prevent apply", async () => {
  for (const mutation of ["memory", "stored", "vault"]) {
    const { c, tools, state, stored, keys } = setup();
    const plan = await tools.createPlan({ changes: [{ ref: await refOf(tools, "synthetic-a"), amount: 110 }] });
    if (mutation === "memory") c.transactions[0].memo = "가상 다른 화면 변경";
    if (mutation === "stored") stored.get(keys.records)[0].memo = "가상 다른 탭 변경";
    if (mutation === "vault") c.BudgetCloud = { generation: () => "synthetic-other-vault" };
    await assert.rejects(tools.applyPlan(plan.planId), /바뀌었습니다/);
    assert.equal(state.saves, 0); assert.equal(c.transactions[0].amount, 100);
  }
});

test("failed save and compare-and-swap race leave live records unchanged", async () => {
  for (const failure of ["save", "cas"]) {
    const { c, tools, state, stored, keys } = setup();
    const before = JSON.stringify(c.transactions);
    const plan = await tools.createPlan({ changes: [{ ref: await refOf(tools, "synthetic-a"), amount: 110 }] });
    if (failure === "save") state.failSave = true;
    else state.beforeSave = () => { stored.get(keys.records)[0].memo = "가상 큐 경합 변경"; };
    await assert.rejects(tools.applyPlan(plan.planId), /저장하지 못했습니다/);
    assert.equal(JSON.stringify(c.transactions), before);
    assert.equal(state.saves, 0); assert.equal(state.renders, 0);
    assert.equal(tools.getPlan(plan.planId).status, "pending");
  }
});

test("clearing the session invalidates references and pending plans", async () => {
  const { tools } = setup();
  const ref = await refOf(tools, "synthetic-a");
  const plan = await tools.createPlan({ changes: [{ ref, amount: 110 }] });
  tools.clearSession();
  assert.equal(tools.getPlan(plan.planId), null);
  await assert.rejects(tools.applyPlan(plan.planId), /미리보기가 없습니다/);
  const next = await refOf(tools, "synthetic-a");
  assert.notEqual(ref, next);
  await assert.rejects(tools.createPlan({ changes: [{ ref, amount: 110 }] }), /거래 참조/);
});

test("render failure after commit does not permit duplicate application", async () => {
  const { c, tools, state } = setup();
  const plan = await tools.createPlan({ changes: [{ ref: await refOf(tools, "synthetic-a"), memo: "가상 변경" }] });
  c.reclassify = () => { throw new Error("synthetic render failure"); };
  const result = await tools.applyPlan(plan.planId);
  assert.equal(result.status, "applied"); assert.equal(state.saves, 1);
  assert.match(result.message, /화면을 새로/);
  await assert.rejects(tools.applyPlan(plan.planId));
});

test("batch validation is all-or-nothing and category changes clear an incompatible food occasion", async () => {
  const { c, tools, state } = setup([row("synthetic-a", 100, { foodOccasion: "celebration" }), row("synthetic-b", 80)]);
  const a = await refOf(tools, "synthetic-a"), b = await refOf(tools, "synthetic-b");
  await assert.rejects(tools.createPlan({ changes: [{ ref: a, amount: 120 }, { ref: b, amount: -1 }] }));
  assert.equal(c.transactions[0].amount, 100);
  assert.equal(state.saves, 0);
  const choices = tools.context().categories;
  const sector = Object.keys(choices).find((key) => !["식비", "수입"].includes(key) && choices[key].length);
  const plan = await tools.createPlan({ changes: [{ ref: a, sector, subcategory: choices[sector][0] }] });
  assert.equal(plan.changes[0].after.sector, sector);
  await tools.applyPlan(plan.planId);
  assert.equal(c.transactions[0].manualSector, sector);
  assert.equal(c.transactions[0].classificationScope, "transaction");
  assert.equal(c.transactions[0].foodOccasion, "");
});

test("stale stored baseline is rejected before the user sees a proposal", async () => {
  const { tools, stored, keys } = setup();
  const ref = await refOf(tools, "synthetic-a");
  stored.get(keys.records)[0].amount = 140;
  await assert.rejects(tools.createPlan({ changes: [{ ref, amount: 110 }] }), /저장된 기록과 화면이/);
  assert.equal(tools.getPlans().length, 0);
});

test("a busy manual save does not falsely report application", async () => {
  const { tools, state, c } = setup();
  const plan = await tools.createPlan({ changes: [{ ref: await refOf(tools, "synthetic-a"), amount: 110 }] });
  state.busy = true;
  await assert.rejects(tools.applyPlan(plan.planId), /다른 입력/);
  assert.equal(state.saves, 0); assert.equal(c.transactions[0].amount, 100);
  assert.equal(tools.getPlan(plan.planId).status, "pending");
});

test("ambiguous persistent transaction IDs cannot be edited", async () => {
  const { tools } = setup([row("synthetic-a", 100, { transactionId: "synthetic-shared" }), row("synthetic-b", 80, { transactionId: "synthetic-shared" })]);
  await assert.rejects(tools.createPlan({ changes: [{ ref: await refOf(tools, "synthetic-a"), memo: "가상 변경" }] }), /ID가 중복/);
});

test("merchant-only previews show the actual changed category without pinning automatic classification", async () => {
  const { c, tools } = setup([row("synthetic-auto", 100, { merchant: "가상첫식당", manualSector: "", manualSubcategory: "" })]);
  c.rules = [
    { keywords: ["가상첫식당"], sector: "식비", subcategory: "외식-혼자" },
    { keywords: ["가상둘상점"], sector: "쇼핑", subcategory: "화장품" }
  ];
  enableRealClassification(c);
  const plan = await tools.createPlan({ changes: [{ ref: await refOf(tools, "가상첫식당"), merchant: "가상둘상점" }] });
  assert.equal(plan.changes[0].after.sector, "쇼핑");
  await tools.applyPlan(plan.planId);
  assert.equal(c.classified[0].sector, plan.changes[0].after.sector);
  assert.equal(c.classified[0].subcategory, plan.changes[0].after.subcategory);
  assert.equal(c.transactions[0].manualSector, "");
});

test("preview uses normalized classification for both legacy and newly proposed categories", async () => {
  const { c, tools } = setup([row("synthetic-legacy", 100, {
    merchant: "가상 구독 서비스", manualSector: "고정 주거비", manualSubcategory: "구독료"
  })]);
  enableRealClassification(c);
  const ref = await refOf(tools, "가상 구독 서비스");
  const plan = await tools.createPlan({ changes: [{ ref, memo: "가상 변경", sector: "고정 주거비", subcategory: "월세" }] });
  assert.equal(plan.changes[0].before.sector, "기타 소비");
  assert.equal(plan.changes[0].after.sector, "기타 소비");
  assert.equal(plan.changes[0].after.subcategory, "구독료");
  await tools.applyPlan(plan.planId);
  assert.equal(c.classified[0].sector, plan.changes[0].after.sector);
  assert.equal(c.classified[0].subcategory, plan.changes[0].after.subcategory);
});

test("proposed reimbursement and family burden match consumption after application", async () => {
  const { c, tools } = setup([row("synthetic-family-expense", 120, { familyBurdenAmount: 30 })], {
    reimbursements: { "synthetic-family-expense": 10 }
  });
  const plan = await tools.createPlan({ changes: [{ ref: await refOf(tools, "synthetic-family-expense"), amount: 150, reimbursement: 40 }] });
  assert.equal(plan.changes[0].after.consumption, 80);
  await tools.applyPlan(plan.planId);
  assert.equal(c.consumptionAmount(c.transactions[0]), plan.changes[0].after.consumption);
});

test("same visible category changes explicitly preview automatic to manual classification", async () => {
  const { c, tools } = setup([row("synthetic-mode", 100, { merchant: "가상자동분류", manualSector: "", manualSubcategory: "" })]);
  c.rules = [{ keywords: ["가상자동분류"], sector: "식비", subcategory: "외식-혼자" }];
  enableRealClassification(c);
  const plan = await tools.createPlan({ changes: [{ ref: await refOf(tools, "가상자동분류"), sector: "식비", subcategory: "외식-혼자" }] });
  assert.equal(plan.changes[0].before.classificationMode, "automatic");
  assert.equal(plan.changes[0].after.classificationMode, "manual");
  assert.equal(plan.changes[0].before.sector, plan.changes[0].after.sector);
  assert.ok(plan.changes[0].fields.includes("classificationMode"));
  assert.equal(c.transactions[0].manualSector, "");
  await tools.applyPlan(plan.planId);
  assert.equal(c.transactions[0].manualSector, "식비");
  assert.equal((await tools.execute("search_transactions", {})).items[0].classificationMode, "manual");
});

test("family summary returns every projected scalar and separates settlement month from receipt cash", async () => {
  const { tools } = setup([
    row("synthetic-prior-support", 70, { flow: "income", incomeKind: "familySupport", familyTargetMonth: "2044-01" }),
    row("synthetic-current-support", 50, { flow: "income", incomeKind: "familySupport", familyTargetMonth: "2044-02" }),
    row("synthetic-prior-burden", 30, { approvalDate: "2044-01-10", month: "2044-01", familyBurdenAmount: 30 }),
    row("synthetic-current-burden", 40, { familyBurdenAmount: 40 })
  ]);
  const prior = await tools.execute("family_settlement", { month: "2044-01" });
  const current = await tools.execute("family_settlement", { month: "2044-02" });
  assert.equal(prior.received, 70); assert.equal(prior.cashBalance, -30);
  const expected = { need: 40, received: 50, difference: 10, cumulativeNeed: 70, cumulativeReceived: 120,
    adjustmentTotal: 0, settlementBalance: 50, repaymentReserve: 50, cashBalance: 50, cashHeld: 50,
    cashAdjustment: 30, receiptCount: 1, obligationCount: 1 };
  for (const [field, value] of Object.entries(expected)) {
    assert.ok(Object.hasOwn(current, field), field);
    assert.equal(current[field], value, field);
  }
});

function expenseEntry(extra = {}) {
  return { kind: "expense", date: "2044-02-12", merchant: "가상 신규 식사", amount: 90,
    sourceType: "cash", sector: "식비", subcategory: "외식-혼자", ...extra };
}

test("new expense, income and family entries preview without new refs and save through the existing batch once", async () => {
  const { c, tools, state, stored, keys } = setup([row("synthetic-existing", 100, { cardNumber: "9999000000009900" })]);
  const cardRef = tools.context().cards[0].ref;
  const beforeRecords = JSON.stringify(c.transactions), beforeSearch = clone(await tools.execute("search_transactions", {}));
  const plan = await tools.execute("propose_entries", { entries: [
    expenseEntry({ sourceType: "card", cardRef, reimbursement: 30, memo: "가상 식사 메모" }),
    { kind: "income", date: "2044-02-12", merchant: "가상 일반 수입", amount: 300, memo: "가상 수입 메모" },
    { kind: "familySupport", date: "2044-02-12", merchant: "가상 가족 입금", amount: 200, familySender: "가상 보낸 사람" }
  ] });
  assert.equal(plan.addedCount, 3); assert.equal(plan.updatedCount, 0); assert.equal(state.saves, 0);
  assert.equal(JSON.stringify(c.transactions), beforeRecords);
  assert.deepEqual(clone(await tools.execute("search_transactions", {})), beforeSearch);
  assert.ok(plan.changes.every((change) => change.operation === "add" && change.before === null && !Object.hasOwn(change.after, "ref")));
  assert.equal(plan.changes[0].after.sourceType, "card"); assert.equal(plan.changes[0].after.cardRef, cardRef);
  assert.equal(plan.changes[0].after.consumption, 60); assert.equal(plan.changes[1].after.income, 300);
  assert.equal(plan.changes[2].after.income, 0); assert.equal(plan.changes[2].after.familyTargetMonth, "2044-02");
  for (const secret of ["9999000000009900", '"recordKey"', '"transactionId"', '"approvalNo"']) assert.equal(JSON.stringify(plan).includes(secret), false);
  plan.changes[0].after.amount = 999;
  const applied = await tools.applyPlan(plan.planId);
  assert.equal(applied.changedCount, 3); assert.equal(applied.addedCount, 3); assert.equal(applied.updatedCount, 0);
  assert.equal(state.saves, 1); assert.equal(state.entries.length, 2); assert.ok(state.entries.every((entry) => typeof entry.expectedJson === "string"));
  const added = c.transactions.filter((item) => item.recordKey !== "synthetic-existing");
  assert.equal(added.length, 3);
  assert.equal(new Set(added.map((item) => item.transactionId)).size, 3);
  assert.ok(added.every((item) => item.approvalNo.startsWith("manual-") && item.sourceFile === "직접입력"));
  const expense = added.find((item) => item.flow === "expense"), family = added.find((item) => item.incomeKind === "familySupport");
  assert.equal(expense.amount, 90); assert.equal(c.reimbursements[expense.recordKey], 30);
  assert.equal(family.sourceType, "transfer"); assert.equal(family.incomeKindSource, "manual");
  assert.equal((await tools.execute("monthly_metrics", { month: "2044-02" })).income, 300);
  assert.equal((await tools.execute("monthly_metrics", { month: "2044-02" })).consumptionSpend, 160);
  assert.equal((await tools.execute("family_settlement", { month: "2044-02" })).received, 200);
  assert.deepEqual(clone(c.transactions), stored.get(keys.records));
  await assert.rejects(tools.applyPlan(plan.planId), /이미 적용/); assert.equal(state.saves, 1);
});

test("family entry target months and split payments use normal family settlement accounting", async () => {
  const { c, tools } = setup([]);
  const plan = await tools.execute("propose_entries", { entries: [
    { kind: "familySupport", date: "2044-03-02", merchant: "가상 분할 입금 하나", amount: 40, familySender: "가상 가족", familyTargetMonth: "2044-02" },
    { kind: "familySupport", date: "2044-03-04", merchant: "가상 분할 입금 둘", amount: 60, familySender: "가상 가족", familyTargetMonth: "2044-02" }
  ] });
  await tools.applyPlan(plan.planId);
  assert.equal((await tools.execute("family_settlement", { month: "2044-02" })).received, 100);
  assert.equal((await tools.execute("family_settlement", { month: "2044-03" })).received, 0);
  assert.equal((await tools.execute("monthly_metrics", { month: "2044-03" })).income, 0);
  assert.ok(c.transactions.every((item) => item.month === "2044-03" && item.familyTargetMonth === "2044-02"));
});

test("entry validation rejects ambiguous payments, unsupported identities and incomplete batches without saving", async () => {
  const { c, tools, state } = setup();
  const before = JSON.stringify(c.transactions);
  const invalid = [
    expenseEntry({ sourceType: undefined }), expenseEntry({ sourceType: "manual" }),
    expenseEntry({ sector: undefined }), expenseEntry({ subcategory: "가상 없는 분류" }),
    expenseEntry({ amount: 0 }), expenseEntry({ amount: -1 }), expenseEntry({ amount: 1.5 }),
    expenseEntry({ amount: Number.MAX_SAFE_INTEGER + 1 }), expenseEntry({ date: "2043-02-29" }), expenseEntry({ merchant: " " }),
    expenseEntry({ reimbursement: 91 }), expenseEntry({ reimbursement: -1 }),
    expenseEntry({ cardRef: "missing" }), expenseEntry({ sourceType: "card", cardRef: "missing" }),
    expenseEntry({ cardNumber: "9999" }), expenseEntry({ recordKey: "synthetic-override" }),
    expenseEntry({ transactionId: "synthetic-override" }), expenseEntry({ recurringId: "synthetic-recurring" }),
    expenseEntry({ installmentEnabled: true }), expenseEntry({ familySender: "가상 가족" }),
    { kind: "income", date: "2044-02-12", merchant: "가상 수입", amount: 30, sourceType: "cash" },
    { kind: "income", date: "2044-02-12", merchant: "가상 수입", amount: 30, reimbursement: 0 },
    { kind: "familySupport", date: "2044-02-12", merchant: "가상 가족", amount: 30 },
    { kind: "familySupport", date: "2044-02-12", merchant: "가상 가족", amount: 30, familySender: " ", familyTargetMonth: "2044-99" }
  ];
  for (const entry of invalid) await assert.rejects(tools.execute("propose_entries", { entries: [expenseEntry(), entry] }));
  await assert.rejects(tools.execute("propose_entries", { entries: [] }));
  await assert.rejects(tools.execute("propose_entries", { entries: Array.from({ length: 51 }, () => expenseEntry()) }), /50/);
  assert.equal(tools.getPlans().length, 0); assert.equal(state.saves, 0); assert.equal(JSON.stringify(c.transactions), before);
});

test("possible duplicate entries warn but distinct approved records retain their own identities", async () => {
  const entry = expenseEntry({ date: "2044-02-10", merchant: "가상 중복 식사" });
  const { c, tools } = setup([row("synthetic-existing", 90, { merchant: entry.merchant })]);
  const plan = await tools.execute("propose_entries", { entries: [entry, { ...entry, merchant: " 가상  중복 식사 " }] });
  assert.equal(plan.warnings.length, 2);
  assert.equal(plan.warnings[0].existingCount, 1); assert.equal(plan.warnings[0].proposedCount, 0);
  assert.equal(plan.warnings[1].existingCount, 1); assert.equal(plan.warnings[1].proposedCount, 1);
  assert.equal(plan.addedCount, 2); await tools.applyPlan(plan.planId);
  assert.equal(c.transactions.length, 3); assert.equal(new Set(c.transactions.map((item) => item.transactionId)).size, 3);
});

test("pending entry plans reject stale data, changed vaults, busy saves and failed compare-and-swap", async () => {
  for (const mutation of ["memory", "stored", "vault", "save", "cas", "busy", "cleared"]) {
    const { c, tools, state, stored, keys } = setup();
    const plan = await tools.execute("propose_entries", { entries: [expenseEntry({ reimbursement: 20 })] });
    const before = JSON.stringify(c.transactions);
    if (mutation === "memory") c.transactions[0].memo = "가상 다른 화면 수정";
    if (mutation === "stored") stored.get(keys.records)[0].memo = "가상 다른 탭 수정";
    if (mutation === "vault") c.BudgetCloud = { generation: () => "synthetic-other-vault" };
    if (mutation === "save") state.failSave = true;
    if (mutation === "cas") state.beforeSave = () => { stored.get(keys.records)[0].memo = "가상 저장 경합"; };
    if (mutation === "busy") state.busy = true;
    if (mutation === "cleared") tools.clearSession();
    await assert.rejects(tools.applyPlan(plan.planId), undefined, mutation);
    assert.equal(state.saves, 0); assert.equal(c.transactions.length, 1); assert.deepEqual(clone(c.reimbursements), {});
    if (mutation !== "memory") assert.equal(JSON.stringify(c.transactions), before);
  }
});

test("a stale proposal baseline or generated ID collision cannot silently drop new entries", async () => {
  const { c, tools, stored, keys } = setup();
  stored.get(keys.records)[0].amount = 150;
  await assert.rejects(tools.execute("propose_entries", { entries: [expenseEntry()] }), /저장된 기록과 화면/);
  stored.set(keys.records, clone(c.transactions));
  const build = c.buildManualTransaction;
  c.buildManualTransaction = (entry) => ({ ...build(entry), recordKey: "synthetic-collision", transactionId: "synthetic-collision" });
  await assert.rejects(tools.execute("propose_entries", { entries: [expenseEntry(), expenseEntry()] }), /식별자가 겹칩니다/);
  assert.equal(tools.getPlans().length, 0);
});

test("fifty reviewed entries save once and cannot be added again after a rendering failure", async () => {
  const { c, tools, state } = setup([]);
  const plan = await tools.execute("propose_entries", { entries: Array.from({ length: 50 }, (_, index) => expenseEntry({ merchant: `가상 추가 ${index}` })) });
  assert.equal(plan.addedCount, 50); assert.equal(plan.changes.length, 50);
  c.reclassify = () => { throw new Error("synthetic render failure"); };
  const applied = await tools.applyPlan(plan.planId);
  assert.equal(applied.addedCount, 50); assert.equal(c.transactions.length, 50); assert.equal(state.saves, 1);
  assert.match(applied.message, /화면을 새로/);
  await assert.rejects(tools.applyPlan(plan.planId)); assert.equal(c.transactions.length, 50);
});

test("bulk classification and reimbursement cleanup retains update counts and the fifty-record bound", async () => {
  const { c, tools } = setup(Array.from({ length: 50 }, (_, index) => row(`synthetic-bulk-${index}`, 100)));
  const entries = (await tools.execute("search_transactions", { limit: 100 })).items;
  const changes = entries.map((item) => ({ ref: item.ref, sector: "쇼핑", subcategory: "화장품", reimbursement: 20, memo: "가상 일괄 정리" }));
  await assert.rejects(tools.createPlan({ changes: [...changes, changes[0]] }), /50/);
  const plan = await tools.createPlan({ changes });
  assert.equal(plan.updatedCount, 50); assert.equal(plan.addedCount, 0);
  assert.ok(plan.changes.every((change) => change.operation === "update" && change.after.consumption === 80));
  const applied = await tools.applyPlan(plan.planId);
  assert.equal(applied.updatedCount, 50); assert.equal(applied.addedCount, 0);
  assert.ok(c.classified.every((item) => item.sector === "쇼핑" && item.subcategory === "화장품" && c.consumptionAmount(item) === 80));
});
