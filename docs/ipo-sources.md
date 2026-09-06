# 공모주 공개 일정 수집

개인 청약·배정·매도 정보는 읽거나 전송하지 않습니다. GitHub Actions가 공개 자료만 조회하고 `data/ipo-calendar.json`을 배포합니다.

## 인증키와 실행

- 저장소 Settings → Secrets and variables → Actions → Repository secrets에 `DART_API_KEY`를 등록합니다. Variables나 공개 파일에 넣지 않습니다.
- 키는 `Fetch KRX KIND and DART schedules` 단계의 환경변수로만 전달됩니다.
- 기존 하루 3회 예약을 유지합니다. GitHub의 예약 실행은 지연될 수 있습니다.
- 수동 실행: Actions → Update IPO calendar → Run workflow.
- 로컬에 키가 없으면 DART 통합 실행을 중단합니다. 비밀 값을 다운로드하거나 로그로 확인하지 마세요.
- `node --test tests/ipo-calendar-parser.test.mjs tests/ipo-dart.test.mjs tests/ipo-sources-view.test.cjs`

## 출처와 범위

- KRX KIND: 공모기업현황 목록 전체 페이지.
- DART: C001 지분증권 신고서 목록을 최대 90일 구간으로 나눠 조회하고 기업별 `estkRs.json`의 일반사항·증권의종류·인수인정보를 대조합니다.
- 비상장/코넥스 또는 기존 KRX·DART 일정과 연결되는 회사의 일반공모를 후보로 취급합니다. 주주배정 및 제3자배정은 제외합니다. 비상장 일반공모가 모두 신규 상장을 뜻하는 것은 아니므로 공식 원문 확인이 필요합니다.
- 주관사 안내는 자동 크롤링하지 않습니다. `scripts/ipo-official-supplements.mjs`에 공식 출처와 확인일을 갖춘 보완 자료만 등록합니다. 현재 보완 목록은 비어 있습니다.

## 정정·가격·누락 처리

- 같은 종목의 출처를 합치되 기존 일정 ID 및 별칭을 유지하여 개인 기록과의 연결을 보존합니다.
- 출처 간 청약일·납입일·상장일·확정가가 다르면 양쪽 값을 표시하고 추가/변경 반영을 막습니다. 원문 확인 후 수집 자료를 정정해야 합니다.
- DART의 `slprc` 숫자만으로 확정 공모가를 판단하지 않습니다. 동일 접수번호의 발행조건확정 공시가 확인되지 않으면 신고서 기재가로만 표시합니다. 희망 밴드는 검증된 보완 자료가 있을 때만 표시합니다.
- 최신 공시와 구조화 데이터의 접수번호가 다르거나 날짜를 안전하게 해석할 수 없으면 확인 필요로 표시합니다.
- 구조화 API 자료가 없는 기업은 `coverage.unresolved`에 남깁니다. 수집 성공은 모든 공모주가 포함되었다는 보장이 아닙니다.
- 인증·요청 제한·통신·스키마 오류가 발생하면 작업을 실패 처리하며 이전 공개 파일을 보존합니다. 하나의 출처만 성공한 불완전한 결과로 덮어쓰지 않습니다.
- 명시적 변경 반영 시에도 출처에 없는 날짜·가격을 이유로 개인 입력값을 지우지 않습니다.

## 공식 개발 문서

- https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001
- https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS006&apiId=2020054
