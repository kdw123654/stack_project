# B 없이 실행하는 Backend A API

아래 API는 B의 DB를 조회하지 않고 **요청에 전달된 경험·공고·역량 기준**으로 동작합니다. 인증된 사용자 데이터만 전달하는 책임과 영구 서류 프로젝트 저장은 B와 연결해야 합니다. 현재 경로는 개발용이며 명세의 `{projectId}` 기반 경로는 B 프로젝트가 만들어진 뒤 어댑터로 연결합니다.

## 공통 입력

`posting`은 공고 분석 결과의 `data`입니다. 경험 객체의 필수 필드는 `id`, `title`, `summary`이고 선택 필드는 `role`, `period`, `achievements`, `skills`, `assets`입니다.

```json
{
  "id": "experience-1",
  "title": "예시 프로젝트",
  "summary": "Python API를 개발했습니다.",
  "role": "백엔드 개발",
  "period": "",
  "achievements": [],
  "skills": ["Python"],
  "assets": [{"id": "image-1", "label": "프로젝트 화면"}]
}
```

경험은 최대 100개이고 ID가 중복되면 422입니다. 전체 입력은 `MAX_CONTEXT_CHARACTERS` 이하여야 합니다. 이미지 ID는 경험별로 고유해야 하며 외부 URL을 가져오지 않습니다. `assets`가 없으면 텍스트 중심 결과를 생성합니다.

## 비동기 생성 공통

LLM API는 `202 {jobId, taskId, status}`와 `Location: /jobs/{jobId}`를 반환합니다. `GET /jobs/{jobId}` 또는 SSE로 완료를 확인한 뒤 `GET /ai-results/{taskId}`로 조회합니다.

```json
{
  "taskId": "UUID", "jobId": "UUID", "kind": "cover_generate",
  "data": {}, "needsReview": true
}
```

`data` 구조는 아래 작업별 설명을 참고합니다. 생성 결과는 사용자 검토가 필요합니다. 결과 준비 전/실패는 409, 미존재/만료는 404입니다. `Idempotency-Key`로 동일 요청 중복 생성을 막습니다. 모든 작업 종류가 같은 키 공간과 큐 한도를 공유합니다. 다른 작업이나 새 재생성은 새 키를 사용합니다.

LLM 오류뿐 아니라 근거 인용·숫자·문항·분량 검증 실패도 `FAILED`로 반환합니다. 불완전한 결과를 성공처럼 저장하거나 이전 초안을 덮어쓰지 않습니다. 입력에 없는 수치의 생성을 거부하지만, 의미적 환각을 완전히 검증하는 것은 아니므로 사용자 검토가 필요합니다.

## CL-02 / PF-02: 경험 추천

- `POST /cover-letters/recommended-experiences`
- `POST /portfolios/recommended-experiences`

입력: `{posting, experiences}`. 즉시 `200`을 반환하며 API 키가 필요 없습니다. 공고의 요구 역량과 경험의 스킬 태그를 공백 정규화·대소문자 구분 없이 정확 일치로 비교합니다. 순서는 일치 역량 수, 포트폴리오의 경우 이미지 수와 숫자가 포함된 성과 문장 수를 추가로 사용합니다.

출력 `items[]`: `experienceId`, `fit`, `matchedSkills`, `recommendedQuestionIds`, `reason`, `imageCount`, `metricCount`, `selected`. `metricCount`는 숫자가 포함된 성과 문장 개수이며 검증된 차트 수를 의미하지 않습니다. 문항 추천은 문항 단어가 경험 내용에 포함되는지를 보조 기준으로 사용합니다.

`fit`은 요구 태그 중 50% 이상 일치하면 high, 일부 일치하면 mid, 일치 근거가 없으면 low입니다. 객관적인 지원 적합도 평가가 아닙니다. 경험이나 요구 역량이 없으면 `experiences_required`/`requirements_required` 상태입니다.

### LLM 의미 기반 추천

- `POST /cover-letters/recommended-experiences/semantic`
- `POST /portfolios/recommended-experiences/semantic`

같은 입력으로 비동기 LLM 분석을 실행합니다. 경험 본문과 공고의 관련성을 정성적으로 평가하고 원문 인용을 반환합니다. 존재하지 않는 경험·문항·요구 역량과 잘못된 인용·수치를 거부합니다. 결과의 `method`는 `llm_evidence_match_v1`이며 임의의 퍼센트 점수를 만들지 않습니다.

## CL-03: 자소서 생성

`POST /cover-letters/generate`

입력: `{posting, experiences, questionExperienceIds?}`. 요청의 경험은 사용자가 선택한 경험으로 취급합니다. `questionExperienceIds`는 `{"q1":["experience-1"]}`처럼 문항별로 사용할 경험을 제한합니다. 비어 있으면 모든 전달 경험을 각 문항에 사용할 수 있습니다. 없는 문항/경험을 선택하거나 경험·문항이 없으면 422입니다.

출력 `data.answers[]`에는 다음 필드가 있습니다.

- `questionId`, `text`, `usedExperiences`
- `sentences[]`: 문장과 `{experienceId, quote}` 원문 인용
- `count`, `countUnit`, `includesSpaces`, `limit`
- `keywords[]`: 공고 스킬 문자열이 실제 초안에 포함되는지 표시
- `needsCheck=true`

문항 ID·선택 경험·인용·숫자를 검증합니다. `characters`는 Unicode 코드 포인트 개수, `bytes`는 UTF-8 바이트 수, `words`는 공백으로 구분한 단어 수입니다. 공백 제외가 명시된 경우 whitespace를 제외하고 계산합니다. 공백 규칙이 불명확하면 포함으로 계산하고 원래 `null` 상태를 반환하므로 사용자 확인이 필요합니다. 제한 초과는 `DRAFT_TOO_LONG` 실패로 반환하며 자르거나 조용히 초과를 허용하지 않습니다.

## CL-04: 문항 하나 재생성

`POST /cover-letters/answers/{questionId}/regenerate`

자소서 생성 입력에 `previousText`(기존 사용자 수정본), 선택 `instructions`를 추가합니다. 해당 문항만 새로 생성하고 결과에 기존 문장을 보존합니다. `replacementApplied=false`이며 이전 결과는 수정하지 않습니다. B/FE가 성공 결과를 확인한 뒤 명시적으로 교체합니다. 실패 시 기존 초안과 이전 결과를 보존합니다.

## PF-03: 구성안 생성

`POST /portfolios/outline`

입력: `{posting, experiences, size}`. `size`는 6/10/14이며 기본 10입니다. 출력 `data={size, slides}`입니다. 각 슬라이드는 `id`, `type`, `title`, `sourceExperienceIds`를 포함하며 정확히 요청한 장수를 반환해야 합니다. 원문에 없는 제목 수치·알 수 없는 경험을 거부합니다. 슬라이드 ID는 서버에서 `s1` 순으로 부여합니다.

## PF-04: 슬라이드 내용 생성

`POST /portfolios/generate`

입력: `{posting, experiences, size, outline}`. `outline`은 구성안의 `slides` 배열이며 사용자 정렬·편집 후 전달할 수 있습니다. ID가 고유하고 장수가 맞아야 하며 각 슬라이드에 최소 하나의 근거 경험이 필요합니다.

출력 `data.slides[]`: `id`, `type`, `title`, `sourceExperienceIds`, `sentences`, `corePhrases`, `metrics`, `chartData`, `imageIds`, `layout`.

지표에는 수치·단위·원문 인용을 유지합니다. 차트 데이터는 검증한 지표만 단위별로 묶어 `{type:"bar", unit, labels, values, sources}`로 만듭니다. 이미지는 연결된 경험의 `assets` ID만 사용합니다. 이미지나 지표가 없으면 빈 배열과 텍스트 중심 레이아웃을 반환합니다. PDF/PPTX 파일 렌더링은 B 담당입니다.

## EX-03 / CM-01: 적합도·역량 진단

- `POST /experiences/fit`
- `POST /competency-map/diagnose`

입력: `{targetJob, criteriaVersion, criteriaSource, criteria, experiences}`.

```json
{
  "targetJob": "백엔드 개발자", "criteriaVersion": "team-draft-v1",
  "criteriaSource": "팀이 정의한 예시 기준, 공식 직무 기준 아님",
  "criteria": [{"id":"python", "name":"Python", "aliases":["파이썬"], "minimumEvidence":1}],
  "experiences": []
}
```

API 키 없이 동작합니다. 기준을 임의 생성하지 않으며 출처·버전·직무가 비어 있으면 422입니다. 기준이 없으면 `criteria_required`와 `scorePercent=null`입니다.

역량마다 `held`(서로 다른 경험 근거 수가 minimumEvidence 이상), `experience_exists`(근거는 있으나 선언한 최소 수 미달), `data_insufficient`(자료에서 근거 미확인)로 표시합니다. 자료 부족을 역량 미보유로 단정하지 않습니다. `evidence`에 경험 ID·스킬·인용을 연결하고 확보 개수/필요 개수를 반환합니다.

`experienceFits[].scorePercent`는 **일치한 기준 수 / 전체 제공 기준 수 × 100**의 반올림 값입니다. 취업 확률이나 객관적 경쟁력이 아닌 선언된 기준의 태그 일치율입니다. 기준과 근거 수 기준은 팀의 검토가 필요합니다.

### LLM 경험 근거 진단

`POST /competency-map/diagnose/semantic`: 같은 입력으로 비동기 분석합니다. LLM이 제공된 기준과 경험 본문을 원문 인용으로 연결하고, 검증된 인용과 태그 근거를 합쳐 같은 명시적 개수 산식으로 진단합니다. 새 기준·경험·퍼센트 점수를 AI가 만들지 않습니다.

## AN-06: 분석 결과 수정·이력·저장 준비

`PATCH /analyses/{id}/result`

```json
{"expectedVersion":1,"edits":[{"path":"sections.0","value":"사용자가 확인한 활동명"}]}
```

필드 경로는 `summary`, `sections.N`, `skills.N`, `owned.N.items.M`입니다. 값만 수정하며 필드 구조나 AI 출처를 임의로 교체하지 않습니다. 수정값은 `USER_CONFIRMED`로 기록하고 AI 원본 `aiEvidence`는 그대로 보존합니다. 현재 `evidence`의 해당 값에는 AI 출처를 제거합니다. 원본 인용 없이 확정한 사람의 값과 AI 추출값을 구분하기 위한 처리입니다.

중복 경로·없는 경로는 422, 오래된 버전은 409입니다. 오류가 있는 요청은 전체를 반영하지 않습니다. `version`이 증가하며 `GET /analyses/{id}/versions`로 최대 20개 스냅샷을 조회합니다.

`GET /analyses/{id}/experience-export`: 활동명·기간·역할·성과·스킬·출처·검토값을 B에 넘길 DTO를 반환합니다. `saveStatus=NOT_PERSISTED`는 **마스터 경험 DB에 저장하지 않았다는 뜻**입니다. 로컬 AI 작업 캐시 저장 여부와는 다릅니다. `idempotencyKey={analysisId}:{version}`을 제공합니다. 실제 `/save`는 B의 저장 함수가 정해진 뒤 연결합니다.

## AN-05: 다른 모드 재분석

`POST /analyses/{id}/remode`에 `{mode, memo?, targetJob?}`를 전달합니다. 보관 중인 원본의 추출 텍스트·OCR 결과·이미지를 재사용하고 새 `analysisId`를 만듭니다. 이전 결과·수정 이력은 덮어쓰지 않으며 `sourceAnalysisId`로 연결합니다. 같은 모드로 실행해도 새 결과입니다. 만료된 원본 분석은 404입니다. 원본 바이너리 자체를 재파싱하는 기능은 B의 원본 스토리지와 연결한 뒤 확장해야 합니다.

## FI-03: 이미지·포맷

`GET /analyses/{id}/assets/{assetId}`: PNG 이미지. `assets` 메타데이터의 원본 파일·페이지/슬라이드/블록 위치를 보존합니다. 메모리/로컬 저장소의 유효 기간이 지나면 404입니다.

PDF·DOCX·PPTX의 텍스트·표, 지원되는 PPTX 차트 값과 포함 이미지를 추출합니다. 지원하지 않는 차트·도형·문서 구조는 완전 복원되지 않을 수 있습니다. 포함 이미지 OCR은 `OCR_ENABLED`와 파일당 OCR 횟수 제한을 따르고 원문 OCR 필드는 확인 필요로 표시합니다.

HWP/HWPX/PPT/DOC에는 선택적 LibreOffice 변환 어댑터가 있습니다. `DOCUMENT_CONVERTER`를 실행 파일 경로로 설정해야 하며 설치된 필터가 지원하는 버전만 변환됩니다. 모든 HWP 버전의 지원을 의미하지 않습니다. 미설정·시간 초과·실행 실패·변환 실패는 별도 오류입니다. 파일 경로는 서버 임시 경로로 생성하며 shell을 사용하지 않습니다. 실제 해당 형식 샘플과 설치된 변환기로 검증해야 합니다.

## C-03: SSE·로컬 복구

`GET /jobs/{id}/stream`: `text/event-stream`, `event: job`, `data: JobView` 형식입니다. 종료 상태를 보내고 연결을 닫습니다. 없는 작업은 404이며 스트리밍 중 만료되면 `event: error`를 반환합니다. 폴링도 유지됩니다.

기본 `JOB_STORE_PATH=data/jobs.sqlite3`에 상태·결과·인용·이미지·수정 이력을 저장합니다. 키/환경변수는 저장하지 않습니다. 완료 결과는 재시작 후 복구하고, 중단된 작업은 `WORKER_RESTARTED` 실패로 전환하여 중복 유료 호출을 막습니다. 재시도는 새 키가 필요합니다. 원래 요청의 자동 재실행·분산 워커는 포함하지 않습니다.

원본 바이너리는 영구 보관하지 않습니다. 추출 텍스트와 개인정보가 포함될 수 있는 AI 결과·이미지는 로컬 DB에 보관되므로 운영 시 B의 사용자 소유권·삭제·백업 정책을 연결해야 합니다. 유효 기간은 기본 1시간이며 만료 정리는 요청/앱 시작 시 실행합니다. SQLite의 논리 삭제가 디스크/백업의 즉각적인 물리 삭제를 의미하지 않습니다. 단일 프로세스에서만 사용하고 `data/`는 Git에 올리지 않습니다.

## 아직 외부 연결·검증이 필요한 부분

- 실제 OpenAI 키·모델 접근 권한과 한국어 샘플 품질/비용 검증.
- 실제 HWP/PPT/DOC 샘플·변환기 필터 검증. 현재 환경에 변환기를 설치하지 않았습니다.
- B의 인증·파일 ID/스토리지·마스터 경험·서류 프로젝트·사용자 삭제 정책.
- FE의 nullable 값·비동기 Job·새 응답 DTO 연결.
- 운영 배포의 공유 큐/저장소, PDF/PPTX 실제 렌더링.
