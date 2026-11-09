"""홈 한 번에 조회 (HM-01, HM-02)"""
from fastapi import APIRouter, Depends

from app.common import camel_keys, ok
from app.db import db
from app.deps import get_current_user
from app.routers.files import to_api as file_to_api
from app.routers.users import get_profile

router = APIRouter(tags=["home"])


@router.get("/home")
def home(user: dict = Depends(get_current_user)):
    files = (db.table("files").select("*").eq("user_id", user["id"])
             .order("uploaded_at", desc=True).limit(3).execute())
    return ok({"profile": get_profile(user["id"]),
               "recentFiles": [file_to_api(r) for r in files.data],
               "programs": recommended_programs()["data"]})


@router.get("/programs/recommended")
def recommended_programs():
    res = db.table("programs").select("*").eq("active", True).limit(5).execute()
    return ok(camel_keys(res.data))
