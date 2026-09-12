const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const copy = (value) => JSON.parse(JSON.stringify(value));
function setup() {
  const status = { textContent: "새 메모" };
  const retry = { hidden: true };
  const editor = { innerHTML: "합성 메모" };
  const card = { dataset: { calendarMemoMonth: "2026-09" } };
  const timers = new Map();
  let timerId = 0;
  let renderCount = 0;
  const savedMemos = [];
  const writes = [];
  const alerts = [];
  const context = vm.createContext({
    console, alert: (message) => alerts.push(message),
    els: { calendarMonthlyMemo: { innerHTML: "", querySelector: (selector) => ({
      "[data-calendar-memo-status]": status, "[data-calendar-memo-editor]": editor,
      "[data-calendar-memo-retry]": retry, "[data-calendar-memo-card]": card
    })[selector] } },
    calendarMemos: {}, calendarMemoSaveTimer: null, selectedCalendarMonth: "2026-09",
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || ""),
    normalizeCalendarMemo: (memo) => ({ html: "", paper: "yellow", ...memo }),
    sanitizeCalendarMemoHtml: (html) => html,
    saveCalendarMemos: async () => { savedMemos.push(copy(context.calendarMemos)); return true; },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    escapeHtml: (value) => String(value),
    transactions: [{ recordKey: "old", amount: 100, month: "2026-09", merchant: "합성 상점", approvalDate: "2026-09-01" }],
    reimbursements: { old: 20 }, recurringExpenses: [],
    RECORD_STORAGE_KEY: "records", REIMBURSEMENT_STORAGE_KEY: "reimbursements",
    normalizeStoredTransaction: (value) => ({ ...value }),
    normalizeCategoryAssignment: (sector, subcategory) => ({ sector, subcategory }),
    normalizeInputDate: (value) => value, setSharedSelectedMonth() {},
    createAutoSnapshot: async () => ({}),
    safeSaveMany: async (entries) => { writes.push(copy(entries)); return true; },
    calendarEditingRecordKey: "old", calendarEditFeedback: null,
    reclassify: () => { renderCount += 1; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/features/calendar/calendar-view.js"), "utf8"), context);
  context.attachCalendarMemoHandlers = () => {};
  context.calendarClassifiedItem = (key) => context.transactions.find((item) => item.recordKey === key);
  context.calendarTransactionIndex = (key) => context.transactions.findIndex((item) => item.recordKey === key);
  const flush = () => {
    const [id, callback] = [...timers.entries()].at(-1);
    timers.delete(id);
    return callback();
  };
  return { context, status, retry, editor, card, savedMemos, writes, alerts, flush, renders: () => renderCount };
}

test("메모 저장 실패는 입력을 유지하며 재시도 후에만 자동 저장 완료를 표시한다", async () => {
  const { context: c, status, retry, editor, flush } = setup();
  c.saveCalendarMemos = async () => false;
  c.scheduleCalendarMemoSave("2026-09");
  await flush();
  assert.equal(status.textContent, "저장 실패");
  assert.equal(retry.hidden, false);
  assert.equal(c.calendarMemos["2026-09"].html, editor.innerHTML);
  c.renderCalendarMonthlyMemo("2026-09");
  assert.match(c.els.calendarMonthlyMemo.innerHTML, />저장 실패<\/span>/);
  c.saveCalendarMemos = async () => true;
  c.scheduleCalendarMemoSave("2026-09", { immediate: true });
  await flush();
  assert.equal(status.textContent, "자동 저장됨");
  assert.equal(retry.hidden, true);
});

test("메모 저장 중 새 입력이 생기면 오래된 완료 응답이 최신 저장 상태를 바꾸지 않는다", async () => {
  const { context: c, status, editor, flush } = setup();
  let resolveFirst;
  c.saveCalendarMemos = () => new Promise((resolve) => { resolveFirst = resolve; });
  c.scheduleCalendarMemoSave("2026-09");
  const firstSave = flush();
  editor.innerHTML = "새 합성 메모";
  c.scheduleCalendarMemoSave("2026-09");
  resolveFirst(true);
  await firstSave;
  assert.equal(status.textContent, "저장 중");
  c.saveCalendarMemos = async () => true;
  await flush();
  assert.equal(status.textContent, "자동 저장됨");
  assert.equal(c.calendarMemos["2026-09"].html, "새 합성 메모");
});

test("월 이동 후 이전 메모 저장 응답은 새 월의 표시를 바꾸지 않는다", async () => {
  const { context: c, status, card, flush } = setup();
  c.scheduleCalendarMemoSave("2026-09");
  card.dataset.calendarMemoMonth = "2026-10";
  status.textContent = "새 메모";
  await flush();
  assert.equal(status.textContent, "새 메모");
});

test("예외가 난 메모 저장도 저장 실패와 재시도 상태를 제공한다", async () => {
  const { context: c, status, retry, flush } = setup();
  c.saveCalendarMemos = async () => { throw new Error("unavailable"); };
  c.scheduleCalendarMemoSave("2026-09");
  await flush();
  assert.equal(status.textContent, "저장 실패");
  assert.equal(retry.hidden, false);
});

test("달력 삭제 저장 실패는 거래·정산금·편집 상태를 유지한다", async () => {
  const { context: c, renders } = setup();
  c.safeSaveMany = async () => false;
  await c.deleteCalendarTransactions(["old"]);
  assert.equal(c.transactions.length, 1);
  assert.equal(c.reimbursements.old, 20);
  assert.equal(c.calendarEditingRecordKey, "old");
  assert.equal(c.calendarEditFeedback, null);
  assert.equal(renders(), 0);
});

test("달력 삭제는 거래·정산금을 함께 저장한 뒤 성공 상태를 표시한다", async () => {
  const { context: c, writes, renders } = setup();
  await c.deleteCalendarTransactions(["old"]);
  assert.deepEqual(writes[0].map((entry) => entry.key), ["records", "reimbursements"]);
  assert.equal(c.transactions.length, 0);
  assert.equal(c.reimbursements.old, undefined);
  assert.equal(c.calendarEditFeedback.type, "success");
  assert.equal(renders(), 1);
});

test("달력 추천 분류는 저장 성공 전 원본을 바꾸지 않는다", async () => {
  const { context: c, renders } = setup();
  c.safeSaveMany = async () => false;
  await c.applyCalendarSuggestion("old", "식비", "장보기/마트");
  assert.equal(c.transactions[0].manualSector, undefined);
  assert.equal(c.calendarEditingRecordKey, "old");
  assert.equal(c.calendarEditFeedback, null);
  assert.equal(renders(), 0);
  c.safeSaveMany = async () => true;
  await c.applyCalendarSuggestion("old", "식비", "장보기/마트");
  assert.equal(c.transactions[0].manualSector, "식비");
  assert.equal(c.calendarEditFeedback.type, "success");
});

test("달력 삭제·분류 전 백업 실패는 변경을 시작하지 않는다", async () => {
  const { context: c, writes, alerts } = setup();
  c.createAutoSnapshot = async () => { throw new Error("snapshot failed"); };
  await c.deleteCalendarTransactions(["old"]);
  await c.applyCalendarSuggestion("old", "식비", "장보기/마트");
  assert.equal(writes.length, 0);
  assert.equal(c.transactions.length, 1);
  assert.equal(c.transactions[0].manualSector, undefined);
  assert.equal(alerts.length, 2);
});
