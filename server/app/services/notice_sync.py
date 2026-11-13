import base64, json, logging, re, threading, time
from datetime import date, timedelta
from typing import NamedTuple
from urllib.parse import urljoin, urlsplit
import httpx
from bs4 import BeautifulSoup
from app.config import GEMINI_API_KEY, GEMINI_MODEL
from app.db import db

logger = logging.getLogger("stack.notice_sync")


class Board(NamedTuple):
    name: str
    host: str      # 수원대 사이트 주소 (모두 같은 게시판 프로그램을 써요)
    menuno: int
    boardno: int
    siteno: int
    picky: bool    # True면 제목에 진로 관련 단어가 있는 글만 읽어요 (글이 많고 섞여 있는 게시판)


# career.suwon.ac.kr 은 robots.txt가 막아 둬서 읽지 않아요.
BOARDS = [
    Board("취업공지", "www.suwon.ac.kr", 677, 670, 37, False),
    Board("창업공지", "www.suwon.ac.kr", 2258, 949, 37, False),
    Board("통합공지", "www.suwon.ac.kr", 674, 667, 37, True),
    Board("학과공지", "www.suwon.ac.kr", 676, 669, 37, True),
    Board("장학/대출", "www.suwon.ac.kr", 2041, 777, 37, False),
    Board("국제협력처공지", "www.suwon.ac.kr", 679, 672, 37, True),
    Board("창업지원단", "wow.suwon.ac.kr", 2361, 986, 55, False),
    Board("DS&ML센터", "dsml.suwon.ac.kr", 413, 852, 28, False),
    Board("학생생활상담연구소", "coun.suwon.ac.kr", 263, 857, 21, True),
    Board("사회봉사센터", "service.suwon.ac.kr", 393, 868, 27, False),
]
PAGES = 4
DELAY = 1.5
AI_DELAY = 15
KEEP_DAYS = 60
HEADERS = {"User-Agent": "STACK-notice-reader/1.0 (student project)"}
CAREER_WORDS = re.compile(r"취업|채용|인턴|현장실습|특강|비교과|공모전|모집|교육|멘토|설명회|박람회|서포터즈|대외활동|창업|자격증|현직자|직무|캠프|아카데미|계절학기"
                          r"|장학|교환학생|봉사|프로그램|참가자|참여자|워크숍|세미나|경진|해커톤|챌린지")
SKIP_WORDS = re.compile(r"뉴스레터|결과 ?발표|합격자|선정 ?결과|당첨자")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"


KINDS = ["채용", "인턴·현장실습", "특강·교육", "비교과", "공모전", "대외활동", "박람회·설명회", "창업", "기타"]
JOBS = ["경영·기획", "마케팅·홍보", "영업", "인사·총무", "재무·회계", "IT 개발", "데이터·AI", "디자인",
        "생산·품질", "연구개발", "공공·행정", "교육", "미디어·콘텐츠", "의료·보건"]
SCHEMA = {
    "type": "object",
    "properties": {
        "relevant": {"type": "boolean"},
        "kind": {"type": "string", "enum": KINDS},
        "isExternal": {"type": "boolean"},
        "organization": {"type": "string"},
        "deadline": {"type": "string"},
        "summary": {"type": "string"},
        "target": {"type": "string"},
        "jobTags": {"type": "array", "items": {"type": "string", "enum": JOBS}},
    },
    "required": ["relevant", "kind", "isExternal", "organization", "deadline", "summary", "target", "jobTags"],
}
PROMPT = """너는 대학생 취업 서비스의 공지 분류기야. 수원대학교 공지 하나를 읽고 JSON으로만 답해.
- relevant: 학생의 취업·진로·역량에 도움이 되는 기회(채용, 인턴, 특강, 교육, 비교과, 공모전, 대외활동, 설명회, 창업 지원,학사 일정, 장학,등록 등등)면 true.
 시설, 결과 발표, 뉴스레터, 단순 홍보면 false.
- deadline: 신청·접수 마감일을 YYYY-MM-DD로. 본문과 포스터 이미지를 모두 확인해. 연도가 없으면 게시일 기준으로 정해. 없으면 빈 문자열.
- organization: 주최 기관. 모르면 "수원대학교".
- summary: 무엇을, 누구에게, 어떤 혜택인지 60자 이내 한 문장.
- target: 대상(예: 전 학년, 3~4학년, 졸업예정자). 모르면 "제한 없음".
- jobTags: 관련 직무를 목록에서 최대 3개. 직무와 상관없으면(자소서 특강 등) 빈 배열.
- isExternal: 학교 밖 기관이 주최하면 true."""


class Ratelimited(Exception):
    pass


def detail_url(b: Board, bbsno: str) -> str:
    return f"https://{b.host}/index.html?menuno={b.menuno}&bbsno={bbsno}&boardno={b.boardno}&siteno={b.siteno}&act=view"

def list_page(client: httpx.Client, b: Board, page: int) -> list[dict]:
    r = client.get(f"https://{b.host}/index.html",
                   params={"menuno": b.menuno, "boardno": b.boardno, "siteno": b.siteno, "act": "list", "pageIndex": page})
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    items = []
    for a in soup.select("a[onclick*=\"'view'\"]"):
        m = re.search(r"'view',\s*(\d+)", a["onclick"])
        row = a.find_parent(["li", "tr"])  # 메인은 목록(li), 하위 사이트는 표(tr)
        posted = re.search(r"\d{4}-\d{2}-\d{2}", row.get_text()) if row else None
        if m and posted:
            items.append({"bbsno": m.group(1), "title": a.get_text(strip=True), "posted_at": posted.group(0)})
    return items

def read_detail(client: httpx.Client, url: str) -> tuple[str, list[str]]:
    r = client.get(url)
    r.raise_for_status()
    body = BeautifulSoup(r.text, "html.parser").select_one(".board_viewcont, td.content")
    if body is None:
        return "", []
    for sign in body.select("#signDiv"):
        sign.decompose()
    text = "\n".join(line.strip() for line in body.get_text("\n").splitlines() if line.strip())
    srcs = [urljoin(url, img["src"]) for img in body.select("img[src]")]
    images = [s for s in srcs if (urlsplit(s).hostname or "").endswith("suwon.ac.kr")]
    return text[:6000], images[:2]

def image_part(client: httpx.Client, src:str) -> dict | None:
     r = client.get(src)
     kind = r.headers.get("content-type", "").split(";")[0]
     if r.status_code != 200 or not kind.startswith("image/") or len(r.content) > 4_000_000:
        return None
     return {"type": "image_url", "image_url": {"url": f"data:{kind};base64,{base64.b64encode(r.content).decode()}"}}

def classify(client: httpx.Client, title: str, posted_at: str, text: str, images: list[str]) -> dict:
    content = [{"type": "text", "text": f"게시일: {posted_at}\n제목: {title}\n\n본문:\n{text or '(본문 없음, 포스터 참고)'}"}]
    content += [part for part in (image_part(client, src) for src in images) if part]
    body = {"model": GEMINI_MODEL,
            "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": content}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "notice", "schema": SCHEMA}}}
    r = httpx.post(GEMINI_URL, json=body, headers={"Authorization": f"Bearer {GEMINI_API_KEY}"}, timeout=90)
    if r.status_code == 429:
        raise Ratelimited
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])

def valid_date(value: str) -> str | None:
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        return None

def to_row(b: Board, item: dict, ai: dict) -> dict:
    return {
        "source": "suwon_main",
        "source_id": f"{b.boardno}:{item['bbsno']}",
        "posted_at": item["posted_at"],
        "relevant": ai["relevant"],
        "type": "EXTERNAL" if ai["isExternal"] else "CAMPUS",
        "tag": ai["kind"],
        "title": item["title"][:200],
        "organization": ai["organization"][:60],
        "description": ai["summary"][:120],
        "target": ai["target"][:40],
        "job_tags": [t for t in ai["jobTags"] if t in JOBS][:3],
        "deadline": valid_date(ai["deadline"]),
        "url": detail_url(b, item["bbsno"]),
    }


_lock = threading.Lock()

def sync_notices(max_new: int = 40) -> dict:
    if not _lock.acquire(blocking=False):
        return {'stopped': 'ALREADY_RUNNING'}
    try:
        seen = {r["source_id"] for r in db.table("explore_postings").select("source_id").eq("source", "suwon_main").execute().data}
        cutoff = (date.today() - timedelta(days=KEEP_DAYS)).isoformat()
        stats = {"checked": 0, "saved": 0, "relevant": 0, "stopped": None}
        with httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            for b in BOARDS:
                for page in range(1, PAGES + 1):
                    try:
                        items = list_page(client, b, page)
                    except httpx.HTTPError:
                        logger.warning("%s 목록 %d쪽을 못 읽었어요", b.name, page)
                        break
                    time.sleep(DELAY)
                    for item in items:
                        sid = f"{b.boardno}:{item['bbsno']}"
                        if sid in seen or item["posted_at"] < cutoff:
                            continue
                        seen.add(sid)
                        stats["checked"] += 1
                        if SKIP_WORDS.search(item["title"]):
                            continue
                        if b.picky and not CAREER_WORDS.search(item["title"]):
                            continue
                        if stats["saved"] >= max_new:
                            stats["stopped"] = "MAX_NEW"
                            return stats
                        try:
                            text, images = read_detail(client, detail_url(b, item["bbsno"]))
                            time.sleep(DELAY)
                            ai = classify(client, item["title"], item["posted_at"], text, images)
                        except Ratelimited:
                            stats["stopped"] = "RATE_LIMIT"
                            return stats
                        except httpx.HTTPError as e:
                            # 한 글이 느리거나 실패해도 전체를 멈추지 않아요. 저장 안 했으니 다음 실행 때 다시 시도해요.
                            logger.warning("%s '%s' 건너뜀: %s", b.name, item["title"][:30], type(e).__name__)
                            stats["skipped"] = stats.get("skipped", 0) + 1
                            continue
                        db.table("explore_postings").upsert(to_row(b, item, ai), on_conflict="source,source_id").execute()
                        stats["saved"] += 1
                        stats["relevant"] += ai["relevant"]
                        time.sleep(AI_DELAY)
        logger.info("공지 수집 완료 %s", stats)
        return stats
    except Exception:
        logger.exception("공지 수집 실패")
        raise
    finally:
        _lock.release()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(sync_notices(max_new=5))