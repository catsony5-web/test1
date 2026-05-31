function mergeTransactions(existing, incoming) {
  const records = existing.map(normalizeStoredTransaction);
  const seen = new Set(records.map((item) => item.recordKey));
  let added = 0;
  let skipped = 0;

  incoming.map(normalizeStoredTransaction).forEach((item) => {
    if (seen.has(item.recordKey)) {
      skipped++;
      return;
    }
    seen.add(item.recordKey);
    records.push(item);
    added++;
  });

  records.sort((a, b) =>
    `${a.approvalDate} ${a.approvalTime} ${a.merchant}`.localeCompare(`${b.approvalDate} ${b.approvalTime} ${b.merchant}`, "ko-KR")
  );
  return { records, added, skipped };
}

function normalizeStoredTransaction(item) {
  const normalized = {
    sourceType: item.sourceType || "card",
    flow: item.flow || "expense",
    cardNumber: item.cardNumber || "",
    approvalDate: item.approvalDate || "",
    month: item.month || monthKey(item.approvalDate),
    approvalTime: item.approvalTime || "",
    merchant: item.merchant || "",
    amount: Number(item.amount || 0),
    installment: item.installment || "",
    approvalNo: item.approvalNo || "",
    cancel: item.cancel || "",
    payDate: item.payDate || "",
    manualSector: item.manualSector || "",
    manualSubcategory: item.manualSubcategory || "",
    sourceFile: item.sourceFile || "",
    importedAt: item.importedAt || "",
    createdAt: item.createdAt || item.importedAt || "",
    updatedAt: item.updatedAt || item.createdAt || item.importedAt || "",
    recurringId: item.recurringId || "",
    installmentEnabled: Boolean(item.installmentEnabled),
    installmentMonths: Number(item.installmentMonths || 0),
    installmentStartMonth: item.installmentStartMonth || "",
    installmentOriginalAmount: Number(item.installmentOriginalAmount || 0),
    installmentMonthlyAmount: Number(item.installmentMonthlyAmount || 0),
    installmentGroupId: item.installmentGroupId || "",
    memo: item.memo || "",
    recordKey: item.recordKey || ""
  };
  normalized.recordKey = normalized.recordKey || createRecordKey(normalized);
  return normalized;
}

function createRecordKey(item) {
  const approvalNo = String(item.approvalNo || "").trim();
  if (approvalNo) {
    return [
      item.sourceType || "card",
      item.flow || "expense",
      "approval",
      item.approvalDate,
      approvalNo,
      item.amount,
      normalizeKeyText(item.merchant)
    ].join("|");
  }

  return [
    item.sourceType || "card",
    item.flow || "expense",
    "fallback",
    item.approvalDate,
    item.approvalTime,
    normalizeKeyText(item.merchant),
    item.amount,
    String(item.cancel || "").trim()
  ].join("|");
}

function normalizeKeyText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("ko-KR");
}

function normalizeSearchText(value) {
  return normalizeKeyText(value);
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function compactSearchNumber(value) {
  return normalizeDigits(value);
}

function buildDateSearchTokens(date, month = "") {
  const normalizedDate = normalizeInputDate(date);
  const normalizedMonth = monthKey(month || normalizedDate);
  const dateDigits = compactSearchNumber(normalizedDate);
  const monthDigits = compactSearchNumber(normalizedMonth);
  const monthDay = normalizedDate ? normalizedDate.slice(5) : "";
  const monthDayDigits = compactSearchNumber(monthDay);
  return [...new Set([
    normalizedDate,
    normalizedDate ? normalizedDate.replaceAll("-", ".") : "",
    normalizedDate ? normalizedDate.replaceAll("-", "/") : "",
    normalizedMonth,
    normalizedMonth ? normalizedMonth.replaceAll("-", ".") : "",
    normalizedMonth ? normalizedMonth.replaceAll("-", "/") : "",
    monthDay,
    monthDay ? monthDay.replaceAll("-", ".") : "",
    monthDay ? monthDay.replaceAll("-", "/") : "",
    dateDigits,
    dateDigits ? dateDigits.slice(2) : "",
    monthDigits,
    monthDigits ? monthDigits.slice(2) : "",
    monthDayDigits
  ].filter(Boolean))];
}

function dateSearchTokens(date, month = "") {
  return buildDateSearchTokens(date, month);
}

function amountSearchTokens(amount) {
  const number = Number(amount || 0);
  if (!Number.isFinite(number)) return [];
  const absNumber = Math.abs(number);
  const plain = String(absNumber);
  const comma = absNumber.toLocaleString("ko-KR");
  return [...new Set([plain, comma, `${plain}원`, `${comma}원`])];
}

function transactionSearchText(item, extraValues = []) {
  return normalizeSearchText([
    item.merchant,
    item.memo,
    item.approvalDate,
    item.month,
    ...dateSearchTokens(item.approvalDate, item.month),
    ...amountSearchTokens(item.amount),
    ...extraValues
  ].filter(Boolean).join(" "));
}

function matchesDateQuery(date, query, month = "") {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const tokens = buildDateSearchTokens(date, month).map(normalizeSearchText);
  if (tokens.some((token) => token.includes(normalizedQuery))) return true;
  const compactQuery = normalizeDigits(query);
  return Boolean(compactQuery && tokens.some((token) => normalizeDigits(token).includes(compactQuery)));
}

function transactionMatchesSearch(item, query, extraValues = []) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const haystack = transactionSearchText(item, extraValues);
  if (haystack.includes(normalizedQuery)) return true;
  const compactQuery = normalizeDigits(query);
  return Boolean(compactQuery && haystack.includes(compactQuery));
}

function matchesRecordSearch(record, query, fields = []) {
  return transactionMatchesSearch(record, query, fields.map((field) =>
    typeof field === "function" ? field(record) : field
  ));
}

function hasMerchantKeyword(merchant, keywords) {
  const text = normalizeKeyText(merchant);
  return keywords.some((keyword) => text.includes(normalizeKeyText(keyword)));
}

function guessFoodSubcategory(merchant, fallback = "장보기/마트") {
  if (hasMerchantKeyword(merchant, ["쿠팡이츠", "배민", "배달의민족", "요기요", "배달"])) return "배달-혼자";
  if (hasMerchantKeyword(merchant, ["스타벅스", "메가커피", "메가엠지씨", "컴포즈", "투썸", "빽다방", "카페", "커피", "공차", "이디야"])) return "카페/음료";
  if (hasMerchantKeyword(merchant, ["GS25", "지에스", "CU", "씨유", "세븐일레븐", "이마트24", "위드미", "편의점", "아이스크림", "베이커리"])) return "편의점/간식";
  if (hasMerchantKeyword(merchant, ["마트", "이마트", "홈플러스", "롯데마트", "하나로마트", "농협마트", "장보기", "노브랜드"])) return "장보기/마트";
  if (hasMerchantKeyword(merchant, ["식당", "푸드", "버거", "KFC", "맥도날드", "롯데리아", "분식", "국밥", "초밥", "애슐리", "피자", "라멘", "김밥", "샐러드"])) return "외식-혼자";
  return fallback;
}

function normalizeCategoryAssignment(sector, subcategory, merchant = "") {
  const cleanSector = String(sector || "").trim();
  const cleanSubcategory = String(subcategory || "").trim();
  const giftLikeSubcategories = new Set([
    "경조사/선물",
    "경조사·선물",
    "생일",
    "생일선물",
    "생일/기념일 선물",
    "경조사",
    "축의금",
    "축의금/부의금",
    "조의금/부의금",
    "부의금",
    "조의금",
    "명절선물",
    "기념일",
    "가족/지인 선물",
    "꽃/화환",
    "기프티콘/상품권",
    "기타 선물",
    "선물"
  ]);
  const giftKeywords = ["생일", "생일선물", "선물", "기프티콘", "카카오톡선물하기", "카카오 선물하기", "축의금", "결혼식", "결혼", "돌잔치", "조의금", "부의금", "장례", "경조사", "명절", "명절선물", "어버이날", "스승의날", "기념일", "꽃다발", "꽃집", "화환", "케이크", "선물세트"];
  const subscriptionKeywords = ["구독", "멤버십", "네이버플러스", "쿠팡와우", "유튜브프리미엄", "넷플릭스", "티빙", "웨이브", "디즈니플러스", "왓챠", "멜론", "스포티파이", "애플뮤직", "구글원", "아이클라우드", "정기결제", "월정액"];

  if (cleanSector === "경조사/선물" || (cleanSector === "기타 소비" && giftLikeSubcategories.has(cleanSubcategory))) {
    return { sector: "기타 소비", subcategory: "경조사·선물" };
  }

  if (cleanSector === "고정 주거비" && cleanSubcategory === "구독료") {
    return { sector: "기타 소비", subcategory: "구독료" };
  }
  if (cleanSector === "고정 주거비" && hasMerchantKeyword(merchant, subscriptionKeywords)) {
    return { sector: "기타 소비", subcategory: "구독료" };
  }

  if (categories[cleanSector]?.includes(cleanSubcategory)) {
    return { sector: cleanSector, subcategory: cleanSubcategory };
  }

  if (cleanSector === "식비") {
    const mapped = {
      "외식": "외식-혼자",
      "배달": "배달-혼자",
      "마트 장보기": "장보기/마트",
      "장보기": "장보기/마트",
      "간식": "편의점/간식"
    }[cleanSubcategory] || (cleanSubcategory === "품목" ? guessFoodSubcategory(merchant) : "");
    return { sector: "식비", subcategory: mapped || "외식-혼자" };
  }

  if (cleanSector === "개인관리") {
    if (cleanSubcategory === "화장품") return { sector: "쇼핑", subcategory: "화장품" };
    if (cleanSubcategory === "의류") return { sector: "쇼핑", subcategory: "의류" };
    if (categories["개인관리"].includes(cleanSubcategory)) return { sector: "개인관리", subcategory: cleanSubcategory };
  }

  if (cleanSector === "자기개발") {
    const mapped = {
      "책": "책/도서",
      "도서": "책/도서",
      "강의": "강의/교육",
      "교육": "강의/교육",
      "교육비": "강의/교육",
      "강의/온라인강좌": "온라인 강좌",
      "온라인강좌": "온라인 강좌",
      "온라인 강의": "강의/교육",
      "자격증": "자격증/시험",
      "시험": "자격증/시험",
      "스터디/모임": "스터디/세미나",
      "스터디": "스터디/세미나",
      "세미나": "스터디/세미나",
      "작업도구": "작업/학습 도구",
      "학습도구": "작업/학습 도구"
    }[cleanSubcategory];
    return {
      sector: "자기개발",
      subcategory: categories["자기개발"].includes(mapped || cleanSubcategory) ? mapped || cleanSubcategory : "강의/교육"
    };
  }

  if (cleanSector === "기타 소비") {
    if (hasMerchantKeyword(merchant, subscriptionKeywords)) {
      return { sector: "기타 소비", subcategory: "구독료" };
    }
    if (hasMerchantKeyword(merchant, giftKeywords)) {
      return { sector: "기타 소비", subcategory: "경조사·선물" };
    }
    if (hasMerchantKeyword(merchant, ["다이소", "방향제", "청소용품", "세제", "휴지", "건전지", "생활용품"])) {
      return { sector: "생활용품", subcategory: "소모품" };
    }
    if (hasMerchantKeyword(merchant, ["문구", "프린트", "인쇄", "노트", "펜", "테이프", "커터", "모형재료"])) {
      return { sector: "생활용품", subcategory: "문구/작업용품" };
    }
    if (hasMerchantKeyword(merchant, ["증명사진", "여권", "민원", "등본", "초본", "서류", "출력", "프린트카페"])) {
      return { sector: "기타 소비", subcategory: "증명서/행정" };
    }
    if (hasMerchantKeyword(merchant, ["노래방", "코인노래방", "코인노래", "PC방", "피시방", "게임방"])) {
      return { sector: "기타 소비", subcategory: "노래방/PC방" };
    }
    if (hasMerchantKeyword(merchant, ["수수료", "이체수수료", "카드수수료"])) {
      return { sector: "기타 소비", subcategory: "수수료/기타" };
    }
    return { sector: "기타 소비", subcategory: "일회성 소비" };
  }

  if (cleanSector === "생활용품") return { sector: "생활용품", subcategory: categories["생활용품"].includes(cleanSubcategory) ? cleanSubcategory : "소모품" };
  if (cleanSector === "쇼핑") return { sector: "쇼핑", subcategory: categories["쇼핑"].includes(cleanSubcategory) ? cleanSubcategory : "취미/기타 쇼핑" };
  if (cleanSector === "수입") return { sector: "수입", subcategory: categories["수입"].includes(cleanSubcategory) ? cleanSubcategory : "이체입금" };
  if (categories[cleanSector]) return { sector: cleanSector, subcategory: categories[cleanSector][0] };
  return { sector: "미분류", subcategory: "미분류" };
}
