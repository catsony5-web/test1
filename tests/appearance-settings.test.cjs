const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const activeThemes = [
  "mineral-blue", "graphite-studio", "offwhite-olive", "minimal",
  "lilac-aqua", "rosso-ink", "corsa-technical", "corsa-editorial"
];
const aliases = {
  "garden-ink": "mineral-blue", "clear-aqua": "mineral-blue",
  dark: "graphite-studio", "warm-earth": "offwhite-olive"
};
const browserColors = {
  "mineral-blue": "#426b98", "graphite-studio": "#171b21", "offwhite-olive": "#717b49",
  minimal: "#1e5748", "lilac-aqua": "#706eae", "rosso-ink": "#181818",
  "corsa-technical": "#181818", "corsa-editorial": "#181818"
};
const copy = (value) => JSON.parse(JSON.stringify(value));

function setup() {
  const local = new Map();
  const styles = new Map();
  const meta = { setAttribute(name, value) { this[name] = value; } };
  const buttons = activeThemes.map((theme) => ({
    dataset: { themeChoice: theme },
    attributes: {},
    classList: { toggle(name, value) { this[name] = value; } },
    setAttribute(name, value) { this.attributes[name] = value; }
  }));
  const choiceGroup = {
    querySelectorAll: () => buttons,
    addEventListener(name, handler) { this[name] = handler; }
  };
  const document = {
    documentElement: { dataset: {}, style: { setProperty: (name, value) => styles.set(name, value) } },
    body: { dataset: {} },
    querySelector(selector) {
      if (selector === 'meta[name="theme-color"]') return meta;
      if (selector === "#themeChoiceGroup") return choiceGroup;
      return null;
    },
    querySelectorAll: () => []
  };
  const context = vm.createContext({
    console, document, structuredClone, defaultRules: [], window: {},
    GoalPlannerCore: { defaultPlan: () => ({}) },
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, value),
      removeItem: (key) => local.delete(key)
    }
  });
  for (const file of [
    "src/data/constants.js", "src/data/categories.js", "src/features/app/state.js",
    "src/features/budget/spending-budget-core.js", "src/utils/storage.js", "src/features/app/appearance.js", "src/utils/backup.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  const keys = copy(vm.runInContext("STORAGE_KEYS", context));
  return { context, local, keys, document, meta, buttons, choiceGroup, styles };
}

test("신규 설정과 잘못된 테마는 Mineral Blue를 사용하고 설정 리비전은 유지한다", () => {
  const { context: c } = setup();
  assert.equal(c.defaultAppSettings().theme, "mineral-blue");
  assert.equal(c.defaultAppSettings().themeRevision, 1);
  for (const value of [undefined, null, "", "missing", "__proto__", "constructor", "toString", 1, {}, ["minimal"]]) {
    assert.equal(c.normalizeTheme(value), "mineral-blue");
  }
  for (const value of [undefined, null, {}]) {
    const settings = c.normalizeAppSettings(value);
    assert.equal(settings.theme, "mineral-blue");
    assert.equal(settings.themeRevision, 1);
  }
});

test("승인된 8개 테마는 정규화 후에도 선택값을 유지한다", () => {
  const { context: c } = setup();
  assert.deepEqual(copy(vm.runInContext("Object.keys(THEME_BROWSER_COLORS).sort()", c)), activeThemes.toSorted());
  for (const theme of activeThemes) {
    assert.equal(c.normalizeTheme(theme), theme);
    const settings = c.normalizeAppSettings({ theme, themeRevision: 1 });
    assert.equal(settings.theme, theme);
    assert.equal(settings.themeRevision, 1);
  }
});

test("교체된 4개 테마만 지정된 새 테마로 이전하고 다른 설정과 원본은 보존한다", () => {
  const { context: c } = setup();
  for (const [previous, replacement] of Object.entries(aliases)) {
    const source = {
      ...copy(c.defaultAppSettings()), theme: previous,
      backgroundImage: "data:image/png;base64,synthetic", backgroundOpacity: 0.22,
      backgroundBlur: 4, backgroundOverlay: 0.4,
      cardBilling: { startDay: 2, endDay: 20, paymentDay: 26, weekendRule: "none" },
      analysis: { targetRatios: { "식비": 20 }, consumptionTypes: { "식비::장보기/마트": "essential" } },
      foodBudget: { monthlyTarget: 180000, diningCost: 15000 },
      ipoPerformance: { filter: "custom", startMonth: "2026-01", endMonth: "2026-09" },
      lastSavedAt: "2026-09-14T01:00:00Z"
    };
    const before = copy(source);
    assert.deepEqual(copy(c.normalizeAppSettings(source)), { ...before, theme: replacement });
    assert.deepEqual(source, before);
    assert.equal(c.normalizeTheme(c.normalizeTheme(previous)), replacement);
  }
});

test("설정 읽기·저장·다시 읽기는 새 테마를 유지하고 거래 저장소를 변경하지 않는다", async () => {
  for (const [previous, replacement] of Object.entries(aliases)) {
    const { context: c, local, keys } = setup();
    local.set(keys.settings, JSON.stringify({ theme: previous, themeRevision: 1 }));
    local.set(keys.records, JSON.stringify([{ recordKey: "synthetic", amount: 17000 }]));
    local.set(keys.monthlyIncome, JSON.stringify({ "2026-09": 2500000 }));
    const records = local.get(keys.records);
    const income = local.get(keys.monthlyIncome);
    const settings = await c.loadSettings();
    assert.equal(settings.theme, replacement);
    assert.equal(JSON.parse(local.get(keys.settings)).theme, previous, "reading settings must not write storage");
    c.loadedSettings = settings;
    vm.runInContext("appSettings = loadedSettings", c);
    await c.saveSettings();
    assert.equal(JSON.parse(local.get(keys.settings)).theme, replacement);
    assert.equal((await c.loadSettings()).theme, replacement);
    assert.equal(local.get(keys.records), records);
    assert.equal(local.get(keys.monthlyIncome), income);
  }
});

test("테마 적용은 루트·본문·브라우저 색상과 선택 버튼을 함께 갱신한다", () => {
  const { context: c, document, meta, buttons } = setup();
  for (const [input, expected] of [...activeThemes.map((theme) => [theme, theme]), ...Object.entries(aliases)]) {
    c.selectedTheme = input;
    vm.runInContext("appSettings.theme = selectedTheme; applyAppSettings()", c);
    assert.equal(document.documentElement.dataset.theme, expected);
    assert.equal(document.body.dataset.theme, expected);
    assert.equal(meta.content, browserColors[expected]);
    assert.deepEqual(buttons.filter((button) => button.attributes["aria-pressed"] === "true").map((button) => button.dataset.themeChoice), [expected]);
  }
});

test("테마 선택 클릭은 8개 테마를 모두 저장하고 다시 읽어도 유지한다", async () => {
  const { context: c, buttons, choiceGroup } = setup();
  c.setupAppearanceControls();
  for (const button of buttons) {
    await choiceGroup.click({ target: { closest: () => button } });
    assert.equal((await c.loadSettings()).theme, button.dataset.themeChoice);
  }
});

test("기존 설정 백업 복원은 같은 별칭 이전을 적용하고 금융 데이터는 보존한다", () => {
  const { context: c, document } = setup();
  vm.runInContext('transactions = [{ recordKey: "synthetic", amount: 17000 }]; monthlyIncome = { "2026-09": 2500000 }', c);
  const financialBefore = vm.runInContext("JSON.stringify({ transactions, monthlyIncome })", c);
  for (const [previous, replacement] of [...Object.entries(aliases), ...activeThemes.map((theme) => [theme, theme])]) {
    c.applyRestorePayload({ sections: { settings: { settings: { theme: previous, themeRevision: 1 } } } }, ["settings"]);
    assert.equal(vm.runInContext("appSettings.theme", c), replacement);
    assert.equal(vm.runInContext("appSettings.themeRevision", c), 1);
    assert.equal(document.documentElement.dataset.theme, replacement);
    assert.equal(vm.runInContext("JSON.stringify({ transactions, monthlyIncome })", c), financialBefore);
  }
});
