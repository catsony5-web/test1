import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createChatGPTLocal, ChatGPTLocalError } from '../scripts/lib/chatgpt-local.mjs';

// Invented account metadata and tokens. No real account or paid request is used.
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'synthetic-signing-key', use: 'sig', alg: 'RS256' };
const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const scopes = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const clone = (value) => structuredClone(value);
const completeResponse = { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '가상 응답' }] }] };
const sse = (data) => `data: ${JSON.stringify(data)}\r\n\r\n`;

async function setup(t, options = {}) {
  const state = { saved: options.saved ? clone(options.saved) : null, writes: [], calls: [], tick: Date.UTC(2040, 0, 1),
    nonce: '', tokens: 0, refreshes: 0, models: 0, jwks: 0, revoke: 0, response: null, tokenGate: null,
    invalid: null, scope: scopes, failKeys: false, revokeStatus: 200, deniedToken: false, subject: 'synthetic-subject-a' };
  const jwt = (nonce, audience = 'oaiapp_synthetic_a', changes = {}) => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ iss: issuer, aud: audience, sub: state.subject, email: 'synthetic@example.invalid',
      iat: state.tick / 1000, exp: state.tick / 1000 + 3600, ...(nonce ? { nonce } : {}), ...changes })).toString('base64url');
    return `${h}.${p}.${sign('RSA-SHA256', Buffer.from(`${h}.${p}`), keys.privateKey).toString('base64url')}`;
  };
  const store = {
    async read() { return clone(state.saved); },
    async write(value, beforeCommit = () => {}) { beforeCommit(); state.saved = clone(value); state.writes.push(clone(value)); },
    async close() { state.closed = true; }
  };
  async function providerFetch(url, init = {}) {
    state.calls.push({ url: String(url), init });
    assert.equal(init.redirect, 'error');
    if (String(url).endsWith('/.well-known/openid-configuration')) return Response.json({ issuer,
      authorization_endpoint: `${issuer}/api/accounts/authorize`, token_endpoint: `${issuer}/api/accounts/oauth/token`,
      revocation_endpoint: `${issuer}/api/accounts/oauth/revoke`, jwks_uri: `${issuer}/.well-known/jwks.json` });
    if (String(url).endsWith('/.well-known/jwks.json')) { state.jwks++; return state.failKeys ? new Response('', { status: 503 }) : Response.json({ keys: [jwk] }); }
    if (String(url).endsWith('/oauth/token')) {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('resource'), resource);
      state.tokens++;
      const refresh = body.get('grant_type') === 'refresh_token';
      if (refresh) state.refreshes++;
      if (state.tokenGate) await state.tokenGate;
      if (state.deniedToken) return Response.json({ error: 'invalid_grant', error_description: 'synthetic-secret-never-show' }, { status: 400 });
      let idToken = jwt(refresh ? null : state.nonce, body.get('client_id'), state.invalid || {});
      if (state.invalid === 'signature') idToken = `${idToken.slice(0, -8)}AAAAAAAA`;
      return Response.json({ access_token: refresh ? 'synthetic-rotated-access' : 'synthetic-access',
        refresh_token: refresh ? 'synthetic-rotated-refresh' : 'synthetic-refresh',
        id_token: idToken, token_type: 'Bearer', expires_in: 120, ...(refresh ? {} : { scope: state.scope }) });
    }
    if (String(url).endsWith('/models')) {
      state.models++;
      return Response.json({ models: [{ slug: 'synthetic-model-a', display_name: '가상 모델', visibility: 'list' },
        { slug: 'synthetic-hidden', visibility: 'hide' }, { slug: 'synthetic-model-a', visibility: 'list' }] });
    }
    if (String(url).endsWith('/responses')) {
      if (typeof state.response === 'function') return state.response(init);
      return new Response(state.response ?? sse({ type: 'response.completed', response: completeResponse }), { headers: { 'content-type': 'text/event-stream' } });
    }
    if (String(url).endsWith('/oauth/revoke')) { state.revoke++; return new Response('', { status: state.revokeStatus }); }
    throw new Error('Unexpected provider URL');
  }
  const runtime = await createChatGPTLocal({ store, fetchImpl: providerFetch, now: () => state.tick, signInTimeoutMs: 5000 });
  t.after(() => runtime.close());
  async function begin(profileId) {
    const attempt = await runtime.beginSignIn(profileId ? { profileId } : {});
    const url = new URL(attempt.authorizationUrl);
    state.nonce = url.searchParams.get('nonce');
    const callback = new URL(url.searchParams.get('redirect_uri'));
    callback.searchParams.set('state', url.searchParams.get('state'));
    callback.searchParams.set('code', 'synthetic-code');
    callback.searchParams.set('client_id', profileId ? state.saved.profiles.find((p) => p.id === profileId).clientId : 'oaiapp_synthetic_a');
    return { ...attempt, url, callback };
  }
  async function settled(attempt) {
    for (let i = 0; i < 500; i++) {
      const result = runtime.pollSignIn(attempt.attemptId);
      if (result.status !== 'pending') return result;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error('Callback did not settle');
  }
  async function login(profileId) {
    const attempt = await begin(profileId);
    assert.equal((await fetch(attempt.callback)).status, 200);
    return settled(attempt);
  }
  return { runtime, state, begin, settled, login, jwt };
}

test('first registration uses real loopback, stable host identity, fresh PKCE/state/nonce and no token hints', async (t) => {
  const { runtime, state, begin } = await setup(t);
  const first = await begin();
  assert.equal(first.url.origin, issuer);
  assert.equal(first.url.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(first.url.searchParams.get('agent_name_hint'), '소비 분석 가계부');
  assert.equal(first.callback.hostname, '127.0.0.1');
  assert.equal(first.callback.pathname, '/auth/callback');
  assert.equal(first.url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(first.url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.url.searchParams.get('ext_agent_host_id'), state.saved.hostId);
  assert.equal(first.url.searchParams.get('id_token_hint'), null);
  assert.equal(first.url.searchParams.get('login_hint'), null);
  await assert.rejects(runtime.beginSignIn(), (error) => error.code === 'busy');
  runtime.cancelSignIn(first.attemptId);
  const next = await begin();
  assert.notEqual(next.url.searchParams.get('state'), first.url.searchParams.get('state'));
  assert.notEqual(next.url.searchParams.get('nonce'), first.url.searchParams.get('nonce'));
  assert.equal(next.url.searchParams.get('ext_agent_host_id'), first.url.searchParams.get('ext_agent_host_id'));
});

test('forged or duplicate state never consumes the valid authorization attempt', async (t) => {
  const { runtime, state, begin, settled } = await setup(t);
  const attempt = await begin();
  const wrong = new URL(attempt.callback); wrong.searchParams.set('state', 'synthetic-wrong');
  assert.equal((await fetch(wrong)).status, 400);
  const duplicate = new URL(attempt.callback); duplicate.searchParams.append('state', 'synthetic-duplicate');
  assert.equal((await fetch(duplicate)).status, 400);
  assert.equal(state.tokens, 0);
  assert.equal(runtime.pollSignIn(attempt.attemptId).status, 'pending');
  assert.equal((await fetch(attempt.callback)).status, 200);
  assert.equal((await settled(attempt)).status, 'complete');
});

test('validated login exposes safe metadata only and includes a real plan permission check', async (t) => {
  const { runtime, state, login } = await setup(t);
  const result = await login();
  assert.equal(result.status, 'complete');
  const account = await runtime.getAccount(result.profileId);
  assert.equal(account.connected, true); assert.equal(account.sharing, true);
  assert.equal(account.email, 'synthetic@example.invalid');
  assert.doesNotMatch(JSON.stringify(await runtime.listProfiles()), /synthetic-access|synthetic-refresh|clientId|idToken|subject/);
  assert.equal(state.saved.profiles[0].credentials.accessToken, 'synthetic-access');
  assert.equal(state.saved.profiles[0].clientId, 'oaiapp_synthetic_a');
});

test('denied consent validates state and never exchanges credentials', async (t) => {
  const { state, begin, settled } = await setup(t);
  const attempt = await begin(); attempt.callback.searchParams.set('error', 'access_denied');
  await fetch(attempt.callback);
  assert.equal((await settled(attempt)).code, 'access_denied');
  assert.equal(state.tokens, 0); assert.equal(state.saved.profiles.length, 0);
});

for (const [name, invalid] of [
  ['signature', 'signature'], ['issuer', { iss: 'https://attacker.invalid' }], ['audience', { aud: 'wrong-client' }],
  ['nonce', { nonce: 'wrong-nonce' }], ['expired', { exp: 1 }], ['future issue time', { iat: Date.UTC(2099, 1, 1) / 1000 }],
  ['authorized party', { azp: 'another-client' }], ['multiple audiences without authorized party', { aud: ['oaiapp_synthetic_a', 'other'] }]
]) test(`ID token verification rejects invalid ${name}`, async (t) => {
  const { runtime, state, login } = await setup(t); state.invalid = invalid;
  const result = await login();
  assert.equal(result.status, 'error'); assert.equal(result.code, 'invalid_id_token');
  assert.equal((await runtime.getAccount(result.profileId)).connected, false);
  assert.equal(state.saved.profiles[0].credentials, null);
});

test('failed exchange retains issued registration; retry reuses client and rejects mismatched returning client', async (t) => {
  const { runtime, state, login, begin, settled } = await setup(t);
  state.deniedToken = true;
  const failed = await login();
  assert.equal(failed.code, 'invalid_grant');
  assert.doesNotMatch(failed.message, /synthetic-secret/);
  state.deniedToken = false;
  const retry = await begin(failed.profileId);
  assert.equal(retry.url.searchParams.get('client_id'), 'oaiapp_synthetic_a');
  assert.equal(retry.url.searchParams.get('agent_name_hint'), null);
  retry.callback.searchParams.set('client_id', 'oaiapp_different');
  await fetch(retry.callback);
  assert.equal((await settled(retry)).status, 'error');
  assert.equal(state.tokens, 1);
  assert.equal((await runtime.listProfiles()).length, 1);
});

test('returning verified identity cannot overwrite another registered account', async (t) => {
  const { runtime, state, login } = await setup(t);
  const first = await login(); const previous = clone(state.saved.profiles[0]);
  state.subject = 'synthetic-subject-b';
  const second = await login(first.profileId);
  assert.equal(second.code, 'account_mismatch');
  assert.deepEqual(state.saved.profiles[0], previous);
  assert.equal((await runtime.getAccount(first.profileId)).connected, true);
});

test('cancel during code exchange cannot save late credentials or activate the attempt', async (t) => {
  const { runtime, state, begin } = await setup(t);
  let release; state.tokenGate = new Promise((resolve) => { release = resolve; });
  const attempt = await begin(); await fetch(attempt.callback);
  while (!state.tokens) await new Promise((resolve) => setTimeout(resolve, 1));
  runtime.cancelSignIn(attempt.attemptId); release();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(runtime.pollSignIn(attempt.attemptId).code, 'cancelled');
  assert.equal(state.saved.profiles[0].credentials, null);
});

test('identity-only consent does not enable model or inference requests', async (t) => {
  const { runtime, state, login } = await setup(t); state.scope = 'openid email offline_access';
  const account = await login();
  assert.equal((await runtime.getAccount(account.profileId)).sharing, false);
  await assert.rejects(runtime.listModels(account.profileId), (error) => error.code === 'sharing_not_enabled');
  assert.equal(state.models, 0);
});

test('model catalog keeps eligible ordering and labels; streaming returns tool calls only on completion', async (t) => {
  const { runtime, state, login } = await setup(t);
  const account = await login();
  assert.deepEqual(await runtime.listModels(account.profileId), [{ id: 'synthetic-model-a', label: '가상 모델' }]);
  const completed = { status: 'completed', output: [{ type: 'function_call', name: 'monthly_metrics', call_id: 'synthetic-call', arguments: '{}' }] };
  state.response = sse({ type: 'response.output_text.delta', delta: '가상' }) + sse({ type: 'response.completed', response: completed });
  assert.deepEqual(await runtime.respond(account.profileId, { model: 'synthetic-model-a', input: [{ role: 'user', content: '가상 조회' }], store: true, stream: false }), completed);
  const call = state.calls.find((item) => item.url.endsWith('/responses'));
  const payload = JSON.parse(call.init.body);
  assert.equal(payload.store, false); assert.equal(payload.stream, true);
  assert.equal(call.init.headers.Authorization, 'Bearer synthetic-access');
});

test('ChatGPT plan requests namespace ledger tools and omit unsupported API fields without changing tool history', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login();
  const tools = [{ type: 'function', name: 'monthly_metrics', description: '가상 지표', strict: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false } }];
  const history = [{ role: 'user', content: '가상 지표 요청' },
    { type: 'function_call', namespace: 'ledger', name: 'monthly_metrics', call_id: 'synthetic-call', arguments: '{}' },
    { type: 'function_call_output', call_id: 'synthetic-call', output: '{"synthetic":true}' }];
  const payload = { model: 'synthetic-model-a', input: history, tools, instructions: '가상 안내',
    include: ['reasoning.encrypted_content'], max_output_tokens: 4096, temperature: 0.1,
    previous_response_id: 'synthetic-previous-response', store: true, stream: false };
  const original = clone(payload);
  await runtime.respond(account.profileId, payload);
  const call = state.calls.find((item) => item.url.endsWith('/responses'));
  const sent = JSON.parse(call.init.body);
  assert.deepEqual(sent.tools, [{ type: 'namespace', name: 'ledger',
    description: '현재 가계부의 조회, 지표 계산과 사용자 확인을 위한 변경 제안 도구입니다.', tools }]);
  assert.deepEqual(sent.input, history); assert.deepEqual(payload, original);
  assert.deepEqual(sent.include, ['reasoning.encrypted_content']);
  assert.equal(sent.store, false); assert.equal(sent.stream, true);
  for (const field of ['max_output_tokens', 'temperature', 'previous_response_id']) assert.equal(Object.hasOwn(sent, field), false);
  await assert.rejects(runtime.respond(account.profileId, { ...payload, input: 'not an array' }), ChatGPTLocalError);
});

for (const [name, stream, code] of [
  ['interruption', sse({ type: 'response.output_text.delta', delta: 'partial' }), 'invalid_stream'],
  ['incomplete', sse({ type: 'response.incomplete', response: { output: [] } }), 'invalid_stream'],
  ['late usage limit', sse({ type: 'response.output_text.delta', delta: 'partial' }) + sse({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'synthetic-private-diagnostic' } } }), 'subscription_sharing_usage_limit_exceeded'],
  ['malformed JSON', 'data: {broken}\n\n', 'invalid_stream']
]) test(`stream ${name} is not reported as successful inference`, async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login(); state.response = stream;
  await assert.rejects(runtime.respond(account.profileId, { model: 'synthetic-model-a' }), (error) => error.code === code && !error.message.includes('synthetic-private'));
});

test('stream parser handles UTF-8 and CRLF split across chunk boundaries', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login();
  const bytes = Buffer.from(sse({ type: 'response.completed', response: completeResponse }));
  state.response = () => new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
  assert.deepEqual(await runtime.respond(account.profileId, { model: 'synthetic-model-a' }), completeResponse);
});

test('empty terminal output recovers ordered completed items and preserves response metadata', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login();
  const reasoning = { type: 'reasoning', id: 'synthetic-reasoning', summary: [], encrypted_content: 'synthetic-encrypted-content' };
  const message = { ...completeResponse.output[0], id: 'synthetic-message', status: 'completed' };
  const terminal = { id: 'synthetic-response', status: 'completed', output: [], usage: { output_tokens: 17 } };
  const bytes = Buffer.from(sse({ type: 'response.output_text.delta', delta: 'partial text must not be repeated' })
    + sse({ type: 'response.output_item.done', output_index: 1, item: message })
    + sse({ type: 'response.output_item.done', output_index: 0, item: reasoning })
    + sse({ type: 'response.completed', response: terminal }));
  state.response = () => new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
  assert.deepEqual(await runtime.respond(account.profileId, { model: 'synthetic-model-a' }), { ...terminal, output: [reasoning, message] });
});

test('repeated completed tool items produce one intact call and do not duplicate populated terminal output', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login();
  const call = { type: 'function_call', id: 'synthetic-item', status: 'completed', namespace: 'ledger',
    name: 'monthly_metrics', call_id: 'synthetic-call', arguments: '{"synthetic":true}' };
  const done = { type: 'response.output_item.done', output_index: 0, item: call };
  for (const output of [[], [call]]) {
    state.response = sse(done) + sse({ ...done, item: Object.fromEntries(Object.entries(call).reverse()) })
      + sse({ type: 'response.completed', response: { status: 'completed', output } });
    const result = await runtime.respond(account.profileId, { model: 'synthetic-model-a' });
    assert.deepEqual(result.output, [call]);
  }
  state.response = sse(done) + sse({ type: 'response.completed', response: completeResponse });
  assert.deepEqual(await runtime.respond(account.profileId, { model: 'synthetic-model-a' }), completeResponse);
});

test('completed item recovery rejects invalid indexes, conflicting duplicates and repeated call identities', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login();
  const item = { ...completeResponse.output[0], id: 'synthetic-item', status: 'completed' };
  const done = (output_index, value = item) => ({ type: 'response.output_item.done', output_index, item: value });
  const call = { type: 'function_call', id: 'synthetic-call-item', namespace: 'ledger', name: 'monthly_metrics', call_id: 'synthetic-call', arguments: '{}' };
  const cases = [
    ['negative index', [done(-1)]], ['fractional index', [done(0.5)]], ['string index', [done('0')]],
    ['unsafe index', [done(Number.MAX_SAFE_INTEGER + 1)]], ['missing zero', [done(1)]],
    ['index gap', [done(0), done(2, { ...item, id: 'synthetic-other-item' })]],
    ['conflicting duplicate', [done(0), done(0, { ...item, content: [] })]],
    ['same item at different indexes', [done(0), done(1)]],
    ['same call at different indexes', [done(0, call), done(1, { ...call, id: 'synthetic-other-call-item' })]],
    ['missing call identity', [done(0, { ...call, call_id: undefined })]],
    ['malformed item', [done(0, null)]], ['unfinished item', [done(0, { ...item, status: 'in_progress' })]]
  ];
  for (const [name, events] of cases) {
    state.response = events.map(sse).join('') + sse({ type: 'response.completed', response: { status: 'completed', output: [] } });
    await assert.rejects(runtime.respond(account.profileId, { model: 'synthetic-model-a' }), (error) => error.code === 'invalid_stream', name);
  }
});

test('completed items are not returned after a failed, incomplete, interrupted or empty stream', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login();
  const done = sse({ type: 'response.output_item.done', output_index: 0, item: completeResponse.output[0] });
  const empty = sse({ type: 'response.completed', response: { status: 'completed', output: [] } });
  for (const [name, stream, code] of [
    ['empty completion', empty, 'invalid_stream'],
    ['delta without completed item', sse({ type: 'response.output_text.delta', delta: 'partial' }) + empty, 'invalid_stream'],
    ['end without completion', done, 'invalid_stream'],
    ['incomplete after item', done + sse({ type: 'response.incomplete', response: { output: [] } }), 'invalid_stream'],
    ['failed after item', done + sse({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }), 'subscription_sharing_usage_limit_exceeded'],
    ['error after item', done + sse({ type: 'error', error: { code: 'subscription_sharing_usage_limit_exceeded' } }), 'subscription_sharing_usage_limit_exceeded']
  ]) {
    state.response = stream;
    await assert.rejects(runtime.respond(account.profileId, { model: 'synthetic-model-a' }), (error) => error.code === code, name);
  }
});

test('cancellation after a completed item rejects without returning the collected output', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login();
  const caller = new AbortController();
  let waiting; const waitingForCompletion = new Promise((resolve) => { waiting = resolve; });
  const done = new TextEncoder().encode(sse({ type: 'response.output_item.done', output_index: 0, item: completeResponse.output[0] }));
  state.response = (init) => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(done);
    init.signal.addEventListener('abort', () => controller.error(new Error('synthetic-private-abort')), { once: true });
  }, pull() { waiting(); } }), { headers: { 'content-type': 'text/event-stream' } });
  const reply = runtime.respond(account.profileId, { model: 'synthetic-model-a' }, { signal: caller.signal });
  const rejection = assert.rejects(reply, (error) => error.code === 'cancelled' && !error.message.includes('synthetic-private'));
  await waitingForCompletion; caller.abort(); await rejection;
});

test('concurrent requests serialize rotating refresh and save replacement credentials together', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login(); state.tick += 90000;
  await Promise.all([runtime.listModels(account.profileId), runtime.listModels(account.profileId)]);
  assert.equal(state.refreshes, 1);
  assert.equal(state.saved.profiles[0].credentials.refreshToken, 'synthetic-rotated-refresh');
  assert.equal(state.saved.profiles[0].credentials.accessToken, 'synthetic-rotated-access');
  const refresh = state.calls.find((item) => item.url.endsWith('/oauth/token') && String(item.init.body).includes('grant_type=refresh_token'));
  assert.equal(new URLSearchParams(refresh.init.body).get('client_id'), 'oaiapp_synthetic_a');
  assert.equal(new URLSearchParams(refresh.init.body).has('scope'), false);
});

test('key-service failure preserves refresh checkpoint and verifies it before reuse without rotating twice', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login(); state.tick += 90000; state.failKeys = true;
  await assert.rejects(runtime.listModels(account.profileId), (error) => error.code === 'network_error');
  assert.ok(state.saved.profiles[0].pendingRefresh);
  assert.equal(state.models, 0);
  state.failKeys = false;
  await runtime.listModels(account.profileId);
  assert.equal(state.refreshes, 1); assert.equal(state.saved.profiles[0].pendingRefresh, undefined);
  assert.equal(state.saved.profiles[0].credentials.refreshToken, 'synthetic-rotated-refresh');
});

test('invalid refreshed identity clears unusable tokens and requires explicit sign-in', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login(); state.tick += 90000; state.subject = 'synthetic-other-subject';
  await assert.rejects(runtime.listModels(account.profileId), (error) => error.code === 'account_mismatch');
  assert.equal((await runtime.getAccount(account.profileId)).connected, false);
  assert.equal(state.saved.profiles[0].credentials, null); assert.equal(state.saved.profiles[0].pendingRefresh, undefined);
});

test('logout revokes the renewable grant, retains registration, and reports unconfirmed remote revocation', async (t) => {
  const { runtime, state, login } = await setup(t); const first = await login(); state.revokeStatus = 503;
  const result = await runtime.signOut(first.profileId);
  assert.equal(result.revoked, false); assert.equal(state.revoke, 2);
  const saved = state.saved.profiles[0];
  assert.equal(saved.clientId, 'oaiapp_synthetic_a'); assert.equal(saved.credentials, null); assert.equal(saved.idToken, undefined);
  assert.equal((await runtime.getAccount(first.profileId)).connected, false);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-refresh|synthetic-access/);
});

test('logout interrupts in-flight inference and successful revocation uses only the refresh token', async (t) => {
  const { runtime, state, login } = await setup(t); const account = await login();
  let started; const running = new Promise((resolve) => { started = resolve; });
  state.response = (init) => new Promise((resolve, reject) => { started(); init.signal.addEventListener('abort', () => reject(new Error('private diagnostic')), { once: true }); });
  const reply = runtime.respond(account.profileId, { model: 'synthetic-model-a' });
  await running;
  const rejection = assert.rejects(reply, (error) => error.code === 'cancelled');
  assert.equal((await runtime.signOut(account.profileId)).revoked, true); await rejection;
  const revoke = state.calls.find((item) => item.url.endsWith('/oauth/revoke'));
  assert.equal(new URLSearchParams(revoke.init.body).get('token'), 'synthetic-refresh');
  assert.equal(new URLSearchParams(revoke.init.body).get('token_type_hint'), 'refresh_token');
});

test('unreadable saved credentials are preserved and prevent runtime startup', async () => {
  let writes = 0, closed = false;
  await assert.rejects(createChatGPTLocal({ store: { read: async () => ({ version: 999 }), write: async () => { writes++; }, close: async () => { closed = true; } } }), ChatGPTLocalError);
  assert.equal(writes, 0); assert.equal(closed, true);
});
