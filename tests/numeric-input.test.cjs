const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const numeric = require("../src/utils/numeric-input.js");

function editingFixture(value = "2500000", kind = "money") {
  const listeners = new Map();
  const inputs = [];
  const received = [];
  class Event {
    constructor(type, options = {}) { Object.assign(this, { type, defaultPrevented: false }, options); }
    preventDefault() { this.defaultPrevented = true; }
    stopImmediatePropagation() { this.stopped = true; }
  }
  const doc = {
    defaultView: { InputEvent: Event }, body: {}, activeElement: null,
    addEventListener(type, callback) { const list = listeners.get(type) || []; list.push(callback); listeners.set(type, list); },
    querySelectorAll: (selector) => selector === "input[data-number-kind]" ? inputs : [],
    createElement: () => ({ setAttribute() {}, append() {}, classList: { toggle() {} } }),
    dispatch(event) {
      for (const listener of listeners.get(event.type) || []) { listener(event); if (event.stopped) break; }
      if (event.type === "input" && !event.stopped) received.push(event.inputType || "input");
      return event;
    }
  };
  function input(value, kind) {
    const attributes = new Map([["value", value], ["step", "1"]]);
    const control = {
      ownerDocument: doc, type: kind === "percent" ? "number" : "text", dataset: { numberKind: kind },
      value, selectionStart: value.length, selectionEnd: value.length, selectionDirection: "none", validity: { valid: true },
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, value), removeAttribute: (name) => attributes.delete(name),
      setCustomValidity(message) { this.validationMessage = message; this.validity.valid = !message; },
      matches: (selector) => selector === "input[data-number-kind]", querySelectorAll: () => [], before() {},
      setSelectionRange(start, end, direction = "none") { Object.assign(this, { selectionStart: start, selectionEnd: end, selectionDirection: direction }); },
      dispatchEvent(event) { event.target = this; doc.dispatch(event); }, reportValidity() { return this.validity.valid; }
    };
    inputs.push(control);
    doc.activeElement = control;
    return control;
  }
  const control = input(value, kind);
  const context = vm.createContext({ document: doc, queueMicrotask, MutationObserver: class { observe() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/utils/numeric-input.js"), "utf8"), context);
  const api = vm.runInContext("NumericInput", context);
  const emit = (type, options = {}, target = control) => doc.dispatch(new Event(type, { target, ...options }));
  const fill = (value, target = control) => {
    target.value = value;
    target.setSelectionRange(value.length, value.length);
    emit("input", { inputType: "insertReplacementText" }, target);
  };
  const type = (text, inputType = "insertText") => {
    const event = emit("beforeinput", { inputType });
    if (event.defaultPrevented) return;
    const start = control.selectionStart;
    control.value = control.value.slice(0, start) + text + control.value.slice(control.selectionEnd);
    control.setSelectionRange(start + text.length, start + text.length);
    emit("input", { inputType });
  };
  const key = (key, shiftKey = false) => emit("keydown", { key, ctrlKey: true, shiftKey });
  return { api, control, input, doc, emit, fill, type, key, received };
}

test("formatted edits support Ctrl+Z/Y/Shift+Z and beforeinput undo/redo with input delivery", () => {
  const f = editingFixture();
  f.fill("100000");
  f.control.setSelectionRange(7, 7);
  f.type("1");
  assert.equal(f.control.value, "1,000,001");
  assert.equal(f.key("z").defaultPrevented, true);
  assert.equal(f.control.value, "100,000");
  assert.equal(f.control.selectionStart, 7);
  f.key("y");
  assert.equal(f.control.value, "1,000,001");
  f.key("z");
  f.key("z", true);
  assert.equal(f.control.value, "1,000,001");
  assert.equal(f.emit("beforeinput", { inputType: "historyUndo" }).defaultPrevented, true);
  assert.equal(f.control.value, "100,000");
  f.emit("beforeinput", { inputType: "historyRedo" });
  assert.equal(f.control.value, "1,000,001");
  assert.equal(f.received.at(-1), "historyRedo");
});

test("undo restores middle selections and comma-adjacent deletion cursors", () => {
  const f = editingFixture("1234567");
  f.control.setSelectionRange(2, 5, "backward");
  f.type("9");
  assert.equal(f.control.value, "19,567");
  f.key("z");
  assert.equal(f.control.value, "1,234,567");
  assert.deepEqual([f.control.selectionStart, f.control.selectionEnd, f.control.selectionDirection], [2, 5, "backward"]);
  f.key("y");
  assert.equal(f.control.value, "19,567");
  f.control.setSelectionRange(3, 3);
  f.type("", "deleteContentBackward");
  assert.equal(f.control.value, "1,567");
  f.key("z");
  assert.equal(f.control.value, "19,567");
  assert.deepEqual([f.control.selectionStart, f.control.selectionEnd], [3, 3]);
});

test("external refresh resets changed values but ordinary hint refresh preserves editing history", () => {
  const f = editingFixture("1000");
  f.fill("2000");
  f.api.refresh(f.control);
  f.key("z");
  assert.equal(f.control.value, "1,000");
  f.control.value = "5000";
  f.api.refresh(f.control);
  f.key("z");
  assert.equal(f.control.value, "5,000");
  f.fill("6000");
  f.control.value = "7000";
  f.key("z");
  assert.equal(f.control.value, "7,000", "unannounced external assignment cannot revive an old record's amount");
  f.fill("8000");
  f.api.refresh(f.control, { resetEditing: true });
  f.key("z");
  assert.equal(f.control.value, "8,000");
});

test("histories are isolated, bounded, include invalid edits, and drop redo after a new branch", () => {
  const f = editingFixture("0");
  const other = f.input("42", "money");
  f.api.enhance(other);
  f.doc.activeElement = f.control;
  f.fill("wrong");
  assert.equal(f.control.validity.valid, false);
  f.key("z");
  assert.equal(f.control.value, "0");
  assert.equal(f.control.validity.valid, true);
  f.fill("5");
  f.key("y");
  assert.equal(f.control.value, "5");
  assert.equal(other.value, "42");
  f.api.refresh(f.control, { resetEditing: true });
  for (let index = 1; index <= 120; index++) f.fill(String(index));
  for (let index = 0; index < 150; index++) f.key("z");
  assert.equal(f.control.value, "21", "only the most recent 100 states are retained");
});

test("IME commits form one undo step, ignore shortcuts while composing, and respect external reset", () => {
  const f = editingFixture("1000");
  f.emit("compositionstart");
  f.control.value = "1000가";
  f.emit("input", { isComposing: true });
  assert.equal(f.key("z").defaultPrevented, false);
  assert.equal(f.control.value, "1000가");
  f.control.value = "10002";
  f.control.setSelectionRange(5, 5);
  f.emit("compositionend");
  f.emit("input", { inputType: "insertCompositionText" });
  assert.equal(f.control.value, "10,002");
  f.key("z");
  assert.equal(f.control.value, "1,000");
  f.key("y");
  assert.equal(f.control.value, "10,002");
  f.emit("compositionstart");
  f.control.value = "2000";
  f.api.refresh(f.control);
  f.emit("compositionend");
  f.key("z");
  assert.equal(f.control.value, "2,000");
});

test("unformatted native percentages, disabled and readonly fields retain their native keyboard behavior", () => {
  const percent = editingFixture("5", "percent");
  assert.equal(percent.key("z").defaultPrevented, false);
  const f = editingFixture("1000");
  f.fill("2000");
  f.control.readOnly = true;
  assert.equal(f.key("z").defaultPrevented, false);
  f.control.readOnly = false;
  f.control.disabled = true;
  assert.equal(f.key("z").defaultPrevented, false);
});

test("empty, zero, malformed values and unsafe integers remain distinct", () => {
  assert.equal(numeric.parse("").value, null);
  assert.equal(numeric.parse("   ").value, null);
  assert.equal(numeric.parse("0").value, 0);
  for (const value of ["-", ".", "-.", "1.2.3", "10만", "1/2", "NaN", "Infinity", "1e3", "9007199254740992", "9007199254740990.1"]) {
    assert.equal(numeric.parse(value).valid, false, value);
    assert.ok(Number.isNaN(numeric.parse(value).value), value);
  }
});

test("commas, copied currency/unit suffixes and fullwidth digits are parsed without losing amounts", () => {
  assert.equal(numeric.parse("₩100,001원", { kind: "money" }).value, 100001);
  assert.equal(numeric.parse("1,000주", { kind: "quantity", unit: "주" }).value, 1000);
  assert.equal(numeric.parse("５００.５０", { kind: "decimal" }).value, 500.5);
  assert.equal(numeric.parse("100,001원").valid, false, "ordinary numeric parsing must not guess a currency");
  assert.equal(numeric.parse("10만 원", { kind: "money" }).valid, false, "Korean display text is never silently converted to 10");
});

test("grouping preserves signs, trailing decimal state and fractional precision", () => {
  for (const [value, expected] of [["100001", "100,001"], ["-12345.050", "-12,345.050"], ["+1234", "+1,234"], ["1234.", "1,234."], [".5", "0.5"], ["0001234", "1,234"], ["", ""]]) {
    assert.equal(numeric.format(value), expected);
  }
});

test("Korean currency hints are exact across 만/억/조 boundaries and negative decimals", () => {
  const cases = [
    ["0", "0원"], ["9999", "9,999원"], ["10000", "1만 원"], ["100000", "10만 원"],
    ["100001", "10만 1원"], ["99999999", "9,999만 9,999원"], ["100000000", "1억 원"],
    ["123456789", "1억 2,345만 6,789원"], ["1000000000000", "1조 원"],
    ["-100001.50", "-10만 1.5원"], ["100000.05", "10만 0.05원"], [".50", "0.5원"]
  ];
  for (const [value, expected] of cases) assert.equal(numeric.koreanWon(value), expected, value);
  assert.equal(numeric.koreanWon(""), "");
  assert.equal(numeric.koreanWon("bad"), "");
});

test("required, min/max and integer/decimal steps are enforced independently of input type", () => {
  const message = (value, constraints) => numeric.validationMessage(numeric.parse(value), constraints);
  assert.ok(message("", { required: true }));
  assert.equal(message("", { required: false }), "");
  assert.equal(message("0", { required: true, min: "0" }), "");
  assert.ok(message("-1", { min: "0" }));
  assert.ok(message("101", { max: "100" }));
  assert.ok(message("1.5", { step: "1" }));
  assert.equal(message("1.5", { step: "0.5" }), "");
  assert.equal(message("4.8", { min: "0", max: "100", step: "0.01" }), "");
  assert.equal(message("2.51", { step: "any" }), "");
  assert.ok(message("3", { min: "2", step: "2" }));
  assert.equal(message("4", { min: "2", step: "2" }), "");
});

test("caret logical positions map across grouping separators without jumping to the end", () => {
  assert.equal(numeric.caretPosition("1,234,567", 0), 0);
  assert.equal(numeric.caretPosition("1,234,567", 1), 1);
  assert.equal(numeric.caretPosition("1,234,567", 4), 5);
  assert.equal(numeric.caretPosition("1,234,567", 7), 9);
  assert.equal(numeric.caretPosition("-1,234.50", 7), 8);
});

test("existing numeric consumers receive identical values after formatting", () => {
  const context = vm.createContext({ NumericInput: numeric });
  const root = path.resolve(__dirname, "..");
  vm.runInContext(fs.readFileSync(path.join(root, "src/utils/date.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "src/features/goals/goals-view.js"), "utf8"), context);
  const values = [0, 1, 100001, -500000, 1250000.5, 9007199254740991];
  for (const value of values) {
    const formatted = numeric.format(String(value));
    assert.equal(context.toNumber(formatted), value);
    assert.equal(context.goalControlValue({ type: "text", value: formatted, dataset: { numberKind: "money" } }), value);
  }
  assert.equal(context.goalControlValue({ type: "number", value: "4.8", dataset: {} }), 4.8);
  assert.equal(context.goalControlValue({ type: "text", value: "", dataset: { numberKind: "money" } }), null);
  const amounts = [101001, 55000, 7777];
  assert.equal(amounts.map((value) => context.toNumber(numeric.format(value))).reduce((a, b) => a + b, 0), 163778);
});

test("detail bulk parsing preserves whole-won values with zero decimal fractions", () => {
  const context = vm.createContext({});
  const root = path.resolve(__dirname, "..");
  for (const file of ["src/utils/date.js", "src/features/details/details-view.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  for (const value of ["1,000.00", "1000.0", "1,000", "-1,000.00"]) {
    assert.equal(numeric.validationMessage(numeric.parse(value), { step: "1" }), "", value);
    assert.equal(context.parseDetailBulkAmount(value), 1000, value);
  }
});

test("numeric UI is an explicit opt-in and is loaded before feature code", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const goal = fs.readFileSync(path.join(root, "src/features/goals/goals-view.js"), "utf8");
  assert.ok(html.indexOf('src/utils/numeric-input.js') < html.indexOf('src/features/app/init.js'));
  assert.match(html, /src\/styles\/18-numeric-input\.css/);
  for (const id of ["incomeEntryAmount", "manualAmount", "loanOpeningBalance", "ipoOfferPrice", "productPrice"]) {
    const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(input?.includes('data-number-kind="money"'), id);
  }
  const birth = goal.split(/\r?\n/).find((line) => line.includes('<input type="number" min="1900"'));
  assert.ok(birth && !birth.includes("data-number-kind"), "birth year must not be grouped");
  for (const id of ["cardBillingStartDay", "cardBillingEndDay", "cardBillingPaymentDay"]) {
    const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(input && !input.includes('data-number-kind="money"'), id);
  }
});

test("invalid currency edits never show a zero-cost IPO profit or misleading loan/calendar preview", () => {
  const invalid = { value: "wrong", validity: { valid: false } };
  const context = vm.createContext({ NumericInput: numeric, els: {
    ipoOfferPrice: invalid, ipoComputedProfit: {}, ipoComputedRate: {}, ipoComputedSettlementProfit: {},
    loanPrincipalAmount: invalid, loanScheduledTotal: {}, loanPaymentPrincipal: invalid, loanPaymentTotal: {}
  } });
  const root = path.resolve(__dirname, "..");
  for (const file of ["ipo/ipo-view.js", "recurring/recurring-view.js", "calendar/calendar-view.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "src/features", file), "utf8"), context);
  }
  context.updateIpoComputedPreview();
  assert.equal(context.els.ipoComputedProfit.textContent, "입력 확인");
  assert.equal(context.els.ipoComputedRate.textContent, "입력 확인");
  assert.equal(context.updateLoanScheduledTotal(), null);
  assert.equal(context.els.loanScheduledTotal.textContent, "입력 확인");
  context.updateLoanPaymentPreview();
  assert.equal(context.els.loanPaymentTotal.textContent, "입력 확인");
  const preview = {};
  const button = {};
  const split = { classList: { toggle() {} } };
  const form = {
    elements: { amount: invalid, reimbursement: { value: "0" }, splitPeople: { value: "3" } },
    querySelector: (selector) => ({ ".calendar-actual-preview": preview, "[data-calendar-split-apply]": button, "[data-calendar-split-result]": split }[selector])
  };
  context.updateCalendarActualPreview(form);
  assert.equal(preview.value, "입력 확인");
  assert.equal(context.updateCalendarSplitPreview(form), null);
  assert.equal(button.disabled, true);
  assert.match(split.textContent, /총 결제액/);
});
