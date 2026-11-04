const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContext(data = {}) {
  const context = vm.createContext({ transactions: [], recurringExpenses: [], familyAdjustments: [], ...data });
  for (const file of ["src/utils/date.js", "src/features/family/family-core.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  return context;
}

// These intentionally small values and labels are invented, not copied transactions.
function transaction(id, amount, date = "2040-01-10", extra = {}) {
  return {
    transactionId: id, recordKey: id, amount, approvalDate: date, month: date.slice(0, 7),
    merchant: `가상 항목 ${id}`, flow: "expense", sourceType: "transfer", cancel: "", ...extra
  };
}

function receipt(id, amount, date = "2040-01-10", extra = {}) {
  return transaction(id, amount, date, { flow: "income", incomeKind: "familySupport", ...extra });
}

function fixedExpense(extra = {}) {
  return {
    id: "fixed", recurringType: "expense", name: "가상 고정 지출", amount: 100,
    dayOfMonth: 20, startMonth: "2040-01", familyBurdenHistory: [{ fromMonth: "2040-01", amount: 100 }], ...extra
  };
}

function loanDefinition(extra = {}) {
  return {
    id: "loan", recurringType: "loan", name: "가상 대출", amount: 120,
    dayOfMonth: 20, startMonth: "2040-01", loanOpeningBalance: 1000,
    loanPrincipalAmount: 100, loanInterestAmount: 20,
    loanSupportEnabled: true, loanSupportOpeningBalance: 500,
    loanSupportPrincipalAmount: 50, loanSupportInterestAmount: 10, ...extra
  };
}

function loanPayment(id = "payment", date = "2040-01-20", extra = {}) {
  return transaction(id, 120, date, {
    recurringType: "loan", recurringId: "loan", loanPrincipalAmount: 100,
    loanInterestAmount: 20, loanSupportPrincipalAmount: 50, loanSupportInterestAmount: 10, ...extra
  });
}

function adjustment(id, amount, extra = {}) {
  return { id, date: "2040-01-25", amount, purpose: "other", memo: "가상 조정", ...extra };
}

test("분할 가족 입금을 합산하고 수입에서 원금액 전체를 제외한다", () => {
  const context = loadContext({
    transactions: [receipt("first", 70), receipt("second", 50), transaction("salary", 200, undefined, { flow: "income" })],
    recurringExpenses: [fixedExpense()]
  });
  const model = context.buildFamilySupportModel("2040-01");
  assert.equal(model.received, 120);
  assert.equal(model.need, 100);
  assert.equal(model.difference, 20);
  assert.equal(model.settlementBalance, 20);
  assert.equal(model.cashHeld, 120);
  assert.equal(model.repaymentReserve, 20);
  assert.equal(context.familySupportIncomeExcluded(context.transactions[0]), 70);
  assert.equal(context.familySupportIncomeExcluded(context.transactions[2]), 0);
});

test("실제 가족 부담 지출과 같은 달 예정 지출을 한번만 집계한다", () => {
  const context = loadContext({
    transactions: [receipt("incoming", 150), transaction("paid", 90, "2040-01-20", { recurringId: "fixed", familyBurdenAmount: 90 })],
    recurringExpenses: [fixedExpense()]
  });
  const model = context.buildFamilySupportModel("2040-01");
  assert.equal(model.need, 90);
  assert.equal(model.obligations.length, 1);
  assert.equal(model.obligations[0].posted, true);
  assert.equal(model.settlementBalance, 60);
  assert.equal(model.cashHeld, 60);
  assert.equal(context.familyExpenseBurden(context.transactions[1]), 90);
});

test("정산 대상월과 실제 입금월을 분리하고 미지급분은 자기 돈 선지출로 처리한다", () => {
  const context = loadContext({
    transactions: [
      receipt("late", 120, "2040-02-02", { familyTargetMonth: "2040-01" }),
      transaction("paid", 100, "2040-01-20", { familyBurdenAmount: 100 })
    ]
  });
  const january = context.buildFamilySupportModel("2040-01");
  assert.equal(january.received, 120);
  assert.equal(january.difference, 20);
  assert.equal(january.settlementBalance, 20);
  assert.equal(january.cashHeld, 0);
  assert.equal(january.cashBalance, -100);
  assert.equal(january.cashAdjustment, -100);
  assert.equal(january.cashReceipts.length, 0);
  assert.equal(january.monthReceipts.length, 1);
  const february = context.buildFamilySupportModel("2040-02");
  assert.equal(february.received, 0);
  assert.equal(february.cashHeld, 20);
  assert.equal(february.cashAdjustment, 100);
  assert.equal(february.cashReceipts.length, 1);
  assert.equal(february.settlementBalance, 20);
});

test("가족 부담 적용 시작월과 과거 실적 스냅샷을 보존한다", () => {
  const context = loadContext({
    recurringExpenses: [fixedExpense({ familyBurdenHistory: [{ fromMonth: "2040-02", amount: 100 }, { fromMonth: "2040-03", amount: 150 }] })],
    transactions: [transaction("past", 80, "2040-02-20", { recurringId: "fixed", familyBurdenAmount: 80 })]
  });
  assert.equal(context.buildFamilySupportModel("2040-01").need, 0);
  assert.equal(context.buildFamilySupportModel("2040-02").need, 80);
  assert.equal(context.buildFamilySupportModel("2040-03").need, 150);
  assert.equal(context.buildFamilySupportModel("2040-03").cumulativeNeed, 230);
  context.recurringExpenses[0].familyBurdenHistory.push({ fromMonth: "2040-04", amount: 0 });
  assert.equal(context.buildFamilySupportModel("2040-03").need, 150);
  assert.equal(context.buildFamilySupportModel("2040-04").need, 0);
  assert.equal(context.familyExpenseBurden(transaction("own", 80, "2040-02-20", { recurringId: "fixed", familyBurdenAmount: 0 })), 0);
});

test("기존 대출에 연결된 입금은 가족 지원으로 전환해도 한 번만 집계한다", () => {
  const original = receipt("incoming", 100, undefined, { incomeKind: "normal" });
  const context = loadContext({
    transactions: [original, loanPayment("payment", undefined, {
      loanSupportIncomeTransactionId: "incoming", loanSupportReceivedAmount: 60, loanSupportReceivedDate: original.approvalDate
    })]
  });
  assert.equal(context.familySupportIncomeExcluded(original), 60);
  assert.equal(context.buildFamilySupportModel("2040-01").received, 60);
  context.transactions[0] = { ...original, incomeKind: "familySupport" };
  const converted = context.buildFamilySupportModel("2040-01");
  assert.equal(converted.received, 100);
  assert.equal(converted.receipts.length, 1);
  assert.equal(converted.receipts[0].transactionId, "incoming");
  assert.equal(context.familySupportIncomeExcluded(context.transactions[0]), 100);
  assert.equal(converted.settlementBalance, 40);
});

test("분할 대출 연결액은 원래 수입 한도 내에서만 제외하고 미연결 과거 지원금도 보존한다", () => {
  const context = loadContext({ transactions: [
    receipt("normal", 100, undefined, { incomeKind: "normal" }),
    loanPayment("first", undefined, { loanSupportIncomeTransactionId: "normal", loanSupportReceivedAmount: 70 }),
    loanPayment("second", undefined, { loanSupportIncomeTransactionId: "normal", loanSupportReceivedAmount: 50 }),
    loanPayment("legacy", undefined, { loanSupportReceivedAmount: 20, loanSupportReceivedDate: "2040-01-01" })
  ] });
  const model = context.buildFamilySupportModel("2040-01");
  assert.equal(model.received, 120);
  assert.equal(model.receipts.length, 2);
  assert.equal(context.familySupportIncomeExcluded(context.transactions[0]), 100);
});

test("취소된 연결 입금을 과거 대출 지원금으로 다시 집계하지 않는다", () => {
  const context = loadContext({ transactions: [
    receipt("canceled", 100, undefined, { cancel: "취소" }),
    loanPayment("payment", undefined, { loanSupportIncomeTransactionId: "canceled", loanSupportReceivedAmount: 100 })
  ] });
  assert.equal(context.buildFamilySupportModel("2040-01").received, 0);
});

test("미연결 상환 조정은 보관하고 실제 상환 연결 시 정산과 현금에서 한 번씩만 차감한다", () => {
  const context = loadContext({
    transactions: [receipt("incoming", 150), loanPayment()],
    familyAdjustments: [adjustment("reserve-use", -30, { purpose: "loan_payment" })]
  });
  const pending = context.buildFamilySupportModel("2040-01");
  assert.equal(pending.adjustments[0].status, "pending");
  assert.equal(pending.settlementBalance, 90);
  assert.equal(pending.cashHeld, 90);
  context.familyAdjustments[0].linkedLoanTransactionId = "payment";
  const applied = context.buildFamilySupportModel("2040-01");
  assert.equal(applied.adjustments[0].status, "applied");
  assert.equal(applied.settlementBalance, 60);
  assert.equal(applied.cashHeld, 60);
  assert.equal(context.familyLoanReserveUsed(context.transactions[1]), 30);
  context.familyAdjustments.push({ ...context.familyAdjustments[0] });
  assert.equal(context.buildFamilySupportModel("2040-01").settlementBalance, 60);
  assert.equal(context.familyLoanReserveUsed(context.transactions[1]), 30);
});

test("대출 원금의 정기 가족 몫과 다른 연결 조정을 제외한 한도를 검증한다", () => {
  const context = loadContext({ transactions: [loanPayment()], familyAdjustments: [
    adjustment("a", -30, { purpose: "loan_payment", linkedLoanTransactionId: "payment" }),
    adjustment("b", -30, { purpose: "loan_payment", linkedLoanTransactionId: "payment" }),
    adjustment("c", -10, { purpose: "loan_payment", linkedLoanTransactionId: "missing" }),
    adjustment("d", 10, { purpose: "return" })
  ] });
  const model = context.buildFamilySupportModel("2040-01");
  assert.deepEqual(Array.from(model.adjustments, (item) => item.status), ["applied", "invalid", "invalid", "invalid"]);
  assert.equal(context.familyLoanReserveUsed(context.transactions[0]), 30);
  context.transactions[0].cancel = "취소";
  assert.equal(context.familyLoanReserveUsed(context.transactions[0]), 0);
  assert.equal(context.buildFamilySupportModel("2040-01").adjustments[0].status, "invalid");
});

test("상환에 연결한 조정은 조정 입력일과 달라도 실제 상환월에 한번만 적용한다", () => {
  const context = loadContext({ transactions: [receipt("incoming", 100), loanPayment()], familyAdjustments: [
    adjustment("linked", -20, { date: "2040-02-01", purpose: "loan_payment", linkedLoanTransactionId: "payment" })
  ] });
  const january = context.buildFamilySupportModel("2040-01");
  assert.equal(january.adjustments[0].effectiveDate, "2040-01-20");
  assert.equal(january.settlementBalance, 20);
  assert.equal(january.cashHeld, 20);
  assert.equal(context.buildFamilySupportModel("2040-02").settlementBalance, 20);
});

test("반환 및 기타 조정은 누적 차액에 반영하고 삭제하면 되돌아간다", () => {
  const context = loadContext({ transactions: [receipt("incoming", 100)], familyAdjustments: [
    adjustment("return", -20, { purpose: "return" }), adjustment("correction", 10)
  ] });
  assert.equal(context.buildFamilySupportModel("2040-01").settlementBalance, 90);
  assert.equal(context.buildFamilySupportModel("2040-01").cashHeld, 90);
  context.familyAdjustments = [];
  assert.equal(context.buildFamilySupportModel("2040-01").settlementBalance, 100);
});

test("선택월 누적액에 미래 입금·지출·조정을 섞지 않는다", () => {
  const context = loadContext({
    transactions: [receipt("now", 100), receipt("future", 200, "2040-02-01"), loanPayment("future-loan", "2040-02-20")],
    familyAdjustments: [adjustment("future", -20, { date: "2040-02-01", purpose: "return" })]
  });
  const model = context.buildFamilySupportModel("2040-01");
  assert.equal(model.settlementBalance, 100);
  assert.equal(model.cashHeld, 100);
  assert.equal(model.adjustmentTotal, 0);
  assert.equal(model.need, 0);
});

test("대출 예정액은 과거 분담 이력을 적용하고 미래 완납으로 과거 필요액이 없어지지 않는다", () => {
  const context = loadContext({
    recurringExpenses: [loanDefinition({ loanSupportHistory: [
      { fromMonth: "2040-01", principal: 30, interest: 10 },
      { fromMonth: "2040-02", principal: 50, interest: 10 }
    ] })],
    transactions: [loanPayment("future-payoff", "2040-03-20", { amount: 1020, loanPrincipalAmount: 1000, loanSupportPrincipalAmount: 500 })]
  });
  assert.equal(context.buildFamilySupportModel("2040-01").need, 40);
  assert.equal(context.buildFamilySupportModel("2040-02").need, 60);
  assert.equal(context.buildFamilySupportModel("2040-02").cumulativeNeed, 100);
  assert.equal(context.buildFamilySupportModel("2040-04").need, 0);
});

test("연결한 추가 상환은 다음 달 가족 잔여 원금에서 차감한다", () => {
  const context = loadContext({
    recurringExpenses: [loanDefinition({ loanSupportOpeningBalance: 100 })],
    transactions: [loanPayment()],
    familyAdjustments: [adjustment("extra", -30, { purpose: "loan_payment", linkedLoanTransactionId: "payment" })]
  });
  assert.equal(context.buildFamilySupportModel("2040-02").need, 30);
  assert.equal(context.buildFamilySupportModel("2040-01").need, 60);
});

test("가족 몫만 남은 대출의 예정 원금과 명시적인 분담 해제 이력을 구분한다", () => {
  const context = loadContext({ recurringExpenses: [loanDefinition({ loanOpeningBalance: 100, loanSupportOpeningBalance: 100 })] });
  assert.equal(context.buildFamilySupportModel("2040-01").need, 110);
  context.recurringExpenses[0].loanSupportHistory = [{ fromMonth: "2040-01", principal: 0, interest: 0 }];
  assert.equal(context.buildFamilySupportModel("2040-01").need, 0);
});

test("삭제된 자동 고정 지출은 예정액으로 다시 나타나지 않고 명시된 실적은 정의 삭제 후에도 남는다", () => {
  const context = loadContext({ recurringExpenses: [fixedExpense()], transactions: [
    transaction("deleted", 100, undefined, { recurringId: "fixed", sourceType: "recurring", cancel: "삭제" }),
    transaction("snapshot", 20, undefined, { recurringId: "removed-definition", familyBurdenAmount: 20 })
  ] });
  assert.equal(context.buildFamilySupportModel("2040-01").need, 20);
  assert.equal(context.buildFamilySupportModel("2040-01").cashBalance, -20);
});

test("전역 상태 없이 options만으로 계산하고 JSON 복원 후 잔액이 동일하다", () => {
  const context = loadContext();
  const data = {
    transactions: [receipt("incoming", 200, undefined, { cardNo: "2468" }), loanPayment()],
    recurringExpenses: [fixedExpense()],
    adjustments: [adjustment("linked", -20, { purpose: "loan_payment", linkedLoanTransactionId: "payment" })]
  };
  const before = context.buildFamilySupportModel("2040-01", data);
  const restored = JSON.parse(JSON.stringify(data));
  const after = context.buildFamilySupportModel("2040-01", restored);
  assert.equal(JSON.stringify(after), JSON.stringify(before));
  assert.equal(context.familySupportCashAdjustment("2040-01", restored), before.cashAdjustment);
  assert.equal(context.buildFamilySupportModel("2040-01").received, 0);
});

test("실제 월별 분석에서 가족 자금은 수입·저축률 분모·자유 잔액을 부풀리지 않는다", () => {
  const records = [
    transaction("salary", 200, undefined, { flow: "income" }),
    receipt("family", 150),
    transaction("family-expense", 100, undefined, { sector: "고정 주거비", subcategory: "보험료", familyBurdenAmount: 100 }),
    transaction("personal", 20, undefined, { sector: "식비", subcategory: "가상 식비" }),
    transaction("savings", 50, undefined, { sector: "저축", subcategory: "적금/예금" })
  ];
  const context = loadContext({ transactions: records, classified: records, reimbursements: {}, monthlyIncome: {}, categories: { 식비: [], 저축: [], 수입: [], "고정 주거비": [] } });
  for (const file of ["src/utils/grouping.js", "src/features/board/board-view.js", "src/features/analysis/analysis-core.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  const snapshot = context.buildAnalysisMonthSnapshot("2040-01");
  assert.equal(snapshot.income, 200);
  assert.equal(snapshot.consumptionSpend, 20);
  assert.equal(snapshot.actualSavings, 50);
  assert.equal(snapshot.actualSavings / snapshot.income, 0.25);
  assert.equal(snapshot.freeBalance, 130);
  assert.equal(context.buildFamilySupportModel("2040-01").cashHeld, 50);
  assert.equal(snapshot.assetFormationRate, 90);
});
