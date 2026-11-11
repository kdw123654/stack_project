# 프론트 API 연동 재점검

> 2200574 기준 기록입니다. 이후 추가된 저장·내보내기·URL 수집 API의 연동 상태는 [연동 현황](INTEGRATION_GAPS.md)을 참고하세요.

검토 기준: `STACK_BE` 커밋 `22005747d66c2cf2d11431c917bdcad3655c38db`.
이번 확인에서 `git fetch origin STACK_BE`의 FETCH_HEAD와 origin/STACK_BE가 동일함을 확인했습니다.
사용자가 첨부한 백엔드 README와 Backend A API 초안은 보관한 두 문서와 SHA-256이 동일합니다.
추가로 백엔드의 INDEPENDENT_API.md, 라우터, Pydantic 모델, 응답 생성 함수, B 렌더러를 대조했습니다.
OpenAI Structured Outputs / FastAPI UploadFile / pypdf 링크는 구현 참고 자료이며 이 프로젝트의 라우터·저장 인터페이스를 대체하지 않습니다.

## 요청·응답 대조 결과

| 기능 | 현재 코드의 계약 | 확인한 백엔드 소스 | 판정 |
|---|---|---|---|
| 파일 분석 | multipart files/mode/memo/targetJob, Idempotency-Key, 202 Job, result.data | app/api/analyses.py, schemas/analysis.py | 기본 계약 일치 |
| 모드 변경 | POST /analyses/{id}/remode, JSON mode/memo/targetJob | app/api/analyses.py, RemodeRequest | 일치 |
| 상태 조회 | 2초 폴링, 종료 상태 처리, stage 표시 | JobView, app/api/analyses.py | 일치; SSE는 사용하지 않음 |
| 공고 분석 | JSON text, data 추출, nullable 기업/직무/분량, 단위·공백 규칙 | app/api/job_postings.py, schemas/job_posting.py | 기본 계약 일치 |
| 경험 추천 | 엄격한 posting/experiences DTO, 동기 items 매핑 | app/api/career.py, schemas/career.py, services/career.py | 태그 기반 API 연결; semantic 미연결 |
| 자소서 | questionExperienceIds, 비동기 taskId → ai-results, questionId 매핑 | DraftRequest, TaskResult, generate_cover | 기본 계약 일치 |
| 문항 재생성 | previousText/instructions, 성공 후 해당 문항만 교체 | RegenerateRequest, generate_cover | 기본 계약 일치 |
| 슬라이드 | size 6/10/14, outline id/type/title/sourceExperienceIds, corePhrases/metrics/layout | OutlineRequest, PortfolioRequest, generate_portfolio | 생성 계약 일치; 이미지/차트 표시 확장 필요 |
| 로그인·가입 | B /api/v1/auth 경로, studentId/password, email/code, accessToken/refreshToken | server/app/routers/auth.py | 기본 계약 일치 |
| 토큰·공통 응답 | Bearer, 401 갱신 1회, success/data/error | B deps.py/common.py/auth.py | 기본 계약 일치 |
| 경험 CRUD | B period 객체, skills/role/achievements/sourceFileId/portfolio, 페이지 조회 | B experiences.py, services/experiences.py | 요청 구조 일치; FE 추가 필드는 portfolio.frontend에 보존 |
| 파일 보관·재사용 | B multipart files → files[], fileId → 서명 URL → 원본 다운로드 | B files.py | 기본 계약 일치; WEBP 원본 보관은 B 미지원 |
| 탐색·통계·선배 Q&A | B 목록·상세·질문 content, 학교 전체 통계만 사용 | B explore.py | 사용 중인 경로/필드 일치 |
| 진단·선배 비교 | A 기준 출처·버전·minimumEvidence 및 경험, B comparison | A DiagnosisRequest/diagnose, B competency.py | 사용자 입력 기준으로 동작; 공식 기준 자동 제공 아님 |
| 설정 | B consents/verification/policies/data-export/DELETE users/me | B users.py | 사용 중인 경로/필드 일치 |

## 이번 재점검에서 수정한 불일치

- 단어 수: B와 무관한 A count_text는 words일 때 includesSpaces=false여도 단어 경계를 유지합니다. FE의 공백 제거 후 계산을 원문 기준 계산으로 수정했습니다.
- 생성 진행 화면: 예시 문항별 단계와 임의 진행률을 제거하고 대기/생성/검증의 서버 단계로 매핑했습니다.
- Job ID의 비해당 값이 null일 수 있어 TS 타입에도 null을 명시했습니다.

## 아직 완료되지 않은 부분과 담당

### 백엔드 인터페이스·팀 합의 필요

1. **공고·자소서·포트폴리오 최초 서버 저장**: B save_posting/update_cl/update_pf는 Python 내부 함수이며 HTTP 최초 저장 경로가 없습니다. A 임시 ID와 B DB ID 매핑, 응답 및 소유권 계약이 필요합니다.
2. **PDF/PPTX 내보내기**: B export 라우터와 렌더러는 존재합니다. 위 생성 결과 저장 연결과 A/B 슬라이드 필드 변환(body/layout/slideNo 등)이 먼저 필요합니다. PDF에는 서버의 LibreOffice/SOFFICE_PATH 설정도 필요합니다.
3. **URL 공고 수집**: 크롤러는 내부 구현만 있고 URL→본문을 반환하는 라우터가 없습니다.
4. **한 장만 AI 재생성**: 현재 API는 6/10/14장 전체 생성만 허용합니다. 직접 한 장을 요청하는 계약은 없습니다.
5. **운영용 A 인증·소유권·보관**: B를 통한 인증 라우팅과 A 작업·이미지의 영구 저장/탈퇴 삭제 연계가 필요합니다. B 탈퇴/데이터 내보내기 API만으로 A의 캐시나 기기 저장 초안까지 처리되는 것은 아닙니다.

### API가 존재하나 프론트에서 아직 연결하지 않은 부분

아래를 백엔드 명세 부족 때문이라고 설명하면 부정확합니다. 화면·흐름 추가 작업입니다.

- 분석 수정 PATCH/버전 이력/experience-export: 현재 결과 편집은 화면과 B에 저장할 객체에 반영되며 A의 USER_CONFIRMED 이력에는 반영하지 않습니다.
- A ai-data/export 및 ai-data/delete: 현재 B 데이터 내보내기와 별개입니다. 사용자 소유 jobId를 확인하는 B 연계도 필요합니다.
- 의미 기반(semantic) 추천·진단: 현재 태그 기반 API를 사용합니다.
- 생성 슬라이드 imageIds/원문 인용·chartData를 활용한 상세 미리보기, 선택 이미지 교체: 현재 텍스트와 지표 중심이고 이미지 영역은 예시 도형입니다. **로컬 이미지 선택에 전용 백엔드 API가 반드시 필요한 것은 아닙니다.** 실제 URL 매핑·선택 UI·저장 처리와 영구 보관 설계가 남았습니다.
- B 저장 프로젝트 목록·편집, 파일 삭제 UI, 내 질문/답변 목록, 홈 추천 프로그램, 탐색 공고를 서류 흐름에 바로 전달하기, 선배 외부 링크 등 부가 경로.
- 학과·학년 수정/학교 포털 자동 연계: 현재는 DB 프로필 조회이며 실제 학교 포털 자동 연결은 구현되어 있지 않습니다.
- 자유 입력 경험 기간은 portfolio.frontend.period에 보존합니다. B의 period.start/end에 구조화하여 입력/수정하는 UI는 별도입니다.

SSE는 미연결이지만 명세가 허용한 2초 폴링으로 대체하므로 분석 사용에 필수인 미완료 항목은 아닙니다. A 별도 /documents/extract도 현재 통합 분석 업로드 흐름에서 호출하지 않습니다.

### 실행 확인 필요

- 실제 A/B 실행 주소와 서버 환경 변수, Supabase 스키마·저장소·인증 메일 설정.
- 배포 리버스 프록시/CORS. Vite server.proxy는 개발 서버에서만 적용됩니다.
- 실제 파일/AI/OCR/권한/서명 URL/PDF 변환 동작과 화면 QA. 모의 HTTP 테스트와 TS 빌드가 이를 보장하지 않습니다.

## 검증의 범위

명세/코드 정적 대조, 프론트 모의 HTTP 테스트, TypeScript 검사 및 Vite 빌드를 수행합니다.
실제 백엔드를 실행하거나 외부 AI에 문서를 전송하지 않았습니다. 따라서 이 문서의 '계약 일치'는 실제 통신 완료·배포 완료를 뜻하지 않습니다.
