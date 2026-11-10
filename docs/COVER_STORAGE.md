# 자소서 생성 결과 → B DB 저장

기존 DB에는 `server/sql/05_cover_answer_import.sql`을 실행합니다. 신규 DB의 `01_schema.sql`에는 이미 포함되어 있습니다.

## 순서

1. 공고 분석 결과를 `POST /api/v1/job-postings`로 저장해 B 공고 ID를 받습니다.
2. `POST /api/v1/cover-letters`에 `{postingId: B공고ID}`를 보내 B 자소서 ID를 받습니다.
3. A에서 자소서 생성 후 Job이 완료되면 `/ai-results/{taskId}`를 조회합니다.
4. 아래 PUT에 `sourceTaskId=A의 taskId`, `answers=A결과의 data.answers`를 전달합니다.

## PUT /api/v1/cover-letters/{id}/answers

```json
{
  "sourceTaskId": "A에서 반환한 taskId",
  "answers": [{
    "questionId": "q1",
    "text": "사용자가 선택한 경험을 바탕으로 생성한 초안",
    "count": 25,
    "countUnit": "characters",
    "includesSpaces": true,
    "limit": 500,
    "needsCheck": true,
    "usedExperiences": [],
    "sentences": [],
    "keywords": []
  }]
}
```

예시는 형식 설명용이며 경험 내용·실제 글자 수를 주장하지 않습니다. 실제로는 A의 원래 `data.answers` 배열을 전달합니다. B는 클라이언트의 count/limit를 신뢰하지 않고 저장된 공고 문항 기준으로 다시 계산합니다.

로그인 토큰이 필요하고, 자소서 프로젝트·공고·참조 경험이 모두 현재 사용자 소유여야 합니다. 모르는 경험은 404이며 본인 경험도 삭제되어 있으면 저장하지 않습니다. `usedExperiences`와 문장 인용의 경험 ID에는 예시 `e1`이 아닌 **실제 B 경험 ID**를 사용해야 합니다.

공고의 현재 문항 ID와 정확히 일치하는 전체 답변을 받습니다. 중복/누락/없는 문항은 422입니다. 이는 배열 전체를 교체하는 PUT이며 한 문항만 전송하면 다른 문항을 조용히 삭제하지 않고 거절합니다.

저장 결과는 `200 {success:true,data:{id,postingId,status:"DRAFT",selections,answers,sourceTaskId,reused,...}}`입니다. 각 답변은 A의 필드와 함께 B 호환 필드를 포함합니다.

- `questionId` → 공고의 해당 `order`를 찾아 `questionOrder` 추가.
- `text` → `content` 추가.
- `charCount`는 공백 포함 Unicode 글자 수로 다시 계산.
- `count`는 문항의 `countUnit`과 `includesSpaces` 기준으로 다시 계산.
- `characters` / UTF-8 `bytes` / 공백 구분 `words`를 구분하고 제한 초과는 422 `ANSWER_TOO_LONG`.
- `aiOriginal`에 최초 전달받은 답변을 보존하고, 경험 인용·키워드를 유지.
- `selections`에는 문항 ID/번호와 연결된 경험 ID를 저장.

같은 프로젝트에 같은 `sourceTaskId`·같은 payload를 재전송하면 현재 B 저장본을 `reused=true`로 반환합니다. 이후 사용자가 수정하거나 SAVED로 전환한 내용도 덮어쓰지 않습니다. 같은 작업 ID에 다른 payload는 409 `IMPORT_CONFLICT`입니다. 새 생성 결과를 적용할 때는 새 A taskId가 필요합니다.

선택 필드 `expectedUpdatedAt`에 B 상세 응답의 시간대 포함 `updatedAt`을 전달하면, 새 결과를 적용하기 전 버전도 확인합니다. 동시에 프로젝트가 바뀌면 409 `VERSION_CONFLICT`이며 자동으로 덮어쓰지 않습니다. 저장 시 DB 갱신에도 user_id와 updated_at 조건을 사용합니다.

기존 `PATCH /api/v1/cover-letters/{id}/answers/{order}`는 그대로 사용합니다. 수정 시 content/text/count를 함께 갱신하고 AI 원문은 보존하며, 현재 문장의 오래된 AI 인용은 제거하고 `USER_CONFIRMED`로 구분합니다. `/save`는 계속 프로젝트 상태를 SAVED로 변경하는 API입니다.

이력 중복 판별은 프로젝트별 최대 250개의 A 작업 ID를 보관합니다. 초과 시 409 `IMPORT_LIMIT`이며 새 프로젝트를 사용해야 합니다. sourceTaskId는 중복 판별용 상관 ID로, A 작업의 소유권을 증명하는 인증 수단은 아닙니다.
