import hmac

from fastapi import APIRouter, BackgroundTasks, Header
from app.common import ApiError, ok
from app.config import CRON_SECRET
from app.services.campuspick_sync import sync_campuspick
from app.services.contest_sync import sync_kstartup
from app.services.notice_sync import sync_notices

router = APIRouter(tags=['admin'])

@router.post("/admin/sync-notices", status_code=202)
def sync(background: BackgroundTasks, x_cron_secret: str = Header(default="")):
    if not CRON_SECRET or not hmac.compare_digest(x_cron_secret, CRON_SECRET):
        raise ApiError(401, "UNAUTHORIZED", "권한이 없어요.")
    background.add_task(sync_kstartup)
    background.add_task(sync_campuspick)
    background.add_task(sync_notices)
    return ok({"started": True})