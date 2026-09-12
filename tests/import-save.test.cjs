const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const copy = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const alerts = [];
  const writes = [];
  const snapshots = [];
  let renders = 0;
  const xlsx = { read: () => ({}) };
  const context = vm.createContext({
    window: { XLSX: xlsx }, XLSX: xlsx,
    alert: (message) => alerts.push(message),
    transactions: [{ recordKey: "old", amount: 100 }],
    importMeta: { lastFileName: "previous.xlsx" }, currentFileName: "previous.xlsx",
    RECORD_STORAGE_KEY: "records", IMPORT_META_STORAGE_KEY: "importMeta",
    normalizeStoredTransaction: (value) => ({ ...value }),
    parseImportedTransactions: () => [{ recordKey: "new", amount: 200 }],
    mergeTransactions: (previous, incoming) => ({ records: [...previous, ...incoming], added: 1, skipped: 0 }),
    createAutoSnapshot: async (reason) => { snapshots.push(reason); },
    safeSaveMany: async (entries) => { writes.push(copy(entries)); return true; },
    reclassify: () => { renders += 1; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/features/import/excel-import.js"), "utf8"), context);
  context.findImportSheet = () => ({ kind: "card" });
  const input = {
    files: [{ name: "synthetic.xlsx", size: 128, arrayBuffer: async () => new ArrayBuffer(0) }],
    value: "selected", disabled: false
  };
  return { context, input, alerts, writes, snapshots, renders: () => renders };
}

test("엑셀 거래와 가져오기 정보는 한 번에 저장하고 커밋 후에만 메모리를 바꾼다", async () => {
  const { context: c, input, writes, alerts } = setup();
  const commit = deferred();
  const started = deferred();
  c.safeSaveMany = async (entries) => { writes.push(copy(entries)); started.resolve(); return commit.promise; };
  const loading = c.handleFile({ target: input });
  await started.promise;
  assert.equal(c.transactions.length, 1);
  assert.equal(c.currentFileName, "previous.xlsx");
  assert.equal(input.disabled, true);
  assert.deepEqual(writes[0].map((entry) => entry.key), ["records", "importMeta"]);
  assert.equal(writes[0][0].protectIncomeRecords, true);
  commit.resolve(true);
  await loading;
  assert.equal(c.transactions.length, 2);
  assert.equal(c.currentFileName, "synthetic.xlsx");
  assert.equal(c.importMeta.lastAddedCount, 1);
  assert.equal(input.disabled, false);
  assert.equal(input.value, "");
  assert.ok(alerts.some((message) => message.includes("불러왔습니다")));
});

test("엑셀 저장 실패는 기존 거래·파일 정보를 유지하고 완료를 표시하지 않는다", async () => {
  const { context: c, input, alerts, snapshots, renders } = setup();
  c.safeSaveMany = async () => false;
  await c.handleFile({ target: input });
  assert.equal(c.transactions.length, 1);
  assert.equal(c.importMeta.lastFileName, "previous.xlsx");
  assert.equal(c.currentFileName, "previous.xlsx");
  assert.equal(snapshots.length, 1);
  assert.equal(renders(), 0);
  assert.ok(alerts.every((message) => !message.includes("불러왔습니다")));
  assert.equal(input.disabled, false);
});

test("파일 읽기·파싱 실패 후 다음 가져오기를 다시 실행할 수 있다", async () => {
  for (const stage of ["read", "parse"]) {
    const { context: c, input, alerts, writes } = setup();
    if (stage === "read") input.files[0].arrayBuffer = async () => { throw new Error("unreadable"); };
    else c.XLSX.read = () => { throw new Error("invalid workbook"); };
    await c.handleFile({ target: input });
    assert.equal(writes.length, 0);
    assert.equal(c.transactions.length, 1);
    assert.ok(alerts.some((message) => message.includes("불러오지 못했습니다")));
    input.files[0].arrayBuffer = async () => new ArrayBuffer(0);
    c.XLSX.read = () => ({});
    await c.handleFile({ target: input });
    assert.equal(c.transactions.length, 2);
  }
});

test("가져오는 중에는 겹치는 파일 요청을 실행하지 않는다", async () => {
  const { context: c, input, alerts, writes } = setup();
  const reading = deferred();
  input.files[0].arrayBuffer = () => reading.promise;
  const first = c.handleFile({ target: input });
  let secondRead = false;
  const second = { files: [{ name: "second.xlsx", size: 10, arrayBuffer: async () => { secondRead = true; } }] };
  await c.handleFile({ target: second });
  assert.equal(secondRead, false);
  assert.ok(alerts.some((message) => message.includes("불러오는 중")));
  reading.resolve(new ArrayBuffer(0));
  await first;
  assert.equal(writes.length, 1);
});

test("저장 후 스냅샷·화면 갱신 실패를 거래 저장 실패로 안내하지 않는다", async () => {
  const { context: c, input, alerts } = setup();
  c.createAutoSnapshot = async (reason) => { if (reason.includes("완료 후")) throw new Error("snapshot failed"); };
  c.reclassify = () => { throw new Error("render failed"); };
  await c.handleFile({ target: input });
  assert.equal(c.transactions.length, 2);
  const message = alerts.at(-1);
  assert.match(message, /불러왔습니다/);
  assert.match(message, /자동 스냅샷을 만들지 못했습니다/);
  assert.match(message, /화면을 갱신하지 못했습니다/);
  assert.doesNotMatch(message, /기존 기록은 유지됩니다/);
});

test("엑셀 크기 제한과 파서 미로딩은 기존 기록을 바꾸지 않는다", async () => {
  const { context: c, input, writes } = setup();
  input.files[0].size = 20 * 1024 * 1024 + 1;
  await c.handleFile({ target: input });
  input.files[0].size = 10;
  c.window.XLSX = null;
  await c.handleFile({ target: input });
  assert.equal(writes.length, 0);
  assert.equal(c.transactions.length, 1);
});
