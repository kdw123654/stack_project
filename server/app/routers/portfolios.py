from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, Response
from typing import Annotated
from pydantic import BaseModel, Field

from app.common import ApiError, now_iso, ok
from app.db import db
from app.deps import get_current_user
from app.routers.job_postings import get_own_posting
from app.services.pptx_render import build_file
from app.services.storage import signed_url, upload_bytes
from app.schemas.generated import SlidesImport, SingleSlideImport
from app.services.generated import check_replay, convert_slides, payload_hash, persist_import
from app.services.portfolio_images import MAX_IMAGE_BYTES, image_loader, store_image

router = APIRouter(tags=["portfolios"])

CONTENT_TYPES = {"PDF": "application/pdf",
                 "PPTX": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}


class CreateRequest(BaseModel):
    postingId: str
    length: Literal["SHORT_6", "BASIC_10", "DETAIL_14"] = "BASIC_10"
    format: Literal["PDF", "PPTX"] = "PDF"


class OutlineUpdate(BaseModel):
    outline: list[dict]  # 순서를 바꾸거나 뺀 구성안 전체


class SlideEdit(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    metrics: Optional[list[dict]] = None
    imageIds: Optional[list[str]] = Field(default=None, max_length=4)
    chartData: Optional[list[dict]] = Field(default=None, max_length=4)


class ExportRequest(BaseModel):
    format: Optional[Literal["PDF", "PPTX"]] = None


def to_api(row: dict) -> dict:
    return {"id": row["id"], "postingId": row["posting_id"], "length": row["length"],
            "format": row["format"], "experienceIds": row["experience_ids"], "outline": row["outline"],
            "slides": row["slides"], "createdAt": row["created_at"], "updatedAt": row["updated_at"]}


def get_own_pf(pf_id: str, user_id: str) -> dict:
    res = db.table("portfolios").select("*").eq("id", pf_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "PORTFOLIO_NOT_FOUND", "포트폴리오를 찾을 수 없어요.")
    return res.data


def update_pf(pf_id: str, changes: dict) -> dict:
    """A도 부르는 함수: experience_ids / outline / slides 저장"""
    res = db.table("portfolios").update({**changes, "updated_at": now_iso()}).eq("id", pf_id).execute()
    return to_api(res.data[0])


@router.post("/portfolios")
def create(body: CreateRequest, user: dict = Depends(get_current_user)):
    get_own_posting(body.postingId, user["id"])
    row = db.table("portfolios").insert({"user_id": user["id"], "posting_id": body.postingId,
                                         "length": body.length, "format": body.format}).execute().data[0]
    return ok(to_api(row))


@router.get("/portfolios")
def list_mine(user: dict = Depends(get_current_user)):
    res = db.table("portfolios").select("*").eq("user_id", user["id"]).order("updated_at", desc=True).execute()
    return ok({"items": [to_api(r) for r in res.data]})


@router.get("/portfolios/{pf_id}")
def detail(pf_id: str, user: dict = Depends(get_current_user)):
    return ok(to_api(get_own_pf(pf_id, user["id"])))


@router.put("/portfolios/{pf_id}/slides")
def import_slides(pf_id: str, body: SlidesImport, user: dict = Depends(get_current_user)):
    pf = get_own_pf(pf_id, user["id"])
    if check_replay(pf, body.sourceTaskId, payload_hash(body)):
        return ok({**to_api(pf), "sourceTaskId": body.sourceTaskId, "reused": True})
    expected = {"SHORT_6": 6, "BASIC_10": 10, "DETAIL_14": 14}[pf["length"]]
    if body.size != expected:
        raise ApiError(422, "SLIDE_COUNT_MISMATCH", "포트폴리오 프로젝트의 분량과 생성 결과가 다릅니다.")
    slides, outline, ids = convert_slides(body, user["id"])
    row, reused = persist_import("portfolios", pf, user["id"], body,
                                 {"slides": slides, "outline": outline, "experience_ids": ids, "export_path": None})
    return ok({**to_api(row), "sourceTaskId": body.sourceTaskId, "reused": reused})


@router.put("/portfolios/{pf_id}/outline")
def reorder_outline(pf_id: str, body: OutlineUpdate, user: dict = Depends(get_current_user)):
    get_own_pf(pf_id, user["id"])
    outline = [{**s, "slideNo": i + 1} for i, s in enumerate(body.outline)]  # 번호 다시 매김
    return ok(update_pf(pf_id, {"outline": outline}))


@router.put("/portfolios/{pf_id}/slides/{slide_no}/generated")
def import_single_slide(pf_id: str, slide_no: int, body: SingleSlideImport, user: dict = Depends(get_current_user)):
    pf = get_own_pf(pf_id, user["id"])
    if check_replay(pf, body.sourceTaskId, payload_hash(body)):
        return ok({**to_api(pf), "sourceTaskId": body.sourceTaskId, "reused": True})
    position = next((i for i, s in enumerate(pf["slides"]) if s["slideNo"] == slide_no), None)
    if position is None:
        raise ApiError(404, "SLIDE_NOT_FOUND", "해당 슬라이드가 없습니다.")
    if pf["slides"][position].get("id") != body.slide.id:
        raise ApiError(409, "SLIDE_ID_MISMATCH", "슬라이드 순서나 ID가 바뀌었습니다. 다시 조회해 주세요.")
    converted, outline, _ = convert_slides(body, user["id"])
    converted[0]["slideNo"] = slide_no
    slides = list(pf["slides"])
    slides[position] = converted[0]
    new_outline = [dict(s) for s in pf["outline"]]
    for item in new_outline:
        if item.get("id") == body.slide.id or item.get("slideNo") == slide_no:
            item.update({**outline[0], "slideNo": slide_no})
    refs = sorted({ref for s in slides for ref in s.get("sourceExperienceIds", [])})
    row, reused = persist_import("portfolios", pf, user["id"], body,
                                 {"slides": slides, "outline": new_outline, "experience_ids": refs, "export_path": None})
    return ok({**to_api(row), "sourceTaskId": body.sourceTaskId, "reused": reused})


@router.patch("/portfolios/{pf_id}/slides/{slide_no}")
def edit_slide(pf_id: str, slide_no: int, body: SlideEdit, user: dict = Depends(get_current_user)):
    pf = get_own_pf(pf_id, user["id"])
    slides = pf["slides"]
    target = next((s for s in slides if s["slideNo"] == slide_no), None)
    if target is None:
        raise ApiError(404, "SLIDE_NOT_FOUND", "슬라이드를 찾을 수 없어요.")
    target.update(body.model_dump(exclude_none=True))
    return ok(update_pf(pf_id, {"slides": slides, "export_path": None}))


@router.post("/portfolios/{pf_id}/export")
def export(pf_id: str, body: ExportRequest, user: dict = Depends(get_current_user)):
    pf = get_own_pf(pf_id, user["id"])
    if not pf["slides"]:
        raise ApiError(400, "NO_SLIDES", "슬라이드 초안을 먼저 만들어 주세요.")
    fmt = body.format or pf["format"]
    load_image = image_loader(pf, user["id"])
    for slide in pf["slides"]:
        for image_id in slide.get("imageIds", []):
            load_image(image_id)
    try:
        path = build_file(pf["slides"], fmt, image_loader=load_image)
    except ValueError as error:
        raise ApiError(422, "INVALID_SLIDE_VISUALS", str(error)) from None
    except Exception:
        raise ApiError(500, "EXPORT_FAILED", "파일을 만들지 못했어요.")
    storage_path = f"{user['id']}/exports/{pf_id}.{fmt.lower()}"
    try:
        upload_bytes(storage_path, path.read_bytes(), CONTENT_TYPES[fmt])
    finally:
        import shutil
        shutil.rmtree(path.parent, ignore_errors=True)
    db.table("portfolios").update({"export_path": storage_path}).eq("id", pf_id).execute()
    return ok({"format": fmt, "downloadUrl": signed_url(storage_path)})


@router.post("/portfolios/{pf_id}/images")
def upload_image(pf_id: str, imageId: Annotated[str, Form(min_length=1, max_length=128)],
                 file: Annotated[UploadFile, File()], user: dict = Depends(get_current_user)):
    pf = get_own_pf(pf_id, user["id"])
    try:
        content = file.file.read(MAX_IMAGE_BYTES + 1)
    finally:
        file.file.close()
    return ok(store_image(pf, user["id"], imageId, content))


@router.get("/portfolios/{pf_id}/images/{image_id}")
def get_image(pf_id: str, image_id: str, user: dict = Depends(get_current_user)):
    pf = get_own_pf(pf_id, user["id"])
    return Response(content=image_loader(pf, user["id"])(image_id), media_type="image/png",
                    headers={"Cache-Control": "no-store"})
