async function handleIncomeEntry(event) {
  event.preventDefault();
  const item = buildManualTransaction({
    sourceType: "transfer",
    flow: "income",
    date: els.incomeEntryDate.value,
    time: "",
    merchant: els.incomeEntryDescription.value,
    amount: els.incomeEntryAmount.value,
    sector: "수입",
    subcategory: "이체입금"
  });
  if (!item) {
    alert("수입 날짜, 내용, 금액을 입력해주세요.");
    return;
  }

  await createAutoSnapshot("수입 단건 저장 전");
  const mergeResult = mergeTransactions(transactions, [item]);
  transactions = mergeResult.records;
  importMeta = {
    ...importMeta,
    lastFileName: "수입 직접 입력",
    lastImportedAt: new Date().toISOString(),
    lastAddedCount: mergeResult.added,
    lastSkippedCount: mergeResult.skipped
  };
  currentFileName = "수입 직접 입력";
  await saveTransactions();
  await saveImportMeta();
  els.incomeEntryDescription.value = "";
  els.incomeEntryAmount.value = "";
  reclassify();
}
