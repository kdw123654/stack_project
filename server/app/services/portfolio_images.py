import hashlib
from io import BytesIO
import logging
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError

from app.common import ApiError, now_iso
from app.db import db
from app.services.storage import bucket, upload_bytes

MAX_IMAGE_BYTES = 2 * 1024 * 1024
logger = logging.getLogger("stack")


def normalize_image(data):
    if len(data) > MAX_IMAGE_BYTES:
        raise ApiError(413, "IMAGE_TOO_LARGE", "이미지는 최대 2MiB까지 업로드할 수 있습니다.")
    try:
        with Image.open(BytesIO(data)) as original:
            if original.width * original.height > 20000000:
                raise ValueError
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((2000, 2000))
            output = BytesIO()
            image.save(output, format="PNG")
            if len(output.getvalue()) > MAX_IMAGE_BYTES:
                raise ValueError
            return output.getvalue(), image.width, image.height
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        raise ApiError(422, "INVALID_IMAGE", "이미지를 읽을 수 없거나 크기가 너무 큽니다.") from None


def store_image(pf, user_id, image_id, content):
    if not image_id.strip() or image_id not in {key for s in pf["slides"] for key in s.get("imageIds", [])}:
        raise ApiError(422, "IMAGE_NOT_SELECTED", "저장된 슬라이드가 사용하는 이미지 ID를 보내 주세요.")
    data, width, height = normalize_image(content)
    digest = hashlib.sha256(data).hexdigest()
    assets = dict(pf.get("image_assets") or {})
    previous = assets.get(image_id)
    if previous and previous.get("sha256") == digest:
        return {"imageId": image_id, "width": width, "height": height, "reused": True}
    retired = list(previous.get("retiredPaths", [])) if previous else []
    if previous:
        retired.append(previous["storagePath"])
    if len(retired) >= 250 or len(assets) >= 50 and image_id not in assets:
        raise ApiError(409, "IMAGE_HISTORY_LIMIT", "프로젝트 이미지 저장 한도에 도달했습니다.")
    path = f"{user_id}/exports/{pf['id']}/images/{uuid.uuid4()}.png"
    upload_bytes(path, data, "image/png")
    assets[image_id] = {"storagePath": path, "sha256": digest, "width": width, "height": height,
                        "retiredPaths": retired}
    try:
        result = (db.table("portfolios").update({"image_assets": assets, "export_path": None, "updated_at": now_iso()})
                  .eq("id", pf["id"]).eq("user_id", user_id).eq("updated_at", pf["updated_at"]).execute())
        if not result.data:
            raise ApiError(409, "VERSION_CONFLICT", "프로젝트가 변경되었습니다. 이미지를 다시 저장해 주세요.")
    except Exception:
        try:
            bucket().remove([path])
        except Exception:
            logger.error("portfolio_image_upload_cleanup_failed portfolio_id=%s", pf["id"])
        raise
    if previous:
        try:
            bucket().remove([previous["storagePath"]])
        except Exception:
            logger.warning("portfolio_image_retired_cleanup_pending portfolio_id=%s", pf["id"])
    return {"imageId": image_id, "width": width, "height": height, "reused": False}


def image_loader(pf, user_id):
    assets = pf.get("image_assets") or {}
    cache = {}
    prefix = f"{user_id}/exports/{pf['id']}/images/"
    def load(image_id):
        asset = assets.get(image_id)
        if not asset or not asset.get("storagePath", "").startswith(prefix):
            raise ApiError(409, "IMAGE_NOT_UPLOADED", "슬라이드 이미지를 먼저 B에 업로드해 주세요.")
        if image_id not in cache:
            try:
                data = bucket().download(asset["storagePath"])
                if len(data) > MAX_IMAGE_BYTES:
                    raise ValueError
                cache[image_id] = data
            except Exception:
                raise ApiError(502, "IMAGE_DOWNLOAD_FAILED", "저장된 이미지를 불러오지 못했습니다.") from None
        return cache[image_id]
    return load
