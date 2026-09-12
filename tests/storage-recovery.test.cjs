const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function load(context, file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
}

function setup({ indexed = true, failCommit = false, failPut = false, failRead = false, localFails = false } = {}) {
  const local = new Map();
  const primary = new Map();
  const alerts = [];
  const context = vm.createContext({
    console: { warn() {}, error() {} }, structuredClone, window: indexed ? { indexedDB: {} } : {},
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem(key, value) { if (localFails) throw new Error("quota"); local.set(key, value); },
      removeItem: (key) => local.delete(key)
    },
    alert: (message) => alerts.push(message), appSettings: {},
    normalizeStoredTransaction: (item) => ({ ...item }), renderSnapshotPanel: async () => {}
  });
  load(context, "src/data/constants.js");
  load(context, "src/utils/storage.js");
  const storageFunctions = { renderSnapshotPanel: context.renderSnapshotPanel, createAutoSnapshot: context.createAutoSnapshot };
  context.renderSnapshotPanel = async () => {};
  context.createAutoSnapshot = async () => ({});
  let commits = 0, opened = 0, closed = 0;
  const transactionLog = [];
  context.openPrivateDb = async () => {
    opened += 1;
    return {
    close() { closed += 1; },
    transaction(store, mode) {
      const writes = [];
      const operations = [];
      transactionLog.push({ mode, operations });
      let pendingRequests = 0, completed = false;
      const tx = { error: null, aborted: false,
        abort() { this.aborted = true; queueMicrotask(() => this.onabort?.()); },
        objectStore() { return {
          get(key) {
            operations.push({ type: "get", key });
            const request = {};
            pendingRequests += 1;
            queueMicrotask(() => {
              if (failRead) { tx.error = new Error("read failed"); tx.abort(); return; }
              if (tx.aborted) return;
              request.result = primary.has(key) ? { value: copy(primary.get(key)) } : undefined;
              request.onsuccess?.();
              pendingRequests -= 1;
              queueMicrotask(complete);
            });
            return request;
          },
          put(entry) {
            operations.push({ type: "put", key: entry.key });
            if (failPut && writes.length) throw new Error("clone failed");
            writes.push(copy(entry));
          }
        }; }
      };
      function complete() {
        if (tx.aborted || completed || pendingRequests) return;
        completed = true;
        if (mode === "readwrite" && failCommit) { tx.error = new Error("write failed"); tx.onerror?.(); tx.abort(); return; }
        for (const { key, value } of writes) primary.set(key, value);
        if (mode === "readwrite") commits += 1;
        tx.oncomplete?.();
      }
      queueMicrotask(complete);
      return tx;
    }
  }; };
  const keys = vm.runInContext("({...STORAGE_KEYS, lastGood: LAST_GOOD_SUFFIX})", context);
  return { context, local, primary, alerts, keys, transactionLog, storageFunctions, commits: () => commits,
    connections: () => ({ opened, closed }) };
}

test("빈 거래 목록은 이전 정상 백업으로 되살리지 않는다", async () => {
  const { context: c, primary, keys } = setup();
  primary.set(keys.records, []);
  primary.set(keys.records + keys.lastGood, [{ recordKey: "old", amount: 50000 }]);
  assert.deepEqual(copy(await c.loadTransactions()), []);
});

test("읽기 트랜잭션은 성공과 중단 모두 연결을 닫고 웹 보조 사본을 보존한다", async () => {
  for (const failRead of [false, true]) {
    const { context: c, primary, local, connections } = setup({ failRead });
    primary.set("synthetic", 42);
    local.set("synthetic", "21");
    for (let index = 0; index < 25; index += 1) {
      assert.equal(await c.readPrivateData("synthetic"), failRead ? 21 : 42);
    }
    assert.deepEqual(connections(), { opened: 25, closed: 25 });
  }
});

test("겹친 묶음 저장과 단건 저장은 호출 순서를 지키고 직전 커밋을 마지막 정상값으로 남긴다", async () => {
  const { context: c, primary, commits, connections } = setup();
  primary.set("synthetic-records", 0);
  primary.set("synthetic-meta", 0);
  const results = await Promise.all([
    c.safeSaveMany([{ key: "synthetic-records", data: 1 }, { key: "synthetic-meta", data: 1 }]),
    c.safeSave("synthetic-records", 2)
  ]);
  assert.deepEqual(results, [true, true]);
  assert.equal(primary.get("synthetic-records"), 2);
  assert.equal(primary.get("synthetic-records:last-good"), 1);
  assert.equal(commits(), 2);
  assert.deepEqual(connections(), { opened: 2, closed: 2 });
});

test("대기 중 원본 변경은 저장 요청에 섞이지 않고 실패한 요청 뒤에도 저장 큐가 진행된다", async () => {
  const { context: c, primary } = setup();
  const value = { amount: 1 };
  const first = c.writePrivateData("synthetic", value);
  value.amount = 2;
  await first;
  assert.deepEqual(primary.get("synthetic"), { amount: 1 });
  const open = c.openPrivateDb;
  let calls = 0;
  c.openPrivateDb = () => ++calls === 1 ? Promise.reject(new Error("temporary failure")) : open();
  const results = await Promise.all([c.safeSave("synthetic", 3), c.safeSave("synthetic", 4)]);
  assert.deepEqual(results, [false, true]);
  assert.equal(primary.get("synthetic"), 4);
});

test("수입 보호로 중단한 저장은 큐를 해제한 뒤 보호 스냅샷을 저장한다", async () => {
  const { context: c, primary, keys } = setup();
  primary.set(keys.records, [{ flow: "income", amount: 1 }]);
  c.createAutoSnapshot = async () => {
    await c.writePrivateData("synthetic-snapshot", { preserved: true });
    return {};
  };
  assert.equal(await c.safeSave(keys.records, [], { protectIncomeRecords: true }), false);
  assert.deepEqual(primary.get("synthetic-snapshot"), { preserved: true });
  assert.equal(primary.get(keys.records)[0].amount, 1);
  assert.equal(await c.safeSave("synthetic-next", 2), true);
});

test("일반 저장은 저장소의 최신 설정을 보존하고 명시적인 설정 저장만 선택값을 바꾼다", async () => {
  const { context: c, primary, keys, transactionLog } = setup();
  c.appSettings = { theme: "minimal", backgroundOpacity: 0.1 };
  primary.set(keys.settings, { theme: "dark", backgroundOpacity: 0.3 });
  assert.equal(await c.safeSave("synthetic", 1), true);
  assert.equal(primary.get(keys.settings).theme, "dark");
  assert.equal(primary.get(keys.settings).backgroundOpacity, 0.3);
  assert.ok(transactionLog[0].operations.some(({ type, key }) => type === "get" && key === keys.settings));
  assert.equal(await c.safeSave(keys.settings, { theme: "garden-ink" }), true);
  assert.equal(primary.get(keys.settings).theme, "garden-ink");
  assert.equal(primary.get(keys.settings + keys.lastGood).theme, "dark");
});

function snapshotElements() {
  return Object.fromEntries([
    "autoSaveStatus", "snapshotCount", "snapshotList", "restoreLatestSnapshotButton",
    "fileName", "totalAmount", "transactionCount", "unknownCount"
  ].map((name) => [name, { textContent: "", innerHTML: "", querySelectorAll: () => [] }]));
}

test("일반 저장과 상태 갱신은 전체 스냅샷을 읽지 않고 명시적 목록 새로고침만 읽는다", async () => {
  const { context: c, primary, keys, transactionLog, storageFunctions } = setup();
  c.els = snapshotElements();
  c.escapeHtml = String;
  c.renderSnapshotPanel = storageFunctions.renderSnapshotPanel;
  Object.assign(c, { classified: [], reportingExpenseRows: () => [], sumConsumption: () => 0,
    formatWon: String, currentFileName: "", importMeta: {} });
  load(c, "src/features/app/render-all.js");
  primary.set(keys.autoSnapshots, Array.from({ length: 12 }, (_,index) => ({
    id: `snapshot-${index}`, reason: `합성 ${index}`, createdAt: "2026-09-12T00:00:00Z",
    data: { records: Array.from({ length: 1000 }, (_,id) => ({ id, amount: 1 })) }
  })));
  assert.equal(await c.safeSave("synthetic", 1), true);
  c.renderStatus();
  const snapshotReads = () => transactionLog.flatMap(({ operations }) => operations)
    .filter(({ type, key }) => type === "get" && key === keys.autoSnapshots).length;
  assert.equal(snapshotReads(), 0);
  assert.notEqual(c.els.autoSaveStatus.textContent, "");
  await c.renderSnapshotPanel({ type: "click" });
  assert.equal(snapshotReads(), 1);
  assert.equal(c.els.snapshotCount.textContent, "12개");
  assert.match(c.els.snapshotList.innerHTML, /합성 4/);
  assert.doesNotMatch(c.els.snapshotList.innerHTML, /합성 5/);
});

test("스냅샷 생성은 기존 목록을 한 번 읽고 방금 저장한 목록으로 화면을 갱신한다", async () => {
  const { context: c, primary, keys, transactionLog, storageFunctions } = setup();
  c.els = snapshotElements();
  c.escapeHtml = String;
  c.isCreatingSnapshot = false;
  c.renderSnapshotPanel = storageFunctions.renderSnapshotPanel;
  c.createAutoSnapshot = storageFunctions.createAutoSnapshot;
  c.collectSnapshotData = () => ({ records: [{ id: "synthetic", amount: 1 }] });
  primary.set(keys.autoSnapshots, [{ id: "old", reason: "이전", data: { records: [] } }]);
  const snapshot = await c.createAutoSnapshot("합성 저장 전");
  assert.equal(primary.get(keys.autoSnapshots).length, 2);
  assert.equal(primary.get(keys.autoSnapshots)[0].id, snapshot.id);
  assert.equal(c.els.snapshotCount.textContent, "2개");
  assert.equal(transactionLog.flatMap(({ operations }) => operations)
    .filter(({ type, key }) => type === "get" && key === keys.autoSnapshots).length, 1);
  assert.equal(c.isCreatingSnapshot, false);
});

test("거래 키가 없거나 로컬 JSON이 손상된 경우에는 마지막 정상 백업을 읽는다", async () => {
  const { context: c, local, keys } = setup({ indexed: false });
  const previous = [{ recordKey: "old", amount: 50000 }];
  local.set(keys.records + keys.lastGood, JSON.stringify(previous));
  assert.deepEqual(copy(await c.loadTransactions()), previous);
  local.set(keys.records, "{broken");
  assert.deepEqual(copy(await c.loadTransactions()), previous);
});

test("IndexedDB 커밋 실패 시 보조 저장소도 바꾸지 않고 실패를 반환한다", async () => {
  const { context: c, primary, local, keys, alerts } = setup({ failCommit: true });
  const previous = [{ amount: 10000 }];
  primary.set(keys.records, previous);
  local.set(keys.records, JSON.stringify(previous));
  assert.equal(await c.safeSave(keys.records, [{ amount: 20000 }]), false);
  assert.deepEqual(copy(await c.loadTransactions()), previous);
  assert.deepEqual(JSON.parse(local.get(keys.records)), previous);
  assert.equal(c.appSettings.lastSavedAt, undefined);
  assert.ok(alerts.some((message) => message.includes("저장하지 못했습니다")));
});

test("IndexedDB를 열지 못해도 로컬 저장 성공으로 위장하지 않는다", async () => {
  const { context: c, local } = setup();
  local.set("records", "[1]");
  c.openPrivateDb = async () => { throw new Error("unavailable"); };
  await assert.rejects(c.writePrivateData("records", [2]), /unavailable/);
  assert.equal(local.get("records"), "[1]");
});

test("거래·정산금·이전 백업·저장 시각은 하나의 트랜잭션으로 저장한다", async () => {
  const { context: c, primary, local, keys, commits, transactionLog, connections } = setup();
  primary.set(keys.records, [{ amount: 10000 }]);
  const entries = [{ key: keys.records, data: [{ amount: 20000 }] }, { key: keys.reimbursements, data: { a: 10000 } }];
  assert.equal(await c.safeSaveMany(entries), true);
  assert.equal(commits(), 1);
  assert.deepEqual(primary.get(keys.records + keys.lastGood), [{ amount: 10000 }]);
  assert.deepEqual(primary.get(keys.reimbursements), { a: 10000 });
  assert.deepEqual(JSON.parse(local.get(keys.records)), [{ amount: 20000 }]);
  assert.equal(primary.get(keys.settings).lastSavedAt, c.appSettings.lastSavedAt);
  assert.equal(transactionLog.length, 1, "Previous values must be read in the same transaction as the commit");
  assert.equal(transactionLog[0].mode, "readwrite");
  assert.ok(transactionLog[0].operations.some(({ type }) => type === "get"));
  assert.ok(transactionLog[0].operations.some(({ type }) => type === "put"));
  assert.deepEqual(connections(), { opened: 1, closed: 1 });
});

test("묶음 저장 중 put 예외나 커밋 중단 시 일부 항목도 남기지 않는다", async () => {
  for (const options of [{ failPut: true }, { failCommit: true }]) {
    const { context: c, primary, local } = setup(options);
    primary.set("a", 1); primary.set("b", 2);
    await assert.rejects(c.writePrivateDataMany([{ key: "a", value: 3 }, { key: "b", value: 4 }]));
    assert.equal(primary.get("a"), 1);
    assert.equal(primary.get("b"), 2);
    assert.equal(local.size, 0);
  }
});

test("보조 사본 저장 실패는 기본 저장소의 성공을 뒤집지 않는다", async () => {
  const { context: c, primary, keys } = setup({ localFails: true });
  assert.equal(await c.safeSave(keys.records, [{ amount: 20000 }]), true);
  assert.deepEqual(copy(await c.loadTransactions()), primary.get(keys.records));
});

test("IndexedDB 미지원 환경의 로컬 저장 및 중간 실패 복구", async () => {
  const { context: c, local } = setup({ indexed: false });
  await c.writePrivateDataMany([{ key: "a", value: 1 }, { key: "b", value: 2 }]);
  const setItem = c.localStorage.setItem;
  let calls = 0;
  c.localStorage.setItem = (key, value) => { if (++calls === 2) throw new Error("quota"); setItem(key, value); };
  await assert.rejects(c.writePrivateDataMany([{ key: "a", value: 3 }, { key: "b", value: 4 }]), /quota/);
  assert.equal(local.get("a"), "1");
  assert.equal(local.get("b"), "2");
});

test("수입 보호는 유지하고 명시적인 초기화만 허용한다", async () => {
  const { context: c, primary, keys } = setup();
  primary.set(keys.records, [{ flow: "income", amount: 100 }]);
  assert.equal(await c.safeSave(keys.records, [], { protectIncomeRecords: true }), false);
  assert.equal(primary.get(keys.records).length, 1);
  assert.equal(await c.safeSave(keys.records, [], { protectIncomeRecords: true, allowIncomeDrop: true }), true);
  assert.deepEqual(copy(await c.loadTransactions()), []);
});

test("저장 후 표시 오류는 완료된 저장을 실패로 바꾸지 않는다", async () => {
  const { context: c, keys } = setup();
  c.renderSaveStatus = () => { throw new Error("render failed"); };
  assert.equal(await c.safeSave(keys.records, []), true);
});

function setupBackup(options) {
  const env = setup(options);
  const c = env.context;
  load(c, "src/utils/normalize.js");
  load(c, "src/utils/food-occasion.js");
  load(c, "src/utils/backup.js");
  Object.assign(c, {
    transactions: [], reimbursements: {}, importMeta: {}, currentFileName: "", monthlyIncome: {},
    recurringExpenses: [], rules: [], products: [], ipoRecords: [], calendarMemos: {}, goalPlan: {},
    normalizeProduct: (item) => item, applyAppSettings() {},
    createAutoSnapshot: async () => ({}), confirm: () => true, reclassify() {}, renderRestorePreview() {}
  });
  return env;
}

const purchase = { sourceType: "card", sourceFile: "card.xlsx", month: "2026-08", approvalDate: "2026-08-10", merchant: "카페", amount: 4500 };

test("금액·가맹점·날짜가 같아도 서로 다른 ID의 거래는 보존한다", () => {
  const { context: c } = setupBackup();
  const first = { ...purchase, recordKey: "one", transactionId: "id-one", cardNumber: "1111" };
  const second = { ...purchase, recordKey: "two", transactionId: "id-two", cardNumber: "2222" };
  assert.equal(c.mergeTransactionsByRestoreSignature([], [first, second]).length, 2);
  assert.equal(c.mergeTransactionsByRestoreSignature([first], [second]).length, 2);
});

test("동일 거래 ID와 동일 카드 승인 내역은 중복 복원하지 않는다", () => {
  const { context: c } = setupBackup();
  const first = { ...purchase, recordKey: "one", transactionId: "id-one", cardNumber: "1111", approvalNo: "approval" };
  assert.equal(c.mergeTransactionsByRestoreSignature([first], [first]).length, 1);
  const second = { ...first, recordKey: "two", transactionId: "id-two" };
  assert.equal(c.mergeTransactionsByRestoreSignature([first], [second]).length, 1);
  assert.equal(c.mergeTransactionsByRestoreSignature([first], [{ ...second, cardNumber: "2222" }]).length, 2);
});

test("같은 고정 지출의 같은 월 반영은 중복되지 않는다", () => {
  const { context: c } = setupBackup();
  const first = { ...purchase, recurringId: "rent", sourceType: "recurring", recordKey: "one" };
  assert.equal(c.mergeTransactionsByRestoreSignature([first], [{ ...first, recordKey: "two" }]).length, 1);
});

test("선택한 백업 항목 저장 실패가 호출자에게 전달된다", async () => {
  const { context: c } = setupBackup({ failCommit: true });
  c.products = [{ id: "one" }];
  assert.equal(await c.saveSelectedScopes(["products"]), false);
});

test("백업 복원 실패 시 원본 상태를 되돌리고 완료 안내를 하지 않는다", async () => {
  const { context: c, alerts } = setupBackup();
  const original = [{ id: "old" }];
  c.products = original;
  c.normalizeBackupPayload = () => ({ sections: { products: {} }, sectionCounts: { products: 1 } });
  c.selectedDataScopes = () => ["products"];
  c.selectedRestoreMode = () => "merge";
  c.applyRestorePayload = () => { c.products = [{ id: "new" }]; };
  c.saveSelectedScopes = async () => false;
  const event = { target: { files: [{ text: async () => '{"app":"monthly-card-budget"}' }], value: "backup.json" } };
  await c.restoreLocalData(event);
  assert.equal(c.products, original);
  assert.equal(event.target.value, "");
  assert.equal(alerts.some((message) => message.includes("불러왔습니다")), false);
});

test("초기화 실패 시 원래 목록을 유지한다", async () => {
  const { context: c } = setupBackup();
  const original = [{ id: "old" }]; c.products = original;
  c.selectedDataScopes = () => ["products"];
  c.confirmDangerousDataAction = () => true;
  c.saveSelectedScopes = async () => false;
  await c.clearRecords();
  assert.equal(c.products, original);
});

test("복원 데이터 적용 중 예외가 발생해도 메모리 변경을 되돌린다", async () => {
  const { context: c } = setupBackup();
  const original = [{ id: "old" }]; c.products = original;
  const saved = await c.persistDataScopeChange(["products"], () => {
    c.products = [{ id: "new" }];
    throw new Error("invalid backup");
  }, "test");
  assert.equal(saved, false);
  assert.equal(c.products, original);
});

test("변경 전 스냅샷을 저장하지 못하면 복원·초기화를 시작하지 않는다", async () => {
  const { context: c } = setupBackup();
  c.createAutoSnapshot = async () => { throw new Error("quota"); };
  assert.equal(await c.persistDataScopeChange(["products"], () => assert.fail("must not change data"), "test"), false);
});

test("스냅샷 복원 실패 시 원래 목록을 유지하고 완료 안내를 하지 않는다", async () => {
  const { context: c, alerts } = setupBackup();
  const original = [{ id: "old" }]; c.products = original;
  c.loadAutoSnapshots = async () => [{ id: "snapshot", data: {} }];
  c.selectedDataScopes = () => ["products"];
  c.applyRestorePayload = () => { c.products = [{ id: "new" }]; };
  c.saveSelectedScopes = async () => false;
  await c.restoreFromSnapshot("snapshot");
  assert.equal(c.products, original);
  assert.equal(alerts.some((message) => message.includes("복구했습니다")), false);
});

test("소비달력 저장 실패는 입력창·원래 금액·정산금·규칙을 유지하고 성공 시에만 갱신한다", async () => {
  for (const failCommit of [true, false]) {
    const { context: c, primary, keys } = setupBackup({ failCommit });
    load(c, "src/features/calendar/calendar-view.js");
    let renders = 0;
    const original = [{ ...purchase, recordKey: "one", transactionId: "one", amount: 4500 }];
    Object.assign(c, {
      transactions: original, reimbursements: {}, rules: [], calendarEditingRecordKey: "one",
      calendarEditFeedback: null, selectedCalendarDate: "2026-08-10", selectedCalendarMonth: "2026-08",
      normalizeInputDate: (value) => value, normalizeInputTime: (value) => value,
      monthKey: (value) => value.slice(0, 7), toNumber: Number,
      normalizeCategoryAssignment: (sector, subcategory) => ({ sector, subcategory }),
      setSharedSelectedMonth() {}, nextPriority: () => 1, reclassify: () => { renders += 1; }
    });
    primary.set(keys.records, copy(original));
    const values = { date: "2026-08-11", time: "12:00", merchant: "식당", amount: "20000",
      reimbursement: "10000", memo: "저장 전 입력", sector: "식비", subcategory: "외식", foodOccasion: "date" };
    const form = { elements: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])) };
    form.elements.saveRule = { checked: true };
    await c.saveCalendarTransactionEdit("one", form);
    assert.equal(form.elements.memo.value, "저장 전 입력");
    if (failCommit) {
      assert.equal(c.transactions, original);
      assert.equal(c.reimbursements.one, undefined);
      assert.equal(c.rules.length, 0);
      assert.equal(c.calendarEditingRecordKey, "one");
      assert.equal(c.calendarEditFeedback, null);
      assert.equal(renders, 0);
      assert.deepEqual(primary.get(keys.records), copy(original));
    } else {
      assert.equal(c.transactions[0].amount, 20000);
      assert.equal(c.reimbursements.one, 10000);
      assert.equal(c.rules.length, 1);
      assert.equal(c.calendarEditingRecordKey, "");
      assert.match(c.calendarEditFeedback.message, /거래를 저장했습니다/);
      assert.equal(renders, 1);
    }
  }
});

test("고정 지출 점검 실패는 선택값과 원본을 유지하고 성공 시에만 완료 표시한다", async () => {
  for (const failCommit of [true, false]) {
    const { context: c } = setupBackup({ failCommit });
    load(c, "src/features/recurring/recurring-view.js");
    const original = [{ id: "subscription", recurringType: "expense", reviewStatus: "unknown" }];
    let renders = 0;
    Object.assign(c, {
      recurringExpenses: original, normalizeRecurringExpense: (value) => ({ ...value }),
      renderAll: () => { renders += 1; }, els: {
        recurringReviewItemId: { value: "subscription" }, recurringReviewStatus: { value: "keep" },
        recurringReviewNextDate: { value: "2026-10-01" }, recurringReviewFeedback: { textContent: "" }
      }
    });
    await c.handleRecurringReviewSubmit({ preventDefault() {} });
    assert.equal(c.els.recurringReviewStatus.value, "keep");
    assert.equal(c.els.recurringReviewNextDate.value, "2026-10-01");
    if (failCommit) {
      assert.equal(c.recurringExpenses, original);
      assert.match(c.els.recurringReviewFeedback.textContent, /저장하지 못했습니다/);
      assert.equal(renders, 0);
    } else {
      assert.equal(c.recurringExpenses[0].reviewStatus, "keep");
      assert.equal(c.recurringReviewFeedback, "점검 상태를 저장했습니다.");
      assert.equal(renders, 1);
    }
  }
});
