from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.api.analyses import get_manager
from app.schemas.ai_data import DataDeletion, DataExport, DataExportRequest, JobSelection
from app.schemas.document import ErrorResponse
from app.services.jobs import JobManager

router = APIRouter(prefix="/ai-data", tags=["ai-data"])
Manager = Annotated[JobManager, Depends(get_manager)]
ERRORS = {code: {"model": ErrorResponse} for code in (409, 413, 422, 503)}


@router.post("/export", response_model=DataExport, responses=ERRORS,
             summary="작업 ID 기준 AI 결과·근거·수정 이력 내보내기")
def export_data(payload: DataExportRequest, response: Response, manager: Manager):
    result = manager.export_jobs(payload.jobIds, payload.includeImages)
    response.headers["Content-Disposition"] = 'attachment; filename="stack-ai-data.json"'
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post("/delete", response_model=DataDeletion, responses=ERRORS,
             summary="작업 ID 기준 AI 데이터 일괄 삭제 (진행 중이면 409)")
def delete_data(payload: JobSelection, response: Response, manager: Manager):
    result = manager.delete_jobs(payload.jobIds)
    response.headers["Cache-Control"] = "no-store"
    return result
