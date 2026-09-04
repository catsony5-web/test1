const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({
  console,
  structuredClone,
  categories: {
    "고정 주거비": ["대출이자"],
    "저축": ["적금/예금"],
    "수입": ["이체입금"],
    "미분류": ["확인 필요"]
  },
  appSettings: { analysis: { consumptionTypes: {} } },
  classified: [],
  transactions: [],
  monthlyIncome: {},
  recurringExpenses: [],
  reimbursements: {},
  focusedMonthlyMonth: ""
});

function load(relativePath) {
  vm.runInContext(fs.readFileSync(path.join(root, relativePath), "utf8"), context, { filename: relativePath });
}

load("src/utils/date.js");
load("src/utils/food-occasion.js");
load("src/utils/normalize.js");
vm.runInContext(`
  function toNumber(value) {
    const number = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }
  function isCanceled(value) {
    return String(value || "").includes("취소") || String(value || "").includes("제외");
  }
  function reimbursementFor(item) {
    return Math.min(Number(item?.amount || 0), Math.max(0, Number(reimbursements[item?.recordKey] || 0)));
  }
  function actualAmount(item) {
    return Math.max(0, Number(item?.amount || 0) - reimbursementFor(item));
  }
  function sumActual(items) {
    return items.reduce((total, item) => total + actualAmount(item), 0);
  }
  function sumReimbursements(items) {
    return items.reduce((total, item) => total + reimbursementFor(item), 0);
  }
  function importedIncomeForMonth(month) {
    return classified
      .filter((item) => item.flow === "income" && item.month === month)
      .reduce((total, item) => total + incomeReportingAmount(item), 0);
  }
  function scheduledTotalForMonth() { return 0; }
  function scheduledPersonalTotalForMonth() { return 0; }
`, context);
load("src/utils/grouping.js");
load("src/features/monthly/monthly-chart.js");
load("src/features/monthly/monthly-flow.js");
load("src/features/analysis/analysis-core.js");

function normalizedRecord(values, classification = {}) {
  return { ...context.normalizeStoredTransaction(values), ...classification };
}

function installSettlementScenario(receivedMonth) {
  const supportIncomeId = `support-income-${receivedMonth}`;
  const loan = normalizedRecord({
    sourceType: "recurring",
    flow: "expense",
    approvalDate: "2040-01-25",
    month: "2040-01",
    merchant: "공유 대출",
    amount: 120000,
    recurringId: "loan-plan",
    recurringType: "loan",
    loanPrincipalAmount: 100000,
    loanInterestAmount: 20000,
    loanSupportPrincipalAmount: 75000,
    loanSupportInterestAmount: 15000,
    loanSupportReceivedAmount: 90000,
    loanSupportReceivedDate: `${receivedMonth}-05`,
    loanSupportIncomeTransactionId: supportIncomeId,
    recordKey: "loan-payment-2040-01",
    transactionId: "loan-payment-id"
  }, { sector: "고정 주거비", subcategory: "대출이자", status: "분류완료" });
  const januaryIncome = normalizedRecord({
    sourceType: "manual",
    flow: "income",
    approvalDate: "2040-01-05",
    month: "2040-01",
    merchant: "1월 입금",
    amount: receivedMonth === "2040-01" ? 1090000 : 1000000,
    recordKey: "income-2040-01",
    transactionId: receivedMonth === "2040-01" ? supportIncomeId : "salary-2040-01"
  }, { sector: "수입", subcategory: "이체입금", status: "분류완료" });
  const februaryIncome = normalizedRecord({
    sourceType: "manual",
    flow: "income",
    approvalDate: "2040-02-05",
    month: "2040-02",
    merchant: "2월 입금",
    amount: receivedMonth === "2040-02" ? 590000 : 500000,
    recordKey: "income-2040-02",
    transactionId: receivedMonth === "2040-02" ? supportIncomeId : "salary-2040-02"
  }, { sector: "수입", subcategory: "이체입금", status: "분류완료" });

  context.transactions = [loan, januaryIncome, februaryIncome];
  context.classified = [loan, januaryIncome, februaryIncome];
  return { loan, januaryIncome, februaryIncome };
}

const delayed = installSettlementScenario("2040-02");
assert.equal(context.loanGrossPrincipalAmount(delayed.loan), 100000);
assert.equal(context.loanGrossInterestAmount(delayed.loan), 20000);
assert.equal(context.loanPrincipalActualAmount(delayed.loan), 25000);
assert.equal(context.loanInterestActualAmount(delayed.loan), 5000);
assert.equal(context.loanSupportDueAmount(delayed.loan), 90000);
assert.equal(context.incomeReportingAmount(delayed.februaryIncome), 500000);

const delayedJanuary = context.buildAnalysisMonthSnapshot("2040-01");
const delayedFebruary = context.buildAnalysisMonthSnapshot("2040-02");
assert.equal(delayedJanuary.loanSettlementDelta, -90000);
assert.equal(delayedJanuary.freeBalance, 880000);
assert.equal(delayedJanuary.assetFormation, 995000);
assert.equal(delayedFebruary.loanSettlementDelta, 90000);
assert.equal(delayedFebruary.freeBalance, 590000);
assert.equal(delayedFebruary.assetFormation, 500000);

const sameMonth = installSettlementScenario("2040-01");
const sameJanuary = context.buildAnalysisMonthSnapshot("2040-01");
const sameFebruary = context.buildAnalysisMonthSnapshot("2040-02");
assert.equal(sameJanuary.loanSettlementDelta, 0);
assert.equal(sameJanuary.freeBalance, 970000);
assert.equal(sameFebruary.freeBalance, 500000);
assert.equal(
  delayedJanuary.assetFormation + delayedFebruary.assetFormation,
  sameJanuary.assetFormation + sameFebruary.assetFormation,
  "가족 입금 시점은 자산 형성 합계를 바꾸면 안 됩니다."
);

const shortfallAllocation = context.monthlyIncomeAllocation(delayedJanuary);
const receiptAllocation = context.monthlyIncomeAllocation(delayedFebruary);
assert.equal(shortfallAllocation.settlement, 90000);
assert.equal(shortfallAllocation.free, delayedJanuary.freeBalance);
assert.equal(receiptAllocation.settlement, 0);
assert.equal(receiptAllocation.free, delayedFebruary.freeBalance);
assert.ok(Math.abs(
  shortfallAllocation.consumptionRatio
  + shortfallAllocation.savingsRatio
  + shortfallAllocation.debtRatio
  + shortfallAllocation.settlementRatio
  + shortfallAllocation.freeRatio
  - 1
) < 1e-9, "월별 자금 배분 비율 합계는 100%여야 합니다.");

const editedIncome = normalizedRecord({
  sourceType: "manual",
  flow: "income",
  approvalDate: "2040-03-02",
  month: "2040-03",
  merchant: "날짜 수정 입금",
  amount: 100000,
  recordKey: "edited-income-key",
  transactionId: "stable-income-id"
});
const originalIncome = normalizedRecord({
  ...editedIncome,
  approvalDate: "2040-03-01",
  recordKey: "original-income-key",
  transactionId: "stable-income-id"
});
const importMerge = context.mergeTransactions([editedIncome], [originalIncome]);
assert.equal(importMerge.records.length, 1);
assert.equal(importMerge.skipped, 1);

load("src/features/recurring/recurring-view.js");
context.recurringExpenses = [{
  id: "loan-plan",
  recurringType: "loan",
  loanOpeningBalance: 1000000,
  loanSupportEnabled: true,
  loanSupportOpeningBalance: 750000
}];
assert.equal(context.loanRemainingPrincipal(context.recurringExpenses[0], "2040-01"), 900000);
assert.equal(context.loanSupportRemainingPrincipal(context.recurringExpenses[0], "2040-01"), 675000);
assert.equal(context.loanPersonalRemainingPrincipal(context.recurringExpenses[0], "2040-01"), 225000);
assert.ok(context.findPostedRecurringTransaction("loan-plan", "2040-01"));
assert.equal(
  context.findPostedRecurringTransaction("loan-plan", "2040-01", { excludeRecordKey: sameMonth.loan.recordKey }),
  undefined,
  "수정 중인 레코드를 제외하면 동일 대출·동일 월 중복이 없어야 합니다."
);

const normalExpense = normalizedRecord({
  flow: "expense",
  approvalDate: "2040-04-10",
  month: "2040-04",
  merchant: "일반 출금",
  amount: 30000,
  recordKey: "normal-expense"
});
const installmentExpense = normalizedRecord({
  flow: "expense",
  approvalDate: "2040-04-10",
  month: "2040-04",
  merchant: "할부 출금",
  amount: 30000,
  installmentEnabled: true,
  installmentMonths: 3,
  recordKey: "installment-expense"
});
const bulkExpense = normalizedRecord({
  flow: "expense",
  approvalDate: "2040-04-10",
  month: "2040-04",
  merchant: "과거 일괄 출금",
  amount: 30000,
  sourceFile: "과거 거래 일괄 입력",
  recordKey: "bulk-expense"
});
context.transactions = [normalExpense, installmentExpense, bulkExpense];
assert.deepEqual(
  Array.from(context.loanPaymentExpenseCandidates("2040-04"), (item) => item.recordKey),
  ["normal-expense"]
);

load("src/utils/backup.js");
let restored = context.mergeTransactionsByRestoreSignature([editedIncome], [originalIncome]);
restored = context.mergeTransactionsByRestoreSignature(restored, [originalIncome]);
assert.equal(restored.length, 1, "같은 안정 ID의 백업을 반복 병합해도 거래가 늘면 안 됩니다.");

console.log("Loan sharing accounting/link regression checks passed.");
