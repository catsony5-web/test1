const backupMergePlans = new WeakMap();
const BACKUP_MERGE_LINK_FIELDS = [
  "recordKey", "transactionId", "recurringId", "recurringType", "loanSupportIncomeTransactionId",
  "loanLinkedExisting", "loanLinkedOriginalSector", "loanLinkedOriginalSubcategory", "loanLinkedOriginalMemo", "installmentGroupId"
];
const BACKUP_MERGE_PROVENANCE_FIELDS = new Set(["recordKey", "transactionId", "createdAt", "updatedAt", "importedAt", "sourceFile"]);

function backupMergeClone(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("안전하지 않은 백업 항목입니다.");
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("백업에 올바르지 않은 숫자가 있습니다.");
    return item;
  }));
}

function backupMergeCanonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(backupMergeCanonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${backupMergeCanonical(value[key])}`).join(",")}}`;
}

function backupMergeCurrentState() {
  return backupMergeClone({
    transactions: transactions.map(normalizeStoredTransaction),
    reimbursements: normalizeReimbursements(reimbursements),
    monthlyIncome: monthlyIncome || {}
  });
}

function backupMergeSelectedScopes(bundle, scopes) {
  return normalizeScopeList(scopes).filter((scope) => backupBundleHasScope(bundle, scope));
}

function backupMergeRequest(bundle, scopes) {
  return backupMergeCanonical(backupMergeClone(Object.fromEntries(scopes.map((scope) => [scope, bundle.sections[scope]]))));
}

function backupMergeBusinessValue(record) {
  return {
    fields: Object.fromEntries(Object.entries(record).filter(([key]) => !BACKUP_MERGE_PROVENANCE_FIELDS.has(key))),
    section: getTransactionDataSection(record)
  };
}

function backupMergePreserveLinks(current, incoming) {
  const result = { ...incoming };
  for (const field of BACKUP_MERGE_LINK_FIELDS) {
    if (Object.hasOwn(current, field)) result[field] = current[field];
    else delete result[field];
  }
  return result;
}

function backupMergeFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) backupMergeFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function buildBackupMergePlan(bundle, scopes) {
  const selected = backupMergeSelectedScopes(bundle, scopes);
  const baseline = backupMergeCurrentState();
  const transactionScopes = selected.filter((scope) => TRANSACTION_DATA_SCOPES.has(scope));
  const indexedRecords = [...baseline.transactions];
  const indexes = [new Map(), new Map(), new Map()];
  const identityValues = (record) => [record.recordKey, record.transactionId, transactionRestoreSignature(record)];
  function indexRecord(record, index) {
    identityValues(record).forEach((identity, kind) => {
      if (!identity) return;
      if (!indexes[kind].has(identity)) indexes[kind].set(identity, new Set());
      indexes[kind].get(identity).add(index);
    });
  }
  indexedRecords.forEach(indexRecord);
  const incomingRows = [];
  const byTarget = new Map();
  const transactionAliases = new Map();
  const recordReferenceAliases = new Map();
  for (const scope of transactionScopes) {
    const section = bundle.sections[scope];
    const incomingReimbursements = normalizeReimbursements(section?.reimbursements);
    for (const raw of Array.isArray(section?.records) ? section.records : []) {
      const incoming = normalizeStoredTransaction(raw);
      if (getTransactionDataSection(incoming) !== scope) continue;
      const matches = new Set();
      identityValues(incoming).forEach((identity, kind) => {
        if (identity) for (const index of indexes[kind].get(identity) || []) matches.add(index);
      });
      if (matches.size > 1) throw new Error("백업 거래의 식별 정보가 서로 다른 현재 거래를 가리킵니다. 파일을 확인해 주세요.");
      const index = matches.size ? [...matches][0] : indexedRecords.length;
      if (!matches.size) indexedRecords.push(incoming);
      const current = index < baseline.transactions.length ? baseline.transactions[index] : null;
      const target = current || indexedRecords[index];
      transactionAliases.set(incoming.transactionId, target.transactionId);
      recordReferenceAliases.set(incoming.recordKey, target.transactionId || target.recordKey);
      const next = current ? backupMergePreserveLinks(current, incoming) : { ...incoming };
      const reimbursement = incomingReimbursements[incoming.recordKey] || 0;
      const prior = byTarget.get(index);
      if (prior) {
        if (backupMergeCanonical(backupMergeBusinessValue(prior.incoming)) !== backupMergeCanonical(backupMergeBusinessValue(next)) || prior.reimbursement !== reimbursement) {
          throw new Error("백업 파일 안에 내용이 서로 다른 중복 거래가 있습니다. 파일을 확인해 주세요.");
        }
      } else {
        const row = { index, scope, current, incoming: next, reimbursement };
        incomingRows.push(row);
        byTarget.set(index, row);
      }
      indexRecord(incoming, index);
    }
  }
  // New transactions may refer to an income whose backup identity matched an existing record.
  for (const row of incomingRows) {
    if (row.current || !row.incoming.loanSupportIncomeTransactionId) continue;
    const reference = row.incoming.loanSupportIncomeTransactionId;
    const transactionTarget = transactionAliases.get(reference);
    const recordTarget = recordReferenceAliases.get(reference);
    if (transactionTarget && recordTarget && transactionTarget !== recordTarget) {
      throw new Error("백업의 수입 연결 식별자가 서로 다른 수입을 가리킵니다. 연결 정보를 확인해 주세요.");
    }
    row.incoming.loanSupportIncomeTransactionId = transactionTarget || recordTarget || reference;
  }
  const conflicts = [];
  let addedTransactions = 0;
  let unchangedTransactions = 0;
  for (const row of incomingRows) {
    if (!row.current) { addedTransactions += 1; continue; }
    const currentReimbursement = baseline.reimbursements[row.current.recordKey] || 0;
    if (backupMergeCanonical(backupMergeBusinessValue(row.current)) === backupMergeCanonical(backupMergeBusinessValue(row.incoming)) && currentReimbursement === row.reimbursement) {
      unchangedTransactions += 1;
      continue;
    }
    row.conflictId = `transaction:${row.index}`;
    conflicts.push({
      id: row.conflictId, scope: row.scope, kind: "transaction",
      label: [row.current.approvalDate, row.current.merchant].filter(Boolean).join(" · ") || "거래 기록",
      current: { record: backupMergeClone(row.current), reimbursement: currentReimbursement },
      incoming: { record: backupMergeClone(row.incoming), reimbursement: row.reimbursement }
    });
  }
  const incomeRows = [];
  if (selected.includes("incomeInput")) {
    const incomingIncome = bundle.sections.incomeInput?.monthlyIncome || {};
    if (!incomingIncome || typeof incomingIncome !== "object" || Array.isArray(incomingIncome)) throw new Error("월별 수입 백업 형식이 올바르지 않습니다.");
    for (const [month, rawAmount] of Object.entries(incomingIncome)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !["number", "string"].includes(typeof rawAmount) || String(rawAmount).trim() === "") {
        throw new Error("월별 수입 백업에 올바르지 않은 월 또는 금액이 있습니다.");
      }
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("월별 수입 백업에 올바르지 않은 금액이 있습니다.");
      const row = { month, amount };
      if (Object.hasOwn(baseline.monthlyIncome, month) && Number(baseline.monthlyIncome[month]) !== amount) {
        row.conflictId = `monthly-income:${month}`;
        conflicts.push({ id: row.conflictId, scope: "incomeInput", kind: "monthly-income", label: `${month} 월별 수입`, current: baseline.monthlyIncome[month], incoming: amount });
      }
      incomeRows.push(row);
    }
  }
  const plan = backupMergeFreeze({ version: 1, scopes: [...selected], conflicts,
    summary: { addedTransactions, unchangedTransactions, conflicts: conflicts.length } });
  backupMergePlans.set(plan, {
    baseline, baselineFingerprint: backupMergeCanonical(baseline),
    request: backupMergeRequest(bundle, selected), transactionScopes, incomingRows, incomeRows
  });
  return plan;
}

function assertBackupMergePlanCurrent(plan, bundle, scopes) {
  const prepared = backupMergePlans.get(plan);
  if (!prepared) throw new Error("백업 비교 내용을 다시 준비해 주세요.");
  if (prepared.baselineFingerprint !== backupMergeCanonical(backupMergeCurrentState())) {
    throw new Error("비교하는 동안 현재 기록이 변경되었습니다. 백업을 다시 선택하여 비교해 주세요.");
  }
  if (bundle && scopes) {
    const selected = backupMergeSelectedScopes(bundle, scopes);
    if (backupMergeCanonical(selected) !== backupMergeCanonical(plan.scopes) || backupMergeRequest(bundle, selected) !== prepared.request) {
      throw new Error("비교한 백업 파일 또는 복원 항목이 변경되었습니다. 다시 비교해 주세요.");
    }
  }
  return plan;
}

function resolveBackupMergePlan(plan, choices = {}, bundle, scopes) {
  assertBackupMergePlanCurrent(plan, bundle, scopes);
  if (!choices || typeof choices !== "object" || Array.isArray(choices)) throw new Error("백업 비교 선택이 올바르지 않습니다.");
  const conflictIds = new Set(plan.conflicts.map((conflict) => conflict.id));
  for (const id of Object.keys(choices)) if (!conflictIds.has(id)) throw new Error("현재 비교에 없는 항목이 선택되었습니다.");
  for (const id of conflictIds) {
    if (!Object.hasOwn(choices, id) || !["current", "backup"].includes(choices[id])) throw new Error("서로 다른 모든 항목에서 현재 기록 또는 백업 기록을 선택해 주세요.");
  }
  const prepared = backupMergePlans.get(plan);
  const result = backupMergeClone(prepared.baseline);
  for (const row of prepared.incomingRows) {
    if (row.current && (!row.conflictId || choices[row.conflictId] === "current")) continue;
    const incoming = backupMergeClone(row.incoming);
    if (row.current) result.transactions[row.index] = incoming;
    else result.transactions.push(incoming);
    if (row.reimbursement > 0) result.reimbursements[incoming.recordKey] = row.reimbursement;
    else delete result.reimbursements[incoming.recordKey];
  }
  for (const row of prepared.incomeRows) {
    if (!row.conflictId || choices[row.conflictId] === "backup") result.monthlyIncome[row.month] = row.amount;
  }
  if (prepared.transactionScopes.length) result.transactions.sort((a, b) =>
    `${a.approvalDate} ${a.approvalTime} ${a.merchant}`.localeCompare(`${b.approvalDate} ${b.approvalTime} ${b.merchant}`, "ko-KR"));
  return result;
}
