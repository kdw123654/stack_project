from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.common import ApiError, ok, now_iso
from app.db import auth_client, db
from app.deps import get_current_user
from app.routers.job_postings import get_own_posting, save_posting 

router = APIRouter(tags=["cover_letters"])

class CreateRequest(BaseModel):
    postingId: str


class AnswerEdit(BaseModel):
    content: str

def to_api(row: dict) -> dict:
    return {"id": row["id"], "postingId": row["posting_id"], "status": row["status"],
            "selections": row["selections"], "answers": row["answers"],
            "createdAt": row["created_at"], "updatedAt": row["updated_at"]}


def get_own_cl(cl_id: str, user_id: str) -> dict:
    res = db.table("cover_letters").select("*").eq("id", cl_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "COVER_LETTER_NOT_FOUND", "자소서를 찾을 수 없어요.")
    return res.data


def update_cl(cl_id: str, changes: dict) -> dict:
    """A도 부르는 함수: selections / answers / status 저장"""
    res = db.table("cover_letters").update({**changes, "updated_at": now_iso()}).eq("id", cl_id).execute()
    return to_api(res.data[0])

@router.post("/cover-letters")
def create(body: CreateRequest, user: dict = Depends(get_current_user)):
    get_own_posting(body.postingId, user["id"])
    row = db.table("cover_letters").insert({"user_id": user["id"], "posting_id": body.postingId}).execute().data[0]
    return ok(to_api(row))


@router.get("/cover-letters")
def list_mine(user: dict = Depends(get_current_user)):
    res = (db.table("cover_letters").select("*, job_postings(company, position)")
           .eq("user_id", user["id"]).order("updated_at", desc=True).execute())
    items = [{**to_api(r), "company": r["job_postings"]["company"], "position": r["job_postings"]["position"]}
             for r in res.data]
    return ok({"items": items})


@router.get("/cover-letters/{cl_id}")
def detail(cl_id: str, user: dict = Depends(get_current_user)):
    return ok(to_api(get_own_cl(cl_id, user["id"])))

@router.patch("/cover-letters/{cl_id}/answers/{order}")
def edit_answer(cl_id: str, order: int, body: AnswerEdit, user: dict = Depends(get_current_user)):
    cl = get_own_cl(cl_id, user["id"])
    answers = cl["answers"]
    target = next((a for a in answers if a["questionOrder"] == order), None)
    if target is None:
        raise ApiError(404, "ANSWER_NOT_FOUND", "해당 문항의 초안이 없어요.")
    target["content"] = body.content
    target["charCount"] = len(body.content)
    return ok(update_cl(cl_id, {"answers": answers}))


@router.post("/cover-letters/{cl_id}/save")
def save(cl_id: str, user: dict = Depends(get_current_user)):
    get_own_cl(cl_id, user["id"])
    return ok(update_cl(cl_id, {"status": "SAVED"}))