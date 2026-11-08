import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile

from app.common import ApiError, ok
from app.db import db
from app.deps import get_current_user
from app.services.storage import bucket, signed_url, upload_bytes

router = APIRouter(tags=["files"])

MAX_FILES = 5
MAX_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED = {".ppt": "PPT", ".pptx": "PPTX", ".pdf": "PDF", ".doc": "DOC", ".docx": "DOCX",
           ".hwp": "HWP", ".hwpx": "HWPX", ".png": "IMAGE", ".jpg": "IMAGE", ".jpeg": "IMAGE"}


def to_api(row: dict) -> dict:
    return {"fileId": row["id"], "name": row["name"], "type": row["type"], "size": row["size"],
            "uploadedAt": row["uploaded_at"], "lastMode": row["last_mode"]}


@router.post("/files")
def upload(files: list[UploadFile], user: dict = Depends(get_current_user)):
    if len(files) > MAX_FILES:
        raise ApiError(400, "TOO_MANY_FILES", f"파일은 한 번에 {MAX_FILES}개까지 올릴 수 있어요.")

    checked = []
    for f in files:  # 먼저 전부 검사하고 나서 저장 (중간에 실패하면 아무것도 저장 안 됨)
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED:
            raise ApiError(400, "UNSUPPORTED_TYPE", f"지원하지 않는 형식이에요: {f.filename}")
        data = f.file.read()
        if len(data) > MAX_SIZE:
            raise ApiError(400, "FILE_TOO_LARGE", f"20MB를 넘는 파일이에요: {f.filename}")
        checked.append((f, ext, data))

    saved = []
    for f, ext, data in checked:
        file_id = str(uuid.uuid4())
        path = f"{user['id']}/{file_id}{ext}"
        upload_bytes(path, data, f.content_type or "application/octet-stream")
        row = db.table("files").insert({"id": file_id, "user_id": user["id"], "name": f.filename,
                                        "type": ALLOWED[ext], "size": len(data),
                                        "storage_path": path}).execute().data[0]
        saved.append(to_api(row))
    return ok({"files": saved})


@router.get("/files")
def recent_files(limit: int = 20, user: dict = Depends(get_current_user)):
    res = (db.table("files").select("*").eq("user_id", user["id"])
           .order("uploaded_at", desc=True).limit(min(limit, 50)).execute())
    return ok({"files": [to_api(r) for r in res.data]})


def get_own_file(file_id: str, user_id: str) -> dict:
    res = db.table("files").select("*").eq("id", file_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "FILE_NOT_FOUND", "파일을 찾을 수 없어요.")
    return res.data


@router.get("/files/{file_id}")
def file_detail(file_id: str, user: dict = Depends(get_current_user)):
    row = get_own_file(file_id, user["id"])
    return ok({**to_api(row), "downloadUrl": signed_url(row["storage_path"])})


@router.delete("/files/{file_id}")
def delete_file(file_id: str, user: dict = Depends(get_current_user)):
    row = get_own_file(file_id, user["id"])
    bucket().remove([row["storage_path"]])
    db.table("files").delete().eq("id", file_id).execute()
    return ok({"deleted": True})
