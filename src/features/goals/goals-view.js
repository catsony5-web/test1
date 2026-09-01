let goalControlsReady = false;
let goalHasRendered = false;

function defaultGoalEvents() {
  return [
    { id: "wedding-service", label: "결혼서비스", type: "expense", enabled: false, startMonth: 24, duration: 1, oneTimeAmount: 0, monthlyAmount: 0 },
    { id: "marriage-additional-costs", label: "추가 결혼비", type: "expense", enabled: false, startMonth: 24, duration: 1, oneTimeAmount: 0, monthlyAmount: 0 },
    { id: "housing-deposit-change", label: "보증금 증가", type: "liquidity", enabled: false, startMonth: 18, duration: 1, oneTimeAmount: 0, monthlyAmount: 0 },
    { id: "moving-and-setup-cost", label: "이사·중개·가구비", type: "expense", enabled: false, startMonth: 18, duration: 1, oneTimeAmount: 0, monthlyAmount: 0 },
    { id: "monthly-housing-cost-change", label: "월 주거비 증가", type: "expense", enabled: false, startMonth: 18, duration: 42, oneTimeAmount: 0, monthlyAmount: 0 },
    { id: "income-break", label: "소득 중단·휴직", type: "expense", enabled: false, startMonth: 30, duration: 3, oneTimeAmount: 0, monthlyAmount: 0 },
    { id: "custom", label: "예상 밖 현금 영향", type: "custom", enabled: false, startMonth: 12, duration: 1, oneTimeAmount: 0, monthlyAmount: 0 }
  ];
}

function normalizeGoalUiPlan(value = goalPlan) {
  const normalized = GoalPlannerCore.normalizePlan(value);
  if (!normalized.events.length) normalized.events = defaultGoalEvents();
  return GoalPlannerCore.normalizePlan(normalized);
}

function setupGoalControls() {
  const root = els.goalPlannerRoot;
  if (!root || goalControlsReady) return;
  goalControlsReady = true;
  root.addEventListener("change", handleGoalControlChange);
  root.addEventListener("click", handleGoalActionClick);
}

function handleGoalControlChange(event) {
  const control = event.target;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;

  if (control.dataset.goalField) {
    updateGoalPlan((draft) => {
      const field = control.dataset.goalField;
      const value = goalControlValue(control);
      draft[field] = field === "annualInflationRate" ? goalNumber(value) / 100 : value;
      if (field === "manualMonthlyContribution") draft.baselineMode = "manual";
    });
    return;
  }
  if (control.dataset.goalProfileField) {
    updateGoalPlan((draft) => {
      draft.profile ||= {};
      const field = control.dataset.goalProfileField;
      draft.profile[field] = field === "birthYear" && control.value === "" ? null : goalControlValue(control);
    });
    return;
  }
  if (control.dataset.goalScenarioRate) {
    updateGoalPlan((draft) => {
      const scenario = draft.scenarios.find((item) => item.id === control.dataset.goalScenarioRate);
      if (scenario) scenario.annualReturnRate = goalNumber(control.value) / 100;
    });
    return;
  }
  if (control.dataset.goalEventField) {
    updateGoalPlan((draft) => {
      const item = draft.events.find((entry) => entry.id === control.dataset.goalEventId);
      if (!item) return;
      const field = control.dataset.goalEventField;
      let value = goalControlValue(control);
      if (["oneTimeAmount", "monthlyAmount"].includes(field) && item.type !== "custom") {
        value = -Math.abs(goalNumber(value));
      }
      item[field] = value;
    });
    return;
  }
  if (control.dataset.goalPolicyField) {
    updateGoalPlan((draft) => {
      const selection = ensureGoalPolicySelection(draft, control.dataset.goalPolicyId);
      selection[control.dataset.goalPolicyField] = goalControlValue(control);
    });
    return;
  }
  if (control.dataset.goalSideField) {
    updateGoalPlan((draft) => {
      draft.sideHustle ||= {};
      draft.sideHustle[control.dataset.goalSideField] = goalControlValue(control);
    });
  }
}

function handleGoalActionClick(event) {
  const button = event.target.closest("[data-goal-action]");
  if (!button) return;
  const action = button.dataset.goalAction;

  if (action === "reset") {
    if (!confirm("자산 목표 설정과 시나리오를 추천 기본값으로 되돌릴까요?")) return;
    goalPlan = normalizeGoalUiPlan(GoalPlannerCore.defaultPlan());
    goalPlan.updatedAt = new Date().toISOString();
    void saveGoalPlan();
    renderGoals();
    return;
  }
  if (action === "open-income") {
    switchView("income");
    document.querySelector("#incomeView")?.scrollIntoView({ block: "start" });
    return;
  }
  if (action === "apply-event-reference") {
    const reference = goalLifeEventReferences().find((item) => item.id === button.dataset.goalEventId);
    if (!reference?.referenceValueKRW) return;
    updateGoalPlan((draft) => {
      const item = draft.events.find((entry) => entry.id === reference.id);
      if (!item) return;
      item.enabled = true;
      item.oneTimeAmount = -Math.abs(reference.referenceValueKRW);
    });
    return;
  }
  if (action === "select-side-path") {
    updateGoalPlan((draft) => {
      draft.sideHustle ||= {};
      draft.sideHustle.pathId = button.dataset.goalSidePath || "";
    });
  }
}

function goalControlValue(control) {
  if (control.type === "checkbox") return control.checked;
  if (control.type === "number" || control.dataset.goalNumber === "true") return goalNumber(control.value);
  return control.value;
}

function goalNumber(value) {
  const number = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(number) ? number : 0;
}

function ensureGoalPolicySelection(plan, policyId) {
  plan.policySelections ||= [];
  let selection = plan.policySelections.find((item) => item.id === policyId);
  if (!selection) {
    selection = { id: policyId, enabled: false, amount: 0, frequency: "one-time", startMonth: 1, duration: 12 };
    plan.policySelections.push(selection);
  }
  return selection;
}

function updateGoalPlan(mutator) {
  const draft = structuredClone(normalizeGoalUiPlan());
  mutator(draft);
  draft.updatedAt = new Date().toISOString();
  goalPlan = normalizeGoalUiPlan(draft);
  void saveGoalPlan();
  renderGoals();
}

function captureGoalFocus(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active)) return null;
  const data = Object.entries(active.dataset || {}).filter(([key]) => key.startsWith("goal"));
  if (!data.length) return null;
  return {
    tagName: active.tagName,
    type: active.type || "",
    value: active.type === "radio" ? active.value : null,
    data
  };
}

function restoreGoalFocus(root, focusKey) {
  if (!focusKey) return;
  const target = [...root.querySelectorAll(focusKey.tagName.toLowerCase())].find((control) => (
    (control.type || "") === focusKey.type
    && (focusKey.value === null || control.value === focusKey.value)
    && focusKey.data.every(([key, value]) => control.dataset[key] === value)
  ));
  target?.focus({ preventScroll: true });
}

function goalCompletedFlowBaseline(plan) {
  const currentMonth = currentMonthKey();
  const rows = buildMonthlyFlowRows(reportingExpenseRows(classified))
    .filter((row) => row.month < currentMonth)
    .filter((row) => [row.income, row.consumptionSpend, row.actualSavings, row.debtRepayment].some((value) => Number(value || 0) !== 0))
    .sort((a, b) => a.month.localeCompare(b.month, "ko-KR"))
    .slice(-12);
  const average = (field) => rows.length
    ? Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) / rows.length)
    : 0;
  const averageIncome = average("income");
  const averageConsumption = average("consumptionSpend");
  const averageSavings = average("actualSavings");
  const averageDebt = average("debtRepayment");
  const averageCapacity = Math.round(rows.length
    ? rows.reduce((total, row) => total + Number(row.income || 0) - Number(row.consumptionSpend || 0) - Number(row.debtRepayment || 0), 0) / rows.length
    : 0);
  const monthlyContribution = plan.baselineMode === "manual"
    ? plan.manualMonthlyContribution
    : plan.baselineMode === "savings"
      ? averageSavings
      : rows.length
        ? averageCapacity
        : plan.manualMonthlyContribution;
  const monthlyIncome = plan.manualMonthlyIncome > 0 ? plan.manualMonthlyIncome : averageIncome;

  return {
    rows,
    period: rows.length ? `${rows[0].month}~${rows.at(-1).month}` : "완료 월 데이터 없음",
    averageIncome,
    averageConsumption,
    averageSavings,
    averageDebt,
    averageCapacity,
    monthlyContribution,
    monthlyIncome,
    annualIncome: monthlyIncome * 12
  };
}

function goalSideHustleMath(plan) {
  const side = plan.sideHustle;
  const revenue = side.unitPrice * side.monthlySales;
  const preTaxNet = revenue - side.monthlyCosts;
  const taxReserve = Math.max(0, preTaxNet) * side.taxReserveRate / 100;
  const monthlyNet = preTaxNet - taxReserve;
  const contribution = monthlyNet < 0
    ? monthlyNet
    : monthlyNet * side.contributionRate / 100;
  const monthlyHours = side.weeklyHours * 4.345;
  return {
    revenue,
    preTaxNet,
    taxReserve,
    monthlyNet,
    contribution,
    hourlyNet: monthlyHours > 0 ? monthlyNet / monthlyHours : 0
  };
}

function goalCalculationPlan(plan, baseline, options = {}) {
  const includePolicies = options.includePolicies !== false;
  const includeSide = options.includeSide !== false;
  const sideMath = goalSideHustleMath(plan);
  const eligiblePolicyIds = new Set(
    goalSupportCards()
      .filter((card) => goalPolicyAgeMatch(card, plan.profile.birthYear))
      .map((card) => card.id)
  );
  const policyEvents = includePolicies
    ? plan.policySelections.filter((item) => eligiblePolicyIds.has(item.id) && item.enabled && item.amount > 0).map((item) => ({
      id: `policy-${item.id}`,
      label: "확인한 정책·절세 금액",
      type: "support",
      enabled: true,
      startMonth: item.startMonth,
      duration: item.frequency === "monthly" ? (item.duration || 12) : 1,
      oneTimeAmount: item.frequency === "one-time" ? item.amount : 0,
      monthlyAmount: item.frequency === "monthly" ? item.amount : 0
    }))
    : [];
  const sideCostEvent = includeSide && plan.sideHustle.enabled && plan.sideHustle.initialCost > 0
    ? [{
      id: "side-hustle-initial-cost",
      label: "부업 초기비용",
      type: "expense",
      enabled: true,
      startMonth: plan.sideHustle.startMonth,
      duration: 1,
      oneTimeAmount: -plan.sideHustle.initialCost,
      monthlyAmount: 0
    }]
    : [];
  const sideLossEvent = includeSide && plan.sideHustle.enabled && sideMath.contribution < 0
    ? [{
      id: "side-hustle-monthly-loss",
      label: "부업 월 손실",
      type: "expense",
      enabled: true,
      startMonth: plan.sideHustle.startMonth,
      duration: plan.sideHustle.duration,
      oneTimeAmount: 0,
      monthlyAmount: sideMath.contribution
    }]
    : [];

  return GoalPlannerCore.normalizePlan({
    ...plan,
    monthlyContribution: baseline.monthlyContribution,
    events: [...plan.events, ...policyEvents, ...sideCostEvent, ...sideLossEvent],
    sideIncome: {
      enabled: includeSide && plan.sideHustle.enabled,
      label: "검증한 부업 순수익",
      type: "side-income",
      startMonth: plan.sideHustle.startMonth,
      duration: plan.sideHustle.duration,
      oneTimeAmount: 0,
      monthlyAmount: includeSide && plan.sideHustle.enabled ? Math.max(0, sideMath.contribution) : 0
    },
    confirmedSupport: { enabled: false, oneTimeAmount: 0, monthlyAmount: 0 }
  });
}

function renderGoals() {
  if (!els.goalPlannerRoot) return;
  const focusKey = captureGoalFocus(els.goalPlannerRoot);
  goalPlan = normalizeGoalUiPlan();
  const baseline = goalCompletedFlowBaseline(goalPlan);
  const calculationPlan = goalCalculationPlan(goalPlan, baseline);
  const comparisons = GoalPlannerCore.compareScenarios(calculationPlan);
  const cash = comparisons.find((item) => item.id === "cash") || comparisons[0];
  const deadlineProjection = cash?.[goalPlan.deadlineMonths === 48 ? "projection48" : "projection60"] || 0;

  els.goalPlannerRoot.innerHTML = `
    <div class="goal-planner">
      <p class="goal-sr-only" data-goal-live-status aria-live="polite" aria-atomic="true"></p>
      ${renderGoalHero(goalPlan, baseline, calculationPlan, comparisons)}
      ${renderGoalInputs(goalPlan, baseline)}
      ${renderGoalScenarios(goalPlan, calculationPlan, comparisons)}
      ${renderGoalEvents(goalPlan)}
      ${renderGoalPolicies(goalPlan, baseline, comparisons)}
      ${renderGoalSideHustle(goalPlan, baseline, comparisons)}
      <footer class="goal-disclaimer">
        <i class="ti ti-shield-check" aria-hidden="true"></i>
        <p><strong>교육용 추정치입니다.</strong> 수익률은 보장되지 않으며 투자·세무·법률 자문이 아닙니다. 정책 금액은 공식 기관에서 자격과 실제 금액을 확인한 뒤에만 반영하세요.</p>
      </footer>
    </div>
  `;
  restoreGoalFocus(els.goalPlannerRoot, focusKey);
  if (goalHasRendered) {
    const status = els.goalPlannerRoot.querySelector("[data-goal-live-status]");
    setTimeout(() => {
      if (!status?.isConnected) return;
      status.textContent = `목표 계산이 갱신되었습니다. 무수익 경로 달성 예상 ${formatGoalDuration(cash?.achievementMonth)}, ${goalPlan.deadlineMonths}개월 예상 잔액 ${formatWon(Math.round(deadlineProjection))}.`;
    }, 0);
  }
  goalHasRendered = true;
}

function renderGoalHero(plan, baseline, calculationPlan, comparisons) {
  const cash = comparisons.find((item) => item.id === "cash") || comparisons[0];
  const deadline = plan.deadlineMonths;
  const targetAtDeadline = GoalPlannerCore.targetAmountAtMonth(calculationPlan, deadline);
  const projected = deadline === 48 ? cash?.projection48 : cash?.projection60;
  const shortfall = targetAtDeadline - Number(projected || 0);
  const required = deadline === 48 ? cash?.required48 : cash?.required60;
  const progress = Math.min(100, Math.max(0, plan.currentAssets / Math.max(plan.targetAmount, 1) * 100));
  const dataStatus = baseline.rows.length
    ? `최근 완료 ${baseline.rows.length}개월 · ${baseline.period}`
    : "가계부 수입·지출 데이터가 없어 수동 납입액을 사용합니다";

  return `
    <header class="goal-hero">
      <div class="goal-hero-copy">
        <span class="goal-kicker">GOAL ROUTE · LOCAL ONLY</span>
        <h2>${escapeHtml(plan.targetName)}</h2>
        <p>현재 현금흐름에서 출발해 저축·투자·생활 이벤트·추가 수입이 목표 시간을 얼마나 바꾸는지 같은 계산선 위에서 비교합니다.</p>
        <nav class="goal-jump-nav" aria-label="자산 목표 화면 바로가기">
          <a href="#goalRoute">경로 비교</a><a href="#goalEvents">생활 이벤트</a><a href="#goalSupport">정책·절세</a><a href="#goalSide">부업 실험</a>
        </nav>
      </div>
      <div class="goal-hero-figure" style="--goal-progress: ${progress.toFixed(1)}%">
        <span>현재 목표 자산</span>
        <strong>${formatGoalCompactWon(plan.currentAssets)}</strong>
        <small>${formatGoalCompactWon(plan.targetAmount)}의 ${progress.toFixed(1)}%</small>
      </div>
      <div class="goal-hero-result">
        <span>현재 경로 예상</span>
        <strong>${formatGoalDuration(cash?.achievementMonth)}</strong>
        <small>${goalAchievementDate(cash?.achievementMonth)}</small>
      </div>
      <div class="goal-hero-result ${shortfall > 0 ? "is-warning" : "is-positive"}">
        <span>${deadline}개월 뒤</span>
        <strong>${shortfall > 0 ? `${formatGoalCompactWon(shortfall)} 부족` : `${formatGoalCompactWon(Math.abs(shortfall))} 여유`}</strong>
        <small>기한 달성 월 필요액 ${required === null ? "계산 불가" : formatGoalCompactWon(required)}</small>
      </div>
      <div class="goal-hero-meta">
        <span>${escapeHtml(dataStatus)}</span>
        <button type="button" data-goal-action="reset"><i class="ti ti-refresh" aria-hidden="true"></i> 추천값으로 초기화</button>
      </div>
    </header>
  `;
}

function renderGoalInputs(plan, baseline) {
  return `
    <section class="goal-editor" aria-labelledby="goalEditorTitle">
      <div class="goal-section-heading">
        <div><span class="goal-section-index">01 / INPUT</span><h3 id="goalEditorTitle">목표와 출발 속도</h3><p>가계부 완료 월을 기본값으로 쓰고 필요한 항목만 직접 보정합니다.</p></div>
      </div>
      <div class="goal-editor-grid">
        <div class="goal-form-card">
          <h4>목표 정의</h4>
          <div class="goal-form-grid">
            <label class="goal-field goal-field-wide"><span>목표 이름</span><input type="text" data-goal-field="targetName" value="${escapeHtml(plan.targetName)}" maxlength="40"></label>
            <label class="goal-field"><span>목표금액</span><input type="number" data-goal-field="targetAmount" min="1" step="100000" value="${plan.targetAmount}"><small>${formatWon(plan.targetAmount)}</small></label>
            <label class="goal-field"><span>현재 유동 금융자산</span><input type="number" data-goal-field="currentAssets" min="0" step="100000" value="${plan.currentAssets}"><small>예금·투자자산, 부동산 제외</small></label>
            <fieldset class="goal-segment goal-field-wide"><legend>목표기한</legend><label><input type="radio" data-goal-field="deadlineMonths" name="goalDeadline" value="48" ${plan.deadlineMonths === 48 ? "checked" : ""}><span>4년 · 48개월</span></label><label><input type="radio" data-goal-field="deadlineMonths" name="goalDeadline" value="60" ${plan.deadlineMonths === 60 ? "checked" : ""}><span>5년 · 60개월</span></label></fieldset>
            <label class="goal-switch goal-field-wide"><input type="checkbox" data-goal-field="inflationEnabled" ${plan.inflationEnabled ? "checked" : ""}><span><strong>현재 구매력 기준 목표</strong><small>물가만큼 목표선을 매년 높입니다</small></span></label>
            <label class="goal-field ${plan.inflationEnabled ? "" : "is-muted"}"><span>연 물가상승률</span><div class="goal-suffix-input"><input type="number" data-goal-field="annualInflationRate" step="0.1" min="0" max="20" value="${(plan.annualInflationRate * 100).toFixed(1)}" ${plan.inflationEnabled ? "" : "disabled"}><b>%</b></div></label>
          </div>
        </div>
        <div class="goal-form-card goal-baseline-card">
          <div class="goal-card-title-row"><h4>가계부 기준선</h4><span>${baseline.rows.length}개월 표본</span></div>
          <div class="goal-baseline-metrics">
            ${goalMiniMetric("월평균 총수입", baseline.averageIncome, "수입 거래 전체")}
            ${goalMiniMetric("월평균 실제 저축", baseline.averageSavings, "적금·예금 분류")}
            ${goalMiniMetric("구조적 저축 여력", baseline.averageCapacity, "수입−소비−대출원금", true)}
            ${goalMiniMetric("연환산 수입", baseline.annualIncome, plan.manualMonthlyIncome > 0 ? "수동 월수입×12" : "월평균×12")}
          </div>
          <fieldset class="goal-baseline-choice"><legend>계산에 사용할 월 납입액</legend>
            <label><input type="radio" name="goalBaselineMode" data-goal-field="baselineMode" value="auto" ${plan.baselineMode === "auto" ? "checked" : ""}><span><strong>저축 여력</strong><small>${formatSignedWon(baseline.averageCapacity)}</small></span></label>
            <label><input type="radio" name="goalBaselineMode" data-goal-field="baselineMode" value="savings" ${plan.baselineMode === "savings" ? "checked" : ""}><span><strong>실제 저축</strong><small>${formatWon(baseline.averageSavings)}</small></span></label>
            <label><input type="radio" name="goalBaselineMode" data-goal-field="baselineMode" value="manual" ${plan.baselineMode === "manual" ? "checked" : ""}><span><strong>직접 입력</strong><small>${formatWon(plan.manualMonthlyContribution)}</small></span></label>
          </fieldset>
          <div class="goal-form-grid goal-manual-grid">
            <label class="goal-field"><span>세후 월수입 보정</span><input type="number" data-goal-field="manualMonthlyIncome" min="0" step="10000" value="${plan.manualMonthlyIncome}"><small>0이면 가계부 평균 사용</small></label>
            <label class="goal-field"><span>직접 월 납입액</span><input type="number" data-goal-field="manualMonthlyContribution" min="0" step="10000" value="${plan.manualMonthlyContribution}"><small>수동 기준 또는 데이터 없을 때</small></label>
          </div>
          ${baseline.rows.length ? `<p class="goal-data-note"><i class="ti ti-database" aria-hidden="true"></i>${escapeHtml(baseline.period)}의 음수 월까지 포함한 평균입니다.</p>` : `<p class="goal-data-note is-warning"><i class="ti ti-alert-circle" aria-hidden="true"></i>정확도를 높이려면 수입과 소비를 입력하거나 직접 월 납입액을 설정하세요. <button type="button" data-goal-action="open-income">수입 입력 열기</button></p>`}
        </div>
      </div>
    </section>
  `;
}

function goalMiniMetric(label, value, note, signed = false) {
  return `<div><span>${escapeHtml(label)}</span><strong>${signed ? formatSignedWon(value) : formatWon(value)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function renderGoalScenarios(plan, calculationPlan, comparisons) {
  const deadline = plan.deadlineMonths;
  return `
    <section id="goalRoute" class="goal-route-section" aria-labelledby="goalRouteTitle">
      <div class="goal-section-heading">
        <div><span class="goal-section-index">02 / ROUTE</span><h3 id="goalRouteTitle">어떤 경로가 시간을 줄이는가</h3><p>모든 경로는 같은 월 납입액과 생활 이벤트를 사용합니다. 수익률은 세금·수수료 차감 후 가정으로 직접 조정하세요.</p></div>
        <span class="goal-section-stamp">48 / 60 MONTHS</span>
      </div>
      <div class="goal-scenario-rate-grid">
        ${plan.scenarios.map((scenario) => `
          <label class="goal-rate-card goal-rate-${escapeHtml(scenario.id)}">
            <span>${escapeHtml(scenario.label)}</span>
            <div><input type="number" data-goal-scenario-rate="${escapeHtml(scenario.id)}" step="0.1" min="-50" max="100" value="${(scenario.annualReturnRate * 100).toFixed(1)}"><b>%</b></div>
            <small>${scenario.id === "realEstate" ? "리츠·부동산펀드 등 간접투자" : "세후 연수익률 가정"}</small>
          </label>
        `).join("")}
      </div>
      <div class="goal-route-layout">
        <div class="goal-chart-card">
          <div class="goal-chart-head"><div><strong>자산 경로</strong><span>목표선과 월말 잔액</span></div><span>${formatGoalCompactWon(calculationPlan.monthlyContribution)} / 월</span></div>
          ${renderGoalChart(comparisons, calculationPlan)}
        </div>
        <div class="goal-route-cards">
          ${comparisons.map((item) => renderGoalRouteCard(item, deadline)).join("")}
        </div>
      </div>
      ${renderGoalComparisonTable(comparisons, deadline)}
      <p class="goal-risk-note"><i class="ti ti-alert-circle" aria-hidden="true"></i>주식과 부동산 간접투자는 4~5년 동안 손실이 날 수 있습니다. 표의 수익률은 예측이나 추천이 아니라 비교용 가정입니다. 직접 주택 매입은 대출·세금·거래비용이 필요해 이 단순 경로에 포함하지 않습니다.</p>
    </section>
  `;
}

function renderGoalRouteCard(item, deadline) {
  const projection = deadline === 48 ? item.projection48 : item.projection60;
  const required = deadline === 48 ? item.required48 : item.required60;
  return `
    <article class="goal-route-card goal-route-${escapeHtml(item.id)}">
      <div><span class="goal-route-dot" aria-hidden="true"></span><strong>${escapeHtml(item.label)}</strong><small>연 ${(item.annualReturnRate * 100).toFixed(1)}%</small></div>
      <p>${formatGoalDuration(item.achievementMonth)}</p>
      <dl><div><dt>기본 대비</dt><dd>${formatGoalShortening(item.monthsShortened)}</dd></div><div><dt>${deadline}개월 잔액</dt><dd>${formatGoalCompactWon(projection)}</dd></div><div><dt>필요 월납입</dt><dd>${required === null ? "—" : formatGoalCompactWon(required)}</dd></div></dl>
    </article>
  `;
}

function renderGoalChart(comparisons, plan) {
  const horizon = 60;
  const width = 900;
  const height = 340;
  const margin = { top: 24, right: 20, bottom: 42, left: 78 };
  const points = comparisons.flatMap((item) => item.series.filter((point) => point.month <= horizon));
  const targets = comparisons[0]?.series.filter((point) => point.month <= horizon) || [];
  const values = [...points.map((point) => point.balance), ...targets.map((point) => point.target), 0];
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const range = Math.max(1, maxValue - minValue);
  const x = (month) => margin.left + month / horizon * (width - margin.left - margin.right);
  const y = (value) => margin.top + (maxValue - value) / range * (height - margin.top - margin.bottom);
  const path = (series, field) => series.filter((point) => point.month <= horizon).map((point, index) => `${index ? "L" : "M"}${x(point.month).toFixed(2)},${y(point[field]).toFixed(2)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => minValue + range * index / 4).reverse();
  const xTicks = [0, 12, 24, 36, 48, 60];

  return `
    <div class="goal-chart-scroll" tabindex="0" aria-label="자산 경로 그래프, 가로로 스크롤할 수 있습니다">
      <svg class="goal-route-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="goalChartTitle goalChartDesc">
        <title id="goalChartTitle">시나리오별 60개월 자산 경로</title>
        <desc id="goalChartDesc">무수익, 예적금, 주식, 부동산 간접투자, 혼합 경로의 월말 자산과 목표선을 비교합니다.</desc>
        ${yTicks.map((tick) => `<g class="goal-chart-grid"><line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}"></line><text x="${margin.left - 12}" y="${y(tick) + 4}" text-anchor="end">${escapeHtml(formatGoalAxisWon(tick))}</text></g>`).join("")}
        ${xTicks.map((tick) => `<g class="goal-chart-axis"><line x1="${x(tick)}" y1="${height - margin.bottom}" x2="${x(tick)}" y2="${height - margin.bottom + 6}"></line><text x="${x(tick)}" y="${height - 16}" text-anchor="middle">${tick}개월</text></g>`).join("")}
        <path class="goal-target-line" d="${path(targets, "target")}"></path>
        ${comparisons.map((item) => `<path class="goal-series goal-series-${escapeHtml(item.id)}" d="${path(item.series, "balance")}"></path>`).join("")}
        ${comparisons.map((item) => {
          const point48 = item.series.find((point) => point.month === 48);
          const point60 = item.series.find((point) => point.month === 60);
          return [point48, point60].filter(Boolean).map((point) => `<circle class="goal-point goal-series-${escapeHtml(item.id)}" cx="${x(point.month)}" cy="${y(point.balance)}" r="4"></circle>`).join("");
        }).join("")}
      </svg>
    </div>
    <div class="goal-chart-legend" aria-label="그래프 범례">
      ${comparisons.map((item) => `<span class="goal-legend-${escapeHtml(item.id)}"><svg viewBox="0 0 22 8" aria-hidden="true"><line class="goal-series goal-series-${escapeHtml(item.id)}" x1="1" y1="4" x2="21" y2="4"></line></svg>${escapeHtml(item.label)}</span>`).join("")}<span class="goal-legend-target"><i></i>목표선</span>
    </div>
  `;
}

function renderGoalComparisonTable(comparisons, deadline) {
  return `
    <div class="table-wrap goal-comparison-wrap" tabindex="0" aria-label="목표 시나리오 비교표, 가로로 스크롤할 수 있습니다">
      <table class="goal-comparison-table">
        <thead><tr><th scope="col">경로</th><th scope="col">세후 수익률 가정</th><th scope="col">달성 예상</th><th scope="col">단축</th><th scope="col">48개월 잔액</th><th scope="col">60개월 잔액</th><th scope="col">${deadline}개월 달성 월납입</th></tr></thead>
        <tbody>${comparisons.map((item) => `<tr><th scope="row"><span class="goal-table-dot goal-legend-${escapeHtml(item.id)}"><i></i>${escapeHtml(item.label)}</span></th><td>${(item.annualReturnRate * 100).toFixed(1)}%</td><td>${escapeHtml(formatGoalDuration(item.achievementMonth))}</td><td>${escapeHtml(formatGoalShortening(item.monthsShortened))}</td><td>${formatWon(Math.round(item.projection48))}</td><td>${formatWon(Math.round(item.projection60))}</td><td>${item[deadline === 48 ? "required48" : "required60"] === null ? "—" : formatWon(Math.round(item[deadline === 48 ? "required48" : "required60"]))}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderGoalEvents(plan) {
  const references = goalLifeEventReferences();
  return `
    <section id="goalEvents" class="goal-events-section" aria-labelledby="goalEventsTitle">
      <div class="goal-section-heading">
        <div><span class="goal-section-index">03 / LIFE</span><h3 id="goalEventsTitle">예상 밖의 일을 경로에 넣기</h3><p>모든 항목은 기본적으로 꺼져 있습니다. 발생 시점과 본인 부담액을 켠 항목만 계산합니다.</p></div>
        <span class="goal-section-stamp">OPTIONAL</span>
      </div>
      <div class="goal-event-grid">
        ${plan.events.map((item) => {
          const reference = references.find((entry) => entry.id === item.id);
          const isCustom = item.type === "custom";
          return `
            <article class="goal-event-card ${item.enabled ? "is-enabled" : ""}">
              <div class="goal-event-head"><div><span>${escapeHtml(reference?.category || (item.id === "income-break" ? "소득" : "사용자"))}</span><h4 id="goal-event-title-${escapeHtml(item.id)}">${escapeHtml(item.label)}</h4></div><label class="goal-toggle"><input type="checkbox" aria-label="${escapeHtml(item.label)} 경로에 반영" data-goal-event-id="${escapeHtml(item.id)}" data-goal-event-field="enabled" ${item.enabled ? "checked" : ""}><span aria-hidden="true"></span><b>${item.enabled ? "반영 중" : "미반영"}</b></label></div>
              <p>${escapeHtml(reference?.summary || (item.id === "income-break" ? "휴직·실직처럼 소득이 줄어드는 기간의 월 부족액을 직접 입력합니다." : "지출은 음수, 추가 수입은 양수로 입력할 수 있습니다."))}</p>
              <div class="goal-event-fields">
                <label><span>발생 시점</span><div class="goal-suffix-input"><input type="number" aria-label="${escapeHtml(item.label)} 발생 시점" min="1" max="600" data-goal-event-id="${escapeHtml(item.id)}" data-goal-event-field="startMonth" value="${item.startMonth}"><b>개월 후</b></div></label>
                <label><span>${isCustom ? "일회성 영향" : "일회성 비용"}</span><input type="number" aria-label="${escapeHtml(item.label)} ${isCustom ? "일회성 영향" : "일회성 비용"}" step="10000" data-goal-event-id="${escapeHtml(item.id)}" data-goal-event-field="oneTimeAmount" value="${isCustom ? item.oneTimeAmount : Math.abs(item.oneTimeAmount)}"></label>
                <label><span>${isCustom ? "월 영향" : item.id === "income-break" ? "월 소득 감소" : "월 추가 비용"}</span><input type="number" aria-label="${escapeHtml(item.label)} ${isCustom ? "월 영향" : item.id === "income-break" ? "월 소득 감소" : "월 추가 비용"}" step="10000" data-goal-event-id="${escapeHtml(item.id)}" data-goal-event-field="monthlyAmount" value="${isCustom ? item.monthlyAmount : Math.abs(item.monthlyAmount)}"></label>
                <label><span>지속</span><div class="goal-suffix-input"><input type="number" aria-label="${escapeHtml(item.label)} 지속 개월" min="1" max="600" data-goal-event-id="${escapeHtml(item.id)}" data-goal-event-field="duration" value="${item.duration || 1}"><b>개월</b></div></label>
              </div>
              ${reference ? `<div class="goal-reference"><span>${reference.manualOnly ? "직접 입력" : `${escapeHtml(reference.basisPeriod || "")} ${escapeHtml(reference.statisticType || "참고값")}`}</span>${reference.referenceValueKRW ? `<strong>${formatWon(reference.referenceValueKRW)}</strong><button type="button" data-goal-action="apply-event-reference" data-goal-event-id="${escapeHtml(item.id)}">참고값 적용</button>` : ""}<a href="${escapeHtml(reference.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.sourceName)} <i class="ti ti-world-www" aria-hidden="true"></i></a></div><small class="goal-event-scope">${escapeHtml(reference.scopeNote)}</small>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderGoalPolicies(plan, baseline, comparisons) {
  const cards = goalSupportCards().filter((card) => goalPolicyAgeMatch(card, plan.profile.birthYear));
  const sorted = cards.map((card) => ({ card, priority: goalPolicyProfilePriority(card, plan.profile) })).sort((a, b) => b.priority - a.priority || a.card.title.localeCompare(b.card.title, "ko-KR"));
  const withPolicies = comparisons.find((item) => item.id === "cash");
  const withoutPolicyPlan = goalCalculationPlan(plan, baseline, { includePolicies: false });
  const withoutPolicies = GoalPlannerCore.compareScenarios(withoutPolicyPlan).find((item) => item.id === "cash");
  const impact = goalImpactLabel(withoutPolicies?.achievementMonth, withPolicies?.achievementMonth);

  return `
    <section id="goalSupport" class="goal-support-section" aria-labelledby="goalSupportTitle">
      <div class="goal-section-heading">
        <div><span class="goal-section-index">04 / SUPPORT</span><h3 id="goalSupportTitle">2030·4050 정책과 절세 확인</h3><p>나이만으로 자격을 단정하지 않습니다. 후보를 공식 사이트에서 확인한 뒤 실제 금액만 경로에 넣습니다.</p></div>
        <div class="goal-impact-badge"><span>확인 금액 효과</span><strong>${escapeHtml(impact)}</strong></div>
      </div>
      <div class="goal-profile-bar">
        <label><span>출생연도</span><input type="number" min="1900" max="2100" data-goal-profile-field="birthYear" value="${plan.profile.birthYear || ""}" placeholder="예: 1995"></label>
        <label><span>지역</span><select data-goal-profile-field="region">${goalRegionOptions(plan.profile.region)}</select></label>
        <label><span>주거 상태</span><select data-goal-profile-field="housingStatus"><option value="" ${!plan.profile.housingStatus ? "selected" : ""}>선택 안 함</option><option value="no-home" ${plan.profile.housingStatus === "no-home" ? "selected" : ""}>무주택</option><option value="renter" ${plan.profile.housingStatus === "renter" ? "selected" : ""}>임차·월세</option><option value="owner" ${plan.profile.housingStatus === "owner" ? "selected" : ""}>주택 보유</option></select></label>
        <label><span>고용 상태</span><select data-goal-profile-field="employmentStatus"><option value="" ${!plan.profile.employmentStatus ? "selected" : ""}>선택 안 함</option><option value="employee" ${plan.profile.employmentStatus === "employee" ? "selected" : ""}>근로자</option><option value="self-employed" ${plan.profile.employmentStatus === "self-employed" ? "selected" : ""}>사업자·프리랜서</option><option value="jobseeker" ${plan.profile.employmentStatus === "jobseeker" ? "selected" : ""}>구직·전직</option></select></label>
        <div><span>연환산 수입 참고</span><strong>${formatWon(baseline.annualIncome)}</strong><small>자격 판정값이 아닙니다</small></div>
      </div>
      <div class="goal-policy-grid">
        ${sorted.map(({ card, priority }) => renderGoalPolicyCard(card, plan, priority)).join("")}
      </div>
      <p class="goal-resource-version">자료 버전 ${escapeHtml(goalResourceVersion())} · 최종 확인 ${escapeHtml(goalResourceVerifiedAt())} · 모집기간과 세법은 신청 시점에 다시 확인</p>
    </section>
  `;
}

function renderGoalPolicyCard(card, plan, priority) {
  const selection = plan.policySelections.find((item) => item.id === card.id) || { id: card.id, enabled: false, amount: 0, frequency: "one-time", startMonth: 1, duration: 12 };
  return `
    <article class="goal-policy-card ${selection.enabled ? "is-confirmed" : ""}">
      <div class="goal-policy-head"><div><span>${escapeHtml(card.category)}</span><h4 id="goal-policy-title-${escapeHtml(card.id)}">${escapeHtml(card.title)}</h4></div>${priority > 0 ? `<b>조건 우선 확인</b>` : `<b>공식 확인 필요</b>`}</div>
      <p>${escapeHtml(card.summary)}</p>
      <small>${escapeHtml(card.eligibilityNote)}</small>
      <a class="goal-source-link" href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.sourceName)}에서 확인 <i class="ti ti-world-www" aria-hidden="true"></i></a>
      <div class="goal-policy-confirm">
        <label class="goal-switch"><input type="checkbox" aria-label="${escapeHtml(card.title)} 공식 확인 금액 반영" data-goal-policy-id="${escapeHtml(card.id)}" data-goal-policy-field="enabled" ${selection.enabled ? "checked" : ""}><span><strong>공식 확인 금액 반영</strong><small>확인 전에는 0원</small></span></label>
        <div class="goal-policy-fields">
          <label><span>확인 금액</span><input type="number" aria-label="${escapeHtml(card.title)} 확인 금액" min="0" step="10000" data-goal-policy-id="${escapeHtml(card.id)}" data-goal-policy-field="amount" value="${selection.amount}"></label>
          <label><span>형태</span><select aria-label="${escapeHtml(card.title)} 지급 형태" data-goal-policy-id="${escapeHtml(card.id)}" data-goal-policy-field="frequency"><option value="one-time" ${selection.frequency === "one-time" ? "selected" : ""}>일회성</option><option value="monthly" ${selection.frequency === "monthly" ? "selected" : ""}>매월</option></select></label>
          <label><span>시작</span><div class="goal-suffix-input"><input type="number" aria-label="${escapeHtml(card.title)} 시작 개월" min="1" max="600" data-goal-policy-id="${escapeHtml(card.id)}" data-goal-policy-field="startMonth" value="${selection.startMonth}"><b>개월</b></div></label>
          ${selection.frequency === "monthly" ? `<label><span>지속</span><div class="goal-suffix-input"><input type="number" aria-label="${escapeHtml(card.title)} 지속 개월" min="1" max="600" data-goal-policy-id="${escapeHtml(card.id)}" data-goal-policy-field="duration" value="${selection.duration || 12}"><b>개월</b></div></label>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderGoalSideHustle(plan, baseline, comparisons) {
  const paths = goalSortedSidePaths(plan.sideHustle.hobby);
  const selected = paths.find((item) => item.id === plan.sideHustle.pathId) || null;
  const sideMath = goalSideHustleMath(plan);
  const withSide = comparisons.find((item) => item.id === "cash");
  const withoutSidePlan = goalCalculationPlan(plan, baseline, { includeSide: false });
  const withoutSide = GoalPlannerCore.compareScenarios(withoutSidePlan).find((item) => item.id === "cash");
  const impact = goalImpactLabel(withoutSide?.achievementMonth, withSide?.achievementMonth);

  return `
    <section id="goalSide" class="goal-side-section" aria-labelledby="goalSideTitle">
      <div class="goal-section-heading">
        <div><span class="goal-section-index">05 / EARN</span><h3 id="goalSideTitle">취미를 작은 수익 실험으로</h3><p>AI가 수입을 꾸며내지 않습니다. 첫 유료 검증을 설계하고 확인한 단가·판매량·비용으로만 목표 시간을 다시 계산합니다.</p></div>
        <div class="goal-impact-badge"><span>부업 반영 효과</span><strong>${escapeHtml(impact)}</strong></div>
      </div>
      <div class="goal-side-search">
        <label><span>내가 좋아하거나 잘하는 것</span><input type="text" data-goal-side-field="hobby" value="${escapeHtml(plan.sideHustle.hobby)}" placeholder="예: 엑셀, 사진, 글쓰기, 반려동물"></label>
        <p>입력한 단어와 가까운 실험을 앞으로 정렬합니다. 아이디어는 전부 로컬에서 고릅니다.</p>
      </div>
      <div class="goal-side-path-grid">
        ${paths.map((path) => `<article class="goal-side-path ${plan.sideHustle.pathId === path.id ? "is-selected" : ""}"><span>${escapeHtml(path.hobbySkill)}</span><h4>${escapeHtml(path.title)}</h4><p>${escapeHtml(path.offer)}</p><button type="button" data-goal-action="select-side-path" data-goal-side-path="${escapeHtml(path.id)}">${plan.sideHustle.pathId === path.id ? "선택됨" : "이 경로 선택"}</button></article>`).join("")}
      </div>
      <div class="goal-side-workbench">
        <div class="goal-side-brief">
          ${selected ? `<span>선택한 검증 경로</span><h4>${escapeHtml(selected.title)}</h4><dl><div><dt>판매물</dt><dd>${escapeHtml(selected.offer)}</dd></div><div><dt>첫 고객</dt><dd>${escapeHtml(selected.customer)}</dd></div><div><dt>채널</dt><dd>${selected.channels.map(escapeHtml).join(" · ")}</dd></div><div><dt>첫 실험</dt><dd>${escapeHtml(selected.firstExperiment)}</dd></div><div><dt>통과 기준</dt><dd>${escapeHtml(selected.validationMetric)}</dd></div></dl><p><i class="ti ti-alert-circle" aria-hidden="true"></i>${escapeHtml(selected.caution)}</p>` : `<span>검증 경로</span><h4>아이디어 카드를 하나 선택하세요</h4><p>고객과 첫 실험이 정해진 뒤에만 예상 수익을 목표 계산에 연결하는 편이 안전합니다.</p>`}
        </div>
        <div class="goal-side-numbers">
          <label class="goal-switch"><input type="checkbox" aria-label="검증한 부업 순수익을 목표에 반영" data-goal-side-field="enabled" ${plan.sideHustle.enabled ? "checked" : ""}><span><strong>검증한 순수익을 목표에 반영</strong><small>숫자를 확인한 뒤 켜세요</small></span></label>
          <div class="goal-form-grid">
            <label class="goal-field"><span>주당 가능 시간</span><div class="goal-suffix-input"><input type="number" min="0" max="168" step="0.5" data-goal-side-field="weeklyHours" value="${plan.sideHustle.weeklyHours}"><b>시간</b></div></label>
            <label class="goal-field"><span>판매 단가</span><input type="number" min="0" step="1000" data-goal-side-field="unitPrice" value="${plan.sideHustle.unitPrice}"></label>
            <label class="goal-field"><span>월 판매량</span><input type="number" min="0" step="1" data-goal-side-field="monthlySales" value="${plan.sideHustle.monthlySales}"></label>
            <label class="goal-field"><span>월 비용·수수료</span><input type="number" min="0" step="1000" data-goal-side-field="monthlyCosts" value="${plan.sideHustle.monthlyCosts}"></label>
            <label class="goal-field"><span>세금 유보율</span><div class="goal-suffix-input"><input type="number" min="0" max="100" step="1" data-goal-side-field="taxReserveRate" value="${plan.sideHustle.taxReserveRate}"><b>%</b></div></label>
            <label class="goal-field"><span>목표 투입 비율</span><div class="goal-suffix-input"><input type="number" min="0" max="100" step="5" data-goal-side-field="contributionRate" value="${plan.sideHustle.contributionRate}"><b>%</b></div></label>
            <label class="goal-field"><span>초기비용</span><input type="number" min="0" step="1000" data-goal-side-field="initialCost" value="${plan.sideHustle.initialCost}"></label>
            <label class="goal-field"><span>시작 시점</span><div class="goal-suffix-input"><input type="number" min="1" max="600" data-goal-side-field="startMonth" value="${plan.sideHustle.startMonth}"><b>개월 후</b></div></label>
          </div>
          <div class="goal-side-metrics">
            ${goalMiniMetric("월매출", sideMath.revenue, "단가×판매량")}
            ${goalMiniMetric("월순수익", sideMath.monthlyNet, `세금 유보 ${formatWon(sideMath.taxReserve)}`, true)}
            ${goalMiniMetric("목표 투입액", sideMath.contribution, sideMath.monthlyNet < 0 ? "손실은 전액 반영" : `${plan.sideHustle.contributionRate}% 반영`)}
            ${goalMiniMetric("시간당 순수익", sideMath.hourlyNet, "월 4.345주 환산", true)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function goalSupportCards() {
  return typeof GOAL_SUPPORT_CARDS === "undefined" ? [] : GOAL_SUPPORT_CARDS;
}

function goalLifeEventReferences() {
  return typeof GOAL_LIFE_EVENT_REFERENCES === "undefined" ? [] : GOAL_LIFE_EVENT_REFERENCES;
}

function goalSidePaths() {
  return typeof GOAL_SIDE_HUSTLE_PATHS === "undefined" ? [] : GOAL_SIDE_HUSTLE_PATHS;
}

function goalResourceVersion() {
  return typeof GOAL_RESOURCE_VERSION === "undefined" ? "-" : GOAL_RESOURCE_VERSION;
}

function goalResourceVerifiedAt() {
  return typeof GOAL_RESOURCE_VERIFIED_AT === "undefined" ? "-" : GOAL_RESOURCE_VERIFIED_AT;
}

function goalPolicyAgeMatch(card, birthYear) {
  if (!birthYear) return true;
  const age = new Date().getFullYear() - Number(birthYear);
  if (Number.isFinite(card.ageMin) && age < card.ageMin) return false;
  return !(Number.isFinite(card.ageMax) && age > card.ageMax);
}

function goalPolicyProfilePriority(card, profile) {
  const tags = new Set(card.profileTags || []);
  let score = 0;
  const housingTags = { "no-home": ["무주택"], renter: ["임차가구", "월세"], owner: ["주택보유"] };
  const employmentTags = { employee: ["근로자", "재직자"], "self-employed": ["사업자", "자영업자", "개인사업자", "소상공인"], jobseeker: ["구직자", "퇴직예정자", "이직준비"] };
  (housingTags[profile.housingStatus] || []).forEach((tag) => { if (tags.has(tag)) score += 2; });
  (employmentTags[profile.employmentStatus] || []).forEach((tag) => { if (tags.has(tag)) score += 2; });
  return score;
}

function goalSortedSidePaths(search) {
  const terms = String(search || "").toLocaleLowerCase("ko-KR").split(/[\s,·/]+/).filter(Boolean);
  return goalSidePaths().map((path, index) => {
    const haystack = [path.title, path.hobbySkill, path.offer, path.customer].join(" ").toLocaleLowerCase("ko-KR");
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    return { path, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.path);
}

function goalRegionOptions(selected) {
  const regions = ["", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  return regions.map((region) => `<option value="${escapeHtml(region)}" ${selected === region ? "selected" : ""}>${region || "선택 안 함"}</option>`).join("");
}

function formatGoalDuration(months) {
  if (months === null || months === undefined || !Number.isFinite(Number(months))) return "50년 안에 미달";
  const value = Math.max(0, Math.round(Number(months)));
  if (value === 0) return "이미 달성";
  const years = Math.floor(value / 12);
  const rest = value % 12;
  if (!years) return `${rest}개월`;
  return rest ? `${years}년 ${rest}개월` : `${years}년`;
}

function goalAchievementDate(months) {
  if (months === null || months === undefined || !Number.isFinite(Number(months))) return "현재 조건을 조정해야 합니다";
  if (Number(months) === 0) return "현재 자산이 목표 이상입니다";
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + Math.round(Number(months)));
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 예상`;
}

function formatGoalShortening(months) {
  if (months === null || months === undefined || !Number.isFinite(Number(months))) return "비교 불가";
  const value = Math.round(Number(months));
  if (value === 0) return "변화 없음";
  return value > 0 ? `${value}개월 단축` : `${Math.abs(value)}개월 증가`;
}

function goalImpactLabel(before, after) {
  if (before === null && after !== null) return "달성 가능 전환";
  if (before === null || after === null) return "아직 미달";
  return formatGoalShortening(before - after);
}

function formatGoalCompactWon(value) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "−" : "";
  const absolute = Math.abs(amount);
  if (absolute >= 100000000) return `${sign}${(absolute / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억`;
  if (absolute >= 10000) return `${sign}${Math.round(absolute / 10000).toLocaleString("ko-KR")}만`;
  return `${sign}${Math.round(absolute).toLocaleString("ko-KR")}원`;
}

function formatGoalAxisWon(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100000000) return `${(amount / 100000000).toFixed(1)}억`;
  return `${Math.round(amount / 10000).toLocaleString("ko-KR")}만`;
}
