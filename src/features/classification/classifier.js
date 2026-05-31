function reclassify() {
  const sortedRules = sortedClassificationRules();
  const firstPass = transactions.map((item) => {
    if (item.manualSector && item.manualSubcategory) {
      const assignment = normalizeCategoryAssignment(item.manualSector, item.manualSubcategory, item.merchant);
      return { ...item, sector: assignment.sector, subcategory: assignment.subcategory, status: "직접입력" };
    }

    if (item.flow === "income") {
      return { ...item, sector: "수입", subcategory: "이체입금", status: "수입" };
    }

    if (isCanceled(item.cancel)) {
      return { ...item, sector: "제외", subcategory: "취소/제외", status: "취소/제외" };
    }

    const match = findRule(item.merchant, sortedRules);
    if (!match) {
      return { ...item, sector: "미분류", subcategory: "미분류", status: "미분류" };
    }

    const assignment = normalizeCategoryAssignment(match.sector, match.subcategory, item.merchant);
    return { ...item, sector: assignment.sector, subcategory: assignment.subcategory, status: "분류완료" };
  });
  const smartModel = buildSmartSuggestionModel(firstPass);
  const suggestionCache = new Map();
  classified = firstPass.map((item) => {
    if (item.status !== "미분류") return item;
    const cacheKey = normalizeKeyText(item.merchant);
    const suggestion = suggestionCache.has(cacheKey)
      ? suggestionCache.get(cacheKey)
      : suggestCategory(item.merchant, smartModel);
    if (!suggestionCache.has(cacheKey)) suggestionCache.set(cacheKey, suggestion);
    if (suggestion && Number(suggestion.confidence || 0) >= SMART_AUTO_CONFIDENCE) {
      const assignment = normalizeCategoryAssignment(suggestion.sector, suggestion.subcategory, item.merchant);
      return {
        ...item,
        sector: assignment.sector,
        subcategory: assignment.subcategory,
        status: "스마트추천",
        suggestion
      };
    }
    return {
      ...item,
      sector: "미분류",
      subcategory: "미분류",
      status: "미분류",
      suggestion: suggestion && Number(suggestion.confidence || 0) >= SMART_DISPLAY_CONFIDENCE ? suggestion : null
    };
  });
  saveRules();
  renderAll();
}

function sortedClassificationRules() {
  return [...rules].sort(compareRulesForClassification);
}

function findRule(merchant, sortedRules = sortedClassificationRules()) {
  const lower = merchant.toLocaleLowerCase("ko-KR");
  return sortedRules.find((rule) =>
    rule.keywords.some((keyword) => lower.includes(keyword.toLocaleLowerCase("ko-KR")))
  );
}

function compareRulesForClassification(a, b) {
  const rankDiff = ruleClassificationRank(a) - ruleClassificationRank(b);
  if (rankDiff) return rankDiff;
  return Number(a.priority || 999) - Number(b.priority || 999);
}

function ruleClassificationRank(rule) {
  const type = ruleTypeLabel(rule);
  if (type === "사용자 규칙" || type === "스마트 추천") return 0;
  if (type === "수정된 기본 규칙") return 1;
  if (type === "기본 규칙") return 2;
  return 3;
}
