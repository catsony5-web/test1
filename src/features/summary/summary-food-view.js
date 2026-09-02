function syncSummaryFoodSelection(model) {
  if (summaryFoodSelection.month !== model.month) {
    const date = model.isCurrentMonth ? model.today
      : [...model.days].reverse().find((day) => day.rows.length)?.date || model.days[0].date;
    summaryFoodSelection = { month: model.month, date, week: model.weeks.findIndex((week) => date >= week.startDate && date <= week.endDate) };
    summaryFoodSelectedOrders.clear();
    summaryFoodFeedback = { message: "", type: "" };
  }
  const availableKeys = new Set(model.reviewRows.map(summaryFoodSourceKey));
  summaryFoodSelectedOrders = new Set([...summaryFoodSelectedOrders].filter((key) => availableKeys.has(key)));
}

function renderSummaryFoodBudget(model) {
  const afterText = model.afterDining < 0
    ? `${formatWon(-model.afterDining)} 초과` : `${formatWon(model.afterDining)} 남음`;
  return `<section class="summary-food-budget" aria-labelledby="summaryFoodBudgetTitle">
    <div class="summary-card-heading"><h4 id="summaryFoodBudgetTitle">외식 한 번의 여유는?</h4><span>등록한 식비 기준</span></div>
    <form class="summary-food-budget-form" data-food-budget-form>
      <label>월 식비 목표<input type="number" min="1" max="100000000" step="1" required data-food-budget="monthlyTarget" value="${model.budget.monthlyTarget}" aria-label="월 식비 목표 (원)"></label>
      <label>외식 1회 예상<input type="number" min="0" max="100000000" step="1" required data-food-budget="diningCost" value="${model.budget.diningCost}" aria-label="외식 1회 예상 비용 (원)"></label>
      <button type="submit" data-food-budget-submit>적용</button>
    </form>
    <p class="summary-food-help">원 단위 · 월 목표는 모든 월에 공통으로 적용됩니다.</p>
    <div class="summary-food-budget-totals">
      <div><span>현재 식비</span><strong data-food-month-total>${formatWon(model.totals.amount)}</strong></div>
      <div><span>월 예산 잔액</span><strong class="${model.remaining < 0 ? "food-over" : ""}">${formatWon(model.remaining)}</strong></div>
    </div>
    <div class="summary-food-dining-result ${model.afterDining < 0 ? "food-over" : ""}"><span>외식 ${formatWon(model.budget.diningCost)} 추가 시</span><strong>${afterText}</strong></div>
    <p class="summary-food-budget-note">${model.isCurrentMonth
      ? model.afterDining < 0 ? "추가 외식을 가정하면 월 식비 목표를 넘습니다."
        : `오늘 포함 남은 ${model.remainingDays}일 · 하루 ${formatWon(model.dailyAfterDining)}씩 사용 가능`
      : model.isPastMonth ? "지난달 기록입니다. 추가 외식은 예산 비교용 가정입니다." : "예정 월입니다. 등록된 기록으로 계산한 가정입니다."}</p>
    ${model.pendingRows.length ? `<p class="summary-food-warning">쿠팡 ${model.pendingRows.length}건 분류 확인 필요 · 확인 전에는 외식 여유를 확정할 수 없습니다.</p>` : `<p class="summary-food-help">미입력 지출은 반영되지 않습니다. 실제 잔고와는 다릅니다.</p>`}
    <p class="summary-food-status" data-food-budget-status role="status"></p>
  </section>`;
}

function renderSummaryFood(model) {
  return `<div class="summary-food-layout">
    <section class="summary-food-calendar" aria-labelledby="summaryFoodCalendarTitle">
      <div class="summary-card-heading"><h4 id="summaryFoodCalendarTitle">${escapeHtml(model.month)} 식비 달력</h4><span>월~일 · 금액 단위 원</span></div>
      <p class="summary-food-help">날짜를 누르면 하루 내역, 주 합계를 누르면 그 주 전체 내역을 봅니다.</p>
      <div class="summary-food-weekdays">${SUMMARY_PATTERN_DAYS.map((day) => `<b>${day}</b>`).join("")}<b>주 합계</b></div>
      ${model.weeks.map((week) => `<div class="summary-food-calendar-week">
        ${week.days.map((day) => day ? `<button type="button" class="summary-food-day ${day.isFuture ? "is-future" : ""} ${day.amount ? "has-spending" : ""}" data-food-date="${day.date}" aria-pressed="${summaryFoodSelection.date === day.date}" ${day.outsideCoverage ? "disabled" : ""} aria-label="${day.date} 식비 ${formatWon(day.amount)}, 결제 ${day.count}건${day.pendingCount ? `, 쿠팡 확인 필요 ${day.pendingCount}건` : ""}">
          <span>${day.day}${day.date === model.today ? `<i class="summary-food-today" aria-label="오늘"></i>` : ""}</span>
          <strong>${day.amount ? formatPlainNumber(day.amount) : "—"}</strong>
          <small>${day.pendingCount ? `확인 ${day.pendingCount}건` : day.count ? `${day.count}건` : day.installmentCount ? "할부 배분" : ""}</small>
        </button>` : `<span class="summary-food-day is-outside" aria-hidden="true"></span>`).join("")}
        <button type="button" class="summary-food-week-total" data-food-week="${week.index}" aria-pressed="${!summaryFoodSelection.date && summaryFoodSelection.week === week.index}" aria-label="${week.index + 1}주 ${week.startDay}일부터 ${week.endDay}일까지 식비 ${formatWon(week.amount)} 전체 내역">
          <span>${week.index + 1}주</span><strong>${formatPlainNumber(week.amount)}</strong><small>${week.count}건</small>
        </button>
      </div>`).join("")}
      ${model.undatedRows.length ? `<button type="button" class="summary-food-undated" data-food-date="undated" aria-pressed="${summaryFoodSelection.date === "undated"}">날짜 확인 필요 ${model.undatedRows.length}건 · 식비 ${formatWon(model.undatedTotals.amount)}</button>` : ""}
      <p class="summary-food-help">정산금을 뺀 내 부담액입니다.${model.hasInstallments ? " 할부는 월 배분액을 포함하며, 2회차 이후는 새 결제 건수에서 제외합니다." : ""}</p>
    </section>
    <section class="summary-food-inspector" data-food-inspector aria-live="polite" aria-label="선택한 날짜 또는 주의 식비 내역">${renderSummaryFoodInspector(model)}</section>
  </div>
  ${renderSummaryFoodWeeks(model)}
  ${renderSummaryFoodReview(model)}`;
}

function renderSummaryFoodInspector(model) {
  const { date, week: weekIndex } = summaryFoodSelection;
  const week = model.weeks[weekIndex] || model.weeks[0];
  const rows = date === "undated" ? model.undatedRows
    : date ? model.days.find((day) => day.date === date)?.rows || [] : week.rows;
  const totals = summaryFoodTotals(rows);
  const title = date === "undated" ? "날짜 확인이 필요한 내역"
    : date ? `${date} 내역` : `${week.index + 1}주 · ${week.startDay}일~${week.endDay}일 내역`;
  const sorted = [...rows].sort((a, b) => `${b.approvalDate || ""} ${b.approvalTime || ""}`.localeCompare(`${a.approvalDate || ""} ${a.approvalTime || ""}`));
  return `<div class="summary-card-heading"><h4>${escapeHtml(title)}</h4><span>식비 ${formatWon(totals.amount)}</span></div>
    <p class="summary-food-inspector-summary">결제 ${totals.count}건${totals.installmentCount ? ` · 할부 배분 ${totals.installmentCount}건` : ""}${rows.some(summaryFoodIsPending) ? " · 쿠팡 분류 확인 포함" : ""}</p>
    ${date !== "undated" ? `<div class="summary-food-week-budget"><span>${week.index + 1}주 예산 ${formatWon(week.target)}</span><strong class="${week.remaining < 0 ? "food-over" : ""}">주 잔액 ${formatWon(week.remaining)}</strong></div>` : ""}
    ${sorted.length ? `<ol class="summary-food-entry-list">${sorted.map((item) => {
      const group = SUMMARY_FOOD_GROUPS.find((entry) => entry.key === summaryFoodGroup(item));
      const reimbursement = reimbursementFor(item);
      return `<li><div class="summary-food-entry-heading"><strong>${escapeHtml(comparisonMerchantLabel(item))}</strong><b>${formatWon(consumptionAmount(item))}</b></div>
        <div class="summary-food-entry-meta"><time>${escapeHtml(summaryFoodDateKey(item, model.month) || "날짜 미확인")} ${escapeHtml(item.approvalTime?.slice(0, 5) || "시간 미기록")}</time><span class="summary-food-group group-${group?.key || "pending"}">${escapeHtml(group?.label || "식비 미포함")}</span></div>
        <p>${escapeHtml(item.sector || "미분류")} · ${escapeHtml(item.subcategory || "미분류")}${summaryFoodIsPending(item) ? " · 쿠팡 분류 확인 필요" : ""}</p>
        ${reimbursement ? `<p>결제 ${formatWon(item.amount)} · 정산 ${formatWon(reimbursement)}</p>` : ""}
        ${item.isInstallmentOccurrence ? `<p>${escapeHtml(installmentSummaryText(item))}</p>` : ""}
        ${item.memo ? `<p class="summary-food-entry-memo">${escapeHtml(item.memo)}</p>` : ""}</li>`;
    }).join("")}</ol>` : `<div class="summary-food-empty">이 기간에 등록된 식비 내역이 없습니다.</div>`}`;
}

function renderSummaryFoodWeeks(model) {
  return `<section class="summary-food-weekly" aria-labelledby="summaryFoodWeeklyTitle">
    <div class="summary-card-heading"><h4 id="summaryFoodWeeklyTitle">주별 식비 · 어디에 썼는지</h4><span>금액 / 결제 건수</span></div>
    <div class="summary-food-table-scroll"><table class="summary-food-week-table">
      <thead><tr><th scope="col">주차</th>${SUMMARY_FOOD_GROUPS.map((group) => `<th scope="col">${group.label}</th>`).join("")}<th scope="col">식비 합계</th><th scope="col">주 예산 잔액</th></tr></thead>
      <tbody>${model.weeks.map((week) => `<tr data-food-week-row="${week.index}" class="${summaryFoodSelection.week === week.index && summaryFoodSelection.date !== "undated" ? "is-selected" : ""}">
        <th scope="row"><button type="button" data-food-week="${week.index}"><strong>${week.index + 1}주</strong><small>${summaryFoodMonthRangeLabel(model.month, week.startDay, week.endDay)}</small></button></th>
        ${SUMMARY_FOOD_GROUPS.map(({ key }) => `<td><strong>${formatWon(week.groups[key].amount)}</strong><small>${week.groups[key].count}건</small></td>`).join("")}
        <td><strong>${formatWon(week.amount)}</strong><small>${week.count}건</small></td>
        <td><strong class="${week.remaining < 0 ? "food-over" : ""}">${formatWon(week.remaining)}</strong><small>목표 ${formatWon(week.target)}</small></td>
      </tr>`).join("")}
      ${model.undatedRows.length ? `<tr><th scope="row"><button type="button" data-food-date="undated">날짜 미확인</button></th>${SUMMARY_FOOD_GROUPS.map(({ key }) => `<td>${formatWon(model.undatedTotals.groups[key].amount)}</td>`).join("")}<td>${formatWon(model.undatedTotals.amount)}</td><td>주차 배분 전</td></tr>` : ""}
      </tbody><tfoot><tr><th scope="row">월 합계</th>${SUMMARY_FOOD_GROUPS.map(({ key }) => `<td>${formatWon(model.totals.groups[key].amount)}</td>`).join("")}<td>${formatWon(model.totals.amount)}</td><td>${formatWon(model.remaining)}</td></tr></tfoot>
    </table></div>
    <p class="summary-food-help">기타 식비: 다른 마트·편의점·간식·카페 등. 주 예산은 월 목표를 일수로 나누며, 월초·월말은 이달에 해당하는 날짜만 포함합니다.</p>
  </section>`;
}

function summaryFoodMonthRangeLabel(month, startDay, endDay) {
  const monthNumber = Number(month.slice(5));
  return `${monthNumber}/${startDay}–${monthNumber}/${endDay}`;
}

function renderSummaryFoodReview(model) {
  if (!model.reviewRows.length) return "";
  const rows = model.reviewRows.filter((item) => !summaryFoodReviewPendingOnly || summaryFoodIsPending(item));
  const pendingCount = model.reviewRows.filter(summaryFoodIsPending).length;
  const { sector, subcategory } = summaryFoodReviewCategory;
  return `<details class="summary-food-review" ${pendingCount || summaryFoodFeedback.message ? "open" : ""}>
    <summary>쿠팡 주문 빠른 분류 <span>확인 필요 ${pendingCount}건 / 전체 ${model.reviewRows.length}건</span></summary>
    <p class="summary-food-help">장보기 주문을 선택해 식비로 지정하세요. 이 거래에만 적용하며 쿠팡 전체 분류 규칙은 만들지 않습니다.</p>
    <form data-food-review-form>
      <div class="summary-food-review-controls">
        <label>섹터<select data-food-review-sector>${Object.keys(categories).filter((name) => !["수입", "미분류"].includes(name)).map((name) => `<option value="${escapeHtml(name)}" ${name === sector ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
        <label>세부항목<select data-food-review-subcategory>${summaryFoodSubcategoryOptions(sector, subcategory)}</select></label>
        <button type="submit" data-food-review-submit ${summaryFoodSelectedOrders.size && !summaryFoodSaving ? "" : "disabled"}>${summaryFoodSaving ? "저장 중…" : `선택한 ${summaryFoodSelectedOrders.size}건에 적용`}</button>
      </div>
      <div class="summary-food-review-filters"><label><input type="checkbox" data-food-select-all ${!rows.length ? "disabled" : ""}> 표시된 주문 모두 선택</label><label><input type="checkbox" data-food-pending-only ${summaryFoodReviewPendingOnly ? "checked" : ""}> 확인 필요한 주문만</label></div>
      <div class="summary-food-review-list">${rows.length ? rows.map((item) => {
        const key = summaryFoodSourceKey(item);
        return `<label class="summary-food-review-order"><input type="checkbox" data-food-order="${escapeHtml(key)}" ${summaryFoodSelectedOrders.has(key) ? "checked" : ""} ${summaryFoodSaving ? "disabled" : ""}>
          <span><strong>${escapeHtml(comparisonMerchantLabel(item))}</strong><small>${escapeHtml(item.approvalDate || "날짜 미확인")} · ${escapeHtml(item.sector || "미분류")} / ${escapeHtml(item.subcategory || "미분류")}${summaryFoodIsPending(item) ? " · 확인 필요" : " · 직접 분류"}</small>${item.isInstallmentOccurrence ? `<small>할부 원결제의 분류에 적용됩니다.</small>` : ""}</span>
          <b>${formatWon(consumptionAmount(item))}</b></label>`;
      }).join("") : `<p class="summary-food-empty">확인이 필요한 주문이 없습니다. ‘확인 필요한 주문만’을 해제하면 분류한 주문도 볼 수 있습니다.</p>`}</div>
      <p class="summary-food-status ${summaryFoodFeedback.type === "error" ? "food-over" : ""}" data-food-review-status role="status">${escapeHtml(summaryFoodFeedback.message)}</p>
    </form>
  </details>`;
}

function summaryFoodSubcategoryOptions(sector, selected) {
  return (categories[sector] || []).map((name) => `<option value="${escapeHtml(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>`).join("");
}

function updateSummaryFoodSelection(model, date, weekIndex) {
  if (date) {
    summaryFoodSelection.date = summaryFoodSelection.date === date ? "" : date;
    if (date !== "undated") summaryFoodSelection.week = model.weeks.findIndex((week) => date >= week.startDate && date <= week.endDate);
  } else {
    summaryFoodSelection.date = "";
    summaryFoodSelection.week = weekIndex;
  }
  const panel = els.summaryPatternPanel;
  panel.querySelectorAll("[data-food-date]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.foodDate === summaryFoodSelection.date)));
  panel.querySelectorAll("[data-food-week]").forEach((button) => button.setAttribute("aria-pressed", String(!summaryFoodSelection.date && Number(button.dataset.foodWeek) === summaryFoodSelection.week)));
  panel.querySelectorAll("[data-food-week-row]").forEach((row) => row.classList.toggle("is-selected", summaryFoodSelection.date !== "undated" && Number(row.dataset.foodWeekRow) === summaryFoodSelection.week));
  panel.querySelector("[data-food-inspector]").innerHTML = renderSummaryFoodInspector(model);
}

function updateSummaryFoodReviewSelection() {
  const panel = els.summaryPatternPanel;
  const checkboxes = [...panel.querySelectorAll("[data-food-order]")];
  checkboxes.forEach((input) => { input.checked = summaryFoodSelectedOrders.has(input.dataset.foodOrder); });
  const all = panel.querySelector("[data-food-select-all]");
  if (all) {
    all.checked = checkboxes.length > 0 && checkboxes.every((input) => input.checked);
    all.indeterminate = !all.checked && checkboxes.some((input) => input.checked);
  }
  const submit = panel.querySelector("[data-food-review-submit]");
  if (submit) {
    submit.disabled = summaryFoodSaving || !summaryFoodSelectedOrders.size;
    submit.textContent = summaryFoodSaving ? "저장 중…" : `선택한 ${summaryFoodSelectedOrders.size}건에 적용`;
  }
}

function attachSummaryFoodHandlers(model) {
  const panel = els.summaryPatternPanel;
  panel.querySelectorAll("[data-food-date]").forEach((button) => button.addEventListener("click", () => updateSummaryFoodSelection(model, button.dataset.foodDate)));
  panel.querySelectorAll("[data-food-week]").forEach((button) => button.addEventListener("click", () => updateSummaryFoodSelection(model, "", Number(button.dataset.foodWeek))));
  panel.querySelector("[data-food-budget-form]")?.addEventListener("submit", saveSummaryFoodBudget);
  panel.querySelector("[data-food-review-form]")?.addEventListener("submit", (event) => saveSummaryFoodClassification(event, model));
  panel.querySelectorAll("[data-food-order]").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) summaryFoodSelectedOrders.add(input.dataset.foodOrder);
    else summaryFoodSelectedOrders.delete(input.dataset.foodOrder);
    updateSummaryFoodReviewSelection();
  }));
  panel.querySelector("[data-food-select-all]")?.addEventListener("change", (event) => {
    panel.querySelectorAll("[data-food-order]").forEach((input) => {
      if (event.target.checked) summaryFoodSelectedOrders.add(input.dataset.foodOrder);
      else summaryFoodSelectedOrders.delete(input.dataset.foodOrder);
    });
    updateSummaryFoodReviewSelection();
  });
  panel.querySelector("[data-food-pending-only]")?.addEventListener("change", (event) => {
    summaryFoodReviewPendingOnly = event.target.checked;
    summaryFoodSelectedOrders.clear();
    renderSummary();
    panel.querySelector("[data-food-pending-only]")?.focus({ preventScroll: true });
  });
  panel.querySelector("[data-food-review-sector]")?.addEventListener("change", (event) => {
    const sector = event.target.value;
    const subcategory = sector === "식비" ? "장보기/마트" : categories[sector][0];
    summaryFoodReviewCategory = { sector, subcategory };
    panel.querySelector("[data-food-review-subcategory]").innerHTML = summaryFoodSubcategoryOptions(sector, subcategory);
  });
  panel.querySelector("[data-food-review-subcategory]")?.addEventListener("change", (event) => {
    summaryFoodReviewCategory.subcategory = event.target.value;
  });
  updateSummaryFoodReviewSelection();
}

async function saveSummaryFoodBudget(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const monthlyTarget = Number(form.querySelector('[data-food-budget="monthlyTarget"]').value);
  const diningCost = Number(form.querySelector('[data-food-budget="diningCost"]').value);
  if (!form.checkValidity() || !Number.isFinite(monthlyTarget) || !Number.isFinite(diningCost)) return;
  const previous = appSettings.foodBudget;
  const submit = form.querySelector("[data-food-budget-submit]");
  submit.disabled = true;
  try {
    appSettings.foodBudget = normalizeFoodBudgetSettings({ monthlyTarget, diningCost });
    await saveSettings();
  } catch (error) {
    appSettings.foodBudget = previous;
    const status = els.summaryPatternPanel.querySelector("[data-food-budget-status]");
    if (status) status.textContent = "저장하지 못했습니다. 다시 시도해주세요.";
    submit.disabled = false;
    return;
  }
  renderSummary();
  const status = els.summaryPatternPanel.querySelector("[data-food-budget-status]");
  if (status) status.textContent = "식비 목표를 저장했습니다.";
  els.summaryPatternPanel.querySelector("[data-food-budget-submit]")?.focus({ preventScroll: true });
}

async function saveSummaryFoodClassification(event, model) {
  event.preventDefault();
  if (summaryFoodSaving || !summaryFoodSelectedOrders.size) return;
  const allowed = new Set(model.reviewRows.map(summaryFoodSourceKey));
  const keys = [...summaryFoodSelectedOrders].filter((key) => allowed.has(key));
  if (!keys.length) return;
  const { sector, subcategory } = summaryFoodReviewCategory;
  summaryFoodSaving = true;
  updateSummaryFoodReviewSelection();
  let previous;
  let saved = false;
  try {
    await createAutoSnapshot("쿠팡 주문 분류 전");
    previous = transactions;
    const result = summaryFoodClassificationUpdates(transactions, keys, sector, subcategory);
    if (!result.count) throw new Error("선택한 주문을 찾지 못했습니다. 목록을 다시 확인해주세요.");
    transactions = result.records;
    saved = await saveTransactions();
    if (!saved) throw new Error("분류를 저장하지 못했습니다. 다시 시도해주세요.");
    summaryFoodSelectedOrders.clear();
    summaryFoodFeedback = { type: "success", message: `${result.count}건을 ${sector} / ${subcategory}로 분류했습니다. 카드 결제금액과 다른 주문의 분류 규칙은 바꾸지 않았습니다.` };
  } catch (error) {
    if (previous && !saved) transactions = previous;
    summaryFoodFeedback = { type: "error", message: error.message || "분류를 저장하지 못했습니다." };
  } finally {
    summaryFoodSaving = false;
    if (saved) reclassify();
    else renderSummary();
  }
}
