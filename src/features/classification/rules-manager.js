function addRule(sector, subcategory, keyword, options = {}) {
  const cleanKeyword = String(keyword || "").trim();
  if (!cleanKeyword) return { added: false, reason: "empty" };
  const assignment = normalizeCategoryAssignment(sector, subcategory, cleanKeyword);
  const existing = findRuleByExactKeyword(cleanKeyword);
  if (existing && existing.sector === assignment.sector && existing.subcategory === assignment.subcategory) {
    reclassify();
    return { added: false, reason: "duplicate", rule: existing };
  }

  const rule = {
    sector: assignment.sector,
    subcategory: assignment.subcategory,
    keywords: [cleanKeyword],
    priority: existing ? Math.max(1, Number(existing.priority || 999) - 1) : nextPriority(assignment.sector),
    origin: options.origin || "user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  rules.push(rule);
  reclassify();
  return { added: true, rule, conflict: Boolean(existing) };
}

function findRuleByExactKeyword(keyword) {
  const normalized = normalizeKeyText(keyword);
  if (!normalized) return null;
  return rules.find((rule) =>
    Array.isArray(rule.keywords)
    && rule.keywords.some((candidate) => normalizeKeyText(candidate) === normalized)
  ) || null;
}

function nextPriority(sector) {
  const sectorRules = rules.filter((rule) => rule.sector === sector);
  const max = sectorRules.length ? Math.max(...sectorRules.map((rule) => rule.priority)) : 500;
  return max + 1;
}


function renderRules() {
  if (els.ruleFilterSector.options.length) readRuleFilterControls();
  syncRuleFilterControls();
  const entries = filteredRuleEntries();
  els.ruleFilterCount.textContent = `총 ${rules.length.toLocaleString("ko-KR")}개 규칙 중 ${entries.length.toLocaleString("ko-KR")}개 표시`;
  renderRuleFeedback();
  if (!rules.length) {
    els.rulesTable.innerHTML = `<tbody><tr><td class="empty">등록된 분류 규칙이 없습니다.</td></tr></tbody>`;
    return;
  }

  if (!entries.length) {
    els.rulesTable.innerHTML = `<tbody><tr><td class="empty">현재 필터에 맞는 분류 규칙이 없습니다.</td></tr></tbody>`;
    attachRuleHandlers();
    return;
  }

  const rows = entries.map(({ rule, index }) =>
    index === editingRuleIndex ? renderEditableRuleRow(rule, index) : renderRuleRow(rule, index)
  ).join("");
  els.rulesTable.innerHTML = `
    <thead>
      <tr>
        <th>타입</th>
        <th>섹터</th>
        <th>세부항목</th>
        <th>키워드</th>
        <th class="amount">우선순위</th>
        <th>관리</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
  attachRuleHandlers();
}

function syncRuleFilterControls() {
  const sectorOptions = ["all", ...ruleFilterSectors()];
  els.ruleFilterSector.innerHTML = sectorOptions
    .map((sector) => `<option value="${escapeHtml(sector)}">${sector === "all" ? "전체" : escapeHtml(sector)}</option>`)
    .join("");
  if (!sectorOptions.includes(ruleFilters.sector)) ruleFilters.sector = "all";
  els.ruleFilterSector.value = ruleFilters.sector;
  updateRuleFilterSubcategories();
  els.ruleFilterType.value = ruleFilters.type;
  els.ruleFilterSubcategory.value = ruleFilters.subcategory;
  els.ruleSearchInput.value = ruleFilters.search;
  els.ruleSortSelect.value = ruleFilters.sort;
}

function readRuleFilterControls() {
  ruleFilters.type = els.ruleFilterType.value || "all";
  ruleFilters.sector = els.ruleFilterSector.value || "all";
  ruleFilters.subcategory = els.ruleFilterSubcategory.value || "all";
  ruleFilters.search = els.ruleSearchInput.value.trim();
  ruleFilters.sort = els.ruleSortSelect.value || "priority";
}

function ruleFilterSectors() {
  return unique([...Object.keys(categories), ...rules.map((rule) => rule.sector)].filter((sector) => sector && sector !== "수입"));
}

function updateRuleFilterSubcategories() {
  const sector = els.ruleFilterSector.value || ruleFilters.sector || "all";
  const subcategories = sector === "all"
    ? unique(rules.map((rule) => rule.subcategory).filter(Boolean)).sort((a, b) => a.localeCompare(b, "ko-KR"))
    : categories[sector] || [];
  els.ruleFilterSubcategory.disabled = sector === "all";
  els.ruleFilterSubcategory.innerHTML = [
    `<option value="all">${sector === "all" ? "전체 세부항목" : "전체"}</option>`,
    ...subcategories.map((subcategory) => `<option value="${escapeHtml(subcategory)}">${escapeHtml(subcategory)}</option>`)
  ].join("");
  if (![...els.ruleFilterSubcategory.options].some((option) => option.value === ruleFilters.subcategory)) {
    ruleFilters.subcategory = "all";
  }
  els.ruleFilterSubcategory.value = ruleFilters.subcategory;
}

function filteredRuleEntries() {
  const search = normalizeKeyText(ruleFilters.search);
  const entries = rules
    .map((rule, index) => ({ rule, index, type: ruleTypeLabel(rule) }))
    .filter(({ rule, type }) => {
      if (ruleFilters.type !== "all" && type !== ruleFilters.type) return false;
      if (ruleFilters.sector !== "all" && rule.sector !== ruleFilters.sector) return false;
      if (ruleFilters.subcategory !== "all" && rule.subcategory !== ruleFilters.subcategory) return false;
      if (!search) return true;
      const haystack = normalizeKeyText([rule.sector, rule.subcategory, type, ...rule.keywords].join(" "));
      return haystack.includes(search);
    });

  return entries.sort((a, b) => {
    if (ruleFilters.sort === "sector") {
      return `${a.rule.sector} ${a.rule.subcategory} ${a.rule.priority}`.localeCompare(`${b.rule.sector} ${b.rule.subcategory} ${b.rule.priority}`, "ko-KR");
    }
    if (ruleFilters.sort === "updated") {
      return String(b.rule.updatedAt || b.rule.createdAt || "").localeCompare(String(a.rule.updatedAt || a.rule.createdAt || ""));
    }
    return Number(a.rule.priority || 999) - Number(b.rule.priority || 999);
  });
}

function renderRuleRow(rule, index) {
  return `
    <tr>
      <td>${ruleTypeBadge(rule)}</td>
      <td>${categoryChip(rule.sector)}</td>
      <td>${subcategoryPill(rule.sector, rule.subcategory)}</td>
      <td class="rule-keywords" title="${escapeHtml(rule.keywords.join(", "))}">${escapeHtml(rule.keywords.join(", "))}</td>
      <td class="amount">${Number(rule.priority || 999).toLocaleString("ko-KR")}</td>
      <td class="rule-actions">
        <button type="button" class="rule-edit-button" data-edit-rule="${index}">수정</button>
        <button type="button" class="rule-delete-button" data-delete-rule="${index}">삭제</button>
      </td>
    </tr>
  `;
}

function renderEditableRuleRow(rule, index) {
  return `
    <tr class="editing-rule-row">
      <td>${ruleTypeBadge(rule)}</td>
      <td>
        <select class="rule-edit-sector" data-edit-field="sector">
          ${ruleSectorOptionsHtml(rule.sector)}
        </select>
      </td>
      <td>
        <select class="rule-edit-subcategory" data-edit-field="subcategory">
          ${ruleSubcategoryOptionsHtml(rule.sector, rule.subcategory)}
        </select>
      </td>
      <td>
        <input class="rule-edit-keywords" data-edit-field="keywords" type="text" value="${escapeHtml(rule.keywords.join(", "))}" aria-label="규칙 키워드">
      </td>
      <td>
        <input class="rule-edit-priority" data-edit-field="priority" type="number" min="1" step="1" value="${escapeHtml(rule.priority || 999)}" aria-label="우선순위">
      </td>
      <td class="rule-actions">
        <button type="button" class="primary-action" data-save-rule="${index}">저장</button>
        <button type="button" data-cancel-rule-edit>취소</button>
      </td>
    </tr>
  `;
}

function attachRuleHandlers() {
  els.rulesTable.querySelectorAll("[data-edit-rule]").forEach((button) => {
    button.addEventListener("click", () => {
      editingRuleIndex = Number(button.dataset.editRule);
      ruleFeedback = null;
      pendingRuleChange = null;
      renderRules();
    });
  });

  els.rulesTable.querySelectorAll("[data-cancel-rule-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      editingRuleIndex = -1;
      renderRules();
    });
  });

  els.rulesTable.querySelectorAll(".rule-edit-sector").forEach((select) => {
    select.addEventListener("change", () => {
      const row = select.closest("tr");
      const subcategorySelect = row.querySelector(".rule-edit-subcategory");
      subcategorySelect.innerHTML = ruleSubcategoryOptionsHtml(select.value);
    });
  });

  els.rulesTable.querySelectorAll("[data-save-rule]").forEach((button) => {
    button.addEventListener("click", () => handleRuleEditSave(Number(button.dataset.saveRule), button.closest("tr")));
  });

  els.rulesTable.querySelectorAll("[data-delete-rule]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("이 분류 규칙을 삭제할까요?")) return;
      await createAutoSnapshot("분류 규칙 삭제 전");
      rules.splice(Number(button.dataset.deleteRule), 1);
      editingRuleIndex = -1;
      pendingRuleChange = null;
      ruleFeedback = { type: "success", message: "규칙을 삭제했습니다." };
      reclassify();
    });
  });

  els.ruleFeedback.querySelectorAll("[data-rule-apply]").forEach((button) => {
    button.addEventListener("click", () => finalizePendingRuleChange(button.dataset.ruleApply));
  });
}

function ruleSectorOptionsHtml(selected) {
  return Object.keys(categories)
    .filter((sector) => sector !== "수입")
    .map((sector) => `<option value="${escapeHtml(sector)}" ${sector === selected ? "selected" : ""}>${escapeHtml(sector)}</option>`)
    .join("");
}

function ruleSubcategoryOptionsHtml(sector, selected = "") {
  const options = categories[sector] || [];
  return options
    .map((subcategory) => `<option value="${escapeHtml(subcategory)}" ${subcategory === selected ? "selected" : ""}>${escapeHtml(subcategory)}</option>`)
    .join("");
}

async function handleRuleEditSave(index, row) {
  const currentRule = rules[index];
  if (!currentRule || !row) return;
  const sector = row.querySelector(".rule-edit-sector").value;
  const subcategory = row.querySelector(".rule-edit-subcategory").value;
  const keywords = parseKeywordInput(row.querySelector(".rule-edit-keywords").value);
  const priority = Number(row.querySelector(".rule-edit-priority").value);
  const validation = validateRuleChange(index, sector, subcategory, keywords, priority);
  if (!validation.ok) {
    ruleFeedback = { type: "warning", message: validation.message };
    renderRules();
    return;
  }
  if (validation.conflictMessage && !confirm(validation.conflictMessage)) return;

  await createAutoSnapshot("분류 규칙 수정 전");
  const oldRule = cloneRule(currentRule);
  const oldType = ruleTypeLabel(currentRule);
  const newRule = {
    sector,
    subcategory,
    keywords,
    priority: Number.isFinite(priority) && priority > 0 ? priority : nextPriority(sector),
    origin: oldType === "기본 규칙" || oldType === "수정된 기본 규칙"
      ? "modified-default"
      : currentRule.origin === "smart-suggestion" ? "smart-suggestion" : "user",
    createdAt: currentRule.createdAt || "",
    updatedAt: new Date().toISOString()
  };
  const frozenKeys = preserveExistingMatches(oldRule);
  rules[index] = newRule;
  editingRuleIndex = -1;
  pendingRuleChange = { index, oldRule, newRule, frozenKeys: [...frozenKeys] };
  ruleFeedback = {
    type: "success",
    message: "규칙이 수정되었습니다. 기존 거래에는 어떻게 적용할까요?",
    pending: true
  };
  await saveTransactions();
  await saveRules();
  renderRules();
}

function parseKeywordInput(value) {
  return unique(String(value || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean));
}

function validateRuleChange(index, sector, subcategory, keywords, priority) {
  if (!sector || !categories[sector]) return { ok: false, message: "섹터를 선택해주세요." };
  if (!subcategory || !categories[sector].includes(subcategory)) return { ok: false, message: "세부항목을 선택해주세요." };
  if (!keywords.length) return { ok: false, message: "키워드를 하나 이상 입력해주세요." };
  if (!Number.isFinite(priority) || priority <= 0) return { ok: false, message: "우선순위는 1 이상의 숫자로 입력해주세요. 숫자가 낮을수록 먼저 적용됩니다." };

  const exactDuplicates = [];
  const conflicts = [];
  const normalizedKeywords = keywords.map((keyword) => normalizeKeyText(keyword));
  rules.forEach((rule, ruleIndex) => {
    if (ruleIndex === index) return;
    rule.keywords.forEach((keyword) => {
      const normalized = normalizeKeyText(keyword);
      if (!normalizedKeywords.includes(normalized)) return;
      if (rule.sector === sector && rule.subcategory === subcategory) exactDuplicates.push(keyword);
      else conflicts.push(`${keyword}: ${rule.sector} > ${rule.subcategory}`);
    });
  });

  if (exactDuplicates.length) {
    return { ok: false, message: `같은 섹터/세부항목에 이미 있는 키워드입니다: ${unique(exactDuplicates).join(", ")}` };
  }
  return {
    ok: true,
    conflictMessage: conflicts.length
      ? `같은 키워드가 다른 분류에도 있습니다.\n${unique(conflicts).join("\n")}\n그래도 저장할까요? 숫자가 낮은 우선순위 규칙이 먼저 적용됩니다.`
      : ""
  };
}

async function finalizePendingRuleChange(mode) {
  if (!pendingRuleChange) return;
  if (mode === "future") {
    preserveExistingMatches(pendingRuleChange.oldRule);
    ruleFeedback = { type: "success", message: "기존 거래는 현재 분류로 고정하고, 수정한 규칙은 앞으로의 자동 분류에 적용합니다." };
  } else {
    applyRuleToExistingTransactions(pendingRuleChange.newRule, pendingRuleChange.oldRule, new Set(pendingRuleChange.frozenKeys || []));
    ruleFeedback = { type: "success", message: "수정한 규칙을 기존 거래에도 재분류 적용했습니다." };
  }
  pendingRuleChange = null;
  await saveTransactions();
  await saveRules();
  reclassify();
}

function preserveExistingMatches(oldRule) {
  const currentByKey = new Map(classified.map((item) => [item.recordKey, item]));
  const frozenKeys = new Set();
  transactions = transactions.map((item) => {
    if (item.flow === "income" || item.manualSector || item.manualSubcategory || isCanceled(item.cancel)) return item;
    if (!ruleMatchesMerchant(oldRule, item.merchant)) return item;
    const current = currentByKey.get(item.recordKey);
    if (!current || current.status !== "분류완료") return item;
    frozenKeys.add(item.recordKey);
    return { ...item, manualSector: current.sector, manualSubcategory: current.subcategory };
  });
  return frozenKeys;
}

function applyRuleToExistingTransactions(rule, oldRule, allowedManualKeys = new Set()) {
  transactions = transactions.map((item) => {
    const canOverrideManual = allowedManualKeys.has(item.recordKey);
    if (item.flow === "income" || isCanceled(item.cancel)) return item;
    if ((item.manualSector || item.manualSubcategory) && !canOverrideManual) return item;
    if (!ruleMatchesMerchant(rule, item.merchant) && (!oldRule || !ruleMatchesMerchant(oldRule, item.merchant))) return item;
    return { ...item, manualSector: rule.sector, manualSubcategory: rule.subcategory };
  });
}

function ruleMatchesMerchant(rule, merchant) {
  const text = normalizeKeyText(merchant);
  return rule.keywords.some((keyword) => text.includes(normalizeKeyText(keyword)));
}

function cloneRule(rule) {
  return {
    sector: rule.sector,
    subcategory: rule.subcategory,
    keywords: [...rule.keywords],
    priority: Number(rule.priority || 999),
    origin: rule.origin || ""
  };
}

function renderRuleFeedback() {
  if (!ruleFeedback) {
    els.ruleFeedback.innerHTML = "";
    return;
  }
  els.ruleFeedback.innerHTML = `
    <div class="rule-feedback-card ${escapeHtml(ruleFeedback.type || "info")}">
      <span>${escapeHtml(ruleFeedback.message)}</span>
      ${ruleFeedback.pending ? `
        <div class="rule-feedback-actions">
          <button type="button" data-rule-apply="future">앞으로만 적용</button>
          <button type="button" class="primary-action" data-rule-apply="existing">기존 거래에도 재분류 적용</button>
        </div>
      ` : ""}
    </div>
  `;
}

function ruleTypeBadge(rule) {
  const type = ruleTypeLabel(rule);
  const className = type === "기본 규칙"
    ? "base"
    : type === "수정된 기본 규칙" ? "modified" : type === "스마트 추천" ? "smart" : "user";
  return `<span class="rule-type-badge ${className}">${escapeHtml(type)}</span>`;
}

function ruleTypeLabel(rule) {
  if (rule.origin === "modified-default") return "수정된 기본 규칙";
  if (rule.origin === "smart-suggestion") return "스마트 추천";
  if (rule.origin === "user") return "사용자 규칙";
  if (rule.origin === "default") return "기본 규칙";
  const exactSignature = ruleSignature(rule);
  if (defaultRules.some((defaultRule) => ruleSignature(defaultRule) === exactSignature)) return "기본 규칙";
  const coveredByDefault = defaultRules.some((defaultRule) =>
    defaultRule.sector === rule.sector
    && defaultRule.subcategory === rule.subcategory
    && Number(defaultRule.priority || 999) === Number(rule.priority || 999)
    && rule.keywords.every((ruleKeyword) =>
      defaultRule.keywords.some((keyword) => normalizeKeyText(ruleKeyword) === normalizeKeyText(keyword))
    )
  );
  if (coveredByDefault) return "기본 규칙";
  const hasDefaultKeyword = defaultRules.some((defaultRule) =>
    defaultRule.keywords.some((keyword) => rule.keywords.some((ruleKeyword) => normalizeKeyText(ruleKeyword) === normalizeKeyText(keyword)))
  );
  return hasDefaultKeyword ? "수정된 기본 규칙" : "사용자 규칙";
}

function ruleSignature(rule) {
  return `${rule.sector}|${rule.subcategory}|${[...rule.keywords].map(normalizeKeyText).sort().join(",")}|${Number(rule.priority || 999)}`;
}
