function backupDifferenceRows(conflict) {
  if (conflict.kind === "monthly-income") {
    return [{ label: "월 수입", current: formatWon(Number(conflict.current)), backup: formatWon(Number(conflict.incoming)) }];
  }
  if (conflict.kind === "family-adjustment") {
    const purposes = { loan_payment: "대출 상환에 사용", return: "부모님께 반환", other: "기타" };
    return [
      ["날짜", "date"], ["금액", "amount"], ["용도", "purpose"], ["메모", "memo"], ["연결 상환", "linkedLoanTransactionId"]
    ].filter(([, key]) => conflict.current[key] !== conflict.incoming[key]).map(([label, key]) => {
      const display = (record) => key === "amount" ? formatSignedWon(record[key])
        : key === "purpose" ? purposes[record[key]] || record[key] : record[key] || "없음";
      return { label, current: display(conflict.current), backup: display(conflict.incoming) };
    });
  }
  if (conflict.kind === "recurring-family-burden") {
    const display = (record) => (record.familyBurdenHistory || []).map((entry) => `${entry.fromMonth}부터 ${formatWon(entry.amount)}`).join(" / ") || "설정 없음";
    const loans = (record) => (record.loanSupportHistory || []).map((entry) => `${entry.fromMonth}부터 원금 ${formatWon(entry.principal)} / 이자 ${formatWon(entry.interest)}`).join(" / ") || "설정 없음";
    return [
      { label: "가족 부담 적용 이력", current: display(conflict.current), backup: display(conflict.incoming) },
      { label: "대출 분담 적용 이력", current: loans(conflict.current), backup: loans(conflict.incoming) }
    ];
  }
  const names = {
    amount: "금액", merchant: "사용처 / 수입 내용", approvalDate: "날짜", approvalTime: "시간", month: "해당 월",
    incomeKind: "수입 / 가족 지원", incomeKindSource: "가족 분류 방식", familyTargetMonth: "정산 대상월", familySender: "보낸 사람", familyBurdenAmount: "가족 부담액",
    memo: "메모", manualSector: "분류", manualSubcategory: "세부 분류", foodOccasion: "식사 상황",
    classificationScope: "분류 적용 범위", flow: "수입 / 지출", sourceType: "거래 유형", cancel: "취소 여부",
    installment: "할부", installmentEnabled: "할부 적용", installmentMonths: "할부 개월", installmentStartMonth: "할부 시작 월",
    installmentOriginalAmount: "할부 원금", installmentMonthlyAmount: "월 할부 금액", recurringType: "고정 지출 유형",
    loanType: "대출 유형", loanPrincipalAmount: "대출 원금", loanInterestAmount: "대출 이자",
    loanSupportPrincipalAmount: "가족 부담 원금", loanSupportInterestAmount: "가족 부담 이자",
    loanSupportReceivedAmount: "가족 입금액", loanSupportReceivedDate: "가족 입금일", loanLinkedExisting: "기존 거래 연결",
    payDate: "결제일", cardNumber: "카드 번호", sourceFile: "입력 출처", approvalNo: "승인 번호",
    recordKey: "거래 식별 정보", transactionId: "거래 연결 정보", recurringId: "고정 지출 연결",
    installmentGroupId: "할부 연결", loanSupportIncomeTransactionId: "가족 입금 연결",
    loanLinkedOriginalSector: "연결 전 분류", loanLinkedOriginalSubcategory: "연결 전 세부 분류", loanLinkedOriginalMemo: "연결 전 메모"
  };
  const current = conflict.current.record;
  const incoming = conflict.incoming.record;
  const moneyFields = new Set(["amount", "installmentOriginalAmount", "installmentMonthlyAmount", "loanPrincipalAmount", "loanInterestAmount", "loanSupportPrincipalAmount", "loanSupportInterestAmount", "loanSupportReceivedAmount"]);
  const display = (value) => value === undefined || value === null || value === "" ? "없음"
    : typeof value === "boolean" ? (value ? "예" : "아니오")
      : typeof value === "object" ? JSON.stringify(value) : String(value);
  const rows = [...new Set([...Object.keys(current), ...Object.keys(incoming)])]
    .filter((field) => !BACKUP_MERGE_PROVENANCE_FIELDS.has(field) && JSON.stringify(current[field]) !== JSON.stringify(incoming[field]))
    .map((field) => ({ label: names[field] || field,
      current: moneyFields.has(field) ? formatWon(Number(current[field] || 0)) : display(current[field]),
      backup: moneyFields.has(field) ? formatWon(Number(incoming[field] || 0)) : display(incoming[field]) }));
  const currentScope = getTransactionDataSection(current);
  const incomingScope = getTransactionDataSection(incoming);
  if (currentScope !== incomingScope) {
    rows.push({ label: "백업 / 초기화 항목", current: scopeLabels([currentScope])[0], backup: scopeLabels([incomingScope])[0] });
  }
  if (Number(conflict.current.reimbursement || 0) !== Number(conflict.incoming.reimbursement || 0)) {
    rows.push({ label: "정산받은 금액", current: formatWon(Number(conflict.current.reimbursement || 0)), backup: formatWon(Number(conflict.incoming.reimbursement || 0)) });
  }
  return rows;
}

function reviewBackupDifferences(conflicts) {
  const dialog = document.getElementById("backupCompareDialog");
  const form = document.getElementById("backupCompareForm");
  const list = document.getElementById("backupCompareItems");
  const status = document.getElementById("backupCompareStatus");
  list.replaceChildren();
  status.textContent = `${conflicts.length.toLocaleString("ko-KR")}개 항목의 내용이 다릅니다. 각 항목에서 보관할 내용을 선택해 주세요.`;
  conflicts.forEach((conflict, index) => {
    const group = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `${index + 1}. ${conflict.label}`;
    group.append(legend);
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const heading = document.createElement("tr");
    for (const label of ["다른 항목", "현재 가계부", "백업 파일"]) {
      const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; heading.append(cell);
    }
    head.append(heading); table.append(head);
    const body = document.createElement("tbody");
    for (const row of backupDifferenceRows(conflict)) {
      const line = document.createElement("tr");
      for (const value of [row.label, row.current, row.backup]) {
        const cell = document.createElement("td"); cell.textContent = value; line.append(cell);
      }
      body.append(line);
    }
    table.append(body); group.append(table);
    const options = document.createElement("div"); options.className = "backup-compare-choices";
    for (const [value, label] of [["current", "현재 내용 유지"], ["backup", "백업 내용 사용"]]) {
      const choice = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = `backup-choice-${index}`; radio.value = value; radio.required = true;
      const text = document.createElement("span"); text.textContent = label;
      choice.append(radio, text); options.append(choice);
    }
    group.append(options); list.append(group);
  });
  return new Promise((resolve) => {
    let result = null;
    const submit = (event) => {
      event.preventDefault();
      const choices = {};
      for (const [index, conflict] of conflicts.entries()) {
        const checked = form.querySelector(`input[name="backup-choice-${index}"]:checked`);
        if (!checked) { status.textContent = "모든 항목에서 보관할 내용을 선택해 주세요."; return; }
        choices[conflict.id] = checked.value;
      }
      result = choices; dialog.close();
    };
    const cancel = () => dialog.close();
    const close = () => {
      form.removeEventListener("submit", submit);
      document.getElementById("backupCompareCancel").removeEventListener("click", cancel);
      dialog.removeEventListener("close", close);
      list.replaceChildren();
      resolve(result);
    };
    form.addEventListener("submit", submit);
    document.getElementById("backupCompareCancel").addEventListener("click", cancel);
    dialog.addEventListener("close", close);
    dialog.showModal();
  });
}
