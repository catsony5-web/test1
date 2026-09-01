const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const core = require("../src/features/goals/goals-core.js");

const BASE_PLAN = {
  targetAmount: 100000000,
  currentAssets: 10000000,
  monthlyContribution: 1500000
};

function closeTo(actual, expected, tolerance = 0.000001) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function loadGoalViewContext() {
  const context = vm.createContext({ GoalPlannerCore: core });
  const resourceSource = fs.readFileSync(
    path.join(__dirname, "../src/data/goal-resources.js"),
    "utf8"
  );
  const viewSource = fs.readFileSync(
    path.join(__dirname, "../src/features/goals/goals-view.js"),
    "utf8"
  );
  vm.runInContext(resourceSource, context);
  vm.runInContext(viewSource, context);
  return context;
}

test("classic browser script and CommonJS expose the same public API", () => {
  assert.equal(typeof core.simulatePlan, "function");

  const source = fs.readFileSync(
    path.join(__dirname, "../src/features/goals/goals-core.js"),
    "utf8"
  );
  const context = {};
  vm.runInNewContext(source, context);

  assert.equal(typeof context.GoalPlannerCore.normalizePlan, "function");
  assert.equal(context.GoalPlannerCore.DEFAULT_PLAN.targetAmount, 100000000);

  const firstDefault = core.defaultPlan();
  const secondDefault = core.defaultPlan();
  assert.notEqual(firstDefault, secondDefault);
  assert.notEqual(firstDefault.profile, secondDefault.profile);
  assert.notEqual(firstDefault.scenarios, secondDefault.scenarios);
});

test("goal view excludes age-hidden policy selections from the projection", () => {
  const context = loadGoalViewContext();
  const plan = core.defaultPlan();
  plan.profile.birthYear = new Date().getFullYear() - 50;
  plan.policySelections = [{
    id: "youth-future-savings",
    enabled: true,
    amount: 1000000,
    frequency: "one-time",
    startMonth: 1,
    duration: null
  }];

  const calculationPlan = context.goalCalculationPlan(plan, { monthlyContribution: 0 });

  assert.equal(calculationPlan.events.some((event) => event.id === "policy-youth-future-savings"), false);
});

test("goal view treats an enabled side-hustle loss as a recurring expense", () => {
  const context = loadGoalViewContext();
  const plan = core.defaultPlan();
  plan.sideHustle = {
    ...plan.sideHustle,
    enabled: true,
    unitPrice: 0,
    monthlySales: 0,
    monthlyCosts: 100000,
    contributionRate: 0,
    startMonth: 2,
    duration: 3
  };

  const sideMath = context.goalSideHustleMath(plan);
  const calculationPlan = context.goalCalculationPlan(plan, { monthlyContribution: 0 });
  const loss = calculationPlan.events.find((event) => event.id === "side-hustle-monthly-loss");

  assert.equal(sideMath.monthlyNet, -100000);
  assert.equal(sideMath.contribution, -100000);
  assert.equal(calculationPlan.sideIncome.monthlyAmount, 0);
  assert.equal(loss.monthlyAmount, -100000);
  assert.equal(loss.startMonth, 2);
  assert.equal(loss.duration, 3);
});

test("month-end contributions produce the requested 48 and 60 month baseline", () => {
  const projection = core.simulatePlan(BASE_PLAN);

  assert.equal(projection.timeline[0].balance, 10000000);
  assert.equal(projection.timeline[1].balance, 11500000);
  assert.equal(projection.projection48, 82000000);
  assert.equal(projection.projection60, 100000000);
  assert.equal(projection.achievementMonth, 60);
  assert.equal(projection.achievable, true);
  assert.equal(projection.status, "achieved");
});

test("annual effective return is converted to an equivalent monthly return", () => {
  closeTo(core.annualToMonthlyRate(0.04), 0.0032737397821989145, 1e-15);

  const projection = core.simulatePlan(BASE_PLAN, { annualReturnRate: 0.04 });
  closeTo(projection.projection48, 89526347.41094875, 0.01);
});

test("events apply one-time and monthly deltas at the configured month-end", () => {
  const plan = core.normalizePlan({
    targetAmount: 10000,
    monthlyContribution: 100,
    events: [{
      label: "이사",
      type: "housing",
      startMonth: 2,
      duration: 3,
      oneTimeDelta: -500,
      monthlyDelta: -20
    }]
  });
  const projection = core.simulatePlan(plan);

  assert.equal(plan.events[0].label, "이사");
  assert.equal(plan.events[0].type, "housing");
  assert.equal(plan.events[0].oneTimeAmount, -500);
  assert.equal(plan.events[0].monthlyAmount, -20);
  assert.equal(projection.timeline[1].balance, 100);
  assert.equal(projection.timeline[2].balance, -320);
  assert.equal(projection.timeline[3].balance, -240);
  assert.equal(projection.timeline[4].balance, -160);
  assert.equal(projection.timeline[5].balance, -60);
});

test("side income and confirmed support include monthly and one-time cash flows", () => {
  const plan = {
    targetAmount: 10000,
    monthlyContribution: 100,
    sideIncome: {
      startMonth: 2,
      duration: 2,
      oneTimeAmount: 1000,
      monthlyAmount: 200
    },
    confirmedSupport: {
      startMonth: 3,
      duration: 1,
      oneTimeAmount: 500,
      monthlyAmount: 50
    }
  };
  const projection = core.simulatePlan(plan);
  const thirdMonth = core.cashFlowAtMonth(plan, 3);

  assert.equal(projection.timeline[2].balance, 1400);
  assert.equal(projection.timeline[3].balance, 2250);
  assert.equal(projection.timeline[4].balance, 2350);
  assert.deepEqual(thirdMonth, {
    eventOneTime: 0,
    eventMonthly: 0,
    sideIncomeOneTime: 0,
    sideIncomeMonthly: 200,
    supportOneTime: 500,
    supportMonthly: 50,
    total: 750
  });
});

test("inflation toggle raises the goal line using an annual effective rate", () => {
  const fixedPlan = {
    targetAmount: 100,
    currentAssets: 0,
    monthlyContribution: 100,
    annualInflationRate: 0.12
  };
  const fixed = core.simulatePlan(fixedPlan);
  const inflationAdjusted = core.simulatePlan({ ...fixedPlan, inflationEnabled: true });

  assert.equal(fixed.achievementMonth, 1);
  assert.equal(inflationAdjusted.achievementMonth, 2);
  closeTo(core.targetAmountAtMonth({ ...fixedPlan, inflationEnabled: true }, 12), 112, 1e-9);
  assert.equal(core.targetAmountAtMonth(fixedPlan, 12), 100);
});

test("required contribution search accounts for return and fixed cash flows", () => {
  closeTo(core.requiredMonthlyContribution(BASE_PLAN, 48, 0), 1875000, 0.0001);
  closeTo(core.requiredMonthlyContribution(BASE_PLAN, 60, 0), 1500000, 0.0001);

  const requiredWithReturn = core.requiredMonthlyContribution(BASE_PLAN, 60, 0.04);
  assert.ok(requiredWithReturn > 0);
  assert.ok(requiredWithReturn < 1500000);

  const requiredWithSupport = core.requiredMonthlyContribution({
    ...BASE_PLAN,
    confirmedSupport: { oneTimeAmount: 6000000, startMonth: 1, duration: 0 }
  }, 60, 0);
  closeTo(requiredWithSupport, 1400000, 0.0001);

  assert.equal(core.requiredMonthlyContribution({
    targetAmount: 100,
    currentAssets: 100
  }, 0, 0), 0);
  assert.equal(core.requiredMonthlyContribution({
    targetAmount: 100,
    currentAssets: 0
  }, 0, 0), null);
});

test("scenario comparison returns UI-ready projections and unreachable states", () => {
  const comparison = core.compareScenarios(BASE_PLAN);
  const cash = comparison.find((scenario) => scenario.id === "cash");
  const stocks = comparison.find((scenario) => scenario.id === "stocks");

  assert.deepEqual(comparison.map((scenario) => scenario.id), [
    "cash",
    "savings",
    "stocks",
    "realEstate",
    "mixed"
  ]);
  assert.equal(cash.projection48, 82000000);
  assert.equal(cash.projection60, 100000000);
  assert.equal(cash.achievementMonth, 60);
  assert.equal(cash.monthsShortened, 0);
  closeTo(cash.required48, 1875000, 0.0001);
  closeTo(cash.required60, 1500000, 0.0001);
  assert.equal(cash.series.length, 601);
  assert.equal(stocks.achievementMonth, 52);
  assert.equal(stocks.monthsShortened, 8);

  const unreachable = core.compareScenarios({
    targetAmount: 100000000,
    currentAssets: 0,
    monthlyContribution: -1000
  });
  unreachable.forEach((scenario) => {
    assert.equal(scenario.achievementMonth, null);
    assert.equal(scenario.achievable, false);
    assert.equal(scenario.status, "unreachable");
    assert.equal(scenario.monthsShortened, null);
  });
});

test("normalization clamps unsafe boundaries and preserves supported UI metadata", () => {
  const normalized = core.normalizePlan({
    targetName: "  내 집 종잣돈  ",
    targetAmount: -1,
    deadlineMonths: 48,
    baselineMode: "manual",
    manualMonthlyIncome: -20,
    manualMonthlyContribution: -20,
    currentAssets: -100,
    monthlyContribution: -123,
    annualReturnRate: -5,
    inflationEnabled: "true",
    annualInflationRate: 99,
    maxMonths: 9999,
    events: [{
      label: " 결혼 ",
      type: "life-event",
      startMonth: -2,
      duration: 9999,
      oneTimeAmount: "-10,000",
      monthlyAmount: Number.POSITIVE_INFINITY
    }],
    sideIncome: {
      startMonth: 9999,
      duration: -4,
      oneTimeAmount: -100,
      monthlyAmount: -100
    },
    scenarios: [{
      id: "stocks",
      label: " 공격형 ",
      annualReturnRate: 99,
      enabled: "false"
    }],
    profile: {
      birthYear: 1800,
      region: " seoul ",
      housingStatus: " renter ",
      employmentStatus: " employed "
    },
    policySelections: [
      " youth ",
      {
        id: "youth",
        enabled: false,
        amount: "1,000,000",
        frequency: "monthly",
        startMonth: 0,
        duration: 9999
      },
      "",
      "housing"
    ],
    sideHustle: {
      enabled: true,
      pathId: " handmade ",
      hobby: " 도예 ",
      weeklyHours: 999,
      unitPrice: -1,
      monthlySales: -1,
      monthlyCosts: -1,
      taxReserveRate: 110,
      contributionRate: -10,
      initialCost: -1,
      startMonth: 0,
      duration: 9999
    },
    updatedAt: " 2026-08-11T00:00:00.000Z "
  });

  assert.equal(normalized.targetName, "내 집 종잣돈");
  assert.equal(normalized.targetAmount, 1);
  assert.equal(normalized.deadlineMonths, 48);
  assert.equal(normalized.baselineMode, "manual");
  assert.equal(normalized.manualMonthlyIncome, 0);
  assert.equal(normalized.manualMonthlyContribution, 0);
  assert.equal(normalized.currentAssets, 0);
  assert.equal(normalized.monthlyContribution, -123);
  assert.equal(normalized.annualReturnRate, -0.99);
  assert.equal(normalized.inflationEnabled, true);
  assert.equal(normalized.annualInflationRate, 10);
  assert.equal(normalized.maxMonths, 600);
  assert.deepEqual(normalized.events[0], {
    enabled: true,
    label: "결혼",
    type: "life-event",
    startMonth: 1,
    duration: 600,
    oneTimeAmount: -10000,
    monthlyAmount: 0
  });
  assert.equal(normalized.sideIncome.startMonth, 600);
  assert.equal(normalized.sideIncome.duration, 0);
  assert.equal(normalized.sideIncome.oneTimeAmount, 0);
  assert.equal(normalized.sideIncome.monthlyAmount, 0);
  assert.equal(normalized.scenarios.length, 5);
  assert.equal(normalized.scenarios[2].label, "공격형");
  assert.equal(normalized.scenarios[2].annualReturnRate, 10);
  assert.equal(normalized.scenarios[2].enabled, false);
  assert.deepEqual(normalized.profile, {
    birthYear: 1900,
    region: "seoul",
    housingStatus: "renter",
    employmentStatus: "employed"
  });
  assert.deepEqual(normalized.policySelections, [
    {
      id: "youth",
      enabled: false,
      amount: 1000000,
      frequency: "monthly",
      startMonth: 1,
      duration: 600
    },
    {
      id: "housing",
      enabled: true,
      amount: 0,
      frequency: "one-time",
      startMonth: 1,
      duration: null
    }
  ]);
  assert.deepEqual(normalized.sideHustle, {
    enabled: true,
    pathId: "handmade",
    hobby: "도예",
    weeklyHours: 168,
    unitPrice: 0,
    monthlySales: 0,
    monthlyCosts: 0,
    taxReserveRate: 100,
    contributionRate: 0,
    initialCost: 0,
    startMonth: 1,
    duration: 600
  });
  assert.equal(normalized.updatedAt, "2026-08-11T00:00:00.000Z");

  const defaults = core.normalizePlan({
    deadlineMonths: 49,
    baselineMode: "unknown",
    maxMonths: -1
  });
  assert.equal(defaults.deadlineMonths, 60);
  assert.equal(defaults.baselineMode, "auto");
  assert.equal(defaults.maxMonths, 60);
  assert.equal(defaults.profile.birthYear, null);
  assert.equal(core.normalizePlan(core.defaultPlan()).profile.birthYear, null);
  assert.equal(core.normalizePlan({ profile: { birthYear: null } }).profile.birthYear, null);
});
