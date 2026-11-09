from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response

from app.api.analyses import get_manager
from app.schemas.document import ErrorResponse
from app.schemas.job_posting import AcceptedPosting, PostingAnalysisView, PostingRequest
from app.services.jobs import JobManager

router = APIRouter(prefix="/job-postings", tags=["job-postings"])
ERRORS = {code: {"model": ErrorResponse} for code in (404, 409, 422, 503)}


@router.post("/analyze", response_model=AcceptedPosting, status_code=202, responses=ERRORS,
             summary="채용공고 본문 AI 분석 작업 생성")
def create_posting_analysis(
    payload: PostingRequest,
    response: Response,
    manager: Annotated[JobManager, Depends(get_manager)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", min_length=1, max_length=128)] = None,
) -> AcceptedPosting:
    accepted = manager.submit_posting(payload.text, idempotency_key)
    response.headers["Location"] = f"/jobs/{accepted.jobId}"
    return accepted


@router.get("/{posting_id}/analysis", response_model=PostingAnalysisView, responses=ERRORS,
            summary="공고 분석 결과·원문 근거 조회 (임시 메모리 결과)")
def get_posting_analysis(
    posting_id: str, manager: Annotated[JobManager, Depends(get_manager)],
) -> PostingAnalysisView:
    return manager.get_posting_result(posting_id)
