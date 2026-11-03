import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createProtectedAuthStore } from './chatgpt-auth-store.mjs';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const RANDOM = () => randomBytes(32).toString('base64url');
const MAX_REPLY = 4 * 1024 * 1024;
const MESSAGES = {
  cancelled: '요청을 취소했습니다.',
  network_error: 'ChatGPT에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  invalid_grant: 'ChatGPT 연결이 만료되었습니다. 저장된 계정으로 다시 로그인해 주세요.',
  access_denied: 'ChatGPT 로그인을 취소했거나 권한을 허용하지 않았습니다.',
  invalid_id_token: 'ChatGPT 계정 정보를 검증하지 못했습니다. 다시 로그인해 주세요.',
  account_mismatch: '선택한 계정과 다른 계정입니다. 다른 계정 추가로 로그인해 주세요.',
  sharing_not_enabled: 'ChatGPT 구독 사용 권한이 없습니다. ChatGPT에서 앱의 요금제 사용을 허용해 주세요.',
  subscription_sharing_usage_limit_exceeded: 'ChatGPT 구독 사용 한도에 도달했습니다. 사용량 설정을 확인해 주세요.',
  subscription_sharing_usage_unavailable: '현재 계정에서 ChatGPT 구독 사용을 이용할 수 없습니다. 계정과 사용량 설정을 확인해 주세요.',
  sign_in_required: '저장된 ChatGPT 계정으로 다시 로그인해 주세요.',
  invalid_stream: 'ChatGPT 응답이 완료되지 않았습니다. 다시 요청해 주세요.',
  busy: '진행 중인 로그인이나 계정 변경을 먼저 마쳐 주세요.',
  storage_error: '인증 정보를 안전하게 저장하지 못했습니다. 기존 인증 파일은 보존했습니다.',
  invalid_response: 'ChatGPT 연결 응답을 확인하지 못했습니다. 다시 시도해 주세요.',
  configuration_error: 'ChatGPT 로그인 설정을 확인하지 못했습니다. 다시 시도해 주세요.'
};

export class ChatGPTLocalError extends Error {
  constructor(code, status = 400) {
    super(MESSAGES[code] || MESSAGES.invalid_response);
    this.name = 'ChatGPTLocalError'; this.code = code; this.status = status;
  }
}
const fail = (code, status) => { throw new ChatGPTLocalError(code, status); };
const safeError = (error) => error instanceof ChatGPTLocalError ? error : new ChatGPTLocalError('network_error', 502);
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => structuredClone(value);

async function jsonBody(response) {
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of response.body || []) {
      size += chunk.length;
      if (size > MAX_REPLY) fail('invalid_response', 502);
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (error instanceof ChatGPTLocalError) throw error; fail('invalid_response', 502); }
}

function remoteError(data, status) {
  const code = typeof data?.error === 'string' ? data.error : data?.error?.code || data?.code;
  if (Object.hasOwn(MESSAGES, code)) return new ChatGPTLocalError(code, status === 200 ? 403 : status);
  if ([401, 403].includes(status)) return new ChatGPTLocalError('sign_in_required', 401);
  if (status === 429) return new ChatGPTLocalError('subscription_sharing_usage_limit_exceeded', 429);
  return new ChatGPTLocalError('invalid_response', 502);
}

function validateState(value) {
  if (!value || value.version !== 1 || !/^urn:uuid:[a-f0-9-]{36}$/i.test(value.hostId) || !Array.isArray(value.profiles)
    || value.profiles.length > 100) fail('storage_error', 500);
  const ids = new Set();
  for (const profile of value.profiles) {
    if (!isObject(profile) || typeof profile.id !== 'string' || ids.has(profile.id)
      || typeof profile.label !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(profile.clientId)
      || profile.clientId === 'dynamic_agent_client' || !Array.isArray(profile.scopes)) fail('storage_error', 500);
    ids.add(profile.id);
  }
  return value;
}

export async function createChatGPTLocal({ store, directory, fetchImpl = fetch, now = Date.now, signInTimeoutMs = 10 * 60 * 1000 } = {}) {
  let storage = store;
  try { storage ||= await createProtectedAuthStore({ directory }); }
  catch { fail('storage_error', 500); }
  let state;
  try {
    const saved = await storage.read();
    state = saved ? validateState(saved) : { version: 1, hostId: `urn:uuid:${randomUUID()}`, profiles: [] };
    if (!saved) await storage.write(state);
  } catch { await storage.close?.(); fail('storage_error', 500); }
  let closed = false, providerPromise, activeAttempt, mutation = Promise.resolve();
  const attempts = new Map();
  const requests = new Map();
  function serial(operation) {
    const result = mutation.then(operation);
    mutation = result.catch(() => {});
    return result;
  }
  function assertOpen() { if (closed) fail('cancelled', 499); }
  function profileFor(id) {
    const profile = state.profiles.find((entry) => entry.id === id);
    if (!profile) fail('sign_in_required', 401);
    return profile;
  }
  function account(profile) {
    const connected = Boolean(profile.credentials && !profile.pendingRefresh);
    return { id: profile.id, label: profile.label, ...(profile.identity?.email ? { email: profile.identity.email } : {}),
      connected, sharing: connected && profile.scopes.includes(PLAN_SCOPE) };
  }
  async function save(next, assertCurrent = assertOpen) {
    try { await storage.write(next, assertCurrent); state = next; }
    catch (error) { if (error instanceof ChatGPTLocalError) throw error; fail('storage_error', 500); }
  }
  async function fetchRemote(url, init = {}, timeout = 15000) {
    assertOpen();
    const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    try { return await fetchImpl(url, { ...init, redirect: 'error', signal }); }
    catch { if (init.signal?.aborted || closed) fail('cancelled', 499); fail('network_error', 502); }
  }
  async function provider() {
    providerPromise ||= (async () => {
      const response = await fetchRemote(`${ISSUER}/.well-known/openid-configuration`);
      const data = await jsonBody(response);
      if (!response.ok || !isObject(data) || data.issuer !== ISSUER) fail('configuration_error', 502);
      for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'revocation_endpoint']) {
        const target = typeof data[key] === 'string' ? new URL(data[key]) : null;
        if (!target || target.origin !== ISSUER || target.username || target.password || target.hash) fail('configuration_error', 502);
      }
      return data;
    })().catch((error) => { providerPromise = undefined; throw safeError(error); });
    return providerPromise;
  }
  async function verifyIdentity(token, clientId, nonce, receivedAt = now()) {
    if (typeof token !== 'string' || token.length > 128 * 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) fail('invalid_id_token');
    const parts = token.split('.');
    let header, claims;
    try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); }
    catch { fail('invalid_id_token'); }
    if (!isObject(header) || header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit || header.b64 === false || !isObject(claims)) fail('invalid_id_token');
    const configuration = await provider();
    const response = await fetchRemote(configuration.jwks_uri);
    if (!response.ok) fail('network_error', 502);
    const keys = await jsonBody(response);
    if (!Array.isArray(keys?.keys)) fail('configuration_error', 502);
    const matching = keys.keys.filter((key) => key.kid === header.kid && key.kty === 'RSA'
      && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
    if (matching.length !== 1) fail('network_error', 502);
    try {
      const key = createPublicKey({ key: matching[0], format: 'jwk' });
      if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) fail('invalid_id_token');
    } catch { fail('invalid_id_token'); }
    const seconds = receivedAt / 1000, audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== ISSUER || !audience.includes(clientId) || (audience.length > 1 && claims.azp !== clientId)
      || (claims.azp !== undefined && claims.azp !== clientId) || typeof claims.sub !== 'string' || !claims.sub
      || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= seconds - 5
      || typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > seconds + 5
      || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > seconds + 5))
      || (nonce !== undefined && claims.nonce !== nonce)) fail('invalid_id_token');
    return { subject: claims.sub, ...(typeof claims.email === 'string' ? { email: claims.email.slice(0, 320) } : {}) };
  }
  async function tokenRequest(parameters, signal) {
    const configuration = await provider();
    const response = await fetchRemote(configuration.token_endpoint, { method: 'POST', signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(parameters).toString() });
    const data = await jsonBody(response);
    if (!response.ok) throw remoteError(data, response.status);
    if (!isObject(data)) fail('invalid_response', 502);
    return data;
  }
  function tokenFields(data, previousScopes) {
    const scope = data.scope ?? previousScopes?.join(' ');
    if (typeof scope !== 'string') fail('invalid_response', 502);
    const scopes = scope.split(/\s+/).filter(Boolean);
    if (typeof data.access_token !== 'string' || !data.access_token) {
      if (scopes.includes(PLAN_SCOPE) || scopes.includes('offline_access')) fail('invalid_response', 502);
      return { scopes, credentials: null };
    }
    if (String(data.token_type).toLowerCase() !== 'bearer' || !Number.isFinite(data.expires_in) || data.expires_in <= 0
      || !Number.isFinite(now() + data.expires_in * 1000) || ((previousScopes || scopes.includes('offline_access'))
      && (typeof data.refresh_token !== 'string' || !data.refresh_token))) fail('invalid_response', 502);
    return { scopes, credentials: { accessToken: data.access_token, refreshToken: data.refresh_token || '',
      expiresAt: now() + data.expires_in * 1000, earliestRefreshAt: data.earliest_refresh_at } };
  }
  function abortProfileRequests(id) { for (const controller of requests.get(id) || []) controller.abort(); }
  function finishAttempt(entry, result) {
    clearTimeout(entry.timer); entry.server?.close(); entry.server?.closeAllConnections();
    Object.assign(entry, result); entry.state = ''; entry.verifier = ''; entry.nonce = '';
    if (activeAttempt === entry) activeAttempt = undefined;
  }
  function assertAttempt(entry) { assertOpen(); if (entry.controller.signal.aborted || entry.status !== 'pending') fail('cancelled', 499); }
  async function completeAttempt(entry, parameters) {
    try {
      await serial(async () => {
        assertAttempt(entry);
        const previous = entry.profileId ? profileFor(entry.profileId) : null;
        const clientId = parameters.get('client_id') || previous?.clientId;
        const code = parameters.get('code');
        if (parameters.has('error')) throw remoteError({ error: parameters.get('error') }, 400);
        if (!code || parameters.getAll('code').length !== 1 || parameters.getAll('client_id').length > 1
          || !/^[A-Za-z0-9_-]{1,200}$/.test(clientId || '') || clientId === 'dynamic_agent_client'
          || (previous && previous.clientId !== clientId)) fail('invalid_response', 400);
        let profile = previous;
        if (!profile) {
          profile = { id: randomUUID(), label: `ChatGPT 계정 ${state.profiles.length + 1}`, clientId, scopes: [], credentials: null };
          await save({ ...state, profiles: [...state.profiles, profile] }, () => assertAttempt(entry));
          entry.profileId = profile.id;
        }
        const data = await tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code,
          code_verifier: entry.verifier, redirect_uri: entry.redirectUri, resource: RESOURCE }, entry.controller.signal);
        const identity = await verifyIdentity(data.id_token, clientId, entry.nonce);
        assertAttempt(entry);
        if (profile.identity?.subject && profile.identity.subject !== identity.subject) fail('account_mismatch');
        const updated = { ...profile, identity, idToken: data.id_token, ...tokenFields(data) };
        delete updated.pendingRefresh;
        await save({ ...state, profiles: state.profiles.map((item) => item.id === updated.id ? updated : item) }, () => assertAttempt(entry));
        assertAttempt(entry);
        finishAttempt(entry, { status: 'complete', profileId: updated.id });
      });
    } catch (error) {
      if (entry.status === 'pending') finishAttempt(entry, { status: 'error', message: safeError(error).message, code: safeError(error).code });
    }
  }
  async function beginSignIn({ profileId } = {}) {
    assertOpen();
    if (activeAttempt) fail('busy', 409);
    const existing = profileId ? profileFor(profileId) : null;
    if (!existing && state.profiles.length >= 100) fail('busy', 409);
    const entry = { id: RANDOM(), status: 'pending', profileId, state: RANDOM(), nonce: RANDOM(), verifier: RANDOM(),
      controller: new AbortController(), created: now() };
    activeAttempt = entry;
    for (const [id, old] of attempts) if (old.status !== 'pending' && now() - old.created > 30 * 60 * 1000) attempts.delete(id);
    attempts.set(entry.id, entry);
    entry.timer = setTimeout(() => cancelSignIn(entry.id), signInTimeoutMs); entry.timer.unref();
    try {
      const configuration = await provider(); assertAttempt(entry);
      entry.server = createServer((req, res) => {
        const expected = `127.0.0.1:${entry.server.address()?.port}`;
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Connection', 'close');
        const script = 'history.replaceState(null,"","/auth/complete")';
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'sha256-${createHash('sha256').update(script).digest('base64')}'; frame-ancestors 'none'; base-uri 'none'`);
        let url;
        try { url = new URL(req.url, `http://${expected}`); } catch { res.writeHead(400).end(); return; }
        if (req.method !== 'GET' || req.headers.host !== expected || url.origin !== `http://${expected}` || url.pathname !== '/auth/callback' || entry.claimed || entry.status !== 'pending') { res.writeHead(404).end(); return; }
        const returned = Buffer.from(url.searchParams.get('state') || ''), wanted = Buffer.from(entry.state);
        if (url.searchParams.getAll('state').length !== 1 || returned.length !== wanted.length || !timingSafeEqual(returned, wanted)) { res.writeHead(400).end('Invalid sign-in state'); return; }
        entry.claimed = true;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.once('finish', () => void completeAttempt(entry, url.searchParams));
        res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>가계부로 돌아가기</title><h1>가계부로 돌아가 주세요</h1><p>앱에서 계정과 구독 권한을 확인합니다. 이 탭은 닫아도 됩니다.</p><script>${script}</script></html>`);
      });
      entry.server.requestTimeout = 15000; entry.server.headersTimeout = 10000;
      await new Promise((accept, reject) => { entry.server.once('error', reject); entry.server.listen(0, '127.0.0.1', accept); });
      assertAttempt(entry);
      entry.redirectUri = `http://127.0.0.1:${entry.server.address().port}/auth/callback`;
      const url = new URL(configuration.authorization_endpoint);
      url.search = new URLSearchParams({ client_id: existing?.clientId || 'dynamic_agent_client', response_type: 'code',
        redirect_uri: entry.redirectUri, scope: SCOPES, resource: RESOURCE, state: entry.state, nonce: entry.nonce,
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(entry.verifier).digest('base64url'), ext_agent_host_id: state.hostId }).toString();
      if (!existing) url.searchParams.set('agent_name_hint', '소비 분석 가계부');
      // Hints are optional. Keep retained ID tokens and email out of browser URLs.
      return { attemptId: entry.id, authorizationUrl: url.toString() };
    } catch (error) { finishAttempt(entry, { status: 'error', message: safeError(error).message }); throw safeError(error); }
  }
  function pollSignIn(id) {
    assertOpen();
    const entry = attempts.get(id);
    if (!entry) fail('sign_in_required', 404);
    return { status: entry.status, ...(entry.profileId ? { profileId: entry.profileId } : {}),
      ...(entry.message ? { message: entry.message } : {}), ...(entry.code ? { code: entry.code } : {}) };
  }
  function cancelSignIn(id) {
    const entry = attempts.get(id);
    if (!entry || entry.status !== 'pending') return;
    entry.controller.abort(); finishAttempt(entry, { status: 'error', code: 'cancelled', message: MESSAGES.cancelled });
  }
  async function accessFor(id) {
    return serial(async () => {
      assertOpen();
      let profile = profileFor(id);
      if (!profile.credentials && !profile.pendingRefresh) fail('sign_in_required', 401);
      if (profile.pendingRefresh || profile.credentials.expiresAt <= now() + 60000) {
        try {
          let rotation = profile.pendingRefresh;
          if (!rotation) {
            const earliest = profile.credentials.earliestRefreshAt;
            const earliestMs = typeof earliest === 'number' ? earliest * 1000 : Date.parse(earliest || '');
            if (Number.isFinite(earliestMs) && earliestMs > now()) {
              if (profile.credentials.expiresAt <= now()) fail('sign_in_required', 401);
              if (!profile.scopes.includes(PLAN_SCOPE)) fail('sharing_not_enabled', 403);
              return profile.credentials.accessToken;
            }
            if (!profile.credentials.refreshToken) fail('sign_in_required', 401);
            // Refresh rotation finishes independently of a canceled inference request.
            const data = await tokenRequest({ grant_type: 'refresh_token', client_id: profile.clientId,
              refresh_token: profile.credentials.refreshToken, resource: RESOURCE });
            const fields = tokenFields(data, profile.scopes);
            if (data.id_token !== undefined && (typeof data.id_token !== 'string' || !data.id_token)) fail('invalid_id_token');
            rotation = { ...fields, idToken: data.id_token, receivedAt: now() };
            profile = { ...profile, pendingRefresh: rotation };
            await save({ ...state, profiles: state.profiles.map((item) => item.id === id ? profile : item) });
          }
          let identity = profile.identity;
          if (rotation.idToken) {
            identity = await verifyIdentity(rotation.idToken, profile.clientId, undefined, rotation.receivedAt);
            if (identity.subject !== profile.identity?.subject) fail('account_mismatch');
          }
          const next = { ...profile, identity, scopes: rotation.scopes, credentials: rotation.credentials,
            ...(rotation.idToken ? { idToken: rotation.idToken } : {}) };
          delete next.pendingRefresh;
          await save({ ...state, profiles: state.profiles.map((item) => item.id === id ? next : item) });
          profile = next;
        } catch (error) {
          if (['invalid_grant', 'invalid_id_token', 'account_mismatch'].includes(error.code)) {
            const cleared = { ...profile, credentials: null, scopes: [] }; delete cleared.pendingRefresh; delete cleared.idToken;
            await save({ ...state, profiles: state.profiles.map((item) => item.id === id ? cleared : item) });
          }
          throw safeError(error);
        }
      }
      if (!profile.scopes.includes(PLAN_SCOPE)) fail('sharing_not_enabled', 403);
      if (!profile.credentials || profile.credentials.expiresAt <= now()) fail('sign_in_required', 401);
      return profile.credentials.accessToken;
    });
  }
  async function authenticated(id, operation, callerSignal) {
    assertOpen();
    const controller = new AbortController();
    const active = requests.get(id) || new Set(); active.add(controller); requests.set(id, active);
    const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
    try {
      const token = await accessFor(id);
      if (signal.aborted) fail('cancelled', 499);
      return await operation(token, signal);
    } finally { active.delete(controller); if (!active.size) requests.delete(id); }
  }
  async function listModels(id, { signal } = {}) {
    return authenticated(id, async (token, requestSignal) => {
      const response = await fetchRemote(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` }, signal: requestSignal });
      const data = await jsonBody(response);
      if (!response.ok) throw remoteError(data, response.status);
      if (!Array.isArray(data.models)) fail('invalid_response', 502);
      const seen = new Set();
      return data.models.filter((model) => model.visibility === 'list' && typeof model.slug === 'string' && model.slug
        && !seen.has(model.slug) && seen.add(model.slug)).map((model) => ({ id: model.slug, label: typeof model.display_name === 'string' ? model.display_name : model.slug }));
    }, signal);
  }
  async function respond(id, payload, { signal } = {}) {
    return authenticated(id, async (token, requestSignal) => {
      const response = await fetchRemote(`${RESOURCE}/responses`, { method: 'POST', signal: requestSignal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ ...payload, store: false, stream: true }) }, 180000);
      if (!response.ok) throw remoteError(await jsonBody(response), response.status);
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!response.body || (type && type !== 'text/event-stream')) { await response.body?.cancel(); fail('invalid_stream', 502); }
      let buffered = '', size = 0, completed;
      const decoder = new TextDecoder();
      const event = (block) => {
        const raw = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!raw || raw === '[DONE]') return;
        let data; try { data = JSON.parse(raw); } catch { fail('invalid_stream', 502); }
        if (data.type === 'response.failed' || data.type === 'error') throw remoteError(data.response || data, 200);
        if (data.type === 'response.incomplete') fail('invalid_stream', 502);
        if (data.type === 'response.completed') {
          if (data.response?.status !== 'completed' || !Array.isArray(data.response.output)) fail('invalid_stream', 502);
          completed = data.response;
        }
      };
      try {
        for await (const bytes of response.body) {
          if (requestSignal.aborted) fail('cancelled', 499);
          size += bytes.length; if (size > MAX_REPLY) fail('invalid_stream', 502);
          buffered += decoder.decode(bytes, { stream: true });
          let boundary;
          // Normalize each completed block, including CRLF split across chunks.
          while ((boundary = /\r?\n\r?\n/.exec(buffered))) {
            event(buffered.slice(0, boundary.index).replace(/\r\n/g, '\n'));
            buffered = buffered.slice(boundary.index + boundary[0].length);
            if (completed) break;
          }
          if (completed) break;
        }
        if (requestSignal.aborted) fail('cancelled', 499);
        if (!completed) fail('invalid_stream', 502);
        return completed;
      } catch (error) { if (error instanceof ChatGPTLocalError) throw error; fail('invalid_stream', 502); }
    }, signal);
  }
  async function signOut(id) {
    assertOpen(); abortProfileRequests(id);
    if (activeAttempt?.profileId === id) cancelSignIn(activeAttempt.id);
    return serial(async () => {
      const profile = profileFor(id);
      const refresh = profile.pendingRefresh?.credentials?.refreshToken || profile.credentials?.refreshToken;
      let revoked = !profile.credentials && !profile.pendingRefresh;
      if (refresh) {
        for (let count = 0; count < 2 && !revoked; count++) {
          let retry = false;
          try {
            const configuration = await provider();
            const response = await fetchRemote(configuration.revocation_endpoint, { method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ token: refresh, token_type_hint: 'refresh_token', client_id: profile.clientId }).toString() }, 10000);
            revoked = response.status === 200; retry = response.status >= 500; await response.body?.cancel();
          } catch { retry = true; }
          if (!retry) break;
          if (count === 0) await delay(200);
        }
      }
      const cleared = { ...profile, credentials: null, scopes: [] }; delete cleared.idToken; delete cleared.pendingRefresh;
      await save({ ...state, profiles: state.profiles.map((item) => item.id === id ? cleared : item) });
      return { revoked, ...(revoked ? {} : { message: '이 PC의 인증 정보는 지웠지만 OpenAI의 연결 해제를 확인하지 못했습니다. ChatGPT 사용량 설정에서 앱 연결을 해제해 주세요.' }) };
    });
  }
  async function close() {
    if (closed) return;
    if (activeAttempt) cancelSignIn(activeAttempt.id);
    for (const id of requests.keys()) abortProfileRequests(id);
    closed = true;
    await mutation;
    await storage.close?.();
  }
  return { beginSignIn, pollSignIn, cancelSignIn, listProfiles: async () => { assertOpen(); return state.profiles.map(account); },
    getAccount: async (id) => { assertOpen(); return account(profileFor(id)); }, listModels, respond, signOut, close };
}
