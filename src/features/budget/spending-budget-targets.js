const BUDGET_PROFILE_AMOUNTS = ["netIncome", "housingCost", "otherFixed", "ownPrincipal", "savingsGoal", "reserve", "foodTarget"];
const BUDGET_SOURCE_LABELS = { manual: "직접 수정", records: "내 기록 기준", history: "최근 3개월 기준", template: "템플릿 제안" };

function spendingBudgetSelect(name, label, values, value) {
  return `<label>${label}<select name="${name}"><option value="">선택하지 않음</option>${values.map(([key, title]) => `<option value="${key}" ${key === value ? "selected" : ""}>${title}</option>`).join("")}</select></label>`;
}

function spendingBudgetInput(name, label, value, options = {}) {
  const { min = 0, max = 100000000, required = false, source = "", help = "", kind = "money", unit = "" } = options;
  return `<label><span class="budget-input-label">${label}${source ? `<small class="budget-value-source" data-budget-source="${name}">${BUDGET_SOURCE_LABELS[source]}</small>` : ""}</span>
    <input name="${name}" type="text" inputmode="numeric" data-number-kind="${kind}" ${unit ? `data-number-unit="${unit}"` : ""} min="${min}" max="${max}" step="1" ${required ? "required" : ""} value="${value ?? ""}" placeholder="비우면 자동 제안">
    ${help ? `<small class="budget-input-help">${help}</small>` : ""}</label>`;
}

function spendingBudgetRecommendationContext(model, profile, assumptionsConfirmed = false) {
  return { ...model.recommendationRecords,
    history: profile.historyConfirmed ? spendingBudgetHistory(model.month) : [],
    historyConfirmed: profile.historyConfirmed, assumptionsConfirmed };
}

function renderSpendingBudgetHorizon(horizon) {
  if (!horizon.available) return `<span>은퇴까지의 소득 계획 기간</span><strong>연령대를 선택하면 보여드려요</strong><small>예상 은퇴 나이는 직접 바꿀 수 있습니다. 이전의 넓은 연령 구간은 다시 선택해주세요.</small>`;
  const years = horizon.minYears === horizon.maxYears ? `${horizon.minYears}년` : `${horizon.minYears}~${horizon.maxYears}년`;
  const months = horizon.minMonths === horizon.maxMonths ? `${horizon.minMonths}개월` : `${horizon.minMonths}~${horizon.maxMonths}개월`;
  return `<span>${horizon.retirementAge}세 은퇴 가정 · 앞으로의 소득 계획 기간</span><strong>약 ${years}</strong><small>약 ${months} · 생일·휴직·이직·소득 변동을 반영하지 않은 기간이며 급여 지급을 보장하지 않습니다.</small>`;
}

function renderSpendingBudgetTargets(model, settings) {
  const profile = SpendingBudgetCore.normalizeProfile(settings.profile);
  const result = SpendingBudgetCore.templateDraft(profile, spendingBudgetRecommendationContext(model, profile));
  const amounts = result.profile;
  const source = result.fieldSources;
  const ages = SpendingBudgetCore.AGE_GROUPS.filter((age) => age.key !== "undisclosed" && (!["under40", "over60"].includes(age.key) || age.key === profile.ageGroup));
  return `<details class="spending-budget-settings" ${!model.hasLimit ? "open" : "hidden"}>
    <summary>${escapeHtml(model.month)} 목표 설정 · 템플릿으로 시작하기</summary>
    <header class="budget-template-heading"><div><h3>내 상황에 가까운 시작안을 골라보세요</h3><p>등록된 값은 먼저 불러오고, 없는 값은 예시로 제안합니다. 세부 입력 없이도 초안을 볼 수 있어요.</p></div><span>적용 전에는 기존 목표 유지</span></header>
    <div class="budget-template-options" role="group" aria-label="예산 시작 템플릿">
      <button type="button" data-budget-template="starter-alone"><strong>사회초년 · 자취</strong><span>생활비와 저축을 함께 시작</span></button>
      <button type="button" data-budget-template="starter-family"><strong>사회초년 · 가족 동거</strong><span>본인 생활비와 저축 중심</span></button>
      <button type="button" data-budget-template="experienced"><strong>경력 · 저축 집중</strong><span>저축·상환 목표를 더 확보</span></button>
      <button type="button" data-budget-template="irregular"><strong>수입 불규칙</strong><span>이번 달 완충 예산을 우선</span></button>
    </div>
    <div class="budget-target-columns">
      <section><h3>내 상황 · 필요한 것만 수정</h3>
        <form data-budget-profile class="budget-profile-form">
          ${spendingBudgetSelect("ageGroup", "연령대", ages.map((age) => [age.key, age.label]), profile.ageGroup)}
          ${spendingBudgetSelect("career", "직장생활", [["starter", "사회초년"], ["experienced", "경력 있음"], ["irregular", "취업 준비 · 수입 불규칙"]], profile.career)}
          ${spendingBudgetSelect("living", "생활 형태", [["alone", "혼자 거주"], ["family", "가족과 동거"], ["shared", "배우자·동거인과 공동 생활"]], profile.living)}
          ${spendingBudgetInput("netIncome", "월 실수령 기준 수입", amounts.netIncome, { source: source.netIncome, help: "등록 수입에는 일회성 입금이 섞일 수 있어요. 유지 가능한 월 수입인지 확인하세요." })}
          <div class="budget-horizon" data-budget-horizon>${renderSpendingBudgetHorizon(result.horizon)}</div>
          ${spendingBudgetInput("retirementAge", "예상 은퇴 나이 · 계획용 가정", result.horizon.retirementAge, { min: 40, max: 90, kind: "duration", unit: "세", help: "비워두면 65세를 예시로 사용합니다. 법정 정년이나 연금 수령 시점을 뜻하지 않습니다." })}
          <div class="budget-record-summary"><span>기록으로 채운 고정 소비</span><strong>${model.referenceFixed ? formatWon(model.referenceFixed) : "등록 내역 없음"}</strong><small>주거비·기타 고정 소비를 아래에서 나눠 확인하세요.</small></div>
          <details class="budget-profile-details"><summary>자동 제안한 금액 확인·수정</summary><div class="budget-profile-detail-grid">
            ${spendingBudgetInput("housingCost", "본인 부담 주거비 · 월세/관리비", amounts.housingCost, { source: source.housingCost, help: "등록된 월세·관리비를 우선 사용합니다. 없음은 직접 0을 입력하세요." })}
            ${spendingBudgetInput("otherFixed", "그 밖의 고정 소비 · 이자 포함", amounts.otherFixed, { source: source.otherFixed, help: "주거비를 제외한 보험·통신·구독 등의 등록 소비입니다." })}
            ${spendingBudgetInput("ownPrincipal", "내 월 대출 원금 부담", amounts.ownPrincipal, { source: source.ownPrincipal, help: "가족 부담을 뺀 본인 원금입니다. 이자는 고정 소비에 포함됩니다." })}
            ${spendingBudgetInput("savingsGoal", "월 저축 목표", amounts.savingsGoal, { source: source.savingsGoal, help: "템플릿의 저축·원금 몫에서 본인 원금을 빼고 제안합니다." })}
            ${spendingBudgetInput("reserve", "남겨둘 월 예비비", amounts.reserve, { source: source.reserve, help: "이번 달 갑작스러운 소비용 완충 금액입니다. 장기 비상자금 총액과는 달라요." })}
            ${spendingBudgetInput("foodTarget", "월 식비 목표", amounts.foodTarget, { source: source.foodTarget, help: "장보기·배달·외식·카페를 합친 금액이며 전체 소비 목표 안에 포함됩니다." })}
          </div><label class="budget-check"><input name="historyConfirmed" type="checkbox" ${profile.historyConfirmed ? "checked" : ""}>최근 완료된 3개월 소비 기록을 충분히 입력했습니다 · 식비 추천에 사용</label>
          <button type="button" data-budget-use-records>수입·고정비·원금 다시 불러오기</button><small>직접 수정한 네 항목을 기록 기준으로 되돌립니다. 저장된 거래는 변경하지 않습니다.</small></details>
        </form>
      </section>
      <section class="budget-target-result"><div data-budget-recommendation class="budget-recommendation" aria-live="polite">${renderSpendingBudgetRecommendation(result)}</div>
        <details class="budget-manual-details"><summary>추천 대신 목표 직접 입력</summary><p>현재 저장한 목표입니다. 이 달에만 적용되며 추천 초안과 자동으로 섞이지 않습니다.</p>
          <form data-budget-settings class="budget-manual-form">
            ${spendingBudgetInput("monthlyLimit", "월 전체 소비 목표", model.targets.monthlyLimit || "", { min: 1, required: true })}
            ${spendingBudgetInput("foodTarget", "월 식비 목표 · 0이면 미설정", model.foodTarget, { required: true })}
            ${spendingBudgetInput("savingsTarget", "월 저축 목표", model.targets.savingsTarget, { required: true })}
            <button type="submit">직접 입력한 이 달 목표 저장</button>
          </form>
        </details>
      </section>
    </div>
    <p class="spending-budget-data-note">입력값은 브라우저에서 계산하며 외부 추천 서비스로 보내지 않습니다. 저장한 설정은 기존 백업에 포함됩니다.</p>
  </details>`;
}

function spendingBudgetHistory(month) {
  const current = currentMonthKey();
  const endMonth = month < current ? month : shiftMonthKey(current, -1);
  return [-2, -1, 0].map((offset) => {
    const snapshot = buildAnalysisMonthSnapshot(shiftMonthKey(endMonth, offset));
    return snapshot.consumptionRows.length ? { month: snapshot.month, total: Math.max(0, snapshot.consumptionSpend), food: Math.max(0, snapshot.sectorTotals.get("식비") || 0) } : null;
  }).filter(Boolean);
}

function renderSpendingBudgetRecommendation(result) {
  const sources = result.fieldSources;
  const row = (label, amount, key, note) => `<div><dt>${label}<small>${BUDGET_SOURCE_LABELS[sources[key]] || "계산 결과"}${note ? ` · ${note}` : ""}</small></dt><dd>${formatWon(amount)}</dd></div>`;
  return `<span class="budget-draft-label">${escapeHtml(result.template.label)} · 추천 초안</span><h3>월 전체 소비 목표</h3>
    <strong class="budget-recommended-amount">${formatWon(result.monthlyLimit)}</strong><p class="budget-draft-caption">주거·고정 소비와 식비를 모두 포함한 한도예요.</p>
    <dl>${row("식비", result.foodTarget, "foodTarget", "전체 소비 안에 포함")}${row("월 저축", result.savingsTarget, "savingsGoal")}${row("월 예비비", result.reserve, "reserve")}${row("위 소비에 포함된 고정비", result.fixed, "otherFixed")}</dl>
    <p class="budget-draft-equation">수입 ${formatWon(result.profile.netIncome)} − 내 원금 ${formatWon(result.profile.ownPrincipal)} − 저축 ${formatWon(result.savingsTarget)} − 예비비 ${formatWon(result.reserve)}</p>
    ${result.warnings.length ? `<ul class="budget-draft-warnings">${result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
    ${result.assumptions.length ? `<details class="budget-assumptions"><summary>예시·미확인 가정 ${result.assumptions.length}개 확인</summary><ul>${result.assumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join("")}</ul></details><label class="budget-check budget-acknowledge"><input type="checkbox" data-budget-confirm-assumptions>위 예시·미확인 값을 확인했고 이 가정으로 목표를 정합니다</label>` : ""}
    <button type="button" class="primary budget-apply-button" data-budget-apply-recommendation ${result.canApply ? "" : "disabled"}>이 추천을 이 달에 적용</button>
    <details class="budget-recommendation-basis"><summary>추천 기준과 참고 자료</summary>
      <p>이 템플릿은 통계 평균이나 최적 소비액이 아닌 앱의 시작 규칙입니다. 나이로 월급을 추정하지 않으며 은퇴까지의 소득을 현재 한도에 더하지 않습니다.</p>
      <p>저축·원금 ${Math.round(result.template.savingsDebtRatio * 100)}%, 월 예비비 ${Math.round(result.template.reserveRatio * 100)}%, 식비 ${Math.round(result.template.foodRatio * 100)}%를 출발점으로 사용합니다. 직접 정한 값과 고정비를 우선하며 감당 가능한 범위로 제안을 조정합니다.</p>
      <p><a href="https://files.consumerfinance.gov/f/201603_cfpb_rules-to-live-by_my-spending-rule-to-live-by.pdf" target="_blank" rel="noopener noreferrer">CFPB의 예산 배분 참고 방식</a>은 개인 상황에 맞춘 조정을 권합니다. 위 템플릿 비율 모두가 해당 기관의 공식 권장값인 것은 아닙니다.</p>
      <p><a href="https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/" target="_blank" rel="noopener noreferrer">비상자금의 필요액은 개인 상황에 따라 다릅니다.</a> 여기의 월 예비비는 비상자금 총액을 대신하지 않습니다.</p>
    </details>`;
}

function attachSpendingBudgetTargetHandlers(host, model) {
  const targetDetails = host.querySelector(".spending-budget-settings");
  targetDetails?.addEventListener("toggle", () => { targetDetails.hidden = !targetDetails.open; });
  host.querySelector("[data-budget-open-settings]")?.addEventListener("click", () => {
    targetDetails.hidden = false;
    targetDetails.open = !targetDetails.open;
    if (targetDetails.open) targetDetails.querySelector("summary").focus({ preventScroll: true });
  });
  const form = host.querySelector("[data-budget-profile]");
  if (!form) return;
  let profile = SpendingBudgetCore.normalizeProfile(appSettings.spendingBudget.profile);
  let assumptionsConfirmed = false;
  let result;
  const output = host.querySelector("[data-budget-recommendation]");
  const showInputError = () => {
    output.innerHTML = "<p class=\"budget-alert\">입력한 숫자의 범위를 확인해주세요. 기존 목표는 바뀌지 않았습니다.</p>";
    result = null;
  };
  const refresh = (syncValues = true, resetFields = []) => {
    result = SpendingBudgetCore.templateDraft(profile, spendingBudgetRecommendationContext(model, profile, assumptionsConfirmed));
    output.innerHTML = renderSpendingBudgetRecommendation(result);
    host.querySelector("[data-budget-horizon]").innerHTML = renderSpendingBudgetHorizon(result.horizon);
    BUDGET_PROFILE_AMOUNTS.forEach((name) => {
      const input = form.elements[name];
      if (syncValues && document.activeElement !== input && (input.checkValidity() || resetFields.includes(name))) input.value = result.profile[name] ?? "";
      host.querySelector(`[data-budget-source="${name}"]`).textContent = BUDGET_SOURCE_LABELS[result.fieldSources[name]];
    });
    host.querySelectorAll("[data-budget-template]").forEach((button) => {
      const key = result.profile.career === "starter" ? `starter-${result.profile.living === "family" ? "family" : "alone"}` : result.profile.career;
      button.setAttribute("aria-pressed", String(button.dataset.budgetTemplate === key));
    });
    const checkbox = output.querySelector("[data-budget-confirm-assumptions]");
    if (checkbox) checkbox.checked = assumptionsConfirmed;
    NumericInput.refresh(form);
    if (!form.checkValidity()) showInputError();
  };
  const change = (event) => {
    const input = event.target;
    if (!input.name) return;
    assumptionsConfirmed = false;
    if (BUDGET_PROFILE_AMOUNTS.includes(input.name) || input.name === "retirementAge") {
      const value = NumericInput.read(input);
      if (Number.isNaN(value) || !input.checkValidity()) {
        showInputError();
        return;
      }
      profile[input.name] = value;
    } else if (input.name === "historyConfirmed") profile.historyConfirmed = input.checked;
    else {
      profile[input.name] = input.value;
      if (input.name === "ageGroup") profile.currentAge = null;
    }
    refresh();
  };
  form.addEventListener("input", change);
  form.addEventListener("change", change);
  form.addEventListener("submit", (event) => { event.preventDefault(); if (form.reportValidity()) refresh(); });
  form.addEventListener("focusout", (event) => {
    if (BUDGET_PROFILE_AMOUNTS.includes(event.target.name) && event.target.value === "" && result) {
      event.target.value = result.profile[event.target.name] ?? "";
      NumericInput.refresh(form);
    }
  });
  host.querySelectorAll("[data-budget-template]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.budgetTemplate;
    profile.career = key.startsWith("starter-") ? "starter" : key;
    if (key.startsWith("starter-")) profile.living = key.slice(8);
    form.elements.career.value = profile.career;
    form.elements.living.value = profile.living;
    assumptionsConfirmed = false;
    refresh();
  }));
  host.querySelector("[data-budget-use-records]")?.addEventListener("click", () => {
    const recordFields = ["netIncome", "housingCost", "otherFixed", "ownPrincipal"];
    recordFields.forEach((key) => { profile[key] = null; });
    assumptionsConfirmed = false;
    refresh(true, recordFields);
    host.querySelector(".spending-budget-feedback").textContent = "등록 자료를 기준으로 다시 제안했습니다. 자료가 없는 값은 템플릿 예시로 표시합니다.";
  });
  output.addEventListener("change", (event) => {
    if (!event.target.matches("[data-budget-confirm-assumptions]")) return;
    assumptionsConfirmed = event.target.checked;
    result = SpendingBudgetCore.templateDraft(profile, spendingBudgetRecommendationContext(model, profile, assumptionsConfirmed));
    output.querySelector("[data-budget-apply-recommendation]").disabled = !result.canApply;
  });
  output.addEventListener("click", (event) => {
    if (!event.target.closest("[data-budget-apply-recommendation]") || !result?.canApply || !form.reportValidity()) return;
    const savedProfile = SpendingBudgetCore.normalizeProfile(profile);
    const targets = { monthlyLimit: result.monthlyLimit, foodTarget: result.foodTarget, savingsTarget: result.savingsTarget, source: "recommendation" };
    saveSpendingBudgetChange(host, (settings) => ({ ...settings, profile: savedProfile, monthlyTargets: { ...settings.monthlyTargets, [model.month]: targets } }));
  });
  refresh(false);
}
