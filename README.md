# STACK v2 — 프론트엔드 코드 (React + TypeScript)

React 18 + TypeScript 5 (strict) + Vite 5, 순수 CSS(디자인 토큰 변수). 추가 UI 라이브러리 없음 → 어느 React + TS 프로젝트에도 폴더째 복붙 가능.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit (타입 오류 0개 상태로 전달)
npm run build      # 타입 검사 후 dist/ 생성
```

## 폴더 구조

```
src/
├─ main.tsx                 # 진입점 (tokens.css, app.css 로드)
├─ App.tsx                  # 탭 전환, 헤더/탭바, 프로필(CM-03)·설정(CM-05/06) 모달
├─ types.ts                 # ★ 도메인 타입 전부 (Profile, Experience, 모드별 결과, 공고·슬라이드 …)
├─ vite-env.d.ts            # SVG 등 에셋 import 타입
├─ assets/stack-icon.svg    # 앱 아이콘(라운드 원본) — 온보딩 외 모든 로고
├─ styles/
│  ├─ tokens.css            # 컬러·라운드·폰트 토큰 (Figma 'STACK v2/*' 스타일과 1:1)
│  └─ app.css               # 공통 컴포넌트 클래스 (.card .btn .badge .chip .sheet …)
├─ components/
│  ├─ Icon.tsx              # 아이콘(stroke SVG) — name은 IconName 타입으로 자동완성
│  ├─ Layout.tsx            # AppHeader, TabBar, SubHeader, Sheet, SegmentTabs<T>, EditableField, Toast
│  ├─ HeaderContext.tsx     # 상세 화면 진입 시 로고 헤더 숨김 (useHideHeader)
│  └─ Flow.tsx              # FlowHeader, Stepper, PostingInput, MiniArt, ProgressCard
├─ screens/
│  ├─ Splash.tsx            # CM-01 스플래시 · 온보딩 로고 모션 라이트 버전
│  ├─ Home.tsx              # HM: 파일 업데이트 → 모드 선택 → 분석 중 → 모드별 결과(수정·저장)
│  ├─ PortfolioResult.tsx   # HM-05 포트폴리오 모드 결과
│  ├─ CoverLetterFlow.tsx   # EX-03 자소서 4단계
│  ├─ PortfolioFlow.tsx     # EX-04 포폴 슬라이드 4단계
│  ├─ MyExperience.tsx      # EX: 서류 빌더, 코칭 신청, 보관함, 경험 상세
│  ├─ Explore.tsx           # DS: 교내외 공고, 학교 취업 통계(수원대 전체), 선배 Q&A
│  └─ Mindmap.tsx           # MP: 목표 설정(직접 입력), 역량 진단, 목표 기업 비교, 유사 사용자 비교(잠금)
├─ data/mock.ts             # 화면 확인용 목업 (types.ts 타입 적용)
└─ services/api.ts          # API 함수 자리 (지금은 목업 반환, 반환 타입 명시)
```

## 헤더·탭바 규칙 (피그마와 동일)

| 영역 | 동작 | 코드 |
|---|---|---|
| 하단 탭바 | 항상 화면 하단 고정 | `.app` flex 레이아웃 + `TabBar` |
| 메인 탭 4개의 로고 헤더 | 내용과 함께 스크롤되어 사라짐 | `App.tsx` — `.scroller` 안에 `AppHeader` |
| 상세·단계 화면 | 로고 헤더 숨김, "← 뒤로 + 제목 (+ 저장)" 줄 상단 고정 | `useHideHeader(true)` + `SubHeader`/`FlowHeader` (`position: sticky`) |

## 프로필·통계 데이터 규칙

| 항목 | 출처 | 코드 |
|---|---|---|
| 학교 | 수원대학교 인증 | — |
| 소속 학과·학년 | 수원대 포털 연동, **수정 불가** | `App.tsx > LockedField` + 안내 문구 |
| 희망 직무·목표 기업 | 사용자 직접 텍스트 입력 (추천 칩은 보조) | `ProfileModal`, `Mindmap > TargetSheet` |
| 취업 통계 | 수원대학교 **전체** 공식 자료만, 학과별 미제공 | `Explore > SchoolStatsView`, `SchoolStats` 타입 |
| 공식 수치가 없을 때 | 임의 숫자 대신 '자료 준비 중' | `overall[].value: string \| null` |

> ⚠️ `mock.ts`의 `schoolStats.byJob`(직무별 진출 비율)은 피그마 시안 값입니다. 실제 배포 전 수원대 취업지원처 공식 자료와 대조해 주세요.

## 타입 사용 팁

- 모드별 AI 결과는 `TaggedResult` 유니온으로 들고 다녀요. `if (r.mode === 'portfolio')` 하면 `r.data`가 `PortfolioResult`로 좁혀집니다.
- `analyzeFiles<M>(files, mode)`는 모드에 따라 반환 타입이 자동으로 정해집니다 (`ResultByMode[M]`).
- 백엔드 응답 스키마를 `types.ts`에 맞추면 화면 코드는 수정할 필요가 없어요.

## 백엔드 연결 상태

백엔드 STACK_BE 커밋 22005747d66c2cf2d11431c917bdcad3655c38db의 라우터·Pydantic 모델·INDEPENDENT_API.md를 확인해 연결했습니다.

| 기능 | 연결 |
|---|---|
| 문서 분석·공고 분석 | A 작업 생성 → 2초 폴링 → 결과 조회. result.data 및 data 사용, 서버 stage·부분 실패·경고 처리 |
| 경험 추천 | A 태그 기반 추천 API. FE 메타데이터를 제거한 엄격한 DTO 전달 |
| 자소서 생성·문항 재생성 | A 생성 API → ai-results 조회. 문항별 경험 선택, 성공 후 결과 교체 |
| 슬라이드 구성·내용 생성 | A outline/generate. 구성안 근거 경험 ID 유지, 6/10/14장 검증 |
| 로그인·가입 | B 학번 로그인, 이메일 코드 인증, 비밀번호 등록, 세션 토큰 갱신·로그아웃 |
| 프로필·목표 | B 내 정보 조회 및 목표 수정 |
| 경험 DB | B 전체 페이지 조회·저장·수정·삭제. 화면 메모는 portfolio.frontend에 보존 |
| 자소서·포트폴리오 초안 저장 | 사용자별 이 기기에 저장하고 보관함에서 다시 열기. B에 A 최초 생성 결과를 넣는 HTTP API가 없음 |

.env.example을 .env.local로 복사하고 npm run dev를 실행하세요. A 기본 주소는 http://127.0.0.1:8000, B는 http://127.0.0.1:8001입니다. B 실행 시 --port 8001을 사용해야 두 서버를 함께 실행할 수 있습니다. AI_API_PROXY_TARGET과 BACKEND_API_PROXY_TARGET으로 변경할 수 있습니다. 프록시 경로는 /ai-api 및 /backend-api이며 B의 /api/v1 접두사를 유지합니다.

배포에서는 두 프록시를 구성하거나 VITE_AI_API_BASE_URL과 VITE_BACKEND_API_BASE_URL(B는 /api/v1 포함)을 실제 서버로 지정하고 CORS를 설정하세요. Vite 개발용 프록시는 배포 빌드에 포함되지 않습니다. 비밀 키는 서버에만 설정합니다. VITE_API_MOCK=true를 명시하면 샘플 모드로 실행합니다. 실제 모드는 로그인 후 개인 경험 DB를 사용합니다. A는 아직 인증/소유권 확인 없는 개발용 서버이므로 현재 직접 호출 구조는 로컬 개발용입니다.

실제 모드의 탐색·선배 Q&A·학교 전체 통계는 B API를 사용합니다. 마인드맵은 사용자 입력 기준을 A에 전달해 진단하고 B 선배 비교를 조회합니다. 설정은 B 동의·인증·정책·내보내기·탈퇴 API를 호출합니다. 기존 시안 화면은 샘플 모드에서만 사용합니다. 포트폴리오 내보내기는 B에 생성 결과 저장 경로가 추가된 후 연결할 수 있습니다. B의 update_cl/update_pf는 Python 내부 함수로만 제공되며 프론트에서 직접 호출할 수 없습니다. 현재 생성 결과를 받아 넣는 HTTP 경로를 추측해 만들지 않았습니다.

URL 수집은 B에 크롤러 내부 함수만 있고 본문을 반환하는 URL HTTP API가 없어 공고 본문 입력을 사용합니다. 분석 결과에서 모드 변경은 A /analyses/{id}/remode로 추출 내용을 재사용합니다. 홈의 원본 보관 버튼은 B /files에 업로드하며 최근 파일은 목록·상세의 서명 다운로드 URL로 받아 A에 다시 분석 요청합니다. 보관 파일이 없으면 목록은 비어 있습니다. B 원본 보관 API는 A와 달리 WEBP를 허용하지 않아 원본 보관 시 사전 안내합니다. 공고 문항은 nullable 제한·단위·공백 기준을 유지합니다. INDEPENDENT_API에서 지정한 UTF-8 바이트 계산을 사용합니다.

검증 명령: npm run test:api, npm run build. 전자는 모의 HTTP 응답 기반 계약 테스트이며 실제 서버 실행/AI 품질 검증은 포함하지 않습니다. 제공받은 두 문서는 docs/BACKEND_A_API.md, docs/BACKEND_README.md에 보관했습니다.

공고 문항의 내용·제한·분량 단위·공백 기준을 분석 후 직접 수정할 수 있습니다. 경험 저장 시 역할·성과·분석 결과 전체를 함께 보존합니다.
