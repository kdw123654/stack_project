from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.common import ApiError, ok
from app.db import db
from app.deps import get_current_user

router = APIRouter(tags=["job_postings"])

class Question(BaseModel):
    order: int
    text: str
    charLimit: Optional[int] = None

class QuestionsUpdate(BaseModel):
    questions: list[Question]


def to_api(row: dict) -> dict:
    return {"postingId": row["id"], "sourceType": row["source_type"], "url": row["url"],
            "company": row["company"], "position": row["position"],
            "requiredCompetencies": row["required_competencies"], "questions": row["questions"],
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

@router.get('/job-postings/{posting_id}')
def detail(posting_id: str, user: dict = Depends(get_current_user)):
    return ok(to_api(get_own_posting(posting_id, user["id"])))

@router.patch("/job-postings/{posting_id}/questions")
def update_questions(posting_id: str, body: QuestionsUpdate, user: dict = Depends(get_current_user)):
    get_own_posting(posting_id, user["id"])
    questions = [q.model_dump() for q in sorted(body.questions, key=lambda q: q.order)]
    db.table("job_postings").update({"questions": questions}).eq("id", posting_id).execute()
    return ok(to_api(get_own_posting(posting_id, user["id"])))