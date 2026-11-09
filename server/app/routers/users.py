"""내 정보 · 목표 직무 · 동의 · 약관 · 탈퇴 (US-01~05)"""
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel

from app.common import ApiError, CamelModel, camel_keys, now_iso, ok
from app.config import ALLOWED_EMAIL_DOMAIN
from app.db import db
from app.deps import get_current_user
from app.services.storage import remove_all_user_files

router = APIRouter(tags=["users"])


class Profile(CamelModel):
    id: str
    email: str
    student_id: Optional[str] = None
    name: Optional[str] = None
    department: Optional[str] = None
    grade: Optional[int] = None
    desired_job: Optional[str] = None
    target_company: Optional[str] = None


class TargetUpdate(CamelModel):
    desired_job: str
    target_company: Optional[str] = None


class ProfileUpdate(CamelModel):
    name: Optional[str] = None
    department: Optional[str] = None
    grade: Optional[int] = None


class ConsentUpdate(CamelModel):
    ai_quality_improvement: Optional[bool] = None
    job_alert: Optional[bool] = None
    public_career_profile: Optional[bool] = None


class Consents(CamelModel):
    terms_agreed_at: str
    privacy_agreed_at: str
    ai_quality_improvement: bool
    job_alert: bool
    public_career_profile: bool
    updated_at: str


def get_profile(user_id: str) -> dict:
    res = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "PROFILE_NOT_FOUND", "프로필이 없어요. 다시 로그인해 주세요.")
    return Profile.model_validate(res.data).model_dump(by_alias=True)


@router.get("/users/me")
def me(user: dict = Depends(get_current_user)):
    return ok(get_profile(user["id"]))


@router.patch("/users/me/target")
def update_target(body: TargetUpdate, user: dict = Depends(get_current_user)):
    db.table("profiles").update({**body.model_dump(), "updated_at": now_iso()}).eq("id", user["id"]).execute()
    return ok(get_profile(user["id"]))


@router.patch("/users/me")
def update_me(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    changes = body.model_dump(exclude_none=True)
    if changes:
        db.table("profiles").update({**changes, "updated_at": now_iso()}).eq("id", user["id"]).execute()
    return ok(get_profile(user["id"]))


@router.get("/users/me/consents")
def get_consents(user: dict = Depends(get_current_user)):
    res = db.table("consents").select("*").eq("user_id", user["id"]).single().execute()
    return ok(Consents.model_validate(res.data).model_dump(by_alias=True))


@router.patch("/users/me/consents")
def update_consents(body: ConsentUpdate, user: dict = Depends(get_current_user)):
    changes = body.model_dump(exclude_none=True)
    res = db.table("consents").update({**changes, "updated_at": now_iso()}).eq("user_id", user["id"]).execute()
    return ok(Consents.model_validate(res.data[0]).model_dump(by_alias=True))


@router.get("/users/me/school-verification")
def school_verification(user: dict = Depends(get_current_user)):
    auth_user = db.auth.admin.get_user_by_id(user["id"]).user
    email = auth_user.email or ""
    confirmed_at = auth_user.email_confirmed_at
    return ok({"verified": email.endswith("@" + ALLOWED_EMAIL_DOMAIN) and confirmed_at is not None,
               "schoolEmail": email,
               "verifiedAt": confirmed_at,
               "studentId": get_profile(user["id"])["studentId"]})


EXPORT_TABLES = ["consents", "files", "experiences", "job_postings", "cover_letters", "portfolios",
                 "senior_questions"]


@router.get("/users/me/data-export")
def data_export(user: dict = Depends(get_current_user)):
    data = {"exportedAt": now_iso(), "profile": get_profile(user["id"])}
    for table in EXPORT_TABLES:
        rows = db.table(table).select("*").eq("user_id", user["id"]).execute().data
        data[to_camel(table)] = camel_keys(rows)
    return JSONResponse(content=ok(data),
                        headers={"Content-Disposition": 'attachment; filename="stack-my-data.json"'})


@router.delete("/users/me")
def withdraw(user: dict = Depends(get_current_user)):
    remove_all_user_files(user["id"])        # 저장소 파일 먼저 삭제
    db.auth.admin.delete_user(user["id"])    # 계정 삭제 → 모든 테이블 데이터 자동 삭제(cascade)
    return ok({"deleted": True})


@router.get("/policies/{policy_type}")
def get_policy(policy_type: str):
    res = (db.table("policies").select("*").eq("type", policy_type)
           .order("effective_date", desc=True).limit(1).execute())
    if not res.data:
        raise ApiError(404, "POLICY_NOT_FOUND", "약관을 찾을 수 없어요.")
    return ok(camel_keys(res.data[0]))
