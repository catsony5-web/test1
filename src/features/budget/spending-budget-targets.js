function spendingBudgetSelect(name, label, values, value, required = false) {
  return `<label>${label}<select name="${name}" ${required ? "required" : ""}><option value="">선택해주세요</option>${values.map(([key, title]) => `<option value="${key}" ${key === value ? "selected" : ""}>${title}</option>`).join("")}</select></label>`;
}

function spendingBudgetInput(name, label, value, minimum = 0) {
  return `<label>${label}<input name="${name}" type="number" min="${minimum}" max="100000000" step="1" required value="${value ?? ""}" placeholder="금액 입력 · 없으면 0"></label>`;
}

function renderSpendingBudgetTargets(model, settings) {
  const profile = SpendingBudgetCore.normalizeProfile(settings.profile);
  if (!settings.profile) profile.savingsGoal = model.targets.savingsTarget;
  return `<details class="spending-budget-settings" ${!model.hasLimit ? "open" : "hidden"}>
    <summary>${escapeHtml(model.month)} 목표 설정 · 맞춤 추천 / 직접 수정</summary>
    <div class="budget-target-columns">
      <section><h3>내 상황으로 추천받기</h3><p>평균은 참고하고, 내 수입과 꼭 나가는 돈을 먼저 반영합니다.</p>
        <form data-budget-profile class="budget-profile-form">
          ${spendingBudgetSelect("ageGroup", "연령대", [["under40", "39세 이하"], ["forties", "40~49세"], ["fifties", "50~59세"], ["over60", "60세 이상"], ["undisclosed", "선택하지 않음"]], profile.ageGroup)}
          ${spendingBudgetSelect("living", "생활 형태", [["alone", "혼자 거주"], ["family", "가족과 동거"], ["shared", "배우자·동거인과 공동 생활"]], profile.living, true)}
          ${spendingBudgetSelect("incomeStability", "수입 상황", [["stable", "정기 수입"], ["variable", "변동 수입 · 기준액 직접 확인"]], profile.incomeStability, true)}
          ${spendingBudgetInput("netIncome", "월 실수령 기준 수입 (원)", profile.netIncome)}
          ${spendingBudgetInput("housingCost", "본인 부담 주거비 · 월세/관리비 (원)", profile.housingCost)}
          ${spendingBudgetInput("otherFixed", "그 밖의 고정 소비 · 이자 포함 (원)", profile.otherFixed)}
          ${spendingBudgetInput("ownPrincipal", "내 월 대출 원금 부담 · 가족 부담 제외 (원)", profile.ownPrincipal)}
          ${spendingBudgetInput("savingsGoal", "먼저 확보할 월 저축 (원)", profile.savingsGoal)}
          ${spendingBudgetInput("reserve", "남겨둘 예비비 (원)", profile.reserve)}
          <label class="budget-check"><input name="historyConfirmed" type="checkbox" ${profile.historyConfirmed ? "checked" : ""}>최근 완료된 3개월 소비 기록을 충분히 입력했습니다</label>
          <div class="budget-form-actions"><button type="button" data-budget-use-records>등록 수입·원금·고정비 불러오기</button><button type="submit" class="primary">추천 목표 계산</button></div>
        </form>
        <small>불러온 금액은 확인 후 계산하세요. 변동 수입은 일회성 입금·빌린 돈을 빼고 유지 가능한 기준액을 입력하세요. 나이는 참고 평균 선택에만 사용하며 임의의 연령별 가산율은 적용하지 않습니다.</small>
      </section>
      <section><h3>내가 정한 목표</h3><p>이 달에만 적용됩니다. 추천값이나 수입이 바뀌어도 자동 변경되지 않습니다.</p>
        <form data-budget-settings class="budget-manual-form">
          ${spendingBudgetInput("monthlyLimit", "월 전체 소비 목표 (원)", model.targets.monthlyLimit || "", 1)}
          ${spendingBudgetInput("foodTarget", "월 식비 목표 · 0이면 미설정 (원)", model.foodTarget)}
          ${spendingBudgetInput("savingsTarget", "월 저축 목표 (원)", model.targets.savingsTarget)}
          <button type="submit">이 달 목표 저장</button>
        </form>
        <small>${model.targets.source === "legacy" ? "아직 이 달의 목표를 따로 저장하지 않아 기존 공통 목표를 표시합니다." : model.targets.source === "recommendation" ? "추천을 확인하고 적용한 목표입니다. 언제든 직접 수정할 수 있습니다." : "직접 설정한 목표를 유지하고 있습니다."} 식비 목표는 전체 목표 안에 포함됩니다.</small>
        <div data-budget-recommendation class="budget-recommendation" aria-live="polite"><p>상황을 입력하고 계산하면 추천 금액과 근거가 여기에 표시됩니다.</p></div>
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
    return snapshot.consumptionRows.length ? {
      month: snapshot.month, total: Math.max(0, snapshot.consumptionSpend),
      food: Math.max(0, snapshot.sectorTotals.get("식비") || 0)
    } : null;
  }).filter(Boolean);
}

function renderSpendingBudgetRecommendation(result) {
  if (!result.ready) return "<p>수입·생활 형태·주거비·고정 소비·원금 부담을 입력해주세요.</p>";
  const benchmark = SpendingBudgetCore.BENCHMARKS;
  const ageLabel = { under40: "39세 이하", forties: "40~49세", fifties: "50~59세", over60: "60세 이상" }[result.profile.ageGroup];
  const explanations = {
    history: "입력 완료를 확인한 최근 3개월 소비의 중앙값을 참고했습니다. 고정 소비보다 작거나 수입 기준 상한보다 커지지 않게 조정합니다.",
    "single-household": "전 연령 1인가구 평균에서 주거비 비중(18.4%)을 빼고 내 주거비로 대체한 시작값입니다. 공개 구성비가 반올림되어 있으므로 근사치이며, 내 고정비와 수입 상한을 우선합니다.",
    income: "개인 지출과 직접 비교할 가구 평균이 없어 수입에서 저축·원금·예비비를 확보한 상한을 시작 목표로 제안합니다. 반드시 이 금액을 다 쓰라는 뜻은 아닙니다."
  };
  return `<h4>내 상황에 맞춘 시작 목표</h4><strong class="budget-recommended-amount">${formatWon(result.monthlyLimit)}</strong>
    ${result.deficit ? `<p class="budget-alert">고정 소비를 감당하려면 ${formatWon(result.deficit)} 부족합니다. 수입·저축·부담액을 확인하기 전에는 추천 목표를 적용하지 않습니다.</p>` : ""}
    <dl><div><dt>수입 − 저축 − 내 원금 − 예비비</dt><dd>${formatWon(result.capacity)}</dd></div><div><dt>위 목표에 포함된 고정 소비</dt><dd>${formatWon(result.fixed)}</dd></div><div><dt>식비 추천</dt><dd>${result.foodTarget === null ? "근거 부족 · 현재 설정 유지" : formatWon(result.foodTarget)}</dd></div></dl>
    <p>${explanations[result.basis]}</p>
    ${result.profile.historyConfirmed && result.basis !== "history" ? "<p>최근 완료된 3개월 기록이 모두 있어야 개인 소비 중앙값을 사용합니다.</p>" : ""}
    <button type="button" data-budget-apply-recommendation ${result.canApply ? "" : "disabled"}>이 추천을 이 달에 적용</button>
    <details><summary>평균 참고값과 출처</summary>
      ${result.singleAverage ? `<p><a href="${benchmark.single.url}" target="_blank" rel="noopener noreferrer">${benchmark.single.year}년 전 연령 1인가구</a> · 월 ${formatWon(result.singleAverage)}. 공표 ${benchmark.single.published}.</p>` : "<p>가족·동거 가구 전체의 평균을 개인 평균으로 바꿔 사용하지 않습니다.</p>"}
      ${result.ageAverage ? `<p><a href="${benchmark.age.url}" target="_blank" rel="noopener noreferrer">${benchmark.age.year}년 가구주 ${ageLabel} 가구</a> · 월 ${formatWon(result.ageAverage)}. 가구 전체 평균이며 나이가 같은 개인의 평균이 아닙니다. 공표 ${benchmark.age.published}.</p>` : ""}
      <p>연령·생활 형태·실수령 수입이 모두 일치하는 평균은 확보하지 않았습니다. 통계는 서로 다른 연도·집단의 참고값이며 최신 실시간 시세나 최적 소비 보장이 아닙니다. 식비·저축에 임의의 통계 비율을 적용하지 않습니다.</p>
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
  const profileForm = host.querySelector("[data-budget-profile]");
  const clearRecommendation = () => {
    host.querySelector("[data-budget-recommendation]").innerHTML = "<p>입력값이 바뀌었습니다. 추천 목표를 다시 계산해주세요.</p>";
  };
  profileForm?.addEventListener("input", clearRecommendation);
  profileForm?.addEventListener("change", clearRecommendation);
  profileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!profileForm.reportValidity()) return;
    const fields = ["ageGroup", "living", "incomeStability", "netIncome", "housingCost", "otherFixed", "ownPrincipal", "savingsGoal", "reserve"];
    const profile = Object.fromEntries(fields.map((key) => [key, profileForm.elements[key].value]));
    profile.historyConfirmed = profileForm.elements.historyConfirmed.checked;
    const result = SpendingBudgetCore.recommend(profile, profile.historyConfirmed ? spendingBudgetHistory(model.month) : []);
    const output = host.querySelector("[data-budget-recommendation]");
    output.innerHTML = renderSpendingBudgetRecommendation(result);
    output.querySelector("[data-budget-apply-recommendation]")?.addEventListener("click", () => {
      if (!result.canApply) return;
      const foodInput = host.querySelector("[data-budget-settings]").elements.foodTarget;
      const foodTarget = result.foodTarget ?? Number(foodInput.value);
      if ((result.foodTarget === null && !foodInput.reportValidity())
        || !Number.isFinite(foodTarget) || foodTarget < 0 || foodTarget > result.monthlyLimit) {
        host.querySelector(".spending-budget-feedback").textContent = "식비 목표를 추천 전체 목표 안의 금액으로 조정한 뒤 적용해주세요.";
        return;
      }
      saveSpendingBudgetChange(host, (settings) => ({ ...settings, profile: result.profile,
        monthlyTargets: { ...settings.monthlyTargets, [model.month]: {
          monthlyLimit: result.monthlyLimit, foodTarget,
          savingsTarget: result.savingsTarget, source: "recommendation"
        } }
      }));
    });
  });
  host.querySelector("[data-budget-use-records]")?.addEventListener("click", () => {
    clearRecommendation();
    if (model.referenceIncome !== null) profileForm.elements.netIncome.value = model.referenceIncome;
    profileForm.elements.ownPrincipal.value = model.referencePrincipal;
    const housing = profileForm.elements.housingCost.value;
    if (housing !== "") profileForm.elements.otherFixed.value = Math.max(0, model.referenceFixed - Number(housing));
    host.querySelector(".spending-budget-feedback").textContent = "등록 자료를 불러왔습니다. 주거비를 입력한 경우 고정비에서 한 번 제외했습니다. 부분 입력·변동 수입·가족 정산을 확인하고 계산하세요.";
  });
}
