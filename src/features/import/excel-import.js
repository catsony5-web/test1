let excelImportInProgress = false;

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (excelImportInProgress) {
    alert("파일을 불러오는 중입니다. 완료 후 다시 선택해주세요.");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    alert("엑셀 파일은 20MB 이하로 선택해주세요.");
    event.target.value = "";
    return;
  }
  excelImportInProgress = true;
  const wasDisabled = event.target.disabled;
  event.target.disabled = true;
  try {
    let found;
    let mergeResult;
    let nextImportMeta;
    let recurringOverlapCount = 0;
    try {
      await loadExcelLibrary();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
      found = findImportSheet(workbook);
      if (!found) {
        alert("카드 이용내역 또는 은행 이체내역으로 보이는 시트를 찾지 못했습니다.\n날짜, 사용처/내용, 금액 또는 입금액/출금액 열이 필요합니다.");
        return;
      }

      const incoming = parseImportedTransactions(found, file.name);
      recurringOverlapCount = countRecurringImportOverlaps(incoming);
      await createAutoSnapshot("엑셀 업로드 전");
      mergeResult = mergeTransactions(transactions, incoming);
      nextImportMeta = {
        lastFileName: file.name,
        lastImportedAt: new Date().toISOString(),
        lastAddedCount: mergeResult.added,
        lastSkippedCount: mergeResult.skipped
      };
      const saved = await safeSaveMany([
        { key: RECORD_STORAGE_KEY, data: mergeResult.records, protectIncomeRecords: true },
        { key: IMPORT_META_STORAGE_KEY, data: nextImportMeta }
      ]);
      if (!saved) return;
    } catch {
      alert("엑셀을 불러오지 못했습니다. 기존 기록은 유지됩니다. 파일과 저장소 상태를 확인한 후 다시 시도해주세요.");
      return;
    }

    transactions = mergeResult.records;
    currentFileName = file.name;
    importMeta = nextImportMeta;
    const notices = [];
    if (recurringOverlapCount) notices.push(`자동 고정 지출과 겹칠 수 있는 항목 ${recurringOverlapCount}건이 있습니다. 중복으로 단정하거나 삭제하지 않았습니다. 고정 지출 등록·관리에서 가져온 출금을 연결하면 자동 기록을 대체할 수 있습니다.`);
    try {
      await createAutoSnapshot("엑셀 업로드 완료 후");
    } catch {
      notices.push("거래는 저장됐지만 자동 스냅샷을 만들지 못했습니다. 설정/관리에서 백업을 확인해주세요.");
    }
    try {
      reclassify();
    } catch {
      notices.push("거래는 저장됐지만 화면을 갱신하지 못했습니다. 새로고침해서 확인해주세요.");
    }
    alert(`${found.kind === "transfer" ? "이체내역" : "카드내역"}을 불러왔습니다.\n누적 기록에 ${mergeResult.added.toLocaleString("ko-KR")}건을 추가했습니다.\n중복 ${mergeResult.skipped.toLocaleString("ko-KR")}건은 건너뛰었습니다.${notices.length ? `\n\n${notices.join("\n")}` : ""}`);
  } finally {
    event.target.value = "";
    event.target.disabled = wasDisabled;
    excelImportInProgress = false;
  }
}

function countRecurringImportOverlaps(incoming) {
  const expenses = recurringExpenses.filter((item) => item.recurringType !== "loan");
  if (!expenses.length || !incoming.length) return 0;
  const months = new Set(incoming.map((row) => row.month));
  const postedByMonth = new Map();
  for (const transaction of transactions) {
    const record = normalizeStoredTransaction(transaction);
    if (!months.has(record.month) || isCanceled(record.cancel)) continue;
    if (!postedByMonth.has(record.month)) postedByMonth.set(record.month, new Map());
    const posted = postedByMonth.get(record.month);
    if (!posted.has(record.recurringId)) posted.set(record.recurringId, record.recurringPostMethod);
  }

  const incomingByMonth = new Map();
  for (const record of incoming) {
    const month = record.month || monthKey(record.approvalDate);
    if (!incomingByMonth.has(month)) incomingByMonth.set(month, []);
    incomingByMonth.get(month).push(record);
  }
  const candidatesByMonth = new Map();
  let count = 0;
  for (const item of expenses) {
    const name = normalizeKeyText(item.name);
    for (const month of months) {
      if (postedByMonth.get(month)?.get(item.id) !== "auto") continue;
      if (!candidatesByMonth.has(month)) {
        const candidates = recurringLinkCandidates(month, incomingByMonth.get(month) || []);
        candidatesByMonth.set(month, {
          amounts: new Set(candidates.map((record) => Number(record.amount))),
          names: new Set(candidates.map((record) => normalizeKeyText(record.merchant)))
        });
      }
      const candidates = candidatesByMonth.get(month);
      if (candidates.amounts.has(Number(item.amount)) || (name && candidates.names.has(name))) count++;
    }
  }
  return count;
}

function findImportSheet(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const options = { header: 1, raw: false, defval: "" };
    const headerRows = XLSX.utils.sheet_to_json(sheet, {
      ...options,
      range: { s: range.s, e: { r: Math.min(range.e.r, range.s.r + 11), c: range.e.c } }
    });

    for (let headerRowIndex = 0; headerRowIndex < headerRows.length; headerRowIndex++) {
      const map = headerMap(headerRows[headerRowIndex]);
      const hasDate = map.date !== undefined;
      const hasMerchant = map.merchant !== undefined;
      const hasCardAmount = map.amount !== undefined;
      const hasTransferAmount = map.withdrawal !== undefined || map.deposit !== undefined;
      const kind = hasDate && hasTransferAmount ? "transfer"
        : hasDate && hasMerchant && hasCardAmount ? "card" : "";
      if (kind) {
        const rows = XLSX.utils.sheet_to_json(sheet, options);
        return { kind, sheetName, rows, map, headerRowIndex };
      }
    }
  }
  return null;
}

function headerMap(row) {
  const map = {};
  const aliases = Object.entries(FIELD_ALIASES).flatMap(([field, labels]) =>
    labels.map((label) => [normalizeHeader(label), field])
  );
  row.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    if (!normalized) return;
    const match = aliases.find(([alias]) => normalized === alias || normalized.includes(alias) || alias.includes(normalized));
    if (match && map[match[1]] === undefined) map[match[1]] = index;
  });
  return map;
}
