# 공고 분석 결과 → B DB 저장

## 준비

기존 Supabase DB에는 `server/sql/04_posting_analysis_import.sql`을 실행합니다. 신규 DB는 갱신된 `01_schema.sql`에 해당 필드와 고유 인덱스가 포함되어 있습니다. 실제 DB에 SQL을 적용하는 작업은 코드 배포와 별개입니다.

B 서버의 인증 토큰을 사용합니다. A와 B는 아직 별도 서버입니다. 이 API는 프론트가 받은 A 분석 결과를 B로 전달해 저장하는 경로이며 B가 A를 자동 호출하는 기능은 아닙니다.

## POST /api/v1/job-postings

```json
{
  "sourcePostingId": "A에서 반환한 postingId",
  "sourceType": "TEXT",
  "rawText": "프론트에서 입력한 원래 공고 본문",
  "analysis": {
    "company": "예시 회사",
    "job": "백엔드 개발자",
    "skills": ["Python"],
    "questions": [{"id":"q1","no":1,"title":"지원 동기","limit":500,"countUnit":"characters","includesSpaces":true,"needsCheck":false}]
  },
  "evidence": {},
  "warnings": []
}
```

- `sourcePostingId`: A의 `/job-postings/{id}/analysis` 응답 `postingId`.
- `analysis`: 같은 응답의 `data`.
- `evidence`, `warnings`: A 응답의 동일 필드. 선택이며 기본 빈 객체/배열.
- `rawText`: 원래 공고 본문, 최대 80,000자. 비어 있으면 422.
- `sourceType=URL`인 경우 `url`에 원래 http/https URL도 필요합니다. 이 API가 URL을 수집하지는 않습니다.

성공은 `200 {success:true,data:{postingId,sourcePostingId,position,requiredCompetencies,questions,analysisMetadata,createdAt,reused,...}}`입니다. `postingId`는 **B DB ID**이고 `sourcePostingId`는 **A 임시 분석 ID**입니다.

필드 변환:

| A | B |
|---|---|
| `job` | `position` |
| `skills` | `requiredCompetencies` |
| 문항 `id` | 문항 `id` 그대로 유지 |
| 문항 `no` / `title` / `limit` | `order` / `text` / `charLimit` |
| `countUnit`, `includesSpaces`, `needsCheck` | 그대로 유지 |

이후 자소서·포트폴리오 프로젝트 생성 시 **B의 postingId**를 전달합니다. 같은 사용자의 같은 A 공고 ID는 DB 고유 인덱스로 한 번만 생성합니다. 동일 내용 재요청은 `reused=true`와 현재 B 저장본을 반환하며 사용자 문항 수정을 덮어쓰지 않습니다. 같은 ID에 다른 본문/결과를 보내면 409 `IMPORT_CONFLICT`입니다. 다른 사용자는 같은 문자열의 A ID를 사용해도 서로 다른 B 기록으로 분리됩니다.

A 임시 ID는 인증 토큰이 아닙니다. B는 현재 로그인 사용자의 데이터로 저장하고, 클라이언트가 전송한 결과를 보관합니다. A 작업의 소유권/출처를 서버 간에 직접 검증하는 기능은 아직 포함하지 않습니다.

기존 문항 수정 API는 `id`, `countUnit`, `includesSpaces`, `needsCheck`도 보존합니다. 문항을 재정렬할 때 **id를 유지**하고 번호만 바꿔야 생성 답변과 연결됩니다. 예전 B 문항에 ID가 없으면 조회 시 `q{order}`로 보완합니다. 번호/ID 중복은 422입니다.
