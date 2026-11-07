# STACK Backend A

FastAPI 기반 문서 파싱·AI 분석 서비스입니다. 현재 PDF 페이지별 텍스트 추출까지 구현되어 있습니다. AI 분석, OCR, DB 저장, 비동기 Job은 다음 단계입니다.

## 실행

Python 3.11 이상에서 프로젝트 루트 기준으로 실행합니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- API 문서: http://127.0.0.1:8000/docs
- 상태 확인: `GET /health`
- 텍스트 추출: `POST /documents/extract` (multipart의 `file` 필드)

`/docs`에서 `POST /documents/extract` → **Try it out** → PDF 선택 → **Execute**로 확인합니다. API 키는 필요하지 않습니다.

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

## 현재 지원 범위

- 요청당 PDF 1개, 최대 20MiB / 200페이지. 확장자와 PDF 헤더를 확인합니다.
- 1부터 시작하는 원본 페이지 번호를 보존합니다.
- 텍스트가 없는 페이지는 `needsOcr: true`로 반환합니다. 실제 OCR은 아직 수행하지 않습니다.
- 전체 페이지에 텍스트가 있으면 `extracted`, 일부만 있으면 `partial`, 전부 없으면 `needs_ocr`입니다.
- 암호화·손상·빈 파일은 오류로 반환합니다.
- 파일과 결과를 앱에서 영구 저장하지 않습니다. 업로드 임시 파일은 요청 후 닫습니다.
- 인증 없는 로컬 개발용 API입니다. B와 연결 시 인증/소유권을 확인한 파일 ID를 받는 인터페이스를 합의합니다.
- PPT/PPTX·DOCX·HWP·이미지는 아직 지원하지 않습니다. 복잡한 표와 읽기 순서는 별도 검증이 필요합니다.

오류는 임시로 `{"error": {"code": "...", "message": "..."}}` 형식이며 B의 규격에 맞춰 조정합니다.

## 코드 구조

```text
app/
  main.py                  # 앱과 오류 처리
  api/documents.py         # 파일 입력 API
  schemas/document.py     # JSON 응답 모델
  services/extraction.py   # PDF 추출 로직
tests/
  test_documents.py        # API·추출 실패/부분 성공 검증
```

## 테스트

```bash
python -m pytest
```

## 다음 구현

1. B·FE와 경험 JSON, 파일 접근 방식, Job 상태/오류 형식 합의.
2. AI 제공자 선정 후 환경변수로 키를 받고 LLM 호출·스키마 검증·재시도 구현.
3. 이력서 분석: 활동명·기간·역할·성과·스킬, 필드별 출처와 확인 필요 상태 반환.
4. 작업 큐/상태 조회와 저장 연결, 다른 모드·파일 형식 확장.

참고: [FastAPI 파일 업로드](https://fastapi.tiangolo.com/tutorial/request-files/), [모듈 분리](https://fastapi.tiangolo.com/tutorial/bigger-applications/), [pypdf 텍스트 추출](https://pypdf.readthedocs.io/en/stable/user/extract-text.html).
