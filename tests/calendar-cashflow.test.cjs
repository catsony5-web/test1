const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(rows = [], definitions = [], settings = {}) {
  const cardBilling = { startDay: 1, endDay: 31, paymentDay: 25, weekendRule: "none", ...settings };
  const context = vm.createContext({
    classified: rows,
    transactions: rows,
    recurringExpenses: definitions,
    reimbursements: {},
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || "")),
    appSettings: { cardBilling },
    defaultAppSettings: () => ({ cardBilling })
  });
  for (const file of [
    "src/data/categories.js", "src/utils/date.js", "src/utils/food-occasion.js",
    "src/utils/normalize.js", "src/utils/grouping.js", "src/utils/storage.js",
    "src/components/chips.js", "src/features/board/board-view.js",
    "src/features/recurring/recurring-view.js", "src/features/calendar/calendar-view.js",
    "src/features/calendar/calendar-cashflow.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  return context;
}

function transaction(key, amount, extra = {}) {
  const approvalDate = extra.approvalDate || "2026-09-15";
  return {
    recordKey: key, transactionId: key, merchant: key, amount, approvalDate,
    month: approvalDate.slice(0, 7), sourceType: "transfer", flow: "expense",
    sector: "식비", subcategory: "장보기/마트", status: "분류완료", ...extra
  };
}

function insurance(id, amount, extra = {}) {
  return {
    id, name: id, amount, recurringType: "expense", paymentType: "이체",
    sector: "고정 주거비", subcategory: "보험료", dayOfMonth: 20,
    startMonth: "2026-09", endMonth: "", paused: false, showOnCalendar: true,
    autoPost: false, amountMode: "fixed", ...extra
  };
}

function loan(id, principal, interest, extra = {}) {
  return insurance(id, principal + interest, {
    recurringType: "loan", loanType: "신용대출", subcategory: "대출이자",
    loanOpeningBalance: 1000000, loanPrincipalAmount: principal, loanInterestAmount: interest,
    ...extra
  });
}

test("카드·보험·신용대출 출금은 정산 전 총액이며 소비 회계와 저장 자료를 바꾸지 않는다", () => {
  const rows = [
    transaction("card", 1250000, { sourceType: "card" }),
    transaction("insurance", 100000, { subcategory: "보험료" }),
    transaction("loan", 550000, {
      recurringType: "loan", loanType: "신용대출", loanPrincipalAmount: 500000, loanInterestAmount: 50000,
      loanSupportPrincipalAmount: 200000, loanSupportInterestAmount: 20000, loanSupportReceivedAmount: 220000
    }),
    transaction("rent", 600000, { subcategory: "월세" }),
    transaction("savings", 700000, { subcategory: "적금/예금" })
  ];
  const c = setup(rows);
  c.reimbursements = { card: 200000, insurance: 20000 };
  const before = JSON.stringify({ rows, reimbursements: c.reimbursements });
  const billing = c.buildCalendarCardBillingModel("2026-09");
  const model = c.buildCalendarCashOutflowModel("2026-09", billing);
  assert.equal(model.billing, billing);
  assert.equal(model.cardAmount, 1250000);
  assert.equal(model.insuranceAmount, 100000);
  assert.equal(model.loanAmount, 550000);
  assert.equal(model.expectedAmount, 1900000);
  assert.equal(c.sumConsumption(rows.slice(0, 3)), 1160000);
  assert.equal(c.sumDebtPrincipal(rows), 300000);
  assert.equal(JSON.stringify({ rows, reimbursements: c.reimbursements }), before);
});

test("연결된 카드 보험·대출은 한 번만 합산하고 실제 납부액이 등록 기본액을 대체한다", () => {
  const rows = [
    transaction("linked-insurance", 60000, {
      sourceType: "card", recurringId: "insurance", recurringLinkedExisting: true, subcategory: "보험료"
    }),
    transaction("linked-loan", 330000, {
      sourceType: "card", recurringId: "loan", loanLinkedExisting: true,
      recurringType: "loan", loanType: "신용대출", loanPrincipalAmount: 300000, loanInterestAmount: 30000
    }),
    transaction("posted-insurance", 90000, {
      sourceType: "recurring", recurringId: "posted", subcategory: "보험료"
    })
  ];
  const c = setup(rows, [
    insurance("insurance", 50000, { paymentType: "카드" }),
    loan("loan", 500000, 50000, { paymentType: "카드" }),
    insurance("posted", 80000, { paymentType: "카드" }),
    insurance("pending", 70000, { paymentType: "카드" })
  ]);
  const model = c.buildCalendarCashOutflowModel("2026-09");
  assert.equal(model.cardAmount, 550000);
  assert.equal(model.insuranceAmount, 0);
  assert.equal(model.loanAmount, 0);
  assert.equal(model.cardRows.length, 4);
  assert.equal(model.cardRows.filter((row) => row.scheduled).length, 1);
  assert.ok(model.cardRows.every((row) => row.outflowDate === "2026-09-25"));
  assert.equal(model.duplicateWarnings.length, 0);
});

test("달력에서 숨긴 예정은 포함하되 삭제·일시중지·기간 밖 예정은 제외하고 마지막 원금을 제한한다", () => {
  const rows = [
    transaction("deleted-payment", 90000, {
      sourceType: "recurring", recurringId: "deleted", subcategory: "보험료", cancel: "취소", status: "취소/제외"
    }),
    transaction("previous-loan", 70000, {
      approvalDate: "2026-08-20", recurringId: "loan", recurringType: "loan",
      loanType: "신용대출", loanPrincipalAmount: 70000
    })
  ];
  const c = setup(rows, [
    insurance("hidden", 70000, { showOnCalendar: false }),
    insurance("deleted", 90000),
    insurance("paused", 100000, { paused: true }),
    insurance("future", 110000, { startMonth: "2026-10" }),
    insurance("expired", 120000, { startMonth: "2026-08", endMonth: "2026-08" }),
    loan("loan", 50000, 5000, { startMonth: "2026-08", loanOpeningBalance: 100000, showOnCalendar: false })
  ]);
  const model = c.buildCalendarCashOutflowModel("2026-09");
  assert.equal(model.insuranceAmount, 70000);
  assert.equal(model.loanAmount, 35000);
  assert.equal(model.expectedAmount, 105000);
  assert.equal(model.loanRows[0].loanPrincipalAmount, 30000);
  assert.ok([...model.insuranceRows, ...model.loanRows].every((row) => row.scheduled));
});

test("중지·삭제된 정의의 실제 보험은 유지하고 연결 분류와 신용대출 유형만 정확히 사용한다", () => {
  const rows = [
    transaction("paused-actual", 100, { recurringId: "paused", subcategory: "보험료" }),
    transaction("removed-actual", 200, { recurringId: "removed", subcategory: "보험" }),
    transaction("linked-category", 300, { recurringId: "classified-by-definition" }),
    transaction("loan-fallback", 400, { recurringId: "credit", recurringType: "loan", loanPrincipalAmount: 350 }),
    transaction("mortgage", 500, { recurringType: "loan", loanType: "주택담보대출", loanPrincipalAmount: 450 }),
    transaction("unknown-loan", 600, { recurringType: "loan", loanPrincipalAmount: 550 }),
    transaction("보험이라는 상호의 식사", 700)
  ];
  const c = setup(rows, [
    insurance("paused", 9999, { paused: true }),
    insurance("classified-by-definition", 9999), loan("credit", 9999, 999)
  ]);
  const model = c.buildCalendarCashOutflowModel("2026-09");
  assert.equal(model.insuranceAmount, 600);
  assert.equal(model.loanAmount, 400);
  assert.equal(model.expectedAmount, 1000);
});

test("취소·제외·수입은 별도 출금에서 제외하고 음수 카드 조정액은 그대로 반영한다", () => {
  const c = setup([
    transaction("card", 100000, { sourceType: "card" }),
    transaction("card-adjustment", -20000, { sourceType: "card" }),
    transaction("canceled-insurance", 300000, { subcategory: "보험료", cancel: "취소", status: "취소/제외" }),
    transaction("excluded-insurance", 400000, { subcategory: "보험료", status: "취소/제외" }),
    transaction("insurance-income", 500000, { subcategory: "보험료", flow: "income" }),
    transaction("canceled-loan", 600000, { recurringType: "loan", loanType: "신용대출", cancel: "취소", status: "취소/제외" })
  ]);
  const model = c.buildCalendarCashOutflowModel("2026-09");
  assert.equal(model.cardAmount, 80000);
  assert.equal(model.insuranceRows.length, 0);
  assert.equal(model.loanRows.length, 0);
  assert.equal(model.expectedAmount, 80000);
});

test("카드 보충은 연도를 넘는 청구기간 양끝을 포함하고 별도 보험은 선택월 날짜를 따른다", () => {
  const rows = [
    transaction("before", 99999, { approvalDate: "2025-12-13", sourceType: "card" }),
    transaction("start", 10000, { approvalDate: "2025-12-14", sourceType: "card" }),
    transaction("end", 20000, { approvalDate: "2026-01-13", sourceType: "card" }),
    transaction("after-insurance", 99999, { approvalDate: "2026-01-14", sourceType: "card", subcategory: "보험료" }),
    transaction("cash-current", 30000, { approvalDate: "2026-01-14", subcategory: "보험료" }),
    transaction("cash-previous", 99999, { approvalDate: "2025-12-20", subcategory: "보험료" })
  ];
  const c = setup(rows, [
    insurance("card-start", 40000, { paymentType: "카드", startMonth: "2025-12", dayOfMonth: 14 }),
    insurance("card-end", 50000, { paymentType: "카드", startMonth: "2026-01", dayOfMonth: 13 })
  ], { startDay: 14, endDay: 13, paymentDay: 25, weekendRule: "next-monday" });
  const model = c.buildCalendarCashOutflowModel("2026-01");
  assert.equal(model.cardAmount, 120000);
  assert.equal(model.insuranceAmount, 30000);
  assert.equal(model.expectedAmount, 150000);
  assert.ok(model.cardRows.every((row) => row.outflowDate === "2026-01-26"));
  assert.deepEqual(Array.from(model.cardRows.filter((row) => row.scheduled), (row) => row.approvalDate).sort(), ["2025-12-14", "2026-01-13"]);
});

test("주말 월말 카드값은 다음 달 실제 결제일로 옮기고 한 달에 두 청구서가 출금될 수 있다", () => {
  const rows = [
    transaction("january", 100, { approvalDate: "2026-01-15", sourceType: "card" }),
    transaction("february", 200, { approvalDate: "2026-02-15", sourceType: "card" }),
    transaction("march", 300, { approvalDate: "2026-03-15", sourceType: "card" })
  ];
  const c = setup(rows, [insurance("card-insurance", 50, { startMonth: "2026-01", paymentType: "카드" })], {
    paymentDay: 31, weekendRule: "next-monday"
  });
  const january = c.buildCalendarCashOutflowModel("2026-01");
  assert.equal(january.cardAmount, 0);
  const february = c.buildCalendarCashOutflowModel("2026-02");
  assert.equal(february.cardAmount, 150);
  assert.deepEqual(Array.from(february.billings, (billing) => billing.billingMonth), ["2026-01"]);
  assert.ok(february.cardRows.every((row) => row.outflowDate === "2026-02-02"));
  const march = c.buildCalendarCashOutflowModel("2026-03");
  assert.equal(march.cardAmount, 600);
  assert.deepEqual(Array.from(march.billings, (billing) => billing.paymentDate), ["2026-03-02", "2026-03-31"]);
});

test("미연결 동액 후보는 자동 차감하지 않고 확인할 거래를 경고하며 자료를 변경하지 않는다", () => {
  const rows = [
    transaction("unlinked-card", 70000, { sourceType: "card", merchant: "다른 가맹점" }),
    transaction("unlinked-transfer", 330000, { merchant: "은행 출금" })
  ];
  const definitions = [insurance("insurance", 70000), loan("loan", 300000, 30000)];
  const before = JSON.stringify({ rows, definitions });
  const c = setup(rows, definitions);
  const model = c.buildCalendarCashOutflowModel("2026-09");
  assert.equal(model.expectedAmount, 470000);
  assert.deepEqual(Array.from(model.duplicateWarnings, (warning) => [warning.name, ...warning.recordKeys]), [
    ["insurance", "unlinked-card"], ["loan", "unlinked-transfer"]
  ]);
  assert.equal(JSON.stringify({ rows, definitions }), before);
});

test("연결된 실제 이체는 카드 기본설정보다 우선하고 다른 종류의 대출 예정은 더하지 않는다", () => {
  const c = setup([
    transaction("actual-transfer", 80000, {
      recurringId: "insurance", recurringLinkedExisting: true, subcategory: "보험료"
    })
  ], [
    insurance("insurance", 90000, { paymentType: "카드" }),
    loan("mortgage", 300000, 30000, { loanType: "주택담보대출" }),
    loan("student", 200000, 20000, { loanType: "학자금대출" })
  ]);
  const model = c.buildCalendarCashOutflowModel("2026-09");
  assert.equal(model.cardAmount, 0);
  assert.equal(model.insuranceAmount, 80000);
  assert.equal(model.loanAmount, 0);
  assert.equal(model.insuranceRows[0].outflowDate, "2026-09-15");
  assert.equal(model.insuranceRows[0].scheduled, false);
});

test("카드 환급은 카드 보험 보충액과 상계한 뒤 청구서 출금액을 0원 이상으로 계산한다", () => {
  const c = setup([transaction("card-credit", -100000, { sourceType: "card" })], [
    insurance("card-insurance", 50000, { paymentType: "카드" }),
    insurance("cash-insurance", 70000)
  ]);
  const model = c.buildCalendarCashOutflowModel("2026-09");
  assert.equal(model.cardAmount, 0);
  assert.equal(model.insuranceAmount, 70000);
  assert.equal(model.expectedAmount, 70000);
});
