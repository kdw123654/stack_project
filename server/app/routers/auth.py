import re

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError as PostgrestError
from pydantic import BaseModel
from supabase_auth.errors import AuthApiError

from app.common import ApiError, now_iso, ok
from app.config import ALLOWED_EMAIL_DOMAIN
from app.db import auth_client, db
from app.deps import bearer, get_current_user

router = APIRouter(tags=["auth"])

STUDENT_ID_RE = re.compile(r"\d{8}")                        # 수원대 학번: 숫자 8자리 (예: 22016007)
PASSWORD_RE = re.compile(r"(?=.*[A-Za-z])(?=.*\d)\S{8,64}")  # 8~64자, 영문+숫자 포함, 공백 없음


class SendCodeRequest(BaseModel):
    email: str


class VerifyRequest(BaseModel):
    email: str
    code: str


class RefreshRequest(BaseModel):
    refreshToken: str


class PasswordSetRequest(BaseModel):
    studentId: str
    password: str


class LoginRequest(BaseModel):
    studentId: str
    password: str


def normalize_school_email(email: str) -> str:
    email = email.strip().lower()
    if not email.endswith("@" + ALLOWED_EMAIL_DOMAIN):
        raise ApiError(400, "NOT_SCHOOL_EMAIL", f"@{ALLOWED_EMAIL_DOMAIN} 학교 이메일만 가입할 수 있어요.")
    return email


def check_student_id(student_id: str) -> str:
    student_id = student_id.strip()
    if not STUDENT_ID_RE.fullmatch(student_id):
        raise ApiError(400, "INVALID_STUDENT_ID", "학번은 숫자 8자리로 입력해 주세요.")
    return student_id


def check_password(password: str) -> str:
    if not PASSWORD_RE.fullmatch(password):
        raise ApiError(400, "WEAK_PASSWORD", "비밀번호는 영문과 숫자를 섞어 8자 이상(공백 없이)으로 만들어 주세요.")
    return password


def token_response(session) -> dict:
    return {"accessToken": session.access_token, "refreshToken": session.refresh_token,
            "expiresIn": session.expires_in}


@router.post("/auth/email/send-code")
def send_code(body: SendCodeRequest):
    email = normalize_school_email(body.email)
    try:
        auth_client().auth.sign_in_with_otp({"email": email, "options": {"should_create_user": True}})
    except AuthApiError as e:
        if e.status == 429:
            raise ApiError(429, "TOO_MANY_REQUESTS", "잠시 후 다시 시도해 주세요.")
        raise ApiError(400, "SEND_CODE_FAILED", "인증 메일을 보내지 못했어요.")
    return ok({"sent": True})


@router.post("/auth/email/verify")
def verify_code(body: VerifyRequest):
    email = normalize_school_email(body.email)
    try:
        res = auth_client().auth.verify_otp({"email": email, "token": body.code.strip(), "type": "email"})
    except AuthApiError:
        raise ApiError(400, "INVALID_CODE", "인증 코드가 틀렸거나 만료됐어요.")
    if res.session is None or res.user is None:
        raise ApiError(400, "INVALID_CODE", "인증 코드가 틀렸거나 만료됐어요.")

    user_id = res.user.id
    profile = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    is_new = profile is None or profile.data is None
    if is_new:
        db.table("profiles").insert({"id": user_id, "email": email}).execute()
        db.table("consents").insert({"user_id": user_id}).execute()
    student_id = None if is_new else profile.data.get("student_id")

    return ok({**token_response(res.session), "isNewUser": is_new,
               "hasPassword": student_id is not None,
               "user": {"id": user_id, "email": email, "studentId": student_id}})


@router.post("/auth/password")
def set_password(body: PasswordSetRequest, user: dict = Depends(get_current_user)):
    student_id = check_student_id(body.studentId)
    password = check_password(body.password)

    taken = db.table("profiles").select("id").eq("student_id", student_id).neq("id", user["id"]).execute()
    if taken.data:
        raise ApiError(409, "STUDENT_ID_TAKEN", "이미 다른 계정에 등록된 학번이에요.")
    try:
        db.table("profiles").update({"student_id": student_id, "updated_at": now_iso()}).eq("id", user["id"]).execute()
    except PostgrestError as e:
        if e.code == "23505":  # unique 위반: 거의 동시에 같은 학번이 등록된 경우
            raise ApiError(409, "STUDENT_ID_TAKEN", "이미 다른 계정에 등록된 학번이에요.")
        raise

    try:
        db.auth.admin.update_user_by_id(user["id"], {"password": password})
    except AuthApiError:
        raise ApiError(400, "WEAK_PASSWORD", "사용할 수 없는 비밀번호예요. 다른 비밀번호로 바꿔 주세요.")
    return ok({"studentId": student_id, "hasPassword": True})


@router.post("/auth/login")
def login(body: LoginRequest):
    fail = ApiError(401, "INVALID_CREDENTIALS", "학번 또는 비밀번호가 틀렸어요.")
    student_id = body.studentId.strip()
    if not STUDENT_ID_RE.fullmatch(student_id) or not body.password:
        raise fail

    profile = db.table("profiles").select("id, email").eq("student_id", student_id).maybe_single().execute()
    if profile is None or profile.data is None:
        raise fail
    try:
        res = auth_client().auth.sign_in_with_password({"email": profile.data["email"], "password": body.password})
    except AuthApiError as e:
        if e.status == 429:
            raise ApiError(429, "TOO_MANY_REQUESTS", "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.")
        raise fail
    if res.session is None:
        raise fail

    return ok({**token_response(res.session), "isNewUser": False, "hasPassword": True,
               "user": {"id": res.user.id, "email": profile.data["email"], "studentId": student_id}})


@router.post("/auth/refresh")
def refresh(body: RefreshRequest):
    try:
        res = auth_client().auth.refresh_session(body.refreshToken)
    except AuthApiError:
        raise ApiError(401, "INVALID_REFRESH_TOKEN", "다시 로그인해 주세요.")
    return ok(token_response(res.session))


@router.post("/auth/logout")
def logout(cred=Depends(bearer)):
    if cred is not None:
        try:
            db.auth.admin.sign_out(cred.credentials)  # 이 사용자의 refresh 토큰 무효화
        except AuthApiError:
            pass
    return ok({"loggedOut": True})
