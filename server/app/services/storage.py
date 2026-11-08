from app.common import ApiError
from app.config import STORAGE_BUCKET
from app.db import db


def bucket():
    return db.storage.from_(STORAGE_BUCKET)


def upload_bytes(path: str, data: bytes, content_type: str):
    bucket().upload(path, data, {"content-type": content_type, "upsert": "true"})


def signed_url(path: str, expires_in: int = 3600) -> str:
    return bucket().create_signed_url(path, expires_in)["signedURL"]


def download_file(file_id: str, user_id: str) -> tuple[bytes, str]:
    res = db.table("files").select("*").eq("id", file_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "FILE_NOT_FOUND", "파일을 찾을 수 없어요.")
    return bucket().download(res.data["storage_path"]), res.data["name"]


def remove_all_user_files(user_id: str):
    res = db.table("files").select("storage_path").eq("user_id", user_id).execute()
    paths = [row["storage_path"] for row in res.data]
    res = db.table("portfolios").select("export_path").eq("user_id", user_id).execute()
    paths += [row["export_path"] for row in res.data if row["export_path"]]
    if paths:
        bucket().remove(paths)
