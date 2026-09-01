(function attachGoalPlannerCore(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GoalPlannerCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createGoalPlannerCore() {
  "use strict";

  const MAX_MONTHS = 600;
  const MIN_PROJECTION_MONTHS = 60;
  const MAX_MONEY = Number.MAX_SAFE_INTEGER;
  const MIN_ANNUAL_RATE = -0.99;
  const MAX_ANNUAL_RATE = 10;

  const DEFAULT_SCENARIOS = Object.freeze([
    Object.freeze({ id: "cash", label: "무수익", annualReturnRate: 0, enabled: true }),
    Object.freeze({ id: "savings", label: "예적금", annualReturnRate: 0.03, enabled: true }),
    Object.freeze({ id: "stocks", label: "주식", annualReturnRate: 0.06, enabled: true }),
    Object.freeze({ id: "realEstate", label: "부동산 간접투자", annualReturnRate: 0.045, enabled: true }),
    Object.freeze({ id: "mixed", label: "혼합", annualReturnRate: 0.045, enabled: true })
  ]);

  const EMPTY_INCOME_SOURCE = Object.freeze({
    enabled: true,
    label: "",
    type: "income",
    startMonth: 1,
    duration: null,
    oneTimeAmount: 0,
    monthlyAmount: 0
  });

  const EMPTY_PROFILE = Object.freeze({
    birthYear: null,
    region: "",
    housingStatus: "",
    employmentStatus: ""
  });

  const EMPTY_SIDE_HUSTLE = Object.freeze({
    enabled: false,
    pathId: "",
    hobby: "",
    weeklyHours: 0,
    unitPrice: 0,
    monthlySales: 0,
    monthlyCosts: 0,
    taxReserveRate: 0,
    contributionRate: 100,
    initialCost: 0,
    startMonth: 1,
    duration: null
  });

  const DEFAULT_PLAN = Object.freeze({
    targetName: "1억 만들기",
    targetAmount: 100000000,
    deadlineMonths: 60,
    baselineMode: "auto",
    manualMonthlyIncome: 0,
    manualMonthlyContribution: 0,
    currentAssets: 0,
    monthlyContribution: 0,
    annualReturnRate: 0,
    inflationEnabled: false,
    annualInflationRate: 0,
    maxMonths: MAX_MONTHS,
    events: Object.freeze([]),
    sideIncome: EMPTY_INCOME_SOURCE,
    confirmedSupport: EMPTY_INCOME_SOURCE,
    scenarios: DEFAULT_SCENARIOS,
    profile: EMPTY_PROFILE,
    policySelections: Object.freeze([]),
    sideHustle: EMPTY_SIDE_HUSTLE,
    updatedAt: ""
  });

  function finiteNumber(value, fallback = 0) {
    const normalized = typeof value === "string" ? value.replace(/[\s,]/g, "") : value;
    if (normalized === "") return fallback;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function boundedNumber(value, fallback, minimum, maximum) {
    return clamp(finiteNumber(value, fallback), minimum, maximum);
  }

  function boundedInteger(value, fallback, minimum, maximum) {
    return Math.round(boundedNumber(value, fallback, minimum, maximum));
  }

  function normalizedBoolean(value, fallback) {
    if (value === true || value === false) return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    return fallback;
  }

  function normalizedText(value, fallback = "") {
    const text = typeof value === "string" ? value.trim() : "";
    return text || fallback;
  }

  function normalizedAnnualRate(value, fallback = 0) {
    return boundedNumber(value, fallback, MIN_ANNUAL_RATE, MAX_ANNUAL_RATE);
  }

  function normalizedDuration(value) {
    if (value === null || value === undefined || value === "") return null;
    return boundedInteger(value, 0, 0, MAX_MONTHS);
  }

  function normalizeFlow(source, defaults, options = {}) {
    const raw = source && typeof source === "object" ? source : {};
    const allowNegative = options.allowNegative === true;
    const minimumAmount = allowNegative ? -MAX_MONEY : 0;
    const oneTimeValue = raw.oneTimeAmount ?? raw.oneTimeDelta;
    const monthlyValue = raw.monthlyAmount ?? raw.monthlyDelta;

    return {
      ...(raw.id === undefined ? {} : { id: String(raw.id) }),
      enabled: normalizedBoolean(raw.enabled, defaults.enabled),
      label: normalizedText(raw.label, defaults.label),
      type: normalizedText(raw.type, defaults.type),
      startMonth: boundedInteger(raw.startMonth, defaults.startMonth, 1, MAX_MONTHS),
      duration: normalizedDuration(raw.duration ?? defaults.duration),
      oneTimeAmount: boundedNumber(
        oneTimeValue,
        defaults.oneTimeAmount,
        minimumAmount,
        MAX_MONEY
      ),
      monthlyAmount: boundedNumber(
        monthlyValue,
        defaults.monthlyAmount,
        minimumAmount,
        MAX_MONEY
      )
    };
  }

  function normalizeEvent(event, index) {
    return normalizeFlow(
      event,
      {
        enabled: true,
        label: `이벤트 ${index + 1}`,
        type: "event",
        startMonth: 1,
        duration: null,
        oneTimeAmount: 0,
        monthlyAmount: 0
      },
      { allowNegative: true }
    );
  }

  function normalizeIncomeSource(source, label, type) {
    return normalizeFlow(source, {
      enabled: true,
      label,
      type,
      startMonth: 1,
      duration: null,
      oneTimeAmount: 0,
      monthlyAmount: 0
    });
  }

  function normalizeScenarios(scenarios) {
    const overrides = new Map();

    if (Array.isArray(scenarios)) {
      scenarios.forEach((scenario) => {
        if (scenario && typeof scenario === "object" && scenario.id) {
          overrides.set(String(scenario.id), scenario);
        }
      });
    } else if (scenarios && typeof scenarios === "object") {
      Object.entries(scenarios).forEach(([id, scenario]) => {
        if (scenario && typeof scenario === "object") {
          overrides.set(id, { ...scenario, id });
        }
      });
    }

    return DEFAULT_SCENARIOS.map((defaults) => {
      const source = overrides.get(defaults.id) || {};
      return {
        id: defaults.id,
        label: normalizedText(source.label, defaults.label),
        annualReturnRate: normalizedAnnualRate(source.annualReturnRate, defaults.annualReturnRate),
        enabled: normalizedBoolean(source.enabled, defaults.enabled)
      };
    });
  }

  function normalizeProfile(profile) {
    const source = profile && typeof profile === "object" ? profile : {};
    const hasBirthYear = source.birthYear !== null
      && source.birthYear !== undefined
      && source.birthYear !== "";
    const rawBirthYear = hasBirthYear
      ? finiteNumber(source.birthYear, Number.NaN)
      : Number.NaN;
    return {
      birthYear: Number.isFinite(rawBirthYear)
        ? boundedInteger(rawBirthYear, 0, 1900, 2100)
        : null,
      region: normalizedText(source.region),
      housingStatus: normalizedText(source.housingStatus),
      employmentStatus: normalizedText(source.employmentStatus)
    };
  }

  function normalizePolicySelections(policySelections) {
    if (!Array.isArray(policySelections)) return [];
    const normalized = new Map();

    policySelections.forEach((selection) => {
      const source = selection && typeof selection === "object"
        ? selection
        : { id: selection };
      const id = normalizedText(String(source.id ?? ""));
      if (!id) return;

      normalized.set(id, {
        id,
        enabled: normalizedBoolean(source.enabled, true),
        amount: boundedNumber(source.amount, 0, 0, MAX_MONEY),
        frequency: source.frequency === "monthly" ? "monthly" : "one-time",
        startMonth: boundedInteger(source.startMonth, 1, 1, MAX_MONTHS),
        duration: normalizedDuration(source.duration)
      });
    });

    return [...normalized.values()];
  }

  function normalizeSideHustle(sideHustle) {
    const source = sideHustle && typeof sideHustle === "object" ? sideHustle : {};
    return {
      enabled: normalizedBoolean(source.enabled, EMPTY_SIDE_HUSTLE.enabled),
      pathId: normalizedText(source.pathId),
      hobby: normalizedText(source.hobby),
      weeklyHours: boundedNumber(source.weeklyHours, 0, 0, 168),
      unitPrice: boundedNumber(source.unitPrice, 0, 0, MAX_MONEY),
      monthlySales: boundedNumber(source.monthlySales, 0, 0, MAX_MONEY),
      monthlyCosts: boundedNumber(source.monthlyCosts, 0, 0, MAX_MONEY),
      taxReserveRate: boundedNumber(source.taxReserveRate, 0, 0, 100),
      contributionRate: boundedNumber(source.contributionRate, 100, 0, 100),
      initialCost: boundedNumber(source.initialCost, 0, 0, MAX_MONEY),
      startMonth: boundedInteger(source.startMonth, 1, 1, MAX_MONTHS),
      duration: normalizedDuration(source.duration)
    };
  }

  function normalizePlan(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const events = Array.isArray(source.events)
      ? source.events.filter((event) => event && typeof event === "object").map(normalizeEvent)
      : [];

    return {
      targetName: normalizedText(source.targetName, DEFAULT_PLAN.targetName),
      targetAmount: boundedNumber(source.targetAmount, DEFAULT_PLAN.targetAmount, 1, MAX_MONEY),
      deadlineMonths: Number(source.deadlineMonths) === 48 ? 48 : 60,
      baselineMode: ["auto", "savings", "manual"].includes(source.baselineMode)
        ? source.baselineMode
        : DEFAULT_PLAN.baselineMode,
      manualMonthlyIncome: boundedNumber(
        source.manualMonthlyIncome,
        DEFAULT_PLAN.manualMonthlyIncome,
        0,
        MAX_MONEY
      ),
      manualMonthlyContribution: boundedNumber(
        source.manualMonthlyContribution,
        DEFAULT_PLAN.manualMonthlyContribution,
        0,
        MAX_MONEY
      ),
      currentAssets: boundedNumber(source.currentAssets, DEFAULT_PLAN.currentAssets, 0, MAX_MONEY),
      monthlyContribution: boundedNumber(
        source.monthlyContribution,
        DEFAULT_PLAN.monthlyContribution,
        -MAX_MONEY,
        MAX_MONEY
      ),
      annualReturnRate: normalizedAnnualRate(
        source.annualReturnRate,
        DEFAULT_PLAN.annualReturnRate
      ),
      inflationEnabled: normalizedBoolean(
        source.inflationEnabled ?? source.adjustForInflation,
        DEFAULT_PLAN.inflationEnabled
      ),
      annualInflationRate: normalizedAnnualRate(
        source.annualInflationRate,
        DEFAULT_PLAN.annualInflationRate
      ),
      maxMonths: boundedInteger(
        source.maxMonths,
        DEFAULT_PLAN.maxMonths,
        MIN_PROJECTION_MONTHS,
        MAX_MONTHS
      ),
      events,
      sideIncome: normalizeIncomeSource(source.sideIncome, "부업 수입", "side-income"),
      confirmedSupport: normalizeIncomeSource(
        source.confirmedSupport,
        "확정 지원금",
        "confirmed-support"
      ),
      scenarios: normalizeScenarios(source.scenarios),
      profile: normalizeProfile(source.profile),
      policySelections: normalizePolicySelections(source.policySelections),
      sideHustle: normalizeSideHustle(source.sideHustle),
      updatedAt: normalizedText(source.updatedAt)
    };
  }

  function defaultPlan() {
    return normalizePlan({});
  }

  function annualToMonthlyRate(annualRate) {
    const rate = finiteNumber(annualRate, 0);
    if (rate <= -1) return -1;
    return Math.expm1(Math.log1p(rate) / 12);
  }

  function targetForMonth(plan, month) {
    if (!plan.inflationEnabled || month <= 0) return plan.targetAmount;
    const monthlyInflationRate = annualToMonthlyRate(plan.annualInflationRate);
    return plan.targetAmount * Math.pow(1 + monthlyInflationRate, month);
  }

  function targetAmountAtMonth(planInput, month) {
    const plan = normalizePlan(planInput);
    const normalizedMonth = boundedInteger(month, 0, 0, MAX_MONTHS);
    return targetForMonth(plan, normalizedMonth);
  }

  function flowAmountAtMonth(flow, month) {
    if (!flow.enabled || month < flow.startMonth) {
      return { oneTime: 0, monthly: 0, total: 0 };
    }

    const oneTime = month === flow.startMonth ? flow.oneTimeAmount : 0;
    const isWithinDuration = flow.duration === null || month < flow.startMonth + flow.duration;
    const monthly = isWithinDuration ? flow.monthlyAmount : 0;
    return { oneTime, monthly, total: oneTime + monthly };
  }

  function cashFlowBreakdown(plan, month) {
    let eventOneTime = 0;
    let eventMonthly = 0;

    plan.events.forEach((event) => {
      const amount = flowAmountAtMonth(event, month);
      eventOneTime += amount.oneTime;
      eventMonthly += amount.monthly;
    });

    const sideIncome = flowAmountAtMonth(plan.sideIncome, month);
    const confirmedSupport = flowAmountAtMonth(plan.confirmedSupport, month);
    const total = eventOneTime
      + eventMonthly
      + sideIncome.total
      + confirmedSupport.total;

    return {
      eventOneTime,
      eventMonthly,
      sideIncomeOneTime: sideIncome.oneTime,
      sideIncomeMonthly: sideIncome.monthly,
      supportOneTime: confirmedSupport.oneTime,
      supportMonthly: confirmedSupport.monthly,
      total
    };
  }

  function cashFlowAtMonth(planInput, month) {
    const plan = normalizePlan(planInput);
    const normalizedMonth = boundedInteger(month, 1, 1, MAX_MONTHS);
    return cashFlowBreakdown(plan, normalizedMonth);
  }

  function hasReached(balance, target) {
    return balance >= target || Math.abs(balance - target) < 0.000001;
  }

  function simulateNormalizedPlan(plan, options = {}) {
    const annualReturnRate = normalizedAnnualRate(
      options.annualReturnRate,
      plan.annualReturnRate
    );
    const monthlyContribution = boundedNumber(
      options.monthlyContribution,
      plan.monthlyContribution,
      -MAX_MONEY,
      MAX_MONEY
    );
    const maxMonths = boundedInteger(options.maxMonths, plan.maxMonths, 0, MAX_MONTHS);
    const monthlyReturnRate = annualToMonthlyRate(annualReturnRate);
    const initialTarget = targetForMonth(plan, 0);
    const timeline = [{
      month: 0,
      balance: plan.currentAssets,
      target: initialTarget,
      investmentReturn: 0,
      baseContribution: 0,
      additionalCashFlow: 0,
      totalContribution: 0
    }];
    let balance = plan.currentAssets;
    let achievementMonth = hasReached(balance, initialTarget) ? 0 : null;

    for (let month = 1; month <= maxMonths; month += 1) {
      const investmentReturn = balance > 0 ? balance * monthlyReturnRate : 0;
      const additionalCashFlow = cashFlowBreakdown(plan, month).total;
      const totalContribution = monthlyContribution + additionalCashFlow;
      balance += investmentReturn + totalContribution;
      const target = targetForMonth(plan, month);

      timeline.push({
        month,
        balance,
        target,
        investmentReturn,
        baseContribution: monthlyContribution,
        additionalCashFlow,
        totalContribution
      });

      if (achievementMonth === null && hasReached(balance, target)) {
        achievementMonth = month;
      }
    }

    const balanceAt = (month) => timeline[month]?.balance ?? null;

    return {
      plan,
      annualReturnRate,
      monthlyReturnRate,
      monthlyContribution,
      maxMonths,
      achievementMonth,
      monthsToGoal: achievementMonth,
      achievable: achievementMonth !== null,
      status: achievementMonth === null ? "unreachable" : "achieved",
      projection48: balanceAt(48),
      projection60: balanceAt(60),
      finalBalance: balance,
      timeline
    };
  }

  function simulatePlan(planInput, options = {}) {
    return simulateNormalizedPlan(normalizePlan(planInput), options);
  }

  function projectBalanceAtMonth(plan, horizonMonths, annualReturnRate, monthlyContribution) {
    const monthlyReturnRate = annualToMonthlyRate(annualReturnRate);
    let balance = plan.currentAssets;

    for (let month = 1; month <= horizonMonths; month += 1) {
      const investmentReturn = balance > 0 ? balance * monthlyReturnRate : 0;
      balance += investmentReturn
        + monthlyContribution
        + cashFlowBreakdown(plan, month).total;
    }

    return balance;
  }

  function requiredMonthlyContribution(planInput, horizonMonths, annualReturnRate) {
    const plan = normalizePlan(planInput);
    const horizon = boundedInteger(horizonMonths, 0, 0, MAX_MONTHS);
    const rate = normalizedAnnualRate(annualReturnRate, plan.annualReturnRate);
    const target = targetForMonth(plan, horizon);

    if (hasReached(projectBalanceAtMonth(plan, horizon, rate, 0), target)) return 0;
    if (horizon === 0 || !Number.isFinite(target)) return null;

    let low = 0;
    let high = Math.max(1, target / horizon);
    while (
      high < MAX_MONEY
      && !hasReached(projectBalanceAtMonth(plan, horizon, rate, high), target)
    ) {
      high = Math.min(MAX_MONEY, high * 2);
    }

    if (!hasReached(projectBalanceAtMonth(plan, horizon, rate, high), target)) return null;

    for (let iteration = 0; iteration < 80; iteration += 1) {
      const middle = (low + high) / 2;
      if (hasReached(projectBalanceAtMonth(plan, horizon, rate, middle), target)) {
        high = middle;
      } else {
        low = middle;
      }
    }

    return high;
  }

  function compareScenarios(planInput, scenarioOverrides) {
    const source = planInput && typeof planInput === "object" ? planInput : {};
    const plan = normalizePlan(
      scenarioOverrides === undefined ? source : { ...source, scenarios: scenarioOverrides }
    );
    const cashScenario = plan.scenarios.find((scenario) => scenario.id === "cash");
    const cashProjection = simulateNormalizedPlan(plan, {
      annualReturnRate: cashScenario.annualReturnRate
    });

    return plan.scenarios
      .filter((scenario) => scenario.enabled)
      .map((scenario) => {
        const projection = scenario.id === "cash"
          ? cashProjection
          : simulateNormalizedPlan(plan, { annualReturnRate: scenario.annualReturnRate });
        const monthsShortened = cashProjection.achievementMonth !== null
          && projection.achievementMonth !== null
          ? cashProjection.achievementMonth - projection.achievementMonth
          : null;

        return {
          id: scenario.id,
          label: scenario.label,
          annualReturnRate: scenario.annualReturnRate,
          projection48: projection.projection48,
          projection60: projection.projection60,
          achievementMonth: projection.achievementMonth,
          monthsShortened,
          required48: requiredMonthlyContribution(plan, 48, scenario.annualReturnRate),
          required60: requiredMonthlyContribution(plan, 60, scenario.annualReturnRate),
          achievable: projection.achievable,
          status: projection.status,
          series: projection.timeline.map(({ month, balance, target }) => ({ month, balance, target }))
        };
      });
  }

  return Object.freeze({
    DEFAULT_PLAN,
    DEFAULT_SCENARIOS,
    MAX_MONTHS,
    defaultPlan,
    normalizePlan,
    normalizeScenarios,
    annualToMonthlyRate,
    targetAmountAtMonth,
    cashFlowAtMonth,
    simulatePlan,
    requiredMonthlyContribution,
    compareScenarios
  });
});
