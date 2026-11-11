# STACK

한 저장소에 서버 2개와 프론트엔드가 함께 있습니다.

| 폴더 | 담당 | 포트 | 실행 |
|---|---|---|---|
| `app/` (루트) | A — AI 서버 | 8000 | `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` |
| `server/` | B — 백엔드(Supabase) | 8001 | `cd server` 후 `uvicorn app.main:app --reload --host 127.0.0.1 --port 8001` |
| `src/` (루트) | 프론트엔드 (Vite + React) | 5173 | `npm install` 후 `npm run dev` |

프론트는 `/ai-api` → 8000, `/backend-api` → 8001로 프록시합니다 (`vite.config.ts`). 세 개를 각각 다른 터미널에서 실행합니다.

---

# STACK Backend (A + B)

이 브랜치에는 백엔드 서버 2개가 함께 있습니다. 프론트가 받은 A 생성 결과를 B에 저장하는 인증된 HTTP API를 제공합니다. A 작업 자체의 로그인/소유권 연결과 단일 서버 통합은 아직 별도 작업입니다.

| 폴더 | 담당 | 내용 |
|---|---|---|
| `server/` | B | FastAPI + Supabase: 로그인(학교 이메일·학번), 내 정보, 파일, 경험 DB, 공고·자소서·포폴 저장, PPTX 내보내기, 탐색, 홈 — API는 `/api/v1/...` |
| `app/` (루트) | A | FastAPI + OpenAI: 문서 추출, AI 분석, 공고 분석, 경험 추천, 자소서·포폴 생성, 역량 진단 |

### B 서버 실행 (`server/`)

```bash
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
# server/.env 에 SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY 설정 (.env는 커밋 금지)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001   # A 서버(8000)와 겹치지 않게 8001
```

- DB 만들기: Supabase SQL Editor에서 `server/sql/01_schema.sql` → `02_seed.sql` → `03_student_login.sql` 순서로 실행
- 이미 DB를 만든 경우 새 저장 API 사용 전 `04_posting_analysis_import.sql` → `05_cover_answer_import.sql` → `06_portfolio_slide_import.sql` → `07_portfolio_images.sql`을 추가 실행합니다. 이 SQL은 아직 원격 DB에 자동 적용하지 않았습니다.
- API 문서: http://127.0.0.1:8001/docs
- 구현 가이드: `docs/GUIDE_B*.md`

### A 생성 결과 최초 저장

| API | 입력 | 상세 |
|---|---|---|
| `POST /api/v1/job-postings` | A postingId + 원문 + A의 data | [공고 저장·ID 매핑](docs/POSTING_STORAGE.md) |
| `PUT /api/v1/cover-letters/{id}/answers` | A taskId + data.answers | [자소서 답변 저장](docs/COVER_STORAGE.md) |
| `PUT /api/v1/portfolios/{id}/slides` | A taskId + data.size/slides | [슬라이드 저장](docs/SLIDE_STORAGE.md) |
| `POST /api/v1/job-postings/fetch` | 공고 URL → 본문 | [URL 수집](docs/POSTING_URL.md) |
| `POST /portfolios/slides/{slideId}/regenerate` (A) | 한 장 재생성 | [재생성·저장](docs/SLIDE_REGENERATION.md) |
| `PUT /api/v1/portfolios/{id}/slides/{slideNo}/generated` (B) | 재생성한 한 장 저장 | [재생성·저장](docs/SLIDE_REGENERATION.md) |
| `POST /api/v1/portfolios/{id}/images` | 이미지 업로드·교체 | [이미지·출력](docs/PORTFOLIO_EXPORT.md) |
| `GET /api/v1/portfolios/{id}/images/{imageId}` | 인증된 이미지 미리보기 | [이미지·출력](docs/PORTFOLIO_EXPORT.md) |

세 API 모두 B 로그인 토큰이 필요합니다. B DB 공고 ID로 서류 프로젝트를 만들고 A 생성 결과를 저장한 뒤 B 상세 API로 다시 조회합니다. 같은 A 결과를 재전송해도 중복 생성하거나 이후 사용자 수정본을 덮어쓰지 않습니다. 원격 Supabase와 실제 AI/PDF의 연속 실행은 환경 설정 후 별도 확인해야 합니다.

---

# STACK Backend A

FastAPI 기반 문서 파싱·OpenAI 분석·비동기 Job 서비스입니다. 경험 분석·수정·재분석, 공고 분석, 경험 추천, 자소서 생성·재생성, 포트폴리오 구성·내용 생성, 역량 진단을 지원합니다. B의 사용자/경험 DB 없이 JSON 입력으로 실행할 수 있습니다. 현재 단일 프로세스 개발용이며, 인증·마스터 DB·스토리지·실제 파일 출력은 B와 연결해야 합니다.

## 실행

Python 3.11 이상에서 프로젝트 루트 기준으로 실행합니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
cp -n .env.example .env
# .env의 OPENAI_API_KEY를 본인 키로 설정한 뒤 실행합니다.
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- API 문서: http://127.0.0.1:8000/docs
- 상태 확인: `GET /health`
- 텍스트 추출: `POST /documents/extract` (multipart의 `file` 필드)
- AI 작업 생성: `POST /analyses` (multipart의 `files`, `mode`, 선택 `memo`, `targetJob`)
- 작업 조회: `GET /jobs/{jobId}`
- 실시간 작업 상태: `GET /jobs/{jobId}/stream` (SSE)
- 결과 조회: `GET /analyses/{analysisId}`
- 공고 분석 생성: `POST /job-postings/analyze` (JSON의 `text` 필드)
- 공고 결과 조회: `GET /job-postings/{postingId}/analysis`

`/docs`에서 각 API의 **Try it out**으로 파일을 업로드합니다. 순수 텍스트 추출은 키 없이 가능하고, AI 분석은 `.env`에 키가 있어야 합니다. 키를 채팅·Git에 올리지 않습니다. 기본 모델은 `gpt-4.1-mini`이며 `OPENAI_MODEL`로 변경할 수 있습니다.

```bash
curl -X POST http://127.0.0.1:8000/documents/extract \
  -F 'file=@/absolute/path/sample.pdf'
```

응답 예시:

```json
{
  "fileName": "sample.pdf",
  "pageCount": 1,
  "status": "extracted",
  "pages": [{"page": 1, "text": "프로젝트 활동 내용", "needsOcr": false}]
}
```

## AI 분석 실행

```bash
curl -X POST http://127.0.0.1:8000/analyses \
  -H 'Idempotency-Key: example-request-1' \
  -F 'files=@/absolute/path/sample.pdf' \
  -F 'mode=resume' \
  -F 'targetJob=백엔드 개발자'
```

`202` 응답의 `jobId`로 `GET /jobs/{jobId}`를 2초 폴링합니다. `SUCCEEDED` 또는 `PARTIAL_FAILED`이면 `analysisId`로 결과를 조회합니다. `FAILED`이면 `error`와 파일별 오류를 확인합니다. 같은 키로 재전송하면 기존 작업을 반환하며 새 분석은 새 키로 요청합니다.

LLM 공통 모듈은 OpenAI Responses Structured Outputs와 Pydantic을 사용합니다. 타임아웃·일시적 API 오류·잘못된 JSON 응답을 제한 횟수 재시도합니다. 모델·토큰 사용량을 기록하고, 요율을 설정한 경우 캐시 할인 전 예상 비용을 기록합니다. 원문과 키는 로그에 기록하지 않으며, OpenAI 요청에는 `store=false`를 사용합니다. 이것이 외부 사업자의 모든 보관 정책을 대체하는 것은 아닙니다.

## 공고 분석 실행

```bash
curl -X POST http://127.0.0.1:8000/job-postings/analyze \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: posting-example-1' \
  -d '{"text":"STACK에서 Python 백엔드 개발자를 모집합니다. 자소서: 지원 동기를 작성하세요. (500자 이내, 공백 포함)"}'
```

`202` 응답의 `jobId`로 기존 Job API를 폴링한 뒤, `postingId`로 공고 결과를 조회합니다. 기업·직무·요구 역량·자소서 문항·분량 제한과 원문 인용을 반환합니다. 없는 정보는 `null`/빈 배열로 유지하고, 문항이 없으면 `needsManualQuestions=true`입니다. 분량 단위(글자/바이트/단어)와 공백 포함 여부를 구분합니다. URL 크롤링·공고 DB 저장은 수행하지 않습니다.

## B 없이 실행하는 커리어 기능

실행 가능한 예시 입력은 [examples](examples/README.md), 요청·응답 규격은 [독립 API 명세](docs/INDEPENDENT_API.md)를 참고합니다.

| 기능 | API |
|---|---|
| 경험 추천 (태그 기반, 키 불필요) | `POST /cover-letters/recommended-experiences`, `POST /portfolios/recommended-experiences` |
| 경험 추천 (LLM 근거 기반) | 위 경로 뒤 `/semantic` |
| 자소서 생성 | `POST /cover-letters/generate` |
| 특정 문항 재생성 | `POST /cover-letters/answers/{questionId}/regenerate` |
| 슬라이드 구성·내용 생성 | `POST /portfolios/outline`, `POST /portfolios/generate` |
| 태그 기반 적합도·역량 진단 | `POST /experiences/fit`, `POST /competency-map/diagnose` |
| LLM 경험 근거 기반 진단 | `POST /competency-map/diagnose/semantic` |
| 생성 결과 조회 | `GET /ai-results/{taskId}` |
| 분석 결과 수정·이력 | `PATCH /analyses/{id}/result`, `GET /analyses/{id}/versions` |
| 다른 모드 재분석 | `POST /analyses/{id}/remode` |
| 마스터 경험 저장용 DTO | `GET /analyses/{id}/experience-export` |
| AI 작업 데이터 내보내기·삭제 | `POST /ai-data/export`, `POST /ai-data/delete` |

생성 API는 `202 {jobId, taskId, status}`를 반환합니다. Job 폴링/SSE 이후 `GET /ai-results/{taskId}`로 결과를 조회합니다. 동기 태그 계산 API는 즉시 JSON을 반환합니다. 자료 부족은 역량 부족으로 단정하지 않으며, 진단 기준은 호출자가 출처·버전과 함께 제공해야 합니다.

AI 데이터 내보내기·삭제는 `{ "jobIds": ["실제 작업 ID"] }`를 받습니다(1~20개). 내보내기에는 결과·출처·수정 이력과 선택적 이미지가 포함됩니다. 삭제는 완료/실패 작업만 가능하며 대기/실행 중인 작업이 섞이면 전체 요청을 409로 거절합니다. B가 사용자 소유권을 확인한 작업 ID 목록을 전달해야 하며, 현재 A가 사용자 소유권을 검사하는 API는 아닙니다. 상세 정책은 [독립 API 명세](docs/INDEPENDENT_API.md)의 데이터 관리 항목을 참고합니다.

## 현재 지원 범위와 제한

- 순수 추출은 파일 1개, 분석 작업은 최대 5개이며 각각 최대 20MiB입니다.
- PDF·DOCX·PPTX·PNG·JPG·JPEG·WEBP를 지원합니다. 문서당 최대 200페이지/슬라이드/블록, OOXML 압축 해제 최대 100MiB입니다.
- 위치 번호는 1부터 시작합니다. DOCX는 실제 페이지 대신 문단/표 블록 번호, PPTX는 슬라이드 번호를 사용합니다.
- 순수 추출에서 텍스트가 없으면 `needsOcr: true`입니다. 전체 추출은 `extracted`, 일부만 있으면 `partial`, 전부 없으면 `needs_ocr`입니다.
- 분석 작업에서는 이미지와 PDF의 텍스트 없는 페이지에 OpenAI Vision OCR을 적용합니다. 기본 최대 파일당 10페이지, `OCR_ENABLED=false`로 끌 수 있습니다. 이미지 내용이 외부 AI에 전달되고 추가 사용량이 발생합니다.
- PDF·DOCX·PPTX의 포함 이미지 추출과 OCR을 지원합니다. 기본 파일당 OCR 10회 한도 내에서 PDF 페이지 OCR 후 포함 이미지 OCR을 수행합니다. 이미지 추출은 파일당 최대 20개/10MiB, 개별 2MiB, 분석 전체 10MiB이며 제한·실패는 경고로 표시합니다. PNG로 정규화하며 원본 그대로의 바이너리 보존은 아닙니다.
- 암호화·손상·빈 파일은 오류로 반환합니다.
- 실행 큐는 제한된 스레드 풀입니다. 기본 동시 처리 2개, 실행+대기 최대 4개, 결과 최대 100건/유효 기간 1시간입니다. 작업 상태·결과·추출 텍스트·이미지·수정 이력은 로컬 SQLite(`JOB_STORE_PATH`, 기본 `data/jobs.sqlite3`)에 저장합니다. 빈 경로로 설정하면 메모리 모드입니다.
- 완료 결과는 재시작 후 조회 가능합니다. 중단된 대기/실행 작업은 `WORKER_RESTARTED` 실패 상태로 복구하며, 비용 중복을 막기 위해 자동으로 AI를 재호출하지 않습니다. 재시도는 새 요청 키로 합니다. 만료 정리는 조회/작업 생성/시작 시 수행합니다.
- 문서·공고 작업은 큐와 보관 한도를 공유합니다. Job 응답의 `kind`로 작업을 구분하고, 해당 작업의 `analysisId` 또는 `postingId`로 결과를 조회합니다.
- `uvicorn --workers`는 **1개만** 사용합니다. SQLite 파일을 여러 앱 프로세스가 공유하면 안 됩니다. 다중 서버/분산 워커는 Redis/Celery 등 별도 작업 큐·공유 저장소가 필요합니다.
- 업로드 원본은 작업 후 보유하지 않지만, 추출 텍스트·인용문·이미지와 사용자 수정값은 로컬 작업 DB에 보관합니다. `data/`는 Git에서 제외됩니다. 서비스 운영 시 B의 사용자별 소유권·탈퇴 삭제·백업 보관 정책과 연결해야 합니다.
- 인증 없는 로컬 개발용 API입니다. B와 연결 시 인증/소유권을 확인한 파일 ID를 받는 인터페이스를 합의합니다.
- HWP/HWPX·구형 PPT/DOC는 선택적 `DOCUMENT_CONVERTER`(LibreOffice `soffice` 실행 경로)를 통해 PDF 변환 후 처리합니다. 미설정 시 명확한 오류를 반환합니다. 설치된 필터가 지원하는 형식만 가능하며, 특히 HWP 버전별 지원과 실제 변환 품질은 별도 검증이 필요합니다. 실패하면 직접 PDF로 변환해 업로드합니다.
- 인용문·숫자 검증으로 근거 없는 값을 제거하지만 사실의 의미적 정확도를 모두 보장하지는 않습니다. 특히 OCR 결과는 사용자 확인이 필요합니다.
- 현재 FE의 숫자 필수 타입과 달리 포트폴리오 `role.contribution`은 근거가 없으면 `null`입니다. API 경로·비동기 연동 방식·해당 타입을 FE와 합의해야 합니다.

오류는 임시로 `{"error": {"code": "...", "message": "..."}}` 형식이며 B의 규격에 맞춰 조정합니다.

## 코드 구조

```text
app/
  main.py                  # 앱·워커 수명주기·오류 처리
  config.py                # .env 설정
  prompts.py               # 모드별 분석 규칙
  api/                     # 문서·분석·작업 조회 API
  schemas/                 # 입력/결과·근거·Job 모델
  services/
    extraction.py          # PDF 텍스트 추출
    documents.py           # DOCX/PPTX/이미지·OCR
    llm.py                 # OpenAI 스키마 호출·재시도·사용량
    analysis.py            # 모드별 결과·인용 근거 검증
    job_posting.py         # 공고 정보·문항·분량 제한 추출과 검증
    jobs.py                # 제한된 작업 큐·상태·결과 관리
    job_store.py           # 로컬 SQLite 상태·결과 저장
    career.py              # 추천·자소서·슬라이드·역량 진단
    assets.py              # 포함 이미지 추출
tests/
  ...                      # 파싱·모드·Job·OpenAI SDK HTTP 모의 테스트
```

## 테스트

`tests/`는 사용자 요청으로 Git 추적에서 제외되어 있습니다. 아래 명령은 로컬 테스트 폴더가 있을 때 실행합니다.

```bash
python -m pytest
```

외부 AI 호출은 테스트에서 모의 응답으로 대체합니다. 테스트 통과가 실제 API 키·모델 접근 권한·한국어 분석 품질 검증을 의미하지는 않습니다.

## 다음 구현 및 팀 합의

1. B·FE와 경험 JSON, 파일 접근 방식, Job 상태/오류 형식 합의.
2. 로컬 API 키 설정 후 실제 샘플로 모델 응답·OCR 품질 검증.
3. 수정 결과 DTO를 B의 마스터 경험 저장과 연결하고 사용자 삭제·보관 정책 구현.
4. B의 인증·스토리지·서류 프로젝트·PDF/PPTX 렌더링, FE 연동. 운영 환경의 분산 큐는 별도 결정.

요청·응답 및 FE 연결 방법: [docs/API_SPEC.md](docs/API_SPEC.md).

참고: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [이미지 입력](https://developers.openai.com/api/docs/guides/images-vision), [FastAPI 파일 업로드](https://fastapi.tiangolo.com/tutorial/request-files/), [pypdf 텍스트 추출](https://pypdf.readthedocs.io/en/stable/user/extract-text.html).

---

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
