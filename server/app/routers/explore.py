from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common import ApiError, camel_keys, ok
from app.db import db
from app.deps import get_current_user

router = APIRouter(tags=["explore"])


class QuestionCreate(BaseModel):
    content: str


def d_day(deadline: Optional[str]) -> Optional[int]:
    return None if deadline is None else (date.fromisoformat(deadline) - date.today()).days


@router.get("/explore/postings")
def postings(type: Optional[Literal["CAMPUS", "EXTERNAL"]] = None, user: dict = Depends(get_current_user)):
    query = db.table("explore_postings").select("*")
    if type:
        query = query.eq("type", type)
    res = query.gte("deadline", date.today().isoformat()).order("deadline").execute()
    return ok(camel_keys({"items": [{**r, "dDay": d_day(r["deadline"])} for r in res.data]}))


@router.get("/explore/postings/{posting_id}")
def posting_detail(posting_id: str, user: dict = Depends(get_current_user)):
    res = db.table("explore_postings").select("*").eq("id", posting_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "NOT_FOUND", "공고를 찾을 수 없어요.")
    return ok(camel_keys({**res.data, "dDay": d_day(res.data["deadline"])}))


@router.post("/explore/postings/{posting_id}/job-posting")
def to_document_flow(posting_id: str, user: dict = Depends(get_current_user)):
    """'이 공고로 맞춤 서류 만들기': 프론트가 이 text로 A의 /job-postings/analyze를 부르면 됨"""
    res = db.table("explore_postings").select("*").eq("id", posting_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "NOT_FOUND", "공고를 찾을 수 없어요.")
    p = res.data
    text = f"{p['title']}\n{p['organization'] or ''}\n{p['description']}"
    return ok(camel_keys({"sourceType": "TEXT", "text": text}))


@router.get("/explore/employment-stats")
def employment_stats(year: Optional[int] = None, user: dict = Depends(get_current_user)):
    query = db.table("employment_stats").select("*").eq("scope", "SCHOOL")
    res = (query.eq("year", year) if year else query).execute()
    return ok(camel_keys({"items": res.data}))


@router.get("/explore/employment-stats/by-job")
def stats_by_job(year: Optional[int] = None, user: dict = Depends(get_current_user)):
    query = db.table("employment_stats").select("*").eq("scope", "DEPARTMENT_JOB")
    res = (query.eq("year", year) if year else query).order("value", desc=True).execute()
    return ok(camel_keys({"items": res.data}))


@router.get("/explore/seniors")
def seniors(jobCategory: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = db.table("seniors").select("id, display_name, company, position, career_years, "
                                       "grad_year, job_category, verified, hire_specs")
    res = (query.eq("job_category", jobCategory) if jobCategory else query).execute()
    return ok(camel_keys({"items": res.data}))


@router.get("/explore/seniors/{senior_id}")
def senior_detail(senior_id: str, user: dict = Depends(get_current_user)):
    res = db.table("seniors").select("*").eq("id", senior_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "NOT_FOUND", "선배 정보를 찾을 수 없어요.")
    return ok(camel_keys(res.data))


@router.post("/explore/seniors/{senior_id}/questions")
def ask_senior(senior_id: str, body: QuestionCreate, user: dict = Depends(get_current_user)):
    senior_detail(senior_id, user)  # 존재 확인
    if not body.content.strip():
        raise ApiError(400, "EMPTY_QUESTION", "질문 내용을 입력해 주세요.")
    row = db.table("senior_questions").insert({"senior_id": senior_id, "user_id": user["id"],
                                               "content": body.content.strip()}).execute().data[0]
    return ok(camel_keys(row))


@router.get("/explore/questions")
def my_questions(user: dict = Depends(get_current_user)):
    res = (db.table("senior_questions").select("*, seniors(display_name, company)")
           .eq("user_id", user["id"]).order("created_at", desc=True).execute())
    return ok(camel_keys({"items": res.data}))