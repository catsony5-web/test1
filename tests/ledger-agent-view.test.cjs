const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/features/agent/ledger-agent-view.js"), "utf8");
const clone = (value) => JSON.parse(JSON.stringify(value));
const answer = (text = "합성 답변") => ({ output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }] });
const call = (name, args = {}) => ({ output: [{ type: "function_call", name, arguments: JSON.stringify(args), call_id: "synthetic-call" }] });

function harness(responses, execute = async () => ({ total: 42 })) {
  const sent = [];
  const executed = [];
  const texts = [];
  const toolResults = [];
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  const tools = {
    definitions: ["monthly_metrics", "propose_changes"].map((name) => ({ type: "function", name })),
    async execute(name, args) { executed.push({ name, args: clone(args) }); return execute(name, args); }
  };
  const conversation = context.LedgerAgentConversation.create({
    tools,
    async respond(payload, signal) {
      sent.push(clone(payload));
      const next = responses.shift();
      return typeof next === "function" ? next(payload, signal) : next;
    },
    onText: (text) => texts.push(text),
    onTool: (name, result) => toolResults.push({ name, result: clone(result) })
  });
  return { conversation, sent, executed, texts, toolResults };
}

test("agent asks existing ledger tools and forwards their exact result before answering", async () => {
  const h = harness([call("monthly_metrics", { month: "2035-02" }), answer()], async () => ({ consumption: 4200, warnings: ["합성 확인 항목"] }));
  await h.conversation.send("합성 월 지표", "synthetic-model");
  assert.equal(h.executed.length, 1);
  assert.deepEqual(h.executed[0], { name: "monthly_metrics", args: { month: "2035-02" } });
  const result = h.sent[1].input.find((item) => item.type === "function_call_output");
  assert.deepEqual(JSON.parse(result.output), { consumption: 4200, warnings: ["합성 확인 항목"] });
  assert.deepEqual(h.texts, ["합성 답변"]);
});

test("model change proposal does not execute apply and unknown apply calls stay rejected", async () => {
  const h = harness([call("propose_changes", { changes: [{ ref: "synthetic-ref", amount: 4200 }] }), call("apply_changes", { approved: true }), answer()],
    async () => ({ planId: "synthetic-plan", status: "pending", changes: [] }));
  await h.conversation.send("수정 제안", "synthetic-model");
  assert.equal(h.executed.length, 1);
  assert.equal(h.executed[0].name, "propose_changes");
  const rejected = h.sent[2].input.filter((item) => item.type === "function_call_output").at(-1);
  assert.match(JSON.parse(rejected.output).error, /허용되지/);
});

test("malformed tool arguments are reported without executing a mutation", async () => {
  const response = call("propose_changes"); response.output[0].arguments = "not-json";
  const h = harness([response, answer()]);
  await h.conversation.send("합성 요청", "synthetic-model");
  assert.equal(h.executed.length, 0);
  assert.ok(JSON.parse(h.sent[1].input.at(-1).output).error);
});

test("canceled response cannot execute a tool", async () => {
  const controller = new AbortController();
  const h = harness([() => { controller.abort(); return call("propose_changes"); }]);
  await assert.rejects(h.conversation.send("합성 요청", "synthetic-model", controller.signal), /중지/);
  assert.equal(h.executed.length, 0);
});

test("clearing an in-flight conversation invalidates its response and data", async () => {
  let finish;
  const h = harness([() => new Promise((resolve) => { finish = resolve; }), answer("새 답변")]);
  const first = h.conversation.send("이전 계정의 합성 요청", "synthetic-model");
  h.conversation.clear(); finish(call("monthly_metrics", { month: "2035-02" }));
  await assert.rejects(first, /중지/);
  await h.conversation.send("새 계정의 합성 요청", "synthetic-model");
  assert.equal(h.executed.length, 0);
  assert.equal(h.sent.at(-1).input.length, 1);
  assert.equal(h.sent.at(-1).input[0].content, "새 계정의 합성 요청");
});

test("parallel requests are rejected and completed conversation can continue", async () => {
  let finish;
  const h = harness([() => new Promise((resolve) => { finish = resolve; }), answer()]);
  const first = h.conversation.send("첫 합성 요청", "synthetic-model");
  await assert.rejects(h.conversation.send("겹친 요청", "synthetic-model"), /현재 답변/);
  finish(answer()); await first;
  await h.conversation.send("다음 합성 요청", "synthetic-model");
  assert.equal(h.sent[1].input.length, 3);
});

test("runaway tool loop is bounded and an unsuccessful turn is not retained", async () => {
  const h = harness([...Array.from({ length: 8 }, () => call("monthly_metrics")), answer()]);
  await assert.rejects(h.conversation.send("합성 요청", "synthetic-model"), /횟수 제한/);
  assert.equal(h.sent.length, 8);
  await h.conversation.send("새 합성 요청", "synthetic-model");
  assert.equal(h.sent[8].input.length, 1);
});

test("empty output, malformed call ids and missing models fail visibly", async () => {
  const h = harness([{ output: [] }, { output: [{ type: "function_call", name: "monthly_metrics" }] }, { output: [{ type: "message", content: [] }] }]);
  await assert.rejects(h.conversation.send("합성 요청", ""), /모델/);
  await assert.rejects(h.conversation.send("합성 요청", "synthetic-model"), /완성된 답변/);
  await assert.rejects(h.conversation.send("합성 요청", "synthetic-model"), /작업 요청 형식/);
  await assert.rejects(h.conversation.send("합성 요청", "synthetic-model"), /완성된 답변/);
  assert.equal(h.executed.length, 0);
});

function preview(change) {
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  return clone(context.LedgerAgentPresentation.previewChange(change));
}

test("memo preview preserves transaction context while omitting unchanged fields and opaque refs", () => {
  const before = { ref: "synthetic-private-reference", date: "2035-02-04", merchant: "합성 가게", amount: 8400, memo: "이전 메모", incomeKind: "normal", consumption: 8400 };
  const result = preview({ fields: ["memo"], before, after: { ...before, memo: "새 메모" } });
  assert.deepEqual(result.before, { memo: "이전 메모" });
  assert.deepEqual(result.after, { memo: "새 메모" });
  assert.match(result.title, /합성 가게.*2035-02-04.*8,400원/);
  assert.ok(!JSON.stringify(result).includes("synthetic-private-reference"));
});

test("amount preview includes derived financial effects and new family fields", () => {
  const before = { amount: 8400, consumption: 8400, reimbursement: 0, incomeKind: "normal", income: 8400 };
  const after = { ...before, amount: 9200, consumption: 0, incomeKind: "familySupport", income: 0, familyTargetMonth: "2035-02" };
  const result = preview({ fields: ["amount", "incomeKind"], before, after });
  assert.equal(result.before.amount, 8400);
  assert.equal(result.after.amount, 9200);
  assert.equal(result.after.consumption, 0);
  assert.equal(result.after.income, 0);
  assert.equal(result.after.familyTargetMonth, "2035-02");
  assert.ok(!Object.hasOwn(result.after, "reimbursement"));
});

test("same-category manual override shows classification mode with Korean labels", () => {
  const before = { sector: "식비", subcategory: "장보기/마트", classificationMode: "automatic" };
  const result = preview({ fields: ["sector", "subcategory"], before, after: { ...before, classificationMode: "manual" } });
  assert.deepEqual(result.before, { classificationMode: "automatic" });
  assert.deepEqual(result.after, { classificationMode: "manual" });
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  assert.equal(context.LedgerAgentPresentation.valueText("automatic", "classificationMode"), "자동");
  assert.equal(context.LedgerAgentPresentation.valueText("manual", "classificationMode"), "직접 지정");
});

// Exercise the actual connection controls without a browser or real credentials.
function connectionHarness(route, { popupBlocked = false, tools = {} } = {}) {
  const nodes = [], calls = [], order = [], timers = new Map(), popups = [];
  let timerId = 0, clears = 0;
  class Node {
    constructor(tag) {
      this.tag = tag; this.children = []; this.events = {}; this.dataset = {}; this.value = ""; this.hidden = false; this.disabled = false; this.open = false;
      this.classList = { toggle() {} }; this._text = ""; nodes.push(this);
    }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    prepend(child) { child.parent = this; this.children.unshift(child); }
    replaceChildren(...children) { this._text = ""; this.children = []; this.append(...children); }
    remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
    showModal() { this.open = true; }
    close() { this.open = false; void this.fire("close"); }
    focus() { document.activeElement = this; }
    async fire(name, event = {}) { await Promise.all((this.events[name] || []).map((fn) => fn({ preventDefault() {}, isTrusted: true, ...event }))); }
  }
  const body = new Node("body"), trigger = new Node("button"); trigger.id = "ledgerAgentButton"; body.append(trigger);
  const document = { body, baseURI: "http://127.0.0.1:4185/", createElement: (tag) => new Node(tag),
    createTextNode: (value) => { const text = new Node("text"); text.textContent = value; return text; },
    getElementById: (id) => nodes.find((node) => node.id === id) };
  const context = vm.createContext({ console, document, URL, AbortController,
    currentMonthKey: () => "2035-03", shiftMonthKey: () => "2035-02",
    LedgerAgentTools: { definitions: [], clearSession() { clears++; }, context: () => ({ cards: [] }), ...tools },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) {
      const name = url.pathname.split("/agent-api/")[1] + url.search;
      const data = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ name, data }); order.push(name);
      const result = await route(name, data, options);
      return { ok: result?.error === undefined, status: result?.error ? 400 : 200,
        headers: { get: () => "application/json" }, json: async () => clone(result) };
    },
    open() {
      order.push("popup");
      if (popupBlocked) return null;
      const popup = { closed: false, opener: "initial", locations: [], location: { replace(value) { popup.locations.push(value); } }, close() { this.closed = true; } };
      popups.push(popup); return popup;
    }, addEventListener() {}
  });
  context.window = context;
  Object.defineProperty(context, "localStorage", { get() { throw new Error("Authentication must not touch browser storage"); } });
  vm.runInContext(source, context); context.setupLedgerAgent();
  const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
  const find = (tag, text) => nodes.find((node) => node.tag === tag && node.textContent === text);
  const labeled = (text) => nodes.find((node) => node.tag === "label" && node._text === text)?.children[0];
  return { context, calls, order, popups, timers, nodes, find, labeled, get clears() { return clears; },
    async open() { await trigger.fire("click"); await flush(); },
    async click(text) { const node = find("button", text); assert.ok(node, `button ${text}`); assert.equal(node.disabled, false); await node.fire("click"); await flush(); },
    async change(node, value) { node.value = value; await node.fire("change"); await flush(); },
    async tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); await flush(); }, flush
  };
}

function connectionStatus({ account, sharing = true, model = "", available = true, profiles = [] } = {}) {
  const current = account ? { id: account, label: `합성 계정 ${account}`, connected: true, sharing } : undefined;
  return { subscription: { available, profiles: current && !profiles.length ? [current] : profiles }, api: { available: true },
    session: { connected: Boolean(current), id: current ? `synthetic-session-${account}` : "", mode: current ? "subscription" : null,
      account: current, model, models: current ? ["synthetic-model"] : [], modelLabels: { "synthetic-model": "합성 모델" } } };
}
const authStart = { attemptId: "synthetic-attempt", authorizationUrl: "https://auth.openai.com/api/accounts/authorize?state=synthetic-state" };

test("local subscription sign-in opens on the user gesture, polls, then enables the selected account model", async () => {
  let polls = 0;
  const h = connectionHarness((name) => {
    if (name === "status") return connectionStatus();
    if (name === "subscription-login") return authStart;
    if (name.startsWith("subscription-login-status?")) return ++polls === 1 ? { status: "pending" } : { status: "complete", ...connectionStatus({ account: "a" }) };
    if (name === "model") return connectionStatus({ account: "a", model: "synthetic-model" });
    throw new Error(name);
  });
  await h.open(); await h.click("Continue with ChatGPT");
  assert.ok(h.order.indexOf("popup") < h.order.indexOf("subscription-login"));
  assert.equal(h.popups[0].opener, null);
  assert.deepEqual(h.popups[0].locations, [authStart.authorizationUrl]);
  assert.equal(h.timers.size, 1);
  assert.equal(h.labeled("가계부에 물어보기").disabled, true);
  await h.tick();
  assert.equal(h.timers.size, 0);
  assert.ok(h.find("span", "합성 계정 a · ChatGPT 구독 사용 중"));
  assert.equal(h.labeled("사용 모델").children[1].textContent, "합성 모델");
  await h.change(h.labeled("사용 모델"), "synthetic-model");
  assert.equal(h.labeled("가계부에 물어보기").disabled, false);
  assert.equal(h.find("a", "ChatGPT 사용량·앱 접근 관리").href, "https://chatgpt.com/settings/usage");
  assert.equal(h.find("a", "OpenAI 로그인 창 열기").href, undefined);
});

test("foreign authorization URL is never opened and its pending attempt is canceled", async () => {
  const h = connectionHarness((name) => name === "status" ? connectionStatus()
    : name === "subscription-login" ? { ...authStart, authorizationUrl: "https://invalid.example/api/accounts/authorize" } : {});
  await h.open(); await h.click("Continue with ChatGPT");
  assert.deepEqual(h.popups[0].locations, []);
  assert.equal(h.popups[0].closed, true);
  assert.ok(h.calls.some((item) => item.name === "subscription-cancel" && item.data.attemptId === authStart.attemptId));
  assert.ok(h.find("p", "OpenAI 로그인 주소를 확인할 수 없습니다."));
  assert.equal(h.timers.size, 0);
});

test("blocked popup offers a verified OpenAI link and never changes to API billing", async () => {
  const h = connectionHarness((name) => name === "status" ? connectionStatus()
    : name === "subscription-login" ? authStart : { status: "pending" }, { popupBlocked: true });
  await h.open(); await h.click("Continue with ChatGPT");
  const link = h.find("a", "OpenAI 로그인 창 열기");
  assert.equal(link.hidden, false); assert.equal(link.href, authStart.authorizationUrl);
  assert.equal(link.rel, "noopener noreferrer");
  assert.ok(!h.calls.some((item) => item.name === "api-session"));
});

test("cancel discards a late completed login and clears its link and polling", async () => {
  let finish;
  const h = connectionHarness((name) => name === "status" ? connectionStatus()
    : name === "subscription-login" ? authStart
      : name.startsWith("subscription-login-status?") ? new Promise((resolve) => { finish = resolve; }) : {});
  await h.open(); await h.click("Continue with ChatGPT"); await h.click("로그인 취소");
  finish({ status: "complete", ...connectionStatus({ account: "late" }) }); await h.flush();
  assert.equal(h.labeled("가계부에 물어보기").disabled, true);
  assert.equal(h.find("a", "OpenAI 로그인 창 열기").hidden, true);
  assert.ok(!h.find("span", "합성 계정 late · ChatGPT 구독 사용 중"));
  assert.equal(h.timers.size, 0);
});

test("adding another account uses a new registration and keeps the current account until validation", async () => {
  const h = connectionHarness((name) => name === "status" ? connectionStatus({ account: "existing" })
    : name === "subscription-login" ? authStart : { status: "pending" });
  await h.open(); await h.click("다른 ChatGPT 계정 추가");
  assert.deepEqual(h.calls.find((item) => item.name === "subscription-login").data, { sessionId: "synthetic-session-existing" });
  assert.ok(h.find("span", "합성 계정 existing · ChatGPT 구독 사용 중"));
  assert.equal(h.labeled("가계부에 물어보기").disabled, true);
});

test("saved account selection clears conversation and plans, with separate registrations even for equal labels", async () => {
  const profiles = ["a", "b"].map((id) => ({ id, label: `합성 계정 ${id}`, email: "synthetic@example.invalid", connected: true, sharing: true }));
  const h = connectionHarness((name) => name === "status" ? connectionStatus({ account: "a", profiles }) : connectionStatus({ account: "b", profiles }));
  await h.open();
  const before = h.clears;
  await h.change(h.labeled("저장된 ChatGPT 계정"), "b"); await h.click("선택한 계정 사용");
  assert.deepEqual(h.calls.at(-1), { name: "subscription-select", data: { profileId: "b", sessionId: "synthetic-session-a" } });
  assert.ok(h.clears > before);
  assert.ok(h.find("span", "합성 계정 b · ChatGPT 구독 사용 중"));
});

test("identity-only connection cannot use inference and reauthorization keeps the selected profile", async () => {
  const h = connectionHarness((name) => name === "status" ? connectionStatus({ account: "identity", sharing: false, model: "synthetic-model" })
    : name === "subscription-login" ? authStart : { status: "pending" });
  await h.open();
  assert.equal(h.labeled("가계부에 물어보기").disabled, true);
  await h.click("선택한 계정 다시 로그인");
  assert.deepEqual(h.calls.find((item) => item.name === "subscription-login").data, { sessionId: "synthetic-session-identity", profileId: "identity" });
});

test("closing while login creation is pending cancels the returned attempt without opening authorization", async () => {
  let finish;
  const h = connectionHarness((name) => name === "status" ? connectionStatus()
    : name === "subscription-login" ? new Promise((resolve) => { finish = resolve; }) : {});
  await h.open(); await h.click("Continue with ChatGPT");
  h.context.document.getElementById("ledgerAgentDialog").close(); await h.flush();
  finish(authStart); await h.flush();
  assert.deepEqual(h.popups[0].locations, []);
  assert.equal(h.popups[0].closed, true);
  assert.equal(h.calls.at(-1).name, "subscription-cancel");
});

test("provider denial is visible and hosted endpoints cannot start the local subscription flow", async () => {
  const h = connectionHarness((name) => name === "status" ? connectionStatus()
    : name === "subscription-login" ? authStart : { status: "error", message: "합성 로그인 거절" });
  await h.open(); await h.click("Continue with ChatGPT");
  assert.ok(h.find("p", "합성 로그인 거절"));
  assert.equal(h.labeled("가계부에 물어보기").disabled, true);
  assert.equal(h.timers.size, 0);
  const remote = connectionHarness(() => connectionStatus({ available: false }));
  await remote.open();
  assert.equal(remote.find("button", "Continue with ChatGPT").disabled, true);
});

test("cancel accepts a preauthentication session so the next login uses its current ID", async () => {
  const pendingStatus = connectionStatus(); pendingStatus.session.id = "synthetic-preauth";
  const h = connectionHarness((name) => name === "status" ? connectionStatus()
    : name === "subscription-login" ? authStart
      : name === "subscription-cancel" ? pendingStatus : { status: "pending" });
  await h.open(); await h.click("Continue with ChatGPT"); await h.click("로그인 취소");
  await h.click("Continue with ChatGPT");
  assert.equal(h.calls.filter((item) => item.name === "subscription-login").at(-1).data.sessionId, "synthetic-preauth");
});

test("login creation failure refreshes the cookie session before retry", async () => {
  let statuses = 0;
  const pendingStatus = connectionStatus(); pendingStatus.session.id = "synthetic-retry-session";
  const h = connectionHarness((name) => name === "status" ? (++statuses === 1 ? connectionStatus() : pendingStatus)
    : { error: { message: "합성 로그인 시작 실패" } });
  await h.open(); await h.click("Continue with ChatGPT");
  assert.ok(h.find("p", "합성 로그인 시작 실패"));
  await h.click("Continue with ChatGPT");
  assert.equal(h.calls.filter((item) => item.name === "subscription-login").at(-1).data.sessionId, "synthetic-retry-session");
});

test("logout shows an unconfirmed remote revocation warning while disabling inference", async () => {
  const h = connectionHarness((name) => name === "status" ? connectionStatus({ account: "a", model: "synthetic-model" })
    : { ...connectionStatus(), warning: "합성 원격 해제 확인 필요" });
  await h.open(); await h.click("ChatGPT 로그아웃");
  assert.ok(h.find("p", "합성 원격 해제 확인 필요"));
  assert.equal(h.labeled("가계부에 물어보기").disabled, true);
});

test("explicit API connection includes the current session ID and clears the key input", async () => {
  const h = connectionHarness((name) => name === "status" ? connectionStatus({ account: "a" }) : connectionStatus());
  await h.open();
  h.labeled("OpenAI API 키").value = "synthetic-key-only-for-test";
  h.nodes.find((node) => node.tag === "input" && node.type === "checkbox").checked = true;
  await h.nodes.find((node) => node.className === "agent-api-form").fire("submit"); await h.flush();
  assert.deepEqual(h.calls.at(-1), { name: "api-session", data: {
    apiKey: "synthetic-key-only-for-test", billingConsent: true, sessionId: "synthetic-session-a"
  } });
  assert.equal(h.labeled("OpenAI API 키").value, "");
});

test("verified email identifies both the active account and saved registrations without repeating an email label", async () => {
  const status = connectionStatus({ account: "a", profiles: [
    { id: "a", label: "ChatGPT 계정 1", email: "synthetic-one@example.invalid", connected: true, sharing: true },
    { id: "b", label: "synthetic-two@example.invalid", email: "synthetic-two@example.invalid", connected: true, sharing: true }
  ] });
  status.session.account = status.subscription.profiles[0];
  const h = connectionHarness(() => status);
  await h.open();
  assert.ok(h.find("span", "ChatGPT 계정 1 · synthetic-one@example.invalid · ChatGPT 구독 사용 중"));
  assert.deepEqual(h.labeled("저장된 ChatGPT 계정").children.map((item) => item.textContent), [
    "ChatGPT 계정 1 · synthetic-one@example.invalid · 구독 연결됨",
    "synthetic-two@example.invalid · 구독 연결됨"
  ]);
});

test("connection settings stay accessible until both sharing and a model are ready", async () => {
  for (const initial of [connectionStatus(), connectionStatus({ account: "a" }), connectionStatus({ account: "a", sharing: false, model: "synthetic-model" })]) {
    const h = connectionHarness(() => initial);
    await h.open();
    const settings = h.nodes.find((node) => node.className === "agent-connection");
    assert.equal(settings.tag, "details");
    assert.equal(settings.open, true);
    assert.equal(h.labeled("가계부에 물어보기").disabled, true);
    assert.equal(h.find("button", "월 비교").disabled, false);
  }
});

test("model readiness folds settings once and preserves a later manual expansion", async () => {
  let selected = false;
  const h = connectionHarness((name) => {
    if (name === "model") selected = true;
    return connectionStatus({ account: "a", model: selected ? "synthetic-model" : "" });
  });
  await h.open();
  const settings = h.nodes.find((node) => node.className === "agent-connection");
  assert.equal(settings.open, true);
  await h.change(h.labeled("사용 모델"), "synthetic-model");
  assert.equal(settings.open, false);
  assert.equal(h.context.document.activeElement, h.labeled("가계부에 물어보기"));
  assert.equal(h.context.document.activeElement.disabled, false);
  settings.open = true;
  await h.click("연결 상태 새로 확인");
  assert.equal(settings.open, true);
  assert.equal(h.labeled("가계부에 물어보기").disabled, false);
});

test("connection failure reopens settings while direct local comparisons remain usable", async () => {
  let unavailable = false;
  const executed = [];
  const h = connectionHarness(() => {
    if (unavailable) throw new Error("합성 연결 실패");
    return connectionStatus({ account: "a", model: "synthetic-model" });
  }, { tools: { async execute(name, args) { executed.push({ name, args }); return { difference: 6300 }; } } });
  await h.open();
  const settings = h.nodes.find((node) => node.className === "agent-connection");
  assert.equal(settings.open, false);
  unavailable = true;
  await h.click("연결 상태 새로 확인");
  assert.equal(settings.open, true);
  assert.ok(h.find("span", "합성 연결 실패"));
  const local = h.nodes.find((node) => node.className === "agent-local");
  assert.equal(local.tag, "details");
  assert.equal(local.open, false);
  local.open = true;
  await h.click("월 비교");
  assert.equal(executed.length, 1);
  assert.equal(executed[0].name, "compare_spending");
  const result = h.nodes.find((node) => node.className === "agent-result");
  assert.equal(result.open, true);
  assert.equal(result.parent.className, "agent-results");
});

test("AI lookup evidence stays folded in the conversation beside the answer", async () => {
  const responses = [call("monthly_metrics", { month: "2035-03" }), answer("합성 월 지표 답변")];
  const h = connectionHarness((name) => name === "status"
    ? connectionStatus({ account: "a", model: "synthetic-model" }) : responses.shift(), {
    tools: { definitions: [{ type: "function", name: "monthly_metrics" }], async execute() { return { consumption: 6300 }; } }
  });
  await h.open();
  h.labeled("가계부에 물어보기").value = "합성 월 지표 질문";
  await h.nodes.find((node) => node.className === "agent-chat").fire("submit"); await h.flush();
  const messages = h.nodes.find((node) => node.className === "agent-messages");
  const result = h.nodes.find((node) => node.className === "agent-result");
  assert.equal(result.open, false);
  assert.equal(result.parent, messages);
  assert.ok(messages.textContent.includes("합성 월 지표 답변"));
  assert.equal(h.nodes.find((node) => node.className === "agent-results").children.length, 0);
});

test("AI change previews remain expanded in the conversation and require a trusted apply click", async () => {
  let applied = 0;
  const plan = { planId: "synthetic-plan", changes: [{ fields: ["memo"], before: { memo: "합성 이전 메모" }, after: { memo: "합성 변경 메모" } }] };
  const responses = [call("propose_changes", { changes: [{ ref: "synthetic-ref", memo: "합성 변경 메모" }] }), answer("합성 수정안 준비 완료")];
  const h = connectionHarness((name) => name === "status"
    ? connectionStatus({ account: "a", model: "synthetic-model" }) : responses.shift(), {
    tools: {
      definitions: [{ type: "function", name: "propose_changes" }],
      async execute() { return { planId: plan.planId }; },
      getPlan() { return plan; },
      async applyPlan() { applied++; return { changedCount: 1 }; }
    }
  });
  await h.open();
  h.labeled("가계부에 물어보기").value = "합성 메모 수정안";
  await h.nodes.find((node) => node.className === "agent-chat").fire("submit"); await h.flush();
  const preview = h.nodes.find((node) => node.className === "agent-plan");
  assert.equal(preview.tag, "section");
  assert.equal(preview.parent.className, "agent-messages");
  for (let ancestor = preview.parent; ancestor; ancestor = ancestor.parent) {
    assert.ok(ancestor.tag !== "details" || ancestor.open, "approval preview must not be hidden inside folded evidence");
  }
  assert.ok(preview.textContent.includes("합성 이전 메모"));
  assert.ok(preview.textContent.includes("합성 변경 메모"));
  assert.equal(applied, 0);
  const apply = h.find("button", "확인한 변경 적용");
  await apply.fire("click", { isTrusted: false });
  assert.equal(applied, 0);
  await h.click("확인한 변경 적용");
  assert.equal(applied, 1);
  assert.equal(apply.disabled, true);
});
