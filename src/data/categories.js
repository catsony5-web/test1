const categories = {
  "고정 주거비": ["보험료", "월세", "전기", "가스", "통신비", "대출이자"],
  "식비": ["외식-혼자", "외식-친구", "외식-단체", "배달-혼자", "배달-친구", "배달-단체", "장보기/마트", "편의점/간식", "카페/음료"],
  "생활용품": ["소모품", "문구/작업용품", "집 관리"],
  "쇼핑": ["의류", "화장품", "전자기기/소품", "취미/기타 쇼핑"],
  "개인관리": ["의료", "머리", "운동/헬스"],
  "자기개발": ["책/도서", "강의/교육", "자격증/시험", "스터디/세미나", "온라인 강좌", "작업/학습 도구"],
  "교통비": ["대중교통", "택시", "기차", "고속버스", "주유/차량"],
  "저축": ["보험", "상품권/저축성", "적금/예금"],
  "기타 소비": ["구독료", "경조사·선물", "증명서/행정", "노래방/PC방", "영화/공연", "일회성 소비", "수수료/기타"],
  "수입": ["이체입금", "기타수입"],
  "미분류": ["미분류"]
};

const sectorThemes = {
  "고정 주거비": { className: "fixed", background: "#f1f5f9", text: "#334155", bar: "#94a3b8" },
  "식비": { className: "food", background: "#ecfdf3", text: "#047857", bar: "#34d399" },
  "생활용품": { className: "household", background: "#f0fdfa", text: "#0f766e", bar: "#2dd4bf" },
  "쇼핑": { className: "shopping", background: "#fff1f6", text: "#be185d", bar: "#f9a8d4" },
  "개인관리": { className: "personal", background: "#f5f3ff", text: "#6d28d9", bar: "#c4b5fd" },
  "자기개발": { className: "selfdev", background: "#eef2ff", text: "#4338ca", bar: "#818cf8" },
  "교통비": { className: "transport", background: "#eff6ff", text: "#1d4ed8", bar: "#93c5fd" },
  "기타 소비": { className: "etc", background: "#fffbeb", text: "#b45309", bar: "#fcd34d" },
  "저축": { className: "saving", background: "#fefce8", text: "#854d0e", bar: "#fde68a" },
  "수입": { className: "income", background: "#ecfdf5", text: "#047857", bar: "#10b981" },
  "미분류": { className: "unknown", background: "#fff1f2", text: "#be123c", bar: "#fda4af" }
};
