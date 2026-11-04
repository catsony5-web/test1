/* A user-approved local window owns authentication; the public page receives no credentials. */
(function () {
  "use strict";
  const LOCAL_ORIGIN = "http://127.0.0.1:4185";
  const MAX_REQUEST = 256 * 1024;
  const MAX_REPLY = 4 * 1024 * 1024;
  const CHANNEL = "ledger-local-agent-v1";
  const disconnected = () => new Error("PC 연결이 종료되었습니다. 이 PC의 구독 연결을 다시 눌러 주세요.");
  const withinLimit = (value, limit) => {
    try { return new TextEncoder().encode(JSON.stringify(value)).length <= limit; } catch { return false; }
  };
  function validStatus(value) {
    const session = value?.session;
    return session?.connected === true && session.mode === "subscription" && typeof session.id === "string"
      && Boolean(session.id) && session.account?.sharing === true && Array.isArray(session.models)
      && session.models.every((model) => typeof model === "string") && session.models.includes(session.model)
      && Array.isArray(value.subscription?.profiles) && value.subscription.profiles.length === 0;
  }

  function create({ onDisconnect = () => {} } = {}) {
    let popup = null;
    let port = null;
    let connected = false;
    let connecting = null;
    let listener = null;
    let monitor = null;
    let deadline = null;
    let sequence = 0;
    let openedAt = 0;
    let usedAt = 0;
    const pending = new Map();

    function finish(error = disconnected(), notifyPeer = true) {
      const wasActive = Boolean(popup || connecting || connected);
      if (notifyPeer && port) { try { port.postMessage({ type: "disconnect" }); } catch { /* The other window may be gone. */ } }
      connected = false;
      clearInterval(monitor); clearTimeout(deadline);
      monitor = null; deadline = null;
      if (listener) window.removeEventListener("message", listener);
      listener = null;
      port?.close(); port = null;
      try { if (popup && !popup.closed) popup.close(); } catch { /* Closing a lost window is optional. */ }
      popup = null;
      const attempt = connecting; connecting = null;
      attempt?.reject(error);
      for (const entry of pending.values()) { entry.cleanup(); entry.reject(error); }
      pending.clear();
      if (wasActive) onDisconnect(error.message);
    }
    function receive(event) {
      const data = event.data;
      if (!withinLimit(data, MAX_REPLY) || !data || typeof data !== "object" || Array.isArray(data)) {
        finish(new Error("PC 연결 응답 형식을 확인할 수 없습니다.")); return;
      }
      usedAt = Date.now();
      if (data.type === "disconnected") { finish(disconnected(), false); return; }
      if (data.type === "connected" && connecting && !connected) {
        if (!validStatus(data.status)) { finish(new Error("PC에서 구독 계정과 모델을 선택해 주세요.")); return; }
        connected = true; clearTimeout(deadline); deadline = null;
        const attempt = connecting; connecting = null; attempt.resolve(data.status); return;
      }
      if (!connected || data.type !== "response" || typeof data.id !== "string") return;
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id); entry.cleanup();
      if (data.ok !== true) entry.reject(new Error(typeof data.error === "string" ? data.error.slice(0, 500) : "PC 연결 요청에 실패했습니다."));
      else if (entry.path !== "respond" && !validStatus(data.result)) {
        entry.reject(disconnected()); finish(disconnected());
      } else entry.resolve(data.result);
    }
    function connect() {
      finish();
      if (location.protocol !== "https:") return Promise.reject(new Error("HTTPS 가계부 사이트에서 연결해 주세요."));
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, "0")).join("");
      const fragment = new URLSearchParams({ origin: location.origin, nonce });
      // Keep the opener for this bridge only. OpenAI's separate login window has no opener.
      try { popup = window.open(`${LOCAL_ORIGIN}/agent-connect#${fragment}`, "_blank", "popup,width=520,height=740"); }
      catch { return Promise.reject(new Error("PC 연결창을 열지 못했습니다. 브라우저의 팝업 설정을 확인해 주세요.")); }
      if (!popup) return Promise.reject(new Error("PC 연결창이 차단되었습니다. 이 사이트의 팝업을 허용하고 다시 눌러 주세요."));
      openedAt = usedAt = Date.now();
      const promise = new Promise((resolve, reject) => { connecting = { resolve, reject }; });
      listener = (event) => {
        if (event.origin !== LOCAL_ORIGIN || event.source !== popup || event.data?.channel !== CHANNEL
          || event.data?.type !== "ready" || event.data?.nonce !== nonce || port) return;
        const pair = new MessageChannel();
        port = pair.port1; port.onmessage = receive; port.onmessageerror = () => finish(); port.start();
        window.removeEventListener("message", listener); listener = null;
        clearTimeout(deadline);
        deadline = setTimeout(() => finish(new Error("PC 연결 확인 시간이 지났습니다. 다시 연결해 주세요.")), 10 * 60 * 1000);
        try { popup.postMessage({ channel: CHANNEL, type: "initialize", nonce }, LOCAL_ORIGIN, [pair.port2]); }
        catch { pair.port2.close(); finish(); }
      };
      window.addEventListener("message", listener);
      deadline = setTimeout(() => finish(new Error("이 PC의 연결 프로그램에 닿지 않았습니다. PC에서 가계부 연결 서버를 실행한 뒤 다시 눌러 주세요.")), 15000);
      monitor = setInterval(() => {
        if (popup?.closed || Date.now() - openedAt > 8 * 60 * 60 * 1000 || Date.now() - usedAt > 30 * 60 * 1000) finish();
      }, 1000);
      return promise;
    }
    function request(path, data, signal) {
      if (!connected || !port || !popup || popup.closed) return Promise.reject(disconnected());
      if (!(["status", "model", "respond"].includes(path)) || (path === "status" ? data !== undefined : !data || typeof data !== "object" || Array.isArray(data))) {
        return Promise.reject(new Error("허용되지 않은 PC 연결 요청입니다."));
      }
      if (signal?.aborted) return Promise.reject(new DOMException("요청을 중지했습니다.", "AbortError"));
      const id = `r${++sequence}`;
      const message = { type: "request", id, path, ...(data === undefined ? {} : { data }) };
      if (!withinLimit(message, MAX_REQUEST)) return Promise.reject(new Error("대화가 너무 큽니다. 새 대화로 시작해 주세요."));
      if (pending.size >= 8) return Promise.reject(new Error("진행 중인 요청을 마친 뒤 다시 시도해 주세요."));
      usedAt = Date.now();
      return new Promise((resolve, reject) => {
        const abort = () => {
          if (!pending.delete(id)) return;
          cleanup();
          try { port?.postMessage({ type: "cancel", id }); } catch { /* The connection may have closed. */ }
          reject(new DOMException("요청을 중지했습니다.", "AbortError"));
        };
        const timer = setTimeout(() => { abort(); }, 120000);
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
        pending.set(id, { path, resolve, reject, cleanup });
        signal?.addEventListener("abort", abort, { once: true });
        try { port.postMessage(message); } catch { finish(); }
      });
    }
    window.addEventListener("pagehide", () => finish());
    return Object.freeze({ connect, request, disconnect: () => finish(), isConnected: () => Boolean(connected && popup && !popup.closed) });
  }
  globalThis.LedgerAgentTransport = Object.freeze({ create });
})();
