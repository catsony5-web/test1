function sourceTypeLabel(value) {
  return {
    card: "카드",
    transfer: "이체",
    cash: "현금",
    manual: "직접 입력",
    other: "기타",
    recurring: "고정 지출"
  }[value] || "카드";
}

function isCanceled(value) {
  const text = String(value ?? "").trim();
  return text !== "" && text !== "-";
}


function categoryClass(sector) {
  return sectorTheme(sector).className;
}

function sectorTheme(sector) {
  if (sector === "경조사/선물") return sectorThemes["기타 소비"];
  return sectorThemes[sector] || sectorThemes["미분류"];
}

function categoryChip(sector, subcategory) {
  return `
    <span class="category-chip ${categoryClass(sector)}">
      <b>${escapeHtml(sector || "미분류")}</b>
      ${subcategory ? `<small>${escapeHtml(subcategory)}</small>` : ""}
    </span>
  `;
}

function subcategoryPill(sector, subcategory) {
  return `<span class="subcategory-pill ${categoryClass(sector)}">${escapeHtml(subcategory || "-")}</span>`;
}

function sectorTag(sector) {
  const className = categoryClass(sector);
  return `<span class="tag ${className}">${escapeHtml(sector)}</span>`;
}
