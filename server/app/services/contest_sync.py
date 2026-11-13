"""공공데이터포털 K-Startup API → explore_postings 동기화.

창업진흥원이 공개한 '모집 중' 공고를 페이지 끝까지 전부 받아서,
대학생이 지원할 수 있고(서울·경기·전국) 학생에게 의미 있는 것만 저장해요.
"""
import html
import logging
import re
import threading

import httpx

from app.config import DATA_GO_KR_API_KEY
from app.db import db

logger = logging.getLogger("stack.contest_sync")

KSTARTUP_URL = "https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01"
PER_PAGE = 100
REGIONS = {"전국", "서울", "경기"}
SKIP_KINDS = {"시설ㆍ공간ㆍ보육", "융자ㆍ보증", "정책자금", "판로ㆍ해외진출"}
CONTEST_WORDS = re.compile(r"공모전|경진대회|대회|해커톤|챌린지|아이디어")
ONLY_COMPANY = re.compile(r"입주|입점|바우처|기업|IR|엔젤|투자|VC|팁스|TIPS|성과공유|수요조사|매장|사업자|R&D")
OTHER_REGIONS = re.compile(r"전북|전남|호남|충청|충남|충북|대전|세종|부산|대구|광주|울산|경남|경북|강원|제주")

_lock = threading.Lock()


def fetch_kstartup(api_key: str) -> list[dict]:
    items, page = [], 1
    with httpx.Client(timeout=30) as client:
        while True:
            r = client.get(KSTARTUP_URL, params={"serviceKey": api_key, "page": page, "perPage": PER_PAGE,
                                                 "returnType": "json", "cond[rcrt_prgs_yn::EQ]": "Y"})
            r.raise_for_status()
            data = r.json()
            items += data.get("data", [])
            if page * PER_PAGE >= data.get("matchCount", 0):
                return items
            page += 1


def to_date(value) -> str | None:
    text = str(value or "")
    return f"{text[:4]}-{text[4:6]}-{text[6:8]}" if re.fullmatch(r"\d{8}", text) else None


def for_students(item: dict) -> bool:
    title = item.get("biz_pbanc_nm") or ""
    return ("대학생" in (item.get("aply_trgt") or "")
            and item.get("supt_regin") in REGIONS
            and item.get("supt_biz_clsfc") not in SKIP_KINDS
            and not ONLY_COMPANY.search(title)
            and not OTHER_REGIONS.search(title + (item.get("pbanc_ntrp_nm") or "")))


def to_row(item: dict) -> dict:
    title = html.unescape(item["biz_pbanc_nm"]).strip()
    summary = html.unescape(item.get("pbanc_ctnt") or "").strip()
    return {
        "source": "kstartup",
        "source_id": str(item["pbanc_sn"]),
        "posted_at": to_date(item.get("pbanc_rcpt_bgng_dt")),
        "relevant": True,
        "type": "EXTERNAL",
        "tag": "공모전" if CONTEST_WORDS.search(title) else "창업",
        "title": title[:200],
        "organization": html.unescape(item.get("pbanc_ntrp_nm") or "창업진흥원")[:60],
        "description": (summary or html.unescape(item.get("supt_biz_clsfc") or ""))[:120],
        "target": html.unescape(item.get("aply_trgt_ctnt") or "대학생")[:40],
        "job_tags": ["경영·기획"],
        "deadline": to_date(item.get("pbanc_rcpt_end_dt")),
        "url": item.get("detl_pg_url"),
    }


def sync_kstartup() -> dict:
    if not DATA_GO_KR_API_KEY:
        return {"stopped": "NO_API_KEY"}
    if not _lock.acquire(blocking=False):
        return {"stopped": "ALREADY_RUNNING"}
    try:
        items = fetch_kstartup(DATA_GO_KR_API_KEY)
        rows = [to_row(i) for i in items if for_students(i)]
        rows = [r for r in rows if r["deadline"]]
        if rows:
            db.table("explore_postings").upsert(rows, on_conflict="source,source_id").execute()
        stats = {"fetched": len(items), "saved": len(rows)}
        logger.info("K-Startup 수집 완료 %s", stats)
        return stats
    except Exception:
        logger.exception("K-Startup 수집 실패")
        raise
    finally:
        _lock.release()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)  # 요청 주소에 인증키가 들어 있어서 로그에 안 찍히게
    print(sync_kstartup())
