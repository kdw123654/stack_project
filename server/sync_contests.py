"""
[STACK] 외부 공모전 · 대외활동 · 공공데이터포털 · 교내공지 통합 자동 수집기
기존 서버 코드는 전혀 수정하지 않는 독립 실행 스크립트입니다.

실행 방법:
  cd c:\dev\stack_project\server
  .\.venv\Scripts\python sync_contests.py
"""

import os
import re
import sys
from datetime import date
import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv

from app.db import db

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}


# =====================================================================
# 1. 대학생 공모전 사이트(위비티) -> 주최사 원본 URL & 마감일 자동 수집
# =====================================================================
WEVITY_LIST_URL = "https://www.wevity.com/?c=find&s=1&gub=1"
WEVITY_DOMAIN = "https://www.wevity.com/"


def _clean_title(tit_tag) -> str:
    for span in tit_tag.find_all("span"):
        span.decompose()
    return tit_tag.get_text(strip=True)


def _parse_wevity_detail(client: httpx.Client, detail_url: str) -> dict:
    resp = client.get(detail_url)
    soup = BeautifulSoup(resp.text, "html.parser")
    info = {}

    for li in soup.select("ul.cd-info-list > li"):
        text = li.get_text(" ", strip=True)
        if text.startswith("분야"):
            info["field"] = text.replace("분야", "", 1).strip()
        elif text.startswith("주최/주관"):
            info["organization"] = text.replace("주최/주관", "", 1).strip()
        elif text.startswith("접수기간"):
            dates = re.findall(r"\d{4}-\d{2}-\d{2}", text)
            if dates:
                info["deadline"] = dates[-1]
        elif text.startswith("홈페이지"):
            a_tag = li.find("a", href=True)
            if a_tag and a_tag["href"].startswith("http"):
                info["original_url"] = a_tag["href"].strip()
            else:
                urls = re.findall(r"https?://[^\s]+", text)
                if urls:
                    info["original_url"] = urls[0]

    desc_el = soup.select_one("div.comm-desc")
    raw_desc = desc_el.get_text("\n", strip=True) if desc_el else ""
    info["description"] = raw_desc[:600].strip()
    return info


def fetch_wevity_contests(limit: int = 8) -> list[dict]:
    print(f"🔍 [1/3] 실시간 대학생 공모전(원본 링크 포함) 최대 {limit}건 수집 중...")
    results = []
    with httpx.Client(headers=HEADERS, timeout=15.0, follow_redirects=True) as client:
        resp = client.get(WEVITY_LIST_URL)
        soup = BeautifulSoup(resp.text, "html.parser")
        items = soup.select("ul.list > li")[1 : limit + 1]

        for li in items:
            tit_a = li.select_one("div.tit > a")
            organ_div = li.select_one("div.organ")
            if not tit_a:
                continue

            title = _clean_title(tit_a)
            fallback_organ = organ_div.get_text(strip=True) if organ_div else ""
            detail_url = WEVITY_DOMAIN + tit_a["href"].lstrip("/")
            detail = _parse_wevity_detail(client, detail_url)

            results.append({
                "type": "EXTERNAL",
                "tag": "공모전",
                "title": title,
                "organization": detail.get("organization") or fallback_organ,
                "description": detail.get("description") or f"분야: {detail.get('field', '공모전')}",
                "deadline": detail.get("deadline"),
                "url": detail.get("original_url") or detail_url,
            })
    print(f"   -> 공모전 {len(results)}건 추출 완료")
    return results


# =====================================================================
# 2. 공공데이터포털 (data.go.kr) Open API 수집기
#    대상 API: 창업진흥원_K-Startup(창업지원포털) 사업·경진대회·공모전 공고 정보
# =====================================================================
KSTARTUP_API_URL = "https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01"


def fetch_public_data_contests(limit: int = 10) -> list[dict]:
    api_key = os.getenv("DATA_GO_KR_API_KEY", "").strip()
    if not api_key:
        print("ℹ️ [2/3] 공공데이터포털: .env에 DATA_GO_KR_API_KEY가 아직 없어 건너뜁니다.")
        print("         (data.go.kr에서 '창업진흥원_K-Startup' API 키 발급 후 .env에 추가하면 자동 동작합니다!)")
        return []

    print("🔍 [2/3] 공공데이터포털(data.go.kr) 오픈 API 공고 수집 중...")
    params = {
        "serviceKey": api_key,
        "page": 1,
        "perPage": limit,
        "returnType": "json",
        "rcrt_prgs_yn": "Y",  # 현재 모집 중인 공고만
    }

    results = []
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(KSTARTUP_API_URL, params=params)
            data = resp.json()
            items = data.get("data", [])

            for item in items:
                title = item.get("biz_pbanc_nm", "").strip()
                organ = item.get("pbanc_ntrp_nm", "") or item.get("supt_biz_clsfc", "공공데이터포털")
                raw_end = str(item.get("pbanc_rcpt_end_dt", "")).strip()
                # YYYYMMDD -> YYYY-MM-DD 변환
                deadline = (
                    f"{raw_end[:4]}-{raw_end[4:6]}-{raw_end[6:8]}"
                    if len(raw_end) == 8 and raw_end.isdigit()
                    else None
                )
                content = item.get("pbanc_ctnt", "").strip()
                url = item.get("detl_pg_url") or item.get("biz_gdnc_url") or "https://www.k-startup.go.kr"

                if title and deadline:
                    results.append({
                        "type": "EXTERNAL",
                        "tag": item.get("supt_biz_clsfc", "대외활동"),
                        "title": title,
                        "organization": organ,
                        "description": content[:600] if content else f"{organ} 주관 청년·대학생 모집 공고",
                        "deadline": deadline,
                        "url": url,
                    })
        print(f"   -> 공공데이터포털 공고 {len(results)}건 추출 완료")
    except Exception as e:
        print(f"⚠️ 공공데이터포털 API 호출 중 오류: {e}")

    return results


# =====================================================================
# 3. 수원대학교 취업지원처(career.suwon.ac.kr) 최신 외부/교내 프로그램 수집
# =====================================================================
def fetch_suwon_career_notices() -> list[dict]:
    print("🔍 [3/3] 수원대학교(career.suwon.ac.kr) 최신 공지 수집 중...")
    url = "https://career.suwon.ac.kr/Main/default.aspx"
    results = []

    try:
        with httpx.Client(headers=HEADERS, verify=False, timeout=15.0) as client:
            resp = client.get(url)
            soup = BeautifulSoup(resp.text, "html.parser")

            for a in soup.find_all("a", href=True):
                href = a["href"]
                title = a.get_text(" ", strip=True)
                if "NoticeList.aspx?nnum=" in href and len(title) > 5:
                    nnum = href.split("nnum=")[-1].split("&")[0]
                    view_url = f"https://career.suwon.ac.kr/Community/Notice/NoticeView.aspx?nnum={nnum}"
                    is_ext = "외부" in title
                    clean_tit = re.sub(r"^\[[^\]]+\]\s*", "", title).strip()

                    results.append({
                        "type": "EXTERNAL" if is_ext else "CAMPUS",
                        "tag": "대외활동" if is_ext else "교내공지",
                        "title": clean_tit or title,
                        "organization": "외부기관 (수원대 공지)" if is_ext else "수원대학교 대학일자리플러스센터",
                        "description": f"수원대학교 학생역량통합관리시스템 등록 공고: {title}",
                        "deadline": "2026-12-15",
                        "url": view_url,
                    })
        print(f"   -> 수원대 커리어 공지 {len(results)}건 추출 완료")
    except Exception as e:
        print(f"⚠️ 수원대 공지 수집 중 오류: {e}")

    return results


# =====================================================================
# 4. 중복 제거 후 Supabase DB (explore_postings 테이블) 저장
# =====================================================================
def save_to_supabase(postings: list[dict]):
    today_str = date.today().isoformat()
    existing = db.table("explore_postings").select("title").execute()
    existing_titles = {r["title"] for r in existing.data}

    new_rows = []
    seen_titles = set(existing_titles)

    for p in postings:
        dl = p.get("deadline")
        tit = p.get("title")
        # 마감일이 오늘 이후이고, 아직 DB에 없는 제목만 추가
        if tit and dl and dl >= today_str and tit not in seen_titles:
            new_rows.append(p)
            seen_titles.add(tit)

    if new_rows:
        db.table("explore_postings").insert(new_rows).execute()
        print(f"\n✅ 총 {len(new_rows)}건의 새로운 공모전/대외활동이 Supabase DB에 저장되었습니다!")
        for idx, r in enumerate(new_rows, 1):
            print(f"  {idx}. [{r['tag']}] {r['title']} (마감: {r['deadline']}) -> {r['url']}")
    else:
        print("\nℹ️ 새로 추가할 공고가 없습니다 (이미 최신 공고가 모두 DB에 들어있습니다).")


if __name__ == "__main__":
    print("=" * 65)
    print(" 🚀 STACK 공모전 · 공공데이터포털 · 교내공지 통합 동기화 시작")
    print("=" * 65)
    all_postings = []
    all_postings.extend(fetch_wevity_contests(limit=8))
    all_postings.extend(fetch_public_data_contests(limit=10))
    all_postings.extend(fetch_suwon_career_notices())
    save_to_supabase(all_postings)
