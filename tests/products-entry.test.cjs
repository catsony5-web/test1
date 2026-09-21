const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const copy = (value) => JSON.parse(JSON.stringify(value));
const fieldNames = [
  "productName", "productBrand", "productCategory", "productPurchaseDate", "productExpiryDate",
  "productStartDate", "productEndDate", "productPrice", "productVolume", "productUnit",
  "productQuantity", "productStore", "productExpectedDays", "productLink", "productImage", "productMemo"
];

function setup() {
  const groups = [{ open: false }, { open: false }, { open: false }];
  const saves = [], snapshots = [], refreshes = [], errors = [];
  let resets = 0, renders = 0;
  const nodes = {};
  function node(id, tagName = "INPUT", defaultValue = "") {
    let value = defaultValue;
    const classes = new Set();
    return {
      id, tagName, defaultValue, disabled: false, hidden: false, textContent: "", files: [],
      get value() { return value; },
      set value(next) { value = String(next); },
      options: [],
      add(option) { this.options.push(option); },
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      focus() { this.focused = true; },
      closest(selector) {
        assert.equal(selector, "details");
        return id === "productImage" ? groups[2] : groups[1];
      }
    };
  }
  for (const id of fieldNames) nodes[id] = node(id, ["productCategory", "productUnit"].includes(id) ? "SELECT" : "INPUT", id === "productUnit" ? "ml" : "");
  nodes.productCategory.options = ["", "스킨케어", "기타"].map((value) => ({ value }));
  nodes.productUnit.options = ["ml", "g", "개"].map((value) => ({ value }));
  for (const id of ["productFormTitle", "productSaveButton", "productCancelEdit", "productImageHelp", "productFormFeedback"]) {
    nodes[id] = node(id, id.endsWith("Button") || id === "productCancelEdit" ? "BUTTON" : "P");
  }
  const attributes = new Map();
  const form = {
    reset() {
      resets++;
      for (const id of fieldNames) {
        nodes[id].value = nodes[id].defaultValue;
        nodes[id].files = [];
      }
    },
    querySelectorAll(selector) { assert.equal(selector, "details"); return groups; },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; }
  };
  const cardButtons = [node("edit-card", "BUTTON"), node("delete-card", "BUTTON")];
  const controls = [...fieldNames.map((id) => nodes[id]), nodes.productSaveButton, nodes.productCancelEdit, ...cardButtons];
  const c = vm.createContext({
    console: { error(...args) { errors.push(args); } },
    Option: function Option(text, value) { this.text = text; this.value = value; },
    document: { getElementById: (id) => nodes[id], querySelectorAll: () => controls },
    NumericInput: {
      validate: () => true,
      refresh(target, options) { assert.equal(target, form); refreshes.push(options); }
    },
    els: { ...nodes, productForm: form },
    products: [],
    productFilters: { category: "all", name: "all", store: "", status: "all", search: "", sort: "recent", trendName: "" },
    createAutoSnapshot: async (reason) => { snapshots.push(reason); return {}; },
    safeSave: async (key, rows) => { saves.push({ key, rows: copy(rows) }); return true; }
  });
  for (const file of ["src/data/constants.js", "src/utils/date.js", "src/utils/normalize.js", "src/features/products/products-view.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), c, { filename: file });
  }
  // Rendering is a separate boundary; the actual submit, edit, reset and save handlers run unchanged.
  c.renderProducts = () => { renders++; };
  const submit = () => {
    let prevented = false;
    const pending = c.handleProductSubmit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    return pending;
  };
  return { c, nodes, form, groups, controls, cardButtons, saves, snapshots, refreshes, errors, submit,
    get resets() { return resets; }, get renders() { return renders; } };
}

function savedProduct(c, overrides = {}) {
  return c.normalizeProduct({
    id: "existing-product", name: "토너", brand: "기존 브랜드", category: "사용자 카테고리",
    purchaseDate: "2026-08-01", expiryDate: "2027-08-01", startDate: "2026-08-03", endDate: "",
    price: 12000, volume: 150, unit: "사용자 단위", quantity: 2, store: "기존 구매처",
    expectedDays: 90, link: "https://example.test/product", imageDataUrl: "data:image/png;base64,saved",
    memo: "기존 메모", createdAt: "2026-08-01T01:02:03Z", ...overrides
  });
}

test("name-only submission creates one partial record and resets the form after a successful save", async () => {
  const h = setup();
  h.nodes.productName.value = "  선크림  ";
  await h.submit();
  assert.equal(h.c.products.length, 1);
  const item = h.c.products[0];
  assert.equal(item.name, "선크림");
  assert.equal(item.category, "스킨케어");
  assert.equal(item.priceKnown, false);
  assert.equal(item.price, 0);
  assert.equal(item.quantity, 1);
  assert.equal(item.unit, "ml");
  for (const key of ["purchaseDate", "startDate", "endDate", "expiryDate", "store", "link", "memo", "imageDataUrl"]) assert.equal(item[key], "");
  assert.equal(h.saves.length, 1);
  assert.deepEqual(h.saves[0].rows, copy(h.c.products));
  assert.equal(h.snapshots.length, 1);
  assert.equal(h.resets, 1);
  assert.equal(h.renders, 1);
  assert.equal(h.nodes.productName.value, "");
  assert.match(h.nodes.productFormFeedback.textContent, /선크림 기록을 저장했습니다/);
  assert.equal(h.form.getAttribute("aria-busy"), null);
  assert.ok(h.controls.every((control) => !control.disabled));
});

test("editing changes only entered fields while retaining identity, image and collapsed optional data", async () => {
  const h = setup();
  const original = savedProduct(h.c);
  const other = savedProduct(h.c, { id: "other", name: "휴지" });
  h.c.products = [original, other];
  h.c.editProduct(original.id);
  assert.equal(h.nodes.productName.value, original.name);
  assert.equal(h.nodes.productCategory.value, original.category);
  assert.ok(h.nodes.productCategory.options.some((option) => option.value === original.category));
  assert.ok(h.nodes.productUnit.options.some((option) => option.value === original.unit));
  assert.equal(h.nodes.productCancelEdit.hidden, false);
  assert.ok(h.groups.every((group) => !group.open));
  assert.match(h.nodes.productImageHelp.textContent, /새 사진을 선택하지 않으면 유지/);
  h.nodes.productName.value = "수정한 토너";
  await h.submit();
  assert.equal(h.c.products.length, 2);
  assert.deepEqual(copy(h.c.products[0]), { ...copy(original), name: "수정한 토너" });
  assert.equal(h.c.products[1], other);
  assert.equal(h.nodes.productCancelEdit.hidden, true);
  assert.match(h.nodes.productFormFeedback.textContent, /수정을 저장했습니다/);
});

test("blank prices remain unknown while explicit zero is saved and edited as a known price", async () => {
  for (const value of ["", "0"]) {
    const h = setup();
    h.nodes.productName.value = "가격 테스트";
    h.nodes.productPrice.value = value;
    await h.submit();
    const item = h.c.products[0];
    assert.equal(item.price, 0);
    assert.equal(item.priceKnown, value === "0");
    h.c.editProduct(item.id);
    assert.equal(h.nodes.productPrice.value, value);
    await h.submit();
    assert.equal(h.c.products[0].priceKnown, value === "0");
  }
});

test("failed or throwing saves retain the original array, edited form values and retryable edit identity", async () => {
  for (const failure of ["false", "throw"]) {
    const h = setup();
    const original = [savedProduct(h.c)];
    h.c.products = original;
    h.c.editProduct(original[0].id);
    h.nodes.productName.value = "저장 전 수정본";
    h.nodes.productMemo.value = "아직 저장되지 않은 메모";
    h.groups[2].open = true;
    const resetsBefore = h.resets;
    h.c.safeSave = async () => { if (failure === "throw") throw new Error("storage unavailable"); return false; };
    await h.submit();
    assert.equal(h.c.products, original);
    assert.equal(original[0].name, "토너");
    assert.equal(original[0].memo, "기존 메모");
    assert.equal(h.nodes.productName.value, "저장 전 수정본");
    assert.equal(h.nodes.productMemo.value, "아직 저장되지 않은 메모");
    assert.equal(h.groups[2].open, true);
    assert.equal(h.resets, resetsBefore);
    assert.equal(h.renders, 0);
    assert.equal(h.nodes.productCancelEdit.hidden, false);
    assert.equal(h.nodes.productFormFeedback.classList.contains("is-error"), true);
    assert.equal(h.form.getAttribute("aria-busy"), null);
    assert.ok(h.controls.every((control) => !control.disabled));
    h.c.safeSave = async () => true;
    await h.submit();
    assert.equal(h.c.products.length, 1);
    assert.equal(h.c.products[0].id, original[0].id);
    assert.equal(h.c.products[0].name, "저장 전 수정본");
    assert.equal(h.c.products[0].memo, "아직 저장되지 않은 메모");
  }
});

test("post-save render or reset errors report the completed save and retry without duplicating the record", async () => {
  for (const failure of ["render", "reset"]) {
    const h = setup();
    h.nodes.productName.value = "이미 저장된 기록";
    h.nodes.productPrice.value = "15000";
    const originalRender = h.c.renderProducts;
    const originalReset = h.form.reset;
    if (failure === "render") h.c.renderProducts = () => { throw new Error("render unavailable"); };
    else h.form.reset = () => { throw new Error("reset unavailable"); };
    await h.submit();
    assert.equal(h.saves.length, 1);
    assert.equal(h.c.products.length, 1);
    const saved = copy(h.c.products[0]);
    assert.deepEqual(h.saves[0].rows, [saved]);
    assert.match(h.nodes.productFormFeedback.textContent, /저장/);
    assert.match(h.nodes.productFormFeedback.textContent, /새로고침/);
    assert.doesNotMatch(h.nodes.productFormFeedback.textContent, /저장하지 못|입력 내용은 그대로/);
    assert.equal(h.form.getAttribute("aria-busy"), null);
    assert.ok(h.controls.every((control) => !control.disabled));
    if (failure === "reset") {
      assert.equal(h.nodes.productName.value, "이미 저장된 기록");
      assert.equal(h.nodes.productPrice.value, "15000");
    }
    h.c.renderProducts = originalRender;
    h.form.reset = originalReset;
    h.nodes.productName.value = "재시도한 기록";
    h.nodes.productPrice.value = "15000";
    await h.submit();
    assert.equal(h.saves.length, 2);
    assert.equal(h.c.products.length, 1);
    assert.equal(h.c.products[0].id, saved.id);
    assert.equal(h.c.products[0].createdAt, saved.createdAt);
    assert.equal(h.c.products[0].name, "재시도한 기록");
  }
});

test("the pending guard prevents duplicate writes and restores each control's prior disabled state", async () => {
  const h = setup();
  h.nodes.productName.value = "한 번만 저장";
  h.cardButtons[1].disabled = true;
  let releaseSnapshot;
  h.c.createAutoSnapshot = () => { h.snapshots.push("pending"); return new Promise((resolve) => { releaseSnapshot = resolve; }); };
  const first = h.submit();
  assert.equal(h.form.getAttribute("aria-busy"), "true");
  assert.ok(h.controls.every((control) => control.disabled));
  await h.submit();
  assert.equal(h.snapshots.length, 1);
  assert.equal(h.saves.length, 0);
  assert.equal(h.c.products.length, 0);
  releaseSnapshot({});
  await first;
  assert.equal(h.saves.length, 1);
  assert.equal(h.c.products.length, 1);
  assert.equal(h.cardButtons[1].disabled, true);
  assert.ok(h.controls.filter((control) => control !== h.cardButtons[1]).every((control) => !control.disabled));
  assert.equal(h.form.getAttribute("aria-busy"), null);
});

test("cancel resets edit state without writing and a later submit creates a separate record", async () => {
  const h = setup();
  const original = [savedProduct(h.c)];
  h.c.products = original;
  h.c.editProduct(original[0].id);
  h.nodes.productName.value = "취소할 수정";
  h.groups.forEach((group) => { group.open = true; });
  h.c.resetProductForm();
  assert.equal(h.c.products, original);
  assert.equal(original[0].name, "토너");
  assert.equal(h.saves.length, 0);
  assert.equal(h.snapshots.length, 0);
  assert.equal(h.nodes.productName.value, "");
  assert.equal(h.nodes.productFormTitle.textContent, "간단히 기록하기");
  assert.equal(h.nodes.productCancelEdit.hidden, true);
  assert.equal(h.nodes.productFormFeedback.hidden, true);
  assert.ok(h.groups.every((group) => !group.open));
  h.nodes.productName.value = "새 기록";
  await h.submit();
  assert.equal(h.c.products.length, 2);
  assert.notEqual(h.c.products[0].id, original[0].id);
  assert.equal(h.c.products[1], original[0]);
  assert.match(fs.readFileSync(path.join(root, "src/features/app/init.js"), "utf8"), /getElementById\("productCancelEdit"\)\.addEventListener\("click", resetProductForm\)/);
});

test("an end date before the start date blocks saving and exposes the invalid field", async () => {
  const h = setup();
  const original = [savedProduct(h.c)];
  h.c.products = original;
  h.nodes.productName.value = "날짜 검사";
  h.nodes.productStartDate.value = "2026-09-10";
  h.nodes.productEndDate.value = "2026-09-01";
  await h.submit();
  assert.equal(h.c.products, original);
  assert.equal(h.saves.length, 0);
  assert.equal(h.snapshots.length, 0);
  assert.equal(h.groups[1].open, true);
  assert.equal(h.nodes.productEndDate.focused, true);
  assert.match(h.nodes.productFormFeedback.textContent, /종료일은 시작일과 같거나 이후/);
  assert.equal(h.nodes.productName.value, "날짜 검사");
});

test("blank names and rejected numeric validation do not mutate or save records", async () => {
  const h = setup();
  const original = h.c.products;
  h.nodes.productName.value = "   ";
  await h.submit();
  assert.equal(h.nodes.productName.focused, true);
  assert.match(h.nodes.productFormFeedback.textContent, /제품명을 입력/);
  h.nodes.productName.value = "수량 오류";
  h.c.NumericInput.validate = () => false;
  await h.submit();
  assert.equal(h.c.products, original);
  assert.equal(h.saves.length, 0);
  assert.equal(h.snapshots.length, 0);
});
