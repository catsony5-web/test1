function renderKpi(label, value, numericValue, hint, mode = "balance") {
  const number = Number(numericValue || 0);
  const state = mode === "neutral" ? "neutral" : number >= 0 ? "good" : "bad";
  return `
    <article class="monthly-kpi ${state}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `;
}
