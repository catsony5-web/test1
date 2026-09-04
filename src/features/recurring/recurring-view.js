function setRecurringWorkspaceTab(tab, options = {}) {
  const nextTab = tab === "manage" ? "manage" : "review";
  activeRecurringWorkspaceTab = nextTab;
  els.recurringWorkspaceTabButtons.forEach((button) => {
    const selected = button.dataset.recurringWorkspaceTab === nextTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && options.focus) button.focus();
  });
  els.recurringWorkspacePanels.forEach((panel) => {
    panel.hidden = panel.dataset.recurringWorkspacePanel !== nextTab;
  });
  if (els.recurringViewTitle) {
    els.recurringViewTitle.textContent = nextTab === "review" ? "고정 지출 점검" : "고정 지출 등록·관리";
  }
  if (els.recurringViewDescription) {
    els.recurringViewDescription.textContent = nextTab === "review"
      ? "매달 자동으로 빠져나가는 비용을 한눈에 보고, 유지할 항목과 다시 볼 항목을 구분합니다."
      : "일반 고정 지출과 대출 상환의 등록 정보와 실제 반영 상태를 관리합니다.";
  }
  if (els.recurringAddButton) els.recurringAddButton.hidden = nextTab !== "review";
}

function setRecurringTab(tab, options = {}) {
  const nextTab = tab === "loan" ? "loan" : "expense";
  activeRecurringTab = nextTab;
  els.recurringTabButtons.forEach((button) => {
    const selected = button.dataset.recurringTab === nextTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && options.focus) button.focus();
  });
  els.recurringPanels.forEach((panel) => {
    panel.hidden = panel.dataset.recurringPanel !== nextTab;
  });
}

function moveRecurringReviewMonth(offset) {
  const current = els.recurringMonthFilter.value || selectedCalendarMonth || currentMonthKey();
  const next = shiftMonthKey(current, offset);
  selectedRecurringReviewId = "";
  recurringReviewFeedback = "";
  setSharedSelectedMonth(next, { syncControls: false });
  if (![...els.recurringMonthFilter.options].some((option) => option.value === next)) {
    els.recurringMonthFilter.add(new Option(next, next));
  }
  els.recurringMonthFilter.value = next;
  renderRecurring();
}

function openRecurringManageForCreate() {
  setRecurringWorkspaceTab("manage");
  setRecurringTab("expense");
  resetRecurringForm();
  els.recurringForm?.scrollIntoView({ block: "start" });
  els.recurringName?.focus({ preventScroll: true });
}

function updateLoanScheduledTotal() {
  const total = toNumber(els.loanPrincipalAmount?.value) + toNumber(els.loanInterestAmount?.value);
  if (els.loanScheduledTotal) els.loanScheduledTotal.textContent = formatWon(total);
  return total;
}

function syncLoanSupportFields() {
  const enabled = Boolean(els.loanSupportEnabled?.checked);
  if (els.loanSupportFields) els.loanSupportFields.hidden = !enabled;
  [
    els.loanSupporterName,
    els.loanSupportOpeningBalance,
    els.loanSupportPrincipalAmount,
    els.loanSupportInterestAmount
  ].forEach((control) => {
    if (control) control.disabled = !enabled;
  });
}

function fillRecurringCategorySelects(preferred = { sector: "고정 주거비", subcategory: "보험료" }) {
  const sectors = Object.keys(categories).filter((sector) => !["수입", "미분류"].includes(sector));
  els.recurringSector.innerHTML = sectors.map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`).join("");
  if (preferred.sector && sectors.includes(preferred.sector)) els.recurringSector.value = preferred.sector;
  updateSubcategorySelect(els.recurringSector, els.recurringSubcategory, preferred.subcategory);
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const name = els.recurringName.value.trim();
  const amount = toNumber(els.recurringAmount.value);
  const dayOfMonth = Math.max(1, Math.min(31, Number(els.recurringDay.value || 0)));
  const startMonth = monthKey(els.recurringStartMonth.value);
  const endMonth = monthKey(els.recurringEndMonth.value);
  if (!name || !amount || !dayOfMonth || !startMonth) {
    alert("지출명, 금액, 매월 지출일, 시작 월을 입력해주세요.");
    return;
  }
  if (endMonth && endMonth < startMonth) {
    alert("종료 월은 시작 월보다 빠를 수 없습니다.");
    return;
  }

  const now = new Date().toISOString();
  const original = recurringExpenses.find((item) => item.id === els.recurringId.value);
  await createAutoSnapshot(original ? "고정 지출 수정 전" : "고정 지출 저장 전");
  const item = normalizeRecurringExpense({
    ...(original || {}),
    id: original?.id || `recurring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recurringType: "expense",
    name,
    amount,
    dayOfMonth,
    sector: els.recurringSector.value,
    subcategory: els.recurringSubcategory.value,
    paymentType: els.recurringPaymentType.value,
    startMonth,
    endMonth,
    memo: els.recurringMemo.value.trim(),
    showOnCalendar: els.recurringShowOnCalendar.checked,
    autoPost: els.recurringAutoPost.checked,
    paused: original?.paused || false,
    createdAt: original?.createdAt || now,
    updatedAt: now
  });

  if (original) {
    recurringExpenses = recurringExpenses.map((expense) => expense.id === original.id ? item : expense);
  } else {
    recurringExpenses.unshift(item);
  }
  await saveRecurringExpenses();
  if (original) {
    await syncPostedRecurringTransactions(item);
  }
  await ensureAutoPostedRecurringExpenses();
  resetRecurringForm();
  renderAll();
}

async function syncPostedRecurringTransactions(recurringItem) {
  if (!recurringItem?.id) return 0;
  const syncedAt = new Date().toISOString();
  let updated = 0;
  let removed = 0;
  transactions = transactions.map((record) => {
    const normalized = normalizeStoredTransaction(record);
    if (
      normalized.sourceType !== "recurring" ||
      normalized.recurringId !== recurringItem.id ||
      isCanceled(normalized.cancel)
    ) {
      return record;
    }

    const isLoan = recurringItem.recurringType === "loan";
    const nextRecord = {
      ...normalized,
      merchant: recurringItem.name,
      amount: isLoan ? normalized.amount : Number(recurringItem.amount || 0),
      manualSector: recurringItem.sector,
      manualSubcategory: recurringItem.subcategory,
      recurringType: recurringItem.recurringType,
      loanType: isLoan ? recurringItem.loanType : "",
      memo: recurringItem.memo || "",
      updatedAt: syncedAt
    };
    nextRecord.recordKey = createRecordKey(nextRecord);

    const changed = [
      "merchant",
      "manualSector",
      "manualSubcategory",
      "recurringType",
      "loanType",
      "memo",
      "recordKey"
    ].concat(isLoan ? [] : ["amount"]).some((key) => normalized[key] !== nextRecord[key]);

    if (!changed) return normalized;
    updated += 1;
    return normalizeStoredTransaction(nextRecord);
  }).filter((record) => {
    const normalized = normalizeStoredTransaction(record);
    if (
      normalized.sourceType !== "recurring" ||
      normalized.recurringId !== recurringItem.id ||
      isCanceled(normalized.cancel)
    ) {
      return true;
    }
    if (recurringItem.recurringType === "loan") return true;
    if (isRecurringActiveForMonth(recurringItem, normalized.month)) return true;
    removed += 1;
    return false;
  });

  if (!updated && !removed) return 0;
  await saveTransactions();
  reclassify();
  return updated + removed;
}

function handleRecurringBulkParse() {
  const parsed = parseRecurringBulkText(els.recurringBulkPaste.value);
  recurringBulkRows = parsed.rows;
  renderRecurringBulkPreview(parsed.errorCount ? `${parsed.errorCount.toLocaleString("ko-KR")}개 줄은 확인이 필요합니다.` : "붙여넣기 내용을 파싱했습니다.");
}

function clearRecurringBulkInput() {
  els.recurringBulkPaste.value = "";
  recurringBulkRows = [];
  renderRecurringBulkPreview("");
}

async function handleRecurringBulkSave() {
  updateRecurringBulkRowsFromPreview();
  const validRows = recurringBulkRows
    .map(validateRecurringBulkRow)
    .filter((row) => row.valid && !row.duplicate);
  if (!validRows.length) {
    renderRecurringBulkPreview("저장할 수 있는 정상 고정 지출 항목이 없습니다. 오류 또는 중복 가능 항목을 확인해주세요.");
    return;
  }

  const now = new Date().toISOString();
  const incoming = validRows.map((row) => normalizeRecurringExpense({
    id: `recurring-${Date.now()}-${row.lineNumber}-${Math.random().toString(36).slice(2, 8)}`,
    name: row.description,
    amount: row.amount,
    dayOfMonth: row.dayOfMonth,
    sector: row.sector,
    subcategory: row.subcategory,
    paymentType: row.paymentType,
    startMonth: row.startMonth,
    endMonth: row.endMonth || "",
    memo: row.memo,
    showOnCalendar: true,
    autoPost: false,
    paused: false,
    createdAt: now,
    updatedAt: now
  }));

  await createAutoSnapshot("고정 지출 일괄 저장 전");
  const skipped = recurringBulkRows.filter((row) => row.valid && row.duplicate).length;
  recurringExpenses = [...incoming, ...recurringExpenses];
  await saveRecurringExpenses();
  await ensureAutoPostedRecurringExpenses();
  recurringBulkRows = [];
  els.recurringBulkPaste.value = "";
  renderRecurringBulkPreview(`고정 지출 ${incoming.length.toLocaleString("ko-KR")}건을 저장했습니다.${skipped ? ` 중복 가능 ${skipped.toLocaleString("ko-KR")}건은 건너뛰었습니다.` : ""}`);
  renderAll();
}

function parseRecurringBulkText(text) {
  const rows = String(text || "").split(/\r?\n/)
    .map((line, index) => parseRecurringBulkLine(line, index + 1))
    .filter(Boolean);
  return {
    rows,
    errorCount: rows.filter((row) => !row.valid).length
  };
}

function parseRecurringBulkLine(line, lineNumber) {
  const original = String(line || "").trim();
  if (!original) return null;
  const dateMatch = original.match(/^\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})\s+(.+)$/);
  if (!dateMatch) {
    return validateRecurringBulkRow({
      id: recurringBulkRowId(lineNumber),
      lineNumber,
      original,
      date: "",
      description: original,
      amount: 0
    });
  }

  const date = normalizeInputDate(dateMatch[1]);
  const rest = dateMatch[2].trim();
  const amountMatch = lastRecurringAmountMatch(rest);
  if (!amountMatch) {
    return validateRecurringBulkRow({
      id: recurringBulkRowId(lineNumber),
      lineNumber,
      original,
      date,
      description: rest,
      amount: 0
    });
  }

  const description = stripTrailingRecurringAmounts(rest.slice(0, amountMatch.index).trim());
  return validateRecurringBulkRow({
    id: recurringBulkRowId(lineNumber),
    lineNumber,
    original,
    date,
    description,
    amount: amountMatch.amount
  });
}

function recurringBulkRowId(lineNumber) {
  return `recurring-bulk-${Date.now()}-${lineNumber}-${Math.random().toString(36).slice(2, 6)}`;
}

function lastRecurringAmountMatch(text) {
  const matches = [...String(text || "").matchAll(/-?\d[\d,]*\s*원?/g)]
    .map((match) => ({
      raw: match[0],
      index: match.index || 0,
      amount: toNumber(match[0].replace(/원/g, ""))
    }))
    .filter((match) => match.amount && (match.raw.includes(",") || match.raw.includes("원") || Math.abs(match.amount) >= 1000));
  return matches.at(-1) || null;
}

function stripTrailingRecurringAmounts(text) {
  let output = String(text || "").trim();
  while (true) {
    const match = output.match(/(?:\s+|^)(-?\d[\d,]*\s*원?)\s*$/);
    if (!match) return output.trim();
    const amount = toNumber(match[1].replace(/원/g, ""));
    if (!amount || (!match[1].includes(",") && !match[1].includes("원") && Math.abs(amount) < 1000)) return output.trim();
    output = output.slice(0, match.index).trim();
  }
}

function validateRecurringBulkRow(row) {
  const date = normalizeInputDate(row.date);
  const startMonth = monthKey(row.startMonth) || (date ? monthKey(date) : "");
  const description = String(row.description || "").trim();
  const amount = toNumber(row.amount);
  const errors = [];
  const rawDay = Number(row.dayOfMonth || (date ? date.slice(-2) : 0));
  const dayOfMonth = Number.isFinite(rawDay) ? Math.max(1, Math.min(31, rawDay)) : 0;
  const endMonth = monthKey(row.endMonth);
  if (!startMonth) errors.push("시작 월 확인");
  if (!dayOfMonth) errors.push("지출일 확인");
  if (!description) errors.push("내용 확인");
  if (!amount) errors.push("금액 확인");
  if (endMonth && startMonth && endMonth < startMonth) errors.push("종료 월 확인");
  const assignment = inferRecurringAssignment(description);
  const sector = row.sector && categories[row.sector] ? row.sector : assignment.sector;
  return {
    ...row,
    date,
    description,
    amount,
    dayOfMonth,
    startMonth,
    endMonth,
    sector,
    subcategory: row.subcategory && categories[sector]?.includes(row.subcategory) ? row.subcategory : categories[sector]?.[0] || assignment.subcategory,
    paymentType: row.paymentType || els.recurringPaymentType?.value || "이체",
    memo: row.memo || "",
    valid: !errors.length,
    error: errors.join(", ")
  };
}

function inferRecurringAssignment(description) {
  const match = typeof findRule === "function" ? findRule(description) : null;
  if (match && !["미분류", "수입", "제외"].includes(match.sector)) {
    return normalizeCategoryAssignment(match.sector, match.subcategory, description);
  }
  return normalizeCategoryAssignment("고정 주거비", "", description);
}

function updateRecurringBulkRowsFromPreview() {
  if (!els.recurringBulkPreview) return;
  els.recurringBulkPreview.querySelectorAll("[data-recurring-bulk-index]").forEach((input) => {
    const index = Number(input.dataset.recurringBulkIndex);
    const field = input.dataset.recurringBulkField;
    if (!recurringBulkRows[index] || !field) return;
    recurringBulkRows[index][field] = input.value;
  });
  recurringBulkRows = markDuplicateRecurringBulkRows(recurringBulkRows.map(validateRecurringBulkRow));
}

function renderRecurringBulkPreview(message = "") {
  if (!els.recurringBulkPreview) return;
  els.recurringBulkFeedback.textContent = message || "";
  recurringBulkRows = markDuplicateRecurringBulkRows(recurringBulkRows.map(validateRecurringBulkRow));
  els.saveRecurringBulkButton.disabled = !recurringBulkRows.some((row) => row.valid && !row.duplicate);
  if (!recurringBulkRows.length) {
    els.recurringBulkPreview.innerHTML = `<tbody><tr><td class="empty">붙여넣기 내용을 파싱하면 미리보기가 표시됩니다.</td></tr></tbody>`;
    return;
  }

  els.recurringBulkPreview.innerHTML = `
    <thead>
      <tr>
        <th>시작 월</th>
        <th>매월 지출일</th>
        <th>지출명</th>
        <th class="amount">금액</th>
        <th>섹터</th>
        <th>세부항목</th>
        <th>결제 방식</th>
        <th>종료 월</th>
        <th>상태</th>
        <th>삭제</th>
      </tr>
    </thead>
    <tbody>
      ${recurringBulkRows.map((row, index) => {
        const checked = row;
        recurringBulkRows[index] = checked;
        return `
          <tr class="${checked.valid && !checked.duplicate ? "" : "income-preview-error"}">
            <td><input data-recurring-bulk-index="${index}" data-recurring-bulk-field="startMonth" type="month" value="${escapeHtml(checked.startMonth)}"></td>
            <td><input data-recurring-bulk-index="${index}" data-recurring-bulk-field="dayOfMonth" type="number" min="1" max="31" value="${escapeHtml(checked.dayOfMonth)}"></td>
            <td><input data-recurring-bulk-index="${index}" data-recurring-bulk-field="description" type="text" value="${escapeHtml(checked.description)}" title="${escapeHtml(checked.original || "")}"></td>
            <td><input data-recurring-bulk-index="${index}" data-recurring-bulk-field="amount" class="amount-input" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(checked.amount))}"></td>
            <td><select data-recurring-bulk-index="${index}" data-recurring-bulk-field="sector">${recurringBulkSectorOptionsHtml(checked.sector)}</select></td>
            <td><select data-recurring-bulk-index="${index}" data-recurring-bulk-field="subcategory">${recurringBulkSubcategoryOptionsHtml(checked.sector, checked.subcategory)}</select></td>
            <td><select data-recurring-bulk-index="${index}" data-recurring-bulk-field="paymentType">${recurringBulkPaymentOptionsHtml(checked.paymentType)}</select></td>
            <td><input data-recurring-bulk-index="${index}" data-recurring-bulk-field="endMonth" type="month" value="${escapeHtml(checked.endMonth || "")}" title="비워두면 계속 반복됩니다."></td>
            <td>${renderRecurringBulkStatus(checked)}</td>
            <td><button type="button" class="income-row-delete" data-delete-recurring-bulk="${index}">삭제</button></td>
          </tr>
        `;
      }).join("")}
    </tbody>
  `;

  els.recurringBulkPreview.querySelectorAll("[data-recurring-bulk-index]").forEach((input) => {
    input.addEventListener("change", () => {
      updateRecurringBulkRowsFromPreview();
      renderRecurringBulkPreview("미리보기 내용을 다시 검증했습니다.");
    });
  });
  els.recurringBulkPreview.querySelectorAll("[data-delete-recurring-bulk]").forEach((button) => {
    button.addEventListener("click", () => {
      updateRecurringBulkRowsFromPreview();
      recurringBulkRows.splice(Number(button.dataset.deleteRecurringBulk), 1);
      renderRecurringBulkPreview("선택한 줄을 미리보기에서 삭제했습니다.");
    });
  });
}

function markDuplicateRecurringBulkRows(rows) {
  const seen = new Map();
  return rows.map((row, index) => {
    const signature = recurringBulkSignature(row);
    const previewDuplicate = row.valid && signature && seen.has(signature);
    if (signature) seen.set(signature, index);
    const existingDuplicate = row.valid && isExistingRecurringDuplicate(row);
    return {
      ...row,
      duplicate: Boolean(previewDuplicate || existingDuplicate),
      duplicateReason: previewDuplicate ? "미리보기 중복 가능" : existingDuplicate ? "이미 등록된 고정 지출" : ""
    };
  });
}

function recurringBulkSignature(row) {
  const name = row?.description || row?.name || "";
  if (!name || !row?.amount || !row?.dayOfMonth || !row?.startMonth) return "";
  return [
    normalizeKeyText(name),
    Number(row.amount || 0),
    Number(row.dayOfMonth || 0),
    row.startMonth
  ].join("|");
}

function isExistingRecurringDuplicate(row) {
  const signature = recurringBulkSignature(row);
  if (!signature) return false;
  return recurringExpenses.some((item) => recurringBulkSignature(item) === signature);
}

function renderRecurringBulkStatus(row) {
  if (!row.valid) return `<span class="income-status error">${escapeHtml(row.error)}</span>`;
  if (row.duplicate) return `<span class="income-status warning">${escapeHtml(row.duplicateReason || "중복 가능")}</span>`;
  return `<span class="income-status ok">${row.endMonth ? "기간 반복" : "계속 반복"}</span>`;
}

function recurringBulkSectorOptionsHtml(selected) {
  return Object.keys(categories)
    .filter((sector) => !["수입", "미분류"].includes(sector))
    .map((sector) => `<option value="${escapeHtml(sector)}" ${sector === selected ? "selected" : ""}>${escapeHtml(sector)}</option>`)
    .join("");
}

function recurringBulkSubcategoryOptionsHtml(sector, selected) {
  const options = categories[sector] || [];
  return options
    .map((subcategory) => `<option value="${escapeHtml(subcategory)}" ${subcategory === selected ? "selected" : ""}>${escapeHtml(subcategory)}</option>`)
    .join("");
}

function recurringBulkPaymentOptionsHtml(selected = "이체") {
  return ["카드", "이체", "현금", "기타"]
    .map((option) => `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`)
    .join("");
}

function resetRecurringForm() {
  editingRecurringId = "";
  els.recurringId.value = "";
  els.recurringForm.reset();
  els.recurringStartMonth.value = selectedCalendarMonth || els.boardMonth.value || currentMonthKey();
  els.recurringEndMonth.value = "";
  els.recurringShowOnCalendar.checked = true;
  els.recurringAutoPost.checked = false;
  fillRecurringCategorySelects();
  els.saveRecurringButton.textContent = "고정 지출 저장";
  els.cancelRecurringEditButton.hidden = true;
}

function resetLoanForm() {
  editingLoanId = "";
  els.loanId.value = "";
  els.loanForm.reset();
  els.loanPaymentType.value = "이체";
  els.loanStartMonth.value = selectedCalendarMonth || els.boardMonth.value || currentMonthKey();
  els.loanMaturityMonth.value = "";
  els.loanShowOnCalendar.checked = true;
  els.loanSupportEnabled.checked = false;
  syncLoanSupportFields();
  els.saveLoanButton.textContent = "대출 상환 저장";
  els.cancelLoanEditButton.hidden = true;
  updateLoanScheduledTotal();
}

async function handleLoanSubmit(event) {
  event.preventDefault();
  const name = els.loanName.value.trim();
  const loanOpeningBalance = toNumber(els.loanOpeningBalance.value);
  const loanPrincipalAmount = toNumber(els.loanPrincipalAmount.value);
  const loanInterestAmount = toNumber(els.loanInterestAmount.value);
  const loanSupportEnabled = els.loanSupportEnabled.checked;
  const loanSupporterName = loanSupportEnabled ? els.loanSupporterName.value.trim() : "";
  const loanSupportOpeningBalance = loanSupportEnabled ? toNumber(els.loanSupportOpeningBalance.value) : 0;
  const loanSupportPrincipalAmount = loanSupportEnabled ? toNumber(els.loanSupportPrincipalAmount.value) : 0;
  const loanSupportInterestAmount = loanSupportEnabled ? toNumber(els.loanSupportInterestAmount.value) : 0;
  const dayOfMonth = Number(els.loanDay.value);
  const startMonth = monthKey(els.loanStartMonth.value);
  const endMonth = monthKey(els.loanMaturityMonth.value);
  const original = recurringExpenses.find((item) => item.id === els.loanId.value && item.recurringType === "loan");
  if (!name || !loanOpeningBalance || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31 || !startMonth || loanPrincipalAmount + loanInterestAmount <= 0) {
    alert("대출명, 남은 원금, 상환일, 원금·이자 기본값, 추적 시작 월을 입력해주세요.");
    return;
  }
  if (endMonth && endMonth < startMonth) {
    alert("만기 월은 추적 시작 월보다 빠를 수 없습니다.");
    return;
  }
  if (loanSupportEnabled && (!loanSupporterName || loanSupportOpeningBalance <= 0)) {
    alert("가족 부담자 이름과 추적 시작 시 가족 부담 원금을 입력해주세요.");
    return;
  }
  if (loanSupportOpeningBalance > loanOpeningBalance) {
    alert("가족 부담 원금은 전체 남은 원금을 초과할 수 없습니다.");
    return;
  }
  if (loanSupportPrincipalAmount > loanPrincipalAmount || loanSupportInterestAmount > loanInterestAmount) {
    alert("가족 부담 원금·이자는 전체 월 원금·이자를 초과할 수 없습니다.");
    return;
  }
  const paidPrincipal = original ? loanPaidPrincipal(original.id) : 0;
  const paidSupportPrincipal = original ? loanPaidSupportPrincipal(original.id) : 0;
  const paidPersonalPrincipal = Math.max(0, paidPrincipal - paidSupportPrincipal);
  if (original && loanOpeningBalance < paidPrincipal) {
    alert(`추적 시작 시 남은 원금은 이미 반영한 원금 합계 ${formatWon(paidPrincipal)}보다 작을 수 없습니다.`);
    return;
  }
  if (original && loanSupportOpeningBalance < paidSupportPrincipal) {
    alert(`가족 부담 원금은 이미 반영한 가족 원금 합계 ${formatWon(paidSupportPrincipal)}보다 작을 수 없습니다.`);
    return;
  }
  if (original && loanOpeningBalance - loanSupportOpeningBalance < paidPersonalPrincipal) {
    alert(`본인 부담 원금은 이미 반영한 본인 원금 합계 ${formatWon(paidPersonalPrincipal)}보다 작을 수 없습니다.`);
    return;
  }

  const now = new Date().toISOString();
  await createAutoSnapshot(original ? "대출 상환 수정 전" : "대출 상환 저장 전");
  const item = normalizeRecurringExpense({
    ...(original || {}),
    id: original?.id || `recurring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recurringType: "loan",
    name,
    dayOfMonth,
    paymentType: els.loanPaymentType.value,
    startMonth,
    endMonth,
    memo: els.loanMemo.value.trim(),
    showOnCalendar: els.loanShowOnCalendar.checked,
    autoPost: false,
    paused: original?.paused || false,
    loanType: els.loanType.value,
    loanOpeningBalance,
    loanPrincipalAmount,
    loanInterestAmount,
    loanInterestRate: toNumber(els.loanInterestRate.value),
    loanSupportEnabled,
    loanSupporterName,
    loanSupportOpeningBalance,
    loanSupportPrincipalAmount,
    loanSupportInterestAmount,
    loanMaturityMonth: endMonth,
    createdAt: original?.createdAt || now,
    updatedAt: now
  });

  recurringExpenses = original
    ? recurringExpenses.map((expense) => expense.id === original.id ? item : expense)
    : [item, ...recurringExpenses];
  await saveRecurringExpenses();
  if (original) await syncPostedRecurringTransactions(item);
  resetLoanForm();
  renderAll();
  setRecurringTab("loan");
}

function editLoanRepayment(id, options = {}) {
  const item = recurringExpenses.find((expense) => expense.id === id && expense.recurringType === "loan");
  if (!item) return;
  if (options.switchView !== false && !isViewActive("recurring")) switchView("recurring");
  setRecurringWorkspaceTab("manage");
  setRecurringTab("loan");
  editingLoanId = id;
  els.loanId.value = item.id;
  els.loanName.value = item.name;
  els.loanType.value = item.loanType || "신용대출";
  els.loanOpeningBalance.value = formatPlainNumber(item.loanOpeningBalance);
  els.loanInterestRate.value = item.loanInterestRate || "";
  els.loanDay.value = item.dayOfMonth;
  els.loanPaymentType.value = item.paymentType || "이체";
  els.loanPrincipalAmount.value = formatPlainNumber(item.loanPrincipalAmount);
  els.loanInterestAmount.value = formatPlainNumber(item.loanInterestAmount);
  els.loanSupportEnabled.checked = item.loanSupportEnabled === true;
  els.loanSupporterName.value = item.loanSupporterName || "";
  els.loanSupportOpeningBalance.value = formatPlainNumber(item.loanSupportOpeningBalance || 0);
  els.loanSupportPrincipalAmount.value = formatPlainNumber(item.loanSupportPrincipalAmount || 0);
  els.loanSupportInterestAmount.value = formatPlainNumber(item.loanSupportInterestAmount || 0);
  syncLoanSupportFields();
  els.loanStartMonth.value = item.startMonth;
  els.loanMaturityMonth.value = item.loanMaturityMonth || item.endMonth || "";
  els.loanMemo.value = item.memo || "";
  els.loanShowOnCalendar.checked = item.showOnCalendar !== false;
  els.saveLoanButton.textContent = "수정 저장";
  els.cancelLoanEditButton.hidden = false;
  updateLoanScheduledTotal();
  document.querySelector("#recurringView")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function editRecurringExpense(id, options = {}) {
  const item = recurringExpenses.find((expense) => expense.id === id);
  if (!item) return;
  if (item.recurringType === "loan") {
    editLoanRepayment(id, options);
    return;
  }
  if (options.switchView !== false && !isViewActive("recurring")) switchView("recurring");
  setRecurringWorkspaceTab("manage");
  setRecurringTab("expense");
  editingRecurringId = id;
  els.recurringId.value = item.id;
  els.recurringName.value = item.name;
  els.recurringAmount.value = formatPlainNumber(item.amount);
  els.recurringDay.value = item.dayOfMonth;
  fillRecurringCategorySelects({ sector: item.sector, subcategory: item.subcategory });
  els.recurringPaymentType.value = item.paymentType || "카드";
  els.recurringStartMonth.value = item.startMonth;
  els.recurringEndMonth.value = item.endMonth || "";
  els.recurringMemo.value = item.memo || "";
  els.recurringShowOnCalendar.checked = item.showOnCalendar !== false;
  els.recurringAutoPost.checked = item.autoPost === true;
  els.saveRecurringButton.textContent = "수정 저장";
  els.cancelRecurringEditButton.hidden = false;
  document.querySelector("#recurringView")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecurringExpense(id) {
  const item = recurringExpenses.find((expense) => expense.id === id);
  if (!item) return;
  const label = item.recurringType === "loan" ? "대출 상환" : "고정 지출";
  if (!confirm(`"${item.name}" ${label}을 삭제할까요?\n이미 반영한 월별 거래는 유지됩니다.`)) return;
  await createAutoSnapshot("고정 지출 삭제 전");
  recurringExpenses = recurringExpenses.filter((expense) => expense.id !== id);
  if (editingRecurringId === id) resetRecurringForm();
  if (editingLoanId === id) resetLoanForm();
  await saveRecurringExpenses();
  renderAll();
}

async function toggleRecurringPaused(id) {
  recurringExpenses = recurringExpenses.map((expense) => expense.id === id
    ? normalizeRecurringExpense({ ...expense, paused: !expense.paused, updatedAt: new Date().toISOString() })
    : expense);
  await saveRecurringExpenses();
  await ensureAutoPostedRecurringExpenses();
  renderAll();
}

function buildRecurringTransaction(item, targetMonth, options = {}) {
  const approvalDate = getRecurringDateForMonth(targetMonth, item.dayOfMonth);
  const isLoan = item.recurringType === "loan";
  const loanPrincipalAmount = isLoan
    ? Math.max(0, toNumber(options.loanPrincipalAmount ?? item.loanPrincipalAmount))
    : 0;
  const loanInterestAmount = isLoan
    ? Math.max(0, toNumber(options.loanInterestAmount ?? item.loanInterestAmount))
    : 0;
  const loanSupportPrincipalAmount = isLoan && item.loanSupportEnabled
    ? Math.min(loanPrincipalAmount, Math.max(0, toNumber(options.loanSupportPrincipalAmount ?? item.loanSupportPrincipalAmount)))
    : 0;
  const loanSupportInterestAmount = isLoan && item.loanSupportEnabled
    ? Math.min(loanInterestAmount, Math.max(0, toNumber(options.loanSupportInterestAmount ?? item.loanSupportInterestAmount)))
    : 0;
  const transaction = {
    sourceType: "recurring",
    flow: "expense",
    cardNumber: "",
    approvalDate,
    month: targetMonth,
    approvalTime: "",
    merchant: item.name,
    amount: isLoan ? loanPrincipalAmount + loanInterestAmount : Number(item.amount || 0),
    installment: "",
    approvalNo: `recurring-${item.id}-${targetMonth}`,
    cancel: "",
    payDate: "",
    manualSector: item.sector,
    manualSubcategory: item.subcategory,
    sourceFile: "고정 지출",
    importedAt: new Date().toISOString(),
    recurringId: item.id,
    recurringType: item.recurringType,
    loanType: isLoan ? item.loanType : "",
    loanPrincipalAmount,
    loanInterestAmount,
    loanSupportPrincipalAmount,
    loanSupportInterestAmount,
    loanSupportReceivedAmount: isLoan ? Math.max(0, toNumber(options.loanSupportReceivedAmount)) : 0,
    loanSupportReceivedDate: isLoan ? normalizeInputDate(options.loanSupportReceivedDate) : "",
    loanSupportIncomeTransactionId: isLoan ? String(options.loanSupportIncomeTransactionId || "") : "",
    loanLinkedExisting: false,
    memo: item.memo || ""
  };
  transaction.recordKey = createRecordKey(transaction);
  return transaction;
}

function recurringMonthsThrough(item, throughMonth = currentMonthKey()) {
  const startMonth = monthKey(item?.startMonth);
  const cappedThroughMonth = monthKey(throughMonth) || currentMonthKey();
  if (!startMonth || !cappedThroughMonth || startMonth > cappedThroughMonth) return [];
  const endMonth = item.endMonth && item.endMonth < cappedThroughMonth ? item.endMonth : cappedThroughMonth;
  const months = [];
  for (let month = startMonth; month <= endMonth; month = shiftMonthKey(month, 1)) {
    if (isRecurringActiveForMonth(item, month)) months.push(month);
  }
  return months;
}

async function ensureAutoPostedRecurringExpenses(options = {}) {
  const throughMonth = monthKey(options.throughMonth) || currentMonthKey();
  const candidates = recurringExpenses
    .filter((item) => item.recurringType !== "loan" && item.autoPost === true && !item.paused)
    .flatMap((item) => recurringMonthsThrough(item, throughMonth)
      .filter((month) => !findPostedRecurringTransaction(item.id, month) && !findDeletedRecurringTransaction(item.id, month))
      .map((month) => buildRecurringTransaction(item, month)));

  if (!candidates.length) return { added: 0, skipped: 0 };
  const mergeResult = mergeTransactions(transactions, candidates);
  if (!mergeResult.added) return mergeResult;
  transactions = mergeResult.records;
  await saveTransactions();
  reclassify();
  return mergeResult;
}

function loanPaidPrincipal(recurringId, options = {}) {
  if (!recurringId) return 0;
  const throughMonth = monthKey(options.throughMonth);
  const excludedRecordKey = options.excludeRecordKey || "";
  return transactions
    .map(normalizeStoredTransaction)
    .filter((record) => record.recurringId === recurringId && record.recurringType === "loan")
    .filter((record) => !isCanceled(record.cancel) && (!throughMonth || record.month <= throughMonth))
    .filter((record) => !excludedRecordKey || record.recordKey !== excludedRecordKey)
    .reduce((total, record) => total + Math.max(0, Number(record.loanPrincipalAmount || 0)), 0);
}

function loanPaidSupportPrincipal(recurringId, options = {}) {
  if (!recurringId) return 0;
  const throughMonth = monthKey(options.throughMonth);
  const excludedRecordKey = options.excludeRecordKey || "";
  return transactions
    .map(normalizeStoredTransaction)
    .filter((record) => record.recurringId === recurringId && record.recurringType === "loan")
    .filter((record) => !isCanceled(record.cancel) && (!throughMonth || record.month <= throughMonth))
    .filter((record) => !excludedRecordKey || record.recordKey !== excludedRecordKey)
    .reduce((total, record) => total + loanSupportPrincipalAmount(record), 0);
}

function loanSupportRemainingPrincipal(item, throughMonth, options = {}) {
  if (!item?.loanSupportEnabled) return 0;
  return Math.max(0, Number(item.loanSupportOpeningBalance || 0) - loanPaidSupportPrincipal(item.id, {
    throughMonth,
    excludeRecordKey: options.excludeRecordKey
  }));
}

function loanPersonalRemainingPrincipal(item, throughMonth, options = {}) {
  if (!item || item.recurringType !== "loan") return 0;
  const opening = Math.max(0, Number(item.loanOpeningBalance || 0) - Number(item.loanSupportOpeningBalance || 0));
  const paid = loanPaidPrincipal(item.id, {
    throughMonth,
    excludeRecordKey: options.excludeRecordKey
  }) - loanPaidSupportPrincipal(item.id, {
    throughMonth,
    excludeRecordKey: options.excludeRecordKey
  });
  return Math.max(0, opening - Math.max(0, paid));
}

function loanSupportSettlementBalance(item, throughMonth, options = {}) {
  if (!item?.loanSupportEnabled) return 0;
  const cappedMonth = monthKey(throughMonth);
  const excludedRecordKey = options.excludeRecordKey || "";
  return transactions
    .map(normalizeStoredTransaction)
    .filter((record) => record.recurringId === item.id && record.recurringType === "loan")
    .filter((record) => !isCanceled(record.cancel))
    .filter((record) => !excludedRecordKey || record.recordKey !== excludedRecordKey)
    .reduce((balance, record) => {
      const due = !cappedMonth || record.month <= cappedMonth ? loanSupportDueAmount(record) : 0;
      const receivedMonth = loanSupportReceivedMonth(record);
      const received = (!cappedMonth || (receivedMonth && receivedMonth <= cappedMonth))
        ? loanSupportReceivedAmount(record)
        : 0;
      return balance + received - due;
    }, 0);
}

function loanRemainingPrincipal(item, throughMonth, options = {}) {
  if (!item || item.recurringType !== "loan") return 0;
  const paidPrincipal = loanPaidPrincipal(item.id, {
    throughMonth,
    excludeRecordKey: options.excludeRecordKey
  });
  return Math.max(0, Number(item.loanOpeningBalance || 0) - paidPrincipal);
}

function loanAvailablePrincipal(item, options = {}) {
  if (!item || item.recurringType !== "loan") return 0;
  return Math.max(0, Number(item.loanOpeningBalance || 0) - loanPaidPrincipal(item.id, options));
}

function loanPrincipalAtStartOfMonth(item, month) {
  if (!item || item.recurringType !== "loan" || !isValidMonthKey(month)) return 0;
  return loanRemainingPrincipal(item, shiftMonthKey(month, -1));
}

function loanScheduledAmountsForMonth(item, month) {
  if (!item || item.recurringType !== "loan" || !isValidMonthKey(month)) {
    return { principal: 0, interest: 0, supportPrincipal: 0, supportInterest: 0, supportAmount: 0, personalAmount: 0, amount: 0 };
  }
  const posted = findPostedRecurringTransaction(item.id, month);
  if (posted) {
    const principal = Math.max(0, Number(posted.loanPrincipalAmount || 0));
    const interest = Math.max(0, Number(posted.loanInterestAmount || 0));
    const supportPrincipal = loanSupportPrincipalAmount(posted);
    const supportInterest = loanSupportInterestAmount(posted);
    const supportAmount = supportPrincipal + supportInterest;
    return { principal, interest, supportPrincipal, supportInterest, supportAmount, personalAmount: principal + interest - supportAmount, amount: principal + interest };
  }
  if (item.paused || (item.startMonth && item.startMonth > month) || (item.endMonth && item.endMonth < month)) {
    return { principal: 0, interest: 0, supportPrincipal: 0, supportInterest: 0, supportAmount: 0, personalAmount: 0, amount: 0 };
  }
  const monthAvailable = loanPrincipalAtStartOfMonth(item, month);
  const globallyAvailable = loanAvailablePrincipal(item);
  const principal = Math.min(
    Math.max(0, Number(item.loanPrincipalAmount || 0)),
    monthAvailable,
    globallyAvailable
  );
  const interest = monthAvailable > 0 && globallyAvailable > 0
    ? Math.max(0, Number(item.loanInterestAmount || 0))
    : 0;
  const supportAvailable = item.loanSupportEnabled
    ? Math.min(
        loanSupportRemainingPrincipal(item, shiftMonthKey(month, -1)),
        loanSupportRemainingPrincipal(item)
      )
    : 0;
  const personalAvailable = Math.min(
    loanPersonalRemainingPrincipal(item, shiftMonthKey(month, -1)),
    loanPersonalRemainingPrincipal(item)
  );
  const minimumSupportPrincipal = Math.max(0, principal - personalAvailable);
  const supportPrincipal = item.loanSupportEnabled
    ? Math.min(principal, supportAvailable, Math.max(minimumSupportPrincipal, Number(item.loanSupportPrincipalAmount || 0)))
    : 0;
  const supportInterest = item.loanSupportEnabled && supportAvailable > 0
    ? Math.min(interest, Math.max(0, Number(item.loanSupportInterestAmount || 0)))
    : 0;
  const supportAmount = supportPrincipal + supportInterest;
  return { principal, interest, supportPrincipal, supportInterest, supportAmount, personalAmount: principal + interest - supportAmount, amount: principal + interest };
}

function loanPaymentExpenseCandidates(month) {
  return transactions
    .map(normalizeStoredTransaction)
    .filter((record) => record.flow !== "income" && record.month === month && !isCanceled(record.cancel))
    .filter((record) => !record.recurringId && !isLoanRepaymentTransaction(record))
    .filter((record) => !hasStructuredInstallment(record))
    .filter((record) => record.sourceFile !== "과거 거래 일괄 입력" && !String(record.approvalNo || "").startsWith("direct-bulk-"))
    .filter((record) => Number(record.amount || 0) > 0)
    .sort((a, b) => `${a.approvalDate} ${a.approvalTime}`.localeCompare(`${b.approvalDate} ${b.approvalTime}`, "ko-KR"));
}

function loanPaymentIncomeCandidates(month, excludeLoanRecordKey = "", includeTransactionId = "") {
  const nearbyMonths = new Set([shiftMonthKey(month, -1), month, shiftMonthKey(month, 1)].filter(Boolean));
  return transactions
    .map(normalizeStoredTransaction)
    .filter((record) => record.flow === "income" && !isCanceled(record.cancel))
    .filter((record) => nearbyMonths.has(record.month) || record.transactionId === includeTransactionId)
    .map((record) => ({
      ...record,
      availableAmount: Math.max(0, Number(record.amount || 0) - loanSupportLinkedIncomeAmount(record.transactionId, {
        excludeLoanRecordKey
      }))
    }))
    .filter((record) => record.availableAmount > 0 || record.transactionId === includeTransactionId)
    .sort((a, b) => `${a.approvalDate} ${a.approvalTime}`.localeCompare(`${b.approvalDate} ${b.approvalTime}`, "ko-KR"));
}

function fillLoanPaymentExpenseOptions(month, existing = null) {
  if (existing) {
    const label = existing.loanLinkedExisting
      ? `${existing.approvalDate} · ${existing.merchant} · ${formatWon(existing.amount)} (연결됨)`
      : "새로 생성된 상환 거래";
    els.loanPaymentExpenseTransactionId.innerHTML = `<option value="${escapeHtml(existing.transactionId)}">${escapeHtml(label)}</option>`;
    els.loanPaymentExpenseTransactionId.disabled = true;
    return;
  }
  const options = loanPaymentExpenseCandidates(month).map((record) => `
    <option value="${escapeHtml(record.transactionId)}">${escapeHtml(record.approvalDate)} · ${escapeHtml(record.merchant)} · ${escapeHtml(formatWon(record.amount))}</option>
  `).join("");
  els.loanPaymentExpenseTransactionId.disabled = false;
  els.loanPaymentExpenseTransactionId.innerHTML = `<option value="">새 상환 거래 생성</option>${options}`;
}

function fillLoanPaymentIncomeOptions(month, existing = null) {
  const selectedId = existing?.loanSupportIncomeTransactionId || "";
  const options = loanPaymentIncomeCandidates(month, existing?.recordKey || "", selectedId).map((record) => `
    <option value="${escapeHtml(record.transactionId)}">${escapeHtml(record.approvalDate)} · ${escapeHtml(record.merchant)} · 사용 가능 ${escapeHtml(formatWon(record.availableAmount))}</option>
  `).join("");
  els.loanPaymentSupportIncomeTransactionId.innerHTML = `<option value="">연결하지 않음</option>${options}`;
  els.loanPaymentSupportIncomeTransactionId.value = selectedId;
}

function handleLoanPaymentIncomeSelection() {
  const transactionId = els.loanPaymentSupportIncomeTransactionId.value;
  if (!transactionId) return updateLoanPaymentPreview();
  const existingRecordKey = els.loanPaymentRecordKey.value;
  const income = loanPaymentIncomeCandidates(els.loanPaymentMonth.value, existingRecordKey, transactionId)
    .find((record) => record.transactionId === transactionId);
  if (!income) return updateLoanPaymentPreview();
  const supportDue = Math.max(0, toNumber(els.loanPaymentSupportPrincipal.value))
    + Math.max(0, toNumber(els.loanPaymentSupportInterest.value));
  els.loanPaymentSupportReceived.value = formatPlainNumber(Math.min(income.availableAmount, supportDue || income.availableAmount));
  els.loanPaymentSupportReceivedDate.value = normalizeInputDate(income.approvalDate);
  updateLoanPaymentPreview();
}

function updateLoanPaymentPreview() {
  const item = recurringExpenses.find((expense) => expense.id === els.loanPaymentRecurringId.value);
  const principal = Math.max(0, toNumber(els.loanPaymentPrincipal.value));
  const interest = Math.max(0, toNumber(els.loanPaymentInterest.value));
  const supportPrincipal = Math.min(principal, Math.max(0, toNumber(els.loanPaymentSupportPrincipal.value)));
  const supportInterest = Math.min(interest, Math.max(0, toNumber(els.loanPaymentSupportInterest.value)));
  const supportDue = supportPrincipal + supportInterest;
  const supportReceived = Math.max(0, toNumber(els.loanPaymentSupportReceived.value));
  const personalTotal = Math.max(0, principal + interest - supportDue);
  els.loanPaymentTotal.textContent = formatWon(principal + interest);
  els.loanPaymentPersonalTotal.textContent = formatWon(personalTotal);
  els.loanPaymentSupportDue.textContent = formatWon(supportDue);
  els.loanPaymentSupportReceivedPreview.textContent = formatWon(supportReceived);
  if (!item) {
    [
      els.loanPaymentRemaining,
      els.loanPaymentFinalRemaining,
      els.loanPaymentPersonalRemaining,
      els.loanPaymentSettlementBalance
    ].forEach((element) => { element.textContent = "대출 정보 없음"; });
    return;
  }
  const excludeRecordKey = els.loanPaymentRecordKey.value;
  const targetMonth = els.loanPaymentMonth.value;
  const monthAvailable = loanRemainingPrincipal(item, targetMonth, { excludeRecordKey });
  const finalAvailable = loanAvailablePrincipal(item, { excludeRecordKey });
  const personalAvailable = loanPersonalRemainingPrincipal(item, targetMonth, { excludeRecordKey });
  const personalPrincipal = Math.max(0, principal - supportPrincipal);
  const receivedMonth = monthKey(els.loanPaymentSupportReceivedDate.value) || targetMonth;
  const settlementDraft = (receivedMonth <= targetMonth ? supportReceived : 0) - supportDue;
  const settlementBalance = loanSupportSettlementBalance(item, targetMonth, { excludeRecordKey }) + settlementDraft;
  els.loanPaymentRemaining.textContent = formatWon(Math.max(0, monthAvailable - principal));
  els.loanPaymentFinalRemaining.textContent = formatWon(Math.max(0, finalAvailable - principal));
  els.loanPaymentPersonalRemaining.textContent = formatWon(Math.max(0, personalAvailable - personalPrincipal));
  els.loanPaymentSettlementBalance.textContent = formatSignedWon(settlementBalance);
}

function closeLoanPaymentDialog() {
  if (els.loanPaymentDialog.open && typeof els.loanPaymentDialog.close === "function") {
    els.loanPaymentDialog.close();
  } else {
    els.loanPaymentDialog.removeAttribute("open");
  }
  els.loanPaymentForm.reset();
  els.loanPaymentExpenseTransactionId.disabled = false;
}

function openLoanPaymentDialog(id, month, recordKey = "") {
  const targetMonth = monthKey(month) || els.recurringMonthFilter.value || currentMonthKey();
  const directExisting = recordKey
    ? transactions.map(normalizeStoredTransaction).find((record) => record.recordKey === recordKey) || null
    : null;
  const existing = directExisting || findPostedRecurringTransaction(id, targetMonth) || null;
  const recurringId = id || existing?.recurringId || "";
  const item = recurringExpenses.find((expense) => expense.id === recurringId && expense.recurringType === "loan");
  if ((!item && !existing) || !targetMonth) return;
  const displayName = item?.name || existing?.merchant || "대출";
  els.loanPaymentRecurringId.value = recurringId;
  els.loanPaymentRecordKey.value = existing?.recordKey || "";
  els.loanPaymentMonth.value = targetMonth;
  const scheduled = item ? loanScheduledAmountsForMonth(item, targetMonth) : { principal: 0, interest: 0, supportPrincipal: 0, supportInterest: 0 };
  els.loanPaymentPrincipal.value = formatPlainNumber(existing?.loanPrincipalAmount ?? scheduled.principal);
  els.loanPaymentInterest.value = formatPlainNumber(existing?.loanInterestAmount ?? scheduled.interest);
  const supportEnabled = Boolean(item?.loanSupportEnabled || existing?.loanSupportPrincipalAmount || existing?.loanSupportInterestAmount);
  els.loanPaymentSupportFields.hidden = !supportEnabled;
  els.loanPaymentSupportLegend.textContent = `${item?.loanSupporterName || "가족"} 분담 확인`;
  els.loanPaymentSupportPrincipal.value = formatPlainNumber(existing?.loanSupportPrincipalAmount ?? scheduled.supportPrincipal ?? 0);
  els.loanPaymentSupportInterest.value = formatPlainNumber(existing?.loanSupportInterestAmount ?? scheduled.supportInterest ?? 0);
  els.loanPaymentSupportReceived.value = formatPlainNumber(existing?.loanSupportReceivedAmount || 0);
  els.loanPaymentSupportReceivedDate.value = normalizeInputDate(existing?.loanSupportReceivedDate || "");
  fillLoanPaymentExpenseOptions(targetMonth, existing);
  fillLoanPaymentIncomeOptions(targetMonth, existing);
  els.loanPaymentDialogTitle.textContent = existing ? `${displayName} 상환 수정` : `${displayName} 상환 반영`;
  els.loanPaymentDialogDescription.textContent = `${targetMonth} 명세서 기준으로 원금과 이자를 확인해주세요.`;
  els.saveLoanPaymentButton.textContent = existing ? "상환 수정" : "상환 반영";
  els.deleteLoanPaymentButton.hidden = !existing;
  els.deleteLoanPaymentButton.textContent = existing?.loanLinkedExisting ? "기존 출금 연결 해제" : "상환 내역 삭제";
  updateLoanPaymentPreview();
  if (!els.loanPaymentDialog.open && typeof els.loanPaymentDialog.showModal === "function") {
    els.loanPaymentDialog.showModal();
  } else if (!els.loanPaymentDialog.open) {
    els.loanPaymentDialog.setAttribute("open", "");
  }
  requestAnimationFrame(() => els.loanPaymentPrincipal.focus());
}

async function deleteLoanPayment() {
  const recordKey = els.loanPaymentRecordKey.value;
  if (!recordKey) return;
  const existing = transactions
    .map(normalizeStoredTransaction)
    .find((record) => record.recordKey === recordKey);
  if (!existing) {
    alert("삭제할 대출 상환 내역을 찾지 못했습니다.");
    return;
  }
  const actionLabel = existing.loanLinkedExisting ? "대출 연결을 해제" : "상환 내역을 삭제";
  if (!confirm(`"${existing.merchant || "대출"}" ${existing.month} ${actionLabel}할까요?\n대출 등록 정보는 유지됩니다.`)) return;
  if (existing.loanLinkedExisting) {
    await createAutoSnapshot("기존 출금 대출 연결 해제 전");
    const updatedAt = new Date().toISOString();
    transactions = transactions.map((record) => {
      const normalized = normalizeStoredTransaction(record);
      if (normalized.recordKey !== recordKey) return record;
      return normalizeStoredTransaction({
        ...normalized,
        recurringId: "",
        recurringType: "expense",
        loanType: "",
        loanPrincipalAmount: 0,
        loanInterestAmount: 0,
        loanSupportPrincipalAmount: 0,
        loanSupportInterestAmount: 0,
        loanSupportReceivedAmount: 0,
        loanSupportReceivedDate: "",
        loanSupportIncomeTransactionId: "",
        loanLinkedExisting: false,
        manualSector: normalized.loanLinkedOriginalSector,
        manualSubcategory: normalized.loanLinkedOriginalSubcategory,
        memo: normalized.loanLinkedOriginalMemo,
        loanLinkedOriginalSector: "",
        loanLinkedOriginalSubcategory: "",
        loanLinkedOriginalMemo: "",
        updatedAt,
        recordKey: normalized.recordKey,
        transactionId: normalized.transactionId
      });
    });
    await saveTransactions();
    reclassify();
    closeLoanPaymentDialog();
    renderAll();
    return;
  }
  await deleteCalendarTransactions([recordKey], {
    snapshotReason: "대출 상환 내역 삭제 전",
    feedbackMessage: "대출 상환 내역을 삭제했습니다."
  });
  closeLoanPaymentDialog();
  renderAll();
}

async function handleLoanPaymentSubmit(event) {
  event.preventDefault();
  const existingRecordKey = els.loanPaymentRecordKey.value;
  const existing = existingRecordKey
    ? transactions.map(normalizeStoredTransaction).find((record) => record.recordKey === existingRecordKey) || null
    : null;
  const item = recurringExpenses.find((expense) => expense.id === els.loanPaymentRecurringId.value && expense.recurringType === "loan");
  const targetMonth = monthKey(els.loanPaymentMonth.value);
  const principal = Math.max(0, toNumber(els.loanPaymentPrincipal.value));
  const interest = Math.max(0, toNumber(els.loanPaymentInterest.value));
  const supportEnabled = Boolean(item?.loanSupportEnabled || existing?.loanSupportPrincipalAmount || existing?.loanSupportInterestAmount);
  const supportPrincipal = supportEnabled ? Math.max(0, toNumber(els.loanPaymentSupportPrincipal.value)) : 0;
  const supportInterest = supportEnabled ? Math.max(0, toNumber(els.loanPaymentSupportInterest.value)) : 0;
  const supportReceived = supportEnabled ? Math.max(0, toNumber(els.loanPaymentSupportReceived.value)) : 0;
  const supportReceivedDate = supportEnabled ? normalizeInputDate(els.loanPaymentSupportReceivedDate.value) : "";
  const supportIncomeTransactionId = supportEnabled ? els.loanPaymentSupportIncomeTransactionId.value : "";
  if ((!item && !existing) || !targetMonth || principal + interest <= 0) {
    alert("원금과 이자를 확인해주세요.");
    return;
  }
  if (existingRecordKey && !existing) {
    alert("수정할 대출 상환 내역을 찾지 못했습니다.");
    return;
  }
  const recurringId = item?.id || existing?.recurringId || "";
  if (findPostedRecurringTransaction(recurringId, targetMonth, { excludeRecordKey: existingRecordKey })) {
    alert(`이미 ${targetMonth}에 반영된 대출 상환이 있습니다.`);
    return;
  }
  if (supportPrincipal > principal || supportInterest > interest) {
    alert("가족 부담 원금·이자는 은행의 전체 원금·이자를 초과할 수 없습니다.");
    return;
  }
  if (supportReceived > 0 && !supportReceivedDate) {
    alert("가족 분담금을 받은 날짜를 입력해주세요.");
    return;
  }
  if (item) {
    const available = loanAvailablePrincipal(item, { excludeRecordKey: existingRecordKey });
    if (principal > available) {
      alert(`원금은 전체 상환 내역을 반영한 남은 원금 ${formatWon(available)}을 초과할 수 없습니다.`);
      return;
    }
    const supportAvailable = Math.max(0, Number(item.loanSupportOpeningBalance || 0) - loanPaidSupportPrincipal(item.id, {
      excludeRecordKey: existingRecordKey
    }));
    if (supportPrincipal > supportAvailable) {
      alert(`가족 부담 원금은 남은 가족 부담 원금 ${formatWon(supportAvailable)}을 초과할 수 없습니다.`);
      return;
    }
    const personalAvailable = loanPersonalRemainingPrincipal(item, undefined, { excludeRecordKey: existingRecordKey });
    if (principal - supportPrincipal > personalAvailable) {
      alert(`본인 부담 원금은 남은 본인 부담 원금 ${formatWon(personalAvailable)}을 초과할 수 없습니다.`);
      return;
    }
  }

  if (supportIncomeTransactionId) {
    const income = transactions
      .map(normalizeStoredTransaction)
      .find((record) => record.transactionId === supportIncomeTransactionId && record.flow === "income" && !isCanceled(record.cancel));
    const available = income
      ? Math.max(0, Number(income.amount || 0) - loanSupportLinkedIncomeAmount(income.transactionId, {
          excludeLoanRecordKey: existingRecordKey
        }))
      : 0;
    if (!income || supportReceived <= 0 || supportReceived > available) {
      alert("연결할 수입 기록과 가족 입금액을 확인해주세요.");
      return;
    }
    if (supportReceivedDate !== normalizeInputDate(income.approvalDate)) {
      alert("가족 입금일은 연결한 수입 기록의 날짜와 같아야 합니다.");
      return;
    }
  }

  const selectedExpenseTransactionId = existing ? "" : els.loanPaymentExpenseTransactionId.value;
  const linkedExpense = selectedExpenseTransactionId
    ? transactions.map(normalizeStoredTransaction).find((record) => record.transactionId === selectedExpenseTransactionId) || null
    : null;
  if (selectedExpenseTransactionId) {
    if (!linkedExpense || linkedExpense.flow === "income" || linkedExpense.month !== targetMonth || linkedExpense.recurringId || isCanceled(linkedExpense.cancel)) {
      alert("연결할 기존 출금 내역을 다시 확인해주세요.");
      return;
    }
    if (Number(linkedExpense.amount || 0) !== principal + interest) {
      alert(`기존 출금 ${formatWon(linkedExpense.amount)}과 원금·이자 합계 ${formatWon(principal + interest)}가 같아야 연결할 수 있습니다.`);
      return;
    }
    if (reimbursementFor(linkedExpense) > 0) {
      alert("정산금이 이미 있는 출금은 대출 상환에 바로 연결할 수 없습니다.");
      return;
    }
  }
  if (existing?.loanLinkedExisting && Number(existing.amount || 0) !== principal + interest) {
    alert(`연결된 기존 출금 ${formatWon(existing.amount)}과 원금·이자 합계가 같아야 합니다.`);
    return;
  }

  await createAutoSnapshot(existingRecordKey ? "대출 상환 내역 수정 전" : "대출 상환 반영 전");
  const paymentFields = {
    loanPrincipalAmount: principal,
    loanInterestAmount: interest,
    loanSupportPrincipalAmount: supportPrincipal,
    loanSupportInterestAmount: supportInterest,
    loanSupportReceivedAmount: supportReceived,
    loanSupportReceivedDate: supportReceivedDate,
    loanSupportIncomeTransactionId: supportIncomeTransactionId
  };
  let nextTransaction;
  if (existing?.loanLinkedExisting || linkedExpense) {
    const base = existing?.loanLinkedExisting ? existing : linkedExpense;
    nextTransaction = normalizeStoredTransaction({
      ...base,
      recurringId: item?.id || existing?.recurringId || "",
      recurringType: "loan",
      loanType: item?.loanType || existing?.loanType || "",
      ...paymentFields,
      loanLinkedExisting: true,
      loanLinkedOriginalSector: existing?.loanLinkedOriginalSector ?? base.manualSector,
      loanLinkedOriginalSubcategory: existing?.loanLinkedOriginalSubcategory ?? base.manualSubcategory,
      loanLinkedOriginalMemo: existing?.loanLinkedOriginalMemo ?? base.memo,
      manualSector: item?.sector || "고정 주거비",
      manualSubcategory: item?.subcategory || "대출이자",
      memo: item?.memo || existing?.memo || "",
      updatedAt: new Date().toISOString(),
      recordKey: base.recordKey,
      transactionId: base.transactionId
    });
  } else if (item) {
    nextTransaction = buildRecurringTransaction(item, targetMonth, paymentFields);
  } else {
    nextTransaction = normalizeStoredTransaction({
      ...existing,
      amount: principal + interest,
      ...paymentFields,
      updatedAt: new Date().toISOString()
    });
  }
  if (existingRecordKey) {
    const updatedAt = new Date().toISOString();
    transactions = transactions.map((record) => {
      const normalized = normalizeStoredTransaction(record);
      if (normalized.recordKey !== existingRecordKey) return record;
      return normalizeStoredTransaction({
        ...nextTransaction,
        importedAt: normalized.importedAt || nextTransaction.importedAt,
        createdAt: normalized.createdAt || normalized.importedAt || nextTransaction.importedAt,
        updatedAt
      });
    });
  } else if (linkedExpense) {
    transactions = transactions.map((record) => {
      const normalized = normalizeStoredTransaction(record);
      return normalized.recordKey === linkedExpense.recordKey ? nextTransaction : record;
    });
  } else {
    const mergeResult = mergeTransactions(transactions, [nextTransaction]);
    if (!mergeResult.added) {
      alert(`이미 ${targetMonth}에 반영된 대출 상환입니다.`);
      return;
    }
    transactions = mergeResult.records;
  }
  await saveTransactions();
  reclassify();
  closeLoanPaymentDialog();
  renderAll();
}

async function postRecurringExpense(id, month, options = {}) {
  const item = recurringExpenses.find((expense) => expense.id === id);
  const targetMonth = monthKey(month) || selectedCalendarMonth || els.recurringMonthFilter.value || currentMonthKey();
  if (!item || !targetMonth) return { added: 0, skipped: 0 };
  if (item.recurringType === "loan") {
    openLoanPaymentDialog(item.id, targetMonth);
    return { added: 0, skipped: 0, pendingConfirmation: true };
  }
  if (findPostedRecurringTransaction(item.id, targetMonth)) {
    if (!options.silent) alert(`이미 ${targetMonth}에 반영된 고정 지출입니다.`);
    return { added: 0, skipped: 1 };
  }
  const transaction = buildRecurringTransaction(item, targetMonth);
  const mergeResult = mergeTransactions(transactions, [transaction]);
  transactions = mergeResult.records;
  if (mergeResult.added) {
    await saveTransactions();
    reclassify();
    if (!options.skipRender) renderAll();
  }
  if (!options.silent) {
    alert(mergeResult.added
      ? `${targetMonth} ${item.name}을 실제 지출로 반영했습니다.`
      : `이미 ${targetMonth}에 반영된 고정 지출입니다.`);
  }
  return mergeResult;
}

function findPostedRecurringTransaction(recurringId, month, options = {}) {
  const excludedRecordKey = options.excludeRecordKey || "";
  return transactions
    .map(normalizeStoredTransaction)
    .find((item) =>
      item.recurringId === recurringId
      && item.month === month
      && (!excludedRecordKey || item.recordKey !== excludedRecordKey)
      && !isCanceled(item.cancel)
    );
}

function findDeletedRecurringTransaction(recurringId, month) {
  return transactions
    .map(normalizeStoredTransaction)
    .find((item) => item.sourceType === "recurring" && item.recurringId === recurringId && item.month === month && isCanceled(item.cancel));
}

function isDeletedRecurringTombstone(item) {
  const normalized = normalizeStoredTransaction(item);
  return normalized.sourceType === "recurring" && isCanceled(normalized.cancel);
}

function recurringPostingStatus(item, month) {
  const active = isRecurringActiveForMonth(item, month);
  const postedTransaction = findPostedRecurringTransaction(item.id, month) || null;
  const deletedTransaction = findDeletedRecurringTransaction(item.id, month) || null;
  const posted = Boolean(postedTransaction);
  const isFuture = monthKey(month) > currentMonthKey();
  if (deletedTransaction) {
    return { active, posted: false, postedTransaction: null, deletedTransaction, canManualPost: false, label: "실제 지출 삭제됨", className: "deleted-post" };
  }
  if (posted && item.autoPost) {
    return { active, posted, postedTransaction, canManualPost: false, label: "자동 반영됨", className: "auto-posted" };
  }
  if (posted) {
    return { active, posted, postedTransaction, canManualPost: false, label: "반영 완료", className: "posted" };
  }
  if (!active) {
    const inactiveLabel = item.paused
      ? "일시중지"
      : item.startMonth && item.startMonth > month
        ? "시작 전"
        : item.recurringType === "loan" && loanAvailablePrincipal(item) <= 0
          ? "상환 완료"
          : "종료됨";
    return { active, posted, postedTransaction, canManualPost: false, label: inactiveLabel, className: "muted" };
  }
  if (item.autoPost) {
    return {
      active,
      posted,
      postedTransaction,
      canManualPost: false,
      label: isFuture ? "자동 반영 예정" : "자동 반영 대기",
      className: "auto-pending"
    };
  }
  return { active, posted, postedTransaction, canManualPost: true, label: "수동 반영 필요", className: "manual-needed" };
}

function recurringReviewIncomeKnown(month) {
  const hasManualIncome = Object.prototype.hasOwnProperty.call(monthlyIncome, month)
    && Number.isFinite(Number(monthlyIncome[month]));
  const hasImportedIncome = classified.some((item) => item.month === month
    && item.flow === "income"
    && item.status !== "취소/제외"
    && !isCanceled(item.cancel)
    && incomeReportingAmount(item) > 0);
  return hasManualIncome || hasImportedIncome;
}

function recurringReviewModelForMonth(month) {
  const income = importedIncomeForMonth(month) + Number(monthlyIncome[month] || 0);
  return buildRecurringReviewModel(recurringExpenses, month, income, {
    incomeKnown: recurringReviewIncomeKnown(month)
  });
}

function renderRecurringReviewMetric(icon, label, value, hint, tone = "") {
  return `
    <article class="recurring-review-metric ${escapeHtml(tone)}">
      <div class="recurring-review-metric-icon"><i class="ti ti-${escapeHtml(icon)}" aria-hidden="true"></i></div>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </div>
    </article>
  `;
}

function recurringReviewChangeHint(model) {
  if (!model.previousTotal) return "전월 등록 내역 없음";
  if (!model.monthlyChange) return "전월과 동일";
  return `전월보다 ${formatSignedWon(model.monthlyChange)}`;
}

function renderRecurringReview(month, expenseDefinitions) {
  if (!els.recurringReviewList || !els.recurringReviewMetrics) return;
  const model = recurringReviewModelForMonth(month);
  if (selectedRecurringReviewId && !model.items.some((item) => item.id === selectedRecurringReviewId)) {
    selectedRecurringReviewId = "";
  }

  els.recurringReviewMetrics.innerHTML = [
    renderRecurringReviewMetric("wallet", "이번 달 고정비", formatWon(model.monthlyTotal), recurringReviewChangeHint(model), "primary"),
    renderRecurringReviewMetric(
      "percentage",
      "월 수입의",
      model.incomeRatio === null ? "확인 불가" : `${model.incomeRatio.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`,
      model.incomeRatio === null ? "이 달의 수입을 입력하면 계산됩니다" : `수입 ${formatWon(model.income)} 기준`,
      model.incomeRatio !== null && model.incomeRatio >= 50 ? "warning" : "positive"
    ),
    renderRecurringReviewMetric("calendar-repeat", "연간 예상", formatWon(model.annualTotal), `${month}부터 12개월 등록 기준`, "neutral")
  ].join("");
  els.recurringReviewNotice.innerHTML = `<i class="ti ti-info-circle" aria-hidden="true"></i><span>${escapeHtml(month)}에 활성화된 일반 고정 지출 기준입니다. 실제 결제액과 다를 수 있으며 대출 상환은 <strong>등록·관리</strong>에서 별도로 확인합니다.</span>`;
  els.recurringReviewListSummary.textContent = `${model.items.length.toLocaleString("ko-KR")}건 · 점검 ${model.candidateCount.toLocaleString("ko-KR")}건`;

  if (!expenseDefinitions.length) {
    els.recurringReviewList.innerHTML = `
      <div class="recurring-review-empty">
        <i class="ti ti-receipt" aria-hidden="true"></i>
        <strong>등록된 고정 지출이 없습니다.</strong>
        <p>월세, 보험료, 통신비처럼 매달 반복되는 항목을 먼저 등록해보세요.</p>
        <button type="button" class="primary-action" data-open-recurring-manage>고정 지출 등록</button>
      </div>`;
  } else if (!model.items.length) {
    els.recurringReviewList.innerHTML = `
      <div class="recurring-review-empty">
        <i class="ti ti-calendar-off" aria-hidden="true"></i>
        <strong>${escapeHtml(month)}에 활성화된 항목이 없습니다.</strong>
        <p>등록·관리에서 시작 월, 종료 월, 일시중지 상태를 확인해주세요.</p>
        <button type="button" data-open-recurring-manage>등록 정보 확인</button>
      </div>`;
  } else {
    els.recurringReviewList.innerHTML = model.groups.map((group) => `
      <section class="recurring-review-group" aria-label="${escapeHtml(group.label)}">
        <header>
          <span><i class="ti ti-${escapeHtml(group.icon)}" aria-hidden="true"></i>${escapeHtml(group.label)}</span>
          <strong>${formatWon(group.amount)}</strong>
        </header>
        <div>
          ${group.items.map((item) => `
            <button type="button" class="recurring-review-row ${selectedRecurringReviewId === item.id ? "selected" : ""}" data-review-recurring="${escapeHtml(item.id)}" aria-pressed="${selectedRecurringReviewId === item.id}">
              <span class="recurring-review-row-name"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.paymentType || "카드")} · 매월 ${Number(item.dayOfMonth || 1)}일</small></span>
              <strong class="recurring-review-row-amount">${formatWon(item.amount)}</strong>
              <span class="recurring-review-status ${escapeHtml(item.review.key)}">${escapeHtml(item.review.label)}</span>
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          `).join("")}
        </div>
      </section>
    `).join("");
  }

  els.recurringReviewList.querySelectorAll("[data-review-recurring]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRecurringReviewId = button.dataset.reviewRecurring;
      recurringReviewFeedback = "";
      renderRecurringReview(month, expenseDefinitions);
      els.recurringReviewForm?.focus({ preventScroll: true });
    });
  });
  els.recurringReviewList.querySelector("[data-open-recurring-manage]")?.addEventListener("click", openRecurringManageForCreate);

  els.recurringReviewCandidateAmount.textContent = formatWon(model.candidateAmount);
  els.recurringReviewCandidateSummary.textContent = model.candidateCount
    ? `월 고정비 중 ${model.candidateCount.toLocaleString("ko-KR")}건은 확인 또는 변경 검토가 필요합니다.`
    : model.items.length ? "현재 확인이 필요한 항목이 없습니다." : "고정 지출을 등록하면 점검 후보를 모아드립니다.";
  els.recurringReviewStartButton.disabled = !model.items.length;
  els.recurringReviewStartButton.textContent = model.candidateCount ? "첫 후보 점검" : "전체 항목 보기";
  els.recurringReviewGuidance.classList.toggle("is-relevant", model.insuranceCandidateCount > 0);

  const focused = model.items.find((item) => item.id === selectedRecurringReviewId);
  els.recurringReviewForm.hidden = !focused;
  if (focused) {
    els.recurringReviewItemId.value = focused.id;
    els.recurringReviewFocusName.textContent = focused.name;
    els.recurringReviewFocusAmount.textContent = formatWon(focused.amount);
    els.recurringReviewStatus.value = normalizeRecurringReviewStatus(focused.reviewStatus);
    els.recurringReviewNextDate.value = focused.nextReviewDate || "";
    els.recurringReviewFeedback.textContent = recurringReviewFeedback;
  }
}

function startRecurringReview() {
  const month = els.recurringMonthFilter.value || currentMonthKey();
  const model = recurringReviewModelForMonth(month);
  const target = model.candidates[0] || model.items[0];
  if (!target) return;
  selectedRecurringReviewId = target.id;
  recurringReviewFeedback = "";
  renderRecurringReview(month, model.definitions);
  els.recurringReviewStatus?.focus({ preventScroll: true });
}

async function handleRecurringReviewSubmit(event) {
  event.preventDefault();
  const id = els.recurringReviewItemId.value;
  const original = recurringExpenses.find((item) => item.id === id && item.recurringType !== "loan");
  if (!original) return;
  await createAutoSnapshot("고정 지출 점검 저장 전");
  const updated = normalizeRecurringExpense({
    ...original,
    reviewStatus: els.recurringReviewStatus.value,
    nextReviewDate: els.recurringReviewNextDate.value,
    updatedAt: new Date().toISOString()
  });
  recurringExpenses = recurringExpenses.map((item) => item.id === id ? updated : item);
  await saveRecurringExpenses();
  recurringReviewFeedback = "점검 상태를 저장했습니다.";
  renderAll();
}

function renderRecurring() {
  if (!els.recurringList) return;
  const selectedMonth = syncRecurringMonthFilter();
  setRecurringWorkspaceTab(activeRecurringWorkspaceTab);
  setRecurringTab(activeRecurringTab);
  const expenseDefinitions = recurringExpenses.filter((item) => item.recurringType !== "loan");
  const loanDefinitions = recurringExpenses.filter((item) => item.recurringType === "loan");
  const monthOccurrences = recurringOccurrencesForMonth(selectedMonth)
    .filter((item) => item.recurringType !== "loan");
  const pendingItems = monthOccurrences.filter((item) => !item.posted);
  const autoPostedItems = monthOccurrences.filter((item) => item.autoPost && item.posted);
  const manualPendingItems = monthOccurrences.filter((item) => !item.autoPost && !item.posted);
  renderRecurringReview(selectedMonth, expenseDefinitions);
  els.recurringListSummary.textContent = `${expenseDefinitions.length.toLocaleString("ko-KR")}건 등록`;
  els.recurringSummaryCards.innerHTML = [
    renderRecurringSummaryCard("미반영 예정", formatWon(sum(pendingItems, "amount")), `${pendingItems.length.toLocaleString("ko-KR")}건 · 실제 합산 전`),
    renderRecurringSummaryCard("자동 반영 완료", `${autoPostedItems.length.toLocaleString("ko-KR")}건`, formatWon(sum(autoPostedItems, "amount"))),
    renderRecurringSummaryCard("수동 반영 필요", `${manualPendingItems.length.toLocaleString("ko-KR")}건`, manualPendingItems.length ? "달력/목록에서 반영 가능" : "반영 대기 없음")
  ].join("");

  if (!expenseDefinitions.length) {
    els.recurringList.innerHTML = `<div class="empty">등록된 고정 지출이 없습니다. 카드값, 보험료, 월세 같은 반복 지출을 추가해보세요.</div>`;
  } else {
    els.recurringList.innerHTML = expenseDefinitions
      .slice()
      .sort((a, b) => Number(a.dayOfMonth || 0) - Number(b.dayOfMonth || 0) || a.name.localeCompare(b.name, "ko-KR"))
      .map((item) => renderRecurringCard(item, selectedMonth))
      .join("");
    attachRecurringHandlers(els.recurringList);
  }
  renderLoanRepayments(selectedMonth, loanDefinitions);
}

function renderLoanRepayments(month, loanDefinitions) {
  if (!els.loanList || !els.loanSummaryCards) return;
  const monthOccurrences = recurringOccurrencesForMonth(month, { showHidden: true })
    .filter((item) => item.recurringType === "loan");
  const postedRecords = transactions
    .map(normalizeStoredTransaction)
    .filter((item) => item.recurringType === "loan" && item.month === month && !isCanceled(item.cancel));
  const postedCashOutflow = sum(postedRecords, "amount");
  const pendingRecords = monthOccurrences.filter((occurrence) => !occurrence.posted);
  const pendingCashOutflow = sum(pendingRecords, "amount");
  const monthCashOutflow = postedCashOutflow + pendingCashOutflow;
  const personalInterest = sumConsumption(postedRecords) + sumConsumption(pendingRecords);
  const personalPrincipal = sumDebtPrincipal(postedRecords) + sumDebtPrincipal(pendingRecords);
  const legalPrincipal = sumLegalDebtPrincipal(postedRecords) + sumLegalDebtPrincipal(pendingRecords);
  const supportDue = [...postedRecords, ...pendingRecords].reduce((total, record) => total + loanSupportDueAmount(record), 0);
  const supportReceived = loanSupportReceivedForMonth(
    transactions.map(normalizeStoredTransaction).filter((record) => record.recurringType === "loan" && !isCanceled(record.cancel)),
    month
  );
  const pendingCount = pendingRecords.length;
  const remainingPrincipal = loanDefinitions.reduce((total, item) => total + loanRemainingPrincipal(item, month), 0);
  els.loanSummaryCards.innerHTML = [
    renderRecurringSummaryCard("은행 전체 상환", formatWon(monthCashOutflow), `${postedRecords.length.toLocaleString("ko-KR")}건 반영 · ${pendingCount.toLocaleString("ko-KR")}건 예정`),
    renderRecurringSummaryCard("내 소비지출", formatWon(personalInterest), "내가 부담하는 이자만"),
    renderRecurringSummaryCard("내 원금 부담", formatWon(personalPrincipal), "소비지출에서는 제외"),
    renderRecurringSummaryCard("법적 부채 감소", formatWon(legalPrincipal), "은행 원금 상환 합계"),
    renderRecurringSummaryCard("가족 분담", formatWon(supportDue), supportDue ? `입금 확인 ${formatWon(supportReceived)}` : "등록된 가족 분담 없음"),
    renderRecurringSummaryCard("남은 법적 원금", formatWon(remainingPrincipal), `${loanDefinitions.length.toLocaleString("ko-KR")}건 합계`)
  ].join("");
  els.loanListSummary.textContent = `${loanDefinitions.length.toLocaleString("ko-KR")}건 등록`;
  if (!loanDefinitions.length) {
    els.loanList.innerHTML = `<div class="empty">등록된 대출이 없습니다. 신용대출이나 학자금대출의 남은 원금과 월별 상환 기본값을 추가해보세요.</div>`;
    return;
  }
  els.loanList.innerHTML = loanDefinitions
    .slice()
    .sort((a, b) => Number(a.dayOfMonth || 0) - Number(b.dayOfMonth || 0) || a.name.localeCompare(b.name, "ko-KR"))
    .map((item) => renderLoanCard(item, month))
    .join("");
  attachRecurringHandlers(els.loanList);
}

function renderLoanCard(item, month) {
  const status = recurringPostingStatus(item, month);
  const posted = status.postedTransaction;
  const scheduled = loanScheduledAmountsForMonth(item, month);
  const principal = Number(posted?.loanPrincipalAmount ?? scheduled.principal);
  const interest = Number(posted?.loanInterestAmount ?? scheduled.interest);
  const total = principal + interest;
  const supportPrincipal = Number(posted?.loanSupportPrincipalAmount ?? scheduled.supportPrincipal ?? 0);
  const supportInterest = Number(posted?.loanSupportInterestAmount ?? scheduled.supportInterest ?? 0);
  const supportDue = supportPrincipal + supportInterest;
  const supportReceived = loanSupportReceivedAmount(posted);
  const personalPrincipal = Math.max(0, principal - supportPrincipal);
  const personalInterest = Math.max(0, interest - supportInterest);
  const personalTotal = personalPrincipal + personalInterest;
  const principalRatio = total > 0 ? principal / total * 100 : 0;
  const remaining = loanRemainingPrincipal(item, month);
  const personalRemaining = loanPersonalRemainingPrincipal(item, month);
  const supportRemaining = loanSupportRemainingPrincipal(item, month);
  const settlementBalance = loanSupportSettlementBalance(item, month);
  const supportName = item.loanSupporterName || "가족";
  const supportDetails = item.loanSupportEnabled ? `
      <section class="loan-support-breakdown" aria-label="${escapeHtml(supportName)} 분담 내역">
        <div><span>${escapeHtml(supportName)} 부담 예정</span><strong>${formatWon(supportDue)}</strong></div>
        <div><span>내 부담</span><strong>${formatWon(personalTotal)}</strong></div>
        <div><span>입금 확인</span><strong>${formatWon(supportReceived)}</strong></div>
        <div><span>누적 정산 차이</span><strong class="${settlementBalance < 0 ? "negative" : ""}">${formatSignedWon(settlementBalance)}</strong></div>
      </section>
    ` : "";
  return `
    <article class="recurring-card loan-card ${item.paused ? "paused" : ""}">
      <div class="recurring-card-main">
        <div>
          <span class="scheduled-badge">${escapeHtml(item.loanType || "대출")}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.paymentType || "이체")} · 매월 ${Number(item.dayOfMonth || 1)}일 · ${escapeHtml(month)}</p>
        </div>
        <div class="loan-card-amount"><span>은행 상환액</span><strong>${formatWon(total)}</strong>${item.loanSupportEnabled ? `<small>내 부담 ${formatWon(personalTotal)}</small>` : ""}</div>
      </div>
      <div class="loan-split-bar" aria-label="원금 ${formatWon(principal)}, 이자 ${formatWon(interest)}">
        <span class="principal" style="width:${Math.max(0, Math.min(100, principalRatio))}%"></span>
        <span class="interest" style="width:${Math.max(0, 100 - principalRatio)}%"></span>
      </div>
      <div class="loan-split-values">
        <span><i class="principal" aria-hidden="true"></i>원금 <strong>${formatWon(principal)}</strong></span>
        <span><i class="interest" aria-hidden="true"></i>이자 <strong>${formatWon(interest)}</strong></span>
      </div>
      ${supportDetails}
      <div class="recurring-card-tags">
        <span class="scheduled-badge soft">원금 소비 제외</span>
        ${item.loanSupportEnabled ? `<span class="scheduled-badge support">${escapeHtml(supportName)} 분담</span>` : ""}
        <span class="scheduled-badge ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span>
        ${item.showOnCalendar ? `<span class="scheduled-badge soft">달력 표시</span>` : `<span class="scheduled-badge muted">달력 숨김</span>`}
      </div>
      <dl class="recurring-meta loan-meta">
        <div><dt>남은 법적 원금</dt><dd>${formatWon(remaining)}</dd></div>
        ${item.loanSupportEnabled ? `<div><dt>내 남은 원금</dt><dd>${formatWon(personalRemaining)}</dd></div>` : ""}
        ${item.loanSupportEnabled ? `<div><dt>${escapeHtml(supportName)} 남은 원금</dt><dd>${formatWon(supportRemaining)}</dd></div>` : ""}
        <div><dt>금리</dt><dd>${Number(item.loanInterestRate || 0).toLocaleString("ko-KR")}%</dd></div>
        <div><dt>만기</dt><dd>${escapeHtml(item.loanMaturityMonth || "미설정")}</dd></div>
        <div><dt>메모</dt><dd>${escapeHtml(item.memo || "-")}</dd></div>
      </dl>
      <div class="recurring-actions">
        ${status.canManualPost ? `<button type="button" class="primary-action" data-post-recurring="${escapeHtml(item.id)}" data-post-month="${escapeHtml(month)}">이번 달 상환 확인</button>` : ""}
        ${status.posted ? `<button type="button" data-edit-loan-payment="${escapeHtml(item.id)}" data-post-month="${escapeHtml(month)}">상환 내역 수정</button>` : ""}
        <button type="button" data-edit-recurring="${escapeHtml(item.id)}">대출 정보 수정</button>
        <button type="button" data-toggle-recurring="${escapeHtml(item.id)}">${item.paused ? "다시 활성화" : "일시중지"}</button>
        <button type="button" class="danger-outline" data-delete-recurring="${escapeHtml(item.id)}">삭제</button>
      </div>
    </article>
  `;
}

function renderRecurringSummaryCard(label, value, hint) {
  return `
    <article class="recurring-summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `;
}

function renderRecurringCard(item, month) {
  const active = isRecurringActiveForMonth(item, month);
  const status = recurringPostingStatus(item, month);
  const scheduledDate = active ? getRecurringDateForMonth(month, item.dayOfMonth) : "";
  return `
    <article class="recurring-card ${item.paused ? "paused" : ""}">
      <div class="recurring-card-main">
        <div>
          <span class="scheduled-badge">${item.paused ? "일시중지" : active ? "진행 중" : escapeHtml(status.label)}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.paymentType || "카드")} · 매월 ${Number(item.dayOfMonth || 1)}일${scheduledDate ? ` · ${escapeHtml(scheduledDate)}` : ""}</p>
        </div>
        <strong>${formatWon(item.amount)}</strong>
      </div>
      <div class="recurring-card-tags">
        ${categoryChip(item.sector, item.subcategory)}
        ${item.showOnCalendar ? `<span class="scheduled-badge soft">달력 표시</span>` : `<span class="scheduled-badge muted">달력 숨김</span>`}
        ${item.autoPost ? `<span class="scheduled-badge soft">자동 반영</span>` : `<span class="scheduled-badge muted">수동 반영</span>`}
        <span class="scheduled-badge ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span>
      </div>
      <dl class="recurring-meta">
        <div><dt>시작 월</dt><dd>${escapeHtml(item.startMonth)}</dd></div>
        <div><dt>종료 월</dt><dd>${escapeHtml(item.endMonth || "계속 반복")}</dd></div>
        <div><dt>메모</dt><dd>${escapeHtml(item.memo || "-")}</dd></div>
      </dl>
      <div class="recurring-actions">
        ${status.canManualPost ? `<button type="button" data-post-recurring="${escapeHtml(item.id)}" data-post-month="${escapeHtml(month)}">이번 달 반영</button>` : ""}
        <button type="button" data-edit-recurring="${escapeHtml(item.id)}">수정</button>
        <button type="button" data-toggle-recurring="${escapeHtml(item.id)}">${item.paused ? "다시 활성화" : "일시중지"}</button>
        <button type="button" class="danger-outline" data-delete-recurring="${escapeHtml(item.id)}">삭제</button>
      </div>
    </article>
  `;
}

function attachRecurringHandlers(root = els.recurringList) {
  root.querySelectorAll("[data-edit-recurring]").forEach((button) => {
    button.addEventListener("click", () => editRecurringExpense(button.dataset.editRecurring));
  });
  root.querySelectorAll("[data-delete-recurring]").forEach((button) => {
    button.addEventListener("click", () => deleteRecurringExpense(button.dataset.deleteRecurring));
  });
  root.querySelectorAll("[data-toggle-recurring]").forEach((button) => {
    button.addEventListener("click", () => toggleRecurringPaused(button.dataset.toggleRecurring));
  });
  root.querySelectorAll("[data-post-recurring]").forEach((button) => {
    button.addEventListener("click", () => postRecurringExpense(button.dataset.postRecurring, button.dataset.postMonth));
  });
  root.querySelectorAll("[data-edit-loan-payment]").forEach((button) => {
    button.addEventListener("click", () => openLoanPaymentDialog(
      button.dataset.editLoanPayment,
      button.dataset.postMonth,
      button.dataset.loanPaymentRecord
    ));
  });
}

function syncRecurringMonthFilter() {
  const previous = els.recurringMonthFilter.value || selectedCalendarMonth || els.boardMonth.value || currentMonthKey();
  const months = unique([
    currentMonthKey(),
    selectedCalendarMonth,
    els.boardMonth.value,
    ...classified.map((item) => item.month),
    ...recurringExpenses.flatMap((item) => [item.startMonth, item.endMonth])
  ].filter((month) => /^\d{4}-\d{2}$/.test(month))).sort();
  if (!months.includes(previous)) months.push(previous);
  months.sort();
  els.recurringMonthFilter.innerHTML = months.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join("");
  els.recurringMonthFilter.value = months.includes(previous) ? previous : months[months.length - 1] || currentMonthKey();
  return els.recurringMonthFilter.value;
}

function recurringOccurrencesForMonth(month, options = {}) {
  const showHidden = options.showHidden === true;
  return recurringExpenses
    .filter((item) => isRecurringActiveForMonth(item, month))
    .filter((item) => showHidden || item.showOnCalendar !== false)
    .map((item) => {
      const status = recurringPostingStatus(item, month);
      const scheduled = item.recurringType === "loan" ? loanScheduledAmountsForMonth(item, month) : null;
      return {
        ...item,
        ...(scheduled ? {
          amount: scheduled.amount,
          loanPrincipalAmount: scheduled.principal,
          loanInterestAmount: scheduled.interest,
          loanSupportPrincipalAmount: scheduled.supportPrincipal,
          loanSupportInterestAmount: scheduled.supportInterest
        } : {}),
        date: getRecurringDateForMonth(month, item.dayOfMonth),
        month,
        postedTransaction: status.postedTransaction,
        posted: status.posted,
        postingStatusLabel: status.label,
        postingStatusClass: status.className,
        canManualPost: status.canManualPost
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ko-KR"));
}

function isRecurringActiveForMonth(item, month) {
  if (!item || item.paused || !/^\d{4}-\d{2}$/.test(month)) return false;
  if (item.startMonth && item.startMonth > month) return false;
  if (item.endMonth && item.endMonth < month) return false;
  if (item.recurringType === "loan") {
    if (findPostedRecurringTransaction(item.id, month)) return true;
    return loanPrincipalAtStartOfMonth(item, month) > 0 && loanAvailablePrincipal(item) > 0;
  }
  return true;
}

function scheduledTotalForMonth(month) {
  return sum(recurringOccurrencesForMonth(month, { showHidden: true }).filter((item) => !item.posted), "amount");
}

function scheduledPersonalTotalForMonth(month) {
  return recurringOccurrencesForMonth(month, { showHidden: true })
    .filter((item) => !item.posted)
    .reduce((total, item) => total + (
      item.recurringType === "loan"
        ? loanPrincipalActualAmount(item) + loanInterestActualAmount(item)
        : Number(item.amount || 0)
    ), 0);
}

function getRecurringDateForMonth(yearMonth, dayOfMonth) {
  const [year, month] = String(yearMonth || "").split("-").map(Number);
  if (!year || !month) return "";
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.max(1, Math.min(lastDay, Number(dayOfMonth || 1)));
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}
