const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, name), "utf8");

function setupLoader() {
  const scripts = [];
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    window: {},
    document: {
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { appendChild: (script) => scripts.push(script) }
    },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id)
  });
  vm.runInContext(source("src/utils/excel-loader.js"), context);
  return { context, scripts, timers };
}

test("엑셀은 첫 사용에만 로드하고 동시 요청은 하나로 합친다", async () => {
  const { context: c, scripts, timers } = setupLoader();
  assert.equal(scripts.length, 0);
  const first = c.loadExcelLibrary();
  const second = c.loadExcelLibrary();
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].async, true);
  const library = { read() {} };
  c.window.XLSX = library;
  scripts[0].onload();
  assert.equal(await first, library);
  assert.equal(await c.loadExcelLibrary(), library);
  assert.equal(scripts.length, 1);
  assert.equal(timers.size, 0);
});

test("로딩 오류·초기화 오류·시간 초과 뒤 다시 불러올 수 있다", async () => {
  for (const failure of ["network", "missing-global", "timeout"]) {
    const { context: c, scripts, timers } = setupLoader();
    const first = c.loadExcelLibrary();
    const rejection = assert.rejects(first);
    if (failure === "network") scripts[0].onerror();
    else if (failure === "missing-global") scripts[0].onload();
    else [...timers.values()][0]();
    await rejection;
    assert.equal(scripts[0].removed, true);
    assert.equal(scripts[0].onload, null);
    assert.equal(timers.size, 0);
    const retry = c.loadExcelLibrary();
    assert.equal(scripts.length, 2);
    c.window.XLSX = { ready: true };
    scripts[1].onload();
    assert.equal((await retry).ready, true);
  }
});

test("초기 HTML은 파서를 실행하지 않으며 같은 로컬 URL을 오프라인 캐시에 포함한다", () => {
  const html = source("index.html");
  assert.doesNotMatch(html, /<script\b[^>]*src="[^\"]*xlsx\.full\.min\.js/);
  assert.match(html, /src="src\/utils\/excel-loader\.js\?v=/);
  const url = source("src/utils/excel-loader.js").match(/EXCEL_LIBRARY_URL = "([^"]+)"/)[1];
  const manifest = JSON.parse(source("service-worker.js").match(/const APP_FILES\s*=\s*(\[[\s\S]*?\]);/)[1]);
  assert.ok(manifest.includes(url));
  assert.ok(fs.existsSync(path.join(root, url.split("?")[0])));
});

function setupExport() {
  const library = require("../assets/vendor/xlsx.full.min.js");
  const downloads = [];
  const alerts = [];
  const xlsx = { ...library, writeFile: (workbook, name) => downloads.push({ workbook, name }) };
  const context = vm.createContext({
    window: { XLSX: xlsx }, XLSX: xlsx,
    loadExcelLibrary: async () => xlsx,
    els: { exportButton: { disabled: false }, monthlyTable: { querySelectorAll: () => [] } },
    classified: [{ flow: "expense", amount: 12300, merchant: "가상서점" }],
    rules: [], products: [], recurringExpenses: [],
    sourceTypeLabel: () => "직접 입력", installmentMonthlyAmount: () => 0,
    reimbursementFor: () => 0, actualAmount: (item) => item.amount,
    consumptionAmount: (item) => item.amount,
    alert: (message) => alerts.push(message)
  });
  for (const name of ["loanGrossPrincipalAmount", "loanGrossInterestAmount", "loanPrincipalActualAmount", "loanInterestActualAmount", "loanSupportPrincipalAmount", "loanSupportInterestAmount", "loanSupportReceivedAmount"]) {
    context[name] = () => 0;
  }
  vm.runInContext(source("src/utils/backup.js"), context);
  context.buildAllDetailSummaryRows = () => [];
  return { context, downloads, alerts, library };
}

test("첫 내보내기는 로딩을 기다리고 중복 클릭을 막으며 실제 XLSX 파일 내용을 유지한다", async () => {
  const { context: c, downloads, library } = setupExport();
  let loaded;
  c.loadExcelLibrary = () => new Promise((resolve) => { loaded = resolve; });
  const pending = c.exportWorkbook();
  assert.equal(c.els.exportButton.disabled, true);
  assert.equal(downloads.length, 0);
  await c.exportWorkbook();
  loaded(c.XLSX);
  await pending;
  assert.equal(downloads.length, 1);
  assert.equal(c.els.exportButton.disabled, false);
  const saved = library.read(library.write(downloads[0].workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  assert.equal(saved.SheetNames.length, 6);
  const rows = library.utils.sheet_to_json(saved.Sheets["분류내역"]);
  assert.equal(rows[0]["가맹점명"], "가상서점");
  assert.equal(rows[0]["승인금액(원)"], 12300);
});

test("내보내기 로딩·파일 쓰기 실패 뒤 버튼과 기록을 유지하고 재시도할 수 있다", async () => {
  for (const failure of ["load", "write"]) {
    const { context: c, downloads, alerts } = setupExport();
    const original = c.XLSX.writeFile;
    if (failure === "load") c.loadExcelLibrary = async () => { throw new Error("offline without cache"); };
    else c.XLSX.writeFile = () => { throw new Error("write failed"); };
    await c.exportWorkbook();
    assert.equal(downloads.length, 0);
    assert.equal(c.classified[0].amount, 12300);
    assert.equal(c.els.exportButton.disabled, false);
    assert.match(alerts[0], /기록은 그대로 유지/);
    c.loadExcelLibrary = async () => c.XLSX;
    c.XLSX.writeFile = original;
    await c.exportWorkbook();
    assert.equal(downloads.length, 1);
  }
});
