"""캠퍼스픽 공모전·대외활동·연합동아리 → explore_postings 동기화.

캠퍼스픽 운영자 허락을 받고 수집해요. robots.txt가 허용하는 상세 페이지만,
사이트맵에 나온 최신 글부터 천천히(요청 사이 DELAY초) 읽어요.
상세 페이지 안에 들어 있는 데이터(JSON)에서 제목·주최·기간만 꺼내고, 링크는 캠퍼스픽 원문으로 걸어요.
"""
import html
import json
import logging
import re
import threading
import time
from datetime import date

import httpx

from app.db import db
from app.services.job_match import job_categories

logger = logging.getLogger("stack.campuspick_sync")

SITE = "https://www.campuspick.com"
HEADERS = {"User-Agent": "STACK-notice-reader/1.0 (student project)"}
DELAY = 1.5
MAX_PER_KIND = 200      # 한 번 실행에 종류별로 최대 몇 개 상세 페이지를 읽을지
STOP_AFTER_EXPIRED = 25  # 마감 지난 글이 연속 이만큼 나오면 그 종류는 그만 읽어요 (사이트맵은 최신순)
CLUB_REGIONS = {1, 99}  # 1: 서울·수도권, 99: 전국·온라인

# 이름·소개에 이 단어가 있으면 그 분야로. 못 정하면 캠퍼스픽 분야 번호로.
CLUB_WORDS = [
    ("IT·개발", r"개발|코딩|프로그래밍|IT|앱|웹|AI|인공지능|데이터|해커톤|게임 ?개발"),
    ("봉사", r"봉사"),
    ("어학", r"영어|회화|언어교환|일본어|중국어|스페인어|외국어|토익|토플"),
    ("종교", r"기독|교회|불교|성경|가톨릭|천주교"),
    ("체육", r"축구|농구|야구|배드민턴|테니스|볼링|러닝|등산|클라이밍|주짓수|복싱|수영|스키|보드|헬스|골프|탁구|풋살|배구|체육|스포츠"),
    ("문화·예술", r"밴드|댄스|노래|합창|사진|영화|연극|뮤지컬|미술|그림|공연|음악|힙합|아카펠라|독립영화|예술"),
    ("창업·경영", r"창업|경영|마케팅|광고|금융|투자|주식|컨설팅|비즈니스"),
    ("학술·교양", r"토론|독서|발표|강연|학술|스터디|연구|포럼|기자|저널"),
    ("친목", r"친목|여행|맛집|보드게임"),
]
CLUB_CATEGORY_IDS = {1: "문화·예술", 3: "학술·교양", 6: "체육"}
# "대구 대학(원)생", "대경권 캠퍼스"처럼 다른 지역 대학생만 낼 수 있는 공고 (이름에 지역명만 들어간 전국 공고는 통과)
REGIONAL_ONLY = re.compile(r"(대경권|영남권|호남권|충청권|동남권)|(전북|전남|충남|충북|대전|세종|부산|대구|광주|울산|경남|경북|강원|제주)"
                           r"(지역|·경북|·경남)?\s*(소재\s*)?(대학|캠퍼스|청년)")

_lock = threading.Lock()


def sitemap_ids(client: httpx.Client) -> dict[str, list[str]]:
    xml = client.get(f"{SITE}/sitemap.xml").text
    return {kind: re.findall(rf"/{kind}/view\?id=(\d+)", xml) for kind in ("contest", "activity", "club")}


def page_data(html: str, key: str) -> dict | None:
    """상세 페이지 안에 들어 있는 "key":{...} JSON을 꺼내요."""
    start = html.find(f'"{key}":{{')
    if start < 0:
        return None
    return json.JSONDecoder().raw_decode(html[start + len(key) + 3:])[0]


def valid_date(value) -> str | None:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError:
        return None


EMOJI = re.compile(r"[\U0001F000-\U0001FAFF☀-➿️‍]")


def clean(text: str) -> str:
    """HTML 기호(&lt; 등)를 글자로 바꾸고 이모지를 빼요."""
    return re.sub(r"\s+", " ", EMOJI.sub("", html.unescape(text or ""))).strip()


def short(text: str, limit: int = 120) -> str:
    lines = [clean(ln).strip(" ■□▶●-*·") for ln in html.unescape(text or "").splitlines()]
    return " ".join(ln for ln in lines if ln)[:limit]


def club_category(name: str, title: str, category_id: int) -> str:
    text = f"{name} {title}"
    for category, words in CLUB_WORDS:
        if re.search(words, text, re.IGNORECASE):
            return category
    return CLUB_CATEGORY_IDS.get(category_id, "기타")


def norm(name: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]", "", (name or "").lower())


def to_row(kind: str, item_id: str, html: str) -> dict | None:
    url = f"{SITE}/{kind}/view?id={item_id}"
    base = {"source": "campuspick", "source_id": f"{kind}:{item_id}", "relevant": True, "type": "EXTERNAL", "url": url}
    if kind == "club":
        club, recruit = page_data(html, "club"), page_data(html, "recruit")
        if not club or not recruit or club.get("localId") not in CLUB_REGIONS:
            return None
        return {**base, "tag": "연합동아리",
                "title": clean(recruit.get("title") or club["name"])[:200],
                "organization": clean(club["name"])[:60],
                "description": short(recruit.get("title") or club.get("description") or ""),
                "category": club_category(club["name"], recruit.get("title") or "", club.get("categoryId")),
                "target": "수도권 대학생" if club.get("localId") == 1 else "전국 대학생",
                "job_tags": [],
                "posted_at": valid_date(recruit.get("startDate")),
                "deadline": valid_date(recruit.get("endDate"))}
    act = page_data(html, "activity")
    if not act:
        return None
    title = re.sub(r"^\[[^\]]*\]\s*", "", clean(act["title"]))  # "[대외활동/공모전] " 같은 머리말 빼기
    company = clean(act.get("company") or "")
    if REGIONAL_ONLY.search(title):
        return None  # 다른 지역 대학생 전용 (수원대 학생은 못 내요)
    return {**base, "tag": "공모전" if kind == "contest" else "대외활동",
            "title": title[:200],
            "organization": company[:60],
            "description": short(act.get("description") or ""),
            "target": "대학생",
            "job_tags": sorted(job_categories(title))[:3],
            "posted_at": valid_date(act.get("start_date")) or valid_date(act.get("created_at")),
            "deadline": valid_date(act.get("end_date"))}


def sync_campuspick() -> dict:
    if not _lock.acquire(blocking=False):
        return {"stopped": "ALREADY_RUNNING"}
    try:
        today = date.today().isoformat()
        seen = {r["source_id"] for r in db.table("explore_postings").select("source_id")
                .eq("source", "campuspick").execute().data}
        # 화면 캡처로 직접 넣었던 동아리(source=manual)와 같은 동아리면 새로 넣지 않고 링크·마감일만 채워요.
        manual = {norm(r["organization"]): r["id"] for r in db.table("explore_postings").select("id, organization")
                  .eq("source", "manual").eq("tag", "연합동아리").execute().data}
        stats = {}
        with httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            for kind, ids in sitemap_ids(client).items():
                s = {"read": 0, "saved": 0, "matched_manual": 0, "skipped": 0}
                expired_run = 0
                for item_id in ids:
                    if f"{kind}:{item_id}" in seen:
                        continue
                    if s["read"] >= MAX_PER_KIND or expired_run >= STOP_AFTER_EXPIRED:
                        break
                    try:
                        html = client.get(f"{SITE}/{kind}/view", params={"id": item_id}).text
                    except httpx.HTTPError:
                        s["skipped"] += 1
                        continue
                    finally:
                        time.sleep(DELAY)
                    s["read"] += 1
                    row = to_row(kind, item_id, html)
                    if not row or not row["deadline"]:
                        s["skipped"] += 1
                        continue
                    if row["deadline"] < today:
                        expired_run += 1
                        continue
                    expired_run = 0
                    name = norm(row["organization"])
                    match = next((rid for key, rid in manual.items()
                                  if key == name or (len(key) >= 4 and len(name) >= 4 and (key in name or name in key))),
                                 None) if kind == "club" else None
                    if match:
                        db.table("explore_postings").update({"url": row["url"], "deadline": row["deadline"]}).eq("id", match).execute()
                        s["matched_manual"] += 1
                        continue
                    db.table("explore_postings").upsert(row, on_conflict="source,source_id").execute()
                    s["saved"] += 1
                stats[kind] = s
        logger.info("캠퍼스픽 수집 완료 %s", stats)
        return stats
    except Exception:
        logger.exception("캠퍼스픽 수집 실패")
        raise
    finally:
        _lock.release()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    print(sync_campuspick())
