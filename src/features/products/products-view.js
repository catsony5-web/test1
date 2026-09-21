let editingProductId = "";
let productSavePending = false;

function productFormFeedback(message = "", isError = false) {
  const feedback = document.getElementById("productFormFeedback");
  feedback.textContent = message;
  feedback.hidden = !message;
  feedback.classList.toggle("is-error", isError);
}

function resetProductForm() {
  editingProductId = "";
  els.productForm.reset();
  els.productForm.querySelectorAll("details").forEach((group) => { group.open = false; });
  document.getElementById("productFormTitle").textContent = "간단히 기록하기";
  document.getElementById("productSaveButton").textContent = "기록 저장";
  document.getElementById("productCancelEdit").hidden = true;
  document.getElementById("productImageHelp").textContent = "선택 사항 · 8MB 이하";
  NumericInput.refresh(els.productForm, { resetEditing: true });
  productFormFeedback();
}

function editProduct(id) {
  if (productSavePending) return;
  const product = products.find((item) => item.id === id);
  if (!product) return;
  resetProductForm();
  editingProductId = id;
  const fields = {
    productName: product.name, productBrand: product.brand, productCategory: product.category,
    productPurchaseDate: product.purchaseDate, productExpiryDate: product.expiryDate,
    productStartDate: product.startDate, productEndDate: product.endDate,
    productPrice: hasProductPrice(product) ? product.price : "",
    productVolume: product.volume || "", productUnit: product.unit,
    productQuantity: product.quantity, productStore: product.store,
    productExpectedDays: product.expectedDays || "", productLink: product.link, productMemo: product.memo
  };
  for (const [id, value] of Object.entries(fields)) {
    const input = els[id];
    if (input.tagName === "SELECT" && !Array.from(input.options).some((option) => option.value === value)) {
      input.add(new Option(value, value));
    }
    input.value = value ?? "";
  }
  document.getElementById("productFormTitle").textContent = "기록 수정하기";
  document.getElementById("productSaveButton").textContent = "수정 저장";
  document.getElementById("productCancelEdit").hidden = false;
  document.getElementById("productImageHelp").textContent = product.imageDataUrl
    ? "저장된 사진이 있어요. 새 사진을 선택하지 않으면 유지됩니다." : "선택 사항 · 8MB 이하";
  NumericInput.refresh(els.productForm, { resetEditing: true });
  productFormFeedback("바꾸고 싶은 항목만 수정하세요. 접힌 항목의 기존 정보도 유지됩니다.");
  els.productName.focus();
}

async function runProductSave(operation) {
  if (productSavePending) return;
  productSavePending = true;
  const controls = Array.from(document.querySelectorAll("#productForm input, #productForm select, #productForm button, #productList button"));
  const disabled = controls.map((control) => control.disabled);
  let committedId = null;
  controls.forEach((control) => { control.disabled = true; });
  els.productForm.setAttribute("aria-busy", "true");
  try {
    await operation((id = "") => { committedId = id; });
  } catch (error) {
    console.error("product save failed", error);
    if (committedId !== null) {
      // Retrying after a display failure must update the saved record, not duplicate it.
      editingProductId = committedId;
      productFormFeedback("저장은 완료됐지만 화면을 갱신하지 못했습니다. 새로고침해서 기록을 확인해주세요.", true);
    } else {
      productFormFeedback("저장하지 못했습니다. 입력 내용은 그대로 있으니 다시 시도해주세요.", true);
    }
  } finally {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    els.productForm.removeAttribute("aria-busy");
    productSavePending = false;
  }
}

async function handleProductSubmit(event) {
  event.preventDefault();
  if (productSavePending || !NumericInput.validate(els.productForm)) return;
  const name = els.productName.value.trim();
  if (!name) {
    productFormFeedback("제품명을 입력해주세요. 다른 항목은 비워두셔도 됩니다.", true);
    els.productName.focus();
    return;
  }
  if (els.productStartDate.value && els.productEndDate.value && els.productEndDate.value < els.productStartDate.value) {
    els.productEndDate.closest("details").open = true;
    productFormFeedback("사용 종료일은 시작일과 같거나 이후여야 합니다.", true);
    els.productEndDate.focus();
    return;
  }
  const existing = products.find((item) => item.id === editingProductId);
  const imageFile = els.productImage.files?.[0];
  if (imageFile && (!imageFile.type.startsWith("image/") || imageFile.size > 8 * 1024 * 1024)) {
    els.productImage.closest("details").open = true;
    productFormFeedback("사진은 8MB 이하의 이미지 파일을 선택해주세요.", true);
    return;
  }
  const draft = normalizeProduct({
    id: existing?.id || `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    brand: els.productBrand.value.trim(), category: els.productCategory.value,
    purchaseDate: els.productPurchaseDate.value, expiryDate: els.productExpiryDate.value,
    startDate: els.productStartDate.value, endDate: els.productEndDate.value,
    price: toNumber(els.productPrice.value), priceKnown: els.productPrice.value.trim() !== "",
    volume: toNumber(els.productVolume.value), unit: els.productUnit.value,
    quantity: toNumber(els.productQuantity.value) || 1, store: els.productStore.value.trim(),
    expectedDays: toNumber(els.productExpectedDays.value), link: els.productLink.value.trim(),
    imageDataUrl: existing?.imageDataUrl || "", memo: els.productMemo.value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString()
  });
  return runProductSave(async (markSaved) => {
    productFormFeedback("저장 중입니다…");
    if (imageFile) draft.imageDataUrl = await prepareProductImage(imageFile);
    await createAutoSnapshot("소모품 기록 저장 전");
    const nextProducts = existing
      ? products.map((product) => product.id === existing.id ? draft : product)
      : [draft, ...products];
    if (!await safeSave(PRODUCT_STORAGE_KEY, nextProducts)) {
      productFormFeedback("저장하지 못했습니다. 입력 내용은 그대로 있으니 다시 시도해주세요.", true);
      return;
    }
    products = nextProducts;
    markSaved(draft.id);
    resetProductForm();
    renderProducts();
    const isVisible = filteredProducts().some((product) => product.id === draft.id);
    productFormFeedback(`${name} ${existing ? "수정을 저장" : "기록을 저장"}했습니다.${isVisible ? "" : " 현재 검색·필터 조건에서는 숨겨져 있습니다."}`);
  });
}

function renderProducts() {
  if (els.productFilterCategory.options.length) readProductFilterControls();
  syncProductFilterControls();
  renderProductTrend();
  const visibleProducts = filteredProducts();
  document.getElementById("productRecordCount").textContent = `${visibleProducts.length} / ${products.length}`;
  const filterCount = [productFilters.category !== "all", productFilters.name !== "all", Boolean(productFilters.store), productFilters.status !== "all", productFilters.sort !== "recent"].filter(Boolean).length;
  document.getElementById("productActiveFilters").textContent = filterCount ? `${filterCount}개 적용` : "";
  if (!products.length) {
    els.productList.innerHTML = `<div class="empty"><strong>지금 쓰는 소모품 하나부터 남겨보세요.</strong><p>제품명만으로 시작할 수 있어요. 구매 정보와 사용일은 나중에 추가해도 됩니다.</p></div>`;
    return;
  }

  if (!visibleProducts.length) {
    els.productList.innerHTML = `<div class="empty">현재 필터에 맞는 소모품 기록이 없습니다.</div>`;
    return;
  }

  els.productList.innerHTML = visibleProducts.map((product) => {
    const usageDays = productUsageDays(product);
    const nextDate = nextProductPurchaseDate(product);
    const productLink = safeExternalUrl(product.link);
    const unitPrice = productUnitPrice(product);
    const dayCost = usageDays && hasProductPrice(product) ? product.price / usageDays : null;
    const cycle = productRepurchaseCycle(product.name);
    const status = { done: "사용 완료", using: "사용 중", unknown: "사용일 미입력" }[productUsageStatus(product)];
    const rows = [
      ["용량/개수", formatProductCapacity(product) === "-" ? "" : formatProductCapacity(product)],
      ["단위가격", unitPrice !== null ? `${Math.round(unitPrice).toLocaleString("ko-KR")}원/${escapeHtml(product.unit)}` : ""],
      ["유통기한", product.expiryDate ? `${escapeHtml(product.expiryDate)} · ${escapeHtml(expiryLabel(product.expiryDate))}` : ""],
      ["사용 시작", escapeHtml(product.startDate || "")], ["사용 종료", escapeHtml(product.endDate || "")],
      ["사용일수", usageDays ? `${usageDays.toLocaleString("ko-KR")}일` : product.expectedDays ? `${Number(product.expectedDays).toLocaleString("ko-KR")}일 예상` : ""],
      ["하루 비용", dayCost !== null ? `${Math.round(dayCost).toLocaleString("ko-KR")}원/일` : ""],
      ["재구매 주기", cycle ? `평균 ${cycle.toLocaleString("ko-KR")}일` : ""],
      ["다음 구매 예상", escapeHtml(nextDate || "")]
    ].filter(([, value]) => value);
    return `
      <article class="product-card${product.imageDataUrl ? " has-image" : ""}">
        ${product.imageDataUrl ? `<img src="${escapeHtml(product.imageDataUrl)}" alt="${escapeHtml(product.name)}" loading="lazy">` : ""}
        <div class="product-info">
          <div class="product-title-row">
            <div>
              <h3>${escapeHtml(product.name)}</h3>
              ${product.brand ? `<p>${escapeHtml(product.brand)}</p>` : ""}
            </div>
            <div class="product-card-actions"><button type="button" data-edit-product="${escapeHtml(product.id)}" aria-label="${escapeHtml(product.name)} 수정">수정</button><button type="button" data-delete-product="${escapeHtml(product.id)}" aria-label="${escapeHtml(product.name)} 삭제">삭제</button></div>
          </div>
          <div class="product-delete-confirm" hidden><p>이 기록을 삭제할까요?</p><button type="button" data-cancel-product-delete>취소</button><button type="button" data-confirm-product-delete="${escapeHtml(product.id)}">삭제 확인</button></div>
          <div class="product-badges">
            <span class="product-category-badge">${escapeHtml(product.category || "기타")}</span>
            <span>${status}</span>
          </div>
          <div class="product-card-price">${hasProductPrice(product) ? `<strong>${formatWon(product.price)}</strong>` : `<span>가격 미입력</span>`}</div>
          ${product.purchaseDate || product.store ? `<p>${[product.purchaseDate, product.store].filter(Boolean).map(escapeHtml).join(" · ")}</p>` : ""}
          ${rows.length || productLink || product.memo ? `<details class="product-record-details"><summary>추가 기록 보기</summary><dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>${productLink ? `<a href="${escapeHtml(productLink)}" target="_blank" rel="noopener noreferrer">제품 링크 열기</a>` : ""}${product.memo ? `<p>${escapeHtml(product.memo)}</p>` : ""}</details>` : `<p>가격·사용일은 ‘수정’에서 추가할 수 있어요.</p>`}
        </div>
      </article>
    `;
  }).join("");

  els.productList.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => editProduct(button.dataset.editProduct));
  });
  els.productList.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const confirmation = button.closest(".product-card").querySelector(".product-delete-confirm");
      confirmation.hidden = false;
      confirmation.querySelector("[data-cancel-product-delete]").focus();
    });
  });
  els.productList.querySelectorAll("[data-cancel-product-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".product-delete-confirm").hidden = true;
      button.closest(".product-card").querySelector("[data-delete-product]").focus();
    });
  });
  els.productList.querySelectorAll("[data-confirm-product-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (productSavePending) return;
      await runProductSave(async (markSaved) => {
        await createAutoSnapshot("소모품 기록 삭제 전");
        const nextProducts = products.filter((product) => product.id !== button.dataset.confirmProductDelete);
        if (!await safeSave(PRODUCT_STORAGE_KEY, nextProducts)) {
          productFormFeedback("삭제하지 못했습니다. 기존 기록은 유지됩니다.", true);
          return;
        }
        products = nextProducts;
        markSaved();
        if (editingProductId === button.dataset.confirmProductDelete) resetProductForm();
        renderProducts();
        productFormFeedback("소모품 기록을 삭제했습니다.");
      });
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
      if (productFilters.status !== "all" && productUsageStatus(product) !== productFilters.status) return false;
      if (store && !normalizeKeyText(product.store).includes(store)) return false;
      if (!search) return true;
      return normalizeKeyText([product.name, product.brand, product.category, product.store, product.memo].join(" ")).includes(search);
    })
    .sort((a, b) => {
      if (productFilters.sort === "price-desc") return Number(b.price || 0) - Number(a.price || 0);
      if (productFilters.sort === "unit-asc") {
        const aPrice = productUnitPrice(a);
        const bPrice = productUnitPrice(b);
        if (aPrice === null) return bPrice === null ? 0 : 1;
        if (bPrice === null) return -1;
        return aPrice - bPrice;
      }
      if (productFilters.sort === "usage-desc") return productUsageDays(b) - productUsageDays(a);
      return String(b.purchaseDate || b.createdAt || "").localeCompare(String(a.purchaseDate || a.createdAt || ""));
    });
}

function renderProductTrend() {
  const name = els.productTrendSelect.value || productFilters.trendName;
  productFilters.trendName = name;
  const rows = products
    .filter((product) => product.name === name && product.purchaseDate && hasProductPrice(product))
    .sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));
  if (!name || rows.length < 2) {
    els.productTrendChart.innerHTML = `<div class="empty compact-empty">같은 품목에 구매일과 가격이 입력된 기록이 2개 이상 있으면 가격 추이를 볼 수 있습니다.</div>`;
    return;
  }
  els.productTrendChart.innerHTML = renderProductTrendChart(rows);
}

function renderProductTrendChart(rows) {
  rows = rows.filter((product) => product.purchaseDate && hasProductPrice(product));
  const width = 760;
  const height = 270;
  const pad = 44;
  const prices = rows.map((product) => Number(product.price));
  const unitPrices = rows.map(productUnitPrice);
  const max = Math.max(...prices, ...unitPrices.filter((value) => value !== null), 1);
  const xStep = rows.length > 1 ? (width - pad * 2) / (rows.length - 1) : 0;
  const point = (value, index) => {
    const x = rows.length > 1 ? pad + index * xStep : width / 2;
    const y = pad + (max - value) / max * (height - pad * 2);
    return { x, y };
  };
  const pricePoints = prices.map(point);
  const unitPoints = unitPrices.map((value, index) => value === null ? null : point(value, index));
  const polyline = (points) => points.map((item) => `${item.x},${item.y}`).join(" ");
  const unitSegments = [];
  let segment = [];
  unitPoints.forEach((item, index) => {
    if (!item || (segment.length && rows[index].unit !== rows[index - 1].unit)) {
      if (segment.length > 1) unitSegments.push(segment);
      segment = [];
    }
    if (item) segment.push(item);
  });
  if (segment.length > 1) unitSegments.push(segment);
  const units = [...new Set(rows.filter((product, index) => unitPoints[index]).map((product) => product.unit))];
  return `
    <div class="chart-legend-row product-chart-legend">
      <span><b class="legend-price"></b>구매가격 <b class="legend-unit"></b>단위가격${units.length === 1 ? ` (원/${escapeHtml(units[0])})` : ""}</span>
      ${units.length > 1 ? `<span>단위가격은 같은 단위의 연속 기록만 연결합니다.</span>` : ""}
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="소모품 가격 추이 차트">
      ${[0, 1, 2, 3].map((i) => {
        const y = pad + i * (height - pad * 2) / 3;
        return `<line class="chart-grid" x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}"></line>`;
      }).join("")}
      <polyline class="product-price-line" points="${polyline(pricePoints)}"></polyline>
      ${unitSegments.map((points) => `<polyline class="product-unit-line" points="${polyline(points)}"></polyline>`).join("")}
      ${rows.map((product, index) => `
        <g>
          <title>${escapeHtml(product.purchaseDate)} · ${formatWon(product.price)} · ${formatProductCapacity(product)}${unitPrices[index] !== null ? ` · ${Math.round(unitPrices[index]).toLocaleString("ko-KR")}원/${escapeHtml(product.unit)}` : " · 단위가격 정보 부족"} · ${escapeHtml(product.store || "-")}</title>
          <circle class="product-price-dot" cx="${pricePoints[index].x}" cy="${pricePoints[index].y}" r="5"></circle>
          ${unitPoints[index] ? `<circle class="product-unit-dot" cx="${unitPoints[index].x}" cy="${unitPoints[index].y}" r="4"></circle>` : ""}
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
    priceKnown: hasProductPrice(product),
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
  const days = daysBetween(product.startDate, product.endDate);
  return days >= 0 ? days + 1 : 0;
}

function productUsageStatus(product) {
  if (product.endDate) return "done";
  return product.startDate ? "using" : "unknown";
}

function hasProductPrice(product) {
  return typeof product.priceKnown === "boolean" ? product.priceKnown : Number(product.price) > 0;
}

function productUnitPrice(product) {
  if (!hasProductPrice(product) || !product.unit || !(Number(product.volume) > 0)) return null;
  const totalVolume = Number(product.volume || 0) * Math.max(1, Number(product.quantity || 1));
  const unitPrice = Number(product.price) / totalVolume;
  return Number.isFinite(unitPrice) ? unitPrice : null;
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

async function prepareProductImage(file) {
  const dataUrl = await fileToDataUrl(file);
  const compressed = await compressProductImage(dataUrl);
  return compressed.length < dataUrl.length ? compressed : dataUrl;
}

function compressProductImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 960;
      const maxHeight = 720;
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/webp", 0.82));
    };
    image.onerror = () => reject(new Error("Invalid product image"));
    image.src = dataUrl;
  });
}
