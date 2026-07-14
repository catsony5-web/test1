function renderKpi(label, value, numericValue, hint, mode = "balance") {
  const number = Number(numericValue || 0);
  const tone = ["payment", "spend", "income", "savings", "balance", "neutral"].includes(mode) ? mode : "balance";
  const state = ["payment", "spend", "neutral"].includes(tone) ? "neutral" : number >= 0 ? "good" : "bad";
  return `
    <article class="monthly-kpi ${state} ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `;
}
