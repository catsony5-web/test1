let familySupportSelectedMonth = "";
let familySupportEditingReceipt = "";
let familySupportEditingAdjustment = "";
let familySupportFeedback = "";
let familySupportControlsReady = false;

function familySupportRecordId(item) {
  return String(item?.transactionId || item?.recordKey || "");
}

function familySupportStatus(amount) {
  return amount > 0 ? "초과 → 대출 상환 예정" : amount < 0 ? "부족" : "정산 완료";
}

function renderFamilySupportMetrics(model, compact = false) {
  const metrics = [
    ["이번 달 가족 부담", model.need, "고정 지출·대출 분담 예정"],
    ["이번 달 지원 입금", model.received, "지원 대상월 기준"],
    ["이번 달 차이", model.difference, model.difference > 0 ? "이달 필요액보다 더 받음" : model.difference < 0 ? "이달 필요액보다 덜 받음" : "이달 필요액과 일치"],
    ["누적 정산", model.settlementBalance, "대상월 누적 · 조정 포함"],
    ["보관 중인 지원금", model.cashHeld, "실제 입금·출금일 기준"],
    ["대출 상환 예정액", model.repaymentReserve, "누적 초과 입금에서 적립"]
  ];
  return `<dl class="family-metrics${compact ? " is-compact" : ""}">${metrics.map(([label, amount, note]) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${label === "이번 달 차이" || label === "누적 정산" ? formatSignedWon(amount) : formatWon(amount)}</dd><small>${escapeHtml(note)}</small></div>`).join("")}</dl>`;
}

function renderFamilyDashboard(month) {
  const root = document.querySelector("#familyDashboardCard");
  if (!root) return;
  const selectedMonth = isValidMonthKey(month) ? month : currentMonthKey();
  const model = buildFamilySupportModel(selectedMonth);
  root.className = "family-dashboard-card";
  root.innerHTML = `<div class="family-section-heading"><div><h3>이번 달 가족 정산</h3><p>${escapeHtml(selectedMonth)} · 누적 정산 기준 <span class="family-status${model.settlementBalance < 0 ? " is-short" : ""}">${escapeHtml(familySupportStatus(model.settlementBalance))}</span></p></div>
    <div class="family-actions"><button type="button" data-family-open="${escapeHtml(selectedMonth)}">내역·정산 보기</button><button type="button" class="primary-action" data-family-add="${escapeHtml(selectedMonth)}">지원 입금 기록</button></div></div>
    ${renderFamilySupportMetrics(model, true)}<p class="family-help">지원금은 일반 수입과 구분합니다. 아직 출금하지 않은 고정 지출은 보관 금액에 남아 있어 대출 상환 예정액과 다를 수 있습니다.</p>`;
}

function setupFamilySupportControls() {
  if (familySupportControlsReady) return;
  familySupportControlsReady = true;
  const dialog = document.createElement("dialog");
  dialog.id = "familySupportDialog";
  dialog.className = "family-support-dialog";
  dialog.setAttribute("aria-labelledby", "familySupportTitle");
  document.body.append(dialog);
  setupRecurringFamilyBurdenControls();
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("button");
    if (!button) return;
    if (button.hasAttribute("data-family-settings")) {
      openFamilySupportDialog(getSharedSelectedMonth(currentMonthKey()));
      const settings = dialog.querySelector(".family-keywords");
      settings.open = true;
      settings.scrollIntoView({ block: "start" });
    } else if (button.hasAttribute("data-family-add")) {
      openFamilySupportDialog(button.dataset.familyAdd || getSharedSelectedMonth(currentMonthKey()));
      dialog.querySelector('[name="receiptAmount"]')?.focus();
    } else if (button.hasAttribute("data-family-open")) {
      openFamilySupportDialog(button.dataset.familyOpen || getSharedSelectedMonth(currentMonthKey()));
    } else if (button.hasAttribute("data-family-close")) dialog.close();
    else if (button.hasAttribute("data-family-edit-receipt")) openFamilySupportDialog(familySupportSelectedMonth, { receiptId: button.dataset.familyEditReceipt });
    else if (button.hasAttribute("data-family-delete-receipt")) await deleteFamilySupportReceipt(button.dataset.familyDeleteReceipt);
    else if (button.hasAttribute("data-family-restore-income")) await restoreFamilySupportIncome(button.dataset.familyRestoreIncome);
    else if (button.hasAttribute("data-family-edit-adjustment")) openFamilySupportDialog(familySupportSelectedMonth, { adjustmentId: button.dataset.familyEditAdjustment });
    else if (button.hasAttribute("data-family-delete-adjustment")) await deleteFamilySupportAdjustment(button.dataset.familyDeleteAdjustment);
    else if (button.hasAttribute("data-family-cancel-edit")) openFamilySupportDialog(familySupportSelectedMonth);
  });
  dialog.addEventListener("change", (event) => {
    if (event.target.matches("[data-family-month]")) {
      openFamilySupportDialog(event.target.value);
      return;
    }
    if (event.target.name === "receiptTargetMonth") event.target.dataset.edited = "true";
    if (event.target.name === "receiptDate") {
      const target = dialog.querySelector('[name="receiptTargetMonth"]');
      if (target && !target.dataset.edited) target.value = monthKey(event.target.value);
    }
    updateFamilySupportReceiptPreview();
  });
  dialog.addEventListener("input", updateFamilySupportReceiptPreview);
  dialog.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (event.target.matches("[data-family-receipt-form]")) await saveFamilySupportReceipt(event.target);
      else if (event.target.matches("[data-family-adjustment-form]")) await saveFamilySupportAdjustment(event.target);
      else if (event.target.matches("[data-family-keywords-form]")) await saveFamilySupportKeywords(event.target);
    } catch {
      showFamilySupportFeedback("저장하지 못했습니다. 입력 내용을 유지했으니 다시 확인해주세요.");
    }
  });
}

function openFamilySupportDialog(month, options = {}) {
  if (!familySupportControlsReady) setupFamilySupportControls();
  familySupportSelectedMonth = isValidMonthKey(month) ? month : currentMonthKey();
  familySupportEditingReceipt = options.receiptId || "";
  familySupportEditingAdjustment = options.adjustmentId || "";
  familySupportFeedback = "";
  const dialog = document.querySelector("#familySupportDialog");
  if (!dialog.open) dialog.showModal();
  renderFamilySupport();
  if (familySupportEditingReceipt) dialog.querySelector('[name="receiptAmount"]')?.focus();
  if (familySupportEditingAdjustment) dialog.querySelector('[name="adjustmentAmount"]')?.focus();
}

function renderFamilySupport() {
  const dialog = document.querySelector("#familySupportDialog");
  if (!dialog?.open) return;
  const month = familySupportSelectedMonth || currentMonthKey();
  const model = buildFamilySupportModel(month);
  const receipt = transactions.find((item) => familySupportRecordId(item) === familySupportEditingReceipt && item.incomeKind === "familySupport");
  const adjustment = familyAdjustments.find((item) => item.id === familySupportEditingAdjustment);
  const receipts = model.receipts.filter((item) => item.targetMonth === month);
  const adjustments = model.adjustments.filter((item) => monthKey(item.date) === month);
  dialog.innerHTML = `<div class="family-dialog-content"><header class="family-section-heading"><div><h2 id="familySupportTitle">가족 지원 입금과 정산</h2><p>받은 돈과 가족이 부담할 지출을 함께 확인합니다.</p></div><button type="button" data-family-close aria-label="가족 지원 창 닫기">닫기</button></header>
    <label class="family-month-control">확인할 월<input type="month" data-family-month value="${escapeHtml(month)}"></label>
    ${renderFamilySupportMetrics(model)}
    <p class="family-help">이번 달 차이는 지원 대상월 기준입니다. 보관 중인 지원금은 실제 입출금일 기준이며, 아직 출금하지 않은 예정액은 차감하지 않습니다.</p>
    <p class="family-feedback" data-family-feedback role="status">${escapeHtml(familySupportFeedback)}</p>
    <section class="family-editor"><h3>${receipt ? "지원 입금 수정" : "지원 입금 기록"}</h3>
      <form data-family-receipt-form class="family-form-grid">
        <label>입금일<input name="receiptDate" type="date" required value="${escapeHtml(receipt?.approvalDate || defaultDateForMonth(month))}"></label>
        <label>입금액<input name="receiptAmount" type="text" inputmode="numeric" required value="${escapeHtml(receipt ? formatPlainNumber(receipt.amount) : "")}"></label>
        <label>보낸 사람 또는 별칭<input name="receiptSender" type="text" required value="${escapeHtml(receipt?.familySender || "")}"></label>
        <label>지원 대상월<input name="receiptTargetMonth" type="month" required${receipt ? ' data-edited="true"' : ""} value="${escapeHtml(receipt?.familyTargetMonth || month)}"></label>
        <label class="family-wide">메모<input name="receiptMemo" type="text" value="${escapeHtml(receipt?.memo || "")}"></label>
        <output class="family-wide family-help" data-family-receipt-preview></output>
        <div class="family-wide family-actions"><button class="primary-action" type="submit">${receipt ? "수정 저장" : "입금 저장"}</button>${receipt ? '<button type="button" data-family-cancel-edit>수정 취소</button>' : ""}</div>
      </form></section>
    <section class="family-ledger"><h3>이달 대상 지원 입금 <span>${receipts.length}건</span></h3>${receipts.length ? receipts.map(renderFamilySupportReceiptRow).join("") : '<p class="family-empty">이달을 지원 대상으로 기록한 입금이 없습니다.</p>'}</section>
    <details class="family-obligations"><summary>가족 부담 내역 <span>${model.obligations.length}건 · ${formatWon(model.need)}</span></summary>${model.obligations.map((item) => `<div class="family-ledger-row"><div><strong>${escapeHtml(item.name || "가족 부담 지출")}</strong><small>${escapeHtml(item.date || item.month)} · ${item.posted ? "기록된 출금" : "출금 예정"}</small></div><b>${formatWon(item.amount)}</b></div>`).join("") || '<p class="family-empty">등록된 가족 부담 내역이 없습니다.</p>'}</details>
    ${renderFamilySupportAdjustmentEditor(adjustment, adjustments, month)}
    <details class="family-keywords"><summary>입금 자동 분류 설정</summary><form data-family-keywords-form class="family-form-grid"><label class="family-wide">가족 지원 입금 키워드<textarea name="keywords" rows="3" placeholder="입금 내용에 사용할 키워드를 한 줄에 하나씩 입력">${escapeHtml((appSettings.familySupportKeywords || []).join("\n"))}</textarea></label><p class="family-wide family-help">설정한 키워드가 포함된 새 입금을 가족 지원으로 분류합니다. 직접 선택한 분류가 우선하며 기존 거래는 자동으로 바꾸지 않습니다.</p><button type="submit" class="primary-action">키워드 저장</button></form></details>
  </div>`;
  updateFamilySupportReceiptPreview();
}

function renderFamilySupportReceiptRow(item) {
  const id = familySupportRecordId(item);
  return `<article class="family-ledger-row"><div><strong>${escapeHtml(item.familySender || item.merchant || "가족 지원 입금")}</strong><small>${escapeHtml(item.receiptDate || item.approvalDate)} 입금 · ${escapeHtml(item.targetMonth)} 대상${item.legacy ? " · 기존 대출 분담 기록" : ""}</small>${item.memo ? `<p>${escapeHtml(item.memo)}</p>` : ""}</div>
    <b>${formatWon(item.amount)}</b>${item.legacy ? '<small>기존 대출 상환 내역에서 수정할 수 있습니다.</small>' : `<div class="family-actions"><button type="button" data-family-edit-receipt="${escapeHtml(id)}">수정</button><button type="button" data-family-restore-income="${escapeHtml(id)}">일반 수입으로</button><button type="button" data-family-delete-receipt="${escapeHtml(id)}">삭제</button></div>`}</article>`;
}

function renderFamilySupportAdjustmentEditor(adjustment, rows, month) {
  const loans = transactions.filter((item) => item.flow !== "income" && isLoanRepaymentTransaction(item) && !isCanceled(item.cancel));
  const purposeLabels = { loan_payment: "대출 상환", return: "지원금 반환", other: "기타 보정" };
  return `<details class="family-adjustments"${adjustment ? " open" : ""}><summary>정산 조정·대출 상환 <span>${rows.length}건</span></summary>
    <p class="family-help">실제 대출 출금에 연결한 조정만 상환에 반영됩니다. 아직 연결하지 않은 조정은 확인 대기로 남으며 합계에 반영하지 않습니다. 반환은 음수, 추가 보정은 부호를 포함해 입력하세요.</p>
    <form data-family-adjustment-form class="family-form-grid"><label>날짜<input name="adjustmentDate" type="date" required value="${escapeHtml(adjustment?.date || defaultDateForMonth(month))}"></label><label>보정 금액 (±)<input name="adjustmentAmount" type="text" inputmode="decimal" required value="${escapeHtml(adjustment ? formatPlainNumber(adjustment.amount) : "")}"></label>
      <label>용도<select name="adjustmentPurpose">${Object.entries(purposeLabels).map(([value, label]) => `<option value="${value}"${(adjustment?.purpose || "loan_payment") === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
      <label>실제 대출 출금 연결<select name="linkedLoanTransactionId"><option value="">연결하지 않음 · 확인 대기</option>${loans.map((item) => `<option value="${escapeHtml(familySupportRecordId(item))}"${adjustment?.linkedLoanTransactionId === familySupportRecordId(item) ? " selected" : ""}>${escapeHtml(item.approvalDate)} · ${escapeHtml(item.merchant || "대출 상환")} · ${formatWon(item.amount)}</option>`).join("")}</select></label>
      <label class="family-wide">메모<input name="adjustmentMemo" type="text" value="${escapeHtml(adjustment?.memo || "")}"></label><div class="family-wide family-actions"><button type="submit" class="primary-action">${adjustment ? "조정 수정" : "조정 저장"}</button>${adjustment ? '<button type="button" data-family-cancel-edit>수정 취소</button>' : ""}</div></form>
    ${rows.map((item) => `<article class="family-ledger-row"><div><strong>${escapeHtml(purposeLabels[item.purpose] || "기타 보정")}</strong><small>${escapeHtml(item.date)} 기록 · ${item.status === "applied" ? "반영됨" : item.status === "pending" ? "확인 대기" : "확인 필요"}${item.status === "applied" && item.effectiveDate ? ` · 적용일 ${escapeHtml(item.effectiveDate)}` : ""}</small>${item.reason ? `<p>${escapeHtml(item.reason)}</p>` : ""}${item.memo ? `<p>${escapeHtml(item.memo)}</p>` : ""}</div><b>${formatSignedWon(item.amount)}</b><div class="family-actions"><button type="button" data-family-edit-adjustment="${escapeHtml(item.id)}">수정</button><button type="button" data-family-delete-adjustment="${escapeHtml(item.id)}">삭제</button></div></article>`).join("")}
  </details>`;
}

function showFamilySupportFeedback(message) {
  familySupportFeedback = message;
  const output = document.querySelector("[data-family-feedback]");
  if (output) output.textContent = message;
}

function updateFamilySupportReceiptPreview() {
  const form = document.querySelector("[data-family-receipt-form]");
  if (!form) return;
  const month = form.elements.receiptTargetMonth.value || monthKey(form.elements.receiptDate.value);
  const amount = toNumber(form.elements.receiptAmount.value);
  const output = form.querySelector("[data-family-receipt-preview]");
  if (!isValidMonthKey(month) || amount <= 0) { output.textContent = "입금액을 입력하면 저장 후 월별 정산을 미리 볼 수 있습니다."; return; }
  const date = normalizeInputDate(form.elements.receiptDate.value);
  if (!date) return;
  const original = transactions.find((item) => familySupportRecordId(item) === familySupportEditingReceipt);
  const draft = { ...(original || {}), transactionId: original?.transactionId || "family-receipt-preview", recordKey: original?.recordKey || "family-receipt-preview", flow: "income", incomeKind: "familySupport", approvalDate: date, month: monthKey(date), familyTargetMonth: month, amount };
  const next = original ? transactions.map((item) => familySupportRecordId(item) === familySupportEditingReceipt ? draft : item) : [...transactions, draft];
  const model = buildFamilySupportModel(month, { transactions: next });
  output.textContent = `저장 후 ${month} 지원 입금 ${formatWon(model.received)} · 가족 부담 ${formatWon(model.need)} · 차이 ${formatSignedWon(model.difference)} · 누적 정산 ${formatSignedWon(model.settlementBalance)}`;
}

async function saveFamilySupportReceipt(form) {
  return runManualTransactionSave(async () => {
    const date = normalizeInputDate(form.elements.receiptDate.value);
    const amount = toNumber(form.elements.receiptAmount.value);
    const sender = form.elements.receiptSender.value.trim();
    const targetMonth = form.elements.receiptTargetMonth.value || monthKey(date);
    if (!date || amount <= 0 || !sender || !isValidMonthKey(targetMonth)) { showFamilySupportFeedback("입금일, 양수 금액, 보낸 사람과 대상월을 확인해주세요."); return; }
    const original = transactions.find((item) => familySupportRecordId(item) === familySupportEditingReceipt && item.incomeKind === "familySupport");
    if (familySupportEditingReceipt && !original) { showFamilySupportFeedback("수정할 입금이 없어졌습니다. 창을 다시 열어주세요."); return; }
    if (original && amount < loanSupportLinkedIncomeAmount(familySupportRecordId(original))) { showFamilySupportFeedback("연결된 대출 분담액보다 적게 저장할 수 없습니다. 대출 상환의 연결 금액을 먼저 확인해주세요."); return; }
    const base = original || buildManualTransaction({ sourceType: "transfer", flow: "income", date, time: "", merchant: sender, amount, sector: "수입", subcategory: "이체입금" });
    const updated = normalizeStoredTransaction({ ...base, approvalDate: date, month: monthKey(date), amount, incomeKind: "familySupport", incomeKindSource: "manual", familySender: sender, familyTargetMonth: targetMonth, memo: form.elements.receiptMemo.value.trim(), updatedAt: new Date().toISOString() });
    const next = original ? transactions.map((item) => {
      if (familySupportRecordId(item) === familySupportRecordId(original)) return updated;
      return item.loanSupportIncomeTransactionId === familySupportRecordId(original) ? { ...item, loanSupportReceivedDate: date } : item;
    }) : mergeTransactions(transactions, [updated]).records;
    await createAutoSnapshot(original ? "가족 지원 입금 수정 전" : "가족 지원 입금 저장 전");
    if (!await safeSaveMany([{ key: RECORD_STORAGE_KEY, data: next, protectIncomeRecords: true }])) return;
    transactions = next;
    familySupportSelectedMonth = targetMonth;
    familySupportEditingReceipt = "";
    familySupportFeedback = "가족 지원 입금을 저장했습니다.";
    reclassify();
  });
}

async function deleteFamilySupportReceipt(id) {
  return runManualTransactionSave(async () => {
    const item = transactions.find((record) => familySupportRecordId(record) === id && record.incomeKind === "familySupport");
    if (!item) return;
    if (loanSupportLinkedIncomeAmount(id) > 0) { showFamilySupportFeedback("연결된 대출 분담금이 있습니다. 대출 상환에서 입금 연결을 먼저 해제해주세요."); return; }
    if (!confirm("이 가족 지원 입금 기록을 삭제할까요?")) return;
    await createAutoSnapshot("가족 지원 입금 삭제 전");
    const next = transactions.filter((record) => familySupportRecordId(record) !== id);
    if (!await safeSaveMany([{ key: RECORD_STORAGE_KEY, data: next, protectIncomeRecords: true, allowIncomeDrop: true }])) return;
    transactions = next;
    familySupportEditingReceipt = "";
    familySupportFeedback = "입금 기록을 삭제했습니다.";
    reclassify();
  });
}

async function restoreFamilySupportIncome(id) {
  return runManualTransactionSave(async () => {
    if (!confirm("이 입금을 일반 수입으로 되돌릴까요? 원래 날짜와 금액은 유지됩니다.")) return;
    const next = transactions.map((item) => familySupportRecordId(item) === id && item.incomeKind === "familySupport" ? normalizeStoredTransaction({ ...item, incomeKind: "normal", incomeKindSource: "manual", familyTargetMonth: "", familySender: "" }) : item);
    await createAutoSnapshot("가족 지원을 일반 수입으로 전환 전");
    if (!await safeSaveMany([{ key: RECORD_STORAGE_KEY, data: next, protectIncomeRecords: true }])) return;
    transactions = next;
    familySupportEditingReceipt = "";
    familySupportFeedback = "일반 수입으로 되돌렸습니다.";
    reclassify();
  });
}

async function saveFamilySupportAdjustment(form) {
  return runManualTransactionSave(async () => {
    const date = normalizeInputDate(form.elements.adjustmentDate.value);
    const amount = toNumber(form.elements.adjustmentAmount.value);
    const purpose = form.elements.adjustmentPurpose.value;
    if (!date || !amount || ((purpose === "loan_payment" || purpose === "return") && amount >= 0)) { showFamilySupportFeedback("날짜와 보정 금액을 확인해주세요. 대출 상환·지원금 반환은 음수로 입력합니다."); return; }
    const original = familyAdjustments.find((item) => item.id === familySupportEditingAdjustment);
    if (familySupportEditingAdjustment && !original) { showFamilySupportFeedback("수정할 조정이 없어졌습니다. 다시 확인해주세요."); return; }
    const now = new Date().toISOString();
    const adjustment = normalizeFamilyAdjustment({ ...original, id: original?.id || `family-adjustment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date, amount, purpose, memo: form.elements.adjustmentMemo.value.trim(), linkedLoanTransactionId: purpose === "loan_payment" ? form.elements.linkedLoanTransactionId.value : "", createdAt: original?.createdAt || now, updatedAt: now });
    const next = original ? familyAdjustments.map((item) => item.id === original.id ? adjustment : item) : [...familyAdjustments, adjustment];
    const evaluated = buildFamilySupportModel(monthKey(date), { adjustments: next }).adjustments;
    const preview = evaluated.find((item) => item.id === adjustment.id);
    if (!preview || preview.status === "invalid") { showFamilySupportFeedback(preview?.reason || "조정 내용을 확인해주세요."); return; }
    const previouslyApplied = new Set(buildFamilySupportModel(monthKey(date)).adjustments.filter((item) => item.status === "applied").map((item) => item.id));
    if (evaluated.some((item) => item.id !== adjustment.id && item.status === "invalid" && previouslyApplied.has(item.id))) { showFamilySupportFeedback("이 변경으로 이미 반영된 다른 상환 조정이 한도를 초과합니다. 연결된 조정 금액을 함께 확인해주세요."); return; }
    await createAutoSnapshot("가족 지원 조정 저장 전");
    if (!await safeSaveMany([{ key: FAMILY_ADJUSTMENTS_STORAGE_KEY, data: next }])) return;
    familyAdjustments = next;
    familySupportEditingAdjustment = "";
    familySupportSelectedMonth = monthKey(date);
    familySupportFeedback = preview.status === "pending" ? "확인 대기로 저장했습니다. 실제 대출 출금에 연결하면 반영됩니다." : "정산 조정을 저장했습니다.";
    renderAll();
  });
}

async function deleteFamilySupportAdjustment(id) {
  return runManualTransactionSave(async () => {
    if (!confirm("이 정산 조정을 삭제할까요? 연결된 실제 대출 출금은 유지됩니다.")) return;
    await createAutoSnapshot("가족 지원 조정 삭제 전");
    const next = familyAdjustments.filter((item) => item.id !== id);
    if (!await safeSaveMany([{ key: FAMILY_ADJUSTMENTS_STORAGE_KEY, data: next }])) return;
    familyAdjustments = next;
    familySupportEditingAdjustment = "";
    familySupportFeedback = "정산 조정을 삭제했습니다.";
    renderAll();
  });
}

async function saveFamilySupportKeywords(form) {
  return runManualTransactionSave(async () => {
    const keywords = [...new Set(form.elements.keywords.value.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean))];
    const next = normalizeAppSettings({ ...appSettings, familySupportKeywords: keywords });
    await createAutoSnapshot("가족 지원 입금 키워드 수정 전");
    if (!await safeSaveMany([{ key: SETTINGS_STORAGE_KEY, data: next }])) return;
    appSettings = next;
    showFamilySupportFeedback("키워드를 저장했습니다. 이후 가져오는 입금부터 적용합니다.");
  });
}
