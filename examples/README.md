# 로컬 실행 예제

이 폴더의 공고·경험은 API 동작 설명을 위한 가상 자료입니다. 실제 사용자 성과·채용공고가 아닙니다.

README의 실행 방법대로 서버를 켜고 프로젝트 루트에서 실행합니다.

## 키 없이 경험 추천·역량 진단

```bash
curl -X POST http://127.0.0.1:8000/cover-letters/recommended-experiences \
  -H 'Content-Type: application/json' --data-binary @examples/generation.json
curl -X POST http://127.0.0.1:8000/competency-map/diagnose \
  -H 'Content-Type: application/json' --data-binary @examples/diagnosis.json
```

## 키 설정 후 자소서·구성안 생성

```bash
curl -X POST http://127.0.0.1:8000/cover-letters/generate \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: sample-cover-1' \
  --data-binary @examples/generation.json
curl -X POST http://127.0.0.1:8000/portfolios/outline \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: sample-outline-1' \
  --data-binary @examples/generation.json
```

두 번째 요청은 기본 10장 구성안입니다. 분량을 바꾸려면 JSON에 `"size":6` 또는 `14`를 추가합니다. 생성은 실제 OpenAI 호출이므로 키 설정·사용량이 필요합니다.

응답의 `jobId`로 `/jobs/{jobId}`를 조회하고, 완료 후 `taskId`로 `/ai-results/{taskId}`를 조회합니다. 동일 요청 재전송에는 같은 요청 키, 새로운 생성에는 새 키를 사용합니다.

생성된 구성안의 `data.slides`를 `outline`에 넣고 기존 `posting`, `experiences`, `size`와 함께 `POST /portfolios/generate`에 전달하면 슬라이드 내용 JSON을 얻습니다. `/docs`의 스키마와 [독립 API 명세](../docs/INDEPENDENT_API.md)를 참고합니다.
