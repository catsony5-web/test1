# 소비 분석

카드·이체 엑셀과 직접 입력한 기록으로 지출, 수입, 대출 상환, 목표 자산을 분석하는 정적 웹앱입니다. 웹 거래 데이터는 각 사용자의 브라우저에 저장됩니다. 공개 공모주 일정만 별도로 수집하며 개인 거래를 서버로 동기화하지 않습니다.

## 개발 시작

Node.js 24 이상이 필요합니다. 루트 웹 개발 도구는 Node 내장 기능만 사용하므로 패키지 설치가 필요 없습니다.

```sh
npm run dev
```

`http://127.0.0.1:4173/`에서 확인합니다. 이미 사용 중인 포트라면 `npm run dev -- --port 4182`처럼 변경합니다. 이 서버는 공개 앱 자산만 제공하며 폴더 목록, 개인 파일, 모바일·인증 서버 소스를 제공하지 않습니다. `file://`로 여는 방식은 서비스워커·공개 일정 로딩이 달라 권장 개발 경로가 아닙니다.

```sh
npm run verify
npm run build
npm run preview
```

`verify`는 구문·자산 연결 검사, 자동 테스트, 기존 QA를 실행합니다. `build`는 공개 파일만 `dist/`에 복사합니다. `preview`는 `http://127.0.0.1:4174/`에서 그 산출물을 실제 오프라인 서비스워커와 함께 제공합니다. 개인 거래나 외부 금융 API는 사용하지 않습니다. 세부 명령과 변경 절차는 [협업 가이드](CONTRIBUTING.md)를 참고하세요.

`dev`에서는 이전 서비스워커를 캐시하지 않는 개발용 워커로 교체해 수정된 파일을 확인합니다. 개인 저장소나 기존 캐시는 삭제하지 않습니다. 설치·오프라인 동작은 `build` 후 `preview`에서 검증하세요.

HTML의 자산 경로·`?v=`를 바꾼 경우 `npm run cache:sync` 후 검증합니다. `check`는 HTML과 캐시 URL의 버전 불일치를 차단합니다. 동기화 명령은 앱 릴리스 번호를 자동으로 올리지 않으므로 변경 시 `APP_VERSION`과 `CACHE_NAME`도 함께 확인합니다.

## 파일 구조

```text
index.html               화면 마크업과 classic script/CSS 로드 순서
src/
  data/                  분류 체계·기본 규칙·저장 키
  features/              화면과 기능별 로직
  components/            공통 렌더링 함수
  utils/                 저장·정규화·날짜·금액·집계
  styles/                순서가 정해진 CSS와 테마 토큰
assets/                  로컬 SheetJS와 아이콘·라이선스
data/ipo-calendar.json   공개 공모주 일정(개인 JSON의 유일한 데이터 예외)
service-worker.js        공개 자산 목록과 오프라인 캐시
scripts/                 개발 서버·검증·웹 빌드·공개 일정 수집
tests/                   Node 자동 테스트, 합성 입력
qa/                      집중 QA 스크립트와 수동 체크리스트
docs/                    구조와 유지보수 문서
mobile/                  선택적 로컬 설치형 앱 개발본, 웹 릴리스 제외
server/                  선택적 로컬 인증 테스트 개발본, 웹 릴리스 제외
dist/                    생성된 공개 웹 산출물, Git 제외
```

`features/`의 화면별 수정 위치와 데이터 흐름은 [아키텍처 지도](docs/architecture.md)에 정리했습니다. 기존 경로와 실행 순서는 호환성을 위해 유지합니다.

| 문서 | 읽는 목적 |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 실행·협업·테스트·릴리스 절차 |
| [아키텍처 지도](docs/architecture.md) | 어떤 기능을 어느 파일에서 수정하는지 찾기 |
| [SECURITY.md](SECURITY.md) | 개인 데이터·인증키·공개 파일의 보호 범위 |
| [유지보수 점검 기록](docs/maintenance-audit.md) | 이번 점검의 수정 사항과 미검증 범위 |
| [공모주 출처 가이드](docs/ipo-sources.md) | 공개 일정 수집·정정·인증키 설정 |

## 모바일·인증 서버 개발본

로컬 작업공간에는 별도 작업에서 개발하는 `mobile/`, `server/`가 있을 수 있습니다. 해당 개발본의 안내는 각 폴더의 README를 참고하세요. 웹 릴리스는 이 프로젝트들을 커밋하거나 게시하지 않으며 실제 금융기관 연결을 활성화하지 않습니다.

하위 프로젝트는 각자 `package.json`, 의존성, 테스트, 배포 절차를 사용합니다. 루트 `npm run build`는 모바일·인증 서버를 포함하지 않습니다.

## 사용과 저장

1. `카드/이체 엑셀 불러오기`로 본인의 파일을 선택합니다.
2. 미분류 거래를 정리하고 수입·과거 거래·고정 지출을 입력합니다.
3. 대시보드, 소비 달력, 월간 분석, 섹터 요약, 목표 자산 화면에서 비교합니다.
4. 설정/관리에서 백업을 내려받아 저장소 밖의 개인 보관 위치에 보관합니다.

같은 사이트를 사용해도 브라우저별 데이터는 공유되지 않습니다. 웹의 IndexedDB/localStorage 및 JSON/XLSX 백업은 평문이며 브라우저 데이터 삭제 시 기록이 사라질 수 있습니다. 앱 코드·문서·합성 테스트만 Git에 넣고 실제 엑셀, 백업, 거래 스크린샷, 비밀키를 커밋하지 않습니다.

## 웹 배포 경계

배포 산출물은 `npm run build`가 만드는 `dist/`입니다. `index.html`, `src/`, 필수 `assets/`, 공개 일정, manifest·서비스워커·앱 아이콘·`.nojekyll`만 들어갑니다. README·QA·서버·모바일·로컬 자료는 제외됩니다. 목록은 서비스워커의 `APP_FILES`와 개발 도구의 경로 검증이 관리합니다.

GitHub Pages 게시 소스는 GitHub Actions를 사용합니다. `Deploy public web application`은 `main` 변경 시 검증 후 `dist/`만 업로드·배포합니다. 검사 실패 시 게시하지 않으며, 배포는 순차 실행합니다. 운영 주소와 상대 자산 경로는 유지합니다. [GitHub 게시 소스 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

`Verify web application`은 PR에서 검증과 공개 빌드만 실행합니다. 공개 일정 수집기가 자료나 갱신 상태를 커밋하면 재사용 배포 workflow를 직접 호출하므로 봇의 push가 다른 workflow를 자동 실행하는지에 의존하지 않습니다. 배포 job은 필요한 Pages·OIDC 권한만 가지며 수집용 비밀키를 전달받지 않습니다. 저장소 branch protection은 별도 설정입니다.
