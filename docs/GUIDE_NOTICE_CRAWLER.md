# 학교 공지 자동 수집기 만들기 (메인 홈페이지 → 교내외 공고)

## 이 문서 읽는 법

- 코드 블록은 **직접 쳐요.**
- 📖 설명 / 🤔 왜 / 🏢 현업
- 순서: **STEP 1 DB → STEP 2 설정 → STEP 3 수집기 → STEP 4 로컬 테스트 → STEP 5 조회 API → STEP 6 실행 버튼(API) → STEP 7 자동 실행(GitHub Actions)**
- 이 문서의 코드는 실제 학교 사이트와 Gemini로 미리 돌려 봤어요. 취업공지 4건을 읽어서 마감일까지 뽑히는 걸 확인했어요.

---

## 0. 전체 흐름

```
[6시간마다] GitHub Actions ──POST /api/v1/admin/sync-notices (비밀 헤더)──▶ B 서버
                                                                      │
   ┌──────────────────────────────────────────────────────────────────┘
   ▼
① 게시판 목록 1~4쪽 읽기 (취업공지 · 통합공지 · 창업공지)
② 이미 저장한 글이면 건너뛰기  ← 새 글만 처리
③ 새 글이면 상세 페이지 열기 → 본문 글자 + 포스터 이미지
④ Gemini에게 "취업에 도움 되는 글이야? 마감일은? 한 줄 요약은?" 질문
⑤ explore_postings 표에 저장 (같은 글이면 덮어쓰기)
   ▼
학생이 탐색 탭 열면 → 마감 안 지난 공고만 보여 줌
```

### 지켜야 할 것

| 원칙 | 이유 |
|---|---|
| **career.suwon.ac.kr은 긁지 않아요** | 그 사이트의 robots.txt가 `Disallow: /`예요. 로봇 접근을 거부한다는 뜻이에요. |
| 요청 사이에 1.5초 쉬기 | 학교 서버에 부담을 주지 않으려고요. |
| 새 글만 상세를 열기 | 6시간마다 수백 번씩 요청하지 않게요. 보통은 목록 12번만 요청하고 끝나요. |
| **제목, 요약, 마감일, 링크만 저장** | 본문 전체를 복사해 두면 저작권 문제가 생길 수 있어요. 자세한 내용은 "원문 보기"로 학교 페이지에 가서 봐요. |
| User-Agent에 우리 서비스 이름 넣기 | 학교 쪽에서 누가 접속했는지 알 수 있게 해요. 숨기지 않아요. |

- 🏢 크롤러를 만들 때 현업에서도 지키는 기본 예절이에요. robots.txt 확인, 요청 간격, 변경분만 수집(incremental crawl).

### 학교 게시판 구조 (직접 확인한 것)

| 게시판 | menuno | boardno |
|---|---|---|
| 취업공지 | 677 | 670 |
| 통합공지 | 674 | 667 |
| 창업공지 | 2258 | 949 |

- 목록 N쪽: `https://www.suwon.ac.kr/index.html?menuno=677&boardno=670&siteno=37&act=list&pageIndex=2`
- 글 하나: `https://www.suwon.ac.kr/index.html?menuno=677&bbsno=2918&boardno=670&siteno=37&act=view`
- 목록의 글 링크: `<a onclick="return submitForm(this,'view',2918);">제목</a>`, 그 옆 `<span class="date">2026-10-16</span>`
- 상세 본문: `<div class="board_viewcont">` 안. 포스터는 그 안의 `<img>`예요.
- **"공지"로 고정된 글은 모든 쪽에 반복해서 나와요.** 그래서 이미 본 글 번호는 건너뛰어요.

---

## STEP 1. DB에 열 추가 (Supabase SQL Editor에서 실행)

```sql
alter table explore_postings
  add column if not exists source text,
  add column if not exists source_id text,
  add column if not exists posted_at date,
  add column if not exists relevant boolean not null default true,
  add column if not exists target text,
  add column if not exists job_tags text[] not null default '{}';

create unique index if not exists explore_postings_source_uq on explore_postings (source, source_id);
```

| 열 | 뜻 |
|---|---|
| `source` | 어디서 가져왔는지 (`suwon_main`) |
| `source_id` | 그 사이트에서의 글 번호 (`670:2918` = 게시판 670의 2918번 글) |
| `posted_at` | 학교 게시일 |
| `relevant` | 취업·진로에 도움 되는 글인지. 아니면 `false`로 저장하고 화면에는 안 보여 줘요 |
| `target` | 대상 (예: 3~4학년) |
| `job_tags` | 관련 직무 (예: `{데이터·AI, IT 개발}`). 다음에 만들 **공고 적합도**에 써요 |

- 🤔 **관련 없는 글도 저장하는 이유:** `relevant=false`로라도 저장해 둬야 다음 실행 때 "이미 본 글"로 건너뛰어요. 저장 안 하면 6시간마다 같은 장학금 공지를 또 열고 Gemini에게 또 물어봐요.
- 📖 `unique index (source, source_id)`: 같은 글이 두 번 들어가지 않게 막아요. 아래 `upsert`가 이걸 보고 "있으면 고치고, 없으면 넣기"를 해요.
- 이 SQL은 `server/sql/09_notice_crawler.sql`로도 저장해 두세요. 팀원이 같은 DB 구조를 만들 수 있게요.

---

## STEP 2. 설정 추가

### `server/.env`에 세 줄

```
GEMINI_API_KEY=(루트 .env에 넣은 것과 같은 키)
GEMINI_MODEL=gemini-3.1-flash-lite
CRON_SECRET=(아무도 못 맞힐 긴 문자열)
```

`CRON_SECRET`은 터미널에서 이렇게 만들어요.

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

- 🤔 **B 서버는 `server/.env`만 읽어요.** 루트 `.env`의 Gemini 키를 B가 못 보니까 여기에도 넣어요.
- 📖 `CRON_SECRET`: 수집 API를 아무나 부르지 못하게 하는 비밀번호예요. GitHub Actions만 이 값을 알아요.
- `.env.example`의 B 부분에도 `GEMINI_API_KEY=`, `GEMINI_MODEL=gemini-3.1-flash-lite`, `CRON_SECRET=`을 **값 없이** 추가해 두세요.

### `server/app/config.py` 맨 아래에 세 줄

```python
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
CRON_SECRET = os.getenv("CRON_SECRET", "")
```

---

## STEP 3. 새 파일 `server/app/services/notice_sync.py`

### 3-① import와 설정값

```python
import base64
import json
import logging
import re
import threading
import time
from datetime import date, timedelta
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup

from app.config import GEMINI_API_KEY, GEMINI_MODEL
from app.db import db

logger = logging.getLogger("stack.notice_sync")

BASE = "https://www.suwon.ac.kr/index.html"
BOARDS = [("취업공지", 677, 670), ("통합공지", 674, 667), ("창업공지", 2258, 949)]
PAGES = 4
DELAY = 1.5
AI_DELAY = 4
KEEP_DAYS = 60
HEADERS = {"User-Agent": "STACK-notice-reader/1.0 (student project)"}
CAREER_WORDS = re.compile(r"취업|채용|인턴|현장실습|특강|비교과|공모전|모집|교육|멘토|설명회|박람회|서포터즈|대외활동|창업|자격증|현직자|직무|캠프|아카데미")
SKIP_WORDS = re.compile(r"뉴스레터|결과 ?발표|합격자|선정 ?결과|당첨자")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
```

- 📖 `BOARDS`: (이름, menuno, boardno) 묶음이에요. 게시판을 늘리려면 여기에 한 줄만 추가하면 돼요.
- 📖 `KEEP_DAYS = 60`: 60일보다 오래된 글은 안 봐요. 4쪽 안에 1년 전 글이 섞여 있어도 무시해요.
- 📖 `AI_DELAY = 4`: Gemini 무료 등급은 1분에 15번 정도까지 돼요. 4초씩 쉬면 1분에 15번을 넘지 않아요.
- 📖 `CAREER_WORDS`: **통합공지에만** 쓰는 1차 거름망이에요. 통합공지는 한 쪽에 38개씩이고 계절학기, 교직과정 같은 학사 공지가 대부분이에요. 이런 글까지 Gemini에게 물어보면 무료 한도가 금방 차요. 제목에 취업 관련 단어가 있는 글만 AI에게 보내요.
- 📖 `SKIP_WORDS`: 뉴스레터나 결과 발표는 기회가 아니에요. AI에게 묻지 않고 바로 건너뛰어요. 테스트 때 Gemini가 뉴스레터를 "관련 있음"으로 분류해서 넣었어요.

### 3-② Gemini에게 물어볼 형식

```python
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
- relevant: 학생의 취업·진로·역량에 도움이 되는 기회(채용, 인턴, 특강, 교육, 비교과, 공모전, 대외활동, 설명회, 창업 지원)면 true.
  학사 일정, 장학, 등록, 시설, 결과 발표, 뉴스레터, 단순 홍보면 false.
- deadline: 신청·접수 마감일을 YYYY-MM-DD로. 본문과 포스터 이미지를 모두 확인해. 연도가 없으면 게시일 기준으로 정해. 없으면 빈 문자열.
- organization: 주최 기관. 모르면 "수원대학교".
- summary: 무엇을, 누구에게, 어떤 혜택인지 60자 이내 한 문장.
- target: 대상(예: 전 학년, 3~4학년, 졸업예정자). 모르면 "제한 없음".
- jobTags: 관련 직무를 목록에서 최대 3개. 직무와 상관없으면(자소서 특강 등) 빈 배열.
- isExternal: 학교 밖 기관이 주최하면 true."""
```

- 📖 `SCHEMA`: Gemini에게 **이 모양의 JSON으로만 답하라**고 정해 주는 틀이에요. `enum`은 "이 목록 안에서만 골라"예요. 그래서 "취업 특강", "특강(교육)" 같은 제각각인 답이 안 나와요.
- 🤔 **직무 목록(`JOBS`)을 고정하는 이유:** 나중에 "내 희망 직무와 맞는 공고"를 찾을 때 글자가 정확히 같아야 비교할 수 있어요. 프론트의 희망 직무 선택지도 이 목록과 맞추면 좋아요.
- 🏢 이걸 **Structured Output(구조화 출력)** 이라고 해요. AI 답을 사람이 읽는 문장이 아니라 프로그램이 바로 쓰는 데이터로 받는 방법이에요.

### 3-③ 목록 읽기, 상세 읽기

```python
class RateLimited(Exception):
    pass


def detail_url(menuno: int, boardno: int, bbsno: str) -> str:
    return f"{BASE}?menuno={menuno}&bbsno={bbsno}&boardno={boardno}&siteno=37&act=view"


def list_page(client: httpx.Client, menuno: int, boardno: int, page: int) -> list[dict]:
    r = client.get(BASE, params={"menuno": menuno, "boardno": boardno, "siteno": 37, "act": "list", "pageIndex": page})
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    items = []
    for a in soup.select("a[onclick*=\"'view'\"]"):
        m = re.search(r"'view',\s*(\d+)", a["onclick"])
        li = a.find_parent("li")
        posted = li.select_one(".date") if li else None
        if m and posted:
            items.append({"bbsno": m.group(1), "title": a.get_text(strip=True), "posted_at": posted.get_text(strip=True)})
    return items


def read_detail(client: httpx.Client, url: str) -> tuple[str, list[str]]:
    r = client.get(url)
    r.raise_for_status()
    body = BeautifulSoup(r.text, "html.parser").select_one(".board_viewcont")
    if body is None:
        return "", []
    for sign in body.select("#signDiv"):
        sign.decompose()
    text = "\n".join(line.strip() for line in body.get_text("\n").splitlines() if line.strip())
    images = [img["src"] for img in body.select("img[src]") if urlsplit(img["src"]).hostname == "www.suwon.ac.kr"]
    return text[:6000], images[:2]
```

- 📖 `select("a[onclick*=\"'view'\"]")`: onclick 속성에 `'view'`가 들어 있는 링크만 골라요. 글 링크예요. 아래쪽 페이지 번호 링크(`'list'`)는 빠져요.
- 📖 `re.search(r"'view',\s*(\d+)", ...)`: `submitForm(this,'view',2918)`에서 숫자 2918만 꺼내요. `( )`로 감싼 부분이 `group(1)`이에요.
- 📖 `#signDiv`: 글마다 붙는 담당 부서 전화번호 서명이에요. AI가 헷갈리지 않게 지워요.
- 📖 `hostname == "www.suwon.ac.kr"`: 학교 서버에 있는 이미지만 받아요. 다른 사이트의 이상한 주소는 받지 않아요.
- 🤔 **이미지는 2장까지만:** 포스터는 보통 1장이에요. 너무 많이 보내면 Gemini 처리 시간과 사용량이 늘어요.

### 3-④ Gemini에게 묻기

```python
def image_part(client: httpx.Client, src: str) -> dict | None:
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
        raise RateLimited
    r.raise_for_status()
    return json.loads(r.json()["choices"][0]["message"]["content"])
```

- 📖 `base64`: 이미지 파일(바이트)을 글자로 바꿔서 JSON에 담는 방법이에요. `data:image/png;base64,....` 모양이 돼요.
- 📖 `4_000_000`: 4MB보다 큰 이미지는 안 보내요. 숫자 사이 `_`는 읽기 쉽게 쓰는 표시이고 값은 4000000이에요.
- 📖 `429`: "너무 많이 요청했어요"라는 응답이에요. 무료 한도에 걸리면 이번 실행을 멈춰요. 저장 안 된 글은 다음 실행 때 다시 처리돼요.
- 🤔 **openai 패키지 없이 `httpx`로 바로 부르는 이유:** A 서버는 openai 패키지를 쓰지만, B에는 그 패키지가 없어요. Gemini는 OpenAI와 같은 모양의 주소(`/openai/chat/completions`)를 열어 줘서, `httpx`로 JSON만 보내면 돼요. 새 패키지를 설치하지 않아도 돼요.

### 3-⑤ DB 한 줄로 바꾸기

```python
def valid_date(value: str) -> str | None:
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        return None


def to_row(menuno: int, boardno: int, item: dict, ai: dict) -> dict:
    return {
        "source": "suwon_main",
        "source_id": f"{boardno}:{item['bbsno']}",
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
        "url": detail_url(menuno, boardno, item["bbsno"]),
    }
```

- 🤔 **AI 답을 그대로 믿지 않아요.** `valid_date`는 "2026-11-31"이나 "11월 중" 같은 이상한 날짜가 오면 `None`(마감일 없음)으로 바꿔요. `[:60]`은 너무 긴 글자를 잘라요. `if t in JOBS`는 목록에 없는 직무를 버려요.
- 🏢 외부에서 온 데이터(사용자 입력, AI 응답, 크롤링 결과)는 **저장 전에 항상 검사**해요. 이걸 입력 검증(validation)이라고 해요.
- 📖 `title`은 학교 원래 제목을 그대로 써요. AI가 제목을 바꾸면 학생이 학교 사이트에서 찾기 어려워요.

### 3-⑥ 전체 실행 함수

```python
_lock = threading.Lock()


def sync_notices(max_new: int = 40) -> dict:
    if not _lock.acquire(blocking=False):
        return {"stopped": "ALREADY_RUNNING"}
    try:
        seen = {r["source_id"] for r in db.table("explore_postings").select("source_id").eq("source", "suwon_main").execute().data}
        cutoff = (date.today() - timedelta(days=KEEP_DAYS)).isoformat()
        stats = {"checked": 0, "saved": 0, "relevant": 0, "stopped": None}
        with httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            for name, menuno, boardno in BOARDS:
                for page in range(1, PAGES + 1):
                    items = list_page(client, menuno, boardno, page)
                    time.sleep(DELAY)
                    for item in items:
                        sid = f"{boardno}:{item['bbsno']}"
                        if sid in seen or item["posted_at"] < cutoff:
                            continue
                        seen.add(sid)
                        stats["checked"] += 1
                        if SKIP_WORDS.search(item["title"]):
                            continue
                        if name == "통합공지" and not CAREER_WORDS.search(item["title"]):
                            continue
                        if stats["saved"] >= max_new:
                            stats["stopped"] = "MAX_NEW"
                            return stats
                        text, images = read_detail(client, detail_url(menuno, boardno, item["bbsno"]))
                        time.sleep(DELAY)
                        try:
                            ai = classify(client, item["title"], item["posted_at"], text, images)
                        except RateLimited:
                            stats["stopped"] = "RATE_LIMIT"
                            return stats
                        db.table("explore_postings").upsert(to_row(menuno, boardno, item, ai), on_conflict="source,source_id").execute()
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
```

- 📖 `_lock`: 수집이 아직 도는 중에 또 실행되면 두 번째는 바로 끝내요. 같은 글을 두 번 처리하지 않게요. `blocking=False`는 "잠겨 있으면 기다리지 말고 바로 포기해"예요.
- 📖 `seen`: DB에 이미 있는 글 번호 모음(`set`)이에요. `in`으로 찾는 게 아주 빨라요.
- 📖 `item["posted_at"] < cutoff`: 날짜를 `"2026-09-01"` 같은 글자로 비교해도 돼요. 연-월-일 순서라 글자 순서가 곧 날짜 순서예요.
- 📖 `max_new=40`: 한 번에 최대 40개까지만 처리해요. 처음 실행하면 쌓인 글이 많아서 오래 걸리니까, 나머지는 다음 실행 때 이어서 해요.
- 📖 `upsert(..., on_conflict="source,source_id")`: STEP 1의 unique index를 기준으로 있으면 고치고 없으면 넣어요.
- 📖 `finally: _lock.release()`: 중간에 에러가 나도 잠금은 꼭 풀어요. 안 풀면 서버를 껐다 켤 때까지 수집이 다시는 안 돌아요.
- 📖 `if __name__ == "__main__":` 아래는 이 파일을 **직접 실행할 때만** 돌아요. 서버가 import할 때는 안 돌아요. STEP 4 테스트용이에요.

---

## STEP 4. 로컬에서 한 번 돌려 보기

`server` 폴더, `server\.venv`가 켜진 상태에서:

```bash
python -m app.services.notice_sync
```

결과 예시:

```
{'checked': 27, 'saved': 5, 'relevant': 5, 'stopped': 'MAX_NEW'}
```

Supabase에서 확인:

```sql
select tag, title, deadline, target, job_tags, relevant from explore_postings where source = 'suwon_main' order by posted_at desc;
```

미리 돌려 봤을 때 결과 (취업공지 4건):

| 제목 | 분류 | 마감일 | 직무 |
|---|---|---|---|
| 2026년 11월 반도체공정교육 안내 | 특강·교육 | 2026-11-13 | 연구개발, 생산·품질 |
| 청년고용정책 홍보DAY | 박람회·설명회 (교외) | 2026-11-04 | (없음) |
| 참여 수기 공모전 | 공모전 | 2026-11-06 | (없음) |

- 마감일은 본문에 없고 **포스터에만 있는 경우**도 읽어 왔어요.
- 잘못 분류된 글이 보이면 Supabase에서 `relevant`를 `false`로 바꾸면 돼요. 이미 본 글이라 다시 덮어쓰지 않아요.

---

## STEP 5. 조회 API 바꾸기 (`server/app/routers/explore.py`)

맨 위 import를 고쳐요.

```python
from datetime import date, timedelta
```

`postings` 함수 안의 `res = ...` 한 줄을 이렇게 바꿔요.

```python
    today = date.today().isoformat()
    recent = (date.today() - timedelta(days=30)).isoformat()
    res = (query.eq("relevant", True)
           .or_(f"deadline.gte.{today},and(deadline.is.null,posted_at.gte.{recent})")
           .order("deadline", nullsfirst=False).order("posted_at", desc=True)
           .execute())
```

- 📖 `.eq("relevant", True)`: 관련 없는 글(장학, 학사)은 빼요.
- 📖 `.or_(...)`: 아래 둘 중 **하나라도** 맞으면 보여 줘요.
  - `deadline.gte.{today}`: 마감이 오늘이거나 그 뒤
  - `and(deadline.is.null, posted_at.gte.{recent})`: 마감일이 없는 글은 게시 후 30일까지만
- 🤔 **마감일 없는 글을 30일만 보여 주는 이유:** "상시 모집"이나 마감일을 못 읽은 글을 계속 보여 주면 목록에 몇 달 지난 글이 쌓여요.
- 📖 `.order("deadline", nullsfirst=False)`: 마감 임박한 순서로 보여 주고, 마감일 없는 글은 맨 뒤로 보내요.

---

## STEP 6. 수집 API 만들기 (새 파일 `server/app/routers/admin.py`)

```python
import hmac

from fastapi import APIRouter, BackgroundTasks, Header

from app.common import ApiError, ok
from app.config import CRON_SECRET
from app.services.notice_sync import sync_notices

router = APIRouter(tags=["admin"])


@router.post("/admin/sync-notices", status_code=202)
def sync(background: BackgroundTasks, x_cron_secret: str = Header(default="")):
    if not CRON_SECRET or not hmac.compare_digest(x_cron_secret, CRON_SECRET):
        raise ApiError(401, "UNAUTHORIZED", "권한이 없어요.")
    background.add_task(sync_notices)
    return ok({"started": True})
```

`server/app/main.py`에 등록해요.

```python
from app.routers import (admin, auth, competency, cover_letters, experiences, explore, files, home, job_postings,
                         portfolios, users)
```

```python
for r in [auth, users, files, experiences, job_postings, cover_letters, portfolios, explore, home, competency, admin]:
```

- 📖 `x_cron_secret: str = Header(...)`: 요청 헤더 `X-Cron-Secret` 값을 받아요. FastAPI가 `_`를 `-`로 바꿔서 찾아요.
- 📖 `hmac.compare_digest`: 비밀번호 비교 전용 함수예요. 그냥 `==`를 쓰면 비교에 걸리는 시간으로 비밀번호를 한 글자씩 알아낼 수 있어요(타이밍 공격). 이 함수는 항상 같은 시간이 걸려요.
- 📖 `not CRON_SECRET`: `.env`에 비밀값을 안 넣었으면 **아무도** 못 부르게 막아요. 빈 값끼리 비교해서 통과되는 사고를 막아요.
- 📖 `BackgroundTasks`: 응답(`202 접수됨`)을 먼저 돌려주고 수집은 뒤에서 돌려요. 수집은 몇 분 걸리는데, 그동안 요청을 붙잡고 있으면 GitHub Actions 쪽이 시간 초과로 끊겨요.
- 🏢 `202 Accepted`는 "받았고, 처리는 나중에 끝나요"라는 뜻의 HTTP 상태 코드예요.

### Swagger로 확인

1. `http://127.0.0.1:8001/docs` → `POST /api/v1/admin/sync-notices`
2. `x-cron-secret`에 `.env`의 값을 넣고 실행 → `202`
3. 틀린 값을 넣으면 → `401`
4. 서버 터미널에 몇 분 뒤 `공지 수집 완료 {...}`가 찍혀요.

---

## STEP 7. 6시간마다 자동 실행 (GitHub Actions)

### 7-① 새 파일 `.github/workflows/sync-notices.yml` (저장소 맨 위 폴더)

```yaml
name: 학교 공지 수집

on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: B 서버에 수집 요청
        env:
          BACKEND_URL: ${{ secrets.BACKEND_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          curl -fsS -m 120 --retry 3 --retry-delay 30 -X POST "$BACKEND_URL/api/v1/admin/sync-notices" -H "X-Cron-Secret: $CRON_SECRET"
```

- 📖 `cron: "0 */6 * * *"`: 0분, 6시간마다라는 뜻이에요. **UTC 기준**이라 한국 시간으로는 9시, 15시, 21시, 3시예요.
- 📖 `workflow_dispatch`: GitHub의 Actions 탭에서 "Run workflow" 버튼으로 바로 돌려 볼 수 있게 해요.
- 📖 `-m 120 --retry 3`: Render 무료 서버는 자다가 깨는 데 1분쯤 걸려요. 그래서 2분 기다리고, 실패하면 30초 뒤 3번까지 다시 시도해요.

### 7-② GitHub에 비밀값 넣기

저장소 → Settings → Secrets and variables → Actions → New repository secret

| 이름 | 값 |
|---|---|
| `BACKEND_URL` | Render에 올린 B 주소 (예: `https://stack-backend.onrender.com`, 끝에 `/` 없이) |
| `CRON_SECRET` | `server/.env`와 **같은 값** |

Render의 B 서비스 Environment에도 `GEMINI_API_KEY`, `GEMINI_MODEL`, `CRON_SECRET`을 넣어요.

- 🤔 **서버 안에서 타이머를 돌리지 않는 이유:** Render 무료 서버는 15분 동안 요청이 없으면 잠들어요. 잠든 서버 안의 타이머는 돌지 않아요. 밖(GitHub)에서 깨워 주는 방식이어야 확실히 돌아요.
- 🏢 이렇게 외부 스케줄러가 API를 부르는 방식을 **cron 트리거**라고 해요. 현업에서는 AWS EventBridge, Cloud Scheduler 같은 걸 같은 용도로 써요.

---

## 확인 목록

- [ ] STEP 1 SQL 실행, `09_notice_crawler.sql` 저장
- [ ] `server/.env`에 세 값, `.env.example`에는 이름만
- [ ] `python -m app.services.notice_sync` → Supabase에 행 생김
- [ ] 탐색 탭 교내외 공고에 새 공고가 보이고, "원문 보기"를 누르면 학교 글로 감
- [ ] Swagger: 맞는 비밀값이면 202, 틀리면 401
- [ ] GitHub Actions → "Run workflow" → 초록 체크

## 알아 두기

- **Gemini 무료 한도:** 하루 사용량에 한도가 있어요. 첫 실행은 쌓인 글이 많아서 40개에서 멈추고, 다음 실행부터는 새 글 몇 개만 처리해요. 한도에 걸려도(`RATE_LIMIT`) 다음 실행 때 이어서 해요.
- **학교 사이트 구조가 바뀌면** `list_page`가 빈 목록을 돌려줘요. `checked`가 계속 0이면 `.board_viewcont`나 `submitForm` 모양이 바뀌었는지 확인해요.
- **무료 등급 Gemini는 보낸 내용이 Google 학습에 쓰일 수 있어요.** 학교 공지는 이미 공개된 글이라 괜찮지만, 학생 개인정보는 이 함수로 보내지 않아요.
- **다음 단계:** 저장해 둔 `job_tags`로 [탐색 가이드](GUIDE_EXPLORE_REAL_DATA.md) STEP 6의 "내 직무·목표 기업 적합도"를 붙일 수 있어요. 홈 화면 추천 프로그램도 `tag in (비교과, 특강·교육)`인 공고에서 골라 쓰면 돼요.
