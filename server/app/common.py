import logging
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError as PostgrestError
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

logger = logging.getLogger("stack")


def ok(data):
    return {"success": True, "data": data}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"success": False, "error": {"code": code, "message": message}})


def register_error_handlers(app: FastAPI):
    @app.exception_handler(ApiError)
    async def api_error(_: Request, e: ApiError):
        return _error(e.status, e.code, e.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, e: RequestValidationError):
        first = e.errors()[0]
        field = ".".join(str(x) for x in first["loc"][1:])
        return _error(422, "VALIDATION_ERROR", f"{field}: {first['msg']}")

    @app.exception_handler(PostgrestError)
    async def db_error(_: Request, e: PostgrestError):
        if e.code == "22P02":  # id 자리에 uuid가 아닌 글자 → 그런 데이터는 없음
            return _error(404, "NOT_FOUND", "요청한 데이터를 찾을 수 없어요.")
        logger.error("DB 에러 %s: %s", e.code, e.message)
        return _error(500, "DB_ERROR", "서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def page_params(page: int, size: int) -> tuple[int, int]:
    size = max(1, min(size, 50))
    start = max(page, 0) * size
    return start, start + size - 1


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def camel_keys(value):
    if isinstance(value, list):
        return [camel_keys(v) for v in value]
    if isinstance(value, dict):
        return {to_camel(k): camel_keys(v) for k, v in value.items()}
    return value
