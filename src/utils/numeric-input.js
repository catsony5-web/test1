const NumericInput = (() => {
  const selector = "input[data-number-kind]";
  const groupedKinds = new Set(["money", "quantity", "decimal"]);
  const historyLimit = 100;
  const controls = new WeakMap();
  const composing = new WeakSet();
  let hintSequence = 0;
  let installed = false;

  function plainText(value, { kind = "", unit = "" } = {}) {
    let text = String(value ?? "").normalize("NFKC").trim();
    if (kind === "money") text = text.replace(/^₩\s*/, "").replace(/\s*원$/, "");
    else if (unit && text.endsWith(unit)) text = text.slice(0, -unit.length).trim();
    return text.replaceAll(",", "");
  }

  function parse(value, options = {}) {
    const text = plainText(value, options);
    if (!text) return { text, value: null, valid: true };
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return { text, value: NaN, valid: false };
    const number = Number(text);
    const lostFraction = Number.isInteger(number) && /\.[0-9]*[1-9]/.test(text);
    const valid = Number.isFinite(number) && !lostFraction && (!Number.isInteger(number) || Number.isSafeInteger(number));
    return { text, value: valid ? number : NaN, valid };
  }

  function format(value, options = {}) {
    const parsed = parse(value, options);
    if (!parsed.valid || parsed.value === null) return parsed.text;
    const sign = /^[+-]/.test(parsed.text) ? parsed.text[0] : "";
    const unsigned = parsed.text.replace(/^[+-]/, "");
    const [whole, fraction] = unsigned.split(".");
    const digits = (whole || "0").replace(/^0+(?=\d)/, "");
    return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
  }

  function koreanWon(value) {
    const parsed = parse(value, { kind: "money" });
    if (!parsed.valid || parsed.value === null) return "";
    const sign = parsed.value < 0 ? "-" : "";
    const [whole, fraction = ""] = parsed.text.replace(/^[+-]/, "").split(".");
    let digits = (whole || "0").replace(/^0+(?=\d)/, "");
    const units = ["", "만", "억", "조", "경"];
    const pieces = [];
    let index = 0;
    while (digits) {
      const group = Number(digits.slice(-4));
      if (group) pieces.unshift(`${format(String(group))}${units[index]}`);
      digits = digits.slice(0, -4);
      index += 1;
    }
    const decimals = fraction.replace(/0+$/, "");
    if (decimals) {
      if (pieces.length && /\d$/.test(pieces.at(-1))) pieces[pieces.length - 1] += `.${decimals}`;
      else pieces.push(`0.${decimals}`);
    }
    if (!pieces.length) pieces.push("0");
    return `${sign}${pieces.join(" ")}${/[만억조경]$/.test(pieces.at(-1)) ? " " : ""}원`;
  }

  function validationMessage(parsed, { required = false, min = "", max = "", step = "any", base = "0" } = {}) {
    if (parsed.value === null) return required ? "값을 입력해주세요. 0과 빈칸은 다릅니다." : "";
    if (!parsed.valid) return "숫자를 확인해주세요. 쉼표와 소수점, 앞쪽 부호만 사용할 수 있습니다.";
    if (min !== "" && parsed.value < Number(min)) return `${format(min)} 이상 입력해주세요.`;
    if (max !== "" && parsed.value > Number(max)) return `${format(max)} 이하 입력해주세요.`;
    if (step !== "any" && Number(step) > 0) {
      const offset = (parsed.value - Number(min !== "" ? min : base)) / Number(step);
      if (Math.abs(offset - Math.round(offset)) > 1e-7) return `${format(step)} 단위로 입력해주세요.`;
    }
    return "";
  }

  function optionsFor(input) {
    const source = input.dataset.numberUnitSource && input.ownerDocument.getElementById(input.dataset.numberUnitSource);
    const unit = source ? source.value : input.dataset.numberUnit ?? ({ money: "원", quantity: "개", percent: "%" }[input.dataset.numberKind] || "");
    return { kind: input.dataset.numberKind, unit };
  }

  function read(input) {
    if (input?.validity?.badInput) return NaN;
    return parse(input?.value, input ? optionsFor(input) : {}).value;
  }

  function caretPosition(value, logicalPosition) {
    if (!logicalPosition) return 0;
    let seen = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] !== ",") seen += 1;
      if (seen === logicalPosition) return index + 1;
    }
    return value.length;
  }

  function editState(input) {
    return { value: input.value, start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection };
  }

  function resetHistory(input) {
    const entry = controls.get(input);
    if (entry && groupedKinds.has(input.dataset.numberKind)) {
      entry.history = { states: [editState(input)], index: 0, replaying: false };
    }
  }

  function prepareEdit(input) {
    const entry = controls.get(input);
    if (!entry?.history) return;
    // A value assigned by application code starts a new editing context.
    if (entry.history.states[entry.history.index].value !== input.value) {
      update(input);
      resetHistory(input);
    }
    entry.history.states[entry.history.index] = editState(input);
  }

  function finishEdit(input) {
    const history = controls.get(input)?.history;
    if (!history || history.replaying) return;
    const state = editState(input);
    if (history.states[history.index].value === state.value) {
      history.states[history.index] = state;
      return;
    }
    history.states.splice(history.index + 1);
    history.states.push(state);
    if (history.states.length > historyLimit) history.states.shift();
    history.index = history.states.length - 1;
  }

  function restoreEdit(input, direction) {
    const entry = controls.get(input);
    if (!entry?.history) return;
    prepareEdit(input);
    const history = entry.history;
    const index = history.index + direction;
    if (index < 0 || index >= history.states.length) return;
    const state = history.states[index];
    history.index = index;
    input.value = state.value;
    if (state.start !== null) input.setSelectionRange(state.start, state.end, state.direction);
    update(input);
    history.replaying = true;
    try {
      input.dispatchEvent(new input.ownerDocument.defaultView.InputEvent("input", {
        bubbles: true, inputType: direction < 0 ? "historyUndo" : "historyRedo"
      }));
    } finally {
      history.replaying = false;
    }
  }

  function update(input) {
    const entry = controls.get(input);
    if (!entry || composing.has(input)) return true;
    const options = optionsFor(input);
    const parsed = input.validity.badInput ? { text: input.value, value: NaN, valid: false } : parse(input.value, options);
    const message = input.disabled ? "" : validationMessage(parsed, {
      required: input.required,
      min: input.getAttribute("min") ?? "",
      max: input.getAttribute("max") ?? "",
      step: input.getAttribute("step") || entry.defaultStep,
      base: entry.stepBase
    });
    if (parsed.valid && groupedKinds.has(options.kind)) {
      const next = format(input.value, options);
      if (next !== input.value) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const direction = input.selectionDirection;
        const before = input.value;
        input.value = next;
        if (start !== null && input === input.ownerDocument.activeElement) {
          const logical = (position) => plainText(before.slice(0, position), options).length;
          input.setSelectionRange(caretPosition(next, logical(start)), caretPosition(next, logical(end)), direction);
        }
      }
    }
    input.setCustomValidity(message);
    if (message && input.value !== "") input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    entry.unit.textContent = options.unit;
    entry.unit.hidden = !options.unit;
    entry.hint.textContent = input.value && message ? message : options.kind === "money" ? koreanWon(input.value) : "";
    entry.hint.hidden = !entry.hint.textContent;
    entry.wrapper.classList.toggle("has-number-error", Boolean(message && input.value));
    return !message;
  }

  function inputsIn(root) {
    const inputs = root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
    if (root?.matches?.(selector)) inputs.unshift(root);
    return inputs;
  }

  function enhance(root = document) {
    for (const input of inputsIn(root)) {
      if (controls.has(input)) continue;
      const doc = input.ownerDocument;
      const defaultStep = input.type === "number" ? "1" : "any";
      const stepBase = input.type === "number" ? String(parse(input.getAttribute("value")).value || 0) : "0";
      if (groupedKinds.has(input.dataset.numberKind)) {
        input.type = "text";
        if (!input.inputMode) input.inputMode = input.dataset.numberKind === "decimal" ? "decimal" : "numeric";
      }
      const wrapper = doc.createElement("span");
      wrapper.className = "numeric-input-control";
      const line = doc.createElement("span");
      line.className = "numeric-input-line";
      const unit = doc.createElement("span");
      unit.className = "numeric-input-unit";
      unit.setAttribute("aria-hidden", "true");
      const hint = doc.createElement("small");
      hint.className = "numeric-input-hint";
      hint.id = `numeric-input-hint-${++hintSequence}`;
      input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), hint.id].filter(Boolean).join(" "));
      input.before(wrapper);
      wrapper.append(line, hint);
      line.append(input, unit);
      controls.set(input, { wrapper, unit, hint, defaultStep, stepBase });
      update(input);
      resetHistory(input);
    }
  }

  function refresh(root = document, { resetEditing = false } = {}) {
    enhance(root);
    inputsIn(root).forEach((input) => {
      const entry = controls.get(input);
      if (composing.has(input)) {
        entry.resetAfterComposition = true;
        return;
      }
      const changed = entry.history && entry.history.states[entry.history.index].value !== input.value;
      update(input);
      if (changed || resetEditing) resetHistory(input);
    });
  }

  function validate(root = document) {
    enhance(root);
    const invalid = inputsIn(root).filter((input) => !update(input));
    invalid[0]?.reportValidity();
    return invalid.length === 0;
  }

  function install(doc = document) {
    if (installed) return;
    installed = true;
    enhance(doc);
    const editable = (event) => event.target.matches?.(selector)
      && groupedKinds.has(event.target.dataset.numberKind)
      && !event.target.disabled && !event.target.readOnly && !event.isComposing && !composing.has(event.target);
    doc.addEventListener("keydown", (event) => {
      if (!editable(event) || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      enhance(event.target);
      event.preventDefault();
      restoreEdit(event.target, key === "y" || event.shiftKey ? 1 : -1);
    }, true);
    doc.addEventListener("beforeinput", (event) => {
      const input = event.target;
      if (!editable(event)) return;
      enhance(input);
      if (["historyUndo", "historyRedo"].includes(event.inputType)) {
        event.preventDefault();
        restoreEdit(input, event.inputType === "historyUndo" ? -1 : 1);
        return;
      }
      prepareEdit(input);
      const start = input.selectionStart;
      if (start === null || start !== input.selectionEnd) return;
      if (event.inputType === "deleteContentBackward" && input.value[start - 1] === ",") input.setSelectionRange(start - 2, start);
      if (event.inputType === "deleteContentForward" && input.value[start] === ",") input.setSelectionRange(start, start + 2);
    }, true);
    doc.addEventListener("compositionstart", (event) => {
      if (!event.target.matches?.(selector)) return;
      enhance(event.target);
      prepareEdit(event.target);
      composing.add(event.target);
    }, true);
    doc.addEventListener("compositionend", (event) => {
      if (!event.target.matches?.(selector)) return;
      composing.delete(event.target);
      update(event.target);
      const entry = controls.get(event.target);
      if (entry.resetAfterComposition) {
        resetHistory(event.target);
        entry.resetAfterComposition = false;
      } else finishEdit(event.target);
    }, true);
    for (const name of ["input", "change"]) doc.addEventListener(name, (event) => {
      if (event.target.matches?.(selector)) {
        if (event.isComposing || composing.has(event.target)) return;
        enhance(event.target);
        if (!update(event.target) && name === "change") event.stopImmediatePropagation();
        if (name === "input") finishEdit(event.target);
      }
      if (name === "change" && event.target.id) {
        doc.querySelectorAll("input[data-number-unit-source]").forEach((input) => {
          if (input.dataset.numberUnitSource === event.target.id) update(input);
        });
      }
    }, true);
    doc.addEventListener("submit", (event) => {
      if (!validate(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    doc.addEventListener("reset", (event) => queueMicrotask(() => refresh(event.target, { resetEditing: true })), true);
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1) enhance(node);
      }
    }).observe(doc.body, { childList: true, subtree: true });
  }

  return { parse, format, koreanWon, validationMessage, caretPosition, read, enhance, refresh, validate, install };
})();

if (typeof module !== "undefined" && module.exports) module.exports = NumericInput;
if (typeof document !== "undefined") NumericInput.install();
