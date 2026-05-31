function formatWon(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatPlainNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatSignedWon(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("ko-KR")}원`;
}

function formatCompactWon(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  const abs = Math.abs(number);
  if (abs >= 100000000) return `${sign}${Math.round(abs / 100000000).toLocaleString("ko-KR")}억`;
  if (abs >= 10000) return `${sign}${Math.round(abs / 10000).toLocaleString("ko-KR")}만`;
  return `${sign}${abs.toLocaleString("ko-KR")}`;
}

function formatPercent(part, total) {
  return total ? `${Math.round(Number(part || 0) / Number(total || 1) * 100)}%` : "0%";
}

function installmentMonths(value) {
  const text = String(value || "").trim();
  if (!text || /일시|일시불|없음|0개월/.test(text)) return 0;
  const match = text.match(/\d+/);
  const months = match ? Number(match[0]) : 0;
  return months > 1 ? months : 0;
}

function installmentMonthlyAmount(item) {
  const months = Number(item?.installmentMonths || 0) > 1
    ? Number(item.installmentMonths)
    : installmentMonths(item?.installment);
  if (!months) return 0;
  const amount = Number(item?.installmentOriginalAmount || item?.amount || 0);
  const stored = Number(item?.installmentMonthlyAmount || 0);
  return stored > 0 ? stored : Math.floor(amount / months);
}

function installmentSummaryText(item) {
  if (item?.isInstallmentOccurrence) {
    const months = Number(item.installmentMonths || 0);
    const index = Number(item.currentInstallmentIndex || item.installmentIndex || 0);
    if (months > 1 && index > 0) return `${index}/${months}회차 · 월 ${formatWon(item.amount)}`;
  }
  const structuredMonths = Number(item?.installmentMonths || 0);
  const months = item?.installmentEnabled && structuredMonths > 1
    ? structuredMonths
    : installmentMonths(item?.installment);
  if (!months) return "";
  const monthly = installmentMonthlyAmount(item);
  const startMonth = item?.installmentEnabled && item?.installmentStartMonth
    ? ` · ${item.installmentStartMonth}부터`
    : "";
  return `${months}개월 할부 · 월 ${formatWon(monthly)}${startMonth}`;
}
