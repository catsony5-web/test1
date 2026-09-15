async function handleIncomeEntry(event) {
  event.preventDefault();
  return runManualTransactionSave(async () => {
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
    const nextImportMeta = {
      ...importMeta,
      lastFileName: "수입 직접 입력",
      lastImportedAt: new Date().toISOString(),
      lastAddedCount: mergeResult.added,
      lastSkippedCount: mergeResult.skipped
    };
    if (!await safeSaveMany([
      { key: RECORD_STORAGE_KEY, data: mergeResult.records, protectIncomeRecords: true },
      { key: IMPORT_META_STORAGE_KEY, data: nextImportMeta }
    ])) return;
    transactions = mergeResult.records;
    importMeta = nextImportMeta;
    currentFileName = "수입 직접 입력";
    els.incomeEntryDescription.value = "";
    els.incomeEntryAmount.value = "";
    reclassify();
  });
}
