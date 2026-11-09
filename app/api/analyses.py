from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
import asyncio
import json

from app.errors import AppError
from app.schemas.analysis import AcceptedAnalysis, AnalysisView, JobView, Mode, AnalysisPatch, RemodeRequest
from app.schemas.document import ErrorResponse
from app.services.extraction import MAX_FILE_BYTES
from app.services.jobs import InputFile, JobManager

router = APIRouter(tags=["analyses"])
ERRORS = {code: {"model": ErrorResponse} for code in (404, 409, 413, 422, 503)}


def get_manager(request: Request) -> JobManager:
    manager = getattr(request.app.state, "jobs", None)
    if manager is None:
        raise AppError("QUEUE_UNAVAILABLE", "분석 워커가 준비되지 않았습니다.", 503)
    return manager


@router.post("/analyses", response_model=AcceptedAnalysis, status_code=202, responses=ERRORS,
             summary="문서 AI 분석 작업 생성 (최대 5개)")
def create_analysis(
    response: Response,
    files: Annotated[list[UploadFile], File()],
    mode: Annotated[Mode, Form()],
    manager: Annotated[JobManager, Depends(get_manager)],
    memo: Annotated[str, Form(max_length=300)] = "",
    targetJob: Annotated[str, Form(max_length=100)] = "",
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", min_length=1, max_length=128)] = None,
) -> AcceptedAnalysis:
    try:
        if not 1 <= len(files) <= 5:
            raise AppError("INVALID_FILE_COUNT", "파일은 1개부터 최대 5개까지 가능합니다.")
        inputs = []
        for file in files:
            content = file.file.read(MAX_FILE_BYTES + 1)
            if len(content) > MAX_FILE_BYTES:
                raise AppError("FILE_TOO_LARGE", "파일은 최대 20MiB까지 가능합니다.", 413)
            inputs.append(InputFile(file.filename or "", content))
        accepted = manager.submit(inputs, mode, memo, targetJob, idempotency_key)
        response.headers["Location"] = f"/jobs/{accepted.jobId}"
        return accepted
    finally:
        for file in files:
            file.file.close()


@router.get("/jobs/{job_id}", response_model=JobView, responses=ERRORS, tags=["jobs"],
            summary="분석 작업 상태 조회 (2초 폴링)")
def get_job(job_id: str, manager: Annotated[JobManager, Depends(get_manager)]) -> JobView:
    return manager.get_job(job_id)


@router.get("/analyses/{analysis_id}", response_model=AnalysisView, responses=ERRORS,
            summary="모드별 분석 결과·출처 조회")
def get_analysis(analysis_id: str, manager: Annotated[JobManager, Depends(get_manager)]) -> AnalysisView:
    return manager.get_result(analysis_id)


@router.patch("/analyses/{analysis_id}/result", response_model=AnalysisView, responses=ERRORS)
def patch_analysis(analysis_id: str, payload: AnalysisPatch, manager: Annotated[JobManager, Depends(get_manager)]):
    return manager.patch_analysis(analysis_id, payload)


@router.get("/analyses/{analysis_id}/versions", response_model=list[AnalysisView], responses=ERRORS)
def analysis_versions(analysis_id: str, manager: Annotated[JobManager, Depends(get_manager)]):
    return manager.versions(analysis_id)


@router.get("/analyses/{analysis_id}/experience-export", responses=ERRORS)
def export_experience(analysis_id: str, manager: Annotated[JobManager, Depends(get_manager)]):
    return manager.experience_export(analysis_id)


@router.post("/analyses/{analysis_id}/remode", response_model=AcceptedAnalysis, status_code=202, responses=ERRORS)
def remode(analysis_id: str, payload: RemodeRequest, response: Response,
           manager: Annotated[JobManager, Depends(get_manager)],
           idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", min_length=1, max_length=128)] = None):
    accepted = manager.submit_remode(analysis_id, payload, idempotency_key)
    response.headers["Location"] = f"/jobs/{accepted.jobId}"
    return accepted


@router.get("/analyses/{analysis_id}/assets/{asset_id}", response_class=Response,
            responses={200: {"content": {"image/png": {}}}, **ERRORS})
def get_asset(analysis_id: str, asset_id: str, manager: Annotated[JobManager, Depends(get_manager)]):
    return Response(content=manager.get_asset(analysis_id, asset_id), media_type="image/png",
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/jobs/{job_id}/stream", response_class=StreamingResponse,
            responses={200: {"content": {"text/event-stream": {}}}, **ERRORS}, tags=["jobs"])
async def stream_job(job_id: str, request: Request, manager: Annotated[JobManager, Depends(get_manager)]):
    manager.get_job(job_id)
    async def events():
        previous = None
        while not await request.is_disconnected():
            try:
                job = manager.get_job(job_id)
            except AppError as exc:
                yield "event: error\ndata: " + json.dumps({"code": exc.code, "message": exc.message}, ensure_ascii=False) + "\n\n"
                break
            payload = job.model_dump_json()
            if payload != previous:
                yield f"event: job\ndata: {payload}\n\n"
                previous = payload
            else:
                yield ": keep-alive\n\n"
            if job.status in ("SUCCEEDED", "PARTIAL_FAILED", "FAILED"):
                break
            await asyncio.sleep(1)
    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
