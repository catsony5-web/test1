function renderObjectTable(table, rows, columns, options = {}) {
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty">표시할 데이터가 없습니다.</td></tr></tbody>`;
    return;
  }

  const amountColumns = new Set(options.amountColumns || []);
  const header = columns.map((column) => `<th class="${amountColumns.has(column) ? "amount" : ""}">${escapeHtml(column)}</th>`).join("");
  const body = rows.map((row) => {
    const cells = columns.map((column) => {
      const raw = row[column] ?? "";
      const content = options.renderCell ? options.renderCell(column, raw, row) : escapeHtml(raw);
      const value = amountColumns.has(column) ? formatWon(raw) : content;
      return `<td class="${amountColumns.has(column) ? "amount" : ""}">${amountColumns.has(column) ? value : content}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  table.innerHTML = `<thead><tr>${header}</tr></thead><tbody>${body}</tbody>`;
}

function fillCategorySelects(sectorSelect, subcategorySelect, preferred) {
  sectorSelect.innerHTML = Object.keys(categories)
    .filter((sector) => sector !== "미분류")
    .map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`)
    .join("");
  if (preferred?.sector && categories[preferred.sector]) sectorSelect.value = preferred.sector;
  updateSubcategorySelect(sectorSelect, subcategorySelect, preferred?.subcategory);
}

function updateSubcategorySelect(sectorSelect, subcategorySelect, preferred) {
  const options = categories[sectorSelect.value] || [];
  subcategorySelect.innerHTML = options
    .map((subcategory) => `<option value="${escapeHtml(subcategory)}">${escapeHtml(subcategory)}</option>`)
    .join("");
  if (preferred && options.includes(preferred)) subcategorySelect.value = preferred;
}
