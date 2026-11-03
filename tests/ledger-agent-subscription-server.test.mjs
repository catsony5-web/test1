import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentServer } from '../scripts/agent-server.mjs';

// Every identity, credential, URL and model response here is synthetic.
const PROFILE_A = 'synthetic-profile-alpha';
const PROFILE_B = 'synthetic-profile-beta';
const MODEL = 'synthetic-plan-model';
const API_MODEL = 'gpt-synthetic-api-model';
const API_KEY = 'synthetic-api-key-for-local-tests';
const TOOL = { type: 'function', name: 'ledger_context', parameters: { type: 'object', properties: {} } };
const COMPLETED = { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '합성 응답' }] }] };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function mockRuntime(overrides = {}) {
  const calls = [];
  const attempts = new Map();
  const profiles = new Map([PROFILE_A, PROFILE_B].map((id, index) => [id, {
    id, label: `가상 계정 ${index + 1}`, email: `synthetic-${index + 1}@example.test`, connected: true, sharing: true,
    access_token: 'synthetic-secret-must-not-be-returned', client_id: 'synthetic-client-registration'
  }]));
  const runtime = {
    calls, profiles, attempts,
    complete(id, profileId = PROFILE_A) { attempts.set(id, { status: 'complete', profileId }); },
    async listProfiles() { calls.push({ name: 'listProfiles' }); return [...profiles.values()]; },
    async getAccount(profileId) { calls.push({ name: 'getAccount', profileId }); return profiles.get(profileId); },
    async listModels(profileId) { calls.push({ name: 'listModels', profileId }); return [{ id: MODEL, label: '합성 구독 모델' }]; },
    async beginSignIn(options) {
      calls.push({ name: 'beginSignIn', ...options });
      const attemptId = `synthetic-attempt-${calls.filter((call) => call.name === 'beginSignIn').length}`;
      attempts.set(attemptId, { status: 'pending' });
      return { attemptId, authorizationUrl: `https://auth.openai.com/api/accounts/authorize?state=${attemptId}` };
    },
    async pollSignIn(attemptId) { calls.push({ name: 'pollSignIn', attemptId }); return attempts.get(attemptId) || { status: 'error', message: '합성 요청 만료' }; },
    async cancelSignIn(attemptId) { calls.push({ name: 'cancelSignIn', attemptId }); attempts.delete(attemptId); },
    async respond(profileId, body, options) { calls.push({ name: 'respond', profileId, body, signal: options.signal }); return structuredClone(COMPLETED); },
    async signOut(profileId) { calls.push({ name: 'signOut', profileId }); profiles.get(profileId).connected = false; return { revoked: true }; },
    async close() { calls.push({ name: 'close' }); },
    ...overrides
  };
  return runtime;
}

async function fixture(t, { runtime = mockRuntime(), fetchImpl, ...options } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ledger-subscription-gateway-test-'));
  await Promise.all(Object.entries({
    'index.html': '<!doctype html><title>Synthetic subscription fixture</title>',
    'service-worker.js': 'const APP_FILES = ["./"];',
    'manifest.webmanifest': '{"icons":[]}', 'app-icon.svg': '<svg></svg>', '.nojekyll': ''
  }).map(([name, value]) => writeFile(join(root, name), value)));
  const apiCalls = [];
  const server = await createAgentServer({ root, subscriptionRuntime: runtime, ...options, fetchImpl: async (url, init) => {
    apiCalls.push({ url, init });
    return fetchImpl ? fetchImpl(url, init) : Response.json(url.endsWith('/models') ? { data: [{ id: API_MODEL }] } : COMPLETED);
  } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await rm(root, { recursive: true, force: true });
  });
  const port = server.address().port;
  const origin = options.origin || `http://127.0.0.1:${port}`;
  const basePath = options.basePath || '/';
  function request(action, { method = 'GET', body, headers = {} } = {}) {
    const merged = { Host: new URL(origin).host, 'X-Ledger-Agent': '1',
      ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...headers };
    for (const [key, value] of Object.entries(merged)) if (value === undefined) delete merged[key];
    return new Promise((resolve, reject) => {
      const req = httpRequest({ hostname: '127.0.0.1', port, path: `${basePath}agent-api/${action}`, method, headers: merged }, (res) => {
        const parts = []; res.on('data', (part) => parts.push(part));
        res.on('end', () => { const text = Buffer.concat(parts).toString('utf8'); resolve({ status: res.statusCode, headers: res.headers, text, json: JSON.parse(text) }); });
      });
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  function client(cookie = '', sessionId = '') {
    return {
      cookie, sessionId,
      get: (action = 'status', headers = {}) => request(action, { headers: { Cookie: cookie, ...headers } }),
      post: (action, data = {}, headers = {}) => request(action, { method: 'POST', body: { sessionId, ...data }, headers: { Cookie: cookie, ...headers } }),
      respond: () => request('respond', { method: 'POST', headers: { Cookie: cookie }, body: { sessionId, model: MODEL, input: [{ role: 'user', content: '합성 질문' }], tools: [TOOL] } })
    };
  }
  function capture(result, prior = client()) {
    return client(result.headers['set-cookie']?.[0].split(';')[0] || prior.cookie, result.json.session?.id || prior.sessionId);
  }
  async function start(prior = client(), profileId) {
    const result = await prior.post('subscription-login', profileId ? { profileId } : {});
    assert.equal(result.status, 200, result.text);
    let pending = capture(result, prior);
    pending = capture(await pending.get(), pending);
    return { result, pending, attemptId: result.json.attemptId };
  }
  async function select(profileId = PROFILE_A, prior = client()) {
    const result = await prior.post('subscription-select', { profileId });
    assert.equal(result.status, 200, result.text);
    return capture(result, prior);
  }
  return { runtime, apiCalls, server, request, client, capture, start, select };
}

test('local availability exposes only safe profile metadata and never performs paid fallback', async (t) => {
  const f = await fixture(t);
  const result = await f.client().get();
  assert.equal(result.json.subscription.available, true);
  assert.equal(result.json.session.connected, false);
  assert.equal(result.json.subscription.profiles.length, 2);
  assert.deepEqual(Object.keys(result.json.subscription.profiles[0]).sort(), ['connected', 'email', 'id', 'label', 'sharing']);
  assert.ok(!result.text.includes('synthetic-secret'));
  assert.ok(!result.text.includes('synthetic-client-registration'));
  assert.equal(f.apiCalls.length, 0);
});

test('remote configured origin disables every subscription path without invoking local runtime', async (t) => {
  const f = await fixture(t, { origin: 'https://synthetic-ledger.example.test' });
  const c = f.client();
  const state = await c.get();
  assert.deepEqual(state.json.subscription, { available: false, reason: 'approval_required' });
  for (const action of ['subscription-login', 'subscription-select', 'subscription-cancel']) assert.equal((await c.post(action, { profileId: PROFILE_A, attemptId: 'synthetic-attempt' })).status, 403);
  assert.equal((await c.get('subscription-login-status?attemptId=synthetic-attempt')).status, 409);
  assert.equal(f.runtime.calls.length, 0);
});

test('OAuth start and pending poll preserve a separate unauthenticated browser context', async (t) => {
  const f = await fixture(t);
  const login = await f.start();
  assert.match(login.result.json.authorizationUrl, /^https:\/\/auth\.openai\.com\/api\/accounts\/authorize\?/);
  assert.ok(login.pending.cookie && login.pending.sessionId);
  const state = await login.pending.get();
  assert.equal(state.json.session.connected, false);
  assert.equal(state.json.session.mode, null);
  assert.equal((await login.pending.get(`subscription-login-status?attemptId=${login.attemptId}`)).json.status, 'pending');
  assert.equal((await login.pending.respond()).status, 400);
});

test('successful login rotates its browser session, selects no implicit model and routes inference through subscription', async (t) => {
  const f = await fixture(t);
  const login = await f.start(); f.runtime.complete(login.attemptId);
  const result = await login.pending.get(`subscription-login-status?attemptId=${login.attemptId}`);
  assert.equal(result.status, 200, result.text);
  const c = f.capture(result);
  assert.notEqual(c.cookie, login.pending.cookie);
  assert.notEqual(c.sessionId, login.pending.sessionId);
  assert.equal(result.json.session.mode, 'subscription');
  assert.equal(result.json.session.account.id, PROFILE_A);
  assert.equal(result.json.session.model, '');
  assert.deepEqual(result.json.session.models, [MODEL]);
  assert.equal(result.json.session.modelLabels[MODEL], '합성 구독 모델');
  assert.equal((await c.post('model', { model: MODEL })).status, 200);
  assert.equal((await c.respond()).status, 200);
  const request = f.runtime.calls.find((call) => call.name === 'respond');
  assert.equal(request.profileId, PROFILE_A);
  assert.equal(request.body.store, false);
  assert.equal(request.body.model, MODEL);
  assert.ok(request.body.instructions.includes('propose_changes'));
  assert.equal(request.signal.aborted, false);
  assert.equal(f.apiCalls.length, 0);
});

test('login poll and cancellation are bound to the initiating browser cookie', async (t) => {
  const f = await fixture(t);
  const login = await f.start();
  const stranger = f.client();
  assert.equal((await stranger.get(`subscription-login-status?attemptId=${login.attemptId}`)).status, 409);
  assert.equal((await stranger.post('subscription-cancel', { attemptId: login.attemptId })).status, 409);
  assert.ok(f.runtime.attempts.has(login.attemptId));
  assert.equal((await login.pending.post('subscription-cancel', { attemptId: login.attemptId })).status, 200);
  assert.equal((await login.pending.get(`subscription-login-status?attemptId=${login.attemptId}`)).status, 409);
});

test('new subscription endpoints preserve origin and custom-header protections', async (t) => {
  const f = await fixture(t);
  const c = f.client();
  for (const action of ['subscription-login', 'subscription-select', 'subscription-cancel']) {
    assert.equal((await c.post(action, { profileId: PROFILE_A }, { Origin: 'https://foreign.example.test' })).status, 403);
    assert.equal((await c.post(action, { profileId: PROFILE_A }, { 'X-Ledger-Agent': undefined })).status, 403);
  }
  assert.equal((await c.get('subscription-login-status?attemptId=synthetic', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(f.runtime.calls.length, 0);
});

test('concurrent completion polls activate once and later polls do not rotate the session again', async (t) => {
  const started = deferred(), bothPolling = deferred(), release = deferred();
  const runtime = mockRuntime();
  runtime.listModels = async (profileId) => { runtime.calls.push({ name: 'listModels', profileId }); started.resolve(); await release.promise; return [{ id: MODEL, label: '합성 모델' }]; };
  runtime.pollSignIn = async (attemptId) => {
    runtime.calls.push({ name: 'pollSignIn', attemptId });
    if (runtime.calls.filter((call) => call.name === 'pollSignIn').length === 2) bothPolling.resolve();
    return runtime.attempts.get(attemptId);
  };
  const f = await fixture(t, { runtime });
  const login = await f.start(); runtime.complete(login.attemptId);
  const first = login.pending.get(`subscription-login-status?attemptId=${login.attemptId}`);
  await started.promise;
  const second = login.pending.get(`subscription-login-status?attemptId=${login.attemptId}`);
  await bothPolling.promise;
  release.resolve();
  const results = await Promise.all([first, second]);
  for (const result of results) assert.equal(result.status, 200, result.text);
  assert.equal(results[0].json.session.id, results[1].json.session.id);
  assert.equal(runtime.calls.filter((call) => call.name === 'listModels').length, 1);
  const c = f.capture(results[0]);
  const repeated = await c.get(`subscription-login-status?attemptId=${login.attemptId}`);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.json.session.id, c.sessionId);
  assert.equal(repeated.headers['set-cookie'], undefined);
});

test('cancel, logout, API connection and saved-account selection invalidate an older pending login', async (t) => {
  for (const mutation of ['cancel', 'logout', 'api', 'select']) await t.test(mutation, async (t) => {
    const f = await fixture(t);
    const login = await f.start();
    let changed;
    if (mutation === 'cancel') changed = await login.pending.post('subscription-cancel', { attemptId: login.attemptId });
    if (mutation === 'logout') changed = await login.pending.post('logout');
    if (mutation === 'api') changed = await login.pending.post('api-session', { apiKey: API_KEY, billingConsent: true });
    if (mutation === 'select') changed = await login.pending.post('subscription-select', { profileId: PROFILE_B });
    assert.equal(changed.status, 200, changed.text);
    f.runtime.complete(login.attemptId);
    assert.equal((await login.pending.get(`subscription-login-status?attemptId=${login.attemptId}`)).status, 409);
    if (mutation === 'api' || mutation === 'select') {
      const c = f.capture(changed);
      const state = await c.get();
      assert.equal(state.json.session.id, c.sessionId);
      assert.equal(state.json.session.mode, mutation === 'api' ? 'api' : 'subscription');
    }
    assert.ok(f.runtime.calls.some((call) => call.name === 'cancelSignIn' && call.attemptId === login.attemptId));
  });
});

test('in-flight activation cannot overwrite a later selected account', async (t) => {
  const started = deferred(), release = deferred();
  const runtime = mockRuntime();
  runtime.listModels = async (profileId) => { if (profileId === PROFILE_A) { started.resolve(); await release.promise; } return [{ id: MODEL, label: '합성 모델' }]; };
  const f = await fixture(t, { runtime });
  const login = await f.start(); runtime.complete(login.attemptId);
  const pending = login.pending.get(`subscription-login-status?attemptId=${login.attemptId}`);
  await started.promise;
  const selected = await f.select(PROFILE_B, login.pending);
  release.resolve();
  assert.equal((await pending).status, 409);
  assert.equal((await selected.get()).json.session.account.id, PROFILE_B);
});

test('stale tab IDs cannot start, select or log out the current subscription session', async (t) => {
  const f = await fixture(t);
  const first = await f.select();
  const second = await f.select(PROFILE_B, first);
  const stale = f.client(second.cookie, first.sessionId);
  for (const action of ['subscription-login', 'subscription-select', 'logout']) assert.equal((await stale.post(action, { profileId: PROFILE_A })).status, 409);
  assert.equal((await second.get()).json.session.account.id, PROFILE_B);
});

test('identity-only consent exposes no models and cannot be used for inference', async (t) => {
  const runtime = mockRuntime(); runtime.profiles.get(PROFILE_A).sharing = false;
  const f = await fixture(t, { runtime });
  const c = await f.select();
  const state = await c.get();
  assert.equal(state.json.session.account.sharing, false);
  assert.deepEqual(state.json.session.models, []);
  assert.equal((await c.post('model', { model: MODEL })).status, 400);
  assert.equal((await c.respond()).status, 400);
  assert.equal(runtime.calls.filter((call) => ['listModels', 'respond'].includes(call.name)).length, 0);
  assert.equal(f.apiCalls.length, 0);
});

test('login timeout and provider failure return a recoverable state without activating an account', async (t) => {
  let clock = 1_000_000;
  const f = await fixture(t, { now: () => clock });
  const login = await f.start(); clock += 11 * 60 * 1000;
  assert.equal((await login.pending.get(`subscription-login-status?attemptId=${login.attemptId}`)).status, 408);
  assert.equal((await login.pending.get()).json.session.connected, false);
  const retry = await f.start(login.pending);
  f.runtime.attempts.set(retry.attemptId, { status: 'error', message: '합성 인증 거절' });
  const failed = await retry.pending.get(`subscription-login-status?attemptId=${retry.attemptId}`);
  assert.equal(failed.json.status, 'error');
  assert.equal(failed.json.message, '합성 인증 거절');
  assert.equal((await retry.pending.get()).json.session.connected, false);
});

test('only completed subscription responses and allowed tools can reach the browser', async (t) => {
  for (const reply of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ type: 'function_call', name: 'apply_changes', call_id: 'synthetic-call', arguments: '{}' }] }
  ]) await t.test(reply.status === 'incomplete' ? 'incomplete stream' : 'apply tool', async (t) => {
    const runtime = mockRuntime({ respond: async () => reply });
    const f = await fixture(t, { runtime }); const c = await f.select();
    await c.post('model', { model: MODEL });
    assert.equal((await c.respond()).status, 502);
    assert.equal(f.apiCalls.length, 0);
  });
});

test('logout reports unconfirmed remote revocation and clears local browser sessions', async (t) => {
  const runtime = mockRuntime({ signOut: async () => ({ revoked: false }) });
  const f = await fixture(t, { runtime }); const c = await f.select();
  const result = await c.post('logout');
  assert.equal(result.status, 200);
  assert.match(result.json.warning, /확인되지/);
  assert.equal(result.json.session.connected, false);
  assert.match(result.headers['set-cookie'][0], /Max-Age=0/);
  assert.equal((await c.respond()).status, 401);
});

test('an older API connection cannot replace a subscription selected while API validation awaited', async (t) => {
  const started = deferred(), release = deferred();
  const f = await fixture(t, { fetchImpl: async () => { started.resolve(); await release.promise; return Response.json({ data: [{ id: API_MODEL }] }); } });
  const first = await f.select();
  const oldConnection = first.post('api-session', { apiKey: API_KEY, billingConsent: true });
  await started.promise;
  const second = await f.select(PROFILE_B, first);
  release.resolve();
  const stale = await oldConnection;
  assert.equal(stale.status, 409, stale.text);
  assert.equal(stale.headers['set-cookie'], undefined);
  assert.equal((await second.get()).json.session.account.id, PROFILE_B);
});

test('logout blocks new requests from every browser session using the same account while revocation waits', async (t) => {
  const started = deferred(), release = deferred();
  const runtime = mockRuntime();
  runtime.signOut = async () => { started.resolve(); await release.promise; return { revoked: true }; };
  const f = await fixture(t, { runtime });
  const first = await f.select(); const second = await f.select();
  await second.post('model', { model: MODEL });
  const logout = first.post('logout'); await started.promise;
  const result = await second.respond();
  release.resolve(); await logout;
  assert.ok([401, 409].includes(result.status), result.text);
  assert.equal(runtime.calls.filter((call) => call.name === 'respond').length, 0);
});

test('history rejects a foreign namespace even when its function name is allowed', async (t) => {
  const f = await fixture(t); const c = await f.select();
  await c.post('model', { model: MODEL });
  const result = await c.post('respond', {
    model: MODEL, tools: [TOOL], input: [
      { role: 'user', content: '합성 질문' },
      { type: 'function_call', namespace: 'synthetic_foreign', name: 'ledger_context', call_id: 'synthetic-call', arguments: '{}' }
    ]
  });
  assert.equal(result.status, 400);
  assert.equal(result.json.error.code, 'invalid_tool');
  assert.equal(f.runtime.calls.filter((call) => call.name === 'respond').length, 0);
});

test('provider output rejects a foreign namespace even when its function name is allowed', async (t) => {
  const runtime = mockRuntime({ respond: async () => ({ status: 'completed', output: [
    { type: 'function_call', namespace: 'synthetic_foreign', name: 'ledger_context', call_id: 'synthetic-call', arguments: '{}' }
  ] }) });
  const f = await fixture(t, { runtime }); const c = await f.select();
  await c.post('model', { model: MODEL });
  const result = await c.respond();
  assert.equal(result.status, 502);
  assert.equal(result.json.error.code, 'invalid_tool');
  assert.equal(result.json.output, undefined);
});

test('the ledger namespace is preserved in provider output and the next request history', async (t) => {
  const toolCall = { type: 'function_call', namespace: 'ledger', name: 'ledger_context', call_id: 'synthetic-namespaced-call', arguments: '{}' };
  const runtime = mockRuntime();
  runtime.respond = async (profileId, body) => {
    runtime.calls.push({ name: 'respond', profileId, body });
    return runtime.calls.filter((call) => call.name === 'respond').length === 1
      ? { status: 'completed', output: [toolCall] } : structuredClone(COMPLETED);
  };
  const f = await fixture(t, { runtime }); const c = await f.select();
  await c.post('model', { model: MODEL });
  const first = await c.respond();
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.output, [toolCall]);
  const input = [{ role: 'user', content: '합성 질문' }, ...first.json.output,
    { type: 'function_call_output', call_id: toolCall.call_id, output: '{"synthetic":true}' }];
  const second = await c.post('respond', { model: MODEL, tools: [TOOL], input });
  assert.equal(second.status, 200);
  assert.deepEqual(runtime.calls.filter((call) => call.name === 'respond').at(-1).body.input, input);
  assert.equal(f.apiCalls.length, 0);
});
