const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadContext, expense } = require("./helpers/board-overview-context.cjs");

function detailContext(rows = []) {
  const c = loadContext(rows);
  for (const file of ["src/data/board-sections.js", "src/features/details/details-view.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), c, { filename: file });
  }
  Object.assign(c, {
    detailFilters: {}, detailFocusRecordKey: "", detailExpandedSectionKey: "", detailSelectedSectionKey: "",
    detailInstallmentEditRecordKey: "", reimbursementEditMode: false,
    boardQuickAddSectionKey: "", boardQuickAddFeedback: "", boardHighlightSector: "",
    boardExpandedSectors: new Set(), boardExpandedMonth: "", selectedCalendarMonth: "2026-09", selectedCalendarDate: "",
    calendarEditingRecordKey: "", selectedSummaryMonth: "", selectedSummarySector: "", focusedMonthlyMonth: "",
    els: { boardMonth: { value: "2026-09" } }, setSharedSelectedMonth() {}
  });
  return c;
}

function openSector(c, sector = "식비", extra = {}) {
  c.applyDetailNavigationFilters({ month: "2026-09", sector, subcategory: "all", showSectorOverview: true, ...extra }, "board");
}

function grid(c, rows) {
  return c.renderDetailGrid(c.filteredDetailRows(rows), c.detailFilters.month);
}

test("대시보드 섹터 합계는 정산 후 전체 거래를 8건 넘어서도 빠짐없이 표시한다", () => {
  const rows = Array.from({ length: 10 }, (_, i) => expense("food-" + i, (i + 1) * 1000, "2026-09-03", {
    subcategory: i % 2 ? "카페/음료" : "장보기/마트"
  }));
  rows.push(expense("other-month", 999999, "2026-08-03"), expense("other-sector", 888888, undefined, { sector: "교통비", subcategory: "대중교통" }));
  const c = detailContext(rows);
  c.reimbursements["food-0"] = 250;
  openSector(c);
  const before = JSON.stringify(rows);
  const html = grid(c, rows);
  assert.ok(html.includes("<h4>식비 전체</h4>"));
  assert.match(html, /54,750원/);
  assert.equal((html.match(/data-detail-record-key=/g) || []).length, 10);
  for (let i = 0; i < 10; i += 1) assert.ok(html.includes('data-detail-record-key="food-' + i + '"'));
  assert.doesNotMatch(html, /data-detail-record-key="other-|data-quick-add-open=|data-quick-add-form=|data-detail-expand-section=/);
  assert.equal(c.detailSelectedSectionKey, "sector-overview:식비");
  assert.equal(JSON.stringify(rows), before);
});

test("전체 섹터에서 세부항목을 선택한 뒤 섹터 제목으로 전체 거래에 돌아온다", () => {
  const rows = [expense("grocery", 60000), expense("cafe", 4000, undefined, { subcategory: "카페/음료" })];
  const c = detailContext(rows);
  openSector(c);
  c.detailSelectedSectionKey = "groceries";
  let html = grid(c, rows);
  assert.ok(html.includes("<h4>장보기/마트</h4>"));
  assert.equal((html.match(/data-detail-record-key=/g) || []).length, 1);
  assert.match(html, /data-quick-add-open="groceries"/);
  assert.match(html, /data-detail-expand-section="groceries"/);
  assert.match(html, /data-detail-select-section="sector-overview:식비"/);
  c.detailSelectedSectionKey = "sector-overview:식비";
  html = grid(c, rows);
  assert.equal((html.match(/data-detail-record-key=/g) || []).length, 2);
  assert.ok(html.includes("<h4>식비 전체</h4>"));
});

test("섹터 전체 보기의 검색·월·세부항목 필터는 오래된 선택 상태를 남기지 않는다", () => {
  const rows = [expense("grocery", 60000), expense("cafe", 4000, undefined, { subcategory: "카페/음료" }),
    expense("transit", 7000, undefined, { sector: "교통비", subcategory: "대중교통" })];
  const c = detailContext(rows);
  openSector(c);
  c.detailSelectedSectionKey = "groceries";
  Object.assign(c.els, {
    detailMonth: { value: "2026-09" }, detailSector: { value: "식비" }, detailSubcategory: { value: "all" },
    detailSearch: { value: "cafe" }, detailSort: { value: "amount-desc" }, detailEntryType: { value: "actual" },
    detailUnknownOnly: { checked: false }, detailReimbursedOnly: { checked: false }, detailHideZero: { checked: true }
  });
  c.readDetailFilterControls();
  assert.equal(c.detailSelectedSectionKey, "");
  let html = grid(c, rows);
  assert.ok(html.includes("<h4>식비 전체</h4>"));
  assert.equal((html.match(/data-detail-record-key=/g) || []).length, 1);
  c.els.detailSearch.value = "";
  c.els.detailSector.value = "교통비";
  c.readDetailFilterControls();
  c.detailSelectedSectionKey = "sector-overview:식비";
  html = grid(c, rows);
  assert.ok(html.includes("<h4>교통비 전체</h4>"));
  assert.doesNotMatch(html, /data-detail-record-key="grocery"/);
  c.els.detailSector.value = "식비";
  c.els.detailSubcategory.value = "카페/음료";
  c.readDetailFilterControls();
  html = grid(c, rows);
  assert.ok(html.includes("<h4>카페/음료</h4>"));
  assert.doesNotMatch(html, /sector-overview:/);
  c.els.detailSubcategory.value = "all";
  c.els.detailMonth.value = "2026-08";
  c.readDetailFilterControls();
  html = grid(c, rows);
  assert.ok(html.includes("<h4>식비 전체</h4>"));
  assert.equal((html.match(/data-detail-record-key=/g) || []).length, 0);
});

test("TOP 5·달력의 상세 이동은 섹터 전체 모드를 지우고 기존 세부항목과 거래를 연다", () => {
  const rows = [expense("grocery", 60000), expense("cafe", 4000, undefined, { subcategory: "카페/음료" })];
  const c = detailContext(rows);
  openSector(c);
  c.applyDetailNavigationFilters({ month: "2026-09", sector: "식비", subcategory: "카페/음료" }, "board");
  assert.equal(c.detailFilters.sectorOverview, false);
  assert.ok(grid(c, rows).includes("<h4>카페/음료</h4>"));
  openSector(c);
  c.applyDetailNavigationFilters({ month: "2026-09", sector: "식비", subcategory: "장보기/마트", transactionId: "grocery", showSectorOverview: true }, "calendar");
  assert.equal(c.detailFilters.sectorOverview, false);
  assert.equal(c.detailFocusRecordKey, "grocery");
  assert.ok(grid(c, rows).includes("<h4>장보기/마트</h4>"));
});

test("섹터 전체 상세에서 돌아오면 원래 대시보드 월과 필터를 복원한다", () => {
  const c = detailContext();
  let view = "";
  let sharedMonth = "";
  Object.assign(c, {
    window: { scrollY: 320, scrollTo() {} }, document: { querySelector: () => null }, requestAnimationFrame: (fn) => fn(),
    switchView: (value) => { view = value; }, renderDetailView() {}, renderBoard() {},
    setSharedSelectedMonth: (value) => { sharedMonth = value; }
  });
  c.els.boardFilterSector = { value: "all" };
  c.els.boardFilterSearch = { value: "" };
  c.openDetailView({ sourceView: "board", month: "2026-09", sector: "식비", subcategory: "all", showSectorOverview: true });
  c.detailFilters.month = "2026-08";
  c.els.boardMonth.value = "2026-08";
  c.returnFromDetailView();
  assert.equal(view, "board");
  assert.equal(sharedMonth, "2026-09");
  assert.equal(c.els.boardMonth.value, "2026-09");
  assert.equal(c.els.boardFilterSector.value, "all");
  assert.equal(c.detailSelectedSectionKey, "");
});
