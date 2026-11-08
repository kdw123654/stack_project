from typing import Any, Optional
from postgrest.exceptions import APIError as PostgrestError
from app.common import ApiError, CamelModel
from app.db import db


class Period(CamelModel):
    start: Optional[str] = None
    end: Optional[str] = None


class ExperienceIn(CamelModel):
    title: str
    category: str = "ETC"
    tags: list[str] = []
    organization: Optional[str] = None
    period: Period = Period()
    role: Optional[str] = None
    achievements: list[str] = []
    skills: list[str] = []
    portfolio: Optional[dict[str, Any]] = None
    source_file_id: Optional[str] = None
    job_fit_score: Optional[int] = None


def to_row(exp: ExperienceIn, user_id: str) -> dict:
    data = exp.model_dump(exclude={"period"})
    return {**data, "user_id": user_id, "period_start": exp.period.start, "period_end": exp.period.end}


def to_api(row: dict) -> dict:
    return {
        "id": row["id"], "title": row["title"], "category": row["category"], "tags": row["tags"],
        "organization": row["organization"],
        "period": {"start": row["period_start"], "end": row["period_end"]},
        "role": row["role"], "achievements": row["achievements"], "skills": row["skills"],
        "portfolio": row["portfolio"], "sourceFileId": row["source_file_id"],
        "jobFitScore": row["job_fit_score"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }


def save_experiences(user_id: str, items: list[dict]) -> list[str]:
    """A가 부르는 함수: AI 분석 결과 여러 개를 한 번에 저장하고 id 목록을 돌려줌"""
    rows = [to_row(ExperienceIn.model_validate(item), user_id) for item in items]
    if not rows:
        return []
    res = db.table("experiences").insert(rows).execute()
    return [r["id"] for r in res.data]


def list_experiences(user_id: str) -> list[dict]:
    """A가 부르는 함수: 경험 추천·자소서 생성에 넘길 전체 경험"""
    res = db.table("experiences").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return [to_api(r) for r in res.data]


def get_own_experience(exp_id: str, user_id: str) -> dict:
    res = db.table("experiences").select("*").eq("id", exp_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "EXPERIENCE_NOT_FOUND", "경험을 찾을 수 없어요.")
    return res.data
