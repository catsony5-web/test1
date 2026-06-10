async function hydrateStoredData() {
  appSettings = await loadSettings();
  applyAppSettings();
  rules = await loadRules();
  monthlyIncome = await loadIncome();
  transactions = await loadTransactions();
  importMeta = await loadImportMeta();
  reimbursements = await loadReimbursements();
  products = await loadProducts();
  ipoRecords = await loadIpoRecords();
  recurringExpenses = await loadRecurringExpenses();
  currentFileName = importMeta.lastFileName || "";
  await ensureDailyAutoSnapshot();
}

async function migrateCategorySystem() {
  const marker = await readPrivateData(CATEGORY_MIGRATION_STORAGE_KEY);
  if (marker?.version >= 3) return;
  await createAutoSnapshot("데이터 마이그레이션 전");

  let changedTransactions = false;
  transactions = transactions.map((item) => {
    const normalized = normalizeStoredTransaction(item);
    if (!normalized.manualSector || !normalized.manualSubcategory) return normalized;
    const assignment = normalizeCategoryAssignment(normalized.manualSector, normalized.manualSubcategory, normalized.merchant);
    if (assignment.sector === normalized.manualSector && assignment.subcategory === normalized.manualSubcategory) return normalized;
    changedTransactions = true;
    return {
      ...normalized,
      manualSector: assignment.sector,
      manualSubcategory: assignment.subcategory
    };
  });

  let changedRecurringExpenses = false;
  recurringExpenses = recurringExpenses.map((item) => {
    const normalized = normalizeRecurringExpense(item);
    if (normalized.sector === item?.sector && normalized.subcategory === item?.subcategory) return normalized;
    changedRecurringExpenses = true;
    return normalized;
  });

  rules = mergeRules(rules, defaultRules);
  if (changedTransactions) await saveTransactions();
  if (changedRecurringExpenses) await saveRecurringExpenses();
  await saveRules();
  await writePrivateData(CATEGORY_MIGRATION_STORAGE_KEY, {
    version: 3,
    migratedAt: new Date().toISOString()
  });
  await writePrivateData(STORAGE_KEYS.migrations, {
    categorySystem: 3,
    updatedAt: new Date().toISOString()
  });
}

async function loadSettings() {
  const stored = await safeLoad(SETTINGS_STORAGE_KEY, {});
  const defaults = defaultAppSettings();
  const settings = stored && typeof stored === "object" ? { ...defaults, ...stored } : defaults;
  settings.theme = normalizeTheme(settings.theme);
  settings.backgroundOpacity = clampNumber(settings.backgroundOpacity, 0, 0.45, defaults.backgroundOpacity);
  settings.backgroundBlur = clampNumber(settings.backgroundBlur, 0, 18, defaults.backgroundBlur);
  settings.backgroundOverlay = clampNumber(settings.backgroundOverlay, 0, 0.8, defaults.backgroundOverlay);
  settings.backgroundImage = typeof settings.backgroundImage === "string" ? settings.backgroundImage : "";
  return settings;
}

function saveSettings() {
  return writePrivateData(SETTINGS_STORAGE_KEY, appSettings);
}

function applyAppSettings() {
  const theme = normalizeTheme(appSettings.theme);
  appSettings.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  document.documentElement.style.setProperty("--app-bg-image", appSettings.backgroundImage ? `url("${appSettings.backgroundImage}")` : "none");
  document.documentElement.style.setProperty("--app-bg-opacity", String(clampNumber(appSettings.backgroundOpacity, 0, 0.45, 0.14)));
  document.documentElement.style.setProperty("--app-bg-blur", `${clampNumber(appSettings.backgroundBlur, 0, 18, 0)}px`);
  document.documentElement.style.setProperty("--app-bg-overlay", String(clampNumber(appSettings.backgroundOverlay, 0, 0.8, 0.28)));
  syncAppearanceControls();
}


function normalizeTheme(value) {
  return ["minimal", "warm", "slate", "dark"].includes(value) ? value : "minimal";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function loadRules() {
  const stored = await safeLoad(STORAGE_KEY, []);
  if (Array.isArray(stored) && stored.length) return mergeRules(stored, defaultRules);
  return structuredClone(defaultRules);
}

function saveRules() {
  return safeSave(STORAGE_KEY, rules);
}

async function loadTransactions() {
  const stored = await safeLoad(RECORD_STORAGE_KEY, [], { fallbackKeys: [`${RECORD_STORAGE_KEY}${LAST_GOOD_SUFFIX}`] });
  if (Array.isArray(stored)) {
    const normalized = stored.map(normalizeStoredTransaction);
    if (!normalized.length) {
      const lastGood = await safeLoad(`${RECORD_STORAGE_KEY}${LAST_GOOD_SUFFIX}`, []);
      if (Array.isArray(lastGood) && lastGood.length) return lastGood.map(normalizeStoredTransaction);
    }
    return normalized;
  }
  return [];
}

function saveTransactions(options = {}) {
  return safeSave(RECORD_STORAGE_KEY, transactions.map(normalizeStoredTransaction), {
    protectIncomeRecords: true,
    allowIncomeDrop: options.allowIncomeDrop === true
  });
}

async function loadImportMeta() {
  const stored = await safeLoad(IMPORT_META_STORAGE_KEY, {});
  if (stored && typeof stored === "object") return stored;
  return {};
}

function saveImportMeta() {
  return safeSave(IMPORT_META_STORAGE_KEY, importMeta);
}

async function safeLoad(key, fallback, options = {}) {
  const keys = [key, ...(options.fallbackKeys || [])];
  for (const candidate of keys) {
    try {
      const value = await readPrivateData(candidate);
      if (value !== undefined && value !== null) return value;
    } catch (error) {
      console.warn(`저장 데이터 읽기 실패: ${candidate}`, error);
    }
  }
  return structuredCloneSafe(fallback);
}

async function safeSave(key, data, options = {}) {
  try {
    JSON.stringify(data);
  } catch (error) {
    alert("데이터를 저장하지 못했습니다. 저장할 수 없는 값이 포함되어 있습니다.");
    console.error("safeSave stringify failed", key, error);
    return false;
  }

  const previous = await readPrivateData(key);
  if (options.protectIncomeRecords && !options.allowIncomeDrop) {
    const previousIncomeCount = countIncomeRecords(previous);
    const nextIncomeCount = countIncomeRecords(data);
    if (previousIncomeCount > 0 && nextIncomeCount === 0) {
      await createAutoSnapshot("수입 기록 보호 차단 전");
      alert("수입 기록이 0건으로 덮어쓰기 될 가능성이 있어 저장을 중단했습니다. 필요하면 백업/복구에서 최근 자동 저장을 확인해주세요.");
      console.warn("Blocked suspicious income record drop", { key, previousIncomeCount, nextIncomeCount });
      return false;
    }
  }

  try {
    if (previous !== undefined) {
      await writePrivateData(`${key}${LAST_GOOD_SUFFIX}`, previous);
    }
    await writePrivateData(key, data);
    appSettings.lastSavedAt = new Date().toISOString();
    await saveSettings();
    renderSnapshotPanel();
    return true;
  } catch (error) {
    alert("브라우저 저장소에 데이터를 저장하지 못했습니다. 자동 스냅샷 또는 수동 백업을 확인해주세요.");
    console.error("safeSave failed", key, error);
    return false;
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function countIncomeRecords(value) {
  if (!Array.isArray(value)) return 0;
  return value.map(normalizeStoredTransaction).filter((item) => item.flow === "income").length;
}

async function createAutoSnapshot(reason = "자동 저장") {
  if (isCreatingSnapshot) return null;
  isCreatingSnapshot = true;
  try {
    const snapshots = await loadAutoSnapshots();
    const snapshot = {
      id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      reason,
      appVersion: APP_VERSION,
      data: collectSnapshotData()
    };
    const next = [snapshot, ...snapshots].slice(0, MAX_AUTO_SNAPSHOTS);
    await writePrivateData(AUTO_SNAPSHOT_STORAGE_KEY, next);
    appSettings.lastSnapshotAt = snapshot.createdAt;
    if (reason === "하루 1회 자동 스냅샷") appSettings.lastDailySnapshotDate = snapshot.createdAt.slice(0, 10);
    await saveSettings();
    renderSnapshotPanel();
    return snapshot;
  } finally {
    isCreatingSnapshot = false;
  }
}

function collectSnapshotData() {
  return {
    records: transactions.map(normalizeStoredTransaction),
    monthlyIncome,
    recurringExpenses: recurringExpenses.map(normalizeRecurringExpense),
    rules,
    products: products.map(normalizeProduct),
    ipoRecords: ipoRecords.map(normalizeIpoRecord),
    reimbursements,
    importMeta,
    settings: appSettings
  };
}

async function loadAutoSnapshots() {
  const snapshots = await safeLoad(AUTO_SNAPSHOT_STORAGE_KEY, []);
  return Array.isArray(snapshots) ? snapshots.filter((item) => item?.id && item?.data) : [];
}

async function ensureDailyAutoSnapshot() {
  const hasData = transactions.length || Object.keys(monthlyIncome || {}).length || recurringExpenses.length || products.length || ipoRecords.length || rules.length;
  const today = new Date().toISOString().slice(0, 10);
  if (!hasData || appSettings.lastDailySnapshotDate === today) return;
  await createAutoSnapshot("하루 1회 자동 스냅샷");
}

async function renderSnapshotPanel() {
  if (!els.autoSaveStatus || !els.snapshotCount || !els.snapshotList) return;
  els.autoSaveStatus.textContent = appSettings.lastSavedAt ? formatDateTime(appSettings.lastSavedAt) : "아직 저장 기록 없음";
  const snapshots = await loadAutoSnapshots();
  els.snapshotCount.textContent = `${snapshots.length.toLocaleString("ko-KR")}개`;
  els.restoreLatestSnapshotButton.disabled = snapshots.length === 0;
  els.snapshotList.innerHTML = snapshots.length
    ? snapshots.slice(0, 5).map((snapshot) => `
      <article class="snapshot-item">
        <div>
          <strong>${escapeHtml(snapshot.reason || "자동 스냅샷")}</strong>
          <span>${escapeHtml(formatDateTime(snapshot.createdAt))} · ${escapeHtml(snapshot.appVersion || "-")}</span>
        </div>
        <button type="button" data-restore-snapshot="${escapeHtml(snapshot.id)}">복구</button>
      </article>
    `).join("")
    : `<div class="snapshot-empty">아직 자동 스냅샷이 없습니다.</div>`;
  els.snapshotList.querySelectorAll("[data-restore-snapshot]").forEach((button) => {
    button.addEventListener("click", () => restoreFromSnapshot(button.dataset.restoreSnapshot));
  });
}

async function restoreLatestSnapshot() {
  const snapshots = await loadAutoSnapshots();
  if (!snapshots.length) {
    alert("복구할 자동 스냅샷이 없습니다.");
    return;
  }
  await restoreFromSnapshot(snapshots[0].id);
}

async function restoreFromSnapshot(snapshotId) {
  const snapshots = await loadAutoSnapshots();
  const snapshot = snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return;
  const scopes = typeof selectedDataScopes === "function"
    ? selectedDataScopes()
    : ["importedExcelTransactions", "pastBulkTransactions", "directManualTransactions", "incomeInput", "recurringDefinitions", "recurringPostedTransactions", "rulesAndLearning", "products", "ipoRecords", "settings", "legacyUnknown"];
  if (!scopes.length) {
    alert("복구할 데이터 항목을 하나 이상 선택해주세요.");
    return;
  }
  if (!confirm(`현재 데이터는 복구 전 자동 스냅샷으로 저장됩니다. 선택한 항목만 복구할까요?\n\n대상: ${scopeLabels(scopes).join(", ")}`)) return;
  await createAutoSnapshot("스냅샷 복구 전");
  const data = snapshot.data || {};
  applyRestorePayload(data, scopes);
  await saveSelectedScopes(scopes, { allowIncomeDrop: true });
  reclassify();
  alert("자동 스냅샷에서 선택한 항목을 복구했습니다.");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

function readPrivateData(key) {
  if (!("indexedDB" in window)) return readLocalStorageData(key);

  return openPrivateDb()
    .then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result?.value ?? readLocalStorageData(key));
      request.onerror = () => reject(request.error);
    }))
    .catch(() => readLocalStorageData(key));
}

function writePrivateData(key, value) {
  const localOk = writeLocalStorageData(key, value);
  if (!("indexedDB" in window)) return localOk ? Promise.resolve() : Promise.reject(new Error("localStorage save failed"));

  return openPrivateDb()
    .then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put({ key, value, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }))
    .catch((error) => {
      console.warn(`IndexedDB 저장 실패: ${key}`, error);
      if (!localOk) throw error;
      return undefined;
    });
}

function openPrivateDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readLocalStorageData(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch (error) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        localStorage.setItem(`${key}:corrupted:${Date.now()}`, raw);
      }
    } catch {
      // Ignore secondary backup failures.
    }
    console.warn(`손상된 저장 데이터를 건너뜁니다: ${key}`, error);
    return undefined;
  }
}

function writeLocalStorageData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // If browser storage is unavailable, keep the in-memory data for this session.
    return false;
  }
}

function mergeRules(primaryRules, fallbackRules) {
  const merged = [];
  const seen = new Set();
  [...primaryRules, ...fallbackRules].forEach((rule) => {
    if (!rule || !rule.sector || !rule.subcategory || !Array.isArray(rule.keywords)) return;
    const keywords = rule.keywords.map((keyword) => String(keyword).trim()).filter(Boolean);
    if (!keywords.length) return;
    const assignment = normalizeCategoryAssignment(rule.sector, rule.subcategory, keywords.join(" "));
    const uniqueKeywords = [];
    keywords.forEach((keyword) => {
      const signature = `${assignment.sector}|${assignment.subcategory}|${keyword}`.toLocaleLowerCase("ko-KR");
      if (seen.has(signature)) return;
      seen.add(signature);
      uniqueKeywords.push(keyword);
    });
    if (!uniqueKeywords.length) return;
    merged.push({
      sector: assignment.sector,
      subcategory: assignment.subcategory,
      keywords: uniqueKeywords,
      priority: Number(rule.priority || 999),
      origin: rule.origin || "",
      createdAt: rule.createdAt || "",
      updatedAt: rule.updatedAt || ""
    });
  });
  return merged;
}

async function loadIncome() {
  const stored = await safeLoad(INCOME_STORAGE_KEY, {}, { fallbackKeys: LEGACY_STORAGE_KEYS.monthlyIncome });
  if (stored && typeof stored === "object") return stored;
  return {};
}

function saveIncome() {
  return safeSave(INCOME_STORAGE_KEY, monthlyIncome);
}

async function loadReimbursements() {
  const stored = await safeLoad(REIMBURSEMENT_STORAGE_KEY, {});
  return normalizeReimbursements(stored);
}

function saveReimbursements() {
  return safeSave(REIMBURSEMENT_STORAGE_KEY, reimbursements);
}

async function loadProducts() {
  const stored = await safeLoad(PRODUCT_STORAGE_KEY, [], { fallbackKeys: LEGACY_STORAGE_KEYS.products });
  if (Array.isArray(stored)) return stored.map(normalizeProduct);
  return [];
}

function saveProducts() {
  return safeSave(PRODUCT_STORAGE_KEY, products.map(normalizeProduct));
}

async function loadIpoRecords() {
  const stored = await safeLoad(IPO_STORAGE_KEY, []);
  if (Array.isArray(stored)) return stored.map(normalizeIpoRecord).filter((item) => item.id && item.company);
  return [];
}

function saveIpoRecords() {
  return safeSave(IPO_STORAGE_KEY, ipoRecords.map(normalizeIpoRecord));
}

async function loadRecurringExpenses() {
  const stored = await safeLoad(RECURRING_STORAGE_KEY, []);
  if (Array.isArray(stored)) return stored.map(normalizeRecurringExpense).filter((item) => item.id && item.name);
  return [];
}

function saveRecurringExpenses() {
  return safeSave(RECURRING_STORAGE_KEY, recurringExpenses.map(normalizeRecurringExpense));
}

function normalizeRecurringExpense(item) {
  const startMonth = monthKey(item?.startMonth) || currentMonthKey();
  const endMonth = monthKey(item?.endMonth);
  const assignment = normalizeCategoryAssignment(item?.sector, item?.subcategory, `${item?.name || ""} ${item?.memo || ""}`);
  const sector = categories[assignment.sector] && !["수입", "미분류"].includes(assignment.sector) ? assignment.sector : "고정 주거비";
  const subcategoryOptions = categories[sector] || [];
  const subcategory = subcategoryOptions.includes(assignment.subcategory) ? assignment.subcategory : subcategoryOptions[0] || "";
  return {
    id: item?.id || `recurring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(item?.name || "").trim(),
    amount: Math.max(0, toNumber(item?.amount)),
    dayOfMonth: Math.max(1, Math.min(31, Number(item?.dayOfMonth || 1))),
    sector,
    subcategory,
    paymentType: item?.paymentType || "카드",
    startMonth,
    endMonth: endMonth && endMonth >= startMonth ? endMonth : "",
    memo: String(item?.memo || "").trim(),
    showOnCalendar: item?.showOnCalendar !== false,
    autoPost: item?.autoPost === true,
    paused: item?.paused === true,
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString()
  };
}

function normalizeReimbursements(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key, amount]) => [key, Math.max(0, toNumber(amount))])
    .filter(([key, amount]) => key && amount > 0));
}

function normalizeIpoRecord(item) {
  const company = String(item?.company || item?.name || "").trim();
  const offerPrice = Math.max(0, toNumber(item?.offerPrice));
  const allocatedShares = Math.max(0, toNumber(item?.allocatedShares));
  const sellPrice = Math.max(0, toNumber(item?.sellPrice));
  const sellAmount = Math.max(0, toNumber(item?.sellAmount));
  const applicationFee = Math.max(0, toNumber(item?.applicationFee));
  const sellFee = Math.max(0, toNumber(item?.sellFee));
    const finalSellAmount = sellAmount || sellPrice || 0;
    const buyAmount = offerPrice;
    const totalFees = applicationFee + sellFee;
    const hasSettledAmount = finalSellAmount > 0 && buyAmount > 0;
    const profit = hasSettledAmount ? finalSellAmount - buyAmount : 0;
    const settlementProfit = hasSettledAmount ? profit - totalFees : 0;
  const profitRate = buyAmount ? profit / buyAmount * 100 : 0;
  return {
    id: item?.id || `ipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    company,
    market: String(item?.market || "").trim(),
    broker: String(item?.broker || "").trim(),
    subscriptionStart: normalizeInputDate(item?.subscriptionStart || item?.date),
    subscriptionEnd: normalizeInputDate(item?.subscriptionEnd || item?.subscriptionStart || item?.date),
    refundDate: normalizeInputDate(item?.refundDate),
    listingDate: normalizeInputDate(item?.listingDate),
    offerPrice,
    appliedShares: Math.max(0, toNumber(item?.appliedShares)),
    depositAmount: Math.max(0, toNumber(item?.depositAmount)),
    applicationFee,
    allocatedShares,
    sellDate: normalizeInputDate(item?.sellDate),
    sellPrice,
    sellAmount: finalSellAmount,
    sellFee,
    openPrice: Math.max(0, toNumber(item?.openPrice)),
    highPrice: Math.max(0, toNumber(item?.highPrice)),
    closePrice: Math.max(0, toNumber(item?.closePrice)),
    memo: String(item?.memo || "").trim(),
    source: item?.source || "manual",
    sourceLabel: item?.sourceLabel || (item?.source === "calendar" ? "일정 불러오기" : "직접 입력"),
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString(),
    profit,
    profitRate,
    totalFees,
    settlementProfit
  };
}
