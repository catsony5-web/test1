function attachBoardMetricHandlers() {
  els.boardMetrics.querySelectorAll("[data-open-income-month]").forEach((button) => {
    button.addEventListener("click", () => {
      openIncomeView({ month: button.dataset.openIncomeMonth || els.boardMonth.value, source: "board", scrollToRecords: true });
    });
  });
  els.boardMetrics.querySelectorAll("[data-board-core-month]").forEach((button) => {
    button.addEventListener("click", () => {
      openDetailView(boardDetailOptions({
        month: button.dataset.boardCoreMonth || els.boardMonth.value,
        sector: button.dataset.boardCoreSector || "all"
      }));
    });
  });
}

function boardLongTermMonthKeys(selectedMonth, count, offset = 0) {
  const anchor = isValidMonthKey(selectedMonth) ? selectedMonth : currentMonthKey();
  return Array.from({ length: count }, (_, index) => shiftMonthKey(anchor, offset - (count - 1 - index)));
}
