import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseFeedDate, parseRss, fetchSource, refreshInsights } from "../scripts/update-hobby-insights.mjs";
import insights from "../src/features/goals/goals-insights.js";

const now = new Date("2026-09-16T03:00:00.000Z");
const rss = (body) => `<?xml version="1.0"?><rss version="2.0"><channel>${body}</channel></rss>`;
const entry = ({ title = "How to monetize a blog", link = "https://wordpress.com/blog/2026/09/15/monetize/", date = "Tue, 15 Sep 2026 00:00:00 +0000", content = "" } = {}) => `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate>${content}</item>`;
const one = parseRss(rss(entry()), "wordpress", now)[0];
const previous = { schemaVersion: 1, updatedAt: "2026-09-15T03:00:00.000Z", attemptedAt: "2026-09-15T03:00:00.000Z", refreshStatus: "ok", sources: Object.fromEntries(insights.SOURCES.map((source) => [source.id, { state: "ok" }])), items: [one] };

test("RSS parser decodes plain text and does not collect descriptions, HTML, or arbitrary fields", () => {
  const items = parseRss(rss(entry({ title: "<![CDATA[Monetize a blog &amp; newsletter &#8217;]]>", content: "<description><![CDATA[<script>sendSecrets()</script>]]></description>" })), "wordpress", now);
  assert.equal(items[0].title, "Monetize a blog & newsletter ’");
  assert.deepEqual(Object.keys(items[0]), ["sourceId", "title", "url", "publishedAt", "topicId"]);
  assert.ok(!JSON.stringify(items).includes("sendSecrets"));
});

test("RSS dates preserve offsets and reject impossible dates or ambiguous formats", () => {
  assert.equal(parseFeedDate("Tue, 15 Sep 2026 12:30:00 -0400"), "2026-09-15T16:30:00.000Z");
  assert.equal(parseFeedDate("Tue, 15 Sep 2026 12:30:00 GMT"), "2026-09-15T12:30:00.000Z");
  for (const value of ["2026-09-15", "Mon, 30 Feb 2026 10:00:00 +0000", "Tue, 15 Sep 2026 25:00:00 +0000", "Tue, 15 Sep 2026 10:00:00 +9900"]) assert.equal(parseFeedDate(value), null);
});

test("malformed feeds, entity expansion, unsafe links and entirely invalid entries fail closed", () => {
  for (const xml of ["<html>login</html>", rss(""), rss(entry()).replace("</item>", ""), '<!DOCTYPE rss [<!ENTITY x "unsafe">]>' + rss(entry()), rss(entry({ link: "javascript:alert(1)" })), rss(entry({ date: "garbage" }))]) assert.throws(() => parseRss(xml, "wordpress", now));
  assert.throws(() => parseRss("x".repeat(3 * 1024 * 1024 + 1), "wordpress", now));
});

test("future and irrelevant posts are omitted without inventing replacement content", () => {
  assert.deepEqual(parseRss(rss(entry({ date: "Thu, 17 Sep 2026 00:00:00 +0000" })), "wordpress", now), []);
  assert.deepEqual(parseRss(rss(entry({ title: "Company anniversary" })), "wordpress", now), []);
});

test("source request has a timeout, no credentials, no redirects, and validates content type", async () => {
  let requested;
  const result = await fetchSource(insights.SOURCES[1], { now, fetchImpl: async (url, options) => {
    requested = { url, options };
    return new Response(rss(entry()), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
  } });
  assert.equal(result.length, 1);
  assert.equal(requested.url, "https://wordpress.com/blog/feed/");
  assert.equal(requested.options.redirect, "error");
  assert.equal(requested.options.credentials, "omit");
  assert.ok(requested.options.signal instanceof AbortSignal);
  assert.equal(requested.options.body, undefined);
  await assert.rejects(fetchSource(insights.SOURCES[0], { fetchImpl: async () => new Response("<html>challenge</html>", { headers: { "content-type": "text/html" } }) }), /unexpected-content-type/);
  await assert.rejects(fetchSource(insights.SOURCES[0], { fetchImpl: async () => new Response("unavailable", { status: 503 }) }), /HTTP 503/);
});

test("any source failure preserves all prior good items and updatedAt while recording attemptedAt", async () => {
  for (const allFail of [false, true]) {
    const result = await refreshInsights({ previous, now, request: async (source) => {
      if (allFail || source.id === "youtube") throw new Error("timeout");
      return [];
    } });
    assert.deepEqual(result.items, previous.items);
    assert.equal(result.updatedAt, previous.updatedAt);
    assert.equal(result.attemptedAt, now.toISOString());
    assert.equal(result.refreshStatus, "stale");
    assert.equal(result.sources.youtube.state, "failed");
  }
});

test("first-run source failure yields an honest empty snapshot, never manufactured insight", async () => {
  const result = await refreshInsights({ now, request: async () => { throw new Error("offline"); } });
  assert.equal(result.updatedAt, null);
  assert.equal(result.attemptedAt, now.toISOString());
  assert.deepEqual(result.items, []);
  assert.equal(result.refreshStatus, "stale");
});

test("successful refresh accumulates source history, deduplicates, expires old records, and uses original dates", async () => {
  const old = { ...one, url: "https://wordpress.com/blog/2025/01/01/monetize/", publishedAt: "2025-01-01T00:00:00.000Z" };
  const newer = { ...one, url: "https://wordpress.com/blog/2026/09/16/monetize/", publishedAt: "2026-09-16T00:00:00.000Z" };
  const result = await refreshInsights({ previous: { ...previous, items: [one, old] }, now, request: async (source) => source.id === "wordpress" ? [newer, newer] : [] });
  assert.equal(result.updatedAt, now.toISOString());
  assert.equal(result.refreshStatus, "ok");
  assert.deepEqual(result.items, [newer, one]);
  assert.equal(result.items[1].publishedAt, one.publishedAt);
});

test("workflow is daily and publishes only static public data through the existing Pages workflow", async () => {
  const workflow = await readFile(new URL("../.github/workflows/update-hobby-insights.yml", import.meta.url), "utf8");
  assert.match(workflow, /cron: "30 22 \* \* \*"/);
  assert.match(workflow, /git add data\/hobby-insights\.json/);
  assert.ok(!workflow.includes("git add ."));
  assert.ok(!workflow.includes("secrets."));
  assert.match(workflow, /uses: \.\/\.github\/workflows\/deploy-pages\.yml/);
});
