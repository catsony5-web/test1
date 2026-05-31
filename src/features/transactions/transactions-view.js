async function handleManualEntry(event) {
  event.preventDefault();
  const item = buildManualTransaction({
    sourceType: els.manualSourceType.value,
    flow: els.manualFlow.value,
    date: els.manualDate.value,
    time: els.manualTime.value,
    merchant: els.manualMerchant.value,
    amount: els.manualAmount.value,
    sector: els.manualSector.value,
    subcategory: els.manualSubcategory.value
  });
  if (!item) {
    alert("날짜, 내용, 금액을 입력해주세요.");
    return;
  }

  await createAutoSnapshot("직접 거래 입력 전");
  transactions = mergeTransactions(transactions, [item]).records;
  importMeta = { ...importMeta, lastFileName: "직접 입력", lastImportedAt: new Date().toISOString(), lastAddedCount: 1, lastSkippedCount: 0 };
  currentFileName = "직접 입력";
  await saveTransactions();
  await saveImportMeta();
  els.manualMerchant.value = "";
  els.manualAmount.value = "";
  reclassify();
}


async function handlePasteEntries() {
  const text = els.pasteEntries.value.trim();
  if (!text) return;
  const entries = text.split(/\r?\n/)
    .map((line) => parsePastedLine(line))
    .filter(Boolean)
    .map((entry) => buildManualTransaction({
      sourceType: els.manualSourceType.value,
      flow: els.manualFlow.value,
      date: entry.date,
      time: entry.time,
      merchant: entry.merchant,
      amount: entry.amount,
      sector: els.manualSector.value,
      subcategory: els.manualSubcategory.value
    }))
    .filter(Boolean);

  if (!entries.length) {
    alert("붙여넣은 내용에서 날짜, 내용, 금액을 찾지 못했습니다.");
    return;
  }

  const mergeResult = mergeTransactions(transactions, entries);
  transactions = mergeResult.records;
  importMeta = {
    ...importMeta,
    lastFileName: "붙여넣기 입력",
    lastImportedAt: new Date().toISOString(),
    lastAddedCount: mergeResult.added,
    lastSkippedCount: mergeResult.skipped
  };
  currentFileName = "붙여넣기 입력";
  await saveTransactions();
  await saveImportMeta();
  els.pasteEntries.value = "";
  reclassify();
  alert(`붙여넣은 내역 ${mergeResult.added.toLocaleString("ko-KR")}건을 추가했습니다. 중복 ${mergeResult.skipped.toLocaleString("ko-KR")}건은 건너뛰었습니다.`);
}

function buildManualTransaction({ sourceType, flow, date, time, merchant, amount, sector, subcategory }) {
  const approvalDate = normalizeInputDate(date);
  const cleanMerchant = String(merchant || "").trim();
  const cleanAmount = toNumber(amount);
  if (!approvalDate || !cleanMerchant || !cleanAmount) return null;
  const isIncome = flow === "income";
  const transaction = {
    sourceType: sourceType || "card",
    flow: isIncome ? "income" : "expense",
    cardNumber: "",
    approvalDate,
    month: monthKey(approvalDate),
    approvalTime: normalizeInputTime(time),
    merchant: cleanMerchant,
    amount: Math.abs(cleanAmount),
    installment: "",
    approvalNo: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cancel: "",
    payDate: "",
    manualSector: isIncome ? "수입" : sector,
    manualSubcategory: isIncome ? "이체입금" : subcategory,
    sourceFile: "직접입력",
    importedAt: new Date().toISOString()
  };
  transaction.recordKey = createRecordKey(transaction);
  return transaction;
}

function parsePastedLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const tabParts = trimmed.split(/\t|,/).map((part) => part.trim()).filter(Boolean);
  if (tabParts.length >= 3) {
    const dateIndex = tabParts.findIndex((part) => normalizeInputDate(part));
    const amountIndex = [...tabParts].reverse().findIndex((part) => toNumber(part));
    const realAmountIndex = amountIndex >= 0 ? tabParts.length - 1 - amountIndex : -1;
    if (dateIndex >= 0 && realAmountIndex >= 0 && dateIndex !== realAmountIndex) {
      const merchant = tabParts.filter((_, index) => index !== dateIndex && index !== realAmountIndex).join(" ");
      return { date: tabParts[dateIndex], time: "", merchant, amount: tabParts[realAmountIndex] };
    }
  }

  const match = trimmed.match(/^(\d{4}[.-]\d{1,2}[.-]\d{1,2})(?:\s+(\d{1,2}:\d{2}))?\s+(.+?)\s+(-?[\d,]+)\s*원?$/);
  if (!match) return null;
  return { date: match[1], time: match[2] || "", merchant: match[3], amount: match[4] };
}

function syncManualCategoryControls() {
  const isIncome = els.manualFlow.value === "income";
  els.manualSector.disabled = isIncome;
  els.manualSubcategory.disabled = isIncome;
  if (isIncome) {
    els.manualSector.value = "수입";
    updateSubcategorySelect(els.manualSector, els.manualSubcategory, "이체입금");
  } else {
    els.manualSector.disabled = false;
    els.manualSubcategory.disabled = false;
    if (els.manualSector.value === "수입") els.manualSector.value = "식비";
    updateSubcategorySelect(els.manualSector, els.manualSubcategory);
  }
}

function readCell(row, map, key) {
  const index = map[key];
  return index === undefined ? "" : String(row[index] ?? "").trim();
}

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[()[\]{}<>]/g, "")
    .replace(/원|₩/g, "")
    .trim()
    .toLocaleLowerCase("ko-KR");
}


function renderTransactions() {
  const rows = classified.filter((item) => !(typeof isDeletedRecurringTombstone === "function" && isDeletedRecurringTombstone(item))).map((item) => ({
    유형: sourceTypeLabel(item.sourceType),
    흐름: item.flow === "income" ? "수입" : "지출",
    승인일자: item.approvalDate,
    승인시간: item.approvalTime,
    월: item.month,
    가맹점명: item.merchant,
    금액: item.amount,
    할부: item.installment || "",
    월할부예상액: installmentMonthlyAmount(item) || "",
    정산받은금액: reimbursementFor(item),
    실지출액: actualAmount(item),
    섹터: item.sector,
    세부항목: item.subcategory,
    상태: item.status,
    고정지출ID: item.recurringId || "",
    메모: item.memo || "",
    업로드파일: item.sourceFile || ""
  }));
  renderObjectTable(els.transactionsTable, rows, ["유형", "흐름", "승인일자", "승인시간", "월", "가맹점명", "금액", "할부", "월할부예상액", "정산받은금액", "실지출액", "섹터", "세부항목", "상태", "고정지출ID", "메모", "업로드파일"], {
    amountColumns: ["금액", "월할부예상액", "정산받은금액", "실지출액"],
    renderCell(key, value, row) {
      if (key === "섹터") return sectorTag(value);
      if (key === "세부항목") return subcategoryPill(row.섹터, value);
      return escapeHtml(value);
    }
  });
}
