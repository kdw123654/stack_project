from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common import ApiError, now_iso, ok
from app.db import db
from app.deps import get_current_user
from app.routers.job_postings import get_own_posting
from app.services.pptx_render import build_file
from app.services.storage import signed_url, upload_bytes

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


@router.put("/portfolios/{pf_id}/outline")
def reorder_outline(pf_id: str, body: OutlineUpdate, user: dict = Depends(get_current_user)):
    get_own_pf(pf_id, user["id"])
    outline = [{**s, "slideNo": i + 1} for i, s in enumerate(body.outline)]  # 번호 다시 매김
    return ok(update_pf(pf_id, {"outline": outline}))


@router.patch("/portfolios/{pf_id}/slides/{slide_no}")
def edit_slide(pf_id: str, slide_no: int, body: SlideEdit, user: dict = Depends(get_current_user)):
    pf = get_own_pf(pf_id, user["id"])
    slides = pf["slides"]
    target = next((s for s in slides if s["slideNo"] == slide_no), None)
    if target is None:
        raise ApiError(404, "SLIDE_NOT_FOUND", "슬라이드를 찾을 수 없어요.")
    target.update(body.model_dump(exclude_none=True))
    return ok(update_pf(pf_id, {"slides": slides}))


@router.post("/portfolios/{pf_id}/export")
def export(pf_id: str, body: ExportRequest, user: dict = Depends(get_current_user)):
    pf = get_own_pf(pf_id, user["id"])
    if not pf["slides"]:
        raise ApiError(400, "NO_SLIDES", "슬라이드 초안을 먼저 만들어 주세요.")
    fmt = body.format or pf["format"]
    try:
        path = build_file(pf["slides"], fmt)
    except Exception:
        raise ApiError(500, "EXPORT_FAILED", "파일을 만들지 못했어요.")
    storage_path = f"{user['id']}/exports/{pf_id}.{fmt.lower()}"
    upload_bytes(storage_path, path.read_bytes(), CONTENT_TYPES[fmt])
    db.table("portfolios").update({"export_path": storage_path}).eq("id", pf_id).execute()
    return ok({"format": fmt, "downloadUrl": signed_url(storage_path)})
