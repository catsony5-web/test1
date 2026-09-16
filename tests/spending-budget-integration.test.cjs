const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const copy = (value) => JSON.parse(JSON.stringify(value));

function expense(key, amount, date = "2026-09-15", extra = {}) {
  return {
    recordKey: key, transactionId: key, merchant: `합성 거래 ${key}`, amount,
    month: date.slice(0, 7) || "2026-09", approvalDate: date, sourceType: "card",
    flow: "expense", sector: "식비", subcategory: "장보기/마트", status: "분류 완료", ...extra
  };
}

function recurring(id, amount, extra = {}) {
  return {
    id, name: `합성 고정비 ${id}`, amount, date: "2026-09-25", month: "2026-09",
    sector: "고정 주거비", subcategory: "통신비", posted: false, ...extra
  };
}

function setup({ rows = [], income = {}, occurrences = [], settings = {}, reimbursements = {} } = {}) {
  const local = new Map();
  const feedback = { textContent: "" };
  const controls = [{ value: "500000", disabled: false }, { value: "10000", disabled: false }, { disabled: false }];
  const host = {
    id: "budgetHost", innerHTML: "",
    querySelector: (selector) => selector === ".spending-budget-feedback" ? feedback : { addEventListener() {}, textContent: "" },
    querySelectorAll: (selector) => selector === "input, select, button" ? controls : []
  };
  const context = vm.createContext({
    console, structuredClone, window: {},
    document: {
      getElementById: (id) => id === host.id ? host : null,
      querySelectorAll: (selector) => selector === ".spending-budget-feedback" ? [feedback] : []
    },
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, value), removeItem: (key) => local.delete(key)
    },
    classified: rows, transactions: rows, monthlyIncome: income, reimbursements,
    importMeta: {}, recurringExpenses: [], rules: [], products: [], ipoRecords: [], calendarMemos: {}, goalPlan: {},
    currentFileName: "", defaultRules: [], appSettings: {},
    recurringOccurrencesForMonth: () => occurrences,
    recurringReviewIncomeKnown: (month) => Object.hasOwn(income, month)
      || rows.some((row) => row.month === month && row.flow === "income" && row.status !== "취소/제외"),
    isValidMonthKey: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))
  });
  vm.runInContext(read("src/features/app/state.js").split("\nconst els =")[0], context);
  for (const file of [
    "src/data/constants.js", "src/data/categories.js", "src/utils/format.js", "src/utils/date.js", "src/utils/dom.js",
    "src/utils/food-occasion.js", "src/utils/normalize.js", "src/utils/grouping.js", "src/components/chips.js",
    "src/features/board/board-view.js", "src/features/monthly/monthly-flow.js", "src/features/analysis/analysis-core.js",
    "src/features/summary/summary-food-core.js", "src/features/budget/spending-budget-core.js",
    "src/utils/storage.js", "src/utils/backup.js", "src/features/budget/spending-budget-view.js",
    "src/features/budget/spending-budget-targets.js"
  ]) vm.runInContext(read(file), context, { filename: file });
  context.appSettings = context.normalizeAppSettings(settings);
  Object.assign(context, {
    defaultDateForMonth: () => "2026-09-16", loadAutoSnapshots: async () => [],
    applyAppSettings() {}, renderBoard() {}, renderSummary() {}
  });
  return { context, host, local, controls, feedback, settingsKey: vm.runInContext("SETTINGS_STORAGE_KEY", context) };
}

function model(context, month = "2026-09", today = "2026-09-16") {
  return context.buildSpendingBudgetModel(month, today);
}

test("adapter combines every sector while splitting food Coupang, delivery and dining using existing rules", () => {
  const { context: c } = setup({
    rows: [
      expense("grocery", 20000, undefined, { merchant: "쿠팡" }),
      expense("household", 30000, undefined, { merchant: "쿠팡", sector: "생활용품", subcategory: "소모품" }),
      expense("delivery", 25000, undefined, { merchant: "쿠팡이츠" }),
      expense("dining", 40000, undefined, { subcategory: "외식-친구" }),
      expense("clothes", 60000, undefined, { sector: "쇼핑", subcategory: "의류" }),
      expense("care", 70000, undefined, { sector: "개인관리", subcategory: "미용" }),
      expense("unknown", 10000, undefined, { sector: "미분류", subcategory: "미분류", status: "미분류" })
    ],
    reimbursements: { grocery: 5000 }, settings: { spendingBudget: { monthlyLimit: 500000 } }
  });
  const result = model(c);
  const groups = Object.fromEntries(result.groups.map((group) => [group.label, group.actual]));
  assert.equal(result.actual, 250000);
  assert.equal(result.foodCommitted, 80000);
  assert.equal(groups["쿠팡 장보기"], 15000);
  assert.equal(groups["배달"], 25000);
  assert.equal(groups["외식"], 40000);
  assert.equal(groups["생활용품"], 30000);
  assert.equal(groups["쇼핑"], 60000);
  assert.equal(groups["개인관리"], 70000);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.remaining, 250000);
});

test("unposted fixed costs reserve only consumption; savings and loan principal reduce income support separately", () => {
  const { context: c } = setup({
    income: { "2026-09": 1000000 },
    settings: { spendingBudget: { monthlyLimit: 300000, savingsTarget: 50000 } },
    rows: [
      expense("food", 10000),
      expense("saved", 80000, undefined, { sector: "저축", subcategory: "적금/예금" }),
      expense("posted-utility", 40000, undefined, { sourceType: "recurring", recurringId: "posted", sector: "고정 주거비", subcategory: "통신비" }),
      expense("actual-loan", 220000, undefined, {
        recurringType: "loan", sector: "고정 주거비", subcategory: "대출이자", loanPrincipalAmount: 200000,
        loanSupportPrincipalAmount: 50000, loanSupportInterestAmount: 5000, loanSupportReceivedAmount: 55000,
        loanSupportReceivedDate: "2026-09-15"
      })
    ],
    occurrences: [
      recurring("posted", 40000, { posted: true }),
      recurring("utility", 30000),
      recurring("save", 100000, { sector: "저축", subcategory: "적금/예금" }),
      recurring("loan", 550000, { recurringType: "loan", subcategory: "대출이자", loanPrincipalAmount: 500000,
        loanSupportPrincipalAmount: 200000, loanSupportInterestAmount: 20000 })
    ]
  });
  const result = model(c);
  assert.equal(result.actual, 65000);
  assert.equal(result.pendingAmount, 60000);
  assert.equal(result.remaining, 175000);
  assert.equal(result.incomeSupport, 370000, "income - max(50k target, 80k actual + 100k planned savings) - (150k actual + 300k planned own principal)");
  assert.deepEqual(Array.from(result.pendingItems, (item) => item.id), ["utility", "loan"]);
  assert.equal(result.groups.some((group) => group.label === "저축"), false);
});

test("canceled, excluded, income and other-month records do not inflate consumption; future costs stay reserved", () => {
  const { context: c } = setup({
    settings: { spendingBudget: { monthlyLimit: 100000 } },
    rows: [expense("actual", 10000), expense("future", 20000, "2026-09-22"),
      expense("undated", 5000, ""), expense("canceled", 70000, undefined, { status: "취소/제외", cancel: "취소" }),
      expense("excluded", 90000, undefined, { status: "취소/제외" }),
      expense("income", 1000000, undefined, { flow: "income", sector: "수입" }),
      expense("other-month", 80000, "2026-08-15")]
  });
  c.importMeta = { lastImportedAt: "2026-09-16T12:34:56Z" };
  const result = model(c);
  assert.equal(result.actual, 15000);
  assert.equal(result.futureRecorded, 20000);
  assert.equal(result.monthTotal, 35000);
  assert.equal(result.remaining, 65000);
  assert.equal(result.currentWeek.amount, 10000);
  assert.equal(result.latestRecordDate, "2026-09-15");
  assert.equal(result.lastImportedAt, "2026-09-16T12:34:56Z");
  assert.equal(result.records.length, 3);
  assert.ok(result.warnings.some((warning) => warning.includes("월 합계")));
});

test("installment rows use the selected-month allocation and date, not the original whole purchase", () => {
  const { context: c } = setup({ rows: [expense("installment", 90000, "2026-08-15", {
    installmentEnabled: true, installmentMonths: 3, installmentOriginalAmount: 90000, installmentStartMonth: "2026-08"
  })], settings: { spendingBudget: { monthlyLimit: 100000 } } });
  const result = model(c);
  assert.equal(result.actual, 30000);
  assert.equal(result.currentWeek.amount, 30000);
  assert.equal(result.remaining, 70000);
  assert.equal(result.records[0].recordKey, "installment::installment::2");
  assert.equal(result.latestRecordDate, "2026-09-15");
});

test("missing income stays unknown while a recorded zero income is known", () => {
  assert.equal(model(setup().context).incomeSupport, null);
  assert.equal(model(setup({ income: { "2026-09": 0 } }).context).incomeSupport, 0);
});

test("income support excludes canceled income even when another valid income makes the month known", () => {
  const { context: c } = setup({ rows: [
    expense("income", 50000, undefined, { flow: "income", sector: "수입" }),
    expense("canceled-income", 1000000, undefined, { flow: "income", sector: "수입", status: "취소/제외", cancel: "취소" })
  ] });
  assert.equal(model(c).incomeSupport, 50000);
});

test("storage normalizes, saves and reloads spending settings without changing transaction data", async () => {
  const { context: c, local, settingsKey } = setup();
  const recordsKey = vm.runInContext("RECORD_STORAGE_KEY", c);
  local.set(recordsKey, JSON.stringify([{ recordKey: "untouched", amount: 123 }]));
  local.set(settingsKey, JSON.stringify({ spendingBudget: {
    monthlyLimit: "400,000", savingsTarget: -1,
    plans: [{ id: "p", label: " 예약 ", month: "2026-09", date: "2026-09-20", amount: "10,000", recordKey: "" }]
  } }));
  c.appSettings = await c.loadSettings();
  assert.equal(c.appSettings.spendingBudget.monthlyLimit, 400000);
  assert.equal(c.appSettings.spendingBudget.savingsTarget, 0);
  assert.equal(c.appSettings.spendingBudget.plans[0].label, "예약");
  await c.saveSettings();
  assert.deepEqual(copy((await c.loadSettings()).spendingBudget), copy(c.appSettings.spendingBudget));
  assert.equal(local.get(recordsKey), JSON.stringify([{ recordKey: "untouched", amount: 123 }]));
});

test("settings-only backup round-trip retains the cap, savings target, plan linkage and old-backup defaults", async () => {
  const { context: c } = setup({ settings: { spendingBudget: {
    monthlyLimit: 1500000, savingsTarget: 350000,
    profile: { ageGroup: "under40", living: "alone", netIncome: 2500000, housingCost: 500000, otherFixed: 100000, ownPrincipal: 50000 },
    monthlyTargets: { "2026-09": { monthlyLimit: 1400000, foodTarget: 300000, savingsTarget: 500000, source: "manual" } },
    plans: [{ id: "trip", label: "숙소", month: "2026-09", date: "2026-09-25", amount: 150000, recordKey: "source-row" }]
  } } });
  const expected = copy(c.appSettings.spendingBudget);
  const payload = copy(await c.buildBackupPayload(["settings"]));
  assert.deepEqual(payload.sections.settings.settings.spendingBudget, expected);
  c.appSettings = c.defaultAppSettings();
  c.applyRestorePayload(c.normalizeBackupPayload(payload), ["settings"], { mode: "overwrite" });
  assert.deepEqual(copy(c.appSettings.spendingBudget), expected);
  c.applyRestorePayload(c.normalizeBackupPayload({ version: 2, settings: { theme: "minimal" } }), ["settings"], { mode: "overwrite" });
  assert.deepEqual(copy(c.appSettings.spendingBudget), { monthlyLimit: 0, savingsTarget: 0, plans: [] });
});

test("rendering escapes imported labels, merchants, keys and plan fields in HTML", () => {
  const hostile = '<img src=x onerror="alert(1)">';
  const { context: c, host } = setup({
    rows: [expense('key" data-bad="yes', 10000, undefined, { sector: hostile, merchant: hostile })],
    occurrences: [recurring("pending", 20000, { name: hostile })],
    settings: { spendingBudget: { monthlyLimit: 100000, plans: [{ id: 'id" data-bad="yes', label: hostile, month: "2026-09", date: "2026-09-20", amount: 5000 }] } }
  });
  c.renderSpendingBudget(host.id, "2026-09", true);
  assert.ok(host.innerHTML.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(host.innerHTML.includes("key&quot; data-bad=&quot;yes"));
  assert.ok(host.innerHTML.includes("id&quot; data-bad=&quot;yes"));
  assert.doesNotMatch(host.innerHTML, /<img|data-bad="yes/);
  assert.match(host.innerHTML, /미반영 고정비/);
});

test("configured and unconfigured render states clearly separate cap, reserved headroom and food what-if", () => {
  const unconfigured = setup();
  unconfigured.context.renderSpendingBudget(unconfigured.host.id, "2026-09");
  assert.match(unconfigured.host.innerHTML, /spending-budget-settings" open/);
  assert.match(unconfigured.host.innerHTML, /목표 설정 필요/);
  assert.match(unconfigured.host.innerHTML, /수입 입력 필요/);
  assert.match(unconfigured.host.innerHTML, /data-budget-tab="overview"/);
  assert.match(unconfigured.host.innerHTML, /data-budget-tab="weeks"/);
  const configured = setup({ rows: [expense("food", 20000)], occurrences: [recurring("fixed", 30000)], settings: {
    spendingBudget: { monthlyLimit: 100000 }, foodBudget: { monthlyTarget: 50000, diningCost: 0 }
  } });
  vm.runInContext("spendingBudgetScenario = 10000", configured.context);
  configured.context.renderSpendingBudget(configured.host.id, "2026-09", true);
  const html = configured.host.innerHTML;
  assert.doesNotMatch(html, /spending-budget-settings" open/);
  assert.match(html, /budget-answer[\s\S]*?50,000원/);
  assert.match(html, /40,000원 남음/);
  assert.match(html, /20,000원 남음/);
  assert.match(html, /이번 달 사용/);
  assert.match(html, /일회성 큰 소비/);
  assert.match(html, /실제 구매 가능액을 보장하지 않습니다/);
  assert.equal(model(configured.context).actual, 20000);
});

test("saving through the real write queue completes once and preserves unrelated settings", { timeout: 2000 }, async () => {
  const { context: c, host, local, settingsKey } = setup({ settings: { foodBudget: { monthlyTarget: 150000, diningCost: 25000 } } });
  await c.saveSpendingBudgetChange(host, (settings) => ({ ...settings, monthlyLimit: 500000 }));
  assert.equal(c.appSettings.spendingBudget.monthlyLimit, 500000);
  assert.equal(c.appSettings.foodBudget.monthlyTarget, 150000);
  assert.equal(JSON.parse(local.get(settingsKey)).spendingBudget.monthlyLimit, 500000);
});

test("rejected budget writes preserve memory and storage, keep entered values and release controls for retry", { timeout: 2000 }, async () => {
  const { context: c, host, local, settingsKey, controls, feedback } = setup({ settings: {
    spendingBudget: { monthlyLimit: 300000, savingsTarget: 100000, plans: [{ id: "p", month: "2026-09", amount: 15000 }] },
    foodBudget: { monthlyTarget: 150000, diningCost: 25000 }
  } });
  const originalSettings = c.appSettings;
  const before = copy(c.appSettings);
  const enteredValues = controls.map((control) => control.value);
  local.set(settingsKey, JSON.stringify(before));
  const storedBefore = local.get(settingsKey);
  const commit = c.commitPrivateDataMany;
  let renderCount = 0;
  c.renderBoard = c.renderSummary = () => { renderCount++; };
  c.commitPrivateDataMany = async () => {
    assert.ok(controls.every((control) => control.disabled));
    throw new Error("synthetic storage denial");
  };

  await c.saveSpendingBudgetChange(host, (settings) => ({ ...settings, monthlyLimit: 500000 }));

  assert.equal(c.appSettings, originalSettings);
  assert.deepEqual(copy(c.appSettings), before);
  assert.equal(local.get(settingsKey), storedBefore);
  assert.ok(controls.every((control) => !control.disabled));
  assert.deepEqual(controls.map((control) => control.value), enteredValues);
  assert.equal(vm.runInContext("spendingBudgetSaving", c), false);
  assert.equal(renderCount, 0);
  assert.match(feedback.textContent, /저장하지 못했습니다/);
  assert.match(feedback.textContent, /입력 내용은 그대로 유지/);

  c.commitPrivateDataMany = commit;
  await c.saveSpendingBudgetChange(host, (settings) => ({ ...settings, monthlyLimit: 500000 }));
  assert.equal(c.appSettings.spendingBudget.monthlyLimit, 500000);
  assert.equal(JSON.parse(local.get(settingsKey)).spendingBudget.monthlyLimit, 500000);
  assert.match(feedback.textContent, /예산을 저장했습니다/);
});

test("rerender failures after a successful commit are not reported as storage failures", { timeout: 2000 }, async () => {
  for (const failingRender of ["renderBoard", "renderSummary"]) {
    const { context: c, host, local, settingsKey, controls, feedback } = setup();
    const commit = c.commitPrivateDataMany;
    let commitCount = 0;
    const warnings = [];
    c.console = { warn: (...args) => warnings.push(args) };
    c.commitPrivateDataMany = async (entries) => { commitCount++; return commit(entries); };
    c[failingRender] = () => { throw new Error(`synthetic ${failingRender} failure`); };

    await c.saveSpendingBudgetChange(host, (settings) => ({ ...settings, monthlyLimit: 500000 }));

    assert.equal(commitCount, 1);
    assert.equal(c.appSettings.spendingBudget.monthlyLimit, 500000);
    assert.equal(JSON.parse(local.get(settingsKey)).spendingBudget.monthlyLimit, 500000);
    assert.ok(controls.every((control) => !control.disabled));
    assert.equal(vm.runInContext("spendingBudgetSaving", c), false);
    assert.match(feedback.textContent, /저장은 완료됐습니다/);
    assert.match(feedback.textContent, /새로고침/);
    assert.doesNotMatch(feedback.textContent, /저장하지 못했습니다/);
    assert.equal(warnings.length, 1);
  }
});

test("an empty selected month returns a null model and clears stale rendering without attaching handlers", () => {
  const { context: c, host } = setup();
  let handlerCount = 0;
  c.buildAnalysisMonthSnapshot = () => { throw new Error("empty month must not reach snapshot construction"); };
  c.attachSpendingBudgetHandlers = () => { handlerCount++; };
  assert.equal(c.buildSpendingBudgetModel("", "2026-09-16"), null);
  host.innerHTML = "stale budget content";
  assert.doesNotThrow(() => c.renderSpendingBudget(host.id, "", true));
  assert.equal(host.innerHTML, "");
  assert.equal(handlerCount, 0);
});

test("plan submission at MAX_PLANS warns without saving or clearing the entered plan", () => {
  const { context: c, host, local, feedback, controls } = setup();
  const limit = c.SpendingBudgetCore.MAX_PLANS;
  c.appSettings.spendingBudget = c.SpendingBudgetCore.normalizeSettings({
    monthlyLimit: 300000,
    plans: Array.from({ length: limit }, (_, index) => ({ id: `old-${index}`, month: "2026-08", amount: 1000 }))
  });
  const originalSettings = c.appSettings;
  const before = copy(c.appSettings);
  let submit;
  const form = {
    elements: { label: { value: " 다음 약속 " }, date: { value: "2026-09-25" }, amount: { value: "80000" } },
    reportValidity: () => true,
    addEventListener: (name, handler) => { if (name === "submit") submit = handler; }
  };
  const enteredValues = copy(form.elements);
  const querySelector = host.querySelector;
  host.querySelector = (selector) => selector === "[data-budget-plan]" ? form : querySelector(selector);
  let saveCount = 0;
  let preventCount = 0;
  c.saveSpendingBudgetChange = () => { saveCount++; };
  c.attachSpendingBudgetHandlers(host, model(c), true);
  assert.equal(typeof submit, "function");

  submit({ currentTarget: form, preventDefault: () => { preventCount++; } });

  assert.equal(preventCount, 1);
  assert.equal(saveCount, 0);
  assert.equal(local.size, 0);
  assert.equal(c.appSettings, originalSettings);
  assert.deepEqual(copy(c.appSettings), before);
  assert.deepEqual(form.elements, enteredValues);
  assert.ok(controls.every((control) => !control.disabled));
  assert.ok(feedback.textContent.includes(`최대 ${limit}개`));
  assert.match(feedback.textContent, /지난 예약을 정리/);
  assert.doesNotMatch(feedback.textContent, /저장했습니다/);
});

test("an unposted recurring occurrence with an imported candidate exposes an overlap warning", () => {
  const pending = recurring("phone", 30000);
  const imported = expense("imported-phone", 30000, undefined, { sector: "고정 주거비", subcategory: "통신비" });
  const { context: c, host } = setup({
    rows: [imported], occurrences: [pending], settings: { spendingBudget: { monthlyLimit: 100000 } }
  });
  c.recurringExpenses = [pending];
  c.findPostedRecurringTransaction = () => null;
  c.recurringImportCandidates = (item, month) => item.id === pending.id && month === "2026-09" ? [imported] : [];

  const result = model(c);
  assert.equal(result.overlapCount, 1);
  assert.equal(result.actual, 30000);
  assert.equal(result.pendingAmount, 30000, "unconfirmed candidates must not silently remove recurring reservations");
  c.renderSpendingBudget(host.id, "2026-09", true);
  assert.match(host.innerHTML, /중복 후보 1건/);
  assert.match(host.innerHTML, /이중 계산될 수 있습니다/);

  c.recurringImportCandidates = () => [];
  assert.equal(model(c).overlapCount, 0);
});
