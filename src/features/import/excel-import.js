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
  if (!window.XLSX) {
    alert("엑셀 파서가 아직 로드되지 않았습니다. 인터넷 연결을 확인한 뒤 다시 열어주세요.");
    return;
  }

  excelImportInProgress = true;
  const wasDisabled = event.target.disabled;
  event.target.disabled = true;
  try {
    let found;
    let mergeResult;
    let nextImportMeta;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
      found = findImportSheet(workbook);
      if (!found) {
        alert("카드 이용내역 또는 은행 이체내역으로 보이는 시트를 찾지 못했습니다.\n날짜, 사용처/내용, 금액 또는 입금액/출금액 열이 필요합니다.");
        return;
      }

      const incoming = parseImportedTransactions(found, file.name);
      await createAutoSnapshot("엑셀 업로드 전");
      mergeResult = mergeTransactions(transactions, incoming);
      nextImportMeta = {
        lastFileName: file.name,
        lastImportedAt: new Date().toISOString(),
        lastAddedCount: mergeResult.added,
        lastSkippedCount: mergeResult.skipped
      };
      const saved = await safeSaveMany([
        { key: RECORD_STORAGE_KEY, data: mergeResult.records.map(normalizeStoredTransaction), protectIncomeRecords: true },
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

function findImportSheet(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: ""
    });
    if (!rows.length) continue;

    const maxHeaderScan = Math.min(rows.length, 12);
    for (let headerRowIndex = 0; headerRowIndex < maxHeaderScan; headerRowIndex++) {
      const map = headerMap(rows[headerRowIndex]);
      const hasDate = map.date !== undefined;
      const hasMerchant = map.merchant !== undefined;
      const hasCardAmount = map.amount !== undefined;
      const hasTransferAmount = map.withdrawal !== undefined || map.deposit !== undefined;

      if (hasDate && hasTransferAmount) {
        return { kind: "transfer", sheetName, rows, map, headerRowIndex };
      }
      if (hasDate && hasMerchant && hasCardAmount) {
        return { kind: "card", sheetName, rows, map, headerRowIndex };
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
