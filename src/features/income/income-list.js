function renderIncomeEntries() {
  updateIncomeReturnButton();
  const allIncomeRows = classified
    .filter((item) => item.flow === "income" && item.status !== "취소/제외")
    .sort((a, b) => `${b.approvalDate} ${b.approvalTime}`.localeCompare(`${a.approvalDate} ${a.approvalTime}`, "ko-KR"));
  const monthlyRows = buildMonthlyFlowRows();
  updateIncomeMonthOptions(allIncomeRows, monthlyRows);
  renderIncomeSummary(allIncomeRows, monthlyRows);

  const selectedMonth = els.incomeMonthFilter.value || "all";
  if (els.incomeRecordTitle) {
    els.incomeRecordTitle.textContent = selectedMonth === "all" ? "전체 수입 기록" : `${selectedMonth} 수입 기록`;
  }
  const search = normalizeSearchText(els.incomeSearchInput.value);
  const sortMode = els.incomeSortSelect.value || "date-desc";
  const incomeRows = allIncomeRows
    .filter((item) => selectedMonth === "all" || item.month === selectedMonth)
    .filter((item) => matchesRecordSearch(item, search, ["수입", item.subcategory || ""]))
    .sort((a, b) => sortIncomeRows(a, b, sortMode));

  if (!allIncomeRows.length) {
    els.incomeEntryList.innerHTML = `<div class="empty compact-empty">입력된 수입 기록이 없습니다.</div>`;
    return;
  }

  if (!incomeRows.length) {
    els.incomeEntryList.innerHTML = `<div class="empty compact-empty">선택한 조건에 맞는 수입 기록이 없습니다.</div>`;
    return;
  }

  els.incomeEntryList.innerHTML = incomeRows.map((item) => `
    <article class="income-entry-item ${editingIncomeKey === item.recordKey ? "editing" : ""}">
      ${editingIncomeKey === item.recordKey ? renderIncomeEditForm(item) : renderIncomeDisplayRow(item)}
    </article>
  `).join("");
  attachIncomeEntryHandlers();
}

function updateIncomeMonthOptions(incomeRows, monthlyRows) {
  const requested = preferredIncomeMonth || els.incomeMonthFilter.value || currentMonthKey();
  const months = unique([
    ...monthlyRows.map((row) => row.month),
    ...incomeRows.map((item) => item.month)
  ].filter(Boolean)).sort().reverse();
  const options = [
    "all",
    ...months
  ];
  els.incomeMonthFilter.innerHTML = [
    `<option value="all">전체 보기</option>`,
    ...months.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`)
  ].join("");
  const nextValue = options.includes(requested)
    ? requested
    : (months[0] || "all");
  els.incomeMonthFilter.value = nextValue;
  preferredIncomeMonth = nextValue;
}

function renderIncomeSummary(incomeRows, monthlyRows) {
  const selectedMonth = els.incomeMonthFilter.value || "all";
  const latestFlowMonth = monthlyRows[monthlyRows.length - 1]?.month || currentMonthKey();
  const baseMonth = selectedMonth === "all" ? latestFlowMonth : selectedMonth;
  const selectedFlow = monthlyRows.find((row) => row.month === baseMonth);
  const visibleIncomeRows = selectedMonth === "all"
    ? incomeRows
    : incomeRows.filter((item) => item.month === selectedMonth);
  const recentIncome = [...visibleIncomeRows]
    .sort((a, b) => `${b.approvalDate} ${b.approvalTime}`.localeCompare(`${a.approvalDate} ${a.approvalTime}`, "ko-KR"))[0];
  const totalIncome = selectedMonth === "all"
    ? sum(monthlyRows, "income")
    : Number(selectedFlow?.income || 0);
  const monthIncome = Number(selectedFlow?.income || 0);
  const summaryMonthLabel = selectedMonth === "all" ? `${baseMonth} 기준` : selectedMonth;

  els.incomeSummaryCards.innerHTML = [
    renderIncomeSummaryCard(selectedMonth === "all" ? "최근 월 수입" : "선택 월 수입", formatWon(monthIncome), summaryMonthLabel),
    renderIncomeSummaryCard("누적 수입", formatWon(totalIncome), selectedMonth === "all" ? "전체 기간" : "선택 월 기준"),
    renderIncomeSummaryCard("최근 수입일", recentIncome?.approvalDate || "-", recentIncome ? recentIncome.merchant : "기록 없음"),
    renderIncomeSummaryCard("최근 수입 금액", recentIncome ? formatWon(recentIncome.amount) : "0원", recentIncome ? "최근 입력/가져오기 항목" : "기록 없음"),
    renderIncomeSummaryCard("수입 건수", `${visibleIncomeRows.length.toLocaleString("ko-KR")}건`, selectedMonth === "all" ? "전체 기록" : "선택 월 기록")
  ].join("");
}

function renderIncomeSummaryCard(label, value, hint) {
  return `
    <article class="income-summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `;
}

function sortIncomeRows(a, b, mode) {
  if (mode === "date-asc") {
    return `${a.approvalDate} ${a.approvalTime}`.localeCompare(`${b.approvalDate} ${b.approvalTime}`, "ko-KR");
  }
  if (mode === "amount-desc") return Number(b.amount || 0) - Number(a.amount || 0);
  if (mode === "amount-asc") return Number(a.amount || 0) - Number(b.amount || 0);
  return `${b.approvalDate} ${b.approvalTime}`.localeCompare(`${a.approvalDate} ${a.approvalTime}`, "ko-KR");
}

function renderIncomeDisplayRow(item) {
  return `
    <span>${escapeHtml(item.approvalDate)}</span>
    <strong title="${escapeHtml(item.merchant)}">${escapeHtml(item.merchant)}</strong>
    <b>${formatWon(item.amount)}</b>
    <div class="income-entry-actions">
      <button type="button" data-edit-income="${escapeHtml(item.recordKey)}">수정</button>
      <button type="button" class="income-delete-button" data-delete-income="${escapeHtml(item.recordKey)}">삭제</button>
    </div>
  `;
}

function renderIncomeEditForm(item) {
  return `
    <input data-income-edit-field="date" type="date" value="${escapeHtml(normalizeInputDate(item.approvalDate))}" aria-label="수입 날짜 수정">
    <input data-income-edit-field="merchant" type="text" value="${escapeHtml(item.merchant)}" aria-label="수입 내용 수정">
    <input data-income-edit-field="amount" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(item.amount))}" aria-label="수입 금액 수정">
    <div class="income-entry-actions">
      <button type="button" class="primary-action" data-save-income="${escapeHtml(item.recordKey)}">저장</button>
      <button type="button" data-cancel-income-edit>취소</button>
    </div>
  `;
}

function attachIncomeEntryHandlers() {
  els.incomeEntryList.querySelectorAll("[data-edit-income]").forEach((button) => {
    button.addEventListener("click", () => {
      editingIncomeKey = button.dataset.editIncome;
      renderIncomeEntries();
    });
  });
  els.incomeEntryList.querySelectorAll("[data-cancel-income-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      editingIncomeKey = "";
      renderIncomeEntries();
    });
  });
  els.incomeEntryList.querySelectorAll("[data-save-income]").forEach((button) => {
    button.addEventListener("click", () => saveIncomeEntryEdit(button.dataset.saveIncome));
  });
  els.incomeEntryList.querySelectorAll("[data-delete-income]").forEach((button) => {
    button.addEventListener("click", () => deleteIncomeEntry(button.dataset.deleteIncome));
  });
}

async function saveIncomeEntryEdit(recordKey) {
  const card = els.incomeEntryList.querySelector(`[data-save-income="${cssEscape(recordKey)}"]`)?.closest(".income-entry-item");
  if (!card) return;
  const date = normalizeInputDate(card.querySelector('[data-income-edit-field="date"]')?.value);
  const merchant = card.querySelector('[data-income-edit-field="merchant"]')?.value.trim();
  const amount = toNumber(card.querySelector('[data-income-edit-field="amount"]')?.value);
  if (!date || !merchant || !amount) {
    alert("수입 날짜, 내용, 금액을 모두 입력해주세요.");
    return;
  }

  const index = transactions.findIndex((item) => item.recordKey === recordKey);
  if (index < 0) return;
  await createAutoSnapshot("수입 수정 전");
  const original = normalizeStoredTransaction(transactions[index]);
  const updated = {
    ...original,
    sourceType: original.sourceType || "transfer",
    flow: "income",
    approvalDate: date,
    month: monthKey(date),
    merchant,
    amount: Math.abs(amount),
    manualSector: "수입",
    manualSubcategory: "이체입금",
    sourceFile: original.sourceFile || "수입 직접 입력",
    importedAt: original.importedAt || new Date().toISOString()
  };
  updated.recordKey = createRecordKey(updated);
  const duplicated = transactions.some((item, itemIndex) => itemIndex !== index && normalizeStoredTransaction(item).recordKey === updated.recordKey);
  if (duplicated) {
    alert("같은 수입 기록이 이미 있습니다. 날짜, 내용, 금액을 확인해주세요.");
    return;
  }

  transactions[index] = updated;
  editingIncomeKey = "";
  await saveTransactions();
  reclassify();
}

async function deleteIncomeEntry(recordKey) {
  if (!confirm("이 수입 기록을 삭제할까요?")) return;
  await createAutoSnapshot("수입 삭제 전");
  transactions = transactions.filter((item) => item.recordKey !== recordKey);
  editingIncomeKey = "";
  await saveTransactions({ allowIncomeDrop: true });
  reclassify();
}
