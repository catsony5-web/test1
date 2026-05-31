function suggestCategory(merchant, model = []) {
  const text = normalizeKeyText(merchant);
  const compact = compactKeyText(merchant);
  if (!compact) return null;
  const candidates = [];
  addContextualSuggestionCandidates(candidates, text, compact);

  model
    .filter((sample) => isSmartCandidate(compact, sample.compact, text, sample.text))
    .slice(0, SMART_CANDIDATE_LIMIT)
    .forEach((sample) => {
    const score = merchantSimilarityScore(compact, sample.compact, text, sample.text);
    if (score < 0.42) return;
    const sourceBoost = sample.source === "user-history" || sample.source === "user-rule" ? 8 : 0;
    candidates.push({
      sector: sample.sector,
      subcategory: sample.subcategory,
      confidence: Math.min(96, Math.round(score * 100) + sourceBoost),
      reason: sample.source === "user-rule"
        ? `사용자 규칙 "${sample.keyword || sample.merchant}"`
        : sample.merchant,
      keyword: sample.keyword || sample.merchant,
      source: sample.source === "user-rule" ? "user-rule" : sample.source === "user-history" ? "user-history" : "smart"
    });
  });

  suggestionRules.forEach((rule) => {
    rule.keywords.forEach((keyword) => {
      const key = compactKeyText(keyword);
      if (!key || !compact.includes(key)) return;
      const source = rule.source === "brand" ? "brand" : "keyword";
      const confidence = Number(rule.confidence || 0) || Math.min(source === "brand" ? 90 : 78, Math.max(60, Math.round((key.length / Math.max(compact.length, 1)) * 100) + (source === "brand" ? 46 : 38)));
      candidates.push({
        sector: rule.sector,
        subcategory: rule.subcategory,
        confidence,
        reason: `${rule.reason || (source === "brand" ? "브랜드 추천 사전" : "기본 추천 키워드")} "${keyword}"`,
        keyword,
        source,
        priority: Number(rule.priority || 999)
      });
    });
  });

  return candidates
    .sort((a, b) =>
      suggestionSourceRank(a) - suggestionSourceRank(b)
      || Number(a.priority || 999) - Number(b.priority || 999)
      || Number(b.confidence || 0) - Number(a.confidence || 0)
    )[0] || null;
}

function suggestionSourceRank(suggestion) {
  if (suggestion.source === "user-rule") return 0;
  if (suggestion.source === "user-history") return 1;
  if (suggestion.source === "smart") return 2;
  if (suggestion.source === "context") return 3;
  if (suggestion.source === "brand") return 4;
  return 5;
}

function addContextualSuggestionCandidates(candidates, text, compact) {
  const hasMoviePlace = compactIncludesAny(compact, ["메가박스", "megabox", "cgv", "씨지브이", "롯데시네마", "영화관"]);
  const hasMovieSnack = compactIncludesAny(compact, ["매점", "팝콘", "콤보", "스낵", "음료"]);
  if (hasMoviePlace && hasMovieSnack) {
    candidates.push({
      sector: "식비",
      subcategory: "편의점/간식",
      confidence: 94,
      reason: "영화관 매점/팝콘 맥락",
      keyword: String(text || compact),
      source: "context",
      priority: 10
    });
  }

  const hasDeliveryPlatform = compactIncludesAny(compact, ["쿠팡이츠", "배민", "배달의민족", "요기요", "바로고", "부릉"]);
  if (hasDeliveryPlatform) {
    candidates.push({
      sector: "식비",
      subcategory: "배달-혼자",
      confidence: 94,
      reason: "배달 플랫폼 키워드",
      keyword: String(text || compact),
      source: "context",
      priority: 15
    });
  }
}

function compactIncludesAny(compact, keywords) {
  return keywords.some((keyword) => {
    const key = compactKeyText(keyword);
    return key && compact.includes(key);
  });
}

function isSmartCandidate(targetCompact, sampleCompact, targetText, sampleText) {
  if (!targetCompact || !sampleCompact) return false;
  if (targetCompact === sampleCompact) return true;
  const shorter = targetCompact.length <= sampleCompact.length ? targetCompact : sampleCompact;
  const longer = targetCompact.length > sampleCompact.length ? targetCompact : sampleCompact;
  if (shorter.length >= 3 && longer.includes(shorter)) return true;
  const targetPrefix = targetCompact.slice(0, 2);
  const samplePrefix = sampleCompact.slice(0, 2);
  if (targetPrefix.length === 2 && targetPrefix === samplePrefix) return true;
  const targetTokens = String(targetText || "").split(/\s+/).filter((token) => token.length >= 2);
  const sampleTokens = String(sampleText || "").split(/\s+/).filter((token) => token.length >= 2);
  if (targetTokens.some((token) => sampleTokens.includes(token))) return true;
  return commonCharacterCount(targetCompact, sampleCompact) >= 2;
}

function commonCharacterCount(left, right) {
  const rightChars = new Set([...String(right || "")]);
  let count = 0;
  unique([...String(left || "")]).some((char) => {
    if (!rightChars.has(char)) return false;
    count += 1;
    return count >= 2;
  });
  return count;
}

function buildSmartSuggestionModel(rows) {
  const grouped = new Map();
  rows
    .filter((item) => item.flow !== "income" && !isCanceled(item.cancel))
    .filter((item) => item.sector && !["미분류", "제외", "수입"].includes(item.sector))
    .forEach((item) => {
      const merchant = String(item.merchant || "").trim();
      const compact = compactKeyText(merchant);
      if (compact.length < 2) return;
      const key = `${compact}|${item.sector}|${item.subcategory}`;
      const existing = grouped.get(key);
      const isUserHistory = Boolean(item.manualSector && item.manualSubcategory) || item.status === "직접입력";
      const countWeight = isUserHistory ? 8 : 1;
      if (existing) {
        existing.count += countWeight;
        existing.amount += Number(item.amount || 0);
        if (isUserHistory) existing.source = "user-history";
        return;
      }
      grouped.set(key, {
        merchant,
        text: normalizeKeyText(merchant),
        compact,
        sector: item.sector,
        subcategory: item.subcategory,
        keyword: merchant,
        count: countWeight,
        amount: Number(item.amount || 0),
        source: isUserHistory ? "user-history" : "history"
      });
    });

  buildUserRuleSuggestionSamples().forEach((sample) => {
    const key = `${sample.compact}|${sample.sector}|${sample.subcategory}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += sample.count;
      existing.source = "user-rule";
      return;
    }
    grouped.set(key, sample);
  });

  return [...grouped.values()]
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, SMART_MODEL_LIMIT);
}

function buildUserRuleSuggestionSamples() {
  if (!Array.isArray(rules)) return [];
  return rules
    .filter((rule) => ["user", "smart-suggestion", "modified-default"].includes(rule.origin))
    .flatMap((rule) => (rule.keywords || []).map((keyword) => {
      const merchant = String(keyword || "").trim();
      const compact = compactKeyText(merchant);
      if (compact.length < 2) return null;
      return {
        merchant,
        text: normalizeKeyText(merchant),
        compact,
        sector: rule.sector,
        subcategory: rule.subcategory,
        keyword: merchant,
        count: 18,
        amount: 0,
        source: "user-rule"
      };
    }))
    .filter(Boolean);
}

function compactKeyText(value) {
  return normalizeKeyText(value).replace(/[\s()[\]{}.,·_\-+*/\\|:;'"!?~₩￦]/g, "");
}

function merchantSimilarityScore(targetCompact, sampleCompact, targetText, sampleText) {
  if (!targetCompact || !sampleCompact) return 0;
  if (targetCompact === sampleCompact) return 0.94;
  const shorter = targetCompact.length <= sampleCompact.length ? targetCompact : sampleCompact;
  const longer = targetCompact.length > sampleCompact.length ? targetCompact : sampleCompact;
  if (shorter.length >= 3 && longer.includes(shorter)) {
    return Math.min(0.9, 0.62 + shorter.length / Math.max(longer.length, 1) * 0.28);
  }
  const tokenScore = tokenOverlapScore(targetText, sampleText);
  const charScore = bigramSimilarity(targetCompact, sampleCompact);
  return Math.max(tokenScore, charScore);
}

function tokenOverlapScore(left, right) {
  const leftTokens = unique(String(left || "").split(/\s+/).filter((token) => token.length >= 2));
  const rightTokens = unique(String(right || "").split(/\s+/).filter((token) => token.length >= 2));
  if (!leftTokens.length || !rightTokens.length) return 0;
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return overlap ? 0.35 + overlap / Math.max(leftTokens.length, rightTokens.length) * 0.35 : 0;
}

function bigramSimilarity(left, right) {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (!leftBigrams.length || !rightBigrams.length) return 0;
  const rightCounts = new Map();
  rightBigrams.forEach((gram) => rightCounts.set(gram, Number(rightCounts.get(gram) || 0) + 1));
  let overlap = 0;
  leftBigrams.forEach((gram) => {
    const count = Number(rightCounts.get(gram) || 0);
    if (!count) return;
    overlap += 1;
    rightCounts.set(gram, count - 1);
  });
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function bigrams(value) {
  const text = String(value || "");
  if (text.length < 2) return text ? [text] : [];
  return Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2));
}
