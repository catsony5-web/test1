/* This loopback-only page grants one opener temporary inference access after a local user click. */
(function () {
  "use strict";
  const CHANNEL = "ledger-local-agent-v1";
  const MAX_REQUEST = 256 * 1024;
  const MAX_REPLY = 4 * 1024 * 1024;
  const withinLimit = (value, limit) => {
    try { return new TextEncoder().encode(JSON.stringify(value)).length <= limit; } catch { return false; }
  };
  const controls = Object.fromEntries(["siteOrigin", "profile", "useProfile", "signIn", "model", "feedback", "allow", "disconnect", "loginActions", "loginLink", "cancelLogin"].map((id) => [id, document.getElementById(id)]));
  const fragment = new URLSearchParams(location.hash.slice(1));
  const origin = fragment.get("origin") || "";
  const nonce = fragment.get("nonce") || "";
  const owner = window.opener;
  let port = null;
  let status = null;
  let busy = false;
  let approvedSession = "";
  let approvedAccount = "";
  let ended = false;
  let login = null;
  let monitor = null;
  let startedAt = Date.now();
  let usedAt = startedAt;
  let lastRequest = 0;
  const requests = new Map();
  function feedback(message, error = false) { controls.feedback.textContent = message; controls.feedback.dataset.error = String(error); }
  function ready() {
    return status?.session?.mode === "subscription" && status.session.connected && status.session.account?.sharing
      && controls.profile.value === status.session.account.id && controls.model.value === status.session.model
      && status.session.models?.includes(status.session.model);
  }
  function refreshControls() {
    const locked = busy || Boolean(login) || Boolean(approvedSession) || ended;
    for (const control of [controls.profile, controls.useProfile, controls.signIn, controls.model]) control.disabled = locked;
    controls.useProfile.disabled = locked || status?.subscription?.available !== true || !controls.profile.value;
    controls.signIn.disabled = locked || status?.subscription?.available !== true;
    controls.model.disabled = locked || status?.session?.mode !== "subscription" || !status.session.account?.sharing;
    controls.allow.disabled = locked || !port || !ready();
    controls.allow.hidden = Boolean(approvedSession) || ended;
    controls.disconnect.hidden = !approvedSession || ended;
    controls.cancelLogin.disabled = busy || !login;
    controls.loginActions.hidden = !login;
  }
  function acceptStatus(next) {
    status = next;
    const selected = controls.profile.value;
    controls.profile.replaceChildren();
    for (const account of next?.subscription?.profiles || []) {
      const option = document.createElement("option"); option.value = account.id;
      option.textContent = `${account.email || account.label || "ChatGPT 계정"}${account.connected && account.sharing ? " · 구독 연결됨" : " · 로그인 필요"}`;
      controls.profile.append(option);
    }
    controls.profile.value = next?.session?.account?.id || (next?.subscription?.profiles?.some((account) => account.id === selected) ? selected : next?.subscription?.profiles?.[0]?.id || "");
    controls.model.replaceChildren();
    const empty = document.createElement("option"); empty.value = ""; empty.textContent = "모델 선택"; controls.model.append(empty);
    for (const id of next?.session?.models || []) {
      const option = document.createElement("option"); option.value = id; option.textContent = next.session.modelLabels?.[id] || id; controls.model.append(option);
    }
    controls.model.value = next?.session?.model || "";
    refreshControls();
  }
  async function request(path, data, signal) {
    const response = await fetch(`/agent-api/${path}`, { method: data === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { "X-Ledger-Agent": "1", ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal });
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("PC 연결 서버를 업데이트한 뒤 다시 연결해 주세요.");
    const payload = await response.json();
    if (!response.ok) { const error = new Error(payload?.error?.message || "PC 연결 요청에 실패했습니다."); error.code = payload?.error?.code; throw error; }
    return payload;
  }
  function publicStatus(next) {
    const session = next.session;
    return { subscription: { available: true, profiles: [] }, api: { available: false },
      session: { connected: true, mode: "subscription", id: session.id, model: session.model, models: session.models, modelLabels: session.modelLabels || {},
        account: { id: session.account.id, label: session.account.label || "ChatGPT 계정", email: session.account.email || "", sharing: true, connected: true } } };
  }
  function sameSession(next) {
    return next?.session?.id === approvedSession && next.session.mode === "subscription" && next.session.connected
      && next.session.account?.id === approvedAccount && next.session.account.sharing;
  }
  function send(message) {
    if (!port || ended) return;
    if (!withinLimit(message, MAX_REPLY)) throw new Error("응답이 너무 큽니다. 조회 범위를 줄여 주세요.");
    port.postMessage(message);
  }
  function finish(message = "사이트 연결을 해제했습니다. 사이트에서 다시 연결할 수 있습니다.", notify = true) {
    if (ended) return;
    if (notify && port) { try { port.postMessage({ type: "disconnected" }); } catch { /* The opener may already be closed. */ } }
    ended = true;
    clearInterval(monitor); window.removeEventListener("message", initialize);
    for (const controller of requests.values()) controller.abort(); requests.clear();
    port?.close(); port = null;
    void cancelLogin();
    feedback(message); refreshControls();
  }
  async function bridgeRequest(event) {
    const message = event.data;
    if (!message || typeof message !== "object" || Array.isArray(message) || !withinLimit(message, MAX_REQUEST)) { finish("잘못된 연결 요청으로 사이트 연결을 해제했습니다."); return; }
    if (message.type === "disconnect") { finish(undefined, false); return; }
    if (!approvedSession || ended || owner.closed) return;
    usedAt = Date.now();
    if (message.type === "cancel" && typeof message.id === "string") { requests.get(message.id)?.abort(); return; }
    if (message.type !== "request" || !/^r[1-9][0-9]{0,12}$/.test(message.id || "") || Number(message.id.slice(1)) <= lastRequest) { finish("잘못된 연결 요청으로 사이트 연결을 해제했습니다."); return; }
    lastRequest = Number(message.id.slice(1));
    const { id, path, data } = message;
    if (!["status", "model", "respond"].includes(path) || (path === "status" ? data !== undefined : !data || typeof data !== "object" || Array.isArray(data))) {
      send({ type: "response", id, ok: false, error: "허용되지 않은 PC 연결 요청입니다." }); return;
    }
    if (requests.size >= 8) { send({ type: "response", id, ok: false, error: "진행 중인 요청을 마친 뒤 다시 시도해 주세요." }); return; }
    const controller = new AbortController(); requests.set(id, controller);
    const timer = setTimeout(() => controller.abort(), 110000);
    try {
      const current = await request("status", undefined, controller.signal);
      if (!sameSession(current) || (data && data.sessionId !== approvedSession)) { finish("다른 창에서 계정 연결이 바뀌었습니다. 사이트에서 다시 연결해 주세요."); return; }
      let result = path === "status" ? current : await request(path, data, controller.signal);
      if (path !== "respond") {
        if (!sameSession(result)) { finish("계정 연결이 변경되어 사이트 연결을 해제했습니다."); return; }
        acceptStatus(result); result = publicStatus(result);
      }
      if (!ended && !controller.signal.aborted) send({ type: "response", id, ok: true, result });
    } catch (error) {
      if (["session_changed", "session_required", "provider_auth"].includes(error.code)) finish("계정 연결이 만료되거나 바뀌었습니다. 사이트에서 다시 연결해 주세요.");
      else if (!ended) send({ type: "response", id, ok: false, error: controller.signal.aborted ? "요청을 중지했습니다." : error.message });
    } finally { clearTimeout(timer); requests.delete(id); }
  }
  function initialize(event) {
    if (ended || port || event.origin !== origin || event.source !== owner || event.data?.channel !== CHANNEL
      || event.data?.type !== "initialize" || event.data?.nonce !== nonce || event.ports?.length !== 1) return;
    port = event.ports[0]; port.onmessage = (message) => void bridgeRequest(message); port.onmessageerror = () => finish(); port.start();
    window.removeEventListener("message", initialize); refreshControls();
  }
  async function updateConnection(operation) {
    if (busy || approvedSession || ended) return;
    busy = true; refreshControls();
    try {
      acceptStatus(await operation());
      feedback(status?.subscription?.available !== true ? "이 PC 서버에서 구독 로그인을 사용할 수 없습니다. 연결 프로그램의 설정을 확인해 주세요."
        : ready() ? "계정과 모델을 확인했습니다. 이 사이트에 연결할지 확인해 주세요." : "구독 계정과 사용할 모델을 선택해 주세요.");
    }
    catch (error) {
      if (error.code === "session_changed" || error.code === "session_required") {
        try { if (!ended) acceptStatus(await request("status")); } catch { /* Keep the original actionable error. */ }
      }
      feedback(error.message, true);
    }
    finally { busy = false; refreshControls(); }
  }
  async function cancelLogin() {
    const attempt = login;
    if (!attempt) return;
    login = null; clearTimeout(attempt.timer); attempt.controller.abort();
    try { attempt.popup?.close(); } catch { /* The user may have closed the login window. */ }
    controls.loginLink.removeAttribute("href"); refreshControls();
    if (attempt.id) {
      try { const result = await request("subscription-cancel", { attemptId: attempt.id }); if (!ended) acceptStatus(result); }
      catch (error) { if (!ended) feedback(error.message, true); }
    }
  }
  async function pollLogin(attempt) {
    if (ended || login !== attempt) return;
    try {
      const result = await request(`subscription-login-status?attemptId=${encodeURIComponent(attempt.id)}`, undefined, attempt.controller.signal);
      if (ended || login !== attempt) return;
      if (result.status === "pending") { attempt.timer = setTimeout(() => void pollLogin(attempt), 1000); return; }
      login = null; controls.loginLink.removeAttribute("href");
      if (result.status !== "complete") { feedback(result.message || "로그인을 완료하지 못했습니다.", true); refreshControls(); return; }
      acceptStatus(result); feedback(result.session?.account?.sharing ? "ChatGPT 구독을 연결했습니다. 사용할 모델을 선택해 주세요." : "구독 사용 권한을 허용해 다시 로그인해 주세요.", !result.session?.account?.sharing);
    } catch (error) { if (login === attempt) { await cancelLogin(); feedback(error.message, true); } }
  }
  async function signIn(profileId = "") {
    if (busy || login || approvedSession || ended) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    const attempt = { id: "", popup, controller: new AbortController(), timer: null }; login = attempt; refreshControls();
    feedback("OpenAI 로그인 화면을 준비하고 있습니다.");
    try {
      const result = await request("subscription-login", { sessionId: status?.session?.id || "", ...(profileId ? { profileId } : {}) });
      attempt.id = result.attemptId;
      if (login !== attempt || ended) { if (attempt.id) await request("subscription-cancel", { attemptId: attempt.id }); return; }
      const url = new URL(result.authorizationUrl);
      if (!attempt.id || url.origin !== "https://auth.openai.com" || url.pathname !== "/api/accounts/authorize" || url.username || url.password || url.hash) throw new Error("OpenAI 로그인 주소를 확인할 수 없습니다.");
      controls.loginLink.href = url.href;
      try { if (popup && !popup.closed) popup.location.replace(url.href); } catch { /* The visible link also opens the verified URL. */ }
      feedback("OpenAI 화면에서 로그인과 구독 사용을 확인해 주세요."); void pollLogin(attempt);
    } catch (error) { if (login === attempt) { await cancelLogin(); feedback(error.message, true); } }
  }
  controls.signIn.addEventListener("click", () => void signIn());
  controls.useProfile.addEventListener("click", () => {
    const profile = status?.subscription?.profiles?.find((account) => account.id === controls.profile.value);
    if (!profile) return;
    if (!profile.connected || !profile.sharing) { void signIn(profile.id); return; }
    void updateConnection(() => request("subscription-select", { profileId: profile.id, sessionId: status?.session?.id || "" }));
  });
  controls.profile.addEventListener("change", refreshControls);
  controls.model.addEventListener("change", () => {
    refreshControls();
    if (controls.model.value) void updateConnection(() => request("model", { model: controls.model.value, sessionId: status?.session?.id || "" }));
  });
  controls.cancelLogin.addEventListener("click", () => void cancelLogin());
  controls.allow.addEventListener("click", async (event) => {
    if (!event.isTrusted || busy || login || !port || ended || !ready() || approvedSession) return;
    busy = true; refreshControls();
    try {
      const latest = await request("status");
      if (latest.session?.id !== status.session.id || latest.session?.model !== status.session.model
        || latest.session?.account?.id !== status.session.account.id) {
        acceptStatus(latest);
        throw new Error("다른 창에서 연결이 바뀌었습니다. 계정과 모델을 다시 확인해 주세요.");
      }
      acceptStatus(latest);
      if (!ready()) throw new Error("구독 계정과 모델을 먼저 선택해 주세요.");
      approvedSession = latest.session.id; approvedAccount = latest.session.account.id;
      send({ type: "connected", status: publicStatus(latest) });
      feedback("사이트에 연결했습니다. 가계부 탭으로 돌아가 질문하세요. 이 창을 열어 두세요.");
    } catch (error) { feedback(error.message, true); }
    finally { busy = false; refreshControls(); }
  });
  controls.disconnect.addEventListener("click", () => finish());
  window.addEventListener("pagehide", () => finish());
  try {
    const parsed = new URL(origin);
    if (location.origin !== "http://127.0.0.1:4185" || parsed.protocol !== "https:" || parsed.origin !== origin
      || fragment.getAll("origin").length !== 1 || fragment.getAll("nonce").length !== 1
      || !/^[a-f0-9]{64}$/.test(nonce) || !owner || owner === window) throw new Error("가계부 사이트의 연결 버튼으로 이 창을 열어 주세요.");
    controls.siteOrigin.textContent = origin;
    history.replaceState(null, "", location.pathname);
    window.addEventListener("message", initialize);
    owner.postMessage({ channel: CHANNEL, type: "ready", nonce }, origin);
    monitor = setInterval(() => {
      if (owner.closed || Date.now() - startedAt > 8 * 60 * 60 * 1000 || Date.now() - usedAt > (approvedSession ? 30 : 10) * 60 * 1000) finish("사이트 연결 시간이 끝났습니다. 가계부에서 다시 연결해 주세요.");
    }, 1000);
    void updateConnection(() => request("status"));
  } catch (error) { finish(error.message, false); }
})();
