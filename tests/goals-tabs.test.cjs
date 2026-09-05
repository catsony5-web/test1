const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../src/features/goals/goals-core.js");
const source = fs.readFileSync(path.join(__dirname, "../src/features/goals/goals-view.js"), "utf8");
const ids = ["input", "route", "events", "support", "side"];

function fixture() {
  const tabs = ids.map((id) => ({
    dataset: { goalTab: id }, attributes: {}, tabIndex: -1, focused: false,
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() { this.focused = true; },
    closest(selector) { return selector === "[data-goal-tab]" ? this : null; }
  }));
  const panels = ids.map((id) => ({ id: `goal-panel-${id}`, hidden: id !== "input" }));
  const summary = { innerHTML: "" };
  const content = { innerHTML: "" };
  const listeners = [];
  const root = {
    shellWrites: 0,
    set innerHTML(value) { this.shellWrites++; this.shell = value; },
    querySelector(selector) {
      if (selector === ".goal-planner") return this.shellWrites ? this : null;
      if (selector === ".goal-shared-summary") return summary;
      if (selector === ".goal-panels") return content;
      return null;
    },
    querySelectorAll(selector) { return selector === "[data-goal-tab]" ? tabs : panels; },
    addEventListener(name, handler) { listeners.push({ name, handler }); },
    contains() { return false; }
  };
  let saves = 0;
  const context = vm.createContext({
    GoalPlannerCore: core, els: { goalPlannerRoot: root }, goalPlan: core.defaultPlan(),
    document: { activeElement: null }, setTimeout: () => {}, structuredClone,
    saveGoalPlan: () => { saves++; }
  });
  vm.runInContext(source, context);
  context.goalCompletedFlowBaseline = () => ({ monthlyContribution: 1500000 });
  context.goalCalculationPlan = (plan, baseline) => ({ ...plan, ...baseline });
  context.renderGoalHero = (plan) => `target:${plan.targetAmount}`;
  for (const name of ["renderGoalInputs", "renderGoalScenarios", "renderGoalEvents", "renderGoalPolicies", "renderGoalSideHustle"]) {
    context[name] = (plan) => `${name}:${plan.targetAmount}`;
  }
  return { context, tabs, panels, root, content, summary, listeners, saves: () => saves };
}

test("five tabs have stable panel associations and one initial selected tab", () => {
  const { context } = fixture();
  const html = context.renderGoalTabs();
  assert.equal((html.match(/role="tab"/g) || []).length, 5);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 1);
  for (const id of ids) {
    assert.ok(html.includes(`aria-controls="goal-panel-${id}"`));
    const panel = context.renderGoalPanel(id, "content");
    assert.ok(panel.includes(`aria-labelledby="goal-tab-${id}"`));
    assert.equal(panel.includes(" hidden"), id !== "input");
  }
});

test("switching all tabs changes visibility only, preserving plan and DOM nodes", () => {
  const { context, tabs, panels, saves } = fixture();
  const plan = context.goalPlan;
  const before = JSON.stringify(plan);
  for (const id of ids) {
    context.selectGoalTab(id);
    assert.deepEqual(panels.filter((p) => !p.hidden).map((p) => p.id), [`goal-panel-${id}`]);
    assert.equal(tabs.filter((t) => t.tabIndex === 0).length, 1);
    assert.equal(tabs.find((t) => t.dataset.goalTab === id).attributes["aria-selected"], "true");
  }
  assert.equal(context.goalPlan, plan);
  assert.equal(JSON.stringify(plan), before);
  assert.equal(saves(), 0);
});

test("delegated clicks select tabs without triggering plan actions", () => {
  const { context, tabs, panels, saves } = fixture();
  context.handleGoalActionClick({ target: tabs[3] });
  assert.equal(panels[3].hidden, false);
  assert.equal(saves(), 0);
});

test("arrow keys wrap, Home and End move focus, unrelated keys are ignored", () => {
  const { context, tabs, panels } = fixture();
  let prevented = 0;
  const press = (index, key) => context.handleGoalTabKeydown({ target: tabs[index], key, preventDefault() { prevented++; } });
  press(0, "ArrowLeft");
  assert.equal(panels[4].hidden, false);
  assert.equal(tabs[4].focused, true);
  press(4, "ArrowRight");
  assert.equal(panels[0].hidden, false);
  press(0, "End");
  assert.equal(panels[4].hidden, false);
  press(4, "Home");
  assert.equal(panels[0].hidden, false);
  press(0, "Tab");
  assert.equal(prevented, 4);
});

test("recalculating preserves active tab and mounted navigation while updating summary", () => {
  const { context, root, content, summary, saves } = fixture();
  context.renderGoals();
  context.selectGoalTab("events");
  context.updateGoalPlan((plan) => { plan.targetAmount = 120000000; });
  assert.equal(root.shellWrites, 1);
  assert.equal(summary.innerHTML, "target:120000000");
  assert.match(content.innerHTML, /id="goal-panel-events"[^>]*(?<! hidden)>/);
  assert.match(content.innerHTML, /id="goal-panel-input"[^>]* hidden>/);
  assert.ok(content.innerHTML.includes("renderGoalEvents:120000000"));
  assert.equal(saves(), 1);
});

test("goal controls install their delegated listeners once", () => {
  const { context, listeners } = fixture();
  context.setupGoalControls();
  context.setupGoalControls();
  assert.deepEqual(listeners.map((item) => item.name), ["change", "click", "keydown", "focusin"]);
});

test("tabs activate on focus even when recalculation moves the button before mouseup", () => {
  const { context, tabs, panels, saves } = fixture();
  context.handleGoalTabFocus({ target: tabs[1] });
  assert.equal(panels[1].hidden, false);
  assert.equal(tabs[1].attributes["aria-selected"], "true");
  assert.equal(saves(), 0);
});

test("unknown tab ids leave the current selection unchanged", () => {
  const { context, panels } = fixture();
  context.selectGoalTab("missing");
  assert.deepEqual(panels.filter((p) => !p.hidden).map((p) => p.id), ["goal-panel-input"]);
});

test("goal typography has no fixed text size below 13px and hidden panels stay hidden", () => {
  const css = fs.readFileSync(path.join(__dirname, "../src/styles/13-goals.css"), "utf8");
  const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.length > 40);
  assert.ok(sizes.every((size) => size >= 13));
  assert.match(css, /\.goal-tab-panel\[hidden\]\s*\{\s*display: none;/);
  assert.ok(!css.includes(".goal-jump-nav"));
});
