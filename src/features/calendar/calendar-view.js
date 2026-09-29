function calendarSpendLevel(amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (value >= 300000) return 4;
  if (value >= 100000) return 3;
  if (value >= 50000) return 2;
  if (value > 0) return 1;
  return 0;
}

function calendarSplitCalculation(amountValue, peopleValue) {
  const amount = Number(amountValue);
  const people = Number(peopleValue);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(people) || people < 2) return null;
  const ownAmount = Math.ceil(amount / people);
  return {
    people,
    ownAmount,
    reimbursement: Math.max(0, amount - ownAmount)
  };
}

function toggleCalendarTransactionEditor(recordKey) {
  const normalizedKey = String(recordKey || "");
  if (!normalizedKey) return;
  calendarEditingRecordKey = calendarEditingRecordKey === normalizedKey ? "" : normalizedKey;
  calendarEditFeedback = null;
  renderCalendar();
}

function calendarIncomeTotal(rows) {
  return rows.reduce((total, item) => total + incomeReportingAmount(item), 0);
}

function calendarExpenseTotals(rows) {
  const savingsRows = rows.filter(isMonthlySavingsTransaction);
  const consumptionRows = rows.filter((item) => !isMonthlySavingsTransaction(item));
  return {
    consumption: sumConsumption(consumptionRows),
    principal: sumDebtPrincipal(rows),
    savings: sumActual(savingsRows),
    consumptionCount: consumptionRows.filter((item) => consumptionAmount(item) > 0).length
  };
}

function buildCalendarInstallmentModel(month, billingModel = buildCalendarCardBillingModel(month)) {
  const rows = calendarCardBillingsForPaymentMonth(month, billingModel).flatMap((billing) =>
    billing.rows.filter((item) => item.isInstallmentOccurrence).map((item) => ({
      ...item,
      date: billing.paymentDate
    }))
  );
  return { rows, amount: sum(rows, "amount"), paymentDate: billingModel.paymentDate };
}

function calendarCellAriaLabel(dateKey, consumptionTotal, rows, incomeRows, installmentRows, excludedTotals = null) {
  const parts = [
    dateKey,
    consumptionTotal > 0 ? `소비지출 ${formatWon(consumptionTotal)}` : "소비지출 없음"
  ];
  if (rows.length) parts.push(`거래 ${rows.length.toLocaleString("ko-KR")}건`);
  if (excludedTotals?.principal > 0) parts.push(`대출 원금 ${formatWon(excludedTotals.principal)}, 소비 제외`);
  if (excludedTotals?.savings > 0) parts.push(`저축 ${formatWon(excludedTotals.savings)}, 소비 제외`);
  if (incomeRows.length) parts.push(`수입 ${formatWon(calendarIncomeTotal(incomeRows))}`);
  if (installmentRows.length) parts.push(`할부 결제 ${formatWon(sum(installmentRows, "amount"))}, 정산금 차감 전`);
  return parts.join(", ");
}

function renderCalendarHeatLegend() {
  const items = [
    { level: 0, text: "0", label: "소비지출 없음" },
    { level: 1, text: "<5만", label: "소비지출 1원 이상 5만원 미만" },
    { level: 2, text: "<10만", label: "소비지출 5만원 이상 10만원 미만" },
    { level: 3, text: "<30만", label: "소비지출 10만원 이상 30만원 미만" },
    { level: 4, text: "30만+", label: "소비지출 30만원 이상" }
  ];
  return `
    <div class="calendar-heat-legend" role="list" aria-label="일별 소비지출 색상 기준">
      <strong>일 소비지출</strong>
      ${items.map((item) => `
        <span role="listitem" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}">
          <i data-spend-level="${item.level}" aria-hidden="true"></i>
          <span aria-hidden="true">${escapeHtml(item.text)}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function renderCalendar() {
  const active = reportingExpenseRows(classified);
  const months = appMonthOptions([
    ...active.map((item) => item.month).filter(Boolean),
    ...recurringExpenses.flatMap((item) => [item.startMonth, item.endMonth]).filter(Boolean),
    currentMonthKey()
  ]);
  const requestedMonth = getSharedSelectedMonth(selectedCalendarMonth || els.calendarMonth.value || months.at(-1) || currentMonthKey());
  const selectedMonth = /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : months.at(-1) || currentMonthKey();
  const monthOptions = unique([...months, selectedMonth]).filter(Boolean).sort();
  selectedCalendarMonth = selectedMonth;
  if (canViewDriveSharedMonth("calendar")) setSharedSelectedMonth(selectedMonth, { syncControls: false });
  els.calendarMonth.innerHTML = monthOptions.length
    ? monthOptions.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join("")
    : `<option value="${escapeHtml(selectedMonth)}">${escapeHtml(selectedMonth)}</option>`;
  els.calendarMonth.value = selectedMonth;
  if (els.calendarShowIncome) els.calendarShowIncome.checked = calendarShowIncome;
  if (els.calendarShowAssetMoves) els.calendarShowAssetMoves.checked = calendarShowAssetMoves;
  attachCalendarWorkspaceHandlers();

  if (!selectedMonth) {
    els.calendarMonthSummary.innerHTML = "";
    els.calendarAssetSummary.innerHTML = "";
    if (els.calendarBillingDetail) {
      els.calendarBillingDetail.hidden = true;
      els.calendarBillingDetail.innerHTML = "";
    }
    if (els.calendarMonthlyMemo) els.calendarMonthlyMemo.innerHTML = "";
    if (els.calendarCurrentMonthLabel) els.calendarCurrentMonthLabel.innerHTML = "";
    els.spendingCalendar.innerHTML = `<div class="empty">카드/이체 내역을 불러오거나 직접 추가하면 소비 달력이 표시됩니다.</div>`;
    els.selectedDayTitle.textContent = "날짜를 선택하세요";
    els.selectedDayTimeline.innerHTML = "";
    return;
  }

  const [year, month] = selectedMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const dayCount = new Date(year, month, 0).getDate();
  const monthRows = active.filter((item) => item.month === selectedMonth);
  const monthIncomeRows = calendarShowIncome
    ? classified.filter((item) => item.flow === "income" && item.month === selectedMonth && !isCanceled(item.cancel))
    : [];
  const byDate = groupBy(monthRows, (item) => normalizeDateKey(item.approvalDate));
  const incomeByDate = groupBy(monthIncomeRows, (item) => normalizeDateKey(item.approvalDate));
  const billingModel = buildCalendarCardBillingModel(selectedMonth);
  const outflowModel = buildCalendarCashOutflowModel(selectedMonth, billingModel);
  const installmentModel = buildCalendarInstallmentModel(selectedMonth, billingModel);
  const installmentsByDate = groupBy(installmentModel.rows, (item) => item.date);
  els.calendarMonthSummary.innerHTML = renderCalendarMonthSummary(selectedMonth, monthRows, byDate, installmentModel.rows, calendarShowIncome, billingModel, outflowModel);
  els.calendarAssetSummary.innerHTML = renderCalendarAssetSummary(selectedMonth, monthRows);
  renderCalendarBillingDetail(outflowModel);
  renderCalendarMonthlyMemo(selectedMonth);
  renderCalendarCurrentMonthLabel(selectedMonth, installmentModel.rows);
  attachCalendarSummaryHandlers(selectedMonth);
  const firstSpendDate = [...new Set([...byDate.keys(), ...incomeByDate.keys(), ...installmentsByDate.keys()])].sort()[0]
    || defaultDateForMonth(selectedMonth);
  const activeDate = selectedCalendarDate && selectedCalendarDate.startsWith(selectedMonth) ? selectedCalendarDate : firstSpendDate;
  selectedCalendarDate = activeDate;
  const cells = [];

  ["일", "월", "화", "수", "목", "금", "토"].forEach((day) => {
    cells.push(`<div class="calendar-weekday">${day}</div>`);
  });
  for (let i = 0; i < firstDay.getDay(); i++) {
    cells.push(`<div class="calendar-cell muted"></div>`);
  }
  for (let day = 1; day <= dayCount; day++) {
    const dateKey = `${selectedMonth}-${String(day).padStart(2, "0")}`;
    const rows = byDate.get(dateKey) || [];
    const dayIncomeRows = incomeByDate.get(dateKey) || [];
    const installmentRows = installmentsByDate.get(dateKey) || [];
    const totals = calendarExpenseTotals(rows);
    const total = totals.consumption;
    const installmentTotal = sum(installmentRows, "amount");
    const isSelected = activeDate === dateKey;
    const spendLevel = calendarSpendLevel(total);
    const ariaLabel = calendarCellAriaLabel(dateKey, total, rows, dayIncomeRows, installmentRows, calendarShowAssetMoves ? totals : null);
    cells.push(`
      <button class="calendar-cell ${total > 0 ? "has-spend" : ""} ${installmentRows.length ? "has-scheduled" : ""} ${isSelected ? "selected" : ""}" type="button" data-calendar-date="${escapeHtml(dateKey)}" data-spend-level="${spendLevel}" aria-label="${escapeHtml(ariaLabel)}">
        <span class="calendar-day">${day}</span>
        ${total > 0 ? `<strong>${formatWon(total)}</strong>` : ""}
        ${calendarShowAssetMoves && totals.principal > 0 ? `<em class="calendar-asset-label principal">원금 ${formatWon(totals.principal)}</em>` : ""}
        ${calendarShowAssetMoves && totals.savings > 0 ? `<em class="calendar-asset-label savings">저축 ${formatWon(totals.savings)}</em>` : ""}
        ${dayIncomeRows.length ? `<em class="calendar-income-label">수입 ${formatWon(calendarIncomeTotal(dayIncomeRows))}</em>` : ""}
        ${installmentRows.length ? `<em class="calendar-installment-label">할부 <span>${formatWon(installmentTotal)}</span></em>` : ""}
        ${rows.length || dayIncomeRows.length || installmentRows.length ? `<small>${[
          rows.length ? `${rows.length.toLocaleString("ko-KR")}건` : "",
          dayIncomeRows.length ? `수입 ${dayIncomeRows.length.toLocaleString("ko-KR")}건` : "",
          installmentRows.length ? `할부 ${installmentRows.length.toLocaleString("ko-KR")}건` : ""
        ].filter(Boolean).join(" · ")}</small>` : ""}
      </button>
    `);
  }

  els.spendingCalendar.innerHTML = cells.join("");
  els.spendingCalendar.querySelectorAll("[data-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCalendarDate = button.dataset.calendarDate;
      renderCalendar();
    });
  });

  renderDayTimeline(activeDate, byDate.get(activeDate) || [], installmentsByDate.get(activeDate) || [], incomeByDate.get(activeDate) || []);
}

function renderCalendarCurrentMonthLabel(month, installmentRows = []) {
  if (!els.calendarCurrentMonthLabel) return;
  const [year, monthNumber] = String(month || "").split("-");
  if (!year || !monthNumber) {
    els.calendarCurrentMonthLabel.innerHTML = "";
    return;
  }
  const installmentCount = installmentRows.length;
  const installmentTotal = sum(installmentRows, "amount");
  els.calendarCurrentMonthLabel.innerHTML = `
    <div>
      <strong>${escapeHtml(year)}년 ${escapeHtml(monthNumber)}월</strong>
      <span>금액·색상은 소비지출 기준 · 원금·저축 제외</span>
    </div>
    ${renderCalendarHeatLegend()}
    <div class="calendar-current-month-actions">
      ${calendarDetailReturnState ? `<button type="button" class="calendar-detail-return-button" data-calendar-return-detail>← 상세내역으로 돌아가기</button>` : ""}
      ${installmentCount ? `<em>할부 결제 ${installmentCount.toLocaleString("ko-KR")}건 · ${formatWon(installmentTotal)} · 정산 전</em>` : `<em>이번 달 카드 결제일에 청구되는 할부금이 없습니다.</em>`}
    </div>
  `;
  attachCalendarDetailReturnHandler();
}

function attachCalendarDetailReturnHandler() {
  els.calendarCurrentMonthLabel
    ?.querySelector("[data-calendar-return-detail]")
    ?.addEventListener("click", returnToDetailFromCalendar);
}

function attachCalendarWorkspaceHandlers() {
  const calendarView = document.querySelector("#calendarView");
  const importButton = calendarView?.querySelector('[data-calendar-action="import"]');
  const directButton = calendarView?.querySelector('[data-calendar-action="direct"]');
  const memoSection = calendarView?.querySelector(".calendar-memo-section");
  const memoToggle = memoSection?.querySelector(".calendar-memo-toggle");

  if (importButton) importButton.onclick = () => els.fileInput?.click();
  if (directButton) directButton.onclick = () => switchView("detailBulk");
  if (!memoSection || !memoToggle) return;

  const syncMemoToggle = () => {
    memoToggle.setAttribute("aria-expanded", String(memoSection.classList.contains("is-open")));
  };
  memoToggle.onclick = () => {
    memoSection.classList.toggle("is-open");
    syncMemoToggle();
  };
  syncMemoToggle();
}

let calendarMemoSaveRevision = 0;
const calendarMemoSaveStates = new Map();

function renderCalendarMonthlyMemo(month) {
  if (!els.calendarMonthlyMemo || !isValidMonthKey(month)) return;
  const memo = normalizeCalendarMemo(calendarMemos[month] || {});
  const fontOptions = [
    ["Noto Sans KR", "Noto Sans KR"],
    ["Pretendard", "Pretendard"],
    ["Gowun Dodum", "Gowun"],
    ["Nanum Pen Script", "손글씨"],
    ["serif", "Serif"],
    ["monospace", "Mono"]
  ];
  const paperTabs = [
    ["yellow", "노랑"],
    ["pink", "분홍"],
    ["green", "초록"],
    ["blue", "파랑"],
    ["violet", "보라"]
  ];

  els.calendarMonthlyMemo.innerHTML = `
    <section class="calendar-memo-card paper-${escapeHtml(memo.paper)}" data-calendar-memo-card data-calendar-memo-month="${escapeHtml(month)}">
      <div class="calendar-memo-tabs" aria-label="메모지 색상">
        ${paperTabs.map(([paper, label]) => `
          <button type="button" class="calendar-memo-tab ${paper === memo.paper ? "active" : ""}" data-calendar-memo-paper="${escapeHtml(paper)}" title="${escapeHtml(label)}"></button>
        `).join("")}
      </div>
      <div class="calendar-memo-toolbar" aria-label="월별 메모 서식">
        <select data-calendar-memo-command="formatBlock" title="문단 스타일">
          <option value="p">본문</option>
          <option value="h3">제목</option>
          <option value="h4">소제목</option>
        </select>
        <select data-calendar-memo-command="fontName" title="글꼴">
          ${fontOptions.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}
        </select>
        <select data-calendar-memo-command="fontSize" title="글자 크기">
          <option value="2">14</option>
          <option value="3" selected>16</option>
          <option value="4">18</option>
          <option value="5">22</option>
          <option value="6">26</option>
        </select>
        <button type="button" data-calendar-memo-command="bold" title="굵게"><b>B</b></button>
        <button type="button" data-calendar-memo-command="italic" title="기울기"><i>I</i></button>
        <button type="button" data-calendar-memo-command="strikeThrough" title="취소선"><s>S</s></button>
        <label class="calendar-memo-color" title="글자색">
          <span>A</span>
          <input type="color" data-calendar-memo-command="foreColor" value="#dc2626">
        </label>
        <label class="calendar-memo-color highlight" title="배경색">
          <span>A</span>
          <input type="color" data-calendar-memo-command="hiliteColor" value="#fde68a">
        </label>
        <button type="button" data-calendar-memo-command="insertUnorderedList" title="목록">•</button>
        <button type="button" data-calendar-memo-command="justifyLeft" title="왼쪽 정렬">≡</button>
        <button type="button" data-calendar-memo-command="justifyCenter" title="가운데 정렬">≣</button>
        <button type="button" data-calendar-memo-command="justifyRight" title="오른쪽 정렬">☰</button>
      </div>
      <div class="calendar-memo-head">
        <strong>${escapeHtml(month)} 메모</strong>
        <span data-calendar-memo-status aria-live="polite">${calendarMemoSaveStates.get(month) === "failed" ? "저장 실패" : calendarMemoSaveStates.has(month) ? "저장 중" : memo.updatedAt ? "저장됨" : "새 메모"}</span>
        <button type="button" data-calendar-memo-retry ${calendarMemoSaveStates.get(month) === "failed" ? "" : "hidden"}>다시 저장</button>
      </div>
      <div class="calendar-memo-editor" contenteditable="true" data-calendar-memo-editor aria-label="${escapeHtml(`${month} 월별 메모`)}">${memo.html}</div>
    </section>
  `;
  attachCalendarMemoHandlers(month);
}

function attachCalendarMemoHandlers(month) {
  const card = els.calendarMonthlyMemo?.querySelector("[data-calendar-memo-card]");
  const editor = card?.querySelector("[data-calendar-memo-editor]");
  if (!card || !editor) return;

  const rememberSelection = () => saveCalendarMemoSelection(editor);
  editor.addEventListener("keyup", rememberSelection);
  editor.addEventListener("mouseup", rememberSelection);
  editor.addEventListener("focus", rememberSelection);
  editor.addEventListener("input", () => scheduleCalendarMemoSave(month));
  card.querySelector("[data-calendar-memo-retry]")?.addEventListener("click", () => scheduleCalendarMemoSave(month, { immediate: true }));
  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    restoreCalendarMemoSelection(editor);
    document.execCommand("insertText", false, text);
    scheduleCalendarMemoSave(month);
  });

  card.querySelectorAll("[data-calendar-memo-command]").forEach((control) => {
    const eventNames = control.matches("input[type='color']")
      ? ["input", "change"]
      : [control.matches("select") ? "change" : "click"];
    const handleCommand = (event) => {
      event.preventDefault();
      applyCalendarMemoCommand(editor, control.dataset.calendarMemoCommand, control.value);
      if (control.matches("button")) control.blur();
      scheduleCalendarMemoSave(month);
    };
    eventNames.forEach((eventName) => control.addEventListener(eventName, handleCommand));
  });

  card.querySelectorAll("[data-calendar-memo-paper]").forEach((button) => {
    button.addEventListener("click", () => {
      const paper = button.dataset.calendarMemoPaper || "yellow";
      const current = normalizeCalendarMemo(calendarMemos[month] || {});
      calendarMemos[month] = normalizeCalendarMemo({
        ...current,
        paper,
        updatedAt: new Date().toISOString()
      });
      card.className = `calendar-memo-card paper-${paper}`;
      card.querySelectorAll("[data-calendar-memo-paper]").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });
      scheduleCalendarMemoSave(month, { immediate: true });
    });
  });
}

function saveCalendarMemoSelection(editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  if (editor.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode)) {
    calendarMemoSelectionRange = range.cloneRange();
  }
}

function restoreCalendarMemoSelection(editor) {
  editor.focus();
  if (!calendarMemoSelectionRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(calendarMemoSelectionRange);
}

function calendarMemoHasActiveSelection(editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return false;
  const node = range.commonAncestorContainer;
  return editor.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode);
}

function selectCalendarMemoContents(editor) {
  if (!editor.textContent.trim()) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  calendarMemoSelectionRange = range.cloneRange();
}

function applyCalendarMemoCommand(editor, command, value = "") {
  restoreCalendarMemoSelection(editor);
  if (!calendarMemoHasActiveSelection(editor)) selectCalendarMemoContents(editor);
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(command, false, value || null);
  saveCalendarMemoSelection(editor);
}

function scheduleCalendarMemoSave(month, options = {}) {
  const editor = els.calendarMonthlyMemo?.querySelector("[data-calendar-memo-editor]");
  const status = els.calendarMonthlyMemo?.querySelector("[data-calendar-memo-status]");
  if (!editor || !isValidMonthKey(month)) return;
  const current = normalizeCalendarMemo(calendarMemos[month] || {});
  calendarMemos[month] = normalizeCalendarMemo({
    ...current,
    html: sanitizeCalendarMemoHtml(editor.innerHTML),
    updatedAt: new Date().toISOString()
  });
  calendarMemoSaveRevision += 1;
  calendarMemoSaveStates.set(month, "pending");
  if (status) status.textContent = "저장 중";
  const retry = els.calendarMonthlyMemo?.querySelector("[data-calendar-memo-retry]");
  if (retry) retry.hidden = true;
  clearTimeout(calendarMemoSaveTimer);
  calendarMemoSaveTimer = setTimeout(async () => {
    const revision = calendarMemoSaveRevision;
    const savingMonths = new Set(calendarMemoSaveStates.keys());
    let saved = false;
    try {
      saved = await saveCalendarMemos();
    } catch {
      // 입력은 메모리에 유지하고 사용자가 같은 내용을 다시 저장할 수 있게 한다.
    }
    if (revision !== calendarMemoSaveRevision) return;
    if (saved) calendarMemoSaveStates.clear();
    else calendarMemoSaveStates.forEach((value, pendingMonth) => calendarMemoSaveStates.set(pendingMonth, "failed"));
    const latestStatus = els.calendarMonthlyMemo?.querySelector("[data-calendar-memo-status]");
    const latestRetry = els.calendarMonthlyMemo?.querySelector("[data-calendar-memo-retry]");
    const currentMonth = els.calendarMonthlyMemo?.querySelector("[data-calendar-memo-card]")?.dataset.calendarMemoMonth;
    if (!savingMonths.has(currentMonth)) return;
    if (latestStatus) latestStatus.textContent = saved ? "자동 저장됨" : calendarMemoSaveStates.has(currentMonth) ? "저장 실패" : "저장됨";
    if (latestRetry) latestRetry.hidden = !calendarMemoSaveStates.has(currentMonth);
  }, options.immediate ? 0 : 450);
}

function calendarLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function calendarDateForMonthDay(month, day) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  if (!year || !monthNumber) return "";
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return calendarLocalDateKey(new Date(year, monthNumber - 1, Math.min(lastDay, Math.max(1, Number(day || 1)))));
}

function adjustCalendarBillingPaymentDate(dateKey, weekendRule) {
  if (weekendRule !== "next-monday") return dateKey;
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getDay() === 6) date.setDate(date.getDate() + 2);
  else if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  return calendarLocalDateKey(date);
}

function formatCalendarMonthDay(dateKey) {
  const [, month, day] = String(dateKey || "").split("-");
  return month && day ? `${Number(month)}.${Number(day)}` : "-";
}

function buildCalendarCardBillingModel(billingMonth) {
  const settings = normalizeCardBillingSettings(appSettings.cardBilling);
  const startMonth = settings.startDay > settings.endDay ? shiftMonthKey(billingMonth, -1) : billingMonth;
  const periodStart = calendarDateForMonthDay(startMonth, settings.startDay);
  const periodEnd = calendarDateForMonthDay(billingMonth, settings.endDay);
  const scheduledPaymentDate = calendarDateForMonthDay(billingMonth, settings.paymentDay);
  const paymentDate = adjustCalendarBillingPaymentDate(scheduledPaymentDate, settings.weekendRule);
  const rows = reportingExpenseRows(classified)
    .filter((item) => {
      const date = normalizeDateKey(item.approvalDate);
      return item.sourceType === "card"
        && date
        && date >= periodStart
        && date <= periodEnd;
    })
    .sort((a, b) => `${a.approvalDate} ${a.approvalTime}`.localeCompare(`${b.approvalDate} ${b.approvalTime}`, "ko-KR"));
  const netAmount = rows.reduce((total, item) => total + Number(item.amount || 0), 0);
  return {
    billingMonth,
    settings,
    periodStart,
    periodEnd,
    scheduledPaymentDate,
    paymentDate,
    rows,
    netAmount,
    expectedAmount: Math.max(0, netAmount)
  };
}

function renderCalendarBillingDetail(model) {
  if (!els.calendarBillingDetail) return;
  els.calendarBillingDetail.hidden = !calendarBillingExpanded;
  if (!calendarBillingExpanded) {
    els.calendarBillingDetail.innerHTML = "";
    return;
  }
  const billingDescription = model.billings.map((billing) =>
    `${formatCalendarMonthDay(billing.periodStart)}~${formatCalendarMonthDay(billing.periodEnd)} 이용분 → ${formatCalendarMonthDay(billing.paymentDate)} 결제${billing.paymentDate !== billing.scheduledPaymentDate ? " (주말 이월)" : ""}`
  ).join(" · ");
  els.calendarBillingDetail.innerHTML = `
    <div class="calendar-billing-detail-head">
      <div>
        <span>이번 달 출금액</span>
        <h3>${escapeHtml(model.billing.billingMonth)} · ${formatWon(model.expectedAmount)}</h3>
        <p>${escapeHtml(billingDescription || "이번 달 카드 결제일 없음")}</p>
      </div>
      <div class="calendar-billing-detail-actions">
        <button type="button" data-open-card-billing-settings><i class="ti ti-settings" aria-hidden="true"></i><span>결제 주기</span></button>
        <button type="button" class="icon-button" data-close-card-billing aria-label="이번 달 출금 내역 닫기" title="닫기"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
    </div>
    <p class="calendar-billing-notice">카드 청구액과 별도로 나가는 보험료·신용대출 원금 및 이자를 정산금 차감 전으로 합산합니다. 등록된 내역과 예정 기준이며 카드사·은행의 확정 출금액과 다를 수 있습니다. 날짜는 출금일이며, 할부금은 카드 청구액에 포함되어 있습니다.</p>
    ${model.duplicateWarnings.length ? `<p class="calendar-billing-notice" role="status">중복 확인 필요: ${escapeHtml(model.duplicateWarnings.map((item) => item.name).join(", "))}. 고정 지출에서 가져온 출금과의 연결을 확인해주세요.</p>` : ""}
    ${renderCalendarOutflowGroup("카드 청구액 · 할부 포함", model.cardRows, model.cardAmount)}
    ${renderCalendarOutflowGroup("별도 보험료", model.insuranceRows, model.insuranceAmount)}
    ${renderCalendarOutflowGroup("별도 신용대출 · 원금+이자", model.loanRows, model.loanAmount)}
  `;
}

function renderCalendarOutflowGroup(label, rows, amount) {
  return `
    <section class="calendar-billing-group" aria-label="${escapeHtml(label)}">
      <h4>${escapeHtml(label)} · ${formatWon(amount)}</h4>
      <div class="calendar-billing-list" role="list" aria-label="${escapeHtml(label)} 내역">
      ${rows.length ? rows.map((item) => `
        <article class="calendar-billing-row" role="listitem">
          <time datetime="${escapeHtml(item.outflowDate)}">${escapeHtml(formatCalendarMonthDay(item.outflowDate))}</time>
          <strong title="${escapeHtml(item.merchant || "")}">${escapeHtml(item.merchant || "내용 없음")}${item.scheduled ? " · 예정" : ""}</strong>
          ${categoryChip(item.sector || "미분류")}
          <span class="${Number(item.amount || 0) < 0 ? "negative" : ""}">${formatSignedWon(item.amount)}</span>
        </article>
      `).join("") : `<div class="empty compact-empty">해당하는 내역이 없습니다.</div>`}
      </div>
    </section>
  `;
}

function renderCalendarMonthSummary(month, monthRows, byDate, installmentRows = [], showIncome = true, billingModel = buildCalendarCardBillingModel(month), outflowModel = buildCalendarCashOutflowModel(month, billingModel)) {
  const totals = calendarExpenseTotals(monthRows);
  const totalSpend = totals.consumption;
  const installmentTotal = sum(installmentRows, "amount");
  const totalIncome = importedIncomeForMonth(month) + Number(monthlyIncome[month] || 0);
  const settlementDelta = loanSupportSettlementDeltaForMonth(reportingExpenseRows(classified), month);
  const balance = totalIncome - totalSpend - totals.principal - totals.savings + settlementDelta;
  const dailyTotals = [...byDate.entries()]
    .map(([date, rows]) => {
      const daily = calendarExpenseTotals(rows);
      return { date, amount: daily.consumption, count: daily.consumptionCount };
    })
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const spendDayCount = dailyTotals.length;
  const avgSpend = spendDayCount ? Math.round(totalSpend / spendDayCount) : 0;
  const topDay = dailyTotals[0] || { date: "-", amount: 0, count: 0 };
  const unknownAmount = calendarExpenseTotals(monthRows.filter((item) => item.sector === "미분류")).consumption;
  const coreMetrics = [
    renderCalendarMetric("소비지출", formatWon(totalSpend), "정산 후 내 보험료·대출 이자 포함 · 원금 제외", "spend", { priority: "core", key: "spend" }),
    ...(showIncome ? [
      renderCalendarMetric("총수입", formatWon(totalIncome), "수입 입력 + 이체 입금", "income", { incomeMonth: month, priority: "core", key: "income" }),
      renderCalendarMetric("자유 잔액", formatSignedWon(balance), "소비·원금 상환·저축 후 남은 돈", balance >= 0 ? "positive" : "negative", { priority: "core", key: "balance" })
    ] : []),
    renderCalendarMetric(
      "이번 달 출금액",
      formatWon(outflowModel.expectedAmount),
      `정산금 차감 전 · 카드 ${formatWon(outflowModel.cardAmount)} + 보험 ${formatWon(outflowModel.insuranceAmount)} + 신용대출 ${formatWon(outflowModel.loanAmount)}${outflowModel.duplicateWarnings.length ? " · 중복 확인 필요" : " · 등록·예정 기준"}`,
      "card-billing",
      { priority: "core", key: "card-billing", action: "card-billing", expanded: calendarBillingExpanded }
    )
  ];
  const supportMetrics = [
    renderCalendarMetric("이번 달 할부금", formatWon(installmentTotal), `${installmentRows.length.toLocaleString("ko-KR")}건 · 정산 전 · 출금액에 포함`, "scheduled", { priority: "support", key: "installment" }),
    renderCalendarMetric("하루 평균 소비", formatWon(avgSpend), spendDayCount ? `소비 발생 ${spendDayCount.toLocaleString("ko-KR")}일 기준` : "소비지출 없음", "average", { priority: "support", key: "average" }),
    renderCalendarMetric("가장 많이 쓴 날", topDay.date, `${formatWon(topDay.amount)} · ${topDay.count.toLocaleString("ko-KR")}건`, topDay.amount > 0 ? "topday" : "neutral", { priority: "support", key: "top-day" }),
    renderCalendarMetric("미분류", formatWon(unknownAmount), unknownAmount > 0 ? "분류 확인 필요" : "분류 필요 항목 없음", unknownAmount > 0 ? "unknown" : "neutral", { priority: "support", key: "unknown" })
  ];
  return `
    <div class="calendar-summary-row core" aria-label="소비 달력 핵심 요약">
      ${coreMetrics.join("")}
    </div>
    <div class="calendar-summary-row support" aria-label="소비 달력 보조 요약">
      ${supportMetrics.join("")}
    </div>
  `;
}

function renderCalendarAssetSummary(month, monthRows) {
  const totals = calendarExpenseTotals(monthRows);
  const settlementDelta = loanSupportSettlementDeltaForMonth(reportingExpenseRows(classified), month);
  return `
    <h3>소비와 따로 보기</h3>
    <div class="calendar-asset-metric" data-calendar-metric="principal">
      <i class="ti ti-building-bank" aria-hidden="true"></i>
      <div><span>대출 원금 상환</span><strong>${formatWon(totals.principal)}</strong><small>내 부담 기준</small></div>
      <span class="calendar-flow-badge">소비 제외</span>
    </div>
    <div class="calendar-asset-metric" data-calendar-metric="savings">
      <i class="ti ti-pig-money" aria-hidden="true"></i>
      <div><span>저축</span><strong>${formatWon(totals.savings)}</strong><small>적금·예금만 분리</small></div>
      <span class="calendar-flow-badge saving">소비 제외</span>
    </div>
    <p class="calendar-balance-formula">자유 잔액 = 수입 − 소비지출 − 대출 원금 − 저축${settlementDelta ? ` <span>· 가족 분담 정산 ${formatSignedWon(settlementDelta)} 반영</span>` : ""}</p>
    <p class="calendar-consumption-note">소비지출은 정산 후 내 보험료·생활비와 본인 부담 대출 이자를 합산합니다. 원금은 별도로 표시합니다. 이번 달 출금액과 할부금은 정산 전 납부액을 보여주며, 소비지출에 다시 더하지 않습니다.</p>
  `;
}

function renderCalendarMetric(label, value, hint, tone, options = {}) {
  const attrs = options.incomeMonth ? ` data-open-income-month="${escapeHtml(options.incomeMonth)}"` : "";
  const actionAttr = options.action ? ` data-calendar-summary-action="${escapeHtml(options.action)}"` : "";
  const metricAttr = options.key ? ` data-calendar-metric="${escapeHtml(options.key)}"` : "";
  const priorityClass = options.priority ? ` is-${escapeHtml(options.priority)}` : "";
  const isButton = Boolean(options.incomeMonth || options.action);
  const expandedAttr = options.action ? ` aria-expanded="${options.expanded ? "true" : "false"}"` : "";
  const tagOpen = isButton
    ? `<button type="button" class="calendar-summary-card ${escapeHtml(tone)}${priorityClass}"${attrs}${actionAttr}${metricAttr}${expandedAttr}>`
    : `<article class="calendar-summary-card ${escapeHtml(tone)}${priorityClass}"${metricAttr}>`;
  const tagClose = isButton ? "button" : "article";
  return `
    ${tagOpen}
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </${tagClose}>
  `;
}

function attachCalendarSummaryHandlers(selectedMonth) {
  els.calendarMonthSummary.querySelectorAll("[data-open-income-month]").forEach((button) => {
    button.addEventListener("click", () => {
      openIncomeView({
        month: button.dataset.openIncomeMonth || selectedMonth,
        source: "calendar",
        selectedDate: selectedCalendarDate,
        scrollToRecords: true
      });
    });
  });
  els.calendarMonthSummary.querySelectorAll('[data-calendar-summary-action="card-billing"]').forEach((button) => {
    button.addEventListener("click", () => {
      calendarBillingExpanded = !calendarBillingExpanded;
      renderCalendar();
      if (calendarBillingExpanded) {
        requestAnimationFrame(() => els.calendarBillingDetail?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      }
    });
  });
  els.calendarBillingDetail?.querySelector("[data-close-card-billing]")?.addEventListener("click", () => {
    calendarBillingExpanded = false;
    renderCalendar();
    requestAnimationFrame(() => els.calendarMonthSummary?.querySelector('[data-calendar-summary-action="card-billing"]')?.focus());
  });
  els.calendarBillingDetail?.querySelector("[data-open-card-billing-settings]")?.addEventListener("click", (event) => {
    setAdminTab("screen");
    openAdminMenu({ returnFocus: event.currentTarget });
    requestAnimationFrame(() => {
      document.querySelector(".card-billing-settings-section")?.scrollIntoView({ block: "nearest" });
      els.cardBillingStartDay?.focus();
    });
  });
}

function renderDayTimeline(dateKey, rows, installmentRows = [], incomeRows = []) {
  const totals = calendarExpenseTotals(rows);
  const totalText = totals.consumption > 0 ? `소비지출 ${formatWon(totals.consumption)}` : "소비지출 없음";
  const titleParts = [`${dateKey} 소비`, totalText];
  if (incomeRows.length) titleParts.push(`수입 ${formatWon(calendarIncomeTotal(incomeRows))}`);
  if (installmentRows.length) titleParts.push(`할부 결제 ${formatWon(sum(installmentRows, "amount"))} (정산 전)`);
  els.selectedDayTitle.textContent = titleParts.join(" · ");
  const feedbackHtml = renderCalendarEditFeedback();
  if (!rows.length && !incomeRows.length && !installmentRows.length) {
    els.selectedDayTimeline.innerHTML = `${feedbackHtml}<div class="empty">이 날짜의 소비 내역이 없습니다.</div>`;
    return;
  }
  const sortedRows = [...rows].sort((a, b) =>
    `${a.approvalTime || "99:99"} ${a.merchant}`.localeCompare(`${b.approvalTime || "99:99"} ${b.merchant}`, "ko-KR")
  );
  const duplicateGroups = calendarDuplicateGroups(sortedRows.filter((item) => !item.isInstallmentOccurrence));
  const duplicateMap = calendarDuplicateMetaMap(duplicateGroups);
  const duplicateHtml = renderCalendarDuplicateGroups(duplicateGroups);
  const actualHtml = sortedRows.map((item) => renderCalendarTransactionCard(item, duplicateMap.get(item.recordKey))).join("");
  const incomeHtml = incomeRows.length ? `
    <div class="income-timeline-group">
      <h4>수입 내역</h4>
      ${incomeRows
        .sort((a, b) => `${a.approvalTime || "99:99"} ${a.merchant}`.localeCompare(`${b.approvalTime || "99:99"} ${b.merchant}`, "ko-KR"))
        .map((item) => `
          <article class="timeline-item income-item">
            <time>${escapeHtml(item.approvalTime || "시간 없음")}</time>
            <div class="timeline-main">
              <strong title="${escapeHtml(item.merchant)}">${escapeHtml(item.merchant || "수입")}</strong>
              <div class="timeline-tags">${categoryChip("수입", item.subcategory || "이체입금")}</div>
            </div>
            <div class="scheduled-actions">
              <b>${formatWon(incomeReportingAmount(item))}</b>
              ${loanSupportLinkedIncomeAmount(item.transactionId || item.recordKey) ? `<small>계좌 입금 ${formatWon(item.amount)} · 대출 분담 ${formatWon(loanSupportLinkedIncomeAmount(item.transactionId || item.recordKey))} 제외</small>` : ""}
            </div>
          </article>
        `).join("")}
    </div>
  ` : "";
  const installmentHtml = installmentRows.length ? `
    <div class="scheduled-timeline-group">
      <h4>이날 결제되는 할부금</h4>
      <p>정산 전 카드 청구액입니다. 이번 달 출금액에 포함되어 있으며 소비지출에 다시 더하지 않습니다.</p>
      ${installmentRows.map((item) => `
        <article class="timeline-item scheduled-item">
          <time datetime="${escapeHtml(item.date)}">${escapeHtml(formatCalendarMonthDay(item.date))}</time>
          <div class="timeline-main">
            <strong title="${escapeHtml(item.merchant)}">${escapeHtml(item.merchant)}</strong>
            <div class="timeline-tags">
              <span class="installment-badge">${Number(item.installmentIndex)} / ${Number(item.installmentMonths)}회차</span>
              ${categoryChip(item.sector, item.subcategory)}
            </div>
            <p>총 구매액 ${formatWon(item.installmentOriginalAmount)} · 정산 전 회차 금액</p>
          </div>
          <div class="scheduled-actions">
            <b>${formatWon(item.amount)}</b>
          </div>
        </article>
      `).join("")}
    </div>
  ` : "";
  els.selectedDayTimeline.innerHTML = [feedbackHtml, duplicateHtml, actualHtml, incomeHtml, installmentHtml].filter(Boolean).join("");
  attachCalendarTimelineHandlers(els.selectedDayTimeline);
  attachRecurringHandlers(els.selectedDayTimeline);
}

function renderCalendarTransactionCard(item, duplicateMeta = null) {
  const editRecordKey = item.installmentSourceRecordKey || item.recordKey;
  const isLoan = isLoanRepaymentTransaction(item);
  const isSavings = isMonthlySavingsTransaction(item);
  const isEditing = calendarEditingRecordKey === editRecordKey && !isLoan;
  const isUnknown = item.sector === "미분류" || item.status === "미분류";
  const suggestion = item.suggestion || null;
  const reimbursement = reimbursementFor(item);
  const installmentText = installmentSummaryText(item);
  return `
    <article class="timeline-item calendar-transaction-card ${isUnknown ? "needs-classification" : ""} ${duplicateMeta ? "duplicate-suspect" : ""} ${isEditing ? "editing" : ""}" data-calendar-card="${escapeHtml(editRecordKey)}">
      <time>${escapeHtml(item.approvalTime || "시간 없음")}</time>
      <div class="timeline-main">
        <strong title="${escapeHtml(item.merchant)}">${escapeHtml(item.merchant || "내용 없음")}</strong>
        <div class="timeline-tags">
          ${categoryChip(item.sector, item.subcategory)}
          ${foodOccasionBadge(item)}
          ${isUnknown ? `<span class="classification-needed-badge">분류 필요</span>` : ""}
          ${duplicateMeta ? `<span class="duplicate-suspect-badge">중복 의심 ${duplicateMeta.groupLabel}</span>` : ""}
          ${item.manualSector ? `<span class="manual-entry-badge">직접 수정</span>` : ""}
          ${installmentText ? `<span class="installment-badge">${escapeHtml(installmentText)}</span>` : ""}
          ${isSavings ? `<span class="calendar-flow-badge saving">저축 · 소비 제외</span>` : ""}
        </div>
        ${!isLoan ? `<p>총 결제 ${formatWon(item.amount)}${reimbursement ? ` · 정산 ${formatWon(reimbursement)}` : ""}</p>` : ""}
        ${isUnknown ? renderCalendarSuggestion(suggestion) : ""}
      </div>
      <div class="timeline-amount-actions">
        ${isLoan || isSavings ? `<span class="calendar-amount-label">${isLoan ? "총 상환" : "저축"}</span>` : ""}
        <b>${formatWon(isLoan ? item.amount : actualAmount(item))}</b>
        <div class="timeline-actions">
          ${isUnknown && suggestion ? `<button type="button" class="calendar-suggestion-button" data-calendar-apply-suggestion="${escapeHtml(editRecordKey)}" data-sector="${escapeHtml(suggestion.sector)}" data-subcategory="${escapeHtml(suggestion.subcategory)}">추천 적용</button>` : ""}
          ${isLoan
            ? `<button type="button" class="calendar-edit-button" data-edit-loan-payment="${escapeHtml(item.recurringId)}" data-post-month="${escapeHtml(item.month)}" data-loan-payment-record="${escapeHtml(item.recordKey)}">상환 내역 수정</button>`
            : `<button type="button" class="calendar-edit-button" data-calendar-edit="${escapeHtml(editRecordKey)}" aria-expanded="${isEditing}">${isEditing ? "편집 닫기" : isUnknown ? "빠른 분류" : "수정"}</button>`}
          <button type="button" class="calendar-detail-button" data-calendar-detail="${escapeHtml(editRecordKey)}">상세 내역</button>
        </div>
      </div>
      ${isLoan ? renderCalendarLoanBreakdown(item) : ""}
      ${isEditing ? renderCalendarEditForm(calendarClassifiedItem(editRecordKey) || item) : ""}
    </article>
  `;
}

function renderCalendarLoanBreakdown(item) {
  const interest = loanInterestActualAmount(item);
  const principal = loanPrincipalActualAmount(item);
  const support = loanSupportDueAmount(item);
  return `
    <div class="calendar-loan-breakdown" aria-label="대출 상환 소비 구분">
      <div><span>${support ? "내 이자" : "이자"}</span><strong>${formatWon(interest)}</strong><span class="calendar-flow-badge included">소비 포함</span></div>
      <div><span>${support ? "내 원금" : "원금"}</span><strong>${formatWon(principal)}</strong><span class="calendar-flow-badge">소비 제외</span></div>
      <p>총 상환 ${formatWon(item.amount)} 중 소비지출에는 ${support ? "내 부담 " : ""}이자 ${formatWon(interest)}만 반영합니다.</p>
      ${support ? `<p>가족 분담 ${formatWon(support)} · 실제 받은 금액 ${formatWon(loanSupportReceivedAmount(item))}. 분담금의 입금 시점 차이는 자유 잔액에 반영합니다.</p>` : ""}
    </div>
  `;
}

function calendarLoanSummaryText(item, options = {}) {
  const support = loanSupportDueAmount(item);
  const parts = [
    options.includeTotal ? `총 상환 ${formatWon(item.amount)}` : "",
    `전체 원금 ${formatWon(loanGrossPrincipalAmount(item))}`,
    `이자 ${formatWon(loanGrossInterestAmount(item))}`,
    support ? `내 부담 ${formatWon(loanPrincipalActualAmount(item) + loanInterestActualAmount(item))}` : "",
    support ? `가족 분담 ${formatWon(support)}` : ""
  ].filter(Boolean);
  return escapeHtml(parts.join(" · "));
}

function renderCalendarSuggestion(suggestion) {
  if (!suggestion) {
    return `<div class="calendar-suggestion muted">추천 분류 없음 · 직접 분류가 필요합니다.</div>`;
  }
  return `
    <div class="calendar-suggestion">
      <span>추천: <strong>${escapeHtml(suggestion.sector)} / ${escapeHtml(suggestion.subcategory)}</strong></span>
      <small>${Number(suggestion.confidence || 0)}% · ${escapeHtml(suggestion.reason || "기존 분류 기준")}</small>
    </div>
  `;
}

function renderCalendarDuplicateGroups(groups) {
  if (!groups.length) return "";
  return `
    <section class="calendar-duplicate-panel" aria-live="polite">
      <div>
        <strong>중복 의심 거래가 있습니다.</strong>
        <p>같은 날짜·시간·가맹점명·금액이 완전히 같은 거래만 표시합니다. 확인 후 하나만 남길 수 있습니다.</p>
      </div>
      <div class="calendar-duplicate-list">
        ${groups.map((group, index) => {
          const first = group.items[0];
          const removeCount = Math.max(0, group.items.length - 1);
          return `
            <article class="calendar-duplicate-group">
              <div>
                <span>그룹 ${index + 1}</span>
                <strong>${escapeHtml(first.approvalTime || "시간 없음")} · ${escapeHtml(first.merchant || "내용 없음")}</strong>
                <small>${formatWon(first.amount)} · ${group.items.length.toLocaleString("ko-KR")}건${group.reimbursementSame ? " · 정산금 동일" : ""}</small>
              </div>
              <button type="button" class="calendar-duplicate-cleanup" data-calendar-dedupe-signature="${escapeHtml(encodeURIComponent(group.signature))}">
                중복 ${removeCount.toLocaleString("ko-KR")}건 삭제
              </button>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderCalendarEditForm(item) {
  const normalizedDate = normalizeInputDate(item.approvalDate) || selectedCalendarDate || defaultDateForMonth(item.month);
  const normalizedTime = normalizeInputTime(item.approvalTime || "");
  const assignment = normalizeCategoryAssignment(item.sector, item.subcategory, item.merchant);
  const reimbursement = reimbursementFor(item);
  const installmentEnabled = Boolean(item.installmentEnabled && Number(item.installmentMonths || 0) > 1);
  const parsedInstallmentMonths = installmentMonths(item.installment);
  const installmentMonthCount = installmentEnabled ? Number(item.installmentMonths || 0) : parsedInstallmentMonths || 2;
  const installmentStartMonth = item.installmentStartMonth || item.month || monthKey(item.approvalDate) || currentMonthKey();
  const installmentPreview = Math.floor(Number(item.amount || 0) / Math.max(1, installmentMonthCount));
  return `
    <form class="calendar-edit-form" data-calendar-edit-form="${escapeHtml(item.recordKey)}">
      <div class="calendar-edit-grid">
        <label>날짜
          <input type="date" name="date" value="${escapeHtml(normalizedDate)}" required>
        </label>
        <label>시간
          <input type="time" name="time" value="${escapeHtml(normalizedTime)}">
        </label>
        <label class="wide">내용/가맹점명
          <input type="text" name="merchant" value="${escapeHtml(item.merchant)}" required>
        </label>
        <label>총 결제액
          <input step="1" data-number-kind="money" type="text" name="amount" inputmode="numeric" value="${escapeHtml(Math.round(Number(item.amount || 0)).toLocaleString("ko-KR"))}" required>
        </label>
        <label>정산받은 금액
          <input step="1" data-number-kind="money" type="text" name="reimbursement" inputmode="numeric" value="${escapeHtml(Math.round(reimbursement).toLocaleString("ko-KR"))}">
        </label>
        <label>실 지출액
          <input class="calendar-actual-preview" type="text" value="${escapeHtml(formatWon(actualAmount(item)))}" readonly>
        </label>
        <div class="calendar-split-calculator wide" data-calendar-split-calculator role="group" aria-label="N빵 정산금 계산기">
          <div class="calendar-split-copy">
            <strong>N빵 계산</strong>
            <span>총 인원에 나를 포함해 입력하세요. 적용 전에는 정산금이 바뀌지 않습니다.</span>
          </div>
          <label>총 인원 (나 포함)
            <input data-number-kind="quantity" data-number-unit="명" type="text" name="splitPeople" inputmode="numeric" min="2" step="1" placeholder="예: 3" autocomplete="off">
          </label>
          <button type="button" class="calendar-split-apply" data-calendar-split-apply disabled>정산금에 적용</button>
          <output class="calendar-split-result" data-calendar-split-result aria-live="polite">2명 이상 입력하면 내 몫과 정산금을 계산합니다.</output>
        </div>
        <label>섹터
          <select class="calendar-edit-sector" name="sector">${calendarSectorOptionsHtml(assignment.sector)}</select>
        </label>
        <label>세부항목
          <select class="calendar-edit-subcategory" name="subcategory">${calendarSubcategoryOptionsHtml(assignment.sector, assignment.subcategory)}</select>
        </label>
        <label class="calendar-food-occasion wide" data-calendar-food-occasion ${assignment.sector === "식비" ? "" : "hidden"}>지출 상황 (선택)
          <select name="foodOccasion" aria-label="지출 상황 (선택)" ${assignment.sector === "식비" ? "" : "disabled"}>
            <option value="">일반 지출 (태그 없음)</option>
            ${FOOD_OCCASIONS.map((occasion) => `<option value="${occasion.key}" ${occasion.key === normalizeFoodOccasion(item.foodOccasion) ? "selected" : ""}>${escapeHtml(occasion.label)}</option>`).join("")}
          </select>
          <small>이 거래에만 표시합니다. 상황은 하나만 선택하며 식비 합계에서 빠지지 않습니다.</small>
        </label>
        <label class="wide">메모
          <input type="text" name="memo" value="${escapeHtml(item.memo || "")}">
        </label>
        <div class="calendar-installment-line wide">
          <label class="check-line calendar-installment-toggle">
            <input type="checkbox" name="installmentEnabled" ${installmentEnabled ? "checked" : ""}>
            <span>할부 적용</span>
          </label>
          <label class="calendar-installment-field" ${installmentEnabled ? "" : "hidden"}>
            할부 개월 수
            <input data-number-kind="duration" data-number-unit="개월" type="number" name="installmentMonths" min="2" max="60" value="${escapeHtml(installmentMonthCount)}">
          </label>
          <label class="calendar-installment-field" ${installmentEnabled ? "" : "hidden"}>
            할부 시작 월
            <input type="month" name="installmentStartMonth" value="${escapeHtml(installmentStartMonth)}">
          </label>
          <label class="calendar-installment-field" ${installmentEnabled ? "" : "hidden"}>
            월별 반영액
            <input class="calendar-installment-preview" type="text" value="${escapeHtml(formatWon(installmentPreview))}" readonly>
          </label>
        </div>
      </div>
      <label class="calendar-rule-option">
        <input type="checkbox" name="saveRule">
        이 사용처를 분류 규칙으로 저장
      </label>
      <div class="calendar-edit-actions">
        <button type="button" class="calendar-delete-button" data-calendar-delete="${escapeHtml(item.recordKey)}">삭제</button>
        <div class="calendar-edit-save-actions">
          <button type="submit" class="primary-action">저장</button>
          <button type="button" data-calendar-cancel>취소</button>
        </div>
      </div>
      ${item.sourceType === "recurring" && item.recurringId ? `<p class="calendar-delete-note">고정 지출에서 반영된 거래를 삭제해도 고정 지출 원본은 유지됩니다.</p>` : ""}
    </form>
  `;
}

function calendarSectorOptionsHtml(selected) {
  return Object.keys(categories)
    .filter((sector) => sector !== "수입")
    .map((sector) => `<option value="${escapeHtml(sector)}" ${sector === selected ? "selected" : ""}>${escapeHtml(sector)}</option>`)
    .join("");
}

function calendarSubcategoryOptionsHtml(sector, selected = "") {
  const options = categories[sector] || categories["미분류"] || [];
  return options
    .map((subcategory) => `<option value="${escapeHtml(subcategory)}" ${subcategory === selected ? "selected" : ""}>${escapeHtml(subcategory)}</option>`)
    .join("");
}

function attachCalendarTimelineHandlers(root) {
  root.querySelectorAll("[data-calendar-card]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, textarea, form, a")) return;
      const item = calendarClassifiedItem(card.dataset.calendarCard);
      if (item && isLoanRepaymentTransaction(item)) {
        openLoanPaymentDialog(item.recurringId, item.month, item.recordKey);
        return;
      }
      toggleCalendarTransactionEditor(card.dataset.calendarCard);
    });
  });

  root.querySelectorAll("[data-calendar-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleCalendarTransactionEditor(button.dataset.calendarEdit);
    });
  });

  root.querySelectorAll("[data-calendar-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarEditingRecordKey = "";
      calendarEditFeedback = null;
      renderCalendar();
    });
  });

  root.querySelectorAll("[data-calendar-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = calendarClassifiedItem(button.dataset.calendarDetail);
      if (!item) return;
      openDetailView(calendarDetailOptions(item));
    });
  });

  root.querySelectorAll("[data-calendar-edit-posted]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleCalendarTransactionEditor(button.dataset.calendarEditPosted);
    });
  });

  root.querySelectorAll("[data-calendar-apply-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      applyCalendarSuggestion(button.dataset.calendarApplySuggestion, button.dataset.sector, button.dataset.subcategory);
    });
  });

  root.querySelectorAll("[data-calendar-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteCalendarTransaction(button.dataset.calendarDelete);
    });
  });

  root.querySelectorAll("[data-calendar-dedupe-signature]").forEach((button) => {
    button.addEventListener("click", () => {
      cleanupCalendarDuplicateGroup(decodeURIComponent(button.dataset.calendarDedupeSignature || ""));
    });
  });

  root.querySelectorAll(".calendar-edit-form").forEach((form) => {
    const sectorSelect = form.querySelector(".calendar-edit-sector");
    const subcategorySelect = form.querySelector(".calendar-edit-subcategory");
    sectorSelect.addEventListener("change", () => {
      subcategorySelect.innerHTML = calendarSubcategoryOptionsHtml(sectorSelect.value);
      syncCalendarFoodOccasion(form);
    });
    syncCalendarFoodOccasion(form);
    ["amount", "reimbursement"].forEach((name) => {
      form.elements[name].addEventListener("input", () => updateCalendarActualPreview(form));
    });
    const splitPeopleInput = form.elements.splitPeople;
    const splitApplyButton = form.querySelector("[data-calendar-split-apply]");
    splitPeopleInput?.addEventListener("input", () => updateCalendarSplitPreview(form));
    form.elements.amount?.addEventListener("input", () => updateCalendarSplitPreview(form));
    splitApplyButton?.addEventListener("click", () => applyCalendarSplitCalculation(form));
    const updateInstallmentPreview = () => {
      const preview = form.querySelector(".calendar-installment-preview");
      if ([form.elements.amount, form.elements.installmentMonths].some((input) => input?.validity?.valid === false)) {
        if (preview) preview.value = "입력 확인";
        return;
      }
      const amount = toNumber(form.elements.amount?.value);
      const months = Math.max(1, Number(form.elements.installmentMonths?.value || 1));
      if (preview) preview.value = formatWon(Math.floor(amount / months));
    };
    const syncInstallmentFields = () => {
      const enabled = Boolean(form.elements.installmentEnabled?.checked);
      form.querySelectorAll(".calendar-installment-field").forEach((field) => {
        field.hidden = !enabled;
        field.querySelectorAll("input, select, textarea").forEach((control) => {
          control.disabled = !enabled;
        });
      });
      if (enabled) updateInstallmentPreview();
    };
    form.elements.amount?.addEventListener("input", updateInstallmentPreview);
    form.elements.installmentMonths?.addEventListener("input", updateInstallmentPreview);
    form.elements.installmentEnabled?.addEventListener("change", syncInstallmentFields);
    syncInstallmentFields();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveCalendarTransactionEdit(form.dataset.calendarEditForm, form);
    });
  });
}

function updateCalendarActualPreview(form) {
  const preview = form.querySelector(".calendar-actual-preview");
  if ([form.elements.amount, form.elements.reimbursement].some((input) => input?.validity?.valid === false)) {
    if (preview) preview.value = "입력 확인";
    return;
  }
  const amount = toNumber(form.elements.amount.value);
  const reimbursement = toNumber(form.elements.reimbursement.value);
  if (preview) preview.value = formatWon(Math.max(0, amount - reimbursement));
}

function syncCalendarFoodOccasion(form) {
  const field = form.querySelector("[data-calendar-food-occasion]");
  const select = form.elements.foodOccasion;
  if (!field || !select) return;
  const isFood = form.elements.sector.value === "식비";
  field.hidden = !isFood;
  select.disabled = !isFood;
}

function updateCalendarSplitPreview(form, options = {}) {
  const peopleInput = form.elements.splitPeople;
  const applyButton = form.querySelector("[data-calendar-split-apply]");
  const result = form.querySelector("[data-calendar-split-result]");
  if (!peopleInput || !applyButton || !result) return null;
  if (form.elements.amount?.validity?.valid === false) {
    applyButton.disabled = true;
    result.classList.toggle("applied", false);
    result.textContent = "총 결제액을 먼저 확인해주세요.";
    return null;
  }

  const rawPeople = String(peopleInput.value || "").trim();
  const calculation = calendarSplitCalculation(toNumber(form.elements.amount.value), NumericInput.read(peopleInput));
  applyButton.disabled = !calculation;
  result.classList.toggle("applied", Boolean(options.applied && calculation));

  if (!rawPeople) {
    result.textContent = "2명 이상 입력하면 내 몫과 정산금을 계산합니다.";
    return null;
  }
  if (!calculation) {
    result.textContent = "총 인원은 나를 포함한 2명 이상의 정수로 입력해주세요.";
    return null;
  }

  const prefix = options.applied ? "적용 완료" : "계산 결과";
  result.textContent = `${prefix} · 내 몫 ${formatWon(calculation.ownAmount)} · 정산받을 금액 ${formatWon(calculation.reimbursement)}`;
  return calculation;
}

function applyCalendarSplitCalculation(form) {
  if (!NumericInput.validate(form)) return;
  const calculation = updateCalendarSplitPreview(form);
  if (!calculation) {
    form.elements.splitPeople?.focus();
    return;
  }
  form.elements.reimbursement.value = Math.round(calculation.reimbursement).toLocaleString("ko-KR");
  NumericInput.refresh(form.elements.reimbursement);
  updateCalendarActualPreview(form);
  updateCalendarSplitPreview(form, { applied: true });
}

function calendarClassifiedItem(recordKey) {
  return classified.find((item) => item.recordKey === recordKey);
}

function calendarTransactionIndex(recordKey) {
  return transactions.findIndex((item) => item.recordKey === recordKey);
}

function calendarDuplicateSignature(item) {
  const date = normalizeDateKey(item.approvalDate);
  const time = normalizeInputTime(item.approvalTime || "");
  const merchant = String(item.merchant || "").trim();
  const amount = Number(item.amount || 0);
  if (!date || !merchant || !Number.isFinite(amount)) return "";
  return [date, time, merchant, amount].join("\u001f");
}

function calendarDuplicateGroups(rows) {
  const grouped = groupBy(rows.filter((item) => !isLoanRepaymentTransaction(item)), calendarDuplicateSignature);
  return [...grouped.entries()]
    .filter(([signature, items]) => signature && items.length > 1)
    .map(([signature, items]) => {
      const reimbursementsForGroup = items.map((item) => reimbursementFor(item));
      const actualsForGroup = items.map((item) => actualAmount(item));
      return {
        signature,
        items,
        reimbursementSame: new Set(reimbursementsForGroup).size === 1,
        actualSame: new Set(actualsForGroup).size === 1
      };
    });
}

function calendarDuplicateMetaMap(groups) {
  const map = new Map();
  groups.forEach((group, index) => {
    group.items.forEach((item) => {
      map.set(item.recordKey, {
        groupIndex: index,
        groupLabel: `${index + 1}`,
        count: group.items.length
      });
    });
  });
  return map;
}

function calendarDuplicateRemovalKeys(items) {
  const candidates = items
    .map((item) => {
      const index = calendarTransactionIndex(item.recordKey);
      const stored = index >= 0 ? normalizeStoredTransaction(transactions[index]) : normalizeStoredTransaction(item);
      const sourceFile = String(stored.sourceFile || "");
      const approvalNo = String(stored.approvalNo || "");
      const manualLike = stored.sourceType === "manual"
        || sourceFile === "과거 거래 일괄 입력"
        || approvalNo.startsWith("direct-bulk-")
        || approvalNo.startsWith("manual-");
      const createdAt = Date.parse(stored.createdAt || stored.importedAt || "") || 0;
      return {
        recordKey: item.recordKey,
        index,
        sourceRank: manualLike ? 1 : 0,
        createdAt
      };
    })
    .filter((item) => item.index >= 0);

  candidates.sort((a, b) =>
    a.sourceRank - b.sourceRank
    || a.createdAt - b.createdAt
    || a.index - b.index
  );
  return candidates.slice(1).map((item) => item.recordKey);
}

async function deleteCalendarTransaction(recordKey) {
  const item = calendarClassifiedItem(recordKey);
  if (!item) return;
  const recurringMessage = (item.sourceType === "recurring" || item.recurringLinkedExisting) && item.recurringId
    ? "\n\n고정 지출과 연결한 거래는 실제 지출 기록만 삭제하며, 고정 지출 원본은 유지됩니다."
    : "";
  if (!confirm(`이 거래를 삭제할까요? 삭제 후에는 복구하기 어렵습니다.${recurringMessage}`)) return;
  await deleteCalendarTransactions([recordKey], {
    snapshotReason: "소비 달력 거래 삭제 전",
    feedbackMessage: "거래를 삭제했습니다."
  });
}

async function cleanupCalendarDuplicateGroup(signature) {
  if (!signature) return;
  const dateRows = expenseRows(classified).filter((item) => normalizeDateKey(item.approvalDate) === selectedCalendarDate);
  const group = calendarDuplicateGroups(dateRows).find((candidate) => candidate.signature === signature);
  if (!group) {
    calendarEditFeedback = { type: "warning", message: "정리할 중복 거래를 찾지 못했습니다. 화면을 새로 확인해주세요." };
    renderCalendar();
    return;
  }
  const removalKeys = calendarDuplicateRemovalKeys(group.items);
  if (!removalKeys.length) return;
  const first = group.items[0];
  const message = `같은 시간, 같은 가맹점명, 같은 금액의 거래가 ${group.items.length.toLocaleString("ko-KR")}건 있습니다.\n\n${first.approvalTime || "시간 없음"} · ${first.merchant} · ${formatWon(first.amount)}\n\n하나만 남기고 중복 ${removalKeys.length.toLocaleString("ko-KR")}건을 삭제할까요?`;
  if (!confirm(message)) return;
  await deleteCalendarTransactions(removalKeys, {
    snapshotReason: "소비 달력 중복 거래 정리 전",
    feedbackMessage: `중복 거래 ${removalKeys.length.toLocaleString("ko-KR")}건을 삭제했습니다.`
  });
}

async function deleteCalendarTransactions(recordKeys, options = {}) {
  const keys = new Set(recordKeys.filter(Boolean));
  if (!keys.size) return false;
  try {
    await createAutoSnapshot(options.snapshotReason || "소비 달력 거래 삭제 전");
  } catch {
    alert("삭제 전 백업을 저장하지 못했습니다. 기록을 유지한 상태에서 다시 시도해주세요.");
    return false;
  }
  const now = new Date().toISOString();
  let removed = 0;
  let tombstoned = 0;
  const nextReimbursements = { ...reimbursements };
  const nextTransactions = transactions.flatMap((transaction) => {
    const item = normalizeStoredTransaction(transaction);
    if (!keys.has(item.recordKey)) return [transaction];
    delete nextReimbursements[item.recordKey];
    const recurring = (item.sourceType === "recurring" || item.recurringLinkedExisting) && item.recurringId
      ? recurringExpenses.find((expense) => expense.id === item.recurringId)
      : null;
    if (recurring?.autoPost) {
      tombstoned++;
      return [normalizeStoredTransaction({
        ...transaction,
        cancel: "삭제됨",
        manualSector: "",
        manualSubcategory: "",
        updatedAt: now,
        recordKey: item.recordKey
      })];
    }
    removed++;
    return [];
  });
  if (!await safeSaveMany([
    { key: RECORD_STORAGE_KEY, data: nextTransactions.map(normalizeStoredTransaction), protectIncomeRecords: true },
    { key: REIMBURSEMENT_STORAGE_KEY, data: nextReimbursements }
  ])) return false;
  transactions = nextTransactions;
  reimbursements = nextReimbursements;
  calendarEditingRecordKey = "";
  calendarEditFeedback = {
    type: "success",
    message: options.feedbackMessage || `거래 ${Number(removed + tombstoned).toLocaleString("ko-KR")}건을 삭제했습니다.`
  };
  try {
    reclassify();
  } catch {
    alert("거래 삭제는 저장됐지만 화면을 갱신하지 못했습니다. 새로고침해서 확인해주세요.");
  }
  return true;
}

async function applyCalendarSuggestion(recordKey, sector, subcategory) {
  const item = calendarClassifiedItem(recordKey);
  const index = calendarTransactionIndex(recordKey);
  if (!item || index < 0) return;
  const assignment = normalizeCategoryAssignment(sector, subcategory, item.merchant);
  try {
    await createAutoSnapshot("소비 달력 추천 분류 적용 전");
  } catch {
    alert("분류 전 백업을 저장하지 못했습니다. 기록을 유지한 상태에서 다시 시도해주세요.");
    return;
  }
  const nextTransactions = transactions.slice();
  nextTransactions[index] = normalizeStoredTransaction({
    ...transactions[index],
    manualSector: assignment.sector,
    manualSubcategory: assignment.subcategory,
    recordKey
  });
  if (!await safeSaveMany([
    { key: RECORD_STORAGE_KEY, data: nextTransactions.map(normalizeStoredTransaction), protectIncomeRecords: true }
  ])) return;
  transactions = nextTransactions;
  calendarEditingRecordKey = "";
  calendarEditFeedback = { type: "success", message: `${assignment.sector} / ${assignment.subcategory}로 분류했습니다.` };
  selectedCalendarMonth = item.month;
  setSharedSelectedMonth(item.month, { syncControls: false });
  selectedCalendarDate = normalizeInputDate(item.approvalDate) || selectedCalendarDate;
  reclassify();
}

async function saveCalendarTransactionEdit(recordKey, form) {
  if (!NumericInput.validate(form)) return;
  const index = calendarTransactionIndex(recordKey);
  if (index < 0) return;
  const date = normalizeInputDate(form.elements.date.value);
  const time = normalizeInputTime(form.elements.time.value);
  const merchant = form.elements.merchant.value.trim();
  const amount = toNumber(form.elements.amount.value);
  const reimbursement = toNumber(form.elements.reimbursement.value);
  const memo = form.elements.memo.value.trim();
  const sector = form.elements.sector.value;
  const subcategory = form.elements.subcategory.value;
  const installmentEnabled = Boolean(form.elements.installmentEnabled?.checked);
  const installmentMonthCount = Math.max(0, Number(form.elements.installmentMonths?.value || 0));
  const installmentStartMonth = form.elements.installmentStartMonth?.value || monthKey(date);

  if (!date) {
    alert("날짜를 입력해주세요.");
    return;
  }
  if (!merchant) {
    alert("내용/가맹점명을 입력해주세요.");
    return;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    alert("총 결제액은 0 이상의 숫자로 입력해주세요.");
    return;
  }
  if (!Number.isFinite(reimbursement) || reimbursement < 0) {
    alert("정산받은 금액은 0 이상의 숫자로 입력해주세요.");
    return;
  }
  if (reimbursement > amount && !confirm("정산받은 금액이 총 결제액보다 큽니다. 저장하면 정산금은 총 결제액까지만 반영됩니다. 계속할까요?")) {
    return;
  }
  if (installmentEnabled && (installmentMonthCount < 2 || !isValidMonthKey(installmentStartMonth))) {
    alert("할부 개월 수는 2개월 이상, 시작 월은 YYYY-MM 형식으로 입력해주세요.");
    return;
  }

  const assignment = normalizeCategoryAssignment(sector, subcategory, merchant);
  const validInstallment = installmentEnabled && installmentMonthCount > 1;
  try {
    await createAutoSnapshot("소비 달력 거래 수정 전");
  } catch (error) {
    alert("수정 전 백업을 저장하지 못했습니다. 입력 내용을 유지한 상태에서 다시 시도해주세요.");
    return;
  }
  const nextTransactions = transactions.slice();
  nextTransactions[index] = normalizeStoredTransaction({
    ...transactions[index],
    approvalDate: date,
    month: monthKey(date),
    approvalTime: time,
    merchant,
    amount,
    memo,
    manualSector: assignment.sector,
    manualSubcategory: assignment.subcategory,
    installmentEnabled: validInstallment,
    installmentMonths: validInstallment ? installmentMonthCount : 0,
    installmentStartMonth: validInstallment ? installmentStartMonth : "",
    installmentOriginalAmount: validInstallment ? amount : 0,
    installmentMonthlyAmount: validInstallment ? Math.floor(amount / installmentMonthCount) : 0,
    installmentGroupId: validInstallment ? transactions[index].installmentGroupId || recordKey : "",
    foodOccasion: assignment.sector === "식비" ? normalizeFoodOccasion(form.elements.foodOccasion?.value) : "",
    updatedAt: new Date().toISOString(),
    recordKey
  });

  const nextReimbursements = { ...reimbursements };
  const normalizedReimbursement = Math.min(amount, reimbursement);
  if (normalizedReimbursement > 0) nextReimbursements[recordKey] = normalizedReimbursement;
  else delete nextReimbursements[recordKey];

  const nextRules = rules.slice();
  const ruleResult = form.elements.saveRule.checked
    ? addCalendarRuleFromTransaction(merchant, assignment.sector, assignment.subcategory, nextRules)
    : { message: "" };

  const writes = [
    { key: RECORD_STORAGE_KEY, data: nextTransactions.map(normalizeStoredTransaction), protectIncomeRecords: true },
    { key: REIMBURSEMENT_STORAGE_KEY, data: nextReimbursements }
  ];
  if (ruleResult.added) writes.push({ key: STORAGE_KEY, data: nextRules });
  if (!await safeSaveMany(writes)) return;

  transactions = nextTransactions;
  reimbursements = nextReimbursements;
  if (ruleResult.added) rules = nextRules;
  selectedCalendarMonth = monthKey(date);
  setSharedSelectedMonth(selectedCalendarMonth, { syncControls: false });
  selectedCalendarDate = date;
  calendarEditingRecordKey = "";
  calendarEditFeedback = {
    type: ruleResult.warning ? "warning" : "success",
    message: `거래를 저장했습니다.${ruleResult.message ? ` ${ruleResult.message}` : ""}`
  };

  reclassify();
}

function addCalendarRuleFromTransaction(merchant, sector, subcategory, targetRules = rules) {
  const keyword = String(merchant || "").trim();
  if (!keyword || ["미분류", "수입", "제외"].includes(sector)) {
    return { added: false, message: "분류 규칙은 저장하지 않았습니다.", warning: true };
  }
  const normalizedKeyword = normalizeKeyText(keyword);
  const existing = targetRules.find((rule) =>
    rule.keywords.some((candidate) => normalizeKeyText(candidate) === normalizedKeyword)
  );
  if (existing) {
    const sameCategory = existing.sector === sector && existing.subcategory === subcategory;
    return {
      added: false,
      warning: !sameCategory,
      message: sameCategory
        ? "이미 같은 분류 규칙이 있어 중복 저장하지 않았습니다."
        : `이미 ${existing.sector} / ${existing.subcategory} 규칙에 같은 키워드가 있어 규칙은 추가하지 않았습니다.`
    };
  }
  targetRules.push({
    sector,
    subcategory,
    keywords: [keyword],
    priority: nextPriority(sector),
    origin: "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return { added: true, message: "앞으로 같은 사용처에 적용할 분류 규칙도 저장했습니다." };
}

function renderCalendarEditFeedback() {
  if (!calendarEditFeedback) return "";
  return `
    <div class="calendar-edit-feedback ${escapeHtml(calendarEditFeedback.type || "success")}">
      ${escapeHtml(calendarEditFeedback.message)}
    </div>
  `;
}
