function defaultAppSettings() {
  return {
    theme: "garden-ink",
    themeRevision: 1,
    backgroundImage: "",
    backgroundOpacity: 0.14,
    backgroundBlur: 0,
    backgroundOverlay: 0.28,
    cardBilling: {
      startDay: 14,
      endDay: 13,
      paymentDay: 25,
      weekendRule: "next-monday"
    },
    analysis: {
      targetRatios: {},
      consumptionTypes: {}
    },
    ipoPerformance: {
      filter: "all",
      startMonth: "",
      endMonth: ""
    },
    lastSavedAt: "",
    lastSnapshotAt: "",
    lastDailySnapshotDate: ""
  };
}


const els = {
  fileInput: document.querySelector("#fileInput"),
  exportButton: document.querySelector("#exportButton"),
  backupButton: document.querySelector("#backupButton"),
  restoreInput: document.querySelector("#restoreInput"),
  clearRecordsButton: document.querySelector("#clearRecordsButton"),
  dataScopeControls: document.querySelectorAll("[data-data-scope]"),
  restoreModeControls: document.querySelectorAll("[data-restore-mode]"),
  restorePreview: document.querySelector("#restorePreview"),
  selectAllDataScopesButton: document.querySelector("#selectAllDataScopesButton"),
  selectImportedDataScopeButton: document.querySelector("#selectImportedDataScopeButton"),
  resetRulesButton: document.querySelector("#resetRulesButton"),
  autoSaveStatus: document.querySelector("#autoSaveStatus"),
  snapshotCount: document.querySelector("#snapshotCount"),
  snapshotList: document.querySelector("#snapshotList"),
  restoreLatestSnapshotButton: document.querySelector("#restoreLatestSnapshotButton"),
  refreshSnapshotsButton: document.querySelector("#refreshSnapshotsButton"),
  themeChoiceGroup: document.querySelector("#themeChoiceGroup"),
  backgroundImageInput: document.querySelector("#backgroundImageInput"),
  applyBackgroundButton: document.querySelector("#applyBackgroundButton"),
  removeBackgroundButton: document.querySelector("#removeBackgroundButton"),
  backgroundPreview: document.querySelector("#backgroundPreview"),
  backgroundOpacityInput: document.querySelector("#backgroundOpacityInput"),
  backgroundBlurInput: document.querySelector("#backgroundBlurInput"),
  backgroundOverlayInput: document.querySelector("#backgroundOverlayInput"),
  backgroundOpacityValue: document.querySelector("#backgroundOpacityValue"),
  backgroundBlurValue: document.querySelector("#backgroundBlurValue"),
  backgroundOverlayValue: document.querySelector("#backgroundOverlayValue"),
  backgroundSettingsStatus: document.querySelector("#backgroundSettingsStatus"),
  cardBillingStartDay: document.querySelector("#cardBillingStartDay"),
  cardBillingEndDay: document.querySelector("#cardBillingEndDay"),
  cardBillingPaymentDay: document.querySelector("#cardBillingPaymentDay"),
  cardBillingWeekendRule: document.querySelector("#cardBillingWeekendRule"),
  cardBillingSettingsStatus: document.querySelector("#cardBillingSettingsStatus"),
  adminMenuButton: document.querySelector("#adminMenuButton"),
  adminMenuCloseButton: document.querySelector("#adminMenuCloseButton"),
  adminMenuBackdrop: document.querySelector("#adminMenuBackdrop"),
  adminMenu: document.querySelector("#adminMenu"),
  adminMenuTabs: document.querySelectorAll("[data-admin-tab]"),
  adminMenuPanels: document.querySelectorAll("[data-admin-panel]"),
  mobileNavigationButtons: document.querySelectorAll("[data-mobile-view]"),
  mobileMoreButton: document.querySelector("#mobileMoreButton"),
  mobileMoreBackdrop: document.querySelector("#mobileMoreBackdrop"),
  mobileMoreDialog: document.querySelector("#mobileMoreDialog"),
  mobileMoreCloseButton: document.querySelector("#mobileMoreCloseButton"),
  mobileSettingsButton: document.querySelector("#mobileSettingsButton"),
  fileName: document.querySelector("#fileName"),
  totalAmount: document.querySelector("#totalAmount"),
  transactionCount: document.querySelector("#transactionCount"),
  unknownCount: document.querySelector("#unknownCount"),
  boardMonth: document.querySelector("#boardMonth"),
  boardPrevMonth: document.querySelector("#boardPrevMonth"),
  boardNextMonth: document.querySelector("#boardNextMonth"),
  boardRangePreset: document.querySelector("#boardRangePreset"),
  boardMetrics: document.querySelector("#boardMetrics"),
  boardPeriodStats: document.querySelector("#boardPeriodStats"),
  boardSectorMap: document.querySelector("#boardSectorMap"),
  boardSectorSummary: document.querySelector("#boardSectorSummary"),
  boardFilterSector: document.querySelector("#boardFilterSector"),
  boardFilterSearch: document.querySelector("#boardFilterSearch"),
  boardFilterSort: document.querySelector("#boardFilterSort"),
  boardFilterHideZero: document.querySelector("#boardFilterHideZero"),
  boardFilterUnknownOnly: document.querySelector("#boardFilterUnknownOnly"),
  boardFilterStatus: document.querySelector("#boardFilterStatus"),
  boardExpandAllButton: document.querySelector("#boardExpandAllButton"),
  boardCollapseAllButton: document.querySelector("#boardCollapseAllButton"),
  boardGrid: document.querySelector("#boardGrid"),
  boardSideSummary: document.querySelector("#boardSideSummary"),
  boardMapTopButton: document.querySelector("#boardMapTopButton"),
  boardSummary: document.querySelector("#boardSummary"),
  goalPlannerRoot: document.querySelector("#goalPlannerRoot"),
  monthlyAnalysisMonth: document.querySelector("#monthlyAnalysisMonth"),
  monthlyAnalysisPrevMonth: document.querySelector("#monthlyAnalysisPrevMonth"),
  monthlyAnalysisNextMonth: document.querySelector("#monthlyAnalysisNextMonth"),
  monthlyAnalysisOpenDetails: document.querySelector("#monthlyAnalysisOpenDetails"),
  monthlyAnalysisComparisonButtons: document.querySelectorAll("[data-monthly-analysis-comparison]"),
  monthlyAnalysisComparisonStatus: document.querySelector("#monthlyAnalysisComparisonStatus"),
  monthlyAnalysisBody: document.querySelector("#monthlyAnalysisBody"),
  spendingStructureMonth: document.querySelector("#spendingStructureMonth"),
  spendingStructurePrevMonth: document.querySelector("#spendingStructurePrevMonth"),
  spendingStructureNextMonth: document.querySelector("#spendingStructureNextMonth"),
  spendingStructureBody: document.querySelector("#spendingStructureBody"),
  spendingTargetOpenButton: document.querySelector("#spendingTargetOpenButton"),
  spendingTargetDialog: document.querySelector("#spendingTargetDialog"),
  spendingTargetDialogClose: document.querySelector("#spendingTargetDialogClose"),
  spendingTargetForm: document.querySelector("#spendingTargetForm"),
  spendingTargetFields: document.querySelector("#spendingTargetFields"),
  spendingTargetSuggestionButton: document.querySelector("#spendingTargetSuggestionButton"),
  spendingTargetSuggestionNote: document.querySelector("#spendingTargetSuggestionNote"),
  spendingTargetTotal: document.querySelector("#spendingTargetTotal"),
  spendingTypeFields: document.querySelector("#spendingTypeFields"),
  spendingTypeResetButton: document.querySelector("#spendingTypeResetButton"),
  spendingTargetFeedback: document.querySelector("#spendingTargetFeedback"),
  spendingTargetCancelButton: document.querySelector("#spendingTargetCancelButton"),
  monthlyPrevYear: document.querySelector("#monthlyPrevYear"),
  monthlyNextYear: document.querySelector("#monthlyNextYear"),
  monthlyYearFilter: document.querySelector("#monthlyYearFilter"),
  monthlyStartYear: document.querySelector("#monthlyStartYear"),
  monthlyEndYear: document.querySelector("#monthlyEndYear"),
  monthlyRangeStatus: document.querySelector("#monthlyRangeStatus"),
  incomeMonthFilter: document.querySelector("#incomeMonthFilter"),
  backToMonthlyButton: document.querySelector("#backToMonthlyButton"),
  incomeRecordTitle: document.querySelector("#incomeRecordTitle"),
  incomeSummaryCards: document.querySelector("#incomeSummaryCards"),
  incomeEntryForm: document.querySelector("#incomeEntryForm"),
  incomeEntryDate: document.querySelector("#incomeEntryDate"),
  incomeEntryDescription: document.querySelector("#incomeEntryDescription"),
  incomeEntryAmount: document.querySelector("#incomeEntryAmount"),
  incomeBulkPaste: document.querySelector("#incomeBulkPaste"),
  parseIncomeBulkButton: document.querySelector("#parseIncomeBulkButton"),
  clearIncomeBulkButton: document.querySelector("#clearIncomeBulkButton"),
  saveIncomeBulkButton: document.querySelector("#saveIncomeBulkButton"),
  incomeBulkFeedback: document.querySelector("#incomeBulkFeedback"),
  incomeBulkPreview: document.querySelector("#incomeBulkPreview"),
  incomeEntryList: document.querySelector("#incomeEntryList"),
  incomeSearchInput: document.querySelector("#incomeSearchInput"),
  incomeSortSelect: document.querySelector("#incomeSortSelect"),
  monthlyKpis: document.querySelector("#monthlyKpis"),
  monthlyPeriodStats: document.querySelector("#monthlyPeriodStats"),
  monthlyFlowTable: document.querySelector("#monthlyFlowTable"),
  monthlyFlowChart: document.querySelector("#monthlyFlowChart"),
  monthlyTable: document.querySelector("#monthlyTable"),
  detailTable: document.querySelector("#detailTable"),
  summarySectorSharePanel: document.querySelector("#summarySectorSharePanel"),
  summaryPatternPanel: document.querySelector("#summaryPatternPanel"),
  summaryFeedbackPanel: document.querySelector("#summaryFeedbackPanel"),
  summaryPeriodPanel: document.querySelector("#summaryPeriodPanel"),
  summarySectorPicker: document.querySelector("#summarySectorPicker"),
  summarySectorPickerButton: document.querySelector("#summarySectorPickerButton"),
  summarySectorPickerIcon: document.querySelector("#summarySectorPickerIcon"),
  summarySectorPickerText: document.querySelector("#summarySectorPickerText"),
  summarySectorPickerMenu: document.querySelector("#summarySectorPickerMenu"),
  summaryComparePreviousButton: document.querySelector("#summaryComparePreviousButton"),
  summaryCompareYearButton: document.querySelector("#summaryCompareYearButton"),
  summaryCompareCustomButton: document.querySelector("#summaryCompareCustomButton"),
  summaryComparisonMonthField: document.querySelector("#summaryComparisonMonthField"),
  summaryComparisonMonthSelect: document.querySelector("#summaryComparisonMonthSelect"),
  summaryComparisonNotice: document.querySelector("#summaryComparisonNotice"),
  summaryRangePreset: document.querySelector("#summaryRangePreset"),
  summaryStartMonth: document.querySelector("#summaryStartMonth"),
  summaryEndMonth: document.querySelector("#summaryEndMonth"),
  summaryMobileViewSelect: document.querySelector("#summaryMobileViewSelect"),
  summaryPrevMonth: document.querySelector("#summaryPrevMonth"),
  summaryMonthSelect: document.querySelector("#summaryMonthSelect"),
  summaryNextMonth: document.querySelector("#summaryNextMonth"),
  sectorTrendChart: document.querySelector("#sectorTrendChart"),
  detailPrevMonth: document.querySelector("#detailPrevMonth"),
  detailMonth: document.querySelector("#detailMonth"),
  detailNextMonth: document.querySelector("#detailNextMonth"),
  detailSector: document.querySelector("#detailSector"),
  detailSubcategory: document.querySelector("#detailSubcategory"),
  detailSearch: document.querySelector("#detailSearch"),
  detailSort: document.querySelector("#detailSort"),
  detailEntryType: document.querySelector("#detailEntryType"),
  detailUnknownOnly: document.querySelector("#detailUnknownOnly"),
  detailReimbursedOnly: document.querySelector("#detailReimbursedOnly"),
  detailHideZero: document.querySelector("#detailHideZero"),
  detailFilterResetButton: document.querySelector("#detailFilterResetButton"),
  detailBackToBoardButton: document.querySelector("#detailBackToBoardButton"),
  detailMetrics: document.querySelector("#detailMetrics"),
  detailGrid: document.querySelector("#detailGrid"),
  detailBulkMonth: document.querySelector("#detailBulkMonth"),
  detailBulkSector: document.querySelector("#detailBulkSector"),
  detailBulkSubcategory: document.querySelector("#detailBulkSubcategory"),
  detailBulkSourceType: document.querySelector("#detailBulkSourceType"),
  detailBulkReimbursementDefault: document.querySelector("#detailBulkReimbursementDefault"),
  detailBulkAutoSuggest: document.querySelector("#detailBulkAutoSuggest"),
  detailBulkAllowDuplicates: document.querySelector("#detailBulkAllowDuplicates"),
  detailBulkPaste: document.querySelector("#detailBulkPaste"),
  parseDetailBulkButton: document.querySelector("#parseDetailBulkButton"),
  clearDetailBulkButton: document.querySelector("#clearDetailBulkButton"),
  saveDetailBulkButton: document.querySelector("#saveDetailBulkButton"),
  detailBulkFeedback: document.querySelector("#detailBulkFeedback"),
  detailBulkPreview: document.querySelector("#detailBulkPreview"),
  detailBulkListMonth: document.querySelector("#detailBulkListMonth"),
  detailBulkListSector: document.querySelector("#detailBulkListSector"),
  detailBulkListSubcategory: document.querySelector("#detailBulkListSubcategory"),
  detailBulkListSearch: document.querySelector("#detailBulkListSearch"),
  detailBulkListSort: document.querySelector("#detailBulkListSort"),
  detailBulkRecordCount: document.querySelector("#detailBulkRecordCount"),
  detailBulkTabRecordCount: document.querySelector("#detailBulkTabRecordCount"),
  detailBulkRecordList: document.querySelector("#detailBulkRecordList"),
  detailBulkTabs: document.querySelectorAll("[data-detail-bulk-tab]"),
  detailBulkPanels: document.querySelectorAll("[data-detail-bulk-panel]"),
  calendarMonth: document.querySelector("#calendarMonth"),
  calendarShowIncome: document.querySelector("#calendarShowIncome"),
  calendarPrevMonth: document.querySelector("#calendarPrevMonth"),
  calendarNextMonth: document.querySelector("#calendarNextMonth"),
  calendarMonthSummary: document.querySelector("#calendarMonthSummary"),
  calendarBillingDetail: document.querySelector("#calendarBillingDetail"),
  calendarMonthlyMemo: document.querySelector("#calendarMonthlyMemo"),
  calendarCurrentMonthLabel: document.querySelector("#calendarCurrentMonthLabel"),
  spendingCalendar: document.querySelector("#spendingCalendar"),
  selectedDayTitle: document.querySelector("#selectedDayTitle"),
  selectedDayTimeline: document.querySelector("#selectedDayTimeline"),
  productForm: document.querySelector("#productForm"),
  productName: document.querySelector("#productName"),
  productBrand: document.querySelector("#productBrand"),
  productCategory: document.querySelector("#productCategory"),
  productPurchaseDate: document.querySelector("#productPurchaseDate"),
  productExpiryDate: document.querySelector("#productExpiryDate"),
  productStartDate: document.querySelector("#productStartDate"),
  productEndDate: document.querySelector("#productEndDate"),
  productPrice: document.querySelector("#productPrice"),
  productVolume: document.querySelector("#productVolume"),
  productUnit: document.querySelector("#productUnit"),
  productQuantity: document.querySelector("#productQuantity"),
  productStore: document.querySelector("#productStore"),
  productExpectedDays: document.querySelector("#productExpectedDays"),
  productLink: document.querySelector("#productLink"),
  productImage: document.querySelector("#productImage"),
  productMemo: document.querySelector("#productMemo"),
  productFilterCategory: document.querySelector("#productFilterCategory"),
  productFilterName: document.querySelector("#productFilterName"),
  productFilterStore: document.querySelector("#productFilterStore"),
  productFilterStatus: document.querySelector("#productFilterStatus"),
  productFilterSearch: document.querySelector("#productFilterSearch"),
  productSort: document.querySelector("#productSort"),
  productTrendSelect: document.querySelector("#productTrendSelect"),
  productTrendChart: document.querySelector("#productTrendChart"),
  productList: document.querySelector("#productList"),
  ipoForm: document.querySelector("#ipoForm"),
  ipoId: document.querySelector("#ipoId"),
  ipoCompany: document.querySelector("#ipoCompany"),
  ipoMarket: document.querySelector("#ipoMarket"),
  ipoBroker: document.querySelector("#ipoBroker"),
  ipoSubscriptionStart: document.querySelector("#ipoSubscriptionStart"),
  ipoSubscriptionEnd: document.querySelector("#ipoSubscriptionEnd"),
  ipoRefundDate: document.querySelector("#ipoRefundDate"),
  ipoListingDate: document.querySelector("#ipoListingDate"),
  ipoOfferPrice: document.querySelector("#ipoOfferPrice"),
  ipoAppliedShares: document.querySelector("#ipoAppliedShares"),
  ipoDepositAmount: document.querySelector("#ipoDepositAmount"),
  ipoApplicationFee: document.querySelector("#ipoApplicationFee"),
  ipoAllocatedShares: document.querySelector("#ipoAllocatedShares"),
  ipoAllocationResult: document.querySelector("#ipoAllocationResult"),
  ipoSellDate: document.querySelector("#ipoSellDate"),
  ipoSellPrice: document.querySelector("#ipoSellPrice"),
  ipoSellAmount: document.querySelector("#ipoSellAmount"),
  ipoSellFee: document.querySelector("#ipoSellFee"),
  ipoOpenPrice: document.querySelector("#ipoOpenPrice"),
  ipoHighPrice: document.querySelector("#ipoHighPrice"),
  ipoClosePrice: document.querySelector("#ipoClosePrice"),
  ipoMemo: document.querySelector("#ipoMemo"),
  ipoImage: document.querySelector("#ipoImage"),
  ipoImagePreview: document.querySelector("#ipoImagePreview"),
  removeIpoImageButton: document.querySelector("#removeIpoImageButton"),
  ipoComputedProfit: document.querySelector("#ipoComputedProfit"),
  ipoComputedRate: document.querySelector("#ipoComputedRate"),
  ipoComputedSettlementProfit: document.querySelector("#ipoComputedSettlementProfit"),
  saveIpoButton: document.querySelector("#saveIpoButton"),
  cancelIpoEditButton: document.querySelector("#cancelIpoEditButton"),
  ipoSubtabs: document.querySelectorAll("[data-ipo-subtab]"),
  ipoSubtabPanels: document.querySelectorAll("[data-ipo-panel]"),
  ipoSummaryCards: document.querySelector("#ipoSummaryCards"),
  prevIpoCalendarMonth: document.querySelector("#prevIpoCalendarMonth"),
  ipoCalendarMonthSelect: document.querySelector("#ipoCalendarMonthSelect"),
  nextIpoCalendarMonth: document.querySelector("#nextIpoCalendarMonth"),
  ipoCumulativePerformance: document.querySelector("#ipoCumulativePerformance"),
  ipoPublicScheduleToggle: document.querySelector("#ipoPublicScheduleToggle"),
  ipoCalendarCompactView: document.querySelector("#ipoCalendarCompactView"),
  ipoCalendarFullView: document.querySelector("#ipoCalendarFullView"),
  ipoCalendarSyncMeta: document.querySelector("#ipoCalendarSyncMeta"),
  ipoPerformanceYearFilter: document.querySelector("#ipoPerformanceYearFilter"),
  ipoPerformanceCustomRange: document.querySelector("#ipoPerformanceCustomRange"),
  ipoPerformanceStartMonth: document.querySelector("#ipoPerformanceStartMonth"),
  ipoPerformanceEndMonth: document.querySelector("#ipoPerformanceEndMonth"),
  resetIpoPerformanceRange: document.querySelector("#resetIpoPerformanceRange"),
  ipoPerformanceRangeFeedback: document.querySelector("#ipoPerformanceRangeFeedback"),
  ipoPerformanceChart: document.querySelector("#ipoPerformanceChart"),
  ipoPerformanceDetail: document.querySelector("#ipoPerformanceDetail"),
  ipoCalendarGrid: document.querySelector("#ipoCalendarGrid"),
  ipoCalendarDetail: document.querySelector("#ipoCalendarDetail"),
  ipoStatusFilter: document.querySelector("#ipoStatusFilter"),
  ipoMonthFilter: document.querySelector("#ipoMonthFilter"),
  ipoBrokerFilter: document.querySelector("#ipoBrokerFilter"),
  ipoSearchInput: document.querySelector("#ipoSearchInput"),
  ipoSortSelect: document.querySelector("#ipoSortSelect"),
  ipoList: document.querySelector("#ipoList"),
  ipoPasteInput: document.querySelector("#ipoPasteInput"),
  ipoHistoryImport: document.querySelector("#ipoHistoryImport"),
  parseIpoPasteButton: document.querySelector("#parseIpoPasteButton"),
  clearIpoPasteButton: document.querySelector("#clearIpoPasteButton"),
  saveIpoPasteButton: document.querySelector("#saveIpoPasteButton"),
  ipoPasteFeedback: document.querySelector("#ipoPasteFeedback"),
  ipoImportSummary: document.querySelector("#ipoImportSummary"),
  ipoPastePreview: document.querySelector("#ipoPastePreview"),
  loadIpoCalendarButton: document.querySelector("#loadIpoCalendarButton"),
  ipoCalendarStatus: document.querySelector("#ipoCalendarStatus"),
  ipoScheduleSummary: document.querySelector("#ipoScheduleSummary"),
  selectChangedIpoSchedules: document.querySelector("#selectChangedIpoSchedules"),
  applySelectedIpoSchedules: document.querySelector("#applySelectedIpoSchedules"),
  ipoCalendarCandidates: document.querySelector("#ipoCalendarCandidates"),
  recurringForm: document.querySelector("#recurringForm"),
  recurringId: document.querySelector("#recurringId"),
  recurringName: document.querySelector("#recurringName"),
  recurringAmount: document.querySelector("#recurringAmount"),
  recurringDay: document.querySelector("#recurringDay"),
  recurringSector: document.querySelector("#recurringSector"),
  recurringSubcategory: document.querySelector("#recurringSubcategory"),
  recurringPaymentType: document.querySelector("#recurringPaymentType"),
  recurringStartMonth: document.querySelector("#recurringStartMonth"),
  recurringEndMonth: document.querySelector("#recurringEndMonth"),
  recurringMemo: document.querySelector("#recurringMemo"),
  recurringShowOnCalendar: document.querySelector("#recurringShowOnCalendar"),
  recurringAutoPost: document.querySelector("#recurringAutoPost"),
  recurringBulkPaste: document.querySelector("#recurringBulkPaste"),
  parseRecurringBulkButton: document.querySelector("#parseRecurringBulkButton"),
  clearRecurringBulkButton: document.querySelector("#clearRecurringBulkButton"),
  saveRecurringBulkButton: document.querySelector("#saveRecurringBulkButton"),
  recurringBulkFeedback: document.querySelector("#recurringBulkFeedback"),
  recurringBulkPreview: document.querySelector("#recurringBulkPreview"),
  recurringMonthFilter: document.querySelector("#recurringMonthFilter"),
  recurringListSummary: document.querySelector("#recurringListSummary"),
  recurringSummaryCards: document.querySelector("#recurringSummaryCards"),
  recurringList: document.querySelector("#recurringList"),
  saveRecurringButton: document.querySelector("#saveRecurringButton"),
  cancelRecurringEditButton: document.querySelector("#cancelRecurringEditButton"),
  recurringTabButtons: [...document.querySelectorAll("[data-recurring-tab]")],
  recurringPanels: [...document.querySelectorAll("[data-recurring-panel]")],
  loanSummaryCards: document.querySelector("#loanSummaryCards"),
  loanForm: document.querySelector("#loanForm"),
  loanId: document.querySelector("#loanId"),
  loanName: document.querySelector("#loanName"),
  loanType: document.querySelector("#loanType"),
  loanOpeningBalance: document.querySelector("#loanOpeningBalance"),
  loanInterestRate: document.querySelector("#loanInterestRate"),
  loanDay: document.querySelector("#loanDay"),
  loanPaymentType: document.querySelector("#loanPaymentType"),
  loanPrincipalAmount: document.querySelector("#loanPrincipalAmount"),
  loanInterestAmount: document.querySelector("#loanInterestAmount"),
  loanScheduledTotal: document.querySelector("#loanScheduledTotal"),
  loanSupportEnabled: document.querySelector("#loanSupportEnabled"),
  loanSupportFields: document.querySelector("#loanSupportFields"),
  loanSupporterName: document.querySelector("#loanSupporterName"),
  loanSupportOpeningBalance: document.querySelector("#loanSupportOpeningBalance"),
  loanSupportPrincipalAmount: document.querySelector("#loanSupportPrincipalAmount"),
  loanSupportInterestAmount: document.querySelector("#loanSupportInterestAmount"),
  loanStartMonth: document.querySelector("#loanStartMonth"),
  loanMaturityMonth: document.querySelector("#loanMaturityMonth"),
  loanMemo: document.querySelector("#loanMemo"),
  loanShowOnCalendar: document.querySelector("#loanShowOnCalendar"),
  saveLoanButton: document.querySelector("#saveLoanButton"),
  cancelLoanEditButton: document.querySelector("#cancelLoanEditButton"),
  loanListSummary: document.querySelector("#loanListSummary"),
  loanList: document.querySelector("#loanList"),
  loanPaymentDialog: document.querySelector("#loanPaymentDialog"),
  loanPaymentForm: document.querySelector("#loanPaymentForm"),
  loanPaymentDialogTitle: document.querySelector("#loanPaymentDialogTitle"),
  loanPaymentDialogDescription: document.querySelector("#loanPaymentDialogDescription"),
  loanPaymentRecurringId: document.querySelector("#loanPaymentRecurringId"),
  loanPaymentRecordKey: document.querySelector("#loanPaymentRecordKey"),
  loanPaymentMonth: document.querySelector("#loanPaymentMonth"),
  loanPaymentExpenseTransactionId: document.querySelector("#loanPaymentExpenseTransactionId"),
  loanPaymentPrincipal: document.querySelector("#loanPaymentPrincipal"),
  loanPaymentInterest: document.querySelector("#loanPaymentInterest"),
  loanPaymentSupportFields: document.querySelector("#loanPaymentSupportFields"),
  loanPaymentSupportLegend: document.querySelector("#loanPaymentSupportLegend"),
  loanPaymentSupportPrincipal: document.querySelector("#loanPaymentSupportPrincipal"),
  loanPaymentSupportInterest: document.querySelector("#loanPaymentSupportInterest"),
  loanPaymentSupportReceived: document.querySelector("#loanPaymentSupportReceived"),
  loanPaymentSupportReceivedDate: document.querySelector("#loanPaymentSupportReceivedDate"),
  loanPaymentSupportIncomeTransactionId: document.querySelector("#loanPaymentSupportIncomeTransactionId"),
  loanPaymentTotal: document.querySelector("#loanPaymentTotal"),
  loanPaymentPersonalTotal: document.querySelector("#loanPaymentPersonalTotal"),
  loanPaymentSupportDue: document.querySelector("#loanPaymentSupportDue"),
  loanPaymentSupportReceivedPreview: document.querySelector("#loanPaymentSupportReceivedPreview"),
  loanPaymentRemaining: document.querySelector("#loanPaymentRemaining"),
  loanPaymentFinalRemaining: document.querySelector("#loanPaymentFinalRemaining"),
  loanPaymentPersonalRemaining: document.querySelector("#loanPaymentPersonalRemaining"),
  loanPaymentSettlementBalance: document.querySelector("#loanPaymentSettlementBalance"),
  saveLoanPaymentButton: document.querySelector("#saveLoanPaymentButton"),
  deleteLoanPaymentButton: document.querySelector("#deleteLoanPaymentButton"),
  closeLoanPaymentDialogButton: document.querySelector("#closeLoanPaymentDialogButton"),
  cancelLoanPaymentButton: document.querySelector("#cancelLoanPaymentButton"),
  unknownList: document.querySelector("#unknownList"),
  rulesTable: document.querySelector("#rulesTable"),
  transactionsTable: document.querySelector("#transactionsTable"),
  ruleForm: document.querySelector("#ruleForm"),
  ruleSector: document.querySelector("#ruleSector"),
  ruleSubcategory: document.querySelector("#ruleSubcategory"),
  ruleKeyword: document.querySelector("#ruleKeyword"),
  ruleFilterType: document.querySelector("#ruleFilterType"),
  ruleFilterSector: document.querySelector("#ruleFilterSector"),
  ruleFilterSubcategory: document.querySelector("#ruleFilterSubcategory"),
  ruleSearchInput: document.querySelector("#ruleSearchInput"),
  ruleSortSelect: document.querySelector("#ruleSortSelect"),
  resetRuleFiltersButton: document.querySelector("#resetRuleFiltersButton"),
  ruleFilterCount: document.querySelector("#ruleFilterCount"),
  ruleFeedback: document.querySelector("#ruleFeedback"),
  manualEntryForm: document.querySelector("#manualEntryForm"),
  manualSourceType: document.querySelector("#manualSourceType"),
  manualFlow: document.querySelector("#manualFlow"),
  manualDate: document.querySelector("#manualDate"),
  manualTime: document.querySelector("#manualTime"),
  manualMerchant: document.querySelector("#manualMerchant"),
  manualAmount: document.querySelector("#manualAmount"),
  manualSector: document.querySelector("#manualSector"),
  manualSubcategory: document.querySelector("#manualSubcategory"),
  pasteEntries: document.querySelector("#pasteEntries"),
  pasteEntriesButton: document.querySelector("#pasteEntriesButton"),
  unknownTemplate: document.querySelector("#unknownItemTemplate")
};

let rules = structuredClone(defaultRules);
let monthlyIncome = {};
let transactions = [];
let classified = [];
let importMeta = {};
let reimbursements = {};
let products = [];
let ipoRecords = [];
let recurringExpenses = [];
let calendarMemos = {};
let goalPlan = GoalPlannerCore.defaultPlan();
let appSettings = defaultAppSettings();
let pendingBackgroundImageData = "";
let reimbursementEditMode = false;
let boardQuickAddSectionKey = "";
let boardQuickAddFeedback = "";
let editingRuleIndex = -1;
let ruleFeedback = null;
let pendingRuleChange = null;
let selectedCalendarDate = "";
let calendarShowIncome = true;
let calendarEditingRecordKey = "";
let calendarEditFeedback = null;
let calendarDetailReturnState = null;
let calendarMemoSaveTimer = null;
let calendarMemoSelectionRange = null;
let calendarBillingExpanded = false;
let currentFileName = "";
let boardExpandedSectors = new Set();
let boardExpandedMonth = "";
let boardHighlightSector = "";
let incomeBulkRows = [];
let recurringBulkRows = [];
let activeRecurringTab = "expense";
let editingLoanId = "";
let detailBulkRows = [];
let ipoPasteRows = [];
let ipoCalendarCandidates = [];
let ipoCalendarPayload = null;
let selectedIpoScheduleIds = new Set();
let showPublicIpoSchedules = true;
let editingIpoId = "";
let ipoImageDraftData = "";
let ipoImageDraftName = "";
let selectedIpoSubtab = "dashboard";
let selectedIpoSummaryGroup = "";
let selectedIpoPerformancePeriod = "all";
let selectedIpoPerformanceStartMonth = "";
let selectedIpoPerformanceEndMonth = "";
let selectedIpoPerformanceMonth = "";
let selectedIpoCalendarMonth = "";
let selectedIpoCalendarDate = "";
let selectedIpoCalendarRecordId = "";
let selectedIpoCalendarEventKey = "";
let ipoCalendarDensity = "compact";
let editingDetailBulkRecordKey = "";
let selectedDetailBulkSubtab = "input";
let editingIncomeKey = "";
let editingRecurringId = "";
let preferredIncomeMonth = "";
let incomeReturnState = null;
let focusedMonthlyMonth = "";
let isCreatingSnapshot = false;
const ruleFilters = { type: "all", sector: "all", subcategory: "all", search: "", sort: "priority" };
const productFilters = { category: "all", name: "all", store: "", status: "all", search: "", sort: "recent", trendName: "" };
const ipoFilters = { status: "all", month: "all", broker: "all", search: "", sort: "subscription-desc" };
let selectedSummarySector = "";
let selectedSummaryMonth = "";
let selectedSummaryRangePreset = "recent-12";
let selectedSummaryStartMonth = "";
let selectedSummaryEndMonth = "";
let selectedSummaryComparisonMode = "previous";
let selectedSummaryComparisonMonth = "";
let selectedSummarySubtab = "trend";
let selectedSummaryPeriodMode = "heatmap";
let selectedSummaryPeriodCell = "";
let monthlyAnalysisComparisonMode = "year";
let selectedCalendarMonth = "";
let selectedAppMonth = "";
let detailReturnState = null;
let detailFocusRecordKey = "";
let detailExpandedSectionKey = "";
let detailSelectedSectionKey = "";
let detailInstallmentEditRecordKey = "";
const detailFilters = {
  month: "",
  sector: "all",
  subcategory: "all",
  search: "",
  sort: "amount-desc",
  entryType: "actual",
  unknownOnly: false,
  reimbursedOnly: false,
  hideZero: true
};

function isValidMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function appMonthOptions(extraMonths = []) {
  return unique([
    ...classified.map((item) => item.month).filter(Boolean),
    ...Object.keys(monthlyIncome).filter(Boolean),
    ...recurringExpenses.flatMap((item) => [item.startMonth, item.endMonth]).filter(Boolean),
    ...extraMonths
  ])
    .filter(isValidMonthKey)
    .sort();
}

function getSharedSelectedMonth(fallback = "") {
  const monthOptions = appMonthOptions([
    selectedAppMonth,
    selectedSummaryMonth,
    selectedCalendarMonth,
    focusedMonthlyMonth,
    fallback,
    els.boardMonth?.value,
    els.monthlyAnalysisMonth?.value,
    els.spendingStructureMonth?.value,
    els.detailBulkMonth?.value,
    detailFilters.month !== "all" ? detailFilters.month : "",
    currentMonthKey()
  ]);
  const candidates = [
    selectedAppMonth,
    fallback,
    els.boardMonth?.value,
    els.detailBulkMonth?.value,
    selectedCalendarMonth,
    selectedSummaryMonth,
    focusedMonthlyMonth,
    detailFilters.month !== "all" ? detailFilters.month : "",
    monthOptions.at(-1),
    currentMonthKey()
  ];
  return candidates.find((month) => isValidMonthKey(month) && monthOptions.includes(month))
    || candidates.find(isValidMonthKey)
    || "";
}

function syncMonthSelectValue(select, month) {
  if (!select || !isValidMonthKey(month)) return;
  if ([...select.options].some((option) => option.value === month)) {
    select.value = month;
  }
}

function syncSharedMonthControls(month = selectedAppMonth) {
  syncMonthSelectValue(els.boardMonth, month);
  syncMonthSelectValue(els.monthlyAnalysisMonth, month);
  syncMonthSelectValue(els.spendingStructureMonth, month);
  syncMonthSelectValue(els.calendarMonth, month);
  syncMonthSelectValue(els.summaryMonthSelect, month);
  syncMonthSelectValue(els.detailBulkMonth, month);
  if (detailFilters.month !== "all") syncMonthSelectValue(els.detailMonth, month);
}

function isViewActive(viewName) {
  return Boolean(document.querySelector(`#${viewName}View`)?.classList.contains("active"));
}

function canViewDriveSharedMonth(viewName) {
  return !selectedAppMonth || isViewActive(viewName);
}

function setSharedSelectedMonth(month, options = {}) {
  if (!isValidMonthKey(month)) return selectedAppMonth;
  selectedAppMonth = month;
  selectedCalendarMonth = month;
  selectedSummaryMonth = month;
  focusedMonthlyMonth = month;
  if (detailFilters.month && detailFilters.month !== "all") detailFilters.month = month;
  if (options.syncControls !== false) syncSharedMonthControls(month);
  return selectedAppMonth;
}
