# 코드 구조와 데이터 흐름

이 문서는 처음 참여하는 개발자가 수정 위치와 실행 순서를 찾기 위한 지도입니다. 실행 방법과 변경·검증 절차는 [CONTRIBUTING.md](../CONTRIBUTING.md), 기능 소개는 [README.md](../README.md)를 참고하세요.

## 실행 단위

| 위치 | 역할 | 실행·배포 경계 |
| --- | --- | --- |
| `index.html`, `src/`, `assets/` | 브라우저에서 실행하는 가계부 | 정적 웹앱. 거래를 서버에 동기화하지 않음 |
| `data/ipo-calendar.json` | 공개 공모주 일정 | 공개 출처를 모은 배포 데이터. 개인 청약·매도 기록과 별개 |
| `service-worker.js`, `manifest.webmanifest` | 웹앱 설치·공개 자산의 오프라인 캐시 | 개인 저장소와 별개 |
| `scripts/` | 공개 일정 수집, 개발·검증·배포 산출물 도구 | 브라우저에서 직접 실행하지 않음 |
| `tests/`, `qa/` | 자동 검사, 합성 데이터 검증, 수동 체크리스트 | 제품 데이터나 배포 자산이 아님 |
| `docs/` | 구조·운영 가이드 | 개발자 문서 |
| `mobile/` (있는 경우) | 웹 화면을 재사용하는 별도 로컬 Capacitor 개발본 | 별도 의존성·빌드·네이티브 저장소. 웹 릴리스 커밋·게시 제외 |
| `server/` (있는 경우) | 별도 로컬 금융 인증 개발본 | 웹앱과 연결되지 않은 테스트 프로그램. 웹 릴리스 커밋·게시 제외 |
| `audit/`, `design-references/` | 로컬 검토 자료와 시안 | 화면에 개인 정보가 있을 수 있으므로 공개 산출물에서 제외 |
| `private-data/`, `test-data/`, 엑셀·백업 파일 | 개인 작업 자료 | 커밋·배포·개발 서버 공개 대상에서 제외 |

루트 웹앱에는 프레임워크 라우터나 JavaScript 번들러가 없습니다. `npm run build`는 공개 파일을 `dist/`에 모으는 배포 준비 단계이며, 브라우저 코드의 모듈 체계를 변환하는 작업이 아닙니다.

위 표의 모바일·서버는 로컬 작업공간에 있을 수 있는 별도 개발본입니다. 웹 저장소 clone이나 웹 실행에 필요한 구성요소가 아닙니다.

## 먼저 읽을 파일

| 확인하려는 내용 | 파일 |
| --- | --- |
| 화면 마크업, DOM ID, CSS·JavaScript 로드 순서 | `index.html` |
| 앱 버전, 저장 키, IndexedDB 이름 | `src/data/constants.js` |
| 공유 상태, DOM 참조 `els`, 기본 설정 | `src/features/app/state.js` |
| 최초 실행, 이벤트 연결 | `src/features/app/init.js` |
| 화면 전환 | `src/features/app/navigation.js` |
| 전체 재렌더링·화면별 재렌더링 | `src/features/app/render-all.js` |
| 저장·복구·정규화·마이그레이션 | `src/utils/storage.js` |
| 백업 내보내기·선택 복원·초기화 | `src/utils/backup.js` |
| 소비지출 포함 여부·실소비 집계 | `src/utils/grouping.js` |
| 거래 형식·분류명 정규화 | `src/utils/normalize.js` |
| 날짜·월 공유 선택 | `src/utils/date.js` |
| HTML 출력 이스케이프 | `src/utils/dom.js` |

개발 도구의 허용 목록은 `scripts/lib/public-assets.mjs`가 서비스워커의 `APP_FILES`를 읽고 경로·파일 형식을 검사해 만듭니다. `scripts/serve.mjs`와 `scripts/build-web.mjs`가 이 목록을 함께 사용하며, `scripts/check.mjs`는 구문·HTML/CSS/manifest 자산 연결을 검사합니다. 파일 확장자를 넓게 허용하거나 폴더 전체를 공개하는 방식으로 새 자산을 추가하지 마세요.

서비스워커 목록에는 HTML에서 사용하는 `?v=`까지 포함합니다. `scripts/sync-cache-manifest.mjs`는 허용된 참조의 버전 URL을 동기화하고, 실제 파일 복사에는 쿼리를 뺀 경로를 사용합니다. 오프라인 요청이 불필요한 네트워크 실패를 기다리거나 다른 버전 파일을 받지 않도록 정확한 URL로 캐시합니다.

GitHub Pages의 게시 소스는 GitHub Actions입니다. `.github/workflows/deploy-pages.yml`은 `main`을 검증하고 공개 `dist/`만 빌드·게시합니다. `.github/workflows/update-ipo-calendar.yml`은 공개 데이터가 바뀌면 이 배포 workflow를 재사용 호출합니다. PR 검증은 `.github/workflows/verify.yml`에서 수행하며 게시 권한이나 수집용 인증키를 사용하지 않습니다.

## JavaScript 로드 순서

`index.html`의 `<script>`는 `type="module"`이 없는 classic script입니다. 함수와 상태는 여러 파일이 공유하는 전역 범위에 있으므로, 폴더가 나뉘어 있어도 독립 모듈처럼 동작하지 않습니다. 알파벳 순 정렬이나 일부 파일의 `async` 전환은 실행을 깨뜨릴 수 있습니다.

현재 순서는 다음 그룹으로 구성됩니다. 정확한 순서는 언제나 `index.html`이 기준입니다.

1. 본문 끝에서 로컬 SheetJS 자산을 먼저 불러옵니다.
2. 이어서 `src/data/` 정의와 `goals-core.js`를 불러옵니다.
3. `app/state.js`가 기본 설정·공유 상태·이미 만들어진 DOM 참조를 준비합니다.
4. 공통 유틸리티와 일부 계산 전용 코어, 공통 컴포넌트를 불러옵니다.
5. 가져오기·분류 기능, 각 화면의 계산·렌더링 함수를 불러옵니다.
6. `navigation.js`, `appearance.js`, `render-all.js` 다음에 `init.js`를 실행합니다.

함수 본문에서 나중 파일의 함수를 참조하는 것은 호출 시점에 모두 로드되어 있으면 동작합니다. 반대로 파일 최상위에서 값을 계산하거나 DOM 이벤트를 즉시 연결하면 선행 정의가 필요합니다. 새 파일은 사용 지점과 호출 시점을 확인해 배치하고 전역 함수·변수 이름 중복을 검색하세요.

## 시작과 저장 흐름

```text
index.html의 순차 로드
  → init()
    → hydrateStoredData(): 설정·규칙·거래·수입·고정지출 등 복구
    → 현재 월 선택, 분류 마이그레이션, 자동 반영할 고정지출 처리
    → 화면 컨트롤 초기화와 이벤트 연결
    → reclassify(): 원본 transactions를 기반으로 classified 재계산
      → renderAll(): 각 화면·요약·상태 갱신
    → 공개 자산용 서비스워커 등록, 공개 공모주 일정 로드
```

네이티브에서는 `window.BudgetNative.ready`가 완료된 뒤 `init()`을 호출하고 웹 서비스워커 등록을 건너뜁니다.

엑셀 가져오기는 `excel-import.js`에서 파일 크기·시트·열을 확인한 다음 `transaction-parser.js`로 거래를 해석합니다. 이전 스냅샷 생성 → 중복을 고려한 병합 → 거래와 가져오기 정보의 묶음 저장 → 성공 시 메모리 교체 → 재분류·렌더링 순서입니다. 겹치는 가져오기를 차단하고, 저장 완료 후 스냅샷·화면 갱신에 실패한 경우를 거래 저장 실패와 구분합니다.

`safeSaveMany()`는 요청 시 데이터를 복사해 호출 순서대로 처리합니다. 달력의 거래 삭제·추천 분류도 준비한 변경을 먼저 저장한 뒤 화면 상태에 반영합니다. 월 메모는 지연 저장을 유지하며 변경 세대를 비교해 오래된 응답이 새 입력의 완료 표시를 덮어쓰지 않게 합니다. 실패한 메모는 입력을 보존하고 다시 저장할 수 있습니다. 가벼운 저장 상태 표시와 스냅샷 목록 읽기를 분리해 반복 저장 시 불필요한 목록 갱신을 줄입니다.

`transactions`는 저장하는 거래 원본이고 `classified`는 표시·집계에 사용하는 파생 결과입니다. `reclassify()`는 직접 지정한 분류, 수입, 취소, 분류 규칙, 스마트 추천을 적용합니다. 단순 필터 변경은 `renderView()`나 해당 화면의 렌더러를 사용하고, 분류를 바꾸는 변경에서만 필요한 재분류를 실행하세요.

소비지출과 모든 계좌 출금은 같은 값이 아닙니다. 수입·취소·저축·대출 상환·정산 처리를 화면마다 새로 계산하지 말고 `grouping.js`의 `reportingExpenseRows()`, `consumptionAmount()`, `sumConsumption()` 및 해당 분석 코어의 기존 규칙을 확인하세요.

## 화면별 책임 지도

| `src/features/` 폴더 | 사용자 화면·책임 | 주요 진입 파일 |
| --- | --- | --- |
| `app/` | 공유 상태, 최초 실행, 탐색, 테마, 렌더링 조정 | `state.js`, `init.js`, `render-all.js` |
| `import/` | 엑셀 시트·필드 인식, 거래 파싱·중복 병합 | `excel-import.js`, `transaction-parser.js` |
| `classification/` | 기본·사용자 규칙, 재분류, 추천 | `classifier.js`, `rules-manager.js`, `smart-suggestions.js` |
| `board/` | 대시보드, 섹터 지도, 요약 카드 | `board-view.js`, `board-overview.js`, `board-summary.js`, `board-cards.js` |
| `analysis/` | 월간 분석, 비교 증감, 소비 구조 | `monthly-analysis-core.js`, `monthly-analysis-view.js`, `analysis-core.js`, `spending-structure-view.js` |
| `summary/` | 섹터별 월간 비교, 리포트, 패턴, 기간·식비 분석 | `summary-view.js`, `comparison-analysis.js`, `sector-analysis.js`, `summary-food-core.js`, `summary-food-view.js` |
| `monthly/` | 년도 지출정리, 수입 배분·누적 흐름 | `monthly-flow.js`, `monthly-chart.js` |
| `calendar/` | 소비 달력, 일별 상세, 월 메모 | `calendar-view.js` |
| `details/` | 상세 내역 검색·필터·일괄 입력 | `details-view.js` |
| `transactions/` | 전체 거래 관리·직접 입력 | `transactions-view.js` |
| `income/` | 수입 단건·일괄 입력과 기록 목록 | `income-entry.js`, `income-bulk.js`, `income-list.js` |
| `recurring/` | 고정 지출, 월별 점검, 대출 상환·지원금 연결 | `recurring-view.js`, `recurring-review-core.js` |
| `goals/` | 목표 계획·계산·화면 | `goals-core.js`, `goals-view.js` |
| `products/` | 소모품 사용·구매 기록 | `products-view.js` |
| `ipo/` | 개인 공모주 기록·성과·달력, 공개 일정 확인·반영 | `ipo-view.js` |
| `unknown/` | 미분류 거래 해결 | `unknown-view.js` |

공통 표시 조각은 `src/components/`에, 분류 체계와 기본 규칙은 `src/data/`에 있습니다. `*-core.js`는 계산 로직을 찾는 우선 위치이고 `*-view.js`는 화면을 찾는 우선 위치입니다. 모든 기존 파일이 완전히 분리된 구조는 아니므로 새로운 공통 계층을 만들기 전에 실제 중복과 의존성을 확인하세요.

## CSS 숫자와 테마

CSS는 `index.html`에 기재된 순서대로 적용됩니다. 같은 우선순위의 규칙은 나중 파일이 이깁니다. 파일 번호를 바꾸는 것은 단순 정리가 아니라 스타일 우선순위 변경입니다.

| 파일 | 역할 |
| --- | --- |
| `00-tokens.css` | 공통 색·간격·테마별 변수 |
| `01-base.css` | 기본 요소·글꼴 |
| `02-layout.css` | 전체 배치 |
| `03-components.css` | 공통 UI |
| `04-forms-tables.css` | 입력·표 |
| `05-charts.css` | 차트 |
| `06-features.css` | 화면별 기본 스타일 |
| `07-responsive.css` | 반응형 조정 |
| `08-themes.css` | 테마별 보정·선택 미리보기 |
| `09-production-ui.css` | 후속 공통 UI 보정 |
| `10-analysis.css` | 월간·소비 구조 분석 |
| `11-summary-insights.css` | 월별 섹터 요약 |
| `12-rosso-ink.css` | Rosso·Corsa 테마의 구조·표시 보정 |
| `13-goals.css` | 목표 화면 |
| `14-board-overview.css` | 대시보드 개요 |

아이콘 CSS는 `08-themes.css` 뒤에 로드됩니다. `07-responsive.css` 뒤의 화면별 파일에도 반응형 규칙이 있으므로 수정한 선택자를 전체 스타일 폴더에서 검색해야 합니다. 새 테마는 색상 변수, `normalizeTheme()`, `THEME_BROWSER_COLORS`, 선택 버튼과 미리보기를 함께 확인하세요. 전체 `!important` 추가보다 해당 테마·화면의 정확한 선택자와 기존 변수를 사용합니다.

## 개인 데이터와 공개 데이터

웹의 개인 데이터 경로는 `storage.js` → IndexedDB이며, IndexedDB API가 없는 환경에서는 localStorage 경로를 사용합니다. 기존 localStorage와 저장 버전의 호환·복구 처리도 이 파일에 있습니다. 네이티브 환경에서는 `BudgetNative` 저장 어댑터로 연결되므로 브라우저 저장소에 직접 쓰는 코드를 추가하지 않습니다.

저장 키, DB 이름과 버전은 `constants.js`에 있습니다. `safeSaveMany()`와 백업의 범위별 저장 흐름을 사용해 여러 값이 함께 바뀔 때 저장 실패를 처리합니다. 저장소 이름 변경, 초기화, 자동 데이터 이전은 사용자의 금융 기록에 영향을 주므로 별도 마이그레이션과 실패 시 복구를 검증해야 합니다.

공개 공모주 일정은 `scripts/update-ipo-calendar.mjs`와 관련 수집기에서 생성되어 `data/ipo-calendar.json`으로 제공됩니다. 브라우저는 이 공개 파일을 가져오고, 사용자가 확인한 일정만 개인 기록에 반영합니다. API 인증값은 수집 환경의 비밀값이며 웹 자산에 포함하지 않습니다. 출처·정정·충돌 처리 정책은 [ipo-sources.md](ipo-sources.md)에 있습니다.

웹의 IndexedDB·localStorage는 네이티브 SQLCipher 저장소와 동일한 암호화 보장을 제공하지 않습니다. 개인 입력·가져오기 파일·메모는 신뢰하지 않는 데이터로 취급합니다. 일반 텍스트는 `textContent` 또는 `escapeHtml()`로 출력하고, 서식 메모는 `sanitizeCalendarMemoHtml()`을 통과시킵니다. 서비스워커는 명시한 공개 앱 경로만 캐시하며 개인 거래나 인증 API를 저장하는 수단으로 사용하지 않습니다.

## 선택적 로컬 개발본의 범위

로컬 `mobile/` 개발본이 있는 경우 기존 웹 화면과 별도의 네이티브 어댑터를 묶습니다. 암호화 저장·잠금·Android 알림 확인함의 구현과 남은 기기 검증은 해당 개발본의 `README.md`, `SECURITY.md`, `VALIDATION.md`에서 확인합니다. 브라우저 모의 검사는 운영체제 인증·암호화·알림 수신 검증을 대체하지 않습니다. 이 파일들은 웹 릴리스에 포함하지 않습니다.

로컬 `server/` 개발본이 있는 경우 금융 인증을 시험하는 별도 프로그램으로 취급합니다. 루트 웹앱이나 모바일의 실제 금융 조회·동기화 서버로 연결되어 있지 않습니다. 합성 제공기관 응답을 사용하는 테스트와 실제 기관 인증·거래 조회의 성공은 구분합니다. 설정·실행·남은 검증 범위는 해당 로컬 폴더의 `README.md`를 참고하고, 키·토큰·등록 현황을 공통 문서나 리뷰 로그에 복사하지 마세요. 이 개발본도 웹 릴리스의 커밋·게시 범위에서 제외합니다.
