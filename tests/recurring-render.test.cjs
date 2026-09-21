const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  const events = [];
  const alerts = [];
  const context = vm.createContext({
    transactions: [], classified: [], recurringExpenses: [], rules: [], reimbursements: {},
    selectedCalendarMonth: "2026-09", categories: { "고정 주거비": ["월세", "대출이자"] },
    normalizeFoodOccasion: () => "", normalizeRecurringExpense: (item) => ({ ...item }),
    normalizeCategoryAssignment: (sector, subcategory) => ({ sector, subcategory }),
    buildSmartSuggestionModel: () => ({}),
    isValidMonthKey: (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    isCanceled: (value) => Boolean(value),
    saveTransactions: async () => { events.push("save"); return true; },
    saveRules: async () => true,
    createAutoSnapshot: async () => ({}),
    safeSave: async () => { events.push("save"); return true; }, safeSaveMany: async () => true,
    renderAll: () => events.push("render"),
    alert: (message) => alerts.push(message), confirm: () => true, prompt: () => null,
    formatWon: (value) => `${value}원`,
    RECORD_STORAGE_KEY: "records", REIMBURSEMENT_STORAGE_KEY: "reimbursements",
    els: { recurringMonthFilter: { value: "2026-09" }, loanPaymentDialog: { open: true } }
  });
  for (const file of ["src/utils/date.js", "src/utils/normalize.js", "src/features/calendar/calendar-view.js",
    "src/features/recurring/recurring-view.js", "src/features/classification/classifier.js",
    "src/features/transactions/transactions-view.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  context.defaultDateForMonth = () => "2026-09-16";
  context.currentMonthKey = () => "2026-09";
  context.closeLoanPaymentDialog = () => { events.push("close"); context.els.loanPaymentDialog.open = false; };
  return { c: context, events, alerts, renders: () => events.filter((event) => event === "render").length };
}

function recurring(id, extra = {}) {
  return {
    id, name: id, recurringType: "expense", amountMode: "fixed", amount: 50000,
    dayOfMonth: 16, startMonth: "2026-09", endMonth: "", paused: false, autoPost: false,
    sector: "고정 주거비", subcategory: "월세", paymentType: "이체", ...extra
  };
}

function imported(id, extra = {}) {
  return {
    recordKey: id, transactionId: id, sourceType: "transfer", flow: "expense",
    approvalDate: "2026-09-16", month: "2026-09", merchant: "합성 출금", amount: 50000,
    manualSector: "고정 주거비", manualSubcategory: "월세", ...extra
  };
}

test("고정 지출 수동 반영은 저장 후 한 번만 렌더하고 중복 요청은 렌더하지 않는다", async () => {
  const { c, events, renders } = setup();
  c.recurringExpenses = [recurring("rent")];
  assert.equal((await c.postRecurringExpense("rent", "2026-09", { silent: true })).added, 1);
  assert.deepEqual(events, ["save", "render"]);
  assert.equal((await c.postRecurringExpense("rent", "2026-09", { silent: true })).added, 0);
  assert.equal(renders(), 1);
});

test("가져온 고정 지출 연결은 재분류 렌더 한 번으로 완료된다", async () => {
  const { c, renders } = setup();
  c.recurringExpenses = [recurring("rent")];
  c.transactions = [imported("actual")];
  assert.equal(await c.linkRecurringImportedTransaction("rent", "2026-09", "actual"), true);
  assert.equal(renders(), 1);
});

test("고정 지출 저장 실패는 추가 렌더를 발생시키지 않는다", async () => {
  const { c, renders } = setup();
  c.recurringExpenses = [recurring("rent")];
  c.saveTransactions = async () => false;
  assert.equal((await c.postRecurringExpense("rent", "2026-09", { silent: true })).saveFailed, true);
  c.transactions = [imported("actual")];
  c.safeSave = async () => false;
  assert.equal(await c.linkRecurringImportedTransaction("rent", "2026-09", "actual"), false);
  assert.equal(renders(), 0);
});

test("대출 상환 저장은 재분류 렌더 한 번과 대화상자 닫기 한 번으로 완료된다", async () => {
  const { c, events, renders } = setup();
  c.recurringExpenses = [recurring("loan", {
    recurringType: "loan", loanOpeningBalance: 100000, loanPrincipalAmount: 10000,
    loanInterestAmount: 1000, loanSupportEnabled: false
  })];
  const value = (value) => ({ value });
  Object.assign(c.els, {
    loanPaymentRecordKey: value(""), loanPaymentRecurringId: value("loan"), loanPaymentMonth: value("2026-09"),
    loanPaymentPrincipal: value("10000"), loanPaymentInterest: value("1000"), loanPaymentExpenseTransactionId: value("")
  });
  c.loanAvailablePrincipal = () => 100000;
  c.loanPaidSupportPrincipal = () => 0;
  c.loanPersonalRemainingPrincipal = () => 100000;
  await c.handleLoanPaymentSubmit({ preventDefault() {} });
  assert.equal(c.transactions.length, 1);
  assert.equal(renders(), 1);
  assert.deepEqual(events, ["save", "render", "close"]);
});

for (const linked of [false, true]) {
  test(`대출 ${linked ? "출금 연결 해제" : "상환 삭제"}는 한 번만 렌더한다`, async () => {
    const { c, events, renders } = setup();
    c.transactions = [imported("loan-record", {
      recurringId: "loan", recurringType: "loan", loanLinkedExisting: linked,
      loanLinkedOriginalSector: "고정 주거비", loanLinkedOriginalSubcategory: "월세", loanLinkedOriginalMemo: "원본"
    })];
    c.els.loanPaymentRecordKey = { value: "loan-record" };
    await c.deleteLoanPayment();
    assert.equal(renders(), 1);
    assert.equal(events.filter((event) => event === "close").length, 1);
    assert.equal(c.transactions.length, linked ? 1 : 0);
  });
}

function setupLoan(mode = "create") {
  const fixture = setup();
  const c = fixture.c;
  const item = recurring("loan", {
    recurringType: "loan", loanOpeningBalance: 100000, loanPrincipalAmount: 10000,
    loanInterestAmount: 1000, loanSupportEnabled: false
  });
  c.recurringExpenses = [item];
  c.loanAvailablePrincipal = () => 100000;
  c.loanPaidSupportPrincipal = () => 0;
  c.loanPersonalRemainingPrincipal = () => 100000;
  c.reimbursementFor = () => 0;
  c.transactions = [imported("unrelated", { amount: 7000 })];
  let recordKey = "";
  let expenseId = "";
  if (mode === "edit") {
    const record = c.buildRecurringTransaction(item, "2026-09", { loanPrincipalAmount: 8000, loanInterestAmount: 1000 });
    c.transactions.push(record);
    recordKey = record.recordKey;
  } else if (mode === "link" || mode === "linked-edit") {
    const record = imported("bank-loan", { amount: 11000 });
    if (mode === "linked-edit") Object.assign(record, {
      recurringId: "loan", recurringType: "loan", loanLinkedExisting: true,
      loanPrincipalAmount: 10000, loanInterestAmount: 1000,
      loanLinkedOriginalSector: "고정 주거비", loanLinkedOriginalSubcategory: "월세", loanLinkedOriginalMemo: "원본"
    });
    c.transactions.push(record);
    if (mode === "linked-edit") recordKey = record.recordKey;
    else expenseId = record.transactionId;
  }
  const value = (value) => ({ value });
  Object.assign(c.els, {
    loanPaymentRecordKey: value(recordKey), loanPaymentRecurringId: value("loan"), loanPaymentMonth: value("2026-09"),
    loanPaymentPrincipal: value("10000"), loanPaymentInterest: value("1000"), loanPaymentExpenseTransactionId: value(expenseId)
  });
  return fixture;
}

for (const mode of ["create", "edit", "link", "linked-edit"]) {
  test(`대출 ${mode} 저장 실패는 원본·입력·대화상자를 유지하고 재시도 성공 후만 반영한다`, async () => {
    const { c, renders } = setupLoan(mode);
    const original = c.transactions;
    const originalJson = JSON.stringify(original);
    const formBefore = JSON.stringify(c.els);
    let draft;
    c.safeSave = async (key, records, options) => {
      assert.equal(key, "records");
      assert.equal(options.protectIncomeRecords, true);
      assert.equal(c.transactions, original);
      draft = records;
      return false;
    };
    await c.handleLoanPaymentSubmit({ preventDefault() {} });
    assert.ok(draft);
    assert.equal(c.transactions, original);
    assert.equal(JSON.stringify(original), originalJson);
    assert.equal(JSON.stringify(c.els), formBefore);
    assert.equal(renders(), 0);
    c.safeSave = async () => true;
    await c.handleLoanPaymentSubmit({ preventDefault() {} });
    assert.notEqual(c.transactions, original);
    assert.equal(c.transactions.length, mode === "create" ? original.length + 1 : original.length);
    assert.deepEqual(c.normalizeStoredTransaction(c.transactions.find((record) => record.transactionId === "unrelated")),
      c.normalizeStoredTransaction(original[0]));
    const loan = c.transactions.find((record) => record.recurringId === "loan");
    assert.equal(loan.loanPrincipalAmount, 10000);
    if (mode === "link" || mode === "linked-edit") {
      assert.equal(loan.transactionId, "bank-loan");
      assert.equal(loan.recordKey, "bank-loan");
      assert.equal(loan.amount, 11000);
    }
    assert.equal(c.els.loanPaymentDialog.open, false);
    assert.equal(renders(), 1);
  });
}

test("대출 저장 대기 중에는 원본을 유지하고 중복 저장·삭제 요청을 시작하지 않는다", async () => {
  const { c, renders } = setupLoan("edit");
  const original = c.transactions;
  let finish;
  let entered;
  let writes = 0;
  const started = new Promise((resolve) => { entered = resolve; });
  c.safeSave = () => { writes++; entered(); return new Promise((resolve) => { finish = resolve; }); };
  const pending = c.handleLoanPaymentSubmit({ preventDefault() {} });
  await started;
  assert.equal(c.transactions, original);
  assert.equal(c.els.loanPaymentDialog.open, true);
  await c.handleLoanPaymentSubmit({ preventDefault() {} });
  await c.deleteLoanPayment();
  assert.equal(writes, 1);
  assert.equal(renders(), 0);
  finish(true);
  await pending;
  assert.equal(renders(), 1);
  assert.equal(c.els.loanPaymentDialog.open, false);
});

for (const action of ["submit", "unlink"]) {
  test(`대출 ${action} 저장 예외에도 원본을 보존하고 제출 잠금을 해제한다`, async () => {
    const { c, renders } = setupLoan(action === "unlink" ? "linked-edit" : "edit");
    const original = c.transactions;
    const originalJson = JSON.stringify(original);
    const formBefore = JSON.stringify(c.els);
    c.safeSave = async () => { throw new Error("storage unavailable"); };
    const run = () => action === "submit" ? c.handleLoanPaymentSubmit({ preventDefault() {} }) : c.deleteLoanPayment();
    await assert.rejects(run(), /storage unavailable/);
    assert.equal(c.transactions, original);
    assert.equal(JSON.stringify(original), originalJson);
    assert.equal(JSON.stringify(c.els), formBefore);
    assert.equal(renders(), 0);
    c.safeSave = async () => true;
    await run();
    assert.equal(c.els.loanPaymentDialog.open, false);
    assert.equal(renders(), 1);
  });
}

for (const mode of ["edit", "linked-edit"]) {
  test(`대출 ${mode} 삭제 실패는 원본과 대화상자를 보존하고 성공한 재시도만 닫는다`, async () => {
    const { c, renders } = setupLoan(mode);
    const original = c.transactions;
    const originalJson = JSON.stringify(original);
    const formBefore = JSON.stringify(c.els);
    c.safeSave = async () => false;
    c.safeSaveMany = async () => false;
    await c.deleteLoanPayment();
    assert.equal(c.transactions, original);
    assert.equal(JSON.stringify(original), originalJson);
    assert.equal(JSON.stringify(c.els), formBefore);
    assert.equal(renders(), 0);
    c.safeSave = async () => true;
    c.safeSaveMany = async () => true;
    await c.deleteLoanPayment();
    assert.equal(c.els.loanPaymentDialog.open, false);
    assert.equal(renders(), 1);
    assert.equal(c.transactions.length, mode === "edit" ? original.length - 1 : original.length);
    if (mode === "linked-edit") {
      const unlinked = c.transactions.find((record) => record.transactionId === "bank-loan");
      assert.equal(unlinked.recurringId, "");
      assert.equal(unlinked.amount, 11000);
      assert.equal(unlinked.manualSubcategory, "월세");
      assert.equal(unlinked.memo, "원본");
    }
  });
}

for (const action of ["submit", "delete", "unlink"]) {
  test(`대출 ${action} 백업 실패는 저장·화면 종료 없이 재시도를 허용한다`, async () => {
    const { c, alerts, renders } = setupLoan(action === "unlink" ? "linked-edit" : "edit");
    const original = c.transactions;
    let writes = 0;
    c.safeSave = c.safeSaveMany = async () => { writes++; return true; };
    c.createAutoSnapshot = async () => { throw new Error("snapshot failed"); };
    const run = () => action === "submit" ? c.handleLoanPaymentSubmit({ preventDefault() {} }) : c.deleteLoanPayment();
    await run();
    assert.equal(writes, 0);
    assert.equal(c.transactions, original);
    assert.equal(c.els.loanPaymentDialog.open, true);
    assert.equal(renders(), 0);
    assert.match(alerts[0], /백업/);
    c.createAutoSnapshot = async () => ({});
    await run();
    assert.equal(writes, 1);
    assert.equal(c.els.loanPaymentDialog.open, false);
  });

  test(`대출 ${action} 저장 후 렌더 오류는 저장 실패로 보고하지 않는다`, async () => {
    const { c, alerts } = setupLoan(action === "unlink" ? "linked-edit" : "edit");
    const original = c.transactions;
    c.reclassify = () => { throw new Error("render failed"); };
    if (action === "submit") await c.handleLoanPaymentSubmit({ preventDefault() {} });
    else await c.deleteLoanPayment();
    assert.notEqual(c.transactions, original);
    assert.equal(c.els.loanPaymentDialog.open, false);
    assert.match(alerts.at(-1), /저장됐지만 화면/);
  });
}
