"""로그인한 사용자 꺼내기 (JWT 인증). API 함수에 user: dict = Depends(get_current_user)만 붙이면 끝."""
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.common import ApiError
from app.db import auth_client

bearer = HTTPBearer(auto_error=False)  # Swagger에 Authorize 버튼이 생김


def get_current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if cred is None:
        raise ApiError(401, "UNAUTHORIZED", "로그인이 필요해요.")
    try:
        res = auth_client().auth.get_user(cred.credentials)
    except Exception:
        raise ApiError(401, "INVALID_TOKEN", "로그인이 만료됐어요. 다시 로그인해 주세요.")
    if res is None or res.user is None:
        raise ApiError(401, "INVALID_TOKEN", "로그인이 만료됐어요. 다시 로그인해 주세요.")
    return {"id": res.user.id, "email": res.user.email}
