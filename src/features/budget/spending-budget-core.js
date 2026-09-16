(function attachSpendingBudgetCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpendingBudgetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSpendingBudgetCore() {
  "use strict";

  const MAX_MONEY = 1000000000000;
  const MAX_PLANS = 500;
  // Public household statistics are context, not an individual's optimal budget.
  const BENCHMARKS = Object.freeze({
    single: { amount: 1689000, housingShare: 0.184, year: 2024,
      label: "전 연령 1인가구 월평균 소비", published: "2025-12-09",
      url: "https://mods.go.kr/board.es?act=view&bid=10820&list_no=442130&mid=a10301010000" },
    age: { year: 2025, published: "2026-03-31", amounts: { under40: 2824000, forties: 3847000, fifties: 3535000, over60: 2212000 },
      url: "https://mods.go.kr/board.es?act=view&bid=10820&list_no=443371&mid=a10301010000" }
  });

  function text(value, maximum = 120) {
    return typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum) : "";
  }

  function money(value, signed = false) {
    if (typeof value !== "number" && typeof value !== "string") return 0;
    const number = Number(typeof value === "string" ? value.replace(/[\s,]/g, "") : value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(Math.min(MAX_MONEY, Math.max(signed ? -MAX_MONEY : 0, number)));
  }

  function validMonth(value) {
    return typeof value === "string" && /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value) ? value : "";
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !validMonth(value.slice(0, 7))) return "";
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : "";
  }

  function optionalMoney(value) {
    if (value === null || value === undefined || !["number", "string"].includes(typeof value)
      || (typeof value === "string" && !value.replace(/[\s,]/g, ""))) return null;
    const parsed = Number(typeof value === "string" ? value.replace(/[\s,]/g, "") : value);
    return Number.isFinite(parsed) && parsed >= 0 ? money(parsed) : null;
  }

  function normalizeProfile(value) {
    const source = value && typeof value === "object" ? value : {};
    const select = (key, allowed, fallback = "") => allowed.includes(source[key]) ? source[key] : fallback;
    return {
      ageGroup: select("ageGroup", ["under40", "forties", "fifties", "over60", "undisclosed"]),
      living: select("living", ["alone", "family", "shared"]),
      incomeStability: select("incomeStability", ["stable", "variable"], "stable"),
      netIncome: optionalMoney(source.netIncome), housingCost: optionalMoney(source.housingCost),
      otherFixed: optionalMoney(source.otherFixed), ownPrincipal: optionalMoney(source.ownPrincipal),
      savingsGoal: money(source.savingsGoal), reserve: money(source.reserve),
      historyConfirmed: source.historyConfirmed === true
    };
  }

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const ids = new Set();
    const plans = [];
    for (const [index, item] of (Array.isArray(source.plans) ? source.plans.slice(0, MAX_PLANS) : []).entries()) {
      if (!item || typeof item !== "object") continue;
      const date = validDate(item.date);
      const month = validMonth(item.month) || date.slice(0, 7);
      const amount = money(item.amount);
      const id = text(item.id) || `plan-${index + 1}`;
      if (!month || !amount || ids.has(id)) continue;
      ids.add(id);
      plans.push({
        id,
        label: text(item.label) || "예정 소비",
        month,
        date: date.slice(0, 7) === month ? date : "",
        amount,
        recordKey: text(item.recordKey, 240),
        ...(item.sector ? { sector: text(item.sector) } : {})
      });
    }
    const settings = { monthlyLimit: money(source.monthlyLimit), savingsTarget: money(source.savingsTarget), plans };
    if (source.profile && typeof source.profile === "object") settings.profile = normalizeProfile(source.profile);
    if (source.monthlyTargets && typeof source.monthlyTargets === "object") {
      settings.monthlyTargets = {};
      for (const [month, target] of Object.entries(source.monthlyTargets)) {
        if (!validMonth(month) || !target || typeof target !== "object") continue;
        settings.monthlyTargets[month] = {
          monthlyLimit: money(target.monthlyLimit), foodTarget: money(target.foodTarget), savingsTarget: money(target.savingsTarget),
          source: target.source === "recommendation" ? "recommendation" : "manual"
        };
      }
    }
    return settings;
  }

  function targetsForMonth(value, month, foodTarget = 0) {
    const settings = normalizeSettings(value);
    return settings.monthlyTargets?.[validMonth(month)] || {
      monthlyLimit: settings.monthlyLimit, savingsTarget: settings.savingsTarget,
      foodTarget: money(foodTarget), source: "legacy"
    };
  }

  function recommend(value, history = []) {
    const profile = normalizeProfile(value);
    const missing = ["netIncome", "housingCost", "otherFixed", "ownPrincipal"].filter((key) => profile[key] === null);
    if (!profile.living) missing.push("living");
    if (missing.length) return { profile, ready: false, missing };
    const capacity = profile.netIncome - profile.savingsGoal - profile.ownPrincipal - profile.reserve;
    const fixed = profile.housingCost + profile.otherFixed;
    const historyRows = profile.historyConfirmed ? history.filter((row) => optionalMoney(row.total) !== null && optionalMoney(row.food) !== null).slice(-3) : [];
    const median = (values) => { const sorted = values.slice().sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
    let baseline = capacity;
    let basis = "income";
    if (historyRows.length === 3) {
      baseline = median(historyRows.map((row) => money(row.total)));
      basis = "history";
    } else if (profile.living === "alone") {
      baseline = BENCHMARKS.single.amount * (1 - BENCHMARKS.single.housingShare) + profile.housingCost;
      basis = "single-household";
    }
    const monthlyLimit = Math.max(0, Math.min(capacity, Math.max(fixed, Math.round(baseline))));
    // No fabricated food/age/income joint average. With insufficient personal history
    // the food target remains explicitly user-selected, rather than importing lodging.
    const foodTarget = historyRows.length === 3
      ? Math.max(0, Math.min(monthlyLimit - fixed, Math.round(median(historyRows.map((row) => money(row.food)))))) : null;
    return { profile, ready: true, canApply: capacity >= fixed && monthlyLimit > 0, capacity, fixed, monthlyLimit,
      foodTarget, savingsTarget: profile.savingsGoal, deficit: Math.max(0, fixed - capacity), basis,
      ageAverage: BENCHMARKS.age.amounts[profile.ageGroup] || null, singleAverage: profile.living === "alone" ? BENCHMARKS.single.amount : null };
  }

  function normalizeRows(source, month, excludedKeys = new Set()) {
    const seen = new Set(excludedKeys);
    const rows = [];
    for (const item of Array.isArray(source) ? source : []) {
      if (!item || typeof item !== "object") continue;
      const date = validDate(item.date);
      if (date && date.slice(0, 7) !== month) continue;
      const key = text(item.key, 240);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      rows.push({
        key,
        date,
        sector: text(item.sector) || "미분류",
        group: text(item.group) || "미분류",
        amount: money(item.amount, true)
      });
    }
    return rows;
  }

  function sum(rows) {
    return rows.reduce((total, row) => total + row.amount, 0);
  }

  function inWeek(date, week) {
    return Boolean(date && week && date >= week.start && date <= week.end);
  }

  function makeWeeks(month, dayCount, cap) {
    const [year, monthNumber] = month.split("-").map(Number);
    const firstOffset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
    const weeks = [];
    for (let startDay = 1; startDay <= dayCount;) {
      const endDay = Math.min(dayCount, startDay + 6 - (startDay === 1 ? firstOffset : 0));
      weeks.push({
        start: `${month}-${String(startDay).padStart(2, "0")}`,
        end: `${month}-${String(endDay).padStart(2, "0")}`,
        label: `${monthNumber}/${startDay}~${monthNumber}/${endDay}`,
        days: endDay - startDay + 1,
        // Cumulative rounding makes even partial-week targets sum to the exact cap.
        target: cap ? Math.round(cap * endDay / dayCount) - Math.round(cap * (startDay - 1) / dayCount) : null
      });
      startDay = endDay + 1;
    }
    return weeks;
  }

  function totalsBy(field, actualRows, futureRows, pendingRows, currentWeek) {
    const totals = new Map();
    function add(rows, kind) {
      for (const row of rows) {
        const label = row[field];
        if (!totals.has(label)) totals.set(label, { label, amount: 0, weekAmount: 0, actual: 0, futureRecorded: 0, pendingAmount: 0 });
        const total = totals.get(label);
        total.amount += row.amount;
        total[kind] += row.amount;
        if (kind === "actual" && inWeek(row.date, currentWeek)) total.weekAmount += row.amount;
      }
    }
    add(actualRows, "actual");
    add(futureRows, "futureRecorded");
    add(pendingRows, "pendingAmount");
    return Array.from(totals.values()).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "ko"));
  }

  function build(input = {}) {
    if (!input || typeof input !== "object") return null;
    const month = validMonth(input.month);
    const today = validDate(input.today);
    if (!month || !today) return null;

    const settings = normalizeSettings(input.settings);
    const targets = targetsForMonth(settings, month, input.foodTarget);
    const cap = targets.monthlyLimit;
    const period = month < today.slice(0, 7) ? "past" : month > today.slice(0, 7) ? "future" : "current";
    const [year, monthNumber] = month.split("-").map(Number);
    const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const rows = normalizeRows(input.rows, month);
    const rowKeys = new Set(rows.map((row) => row.key).filter(Boolean));
    const pendingRows = normalizeRows(input.pending, month, rowKeys);
    const actualRows = rows.filter((row) => period !== "future" && (!row.date || row.date <= today));
    const futureRows = rows.filter((row) => period === "future" || (row.date && row.date > today));
    const plans = settings.plans.filter((plan) => plan.month === month).map((plan) => {
      const linked = Boolean(plan.recordKey && rowKeys.has(plan.recordKey));
      return { ...plan, linked, reserved: !linked, missingLink: Boolean(plan.recordKey && !linked) };
    });
    const reservedPlans = plans.filter((plan) => plan.reserved);

    const actual = sum(actualRows);
    const futureRecorded = sum(futureRows);
    const monthTotal = actual + futureRecorded;
    const pendingAmount = sum(pendingRows);
    const planAmount = sum(reservedPlans);
    const committed = monthTotal + pendingAmount + planAmount;
    const remaining = cap ? cap - committed : null;
    const daysRemaining = period === "past" ? 0 : period === "future" ? dayCount : dayCount - Number(today.slice(8)) + 1;
    const weeks = makeWeeks(month, dayCount, cap).map((week) => {
      const amount = sum(actualRows.filter((row) => inWeek(row.date, week)));
      const futureAmount = sum(futureRows.filter((row) => inWeek(row.date, week)));
      const pending = sum(pendingRows.filter((row) => inWeek(row.date, week)));
      const planned = sum(reservedPlans.filter((plan) => inWeek(plan.date, week)));
      const weekCommitted = amount + futureAmount + pending + planned;
      return {
        ...week, amount, futureRecorded: futureAmount, pendingAmount: pending, planAmount: planned,
        committed: weekCommitted, remaining: cap ? week.target - weekCommitted : null
      };
    });
    const currentWeek = period === "current" ? weeks.find((week) => inWeek(today, week)) : null;
    const groups = totalsBy("group", actualRows, futureRows, pendingRows, currentWeek);
    const sectors = totalsBy("sector", actualRows, futureRows, pendingRows, currentWeek);
    const foodSector = sectors.find((sector) => sector.label === "식비");
    const foodPlans = sum(reservedPlans.filter((plan) => plan.sector === "식비"));
    const foodActual = foodSector?.actual || 0;
    const foodPending = (foodSector?.futureRecorded || 0) + (foodSector?.pendingAmount || 0) + foodPlans;
    const foodCommitted = foodActual + foodPending;
    const foodTarget = targets.foodTarget;
    const scenarioAmount = money(input.scenarioAmount);
    const incomeValue = typeof input.income === "string" ? input.income.replace(/[\s,]/g, "") : input.income;
    const hasIncome = incomeValue !== "" && (typeof incomeValue === "number" || typeof incomeValue === "string")
      && Number.isFinite(Number(incomeValue));
    // The target and recorded/planned savings are alternatives, never two deductions.
    // Principal is a separate cash commitment; card-bill settlements are not deducted.
    const incomeSupport = hasIncome ? money(input.income, true)
      - Math.max(targets.savingsTarget, money(input.actualSavings))
      - money(input.debtPrincipal) + money(input.familyAdjustment, true) : null;
    const warnings = [];
    const undatedCount = rows.filter((row) => !row.date).length;
    const undatedPendingCount = pendingRows.filter((row) => !row.date).length;
    const undatedPlanCount = reservedPlans.filter((plan) => !plan.date).length;
    const missingLinkCount = plans.filter((plan) => plan.missingLink).length;
    const linkedKeys = plans.filter((plan) => plan.linked).map((plan) => plan.recordKey);
    if (undatedCount) warnings.push(`날짜가 없거나 올바르지 않은 기록 ${undatedCount}건은 월 합계에만 반영됩니다.`);
    if (undatedPendingCount + undatedPlanCount) warnings.push(`날짜가 없는 예정 내역 ${undatedPendingCount + undatedPlanCount}건은 월 예약 금액에만 반영됩니다.`);
    if (missingLinkCount) warnings.push(`연결된 실제 내역을 찾지 못한 예정 소비 ${missingLinkCount}건은 예약 금액으로 유지됩니다.`);
    if (new Set(linkedKeys).size < linkedKeys.length) warnings.push("한 실제 거래로 여러 예약을 완료 처리했습니다. 합산 결제가 맞는지 확인하세요.");

    return {
      month, today, period, dayCount, cap, hasLimit: cap > 0,
      actual, futureRecorded, monthTotal, pendingAmount, planAmount, committed, remaining,
      daysRemaining,
      dailyAllowance: cap && daysRemaining ? Math.floor(Math.max(0, remaining) / daysRemaining) : null,
      incomeSupport, currentWeek, weeks, groups, sectors, plans, warnings,
      targets, foodTarget, foodActual, foodPending, foodCommitted,
      foodRemaining: foodTarget ? foodTarget - foodCommitted : null,
      scenario: {
        amount: scenarioAmount,
        budgetAfter: cap ? remaining - scenarioAmount : null,
        foodAfter: foodTarget ? foodTarget - foodCommitted - scenarioAmount : null
      }
    };
  }

  return { MAX_PLANS, BENCHMARKS, normalizeSettings, normalizeProfile, targetsForMonth, recommend, build };
});
