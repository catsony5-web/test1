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
  calendarMemos = await loadCalendarMemos();
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
  return normalizeAppSettings(stored);
}

function normalizeAppSettings(value) {
  const defaults = defaultAppSettings();
  const source = value && typeof value === "object" ? value : {};
  const settings = { ...defaults, ...source };
  settings.theme = Number(source.themeRevision || 0) >= defaults.themeRevision
    ? normalizeTheme(settings.theme)
    : defaults.theme;
  settings.themeRevision = defaults.themeRevision;
  settings.backgroundOpacity = clampNumber(settings.backgroundOpacity, 0, 0.45, defaults.backgroundOpacity);
  settings.backgroundBlur = clampNumber(settings.backgroundBlur, 0, 18, defaults.backgroundBlur);
  settings.backgroundOverlay = clampNumber(settings.backgroundOverlay, 0, 0.8, defaults.backgroundOverlay);
  settings.backgroundImage = typeof settings.backgroundImage === "string" ? settings.backgroundImage : "";
  settings.cardBilling = normalizeCardBillingSettings(settings.cardBilling);
  settings.analysis = normalizeAnalysisSettings(settings.analysis);
  return settings;
}

function normalizeCardBillingSettings(value) {
  const defaults = defaultAppSettings().cardBilling;
  const source = value && typeof value === "object" ? value : {};
  return {
    startDay: Math.round(clampNumber(source.startDay, 1, 31, defaults.startDay)),
    endDay: Math.round(clampNumber(source.endDay, 1, 31, defaults.endDay)),
    paymentDay: Math.round(clampNumber(source.paymentDay, 1, 31, defaults.paymentDay)),
    weekendRule: source.weekendRule === "none" ? "none" : "next-monday"
  };
}

function normalizeAnalysisSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const validSectors = new Set(
    Object.keys(categories).filter((sector) => !["저축", "수입", "미분류"].includes(sector))
  );
  const targetRatios = Object.fromEntries(
    Object.entries(source.targetRatios && typeof source.targetRatios === "object" ? source.targetRatios : {})
      .filter(([sector]) => validSectors.has(sector))
      .map(([sector, ratio]) => [sector, clampNumber(ratio, 0, 100, 0)])
      .filter(([, ratio]) => ratio > 0)
  );
  const validTypeKeys = new Set(
    [...validSectors].flatMap((sector) =>
      (categories[sector] || []).map((subcategory) => `${sector}::${subcategory}`)
    )
  );
  const consumptionTypes = Object.fromEntries(
    Object.entries(source.consumptionTypes && typeof source.consumptionTypes === "object" ? source.consumptionTypes : {})
      .filter(([key, type]) => validTypeKeys.has(key) && ["essential", "discretionary"].includes(type))
  );
  return { targetRatios, consumptionTypes };
}

function saveSettings() {
  return writePrivateData(SETTINGS_STORAGE_KEY, appSettings);
}

const THEME_BROWSER_COLORS = Object.freeze({
  minimal: "#1e5748",
  dark: "#18211e",
  "clear-aqua": "#317b9f",
  "lilac-aqua": "#706eae",
  "garden-ink": "#365f7e",
  "warm-earth": "#966157"
});

function applyAppSettings() {
  const theme = normalizeTheme(appSettings.theme);
  appSettings.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BROWSER_COLORS[theme]);
  document.documentElement.style.setProperty("--app-bg-image", appSettings.backgroundImage ? `url("${appSettings.backgroundImage}")` : "none");
  document.documentElement.style.setProperty("--app-bg-opacity", String(clampNumber(appSettings.backgroundOpacity, 0, 0.45, 0.14)));
  document.documentElement.style.setProperty("--app-bg-blur", `${clampNumber(appSettings.backgroundBlur, 0, 18, 0)}px`);
  document.documentElement.style.setProperty("--app-bg-overlay", String(clampNumber(appSettings.backgroundOverlay, 0, 0.8, 0.28)));
  syncAppearanceControls();
}


function normalizeTheme(value) {
  return ["minimal", "dark", "clear-aqua", "lilac-aqua", "garden-ink", "warm-earth"].includes(value)
    ? value
    : "garden-ink";
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
    calendarMemos: normalizeCalendarMemos(calendarMemos),
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
  const hasData = transactions.length || Object.keys(monthlyIncome || {}).length || recurringExpenses.length || products.length || ipoRecords.length || Object.keys(calendarMemos || {}).length || rules.length;
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
    : ["importedExcelTransactions", "pastBulkTransactions", "directManualTransactions", "incomeInput", "recurringDefinitions", "recurringPostedTransactions", "rulesAndLearning", "products", "ipoRecords", "calendarMemos", "settings", "legacyUnknown"];
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

async function loadCalendarMemos() {
  const stored = await safeLoad(CALENDAR_MEMO_STORAGE_KEY, {});
  return normalizeCalendarMemos(stored);
}

function saveCalendarMemos() {
  calendarMemos = normalizeCalendarMemos(calendarMemos);
  return safeSave(CALENDAR_MEMO_STORAGE_KEY, calendarMemos);
}

function normalizeCalendarMemos(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([month]) => isValidMonthKey(month))
    .map(([month, memo]) => [month, normalizeCalendarMemo(memo)])
    .filter(([, memo]) => memo.html || memo.paper !== "yellow"));
}

function normalizeCalendarMemo(memo = {}) {
  const paper = ["yellow", "pink", "green", "blue", "violet"].includes(memo.paper) ? memo.paper : "yellow";
  return {
    html: sanitizeCalendarMemoHtml(memo.html || ""),
    paper,
    updatedAt: String(memo.updatedAt || "")
  };
}

function sanitizeCalendarMemoHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const allowedTags = new Set(["P", "DIV", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR", "UL", "OL", "LI", "H3", "H4", "FONT"]);
  const allowedStyles = new Set(["color", "background-color", "font-size", "font-family", "font-weight", "font-style", "text-align", "text-decoration", "text-decoration-line"]);
  const allowedFonts = new Set(["Noto Sans KR", "Pretendard", "Gowun Dodum", "Nanum Pen Script", "serif", "monospace"]);
  const allowedSizes = new Set(["12px", "14px", "16px", "18px", "22px", "26px"]);
  const fontSizeMap = { 1: "12px", 2: "14px", 3: "16px", 4: "18px", 5: "22px", 6: "26px", 7: "26px" };
  const keywordSizeMap = {
    "x-small": "12px",
    small: "14px",
    medium: "16px",
    large: "18px",
    "x-large": "22px",
    "xx-large": "26px",
    "-webkit-xxx-large": "26px"
  };

  const cleanColor = (value) => {
    const text = String(value || "").trim();
    if (!text || /url|expression|javascript/i.test(text)) return "";
    return CSS.supports("color", text) ? text : "";
  };
  const cleanFont = (value) => {
    const first = String(value || "").split(",")[0].replaceAll("\"", "").replaceAll("'", "").trim();
    return allowedFonts.has(first) ? first : "";
  };
  const cleanSize = (value) => {
    const text = String(value || "").trim().toLowerCase();
    if (allowedSizes.has(text)) return text;
    return keywordSizeMap[text] || "";
  };
  const cleanFontWeight = (value) => {
    const text = String(value || "").trim().toLowerCase();
    return ["bold", "600", "700"].includes(text) ? text : "";
  };
  const cleanFontStyle = (value) => {
    const text = String(value || "").trim().toLowerCase();
    return text === "italic" ? text : "";
  };
  const cleanTextDecoration = (value) => {
    const text = String(value || "").toLowerCase();
    if (text.includes("line-through")) return "line-through";
    return "";
  };
  const cleanStyle = (source, target) => {
    [...source.style].forEach((property) => {
      if (!allowedStyles.has(property)) return;
      const value = source.style.getPropertyValue(property);
      if (property === "color" || property === "background-color") {
        const color = cleanColor(value);
        if (color) target.style.setProperty(property, color);
      } else if (property === "font-family") {
        const font = cleanFont(value);
        if (font) target.style.fontFamily = font;
      } else if (property === "font-size") {
        const size = cleanSize(value);
        if (size) target.style.fontSize = size;
      } else if (property === "font-weight") {
        const weight = cleanFontWeight(value);
        if (weight) target.style.fontWeight = weight;
      } else if (property === "font-style") {
        const style = cleanFontStyle(value);
        if (style) target.style.fontStyle = style;
      } else if (property === "text-align" && ["left", "center", "right"].includes(value.trim())) {
        target.style.textAlign = value.trim();
      } else if (property === "text-decoration" || property === "text-decoration-line") {
        const decoration = cleanTextDecoration(value);
        if (decoration) target.style.textDecoration = decoration;
      }
    });
  };
  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    if (!allowedTags.has(node.tagName)) {
      const fragment = document.createDocumentFragment();
      node.childNodes.forEach((child) => fragment.appendChild(cleanNode(child)));
      return fragment;
    }
    const tagName = node.tagName === "FONT" ? "span" : node.tagName.toLowerCase();
    const next = document.createElement(tagName);
    cleanStyle(node, next);
    if (node.tagName === "FONT") {
      const color = cleanColor(node.getAttribute("color"));
      const face = cleanFont(node.getAttribute("face"));
      const size = fontSizeMap[node.getAttribute("size")];
      if (color) next.style.color = color;
      if (face) next.style.fontFamily = face;
      if (size) next.style.fontSize = size;
    }
    node.childNodes.forEach((child) => next.appendChild(cleanNode(child)));
    return next;
  };
  const fragment = document.createDocumentFragment();
  template.content.childNodes.forEach((child) => fragment.appendChild(cleanNode(child)));
  const output = document.createElement("div");
  output.appendChild(fragment);
  if (!output.textContent.trim()) return "";
  return output.innerHTML.trim();
}

function normalizeRecurringExpense(item) {
  const recurringType = item?.recurringType === "loan" ? "loan" : "expense";
  const startMonth = monthKey(item?.startMonth) || currentMonthKey();
  const endMonth = monthKey(item?.endMonth || item?.loanMaturityMonth);
  const assignment = normalizeCategoryAssignment(item?.sector, item?.subcategory, `${item?.name || ""} ${item?.memo || ""}`);
  const assignedSector = categories[assignment.sector] && !["수입", "미분류"].includes(assignment.sector) ? assignment.sector : "고정 주거비";
  const sector = recurringType === "loan" ? "고정 주거비" : assignedSector;
  const subcategoryOptions = categories[sector] || [];
  const assignedSubcategory = subcategoryOptions.includes(assignment.subcategory) ? assignment.subcategory : subcategoryOptions[0] || "";
  const subcategory = recurringType === "loan" && subcategoryOptions.includes("대출이자") ? "대출이자" : assignedSubcategory;
  const loanPrincipalAmount = recurringType === "loan" ? Math.max(0, toNumber(item?.loanPrincipalAmount)) : 0;
  const loanInterestAmount = recurringType === "loan" ? Math.max(0, toNumber(item?.loanInterestAmount)) : 0;
  return {
    id: item?.id || `recurring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recurringType,
    name: String(item?.name || "").trim(),
    amount: recurringType === "loan"
      ? loanPrincipalAmount + loanInterestAmount
      : Math.max(0, toNumber(item?.amount)),
    dayOfMonth: Math.max(1, Math.min(31, Number(item?.dayOfMonth || 1))),
    sector,
    subcategory,
    paymentType: item?.paymentType || "카드",
    startMonth,
    endMonth: endMonth && endMonth >= startMonth ? endMonth : "",
    memo: String(item?.memo || "").trim(),
    showOnCalendar: item?.showOnCalendar !== false,
    autoPost: recurringType === "loan" ? false : item?.autoPost === true,
    paused: item?.paused === true,
    loanType: recurringType === "loan" ? String(item?.loanType || "신용대출").trim() : "",
    loanOpeningBalance: recurringType === "loan" ? Math.max(0, toNumber(item?.loanOpeningBalance)) : 0,
    loanPrincipalAmount,
    loanInterestAmount,
    loanInterestRate: recurringType === "loan" ? Math.max(0, toNumber(item?.loanInterestRate)) : 0,
    loanMaturityMonth: recurringType === "loan" && endMonth && endMonth >= startMonth ? endMonth : "",
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
  const calculationVersion = normalizeIpoCalculationVersion(item?.calculationVersion);
  const offerPrice = Math.max(0, toNumber(item?.offerPrice));
  const allocatedShares = Math.max(0, toNumber(item?.allocatedShares));
  const sellPrice = Math.max(0, toNumber(item?.sellPrice));
  const sellAmount = Math.max(0, toNumber(item?.sellAmount));
  const applicationFee = Math.max(0, toNumber(item?.applicationFee));
  const sellFee = Math.max(0, toNumber(item?.sellFee));
  const inferredAllocation = allocatedShares > 0 ? "allocated" : calculationVersion ? "pending" : "";
  const allocationResult = normalizeIpoAllocationResult(item?.allocationResult) || inferredAllocation;
  const isUnallocated = allocationResult === "unallocated";
  const totalFees = applicationFee + sellFee;
  const legacyCalculation = !calculationVersion;
  const explicitTotalSellAmount = sellAmount;
  const totalSellAmount = legacyCalculation
    ? sellAmount || sellPrice || 0
    : sellAmount || (sellPrice > 0 && allocatedShares > 0 ? sellPrice * allocatedShares : 0);
  const buyAmount = legacyCalculation ? offerPrice : offerPrice * allocatedShares;
  const reportedProfit = toNumber(item?.reportedProfit);
  const reportedProfitRate = toNumber(item?.reportedProfitRate);
  const hasReportedProfit = typeof item?.hasReportedProfit === "boolean"
    ? item.hasReportedProfit
    : item?.reportedProfit !== undefined && item?.reportedProfit !== null && String(item.reportedProfit).trim() !== "";
  const hasReportedProfitRate = typeof item?.hasReportedProfitRate === "boolean"
    ? item.hasReportedProfitRate
    : item?.reportedProfitRate !== undefined && item?.reportedProfitRate !== null && String(item.reportedProfitRate).trim() !== "";
  const hasSettledAmount = totalSellAmount > 0 && buyAmount > 0;
  let profit = hasSettledAmount ? totalSellAmount - buyAmount : 0;
  let settlementProfit = hasSettledAmount ? profit - totalFees : 0;
  let profitRate = buyAmount ? profit / buyAmount * 100 : 0;

  if (isUnallocated) {
    profit = 0;
    settlementProfit = 0;
    profitRate = 0;
  } else if (calculationVersion === "reported") {
    profit = hasReportedProfit ? reportedProfit : 0;
    settlementProfit = profit;
    profitRate = hasReportedProfitRate ? reportedProfitRate : 0;
  }

  return {
    id: item?.id || `ipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceRecordId: String(item?.sourceRecordId || item?.originalId || "").trim(),
    company,
    baseCompany: String(item?.baseCompany || company).trim(),
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
    allocationResult,
    sellDate: normalizeInputDate(item?.sellDate),
    sellPrice,
    sellAmount: legacyCalculation ? totalSellAmount : explicitTotalSellAmount,
    totalSellAmount,
    sellFee,
    openPrice: Math.max(0, toNumber(item?.openPrice)),
    highPrice: Math.max(0, toNumber(item?.highPrice)),
    closePrice: Math.max(0, toNumber(item?.closePrice)),
    memo: String(item?.memo || "").trim(),
    imageData: /^data:image\//.test(String(item?.imageData || "")) ? String(item.imageData) : "",
    imageName: String(item?.imageName || "").trim(),
    source: item?.source || "manual",
    sourceLabel: item?.sourceLabel || (item?.source === "calendar" ? "일정 불러오기" : "직접 입력"),
    calculationVersion,
    reportedProfit,
    reportedProfitRate,
    hasReportedProfit,
    hasReportedProfitRate,
    rawSellValue: String(item?.rawSellValue || "").trim(),
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString(),
    profit,
    profitRate,
    totalFees,
    settlementProfit
  };
}

function normalizeIpoCalculationVersion(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["quantity-v2", "quantity_v2", "수량계산", "수량 계산"].includes(normalized)) return "quantity-v2";
  if (["reported", "원본확정", "원본 확정", "보고값"].includes(normalized)) return "reported";
  return "";
}

function normalizeIpoAllocationResult(value) {
  const normalized = normalizeKeyText(String(value || ""));
  if (["unallocated", "미배정", "배정없음", "0주"].includes(normalized)) return "unallocated";
  if (["allocated", "배정", "배정확정", "확정"].includes(normalized)) return "allocated";
  if (["pending", "대기", "배정대기", "미확인"].includes(normalized)) return "pending";
  return "";
}
