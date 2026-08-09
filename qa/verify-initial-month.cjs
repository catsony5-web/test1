const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const initSource = fs.readFileSync(path.join(root, "src/features/app/init.js"), "utf8");

const hydrateIndex = initSource.indexOf("await hydrateStoredData();");
const seedIndex = initSource.indexOf("setSharedSelectedMonth(currentMonthKey(), { syncControls: false });");
const firstRenderIndex = initSource.indexOf("reclassify();", seedIndex);

assert.ok(hydrateIndex >= 0, "persisted data hydrate step must exist");
assert.ok(seedIndex > hydrateIndex, "current month must be seeded after persisted data hydrate");
assert.ok(firstRenderIndex > seedIndex, "current month must be seeded before the first render path");

const stateSource = fs.readFileSync(path.join(root, "src/features/app/state.js"), "utf8");
assert.match(
  stateSource,
  /function setSharedSelectedMonth\(month,[\s\S]*?selectedAppMonth = month;[\s\S]*?return selectedAppMonth;\s*}/,
  "manual month selection must continue to replace the shared selected month"
);

console.log("Initial month verification passed.");
