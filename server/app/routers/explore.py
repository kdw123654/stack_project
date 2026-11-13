from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common import ApiError, camel_keys, ok
from app.db import db
from app.deps import get_current_user
from app.services.job_match import job_categories

router = APIRouter(tags=["explore"])


class QuestionCreate(BaseModel):
    content: str


def d_day(deadline: Optional[str]) -> Optional[int]:
    return None if deadline is None else (date.fromisoformat(deadline) - date.today()).days


CLUB_TAGS = ["연합동아리", "교내동아리"]


def open_postings() -> list[dict]:
    """모집 중인 공고: 마감 안 지났거나, 마감일이 없으면 게시 후 30일까지."""
    today = date.today().isoformat()
    recent = (date.today() - timedelta(days=30)).isoformat()
    res = (db.table("explore_postings").select("*").eq("relevant", True)
           .or_(f"deadline.gte.{today},and(deadline.is.null,posted_at.gte.{recent})")
           .order("deadline", nullsfirst=False).order("posted_at", desc=True)
           .execute())
    return [{**r, "dDay": d_day(r["deadline"])} for r in res.data]


def my_job_categories(user_id: str) -> set[str]:
    profile = db.table("profiles").select("desired_job").eq("id", user_id).maybe_single().execute()
    return job_categories(profile.data["desired_job"] if profile and profile.data else None)


@router.get("/explore/my-jobs")
def my_jobs(user: dict = Depends(get_current_user)):
    """동아리·선배·통계 화면의 '내 직무' 필터용: 희망 직무를 공고 직무 분류(14개)로 바꾼 결과."""
    return ok(camel_keys({"myJobs": sorted(my_job_categories(user["id"]))}))


@router.get("/explore/postings")
def postings(type: Optional[Literal["CAMPUS", "EXTERNAL"]] = None, user: dict = Depends(get_current_user)):
    my_jobs = my_job_categories(user["id"])
    items =[{**r, "jobFit": bool(my_jobs & set(r["job_tags"] or []))}
             for r in open_postings()
             if r["tag"] not in CLUB_TAGS and (type is None or r["type"] == type)]
    return ok(camel_keys({"items": items, "myJobs": sorted(my_jobs)}))


@router.get("/explore/clubs")
def clubs(user: dict = Depends(get_current_user)):
    """동아리: 마감 안 지난 모집 + 마감일 없는 상시 동아리(교내 중앙동아리 등)는 항상."""
    today = date.today().isoformat()
    res = (db.table("explore_postings").select("*").eq("relevant", True).in_("tag", CLUB_TAGS)
           .or_(f"deadline.gte.{today},deadline.is.null")
           .order("deadline", nullsfirst=False).order("organization")
           .execute())
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
    query = db.table("seniors").select("id, display_name, company, position, career_years, department, "
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