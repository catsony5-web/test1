function defaultAppSettings() {
  return {
    theme: "minimal",
    backgroundImage: "",
    backgroundOpacity: 0.14,
    backgroundBlur: 0,
    backgroundOverlay: 0.28,
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
  adminMenuButton: document.querySelector("#adminMenuButton"),
  adminMenuCloseButton: document.querySelector("#adminMenuCloseButton"),
  adminMenu: document.querySelector("#adminMenu"),
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
  monthlyYearFilter: document.querySelector("#monthlyYearFilter"),
  monthlyRecentYears: document.querySelector("#monthlyRecentYears"),
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
  monthlyFlowTable: document.querySelector("#monthlyFlowTable"),
  monthlyFlowChart: document.querySelector("#monthlyFlowChart"),
  monthlyTable: document.querySelector("#monthlyTable"),
  detailTable: document.querySelector("#detailTable"),
  summaryMetricCards: document.querySelector("#summaryMetricCards"),
  summarySectorSharePanel: document.querySelector("#summarySectorSharePanel"),
  sectorTrendSelect: document.querySelector("#sectorTrendSelect"),
  summaryRangePreset: document.querySelector("#summaryRangePreset"),
  summaryStartMonth: document.querySelector("#summaryStartMonth"),
  summaryEndMonth: document.querySelector("#summaryEndMonth"),
  summaryMonthSelect: document.querySelector("#summaryMonthSelect"),
  summaryDetailMonthSelect: document.querySelector("#summaryDetailMonthSelect"),
  foodAnalysisCard: document.querySelector("#foodAnalysisCard"),
  sectorAnalysisBody: document.querySelector("#sectorAnalysisBody"),
  sectorAnalysisTitle: document.querySelector("#sectorAnalysisTitle"),
  sectorAnalysisDescription: document.querySelector("#sectorAnalysisDescription"),
  sectorAnalysisBadge: document.querySelector("#sectorAnalysisBadge"),
  sectorAnalysisSectorSelect: document.querySelector("#sectorAnalysisSectorSelect"),
  sectorAnalysisMonthSelect: document.querySelector("#sectorAnalysisMonthSelect"),
  selectedMonthDetailTitle: document.querySelector("#selectedMonthDetailTitle"),
  selectedMonthSectorCards: document.querySelector("#selectedMonthSectorCards"),
  sectorTrendChart: document.querySelector("#sectorTrendChart"),
  detailMonth: document.querySelector("#detailMonth"),
  detailSector: document.querySelector("#detailSector"),
  detailSubcategory: document.querySelector("#detailSubcategory"),
  detailSearch: document.querySelector("#detailSearch"),
  detailSort: document.querySelector("#detailSort"),
  detailEntryType: document.querySelector("#detailEntryType"),
  detailUnknownOnly: document.querySelector("#detailUnknownOnly"),
  detailReimbursedOnly: document.querySelector("#detailReimbursedOnly"),
  detailHideZero: document.querySelector("#detailHideZero"),
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
  detailBulkRecordList: document.querySelector("#detailBulkRecordList"),
  calendarMonth: document.querySelector("#calendarMonth"),
  calendarShowIncome: document.querySelector("#calendarShowIncome"),
  calendarPrevMonth: document.querySelector("#calendarPrevMonth"),
  calendarNextMonth: document.querySelector("#calendarNextMonth"),
  calendarMonthSummary: document.querySelector("#calendarMonthSummary"),
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
let recurringExpenses = [];
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
let currentFileName = "";
let boardExpandedSectors = new Set();
let boardExpandedMonth = "";
let boardHighlightSector = "";
let incomeBulkRows = [];
let recurringBulkRows = [];
let detailBulkRows = [];
let editingDetailBulkRecordKey = "";
let editingIncomeKey = "";
let editingRecurringId = "";
let preferredIncomeMonth = "";
let incomeReturnState = null;
let focusedMonthlyMonth = "";
let isCreatingSnapshot = false;
const ruleFilters = { type: "all", sector: "all", subcategory: "all", search: "", sort: "priority" };
const productFilters = { category: "all", name: "all", store: "", status: "all", search: "", sort: "recent", trendName: "" };
let selectedSummarySector = "";
let selectedSummaryMonth = "";
let selectedSummaryRangePreset = "recent-12";
let selectedSummaryStartMonth = "";
let selectedSummaryEndMonth = "";
let selectedSummarySubtab = "trend";
let selectedCalendarMonth = "";
let selectedAppMonth = "";
let detailReturnState = null;
let detailFocusRecordKey = "";
let detailExpandedSectionKey = "";
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
  syncMonthSelectValue(els.calendarMonth, month);
  syncMonthSelectValue(els.summaryMonthSelect, month);
  syncMonthSelectValue(els.summaryDetailMonthSelect, month);
  syncMonthSelectValue(els.sectorAnalysisMonthSelect, month);
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
