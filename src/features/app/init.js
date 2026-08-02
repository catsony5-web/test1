function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  if (!["http:", "https:"].includes(location.protocol)) return;

  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // The app still works without offline caching when opened directly as a file.
  });
}

async function init() {
  await hydrateStoredData();
  await migrateCategorySystem();
  await ensureAutoPostedRecurringExpenses();
  fillCategorySelects(els.ruleSector, els.ruleSubcategory);
  fillCategorySelects(els.manualSector, els.manualSubcategory, { sector: "식비", subcategory: "외식-혼자" });
  fillDetailBulkCategoryControls();
  fillRecurringCategorySelects();
  syncManualCategoryControls();
  els.incomeEntryDate.value = defaultDateForMonth(currentMonthKey());
  els.recurringStartMonth.value = currentMonthKey();
  els.loanStartMonth.value = currentMonthKey();
  await saveRules();

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
  setupAdminMenu();
  setupMobileNavigation();
  setupAppearanceControls();
  setupMonthlyAnalysisControls();
  setupSpendingStructureControls();

  els.fileInput.addEventListener("change", handleFile);
  els.exportButton.addEventListener("click", exportWorkbook);
  els.backupButton.addEventListener("click", backupLocalData);
  els.restoreInput.addEventListener("change", restoreLocalData);
  els.clearRecordsButton.addEventListener("click", clearRecords);
  els.selectAllDataScopesButton?.addEventListener("click", () => setDataScopeSelection("all"));
  els.selectImportedDataScopeButton?.addEventListener("click", () => setDataScopeSelection("imported"));
  els.dataScopeControls?.forEach((input) => input.addEventListener("change", () => renderRestorePreview(null)));
  els.restoreModeControls?.forEach((input) => input.addEventListener("change", () => renderRestorePreview(null)));
  els.restoreLatestSnapshotButton.addEventListener("click", restoreLatestSnapshot);
  els.refreshSnapshotsButton.addEventListener("click", renderSnapshotPanel);
  els.boardMonth.addEventListener("change", () => {
    setSharedSelectedMonth(els.boardMonth.value);
    renderBoard();
  });
  els.boardPrevMonth?.addEventListener("click", () => moveBoardMonth(-1));
  els.boardNextMonth?.addEventListener("click", () => moveBoardMonth(1));
  els.boardFilterSector.addEventListener("change", () => {
    boardHighlightSector = "";
    renderBoard();
  });
  els.boardFilterSearch.addEventListener("input", renderBoard);
  els.boardFilterSort.addEventListener("change", renderBoard);
  els.boardFilterHideZero.addEventListener("change", renderBoard);
  els.boardFilterUnknownOnly.addEventListener("change", renderBoard);
  els.boardExpandAllButton.addEventListener("click", () => {
    openDetailView(boardDetailOptions());
  });
  els.boardCollapseAllButton.addEventListener("click", () => {
    els.boardFilterSector.value = "all";
    els.boardFilterSearch.value = "";
    els.boardFilterUnknownOnly.checked = false;
    els.boardFilterHideZero.checked = true;
    els.boardFilterSort.value = "amount";
    renderBoard();
  });
  els.calendarMonth.addEventListener("change", () => {
    setSharedSelectedMonth(els.calendarMonth.value);
    selectedCalendarDate = "";
    calendarBillingExpanded = false;
    renderCalendar();
  });
  els.calendarShowIncome?.addEventListener("change", () => {
    calendarShowIncome = els.calendarShowIncome.checked;
    renderCalendar();
  });
  els.calendarPrevMonth.addEventListener("click", () => moveCalendarMonth(-1));
  els.calendarNextMonth.addEventListener("click", () => moveCalendarMonth(1));
  els.monthlyPrevYear?.addEventListener("click", () => moveMonthlyYear(-1));
  els.monthlyNextYear?.addEventListener("click", () => moveMonthlyYear(1));
  els.monthlyYearFilter.addEventListener("change", renderMonthlyFlow);
  els.monthlyStartYear.addEventListener("change", renderMonthlyFlow);
  els.monthlyEndYear.addEventListener("change", renderMonthlyFlow);
  els.incomeMonthFilter.addEventListener("change", () => {
    preferredIncomeMonth = els.incomeMonthFilter.value || "all";
    focusedMonthlyMonth = preferredIncomeMonth === "all" ? "" : preferredIncomeMonth;
    renderIncomeEntries();
  });
  els.backToMonthlyButton.addEventListener("click", returnFromIncomeView);
  els.incomeSearchInput.addEventListener("input", renderIncomeEntries);
  els.incomeSortSelect.addEventListener("change", renderIncomeEntries);
  els.incomeEntryForm.addEventListener("submit", handleIncomeEntry);
  els.parseIncomeBulkButton.addEventListener("click", handleIncomeBulkParse);
  els.clearIncomeBulkButton.addEventListener("click", clearIncomeBulkInput);
  els.saveIncomeBulkButton.addEventListener("click", handleIncomeBulkSave);
  els.recurringForm.addEventListener("submit", handleRecurringSubmit);
  els.recurringTabButtons.forEach((button, index) => {
    button.addEventListener("click", () => setRecurringTab(button.dataset.recurringTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const lastIndex = els.recurringTabButtons.length - 1;
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? lastIndex
          : (index + (event.key === "ArrowRight" ? 1 : -1) + els.recurringTabButtons.length) % els.recurringTabButtons.length;
      setRecurringTab(els.recurringTabButtons[nextIndex].dataset.recurringTab, { focus: true });
    });
  });
  els.recurringSector.addEventListener("change", () => updateSubcategorySelect(els.recurringSector, els.recurringSubcategory));
  els.recurringMonthFilter.addEventListener("change", renderRecurring);
  els.cancelRecurringEditButton.addEventListener("click", resetRecurringForm);
  els.parseRecurringBulkButton.addEventListener("click", handleRecurringBulkParse);
  els.clearRecurringBulkButton.addEventListener("click", clearRecurringBulkInput);
  els.saveRecurringBulkButton.addEventListener("click", handleRecurringBulkSave);
  els.loanForm.addEventListener("submit", handleLoanSubmit);
  els.cancelLoanEditButton.addEventListener("click", resetLoanForm);
  els.loanPrincipalAmount.addEventListener("input", updateLoanScheduledTotal);
  els.loanInterestAmount.addEventListener("input", updateLoanScheduledTotal);
  els.loanPaymentForm.addEventListener("submit", handleLoanPaymentSubmit);
  els.loanPaymentPrincipal.addEventListener("input", updateLoanPaymentPreview);
  els.loanPaymentInterest.addEventListener("input", updateLoanPaymentPreview);
  els.closeLoanPaymentDialogButton.addEventListener("click", closeLoanPaymentDialog);
  els.cancelLoanPaymentButton.addEventListener("click", closeLoanPaymentDialog);
  els.deleteLoanPaymentButton.addEventListener("click", deleteLoanPayment);
  els.loanPaymentDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeLoanPaymentDialog();
  });
  els.summarySectorPickerButton.addEventListener("click", toggleSummarySectorPicker);
  els.summarySectorPickerButton.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openSummarySectorPicker({ focusSelected: true });
    } else if (event.key === "Escape") {
      closeSummarySectorPicker();
    }
  });
  els.summarySectorPickerMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-summary-sector-option]");
    if (option) selectSummarySector(option.dataset.summarySectorOption);
  });
  els.summarySectorPickerMenu.addEventListener("keydown", (event) => {
    const option = event.target.closest("[data-summary-sector-option]");
    if (!option) return;
    if (["ArrowDown", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      moveSummarySectorPickerFocus(option, 1);
    } else if (["ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      moveSummarySectorPickerFocus(option, -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const options = [...els.summarySectorPickerMenu.querySelectorAll("[data-summary-sector-option]")];
      (event.key === "Home" ? options[0] : options.at(-1))?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSummarySectorPicker({ restoreFocus: true });
    }
  });
  document.addEventListener("click", (event) => {
    if (!els.summarySectorPickerMenu.hidden && !els.summarySectorPicker.contains(event.target)) {
      closeSummarySectorPicker();
    }
  });
  els.summaryCompareYearButton.addEventListener("click", () => setSummaryComparisonMode("year-over-year"));
  els.summaryCompareCustomButton.addEventListener("click", () => setSummaryComparisonMode("custom"));
  els.summaryComparisonMonthSelect.addEventListener("change", () => {
    selectedSummaryComparisonMonth = els.summaryComparisonMonthSelect.value;
    renderSummary();
  });
  els.summaryRangePreset.addEventListener("change", () => {
    selectedSummaryRangePreset = els.summaryRangePreset.value || "recent-12";
    renderSummary();
  });
  els.summaryStartMonth.addEventListener("change", () => {
    selectedSummaryRangePreset = "custom";
    selectedSummaryStartMonth = els.summaryStartMonth.value;
    if (selectedSummaryStartMonth && selectedSummaryEndMonth && selectedSummaryStartMonth > selectedSummaryEndMonth) {
      selectedSummaryEndMonth = selectedSummaryStartMonth;
    }
    renderSummary();
  });
  els.summaryEndMonth.addEventListener("change", () => {
    selectedSummaryRangePreset = "custom";
    selectedSummaryEndMonth = els.summaryEndMonth.value;
    if (selectedSummaryStartMonth && selectedSummaryEndMonth && selectedSummaryStartMonth > selectedSummaryEndMonth) {
      selectedSummaryStartMonth = selectedSummaryEndMonth;
    }
    renderSummary();
  });
  els.summaryMobileViewSelect?.addEventListener("change", () => {
    selectSummarySubtabFromMobile(els.summaryMobileViewSelect.value);
  });
  els.summaryMonthSelect.addEventListener("change", () => {
    setSharedSelectedMonth(els.summaryMonthSelect.value);
    renderSummary();
  });
  els.summaryPrevMonth?.addEventListener("click", () => moveSummaryMonth(els.summaryMonthSelect, -1));
  els.summaryNextMonth?.addEventListener("click", () => moveSummaryMonth(els.summaryMonthSelect, 1));
  window.addEventListener("scroll", updateBoardMapTopButton, { passive: true });
  els.boardMapTopButton.addEventListener("click", () => {
    els.boardSectorMap.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  els.resetRulesButton.addEventListener("click", async () => {
    if (!confirm("기본 규칙을 복원하면 수정한 기본 규칙은 초기값으로 돌아갑니다. 사용자 추가 규칙은 유지됩니다. 계속할까요?")) return;
    await createAutoSnapshot("기본 규칙 복원 전");
    const retainedRules = rules.filter((rule) => ["user", "smart-suggestion"].includes(rule.origin));
    rules = mergeRules(retainedRules, defaultRules);
    editingRuleIndex = -1;
    pendingRuleChange = null;
    ruleFeedback = { type: "success", message: "기본 분류 규칙을 최신 기본값으로 복원했습니다. 사용자 규칙은 유지했습니다." };
    saveRules();
    reclassify();
  });

  els.ruleSector.addEventListener("change", () => updateSubcategorySelect(els.ruleSector, els.ruleSubcategory));
  els.manualSector.addEventListener("change", () => updateSubcategorySelect(els.manualSector, els.manualSubcategory));
  els.manualFlow.addEventListener("change", syncManualCategoryControls);
  els.manualEntryForm.addEventListener("submit", handleManualEntry);
  els.pasteEntriesButton.addEventListener("click", handlePasteEntries);
  els.productForm.addEventListener("submit", handleProductSubmit);
  [els.productFilterCategory, els.productFilterName, els.productFilterStatus, els.productSort, els.productTrendSelect]
    .forEach((control) => control.addEventListener("change", renderProducts));
  [els.productFilterStore, els.productFilterSearch]
    .forEach((control) => control.addEventListener("input", renderProducts));
  els.ipoForm?.addEventListener("submit", handleIpoSubmit);
  els.cancelIpoEditButton?.addEventListener("click", resetIpoForm);
  els.ipoImage?.addEventListener("change", handleIpoImageChange);
  els.removeIpoImageButton?.addEventListener("click", clearIpoImageDraft);
  Array.from(els.ipoSubtabs || []).forEach((button) => {
    button.addEventListener("click", () => {
      selectedIpoSubtab = button.dataset.ipoSubtab || "dashboard";
      renderIpoView();
    });
  });
  [
    els.ipoOfferPrice,
    els.ipoApplicationFee,
    els.ipoAllocatedShares,
    els.ipoAllocationResult,
    els.ipoSellPrice,
    els.ipoSellAmount,
    els.ipoSellFee
  ].filter(Boolean).forEach((control) => control.addEventListener("input", updateIpoComputedPreview));
  [els.ipoStatusFilter, els.ipoMonthFilter, els.ipoBrokerFilter, els.ipoSortSelect]
    .filter(Boolean)
    .forEach((control) => control.addEventListener("change", () => {
      readIpoFilters();
      renderIpoView();
    }));
  els.ipoSearchInput?.addEventListener("input", () => {
    readIpoFilters();
    renderIpoView();
  });
  els.parseIpoPasteButton?.addEventListener("click", handleIpoPasteParse);
  els.clearIpoPasteButton?.addEventListener("click", clearIpoPasteInput);
  els.saveIpoPasteButton?.addEventListener("click", saveIpoPasteRows);
  els.loadIpoCalendarButton?.addEventListener("click", loadIpoCalendarCandidates);
  els.prevIpoCalendarMonth?.addEventListener("click", () => moveIpoCalendarMonth(-1));
  els.nextIpoCalendarMonth?.addEventListener("click", () => moveIpoCalendarMonth(1));
  els.ipoCalendarMonthSelect?.addEventListener("change", () => {
    selectedIpoCalendarMonth = els.ipoCalendarMonthSelect.value;
    renderIpoView();
  });
  els.ipoPerformanceYearFilter?.addEventListener("change", () => {
    selectedIpoPerformanceYear = els.ipoPerformanceYearFilter.value || "all";
    selectedIpoPerformanceMonth = "";
    renderIpoView();
  });
  els.ruleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = els.ruleKeyword.value.trim();
    if (!keyword) return;
    addRule(els.ruleSector.value, els.ruleSubcategory.value, keyword);
    els.ruleKeyword.value = "";
  });
  els.ruleFilterType.addEventListener("change", renderRules);
  els.ruleFilterSector.addEventListener("change", () => {
    updateRuleFilterSubcategories();
    renderRules();
  });
  els.ruleFilterSubcategory.addEventListener("change", renderRules);
  els.ruleSearchInput.addEventListener("input", renderRules);
  els.ruleSortSelect.addEventListener("change", renderRules);
  els.resetRuleFiltersButton.addEventListener("click", () => {
    ruleFilters.type = "all";
    ruleFilters.sector = "all";
    ruleFilters.subcategory = "all";
    ruleFilters.search = "";
    ruleFilters.sort = "priority";
    syncRuleFilterControls();
    renderRules();
  });
  [els.detailMonth, els.detailSector, els.detailSubcategory, els.detailSort, els.detailEntryType, els.detailUnknownOnly, els.detailReimbursedOnly, els.detailHideZero]
    .forEach((control) => control.addEventListener("change", () => {
      readDetailFilterControls();
      if (control === els.detailMonth && detailFilters.month !== "all") setSharedSelectedMonth(detailFilters.month, { syncControls: false });
      if (control === els.detailSector) detailFilters.subcategory = "all";
      renderDetailView();
    }));
  els.detailPrevMonth?.addEventListener("click", () => moveDetailMonth(-1));
  els.detailNextMonth?.addEventListener("click", () => moveDetailMonth(1));
  els.detailSearch.addEventListener("input", () => {
    readDetailFilterControls();
    renderDetailView();
  });
  els.detailFilterResetButton?.addEventListener("click", resetDetailFilters);
  els.detailBackToBoardButton.addEventListener("click", returnFromDetailView);
  els.detailBulkMonth.addEventListener("change", () => setSharedSelectedMonth(els.detailBulkMonth.value));
  els.detailBulkSector.addEventListener("change", () => updateDetailBulkSubcategorySelect());
  els.parseDetailBulkButton.addEventListener("click", handleDetailBulkParse);
  els.clearDetailBulkButton.addEventListener("click", clearDetailBulkInput);
  els.saveDetailBulkButton.addEventListener("click", handleDetailBulkSave);
  els.detailBulkAllowDuplicates.addEventListener("change", renderDetailBulkPreview);
  els.detailBulkListMonth.addEventListener("change", renderDetailBulkSavedRecords);
  els.detailBulkListSector.addEventListener("change", () => {
    fillDetailBulkListSubcategoryFilter();
    renderDetailBulkSavedRecords();
  });
  els.detailBulkListSubcategory.addEventListener("change", renderDetailBulkSavedRecords);
  els.detailBulkListSearch.addEventListener("input", renderDetailBulkSavedRecords);
  els.detailBulkListSort.addEventListener("change", renderDetailBulkSavedRecords);

  reclassify();
  registerPwa();
}


init();
