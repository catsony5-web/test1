const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const XLSX = require("../assets/vendor/xlsx.full.min.js");
const root = path.join(__dirname, "..");
const copy = (value) => JSON.parse(JSON.stringify(value));

function setup() {
  const context = vm.createContext({ XLSX, transactions: [], recurringExpenses: [], normalizeFoodOccasion: (value) => value || "" });
  for (const filename of [
    "src/utils/date.js", "src/utils/normalize.js", "src/utils/grouping.js", "src/components/chips.js",
    "src/data/field-aliases.js", "src/features/transactions/transactions-view.js",
    "src/features/recurring/recurring-view.js", "src/features/import/transaction-parser.js", "src/features/import/excel-import.js"
  ]) vm.runInContext(fs.readFileSync(path.join(root, filename), "utf8"), context, { filename });
  context.defaultDateForMonth = () => "2026-12-15";
  return context;
}

// The v193 public behavior is the reference: only the first active posted record counts.
function previousOverlapCount(context, incoming) {
  return context.recurringExpenses.filter((item) => item.recurringType !== "loan")
    .reduce((count, item) => count + [...new Set(incoming.map((row) => row.month))].filter((month) => {
      const posted = context.findPostedRecurringTransaction(item.id, month);
      return posted?.recurringPostMethod === "auto" && context.recurringImportCandidates(item, month, incoming).length > 0;
    }).length, 0);
}

const posted = (overrides = {}) => ({
  recordKey: "posted", recurringId: "rent", recurringPostMethod: "auto", sourceType: "recurring",
  flow: "expense", approvalDate: "2026-09-05", month: "2026-09", merchant: "월세", amount: 50000, ...overrides
});
const incomingRow = (overrides = {}) => ({
  recordKey: "imported", sourceType: "transfer", flow: "expense", approvalDate: "2026-09-05",
  month: "2026-09", merchant: "임대인 출금", amount: 50000, ...overrides
});

test("고정 지출 중복 안내는 금액·이름·취소·연결·날짜·유형의 기존 판정을 보존한다", () => {
  const cases = [
    [{}, 1], [{ amount: "50000" }, 1], [{ amount: 20000, merchant: "  월세  " }, 1],
    [{ amount: 20000, merchant: "다른 출금" }, 0], [{ amount: 0, merchant: "월세" }, 0],
    [{ amount: -50000, merchant: "월세" }, 0], [{ cancel: "취소" }, 0], [{ flow: "income" }, 0],
    [{ recurringId: "linked" }, 0], [{ sourceType: "manual" }, 0], [{ sourceType: "card" }, 1],
    [{ approvalDate: "2026-10-05" }, 0], [{ approvalDate: "2026-12-20", month: "2026-12" }, 0],
    [{ month: "2026-08" }, 0], [{ month: "" }, 0]
  ];
  for (const [overrides, expected] of cases) {
    const c = setup();
    c.recurringExpenses = [{ id: "rent", name: "월세", amount: 50000 }];
    c.transactions = [posted(), posted({ recordKey: "december", month: "2026-12", approvalDate: "2026-12-05" })];
    const incoming = [incomingRow(overrides)];
    const before = JSON.stringify([c.transactions, incoming]);
    assert.equal(c.countRecurringImportOverlaps(incoming), expected, JSON.stringify(overrides));
    assert.equal(c.countRecurringImportOverlaps(incoming), previousOverlapCount(c, incoming));
    assert.equal(JSON.stringify([c.transactions, incoming]), before);
    c.recurringExpenses[0].recurringType = "loan";
    assert.equal(c.countRecurringImportOverlaps(incoming), 0);
  }
});

test("같은 고정 지출·월의 첫 유효 기록이 수동이면 뒤의 자동 기록을 중복 후보로 취급하지 않는다", () => {
  for (const [records, expected] of [
    [[posted({ recurringPostMethod: "manual" }), posted({ recordKey: "second" })], 0],
    [[posted(), posted({ recordKey: "second", recurringPostMethod: "manual" })], 1],
    [[posted({ cancel: "취소", recurringPostMethod: "manual" }), posted({ recordKey: "second" })], 1],
    [[posted({ cancel: "취소" })], 0],
    [[posted({ recurringPostMethod: "" }), posted({ recordKey: "second" })], 0]
  ]) {
    const c = setup();
    c.recurringExpenses = [{ id: "rent", name: "월세", amount: 50000 }];
    c.transactions = records;
    assert.equal(c.countRecurringImportOverlaps([incomingRow(), incomingRow({ recordKey: "duplicate" })]), expected);
    assert.equal(previousOverlapCount(c, [incomingRow()]), expected);
  }
});

test("여러 월과 고정 지출을 점검해도 각 기존·가져온 거래를 한 번만 정규화한다", () => {
  const c = setup();
  const months = Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}`);
  c.recurringExpenses = Array.from({ length: 30 }, (_, index) => ({ id: `recurring-${index}`, name: `정기 ${index}`, amount: 50000 }));
  c.transactions = c.recurringExpenses.flatMap((item) => months.map((month) => posted({ recurringId: item.id, month, approvalDate: `${month}-05` })));
  c.transactions.push(...Array.from({ length: 5000 - c.transactions.length }, (_, index) => incomingRow({ recordKey: `old-${index}` })));
  const incoming = Array.from({ length: 1000 }, (_, index) => incomingRow({ month: months[index % 12], approvalDate: `${months[index % 12]}-05` }));
  let calls = 0;
  const normalize = c.normalizeStoredTransaction;
  c.normalizeStoredTransaction = (item) => { calls++; return normalize(item); };
  assert.equal(c.countRecurringImportOverlaps(incoming), 360);
  assert.equal(calls, c.transactions.length + incoming.length);
  calls = 0;
  c.recurringExpenses = [];
  assert.equal(c.countRecurringImportOverlaps(incoming), 0);
  assert.equal(calls, 0);
});

function workbook(sheets) {
  return { SheetNames: Object.keys(sheets), Sheets: sheets };
}

test("빈 시트를 건너뛰고 시작행·시작열이 다른 카드 표의 헤더 위치와 서식을 보존한다", () => {
  const c = setup();
  const sheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(sheet, [["카드 명세"], [], ["날짜", "사용처", "금액"], ["2026-09-05", "마트", 12345]], { origin: "C4" });
  sheet["!ref"] = "C4:E7";
  sheet.E7.z = "#,##0";
  const found = c.findImportSheet(workbook({ empty: {}, offset: sheet }));
  assert.equal(found.sheetName, "offset");
  assert.equal(found.kind, "card");
  assert.equal(found.headerRowIndex, 2);
  assert.deepEqual(copy(found.map), { date: 0, merchant: 1, amount: 2 });
  assert.deepEqual(copy(found.rows), [["카드 명세", "", ""], ["", "", ""], ["날짜", "사용처", "금액"], ["2026-09-05", "마트", "12,345"]]);
  const records = c.parseImportedTransactions(found, "offset.xlsx");
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 12345);
  assert.equal(records[0].month, "2026-09");
});

test("헤더 탐색은 기존처럼 사용 범위의 첫 12행까지만 검사하고 이체 우선 판정을 유지한다", () => {
  const c = setup();
  const header = ["날짜", "사용처", "금액", "지급", "맡기신"];
  const twelfth = XLSX.utils.aoa_to_sheet([...Array.from({ length: 11 }, () => ["안내"]), header, ["2026-09-05", "통장", 3, 1, 2]]);
  const thirteenth = XLSX.utils.aoa_to_sheet([...Array.from({ length: 12 }, () => ["안내"]), header]);
  const found = c.findImportSheet(workbook({ thirteenth, twelfth }));
  assert.equal(found.sheetName, "twelfth");
  assert.equal(found.headerRowIndex, 11);
  assert.equal(found.kind, "transfer");
  assert.equal(c.findImportSheet(workbook({ thirteenth })), null);
  const records = c.parseImportedTransactions(found, "transfer.xlsx");
  assert.deepEqual(copy(records.map((record) => [record.flow, record.amount])), [["expense", 1], ["income", 2]]);
});

test("선택되지 않은 큰 시트는 첫 12행만 변환하고 선택한 시트의 거래는 끝까지 읽는다", () => {
  const c = setup();
  const ignored = XLSX.utils.aoa_to_sheet(Array.from({ length: 20000 }, () => ["안내", "정보", "항목"]));
  const selected = XLSX.utils.aoa_to_sheet([["날짜", "사용처", "금액"], ...Array.from({ length: 50 }, (_, index) => ["2026-09-05", `가게 ${index}`, index + 1])]);
  const later = XLSX.utils.aoa_to_sheet([["날짜", "사용처", "금액"]]);
  const calls = [];
  c.XLSX = { utils: { ...XLSX.utils, sheet_to_json(sheet, options) {
    calls.push({ sheet, range: options.range });
    return XLSX.utils.sheet_to_json(sheet, options);
  } } };
  const found = c.findImportSheet(workbook({ ignored, selected, later }));
  assert.equal(found.sheetName, "selected");
  assert.equal(c.parseImportedTransactions(found).length, 50);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].sheet, ignored);
  assert.equal(calls[0].range.e.r - calls[0].range.s.r + 1, 12);
  assert.equal(calls[1].sheet, selected);
  assert.equal(calls[1].range.e.r - calls[1].range.s.r + 1, 12);
  assert.equal(calls[2].sheet, selected);
  assert.equal(calls[2].range, undefined);
});

test("정규화된 병합 결과를 그대로 저장해도 기존 거래 기본값과 수입·대출 금액을 보존한다", async () => {
  const c = setup();
  c.transactions = [{ recordKey: "old", approvalDate: "2026-09-01", amount: "1234", flow: "income", loanPrincipalAmount: 100, loanSupportPrincipalAmount: 200 }];
  const sheet = XLSX.utils.aoa_to_sheet([["날짜", "사용처", "금액"], ["2026-09-05", "마트", 5000]]);
  const buffer = XLSX.write(workbook({ card: sheet }), { type: "buffer", bookType: "xlsx" });
  const writes = [];
  const snapshots = [];
  const alerts = [];
  Object.assign(c, {
    loadExcelLibrary: async () => XLSX,
    RECORD_STORAGE_KEY: "records", IMPORT_META_STORAGE_KEY: "meta", currentFileName: "", importMeta: {},
    createAutoSnapshot: async (reason) => snapshots.push(reason),
    safeSaveMany: async (entries) => { writes.push(copy(entries)); return true; },
    reclassify: () => {}, alert: (message) => alerts.push(message)
  });
  await c.handleFile({ target: { files: [{ name: "actual.xlsx", size: buffer.length, arrayBuffer: async () => buffer }], disabled: false, value: "selected" } });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].protectIncomeRecords, true);
  const stored = writes[0][0].data;
  assert.equal(stored.length, 2);
  assert.equal(stored[0].flow, "income");
  assert.equal(stored[0].amount, 1234);
  assert.equal(stored[0].transactionId, "old");
  assert.equal(stored[0].month, "2026-09");
  assert.equal(stored[0].loanSupportPrincipalAmount, 100);
  assert.equal(stored[1].transactionId, stored[1].recordKey);
  assert.equal(stored[1].amount, 5000);
  assert.deepEqual(copy(c.transactions), stored);
  assert.deepEqual(snapshots, ["엑셀 업로드 전", "엑셀 업로드 완료 후"]);
  assert.match(alerts.at(-1), /불러왔습니다/);
});
