const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCalendarView() {
  const context = vm.createContext({ console });
  const source = fs.readFileSync(
    path.join(__dirname, "../src/features/calendar/calendar-view.js"),
    "utf8"
  );
  vm.runInContext(source, context, { filename: "src/features/calendar/calendar-view.js" });
  return context;
}

test("N빵 계산은 내 몫을 올림하고 나머지를 정산금으로 계산한다", () => {
  const context = loadCalendarView();
  const calculation = context.calendarSplitCalculation(31900, 3);

  assert.equal(calculation.people, 3);
  assert.equal(calculation.ownAmount, 10634);
  assert.equal(calculation.reimbursement, 21266);
  assert.equal(context.calendarSplitCalculation(31900, 1), null);
  assert.equal(context.calendarSplitCalculation(31900, 2.5), null);
  assert.equal(context.calendarSplitCalculation(-1, 3), null);
});

test("N빵 입력만으로 정산금을 바꾸지 않고 적용 버튼 동작만 값을 반영한다", () => {
  const context = loadCalendarView();
  const classes = new Set();
  const result = {
    textContent: "",
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };
  const applyButton = { disabled: true };
  const actualPreview = { value: "" };
  const form = {
    elements: {
      amount: { value: "31,900" },
      reimbursement: { value: "5,000" },
      splitPeople: { value: "3" }
    },
    querySelector(selector) {
      return {
        "[data-calendar-split-apply]": applyButton,
        "[data-calendar-split-result]": result,
        ".calendar-actual-preview": actualPreview
      }[selector] || null;
    }
  };
  context.toNumber = (value) => {
    const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  context.formatWon = (value) => `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;

  const preview = context.updateCalendarSplitPreview(form);
  assert.equal(preview.reimbursement, 21266);
  assert.equal(form.elements.reimbursement.value, "5,000");
  assert.equal(applyButton.disabled, false);
  assert.match(result.textContent, /내 몫 10,634원/);

  context.applyCalendarSplitCalculation(form);
  assert.equal(form.elements.reimbursement.value, "21,266");
  assert.equal(actualPreview.value, "10,634원");
  assert.equal(classes.has("applied"), true);
  assert.match(result.textContent, /^적용 완료/);
});

test("같은 거래를 다시 선택하면 편집을 닫고 다른 거래는 전환한다", () => {
  const context = loadCalendarView();
  let renderCount = 0;
  context.calendarEditingRecordKey = "record-a";
  context.calendarEditFeedback = { type: "success" };
  context.renderCalendar = () => {
    renderCount += 1;
  };

  context.toggleCalendarTransactionEditor("record-a");
  assert.equal(context.calendarEditingRecordKey, "");
  assert.equal(context.calendarEditFeedback, null);

  context.toggleCalendarTransactionEditor("record-b");
  assert.equal(context.calendarEditingRecordKey, "record-b");

  context.toggleCalendarTransactionEditor("");
  assert.equal(context.calendarEditingRecordKey, "record-b");
  assert.equal(renderCount, 2);
});

test("편집 폼은 저장되지 않는 총 인원 입력과 명시적 적용 버튼을 제공한다", () => {
  const context = loadCalendarView();
  Object.assign(context, {
    selectedCalendarDate: "2026-08-08",
    categories: { "식비": ["장보기/마트"] },
    normalizeInputDate: (value) => value,
    defaultDateForMonth: () => "2026-08-01",
    normalizeInputTime: (value) => value,
    normalizeCategoryAssignment: () => ({ sector: "식비", subcategory: "장보기/마트" }),
    reimbursementFor: () => 0,
    installmentMonths: () => 0,
    currentMonthKey: () => "2026-08",
    monthKey: () => "2026-08",
    formatWon: (value) => `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`,
    actualAmount: (item) => item.amount,
    escapeHtml: (value) => String(value ?? "")
  });

  const html = context.renderCalendarEditForm({
    recordKey: "record-a",
    approvalDate: "2026-08-08",
    approvalTime: "23:51",
    month: "2026-08",
    merchant: "쿠팡",
    amount: 31900,
    sector: "식비",
    subcategory: "장보기/마트"
  });

  assert.match(html, /name="splitPeople"/);
  assert.match(html, /data-calendar-split-apply disabled>정산금에 적용<\/button>/);
  assert.match(html, /적용 전에는 정산금이 바뀌지 않습니다/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /name="splitPeople"[^>]*value=/);
});
