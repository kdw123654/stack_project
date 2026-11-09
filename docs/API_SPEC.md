# Backend A API 초안

로컬 개발용 경로입니다. FE README의 예상 경로 및 B 서버의 최종 명세와 합의 전이며, 현재 FE 코드에 직접 연결된 상태는 아닙니다.

## POST /analyses

`multipart/form-data`로 문서를 받아 `202 Accepted`를 반환합니다. 본문 업로드는 완료한 뒤 분석 작업을 큐에 넣습니다.

| 필드 | 내용 |
|---|---|
| files | 파일 1~5개, 각각 최대 20MiB |
| mode | resume / specup / portfolio |
| memo | 선택, 최대 300자 |
| targetJob | 선택, 최대 100자. 미입력 시 직무 대비 보완 제안 생략 |
| Idempotency-Key 헤더 | 선택, 1~128자. 같은 키·같은 입력은 기존 작업 반환, 다른 입력은 409 |

```bash
curl -X POST http://127.0.0.1:8000/analyses \
  -H 'Idempotency-Key: my-first-analysis' \
  -F 'files=@/absolute/path/sample.pdf' \
  -F 'mode=resume' \
  -F 'memo=제가 맡은 역할을 중심으로 정리해 주세요'
```

```json
{"jobId":"UUID", "analysisId":"UUID", "status":"QUEUED"}
```

`Location` 헤더에 `/jobs/{jobId}`를 반환합니다. 키가 없으면 작업 생성 전 503 `LLM_NOT_CONFIGURED`를 반환합니다. 큐가 가득 차면 503 `QUEUE_FULL`입니다. 업로드 개수·용량·입력 형식 오류는 즉시 반환하고, 문서 파싱 오류는 파일별 작업 상태에 기록합니다.

## GET /jobs/{jobId}

2초 간격으로 조회합니다. `status`와 `stage`는 실제 작업 상태이며 임의 퍼센트 진행률을 만들지 않습니다.

- 상태: `QUEUED` → `RUNNING` → `SUCCEEDED` / `PARTIAL_FAILED` / `FAILED`
- 단계: `queued` → `extracting` → `analyzing` → `validating` → `completed` 또는 `failed`
- `files`: 파일별 추출 결과, 오류, 미해결 페이지와 OCR 수행 페이지
- `error`: 전체 작업 실패 원인. 일부 파일만 실패하면 성공 파일을 분석하고 `PARTIAL_FAILED`를 반환합니다.
- `kind`: 문서 분석은 `analysis`, 공고 분석은 `job_posting`, 커리어 생성 작업은 각 작업 종류를 반환합니다. 문서 작업에는 `analysisId`, 공고 작업에는 `postingId`, 커리어 작업에는 `taskId`가 있고 다른 ID는 `null`입니다.

종료 상태가 되면 폴링을 멈춥니다. 일부 페이지를 읽지 못했어도 읽은 내용이 있으면 부분 결과를 제공합니다. 모든 파일에서 텍스트 추출에 실패하거나 최종 LLM 분석이 실패하면 `FAILED`입니다.

## GET /analyses/{analysisId}

```json
{
  "analysisId": "UUID",
  "jobId": "UUID",
  "result": {
    "mode": "resume",
    "data": {
      "summary": "원문을 근거로 한 요약",
      "sections": [{"key":"role", "label":"역할", "value":"", "needsCheck":true, "long":false}],
      "skills": []
    }
  },
  "evidence": {
    "summary": {"value": null, "needsCheck": true, "sources": []},
    "sections": [], "skills": [], "owned": [], "gaps": []
  },
  "files": [],
  "warnings": []
}
```

위 응답은 형태 설명용입니다. 실제 값은 입력 자료와 모델 출력에 따라 달라집니다.

- `result.data`: FE 표시용 결과. `mode`별 구조는 OpenAPI `/docs` 참고.
- `evidence`: 필드별 값·검토 여부·원문 인용. `{fileId, page, quote}`로 파일별 위치를 찾습니다.
- `files[].unit`: PDF는 `page`, PPTX는 `slide`, DOCX는 `block`, 이미지는 `image`. DOCX 블록 번호를 실제 페이지 번호로 표시하면 안 됩니다.
- 값이나 숫자의 인용 근거가 없으면 해당 값은 비우고 확인 필요로 표시합니다. 인용문 일치·숫자 검증은 의미적으로 모든 환각을 차단하는 검증은 아니므로 사용자 검토가 필요합니다.
- OCR 인용 필드는 항상 확인 필요로 표시합니다. OCR 자체의 글자 인식 정확도는 별도 검토 대상입니다.
- 포트폴리오의 `role.contribution`은 근거가 없으면 `null`입니다. 기존 FE `number` 타입을 `number | null`로 합의해야 합니다.
- `assets`에 추출 이미지 메타데이터를 반환합니다. 포트폴리오 `images[].url`은 `GET /analyses/{id}/assets/{assetId}`로 조회할 수 있는 PNG 경로입니다. 이미지가 없으면 빈 배열입니다.
- 결과 준비 전/실패는 409, 없는 ID 또는 만료된 결과는 404입니다. 실패 사유는 Job API에서 확인합니다.

## GET /health / POST /documents/extract

기존 상태 조회·순수 문서 추출 API입니다. `/documents/extract`의 파일 필드명은 단수 `file`입니다. 외부 AI를 호출하지 않고, 이미지와 텍스트 없는 페이지는 `needsOcr: true`로 표시합니다.

## POST /job-postings/analyze

JP-02: 채용공고 본문에서 기업·직무·요구 역량·자소서 문항·문항별 분량 제한을 추출합니다. JSON 본문으로 `text`만 받으며 URL 크롤링은 수행하지 않습니다.

```bash
curl -X POST http://127.0.0.1:8000/job-postings/analyze \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: posting-example-1' \
  -d '{"text":"STACK에서 Python 백엔드 개발자를 모집합니다. 자소서: 지원 동기를 작성하세요. (500자 이내, 공백 포함)"}'
```

`text`는 앞뒤 공백 제거 후 비어 있으면 안 됩니다. 최대 80,000자이며, 별도로 직렬화된 입력이 `MAX_CONTEXT_CHARACTERS` 이하여야 합니다. 입력을 임의로 잘라 분석하지 않고 초과 시 422를 반환합니다. URL 단독·잘못된 JSON·빈 본문도 422입니다.

응답은 `202 Accepted`이며 `Location: /jobs/{jobId}`를 반환합니다.

```json
{"jobId":"UUID", "postingId":"UUID", "status":"QUEUED"}
```

기존 `GET /jobs/{jobId}`를 2초 폴링하고 `SUCCEEDED`이면 아래 결과 API를 호출합니다. 키 누락은 503, 큐 포화는 503, 같은 `Idempotency-Key`에 다른 본문을 보내면 409입니다. 요청 키는 문서·공고 작업 전체에서 공유하므로 서로 다른 작업에는 새 키를 사용합니다. 동일 본문의 앞뒤 공백 차이는 동일 요청으로 취급합니다.

공고 작업은 `queued` → `analyzing` → `validating` → `completed`로 진행합니다. LLM 오류는 `FAILED` 및 공통 오류 코드로 노출합니다. 본문에 기업·문항 등이 없다는 사실 자체는 작업 실패가 아니며, 누락 상태를 포함한 성공 결과를 반환합니다.

## GET /job-postings/{postingId}/analysis

A 서버의 임시 공고 분석 결과를 조회합니다. B 담당인 영구 저장 공고 조회 `GET /job-postings/{id}`와 구분한 경로입니다. 현재 `postingId`는 A가 발급한 임시 분석 식별자이며, B의 DB 공고 ID와 매핑하는 작업은 후속 합의가 필요합니다.

결과는 `postingId`, `jobId`, `data`, `evidence`, `missingFields`, `needsManualQuestions`, `warnings`를 포함합니다. 아래는 위 입력의 **`data` 예시**입니다. 실제 응답은 모델 추출 결과와 근거 검증에 따라 달라집니다.

```json
{
  "company": "STACK",
  "job": "백엔드 개발자",
  "skills": ["Python"],
  "questions": [
    {
      "id": "q1",
      "no": 1,
      "title": "지원 동기를 작성하세요.",
      "limit": 500,
      "countUnit": "characters",
      "includesSpaces": true,
      "needsCheck": false
    }
  ]
}
```

- 기업·직무 미검출은 `null`, 역량·문항 미검출은 빈 배열입니다.
- 문항이 없으면 `needsManualQuestions=true`로 반환하며, 기본 문항을 임의 생성하지 않습니다.
- 제한을 못 찾으면 `limit=null`, `countUnit=unknown`, `includesSpaces=null`, `needsCheck=true`입니다. 임의의 500자 기본값을 넣지 않습니다.
- `countUnit`은 `characters`, `bytes`, `words`, `unknown`입니다. 바이트 제한을 글자 수로 바꾸지 않습니다.
- 공백 포함·제외는 원문에 명시된 경우에만 반환합니다. 불명확하면 `null`이며 확인 필요로 표시합니다.
- `evidence`의 각 사실 값에는 `value`, `needsCheck`, `sources`(원문 인용문 배열)가 있습니다. 회사·직무·역량·문항 제목은 인용문 안에 있는 표현만 유지하고, 숫자와 분량 단위도 원문에서 함께 확인합니다.
- 잘못된 인용이나 숫자는 제거하고 `warnings`에 필드 경로와 사유를 반환합니다. 이 검증은 문항과 제한의 의미적 연결까지 완전히 보장하지 않으므로 사용자 검토가 필요합니다.
- `missingFields`에는 `company`, `job`, `skills`, `questions`, `questions.0.limit`처럼 누락된 필드 경로를 표시합니다.
- `q1`, `q2`는 분석 결과 내에서 원문 순서로 부여한 임시 문항 ID입니다.
- 준비 전에는 409 `POSTING_ANALYSIS_NOT_READY`, 실패한 작업은 409 `POSTING_ANALYSIS_FAILED`, 없는/만료된 결과는 404 `POSTING_ANALYSIS_NOT_FOUND`입니다.

공고 결과도 문서 작업과 동일한 큐·용량·보관 시간을 공유합니다. 기본 로컬 SQLite 모드에서는 재시작 후 완료 결과를 조회할 수 있습니다. 이 저장소는 B의 영구 공고 DB와 다릅니다. `JOB_STORE_PATH`가 빈 문자열인 메모리 모드에서는 재시작 시 사라집니다.

### 공고 FE 연결

`parsePosting`이 본문 텍스트를 이 API로 보내고, 상태를 폴링한 후 결과의 `data`를 사용하도록 변경해야 합니다. 기존 FE는 기업·직무가 문자열, 문항 제한이 필수 숫자이므로, 실제 미검출 상태를 표시할 수 있도록 해당 필드를 nullable로 합의해야 합니다. URL 입력은 B의 크롤링 결과 본문을 전달받아 분석하거나 텍스트 붙여넣기로 대체합니다.

## FE 연결 순서

1. 기존 `analyzeFiles`에서 `POST /analyses` 호출.
2. `GET /jobs/{jobId}`를 2초 폴링하며 `stage`를 진행 화면에 반영.
3. 성공 또는 부분 성공 시 `GET /analyses/{analysisId}` 호출.
4. `result.data`를 기존 모드별 결과 UI로 전달하고, 부분 실패·확인 필요 항목도 표시.

기존 FE의 모의 `onStep` 증가를 서버 단계 기반 처리로 교체해야 합니다. 아직 CORS 설정·인증 연동은 포함되어 있지 않습니다. B를 통한 라우팅과 직접 브라우저 연결 방식은 합의가 필요합니다.

## B와 합의할 후속 인터페이스

- 인증·파일 소유권 확인 후 fileId/스토리지 접근 권한 전달.
- 분석 결과·검토 결과를 마스터 경험으로 저장할 DTO와 함수.
- 공통 오류 규격 및 최종 URL 경로.
- 운영 환경의 분산 작업 큐·공유 저장소와 사용자별 삭제·보관 정책. 개발용 상태/결과는 로컬 SQLite에 저장합니다.
- 수정·버전 이력·재분석·저장용 DTO 내보내기는 구현되어 있습니다. 실제 마스터 경험 저장은 B의 저장 함수와 연결해야 합니다.
- AI 작업 데이터의 내보내기·삭제는 `POST /ai-data/export`, `POST /ai-data/delete`에 구현되어 있습니다. B가 사용자 소유권을 확인한 jobId 목록을 전달하도록 연결해야 합니다.

커리어 생성·역량 진단·분석 수정·이미지·SSE 상세: [독립 API 명세](INDEPENDENT_API.md).
