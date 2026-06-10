async function clearRecords() {
  const scopes = selectedDataScopes();
  if (!scopes.length) {
    alert("초기화할 데이터 항목을 하나 이상 선택해주세요.");
    return;
  }
  const labels = scopeLabels(scopes).join(", ");
  const importedOnly = scopes.length === 1 && scopes.includes("importedExcelTransactions");
  if (importedOnly) {
    if (!confirm("엑셀 업로드 거래만 초기화할까요?\n수입 입력, 과거 거래 입력, 직접 추가 거래, 고정 지출, 분류 규칙, 소모품 기록, 설정은 유지됩니다.")) return;
  } else if (!confirmDangerousDataAction(
    `선택한 데이터 항목을 초기화합니다.\n\n대상: ${labels}\n\n초기화 전 자동 스냅샷을 저장하지만, 중요한 수기 데이터가 포함될 수 있습니다.`,
    "초기화"
  )) {
    return;
  }
  await createAutoSnapshot("선택 데이터 초기화 전");
  applyClearScopes(scopes);
  await saveSelectedScopes(scopes, { allowIncomeDrop: true });
  reclassify();
  renderRestorePreview(null, scopes);
}

async function backupLocalData() {
  const scopes = selectedDataScopes();
  if (!scopes.length) {
    alert("백업할 데이터 항목을 하나 이상 선택해주세요.");
    return;
  }
  const payload = await buildBackupPayload(scopes);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `월별_카드가계부_선택백업_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function restoreLocalData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    if (payload?.app !== "monthly-card-budget") {
      alert("이 앱에서 만든 백업 파일이 아닙니다.");
      return;
    }
    const bundle = normalizeBackupPayload(payload);
    const scopes = selectedDataScopes().filter((scope) => backupBundleHasScope(bundle, scope));
    if (!scopes.length) {
      alert("현재 선택한 항목이 백업 파일에 없습니다. 복원할 항목을 다시 선택해주세요.");
      return;
    }
    const mode = selectedRestoreMode();
    renderRestorePreview(bundle, scopes);
    const counts = scopeLabels(scopes).map((label, index) => `${label} ${formatScopeCount(bundle.sectionCounts[scopes[index]])}`).join("\n");
    const message = `백업 파일에서 선택한 항목만 ${mode === "overwrite" ? "덮어쓰기 복원" : "병합 복원"}할까요?\n\n${counts}\n\n선택하지 않은 현재 데이터는 유지됩니다.`;
    if (mode === "overwrite") {
      if (!confirmDangerousDataAction(`${message}\n\n덮어쓰기는 선택한 섹션의 현재 데이터를 먼저 지웁니다.`, "복원")) return;
    } else if (!confirm(message)) {
      return;
    }
    await createAutoSnapshot("백업 불러오기 전");

    applyRestorePayload(bundle, scopes, { mode });
    await saveSelectedScopes(scopes, { allowIncomeDrop: true });
    reclassify();
    renderRestorePreview(bundle, scopes);
    alert(`선택한 백업 데이터를 ${mode === "overwrite" ? "덮어쓰기" : "병합"} 방식으로 불러왔습니다.`);
  } catch (error) {
    console.error("restoreLocalData failed", error);
    alert("백업 파일을 읽지 못했습니다. JSON 파일인지 확인해주세요.");
  } finally {
    event.target.value = "";
  }
}

const DATA_SCOPE_META = [
  { key: "importedExcelTransactions", label: "엑셀 업로드 거래" },
  { key: "pastBulkTransactions", label: "과거 거래 입력" },
  { key: "directManualTransactions", label: "직접 추가 거래" },
  { key: "incomeInput", label: "수입 입력" },
  { key: "recurringDefinitions", label: "고정 지출 원본" },
  { key: "recurringPostedTransactions", label: "고정 지출 실제 반영" },
  { key: "rulesAndLearning", label: "분류 규칙/추천" },
  { key: "products", label: "소모품 사용" },
  { key: "ipoRecords", label: "공모주 기록" },
  { key: "settings", label: "설정/테마" },
  { key: "legacyUnknown", label: "기타 legacy 데이터" }
];

const TRANSACTION_DATA_SCOPES = new Set([
  "importedExcelTransactions",
  "pastBulkTransactions",
  "directManualTransactions",
  "incomeInput",
  "recurringPostedTransactions",
  "legacyUnknown"
]);

const DATA_SCOPE_ALIASES = {
  importedTransactions: ["importedExcelTransactions"],
  manualTransactions: ["pastBulkTransactions", "directManualTransactions", "recurringPostedTransactions"],
  income: ["incomeInput"],
  recurring: ["recurringDefinitions", "recurringPostedTransactions"],
  rules: ["rulesAndLearning"]
};

function selectedDataScopes() {
  return normalizeScopeList([...(els.dataScopeControls || [])]
    .filter((input) => input.checked)
    .map((input) => input.dataset.dataScope)
    .filter(Boolean));
}

function setDataScopeSelection(mode = "imported") {
  const selected = mode === "all"
    ? DATA_SCOPE_META.map((item) => item.key)
    : ["importedExcelTransactions"];
  [...(els.dataScopeControls || [])].forEach((input) => {
    input.checked = selected.includes(input.dataset.dataScope);
  });
  renderRestorePreview(null, selected);
}

function scopeLabels(scopes) {
  return normalizeScopeList(scopes).map((scope) => DATA_SCOPE_META.find((item) => item.key === scope)?.label || scope);
}

function normalizeScopeList(scopes) {
  const known = new Set(DATA_SCOPE_META.map((item) => item.key));
  const expanded = [];
  (scopes || []).forEach((scope) => {
    const values = DATA_SCOPE_ALIASES[scope] || [scope];
    values.forEach((value) => {
      if (known.has(value) && !expanded.includes(value)) expanded.push(value);
    });
  });
  return expanded;
}

function selectedRestoreMode() {
  const checked = [...(els.restoreModeControls || document.querySelectorAll("[data-restore-mode]"))].find((input) => input.checked);
  return checked?.value === "overwrite" ? "overwrite" : "merge";
}

function getTransactionDataSection(item) {
  const normalized = normalizeStoredTransaction(item);
  const sourceFile = String(normalized.sourceFile || "").trim();
  const approvalNo = String(normalized.approvalNo || "").trim();
  if (normalized.sourceType === "recurring" || normalized.recurringId || sourceFile === "고정 지출" || approvalNo.startsWith("recurring-")) {
    return "recurringPostedTransactions";
  }
  if (approvalNo.startsWith("direct-bulk-") || sourceFile === "과거 거래 일괄 입력") return "pastBulkTransactions";
  if (normalized.sourceType === "manual") return normalized.flow === "income" ? "incomeInput" : "directManualTransactions";
  if (normalized.flow === "income" && (sourceFile === "수입 직접 입력" || sourceFile === "수입 일괄 입력" || approvalNo.startsWith("manual-"))) {
    return "incomeInput";
  }
  if (approvalNo.startsWith("manual-") || sourceFile === "직접입력" || sourceFile === "분류 보드 직접 입력" || sourceFile === "붙여넣기 입력") {
    return normalized.flow === "income" ? "incomeInput" : "directManualTransactions";
  }
  if (sourceFile && ["card", "transfer"].includes(normalized.sourceType || "card")) return "importedExcelTransactions";
  return "legacyUnknown";
}

function selectedTransactionsForScopes(scopes) {
  const selected = new Set(normalizeScopeList(scopes).filter((scope) => TRANSACTION_DATA_SCOPES.has(scope)));
  return transactions
    .map(normalizeStoredTransaction)
    .filter((item) => selected.has(getTransactionDataSection(item)));
}

function pickReimbursementsForTransactions(rows) {
  const keys = new Set(rows.map((item) => normalizeStoredTransaction(item).recordKey));
  return Object.fromEntries(Object.entries(reimbursements || {}).filter(([key]) => keys.has(key)));
}

function normalizeBackupTransactions(payload) {
  const rows = Array.isArray(payload?.transactions)
    ? payload.transactions
    : Array.isArray(payload?.records)
      ? payload.records
      : [];
  return rows.map((item) => {
    const normalized = normalizeStoredTransaction(item);
    if (!normalized.manualSector || !normalized.manualSubcategory) return normalized;
    const assignment = normalizeCategoryAssignment(normalized.manualSector, normalized.manualSubcategory, normalized.merchant);
    return { ...normalized, manualSector: assignment.sector, manualSubcategory: assignment.subcategory };
  });
}

function backupPayloadHasScope(payload, scope) {
  return backupBundleHasScope(normalizeBackupPayload(payload), scope);
}

function backupBundleHasScope(bundle, scope) {
  return Boolean(bundle?.sections?.[scope]);
}

async function buildBackupPayload(scopes) {
  const snapshots = await loadAutoSnapshots();
  const selected = normalizeScopeList(scopes);
  const sections = {};
  selected.forEach((scope) => {
    const section = buildBackupSection(scope);
    if (section) sections[scope] = section;
  });
  const flattened = flattenTransactionSections(sections);
  const exportedAt = new Date().toISOString();
  const sectionCounts = countBackupSections(sections);
  const payload = {
    app: "monthly-card-budget",
    version: 4,
    exportedAt,
    scopes: selected,
    scopeLabels: scopeLabels(selected),
    storageKeys: STORAGE_KEYS,
    manifest: {
      appVersion: APP_VERSION,
      exportedAt,
      selectedSections: selected,
      sectionLabels: scopeLabels(selected),
      sectionCounts,
      storageKeys: STORAGE_KEYS
    },
    sections,
    transactions: flattened.records,
    reimbursements: flattened.reimbursements,
    snapshots: snapshots.map(({ id, createdAt, reason, appVersion }) => ({ id, createdAt, reason, appVersion }))
  };
  if (sections.rulesAndLearning) payload.rules = sections.rulesAndLearning.rules;
  if (sections.incomeInput) payload.monthlyIncome = sections.incomeInput.monthlyIncome || {};
  if (sections.products) payload.products = sections.products.products || [];
  if (sections.ipoRecords) payload.ipoRecords = sections.ipoRecords.ipoRecords || [];
  if (sections.recurringDefinitions) payload.recurringExpenses = sections.recurringDefinitions.recurringExpenses || [];
  if (sections.settings) payload.settings = sections.settings.settings || {};
  if (sections.importedExcelTransactions) payload.importMeta = sections.importedExcelTransactions.importMeta || {};
  return payload;
}

function buildBackupSection(scope) {
  if (TRANSACTION_DATA_SCOPES.has(scope)) {
    const records = transactions.map(normalizeStoredTransaction).filter((item) => getTransactionDataSection(item) === scope);
    const section = {
      records,
      reimbursements: pickReimbursementsForTransactions(records)
    };
    if (scope === "importedExcelTransactions") section.importMeta = importMeta;
    if (scope === "incomeInput") section.monthlyIncome = monthlyIncome;
    return section;
  }
  if (scope === "recurringDefinitions") return { recurringExpenses: recurringExpenses.map(normalizeRecurringExpense) };
  if (scope === "rulesAndLearning") return { rules };
  if (scope === "products") return { products: products.map(normalizeProduct) };
  if (scope === "ipoRecords") return { ipoRecords: ipoRecords.map(normalizeIpoRecord) };
  if (scope === "settings") return { settings: appSettings };
  return null;
}

function flattenTransactionSections(sections) {
  const records = [];
  const mergedReimbursements = {};
  Object.values(sections || {}).forEach((section) => {
    if (!Array.isArray(section?.records)) return;
    records.push(...section.records.map(normalizeStoredTransaction));
    Object.assign(mergedReimbursements, normalizeReimbursements(section.reimbursements));
  });
  return { records, reimbursements: mergedReimbursements };
}

function normalizeBackupPayload(payload) {
  const sections = {};
  if (payload?.sections && typeof payload.sections === "object") {
    DATA_SCOPE_META.forEach(({ key }) => {
      const section = normalizeBackupSection(key, payload.sections[key]);
      if (section) sections[key] = section;
    });
  }

  const legacyTransactions = normalizeBackupTransactions(payload);
  if (legacyTransactions.length && !Object.keys(sections).some((key) => TRANSACTION_DATA_SCOPES.has(key))) {
    DATA_SCOPE_META.forEach(({ key }) => {
      if (!TRANSACTION_DATA_SCOPES.has(key)) return;
      const records = legacyTransactions.filter((item) => getTransactionDataSection(item) === key);
      if (records.length) sections[key] = { records, reimbursements: pickLegacyReimbursements(payload, records) };
    });
  }

  if (!sections.importedExcelTransactions && payload?.importMeta) {
    sections.importedExcelTransactions = { records: [], reimbursements: {}, importMeta: payload.importMeta };
  }
  if (!sections.incomeInput && payload?.monthlyIncome) {
    sections.incomeInput = { records: [], reimbursements: {}, monthlyIncome: payload.monthlyIncome };
  } else if (sections.incomeInput && payload?.monthlyIncome && !sections.incomeInput.monthlyIncome) {
    sections.incomeInput.monthlyIncome = payload.monthlyIncome;
  }
  if (!sections.rulesAndLearning && Array.isArray(payload?.rules)) sections.rulesAndLearning = { rules: payload.rules };
  if (!sections.recurringDefinitions && Array.isArray(payload?.recurringExpenses)) sections.recurringDefinitions = { recurringExpenses: payload.recurringExpenses };
  if (!sections.products && Array.isArray(payload?.products)) sections.products = { products: payload.products };
  if (!sections.ipoRecords && Array.isArray(payload?.ipoRecords)) sections.ipoRecords = { ipoRecords: payload.ipoRecords };
  if (!sections.settings && payload?.settings) sections.settings = { settings: payload.settings };

  Object.keys(DATA_SCOPE_ALIASES).forEach((legacyScope) => {
    if (!Array.isArray(payload?.scopes) || !payload.scopes.includes(legacyScope)) return;
    DATA_SCOPE_ALIASES[legacyScope].forEach((scope) => {
      if (!sections[scope]) sections[scope] = emptyBackupSection(scope);
    });
  });

  return {
    app: payload?.app || "monthly-card-budget",
    version: Number(payload?.version || 1),
    exportedAt: payload?.exportedAt || payload?.manifest?.exportedAt || "",
    manifest: payload?.manifest || null,
    sections,
    sectionCounts: countBackupSections(sections)
  };
}

function normalizeBackupSection(scope, raw) {
  if (!raw) return null;
  if (TRANSACTION_DATA_SCOPES.has(scope)) {
    const rows = Array.isArray(raw.records) ? raw.records : Array.isArray(raw.transactions) ? raw.transactions : [];
    const records = rows.map((item) => {
      const normalized = normalizeStoredTransaction(item);
      if (!normalized.manualSector || !normalized.manualSubcategory) return normalized;
      const assignment = normalizeCategoryAssignment(normalized.manualSector, normalized.manualSubcategory, normalized.merchant);
      return { ...normalized, manualSector: assignment.sector, manualSubcategory: assignment.subcategory };
    }).filter((item) => getTransactionDataSection(item) === scope);
    const section = {
      records,
      reimbursements: normalizeReimbursements(raw.reimbursements)
    };
    if (scope === "importedExcelTransactions") section.importMeta = raw.importMeta || {};
    if (scope === "incomeInput") section.monthlyIncome = raw.monthlyIncome && typeof raw.monthlyIncome === "object" ? raw.monthlyIncome : {};
    return section;
  }
  if (scope === "recurringDefinitions") return { recurringExpenses: Array.isArray(raw.recurringExpenses) ? raw.recurringExpenses.map(normalizeRecurringExpense) : [] };
  if (scope === "rulesAndLearning") return { rules: Array.isArray(raw.rules) ? raw.rules : [] };
  if (scope === "products") return { products: Array.isArray(raw.products) ? raw.products.map(normalizeProduct) : [] };
  if (scope === "ipoRecords") return { ipoRecords: Array.isArray(raw.ipoRecords) ? raw.ipoRecords.map(normalizeIpoRecord) : [] };
  if (scope === "settings") return { settings: raw.settings && typeof raw.settings === "object" ? raw.settings : {} };
  return null;
}

function emptyBackupSection(scope) {
  if (TRANSACTION_DATA_SCOPES.has(scope)) return { records: [], reimbursements: {} };
  if (scope === "recurringDefinitions") return { recurringExpenses: [] };
  if (scope === "rulesAndLearning") return { rules: [] };
  if (scope === "products") return { products: [] };
  if (scope === "ipoRecords") return { ipoRecords: [] };
  if (scope === "settings") return { settings: {} };
  return {};
}

function pickLegacyReimbursements(payload, rows) {
  const source = normalizeReimbursements(payload?.reimbursements);
  const keys = new Set(rows.map((item) => item.recordKey));
  return Object.fromEntries(Object.entries(source).filter(([key]) => keys.has(key)));
}

function countBackupSections(sections) {
  const counts = {};
  Object.entries(sections || {}).forEach(([scope, section]) => {
    if (TRANSACTION_DATA_SCOPES.has(scope)) counts[scope] = Array.isArray(section.records) ? section.records.length : 0;
    else if (scope === "recurringDefinitions") counts[scope] = Array.isArray(section.recurringExpenses) ? section.recurringExpenses.length : 0;
    else if (scope === "rulesAndLearning") counts[scope] = Array.isArray(section.rules) ? section.rules.length : 0;
    else if (scope === "products") counts[scope] = Array.isArray(section.products) ? section.products.length : 0;
    else if (scope === "ipoRecords") counts[scope] = Array.isArray(section.ipoRecords) ? section.ipoRecords.length : 0;
    else if (scope === "settings") counts[scope] = section.settings && Object.keys(section.settings).length ? 1 : 0;
  });
  return counts;
}

function formatScopeCount(count) {
  return `(${Number(count || 0).toLocaleString("ko-KR")}건)`;
}

function renderRestorePreview(bundle, selectedScopes = selectedDataScopes()) {
  if (!els.restorePreview) return;
  const selected = normalizeScopeList(selectedScopes);
  if (!bundle) {
    els.restorePreview.innerHTML = `<span>백업 파일을 선택하면 포함 항목과 건수를 확인한 뒤 복원합니다.</span>`;
    return;
  }
  const rows = selected
    .filter((scope) => backupBundleHasScope(bundle, scope))
    .map((scope) => `<li><strong>${escapeHtml(scopeLabels([scope])[0])}</strong><span>${escapeHtml(formatScopeCount(bundle.sectionCounts[scope]))}</span></li>`)
    .join("");
  els.restorePreview.innerHTML = rows
    ? `<strong>복원 미리보기</strong><ul>${rows}</ul>`
    : `<span>현재 선택한 항목이 이 백업 파일에 없습니다.</span>`;
}

function applyClearScopes(scopes) {
  const selected = normalizeScopeList(scopes);
  const transactionScopes = selected.filter((scope) => TRANSACTION_DATA_SCOPES.has(scope));
  if (transactionScopes.length) {
    const removedKeys = new Set();
    transactions = transactions.map(normalizeStoredTransaction).filter((item) => {
      const remove = transactionScopes.includes(getTransactionDataSection(item));
      if (remove) removedKeys.add(item.recordKey);
      return !remove;
    });
    reimbursements = Object.fromEntries(Object.entries(reimbursements || {}).filter(([key]) => !removedKeys.has(key)));
  }
  if (selected.includes("importedExcelTransactions")) {
    importMeta = {};
    currentFileName = "";
  }
  if (selected.includes("incomeInput")) monthlyIncome = {};
  if (selected.includes("recurringDefinitions")) recurringExpenses = [];
  if (selected.includes("rulesAndLearning")) rules = structuredClone(defaultRules);
  if (selected.includes("products")) products = [];
  if (selected.includes("ipoRecords")) ipoRecords = [];
  if (selected.includes("settings")) {
    appSettings = defaultAppSettings();
    applyAppSettings();
  }
}

function applyRestorePayload(payload, scopes, options = {}) {
  const bundle = payload?.sections ? payload : normalizeBackupPayload(payload);
  const selected = normalizeScopeList(scopes).filter((scope) => backupBundleHasScope(bundle, scope));
  const mode = options.mode === "merge" ? "merge" : "overwrite";
  restoreTransactionSections(bundle, selected, mode);

  if (selected.includes("incomeInput")) {
    const incomingIncome = bundle.sections.incomeInput?.monthlyIncome && typeof bundle.sections.incomeInput.monthlyIncome === "object"
      ? bundle.sections.incomeInput.monthlyIncome
      : {};
    monthlyIncome = mode === "merge" ? { ...incomingIncome, ...monthlyIncome } : incomingIncome;
  }
  if (selected.includes("recurringDefinitions")) {
    const incoming = Array.isArray(bundle.sections.recurringDefinitions?.recurringExpenses)
      ? bundle.sections.recurringDefinitions.recurringExpenses.map(normalizeRecurringExpense)
      : [];
    recurringExpenses = mode === "merge" ? mergeRecurringDefinitions(recurringExpenses, incoming) : incoming;
  }
  if (selected.includes("rulesAndLearning")) {
    const incoming = Array.isArray(bundle.sections.rulesAndLearning?.rules) ? bundle.sections.rulesAndLearning.rules : [];
    rules = mode === "merge" ? mergeRuleLists(rules, incoming) : mergeRules(incoming, defaultRules);
  }
  if (selected.includes("products")) {
    const incoming = Array.isArray(bundle.sections.products?.products) ? bundle.sections.products.products.map(normalizeProduct) : [];
    products = mode === "merge" ? mergeProducts(products, incoming) : incoming;
  }
  if (selected.includes("ipoRecords")) {
    const incoming = Array.isArray(bundle.sections.ipoRecords?.ipoRecords) ? bundle.sections.ipoRecords.ipoRecords.map(normalizeIpoRecord) : [];
    ipoRecords = mode === "merge" ? mergeIpoRecords(ipoRecords, incoming) : incoming;
  }
  if (selected.includes("settings")) {
    const incoming = bundle.sections.settings?.settings && typeof bundle.sections.settings.settings === "object" ? bundle.sections.settings.settings : {};
    appSettings = { ...defaultAppSettings(), ...incoming };
    applyAppSettings();
  }
  if (selected.includes("importedExcelTransactions")) {
    const incomingMeta = bundle.sections.importedExcelTransactions?.importMeta;
    if (mode === "overwrite" || !Object.keys(importMeta || {}).length) {
      importMeta = incomingMeta && typeof incomingMeta === "object" ? incomingMeta : {};
      currentFileName = importMeta.lastFileName || "";
    }
  }
}

async function saveSelectedScopes(scopes, options = {}) {
  const selected = normalizeScopeList(scopes);
  const writes = [];
  if (selected.some((scope) => TRANSACTION_DATA_SCOPES.has(scope))) {
    writes.push(saveTransactions({ allowIncomeDrop: options.allowIncomeDrop === true }));
    writes.push(saveReimbursements());
  }
  if (selected.includes("importedExcelTransactions")) writes.push(saveImportMeta());
  if (selected.includes("rulesAndLearning")) writes.push(saveRules());
  if (selected.includes("incomeInput")) writes.push(saveIncome());
  if (selected.includes("products")) writes.push(saveProducts());
  if (selected.includes("ipoRecords")) writes.push(saveIpoRecords());
  if (selected.includes("recurringDefinitions")) writes.push(saveRecurringExpenses());
  if (selected.includes("settings")) writes.push(saveSettings());
  await Promise.all(writes);
}

function restoreTransactionSections(bundle, scopes, mode) {
  const transactionScopes = scopes.filter((scope) => TRANSACTION_DATA_SCOPES.has(scope));
  if (!transactionScopes.length) return;
  const removedKeys = new Set();
  let base = transactions.map(normalizeStoredTransaction);
  if (mode === "overwrite") {
    base = base.filter((item) => {
      const remove = transactionScopes.includes(getTransactionDataSection(item));
      if (remove) removedKeys.add(item.recordKey);
      return !remove;
    });
  }
  const incoming = transactionScopes.flatMap((scope) =>
    (bundle.sections[scope]?.records || [])
      .map(normalizeStoredTransaction)
      .filter((item) => getTransactionDataSection(item) === scope)
  );
  const incomingReimbursements = transactionScopes.reduce((acc, scope) => ({
    ...acc,
    ...normalizeReimbursements(bundle.sections[scope]?.reimbursements)
  }), {});
  transactions = mergeTransactionsByRestoreSignature(base, incoming);
  const currentReimbursements = Object.fromEntries(Object.entries(reimbursements || {}).filter(([key]) => !removedKeys.has(key)));
  incoming.forEach((item) => {
    if (incomingReimbursements[item.recordKey] === undefined) return;
    if (mode === "merge" && currentReimbursements[item.recordKey] !== undefined) return;
    currentReimbursements[item.recordKey] = incomingReimbursements[item.recordKey];
  });
  reimbursements = currentReimbursements;
}

function mergeTransactionsByRestoreSignature(existing, incoming) {
  const records = existing.map(normalizeStoredTransaction);
  const seenKeys = new Set(records.map((item) => item.recordKey));
  const seenSignatures = new Set(records.map(transactionRestoreSignature));
  incoming.map(normalizeStoredTransaction).forEach((item) => {
    const signature = transactionRestoreSignature(item);
    if (seenKeys.has(item.recordKey) || seenSignatures.has(signature)) return;
    seenKeys.add(item.recordKey);
    seenSignatures.add(signature);
    records.push(item);
  });
  records.sort((a, b) =>
    `${a.approvalDate} ${a.approvalTime} ${a.merchant}`.localeCompare(`${b.approvalDate} ${b.approvalTime} ${b.merchant}`, "ko-KR")
  );
  return records;
}

function transactionRestoreSignature(item) {
  const normalized = normalizeStoredTransaction(item);
  const section = getTransactionDataSection(normalized);
  if (section === "recurringPostedTransactions" && normalized.recurringId) {
    return `${section}|${normalized.recurringId}|${normalized.month}`;
  }
  return [
    section,
    normalized.flow,
    normalized.approvalDate,
    normalized.approvalTime,
    normalizeKeyText(normalized.merchant),
    normalized.amount,
    normalized.approvalNo
  ].join("|");
}

function mergeRecurringDefinitions(current, incoming) {
  const result = current.map(normalizeRecurringExpense);
  const seen = new Set(result.map(recurringDefinitionSignature));
  incoming.map(normalizeRecurringExpense).forEach((item) => {
    const signature = recurringDefinitionSignature(item);
    if (seen.has(signature)) return;
    seen.add(signature);
    result.push(item);
  });
  return result;
}

function recurringDefinitionSignature(item) {
  const normalized = normalizeRecurringExpense(item);
  return normalized.id || [normalizeKeyText(normalized.name), normalized.amount, normalized.dayOfMonth, normalized.startMonth].join("|");
}

function mergeProducts(current, incoming) {
  const result = current.map(normalizeProduct);
  const seen = new Set(result.map(productSignature));
  incoming.map(normalizeProduct).forEach((item) => {
    const signature = productSignature(item);
    if (seen.has(signature)) return;
    seen.add(signature);
    result.push(item);
  });
  return result;
}

function mergeIpoRecords(current, incoming) {
  const result = current.map(normalizeIpoRecord);
  const seen = new Set(result.map(ipoRecordSignature));
  incoming.map(normalizeIpoRecord).forEach((item) => {
    const signature = ipoRecordSignature(item);
    if (seen.has(signature)) return;
    seen.add(signature);
    result.push(item);
  });
  return result;
}

function productSignature(item) {
  const normalized = normalizeProduct(item);
  return normalized.id || [normalizeKeyText(normalized.name), normalized.purchaseDate, normalized.link].join("|");
}

function ipoRecordSignature(item) {
  const normalized = normalizeIpoRecord(item);
  return normalized.id || [
    normalizeKeyText(normalized.company),
    normalized.broker,
    normalized.subscriptionStart,
    normalized.offerPrice
  ].join("|");
}

function mergeRuleLists(current, incoming) {
  const result = Array.isArray(current) ? current.map(normalizeRuleForBackup).filter(Boolean) : [];
  const keywordTargets = new Map();
  result.forEach((rule) => {
    rule.keywords.forEach((keyword) => keywordTargets.set(normalizeKeyText(keyword), `${rule.sector}|${rule.subcategory}`));
  });
  (incoming || []).map(normalizeRuleForBackup).filter(Boolean).forEach((rule) => {
    const filteredKeywords = rule.keywords.filter((keyword) => {
      const normalized = normalizeKeyText(keyword);
      const target = `${rule.sector}|${rule.subcategory}`;
      return !keywordTargets.has(normalized) || keywordTargets.get(normalized) === target;
    });
    const newKeywords = filteredKeywords.filter((keyword) => {
      const normalized = normalizeKeyText(keyword);
      const target = `${rule.sector}|${rule.subcategory}`;
      if (keywordTargets.has(normalized)) return false;
      keywordTargets.set(normalized, target);
      return true;
    });
    if (newKeywords.length) result.push({ ...rule, keywords: newKeywords });
  });
  return mergeRules(result, defaultRules);
}

function normalizeRuleForBackup(rule) {
  if (!rule?.sector || !rule?.subcategory || !Array.isArray(rule.keywords)) return null;
  return {
    sector: rule.sector,
    subcategory: rule.subcategory,
    keywords: rule.keywords.map((keyword) => String(keyword || "").trim()).filter(Boolean),
    priority: Number(rule.priority || 999),
    origin: rule.origin || "",
    createdAt: rule.createdAt || "",
    updatedAt: rule.updatedAt || ""
  };
}

function confirmDangerousDataAction(message, phrase) {
  const typed = prompt(`${message}\n\n계속하려면 "${phrase}"를 입력해주세요.`);
  return typed === phrase;
}

function exportWorkbook() {
  const wb = XLSX.utils.book_new();
  const summaryRows = tableToRows(els.monthlyTable);
  const detailRows = buildAllDetailSummaryRows();
  const classifiedRows = classified.map((item) => ({
    유형: sourceTypeLabel(item.sourceType),
    흐름: item.flow === "income" ? "수입" : "지출",
    승인일자: item.approvalDate,
    월: item.month,
    승인시각: item.approvalTime,
    가맹점명: item.merchant,
    "승인금액(원)": item.amount,
    할부: item.installment || "",
    "월 할부 예상액": installmentMonthlyAmount(item) || "",
    "정산받은 금액": reimbursementFor(item),
    "실 지출액": actualAmount(item),
    취소여부: item.cancel,
    섹터: item.sector,
    세부항목: item.subcategory,
    고정지출ID: item.recurringId || "",
    메모: item.memo || "",
    분류상태: item.status,
    결제일: item.payDate,
    승인번호: item.approvalNo,
    업로드파일: item.sourceFile,
    업로드일시: item.importedAt
  }));
  const ruleRows = rules.map((rule) => ({
    섹터: rule.sector,
    세부항목: rule.subcategory,
    키워드: rule.keywords.join(", "),
    우선순위: rule.priority
  }));
  const productRows = products.map((product) => ({
    제품명: product.name,
    구매일: product.purchaseDate,
    유통기한: product.expiryDate,
    사용시작일: product.startDate,
    사용종료일: product.endDate,
    예상사용일: product.expectedDays,
    사용일수: productUsageDays(product),
    다음구매예상일: nextProductPurchaseDate(product),
    링크: product.link,
    메모: product.memo
  }));
  const recurringRows = recurringExpenses.map((item) => ({
    지출명: item.name,
    금액: item.amount,
    매월지출일: item.dayOfMonth,
    섹터: item.sector,
    세부항목: item.subcategory,
    결제방식: item.paymentType,
    시작월: item.startMonth,
    종료월: item.endMonth,
    달력표시: item.showOnCalendar ? "예" : "아니오",
    자동반영: item.autoPost ? "예" : "아니오",
    상태: item.paused ? "일시중지" : "진행",
    메모: item.memo
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "월별요약");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "세부요약");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(classifiedRows), "분류내역");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recurringRows), "고정지출");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productRows), "화장품사용기록");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ruleRows), "분류규칙");
  XLSX.writeFile(wb, "월별_카드가계부_분류결과.xlsx");
}

function buildAllDetailSummaryRows() {
  const active = reportingExpenseRows(classified);
  const grouped = groupBy(active, (item) => `${item.month}|${item.sector}|${item.subcategory}`);
  return [...grouped.entries()]
    .map(([key, rows]) => {
      const [month, sector, subcategory] = key.split("|");
      return { 월: month, 섹터: sector, 세부항목: subcategory, 금액: sumActual(rows), 건수: rows.length };
    })
    .sort((a, b) => `${a.월}|${a.섹터}|${a.세부항목}`.localeCompare(`${b.월}|${b.섹터}|${b.세부항목}`, "ko-KR"));
}

function tableToRows(table) {
  return [...table.querySelectorAll("tr")].map((tr) => [...tr.children].map((cell) => cell.textContent.trim()));
}
