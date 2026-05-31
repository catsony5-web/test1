function handleIncomeBulkParse() {
  const parsed = parseIncomeBulkText(els.incomeBulkPaste.value);
  incomeBulkRows = parsed.rows;
  renderIncomeBulkPreview(parsed.errorCount ? `${parsed.errorCount.toLocaleString("ko-KR")}개 줄은 확인이 필요합니다.` : "붙여넣기 내용을 파싱했습니다.");
}

function clearIncomeBulkInput() {
  els.incomeBulkPaste.value = "";
  incomeBulkRows = [];
  renderIncomeBulkPreview("");
}

async function handleIncomeBulkSave() {
  updateIncomeBulkRowsFromPreview();
  const validRows = incomeBulkRows.map(validateIncomeBulkRow).filter((row) => row.valid);
  if (!validRows.length) {
    renderIncomeBulkPreview("저장할 수 있는 정상 수입 항목이 없습니다.");
    return;
  }

  const incoming = validRows.map((row) => buildManualTransaction({
    sourceType: "transfer",
    flow: "income",
    date: row.date,
    time: "",
    merchant: row.description,
    amount: row.amount,
    sector: "수입",
    subcategory: "이체입금"
  })).filter(Boolean);
  await createAutoSnapshot("수입 일괄 저장 전");
  const mergeResult = mergeTransactions(transactions, incoming);
  transactions = mergeResult.records;
  importMeta = {
    ...importMeta,
    lastFileName: "수입 일괄 입력",
    lastImportedAt: new Date().toISOString(),
    lastAddedCount: mergeResult.added,
    lastSkippedCount: mergeResult.skipped
  };
  currentFileName = "수입 일괄 입력";
  await saveTransactions();
  await saveImportMeta();
  incomeBulkRows = [];
  els.incomeBulkPaste.value = "";
  els.incomeBulkFeedback.textContent = `수입 ${mergeResult.added.toLocaleString("ko-KR")}건을 저장했습니다. 중복 ${mergeResult.skipped.toLocaleString("ko-KR")}건은 건너뛰었습니다.`;
  reclassify();
}

function parseIncomeBulkText(text) {
  const rows = String(text || "").split(/\r?\n/)
    .map((line, index) => parseIncomeBulkLine(line, index + 1))
    .filter(Boolean);
  return {
    rows,
    errorCount: rows.filter((row) => !row.valid).length
  };
}

function parseIncomeBulkLine(line, lineNumber) {
  const original = String(line || "").trim();
  if (!original) return null;
  const dateMatch = original.match(/^\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})\s+(.+)$/);
  if (!dateMatch) {
    return validateIncomeBulkRow({ id: incomeBulkRowId(lineNumber), lineNumber, original, date: "", description: original, amount: 0 });
  }

  const date = normalizeInputDate(dateMatch[1]);
  const rest = dateMatch[2].trim();
  const amountMatch = lastIncomeAmountMatch(rest);
  if (!amountMatch) {
    return validateIncomeBulkRow({ id: incomeBulkRowId(lineNumber), lineNumber, original, date, description: rest, amount: 0 });
  }

  const description = stripTrailingIncomeAmounts(rest.slice(0, amountMatch.index).trim());
  return validateIncomeBulkRow({
    id: incomeBulkRowId(lineNumber),
    lineNumber,
    original,
    date,
    description,
    amount: amountMatch.amount
  });
}

function incomeBulkRowId(lineNumber) {
  return `income-bulk-${Date.now()}-${lineNumber}-${Math.random().toString(36).slice(2, 6)}`;
}

function lastIncomeAmountMatch(text) {
  const matches = [...String(text || "").matchAll(/-?\d[\d,]*\s*원?/g)]
    .map((match) => ({
      raw: match[0],
      index: match.index || 0,
      amount: toNumber(match[0].replace(/원/g, ""))
    }))
    .filter((match) => match.amount && (match.raw.includes(",") || match.raw.includes("원") || Math.abs(match.amount) >= 1000));
  return matches.at(-1) || null;
}

function stripTrailingIncomeAmounts(text) {
  let output = String(text || "").trim();
  while (true) {
    const match = output.match(/(?:\s+|^)(-?\d[\d,]*\s*원?)\s*$/);
    if (!match) return output.trim();
    const amount = toNumber(match[1].replace(/원/g, ""));
    if (!amount || (!match[1].includes(",") && !match[1].includes("원") && Math.abs(amount) < 1000)) return output.trim();
    output = output.slice(0, match.index).trim();
  }
}

function validateIncomeBulkRow(row) {
  const date = normalizeInputDate(row.date);
  const description = String(row.description || "").trim();
  const amount = toNumber(row.amount);
  const errors = [];
  if (!date) errors.push("날짜 확인");
  if (!description) errors.push("내용 확인");
  if (!amount) errors.push("금액 확인");
  return {
    ...row,
    date,
    description,
    amount,
    valid: !errors.length,
    error: errors.join(", ")
  };
}

function updateIncomeBulkRowsFromPreview() {
  if (!els.incomeBulkPreview) return;
  els.incomeBulkPreview.querySelectorAll("[data-income-bulk-index]").forEach((input) => {
    const index = Number(input.dataset.incomeBulkIndex);
    const field = input.dataset.incomeBulkField;
    if (!incomeBulkRows[index] || !field) return;
    incomeBulkRows[index][field] = input.value;
  });
  incomeBulkRows = incomeBulkRows.map(validateIncomeBulkRow);
}

function renderIncomeBulkPreview(message = "") {
  if (message) els.incomeBulkFeedback.textContent = message;
  else els.incomeBulkFeedback.textContent = "";
  els.saveIncomeBulkButton.disabled = !incomeBulkRows.some((row) => row.valid);
  if (!incomeBulkRows.length) {
    els.incomeBulkPreview.innerHTML = `<tbody><tr><td class="empty">붙여넣기 내용을 파싱하면 미리보기가 표시됩니다.</td></tr></tbody>`;
    return;
  }

  els.incomeBulkPreview.innerHTML = `
    <thead>
      <tr>
        <th>날짜</th>
        <th>내용</th>
        <th class="amount">금액</th>
        <th>상태</th>
        <th>삭제</th>
      </tr>
    </thead>
    <tbody>
      ${incomeBulkRows.map((row, index) => {
        const checked = validateIncomeBulkRow(row);
        incomeBulkRows[index] = checked;
        return `
          <tr class="${checked.valid ? "" : "income-preview-error"}">
            <td><input data-income-bulk-index="${index}" data-income-bulk-field="date" type="date" value="${escapeHtml(checked.date)}"></td>
            <td><input data-income-bulk-index="${index}" data-income-bulk-field="description" type="text" value="${escapeHtml(checked.description)}" title="${escapeHtml(checked.original || "")}"></td>
            <td><input data-income-bulk-index="${index}" data-income-bulk-field="amount" class="amount-input" type="text" inputmode="numeric" value="${escapeHtml(formatPlainNumber(checked.amount))}"></td>
            <td>${checked.valid ? `<span class="income-status ok">정상</span>` : `<span class="income-status error">${escapeHtml(checked.error)}</span>`}</td>
            <td><button type="button" class="income-row-delete" data-delete-income-bulk="${index}">삭제</button></td>
          </tr>
        `;
      }).join("")}
    </tbody>
  `;

  els.incomeBulkPreview.querySelectorAll("[data-income-bulk-index]").forEach((input) => {
    input.addEventListener("change", () => {
      updateIncomeBulkRowsFromPreview();
      renderIncomeBulkPreview("미리보기 내용을 다시 검증했습니다.");
    });
  });
  els.incomeBulkPreview.querySelectorAll("[data-delete-income-bulk]").forEach((button) => {
    button.addEventListener("click", () => {
      updateIncomeBulkRowsFromPreview();
      incomeBulkRows.splice(Number(button.dataset.deleteIncomeBulk), 1);
      renderIncomeBulkPreview("선택한 줄을 미리보기에서 삭제했습니다.");
    });
  });
}
