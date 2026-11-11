# STACK v2 — 프론트엔드 코드 (React + TypeScript)

React 18 + TypeScript 5 (strict) + Vite 5 기반 프론트엔드입니다. A(AI)·B(인증/DB) 서버의 API 호출 코드를 구현했습니다. 실제 서버 연동 검증과 일부 기능 연결은 남아 있습니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # TypeScript 검사
npm run build      # 타입 검사 후 dist/ 생성
npm run test:api   # 모의 HTTP 응답 기반 테스트
```

## 폴더 구조

```
src/
├─ main.tsx                 # 진입점 (tokens.css, app.css 로드)
├─ App.tsx                  # 로그인 상태, 내 정보 로딩, 탭 전환, 목표 설정
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
│  ├─ Login.tsx             # 학번 로그인·학교 이메일 인증·비밀번호 등록
│  ├─ LiveData.tsx          # 실제 API 사용: 탐색·통계·선배 Q&A·진단·설정
│  ├─ Explore.tsx           # 샘플 모드의 탐색 화면
│  ├─ Mindmap.tsx           # 샘플 모드의 마인드맵 화면
│  └─ Settings.tsx          # 샘플 모드의 설정 화면
├─ data/mock.ts             # 샘플 모드 데이터 및 공통 표시 상수
└─ services/
   ├─ api.ts                # 화면에서 사용하는 분석·추천·생성·경험 저장 함수
   ├─ http.ts               # A 요청·작업 폴링·이미지 경로
   ├─ career.ts             # A 추천·자소서·슬라이드 요청/응답 변환
   ├─ backend.ts            # B 인증·토큰 갱신·프로필·경험·원본 파일
   └─ questions.ts          # 문항 분량 단위·공백 기준·UTF-8 바이트 계산
```

## 헤더·탭바 구조

| 영역 | 동작 | 코드 |
|---|---|---|
| 하단 탭바 | 항상 화면 하단 고정 | `.app` flex 레이아웃 + `TabBar` |
| 메인 탭 4개의 로고 헤더 | 내용과 함께 스크롤되어 사라짐 | `App.tsx` — `.scroller` 안에 `AppHeader` |
| 상세·단계 화면 | 로고 헤더 숨김, "← 뒤로 + 제목 (+ 저장)" 줄 상단 고정 | `useHideHeader(true)` + `SubHeader`/`FlowHeader` (`position: sticky`) |

## 프로필·통계 데이터

| 항목 | 현재 동작 |
|---|---|
| 학교 인증 | B의 학교 이메일 인증·학번 등록. 실제 학교 포털 자동 연계는 미구현 |
| 학과·학년 | B DB 프로필 조회값을 표시. 현재 프로필 화면에서는 읽기 전용 |
| 희망 직무·목표 기업 | 사용자 입력 후 B 목표 수정 API로 저장 |
| 취업 통계 | B에 등록된 학교 전체 통계와 출처 표시. 빈 목록은 자료 준비 중으로 표시 |
| 역량 진단 | 사용자가 입력한 기준으로 A 태그 기반 진단. 공식 직무 기준이나 취업 확률이 아님 |

샘플 모드의 통계·인물·경험은 화면 확인용입니다. 실제 모드는 서버 데이터를 사용하며, 공식 자료의 정확성은 데이터 등록 시 확인해야 합니다.

## 타입 사용 팁

- 모드별 AI 결과는 `TaggedResult` 유니온으로 들고 다녀요. `if (r.mode === 'portfolio')` 하면 `r.data`가 `PortfolioResult`로 좁혀집니다.
- `analyzeFiles<M>(files, mode)`는 모드에 따라 반환 타입이 자동으로 정해집니다 (`ResultByMode[M]`).
- A/B 응답은 `services`에서 화면 타입으로 변환합니다. 분석 응답의 `result.data`와 공고 응답의 `data`를 구분합니다.
- 기업·직무·문항 분량 제한·포트폴리오 기여도는 누락 시 `null`을 유지합니다.

## API 연결 설정

처음 설정할 때 프로젝트 루트의 .env.example을 .env.local로 복사하세요. 기존 .env.local이 있으면 필요한 항목만 수정합니다.

| 설정 | 기본값 | 용도 |
|---|---|---|
| AI_API_PROXY_TARGET | http://127.0.0.1:8000 | A 서버의 개발 프록시 대상 |
| BACKEND_API_PROXY_TARGET | http://127.0.0.1:8001 | B 서버의 개발 프록시 대상 |
| VITE_AI_API_BASE_URL | /ai-api | 브라우저가 호출하는 A 기본 경로 |
| VITE_BACKEND_API_BASE_URL | /backend-api/api/v1 | 브라우저가 호출하는 B 기본 경로 |
| VITE_API_MOCK | false | true이면 로그인 없이 샘플 모드로 확인 |

실제 모드의 로그인·분석에는 실행 중인 백엔드가 필요합니다. 로컬에서 두 서버를 함께 실행할 경우 다른 포트를 사용하세요. 위 설정에서는 A가 8000, B가 8001입니다. 환경 변수를 변경하면 프론트 개발 서버를 재시작합니다.

프론트 화면만 확인하려면 .env.local의 VITE_API_MOCK을 true로 설정합니다. 이때 분석·저장은 샘플 동작입니다.

배포 시 두 경로의 리버스 프록시를 구성하거나 VITE_*_API_BASE_URL을 실제 서버 주소로 바꾸고 CORS를 설정해야 합니다. B 주소에는 /api/v1을 포함합니다. Vite server.proxy는 개발 서버에서만 적용됩니다. OpenAI 키와 Supabase 서비스 키는 서버에만 설정합니다.

## 구현한 API 호출

기준 백엔드는 STACK_BE 커밋 6142480입니다.
아래는 요청·응답 처리 구현 상태이며 실제 서버에서 정상 동작 확인을 마쳤다는 뜻은 아닙니다.

| 기능 | 현재 구현 |
|---|---|
| 파일·공고 분석 | A 작업 생성 → 2초 폴링 → 결과 조회. URL 입력은 B에서 먼저 본문을 수집 |
| 모드 변경 | A remode로 추출 내용을 재사용해 재분석 |
| 원본 파일 | B 파일 보관·최근 목록·서명 URL 다운로드 후 재사용. B는 WEBP 보관 미지원 |
| 경험 추천 | A 태그 기반 추천 API, 엄격한 요청 DTO로 변환 |
| 자소서 | A 생성·문항 재생성, taskId 결과 조회, 성공 후 문항 교체 |
| 슬라이드 | A 구성·내용 생성, 6/10/14장·근거 경험 ID 처리 |
| 로그인·가입 | B 학번 로그인·이메일 인증·비밀번호 등록·토큰 갱신·로그아웃 |
| 프로필·목표 | B 내 정보 조회·희망 직무/목표 기업 수정 |
| 경험 DB | B 조회·저장·수정·삭제. 역할·성과·분석 결과 보존 |
| 탐색·설정 | B 공고·학교 통계·선배 Q&A·비교·동의·정책·인증·데이터 내보내기·탈퇴 |
| 역량 진단 | A 사용자 입력 기준의 태그 기반 진단 |
| 생성 초안 보관 | 공고 분석과 자소서·슬라이드를 B에 저장. A 원본과 사용자 수정 내용을 구분해 반영 |
| 슬라이드 편집·출력 | 한 장 AI 재생성, 이미지 미리보기·교체·저장, PDF/PPTX 다운로드 |

공고 문항의 내용·분량 제한·단위·공백 기준을 직접 수정할 수 있습니다. 분석 결과 편집은 현재 화면과 B 저장 객체에 반영하며 A 수정 이력 API에는 아직 반영하지 않습니다. 자유 입력 경험 기간 등 FE 추가 필드는 portfolio.frontend에 보존합니다.

## 남은 작업과 검증 범위

- 기존 B DB에는 STACK_BE의 SQL 마이그레이션 04~07을 적용해야 합니다. PDF 출력에는 B 서버의 LibreOffice와 한글 폰트 설정이 필요합니다.
- 예전에 기기에 저장한 초안은 계속 열 수 있습니다. 서버 저장에는 새 API 호출로 받은 A 공고 ID와 생성 작업 ID가 필요합니다.
- 분석 수정 이력과 B 저장 프로젝트 전체 목록은 별도 화면 작업입니다. 최근 초안은 같은 계정과 기기에서 다시 열 수 있습니다.
- 운영 환경에는 A 인증·사용자 소유권 확인, A/B 데이터 삭제 연계와 배포 설정이 필요합니다.

모의 HTTP 테스트·타입 검사·빌드는 통과했습니다. 실제 A/B 서버, Supabase 인증/저장소, AI/OCR, 파일 출력 및 화면 검증은 아직 완료하지 않았습니다.

최신 백엔드 변경과 실행 조건은 [연동 현황](docs/INTEGRATION_GAPS.md)에 정리했습니다. [이전 연동 재점검](docs/INTEGRATION_AUDIT.md)은 2200574 기준 기록입니다.

참고용으로 받은 백엔드 문서 원본은 [Backend A API 초안](docs/BACKEND_A_API.md), [백엔드 README](docs/BACKEND_README.md)에 보관했습니다. 프론트의 현재 상태는 이 README와 연동 재점검 문서를 기준으로 확인하세요.
