const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const transportSource = fs.readFileSync(path.join(__dirname, "../src/features/agent/ledger-agent-transport.js"), "utf8");
const companionSource = fs.readFileSync(path.join(__dirname, "../scripts/agent-connect.js"), "utf8");
const clone = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let step = 0; step < 20; step += 1) await Promise.resolve(); };
const origin = "https://synthetic-budget.example";
const nonce = "ab".repeat(32);
const account = { id: "synthetic-account", email: "selected@example.invalid", label: "합성 계정", connected: true, sharing: true };
const status = () => ({ subscription: { available: true, profiles: [] }, api: { available: false },
  session: { connected: true, mode: "subscription", id: "synthetic-session", model: "synthetic-model", models: ["synthetic-model", "other-model"], account: { ...account } } });

class Channel {
  constructor() {
    const port = () => ({ closed: false, sent: [], start() {}, close() { this.closed = true; } });
    this.port1 = port(); this.port2 = port();
    for (const [from, to] of [[this.port1, this.port2], [this.port2, this.port1]]) {
      from.postMessage = (data) => { from.sent.push(clone(data)); queueMicrotask(() => { if (!to.closed) to.onmessage?.({ data }); }); };
    }
  }
}
function runtime() {
  const listeners = new Map(); const timers = new Map(); let timerId = 0;
  const window = { addEventListener(type, callback) { listeners.set(type, callback); }, removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); } };
  return { window, listeners, timers, globals: { URL, URLSearchParams, TextEncoder, Uint8Array, DOMException, AbortController, MessageChannel: Channel,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, interval: false }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, interval: true }); return id; },
    clearInterval(id) { timers.delete(id); }, console } };
}
function transportHarness({ blocked = false } = {}) {
  const h = runtime(); const messages = []; const disconnected = []; let seed = 0;
  const popup = { closed: false, close() { this.closed = true; }, postMessage(data, target, ports) { messages.push({ data: clone(data), target, ports }); } };
  h.window.open = (url) => { h.url = new URL(url); popup.closed = false; return blocked ? null : popup; };
  const context = vm.createContext({ ...h.globals, window: h.window, location: { protocol: "https:", origin }, crypto: { getRandomValues(array) { return array.fill(++seed); } } });
  vm.runInContext(transportSource, context);
  const transport = context.LedgerAgentTransport.create({ onDisconnect: (reason) => disconnected.push(reason) });
  h.ready = (overrides = {}) => h.listeners.get("message")?.({ origin: "http://127.0.0.1:4185", source: popup,
    data: { channel: "ledger-local-agent-v1", type: "ready", nonce: h.url.hash.match(/nonce=([^&]+)/)[1] }, ...overrides });
  h.connect = async () => { const promise = transport.connect(); h.ready(); h.peer = messages.at(-1).ports[0]; h.peer.postMessage({ type: "connected", status: status() }); await promise; };
  return Object.assign(h, { transport, popup, messages, disconnected });
}

test("public connection requires the exact local window, origin and fresh nonce before approval", async () => {
  const h = transportHarness(); const promise = h.transport.connect();
  h.ready({ origin: "https://untrusted.example" }); h.ready({ source: {} });
  h.ready({ data: { channel: "ledger-local-agent-v1", type: "ready", nonce: "wrong" } });
  assert.equal(h.messages.length, 0); assert.equal(h.transport.isConnected(), false);
  await assert.rejects(h.transport.request("status"), /PC 연결/);
  h.ready(); const peer = h.messages[0].ports[0];
  assert.equal(h.messages[0].target, "http://127.0.0.1:4185");
  assert.equal(h.transport.isConnected(), false);
  peer.postMessage({ type: "connected", status: status() }); await promise;
  assert.equal(h.transport.isConnected(), true);
  h.transport.disconnect(); assert.equal(peer.sent.length, 1);
});

test("public transport rejects account administration, malformed bodies and oversized payloads", async () => {
  const h = transportHarness(); await h.connect();
  for (const action of ["logout", "api-session", "subscription-login", "subscription-select", "../../private"]) await assert.rejects(h.transport.request(action, {}), /허용되지/);
  await assert.rejects(h.transport.request("status", {}), /허용되지/);
  await assert.rejects(h.transport.request("respond", { input: "가".repeat(100000) }), /너무 큽니다/);
  assert.equal(h.messages[0].ports[0].sent.length, 1);
  h.transport.disconnect();
});

test("public transport correlates replies and cancels only the aborted request", async () => {
  const h = transportHarness(); await h.connect();
  const controller = new AbortController();
  const work = h.transport.request("respond", { sessionId: "synthetic-session", input: [] }, controller.signal);
  const rejected = assert.rejects(work, { name: "AbortError" }); controller.abort(); await rejected; await flush();
  assert.ok(h.messages[0].ports[0].closed === false);
  const next = h.transport.request("status"); await flush();
  h.peer.postMessage({ type: "response", id: "r1", ok: true, result: { output: ["late"] } });
  h.peer.postMessage({ type: "response", id: "r2", ok: true, result: status() });
  assert.equal((await next).session.id, "synthetic-session");
  h.transport.disconnect();
});

test("closing the companion or leaving the page rejects pending work and ends access", async () => {
  for (const kind of ["closed", "pagehide"]) {
    const h = transportHarness(); await h.connect();
    const response = h.transport.request("respond", { sessionId: "synthetic-session" }); const rejected = assert.rejects(response, /PC 연결/);
    if (kind === "closed") { h.popup.closed = true; [...h.timers.values()].find((timer) => timer.interval).callback(); }
    else h.listeners.get("pagehide")();
    await rejected; assert.equal(h.transport.isConnected(), false); assert.equal(h.timers.size, 0); assert.equal(h.disconnected.length, 1);
  }
});

test("blocked popups and an unavailable local server produce actionable errors", async () => {
  const blocked = transportHarness({ blocked: true }); await assert.rejects(blocked.transport.connect(), /팝업/); assert.equal(blocked.timers.size, 0);
  const h = transportHarness(); const promise = h.transport.connect(); const rejected = assert.rejects(promise, /연결 서버/);
  [...h.timers.values()].find((timer) => timer.delay === 15000).callback(); await rejected;
  assert.equal(h.listeners.has("message"), false); assert.equal(h.popup.closed, true);
});

class Element {
  constructor() { this.value = ""; this.textContent = ""; this.children = []; this.dataset = {}; this.listeners = {}; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  removeAttribute(key) { delete this[key]; }
  click(trusted = true) { return this.listeners.click?.({ isTrusted: trusted }); }
}
function companionHarness({ expectedOrigin = origin, opener = true, fetchOverride } = {}) {
  const h = runtime(); const elements = new Map(); const calls = []; const announcements = [];
  const owner = { closed: false, postMessage(data, target) { announcements.push({ data: clone(data), target }); } };
  const current = status(); current.subscription.profiles = [account, { id: "other-account", email: "unselected@example.invalid", connected: true, sharing: true }];
  h.window.opener = opener ? owner : null; h.window.open = () => ({ opener: {}, close() {}, location: { replace() {} } });
  const context = vm.createContext({ ...h.globals, window: h.window, location: { origin: "http://127.0.0.1:4185", pathname: "/agent-connect", hash: `#${new URLSearchParams({ origin: expectedOrigin, nonce })}` },
    history: { replaceState() {} }, document: { getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement() { return new Element(); } },
    async fetch(url, options) {
      const action = url.replace("/agent-api/", ""); const data = options.body ? JSON.parse(options.body) : undefined; calls.push({ action, data, signal: options.signal });
      if (fetchOverride) { const result = await fetchOverride(action, data, options.signal); if (result) return result; }
      if (action === "model") current.session.model = data.model;
      return { ok: true, headers: { get() { return "application/json"; } }, async json() { return clone(action === "respond" ? { output: [{ type: "message" }] } : current); } };
    } });
  vm.runInContext(companionSource, context);
  const pair = new Channel(); const replies = []; pair.port1.onmessage = (event) => replies.push(clone(event.data));
  const initialize = (overrides = {}) => h.listeners.get("message")?.({ origin, source: owner, data: { channel: "ledger-local-agent-v1", type: "initialize", nonce }, ports: [pair.port2], ...overrides });
  return Object.assign(h, { elements, owner, current, calls, announcements, initialize, peer: pair.port1, replies });
}

test("companion reveals no account details before a trusted local approval click", async () => {
  const h = companionHarness(); await flush();
  assert.equal(h.announcements.length, 1); assert.ok(!JSON.stringify(h.announcements).includes("example.invalid"));
  h.initialize({ origin: "https://untrusted.example" }); assert.equal(h.elements.get("allow").disabled, true);
  h.initialize({ source: {} }); assert.equal(h.elements.get("allow").disabled, true);
  h.initialize({ data: { channel: "ledger-local-agent-v1", type: "initialize", nonce: "wrong" } }); assert.equal(h.elements.get("allow").disabled, true);
  h.initialize(); h.peer.postMessage({ type: "request", id: "r1", path: "status" }); await flush(); assert.equal(h.replies.length, 0);
  await h.elements.get("allow").click(false); assert.equal(h.replies.length, 0);
  await h.elements.get("allow").click(); await flush();
  assert.equal(h.replies[0].type, "connected"); assert.deepEqual(h.replies[0].status.subscription.profiles, []);
  assert.equal(h.replies[0].status.session.account.email, account.email);
  assert.ok(!JSON.stringify(h.replies).includes("unselected@example.invalid"));
  h.listeners.get("pagehide")();
});

test("companion only forwards allowed operations and disconnect does not revoke ChatGPT", async () => {
  const h = companionHarness(); await flush(); h.initialize(); await h.elements.get("allow").click(); await flush();
  h.peer.postMessage({ type: "request", id: "r1", path: "logout", data: {} }); await flush();
  assert.equal(h.replies.at(-1).ok, false); assert.ok(!h.calls.some((call) => call.action === "logout"));
  h.peer.postMessage({ type: "request", id: "r2", path: "model", data: { model: "other-model", sessionId: "synthetic-session" } }); await flush();
  assert.equal(h.replies.at(-1).result.session.model, "other-model");
  h.peer.postMessage({ type: "disconnect" }); await flush(); assert.ok(!h.calls.some((call) => call.action === "logout"));
});

test("companion cannot approve an account or model that differs from the visible selection", async () => {
  const h = companionHarness(); await flush(); h.initialize();
  const profile = h.elements.get("profile"); profile.value = "other-account"; profile.listeners.change();
  assert.equal(h.elements.get("allow").disabled, true);
  await h.elements.get("allow").click(); await flush(); assert.equal(h.replies.length, 0);
  profile.value = account.id; profile.listeners.change();
  const model = h.elements.get("model"); model.value = ""; model.listeners.change();
  assert.equal(h.elements.get("allow").disabled, true);
  await h.elements.get("allow").click(); await flush(); assert.equal(h.replies.length, 0);
  h.listeners.get("pagehide")();
});

test("companion rechecks the account at approval and requires a new click after a change", async () => {
  const h = companionHarness(); await flush(); h.initialize();
  h.current.session.account = { ...account, id: "other-account", email: "unselected@example.invalid" };
  await h.elements.get("allow").click(); await flush();
  assert.equal(h.replies.length, 0); assert.match(h.elements.get("feedback").textContent, /다시 확인/);
  assert.equal(h.elements.get("profile").value, "other-account");
  await h.elements.get("allow").click(); await flush(); assert.equal(h.replies[0].status.session.account.id, "other-account");
  h.listeners.get("pagehide")();
});

test("companion detects another local tab changing the account before inference", async () => {
  const h = companionHarness(); await flush(); h.initialize(); await h.elements.get("allow").click(); await flush();
  h.current.session.id = "changed-session";
  h.peer.postMessage({ type: "request", id: "r1", path: "respond", data: { sessionId: "synthetic-session", input: [] } }); await flush();
  assert.equal(h.replies.at(-1).type, "disconnected"); assert.ok(!h.calls.some((call) => call.action === "respond"));
});

test("companion aborts only its in-flight request and rejects replays", async () => {
  let inference;
  const h = companionHarness({ fetchOverride(action, data, signal) {
    if (action !== "respond") return;
    inference = signal;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true }));
  } });
  await flush(); h.initialize(); await h.elements.get("allow").click(); await flush();
  const message = { type: "request", id: "r1", path: "respond", data: { sessionId: "synthetic-session" } };
  h.peer.postMessage(message); await flush(); assert.equal(inference.aborted, false);
  h.peer.postMessage({ type: "cancel", id: "r1" }); await flush(); assert.equal(inference.aborted, true);
  h.peer.postMessage(message); await flush(); assert.equal(h.replies.at(-1).type, "disconnected");
  assert.equal(h.calls.filter((call) => call.action === "respond").length, 1);
});

test("companion refuses missing openers, non-HTTPS origins and oversized messages", async () => {
  for (const options of [{ opener: false }, { expectedOrigin: "http://synthetic-budget.example" }]) {
    const h = companionHarness(options); await flush(); assert.equal(h.announcements.length, 0); assert.equal(h.calls.length, 0);
  }
  const h = companionHarness(); await flush(); h.initialize(); await h.elements.get("allow").click(); await flush();
  h.peer.postMessage({ type: "request", id: "r1", path: "respond", data: { input: "가".repeat(100000) } }); await flush();
  assert.equal(h.replies.at(-1).type, "disconnected"); assert.ok(!h.calls.some((call) => call.action === "respond"));
});
