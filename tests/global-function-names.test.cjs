const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("HTML에 로드되는 classic script의 전역 함수 선언은 이름이 중복되지 않는다", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const names = new Map(), duplicates = [];
  for (const tag of html.matchAll(/<script\b[^>]*\bsrc=["'](src\/[^"'?]+)(?:\?[^"']*)?["'][^>]*>/g)) {
    if (/\btype=["']module["']/.test(tag[0])) continue;
    const file = tag[1], source = fs.readFileSync(path.join(root, file), "utf8");
    // App-wide declarations use column zero; nested helpers are indented.
    for (const declaration of source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      const name = declaration[1];
      const location = `${file}:${source.slice(0, declaration.index).split("\n").length}`;
      if (names.has(name)) duplicates.push(`${name}: ${names.get(name)} -> ${location}`);
      else names.set(name, location);
    }
  }
  assert.ok(names.size > 100, "The check must include the shipped application scripts");
  assert.deepEqual(duplicates, [], `Later scripts overwrite these globals:\n${duplicates.join("\n")}`);
});
