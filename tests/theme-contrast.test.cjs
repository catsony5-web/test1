const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tokenCss = fs.readFileSync(path.join(root, "src/styles/00-tokens.css"), "utf8");
const calendarCss = fs.readFileSync(path.join(root, "src/styles/09-production-ui.css"), "utf8");
const summaryCss = fs.readFileSync(path.join(root, "src/styles/11-summary-insights.css"), "utf8").replace(/\r\n/g, "\n");
const themes = ["mineral-blue", "offwhite-olive", "graphite-studio"];
const sectors = ["fixed", "food", "household", "shopping", "personal", "selfdev", "gift", "transport", "saving", "income", "etc", "unknown"];

function declarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(body, `Missing CSS rule: ${selector}`);
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

function mix(first, second, proportion) {
  return first.map((channel, index) => channel * proportion + second[index] * (1 - proportion));
}

// Resolve only the color forms used by these tokens; fail rather than silently skip a new form.
function color(value, tokens) {
  const variable = value.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
  if (variable) {
    const resolved = tokens[variable[1]] || variable[2];
    assert.ok(resolved, `Missing token: ${variable[1]}`);
    return color(resolved, tokens);
  }
  if (/^#[\da-f]{6}$/i.test(value)) {
    return value.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16));
  }
  const rgba = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba) return rgba.slice(1).map(Number);
  const blend = value.match(/^color-mix\(in srgb,\s*(var\(--[\w-]+\)|#[\da-f]{6})\s+([\d.]+)%,\s*(var\(--[\w-]+\)|#[\da-f]{6})\)$/i);
  if (blend) return mix(color(blend[1], tokens), color(blend[3], tokens), Number(blend[2]) / 100);
  assert.fail(`Unsupported color: ${value}`);
}

function luminance(channels) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground, background) {
  const opaqueForeground = foreground.length === 4
    ? mix(foreground.slice(0, 3), background, foreground[3])
    : foreground;
  const first = luminance(opaqueForeground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function readable(tokens, foreground, background, label) {
  const ratio = contrast(color(foreground, tokens), color(background, tokens));
  assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1 is below 4.5:1`);
}

const baseTokens = declarations(tokenCss, ":root");
const calendarTokens = declarations(calendarCss, "#calendarView");
const calendarBase = declarations(calendarCss, '#calendarView .calendar-cell[data-spend-level]');
const calendarLevels = [calendarBase, ...[1, 2, 3, 4].map((level) =>
  declarations(calendarCss, `#calendarView .calendar-cell[data-spend-level="${level}"]`)
)];

test("Food hover feedback is shared, excludes unavailable dates, and respects reduced motion", () => {
  const feedback = summaryCss.split("/* Shared food-detail feedback")[1].split("/* Monthly feedback */")[0];
  assert.ok(!feedback.includes('data-theme="'), "Feedback must not be limited to a named theme");
  assert.match(feedback, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.ok(feedback.includes(':is(button.summary-food-day, button.summary-food-week-total):not(:disabled):hover'));
  assert.ok(feedback.includes(':not([aria-pressed="true"]):hover'), "Hover borders must preserve selection borders");
  assert.match(feedback, /tr:hover > :is\(th, td\)/);
  assert.match(feedback, /summary:focus-visible/);
  assert.match(feedback, /background-color 150ms ease/);
  assert.match(feedback, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
});

test("Graphite pattern heatmap: all six resting count levels meet AA and brighten monotonically", () => {
  const scope = ':root[data-theme="graphite-studio"] #summaryView';
  const tokens = {
    ...baseTokens,
    ...declarations(tokenCss, ':root[data-theme="graphite-studio"]'),
    ...declarations(summaryCss, `${scope} .summary-pattern-heatmap`)
  };
  let previous = -1;
  for (let level = 0; level <= 5; level += 1) {
    const background = `var(--pattern-heat-${level})`;
    readable(tokens, level >= 4 ? "var(--text-on-primary)" : "var(--text-primary)", background, `Pattern heat ${level}`);
    const brightness = luminance(color(background, tokens));
    assert.ok(brightness > previous, `Pattern heat ${level} must be brighter than the previous level`);
    previous = brightness;
    if (level > 0) {
      assert.ok(summaryCss.includes(`${scope} .pattern-heat-cell.level-${level},\n${scope} .pattern-heat-legend i:nth-of-type(${level}) { background: ${background}; }`), "Cell and legend must use the same scale");
    }
  }
  assert.ok(summaryCss.includes(`${scope} .pattern-heat-cell i { opacity: 1; font-size: 14px;`), "Counts must be visible without hover");
  readable(tokens, "var(--text-secondary)", "var(--pattern-heat-1)", "Food calendar supporting text");
});

test("Graphite food details: amounts, supporting text and over-budget status remain readable in every row state", () => {
  const tokens = {
    ...baseTokens,
    ...declarations(tokenCss, ':root[data-theme="graphite-studio"]'),
    ...declarations(summaryCss, ':root[data-theme="graphite-studio"] #summaryView :is(.summary-food-calendar, .summary-food-inspector, .summary-food-weekly)')
  };
  for (const background of ["bg-card", "bg-raised", "bg-muted", "bg-surface"]) {
    for (const foreground of ["text-primary", "food-detail-muted", "accent-negative"]) {
      readable(tokens, `var(--${foreground})`, `var(--${background})`, `Food detail ${foreground}/${background}`);
    }
  }
});

for (const theme of themes) {
  const tokens = { ...baseTokens, ...declarations(tokenCss, `:root[data-theme="${theme}"]`) };

  test(`${theme}: text, status, and dashboard colors meet AA contrast`, () => {
    for (const foreground of ["text-primary", "text-secondary", "text-muted-token", "accent-primary", "accent-blue", "accent-positive", "accent-negative", "accent-warning"]) {
      for (const background of ["bg-page", "bg-card", "bg-muted", "board-billing-bg"]) {
        readable(tokens, `var(--${foreground})`, `var(--${background})`, `${theme} ${foreground}/${background}`);
      }
    }
    readable(tokens, "var(--text-on-primary)", "var(--accent-primary)", `${theme} primary button`);
    for (const foreground of ["text-primary", "text-secondary", "accent-negative"]) {
      readable(tokens, `var(--${foreground})`, "var(--control-hover-bg)", `${theme} food hover ${foreground}`);
    }
    for (const status of ["positive", "negative", "warning"]) {
      readable(tokens, `var(--status-${status}-text)`, `var(--status-${status}-bg)`, `${theme} ${status} status`);
    }
    for (const foreground of ["text", "muted", "positive", "negative", "previous"]) {
      readable(tokens, `var(--board-hero-${foreground})`, "var(--board-hero-bg)", `${theme} hero ${foreground}`);
    }
  });

  test(`${theme}: all sector labels remain readable on their tinted backgrounds`, () => {
    for (const sector of sectors) {
      readable(tokens, `var(--sector-${sector}-text)`, `var(--sector-${sector}-bg)`, `${theme} ${sector}`);
    }
  });

  test(`${theme}: all five calendar heat levels keep actual date and muted text readable`, () => {
    const brightness = [];
    for (let level = 0; level <= 4; level += 1) {
      const cellTokens = {
        ...tokens,
        ...calendarTokens,
        ...calendarBase,
        ...calendarLevels[level]
      };
      for (const foreground of ["--calendar-cell-text", "--calendar-cell-muted"]) {
        readable(cellTokens, `var(${foreground})`, "var(--calendar-cell-bg)", `${theme} heat ${level} ${foreground}`);
      }
      brightness.push(luminance(color("var(--calendar-cell-bg)", cellTokens)));
    }
    for (let level = 1; level <= 4; level += 1) {
      const increases = theme === "graphite-studio";
      assert.ok(increases ? brightness[level] > brightness[level - 1] : brightness[level] < brightness[level - 1], `${theme} heat levels must progress in one brightness direction`);
    }
  });
}
