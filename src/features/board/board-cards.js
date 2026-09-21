function buildBoardSectionStat(section, rows) {
  return {
    section,
    rows,
    total: sum(rows, "amount"),
    reimbursementTotal: sumReimbursements(rows),
    actualTotal: sumConsumption(rows),
    count: rows.length
  };
}

function attachBoardTopCategoryHandlers() {
  els.boardSummary.querySelectorAll("[data-open-detail-month]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(boardDetailOptions({ month: button.dataset.openDetailMonth || els.boardMonth.value })));
  });
  els.boardSummary.querySelectorAll("[data-board-top-sector]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(boardDetailOptions({
      month: els.boardMonth.value,
      sector: button.dataset.boardTopSector,
      subcategory: button.dataset.boardTopSubcategory
    })));
  });
}

function attachBoardSummaryHandlers() {
  els.boardSectorSummary.querySelectorAll("[data-board-summary-sector]").forEach((node) => {
    node.addEventListener("click", () => {
      openDetailView(boardDetailOptions({
        month: els.boardMonth.value,
        sector: node.dataset.boardSummarySector,
        subcategory: "all"
      }));
    });
  });
}

function renderLedgerSection(section, rows, selectedMonth, sortMode = "date", options = {}) {
  const sortedRows = sortTransactionRows(rows, sortMode);
  const limit = Number(options.limit || 0);
  const visibleRows = limit > 0 ? sortedRows.slice(0, limit) : sortedRows;
  const hiddenCount = Math.max(0, sortedRows.length - visibleRows.length);
  const total = sum(sortedRows, "amount");
  const reimbursementTotal = sumReimbursements(sortedRows);
  const actualTotal = sumConsumption(sortedRows);
  const canOpenFullView = Boolean(options.fullViewButton && !options.fullMode);
  const calendarLinks = Boolean(options.fullMode || options.calendarLinks);
  const bodyRows = visibleRows.map((item) => {
    const installmentText = installmentSummaryText(item);
    const reimbursementDisabled = isLoanRepaymentTransaction(item) || item.isInstallmentOccurrence || !reimbursementEditMode;
    const canEditInstallment = Boolean(options.fullMode && !item.isInstallmentOccurrence && !isLoanRepaymentTransaction(item));
    const isInstallmentEditing = canEditInstallment && detailInstallmentEditRecordKey === item.recordKey;
    const calendarRecordKey = item.installmentSourceRecordKey || item.recordKey;
    const calendarLinkAttrs = calendarLinks
      ? ` data-detail-open-calendar="${escapeHtml(calendarRecordKey)}" data-detail-calendar-date="${escapeHtml(item.approvalDate)}" data-detail-calendar-month="${escapeHtml(item.month)}" role="button" tabindex="0" title="소비 달력에서 이 거래 수정"`
      : "";
    return `
    <div class="transaction-row ${categoryClass(item.sector)} ${calendarLinks ? "detail-calendar-link" : ""} ${detailFocusRecordKey === item.recordKey ? "is-detail-focused" : ""}" data-detail-record-key="${escapeHtml(item.recordKey)}"${calendarLinkAttrs}>
      <span class="date">${escapeHtml(item.approvalDate)}</span>
      <span class="merchant" title="${escapeHtml(item.merchant)}">
        ${escapeHtml(item.merchant)}${item.status === "직접입력" ? `<em class="manual-badge">직접 입력</em>` : ""}${isLoanRepaymentTransaction(item) ? `<em class="manual-badge">대출 상환 · 내 원금 ${formatWon(loanPrincipalActualAmount(item))}${loanSupportDueAmount(item) ? ` · 가족 분담 ${formatWon(loanSupportDueAmount(item))}` : ""}</em>` : ""}
        ${installmentText ? `<em class="installment-badge">${escapeHtml(installmentText)}</em>` : ""}
        ${canEditInstallment ? `<button type="button" class="detail-installment-edit-button ${isInstallmentEditing ? "is-active" : ""}" data-detail-installment-edit="${escapeHtml(item.recordKey)}" title="할부 설정 수정">${isInstallmentEditing ? "수정 중" : "수정"}</button>` : ""}
      </span>
      <span class="amount payment">${formatWon(item.amount)}</span>
      <span class="amount reimbursement">
        <input step="1" data-number-kind="money" class="reimbursement-input" type="text" inputmode="numeric" data-record-key="${escapeHtml(item.recordKey)}" value="${formatPlainNumber(reimbursementFor(item))}" aria-label="${escapeHtml(item.merchant)} 정산받은 금액" ${reimbursementDisabled ? "disabled" : ""}>
      </span>
      <span class="amount actual strong">${formatWon(consumptionAmount(item))}</span>
    </div>
    ${isInstallmentEditing ? renderInstallmentInlineControls(item) : ""}
  `;
  }).join("");

  return `
    <section class="ledger-section category-card ${categoryClass(section.sector)} ${hiddenCount > 0 ? "is-truncated-card" : ""} ${options.fullMode ? "is-full-card" : ""} ${options.masterDetail ? "is-master-detail-card" : ""}" data-ledger-sector="${escapeHtml(section.sector)}">
      <div class="category-card-head">
        <div class="category-title-block ${options.masterDetail ? "detail-ledger-heading" : ""}">
          ${options.masterDetail ? `<span class="detail-ledger-icon ${categoryClass(section.sector)}" aria-hidden="true"><i class="ti ${subcategoryIconClass(section.sector, section.subcategory)}"></i></span>` : ""}
          <div>
            ${options.contextLabel ? `<span class="detail-ledger-breadcrumb">${escapeHtml(options.contextLabel)} <i class="ti ti-chevron-right" aria-hidden="true"></i></span>` : ""}
            <h4>${escapeHtml(section.title)}</h4>
            <p>${sortedRows.length.toLocaleString("ko-KR")}건 · 정산 ${formatWon(reimbursementTotal)}</p>
          </div>
        </div>
        <div class="category-actions">
          <strong>${formatWon(actualTotal)}</strong>
          ${canOpenFullView ? `<button type="button" class="detail-card-expand" data-detail-expand-section="${escapeHtml(section.key)}">전체 보기</button>` : ""}
          ${options.fullMode ? `<button type="button" class="detail-reimbursement-toggle ${reimbursementEditMode ? "primary-action" : ""}" data-detail-reimbursement-toggle aria-pressed="${reimbursementEditMode ? "true" : "false"}">${reimbursementEditMode ? "정산금 수정 완료" : "정산금 수정"}</button>` : ""}
          <button type="button" class="quick-add-toggle" data-quick-add-open="${escapeHtml(section.key)}">+ 내역 추가</button>
        </div>
      </div>
      ${boardQuickAddFeedback === section.key ? `<div class="quick-add-feedback">직접 입력 내역을 추가했습니다.</div>` : ""}
      <div class="category-stat-row">
        <span>총 결제 ${formatWon(total)}</span>
        <span>실 지출 ${formatWon(actualTotal)}</span>
      </div>
      ${options.reimbursementHint ? `<p class="category-edit-hint">${escapeHtml(options.reimbursementHint)}</p>` : ""}
      ${boardQuickAddSectionKey === section.key ? renderQuickAddForm(section, selectedMonth) : ""}
      <div class="transaction-list">
        <div class="transaction-head">
          <span>날짜</span>
          <span>내용</span>
          <span class="amount">총 결제액</span>
          <span class="amount">정산받은 금액</span>
          <span class="amount">분석 반영액</span>
        </div>
        ${bodyRows || `<div class="ledger-empty">내역 없음</div>`}
      </div>
      ${options.fullViewButton && hiddenCount > 0 ? `
        <div class="detail-card-more">
          <span>${hiddenCount.toLocaleString("ko-KR")}건이 더 있습니다.</span>
          <button type="button" data-detail-expand-section="${escapeHtml(section.key)}">전체 보기</button>
        </div>
      ` : ""}
    </section>
  `;
}

function renderInstallmentInlineControls(item) {
  const enabled = Boolean(item.installmentEnabled && Number(item.installmentMonths || 0) > 1);
  const parsedMonths = installmentMonths(item.installment);
  const months = enabled ? Number(item.installmentMonths || 0) : parsedMonths || 2;
  const startMonth = item.installmentStartMonth || item.month || monthKey(item.approvalDate) || currentMonthKey();
  const monthly = enabled ? installmentMonthlyAmount(item) : Math.floor(Number(item.amount || 0) / Math.max(1, months));
  return `
    <div class="transaction-installment-row" data-installment-row="${escapeHtml(item.recordKey)}">
      <label class="check-line">
        <input type="checkbox" class="installment-toggle" data-installment-field="enabled" data-record-key="${escapeHtml(item.recordKey)}" ${enabled ? "checked" : ""}>
        할부 적용
      </label>
      <label>개월
        <input data-number-kind="duration" data-number-unit="개월" type="number" min="2" max="60" class="installment-months-input" data-installment-field="months" data-record-key="${escapeHtml(item.recordKey)}" value="${escapeHtml(months)}">
      </label>
      <label>시작 월
        <input type="month" class="installment-start-input" data-installment-field="startMonth" data-record-key="${escapeHtml(item.recordKey)}" value="${escapeHtml(startMonth)}">
      </label>
      <span class="installment-preview">월별 반영액 ${formatWon(monthly)}</span>
      <div class="installment-edit-actions">
        <button type="button" class="primary-action" data-installment-save="${escapeHtml(item.recordKey)}">저장</button>
        <button type="button" data-detail-installment-cancel>취소</button>
      </div>
    </div>
  `;
}

function sortTransactionRows(rows, sortMode = "date") {
  const byDate = (a, b) =>
    `${a.approvalDate} ${a.approvalTime} ${a.merchant}`.localeCompare(`${b.approvalDate} ${b.approvalTime} ${b.merchant}`, "ko-KR");
  const byRecent = (a, b) =>
    `${b.approvalDate} ${b.approvalTime} ${b.importedAt || ""}`.localeCompare(`${a.approvalDate} ${a.approvalTime} ${a.importedAt || ""}`, "ko-KR");
  const sorters = {
    "amount-desc": (a, b) => consumptionAmount(b) - consumptionAmount(a) || byDate(a, b),
    "amount-asc": (a, b) => consumptionAmount(a) - consumptionAmount(b) || byDate(a, b),
    recent: byRecent,
    date: byDate
  };
  return [...rows].sort(sorters[sortMode] || byDate);
}

function renderQuickAddForm(section, selectedMonth) {
  const defaultDate = defaultDateForMonth(selectedMonth);
  return `
    <form class="quick-add-form" data-quick-add-form="${escapeHtml(section.key)}">
      <div class="quick-add-lock">
        ${categoryChip(section.sector, section.subcategory)}
        <span>이 카드 기준으로 자동 분류됩니다.</span>
      </div>
      <p class="quick-add-hint">분석 반영액은 총 결제액에서 정산금을 빼며, 대출 상환은 이자만 반영합니다.</p>
      <label>
        날짜
        <input name="date" type="date" value="${escapeHtml(defaultDate)}" required>
      </label>
      <label>
        결제수단
        <select name="sourceType">
          <option value="card">카드</option>
          <option value="transfer">이체</option>
          <option value="cash">현금</option>
        </select>
      </label>
      <label class="wide-field">
        내용
        <input name="merchant" type="text" placeholder="${escapeHtml(section.title)} 내역" required>
      </label>
      <label>
        총 결제액
        <input step="1" data-number-kind="money" name="amount" type="text" inputmode="numeric" placeholder="0" required>
      </label>
      <label>
        정산받은 금액
        <input step="1" data-number-kind="money" name="reimbursement" type="text" inputmode="numeric" placeholder="0">
      </label>
      <div class="quick-add-actions">
        <button type="button" data-quick-add-close>취소</button>
        <button type="submit" class="primary-action">저장</button>
      </div>
    </form>
  `;
}

function attachInstallmentHandlers(root = els.detailGrid) {
  root.querySelectorAll("[data-installment-row]").forEach((row) => {
    const updatePreview = () => {
      const key = row.dataset.installmentRow;
      const record = classified.find((item) => item.recordKey === key);
      const months = Math.max(2, Number(row.querySelector('[data-installment-field="months"]')?.value || 2));
      const preview = row.querySelector(".installment-preview");
      if (preview) preview.textContent = `월별 반영액 ${formatWon(Math.floor(Number(record?.amount || 0) / months))}`;
    };
    row.querySelectorAll("[data-installment-field]").forEach((control) => {
      control.addEventListener("input", updatePreview);
      control.addEventListener("change", updatePreview);
    });
    row.querySelectorAll("[data-installment-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.disabled || !NumericInput.validate(row)) return;
        const controls = [...row.querySelectorAll("input, button")];
        const disabledStates = controls.map((control) => control.disabled);
        controls.forEach((control) => { control.disabled = true; });
        try {
          if (!await saveInstallmentSettings(button.dataset.installmentSave, row)) return;
          detailInstallmentEditRecordKey = "";
          reclassify();
        } finally {
          controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
        }
      });
    });
    row.querySelectorAll("[data-detail-installment-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        detailInstallmentEditRecordKey = "";
        renderDetailView();
      });
    });
  });
}

async function saveInstallmentSettings(recordKey, row) {
  return runManualTransactionSave(async () => {
    const index = transactions.findIndex((item) => normalizeStoredTransaction(item).recordKey === recordKey);
    if (index < 0) return false;
    const original = normalizeStoredTransaction(transactions[index]);
    if (isLoanRepaymentTransaction(original)) return false;
    const enabled = Boolean(row.querySelector('[data-installment-field="enabled"]')?.checked);
    const months = Math.max(0, Number(row.querySelector('[data-installment-field="months"]')?.value || 0));
    const startMonth = row.querySelector('[data-installment-field="startMonth"]')?.value || original.month;
    const validEnabled = enabled && months > 1 && isValidMonthKey(startMonth);
    const updated = normalizeStoredTransaction({
      ...original,
      installmentEnabled: validEnabled,
      installmentMonths: validEnabled ? months : 0,
      installmentStartMonth: validEnabled ? startMonth : "",
      installmentOriginalAmount: validEnabled ? Number(original.amount || 0) : 0,
      installmentMonthlyAmount: validEnabled ? Math.floor(Number(original.amount || 0) / months) : 0,
      installmentGroupId: validEnabled ? original.installmentGroupId || original.recordKey : "",
      updatedAt: new Date().toISOString(),
      recordKey
    });
    const nextTransactions = transactions.map((item, itemIndex) => itemIndex === index ? updated : normalizeStoredTransaction(item));
    if (!await safeSave(RECORD_STORAGE_KEY, nextTransactions, { protectIncomeRecords: true })) return false;
    transactions = nextTransactions;
    return true;
  });
}
