# STACK Backend A

FastAPI 기반 문서 파싱·OpenAI 분석·비동기 Job 서비스입니다. 이력서·스펙업·포트폴리오 모드와 채용공고 본문 분석을 지원합니다. 현재 단일 프로세스 로컬 개발용이며, DB 저장·인증·영속 작업 큐는 B와 후속 연결합니다.

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

## 현재 지원 범위와 제한

- 순수 추출은 파일 1개, 분석 작업은 최대 5개이며 각각 최대 20MiB입니다.
- PDF·DOCX·PPTX·PNG·JPG·JPEG·WEBP를 지원합니다. 문서당 최대 200페이지/슬라이드/블록, OOXML 압축 해제 최대 100MiB입니다.
- 위치 번호는 1부터 시작합니다. DOCX는 실제 페이지 대신 문단/표 블록 번호, PPTX는 슬라이드 번호를 사용합니다.
- 순수 추출에서 텍스트가 없으면 `needsOcr: true`입니다. 전체 추출은 `extracted`, 일부만 있으면 `partial`, 전부 없으면 `needs_ocr`입니다.
- 분석 작업에서는 이미지와 PDF의 텍스트 없는 페이지에 OpenAI Vision OCR을 적용합니다. 기본 최대 파일당 10페이지, `OCR_ENABLED=false`로 끌 수 있습니다. 이미지 내용이 외부 AI에 전달되고 추가 사용량이 발생합니다.
- OCR은 텍스트 없는 PDF 페이지에만 적용합니다. DOCX/PPTX 안의 이미지 OCR, 원본 이미지 자산 추출, PDF/PPTX 생성은 포함하지 않습니다. 포트폴리오 결과의 `images`는 현재 빈 배열입니다.
- 암호화·손상·빈 파일은 오류로 반환합니다.
- 작업·결과는 메모리에만 보관합니다. 기본 동시 처리 2개, 실행+대기 최대 4개, 종료 결과 최대 100건/1시간이며 설정 가능합니다. 재시작하면 모두 사라집니다. 재시작 복구·분산 워커·SSE는 미구현입니다.
- 문서·공고 작업은 큐와 보관 한도를 공유합니다. Job 응답의 `kind`로 작업을 구분하고, 해당 작업의 `analysisId` 또는 `postingId`로 결과를 조회합니다.
- `uvicorn --workers`는 **1개만** 사용합니다. 여러 프로세스나 서버로 배포하기 전에 Redis/Celery 등 영속 작업 큐와 공유 저장소로 전환해야 합니다.
- 원본 파일을 앱에서 영구 저장하지 않습니다. 업로드 임시 파일은 요청 후 닫으며, 작업 중에는 메모리에 원본을 보유합니다. 추출 결과·인용문은 결과 만료 전까지 메모리에 보관합니다.
- 인증 없는 로컬 개발용 API입니다. B와 연결 시 인증/소유권을 확인한 파일 ID를 받는 인터페이스를 합의합니다.
- HWP·구형 PPT/DOC는 PDF/DOCX/PPTX로 변환 후 업로드합니다. 복잡한 표와 읽기 순서, 헤더/푸터/도형/이미지 내부 글자의 완전한 복원은 보장하지 않습니다.
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
3. 수정/저장/다른 모드 재분석, 사용자 삭제 및 보관 정책 연결.
4. 영속 작업 큐·DB/파일 저장소·인증 연동, 이미지 자산 추출·HWP 지원 범위 확정.

요청·응답 및 FE 연결 방법: [docs/API_SPEC.md](docs/API_SPEC.md).

참고: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [이미지 입력](https://developers.openai.com/api/docs/guides/images-vision), [FastAPI 파일 업로드](https://fastapi.tiangolo.com/tutorial/request-files/), [pypdf 텍스트 추출](https://pypdf.readthedocs.io/en/stable/user/extract-text.html).
