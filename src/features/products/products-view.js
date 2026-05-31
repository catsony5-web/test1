async function handleProductSubmit(event) {
  event.preventDefault();
  const name = els.productName.value.trim();
  if (!name) {
    alert("제품명을 입력해주세요.");
    return;
  }
  const imageDataUrl = els.productImage.files?.[0] ? await fileToDataUrl(els.productImage.files[0]) : "";
  await createAutoSnapshot("소모품 기록 저장 전");
  products.unshift(normalizeProduct({
    id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    brand: els.productBrand.value.trim(),
    category: els.productCategory.value,
    purchaseDate: els.productPurchaseDate.value,
    expiryDate: els.productExpiryDate.value,
    startDate: els.productStartDate.value,
    endDate: els.productEndDate.value,
    price: toNumber(els.productPrice.value),
    volume: toNumber(els.productVolume.value),
    unit: els.productUnit.value,
    quantity: toNumber(els.productQuantity.value) || 1,
    store: els.productStore.value.trim(),
    expectedDays: toNumber(els.productExpectedDays.value),
    link: els.productLink.value.trim(),
    imageDataUrl,
    memo: els.productMemo.value.trim(),
    createdAt: new Date().toISOString()
  }));
  await saveProducts();
  els.productForm.reset();
  renderProducts();
}

function renderProducts() {
  if (els.productFilterCategory.options.length) readProductFilterControls();
  syncProductFilterControls();
  renderProductTrend();
  if (!products.length) {
    els.productList.innerHTML = `<div class="empty">소모품 구매 기록을 추가하면 단위가격, 사용기간, 다음 구매 예상일을 여기서 볼 수 있습니다.</div>`;
    return;
  }

  const visibleProducts = filteredProducts();
  if (!visibleProducts.length) {
    els.productList.innerHTML = `<div class="empty">현재 필터에 맞는 소모품 기록이 없습니다.</div>`;
    return;
  }

  els.productList.innerHTML = visibleProducts.map((product) => {
    const usageDays = productUsageDays(product);
    const nextDate = nextProductPurchaseDate(product);
    const expiryState = product.expiryDate ? expiryLabel(product.expiryDate) : "유통기한 미입력";
    const productLink = safeExternalUrl(product.link);
    const unitPrice = productUnitPrice(product);
    const dayCost = usageDays && product.price ? product.price / usageDays : 0;
    const cycle = productRepurchaseCycle(product.name);
    return `
      <article class="product-card">
        ${product.imageDataUrl ? `<img src="${escapeHtml(product.imageDataUrl)}" alt="${escapeHtml(product.name)}">` : `<div class="product-image-placeholder">이미지</div>`}
        <div class="product-info">
          <div class="product-title-row">
            <div>
              <h3>${escapeHtml(product.name)}</h3>
              ${product.brand ? `<p>${escapeHtml(product.brand)}</p>` : ""}
            </div>
            <button type="button" data-delete-product="${escapeHtml(product.id)}">삭제</button>
          </div>
          <div class="product-badges">
            <span class="product-category-badge">${escapeHtml(product.category || "기타")}</span>
            <span>${product.endDate ? "사용 완료" : "사용 중"}</span>
          </div>
          <dl>
            <div><dt>구매 가격</dt><dd>${product.price ? formatWon(product.price) : "-"}</dd></div>
            <div><dt>용량/개수</dt><dd>${formatProductCapacity(product)}</dd></div>
            <div><dt>단위가격</dt><dd>${unitPrice ? `${Math.round(unitPrice).toLocaleString("ko-KR")}원/${escapeHtml(product.unit || "단위")}` : "계산 정보 부족"}</dd></div>
            <div><dt>구매일</dt><dd>${escapeHtml(product.purchaseDate || "-")}</dd></div>
            <div><dt>유통기한</dt><dd>${escapeHtml(product.expiryDate || "-")} · ${escapeHtml(expiryState)}</dd></div>
            <div><dt>사용 기간</dt><dd>${escapeHtml(product.startDate || "-")} ~ ${escapeHtml(product.endDate || "사용 중")}</dd></div>
            <div><dt>사용일수</dt><dd>${usageDays ? `${usageDays.toLocaleString("ko-KR")}일` : `${Number(product.expectedDays || 0).toLocaleString("ko-KR")}일 예상`}</dd></div>
            <div><dt>하루 비용</dt><dd>${dayCost ? `${Math.round(dayCost).toLocaleString("ko-KR")}원/일` : "-"}</dd></div>
            <div><dt>재구매 주기</dt><dd>${cycle ? `평균 ${cycle.toLocaleString("ko-KR")}일` : "기록 부족"}</dd></div>
            <div><dt>구매처</dt><dd>${escapeHtml(product.store || "-")}</dd></div>
            <div><dt>다음 구매 예상</dt><dd>${escapeHtml(nextDate || "계산 정보 부족")}</dd></div>
          </dl>
          ${productLink ? `<a href="${escapeHtml(productLink)}" target="_blank" rel="noopener noreferrer">제품 링크 열기</a>` : ""}
          ${product.memo ? `<p>${escapeHtml(product.memo)}</p>` : ""}
        </div>
      </article>
    `;
  }).join("");

  els.productList.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", async () => {
      await createAutoSnapshot("소모품 기록 삭제 전");
      products = products.filter((product) => product.id !== button.dataset.deleteProduct);
      await saveProducts();
      renderProducts();
    });
  });
}

function syncProductFilterControls() {
  const categoriesForFilter = unique(products.map((product) => product.category || "기타").filter(Boolean)).sort((a, b) => a.localeCompare(b, "ko-KR"));
  const names = unique(products.map((product) => product.name).filter(Boolean)).sort((a, b) => a.localeCompare(b, "ko-KR"));
  els.productFilterCategory.innerHTML = [`<option value="all">전체</option>`, ...categoriesForFilter.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)].join("");
  els.productFilterName.innerHTML = [`<option value="all">전체</option>`, ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)].join("");
  els.productTrendSelect.innerHTML = names.length
    ? names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")
    : `<option value="">기록 없음</option>`;
  if (!categoriesForFilter.includes(productFilters.category)) productFilters.category = "all";
  if (!names.includes(productFilters.name)) productFilters.name = "all";
  if (!names.includes(productFilters.trendName)) productFilters.trendName = names[0] || "";
  els.productFilterCategory.value = productFilters.category;
  els.productFilterName.value = productFilters.name;
  els.productFilterStore.value = productFilters.store;
  els.productFilterStatus.value = productFilters.status;
  els.productFilterSearch.value = productFilters.search;
  els.productSort.value = productFilters.sort;
  els.productTrendSelect.value = productFilters.trendName;
}

function readProductFilterControls() {
  productFilters.category = els.productFilterCategory.value || "all";
  productFilters.name = els.productFilterName.value || "all";
  productFilters.store = els.productFilterStore.value.trim();
  productFilters.status = els.productFilterStatus.value || "all";
  productFilters.search = els.productFilterSearch.value.trim();
  productFilters.sort = els.productSort.value || "recent";
  productFilters.trendName = els.productTrendSelect.value || "";
}

function filteredProducts() {
  const store = normalizeKeyText(productFilters.store);
  const search = normalizeKeyText(productFilters.search);
  return products
    .filter((product) => {
      if (productFilters.category !== "all" && product.category !== productFilters.category) return false;
      if (productFilters.name !== "all" && product.name !== productFilters.name) return false;
      if (productFilters.status === "using" && product.endDate) return false;
      if (productFilters.status === "done" && !product.endDate) return false;
      if (store && !normalizeKeyText(product.store).includes(store)) return false;
      if (!search) return true;
      return normalizeKeyText([product.name, product.brand, product.category, product.store, product.memo].join(" ")).includes(search);
    })
    .sort((a, b) => {
      if (productFilters.sort === "price-desc") return Number(b.price || 0) - Number(a.price || 0);
      if (productFilters.sort === "unit-asc") return (productUnitPrice(a) || Number.MAX_SAFE_INTEGER) - (productUnitPrice(b) || Number.MAX_SAFE_INTEGER);
      if (productFilters.sort === "usage-desc") return productUsageDays(b) - productUsageDays(a);
      return String(b.purchaseDate || b.createdAt || "").localeCompare(String(a.purchaseDate || a.createdAt || ""));
    });
}

function renderProductTrend() {
  const name = els.productTrendSelect.value || productFilters.trendName;
  productFilters.trendName = name;
  const rows = products
    .filter((product) => product.name === name && product.purchaseDate)
    .sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));
  if (!name || rows.length < 2) {
    els.productTrendChart.innerHTML = `<div class="empty compact-empty">같은 품목 기록이 2개 이상 쌓이면 가격 추이를 볼 수 있습니다.</div>`;
    return;
  }
  els.productTrendChart.innerHTML = renderProductTrendChart(rows);
}

function renderProductTrendChart(rows) {
  const width = 760;
  const height = 270;
  const pad = 44;
  const prices = rows.map((product) => Number(product.price || 0));
  const unitPrices = rows.map((product) => Math.round(productUnitPrice(product) || 0));
  const max = Math.max(...prices, ...unitPrices, 1);
  const xStep = rows.length > 1 ? (width - pad * 2) / (rows.length - 1) : 0;
  const point = (value, index) => {
    const x = rows.length > 1 ? pad + index * xStep : width / 2;
    const y = pad + (max - value) / max * (height - pad * 2);
    return { x, y };
  };
  const pricePoints = prices.map(point);
  const unitPoints = unitPrices.map(point);
  const polyline = (points) => points.map((item) => `${item.x},${item.y}`).join(" ");
  return `
    <div class="chart-legend-row product-chart-legend">
      <span><b class="legend-price"></b>구매가격 <b class="legend-unit"></b>단위가격</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="소모품 가격 추이 차트">
      ${[0, 1, 2, 3].map((i) => {
        const y = pad + i * (height - pad * 2) / 3;
        return `<line class="chart-grid" x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}"></line>`;
      }).join("")}
      <polyline class="product-price-line" points="${polyline(pricePoints)}"></polyline>
      <polyline class="product-unit-line" points="${polyline(unitPoints)}"></polyline>
      ${rows.map((product, index) => `
        <g>
          <title>${escapeHtml(product.purchaseDate)} · ${formatWon(product.price)} · ${formatProductCapacity(product)} · ${escapeHtml(product.store || "-")}</title>
          <circle class="product-price-dot" cx="${pricePoints[index].x}" cy="${pricePoints[index].y}" r="5"></circle>
          <circle class="product-unit-dot" cx="${unitPoints[index].x}" cy="${unitPoints[index].y}" r="4"></circle>
          <text class="chart-label" x="${pricePoints[index].x}" y="${height - 13}" text-anchor="middle">${escapeHtml(product.purchaseDate.slice(5))}</text>
        </g>
      `).join("")}
      <text class="chart-value max" x="${pad}" y="22">${formatWon(max)}</text>
    </svg>
  `;
}

function safeExternalUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : "";
}

function normalizeProduct(product) {
  return {
    id: product.id || `product-${Date.now()}`,
    name: product.name || "",
    brand: product.brand || "",
    category: product.category || inferProductCategory(product.name || product.memo || ""),
    purchaseDate: normalizeInputDate(product.purchaseDate),
    expiryDate: normalizeInputDate(product.expiryDate),
    startDate: normalizeInputDate(product.startDate),
    endDate: normalizeInputDate(product.endDate),
    price: Math.max(0, Number(product.price || 0)),
    volume: Math.max(0, Number(product.volume || 0)),
    unit: product.unit || "ml",
    quantity: Math.max(1, Number(product.quantity || 1)),
    store: product.store || "",
    expectedDays: Math.max(0, Number(product.expectedDays || 0)),
    link: product.link || "",
    imageDataUrl: product.imageDataUrl || "",
    memo: product.memo || "",
    createdAt: product.createdAt || new Date().toISOString()
  };
}

function inferProductCategory(value) {
  const text = normalizeKeyText(value);
  if (["토너", "크림", "세럼", "선크림", "스킨", "로션"].some((keyword) => text.includes(keyword))) return "스킨케어";
  if (["샴푸", "바디", "클렌징", "폼"].some((keyword) => text.includes(keyword))) return "클렌징/바디";
  if (["세제", "다우니", "섬유유연제"].some((keyword) => text.includes(keyword))) return "세제";
  if (["휴지", "물티슈", "위생"].some((keyword) => text.includes(keyword))) return "휴지/위생";
  if (["청소", "방향제"].some((keyword) => text.includes(keyword))) return "청소용품";
  if (["주방", "수세미"].some((keyword) => text.includes(keyword))) return "주방용품";
  return "기타";
}

function productUsageDays(product) {
  if (!product.startDate || !product.endDate) return 0;
  return Math.max(1, daysBetween(product.startDate, product.endDate) + 1);
}

function productUnitPrice(product) {
  const totalVolume = Number(product.volume || 0) * Math.max(1, Number(product.quantity || 1));
  return product.price && totalVolume ? product.price / totalVolume : 0;
}

function formatProductCapacity(product) {
  const volume = Number(product.volume || 0);
  const quantity = Math.max(1, Number(product.quantity || 1));
  if (!volume) return quantity > 1 ? `${quantity.toLocaleString("ko-KR")}개` : "-";
  return `${volume.toLocaleString("ko-KR")}${escapeHtml(product.unit || "")}${quantity > 1 ? ` × ${quantity.toLocaleString("ko-KR")}개` : ""}`;
}

function productRepurchaseCycle(name) {
  const dates = products
    .filter((product) => product.name === name && product.purchaseDate)
    .map((product) => product.purchaseDate)
    .sort();
  if (dates.length < 2) return 0;
  const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index], date)).filter((gap) => gap > 0);
  return gaps.length ? Math.round(gaps.reduce((total, gap) => total + gap, 0) / gaps.length) : 0;
}

function nextProductPurchaseDate(product) {
  if (product.endDate) return product.endDate;
  if (product.startDate && product.expectedDays) return addDays(product.startDate, Number(product.expectedDays) - 1);
  if (product.purchaseDate && product.expectedDays) return addDays(product.purchaseDate, Number(product.expectedDays) - 1);
  return "";
}

function expiryLabel(expiryDate) {
  const today = new Date();
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return "확인 필요";
  const days = Math.ceil((expiry - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (days < 0) return `${Math.abs(days).toLocaleString("ko-KR")}일 지남`;
  return `${days.toLocaleString("ko-KR")}일 남음`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
