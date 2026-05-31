function parseImportedTransactions(importInfo, sourceFileName = "") {
  const { kind, rows, map, headerRowIndex } = importInfo;
  return rows.slice(headerRowIndex + 1).flatMap((row) =>
    kind === "transfer"
      ? parseTransferRow(row, map, sourceFileName)
      : parseCardRow(row, map, sourceFileName)
  ).filter(Boolean);
}

function parseCardRow(row, map, sourceFileName) {
  const merchant = readCell(row, map, "merchant");
  if (!merchant) return null;
  const amount = toNumber(readCell(row, map, "amount"));
  const approvalDate = readCell(row, map, "date");
  if (!approvalDate || !amount) return null;

  const transaction = {
    sourceType: "card",
    flow: "expense",
    cardNumber: readCell(row, map, "cardNumber"),
    approvalDate,
    month: monthKey(approvalDate),
    approvalTime: readCell(row, map, "time"),
    merchant,
    amount,
    installment: readCell(row, map, "installment"),
    approvalNo: readCell(row, map, "approvalNo"),
    cancel: readCell(row, map, "cancel"),
    payDate: readCell(row, map, "payDate"),
    sourceFile: sourceFileName,
    importedAt: new Date().toISOString()
  };
  transaction.recordKey = createRecordKey(transaction);
  return transaction;
}

function parseTransferRow(row, map, sourceFileName) {
  const approvalDate = readCell(row, map, "date");
  const merchant = readCell(row, map, "merchant") || "이체내역";
  if (!approvalDate || !merchant) return [];

  const withdrawal = toNumber(readCell(row, map, "withdrawal"));
  const deposit = toNumber(readCell(row, map, "deposit"));
  const genericAmount = toNumber(readCell(row, map, "amount"));
  const direction = readCell(row, map, "direction");
  const records = [];

  if (withdrawal > 0) records.push(makeTransferTransaction(row, map, sourceFileName, approvalDate, merchant, withdrawal, "expense"));
  if (deposit > 0) records.push(makeTransferTransaction(row, map, sourceFileName, approvalDate, merchant, deposit, "income"));

  if (!records.length && genericAmount !== 0) {
    const flow = inferTransferFlow(direction, genericAmount);
    records.push(makeTransferTransaction(row, map, sourceFileName, approvalDate, merchant, Math.abs(genericAmount), flow));
  }

  return records;
}

function makeTransferTransaction(row, map, sourceFileName, approvalDate, merchant, amount, flow) {
  const transaction = {
    sourceType: "transfer",
    flow,
    cardNumber: "",
    approvalDate,
    month: monthKey(approvalDate),
    approvalTime: readCell(row, map, "time"),
    merchant,
    amount,
    installment: "",
    approvalNo: readCell(row, map, "approvalNo"),
    cancel: "",
    payDate: "",
    sourceFile: sourceFileName,
    importedAt: new Date().toISOString()
  };
  transaction.recordKey = createRecordKey(transaction);
  return transaction;
}

function inferTransferFlow(direction, amount) {
  const text = normalizeKeyText(direction);
  if (text.includes("입금") || text.includes("수입") || text.includes("받")) return "income";
  if (text.includes("출금") || text.includes("지급") || text.includes("이체") || text.includes("보냄")) return "expense";
  return amount < 0 ? "expense" : "expense";
}
