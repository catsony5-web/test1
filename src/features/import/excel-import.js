async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!window.XLSX) {
    alert("엑셀 파서가 아직 로드되지 않았습니다. 인터넷 연결을 확인한 뒤 다시 열어주세요.");
    return;
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
  const found = findImportSheet(workbook);
  if (!found) {
    alert("카드 이용내역 또는 은행 이체내역으로 보이는 시트를 찾지 못했습니다.\n날짜, 사용처/내용, 금액 또는 입금액/출금액 열이 필요합니다.");
    return;
  }

  await createAutoSnapshot("엑셀 업로드 전");
  const incoming = parseImportedTransactions(found, file.name);
  const mergeResult = mergeTransactions(transactions, incoming);
  transactions = mergeResult.records;
  currentFileName = file.name;
  importMeta = {
    lastFileName: file.name,
    lastImportedAt: new Date().toISOString(),
    lastAddedCount: mergeResult.added,
    lastSkippedCount: mergeResult.skipped
  };
  await saveTransactions();
  await saveImportMeta();
  await createAutoSnapshot("엑셀 업로드 완료 후");
  event.target.value = "";
  reclassify();
  alert(`${found.kind === "transfer" ? "이체내역" : "카드내역"}을 불러왔습니다.\n누적 기록에 ${mergeResult.added.toLocaleString("ko-KR")}건을 추가했습니다.\n중복 ${mergeResult.skipped.toLocaleString("ko-KR")}건은 건너뛰었습니다.`);
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
