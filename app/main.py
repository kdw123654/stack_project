from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.documents import router as documents_router
from app.api.analyses import router as analyses_router
from app.api.job_postings import router as job_postings_router
from app.api.career import router as career_router
from app.config import Settings
from app.errors import AppError
from app.services.jobs import JobManager
from app.services.llm import LLM, OpenAILLM

def create_app(settings: Settings | None = None, llm: LLM | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        config = settings if settings is not None else Settings()
        provider = llm if llm is not None else OpenAILLM(config)
        if not logging.getLogger("stack").handlers:
            logging.getLogger("stack").addHandler(logging.StreamHandler())
            logging.getLogger("stack").propagate = False
        logging.getLogger("stack").setLevel(logging.INFO)
        application.state.jobs = JobManager(config, provider)
        try:
            yield
        finally:
            application.state.jobs.close()
            provider.close()

    application = FastAPI(
        title="STACK Backend A",
        description="문서 파싱·OpenAI 구조화 분석·비동기 Job. 단일 프로세스 로컬 개발용입니다.",
        version="0.3.0",
        lifespan=lifespan,
    )
    application.include_router(documents_router)
    application.include_router(analyses_router)
    application.include_router(job_postings_router)
    application.include_router(career_router)
    application.add_exception_handler(AppError, app_error_handler)
    application.add_exception_handler(RequestValidationError, validation_error_handler)
    application.add_api_route("/health", health, methods=["GET"], tags=["health"])
    return application


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "INVALID_REQUEST", "message": "요청 본문·파일·모드·입력 길이를 확인해 주세요."}},
    )


def health() -> dict[str, str]:
    return {"status": "ok"}


app = create_app()
