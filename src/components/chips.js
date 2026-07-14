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

function sectorIconClass(sector) {
  return {
    "고정 주거비": "ti-building-bank",
    "식비": "ti-receipt",
    "생활용품": "ti-package",
    "쇼핑": "ti-wallet",
    "개인관리": "ti-palette",
    "자기개발": "ti-notebook",
    "경조사/선물": "ti-category",
    "교통비": "ti-repeat",
    "저축": "ti-cash-banknote",
    "수입": "ti-cash-plus",
    "기타 소비": "ti-dots",
    "미분류": "ti-alert-circle"
  }[sector] || "ti-category";
}

function subcategoryIconClass(sector, subcategory) {
  const icons = {
    "보험료": "ti-shield-check",
    "월세": "ti-home-dollar",
    "전기": "ti-bolt",
    "가스": "ti-flame",
    "통신비": "ti-device-mobile",
    "대출이자": "ti-percentage",
    "외식-혼자": "ti-tools-kitchen-2",
    "외식-친구": "ti-user",
    "외식-단체": "ti-users",
    "배달-혼자": "ti-scooter",
    "배달-친구": "ti-bike",
    "배달-단체": "ti-truck-delivery",
    "장보기/마트": "ti-shopping-cart",
    "편의점/간식": "ti-cookie",
    "카페/음료": "ti-coffee",
    "소모품": "ti-spray",
    "문구/작업용품": "ti-pencil",
    "집 관리": "ti-home-cog",
    "의류": "ti-shirt",
    "화장품": "ti-brush",
    "전자기기/소품": "ti-device-laptop",
    "취미/기타 쇼핑": "ti-puzzle",
    "의료": "ti-medical-cross",
    "머리": "ti-scissors",
    "운동/헬스": "ti-barbell",
    "책/도서": "ti-books",
    "강의/교육": "ti-school",
    "자격증/시험": "ti-certificate",
    "스터디/세미나": "ti-users-group",
    "온라인 강좌": "ti-world-www",
    "작업/학습 도구": "ti-tool",
    "대중교통": "ti-bus",
    "택시": "ti-car",
    "기차": "ti-train",
    "고속버스": "ti-bus-stop",
    "주유/차량": "ti-gas-station",
    "보험": "ti-shield-dollar",
    "상품권/저축성": "ti-gift-card",
    "적금/예금": "ti-pig-money",
    "구독료": "ti-repeat",
    "경조사·선물": "ti-gift",
    "증명서/행정": "ti-file-certificate",
    "노래방/PC방": "ti-microphone-2",
    "영화/공연": "ti-movie",
    "일회성 소비": "ti-sparkles",
    "수수료/기타": "ti-coin",
    "이체입금": "ti-arrows-exchange",
    "기타수입": "ti-cash-plus",
    "미분류": "ti-help-circle"
  };
  return icons[subcategory] || sectorIconClass(sector);
}

function categoryChip(sector, subcategory) {
  return `
    <span class="category-chip ${categoryClass(sector)}">
      <i class="ti ${sectorIconClass(sector)} category-chip-icon" aria-hidden="true"></i>
      <b>${escapeHtml(sector || "미분류")}</b>
      ${subcategory ? `<small>${escapeHtml(subcategory)}</small>` : ""}
    </span>
  `;
}

function subcategoryPill(sector, subcategory) {
  return `<span class="subcategory-pill ${categoryClass(sector)}"><i class="ti ${subcategoryIconClass(sector, subcategory)} subcategory-pill-icon" aria-hidden="true"></i>${escapeHtml(subcategory || "-")}</span>`;
}

function sectorTag(sector) {
  const className = categoryClass(sector);
  return `<span class="tag ${className}"><i class="ti ${sectorIconClass(sector)} sector-tag-icon" aria-hidden="true"></i>${escapeHtml(sector)}</span>`;
}
