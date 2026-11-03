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
