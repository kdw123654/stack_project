from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response

from app.api.analyses import get_manager
from app.schemas.career import (
    AcceptedTask, DiagnosisRequest, DraftRequest, MatchRequest, OutlineRequest,
    PortfolioRequest, RegenerateRequest, TaskResult,
)
from app.services.career import checked_payload, diagnose, recommend
from app.services.jobs import JobManager

router = APIRouter(tags=["career"])
Manager = Annotated[JobManager, Depends(get_manager)]
Key = Annotated[str | None, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


@router.post("/cover-letters/recommended-experiences")
def recommend_cover(payload: MatchRequest, manager: Manager):
    checked_payload(payload, manager.settings)
    return recommend(payload.model_copy(update={"kind": "cover"}))


@router.post("/portfolios/recommended-experiences")
def recommend_portfolio(payload: MatchRequest, manager: Manager):
    checked_payload(payload, manager.settings)
    return recommend(payload.model_copy(update={"kind": "slides"}))


@router.post("/experiences/fit")
@router.post("/competency-map/diagnose")
def competency_map(payload: DiagnosisRequest, manager: Manager):
    checked_payload(payload, manager.settings)
    return diagnose(payload)


def accept(manager, kind, payload, response, key, qid=None):
    accepted = manager.submit_career(kind, payload, qid, key)
    response.headers["Location"] = f"/jobs/{accepted.jobId}"
    return accepted


@router.post("/cover-letters/generate", response_model=AcceptedTask, status_code=202)
def cover_generate(payload: DraftRequest, response: Response, manager: Manager, idempotency_key: Key = None):
    return accept(manager, "cover_generate", payload, response, idempotency_key)


@router.post("/cover-letters/answers/{question_id}/regenerate", response_model=AcceptedTask, status_code=202)
def cover_regenerate(question_id: str, payload: RegenerateRequest, response: Response, manager: Manager, idempotency_key: Key = None):
    return accept(manager, "cover_regenerate", payload, response, idempotency_key, question_id)


@router.post("/portfolios/outline", response_model=AcceptedTask, status_code=202)
def portfolio_outline(payload: OutlineRequest, response: Response, manager: Manager, idempotency_key: Key = None):
    return accept(manager, "portfolio_outline", payload, response, idempotency_key)


@router.post("/portfolios/generate", response_model=AcceptedTask, status_code=202)
def portfolio_generate(payload: PortfolioRequest, response: Response, manager: Manager, idempotency_key: Key = None):
    return accept(manager, "portfolio_generate", payload, response, idempotency_key)


@router.get("/ai-results/{task_id}", response_model=TaskResult)
def get_result(task_id: str, manager: Manager):
    return manager.get_task_result(task_id)


@router.post("/cover-letters/recommended-experiences/semantic", response_model=AcceptedTask, status_code=202)
def recommend_cover_semantic(payload: MatchRequest, response: Response, manager: Manager, idempotency_key: Key = None):
    return accept(manager, "experience_match", payload.model_copy(update={"kind": "cover"}), response, idempotency_key)


@router.post("/portfolios/recommended-experiences/semantic", response_model=AcceptedTask, status_code=202)
def recommend_portfolio_semantic(payload: MatchRequest, response: Response, manager: Manager, idempotency_key: Key = None):
    return accept(manager, "experience_match", payload.model_copy(update={"kind": "slides"}), response, idempotency_key)


@router.post("/competency-map/diagnose/semantic", response_model=AcceptedTask, status_code=202)
def diagnose_semantic(payload: DiagnosisRequest, response: Response, manager: Manager, idempotency_key: Key = None):
    return accept(manager, "competency_diagnose", payload, response, idempotency_key)
