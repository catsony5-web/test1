const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const numericInput = require("../src/utils/numeric-input.js");
const core = require("../src/features/budget/spending-budget-core.js");

const profile = (extra = {}) => ({
  ageGroup: "under40", living: "alone", incomeStability: "stable", netIncome: 2500000,
  housingCost: 500000, otherFixed: 150000, ownPrincipal: 100000, savingsGoal: 500000, reserve: 100000, ...extra
});
const model = (extra = {}) => core.build({ month: "2026-09", today: "2026-09-16", ...extra });

test("missing and blank profile amounts stay unknown; explicit zero is a valid input", () => {
  for (const netIncome of [undefined, null, "", "  ", " , ", "bad", -1, Infinity]) {
    const result = core.recommend(profile({ netIncome }));
    assert.equal(result.ready, false);
    assert.ok(result.missing.includes("netIncome"));
  }
  const zero = core.recommend(profile({ netIncome: 0 }));
  assert.equal(zero.ready, true);
  assert.equal(zero.canApply, false);
  assert.ok(zero.deficit > 0);
  assert.equal(core.recommend(profile({ living: "" })).ready, false);
});

test("recommendation includes fixed consumption once and reserves savings, principal and buffer separately", () => {
  const result = core.recommend(profile());
  assert.equal(result.capacity, 1800000);
  assert.equal(result.fixed, 650000);
  assert.equal(result.monthlyLimit, 1800000);
  assert.equal(result.canApply, true);
  assert.equal(result.foodTarget, null, "household food/lodging is not invented as a personal food goal");
  assert.equal(result.savingsTarget, 500000);
  const single = core.recommend(profile({ netIncome: 4000000 }));
  assert.equal(single.monthlyLimit, Math.round(1689000 * .816 + 500000));
  assert.equal(single.basis, "single-household");
});

test("unaffordable fixed costs produce an explicit deficit and disable applying a recommendation", () => {
  const result = core.recommend(profile({ netIncome: 1000000 }));
  assert.equal(result.capacity, 300000);
  assert.equal(result.deficit, 350000);
  assert.equal(result.canApply, false);
  assert.ok(result.monthlyLimit <= result.capacity);
});

test("age group provides labeled household context without arbitrary percentage changes", () => {
  const young = core.recommend(profile());
  const older = core.recommend(profile({ ageGroup: "over60" }));
  assert.equal(young.monthlyLimit, older.monthlyLimit);
  assert.equal(young.ageAverage, 2824000);
  assert.equal(older.ageAverage, 2212000);
  assert.equal(core.recommend(profile({ ageGroup: "undisclosed" })).ageAverage, null);
  for (const living of ["family", "shared"]) {
    const result = core.recommend(profile({ living }));
    assert.equal(result.singleAverage, null);
    assert.equal(result.basis, "income");
    assert.equal(result.monthlyLimit, result.capacity);
  }
});

test("personal median requires three complete months and explicit confirmation", () => {
  const history = [{ total: 1200000, food: 300000 }, { total: 1400000, food: 400000 }, { total: 3900000, food: 700000 }];
  assert.equal(core.recommend(profile(), history).basis, "single-household");
  assert.equal(core.recommend(profile({ historyConfirmed: true }), history.slice(1)).basis, "single-household");
  const result = core.recommend(profile({ historyConfirmed: true }), history);
  assert.equal(result.basis, "history");
  assert.equal(result.monthlyLimit, 1400000);
  assert.equal(result.foodTarget, 400000);
  assert.equal(core.recommend(profile({ historyConfirmed: true, otherFixed: 800000 }), history).foodTarget, 100000);
});

test("month targets preserve older months and do not track changing income or profile values", () => {
  const settings = core.normalizeSettings({ monthlyLimit: 1500000, savingsTarget: 500000,
    profile: profile(), monthlyTargets: {
      "2026-08": { monthlyLimit: 1200000, foodTarget: 300000, savingsTarget: 500000 },
      "2026-09": { monthlyLimit: 1000000, foodTarget: 250000, savingsTarget: 400000, source: "recommendation" },
      "bad": { monthlyLimit: 9000000 }
    }
  });
  assert.equal(Object.keys(settings.monthlyTargets).length, 2);
  assert.equal(core.targetsForMonth(settings, "2026-08").monthlyLimit, 1200000);
  assert.equal(core.targetsForMonth(settings, "2026-09").monthlyLimit, 1000000);
  assert.equal(core.targetsForMonth(settings, "2026-10", 350000).foodTarget, 350000);
  assert.equal(model({ settings, income: 999999 }).cap, model({ settings, income: 9999999 }).cap);
  assert.equal(model({ settings, foodTarget: 900000 }).foodTarget, 250000);
  assert.equal(model({ settings, income: 2000000 }).incomeSupport, 1600000);
  assert.deepEqual(core.normalizeSettings(JSON.parse(JSON.stringify(settings))), settings);
});

test("food reservations reduce both budgets once and follow the actual classification after linking", () => {
  const settings = { monthlyLimit: 1000000, plans: [
    { id: "food", month: "2026-09", date: "2026-09-20", amount: 80000, sector: "식비" },
    { id: "legacy", month: "2026-09", amount: 90000 },
    { id: "other", month: "2026-09", amount: 60000, sector: "기타" }
  ] };
  const rows = [{ key: "meal", date: "2026-09-15", amount: 100000, sector: "식비", group: "외식" }];
  const before = model({ settings, rows, foodTarget: 300000, scenarioAmount: 50000 });
  assert.equal(before.remaining, 670000);
  assert.equal(before.foodRemaining, 120000);
  assert.equal(before.scenario.foodAfter, 70000);
  assert.equal(before.scenario.budgetAfter, 620000);
  settings.plans[0].recordKey = "meal";
  const linked = model({ settings, rows, foodTarget: 300000 });
  assert.equal(linked.remaining, 750000);
  assert.equal(linked.foodPending, 0);
  assert.equal(linked.foodRemaining, 200000);
  rows[0].sector = "생활용품";
  assert.equal(model({ settings, rows, foodTarget: 300000 }).foodRemaining, 300000);
  rows[0].sector = "식비";
  rows[0].amount = -10000;
  assert.equal(model({ settings, rows, foodTarget: 300000 }).foodRemaining, 310000);
});

test("budget content is located only in its own sixth summary tab, not the dashboard or pattern detail", () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const html = read("index.html");
  assert.doesNotMatch(html, /id="boardSpendingBudget"/);
  assert.equal((html.match(/id="summarySpendingBudget"/g) || []).length, 1);
  assert.match(html, /id="summarySubtabBudget"[^>]*>[\s\S]*?<div id="summarySpendingBudget"/);
  assert.match(html, /<option value="budget">예산 점검/);
  assert.doesNotMatch(read("src/features/board/board-view.js"), /renderSpendingBudget\(/);
  assert.match(read("src/features/summary/summary-view.js"), /budget:\s*"budget"/);
});

function targetHandlers(initialProfile = {}) {
  const amountNames = ["netIncome", "housingCost", "otherFixed", "ownPrincipal", "savingsGoal", "reserve", "foodTarget"];
  const records = { income: 2500000, housingCost: 500000, otherFixed: 150000, ownPrincipal: 100000 };
  const resolved = core.templateDraft(initialProfile, records).profile;
  const listeners = () => ({ handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; } });
  const fields = Object.fromEntries([...amountNames, "retirementAge", "ageGroup", "career", "living", "historyConfirmed"].map((name) => {
    const isAmount = amountNames.includes(name);
    const input = {
      name, _value: "", checked: false,
      get value() { return this._value; }, set value(value) { this._value = String(value ?? ""); },
      checkValidity() {
        if (!isAmount && name !== "retirementAge") return true;
        return !numericInput.validationMessage(numericInput.parse(this.value), { min: name === "retirementAge" ? "40" : "0", max: name === "retirementAge" ? "90" : "100000000", step: "1" });
      }
    };
    input.value = name === "retirementAge" ? initialProfile.retirementAge ?? 65 : isAmount ? resolved[name] : initialProfile[name] ?? "";
    return [name, input];
  }));
  const form = { ...listeners(), elements: fields, checkValidity: () => Object.values(fields).every((input) => input.checkValidity()) };
  form.reportValidity = form.checkValidity;
  const acknowledgment = { checked: false, matches: (selector) => selector === "[data-budget-confirm-assumptions]" };
  const apply = { disabled: true };
  const output = {
    ...listeners(), html: "",
    get innerHTML() { return this.html; },
    set innerHTML(html) {
      this.html = html;
      apply.disabled = /data-budget-apply-recommendation\s+disabled/.test(html);
    },
    querySelector(selector) {
      if (selector === "[data-budget-confirm-assumptions]") return this.html.includes("data-budget-confirm-assumptions") ? acknowledgment : null;
      if (selector === "[data-budget-apply-recommendation]") return this.html.includes("data-budget-apply-recommendation") ? apply : null;
      return null;
    }
  };
  const horizon = { innerHTML: "" };
  const sourceLabels = Object.fromEntries(amountNames.map((name) => [name, { textContent: "" }]));
  const details = { ...listeners(), open: false, hidden: true, querySelector: () => ({ focus() {} }) };
  const reset = listeners();
  const templateButtons = ["starter-alone", "starter-family", "experienced", "irregular"].map((key) => ({
    ...listeners(), dataset: { budgetTemplate: key }, setAttribute() {}
  }));
  const feedback = { textContent: "" };
  const host = {
    querySelector(selector) {
      if (selector === "[data-budget-profile]") return form;
      if (selector === "[data-budget-recommendation]") return output;
      if (selector === "[data-budget-horizon]") return horizon;
      if (selector === "[data-budget-use-records]") return reset;
      if (selector === ".spending-budget-settings") return details;
      if (selector === ".spending-budget-feedback") return feedback;
      const source = selector.match(/^\[data-budget-source="(.+)"\]$/);
      return source ? sourceLabels[source[1]] : listeners();
    },
    querySelectorAll: (selector) => selector === "[data-budget-template]" ? templateButtons : []
  };
  const saves = [];
  const settings = core.normalizeSettings({ profile: initialProfile, monthlyTargets: {
    "2026-08": { monthlyLimit: 900000, foodTarget: 200000, savingsTarget: 300000, source: "manual" },
    "2026-09": { monthlyLimit: 1200000, foodTarget: 250000, savingsTarget: 400000, source: "manual" }
  } });
  const context = vm.createContext({
    SpendingBudgetCore: core, document: { activeElement: null }, appSettings: { spendingBudget: settings },
    NumericInput: {
      read: (input) => numericInput.parse(input.value).value,
      refresh() { amountNames.forEach((name) => { if (fields[name].checkValidity()) fields[name].value = numericInput.format(fields[name].value); }); }
    },
    formatWon: (value) => `${Number(value).toLocaleString("ko-KR")}원`, escapeHtml: String,
    saveSpendingBudgetChange(_host, update) {
      const next = core.normalizeSettings(update(context.appSettings.spendingBudget));
      saves.push(structuredClone(next));
      context.appSettings.spendingBudget = next;
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/features/budget/spending-budget-targets.js"), "utf8"), context);
  context.attachSpendingBudgetTargetHandlers(host, { month: "2026-09", recommendationRecords: records });
  return {
    fields, form, output, horizon, apply, saves, context, settings, sourceLabels,
    change(name, value) {
      const input = fields[name];
      context.document.activeElement = input;
      if (name === "historyConfirmed") input.checked = value;
      else input.value = value;
      form.handlers[amountNames.includes(name) || name === "retirementAge" ? "input" : "change"]({ target: input });
    },
    acknowledge(checked = true) {
      acknowledgment.checked = checked;
      output.handlers.change({ target: acknowledgment });
    },
    clickApply() { output.handlers.click({ target: { closest: () => apply } }); },
    template(key) { context.document.activeElement = null; templateButtons.find((button) => button.dataset.budgetTemplate === key).handlers.click(); },
    resetRecords() { context.document.activeElement = null; reset.handlers.click(); }
  };
}

test("template handlers require acknowledgment and save resolved targets without turning suggestions into manual profile values", () => {
  const ui = targetHandlers();
  assert.equal(ui.apply.disabled, true);
  ui.clickApply();
  assert.equal(ui.saves.length, 0);
  ui.acknowledge();
  assert.equal(ui.apply.disabled, false);
  ui.clickApply();
  assert.equal(ui.saves.length, 1);
  for (const name of ["netIncome", "housingCost", "otherFixed", "ownPrincipal", "savingsGoal", "reserve", "foodTarget", "retirementAge"]) assert.equal(ui.saves[0].profile[name], null, name);
  assert.equal(ui.saves[0].monthlyTargets["2026-09"].monthlyLimit, 1875000);
  assert.equal(ui.saves[0].monthlyTargets["2026-09"].savingsTarget, 400000);
  assert.deepEqual(ui.saves[0].monthlyTargets["2026-08"], ui.settings.monthlyTargets["2026-08"]);
});

test("editing or selecting a template is preview-only, and a new edit resets acknowledgment while preserving manual values", () => {
  const ui = targetHandlers();
  const before = structuredClone(ui.context.appSettings.spendingBudget);
  ui.acknowledge();
  ui.change("netIncome", "3,000,000");
  assert.equal(ui.apply.disabled, true);
  ui.template("starter-family");
  assert.deepEqual(ui.context.appSettings.spendingBudget, before);
  assert.equal(ui.saves.length, 0);
  assert.equal(numericInput.parse(ui.fields.netIncome.value).value, 3000000);
  assert.equal(ui.sourceLabels.netIncome.textContent, "직접 수정");
  ui.clickApply();
  assert.equal(ui.saves.length, 0);
  ui.acknowledge();
  ui.clickApply();
  assert.equal(ui.saves[0].profile.netIncome, 3000000);
  assert.equal(ui.saves[0].profile.living, "family");
  assert.equal(ui.saves[0].profile.savingsGoal, null);
});

test("invalid handwritten input survives another selection and blocks applying until the user repairs it", () => {
  const ui = targetHandlers();
  ui.change("netIncome", "-1");
  assert.match(ui.output.innerHTML, /입력한 숫자/);
  ui.change("career", "experienced");
  assert.equal(ui.fields.netIncome.value, "-1");
  assert.match(ui.output.innerHTML, /입력한 숫자/);
  ui.clickApply();
  assert.equal(ui.saves.length, 0);
  ui.change("netIncome", "2800000");
  ui.acknowledge();
  ui.clickApply();
  assert.equal(ui.saves[0].profile.netIncome, 2800000);
});

test("record reset is an explicit replacement of all four overrides, including an invalid one", () => {
  const ui = targetHandlers({ housingCost: 0, otherFixed: 0, ownPrincipal: 0 });
  ui.change("netIncome", "-1");
  ui.resetRecords();
  assert.equal(numericInput.parse(ui.fields.netIncome.value).value, 2500000);
  assert.equal(numericInput.parse(ui.fields.housingCost.value).value, 500000);
  ui.acknowledge();
  ui.clickApply();
  for (const name of ["netIncome", "housingCost", "otherFixed", "ownPrincipal"]) assert.equal(ui.saves[0].profile[name], null, name);
});

test("explicit zero remains manual while clearing an override restores records without saving the proposed value", () => {
  const ui = targetHandlers();
  ui.change("housingCost", "0");
  ui.acknowledge();
  ui.clickApply();
  assert.equal(ui.saves[0].profile.housingCost, 0);
  ui.change("housingCost", "");
  ui.change("career", "experienced");
  assert.equal(numericInput.parse(ui.fields.housingCost.value).value, 500000);
  assert.equal(ui.sourceLabels.housingCost.textContent, "내 기록 기준");
  ui.acknowledge();
  ui.clickApply();
  assert.equal(ui.saves[1].profile.housingCost, null);
});

test("a stored exact age has priority until the user explicitly selects a new age group", () => {
  const ui = targetHandlers({ currentAge: 35, ageGroup: "twentiesMid", retirementAge: 65 });
  assert.match(ui.horizon.innerHTML, /약 30년/);
  ui.change("retirementAge", "60");
  assert.match(ui.horizon.innerHTML, /약 25년/);
  ui.change("ageGroup", "twentiesEarly");
  assert.match(ui.horizon.innerHTML, /약 37~40년/);
  ui.acknowledge();
  ui.clickApply();
  assert.equal(ui.saves[0].profile.currentAge, null);
  assert.equal(ui.saves[0].profile.retirementAge, 60);
  assert.equal(ui.saves[0].profile.ageGroup, "twentiesEarly");
});
