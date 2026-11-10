# 포트폴리오 생성 결과 → B DB 저장

기존 DB에는 `server/sql/06_portfolio_slide_import.sql`을 실행합니다. 신규 DB의 `01_schema.sql`에는 이미 포함되어 있습니다.

## PUT /api/v1/portfolios/{id}/slides

먼저 저장한 **B 공고 ID**로 `POST /api/v1/portfolios`를 호출해 프로젝트를 만듭니다. `length`는 `SHORT_6`, `BASIC_10`, `DETAIL_14`, `format`은 `PDF` 또는 `PPTX`입니다.

A 생성 완료 후 `GET /ai-results/{taskId}`의 `data`에 `sourceTaskId`를 추가해 아래 형태로 전달합니다.

```json
{
  "sourceTaskId": "A에서 반환한 taskId",
  "size": 6,
  "slides": []
}
```

`slides`에는 A가 만든 **실제 전체 배열**을 넣습니다. 위 빈 배열은 형태 설명이며 실제 요청은 6/10/14장의 슬라이드가 필요합니다. 각 슬라이드의 `id`, `type`, `title`, `sourceExperienceIds`, `sentences`, `corePhrases`, `metrics`, `chartData`, `imageIds`, `layout`을 받습니다. 프로젝트 분량과 다른 장수·중복 슬라이드 ID는 422입니다.

로그인 토큰이 필요합니다. 프로젝트와 참조 경험은 본인 소유여야 하며, 각 슬라이드의 문장·지표 인용은 해당 슬라이드의 `sourceExperienceIds`에 포함되어야 합니다. 선택 경험 ID에는 실제 B 경험 ID를 사용합니다.

성공은 `200 {success:true,data:{id,postingId,length,format,experienceIds,outline,slides,sourceTaskId,reused,...}}`입니다. 슬라이드·구성안·선택 경험 ID를 같은 DB 갱신으로 저장하고 이전 `export_path`는 무효화합니다.

변환 규칙:

- A `id` 보존, 배열 순서에 따라 `slideNo=1..N` 부여.
- `표지` → `COVER`, `마무리` → `CLOSING`, 지표가 있으면 `RESULT_WITH_CHART`, 나머지 `PROJECT`.
- A의 레이아웃 표시는 `aiLayout`에 보존.
- `sentences[].text`를 줄바꿈으로 합쳐 `body` 생성. 문장이 없으면 `corePhrases` 사용.
- 지표 수치와 단위를 합쳐 B 렌더러용 `value` 생성(예: `30` + `%` → `30%`). 숫자 원본은 `numericValue`, 인용과 단위도 유지.
- `chartData`, `imageIds`, 문장별 인용, `aiOriginal`(최초 전달본) 보존.
- `outline`에는 같은 ID·제목·번호·레이아웃·근거 경험을 저장.

같은 프로젝트·sourceTaskId·payload 재전송은 현재 B 저장본을 반환하고 사용자가 수정한 본문을 덮어쓰지 않습니다. 다른 payload는 409 `IMPORT_CONFLICT`, 새 작업 적용 중 동시 갱신은 409 `VERSION_CONFLICT`입니다. 선택 `expectedUpdatedAt` 및 프로젝트별 250개 이력 제한은 자소서 저장과 같습니다.

저장 후 기존 API를 사용할 수 있습니다.

- `GET /api/v1/portfolios/{id}`: 저장한 슬라이드 조회.
- `PATCH /api/v1/portfolios/{id}/slides/{slideNo}`: 사용자 직접 수정.
- `POST /api/v1/portfolios/{id}/export`: `{format:"PPTX"}` 또는 `{format:"PDF"}`.

이미지·차트가 포함된 PPTX/PDF 출력과 업로드·교체 API는 [출력 안내](PORTFOLIO_EXPORT.md)를 참고합니다. 한 장 재생성·저장은 [재생성 안내](SLIDE_REGENERATION.md)를 참고합니다.

이 API는 프론트가 전달한 생성 JSON을 저장합니다. A 작업 조회/인증을 B가 서버 간 자동 수행하는 기능은 포함하지 않습니다.
