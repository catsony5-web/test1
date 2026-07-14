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
  "고정 주거비": { className: "fixed", background: "#f0f2f3", text: "#4f5c63", bar: "#66737b" },
  "식비": { className: "food", background: "#eef4f1", text: "#426b59", bar: "#4f7764" },
  "생활용품": { className: "household", background: "#edf4f3", text: "#3f6f6b", bar: "#4c7773" },
  "쇼핑": { className: "shopping", background: "#f7f0f1", text: "#83545c", bar: "#98666f" },
  "개인관리": { className: "personal", background: "#f3f1f5", text: "#675b73", bar: "#776b82" },
  "자기개발": { className: "selfdev", background: "#eff1f5", text: "#4c5e7a", bar: "#5f708d" },
  "교통비": { className: "transport", background: "#eef2f5", text: "#47657b", bar: "#58768a" },
  "기타 소비": { className: "etc", background: "#f3f2f0", text: "#5f5b56", bar: "#716d68" },
  "저축": { className: "saving", background: "#f4f2ea", text: "#6e653f", bar: "#7d754f" },
  "수입": { className: "income", background: "#edf4f0", text: "#2e664d", bar: "#3f765b" },
  "미분류": { className: "unknown", background: "#f6f0f1", text: "#7a5357", bar: "#8a6266" }
};
