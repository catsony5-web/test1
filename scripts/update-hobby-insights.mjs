import { readFile, open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import insights from "../src/features/goals/goals-insights.js";

const MAX_FEED_BYTES = 3 * 1024 * 1024;
const outputPath = fileURLToPath(new URL("../data/hobby-insights.json", import.meta.url));

function plainText(value) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      if (entity[0] !== "#") return entities[entity.toLowerCase()] || match;
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
    }).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function parseFeedDate(value) {
  const match = String(value).trim().match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) (?:([+-])(\d{2})(\d{2})|(GMT|UTC))$/);
  if (!match) return null;
  const [, day, monthName, year, hour, minute, second, sign, offsetHour = "0", offsetMinute = "0"] = match;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(monthName);
  if (+year < 2000 || +day < 1 || +day > new Date(Date.UTC(+year, month + 1, 0)).getUTCDate() || +hour > 23 || +minute > 59 || +second > 59 || +offsetHour > 14 || +offsetMinute > 59) return null;
  const offset = (+offsetHour * 60 + +offsetMinute) * (sign === "-" ? -1 : 1);
  return new Date(Date.UTC(+year, month, +day, +hour, +minute - offset, +second)).toISOString();
}

export function parseRss(xml, sourceId, now = new Date()) {
  if (typeof xml !== "string" || Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<rss\b[^>]*>[\s\S]*<channel>[\s\S]*<\/channel>\s*<\/rss>\s*$/i.test(xml)) throw new Error("invalid-rss");
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (!blocks.length || blocks.length > 3000 || blocks.length !== (xml.match(/<item\b/gi) || []).length) throw new Error("invalid-rss-items");
  const items = [];
  let validEntries = 0;
  for (const [, block] of blocks) {
    // Descriptions/content are not interpreted, copied, or executed.
    const field = (name) => plainText(block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
    const title = field("title");
    const url = insights.safeSourceUrl(field("link"), sourceId);
    const publishedAt = parseFeedDate(field("pubDate"));
    if (!title || title.length > 400 || !url || !publishedAt) continue;
    validEntries += 1;
    const item = insights.normalizeItem({ sourceId, title, url, publishedAt }, now);
    if (item) items.push(item);
  }
  if (!validEntries) throw new Error("no-valid-source-entries");
  return [...new Map(items.map((item) => [item.url, item])).values()];
}

export async function fetchSource(source, { fetchImpl = fetch, now = new Date() } = {}) {
  const response = await fetchImpl(source.feed, { signal: AbortSignal.timeout(20000), redirect: "error", credentials: "omit", headers: { accept: "application/rss+xml, application/xml, text/xml", "user-agent": "PublicHobbyInsights/1.0" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!/(?:application\/(?:rss\+xml|xml)|text\/xml)/i.test(response.headers.get("content-type") || "")) throw new Error("unexpected-content-type");
  return parseRss(await insights.readBoundedText(response, MAX_FEED_BYTES), source.id, now);
}

export async function refreshInsights({ previous, now = new Date(), request = fetchSource } = {}) {
  const saved = insights.normalizeSnapshot(previous, now) || { schemaVersion: 1, updatedAt: null, attemptedAt: null, refreshStatus: "stale", sources: {}, items: [] };
  const results = await Promise.all(insights.SOURCES.map(async (source) => {
    try {
      const items = await request(source, { now });
      if (!Array.isArray(items)) throw new Error("invalid-items");
      return { id: source.id, state: "ok", items };
    } catch { return { id: source.id, state: "failed", items: [] }; }
  }));
  const sources = Object.fromEntries(results.map(({ id, state }) => [id, { state }]));
  const attemptedAt = now.toISOString();
  if (results.some((source) => source.state === "failed")) return { ...saved, attemptedAt, refreshStatus: "stale", sources };
  const start = insights.periodStart("year", now);
  const items = [...new Map([...saved.items, ...results.flatMap((source) => source.items)]
    .map((item) => insights.normalizeItem(item, now)).filter((item) => item && new Date(item.publishedAt).getTime() >= start)
    .map((item) => [item.url, item])).values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, insights.MAX_ITEMS);
  return { schemaVersion: 1, updatedAt: attemptedAt, attemptedAt, refreshStatus: "ok", sources, items };
}

async function main() {
  let previous;
  try { previous = JSON.parse(await readFile(outputPath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const snapshot = await refreshInsights({ previous });
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx");
    try { await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8"); }
    finally { await handle.close(); }
    await rename(temporary, outputPath);
  } finally { await rm(temporary, { force: true }); }
  if (snapshot.refreshStatus === "stale") console.warn("::warning::Public feed refresh failed; last successful snapshot retained.");
  console.log(`${path.basename(outputPath)}: ${snapshot.items.length} public items, status ${snapshot.refreshStatus}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
