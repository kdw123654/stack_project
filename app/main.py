from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.documents import router
from app.services.extraction import ExtractionError

app = FastAPI(
    title="STACK Backend A",
    description="문서 파싱 및 AI 분석 서비스. 현재 PDF 텍스트 추출을 지원합니다.",
    version="0.1.0",
)
app.include_router(router)


@app.exception_handler(ExtractionError)
async def extraction_error_handler(request: Request, exc: ExtractionError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "INVALID_REQUEST", "message": "file 필드에 PDF 파일을 첨부해 주세요."}},
    )


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
