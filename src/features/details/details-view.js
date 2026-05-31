function openDetailView(options = {}) {
  const sourceView = options.sourceView || options.source || options.returnTo?.source || currentDetailSourceView();
  if (sourceView !== "details") {
    detailReturnState = captureDetailReturnState(sourceView, options.sourceLabel, options.returnTo);
  } else if (!detailReturnState) {
    detailReturnState = captureDetailReturnState("board", options.sourceLabel, options.returnTo);
  }
  applyDetailNavigationFilters(options, sourceView);
  switchView("details");
  renderDetailView();
  document.querySelector("#detailsView")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function currentDetailSourceView() {
  const activeView = document.querySelector(".view.active");
  return activeView?.id?.replace(/View$/, "") || "board";
}

function captureDetailReturnState(sourceView = "board", sourceLabel = "", returnTo = {}) {
  const view = returnTo.source || returnTo.view || (sourceView === "details" ? detailReturnState?.view || "board" : sourceView);
  return {
    view,
    label: sourceLabel || detailReturnLabel(view),
    scrollY: Number.isFinite(Number(returnTo.scrollY)) ? Number(returnTo.scrollY) : window.scrollY || 0,
    board: {
      month: returnTo.month || returnTo.board?.month || els.boardMonth?.value || "",
      sector: returnTo.sector || returnTo.board?.sector || els.boardFilterSector?.value || "all",
      search: returnTo.search || returnTo.board?.search || els.boardFilterSearch?.value || "",
      sort: returnTo.sort || returnTo.board?.sort || els.boardFilterSort?.value || "amount",
      hideZero: Object.prototype.hasOwnProperty.call(returnTo, "hideZero") ? Boolean(returnTo.hideZero) : Boolean(returnTo.board?.hideZero ?? els.boardFilterHideZero?.checked),
      unknownOnly: Object.prototype.hasOwnProperty.call(returnTo, "unknownOnly") ? Boolean(returnTo.unknownOnly) : Boolean(returnTo.board?.unknownOnly ?? els.boardFilterUnknownOnly?.checked),
      highlightSector: returnTo.highlightSector || returnTo.board?.highlightSector || boardHighlightSector,
      expandedSectors: returnTo.expandedSectors || returnTo.board?.expandedSectors || [...boardExpandedSectors]
    },
    calendar: {
      month: returnTo.month || returnTo.calendar?.month || selectedCalendarMonth || els.calendarMonth?.value || "",
      date: returnTo.selectedDate || returnTo.date || returnTo.calendar?.date || selectedCalendarDate || "",
      editingRecordKey: returnTo.editingRecordKey || returnTo.calendar?.editingRecordKey || calendarEditingRecordKey || ""
    },
    summary: {
      month: returnTo.month || returnTo.summary?.month || selectedSummaryMonth || els.summaryMonthSelect?.value || "",
      sector: returnTo.selectedSector || returnTo.sector || returnTo.summary?.sector || selectedSummarySector || els.sectorTrendSelect?.value || ""
    },
    monthly: {
      month: returnTo.month || returnTo.monthly?.month || focusedMonthlyMonth || ""
    }
  };
}

function detailReturnLabel(view) {
  return {
    board: "대시보드",
    calendar: "소비 달력",
    summary: "월별 섹터 요약",
    monthly: "년도 지출정리"
  }[view] || "이전 화면";
}

function detailReturnButtonText(state = detailReturnState) {
  const view = state?.view || "board";
  return {
    board: "대시보드로 돌아가기",
    calendar: "소비 달력으로 돌아가기",
    summary: "월별 섹터 요약으로 돌아가기",
    monthly: "년도 지출정리로 돌아가기"
  }[view] || `${state?.label || "이전 화면"}으로 돌아가기`;
}

function applyDetailNavigationFilters(options, sourceView = "board") {
  const has = (key) => Object.prototype.hasOwnProperty.call(options, key);
  const fallbackMonth = sourceView === "calendar"
    ? selectedCalendarMonth || els.calendarMonth?.value
    : sourceView === "summary"
      ? selectedSummaryMonth || els.summaryMonthSelect?.value
      : els.boardMonth?.value;
  const sector = has("sector") ? options.sector || "all" : "all";
  const search = has("query") ? options.query : has("search") ? options.search : "";

  detailFocusRecordKey = options.transactionId || options.recordKey || "";
  detailExpandedSectionKey = "";
  detailInstallmentEditRecordKey = "";
  detailFilters.month = has("month") ? options.month || "all" : fallbackMonth || "all";
  if (detailFilters.month !== "all") setSharedSelectedMonth(detailFilters.month, { syncControls: false });
  detailFilters.sector = sector;
  detailFilters.subcategory = sector === "all" ? "all" : has("subcategory") ? options.subcategory || "all" : "all";
  detailFilters.search = search || "";
  detailFilters.sort = options.sort || "amount-desc";
  detailFilters.entryType = options.entryType || "actual";
  detailFilters.reimbursedOnly = Boolean(options.reimbursedOnly);
  detailFilters.hideZero = has("hideZero") ? Boolean(options.hideZero) : true;
  detailFilters.unknownOnly = has("unknownOnly") ? Boolean(options.unknownOnly) : detailFilters.sector === "미분류";
  if (detailFilters.unknownOnly) {
    detailFilters.sector = "미분류";
    detailFilters.subcategory = "all";
  }
}

function boardDetailOptions(extra = {}) {
  const baseSector = els.boardFilterUnknownOnly?.checked
    ? "미분류"
    : els.boardFilterSector?.value || "all";
  return {
    sourceView: "board",
    month: els.boardMonth?.value || "",
    sector: baseSector,
    query: els.boardFilterSearch?.value.trim() || "",
    hideZero: Boolean(els.boardFilterHideZero?.checked),
    ...extra
  };
}

function summaryDetailOptions(extra = {}) {
  return {
    sourceView: "summary",
    month: selectedSummaryMonth || els.summaryMonthSelect?.value || "",
    ...extra
  };
}

function calendarDetailOptions(item) {
  const date = normalizeInputDate(item.approvalDate) || item.date || selectedCalendarDate || "";
  return {
    source: "calendar",
    month: item.month,
    date,
    sector: item.sector,
    subcategory: item.subcategory,
    query: [item.approvalDate, item.approvalTime, item.merchant].filter(Boolean).join(" "),
    transactionId: item.recordKey,
    returnTo: {
      source: "calendar",
      month: item.month,
      selectedDate: date,
      transactionId: item.recordKey,
      scrollY: window.scrollY || 0
    }
  };
}

function syncDetailBackButton() {
  els.detailBackToBoardButton.textContent = `← ${detailReturnButtonText(detailReturnState)}`;
}

function returnFromDetailView() {
  const state = detailReturnState || captureDetailReturnState("board");
  const view = state.view || "board";
  detailFocusRecordKey = "";
  detailExpandedSectionKey = "";
  detailInstallmentEditRecordKey = "";
  if (view === "calendar") {
    selectedCalendarMonth = state.calendar?.month || selectedCalendarMonth;
    setSharedSelectedMonth(selectedCalendarMonth, { syncControls: false });
    selectedCalendarDate = state.calendar?.date || selectedCalendarDate;
    calendarEditingRecordKey = state.calendar?.editingRecordKey || "";
    switchView("calendar");
    renderCalendar();
  } else if (view === "summary") {
    selectedSummaryMonth = state.summary?.month || selectedSummaryMonth;
    setSharedSelectedMonth(selectedSummaryMonth, { syncControls: false });
    selectedSummarySector = state.summary?.sector || selectedSummarySector;
    switchView("summary");
    renderSummary();
  } else if (view === "monthly") {
    focusedMonthlyMonth = state.monthly?.month || focusedMonthlyMonth || getSharedSelectedMonth(currentMonthKey());
    if (focusedMonthlyMonth) setSharedSelectedMonth(focusedMonthlyMonth, { syncControls: false });
    switchView("monthly");
    renderMonthlyFlow();
    requestAnimationFrame(() => {
      if (!focusedMonthlyMonth) return;
      setMonthlyFlowHighlight(focusedMonthlyMonth, { persistent: true });
      els.monthlyFlowTable
        .querySelector(`[data-month-row="${cssEscape(focusedMonthlyMonth)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
  } else {
    if (state.board) {
      if (els.boardMonth && state.board.month) els.boardMonth.value = state.board.month;
      if (state.board.month) setSharedSelectedMonth(state.board.month, { syncControls: false });
      if (els.boardFilterSector) els.boardFilterSector.value = state.board.sector || "all";
      if (els.boardFilterSearch) els.boardFilterSearch.value = state.board.search || "";
      if (els.boardFilterSort) els.boardFilterSort.value = state.board.sort || "amount";
      if (els.boardFilterHideZero) els.boardFilterHideZero.checked = Boolean(state.board.hideZero);
      if (els.boardFilterUnknownOnly) els.boardFilterUnknownOnly.checked = Boolean(state.board.unknownOnly);
      boardHighlightSector = state.board.highlightSector || "";
      boardExpandedSectors = new Set(state.board.expandedSectors || []);
      boardExpandedMonth = state.board.month || boardExpandedMonth;
    }
    switchView("board");
    renderBoard();
  }
  requestAnimationFrame(() => window.scrollTo({ top: Number(state.scrollY || 0), behavior: "smooth" }));
}

function renderDetailView() {
  const active = expenseRows(classified);
  const months = unique(active.map((item) => item.month).filter(Boolean)).sort();
  if (detailFilters.month !== "all") {
    detailFilters.month = getSharedSelectedMonth(detailFilters.month || els.boardMonth.value || selectedSummaryMonth || selectedCalendarMonth || months.at(-1) || currentMonthKey());
    if (canViewDriveSharedMonth("details")) setSharedSelectedMonth(detailFilters.month, { syncControls: false });
  }
  syncDetailFilterControls(active, months);
  const rows = detailFilters.entryType === "scheduled" ? [] : filteredDetailRows(active);
  const scheduledRows = detailFilters.entryType === "actual" ? [] : filteredDetailScheduledRows();
  const selectedMonth = detailFilters.month === "all" ? currentMonthKey() : detailFilters.month;

  syncDetailBackButton();
  els.detailMetrics.innerHTML = renderDetailMetrics(rows, scheduledRows);
  els.detailGrid.innerHTML = [
    detailFilters.entryType !== "scheduled" ? renderDetailGrid(rows, selectedMonth) : "",
    detailFilters.entryType !== "actual" ? renderScheduledDetailPanel(scheduledRows) : ""
  ].filter(Boolean).join("");
  attachReimbursementHandlers(els.detailGrid);
  attachInstallmentHandlers(els.detailGrid);
  attachBoardQuickAddHandlers(els.detailGrid, renderDetailView);
  attachRecurringHandlers(els.detailGrid);
  attachDetailCardHandlers();
  focusDetailRecord();
}

function renderDetailBulkView() {
  fillDetailBulkMonthControl();
  fillDetailBulkListFilters();
  renderDetailBulkPreview();
  renderDetailBulkSavedRecords();
}

function fillDetailBulkMonthControl() {
  if (!els.detailBulkMonth) return;
  const selected = getSharedSelectedMonth(els.detailBulkMonth.value || currentMonthKey());
  const months = appMonthOptions([selected, currentMonthKey()]);
  els.detailBulkMonth.innerHTML = months
    .map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`)
    .join("");
  syncMonthSelectValue(els.detailBulkMonth, selected);
}

function fillDetailBulkCategoryControls(preferred = {}) {
  if (!els.detailBulkSector || !els.detailBulkSubcategory) return;
  const sectors = detailBulkSectorOptions();
  const preferredSector = preferred.sector || (detailFilters.sector !== "all" ? detailFilters.sector : "") || "식비";
  els.detailBulkSector.innerHTML = sectors
    .map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`)
    .join("");
  els.detailBulkSector.value = sectors.includes(preferredSector) ? preferredSector : sectors[0] || "";
  updateDetailBulkSubcategorySelect(preferred.subcategory || (detailFilters.subcategory !== "all" ? detailFilters.subcategory : ""));
}

function updateDetailBulkSubcategorySelect(preferred = "") {
  if (!els.detailBulkSector || !els.detailBulkSubcategory) return;
  const sector = els.detailBulkSector.value || "식비";
  const options = categories[sector] || [];
  els.detailBulkSubcategory.innerHTML = options
    .map((subcategory) => `<option value="${escapeHtml(subcategory)}">${escapeHtml(subcategory)}</option>`)
    .join("");
  if (preferred && options.includes(preferred)) els.detailBulkSubcategory.value = preferred;
}

function detailBulkSectorOptions() {
  return Object.keys(categories).filter((sector) => sector !== "수입");
}

function isDetailBulkTransaction(item) {
  const normalized = normalizeStoredTransaction(item);
  return normalized.sourceFile === "과거 거래 일괄 입력"
    || String(normalized.approvalNo || "").startsWith("direct-bulk-");
}

function detailBulkSavedRecords() {
  const classifiedByKey = new Map(classified.map((item) => [item.recordKey, item]));
  return transactions
    .map(normalizeStoredTransaction)
    .filter(isDetailBulkTransaction)
    .map((item) => {
      const classifiedItem = classifiedByKey.get(item.recordKey) || {};
      const assignment = normalizeCategoryAssignment(
        item.manualSector || classifiedItem.sector || "미분류",
        item.manualSubcategory || classifiedItem.subcategory || "미분류",
        item.merchant
      );
      return { ...item, sector: assignment.sector, subcategory: assignment.subcategory };
    })
    .sort((a, b) => `${b.approvalDate} ${b.approvalTime} ${b.merchant}`.localeCompare(`${a.approvalDate} ${a.approvalTime} ${a.merchant}`, "ko-KR"));
}

function fillDetailBulkListFilters() {
  if (!els.detailBulkListMonth || !els.detailBulkListSector || !els.detailBulkListSubcategory) return;
  const rows = detailBulkSavedRecords();
  const selectedMonth = els.detailBulkListMonth.value || "all";
  const months = unique(rows.map((item) => item.month).filter(Boolean)).sort().reverse();
  els.detailBulkListMonth.innerHTML = [
    `<option value="all">전체 보기</option>`,
    ...months.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`)
  ].join("");
  els.detailBulkListMonth.value = selectedMonth === "all" || months.includes(selectedMonth) ? selectedMonth : "all";

  const selectedSector = els.detailBulkListSector.value || "all";
  const sectors = unique(rows.map((item) => item.sector).filter(Boolean)).sort((a, b) => a.localeCompare(b, "ko-KR"));
  els.detailBulkListSector.innerHTML = [
    `<option value="all">전체 섹터</option>`,
    ...sectors.map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`)
  ].join("");
  els.detailBulkListSector.value = selectedSector === "all" || sectors.includes(selectedSector) ? selectedSector : "all";
  fillDetailBulkListSubcategoryFilter(rows);
}

function fillDetailBulkListSubcategoryFilter(sourceRows = detailBulkSavedRecords()) {
  if (!els.detailBulkListSubcategory || !els.detailBulkListSector) return;
  const selectedSector = els.detailBulkListSector.value || "all";
  const selectedSubcategory = els.detailBulkListSubcategory.value || "all";
  const sourceSubcategories = sourceRows
    .filter((item) => selectedSector === "all" || item.sector === selectedSector)
    .map((item) => item.subcategory)
    .filter(Boolean);
  const categorySubcategories = selectedSector !== "all" ? (categories[selectedSector] || []) : [];
  const subcategories = unique([...categorySubcategories, ...sourceSubcategories]).sort((a, b) => a.localeCompare(b, "ko-KR"));
  els.detailBulkListSubcategory.innerHTML = [
    `<option value="all">전체 세부항목</option>`,
    ...subcategories.map((subcategory) => `<option value="${escapeHtml(subcategory)}">${escapeHtml(subcategory)}</option>`)
  ].join("");
  els.detailBulkListSubcategory.value = selectedSubcategory === "all" || subcategories.includes(selectedSubcategory) ? selectedSubcategory : "all";
}

function handleDetailBulkParse() {
  const text = els.detailBulkPaste.value.trim();
  if (!text) {
    setDetailBulkFeedback("붙여넣을 거래 내용을 입력해주세요.", "error");
    return;
  }
  const defaults = readDetailBulkDefaults();
  detailBulkRows = parseDetailBulkText(text, defaults);
  markDetailBulkDuplicateRows();
  renderDetailBulkPreview();
  const validCount = detailBulkRows.filter((row) => row.valid).length;
  const errorCount = detailBulkRows.filter((row) => !row.valid).length;
  const duplicateCount = detailBulkRows.filter((row) => row.valid && row.duplicate).length;
  setDetailBulkFeedback(`파싱 완료: 정상 ${validCount.toLocaleString("ko-KR")}건 · 중복 가능 ${duplicateCount.toLocaleString("ko-KR")}건 · 오류 ${errorCount.toLocaleString("ko-KR")}건`, errorCount ? "warning" : "success");
}

function clearDetailBulkInput() {
  detailBulkRows = [];
  els.detailBulkPaste.value = "";
  els.detailBulkReimbursementDefault.value = "0";
  els.detailBulkAllowDuplicates.checked = false;
  els.detailBulkPreview.innerHTML = "";
  els.saveDetailBulkButton.disabled = true;
  setDetailBulkFeedback("일괄 입력 내용을 초기화했습니다.", "success");
}

async function handleDetailBulkSave() {
  updateDetailBulkRowsFromPreview();
  markDetailBulkDuplicateRows();
  const allowDuplicates = Boolean(els.detailBulkAllowDuplicates.checked);
  const saveableRows = detailBulkRows.filter((row) => row.valid && (allowDuplicates || !row.duplicate));
  if (!saveableRows.length) {
    renderDetailBulkPreview();
    setDetailBulkFeedback("저장할 정상 항목이 없습니다. 오류 또는 중복 상태를 확인해주세요.", "error");
    return;
  }

  await createAutoSnapshot("과거 거래 일괄 입력 전");
  const now = new Date().toISOString();
  const beforeKeys = new Set(transactions.map((item) => item.recordKey));
  const entries = saveableRows
    .map((row) => ({ row, transaction: buildDetailBulkTransaction(row, now) }))
    .filter((entry) => entry.transaction);
  const mergeResult = mergeTransactions(transactions, entries.map((entry) => entry.transaction));
  transactions = mergeResult.records;
  entries.forEach(({ row, transaction }) => {
    if (beforeKeys.has(transaction.recordKey)) return;
    if (Number(row.reimbursement || 0) > 0) reimbursements[transaction.recordKey] = Math.min(Number(transaction.amount || 0), Number(row.reimbursement || 0));
  });
  const skippedDuplicates = detailBulkRows.filter((row) => row.valid && row.duplicate && !allowDuplicates).length;
  importMeta = {
    ...importMeta,
    lastFileName: "과거 거래 일괄 입력",
    lastImportedAt: now,
    lastAddedCount: mergeResult.added,
    lastSkippedCount: mergeResult.skipped + skippedDuplicates
  };
  currentFileName = "과거 거래 일괄 입력";

  detailBulkRows = [];
  els.detailBulkPaste.value = "";
  els.detailBulkPreview.innerHTML = "";
  els.saveDetailBulkButton.disabled = true;
  if (els.detailBulkListMonth) els.detailBulkListMonth.value = "all";
  if (els.detailBulkListSector) els.detailBulkListSector.value = "all";
  if (els.detailBulkListSubcategory) els.detailBulkListSubcategory.value = "all";
  setDetailBulkFeedback(`${mergeResult.added.toLocaleString("ko-KR")}건의 직접 입력 거래를 저장했습니다. 중복 ${Number(mergeResult.skipped + skippedDuplicates).toLocaleString("ko-KR")}건은 건너뛰었습니다.`, "success");
  await saveTransactions();
  await saveReimbursements();
  await saveImportMeta();
  reclassify();
}

function readDetailBulkDefaults() {
  const assignment = normalizeCategoryAssignment(
    els.detailBulkSector.value || "식비",
    els.detailBulkSubcategory.value || "",
    ""
  );
  return {
    sector: assignment.sector,
    subcategory: assignment.subcategory,
    sourceType: els.detailBulkSourceType.value || "manual",
    reimbursement: Math.max(0, parseDetailBulkAmount(els.detailBulkReimbursementDefault.value)),
    autoSuggest: Boolean(els.detailBulkAutoSuggest.checked)
  };
}

function parseDetailBulkText(text, defaults) {
  const smartModel = defaults.autoSuggest ? buildSmartSuggestionModel(classified) : [];
  return String(text || "")
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim())
    .map(({ line, index }) => parseDetailBulkLine(line, index + 1, defaults, smartModel));
}

function parseDetailBulkLine(line, lineNumber, defaults, smartModel = []) {
  const original = String(line || "").trim();
  const id = detailBulkRowId(lineNumber);
  const dateMatch = original.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
  if (!dateMatch) {
    return validateDetailBulkRow({ id, original, lineNumber, date: "", description: original, amount: 0, reimbursement: defaults.reimbursement, sector: defaults.sector, subcategory: defaults.subcategory, sourceType: defaults.sourceType, error: "날짜 오류" });
  }

  const rest = `${original.slice(0, dateMatch.index)} ${original.slice((dateMatch.index || 0) + dateMatch[0].length)}`.trim();
  const amountMatch = lastDetailBulkAmountMatch(rest);
  if (!amountMatch) {
    return validateDetailBulkRow({ id, original, lineNumber, date: dateMatch[1], description: rest, amount: 0, reimbursement: defaults.reimbursement, sector: defaults.sector, subcategory: defaults.subcategory, sourceType: defaults.sourceType, error: "금액 오류" });
  }

  const description = `${rest.slice(0, amountMatch.index)} ${rest.slice(amountMatch.index + amountMatch.raw.length)}`
    .replace(/[,\t ]+$/g, "")
    .replace(/^[,\t ]+/g, "")
    .trim();
  const recommended = defaults.autoSuggest ? suggestCategory(description, smartModel) : null;
  const assignment = recommended
    ? normalizeCategoryAssignment(recommended.sector, recommended.subcategory, description)
    : { sector: defaults.sector, subcategory: defaults.subcategory };
  return validateDetailBulkRow({
    id,
    original,
    lineNumber,
    date: dateMatch[1],
    description,
    amount: amountMatch.amount,
    reimbursement: defaults.reimbursement,
    sector: assignment.sector,
    subcategory: assignment.subcategory,
    sourceType: defaults.sourceType,
    suggestion: recommended
  });
}

function lastDetailBulkAmountMatch(text) {
  const matches = [...String(text || "").matchAll(/-?\d[\d,]*(?:\s*원)?/g)]
    .map((match) => ({
      raw: match[0],
      index: match.index || 0,
      amount: parseDetailBulkAmount(match[0])
    }))
    .filter((match) => match.amount > 0);
  return matches.at(-1) || null;
}

function parseDetailBulkAmount(value) {
  const cleaned = String(value ?? "")
    .replace(/원/g, "")
    .replace(/[^\d,-]/g, "")
    .trim();
  return Math.abs(toNumber(cleaned));
}

function validateDetailBulkRow(row) {
  const date = normalizeInputDate(row.date);
  const amount = parseDetailBulkAmount(row.amount);
  const reimbursement = Math.max(0, parseDetailBulkAmount(row.reimbursement));
  const description = String(row.description || "").trim();
  const assignment = normalizeCategoryAssignment(row.sector, row.subcategory, description);
  let error = row.error || "";
  if (!date) error = "날짜 오류";
  else if (!description) error = "빈 내용";
  else if (!amount) error = "금액 오류";
  else if (reimbursement > amount) error = "정산 금액 확인";
  else if (row.installmentEnabled && Number(row.installmentMonths || 0) < 2) error = "할부 개월 확인";
  return {
    ...row,
    date,
    month: monthKey(date),
    description,
    amount,
    reimbursement,
    actualAmount: Math.max(0, amount - reimbursement),
    sector: assignment.sector,
    subcategory: assignment.subcategory,
    sourceType: row.sourceType || "manual",
    installmentEnabled: Boolean(row.installmentEnabled),
    installmentMonths: Number(row.installmentMonths || 0),
    installmentStartMonth: isValidMonthKey(row.installmentStartMonth) ? row.installmentStartMonth : monthKey(date),
    installmentMonthlyAmount: row.installmentEnabled && Number(row.installmentMonths || 0) > 1
      ? Math.floor(amount / Number(row.installmentMonths || 1))
      : 0,
    valid: !error,
    error
  };
}

function markDetailBulkDuplicateRows() {
  const existing = new Set(expenseRows(classified).map(detailBulkExistingSignature));
  const seen = new Set();
  detailBulkRows = detailBulkRows.map((row) => {
    const checked = validateDetailBulkRow(row);
    if (!checked.valid) return { ...checked, duplicate: false, duplicateReason: "" };
    const signature = detailBulkSignature(checked);
    if (existing.has(signature)) {
      return { ...checked, duplicate: true, duplicateReason: "기존 내역 중복 가능" };
    }
    if (seen.has(signature)) {
      return { ...checked, duplicate: true, duplicateReason: "미리보기 중복 가능" };
    }
    seen.add(signature);
    return { ...checked, duplicate: false, duplicateReason: "" };
  });
}

function detailBulkExistingSignature(item) {
  return [
    normalizeInputDate(item.approvalDate),
    normalizeKeyText(item.merchant),
    Number(item.amount || 0),
    item.sector || "",
    item.subcategory || ""
  ].join("|");
}

function detailBulkSignature(row) {
  return [
    normalizeInputDate(row.date),
    normalizeKeyText(row.description),
    Number(row.amount || 0),
    row.sector || "",
    row.subcategory || ""
  ].join("|");
}

function buildDetailBulkTransaction(row, now) {
  const checked = validateDetailBulkRow(row);
  if (!checked.valid) return null;
  const transaction = {
    sourceType: checked.sourceType || "manual",
    flow: "expense",
    cardNumber: "",
    approvalDate: checked.date,
    month: checked.month,
    approvalTime: "",
    merchant: checked.description,
    amount: Number(checked.amount || 0),
    installment: "",
    approvalNo: `direct-bulk-${now}-${checked.id}`,
    cancel: "",
    payDate: "",
    manualSector: checked.sector,
    manualSubcategory: checked.subcategory,
    installmentEnabled: Boolean(checked.installmentEnabled && Number(checked.installmentMonths || 0) > 1),
    installmentMonths: checked.installmentEnabled && Number(checked.installmentMonths || 0) > 1 ? Number(checked.installmentMonths || 0) : 0,
    installmentStartMonth: checked.installmentEnabled && Number(checked.installmentMonths || 0) > 1 ? checked.installmentStartMonth : "",
    installmentOriginalAmount: checked.installmentEnabled && Number(checked.installmentMonths || 0) > 1 ? Number(checked.amount || 0) : 0,
    installmentMonthlyAmount: checked.installmentEnabled && Number(checked.installmentMonths || 0) > 1 ? Math.floor(Number(checked.amount || 0) / Number(checked.installmentMonths || 1)) : 0,
    installmentGroupId: "",
    sourceFile: "과거 거래 일괄 입력",
    importedAt: now,
    createdAt: now,
    updatedAt: now
  };
  transaction.recordKey = createRecordKey(transaction);
  if (transaction.installmentEnabled) transaction.installmentGroupId = transaction.recordKey;
  return transaction;
}

function updateDetailBulkRowsFromPreview() {
  if (!els.detailBulkPreview) return;
  els.detailBulkPreview.querySelectorAll("[data-detail-bulk-index]").forEach((input) => {
    const index = Number(input.dataset.detailBulkIndex);
    const field = input.dataset.detailBulkField;
    if (!Number.isInteger(index) || !detailBulkRows[index] || !field) return;
    detailBulkRows[index][field] = input.type === "checkbox" ? input.checked : input.value;
    if (field === "sector") {
      const first = (categories[input.value] || [])[0] || "미분류";
      if (!categories[input.value]?.includes(detailBulkRows[index].subcategory)) {
        detailBulkRows[index].subcategory = first;
      }
    }
  });
  markDetailBulkDuplicateRows();
}

function renderDetailBulkPreview() {
  if (!els.detailBulkPreview) return;
  updateDetailBulkSaveButton();
  if (!detailBulkRows.length) {
    els.detailBulkPreview.innerHTML = `<tbody><tr><td class="empty">파싱 결과가 여기에 표시됩니다.</td></tr></tbody>`;
    return;
  }
  const header = ["상태", "날짜", "월", "내용", "총 결제액", "정산받은 금액", "실 지출액", "섹터", "세부항목", "할부", "개월", "시작 월", "월 반영액", "삭제"]
    .map((label) => `<th>${escapeHtml(label)}</th>`)
    .join("");
  const body = detailBulkRows.map((row, index) => {
    const checked = validateDetailBulkRow(row);
    const rowClass = !checked.valid ? "detail-bulk-error" : checked.duplicate ? "detail-bulk-warning" : "";
    return `
      <tr class="${rowClass}">
        <td>${renderDetailBulkStatus(checked)}</td>
        <td><input data-detail-bulk-index="${index}" data-detail-bulk-field="date" type="date" value="${escapeHtml(checked.date)}"></td>
        <td><span class="detail-bulk-month">${escapeHtml(checked.month || "-")}</span></td>
        <td><input data-detail-bulk-index="${index}" data-detail-bulk-field="description" type="text" value="${escapeHtml(checked.description)}" title="${escapeHtml(checked.original || "")}"></td>
        <td><input data-detail-bulk-index="${index}" data-detail-bulk-field="amount" class="amount-input" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(checked.amount))}"></td>
        <td><input data-detail-bulk-index="${index}" data-detail-bulk-field="reimbursement" class="amount-input" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(checked.reimbursement))}"></td>
        <td class="amount">${formatWon(checked.actualAmount)}</td>
        <td><select data-detail-bulk-index="${index}" data-detail-bulk-field="sector">${detailBulkSectorOptionsHtml(checked.sector)}</select></td>
        <td><select data-detail-bulk-index="${index}" data-detail-bulk-field="subcategory">${detailBulkSubcategoryOptionsHtml(checked.sector, checked.subcategory)}</select></td>
        <td><input data-detail-bulk-index="${index}" data-detail-bulk-field="installmentEnabled" type="checkbox" ${checked.installmentEnabled ? "checked" : ""} aria-label="할부 적용"></td>
        <td><input data-detail-bulk-index="${index}" data-detail-bulk-field="installmentMonths" class="small-number-input" type="number" min="2" max="60" value="${escapeHtml(checked.installmentMonths || 2)}"></td>
        <td><input data-detail-bulk-index="${index}" data-detail-bulk-field="installmentStartMonth" type="month" value="${escapeHtml(checked.installmentStartMonth || checked.month || "")}"></td>
        <td class="amount">${checked.installmentEnabled && Number(checked.installmentMonths || 0) > 1 ? formatWon(checked.installmentMonthlyAmount) : "-"}</td>
        <td><button type="button" class="income-row-delete" data-delete-detail-bulk="${index}">삭제</button></td>
      </tr>
    `;
  }).join("");
  els.detailBulkPreview.innerHTML = `<thead><tr>${header}</tr></thead><tbody>${body}</tbody>`;

  els.detailBulkPreview.querySelectorAll("[data-detail-bulk-index]").forEach((input) => {
    input.addEventListener("change", () => {
      updateDetailBulkRowsFromPreview();
      renderDetailBulkPreview();
    });
  });
  els.detailBulkPreview.querySelectorAll("[data-delete-detail-bulk]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.deleteDetailBulk);
      detailBulkRows.splice(index, 1);
      markDetailBulkDuplicateRows();
      renderDetailBulkPreview();
      setDetailBulkFeedback("선택한 행을 미리보기에서 삭제했습니다.", "success");
    });
  });
}

function renderDetailBulkSavedRecords() {
  if (!els.detailBulkRecordList) return;
  const allRows = detailBulkSavedRecords();
  const selectedMonth = els.detailBulkListMonth?.value || "all";
  const selectedSector = els.detailBulkListSector?.value || "all";
  const selectedSubcategory = els.detailBulkListSubcategory?.value || "all";
  const search = normalizeSearchText(els.detailBulkListSearch?.value || "");
  const sortMode = els.detailBulkListSort?.value || "date-desc";
  const rows = allRows
    .filter((item) => selectedMonth === "all" || item.month === selectedMonth)
    .filter((item) => selectedSector === "all" || item.sector === selectedSector)
    .filter((item) => selectedSubcategory === "all" || item.subcategory === selectedSubcategory)
    .filter((item) => matchesRecordSearch(item, search, [item.sector, item.subcategory, sourceTypeLabel(item.sourceType), reimbursementFor(item)]))
    .sort(sortDetailBulkSavedRecords(sortMode));

  if (els.detailBulkRecordCount) {
    els.detailBulkRecordCount.textContent = `${rows.length.toLocaleString("ko-KR")}건`;
  }

  if (!allRows.length) {
    els.detailBulkRecordList.innerHTML = `<div class="empty compact-empty">아직 저장된 과거 거래가 없습니다.</div>`;
    return;
  }
  if (!rows.length) {
    els.detailBulkRecordList.innerHTML = `<div class="empty compact-empty">선택한 조건에 맞는 과거 거래가 없습니다.</div>`;
    return;
  }

  els.detailBulkRecordList.innerHTML = rows.map((item) => `
    <article class="detail-bulk-record-item ${editingDetailBulkRecordKey === item.recordKey ? "editing" : ""}">
      ${editingDetailBulkRecordKey === item.recordKey ? renderDetailBulkRecordEditForm(item) : renderDetailBulkRecordDisplay(item)}
    </article>
  `).join("");
  attachDetailBulkRecordHandlers();
}

function renderDetailBulkRecordDisplay(item) {
  const reimbursement = reimbursementFor(item);
  return `
    <span class="detail-bulk-record-date">${escapeHtml(item.approvalDate || "-")}</span>
    <strong class="detail-bulk-record-merchant" title="${escapeHtml(item.merchant)}">${escapeHtml(item.merchant || "-")}</strong>
    <b class="amount">${formatWon(item.amount)}</b>
    ${categoryChip(item.sector, item.subcategory)}
    ${installmentSummaryText(item) ? `<span class="installment-badge">${escapeHtml(installmentSummaryText(item))}</span>` : ""}
    <span class="detail-bulk-record-source">${escapeHtml(sourceTypeLabel(item.sourceType))}</span>
    <span class="detail-bulk-record-reimbursement">정산 기준값 ${formatWon(reimbursement)}</span>
    <div class="income-entry-actions">
      <button type="button" data-edit-detail-bulk-record="${escapeHtml(item.recordKey)}">수정</button>
      <button type="button" class="income-delete-button" data-delete-detail-bulk-record="${escapeHtml(item.recordKey)}">삭제</button>
    </div>
  `;
}

function sortDetailBulkSavedRecords(mode) {
  return (a, b) => {
    if (mode === "date-asc") {
      return `${a.approvalDate} ${a.approvalTime} ${a.merchant}`.localeCompare(`${b.approvalDate} ${b.approvalTime} ${b.merchant}`, "ko-KR");
    }
    if (mode === "amount-desc") return Number(b.amount || 0) - Number(a.amount || 0);
    if (mode === "amount-asc") return Number(a.amount || 0) - Number(b.amount || 0);
    return `${b.approvalDate} ${b.approvalTime} ${b.merchant}`.localeCompare(`${a.approvalDate} ${a.approvalTime} ${a.merchant}`, "ko-KR");
  };
}

function renderDetailBulkRecordEditForm(item) {
  const reimbursement = reimbursementFor(item);
  const installmentEnabled = Boolean(item.installmentEnabled && Number(item.installmentMonths || 0) > 1);
  const installmentMonthCount = installmentEnabled ? Number(item.installmentMonths || 0) : installmentMonths(item.installment) || 2;
  const installmentStartMonth = item.installmentStartMonth || item.month || monthKey(item.approvalDate) || currentMonthKey();
  return `
    <input data-detail-bulk-record-field="date" type="date" value="${escapeHtml(normalizeInputDate(item.approvalDate))}" aria-label="과거 거래 날짜 수정">
    <input data-detail-bulk-record-field="merchant" type="text" value="${escapeHtml(item.merchant)}" aria-label="과거 거래 내용 수정">
    <input data-detail-bulk-record-field="amount" class="amount-input" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(item.amount))}" aria-label="과거 거래 금액 수정">
    <select data-detail-bulk-record-field="sourceType" aria-label="과거 거래 결제수단 수정">${detailBulkSourceTypeOptionsHtml(item.sourceType)}</select>
    <input data-detail-bulk-record-field="reimbursement" class="amount-input" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(reimbursement))}" aria-label="과거 거래 정산 기준값 수정">
    <select data-detail-bulk-record-field="sector" aria-label="과거 거래 섹터 수정">${detailBulkSectorOptionsHtml(item.sector)}</select>
    <select data-detail-bulk-record-field="subcategory" aria-label="과거 거래 세부항목 수정">${detailBulkSubcategoryOptionsHtml(item.sector, item.subcategory)}</select>
    <label class="check-line detail-bulk-installment-check"><input data-detail-bulk-record-field="installmentEnabled" type="checkbox" ${installmentEnabled ? "checked" : ""}> 할부</label>
    <input data-detail-bulk-record-field="installmentMonths" class="small-number-input" type="number" min="2" max="60" value="${escapeHtml(installmentMonthCount)}" aria-label="할부 개월 수">
    <input data-detail-bulk-record-field="installmentStartMonth" type="month" value="${escapeHtml(installmentStartMonth)}" aria-label="할부 시작 월">
    <div class="income-entry-actions">
      <button type="button" class="primary-action" data-save-detail-bulk-record="${escapeHtml(item.recordKey)}">저장</button>
      <button type="button" data-cancel-detail-bulk-record>취소</button>
    </div>
  `;
}

function attachDetailBulkRecordHandlers() {
  els.detailBulkRecordList.querySelectorAll("[data-edit-detail-bulk-record]").forEach((button) => {
    button.addEventListener("click", () => {
      editingDetailBulkRecordKey = button.dataset.editDetailBulkRecord;
      renderDetailBulkSavedRecords();
    });
  });
  els.detailBulkRecordList.querySelectorAll("[data-cancel-detail-bulk-record]").forEach((button) => {
    button.addEventListener("click", () => {
      editingDetailBulkRecordKey = "";
      renderDetailBulkSavedRecords();
    });
  });
  els.detailBulkRecordList.querySelectorAll("[data-delete-detail-bulk-record]").forEach((button) => {
    button.addEventListener("click", () => deleteDetailBulkRecord(button.dataset.deleteDetailBulkRecord));
  });
  els.detailBulkRecordList.querySelectorAll("[data-save-detail-bulk-record]").forEach((button) => {
    button.addEventListener("click", () => saveDetailBulkRecordEdit(button.dataset.saveDetailBulkRecord));
  });
  els.detailBulkRecordList.querySelectorAll('[data-detail-bulk-record-field="sector"]').forEach((select) => {
    select.addEventListener("change", () => updateDetailBulkRecordEditSubcategory(select));
  });
}

function updateDetailBulkRecordEditSubcategory(sectorSelect) {
  const form = sectorSelect.closest(".detail-bulk-record-item");
  const subcategorySelect = form?.querySelector('[data-detail-bulk-record-field="subcategory"]');
  if (!subcategorySelect) return;
  subcategorySelect.innerHTML = detailBulkSubcategoryOptionsHtml(sectorSelect.value, "");
}

async function saveDetailBulkRecordEdit(recordKey) {
  const card = els.detailBulkRecordList.querySelector(`[data-save-detail-bulk-record="${cssEscape(recordKey)}"]`)?.closest(".detail-bulk-record-item");
  if (!card) return;
  const date = normalizeInputDate(card.querySelector('[data-detail-bulk-record-field="date"]')?.value);
  const merchant = card.querySelector('[data-detail-bulk-record-field="merchant"]')?.value.trim();
  const amount = Math.abs(toNumber(card.querySelector('[data-detail-bulk-record-field="amount"]')?.value));
  const sourceType = card.querySelector('[data-detail-bulk-record-field="sourceType"]')?.value || "manual";
  const reimbursement = Math.max(0, parseDetailBulkAmount(card.querySelector('[data-detail-bulk-record-field="reimbursement"]')?.value));
  const sector = card.querySelector('[data-detail-bulk-record-field="sector"]')?.value || "식비";
  const subcategory = card.querySelector('[data-detail-bulk-record-field="subcategory"]')?.value || "";
  const installmentEnabled = Boolean(card.querySelector('[data-detail-bulk-record-field="installmentEnabled"]')?.checked);
  const installmentMonthCount = Math.max(0, Number(card.querySelector('[data-detail-bulk-record-field="installmentMonths"]')?.value || 0));
  const installmentStartMonth = card.querySelector('[data-detail-bulk-record-field="installmentStartMonth"]')?.value || monthKey(date);

  if (!date || !merchant || !amount) {
    alert("날짜, 내용, 금액을 모두 입력해주세요.");
    return;
  }
  if (reimbursement > amount) {
    alert("정산 기준값은 총 결제액보다 클 수 없습니다.");
    return;
  }
  if (installmentEnabled && (installmentMonthCount < 2 || !isValidMonthKey(installmentStartMonth))) {
    alert("할부 개월 수는 2개월 이상, 시작 월은 YYYY-MM 형식으로 입력해주세요.");
    return;
  }

  const index = transactions.findIndex((item) => normalizeStoredTransaction(item).recordKey === recordKey);
  if (index < 0) return;
  const original = normalizeStoredTransaction(transactions[index]);
  const assignment = normalizeCategoryAssignment(sector, subcategory, merchant);
  const now = new Date().toISOString();
  const validInstallment = installmentEnabled && installmentMonthCount > 1;
  const updated = {
    ...original,
    sourceType,
    flow: "expense",
    approvalDate: date,
    month: monthKey(date),
    merchant,
    amount,
    manualSector: assignment.sector,
    manualSubcategory: assignment.subcategory,
    installmentEnabled: validInstallment,
    installmentMonths: validInstallment ? installmentMonthCount : 0,
    installmentStartMonth: validInstallment ? installmentStartMonth : "",
    installmentOriginalAmount: validInstallment ? amount : 0,
    installmentMonthlyAmount: validInstallment ? Math.floor(amount / installmentMonthCount) : 0,
    installmentGroupId: validInstallment ? original.installmentGroupId || original.recordKey : "",
    sourceFile: original.sourceFile || "과거 거래 일괄 입력",
    importedAt: original.importedAt || now,
    createdAt: original.createdAt || original.importedAt || now,
    updatedAt: now,
    approvalNo: original.approvalNo || `direct-bulk-${now}-${Math.random().toString(36).slice(2, 8)}`
  };
  updated.recordKey = createRecordKey(updated);
  const duplicated = transactions.some((item, itemIndex) => itemIndex !== index && normalizeStoredTransaction(item).recordKey === updated.recordKey);
  if (duplicated) {
    alert("같은 과거 거래 기록이 이미 있습니다. 날짜, 내용, 금액을 확인해주세요.");
    return;
  }

  await createAutoSnapshot("과거 거래 수정 전");
  transactions[index] = updated;
  delete reimbursements[recordKey];
  if (reimbursement > 0) reimbursements[updated.recordKey] = Math.min(amount, reimbursement);
  editingDetailBulkRecordKey = "";
  await saveTransactions();
  await saveReimbursements();
  setDetailBulkFeedback("과거 거래를 수정했습니다.", "success");
  reclassify();
}

async function deleteDetailBulkRecord(recordKey) {
  if (!confirm("이 과거 거래 기록을 삭제할까요?")) return;
  await createAutoSnapshot("과거 거래 삭제 전");
  transactions = transactions.filter((item) => normalizeStoredTransaction(item).recordKey !== recordKey);
  delete reimbursements[recordKey];
  editingDetailBulkRecordKey = "";
  await saveTransactions();
  await saveReimbursements();
  setDetailBulkFeedback("과거 거래를 삭제했습니다.", "success");
  reclassify();
}

function updateDetailBulkSaveButton() {
  const allowDuplicates = Boolean(els.detailBulkAllowDuplicates?.checked);
  const count = detailBulkRows.filter((row) => row.valid && (allowDuplicates || !row.duplicate)).length;
  if (els.saveDetailBulkButton) els.saveDetailBulkButton.disabled = count === 0;
}

function renderDetailBulkStatus(row) {
  if (!row.valid) return `<span class="income-status error">${escapeHtml(row.error || "오류")}</span>`;
  if (row.duplicate) return `<span class="income-status warning">${escapeHtml(row.duplicateReason || "중복 가능")}</span>`;
  if (row.suggestion) return `<span class="income-status ok">추천 적용</span>`;
  return `<span class="income-status ok">정상</span>`;
}

function detailBulkSectorOptionsHtml(selected) {
  return detailBulkSectorOptions()
    .map((sector) => `<option value="${escapeHtml(sector)}" ${sector === selected ? "selected" : ""}>${escapeHtml(sector)}</option>`)
    .join("");
}

function detailBulkSubcategoryOptionsHtml(sector, selected) {
  const options = categories[sector] || ["미분류"];
  return options
    .map((subcategory) => `<option value="${escapeHtml(subcategory)}" ${subcategory === selected ? "selected" : ""}>${escapeHtml(subcategory)}</option>`)
    .join("");
}

function detailBulkSourceTypeOptionsHtml(selected) {
  const options = ["manual", "card", "transfer", "cash", "other"];
  return options
    .map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(sourceTypeLabel(value))}</option>`)
    .join("");
}

function setDetailBulkFeedback(message, type = "success") {
  if (!els.detailBulkFeedback) return;
  els.detailBulkFeedback.textContent = message || "";
  els.detailBulkFeedback.className = `bulk-feedback ${type}`;
}

function detailBulkRowId(lineNumber) {
  return `detail-bulk-${Date.now()}-${lineNumber}-${Math.random().toString(36).slice(2, 6)}`;
}

function focusDetailRecord() {
  if (!detailFocusRecordKey || !els.detailGrid) return;
  requestAnimationFrame(() => {
    const target = els.detailGrid.querySelector(`[data-detail-record-key="${cssEscape(detailFocusRecordKey)}"]`);
    if (!target) return;
    target.classList.add("is-detail-focused");
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  });
}

function syncDetailFilterControls(activeRows, months) {
  const monthOptions = unique([
    ...months,
    detailFilters.month && detailFilters.month !== "all" ? detailFilters.month : "",
    currentMonthKey()
  ]).filter((month) => /^\d{4}-\d{2}$/.test(month)).sort();
  if (detailFilters.month !== "all" && !monthOptions.includes(detailFilters.month)) {
    detailFilters.month = monthOptions.at(-1) || currentMonthKey();
  }
  els.detailMonth.innerHTML = [
    `<option value="all">전체 기간</option>`,
    ...monthOptions.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`)
  ].join("");
  els.detailMonth.value = detailFilters.month || monthOptions.at(-1) || "all";

  const sectorOptions = unique([
    ...Object.keys(categories).filter((sector) => sector !== "수입"),
    ...activeRows.map((item) => item.sector).filter(Boolean)
  ]).filter((sector) => sector !== "제외").sort((a, b) => a.localeCompare(b, "ko-KR"));
  if (detailFilters.sector !== "all" && !sectorOptions.includes(detailFilters.sector)) detailFilters.sector = "all";
  els.detailSector.innerHTML = [
    `<option value="all">전체 섹터</option>`,
    ...sectorOptions.map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`)
  ].join("");
  els.detailSector.value = detailFilters.sector;

  const subcategoryOptions = detailFilters.sector === "all"
    ? unique([
      ...Object.entries(categories).filter(([sector]) => sector !== "수입").flatMap(([, subcategories]) => subcategories),
      ...activeRows.map((item) => item.subcategory).filter(Boolean)
    ]).sort((a, b) => a.localeCompare(b, "ko-KR"))
    : unique([
      ...(categories[detailFilters.sector] || []),
      ...activeRows.filter((item) => item.sector === detailFilters.sector).map((item) => item.subcategory).filter(Boolean)
    ]).sort((a, b) => a.localeCompare(b, "ko-KR"));
  if (detailFilters.subcategory !== "all" && !subcategoryOptions.includes(detailFilters.subcategory)) detailFilters.subcategory = "all";
  els.detailSubcategory.innerHTML = [
    `<option value="all">전체 세부항목</option>`,
    ...subcategoryOptions.map((subcategory) => `<option value="${escapeHtml(subcategory)}">${escapeHtml(subcategory)}</option>`)
  ].join("");
  els.detailSubcategory.value = detailFilters.subcategory;
  els.detailSearch.value = detailFilters.search;
  els.detailSort.value = detailFilters.sort;
  els.detailEntryType.value = detailFilters.entryType || "actual";
  els.detailUnknownOnly.checked = detailFilters.unknownOnly;
  els.detailReimbursedOnly.checked = detailFilters.reimbursedOnly;
  els.detailHideZero.checked = detailFilters.hideZero;
}

function readDetailFilterControls() {
  detailFocusRecordKey = "";
  detailExpandedSectionKey = "";
  detailFilters.month = els.detailMonth.value || "all";
  detailFilters.sector = els.detailSector.value || "all";
  detailFilters.subcategory = els.detailSubcategory.value || "all";
  detailFilters.search = els.detailSearch.value.trim();
  detailFilters.sort = els.detailSort.value || "amount-desc";
  detailFilters.entryType = els.detailEntryType.value || "actual";
  detailFilters.unknownOnly = els.detailUnknownOnly.checked;
  detailFilters.reimbursedOnly = els.detailReimbursedOnly.checked;
  detailFilters.hideZero = els.detailHideZero.checked;
  if (detailFilters.unknownOnly) {
    detailFilters.sector = "미분류";
    detailFilters.subcategory = "all";
  }
}

function filteredDetailRows(activeRows) {
  const search = normalizeKeyText(detailFilters.search);
  return sortTransactionRows(activeRows.filter((item) => {
    if (detailFocusRecordKey && item.recordKey === detailFocusRecordKey) return true;
    if (detailFilters.month !== "all" && item.month !== detailFilters.month) return false;
    if (detailFilters.unknownOnly && item.sector !== "미분류") return false;
    if (!detailFilters.unknownOnly && detailFilters.sector !== "all" && item.sector !== detailFilters.sector) return false;
    if (detailFilters.subcategory !== "all" && item.subcategory !== detailFilters.subcategory) return false;
    if (detailFilters.reimbursedOnly && reimbursementFor(item) <= 0) return false;
    if (detailFilters.hideZero && actualAmount(item) <= 0) return false;
    if (!search) return true;
    return normalizeKeyText([
      item.approvalDate,
      item.approvalTime,
      item.merchant,
      item.sector,
      item.subcategory,
      item.sourceFile
    ].join(" ")).includes(search);
  }), detailFilters.sort);
}

function filteredDetailScheduledRows() {
  const month = detailFilters.month === "all" ? currentMonthKey() : detailFilters.month;
  const search = normalizeKeyText(detailFilters.search);
  return recurringOccurrencesForMonth(month, { showHidden: true }).filter((item) => {
    if (item.posted) return false;
    if (detailFilters.unknownOnly) return false;
    if (detailFilters.sector !== "all" && item.sector !== detailFilters.sector) return false;
    if (detailFilters.subcategory !== "all" && item.subcategory !== detailFilters.subcategory) return false;
    if (!search) return true;
    return normalizeKeyText([item.date, item.name, item.sector, item.subcategory, item.paymentType, item.memo].join(" ")).includes(search);
  });
}

function renderDetailMetrics(rows, scheduledRows = []) {
  const totalPayment = sum(rows, "amount");
  const reimbursementTotal = sumReimbursements(rows);
  const actualTotal = sumActual(rows);
  const scheduledTotal = sum(scheduledRows, "amount");
  const top = [...rows].sort((a, b) => actualAmount(b) - actualAmount(a))[0];
  const average = rows.length ? Math.round(actualTotal / rows.length) : 0;
  return [
    renderDetailMetric("총 결제액", formatWon(totalPayment), "필터 내 결제 합계", "navy", { priority: true }),
    renderDetailMetric("실 지출액", formatWon(actualTotal), "총 결제액 - 정산받은 금액", "green", { priority: true }),
    renderDetailMetric("최고 지출", formatWon(top ? actualAmount(top) : 0), top ? top.merchant : "거래 없음", "navy", { priority: true }),
    renderDetailMetric("필터 내 거래", `${rows.length.toLocaleString("ko-KR")}건`, "현재 조건에 맞는 지출 건수", "blue", { compact: true }),
    renderDetailMetric("정산받은 금액", formatWon(reimbursementTotal), "수정 가능한 정산 합계", "mint", { compact: true }),
    renderDetailMetric("예정 지출", formatWon(scheduledTotal), `${scheduledRows.length.toLocaleString("ko-KR")}건 · 실제 합산 제외`, "blue", { compact: true }),
    renderDetailMetric("평균 실지출", formatWon(average), "거래 1건당 평균", "red", { compact: true })
  ].join("");
}

function renderDetailMetric(label, value, hint, tone, options = {}) {
  const extraClass = [
    options.priority ? "priority-metric" : "",
    options.compact ? "compact-metric" : ""
  ].filter(Boolean).join(" ");
  const classSuffix = extraClass ? ` ${extraClass}` : "";
  return `
    <article class="board-metric ${escapeHtml(tone)}${classSuffix}">
      <span class="metric-dot"></span>
      <div>
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <em>${escapeHtml(hint)}</em>
      </div>
    </article>
  `;
}

function renderDetailGrid(rows, selectedMonth) {
  const sectionStats = buildDetailSectionStats(rows);
  const filterText = detailFilterSummaryText(rows.length);
  if (!sectionStats.length) {
    return `
      <section class="detail-results-panel">
        <div class="panel-head">
          <div>
            <h3>거래 상세 카드</h3>
            <p>${escapeHtml(filterText)}</p>
          </div>
        </div>
        <div class="empty">현재 조건에 맞는 거래가 없습니다. 섹터와 세부항목을 선택하면 빈 카드에서도 바로 입력할 수 있습니다.</div>
      </section>
    `;
  }

  if (detailExpandedSectionKey) {
    const expanded = sectionStats.find((stat) => stat.section.key === detailExpandedSectionKey);
    if (expanded) return renderDetailExpandedSection(expanded, selectedMonth, filterText);
    detailExpandedSectionKey = "";
    detailInstallmentEditRecordKey = "";
  }
  detailInstallmentEditRecordKey = "";

  const limit = detailFocusRecordKey ? 0 : 8;
  return `
    <section class="detail-results-panel">
      <div class="panel-head">
        <div>
          <h3>거래 상세 카드</h3>
          <p>${escapeHtml(filterText)} · 섹터별 카드에서 내역을 훑어보고, 전체 보기에서 정산금과 할부 정보를 수정합니다.</p>
        </div>
      </div>
      <div class="category-grid detail-category-grid">
        ${sectionStats.map((stat) => renderLedgerSection(stat.section, stat.rows, selectedMonth, detailFilters.sort, {
          limit,
          fullViewButton: true,
          reimbursementHint: reimbursementEditMode
            ? "정산받은 금액을 입력하면 변경 내용이 바로 저장됩니다."
            : "정산받은 금액은 전체 보기에서 정산금 수정 버튼을 켠 뒤 수정할 수 있습니다."
        })).join("")}
      </div>
    </section>
  `;
}

function renderDetailExpandedSection(stat, selectedMonth, filterText) {
  if (detailInstallmentEditRecordKey && !stat.rows.some((row) => row.recordKey === detailInstallmentEditRecordKey)) {
    detailInstallmentEditRecordKey = "";
  }
  const total = sum(stat.rows, "amount");
  const reimbursementTotal = sumReimbursements(stat.rows);
  const actualTotal = sumActual(stat.rows);
  return `
    <section class="detail-results-panel detail-full-panel">
      <div class="panel-head detail-full-head">
        <div>
          <span class="detail-full-eyebrow">거래 상세 전체 보기</span>
          <h3>${escapeHtml(stat.section.title)}</h3>
          <p>${escapeHtml(filterText)} · ${stat.rows.length.toLocaleString("ko-KR")}건 전체 내역</p>
        </div>
        <button type="button" class="secondary-action detail-collapse-button" data-detail-collapse-section>전체 카드로 돌아가기</button>
      </div>
      <div class="detail-full-summary">
        <div><span>총 결제액</span><strong>${formatWon(total)}</strong></div>
        <div><span>정산받은 금액</span><strong>${formatWon(reimbursementTotal)}</strong></div>
        <div><span>실 지출액</span><strong>${formatWon(actualTotal)}</strong></div>
        <div><span>거래 수</span><strong>${stat.rows.length.toLocaleString("ko-KR")}건</strong></div>
      </div>
      <div class="detail-full-card">
        ${renderLedgerSection(stat.section, stat.rows, selectedMonth, detailFilters.sort, { fullMode: true })}
      </div>
    </section>
  `;
}

function attachDetailCardHandlers() {
  if (!els.detailGrid) return;
  els.detailGrid.querySelectorAll("[data-detail-expand-section]").forEach((button) => {
    button.addEventListener("click", () => {
      detailExpandedSectionKey = button.dataset.detailExpandSection || "";
      detailInstallmentEditRecordKey = "";
      renderDetailView();
      requestAnimationFrame(() => {
        els.detailGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  });
  els.detailGrid.querySelectorAll("[data-detail-collapse-section]").forEach((button) => {
    button.addEventListener("click", () => {
      detailExpandedSectionKey = "";
      detailInstallmentEditRecordKey = "";
      renderDetailView();
      requestAnimationFrame(() => {
        els.detailGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  });
  els.detailGrid.querySelectorAll("[data-detail-reimbursement-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      reimbursementEditMode = !reimbursementEditMode;
      renderDetailView();
    });
  });
  els.detailGrid.querySelectorAll("[data-detail-installment-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      detailInstallmentEditRecordKey = button.dataset.detailInstallmentEdit || "";
      renderDetailView();
    });
  });
}

function renderScheduledDetailPanel(rows) {
  if (!rows.length) {
    return `
      <section class="detail-results-panel scheduled-detail-panel">
        <div class="panel-head">
          <div>
            <h3>예정 지출</h3>
            <p>현재 조건에 맞는 예정 지출이 없습니다.</p>
          </div>
        </div>
        <div class="empty">고정 지출 탭에서 예정 지출을 등록하면 여기에 표시됩니다.</div>
      </section>
    `;
  }
  return `
    <section class="detail-results-panel scheduled-detail-panel">
      <div class="panel-head">
        <div>
          <h3>예정 지출</h3>
          <p>실제 지출 합계에는 포함되지 않는 고정 지출 예정 내역입니다.</p>
        </div>
        <strong>${formatWon(sum(rows, "amount"))}</strong>
      </div>
      <div class="scheduled-detail-list">
        ${rows.map((item) => `
          <article class="scheduled-detail-item">
            <div>
              <span class="scheduled-badge ${escapeHtml(item.postingStatusClass || "")}">${escapeHtml(item.postingStatusLabel || "예정")}</span>
              <strong>${escapeHtml(item.date)} · ${escapeHtml(item.name)}</strong>
              <p>${escapeHtml(item.paymentType || "카드")} · ${escapeHtml(item.memo || "메모 없음")}</p>
              <div class="timeline-tags">
                ${item.autoPost ? `<span class="scheduled-badge soft">자동 반영</span>` : `<span class="scheduled-badge muted">수동 반영</span>`}
                ${categoryChip(item.sector, item.subcategory)}
              </div>
            </div>
            <div class="scheduled-actions">
              <b>${formatWon(item.amount)}</b>
              ${item.canManualPost ? `<button type="button" data-post-recurring="${escapeHtml(item.id)}" data-post-month="${escapeHtml(item.month)}">실제 지출로 반영</button>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function buildDetailSectionStats(rows) {
  const buckets = buildBoardBuckets(rows);
  const candidateSections = detailCandidateSections(rows);
  const keepEmptyCards = Boolean((detailFilters.sector !== "all" || detailFilters.subcategory !== "all")
    && !detailFilters.search
    && !detailFilters.reimbursedOnly
    && !detailFilters.unknownOnly);
  return candidateSections
    .map((section) => buildBoardSectionStat(section, buckets[section.key] || []))
    .filter((stat) => keepEmptyCards || stat.count > 0)
    .sort((a, b) => {
      if (detailFilters.sort === "amount-asc") return a.actualTotal - b.actualTotal || a.section.title.localeCompare(b.section.title, "ko-KR");
      if (detailFilters.sort === "date" || detailFilters.sort === "recent") return a.section.title.localeCompare(b.section.title, "ko-KR");
      return b.actualTotal - a.actualTotal || b.count - a.count || a.section.title.localeCompare(b.section.title, "ko-KR");
    });
}

function detailCandidateSections(rows) {
  const baseSections = boardSections.filter((section) => section.key !== "etc-catchall");
  const sector = detailFilters.unknownOnly ? "미분류" : detailFilters.sector;
  if (sector !== "all" && detailFilters.subcategory !== "all") {
    const exact = baseSections.filter((section) =>
      section.sector === sector && section.subcategory === detailFilters.subcategory
    );
    if (exact.length) return exact;
    const fallback = baseSections.filter((section) =>
      section.sector === sector && section.match({ sector, subcategory: detailFilters.subcategory, merchant: "", amount: 1 })
    );
    return fallback.length ? fallback : baseSections.filter((section) => section.sector === sector);
  }
  if (sector !== "all") return baseSections.filter((section) => section.sector === sector);

  const usedKeys = new Set(rows.map((item) => (boardSections.find((section) => section.match(item)) || boardSections.at(-1)).key));
  return baseSections.filter((section) => usedKeys.has(section.key));
}

function detailFilterSummaryText(count) {
  const parts = [];
  parts.push(detailFilters.month === "all" ? "전체 기간" : detailFilters.month);
  if (detailFilters.unknownOnly) parts.push("미분류");
  else if (detailFilters.sector !== "all") parts.push(detailFilters.sector);
  if (detailFilters.subcategory !== "all") parts.push(detailFilters.subcategory);
  if (detailFilters.search) parts.push(`검색: ${detailFilters.search}`);
  if (detailFilters.reimbursedOnly) parts.push("정산금 있음");
  if (detailFilters.hideZero) parts.push("0원 제외");
  return `${parts.filter(Boolean).join(" · ")} · ${count.toLocaleString("ko-KR")}건`;
}
