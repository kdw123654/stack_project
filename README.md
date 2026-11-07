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

## 백엔드 연결할 때

`src/services/api.ts`의 함수 **내부만** fetch로 바꾸면 화면 코드는 그대로 동작합니다.

| 함수 | 반환 타입 | 예상 엔드포인트 |
|---|---|---|
| `analyzeFiles(files, mode, memo, onStep)` | `ResultByMode[M]` | `POST /api/experiences/analyze` (multipart) |
| `saveExperience(payload)` | `Experience` | `POST /api/experiences` |
| `parsePosting({ url, text })` | `Posting` | `POST /api/postings/parse` |
| `matchExperiences(posting, kind, list)` | `MatchedExperience[]` | `POST /api/postings/:id/match` |
| `generateCoverLetter(posting, picked, onStep)` | `CoverDraft[]` | `POST /api/drafts/cover` |
| `buildSlideOutline(posting, picked, size)` | `SlideItem[]` | `POST /api/drafts/slides/outline` |
| `generateSlides(outline)` | `SlideItem[]` | `POST /api/drafts/slides` |

AI 확신도가 낮은 칸은 `needsCheck: true`로 내려 주세요 → 주황색 "확인 필요" 표시.

## 아직 코드에 없는 것 (피그마에는 있음)

- 설정 상세 화면 P0(개인정보 보호)·S1(학교 인증)·G1(이용 가이드)·W1~W3(탈퇴 단계) — 지금은 설정 모달에서 토스트로 대체. 라우터(react-router 등) 도입 시 `SETTINGS_ITEMS`의 `onClick`에서 이동하면 됩니다.
- '인증 문의하기', '내 데이터 내려받기' 버튼 동작

## 정해야 할 것 (기본값으로 넣어 둠)

- 업로드 제한: `UPLOAD_LIMIT` (5개 · 파일당 20MB)
- 목표 기업 비교 최소 표본: `MIN_SAMPLE` (3명)
- 메모 글자 수: 300자
- 폰트: Pretendard Variable (index.html CDN)
