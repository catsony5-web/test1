const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const index = read("index.html");
const tokens = read("src/styles/00-tokens.css");
const themeStyles = read("src/styles/08-themes.css");
const corsaStyles = read("src/styles/12-rosso-ink.css");
const storage = read("src/utils/storage.js");
const state = read("src/features/app/state.js");
const constants = read("src/data/constants.js");
const serviceWorker = read("service-worker.js");

const themes = {
  "rosso-ink": {
    label: "로쏘 잉크 · Rosso Ink",
    colors: {
      fixed: "#8d99ae",
      food: "#d79555",
      household: "#59a18a",
      shopping: "#d56578",
      personal: "#9a7dbb",
      selfdev: "#5d8fc0",
      gift: "#c07a68",
      transport: "#4c9ba8",
      saving: "#7f9c5a",
      income: "#24a06b",
      etc: "#8a837a",
      unknown: "#b85b55"
    },
    ink: Object.fromEntries([
      "fixed", "food", "household", "shopping", "personal", "selfdev",
      "gift", "transport", "saving", "income", "etc"
    ].map((sector) => [sector, "#181818"]).concat([["unknown", "#ffffff"]]))
  },
  "corsa-technical": {
    label: "코르사 테크니컬 · Corsa Technical",
    colors: {
      fixed: "#4c7475",
      food: "#a58b57",
      household: "#748b68",
      shopping: "#806986",
      personal: "#945f5f",
      selfdev: "#668894",
      gift: "#8b6b72",
      transport: "#6e86a0",
      saving: "#7f8d66",
      income: "#5f8a76",
      etc: "#77746e",
      unknown: "#70757a"
    },
    ink: {
      fixed: "#ffffff",
      food: "#181818",
      household: "#181818",
      shopping: "#ffffff",
      personal: "#ffffff",
      selfdev: "#181818",
      gift: "#ffffff",
      transport: "#181818",
      saving: "#181818",
      income: "#181818",
      etc: "#ffffff",
      unknown: "#ffffff"
    }
  },
  "corsa-editorial": {
    label: "코르사 에디토리얼 · Corsa Editorial",
    colors: {
      fixed: "#687a57",
      food: "#a8845e",
      household: "#547266",
      shopping: "#925f67",
      personal: "#9a6958",
      selfdev: "#796b80",
      gift: "#8b695f",
      transport: "#58728d",
      saving: "#747248",
      income: "#507563",
      etc: "#746d64",
      unknown: "#707276"
    },
    ink: {
      fixed: "#ffffff",
      food: "#181818",
      household: "#ffffff",
      shopping: "#ffffff",
      personal: "#ffffff",
      selfdev: "#ffffff",
      gift: "#ffffff",
      transport: "#ffffff",
      saving: "#ffffff",
      income: "#ffffff",
      etc: "#ffffff",
      unknown: "#ffffff"
    }
  }
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactThemeBlock(theme) {
  return tokens.match(new RegExp(`:root\\[data-theme="${escapeRegExp(theme)}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] || "";
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

Object.entries(themes).forEach(([theme, config]) => {
  assert.equal(
    (index.match(new RegExp(`data-theme-choice="${escapeRegExp(theme)}"`, "g")) || []).length,
    1,
    `${theme} must be offered exactly once`
  );
  assert.ok(index.includes(config.label), `${theme} must retain its full visible name`);
  assert.match(storage, new RegExp(`"${escapeRegExp(theme)}": "#181818"`), `${theme} must set the dark browser color`);
  assert.match(themeStyles, new RegExp(`data-theme-choice="${escapeRegExp(theme)}"[\\s\\S]*?#181818`), `${theme} must have a picker preview`);

  const block = theme === "rosso-ink"
    ? tokens.match(/:root:is\(\s*\[data-theme="rosso-ink"\],[\s\S]*?\)\s*\{([\s\S]*?)\n\}/)?.[1] || ""
    : exactThemeBlock(theme);
  assert.ok(block, `${theme} token block must exist`);
  if (theme !== "rosso-ink") {
    assert.match(block, /--border-strong:\s*#707070/, `${theme} interactive boundaries must remain visible`);
  }

  Object.entries(config.colors).forEach(([sector, color]) => {
    assert.match(block, new RegExp(`--sector-${sector}-solid:\\s*${color}`), `${theme} ${sector} must keep the approved color`);
    assert.match(block, new RegExp(`--sector-${sector}-ink:\\s*${config.ink[sector]}`), `${theme} ${sector} must keep its readable foreground`);
    assert.ok(contrast(config.ink[sector], color) >= 4.5, `${theme} ${sector} solid text must meet WCAG AA`);
    assert.ok(contrast(color, config.ink[sector]) >= 3, `${theme} ${sector} icon treatment must meet non-text contrast`);
    assert.ok(contrast(color, "#222222") >= 3, `${theme} ${sector} chart mark must remain distinct from the card canvas`);
  });

  assert.equal(
    new Set(Object.values(config.colors)).size,
    Object.keys(config.colors).length,
    `${theme} sector colors must be distinct`
  );
});

assert.match(
  storage,
  /\["minimal", "dark", "rosso-ink", "corsa-technical", "corsa-editorial", "clear-aqua", "lilac-aqua", "garden-ink", "warm-earth"\]/,
  "theme normalization must preserve every existing theme and allow the Corsa family"
);
assert.match(state, /themeRevision:\s*1/, "adding themes must not reset existing user preferences");
const appVersion = constants.match(/const APP_VERSION = "(v\d+)";/)?.[1] || "";
assert.match(appVersion, /^v\d+$/, "application version must use the expected version format");
assert.ok(
  serviceWorker.includes(`monthly-card-budget-${appVersion}`),
  "service-worker cache must include the application version"
);
assert.match(serviceWorker, /"\.\/src\/styles\/12-rosso-ink\.css"/, "the final Corsa family stylesheet must be cached");

const summaryStylesIndex = index.indexOf("src/styles/11-summary-insights.css");
const corsaStylesIndex = index.indexOf("src/styles/12-rosso-ink.css?v=169-corsa-themes");
assert.ok(summaryStylesIndex >= 0, "summary styles must remain linked");
assert.ok(corsaStylesIndex > summaryStylesIndex, "Corsa family overrides must load after feature styles");

const familyBlock = tokens.match(/:root:is\(\s*\[data-theme="rosso-ink"\],[\s\S]*?\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
assert.ok(familyBlock, "the Corsa family must share one shell token block");
assert.match(familyBlock, /color-scheme:\s*dark/, "the Corsa family must use native dark controls");
assert.match(familyBlock, /--bg-page:\s*#181818/, "the Corsa family must use the selected near-black canvas");
assert.match(familyBlock, /--accent-primary:\s*#da291c/, "the Corsa family must use the selected action red");
assert.match(familyBlock, /--focus-ring:\s*#4c98b9/, "focus rings must remain visible on dark surfaces");
assert.match(familyBlock, /--border-strong:\s*#555555/, "the existing Rosso shell border must remain unchanged");
assert.match(familyBlock, /--primary-navy:\s*var\(--text-primary\)/, "legacy neutral text must not become action red");
assert.doesNotMatch(tokens, /:root:is\(\[data-theme="corsa-technical"\], \[data-theme="corsa-editorial"\]\)\s*\{/, "shared shell tokens must not be duplicated");

assert.match(corsaStyles, /data-theme="rosso-ink"[\s\S]*?data-theme="corsa-technical"[\s\S]*?data-theme="corsa-editorial"/, "family selectors must include all three themes");
assert.match(corsaStyles, /body::after[\s\S]*?background:\s*rgba\(24, 24, 24, var\(--app-bg-overlay\)\)/, "background overlay must remain dark");
assert.match(corsaStyles, /#boardView \.board-treemap-tile[\s\S]*?--treemap-ink:\s*var\(--sector-etc-ink\)/, "treemap tiles must use palette-specific foregrounds");
assert.match(corsaStyles, /board-treemap-tile\.unknown \{ --treemap-ink:\s*var\(--sector-unknown-ink\); \}/, "unknown treemap tiles must receive their own foreground");
assert.match(corsaStyles, /#boardView \.board-treemap-icon[\s\S]*?background:\s*var\(--treemap-ink\)[\s\S]*?color:\s*var\(--treemap-color\)/, "treemap pictograms must use the matching contrast disc");
assert.match(corsaStyles, /board-treemap-tile:hover,[\s\S]*?background:\s*var\(--treemap-color\)/, "treemap hover must preserve label contrast");
assert.match(corsaStyles, /summary-priority-bubble\.unknown \{ --bubble-ink:\s*var\(--sector-unknown-ink\); \}/, "priority bubbles must use palette-specific foregrounds");
assert.match(corsaStyles, /summary-priority-bubble :is\([\s\S]*?fill:\s*var\(--bubble-ink\)/, "priority bubble labels must consume the foreground token");
assert.match(corsaStyles, /summary-priority-bubble circle[\s\S]*?fill-opacity:\s*1/, "priority bubbles must remain opaque");
assert.match(corsaStyles, /priority-bubble-delta[\s\S]*?opacity:\s*1/, "small priority deltas must remain fully opaque");
assert.match(corsaStyles, /allocation-essential[\s\S]*?color:\s*var\(--sector-fixed-ink\)/, "essential allocation labels must follow the fixed-sector foreground");
assert.match(corsaStyles, /\[role="button"\][\s\S]*?:focus-visible[\s\S]*?outline:\s*2px solid var\(--focus-ring\)/, "interactive controls must expose a visible keyboard focus ring");
assert.match(corsaStyles, /border-radius:\s*0/, "major Corsa family surfaces must use sharp geometry");
assert.match(corsaStyles, /calendar-edit-grid input\[readonly\][\s\S]*?color:\s*var\(--accent-primary-text\)/, "readonly calendar values must use the accessible accent text token");
assert.match(corsaStyles, /period-map-cell:focus-visible[\s\S]*?border-color:\s*var\(--focus-ring\)[\s\S]*?box-shadow:[^;]*var\(--focus-ring\)/, "period cells must use the visible focus token");

assert.ok(contrast("#ffffff", "#da291c") >= 4.5, "primary button text must meet WCAG AA");
assert.ok(contrast("#ff756b", "#303030") >= 4.5, "small accent text must meet WCAG AA");
assert.ok(contrast("#9c9c9c", "#303030") >= 4.5, "secondary text must meet WCAG AA on raised surfaces");
assert.ok(contrast("#4c98b9", "#303030") >= 3, "focus indicators must meet non-text contrast");
assert.ok(contrast("#707070", "#222222") >= 3, "strong control borders must meet non-text contrast");
assert.ok(contrast("#ffffff", "#2f6f89") >= 4.5, "selected mobile date text must meet WCAG AA");

console.log("Corsa theme family verification passed.");
