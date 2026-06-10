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

    const nextRecord = {
      ...normalized,
      merchant: recurringItem.name,
      amount: Number(recurringItem.amount || 0),
      manualSector: recurringItem.sector,
      manualSubcategory: recurringItem.subcategory,
      memo: recurringItem.memo || "",
      updatedAt: syncedAt
    };
    nextRecord.recordKey = createRecordKey(nextRecord);

    const changed = [
      "merchant",
      "amount",
      "manualSector",
      "manualSubcategory",
      "memo",
      "recordKey"
    ].some((key) => normalized[key] !== nextRecord[key]);

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

function editRecurringExpense(id, options = {}) {
  const item = recurringExpenses.find((expense) => expense.id === id);
  if (!item) return;
  if (options.switchView !== false && !isViewActive("recurring")) switchView("recurring");
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
  if (!confirm(`"${item.name}" 고정 지출을 삭제할까요?`)) return;
  await createAutoSnapshot("고정 지출 삭제 전");
  recurringExpenses = recurringExpenses.filter((expense) => expense.id !== id);
  if (editingRecurringId === id) resetRecurringForm();
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

function buildRecurringTransaction(item, targetMonth) {
  const approvalDate = getRecurringDateForMonth(targetMonth, item.dayOfMonth);
  const transaction = {
    sourceType: "recurring",
    flow: "expense",
    cardNumber: "",
    approvalDate,
    month: targetMonth,
    approvalTime: "",
    merchant: item.name,
    amount: Number(item.amount || 0),
    installment: "",
    approvalNo: `recurring-${item.id}-${targetMonth}`,
    cancel: "",
    payDate: "",
    manualSector: item.sector,
    manualSubcategory: item.subcategory,
    sourceFile: "고정 지출",
    importedAt: new Date().toISOString(),
    recurringId: item.id,
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
    .filter((item) => item.autoPost === true && !item.paused)
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

async function postRecurringExpense(id, month, options = {}) {
  const item = recurringExpenses.find((expense) => expense.id === id);
  const targetMonth = monthKey(month) || selectedCalendarMonth || els.recurringMonthFilter.value || currentMonthKey();
  if (!item || !targetMonth) return { added: 0, skipped: 0 };
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

function findPostedRecurringTransaction(recurringId, month) {
  return transactions
    .map(normalizeStoredTransaction)
    .find((item) => item.sourceType === "recurring" && item.recurringId === recurringId && item.month === month && !isCanceled(item.cancel));
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
    return { active, posted, postedTransaction, canManualPost: false, label: item.paused ? "일시중지" : "종료됨", className: "muted" };
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

function renderRecurring() {
  if (!els.recurringList) return;
  const selectedMonth = syncRecurringMonthFilter();
  const monthOccurrences = recurringOccurrencesForMonth(selectedMonth);
  const pendingItems = monthOccurrences.filter((item) => !item.posted);
  const autoPostedItems = monthOccurrences.filter((item) => item.autoPost && item.posted);
  const manualPendingItems = monthOccurrences.filter((item) => !item.autoPost && !item.posted);
  els.recurringListSummary.textContent = `${recurringExpenses.length.toLocaleString("ko-KR")}건 등록`;
  els.recurringSummaryCards.innerHTML = [
    renderRecurringSummaryCard("미반영 예정", formatWon(sum(pendingItems, "amount")), `${pendingItems.length.toLocaleString("ko-KR")}건 · 실제 합산 전`),
    renderRecurringSummaryCard("자동 반영 완료", `${autoPostedItems.length.toLocaleString("ko-KR")}건`, formatWon(sum(autoPostedItems, "amount"))),
    renderRecurringSummaryCard("수동 반영 필요", `${manualPendingItems.length.toLocaleString("ko-KR")}건`, manualPendingItems.length ? "달력/목록에서 반영 가능" : "반영 대기 없음")
  ].join("");

  if (!recurringExpenses.length) {
    els.recurringList.innerHTML = `<div class="empty">등록된 고정 지출이 없습니다. 카드값, 보험료, 월세 같은 반복 지출을 추가해보세요.</div>`;
    return;
  }

  els.recurringList.innerHTML = recurringExpenses
    .slice()
    .sort((a, b) => Number(a.dayOfMonth || 0) - Number(b.dayOfMonth || 0) || a.name.localeCompare(b.name, "ko-KR"))
    .map((item) => renderRecurringCard(item, selectedMonth))
    .join("");
  attachRecurringHandlers();
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
          <span class="scheduled-badge">${item.paused ? "일시중지" : active ? "진행 중" : "종료됨"}</span>
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
      return {
        ...item,
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
  return true;
}

function scheduledTotalForMonth(month) {
  return sum(recurringOccurrencesForMonth(month, { showHidden: true }).filter((item) => !item.posted), "amount");
}

function getRecurringDateForMonth(yearMonth, dayOfMonth) {
  const [year, month] = String(yearMonth || "").split("-").map(Number);
  if (!year || !month) return "";
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.max(1, Math.min(lastDay, Number(dayOfMonth || 1)));
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}
