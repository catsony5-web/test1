const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  let today = "2026-09-16";
  const NativeDate = Date;
  class ClockDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [`${today}T12:00:00`])); }
    static now() { return new NativeDate(`${today}T12:00:00`).getTime(); }
  }
  const alerts = [];
  const writes = [];
  const context = vm.createContext({
    Date: ClockDate,
    recurringExpenses: [], transactions: [], selectedCalendarMonth: "2026-09",
    categories: { "고정 주거비": ["월세", "대출이자"] },
    normalizeFoodOccasion: () => "",
    normalizeRecurringExpense: (item) => ({ ...item }),
    isCanceled: (value) => Boolean(value),
    saveRecurringExpenses: async () => { writes.push("recurring"); },
    saveTransactions: async () => { writes.push("transactions"); },
    createAutoSnapshot: async () => {}, reclassify() {}, renderAll() {},
    alert: (value) => alerts.push(value), confirm: () => false, prompt: () => null,
    formatWon: (value) => `${value}원`,
    els: { recurringMonthFilter: { value: "2026-09" } }
  });
  for (const filename of ["src/utils/date.js", "src/utils/normalize.js", "src/features/recurring/recurring-view.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", filename), "utf8"), context, { filename });
  }
  return { c: context, alerts, writes, setToday: (value) => { today = value; } };
}

function fixed(id, extra = {}) {
  return {
    id, name: id, recurringType: "expense", amountMode: "fixed", amount: 50000,
    dayOfMonth: 16, startMonth: "2026-09", endMonth: "", paused: false,
    autoPost: true, autoPostStartDate: "2026-09-01", showOnCalendar: true,
    sector: "고정 주거비", subcategory: "월세", paymentType: "이체", ...extra
  };
}

test("자동 기록은 활성화 이후 도래한 날짜만 포함하고 미래 월 지정도 오늘에서 제한한다", async () => {
  const { c } = setup();
  c.recurringExpenses = [
    fixed("past", { startMonth: "2026-08", autoPostStartDate: "2026-08-01", dayOfMonth: 10 }),
    fixed("today"), fixed("future-day", { dayOfMonth: 17 }),
    fixed("future-month", { startMonth: "2026-10" }),
    fixed("variable", { amountMode: "variable" }), fixed("loan", { recurringType: "loan" })
  ];
  await c.ensureAutoPostedRecurringExpenses({ throughMonth: "2026-12" });
  assert.deepEqual(Array.from(c.transactions, (record) => [record.recurringId, record.approvalDate]), [
    ["past", "2026-08-10"], ["past", "2026-09-10"], ["today", "2026-09-16"]
  ]);
  assert.ok(c.transactions.every((record) => record.recurringPostMethod === "auto"));
  assert.equal((await c.ensureAutoPostedRecurringExpenses()).added, 0);
  assert.equal(c.transactions.length, 3);
});

test("기존 자동 항목에 시작 기준이 없으면 오늘부터 적용하며 과거 월을 소급 생성하지 않는다", async () => {
  const { c, writes } = setup();
  c.recurringExpenses = [fixed("legacy", { startMonth: "2026-01", dayOfMonth: 10, autoPostStartDate: "" })];
  await c.ensureAutoPostedRecurringExpenses();
  assert.equal(c.recurringExpenses[0].autoPostStartDate, "2026-09-16");
  assert.equal(c.transactions.length, 0);
  assert.deepEqual(writes, ["recurring"]);
  assert.equal(c.recurringPostingStatus(c.recurringExpenses[0], "2026-09").canManualPost, true);
});

test("월말일을 넘는 예정일은 해당 월 마지막 날에만 기록된다", async () => {
  const { c, setToday } = setup();
  c.recurringExpenses = [fixed("month-end", { dayOfMonth: 31, startMonth: "2028-02", autoPostStartDate: "2028-02-01" })];
  setToday("2028-02-28");
  await c.ensureAutoPostedRecurringExpenses();
  assert.equal(c.transactions.length, 0);
  setToday("2028-02-29");
  await c.ensureAutoPostedRecurringExpenses();
  assert.equal(c.transactions[0].approvalDate, "2028-02-29");
});

test("일시중지·재개는 과거 기록을 유지하며 중지 중 지난 예정일을 소급 생성하지 않는다", async () => {
  const { c, setToday } = setup();
  c.recurringExpenses = [fixed("rent", { dayOfMonth: 10 })];
  await c.ensureAutoPostedRecurringExpenses();
  const history = JSON.stringify(c.transactions[0]);
  await c.toggleRecurringPaused("rent");
  setToday("2026-10-20");
  await c.ensureAutoPostedRecurringExpenses();
  assert.equal(c.transactions.length, 1);
  await c.toggleRecurringPaused("rent");
  assert.equal(c.recurringExpenses[0].autoPostStartDate, "2026-10-20");
  assert.equal(c.transactions.length, 1);
  setToday("2026-11-10");
  await c.ensureAutoPostedRecurringExpenses();
  assert.equal(c.transactions.length, 2);
  assert.equal(JSON.stringify(c.transactions[0]), history);
  assert.equal(c.transactions[1].month, "2026-11");
});

test("템플릿 수정은 이미 기록한 금액·이름·분류·메모·기간 밖 거래를 바꾸거나 지우지 않는다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("rent")];
  await c.ensureAutoPostedRecurringExpenses();
  const history = JSON.stringify(c.transactions);
  const value = (text) => ({ value: text });
  Object.assign(c.els, {
    recurringId: value("rent"), recurringName: value("변경된 월세"), recurringAmount: value("70000"),
    recurringDay: value("25"), recurringStartMonth: value("2026-10"), recurringEndMonth: value("2026-12"),
    recurringSector: value("고정 주거비"), recurringSubcategory: value("월세"), recurringPaymentType: value("현금"),
    recurringMemo: value("수정한 예정 메모"), recurringAmountMode: value("fixed"),
    recurringAutoPost: { checked: true }, recurringShowOnCalendar: { checked: true }
  });
  c.resetRecurringForm = () => {};
  await c.handleRecurringSubmit({ preventDefault() {} });
  assert.equal(c.recurringExpenses[0].amount, 70000);
  assert.equal(c.recurringExpenses[0].autoPostStartDate, "2026-09-16");
  assert.equal(JSON.stringify(c.transactions), history);
});

test("대출 기본값 수정도 이미 확인한 월별 상환액과 분담 내역을 보존한다", async () => {
  const { c } = setup();
  const item = fixed("loan", {
    recurringType: "loan", autoPost: false, loanOpeningBalance: 100000,
    loanPrincipalAmount: 10000, loanInterestAmount: 1000, loanSupportEnabled: false
  });
  c.recurringExpenses = [item];
  c.transactions = [c.buildRecurringTransaction(item, "2026-09")];
  c.loanSupportPrincipalAmount = (record) => Number(record.loanSupportPrincipalAmount || 0);
  const history = JSON.stringify(c.transactions);
  const value = (text) => ({ value: text });
  Object.assign(c.els, {
    loanId: value("loan"), loanName: value("변경된 대출명"), loanOpeningBalance: value("100000"),
    loanPrincipalAmount: value("12000"), loanInterestAmount: value("2000"), loanDay: value("20"),
    loanStartMonth: value("2026-09"), loanMaturityMonth: value("2027-12"), loanType: value("신용대출"),
    loanPaymentType: value("이체"), loanMemo: value("변경 메모"), loanInterestRate: value("4"),
    loanSupportEnabled: { checked: false }, loanShowOnCalendar: { checked: true }
  });
  c.resetLoanForm = () => {};
  c.setRecurringTab = () => {};
  await c.handleLoanSubmit({ preventDefault() {} });
  assert.equal(c.recurringExpenses[0].loanInterestAmount, 2000);
  assert.equal(JSON.stringify(c.transactions), history);
});

test("자동 기록 표시 방식은 템플릿의 현재 설정이 아니라 기록 생성 방식을 따른다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("rent")];
  await c.ensureAutoPostedRecurringExpenses();
  c.recurringExpenses[0].autoPost = false;
  const status = c.recurringPostingStatus(c.recurringExpenses[0], "2026-09");
  assert.match(status.label, /자동 기록.*출금 미확인/);
  assert.equal(c.recurringPostingStatus(fixed("future", { dayOfMonth: 20 }), "2026-09").canManualPost, false);
});

test("삭제한 월별 거래를 자동·수동으로 부활시키지 않는다", async () => {
  const { c } = setup();
  const item = fixed("rent");
  c.recurringExpenses = [item];
  c.transactions = [{ ...c.buildRecurringTransaction(item, "2026-09"), cancel: "삭제" }];
  assert.equal((await c.ensureAutoPostedRecurringExpenses()).added, 0);
  assert.equal((await c.postRecurringExpense(item.id, "2026-09", { silent: true })).added, 0);
  assert.equal(c.transactions.length, 1);
});

test("가져온 출금 후보는 자동 보류만 하며 수입이나 취소 내역을 연결하지 않는다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("rent")];
  c.transactions = [
    { sourceType: "transfer", flow: "expense", approvalDate: "2026-09-15", merchant: "다른 지출명", amount: 50000, recordKey: "potential" },
    { sourceType: "transfer", flow: "income", approvalDate: "2026-09-15", merchant: "rent", amount: 50000, recordKey: "income" },
    { sourceType: "card", flow: "expense", approvalDate: "2026-09-15", merchant: "rent", amount: 50000, recordKey: "canceled", cancel: "취소" }
  ];
  assert.equal(c.recurringImportCandidates(c.recurringExpenses[0], "2026-09").length, 1);
  assert.equal((await c.ensureAutoPostedRecurringExpenses()).added, 0);
  assert.match(c.recurringPostingStatus(c.recurringExpenses[0], "2026-09").label, /중복 확인 필요/);
  assert.equal((await c.postRecurringExpense("rent", "2026-09")).added, 0);
  assert.equal(c.transactions.length, 3);
  assert.ok(c.transactions.every((record) => !record.recurringId));
});

test("변동액은 실제 금액 입력 후 수동 기록하며 미래·중지 항목은 반영하지 않는다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("variable", { amountMode: "variable", autoPost: false }), fixed("future", { dayOfMonth: 20 }), fixed("paused", { paused: true })];
  c.prompt = () => "42,000";
  const result = await c.postRecurringExpense("variable", "2026-09");
  assert.equal(result.added, 1);
  assert.equal(c.transactions[0].amount, 42000);
  assert.equal(c.transactions[0].recurringPostMethod, "manual");
  assert.equal((await c.postRecurringExpense("future", "2026-09", { silent: true })).added, 0);
  assert.equal((await c.postRecurringExpense("paused", "2026-09", { silent: true })).added, 0);
  assert.equal(c.transactions.length, 1);
});

test("변동액으로 바꾸면 자동 기록 선택을 해제하고 정액으로 돌아와도 자동 활성화하지 않는다", () => {
  const { c } = setup();
  c.els.recurringAmountMode = { value: "variable" };
  c.els.recurringAutoPost = { checked: true };
  c.syncRecurringAutoPostFields();
  assert.equal(c.els.recurringAutoPost.checked, false);
  assert.equal(c.els.recurringAutoPost.disabled, true);
  c.els.recurringAmountMode.value = "fixed";
  c.els.recurringAmountMode.onchange();
  assert.equal(c.els.recurringAutoPost.disabled, false);
  assert.equal(c.els.recurringAutoPost.checked, false);
});

test("활성화 기준 또는 거래 저장 실패 시 메모리 상태와 생성 건수를 되돌린다", async () => {
  const { c } = setup();
  const expenses = [fixed("rent", { autoPostStartDate: "" })];
  c.recurringExpenses = expenses;
  c.saveRecurringExpenses = async () => false;
  let result = await c.ensureAutoPostedRecurringExpenses();
  assert.equal(result.saveFailed, true);
  assert.equal(c.recurringExpenses, expenses);
  assert.equal(c.transactions.length, 0);
  await c.toggleRecurringPaused("rent");
  assert.equal(c.recurringExpenses, expenses);
  assert.equal(c.recurringExpenses[0].paused, false);

  c.recurringExpenses = [fixed("rent")];
  c.saveTransactions = async () => false;
  const transactions = c.transactions;
  result = await c.ensureAutoPostedRecurringExpenses();
  assert.equal(result.added, 0);
  assert.equal(result.saveFailed, true);
  assert.equal(c.transactions, transactions);
  result = await c.postRecurringExpense("rent", "2026-09", { silent: true });
  assert.equal(result.added, 0);
  assert.equal(result.saveFailed, true);
  assert.equal(c.transactions, transactions);
});

function imported(id, extra = {}) {
  return {
    recordKey: id, transactionId: id, sourceType: "transfer", flow: "expense",
    approvalDate: "2026-09-16", month: "2026-09", merchant: "은행 출금명", amount: 49000,
    manualSector: "생활비", manualSubcategory: "기타", memo: "원본 메모", sourceFile: "거래내역.xlsx", ...extra
  };
}

test("명시적으로 선택한 가져온 출금을 연결하며 금액·날짜·분류·식별자는 보존한다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("rent", { autoPost: false })];
  c.transactions = [imported("actual"), imported("unrelated", { amount: 7000 })];
  c.confirm = () => true;
  c.RECORD_STORAGE_KEY = "records";
  const commits = [];
  c.safeSave = async (key, records, options) => { commits.push({ key, records, options }); return true; };
  assert.equal(await c.linkRecurringImportedTransaction("rent", "2026-09", "actual"), true);
  assert.equal(c.transactions.length, 2);
  const linked = c.transactions.find((record) => record.transactionId === "actual");
  for (const key of ["recordKey", "transactionId", "sourceType", "approvalDate", "amount", "manualSector", "manualSubcategory", "memo", "sourceFile"]) {
    assert.equal(linked[key], imported("actual")[key]);
  }
  assert.equal(linked.recurringId, "rent");
  assert.equal(linked.recurringLinkedExisting, true);
  assert.equal(c.recurringPostingStatus(c.recurringExpenses[0], "2026-09").label, "가져온 출금 연결됨");
  assert.equal(commits[0].key, "records");
  assert.equal(commits[0].options.protectIncomeRecords, true);
  assert.equal((await c.ensureAutoPostedRecurringExpenses()).added, 0);
});

test("자동 기록 후 나중에 가져온 출금은 선택·확인 후 자동 기록을 대체해 한 건만 남긴다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("rent")];
  await c.ensureAutoPostedRecurringExpenses();
  c.transactions.push(imported("actual"));
  c.confirm = () => true;
  c.RECORD_STORAGE_KEY = "records";
  c.safeSave = async () => true;
  assert.equal(await c.linkRecurringImportedTransaction("rent", "2026-09", "actual"), true);
  assert.equal(c.transactions.length, 1);
  assert.equal(c.transactions[0].transactionId, "actual");
  assert.equal(c.transactions[0].amount, 49000);
  assert.equal((await c.ensureAutoPostedRecurringExpenses()).added, 0);
  assert.equal(await c.linkRecurringImportedTransaction("rent", "2026-09", "actual"), false);
});

test("수입·취소·미래 출금은 연결 목록에서 제외하고 기존 수동 기록은 대체하지 않는다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("rent", { autoPost: false })];
  const manual = c.buildRecurringTransaction(c.recurringExpenses[0], "2026-09");
  c.transactions = [manual, imported("actual"), imported("income", { flow: "income" }),
    imported("canceled", { cancel: "취소" }), imported("future", { approvalDate: "2026-09-20" })];
  c.confirm = () => true;
  assert.deepEqual(Array.from(c.recurringLinkCandidates("2026-09"), (record) => record.transactionId), ["actual"]);
  const before = JSON.stringify(c.transactions);
  assert.equal(await c.linkRecurringImportedTransaction("rent", "2026-09", "actual"), false);
  assert.equal(JSON.stringify(c.transactions), before);
});

test("연결한 가져온 출금의 취소 표시는 자동 재생성을 막는다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("rent")];
  c.transactions = [imported("deleted-linked", { recurringId: "rent", recurringLinkedExisting: true, cancel: "삭제" })];
  assert.equal(c.isDeletedRecurringTombstone(c.transactions[0]), true);
  assert.ok(c.findDeletedRecurringTransaction("rent", "2026-09"));
  assert.equal((await c.ensureAutoPostedRecurringExpenses()).added, 0);
  assert.equal(c.transactions.length, 1);
});

test("가져온 출금 연결은 백업·저장에 성공한 뒤에만 메모리에 반영한다", async () => {
  const { c } = setup();
  c.recurringExpenses = [fixed("rent")];
  await c.ensureAutoPostedRecurringExpenses();
  c.transactions.push(imported("actual"));
  c.confirm = () => true;
  c.RECORD_STORAGE_KEY = "records";
  const before = c.transactions;
  c.createAutoSnapshot = async () => { throw new Error("backup failed"); };
  assert.equal(await c.linkRecurringImportedTransaction("rent", "2026-09", "actual"), false);
  assert.equal(c.transactions, before);

  c.createAutoSnapshot = async () => {};
  c.safeSave = async () => false;
  assert.equal(await c.linkRecurringImportedTransaction("rent", "2026-09", "actual"), false);
  assert.equal(c.transactions, before);

  let finishSave;
  let startedSave;
  const started = new Promise((resolve) => { startedSave = resolve; });
  c.safeSave = () => { startedSave(); return new Promise((resolve) => { finishSave = resolve; }); };
  const linking = c.linkRecurringImportedTransaction("rent", "2026-09", "actual");
  await started;
  assert.equal(c.transactions, before);
  finishSave(true);
  assert.equal(await linking, true);
  assert.equal(c.transactions.length, 1);
});
