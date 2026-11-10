from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from pydantic import Field, model_validator
from typing import Literal
from postgrest.exceptions import APIError as PostgrestError
from app.common import ApiError, ok
from app.db import db
from app.deps import get_current_user
from app.schemas.generated import PostingImport
from app.services.generated import normalize_questions, payload_hash

router = APIRouter(tags=["job_postings"])

class Question(BaseModel):
    id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    order: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=10000)
    charLimit: Optional[int] = Field(default=None, ge=1)
    countUnit: Literal["characters", "bytes", "words", "unknown"] = "characters"
    includesSpaces: Optional[bool] = None
    needsCheck: bool = False

class QuestionsUpdate(BaseModel):
    questions: list[Question] = Field(max_length=50)

    @model_validator(mode="after")
    def unique_questions(self):
        normalized = normalize_questions([q.model_dump() for q in self.questions])
        if len({q["order"] for q in normalized}) != len(normalized) or len({q["id"] for q in normalized}) != len(normalized):
            raise ValueError("문항 ID와 번호는 중복될 수 없습니다.")
        return self


def to_api(row: dict) -> dict:
    return {"postingId": row["id"], "sourceType": row["source_type"], "url": row["url"],
            "company": row["company"], "position": row["position"],
            "requiredCompetencies": row["required_competencies"], "questions": normalize_questions(row["questions"]),
            "sourcePostingId": row.get("source_analysis_id"),
            "analysisMetadata": row.get("analysis_metadata") or {},
            "createdAt": row["created_at"]}


def get_own_posting(posting_id: str, user_id: str) -> dict:
    res = db.table("job_postings").select("*").eq("id", posting_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "POSTING_NOT_FOUND", "공고를 찾을 수 없어요.")
    return res.data

def save_posting(user_id: str, source_type: str, url: Optional[str], raw_text: str, analysis: dict) -> dict:
    row = db.table("job_postings").insert({
        "user_id": user_id, "source_type": source_type, "url": url, "raw_text": raw_text,
        "company": analysis["company"], "position": analysis["position"],
        "required_competencies": analysis["requiredCompetencies"], "questions": analysis["questions"],
    }).execute().data[0]
    return to_api(row)


def find_imported_posting(user_id: str, source_id: str):
    result = (db.table("job_postings").select("*").eq("user_id", user_id)
              .eq("source_analysis_id", source_id).maybe_single().execute())
    return result.data if result is not None else None


@router.post("/job-postings")
def import_posting(body: PostingImport, user: dict = Depends(get_current_user)):
    fingerprint = payload_hash(body)

    def existing_response(row):
        if row["source_analysis_hash"] != fingerprint:
            raise ApiError(409, "IMPORT_CONFLICT", "같은 A 공고 ID에 다른 분석 결과를 저장할 수 없습니다.")
        return ok({**to_api(row), "reused": True})

    existing = find_imported_posting(user["id"], body.sourcePostingId)
    if existing:
        return existing_response(existing)
    questions = [{"id": q.id, "order": q.no, "text": q.title, "charLimit": q.limit,
                  "countUnit": q.countUnit, "includesSpaces": q.includesSpaces, "needsCheck": q.needsCheck}
                 for q in sorted(body.analysis.questions, key=lambda q: q.no)]
    try:
        row = db.table("job_postings").insert({
            "user_id": user["id"], "source_type": body.sourceType, "url": body.url, "raw_text": body.rawText,
            "company": body.analysis.company, "position": body.analysis.job,
            "required_competencies": body.analysis.skills, "questions": questions,
            "source_analysis_id": body.sourcePostingId, "source_analysis_hash": fingerprint,
            "analysis_metadata": {"evidence": body.evidence, "warnings": body.warnings},
        }).execute().data[0]
    except PostgrestError as error:
        if error.code != "23505":
            raise
        existing = find_imported_posting(user["id"], body.sourcePostingId)
        if not existing:
            raise
        return existing_response(existing)
    return ok({**to_api(row), "reused": False})

@router.get('/job-postings/{posting_id}')
def detail(posting_id: str, user: dict = Depends(get_current_user)):
    return ok(to_api(get_own_posting(posting_id, user["id"])))

@router.patch("/job-postings/{posting_id}/questions")
def update_questions(posting_id: str, body: QuestionsUpdate, user: dict = Depends(get_current_user)):
    get_own_posting(posting_id, user["id"])
    questions = normalize_questions([q.model_dump() for q in sorted(body.questions, key=lambda q: q.order)])
    db.table("job_postings").update({"questions": questions}).eq("id", posting_id).execute()
    return ok(to_api(get_own_posting(posting_id, user["id"])))
