let spendingBudgetScenario = 0;
let spendingBudgetSaving = false;
let spendingBudgetTab = "overview";

function spendingBudgetGroup(item) {
  if (item.sector === "식비") {
    const labels = { coupang: "쿠팡 장보기", delivery: "배달", dining: "외식", other: "기타 식비·카페" };
    return labels[summaryFoodGroup(item)] || "기타 식비·카페";
  }
  return item.sector || "미분류";
}

function buildSpendingBudgetModel(month, today = defaultDateForMonth("")) {
  if (!isValidMonthKey(month)) return null;
  const snapshot = buildAnalysisMonthSnapshot(month);
  const activeIncome = classified.filter((item) => item.month === month && item.flow === "income"
    && item.status !== "취소/제외" && !isCanceled(item.cancel));
  const hasManualIncome = Object.prototype.hasOwnProperty.call(monthlyIncome, month)
    && monthlyIncome[month] !== null && monthlyIncome[month] !== "" && Number.isFinite(Number(monthlyIncome[month]));
  const occurrences = recurringOccurrencesForMonth(month, { showHidden: true }).filter((item) => !item.posted);
  const pendingConsumption = occurrences.filter((item) => !analysisIsSavingsTransaction(item));
  const rowFor = (item, pending = false) => ({
    key: pending ? `recurring:${item.id}:${month}` : item.recordKey,
    date: pending ? item.date : normalizeInputDate(item.approvalDate || item.date),
    sector: item.sector || "미분류", group: spendingBudgetGroup(item), amount: consumptionAmount(item)
  });
  const model = SpendingBudgetCore.build({
    month, today, settings: appSettings.spendingBudget,
    rows: snapshot.consumptionRows.map((item) => rowFor(item)),
    pending: pendingConsumption.map((item) => rowFor(item, true)),
    income: hasManualIncome || activeIncome.length
      ? (hasManualIncome ? Number(monthlyIncome[month]) : 0) + activeIncome.reduce((total, item) => total + incomeReportingAmount(item), 0) : null,
    debtPrincipal: snapshot.debtRepayment + sumDebtPrincipal(occurrences),
    actualSavings: snapshot.actualSavings + sumConsumption(occurrences.filter(analysisIsSavingsTransaction)),
    familyAdjustment: snapshot.loanSettlementDelta,
    foodTarget: appSettings.foodBudget.monthlyTarget, scenarioAmount: spendingBudgetScenario
  });
  model.records = snapshot.consumptionRows;
  model.unknownCount = snapshot.unknownRows.length;
  model.pendingItems = pendingConsumption;
  model.overlapCount = recurringExpenses.filter((item) => item.recurringType !== "loan")
    .filter((item) => (findPostedRecurringTransaction(item.id, month)?.recurringPostMethod === "auto"
      || occurrences.some((occurrence) => occurrence.id === item.id))
      && recurringImportCandidates(item, month).length > 0).length;
  model.lastImportedAt = importMeta.lastImportedAt || "";
  model.referenceIncome = hasManualIncome || activeIncome.length ? snapshot.income : null;
  model.referencePrincipal = snapshot.debtRepayment + sumDebtPrincipal(occurrences);
  model.referenceFixed = snapshot.fixedCost + sumConsumption(pendingConsumption);
  model.latestRecordDate = snapshot.consumptionRows.map((row) => normalizeInputDate(row.approvalDate))
    .filter((date) => date && date <= today).sort().at(-1) || "";
  return model;
}

function spendingBudgetMoney(value) {
  return value === null || value === undefined ? "목표 설정 필요" : formatWon(value);
}

function spendingBudgetRemaining(value) {
  if (value === null || value === undefined) return "목표 설정 필요";
  return `${formatWon(Math.abs(value))} ${value < 0 ? "초과" : "남음"}`;
}

function renderSpendingBudget(hostId, month) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const model = buildSpendingBudgetModel(month);
  if (!model) { host.innerHTML = ""; return; }
  const settings = SpendingBudgetCore.normalizeSettings(appSettings.spendingBudget);
  const pending = model.futureRecorded + model.pendingAmount + model.planAmount;
  const periodLabel = model.period === "current" ? "이번 달" : "선택 월";
  const segments = [Math.max(0, model.actual), Math.max(0, pending), Math.max(0, model.remaining || 0)];
  const barTotal = segments.reduce((total, amount) => total + amount, 0);
  host.innerHTML = `<section class="spending-budget" aria-label="예산 점검">
    <section class="budget-balance">
      <header class="spending-budget-heading"><h3>${periodLabel} 더 쓸 수 있는 돈</h3><button type="button" data-budget-open-settings><i class="ti ti-settings" aria-hidden="true"></i> 목표 설정</button></header>
      <div class="budget-equation">
        <div><span>월 소비 목표</span><strong>${spendingBudgetMoney(model.hasLimit ? model.cap : null)}</strong></div><span aria-hidden="true">−</span>
        <div><span>지금까지 사용</span><strong>${formatWon(model.actual)}</strong></div><span aria-hidden="true">−</span>
        <div><span>예정 지출</span><strong>${formatWon(pending)}</strong></div><span aria-hidden="true">=</span>
        <div class="budget-answer ${model.remaining < 0 ? "is-over" : ""}"><span>${model.remaining < 0 ? "목표를 초과한 금액" : `${periodLabel} 더 쓸 수 있는 돈`}</span><strong>${spendingBudgetMoney(model.remaining === null ? null : Math.abs(model.remaining))}</strong></div>
      </div>
      ${model.hasLimit ? `<div class="budget-track" aria-hidden="true">${segments.map((amount, i) => `<span class="budget-segment-${i}" style="width:${barTotal ? amount / barTotal * 100 : 0}%"></span>`).join("")}</div>` : ""}
      <div class="budget-balance-foot"><span>사용 ${formatWon(model.actual)} · 예정 ${formatWon(pending)}</span><span>각 주의 남음·초과도 이미 반영했어요.</span></div>
    </section>
    ${renderSpendingBudgetTargets(model, settings)}
    <div class="budget-inner-tabs" role="tablist" aria-label="예산 점검 화면">
      <button type="button" id="budgetOverviewTab" role="tab" aria-selected="${spendingBudgetTab === "overview"}" aria-controls="budgetOverviewPanel" tabindex="${spendingBudgetTab === "overview" ? 0 : -1}" data-budget-tab="overview">예산 한눈에</button>
      <button type="button" id="budgetWeeksTab" role="tab" aria-selected="${spendingBudgetTab === "weeks"}" aria-controls="budgetWeeksPanel" tabindex="${spendingBudgetTab === "weeks" ? 0 : -1}" data-budget-tab="weeks">주별 흐름</button>
    </div>
    <div class="budget-content-grid">
      <section class="budget-main-panel" id="budgetOverviewPanel" role="tabpanel" aria-labelledby="budgetOverviewTab" ${spendingBudgetTab !== "overview" ? "hidden" : ""}>
        ${renderSpendingBudgetWeekSummary(model)}${renderSpendingBudgetTable(model)}
      </section>
      <section class="budget-main-panel" id="budgetWeeksPanel" role="tabpanel" aria-labelledby="budgetWeeksTab" ${spendingBudgetTab !== "weeks" ? "hidden" : ""}>
        ${renderSpendingBudgetWeeks(model)}
      </section>
      <aside class="budget-side-panels">
        ${renderSpendingBudgetFood(model)}
        <section class="budget-scenario-panel"><h3>장보기, 더 시켜도 될까?</h3>
          <form data-budget-scenario class="spending-budget-scenario"><label>추가 식비 (원)<input name="amount" type="number" min="0" max="100000000" step="1" required value="${spendingBudgetScenario}"></label><button type="submit">계산</button>
          <output><span>추가 후 전체<strong class="${model.scenario.budgetAfter < 0 ? "is-over" : ""}">${spendingBudgetRemaining(model.scenario.budgetAfter)}</strong></span><span>추가 후 식비<strong class="${model.scenario.foodAfter < 0 ? "is-over" : ""}">${spendingBudgetRemaining(model.scenario.foodAfter)}</strong></span></output></form>
          <small>가정 계산 · 실제 기록과 목표는 바뀌지 않아요.</small>
        </section>
      </aside>
    </div>
    ${renderSpendingBudgetPlans(model)}
    <details class="budget-calculation"><summary>계산 기준 · 자료 상태</summary>
      <p>월 소비 목표에는 식비·쇼핑·개인관리·고정 소비·대출 이자가 포함됩니다. 저축·대출 원금은 제외합니다. 미반영 고정비·약속 예약·미래 날짜 기록은 예정 지출로 한 번만 확보합니다.</p>
      <p>주 목표는 월 목표를 해당 월의 일수로 나눈 참고치입니다. 일회성 큰 소비를 반복 소비로 확대 추정하지 않습니다. 식비 목표와 주 목표는 월 목표 안의 기준이며 월 잔액에 다시 더하지 않습니다.</p>
      <p>수입 기준 참고액: ${model.incomeSupport === null ? "수입 입력 필요" : formatWon(model.incomeSupport)}. 저축 목표와 기록·예정 저축 중 큰 금액 및 내 원금 부담을 빼고 가족 정산을 반영합니다. 수입 변화로 확정 목표를 덮어쓰지 않습니다.</p>
      <p>최근 기록 ${escapeHtml(model.latestRecordDate || "없음")} · 마지막 불러오기 ${escapeHtml(model.lastImportedAt.slice(0, 10) || "없음")}. 미입력 지출·통장 잔액을 알 수 없어 실제 구매 가능액을 보장하지 않습니다.</p>
      <p>날짜 없는 예약은 월 합계에만 반영됩니다. 종류 미지정 예약은 전체 예산에만 반영되므로 식비 예약이라면 종류를 지정해주세요.</p>
      <ul class="budget-pending-list">${model.pendingItems.map((item) => `<li><span>${escapeHtml(item.date)} · ${escapeHtml(item.name)} · 미반영 고정비</span><strong>${formatWon(consumptionAmount(item))}</strong></li>`).join("") || "<li>미반영 고정비 없음</li>"}</ul>
    </details>
    ${model.overlapCount ? `<p class="budget-alert">주의: 고정 지출과 가져온 거래의 중복 후보 ${model.overlapCount}건이 있습니다. 고정 지출에서 연결하기 전에는 이중 계산될 수 있습니다.</p>` : ""}
    ${model.warnings.length ? `<ul class="spending-budget-warnings">${model.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
    <p class="spending-budget-data-note">등록한 내역 기준 · 미입력 지출 제외${model.unknownCount ? ` · 미분류 ${model.unknownCount}건 포함` : ""}</p>
    <p class="spending-budget-feedback" role="status" aria-live="polite"></p>
  </section>`;
  attachSpendingBudgetHandlers(host, model);
}

function renderSpendingBudgetTable(model) {
  return `<div class="spending-budget-table-wrap" tabindex="0" aria-label="소비 내역 표, 가로로 스크롤할 수 있습니다"><table class="spending-budget-table"><caption>어디에 썼나요?</caption>
    <thead><tr><th scope="col">구분</th><th scope="col">이번 주</th><th scope="col">이번 달 사용</th><th scope="col">예정</th></tr></thead>
    <tbody>${model.groups.map((group) => `<tr><th scope="row">${escapeHtml(group.label)}</th><td>${model.currentWeek ? formatWon(group.weekAmount) : "—"}</td><td>${formatWon(group.actual)}</td><td>${formatWon(group.futureRecorded + group.pendingAmount)}</td></tr>`).join("") || '<tr><td colspan="4">등록된 소비가 없습니다.</td></tr>'}
    ${model.planAmount ? `<tr><th scope="row">약속·구매 예약</th><td>—</td><td>—</td><td>${formatWon(model.planAmount)}</td></tr>` : ""}</tbody>
    <tfoot><tr><th scope="row">전체</th><td>${model.currentWeek ? formatWon(model.currentWeek.amount) : "—"}</td><td>${formatWon(model.actual)}</td><td>${formatWon(model.futureRecorded + model.pendingAmount + model.planAmount)}</td></tr></tfoot></table></div>`;
}

function renderSpendingBudgetWeekSummary(model) {
  const week = model.currentWeek;
  return `<div class="budget-week-summary"><div><span>${week ? `이번 주 · ${escapeHtml(week.label)}` : "선택 월 사용"}</span><strong>${formatWon(week ? week.amount : model.actual)}</strong></div>
    <div><span>${week ? "주 목표 · 예정까지 반영" : "월 목표 · 예정까지 반영"}</span><strong class="${(week ? week.remaining : model.remaining) < 0 ? "is-over" : "is-positive"}">${spendingBudgetRemaining(week ? week.remaining : model.remaining)}</strong><small>${week ? `참고 목표 ${spendingBudgetMoney(week.target)}` : "현재 주가 아닌 선택 월입니다."}</small></div></div>`;
}

function renderSpendingBudgetWeeks(model) {
  const max = Math.max(1, ...model.weeks.map((week) => Math.max(week.amount, week.target || 0, week.committed)));
  const magnitude = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const step = Math.max(1000, [1, 2, 2.5, 5, 10].find((unit) => unit * magnitude >= max / 4) * magnitude);
  const ceiling = step * 4;
  const percent = (amount) => Math.min(100, Math.max(0, amount) / ceiling * 100);
  return `<header class="budget-chart-head"><h3>주별 사용 흐름</h3><span>사용 막대 · 점선은 주 목표</span></header>
    <div class="budget-weeks-scroll" tabindex="0" aria-label="주별 소비 그래프, 가로로 스크롤할 수 있습니다"><div class="budget-weeks" style="--budget-week-count:${model.weeks.length}">
    <div class="budget-chart-axis" aria-hidden="true">${[1, .75, .5, .25, 0].map((ratio) => `<span style="top:${(1 - ratio) * 100}%">${formatWon(Math.round(ceiling * ratio))}</span>`).join("")}</div>
    ${model.weeks.map((week, index) => {
      const future = week.start > model.today;
      const current = week === model.currentWeek;
      const excess = week.target === null ? 0 : Math.max(0, week.amount - week.target);
      const pending = week.futureRecorded + week.pendingAmount + week.planAmount;
      return `<div class="budget-week-column ${current ? "is-current" : ""}">
        <div class="budget-week-plot" aria-hidden="true">
          <div class="budget-week-bar" style="height:${percent(week.amount)}%"><span class="budget-week-excess" style="height:${week.amount > 0 ? excess / week.amount * 100 : 0}%"></span></div>
          ${!future ? `<strong class="budget-bar-label" style="bottom:${percent(week.amount)}%">${formatWon(week.amount)}</strong>` : ""}
          ${week.target !== null ? `<div class="budget-week-target" style="bottom:${percent(week.target)}%"><span>${formatWon(week.target)}</span></div>` : ""}
        </div>
        <strong>${index + 1}주</strong><span>${escapeHtml(week.label)}</span><small>${current ? "이번 주" : future ? "시작 전" : "마감"}</small>
        <b class="${week.remaining < 0 ? "is-over" : "is-positive"}">${future ? "예정 확인" : spendingBudgetRemaining(week.remaining)}</b>
        ${pending ? `<small>예정 ${formatWon(pending)} 포함</small>` : ""}
        <span class="budget-sr-only">사용 ${formatWon(week.amount)}, 목표 ${spendingBudgetMoney(week.target)}</span>
      </div>`;
    }).join("")}</div></div><p class="spending-budget-data-note">주별 차이는 위 월 잔액에 이미 반영됩니다. 시작 전 주는 사용액을 0원 실적으로 평가하지 않습니다.</p>`;
}

function renderSpendingBudgetFood(model) {
  const effectiveFood = model.foodRemaining === null || model.remaining === null ? null : Math.max(0, Math.min(model.foodRemaining, model.remaining));
  return `<section class="budget-food-panel"><h3>식비 예산 현황</h3><span>${model.foodRemaining < 0 ? "식비 목표를 초과했어요" : "전체 여유 안에서 식비로 더 쓸 수 있는 돈"}</span><strong class="budget-food-amount ${model.foodRemaining < 0 ? "is-over" : ""}">${model.foodRemaining < 0 ? spendingBudgetRemaining(model.foodRemaining) : spendingBudgetMoney(effectiveFood)}</strong>
    <dl><div><dt>식비 목표</dt><dd>${spendingBudgetMoney(model.foodTarget || null)}</dd></div><div><dt>지금까지 사용</dt><dd>${formatWon(model.foodActual)}</dd></div><div><dt>예정 식비</dt><dd>${formatWon(model.foodPending)}</dd></div></dl>
    <p>${effectiveFood !== null && effectiveFood < model.foodRemaining ? `식비 자체 잔액은 ${formatWon(model.foodRemaining)}이지만 전체 여유를 넘지 않게 표시합니다. ` : ""}전체 잔액 안의 식비 한도예요. 다시 더하지 않아요.</p>
    <ul>${model.groups.filter((group) => ["쿠팡 장보기", "배달", "외식", "기타 식비·카페"].includes(group.label)).map((group) => `<li><span>${escapeHtml(group.label)}</span><strong>${formatWon(group.actual)}</strong></li>`).join("")}</ul>
  </section>`;
}

function renderSpendingBudgetPlans(model) {
  const options = model.records.filter((record) => consumptionAmount(record) > 0).map((record) =>
    `<option value="${escapeHtml(record.recordKey)}">${escapeHtml(record.approvalDate || "날짜 없음")} · ${escapeHtml(record.merchant)} · ${formatWon(consumptionAmount(record))}</option>`).join("");
  return `<details class="spending-budget-plans"><summary>앞으로의 약속·구매 예약 ${formatWon(model.planAmount)}</summary>
    <p>아직 쓰지 않은 비용만 예약하세요. 실제 내역을 불러온 뒤 연결하면 예약액을 중복 차감하지 않습니다. 고정 지출은 위에서 자동 확보하므로 다시 예약하지 마세요.</p>
    <form data-budget-plan class="spending-budget-form"><label>약속·구매명<input name="label" maxlength="80" required placeholder="예: 친구 약속, 의류 구매"></label><label>종류<select name="sector" required><option value="">선택해주세요</option><option value="식비">식비 · 장보기/외식/배달</option><option value="기타">그 밖의 소비</option></select></label><label>예정일<input name="date" type="date" required value="${model.period === "current" ? model.today : `${model.month}-01`}" min="${model.month}-01" max="${model.month}-${String(new Date(Number(model.month.slice(0, 4)), Number(model.month.slice(5)), 0).getDate())}"></label><label>예상 금액 (원)<input name="amount" type="number" min="1" max="100000000" step="1" required></label><button type="submit">예약 추가</button></form>
    <ul>${model.plans.map((plan) => `<li><div><strong>${escapeHtml(plan.label)} · ${formatWon(plan.amount)}</strong><small>${escapeHtml(plan.date || plan.month)} · ${plan.linked ? "실제 거래 연결됨 · 추가 차감 없음" : "예정액 확보 중"}</small></div>
      <label>예약 종류<select data-budget-plan-sector="${escapeHtml(plan.id)}"><option value="">미지정 · 전체만 반영</option><option value="식비">식비</option><option value="기타">그 밖의 소비</option></select></label><label>실제 거래 연결<select data-budget-plan-link="${escapeHtml(plan.id)}"><option value="">아직 쓰지 않음</option>${options}</select></label><button type="button" data-budget-plan-remove="${escapeHtml(plan.id)}" aria-label="${escapeHtml(plan.label)} 예약 삭제">삭제</button></li>`).join("") || "<li>등록한 약속·구매 예약이 없습니다.</li>"}</ul>
  </details>`;
}

async function saveSpendingBudgetChange(host, update) {
  if (spendingBudgetSaving) return;
  spendingBudgetSaving = true;
  const controls = [...host.querySelectorAll("input, select, button")];
  const disabledStates = controls.map((control) => control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  let saved = false;
  try {
    await queuePrivateWrite(async () => {
      const settings = SpendingBudgetCore.normalizeSettings(appSettings.spendingBudget);
      const next = { ...appSettings, spendingBudget: SpendingBudgetCore.normalizeSettings(update(settings)) };
      await commitPrivateDataMany([{ key: SETTINGS_STORAGE_KEY, value: next }]);
      appSettings = next;
    });
    saved = true;
  } catch (error) {
    host.querySelector(".spending-budget-feedback").textContent = "저장하지 못했습니다. 입력 내용은 그대로 유지됩니다. 다시 시도해주세요.";
  } finally {
    spendingBudgetSaving = false;
    controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
  }
  if (saved) {
    try {
      renderBoard();
      renderSummary();
      document.querySelectorAll(".spending-budget-feedback").forEach((status) => { status.textContent = "예산을 저장했습니다."; });
    } catch (error) {
      host.querySelector(".spending-budget-feedback").textContent = "저장은 완료됐습니다. 화면을 새로고침해 확인해주세요.";
      console.warn("예산 화면 갱신 실패", error);
    }
  }
}

function attachSpendingBudgetHandlers(host, model) {
  attachSpendingBudgetTargetHandlers(host, model);
  host.querySelector("[data-budget-settings]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const monthlyLimit = Number(form.elements.monthlyLimit.value);
    const foodTarget = Number(form.elements.foodTarget.value);
    const savingsTarget = Number(form.elements.savingsTarget.value);
    if (foodTarget > monthlyLimit) {
      host.querySelector(".spending-budget-feedback").textContent = "식비 목표는 월 전체 소비 목표를 넘을 수 없습니다.";
      return;
    }
    saveSpendingBudgetChange(host, (settings) => ({ ...settings,
      monthlyTargets: { ...settings.monthlyTargets, [model.month]: { monthlyLimit, foodTarget, savingsTarget, source: "manual" } }
    }));
  });
  host.querySelector("[data-budget-scenario]").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    spendingBudgetScenario = Number(event.currentTarget.elements.amount.value);
    renderSpendingBudget(host.id, model.month);
    host.querySelector("[data-budget-scenario] input").focus({ preventScroll: true });
  });
  const tabs = [...host.querySelectorAll("[data-budget-tab]")];
  tabs.forEach((tab, index) => {
    const activate = () => {
      spendingBudgetTab = tab.dataset.budgetTab;
      tabs.forEach((button) => {
        const active = button === tab;
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
        host.querySelector(`#${button.getAttribute("aria-controls")}`).hidden = !active;
      });
    };
    tab.addEventListener("click", activate);
    tab.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click(); tabs[next].focus();
    });
  });
  host.querySelector("[data-budget-plan]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (SpendingBudgetCore.normalizeSettings(appSettings.spendingBudget).plans.length >= SpendingBudgetCore.MAX_PLANS) {
      host.querySelector(".spending-budget-feedback").textContent = `예약은 최대 ${SpendingBudgetCore.MAX_PLANS}개까지 보관합니다. 필요 없는 지난 예약을 정리한 뒤 추가해주세요.`;
      return;
    }
    const plan = { id: crypto.randomUUID(), label: form.elements.label.value.trim(), date: form.elements.date.value, month: model.month, amount: Number(form.elements.amount.value), recordKey: "", sector: form.elements.sector.value };
    if (!plan.label || plan.date.slice(0, 7) !== model.month) return;
    saveSpendingBudgetChange(host, (settings) => {
      if (settings.plans.length >= SpendingBudgetCore.MAX_PLANS) throw new Error("예약 보관 한도를 초과했습니다.");
      return { ...settings, plans: [...settings.plans, plan] };
    });
  });
  host.querySelectorAll("[data-budget-plan-link]").forEach((select) => {
    const plan = model.plans.find((item) => item.id === select.dataset.budgetPlanLink);
    select.value = plan?.recordKey || "";
    select.addEventListener("change", () => {
      const recordKey = select.value;
      saveSpendingBudgetChange(host, (settings) => ({ ...settings, plans: settings.plans.map((item) => item.id === plan.id ? { ...item, recordKey } : item) }));
    });
  });
  host.querySelectorAll("[data-budget-plan-remove]").forEach((button) => {
    button.addEventListener("click", () => saveSpendingBudgetChange(host, (settings) => ({ ...settings, plans: settings.plans.filter((item) => item.id !== button.dataset.budgetPlanRemove) })));
  });
  host.querySelectorAll("[data-budget-plan-sector]").forEach((select) => {
    const plan = model.plans.find((item) => item.id === select.dataset.budgetPlanSector);
    select.value = plan?.sector || "";
    select.addEventListener("change", () => {
      const sector = select.value;
      saveSpendingBudgetChange(host, (settings) => ({ ...settings, plans: settings.plans.map((item) => item.id === plan.id ? { ...item, sector } : item) }));
    });
  });
}
