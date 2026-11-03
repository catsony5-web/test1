/* Conversations and approval plans stay in memory; credentials never enter ledger storage. */
(function () {
  "use strict";

  const MAX_ROUNDS = 8;
  const MAX_HISTORY_SIZE = 180000;
  const labels = {
    month: "대상월", comparisonMonth: "비교월", from: "시작일", to: "종료일", date: "날짜",
    merchant: "거래처", memo: "메모", amount: "금액", reimbursement: "받은 정산금",
    consumption: "내 소비", income: "수입", sector: "분류", subcategory: "세부 분류",
    flow: "거래 종류", incomeKind: "입금 종류", classificationMode: "분류 방식", cardRef: "카드", canceled: "취소 여부",
    total: "검색 건수", count: "건수", transactionCount: "거래 건수", totalCount: "전체 건수",
    need: "가족 부담 필요액", received: "가족 입금", difference: "차액", settlementBalance: "누적 정산",
    repaymentReserve: "상환 예정 보관액", cashBalance: "현금 잔액", cashHeld: "보관 중인 현금",
    savings: "저축", savingsRate: "저축률", debtPrincipal: "대출 원금", pending: "예정 내역",
    disposable: "사용 가능한 금액", remaining: "남은 금액", planned: "예정액", actual: "실제액",
    current: "대상 기간", comparison: "비교 기간", delta: "증감", change: "변화",
    categories: "분류별 내역", merchants: "거래처별 내역", groups: "항목별 내역",
    items: "조회 거래", rows: "내역", warnings: "확인할 사항", note: "안내", message: "안내",
    period: "집계 기간", scope: "집계 기준", cutoffDay: "비교 종료일", lastRecordedDate: "마지막 기록일",
    familyTargetMonth: "정산 대상월", familySender: "보낸 사람", name: "항목", label: "항목",
    gross: "결제액", reimbursed: "정산금", incomeTotal: "수입 합계", consumptionTotal: "소비 합계",
    pendingExpense: "미반영 예정 지출", availableMonths: "기록이 있는 월", status: "상태",
    incomeBreakdown: "수입 구성", expenseBreakdown: "소비 구성", family: "가족 정산",
    scheduled: "예정 지출", posted: "반영 여부", totalConsumption: "소비 합계", totalIncome: "수입 합계",
    totalPayment: "총 결제액", consumptionSpend: "내 소비 지출", actualSavings: "실제 저축",
    debtRepayment: "내 대출 원금 상환", legalDebtRepayment: "전체 대출 원금 상환", loanSettlementDelta: "대출 지원 정산 차액",
    familyNeed: "가족 부담 필요액", familyReceived: "가족 입금", familyDifference: "이번 달 가족 차액",
    familyBalance: "가족 누적 정산", familyCashHeld: "가족 보관액", freeBalance: "사용 가능한 잔액",
    assetGrowth: "자산 증가", scheduledPersonal: "내 부담 예정액", expectedFreeBalance: "예정 지출 후 잔액",
    specialIncome: "특별 수입", currentAmount: "대상월 소비", comparisonAmount: "비교월 소비",
    currentCount: "대상월 보고 행 수", comparisonCount: "비교월 보고 행 수", countBasis: "건수 집계 기준", percentageChange: "증감률",
    sectors: "분류별 비교", subcategories: "세부 분류별 비교", evidence: "근거 거래", coverage: "기록 범위",
    firstRecordedDate: "첫 기록일", limitPerPeriod: "기간별 표시 건수", basis: "계산 기준",
    cumulativeNeed: "누적 가족 필요액", cumulativeReceived: "누적 가족 입금", adjustmentTotal: "누적 조정액",
    cashAdjustment: "현금 조정액", receiptCount: "입금 건수", obligationCount: "부담 항목 수",
    today: "오늘", months: "기록이 있는 월", cards: "카드 구분", accounting: "집계 기준", changes: "변경 안내", installment: "할부 여부"
  };
  const omitted = new Set(["ref", "refs", "code", "planId", "recordKey", "transactionId", "offset", "limit", "hasMore", "fields"]);
  const moneyKeys = new Set(["amount", "reimbursement", "consumption", "income", "need", "received", "difference",
    "settlementBalance", "repaymentReserve", "cashBalance", "cashHeld", "savings", "debtPrincipal", "disposable",
    "remaining", "planned", "actual", "delta", "change", "gross", "reimbursed", "incomeTotal", "consumptionTotal",
    "pendingExpense", "totalConsumption", "totalIncome", "totalPayment", "consumptionSpend", "actualSavings", "debtRepayment",
    "legalDebtRepayment", "loanSettlementDelta", "familyNeed", "familyReceived", "familyDifference", "familyBalance", "familyCashHeld",
    "freeBalance", "assetGrowth", "scheduled", "scheduledPersonal", "expectedFreeBalance", "specialIncome", "cumulativeNeed",
    "cumulativeReceived", "adjustmentTotal", "cashAdjustment"]);

  function valueText(value, key = "") {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "예" : "아니요";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return "확인 필요";
      const number = value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
      if (["savingsRate", "percentageChange"].includes(key)) return `${number}%`;
      return moneyKeys.has(key) || /Amount$|Balance$|Reserve$/.test(key) ? `${number}원` : number;
    }
    if (key === "flow") return { income: "입금", expense: "지출" }[value] || String(value);
    if (key === "incomeKind") return { normal: "일반 수입", familySupport: "가족 지원" }[value] || String(value);
    if (key === "classificationMode") return { automatic: "자동", manual: "직접 지정" }[value] || String(value);
    return String(value);
  }

  function previewChange(change) {
    const before = change.before || {};
    const after = change.after || {};
    const fields = [...new Set([...(change.fields || []), ...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !omitted.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    return {
      title: [before.merchant || after.merchant || "거래", before.date || after.date, valueText(before.amount ?? after.amount, "amount")].filter(Boolean).join(" · "),
      before: Object.fromEntries(fields.map((key) => [key, before[key]])),
      after: Object.fromEntries(fields.map((key) => [key, after[key]]))
    };
  }

  function createConversation({ tools, respond, onText = () => {}, onTool = () => {} }) {
    let history = [];
    let running = false;
    let revision = 0;
    const allowed = new Set(tools.definitions.flatMap((tool) => tool.type === "namespace"
      ? (tool.tools || []).map((child) => child.name) : [tool.name]));
    return Object.freeze({
      clear() { history = []; revision += 1; },
      async send(message, model, signal) {
        if (running) throw new Error("현재 답변을 마친 뒤 다시 요청해 주세요.");
        if (typeof message !== "string" || !message.trim() || message.length > 6000) throw new Error("질문을 6,000자 이내로 입력해 주세요.");
        if (!model) throw new Error("사용할 모델을 선택해 주세요.");
        const currentRevision = revision;
        const assertActive = () => {
          if (signal?.aborted || revision !== currentRevision) throw new Error("요청이 중지되었습니다.");
        };
        running = true;
        const draft = [...history, { role: "user", content: message.trim() }];
        try {
          for (let round = 0; round < MAX_ROUNDS; round += 1) {
            assertActive();
            if (JSON.stringify(draft).length > MAX_HISTORY_SIZE) throw new Error("대화가 길어졌습니다. 새 대화로 시작해 주세요.");
            const response = await respond({ input: draft, tools: tools.definitions, model }, signal);
            assertActive();
            if (!Array.isArray(response?.output)) throw new Error("답변 형식을 확인할 수 없습니다. 다시 시도해 주세요.");
            const output = response.output.filter((item) => item && ["message", "function_call", "reasoning"].includes(item.type));
            if (output.some((item) => item.type === "function_call" && (typeof item.call_id !== "string" || !item.call_id || typeof item.name !== "string"))) {
              throw new Error("작업 요청 형식을 확인할 수 없습니다. 다시 요청해 주세요.");
            }
            draft.push(...output);
            const calls = output.filter((item) => item.type === "function_call");
            let hasAnswer = false;
            for (const item of output.filter((entry) => entry.type === "message")) {
              const content = (item.content || []).filter((part) => part.type === "output_text" || part.type === "refusal")
                .map((part) => part.text || part.refusal || "").join("\n");
              if (content) { hasAnswer = true; onText(content); }
            }
            if (!calls.length) {
              if (!hasAnswer) throw new Error("완성된 답변을 받지 못했습니다. 다시 요청해 주세요.");
              history = draft;
              return;
            }
            if (calls.length > 12) throw new Error("한 번에 요청된 작업이 너무 많습니다. 범위를 줄여 주세요.");
            for (const call of calls) {
              assertActive();
              let result;
              try {
                if (!allowed.has(call.name) || !call.call_id) throw new Error("허용되지 않은 가계부 작업입니다.");
                const args = JSON.parse(call.arguments || "{}");
                if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("작업 조건을 다시 확인해 주세요.");
                result = await tools.execute(call.name, args);
                assertActive();
                onTool(call.name, result);
              } catch (error) {
                assertActive();
                result = { error: error.message || "가계부 작업을 처리하지 못했습니다." };
              }
              draft.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
            }
          }
          throw new Error("작업 횟수 제한에 도달했습니다. 조회 기간이나 요청 범위를 줄여 주세요.");
        } finally { running = false; }
      }
    });
  }

  function setupLedgerAgent() {
    const trigger = document.getElementById("ledgerAgentButton");
    if (!trigger || document.getElementById("ledgerAgentDialog")) return;
    const tools = globalThis.LedgerAgentTools;
    if (!tools) return;
    let backend = null;
    let sessionId = "";
    let busy = false;
    let controller = null;
    let scope = globalThis.BudgetCloud?.generation?.();
    const planButtons = new Set();
    let cardNames = new Map();
    const el = (tag, className = "", text = "") => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const button = (text, action, className = "") => {
      const node = el("button", className, text); node.type = "button";
      if (action) node.addEventListener("click", action);
      return node;
    };
    const field = (label, type, value = "") => {
      const wrapper = el("label", "agent-field", label);
      const input = el("input"); input.type = type; input.value = value;
      wrapper.append(input); return { wrapper, input };
    };
    const dialog = el("dialog", "ledger-agent-dialog"); dialog.id = "ledgerAgentDialog";
    dialog.setAttribute("aria-labelledby", "ledgerAgentTitle");
    const body = el("div", "agent-body");
    const heading = el("div", "agent-heading");
    const title = el("h2", "", "가계부 에이전트"); title.id = "ledgerAgentTitle";
    const close = button("닫기", () => dialog.close());
    heading.append(title, close);
    const intro = el("p", "agent-note", "내 가계부의 숫자를 확인하고 변경 내용을 검토하세요. 기록은 직접 적용하기 전까지 바뀌지 않습니다.");
    const connection = el("section", "agent-connection");
    const status = el("p", "agent-status", "연결 상태를 확인해 주세요."); status.setAttribute("role", "status");
    const subscription = button("ChatGPT 구독 로그인 · 승인 대기"); subscription.disabled = true;
    const subscriptionHelp = el("p", "agent-note", "웹서비스의 구독 연동은 OpenAI 접근 승인 후 제공됩니다. 승인 전에는 구독 로그인을 사용할 수 없습니다.");
    const apiDetails = el("details", "agent-api-options");
    apiDetails.append(el("summary", "", "선택 사항 · 내 API 키로 유료 연결"));
    const apiForm = el("form", "agent-api-form");
    const apiKey = field("OpenAI API 키", "password");
    apiKey.input.autocomplete = "off"; apiKey.input.spellcheck = false; apiKey.input.maxLength = 1024;
    const consentLabel = el("label", "agent-check");
    const consent = el("input"); consent.type = "checkbox";
    consentLabel.append(consent, document.createTextNode("ChatGPT 구독과 별도로 API 사용료가 발생하는 연결을 선택합니다."));
    const connect = el("button", "primary-action", "내 API 키로 연결"); connect.type = "submit";
    const privacy = el("p", "agent-note", "질문과 답변에 필요한 조회 결과만 AI에 전달합니다. API 키는 연결 서버에 전달되며 가계부 기록·백업이나 브라우저 저장소에 저장하지 않습니다. AI 연결 계정을 바꿔도 현재 열어 둔 가계부는 자동으로 바뀌지 않습니다.");
    apiForm.append(apiKey.wrapper, consentLabel, privacy, connect); apiDetails.append(apiForm);
    const modelLabel = el("label", "agent-field", "사용 모델");
    const model = el("select"); modelLabel.append(model);
    const disconnect = button("API 연결 해제", () => void disconnectSession());
    const refresh = button("연결 상태 새로 확인", () => void refreshConnection());
    const connectionActions = el("div", "agent-actions"); connectionActions.append(modelLabel, disconnect, refresh);
    connection.append(status, subscription, subscriptionHelp, apiDetails, connectionActions);

    const local = el("section", "agent-local");
    local.append(el("h3", "", "바로 확인"), el("p", "agent-note", "아래 조회는 AI 연결 없이 현재 기기의 가계부에서 계산합니다."));
    const today = typeof currentMonthKey === "function" ? currentMonthKey() : new Date().toISOString().slice(0, 7);
    const previous = typeof shiftMonthKey === "function" ? shiftMonthKey(today, -1) : today;
    const month = field("대상월", "month", today);
    const comparison = field("비교월", "month", previous);
    const query = field("거래 검색어", "search"); query.input.maxLength = 200;
    const localFields = el("div", "agent-fields"); localFields.append(month.wrapper, comparison.wrapper, query.wrapper);
    const localActions = el("div", "agent-actions");
    const localButtons = [
      button("월 지표", () => void runLocal("monthly_metrics", { month: month.input.value })),
      button("월 비교", () => void runLocal("compare_spending", { month: month.input.value, comparisonMonth: comparison.input.value })),
      button("가족 정산", () => void runLocal("family_settlement", { month: month.input.value })),
      button("거래 검색", () => void runLocal("search_transactions", { month: month.input.value, query: query.input.value, limit: 25 }))
    ];
    localActions.append(...localButtons); local.append(localFields, localActions);
    const feedback = el("p", "agent-feedback"); feedback.setAttribute("role", "status");
    const results = el("div", "agent-results");
    const messages = el("div", "agent-messages"); messages.setAttribute("role", "log"); messages.setAttribute("aria-label", "에이전트 대화");
    const chat = el("form", "agent-chat");
    const promptLabel = el("label", "agent-field", "가계부에 물어보기");
    const prompt = el("textarea"); prompt.rows = 3; prompt.maxLength = 6000;
    prompt.placeholder = "이번 달과 지난달의 식비 차이를 알려줘"; promptLabel.append(prompt);
    const send = el("button", "primary-action", "보내기"); send.type = "submit";
    const stop = button("응답 중지", () => { controller?.abort(); conversation.clear(); }); stop.disabled = true;
    const clear = button("새 대화", () => clearConversation("대화와 미적용 제안을 지웠습니다. 가계부 기록은 유지됩니다."));
    const chatActions = el("div", "agent-actions"); chatActions.append(send, stop, clear);
    chat.append(promptLabel, chatActions);
    body.append(heading, intro, connection, local, feedback, results, messages, chat);
    dialog.append(body); document.body.append(dialog);

    function setFeedback(message, error = false) {
      feedback.textContent = message; feedback.classList.toggle("is-error", error);
    }
    function message(kind, text) {
      const node = el("article", `agent-message agent-message-${kind}`);
      node.append(el("strong", "", kind === "user" ? "나" : "가계부 에이전트"), el("p", "", text));
      messages.append(node);
    }
    function clearConversation(note = "") {
      controller?.abort(); conversation.clear(); tools.clearSession();
      messages.replaceChildren(); results.replaceChildren();
      for (const control of planButtons) control.disabled = true;
      planButtons.clear(); scope = globalThis.BudgetCloud?.generation?.();
      if (note) setFeedback(note);
    }
    function checkScope() {
      if (scope !== globalThis.BudgetCloud?.generation?.()) clearConversation("가계부가 갱신되어 새 대화로 시작합니다.");
    }
    function refreshControls() {
      const connected = backend?.session?.connected === true && backend.session.mode === "api";
      prompt.disabled = busy || !connected || !model.value;
      send.disabled = prompt.disabled; stop.disabled = !busy; clear.disabled = busy;
      connect.disabled = busy || backend?.api?.available !== true;
      model.disabled = busy || !connected; disconnect.disabled = busy || !connected;
      refresh.disabled = busy;
      for (const control of localButtons) control.disabled = busy;
      for (const control of planButtons) control.disabled = busy || control.dataset.applied === "true";
    }
    async function request(path, data, signal) {
      const response = await fetch(new URL(`agent-api/${path}`, document.baseURI), {
        method: data === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
        headers: { "X-Ledger-Agent": "1", ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal
      });
      if (response.status === 404) throw new Error("에이전트 연결 서버가 아직 준비되지 않았습니다. 아래의 바로 확인 기능은 사용할 수 있습니다.");
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("에이전트 연결 서버가 아직 준비되지 않았습니다. 아래의 바로 확인 기능은 사용할 수 있습니다.");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "에이전트 연결에 실패했습니다.");
      return payload;
    }
    function acceptStatus(next) {
      const nextId = next?.session?.id || "";
      if (nextId !== sessionId || (backend?.session?.connected && !next?.session?.connected)) clearConversation();
      sessionId = nextId; backend = next;
      const selected = next?.session?.model || "";
      model.replaceChildren(); const empty = el("option", "", "모델 선택"); empty.value = ""; model.append(empty);
      for (const name of next?.session?.models || []) {
        if (typeof name !== "string") continue;
        const option = el("option", "", name); option.value = name; model.append(option);
      }
      model.value = selected;
      status.textContent = next?.session?.connected
        ? "내 API 연결 · 별도 과금 사용 중" : "구독 연동 승인 대기 · AI 미연결";
      refreshControls();
    }
    async function refreshConnection() {
      try { checkScope(); acceptStatus(await request("status")); }
      catch (error) {
        if (backend?.session?.connected) clearConversation();
        backend = null; sessionId = ""; model.replaceChildren();
        status.textContent = error.message; refreshControls();
      }
    }
    async function disconnectSession() {
      busy = true; refreshControls();
      try { await request("logout", { sessionId }); clearConversation(); await refreshConnection(); }
      catch (error) { setFeedback(error.message, true); }
      finally { busy = false; refreshControls(); }
    }
    function renderData(value, key = "", depth = 0) {
      if (key === "cardRef") return el("span", "", value ? (cardNames.get(value) || "연결 카드") : "—");
      if (value === null || typeof value !== "object") return el("span", "", valueText(value, key));
      if (depth > 5) return el("span", "", "상세 내역은 해당 가계부 화면에서 확인해 주세요.");
      if (Array.isArray(value)) {
        const list = el("div", "agent-result-list");
        if (!value.length) list.append(el("p", "agent-note", "해당 내역이 없습니다."));
        for (const item of value.slice(0, 100)) {
          const card = el("div", "agent-result-item"); card.append(renderData(item, key, depth + 1));
          if (item?.ref && item?.merchant !== undefined && !item.canceled) {
            card.append(button("이 거래 수정 검토", () => showEditForm(item)));
          }
          list.append(card);
        }
        return list;
      }
      const list = el("dl", "agent-data");
      for (const [name, item] of Object.entries(value)) {
        if (omitted.has(name)) continue;
        const group = el("div", item && typeof item === "object" ? "agent-data-wide" : "");
        group.append(el("dt", "", labels[name] || name));
        const detail = el("dd"); detail.append(renderData(item, name, depth + 1)); group.append(detail); list.append(group);
      }
      return list;
    }
    function showResult(name, result) {
      cardNames = new Map((tools.context().cards || []).map((card) => [card.ref, card.label]));
      const titleText = { monthly_metrics: "월별 지표", compare_spending: "월별 소비 비교", family_settlement: "가족 정산", search_transactions: "거래 검색", ledger_context: "가계부 범위" }[name] || "조회 결과";
      if (name === "propose_changes") { showPlan(result); return; }
      const details = el("details", "agent-result"); details.open = true;
      details.append(el("summary", "", titleText), renderData(result)); results.prepend(details);
      while (results.children.length > 12) results.lastElementChild.remove();
    }
    function showPlan(result) {
      cardNames = new Map((tools.context().cards || []).map((card) => [card.ref, card.label]));
      const plan = tools.getPlan(result.planId);
      if (!plan) throw new Error("수정 제안을 찾을 수 없습니다. 다시 요청해 주세요.");
      const card = el("section", "agent-plan");
      card.append(el("h3", "", "변경 전후 확인"), el("p", "agent-note", "아래 내용을 확인한 뒤 적용해 주세요. 아직 가계부는 바뀌지 않았습니다."));
      for (const change of plan.changes) {
        const preview = previewChange(change);
        card.append(el("h4", "agent-plan-title", preview.title));
        const comparisonRow = el("div", "agent-plan-comparison");
        for (const [key, titleText] of [["before", "변경 전"], ["after", "변경 후"]]) {
          const side = el("div"); side.append(el("strong", "agent-plan-side", titleText), renderData(preview[key])); comparisonRow.append(side);
        }
        card.append(comparisonRow);
      }
      const state = el("p", "agent-note"); state.setAttribute("role", "status");
      const apply = button("확인한 변경 적용", async (event) => {
        if (!event.isTrusted || busy || apply.dataset.applied === "true") return;
        busy = true; refreshControls();
        try {
          checkScope();
          const applied = await tools.applyPlan(plan.planId);
          apply.dataset.applied = "true";
          state.textContent = `${applied.changedCount}건의 변경을 저장했습니다.`;
          conversation.clear();
          for (const control of planButtons) control.disabled = true;
          planButtons.clear();
          setFeedback("변경을 저장했습니다. 다음 질문은 갱신된 기록으로 새로 계산합니다.");
        } catch (error) { state.textContent = error.message || "변경을 저장하지 못했습니다."; }
        finally { busy = false; apply.disabled = apply.dataset.applied === "true"; refreshControls(); }
      }, "primary-action");
      const dismiss = button("적용하지 않기", () => { apply.dataset.applied = "true"; apply.disabled = true; card.remove(); planButtons.delete(apply); });
      const actions = el("div", "agent-actions"); actions.append(apply, dismiss);
      card.append(state, actions); results.prepend(card); planButtons.add(apply); refreshControls();
    }
    function showEditForm(item) {
      if (busy) return;
      const form = el("form", "agent-edit-form");
      form.append(el("h3", "", "거래 수정안 만들기"));
      const fields = {
        date: field("날짜", "date", item.date), merchant: field("거래처", "text", item.merchant),
        amount: field("금액", "number", String(item.amount)), reimbursement: field("정산받은 금액", "number", String(item.reimbursement || 0)),
        memo: field("메모", "text", item.memo || "")
      };
      fields.amount.input.step = "1"; fields.amount.input.min = "0";
      fields.reimbursement.input.step = "1"; fields.reimbursement.input.min = "0";
      fields.merchant.input.maxLength = 200; fields.memo.input.maxLength = 1000;
      const grid = el("div", "agent-fields"); Object.values(fields).forEach((value) => grid.append(value.wrapper));
      const create = el("button", "", "변경 전후 미리보기"); create.type = "submit";
      form.append(grid, create, button("닫기", () => form.remove()));
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); if (busy) return;
        const patch = { ref: item.ref };
        for (const [key, value] of Object.entries(fields)) {
          const next = ["amount", "reimbursement"].includes(key) ? Number(value.input.value) : value.input.value;
          if (next !== (item[key] ?? "")) patch[key] = next;
        }
        try { showPlan(await tools.execute("propose_changes", { changes: [patch] })); form.remove(); }
        catch (error) { setFeedback(error.message, true); }
      });
      results.prepend(form); fields.date.input.focus();
    }
    async function runLocal(name, args) {
      if (busy) return;
      busy = true; refreshControls();
      try { checkScope(); showResult(name, await tools.execute(name, args)); setFeedback("현재 가계부에서 계산했습니다. AI로 데이터를 보내지 않았습니다."); }
      catch (error) { setFeedback(error.message, true); }
      finally { busy = false; refreshControls(); }
    }
    const conversation = createConversation({
      tools, respond: async (payload, signal) => {
        const response = await request("respond", { ...payload, sessionId }, signal);
        checkScope();
        return response;
      },
      onText: (text) => message("assistant", text), onTool: showResult
    });
    apiForm.addEventListener("submit", async (event) => {
      event.preventDefault(); if (busy) return;
      if (!consent.checked) { setFeedback("별도 API 과금 연결을 선택한 경우에만 체크해 주세요.", true); return; }
      const secret = apiKey.input.value.trim(); apiKey.input.value = "";
      if (!secret) { setFeedback("사용할 API 키를 입력해 주세요.", true); return; }
      busy = true; refreshControls();
      try { acceptStatus(await request("api-session", { apiKey: secret, billingConsent: true })); clearConversation(); setFeedback("API 연결을 확인했습니다. 사용할 모델을 선택해 주세요."); }
      catch (error) { setFeedback(error.message, true); }
      finally { busy = false; refreshControls(); }
    });
    model.addEventListener("change", async () => {
      if (busy || !model.value) return;
      busy = true; refreshControls();
      try { acceptStatus(await request("model", { model: model.value, sessionId })); clearConversation(); }
      catch (error) { model.value = backend?.session?.model || ""; setFeedback(error.message, true); }
      finally { busy = false; refreshControls(); }
    });
    chat.addEventListener("submit", async (event) => {
      event.preventDefault(); if (busy || send.disabled || !prompt.value.trim()) return;
      const text = prompt.value.trim(); busy = true; controller = new AbortController(); refreshControls();
      try {
        checkScope(); acceptStatus(await request("status", undefined, controller.signal));
        if (!backend?.session?.connected || !model.value) throw new Error("AI 연결과 모델 선택을 먼저 확인해 주세요.");
        prompt.value = ""; message("user", text); setFeedback("질문에 필요한 가계부 내역을 확인하고 있습니다.");
        await conversation.send(text, model.value, controller.signal);
        setFeedback("답변을 마쳤습니다. 수정 제안은 직접 적용하기 전까지 저장되지 않습니다.");
      } catch (error) { setFeedback(controller?.signal.aborted ? "요청을 중지했습니다. 미적용 변경은 저장되지 않았습니다." : error.message, true); }
      finally { busy = false; controller = null; refreshControls(); }
    });
    trigger.addEventListener("click", () => { dialog.showModal(); void refreshConnection(); });
    dialog.addEventListener("close", () => { apiKey.input.value = ""; controller?.abort(); trigger.focus(); });
    window.addEventListener("pagehide", () => { apiKey.input.value = ""; controller?.abort(); conversation.clear(); tools.clearSession(); });
    refreshControls();
  }

  globalThis.LedgerAgentConversation = Object.freeze({ create: createConversation });
  globalThis.LedgerAgentPresentation = Object.freeze({ previewChange, valueText });
  globalThis.setupLedgerAgent = setupLedgerAgent;
})();
