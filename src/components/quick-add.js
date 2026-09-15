function attachReimbursementHandlers(root = els.boardGrid) {
  root.querySelectorAll(".reimbursement-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.recordKey;
      if (!key) return;
      const record = classified.find((item) => item.recordKey === key);
      const max = Number(record?.amount || 0);
      const value = Math.min(max, Math.max(0, toNumber(input.value)));
      if (value > 0) reimbursements[key] = value;
      else delete reimbursements[key];
      await saveReimbursements();
      renderAll();
    });
  });
}

function attachBoardQuickAddHandlers(root = els.boardGrid, rerender = renderBoard) {
  root.querySelectorAll("[data-quick-add-open]").forEach((button) => {
    button.addEventListener("click", () => {
      boardQuickAddSectionKey = button.dataset.quickAddOpen;
      boardQuickAddFeedback = "";
      rerender();
    });
  });

  root.querySelectorAll("[data-quick-add-close]").forEach((button) => {
    button.addEventListener("click", () => {
      boardQuickAddSectionKey = "";
      boardQuickAddFeedback = "";
      rerender();
    });
  });

  root.querySelectorAll("[data-quick-add-form]").forEach((form) => {
    form.addEventListener("submit", handleBoardQuickAdd);
  });
}

async function handleBoardQuickAdd(event) {
  event.preventDefault();
  return runManualTransactionSave(async () => {
    const form = event.currentTarget;
    const section = boardSections.find((item) => item.key === form.dataset.quickAddForm);
    if (!section) return;

    const formData = new FormData(form);
    const item = buildManualTransaction({
      sourceType: formData.get("sourceType"),
      flow: "expense",
      date: formData.get("date"),
      time: "",
      merchant: formData.get("merchant"),
      amount: formData.get("amount"),
      sector: section.sector,
      subcategory: section.subcategory
    });
    if (!item) {
      alert("날짜, 내용, 총 결제액을 입력해주세요.");
      return;
    }

    const reimbursement = Math.min(Number(item.amount || 0), Math.max(0, toNumber(formData.get("reimbursement"))));
    const mergeResult = mergeTransactions(transactions, [item]);
    const nextReimbursements = { ...reimbursements };
    if (mergeResult.added && reimbursement > 0) nextReimbursements[item.recordKey] = reimbursement;
    const nextImportMeta = {
      ...importMeta,
      lastFileName: "분류 보드 직접 입력",
      lastImportedAt: new Date().toISOString(),
      lastAddedCount: mergeResult.added,
      lastSkippedCount: mergeResult.skipped
    };
    if (!await safeSaveMany([
      { key: RECORD_STORAGE_KEY, data: mergeResult.records, protectIncomeRecords: true },
      { key: REIMBURSEMENT_STORAGE_KEY, data: nextReimbursements },
      { key: IMPORT_META_STORAGE_KEY, data: nextImportMeta }
    ])) return;
    transactions = mergeResult.records;
    reimbursements = nextReimbursements;
    importMeta = nextImportMeta;
    currentFileName = "분류 보드 직접 입력";
    boardQuickAddSectionKey = "";
    boardQuickAddFeedback = section.key;
    reclassify();
    window.setTimeout(() => {
      if (boardQuickAddFeedback === section.key) {
        boardQuickAddFeedback = "";
        renderAll();
      }
    }, 1800);
  });
}
