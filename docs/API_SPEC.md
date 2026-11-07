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
- 포트폴리오의 `images`는 현재 빈 배열이며, 원본 이미지 자산 추출·저장은 후속 작업입니다.
- 결과 준비 전/실패는 409, 없는 ID 또는 만료된 결과는 404입니다. 실패 사유는 Job API에서 확인합니다.

## GET /health / POST /documents/extract

기존 상태 조회·순수 문서 추출 API입니다. `/documents/extract`의 파일 필드명은 단수 `file`입니다. 외부 AI를 호출하지 않고, 이미지와 텍스트 없는 페이지는 `needsOcr: true`로 표시합니다.

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
- 현재 메모리 큐를 대체할 영속 작업 큐/결과 저장소와 삭제·보관 정책.
- 수정/저장/다른 모드 재분석 API는 아직 구현하지 않았습니다.
