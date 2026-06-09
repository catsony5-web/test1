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

  if (!selectedMonth) {
    els.calendarMonthSummary.innerHTML = "";
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
  const scheduledRows = recurringOccurrencesForMonth(selectedMonth);
  const pendingScheduledRows = scheduledRows.filter((item) => !item.posted);
  const scheduledByDate = groupBy(scheduledRows, (item) => item.date);
  els.calendarMonthSummary.innerHTML = renderCalendarMonthSummary(selectedMonth, monthRows, byDate, dayCount, pendingScheduledRows, calendarShowIncome);
  renderCalendarCurrentMonthLabel(selectedMonth, pendingScheduledRows);
  attachCalendarSummaryHandlers(selectedMonth);
  const firstSpendDate = [...new Set([...byDate.keys(), ...incomeByDate.keys(), ...scheduledByDate.keys()])].sort()[0] || `${selectedMonth}-01`;
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
    const plannedRows = scheduledByDate.get(dateKey) || [];
    const pendingPlannedRows = plannedRows.filter((item) => !item.posted);
    const postedPlannedRows = plannedRows.filter((item) => item.posted);
    const total = sumActual(rows);
    const plannedTotal = sum(pendingPlannedRows, "amount");
    const isSelected = activeDate === dateKey;
    cells.push(`
      <button class="calendar-cell ${rows.length ? "has-spend" : ""} ${pendingPlannedRows.length ? "has-scheduled" : ""} ${plannedRows.some((item) => item.posted) ? "has-posted-scheduled" : ""} ${isSelected ? "selected" : ""}" type="button" data-calendar-date="${escapeHtml(dateKey)}">
        <span class="calendar-day">${day}</span>
        ${rows.length ? `<strong>${formatWon(total)}</strong>` : ""}
        ${dayIncomeRows.length ? `<em class="calendar-income-label">수입 ${formatWon(sum(dayIncomeRows, "amount"))}</em>` : ""}
        ${pendingPlannedRows.length
          ? `<em class="calendar-fixed-schedule-label">고정 예정 ${formatWon(plannedTotal)}</em>`
          : postedPlannedRows.length ? `<em class="calendar-fixed-schedule-label posted">고정 반영 ${postedPlannedRows.length.toLocaleString("ko-KR")}건</em>` : ""}
        ${rows.length || dayIncomeRows.length || plannedRows.length ? `<small>${[
          rows.length ? `${rows.length.toLocaleString("ko-KR")}건` : "",
          dayIncomeRows.length ? `수입 ${dayIncomeRows.length.toLocaleString("ko-KR")}건` : "",
          pendingPlannedRows.length ? `고정 예정 ${pendingPlannedRows.length.toLocaleString("ko-KR")}건` : "",
          !pendingPlannedRows.length && postedPlannedRows.length ? `고정 반영 ${postedPlannedRows.length.toLocaleString("ko-KR")}건` : ""
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

  renderDayTimeline(activeDate, byDate.get(activeDate) || [], scheduledByDate.get(activeDate) || [], incomeByDate.get(activeDate) || []);
}

function renderCalendarCurrentMonthLabel(month, scheduledRows = []) {
  if (!els.calendarCurrentMonthLabel) return;
  const [year, monthNumber] = String(month || "").split("-");
  if (!year || !monthNumber) {
    els.calendarCurrentMonthLabel.innerHTML = "";
    return;
  }
  const scheduledCount = scheduledRows.length;
  const scheduledTotal = sum(scheduledRows, "amount");
  els.calendarCurrentMonthLabel.innerHTML = `
    <div>
      <strong>${escapeHtml(year)}년 ${escapeHtml(monthNumber)}월</strong>
      <span>선택 월 소비 달력</span>
    </div>
    ${scheduledCount ? `<em>고정 지출 예정 ${scheduledCount.toLocaleString("ko-KR")}건 · ${formatWon(scheduledTotal)}</em>` : `<em>고정 지출 일정은 등록된 날에만 표시됩니다.</em>`}
  `;
}

function renderCalendarMonthSummary(month, monthRows, byDate, dayCount, scheduledRows = [], showIncome = true) {
  const totalSpend = sumActual(monthRows);
  const scheduledTotal = sum(scheduledRows, "amount");
  const totalIncome = importedIncomeForMonth(month) + Number(monthlyIncome[month] || 0);
  const balance = totalIncome - totalSpend;
  const expectedBalance = balance - scheduledTotal;
  const spendDayCount = Math.max(1, [...byDate.values()].filter((rows) => rows.length).length || dayCount || 1);
  const avgSpend = Math.round(totalSpend / spendDayCount);
  const dailyTotals = [...byDate.entries()]
    .map(([date, rows]) => ({ date, amount: sumActual(rows), count: rows.length }))
    .sort((a, b) => b.amount - a.amount);
  const topDay = dailyTotals[0] || { date: "-", amount: 0, count: 0 };
  const unknownAmount = sumActual(monthRows.filter((item) => item.sector === "미분류"));
  const coreMetrics = [
    renderCalendarMetric("총 지출", formatWon(totalSpend), `${month} 실 지출 합계`, "spend", { priority: "core" }),
    ...(showIncome ? [
      renderCalendarMetric("총 수입", formatWon(totalIncome), "수입 입력 + 이체 입금", "income", { incomeMonth: month, priority: "core" }),
      renderCalendarMetric("잔액", formatSignedWon(balance), "총 수입 - 총 지출", balance >= 0 ? "positive" : "negative", { priority: "core" }),
      renderCalendarMetric("예상 잔액", formatSignedWon(expectedBalance), "잔액 - 예정 지출", expectedBalance >= 0 ? "positive" : "negative", { priority: "core" })
    ] : [])
  ];
  const supportMetrics = [
    renderCalendarMetric("고정 지출 예정", formatWon(scheduledTotal), `${scheduledRows.length.toLocaleString("ko-KR")}건 · 실 지출 미포함`, "scheduled", { priority: "support" }),
    renderCalendarMetric("하루 평균 지출", formatWon(avgSpend), `소비 발생 ${spendDayCount.toLocaleString("ko-KR")}일 기준`, "average", { priority: "support" }),
    renderCalendarMetric("가장 많이 쓴 날", topDay.date, `${formatWon(topDay.amount)} · ${topDay.count.toLocaleString("ko-KR")}건`, topDay.amount > 0 ? "topday" : "neutral", { priority: "support" }),
    renderCalendarMetric("미분류", formatWon(unknownAmount), unknownAmount > 0 ? "분류 확인 필요" : "분류 필요 항목 없음", unknownAmount > 0 ? "unknown" : "neutral", { priority: "support" })
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

function renderCalendarMetric(label, value, hint, tone, options = {}) {
  const attrs = options.incomeMonth ? ` data-open-income-month="${escapeHtml(options.incomeMonth)}"` : "";
  const priorityClass = options.priority ? ` is-${escapeHtml(options.priority)}` : "";
  const tagOpen = options.incomeMonth
    ? `<button type="button" class="calendar-summary-card ${escapeHtml(tone)}${priorityClass}"${attrs}>`
    : `<article class="calendar-summary-card ${escapeHtml(tone)}${priorityClass}">`;
  const tagClose = options.incomeMonth ? "button" : "article";
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
}

function renderDayTimeline(dateKey, rows, scheduledRows = [], incomeRows = []) {
  const totalText = rows.length ? `실지출 ${formatWon(sumActual(rows))}` : "실지출 없음";
  const pendingScheduledRows = scheduledRows.filter((item) => !item.posted);
  const titleParts = [`${dateKey} 소비`, totalText];
  if (incomeRows.length) titleParts.push(`수입 ${formatWon(sum(incomeRows, "amount"))}`);
  if (pendingScheduledRows.length) titleParts.push(`고정 예정 ${formatWon(sum(pendingScheduledRows, "amount"))}`);
  els.selectedDayTitle.textContent = titleParts.join(" · ");
  const feedbackHtml = renderCalendarEditFeedback();
  if (!rows.length && !incomeRows.length && !scheduledRows.length) {
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
            <div class="scheduled-actions"><b>${formatWon(item.amount)}</b></div>
          </article>
        `).join("")}
    </div>
  ` : "";
  const scheduledHtml = scheduledRows.length ? `
    <div class="scheduled-timeline-group">
      <h4>고정 지출 예정일/반영 상태</h4>
      ${scheduledRows.map((item) => `
        <article class="timeline-item scheduled-item ${item.posted ? "posted" : ""}">
          <time>${escapeHtml(item.paymentType || "예정")}</time>
          <div class="timeline-main">
            <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
            <div class="timeline-tags">
              <span class="scheduled-badge ${escapeHtml(item.postingStatusClass || "")}">${escapeHtml(item.postingStatusLabel || (item.posted ? "반영 완료" : "예정"))}</span>
              ${item.autoPost ? `<span class="scheduled-badge soft">자동 반영</span>` : `<span class="scheduled-badge muted">수동 반영</span>`}
              ${categoryChip(item.sector, item.subcategory)}
            </div>
            ${item.memo ? `<p>${escapeHtml(item.memo)}</p>` : ""}
          </div>
          <div class="scheduled-actions">
            <b>${formatWon(item.amount)}</b>
            ${item.canManualPost ? `<button type="button" data-post-recurring="${escapeHtml(item.id)}" data-post-month="${escapeHtml(item.month)}">실제 지출로 반영</button>` : ""}
            ${item.postedTransaction?.recordKey ? `<button type="button" data-calendar-edit-posted="${escapeHtml(item.postedTransaction.recordKey)}">실제 내역 수정</button>` : ""}
            <button type="button" data-edit-recurring="${escapeHtml(item.id)}">고정 지출 수정</button>
          </div>
        </article>
      `).join("")}
    </div>
  ` : "";
  els.selectedDayTimeline.innerHTML = [feedbackHtml, duplicateHtml, actualHtml, incomeHtml, scheduledHtml].filter(Boolean).join("");
  attachCalendarTimelineHandlers(els.selectedDayTimeline);
  attachRecurringHandlers(els.selectedDayTimeline);
}

function renderCalendarTransactionCard(item, duplicateMeta = null) {
  const editRecordKey = item.installmentSourceRecordKey || item.recordKey;
  const isEditing = calendarEditingRecordKey === editRecordKey;
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
          ${isUnknown ? `<span class="classification-needed-badge">분류 필요</span>` : ""}
          ${duplicateMeta ? `<span class="duplicate-suspect-badge">중복 의심 ${duplicateMeta.groupLabel}</span>` : ""}
          ${item.manualSector ? `<span class="manual-entry-badge">직접 수정</span>` : ""}
          ${installmentText ? `<span class="installment-badge">${escapeHtml(installmentText)}</span>` : ""}
        </div>
        <p>총 결제 ${formatWon(item.amount)}${reimbursement ? ` · 정산 ${formatWon(reimbursement)}` : ""}</p>
        ${isUnknown ? renderCalendarSuggestion(suggestion) : ""}
      </div>
      <div class="timeline-amount-actions">
        <b>${formatWon(actualAmount(item))}</b>
        <div class="timeline-actions">
          ${isUnknown && suggestion ? `<button type="button" class="calendar-suggestion-button" data-calendar-apply-suggestion="${escapeHtml(editRecordKey)}" data-sector="${escapeHtml(suggestion.sector)}" data-subcategory="${escapeHtml(suggestion.subcategory)}">추천 적용</button>` : ""}
          <button type="button" class="calendar-edit-button" data-calendar-edit="${escapeHtml(editRecordKey)}">${isUnknown ? "빠른 분류" : "수정"}</button>
          <button type="button" class="calendar-detail-button" data-calendar-detail="${escapeHtml(editRecordKey)}">상세 내역</button>
        </div>
      </div>
      ${isEditing ? renderCalendarEditForm(calendarClassifiedItem(editRecordKey) || item) : ""}
    </article>
  `;
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
          <input type="text" name="amount" inputmode="numeric" value="${escapeHtml(Math.round(Number(item.amount || 0)).toLocaleString("ko-KR"))}" required>
        </label>
        <label>정산받은 금액
          <input type="text" name="reimbursement" inputmode="numeric" value="${escapeHtml(Math.round(reimbursement).toLocaleString("ko-KR"))}">
        </label>
        <label>실 지출액
          <input class="calendar-actual-preview" type="text" value="${escapeHtml(formatWon(actualAmount(item)))}" readonly>
        </label>
        <label>섹터
          <select class="calendar-edit-sector" name="sector">${calendarSectorOptionsHtml(assignment.sector)}</select>
        </label>
        <label>세부항목
          <select class="calendar-edit-subcategory" name="subcategory">${calendarSubcategoryOptionsHtml(assignment.sector, assignment.subcategory)}</select>
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
            <input type="number" name="installmentMonths" min="2" max="60" value="${escapeHtml(installmentMonthCount)}">
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
      calendarEditingRecordKey = card.dataset.calendarCard;
      calendarEditFeedback = null;
      renderCalendar();
    });
  });

  root.querySelectorAll("[data-calendar-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarEditingRecordKey = button.dataset.calendarEdit;
      calendarEditFeedback = null;
      renderCalendar();
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
      calendarEditingRecordKey = button.dataset.calendarEditPosted;
      calendarEditFeedback = null;
      renderCalendar();
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
    });
    ["amount", "reimbursement"].forEach((name) => {
      form.elements[name].addEventListener("input", () => updateCalendarActualPreview(form));
    });
    const updateInstallmentPreview = () => {
      const amount = toNumber(form.elements.amount?.value);
      const months = Math.max(1, Number(form.elements.installmentMonths?.value || 1));
      const preview = form.querySelector(".calendar-installment-preview");
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
  const amount = toNumber(form.elements.amount.value);
  const reimbursement = toNumber(form.elements.reimbursement.value);
  const preview = form.querySelector(".calendar-actual-preview");
  if (preview) preview.value = formatWon(Math.max(0, amount - reimbursement));
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
  const grouped = groupBy(rows, calendarDuplicateSignature);
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
  const recurringMessage = item.sourceType === "recurring" && item.recurringId
    ? "\n\n고정 지출에서 반영된 거래는 실제 지출 기록만 삭제하며, 고정 지출 원본은 유지됩니다."
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
  if (!keys.size) return;
  await createAutoSnapshot(options.snapshotReason || "소비 달력 거래 삭제 전");
  const now = new Date().toISOString();
  let removed = 0;
  let tombstoned = 0;
  transactions = transactions.flatMap((transaction) => {
    const item = normalizeStoredTransaction(transaction);
    if (!keys.has(item.recordKey)) return [transaction];
    delete reimbursements[item.recordKey];
    const recurring = item.sourceType === "recurring" && item.recurringId
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
  calendarEditingRecordKey = "";
  calendarEditFeedback = {
    type: "success",
    message: options.feedbackMessage || `거래 ${Number(removed + tombstoned).toLocaleString("ko-KR")}건을 삭제했습니다.`
  };
  await saveTransactions();
  await saveReimbursements();
  reclassify();
}

async function applyCalendarSuggestion(recordKey, sector, subcategory) {
  const item = calendarClassifiedItem(recordKey);
  const index = calendarTransactionIndex(recordKey);
  if (!item || index < 0) return;
  const assignment = normalizeCategoryAssignment(sector, subcategory, item.merchant);
  await createAutoSnapshot("소비 달력 추천 분류 적용 전");
  transactions[index] = normalizeStoredTransaction({
    ...transactions[index],
    manualSector: assignment.sector,
    manualSubcategory: assignment.subcategory,
    recordKey
  });
  calendarEditingRecordKey = "";
  calendarEditFeedback = { type: "success", message: `${assignment.sector} / ${assignment.subcategory}로 분류했습니다.` };
  selectedCalendarMonth = item.month;
  setSharedSelectedMonth(item.month, { syncControls: false });
  selectedCalendarDate = normalizeInputDate(item.approvalDate) || selectedCalendarDate;
  await saveTransactions();
  reclassify();
}

async function saveCalendarTransactionEdit(recordKey, form) {
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
  await createAutoSnapshot("소비 달력 거래 수정 전");
  transactions[index] = normalizeStoredTransaction({
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
    recordKey
  });

  const normalizedReimbursement = Math.min(amount, reimbursement);
  if (normalizedReimbursement > 0) reimbursements[recordKey] = normalizedReimbursement;
  else delete reimbursements[recordKey];

  const ruleResult = form.elements.saveRule.checked
    ? addCalendarRuleFromTransaction(merchant, assignment.sector, assignment.subcategory)
    : { message: "" };

  selectedCalendarMonth = monthKey(date);
  setSharedSelectedMonth(selectedCalendarMonth, { syncControls: false });
  selectedCalendarDate = date;
  calendarEditingRecordKey = "";
  calendarEditFeedback = {
    type: ruleResult.warning ? "warning" : "success",
    message: `거래를 저장했습니다.${ruleResult.message ? ` ${ruleResult.message}` : ""}`
  };

  await saveTransactions();
  await saveReimbursements();
  if (ruleResult.added) await saveRules();
  reclassify();
}

function addCalendarRuleFromTransaction(merchant, sector, subcategory) {
  const keyword = String(merchant || "").trim();
  if (!keyword || ["미분류", "수입", "제외"].includes(sector)) {
    return { added: false, message: "분류 규칙은 저장하지 않았습니다.", warning: true };
  }
  const normalizedKeyword = normalizeKeyText(keyword);
  const existing = rules.find((rule) =>
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
  rules.push({
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
