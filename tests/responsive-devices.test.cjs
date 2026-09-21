const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const css = read("src/styles/20-responsive-devices.css").replace(/\/\*[\s\S]*?\*\//g, "");
const navigation = read("src/features/app/navigation.js");
const productionCss = read("src/styles/09-production-ui.css");

// These are source contracts, not a CSS engine or a substitute for device QA.
// Count braces so a media query assertion cannot accidentally read the next query.
function block(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing CSS block: ${marker}`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1, `Missing opening brace: ${marker}`);
  let depth = 1;
  for (let index = open + 1; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) return source.slice(open + 1, index);
  }
  assert.fail(`Unclosed CSS block: ${marker}`);
}

test("device stylesheet loads once and after all feature styles", () => {
  const links = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]
    .map((match) => match[1]);
  const deviceLinks = links.filter((href) => href.split("?")[0] === "src/styles/20-responsive-devices.css");
  assert.equal(deviceLinks.length, 1);
  assert.equal(links.at(-1), deviceLinks[0]);
  assert.match(deviceLinks[0], /\?v=.+/);
});

test("viewport exposes safe areas without disabling user zoom", () => {
  const tag = html.match(/<meta\b[^>]*name="viewport"[^>]*>/)?.[0];
  assert.ok(tag, "The viewport meta tag is required");
  const content = tag.match(/content="([^"]+)"/)?.[1];
  assert.match(content, /(?:^|,)\s*width=device-width(?:,|$)/);
  assert.match(content, /(?:^|,)\s*initial-scale=1(?:,|$)/);
  assert.match(content, /(?:^|,)\s*viewport-fit=cover(?:,|$)/);
  assert.doesNotMatch(content, /user-scalable|maximum-scale|minimum-scale/i);
  assert.match(block(css, "body"), /min-height:\s*100dvh/);
  assert.match(block(css, "body"), /padding-left:\s*env\(safe-area-inset-left\)/);
  assert.match(block(css, "body"), /padding-right:\s*env\(safe-area-inset-right\)/);
});

test("CSS mobile navigation remains aligned with the JavaScript desktop boundary", () => {
  const desktopBoundary = Number(navigation.match(/const desktopViewport = window\.matchMedia\("\(min-width:\s*(\d+)px\)"\)/)?.[1]);
  assert.equal(desktopBoundary, 768);
  const query = `@media (max-width: ${desktopBoundary - 1}px)`;
  const mobile = block(css, query);
  const existingMobile = productionCss.split(query).slice(1)
    .map((tail) => block(query + tail, query)).join("\n");
  assert.match(block(existingMobile, ".mobile-bottom-nav"), /display:\s*grid/);
  assert.match(block(existingMobile, ".app-shell > .sidebar-nav"), /display:\s*none\s*!important/);
  assert.match(block(mobile, ".mobile-bottom-nav"), /safe-area-inset-left/);
  assert.match(block(mobile, ".mobile-more-sheet"), /100dvh\s*-\s*88px/);
  assert.doesNotMatch(block(css, "@media (max-width: 1023px)"), /\.mobile-bottom-nav|\.sidebar-nav/);
});

test("wide IPO dates and summary data scroll inside their own panels", () => {
  const ipo = block(css, "@media (max-width: 1100px)");
  assert.match(block(ipo, ".ipo-calendar-body"), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(block(ipo, ".ipo-calendar-detail"), /position:\s*static/);
  assert.match(block(ipo, ".ipo-calendar-grid {"), /overflow-x:\s*auto/);
  assert.match(ipo, /min-width:\s*700px/);
  assert.match(ipo, /\[data-density="full"\][^{]*\{[^}]*min-width:\s*840px/);
  const summary = block(css, "@media (max-width: 1023px)");
  const localScroll = block(summary, "#summaryView .summary-priority-chart,");
  assert.match(localScroll, /overflow-x:\s*auto/);
  assert.match(localScroll, /overscroll-behavior-inline:\s*contain/);
  assert.match(summary, /#summaryView \.summary-flow-table/);
  assert.match(summary, /#summaryView \.pattern-heatmap-grid/);
  assert.doesNotMatch(block(css, "body"), /overflow(?:-x)?:\s*(?:hidden|clip)/);
});

test("mid-width summary and budget layouts stack before the phone navigation breakpoint", () => {
  const middle = block(css, "@media (max-width: 1023px)");
  assert.match(block(middle, "#summaryView .summary-pattern-top-grid,"), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(block(middle, ".budget-equation {"), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(block(middle, ".budget-equation > span"), /display:\s*none/);
});

test("phone entry controls have a readable font and touch height", () => {
  const mobile = block(css, "@media (max-width: 767px)");
  const inputRule = mobile.match(/([^{}]+)\{([^{}]*font-size:\s*16px[^{}]*)\}/);
  assert.ok(inputRule, "Mobile text controls need a shared 16px rule");
  assert.match(inputRule[1], /input/);
  assert.match(inputRule[1], /select/);
  assert.match(inputRule[1], /textarea/);
  assert.match(inputRule[1], /#summaryView/);
  assert.match(inputRule[1], /#adminMenu/);
  for (const type of ["checkbox", "radio", "file", "range", "hidden"]) {
    assert.match(inputRule[1], new RegExp(`:not\\([^)]*\\[type="${type}"\\]`), `${type} inputs must keep their utility/control sizing`);
  }
  assert.match(inputRule[2], /min-height:\s*44px/);
  assert.match(inputRule[2], /scroll-margin-block:\s*80px/);
  // A rendered-style check is still required: earlier ID selectors can win.
  assert.doesNotMatch(inputRule[1], /^\s*(?:input|select|textarea)\s*(?:,|$)/);
});

test("narrow food entry and summary ranking retain readable separate rows", () => {
  const narrow = block(css, "@media (max-width: 430px)");
  assert.match(block(narrow, "#summaryView .summary-food-budget-form"), /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(block(narrow, "#summaryView .summary-ranking-row {"), /grid-template-columns:\s*22px minmax\(0,\s*1fr\) 16px/);
  assert.match(block(narrow, "#summaryView .summary-ranking-row > strong"), /grid-area:\s*2\s*\/\s*2/);
  assert.match(block(narrow, "#summaryView .summary-ranking-delta"), /grid-area:\s*3\s*\/\s*2/);
  assert.doesNotMatch(block(narrow, "#summaryView .summary-ranking-row > strong"), /display:\s*none|visibility:\s*hidden/);
  const compact = block(css, "@media (max-width: 540px)");
  assert.match(block(compact, "#summaryView .summary-food-budget-form > button"), /grid-column:\s*1\s*\/\s*-1/);
  assert.match(block(compact, ".budget-recommendation dl > div"), /flex-direction:\s*column/);
});

test("short-height dialog bounds use the visible viewport", () => {
  assert.match(block(css, ".loan-payment-dialog"), /max-height:\s*calc\(100dvh\s*-\s*28px\)/);
  assert.match(block(css, ".loan-payment-dialog"), /overflow-y:\s*auto/);
  const short = block(css, "@media (max-height: 500px)");
  assert.match(block(short, ".topbar.compact-topbar"), /position:\s*static/);
  assert.match(block(short, ".analysis-target-dialog,"), /max-height:\s*calc\(100dvh\s*-\s*16px\)/);
  assert.match(short, /\.analysis-target-dialog form/);
});
