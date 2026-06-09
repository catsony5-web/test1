function renderUnknown() {
  const unknownItems = classified.filter((item) => item.status === "미분류");
  const grouped = groupBy(unknownItems, (item) => item.merchant);
  els.unknownList.innerHTML = "";

  if (!unknownItems.length) {
    els.unknownList.innerHTML = `<div class="empty">미분류 항목이 없습니다. 새 파일을 불러오거나 규칙을 조정하면 여기에 표시됩니다.</div>`;
    return;
  }

  [...grouped.entries()].sort((a, b) => sum(b[1], "amount") - sum(a[1], "amount")).forEach(([merchant, rows]) => {
    const node = els.unknownTemplate.content.firstElementChild.cloneNode(true);
    const suggestion = bestSuggestionForRows(rows);
    const sectorSelect = node.querySelector(".sector-select");
    const subcategorySelect = node.querySelector(".subcategory-select");
    const keywordInput = node.querySelector(".keyword-input");

    node.querySelector(".merchant").textContent = merchant;
    node.querySelector(".meta").textContent = `${rows.length}건 · ${formatWon(sum(rows, "amount"))}`;
    node.querySelector(".suggestion").innerHTML = renderSuggestionBlock(suggestion);
    appendCalendarLinkButton(node.querySelector(".suggestion"));

    fillCategorySelects(sectorSelect, subcategorySelect, suggestion);
    keywordInput.value = merchant;
    sectorSelect.addEventListener("change", () => updateSubcategorySelect(sectorSelect, subcategorySelect));
    node.querySelector("[data-apply-suggestion]")?.addEventListener("click", () => {
      applySmartSuggestionToMerchant(merchant, suggestion);
    });
    node.querySelector("[data-focus-manual]")?.addEventListener("click", () => {
      sectorSelect.focus();
    });
    node.querySelector("[data-save-suggestion-rule]")?.addEventListener("click", () => {
      saveSuggestionRuleForMerchant(merchant, suggestion, keywordInput.value);
    });
    node.querySelector("[data-open-calendar-date]")?.addEventListener("click", () => {
      openUnknownRowsInCalendar(rows);
    });
    node.querySelector(".assign-button").addEventListener("click", () => {
      const keyword = keywordInput.value.trim();
      if (!keyword) return;
      addRule(sectorSelect.value, subcategorySelect.value, keyword);
    });
    els.unknownList.appendChild(node);
  });
}

function bestSuggestionForRows(rows) {
  return rows
    .map((row) => row.suggestion)
    .filter(Boolean)
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || null;
}

function appendCalendarLinkButton(container) {
  if (!container || container.querySelector("[data-open-calendar-date]")) return;
  const actions = container.querySelector(".suggestion-actions");
  const buttonHtml = `<button type="button" data-open-calendar-date>달력에서 보기</button>`;
  if (actions) {
    actions.insertAdjacentHTML("beforeend", buttonHtml);
    return;
  }
  container.insertAdjacentHTML("beforeend", `<span class="suggestion-actions">${buttonHtml}</span>`);
}

function openUnknownRowsInCalendar(rows) {
  const targetDate = rows
    .map((item) => normalizeDateKey(item.approvalDate))
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!targetDate) return;
  const targetMonth = targetDate.slice(0, 7);
  selectedCalendarDate = targetDate;
  selectedCalendarMonth = targetMonth;
  calendarEditingRecordKey = "";
  calendarEditFeedback = null;
  setSharedSelectedMonth(targetMonth, { syncControls: false });
  switchView("calendar");
  requestAnimationFrame(() => {
    document.querySelector("#calendarView")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderSuggestionBlock(suggestion) {
  if (!suggestion) return `추천: <strong>직접 선택 필요</strong>`;
  const confidence = Number(suggestion.confidence || 0);
  const reason = suggestionReasonText(suggestion);
  return `
    <span class="suggestion-line">
      추천: <strong>${escapeHtml(suggestion.sector)} &gt; ${escapeHtml(suggestion.subcategory)} · ${confidence}%</strong>
    </span>
    <small>${escapeHtml(reason)}</small>
    <span class="suggestion-actions">
      <button type="button" data-apply-suggestion>추천 적용</button>
      <button type="button" data-focus-manual>직접 수정</button>
      <button type="button" data-save-suggestion-rule>규칙으로 저장</button>
    </span>
  `;
}

function suggestionReasonText(suggestion) {
  if (!suggestion) return "직접 선택이 필요합니다.";
  if (suggestion.source === "user-rule") return `근거: 사용자 규칙 이력 · ${suggestion.reason || suggestion.keyword || ""}`;
  if (suggestion.source === "user-history") return `근거: 사용자가 직접 수정한 기존 거래 · ${suggestion.reason || ""}`;
  if (suggestion.source === "context") return `근거: 맥락 키워드 매칭 · ${suggestion.reason || suggestion.keyword || ""}`;
  if (suggestion.source === "brand") return `근거: 기본 브랜드 추천 사전 · ${suggestion.reason || suggestion.keyword || ""}`;
  if (suggestion.source === "keyword") return `근거: 기본 키워드 매칭 · ${suggestion.reason || suggestion.keyword || ""}`;
  return `근거: 비슷한 기존 거래 · ${suggestion.reason || "기존 분류 이력"}`;
}

async function applySmartSuggestionToMerchant(merchant, suggestion) {
  if (!suggestion) return;
  const assignment = normalizeCategoryAssignment(suggestion.sector, suggestion.subcategory, merchant);
  await createAutoSnapshot("미분류 추천 적용 전");
  transactions = transactions.map((item) => {
    if (item.flow === "income" || isCanceled(item.cancel)) return item;
    if (!sameMerchant(item.merchant, merchant)) return item;
    return { ...item, manualSector: assignment.sector, manualSubcategory: assignment.subcategory };
  });
  await saveTransactions();
  reclassify();
}

async function saveSuggestionRuleForMerchant(merchant, suggestion, keywordValue = "") {
  if (!suggestion) return;
  const keyword = String(keywordValue || suggestion.keyword || merchant || "").trim();
  if (!keyword) return;
  await createAutoSnapshot("미분류 추천 규칙 저장 전");
  addRule(suggestion.sector, suggestion.subcategory, keyword, { origin: "smart-suggestion" });
}

function sameMerchant(left, right) {
  return normalizeKeyText(left) === normalizeKeyText(right);
}
