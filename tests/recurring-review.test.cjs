const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadContext() {
  const context = vm.createContext({ console });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "src/features/recurring/recurring-review-core.js"), "utf8"),
    context,
    { filename: "recurring-review-core.js" }
  );
  return context;
}

function fixed(id, amount, extra = {}) {
  return {
    id,
    recurringType: "expense",
    name: id,
    amount,
    dayOfMonth: 10,
    sector: "고정 주거비",
    subcategory: "월세",
    startMonth: "2026-01",
    endMonth: "",
    reviewStatus: "unknown",
    nextReviewDate: "",
    ...extra
  };
}

test("선택 월의 일반 고정 지출만 합산하고 대출과 일시중지는 제외한다", () => {
  const context = loadContext();
  const model = context.buildRecurringReviewModel([
    fixed("월세", 500000),
    fixed("종료 항목", 100000, { endMonth: "2026-07" }),
    fixed("일시중지", 200000, { paused: true }),
    fixed("대출", 900000, { recurringType: "loan" })
  ], "2026-08", 3000000, { incomeKnown: true });

  assert.equal(model.items.length, 1);
  assert.equal(model.monthlyTotal, 500000);
  assert.equal(model.incomeRatio, 500000 / 3000000 * 100);
});

test("연간 예상은 선택 월부터 12개월 동안 시작·종료 월을 반영한다", () => {
  const context = loadContext();
  const model = context.buildRecurringReviewModel([
    fixed("계속", 100000),
    fixed("연말 종료", 50000, { endMonth: "2026-12" }),
    fixed("내년 시작", 30000, { startMonth: "2027-01" })
  ], "2026-09", 0);

  assert.equal(model.monthlyTotal, 150000);
  assert.equal(model.annualTotal, 100000 * 12 + 50000 * 4 + 30000 * 8);
  assert.equal(model.incomeRatio, null);
});

test("미확인·변경 검토·도래한 재점검일만 점검 후보로 계산한다", () => {
  const context = loadContext();
  const model = context.buildRecurringReviewModel([
    fixed("미확인", 10000),
    fixed("검토", 20000, { reviewStatus: "review" }),
    fixed("유지", 30000, { reviewStatus: "keep" }),
    fixed("재점검", 40000, { reviewStatus: "keep", nextReviewDate: "2026-08-15" }),
    fixed("나중에", 50000, { reviewStatus: "keep", nextReviewDate: "2026-10-01" })
  ], "2026-08", 0);

  assert.equal(model.candidateCount, 3);
  assert.equal(model.candidateAmount, 70000);
  assert.deepEqual(Array.from(model.candidates, (item) => item.review.key), ["review", "due", "unknown"]);
});

test("보험과 통신·구독, 주거 항목을 읽기 쉬운 그룹으로 묶는다", () => {
  const context = loadContext();
  const model = context.buildRecurringReviewModel([
    fixed("실손보험", 70000, { subcategory: "보험료" }),
    fixed("휴대폰", 55000, { sector: "생활비", subcategory: "통신비" }),
    fixed("월세", 500000)
  ], "2026-08", 0);

  assert.deepEqual(new Set(Array.from(model.groups, (group) => group.label)), new Set(["보험", "통신·구독", "주거"]));
  assert.equal(model.insuranceCandidateCount, 1);
});

test("알 수 없는 점검 상태는 미확인으로 정규화한다", () => {
  const context = loadContext();
  assert.equal(context.normalizeRecurringReviewStatus("keep"), "keep");
  assert.equal(context.normalizeRecurringReviewStatus("review"), "review");
  assert.equal(context.normalizeRecurringReviewStatus("삭제"), "unknown");
});
