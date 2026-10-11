const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  const writes = [];
  let renders = 0;
  const context = vm.createContext({
    rules: [], transactions: [], classified: [],
    normalizeCategoryAssignment: (sector, subcategory) => ({ sector, subcategory }),
    normalizeKeyText: (value) => String(value || "").trim().toLowerCase(),
    isCanceled: (value) => value === "취소",
    buildSmartSuggestionModel: () => [], suggestCategory: () => null,
    SMART_AUTO_CONFIDENCE: 90, SMART_DISPLAY_CONFIDENCE: 60,
    saveRules: async () => { writes.push(JSON.parse(JSON.stringify(context.rules))); return true; },
    renderAll: () => { renders += 1; },
    confirm: () => true, createAutoSnapshot: async () => {},
    editingRuleIndex: -1, pendingRuleChange: null, ruleFeedback: null
  });
  for (const file of ["classifier.js", "rules-manager.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/features/classification", file), "utf8"), context);
  }
  return { context, writes, renders: () => renders };
}

function transaction(key, extra = {}) {
  return { recordKey: key, merchant: "합성 카페", amount: 1000, flow: "expense", ...extra };
}

test("거래 재분류는 변경하지 않은 규칙을 다시 저장하지 않고 최신 분류를 갱신한다", () => {
  const { context: c, writes, renders } = setup();
  c.rules = [{ sector: "식비", subcategory: "카페/음료", keywords: ["카페"], priority: 1, origin: "user" }];
  c.transactions = [
    transaction("matched"),
    transaction("manual", { manualSector: "기타 소비", manualSubcategory: "선물" }),
    transaction("income", { flow: "income" }),
    transaction("canceled", { cancel: "취소" }),
    transaction("unknown", { merchant: "합성 미확인 거래" })
  ];
  const original = JSON.stringify(c.transactions);
  c.reclassify();
  c.reclassify();
  assert.deepEqual(Array.from(c.classified, (item) => [item.recordKey, item.status]), [
    ["matched", "분류완료"], ["manual", "직접입력"], ["income", "수입"],
    ["canceled", "취소/제외"], ["unknown", "미분류"]
  ]);
  assert.equal(writes.length, 0);
  assert.equal(renders(), 2);
  assert.equal(JSON.stringify(c.transactions), original);
});

test("새 분류 규칙은 한 번 저장하고 같은 규칙의 재등록은 저장하지 않는다", () => {
  const { context: c, writes } = setup();
  c.transactions = [transaction("matched")];
  assert.equal(c.addRule("식비", "카페/음료", "카페").added, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].keywords[0], "카페");
  assert.equal(c.classified[0].subcategory, "카페/음료");
  assert.equal(c.addRule("식비", "카페/음료", "카페").added, false);
  assert.equal(writes.length, 1);
});

test("규칙 삭제는 변경된 규칙을 저장한 뒤 거래를 최신 기준으로 분류한다", async () => {
  const { context: c, writes } = setup();
  c.rules = [{ sector: "식비", subcategory: "카페/음료", keywords: ["카페"], priority: 1, origin: "user" }];
  c.transactions = [transaction("matched")];
  let deleteHandler;
  const button = { dataset: { deleteRule: "0" }, addEventListener: (event, handler) => { deleteHandler = handler; } };
  c.els = {
    rulesTable: { querySelectorAll: (selector) => selector === "[data-delete-rule]" ? [button] : [] },
    ruleFeedback: { querySelectorAll: () => [] }
  };
  c.attachRuleHandlers();
  await deleteHandler();
  assert.deepEqual(writes, [[]]);
  assert.equal(c.classified[0].status, "미분류");
});


test("규칙 검색은 원문 가맹점별 한 번이며 규칙 변경 후 다시 계산한다", () => {
  const { context: c } = setup();
  c.rules = [{ sector: "식비", subcategory: "카페/음료", keywords: ["매장  A"], priority: 1, origin: "user" }];
  c.transactions = Array.from({ length: 1000 }, (_, index) => transaction(String(index), {
    merchant: index % 2 ? "매장 A" : "매장  A"
  }));
  const findRule = c.findRule;
  let lookups = 0;
  c.findRule = (...args) => { lookups += 1; return findRule(...args); };
  c.reclassify();
  assert.equal(lookups, 2);
  assert.equal(c.classified.filter((item) => item.status === "분류완료").length, 500);
  assert.equal(c.classified[0].subcategory, "카페/음료");
  assert.equal(c.classified[1].status, "미분류");
  c.rules[0].keywords = ["매장 A"];
  c.rules[0].subcategory = "외식-혼자";
  c.reclassify();
  assert.equal(lookups, 4);
  assert.equal(c.classified[0].status, "미분류");
  assert.equal(c.classified[1].subcategory, "외식-혼자");
});
