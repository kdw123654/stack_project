"""목표 기업·직무 입사 선배와 내 스펙 비교 (CM-02)"""
from collections import Counter

from fastapi import APIRouter, Depends

from app.common import ok
from app.db import db
from app.deps import get_current_user
from app.routers.users import get_profile

router = APIRouter(tags=["competency-map"])

TOP_N = 10


def my_keywords(user_id: str) -> set[str]:
    """내 경험에 적힌 태그·스킬을 비교용 키워드로 모은다 (대소문자·공백 무시)"""
    rows = db.table("experiences").select("tags, skills").eq("user_id", user_id).execute().data
    words = set()
    for r in rows:
        for w in (r["tags"] or []) + (r["skills"] or []):
            if isinstance(w, str) and w.strip():
                words.add(w.strip().lower())
    return words


def has_spec(spec: str, keywords: set[str]) -> bool:
    """'TOEIC 870'과 'toeic'처럼 한쪽이 다른 쪽을 포함하면 가진 것으로 본다"""
    s = spec.lower()
    return any(k in s or s in k for k in keywords)


@router.get("/competency-map/comparison")
def comparison(user: dict = Depends(get_current_user)):
    profile = get_profile(user["id"])
    company, job = profile["targetCompany"], profile["desiredJob"]

    seniors = []
    basis = None
    if company:  # 1순위: 목표 기업에 입사한 선배
        seniors = db.table("seniors").select("hire_specs").ilike("company", f"%{company}%").execute().data
        basis = "COMPANY" if seniors else None
    if not seniors and job:  # 2순위: 목표 직무와 비슷한 직무의 선배
        word = "".join(c for c in job if c not in ",()%*\\")  # or_ 필터 문법을 깨는 글자 제거
        seniors = (db.table("seniors").select("hire_specs")
                   .or_(f"position.ilike.%{word}%,job_category.ilike.%{word}%").execute().data)
        basis = "JOB" if seniors else None

    counts = Counter(spec for s in seniors for spec in (s["hire_specs"] or []))
    keywords = my_keywords(user["id"])
    specs = [{"spec": spec, "seniorCount": n, "ratio": round(n / len(seniors) * 100),
              "mine": has_spec(spec, keywords)}
             for spec, n in counts.most_common(TOP_N)]
    return ok({"basis": basis, "targetCompany": company, "desiredJob": job,
               "seniorCount": len(seniors), "specs": specs})
