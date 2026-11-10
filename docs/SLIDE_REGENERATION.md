# 슬라이드 한 장 재생성

## A: POST /portfolios/slides/{slideId}/regenerate

전체 슬라이드를 다시 생성하지 않고 한 장의 새 초안을 비동기로 생성합니다.

```json
{
  "posting": {"company": "회사", "job": "백엔드", "skills": [], "questions": []},
  "experiences": [],
  "slide": {"id": "s2", "type": "프로젝트", "title": "프로젝트", "sourceExperienceIds": ["B 경험 ID"]},
  "previousSlide": {"id": "s2", "title": "기존 제목"},
  "instructions": "근거를 유지하면서 간결하게"
}
```

`experiences`에는 실제 선택 경험 전체를 넣습니다. 빈 배열은 실제 요청에서 허용하지 않습니다. `slide`는 구성안 한 장이며 URL ID, `slide.id`, `previousSlide.id`가 같아야 합니다. `previousSlide`는 기존 저장 초안을 넣습니다. 새 초안은 선택 경험의 원문·수치·이미지 ID를 검증하며 이전 초안을 사실 근거로 사용하지 않습니다.

`202 {jobId,taskId,status}`를 받고 기존 `GET /jobs/{jobId}`를 폴링합니다. 성공 후 `GET /ai-results/{taskId}`의 `data`는 `{slide,previousSlide,replacementApplied:false}`입니다. 실패하면 기존 초안과 다른 작업 결과를 덮어쓰지 않습니다. 기존 `Idempotency-Key`를 지원합니다.

## B: PUT /api/v1/portfolios/{id}/slides/{slideNo}/generated

사용자가 새 초안을 적용할 때 로그인 토큰과 아래 본문을 보냅니다.

```json
{
  "sourceTaskId": "A 재생성 taskId",
  "expectedUpdatedAt": "2026-11-10T00:00:00+00:00",
  "slide": {}
}
```

`slide`에는 A 결과의 `data.slide` 전체를 넣습니다. `expectedUpdatedAt`은 최근 B 프로젝트 응답의 `updatedAt`이며 선택 사항입니다. 슬라이드 배열·구성안에서 해당 한 장만 교체하고 선택 경험 ID를 다시 계산하며 기존 출력 캐시를 무효화합니다. 다른 슬라이드는 보존합니다.

프로젝트와 참조 경험의 소유권을 확인합니다. 대상 번호가 없으면 404, 대상 ID가 달라졌거나 버전이 바뀌면 409입니다. 같은 작업·본문 재전송은 `reused:true`로 현재 저장본을 반환하므로 이후 수동 수정을 덮어쓰지 않습니다. 기존 `06_portfolio_slide_import.sql`의 이력 컬럼을 사용합니다.
