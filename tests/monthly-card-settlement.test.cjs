const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContext(rows = [], reimbursements = {}) {
  const context = vm.createContext({
    transactions: rows, classified: rows, reimbursements,
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))
  });
  for (const file of [
    "src/utils/format.js", "src/utils/date.js", "src/utils/normalize.js",
    "src/components/chips.js", "src/features/board/board-view.js",
    "src/features/analysis/monthly-analysis-core.js"
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  return context;
}

function card(key, amount, extra = {}) {
  return {
    recordKey: key, transactionId: key, sourceType: "card", flow: "expense",
    cardNumber: "1111-****-****-2468", approvalDate: "2026-09-10", approvalTime: "12:00",
    month: "2026-09", merchant: `검증 ${key}`, approvalNo: key, amount, cancel: "-", ...extra
  };
}

function model(context, selectedCard = "card:1111********2468", month = "2026-09") {
  return context.buildMonthlyCardSettlementModel(month, selectedCard);
}

test("승인일·카드 기준 순사용액과 정산 목록은 중복 없이 같은 합계를 만든다", () => {
  // Entirely synthetic amounts; never copy statement totals into fixtures.
  const first = card("first", 1200);
  const rows = [first, { ...first }, card("second", 2300), card("third", 3400), card("other", 4500),
    card("cancel-1", -100, { cancel: "전체취소" }), card("cancel-2", -200, { cancel: "전체취소" }),
    card("cancel-3", -300, { cancel: "전체취소" }),
    card("other-card", 2500, { cardNumber: "2222-****-****-9999" }),
    card("other-month", 3000, { approvalDate: "2026-10-01" }),
    card("transfer", 4000, { sourceType: "transfer" }), card("income", 5000, { flow: "income" })];
  const reimbursements = { first: 400, third: 600, "other-card": 1000 };
  const before = JSON.stringify({ rows, reimbursements });
  const result = model(loadContext(rows, reimbursements));
  assert.equal(result.grossAmount, 11400);
  assert.equal(result.cancelAmount, 600);
  assert.equal(result.netAmount, 10800);
  assert.equal(result.reimbursementAmount, 1000);
  assert.equal(result.ownAmount, 9800);
  assert.equal(result.reimbursementAmount, result.settledRows.reduce((total, row) => total + row.reimbursement, 0));
  assert.equal(result.netAmount - result.reimbursementAmount, result.ownAmount);
  assert.equal(result.approvalCount, 4);
  assert.equal(result.cancelCount, 3);
  assert.equal(result.duplicateCount, 1);
  assert.equal(JSON.stringify({ rows, reimbursements }), before);
});

test("할부는 원승인액과 원거래 정산금을 한 번 반영하고 월배분 행을 제외한다", () => {
  const original = card("installment", 900000, {
    installmentEnabled: true, installmentMonths: 3, installmentOriginalAmount: 900000,
    installmentStartMonth: "2026-10", month: "2026-10"
  });
  const rows = [original,
    { ...original, recordKey: "installment::1", amount: 300000, isInstallmentOccurrence: true, installmentSourceRecordKey: "installment" },
    card("past", 100000, { approvalDate: "2026-08-31", month: "2026-09" })];
  const context = loadContext(rows, { installment: 600000 });
  const result = model(context);
  assert.equal(result.rows.length, 1);
  assert.equal(result.grossAmount, 900000);
  assert.equal(result.reimbursementAmount, 600000);
  assert.equal(result.ownAmount, 300000);
  assert.equal(model(context, undefined, "2026-10").grossAmount, 0);
});

test("카드 옵션은 모든 달에 유지되며 끝번호가 같아도 서로 합치지 않는다", () => {
  const rows = [card("a", 100), card("b", 200, { cardNumber: "2222-****-****-2468", approvalDate: "2026-08-20" }),
    card("unknown", 300, { cardNumber: "" }), card("legacy", 400, { sourceType: "", cardNumber: "3333-****-****-1234" }),
    card("not-card", 500, { sourceType: "cash", cardNumber: "" })];
  const context = loadContext(rows);
  const result = model(context, "card:2222********2468");
  assert.equal(result.selectedCard, "card:2222********2468");
  assert.equal(result.rows.length, 0);
  assert.equal(result.cards.length, 5);
  assert.equal(new Set(result.cards.map((option) => option.label)).size, 5);
  assert.ok(result.cards.every((option) => !option.label.includes("1111") && !option.label.includes("2222") && !option.label.includes("3333")));
  assert.equal(model(context, "unknown").netAmount, 300);
  assert.equal(model(context, "all").netAmount, 800);
  assert.equal(model(context, "missing").selectedCard, "all");
});

test("별도 취소는 음수로 차감하고 취소와 연결된 정산은 확인 경고를 남긴다", () => {
  const rows = [card("paid", 100000),
    card("refund", -100000, { approvalNo: "paid", merchant: "검증 paid", cancel: "전체취소" }),
    card("kept", 50000),
    card("other-refund", -50000, { cardNumber: "2222-****-****-9999", approvalNo: "kept", merchant: "검증 kept", cancel: "전체취소" })];
  const result = model(loadContext(rows, { paid: 60000, kept: 10000 }));
  assert.equal(result.grossAmount, 150000);
  assert.equal(result.cancelAmount, 100000);
  assert.equal(result.reimbursementAmount, 70000);
  assert.equal(result.ownAmount, -20000, "불일치를 0원으로 숨기지 않는다");
  assert.equal(result.warnings.find((warning) => warning.code === "reimbursement-on-canceled").count, 1);
  assert.equal(result.warnings.find((warning) => warning.code === "reimbursement-exceeds-net").amount, 20000);
  assert.equal(result.reimbursementRate, 140);
});

test("다음 달 취소와 양수 취소표시도 합계를 임의 보정하지 않고 경고로 알린다", () => {
  const rows = [card("paid", 100000),
    card("refund", -100000, { approvalDate: "2026-10-01", approvalNo: "paid", merchant: "검증 paid", cancel: "전체취소" }),
    card("flagged", 20000, { cancel: "전체취소", status: "취소/제외" })];
  const result = model(loadContext(rows, { paid: 50000 }));
  assert.equal(result.netAmount, 120000);
  assert.equal(result.ownAmount, 70000);
  assert.equal(result.warnings.find((warning) => warning.code === "reimbursement-on-canceled").amount, 50000);
  assert.equal(result.warnings.find((warning) => warning.code === "positive-cancellation").amount, 20000);
});

test("정산 상한 보정과 취소행 정산은 금액을 숨기지 않고 확인 정보를 반환한다", () => {
  const result = model(loadContext([card("paid", 100), card("refund", -200, { cancel: "전체취소" })], { paid: 150, refund: 50 }));
  assert.equal(result.reimbursementAmount, 100, "기존 reimbursementFor 상한을 따른다");
  assert.equal(result.reimbursementRate, null);
  assert.equal(result.ownAmount, -200);
  assert.equal(result.warnings.find((warning) => warning.code === "reimbursement-clamped").amount, 50);
  assert.equal(result.warnings.find((warning) => warning.code === "reimbursement-on-canceled").amount, 50);
});

test("동일 키라도 카드는 분리하고 같은 카드의 상충 중복은 경고한다", () => {
  const rows = [card("same", 100), card("same", 200), card("same", 300, { cardNumber: "2222-****-****-9999" })];
  const result = model(loadContext(rows), "all");
  assert.equal(result.netAmount, 400);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.warnings.find((warning) => warning.code === "conflicting-duplicate").count, 1);
});

test("없는 월·잘못된 날짜는 다른 달이나 미확인 거래로 대신 합산하지 않는다", () => {
  const context = loadContext([card("invalid-date", 100, { approvalDate: "2026-09-31" }), card("undated", 200, { approvalDate: "" })]);
  assert.equal(model(context).rows.length, 0);
  assert.equal(model(context).netAmount, 0);
  assert.equal(model(context).reimbursementRate, null);
  assert.equal(context.buildMonthlyCardSettlementModel("invalid"), null);
});
