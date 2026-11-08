"""나의 경험 보관함 (EX-01, EX-02)"""
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError as PostgrestError

from app.common import ok, now_iso, page_params
from app.db import db
from app.deps import get_current_user
from app.services.experiences import ExperienceIn, get_own_experience, save_experiences, to_api, to_row

router = APIRouter(tags=["experiences"])


def my_experiences_query(user_id: str, category: Optional[str]):
    query = db.table("experiences").select("*", count="exact").eq("user_id", user_id)
    return query.eq("category", category.upper()) if category else query


@router.get("/experiences")
def list_my_experiences(category: Optional[str] = None, page: int = 0, size: int = 20,
                        user: dict = Depends(get_current_user)):
    start, end = page_params(page, size)
    try:
        res = my_experiences_query(user["id"], category).order("created_at", desc=True).range(start, end).execute()
    except PostgrestError as e:
        if e.code != "PGRST103":  # PGRST103 = 마지막 페이지를 넘어간 요청
            raise
        total = my_experiences_query(user["id"], category).limit(1).execute().count
        return ok({"items": [], "page": page, "size": size, "totalCount": total})
    return ok({"items": [to_api(r) for r in res.data], "page": page, "size": size,
               "totalCount": res.count})


@router.get("/experiences/categories")
def categories(user: dict = Depends(get_current_user)):
    res = db.table("experiences").select("category").eq("user_id", user["id"]).execute()
    counts = Counter(r["category"] for r in res.data)
    return ok({"total": len(res.data), "categories": [{"category": c, "count": n} for c, n in counts.items()]})


@router.get("/experiences/{exp_id}")
def detail(exp_id: str, user: dict = Depends(get_current_user)):
    return ok(to_api(get_own_experience(exp_id, user["id"])))


@router.post("/experiences")
def create(body: ExperienceIn, user: dict = Depends(get_current_user)):
    new_id = save_experiences(user["id"], [body.model_dump(by_alias=True)])[0]
    return ok(to_api(get_own_experience(new_id, user["id"])))


@router.patch("/experiences/{exp_id}")
def update(exp_id: str, body: ExperienceIn, user: dict = Depends(get_current_user)):
    get_own_experience(exp_id, user["id"])  # 본인 것인지 확인
    db.table("experiences").update({**to_row(body, user["id"]), "updated_at": now_iso()}).eq("id", exp_id).execute()
    return ok(to_api(get_own_experience(exp_id, user["id"])))


@router.delete("/experiences/{exp_id}")
def delete(exp_id: str, user: dict = Depends(get_current_user)):
    get_own_experience(exp_id, user["id"])
    db.table("experiences").delete().eq("id", exp_id).execute()
    return ok({"deleted": True})
