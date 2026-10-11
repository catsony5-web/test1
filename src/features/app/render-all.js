function renderAll() {
  renderStatus();
  els.exportButton.disabled = classified.length === 0 || workbookExportInProgress;
  const viewName = document.querySelector(".view.active")?.id?.replace(/View$/, "");
  renderView(viewName);
}

function renderView(viewName) {
  const renderers = {
    board: renderBoard,
    monthlyAnalysis: renderMonthlyAnalysis,
    spendingStructure: renderSpendingStructureAnalysis,
    goals: renderGoals,
    monthly: renderMonthlyFlow,
    summary: renderSummary,
    details: renderDetailView,
    detailBulk: renderDetailBulkView,
    calendar: renderCalendar,
    income: renderIncomeView,
    recurring: renderRecurring,
    products: renderProducts,
    ipo: renderIpoView,
    unknown: renderUnknown,
    rules: renderRules,
    transactions: renderTransactions
  };
  renderers[viewName]?.();
}

function renderIncomeView() {
  renderIncomeEntries();
  renderIncomeBulkPreview(els.incomeBulkFeedback.textContent);
}

function renderStatus() {
  const active = reportingExpenseRows(classified);
  const unknown = active.filter((item) => item.status === "미분류");
  const total = sumConsumption(active);
  const importText = currentFileName
    ? `${currentFileName} · 추가 ${Number(importMeta.lastAddedCount || 0).toLocaleString("ko-KR")}건 / 중복 ${Number(importMeta.lastSkippedCount || 0).toLocaleString("ko-KR")}건`
    : "아직 불러온 파일 없음";
  els.fileName.textContent = importText;
  els.totalAmount.textContent = formatWon(total);
  els.transactionCount.textContent = `${classified.length.toLocaleString("ko-KR")}건`;
  els.unknownCount.textContent = `${unknown.length.toLocaleString("ko-KR")}건`;
  renderSaveStatus();
}
