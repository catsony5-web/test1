const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/features/budget/spending-budget-core.js");

const recorded = { income: 2500000, housingCost: 500000, otherFixed: 150000, ownPrincipal: 100000 };
const selected = { ageGroup: "twentiesMid", living: "alone", career: "starter", retirementAge: 65 };
const draft = (profile = {}, context = {}) => core.templateDraft({ ...selected, ...profile }, { ...recorded, ...context });

test("a new profile keeps missing goals unknown and preserves explicit zero through settings round trips", () => {
  const blank = core.normalizeProfile({});
  for (const key of ["netIncome", "housingCost", "otherFixed", "ownPrincipal", "savingsGoal", "reserve", "foodTarget", "currentAge", "retirementAge"]) {
    assert.equal(blank[key], null, key);
  }
  const normalized = core.normalizeSettings({ profile: { ...selected, savingsGoal: "0", reserve: 0, foodTarget: " 0 " } });
  assert.equal(normalized.profile.savingsGoal, 0);
  assert.equal(normalized.profile.reserve, 0);
  assert.equal(normalized.profile.foodTarget, 0);
  assert.deepEqual(core.normalizeSettings(JSON.parse(JSON.stringify(normalized))), normalized);
  for (const key of ["savingsGoal", "reserve", "foodTarget"]) {
    for (const value of [undefined, null, "", " , ", "bad", -1, Infinity]) assert.equal(core.normalizeProfile({ [key]: value })[key], null);
  }
});

test("an empty template is immediately visible but every assumed amount requires acknowledgment", () => {
  const result = core.templateDraft();
  assert.equal(result.profile.netIncome, 2500000);
  assert.equal(result.profile.housingCost, 500000);
  assert.equal(result.profile.otherFixed, 150000);
  assert.equal(result.profile.ownPrincipal, 0);
  assert.equal(result.profile.career, "starter");
  assert.equal(result.profile.living, "alone");
  assert.equal(result.savingsTarget, 500000);
  assert.equal(result.reserve, 125000);
  assert.equal(result.foodTarget, 375000);
  assert.equal(result.monthlyLimit, 1875000);
  assert.ok(Object.values(result.fieldSources).every((source) => source === "template"));
  assert.ok(result.assumptions.some((entry) => entry.includes("본인 부담 대출 원금") && entry.includes("0원")));
  assert.ok(result.assumptions.some((entry) => entry.includes("월 실수령액")));
  assert.match(result.template.description, /앱 예시 규칙/);
  assert.match(result.template.description, /통계 평균이나 최적 예산을 보장하지 않습니다/);
  assert.equal(result.confirmationRequired, true);
  assert.equal(result.canApply, false);
  const accepted = core.templateDraft({}, { assumptionsConfirmed: true });
  assert.equal(accepted.confirmationRequired, false);
  assert.equal(accepted.canApply, true);
  assert.deepEqual(accepted.assumptions, result.assumptions, "acknowledgment never hides what was assumed");
});

test("manual values, including zero, outrank records, which outrank template amounts", () => {
  const fromRecords = draft();
  for (const key of ["netIncome", "housingCost", "otherFixed", "ownPrincipal"]) assert.equal(fromRecords.fieldSources[key], "records");
  assert.equal(fromRecords.savingsTarget, 400000, "principal is included in the combined 20 percent target only once");
  assert.equal(fromRecords.monthlyLimit, 1875000);
  const manual = draft({ netIncome: 3000000, housingCost: 0, otherFixed: 0, ownPrincipal: 0, savingsGoal: 0, reserve: 0, foodTarget: 0 });
  for (const key of ["netIncome", "housingCost", "otherFixed", "ownPrincipal", "savingsGoal", "reserve", "foodTarget"]) assert.equal(manual.fieldSources[key], "manual");
  assert.equal(manual.profile.housingCost, 0);
  assert.equal(manual.savingsTarget, 0);
  assert.equal(manual.reserve, 0);
  assert.equal(manual.foodTarget, 0);
  assert.equal(manual.monthlyLimit, 3000000);
  assert.deepEqual(manual.assumptions, []);
  assert.equal(manual.canApply, true);
  const zeroRecords = core.templateDraft({ living: "family", career: "starter" }, { income: 0, housingCost: 0, otherFixed: 0, ownPrincipal: 0, assumptionsConfirmed: true });
  assert.equal(zeroRecords.profile.netIncome, 0);
  assert.equal(zeroRecords.fieldSources.netIncome, "records");
  assert.equal(zeroRecords.canApply, false);
  assert.equal(zeroRecords.monthlyLimit, 0);
});

test("template coefficients depend on career and living arrangement, never age or future salary", () => {
  const cases = [
    ["starter", "family", 0.25, 0.05, 0.12, 0],
    ["starter", "alone", 0.20, 0.05, 0.15, 500000],
    ["starter", "shared", 0.20, 0.05, 0.15, 350000],
    ["experienced", "alone", 0.30, 0.05, 0.15, 500000],
    ["irregular", "alone", 0.10, 0.10, 0.15, 500000]
  ];
  for (const [career, living, savingsDebtRatio, reserveRatio, foodRatio, housingCost] of cases) {
    const result = core.templateDraft({ career, living });
    assert.deepEqual(result.rates, { savingsDebtRatio, reserveRatio, foodRatio });
    assert.equal(result.profile.housingCost, housingCost);
    assert.equal(result.savingsTarget, Math.round(2500000 * savingsDebtRatio));
    assert.equal(result.reserve, Math.round(2500000 * reserveRatio));
    assert.equal(result.foodTarget, Math.round(2500000 * foodRatio));
  }
  assert.equal(core.templateDraft({ incomeStability: "variable" }).template.key, "irregular");
  const young = draft({ ageGroup: "twentiesEarly", retirementAge: 90 });
  const older = draft({ ageGroup: "sixties", retirementAge: 60 });
  for (const key of ["monthlyLimit", "foodTarget", "savingsTarget", "reserve", "capacity"]) assert.equal(young[key], older[key]);
  assert.equal(Object.hasOwn(young, "futureIncome"), false);
});

test("confirmed last-three-month food median outranks the template but not a manual food target", () => {
  const history = [{ food: 900000 }, { food: 300000 }, { food: 400000 }, { food: 700000 }];
  assert.equal(draft({}, { history }).foodTarget, 375000);
  assert.equal(draft({}, { history: history.slice(2), historyConfirmed: true }).foodTarget, 375000);
  const result = draft({}, { history, historyConfirmed: true });
  assert.equal(result.foodTarget, 400000);
  assert.equal(result.fieldSources.foodTarget, "history");
  assert.equal(draft({ foodTarget: 200000 }, { history, historyConfirmed: true }).foodTarget, 200000);
  assert.equal(draft({ historyConfirmed: true }, { history, historyConfirmed: false }).fieldSources.foodTarget, "template");
  assert.equal(draft({}, { history: [...history, { food: null }], historyConfirmed: true }).fieldSources.foodTarget, "template");
  assert.equal(draft({}, { history: [{ food: 0 }, { food: 0 }, { food: 0 }], historyConfirmed: true }).foodTarget, 0);
});

test("high fixed costs reduce only suggested commitments and conserve the available money", () => {
  const result = draft({ netIncome: 1000000, housingCost: 750000, otherFixed: 100000, ownPrincipal: 100000 }, { assumptionsConfirmed: true });
  assert.equal(result.savingsTarget + result.reserve, 50000);
  assert.equal(result.savingsTarget, 33333);
  assert.equal(result.reserve, 16667);
  assert.equal(result.monthlyLimit, 850000);
  assert.equal(result.fixed, 850000);
  assert.equal(result.foodTarget, 0);
  assert.equal(result.deficit, 0);
  assert.equal(result.canApply, true);
  assert.ok(result.warnings.some((entry) => entry.includes("줄였습니다")));
  const manualSavings = draft({ netIncome: 1000000, housingCost: 650000, otherFixed: 100000, ownPrincipal: 100000, savingsGoal: 120000 }, { assumptionsConfirmed: true });
  assert.equal(manualSavings.savingsTarget, 120000);
  assert.equal(manualSavings.reserve, 30000);
  const manualReserve = draft({ netIncome: 1000000, housingCost: 650000, otherFixed: 100000, ownPrincipal: 100000, reserve: 120000 }, { assumptionsConfirmed: true });
  assert.equal(manualReserve.reserve, 120000);
  assert.equal(manualReserve.savingsTarget, 30000);
});

test("unaffordable fixed costs or manual commitments stay explicit and block applying, even after acknowledgment", () => {
  const fixedDeficit = draft({ netIncome: 500000, housingCost: 500000, otherFixed: 150000, ownPrincipal: 100000 }, { assumptionsConfirmed: true });
  assert.equal(fixedDeficit.deficit, 250000);
  assert.equal(fixedDeficit.savingsTarget, 0);
  assert.equal(fixedDeficit.reserve, 0);
  assert.equal(fixedDeficit.canApply, false);
  const manual = draft({ netIncome: 1000000, housingCost: 600000, otherFixed: 150000, ownPrincipal: 100000, savingsGoal: 200000, reserve: 100000 }, { assumptionsConfirmed: true });
  assert.equal(manual.savingsTarget, 200000);
  assert.equal(manual.reserve, 100000);
  assert.equal(manual.deficit, 150000);
  assert.equal(manual.canApply, false);
  assert.ok(manual.warnings.some((entry) => entry.includes("150,000원")));
  const negative = draft({ netIncome: 0, savingsGoal: 100000, reserve: 50000 }, { assumptionsConfirmed: true });
  assert.ok(negative.capacity < 0);
  assert.equal(negative.monthlyLimit, 0);
  assert.equal(negative.canApply, false);
});

test("fixed food remains a subset of consumption, not a second deduction", () => {
  const result = draft({ netIncome: 1000000, housingCost: 500000, otherFixed: 300000, ownPrincipal: 0, savingsGoal: 0, reserve: 0 }, { fixedFood: 250000, assumptionsConfirmed: true });
  assert.equal(result.monthlyLimit, 1000000);
  assert.equal(result.fixed, 800000);
  assert.equal(result.fixedFood, 250000);
  assert.equal(result.foodCapacity, 450000);
  assert.equal(result.foodTarget, 250000);
  assert.equal(result.canApply, true);
  const excessiveHistory = draft({ netIncome: 1000000, housingCost: 500000, otherFixed: 300000, ownPrincipal: 0, savingsGoal: 0, reserve: 0 }, { fixedFood: 250000, history: [{ food: 900000 }, { food: 950000 }, { food: 990000 }], historyConfirmed: true, assumptionsConfirmed: true });
  assert.equal(excessiveHistory.foodTarget, 450000);
  assert.equal(excessiveHistory.canApply, true);
  const invalid = draft({ housingCost: 0, otherFixed: 0 }, { fixedFood: 10000, assumptionsConfirmed: true });
  assert.equal(invalid.canApply, false);
  assert.ok(invalid.warnings.some((entry) => entry.includes("고정 식비가 전체 고정비보다")));
});

test("manual food outside its affordable bounds is preserved and flagged, never silently rewritten", () => {
  const profile = { netIncome: 1000000, housingCost: 500000, otherFixed: 300000, ownPrincipal: 0, savingsGoal: 0, reserve: 0 };
  const above = draft({ ...profile, foodTarget: 600000 }, { fixedFood: 250000 });
  assert.equal(above.foodTarget, 600000);
  assert.equal(above.foodCapacity, 450000);
  assert.equal(above.foodDeficit, 150000);
  assert.equal(above.canApply, false);
  const below = draft({ ...profile, foodTarget: 0 }, { fixedFood: 250000 });
  assert.equal(below.foodTarget, 0);
  assert.equal(below.foodDeficit, 250000);
  assert.equal(below.canApply, false);
});

test("earning horizon uses bounded age groups, an editable retirement assumption, and no income amount", () => {
  const early = core.earningHorizon({ ageGroup: "twentiesEarly" });
  assert.equal(early.retirementAge, 65);
  assert.equal(early.retirementAgeAssumed, true);
  assert.equal(early.minYears, 42);
  assert.equal(early.maxYears, 45);
  assert.equal(early.minMonths, 504);
  assert.equal(early.maxMonths, 540);
  assert.equal(early.label, "약 42~45년");
  const mid = core.earningHorizon({ ageGroup: "twentiesMid", retirementAge: "60" });
  assert.equal(mid.minYears, 34);
  assert.equal(mid.maxYears, 36);
  assert.equal(mid.retirementAgeAssumed, false);
  const late = core.earningHorizon({ ageGroup: "twentiesLate", retirementAge: 65 });
  assert.equal(late.minYears, 36);
  assert.equal(late.maxYears, 38);
  assert.match(early.warnings.join(" "), /고용·월급의 보장이 아닙니다/);
  assert.match(early.warnings.join(" "), /미래 소득은 이번 달 소비 한도에 더하지 않습니다/);
});

test("an exact age wins; retired age ranges floor at zero; legacy broad selections never invent an age", () => {
  const exact = core.earningHorizon({ ageGroup: "twentiesEarly", currentAge: 35, retirementAge: 65 });
  assert.equal(exact.minYears, 30);
  assert.equal(exact.maxYears, 30);
  assert.equal(exact.ageMin, 35);
  assert.equal(exact.label, "약 30년");
  const partial = core.earningHorizon({ ageGroup: "sixties", retirementAge: 65 });
  assert.equal(partial.minYears, 0);
  assert.equal(partial.maxYears, 5);
  assert.equal(core.earningHorizon({ ageGroup: "sixties", retirementAge: 60 }).maxYears, 0);
  assert.equal(core.earningHorizon({ currentAge: 75, retirementAge: 65 }).maxYears, 0);
  for (const ageGroup of ["under40", "over60", "undisclosed", "", "bad"]) {
    const result = core.earningHorizon({ ageGroup });
    assert.equal(result.available, false, ageGroup);
    assert.equal(result.minYears, null);
    assert.equal(result.maxMonths, null);
  }
  assert.equal(core.normalizeProfile({ ageGroup: "under40" }).ageGroup, "under40");
  assert.equal(core.normalizeProfile({ ageGroup: "over60" }).ageGroup, "over60");
  assert.equal(core.earningHorizon({ ageGroup: "under40", currentAge: 28 }).maxYears, 37);
  for (const retirementAge of ["", null, 39, 91, 60.5, "bad", Infinity]) assert.equal(core.earningHorizon({ retirementAge }).retirementAge, 65);
  for (const retirementAge of [40, 60, 65, 90]) assert.equal(core.earningHorizon({ retirementAge }).retirementAge, retirementAge);
  for (const currentAge of ["", null, -1, 121, 23.5, "bad", Infinity]) assert.equal(core.earningHorizon({ currentAge }).available, false);
});

test("draft calculation neither writes monthly targets nor mutates profiles, records or exported age definitions", () => {
  const profile = { ...selected, savingsGoal: null };
  const context = { ...recorded, history: [{ food: 300000 }, { food: 400000 }, { food: 500000 }], historyConfirmed: true };
  const before = structuredClone({ profile, context });
  const result = core.templateDraft(profile, context);
  assert.deepEqual({ profile, context }, before);
  result.profile.netIncome = 1;
  result.template.foodRatio = 1;
  assert.equal(core.templateDraft(profile, context).profile.netIncome, 2500000);
  assert.equal(core.templateDraft(profile, context).template.foodRatio, 0.15);
  assert.equal(Object.hasOwn(result, "monthlyTargets"), false);
  assert.ok(Object.isFrozen(core.AGE_GROUPS));
  assert.ok(core.AGE_GROUPS.every(Object.isFrozen));
});

test("legacy recommendation arithmetic is unchanged when optional goals are absent", () => {
  const result = core.recommend({ living: "family", netIncome: 2500000, housingCost: 0, otherFixed: 150000, ownPrincipal: 0 });
  assert.equal(result.monthlyLimit, 2500000);
  assert.equal(result.savingsTarget, 0);
  assert.equal(result.canApply, true);
});
