# B 3주차 가이드 — 공고 저장 · 크롤링 · 자소서 · 포트폴리오 내보내기

> 대상 기능: JP-01·03 (공고 크롤링·저장·문항 수정) / CL-01·05 (자소서 생성·수정·저장) / PF-01·05 (포폴 생성·구성 수정·PPTX/PDF 내보내기)
> 2주차(학번 로그인, 내 정보, 파일, 경험 DB)가 끝난 상태에서 시작합니다.
> **이번 주 파일 5개는 비어 있어요. 이 문서를 보면서 직접 쳐 주세요.** 코드는 실제로 돌려서 확인한 코드예요.

## 이 문서 읽는 법

| 표시 | 내용 |
|---|---|
| **📖 한 줄씩** | 이 코드가 무슨 일을 하는지 |
| **🤔 왜 이렇게?** | 다른 방법도 있는데 왜 이 방법을 골랐는지 |
| **🏢 현업에서는** | 실제 회사 서비스에서는 어떻게 하는지, 면접에 나올 만한 개념 |

**타이핑 순서**: `crawler.py` → `job_postings.py` → `cover_letters.py` → `pptx_render.py` → `portfolios.py` → `main.py`에 3줄 추가
(`cover_letters.py`와 `portfolios.py`가 `job_postings.py`의 함수를 쓰고, `portfolios.py`가 `pptx_render.py`를 써서 이 순서예요.)

> 블록과 블록 사이는 빈 줄 2개. 파일 맨 위 `"""설명"""`(docstring)과 `# 주석`은 안 쳐도 동작은 같아요.
> **`main.py`에 라우터를 추가하는 건 그 파일을 다 친 다음에** 하세요. 빈 파일을 import하면 서버가 `has no attribute 'router'` 에러로 안 켜져요.

---

## 0. 3주차 전체 그림

### A와 B가 나눠 하는 일

이번 주 기능은 전부 **"AI가 만들고(A) → B가 저장·수정·파일로 만든다"** 구조예요.

```
            ┌──────────────── A (AI) ────────────────┐   ┌──────────────── B (이번 주) ───────────────┐
공고        │ 공고 텍스트 → 회사·직무·역량·문항 추출   │ → │ crawler: URL → 텍스트                       │
            │                                         │   │ save_posting(): 분석 결과 저장              │
            │                                         │   │ 조회 / 문항 순서·글자수 수정                │
            ├─────────────────────────────────────────┤   ├─────────────────────────────────────────────┤
자소서      │ 경험 추천 → 문항별 초안 생성             │ → │ 자소서 만들기(빈 틀) / update_cl(): 초안 저장 │
            │                                         │   │ 사용자 직접 수정 / 저장 완료 / 목록          │
            ├─────────────────────────────────────────┤   ├─────────────────────────────────────────────┤
포트폴리오  │ 구성안(몇 장, 순서) → 슬라이드 내용       │ → │ 포폴 만들기(빈 틀) / update_pf(): 저장       │
            │                                         │   │ 구성 순서 변경 / 슬라이드 수정              │
            │                                         │   │ pptx_render: JSON → PPTX/PDF 파일 → 다운로드 │
            └─────────────────────────────────────────┘   └─────────────────────────────────────────────┘
```

A의 코드가 아직 합쳐지지 않았으니, 이번 주 테스트에서는 **A가 만들 데이터를 SQL로 직접 넣어서** 확인합니다 (각 STEP의 테스트에 SQL이 있어요).

### 이번 주에 만드는 API

| 화면(Figma) | API | 파일 |
|---|---|---|
| 공고 분석 결과 | `GET /job-postings/{id}` | `routers/job_postings.py` |
| 자소서 문항 편집 | `PATCH /job-postings/{id}/questions` | `routers/job_postings.py` |
| (A가 쓰는 함수) | `fetch_posting(url)` | `services/crawler.py` |
| 자소서 만들기 시작 | `POST /cover-letters` | `routers/cover_letters.py` |
| 내 자소서 목록 / 상세 | `GET /cover-letters`, `GET /cover-letters/{id}` | `routers/cover_letters.py` |
| 자소서 답변 직접 수정 | `PATCH /cover-letters/{id}/answers/{order}` | `routers/cover_letters.py` |
| 자소서 저장 | `POST /cover-letters/{id}/save` | `routers/cover_letters.py` |
| 포폴 만들기 시작 | `POST /portfolios` | `routers/portfolios.py` |
| 내 포폴 목록 / 상세 | `GET /portfolios`, `GET /portfolios/{id}` | `routers/portfolios.py` |
| 구성안 순서 바꾸기 | `PUT /portfolios/{id}/outline` | `routers/portfolios.py` |
| 슬라이드 수정 | `PATCH /portfolios/{id}/slides/{no}` | `routers/portfolios.py` |
| PPTX/PDF 내보내기 | `POST /portfolios/{id}/export` | `routers/portfolios.py` + `services/pptx_render.py` |

### 데이터 구조

```
job_postings (공고)                        한 사람이 여러 공고
  id, user_id, source_type(URL/TEXT/FILE), url, raw_text
  company, position
  required_competencies  jsonb  ["데이터 분석", "커뮤니케이션"]
  questions              jsonb  [{"order":1, "text":"지원 동기", "charLimit":500}, ...]
     │
     ├── cover_letters (자소서)            공고 하나에 자소서 여러 개 가능
     │     status: SELECTING → DRAFT → SAVED
     │     selections jsonb  어떤 경험을 어느 문항에 쓸지 (A가 채움)
     │     answers    jsonb  [{"questionOrder":1, "content":"...", "charCount":480, ...}]
     │
     └── portfolios (포트폴리오)
           length: SHORT_6 / BASIC_10 / DETAIL_14     format: PDF / PPTX
           experience_ids jsonb  쓸 경험 id들 (A)
           outline        jsonb  [{"slideNo":1, "layout":"COVER", "title":"..."}]  구성안 (A)
           slides         jsonb  [{"slideNo":1, "layout":"COVER", "title", "body", "metrics":[...]}]  (A)
           export_path    text   내보낸 파일의 Storage 경로

posting_id 는 on delete cascade → 공고를 지우면 그 공고로 만든 자소서·포폴도 같이 삭제
```

**🤔 왜 문항·답변·슬라이드를 jsonb로?** 문항 수, 슬라이드 수가 공고·사용자마다 다르고, 항상 **통째로** 읽고 쓰기 때문이에요(답변 한 개만 따로 검색할 일이 없음). 테이블을 따로 만들면(`cover_letter_answers`) 저장할 때마다 여러 줄을 지우고 다시 넣어야 해서 복잡해집니다.

**🏢 현업에서는** "문서 하나 = 덩어리 하나"인 데이터(노션 페이지 블록, 피그마 디자인, 설문 응답)는 jsonb나 MongoDB 같은 문서형 DB에 많이 저장해요. 반대로 "모든 사용자의 2번 문항 답변 평균 글자수" 같은 통계가 필요해지면 그때 테이블로 쪼갭니다.

### 시작 전 확인

- [ ] 서버가 `server` 폴더 + `server\.venv`에서 켜져 있다
- [ ] `/docs`에서 학번 로그인 → Authorize가 된다
- [ ] 이번 주 파일 5개가 비어 있다: `services/crawler.py`, `services/pptx_render.py`, `routers/job_postings.py`, `routers/cover_letters.py`, `routers/portfolios.py`
- [ ] (PDF 내보내기를 하려면) LibreOffice 설치 → 아래 STEP 10 참고. **지금 이 컴퓨터에는 설치돼 있지 않아요.** PPTX는 없어도 됩니다.

---

## STEP 8. 공고 크롤링 · 저장 — JP-01·03 (2일)

### 기능 설명

| 기능 | 누가 | 동작 |
|---|---|---|
| 공고 URL 읽기 | B 함수 → A가 호출 | 채용 공고 링크 → 본문 텍스트만 뽑기 |
| 공고 분석 | A | 텍스트 → 회사·직무·필요 역량·자소서 문항 |
| 분석 결과 저장 | B 함수 → A가 호출 | `save_posting()` |
| 공고 조회 | B API | 분석 결과 화면 |
| 문항 수정 | B API | AI가 문항을 잘못 뽑았을 때 사용자가 순서·문구·글자수 수정 |

```
사용자: 공고 링크 붙여넣기
  → (A) POST /job-postings/analyze {url}
        → (B) fetch_posting(url)  : 웹페이지 → 텍스트
        → (A) Claude로 분석
        → (B) save_posting(...)   : DB 저장 → postingId
  → 화면: GET /job-postings/{postingId}   (B)
  → 문항 고치기: PATCH /job-postings/{postingId}/questions   (B)
```

### 8-1. `app/services/crawler.py` — 웹페이지에서 공고 텍스트 뽑기

**크롤링(crawling)** 은 프로그램이 웹페이지를 받아서 필요한 내용을 뽑는 거예요. 사람이 브라우저로 보는 화면은 사실 HTML 코드라서, 메뉴·광고·스크립트를 걷어내고 본문 글자만 남깁니다.

**① 준비**

```python
import httpx
from bs4 import BeautifulSoup

from app.common import ApiError

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; STACK-bot/0.1)"}
MAX_CHARS = 30000
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `httpx` | 파이썬에서 웹 요청을 보내는 라이브러리 (브라우저 대신 페이지를 받아옴) |
| `BeautifulSoup` | HTML을 읽기 쉽게 나눠주는 라이브러리 (`bs4`) |
| `HEADERS` `User-Agent` | "나는 이런 프로그램이에요"라는 자기소개. 없으면 많은 사이트가 차단 |
| `MAX_CHARS = 30000` | 뽑은 텍스트를 3만 자까지만 → AI 비용·시간 제한 |

**🤔 왜 이렇게?**
- `requests` 대신 `httpx`: 사용법은 거의 같은데 타임아웃·리다이렉트 처리가 깔끔하고, 나중에 비동기(`async`)로 바꾸기도 쉬워요. Supabase 라이브러리도 내부적으로 httpx를 써서 추가 설치가 없어요.
- User-Agent에 `STACK-bot`이라고 **정직하게** 밝혀요. 사람인 척 속이지 않는 게 크롤링 예절이에요.

**🏢 현업에서는**
- 크롤링 전에 사이트의 **`robots.txt`**(크롤링 허용 규칙)와 **이용약관**을 확인해요. 채용 사이트 중엔 자동 수집을 약관으로 금지한 곳이 있어서, 서비스로 운영하려면 **공식 API**나 제휴를 쓰는 게 정석입니다. 우리는 "사용자가 직접 붙여넣은 링크 1개를 그 사용자를 위해 읽는" 용도라 대량 수집과는 달라요.
- 요청 간격 두기(초당 1회 이하), 같은 페이지 캐시 같은 **예의(politeness)** 정책을 둡니다.

**② 텍스트 뽑기**

```python
def fetch_posting(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        raise ApiError(400, "INVALID_URL", "http로 시작하는 공고 링크를 넣어 주세요.")
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError:
        raise ApiError(422, "POSTING_FETCH_FAILED", "공고를 불러오지 못했어요. 텍스트 붙여넣기를 이용해 주세요.")

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "noscript"]):
        tag.decompose()
    lines = [line.strip() for line in soup.get_text("\n").splitlines()]
    text = "\n".join(line for line in lines if line)

    if len(text) < 200:  
        raise ApiError(422, "POSTING_FETCH_FAILED", "공고 내용을 읽을 수 없는 페이지예요. 텍스트 붙여넣기를 이용해 주세요.")
    return text[:MAX_CHARS]
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `url.startswith(("http://", "https://"))` | 튜플을 넣으면 "둘 중 하나로 시작하는지" |
| `timeout=15` | 15초 안에 응답 없으면 포기 (안 그러면 서버가 무한정 기다림) |
| `follow_redirects=True` | 짧은 링크(bit.ly 등)나 http→https 이동을 따라감 |
| `raise_for_status()` | 404·500 같은 실패 응답이면 에러를 냄 |
| `except httpx.HTTPError` | 연결 실패·타임아웃·실패 응답을 한 번에 잡음 → 422 |
| `soup(["script", ...])` | 이 태그들을 전부 찾기 |
| `tag.decompose()` | 찾은 태그를 HTML에서 **삭제** (자바스크립트 코드, 메뉴, 하단 정보) |
| `get_text("\n")` | 남은 HTML에서 글자만, 태그 사이는 줄바꿈으로 |
| `line.strip()` + `if line` | 앞뒤 공백 제거, 빈 줄 제거 |
| `len(text) < 200` | 200자도 안 나오면 본문을 못 읽은 것 (로그인 필요 페이지, JS로 그리는 페이지) |
| `text[:MAX_CHARS]` | 앞 3만 자만 |

**🤔 왜 이렇게?**
- 실패하면 **"텍스트 붙여넣기를 이용해 주세요"** 로 안내해요. 크롤링은 사이트 구조에 따라 언제든 실패할 수 있어서, 항상 **대체 경로(fallback)** 를 같이 설계하는 게 중요해요.
- 422를 쓰는 이유: 요청 형식(URL)은 맞는데 "처리할 수 없는 내용"이라서. 400은 형식 자체가 틀렸을 때(`INVALID_URL`).
- 사이트마다 본문 위치가 다른데 "본문 영역만" 찾는 대신 **"필요 없는 것을 지우고 나머지 전부"** 를 가져와요. 어느 사이트든 대충 동작하고, 남은 잡음은 AI가 걸러줍니다.

**🏢 현업에서는**
- 사람인·잡코리아처럼 내용을 **자바스크립트로 나중에 그리는** 페이지는 httpx로 받으면 빈 껍데기만 와요. 이런 곳은 **Playwright / Selenium**(진짜 브라우저를 띄워서 렌더링)을 쓰는데, 무겁고 느려서 별도 서버로 분리합니다.
- 사이트별 전용 파서(어디가 회사명, 어디가 마감일)를 만들어 정확도를 높이기도 하고, 요즘은 우리처럼 **LLM에게 정리를 맡기는** 방식이 많아졌어요.
- **SSRF 주의**: 사용자가 준 URL을 서버가 요청하면, `http://localhost:...`이나 클라우드 내부 주소(`169.254.169.254`)를 넣어서 서버 내부를 들여다보는 공격이 가능해요. 운영 서비스는 내부 IP로 가는 요청을 차단합니다. 우리는 배포 전에 이 검사를 추가하는 게 좋아요.

### 8-2. `app/routers/job_postings.py` — 공고 저장 · 조회 · 문항 수정

**① import와 라우터**

```python
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common import ApiError, ok
from app.db import db
from app.deps import get_current_user

router = APIRouter(tags=["job-postings"])
```

**📖 한 줄씩** 2주차와 같은 구성이에요. `tags=["job-postings"]` → Swagger에 "job-postings" 그룹이 생겨요.

**② 문항 모양**

```python
class Question(BaseModel):
    order: int
    text: str
    charLimit: Optional[int] = None


class QuestionsUpdate(BaseModel):
    questions: list[Question]
```

**📖 한 줄씩**

| 모델 | 설명 |
|---|---|
| `Question` | 문항 하나: 순서(`order`), 문구(`text`), 글자수 제한(`charLimit`, 없으면 null) |
| `QuestionsUpdate` | 수정 요청: 문항 **목록 전체** |

**🤔 왜 이렇게?** 문항 하나씩 수정·추가·삭제 API를 따로 만들면 API가 3개 늘어나요. 편집 화면에서 **목록 전체를 보내면 통째로 교체**하는 게 단순하고, 순서 바꾸기·삭제·추가가 한 번에 됩니다. 칸 이름(`charLimit`)은 A의 분석 결과 모양과 똑같이 맞췄어요.

**🏢 현업에서는** 목록을 통째로 바꾸는 방식은 편하지만, 두 사람이 동시에 편집하면 나중 사람이 앞사람 수정을 덮어써요. 구글 문서 같은 협업 도구는 변경 단위(operation)로 보내서 합칩니다(OT, CRDT). 개인용 편집 화면은 우리 방식이 일반적이에요.

**③ 응답 모양 · 내 공고 찾기**

```python
def to_api(row: dict) -> dict:
    return {"postingId": row["id"], "sourceType": row["source_type"], "url": row["url"],
            "company": row["company"], "position": row["position"],
            "requiredCompetencies": row["required_competencies"], "questions": row["questions"],
            "createdAt": row["created_at"]}


def get_own_posting(posting_id: str, user_id: str) -> dict:
    res = db.table("job_postings").select("*").eq("id", posting_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "POSTING_NOT_FOUND", "공고를 찾을 수 없어요.")
    return res.data
```

**📖 한 줄씩**
- `to_api`: DB 칸(`source_type`) → API 이름(`sourceType`). `raw_text`(원문)는 길어서 **응답에서 뺐어요.**
- `get_own_posting`: 2주차 `get_own_file`과 같은 패턴. **id + user_id**로 찾고 없으면 404.

**🤔 왜 이렇게?** `get_own_posting`은 자소서·포폴 API에서도 "이 공고가 내 것인지" 확인할 때 다시 써요. 그래서 라우터 함수가 아니라 일반 함수로 둡니다.

**④ A가 부르는 저장 함수**

```python
def save_posting(user_id: str, source_type: str, url: Optional[str], raw_text: str, analysis: dict) -> dict:
    row = db.table("job_postings").insert({
        "user_id": user_id, "source_type": source_type, "url": url, "raw_text": raw_text,
        "company": analysis["company"], "position": analysis["position"],
        "required_competencies": analysis["requiredCompetencies"], "questions": analysis["questions"],
    }).execute().data[0]
    return to_api(row)
```

**📖 한 줄씩**

| 인자 | 설명 |
|---|---|
| `source_type` | `URL` / `TEXT` / `FILE` — 공고를 어떻게 넣었는지 |
| `url` | URL로 넣었을 때만 (나머지는 None) |
| `raw_text` | 원문 텍스트. 나중에 다시 분석하거나 문제 생겼을 때 확인용 |
| `analysis` | A의 분석 결과 dict: `company`, `position`, `requiredCompetencies`, `questions` |

**🤔 왜 이렇게?** A는 DB 테이블 구조를 몰라도 되고, 이 함수에 분석 결과만 넘기면 돼요. 칸 이름 변환(camelCase → snake_case)도 B가 책임집니다. 원문(`raw_text`)을 같이 저장하는 이유: AI 결과가 이상할 때 "원래 공고에 뭐라고 써 있었는지" 확인할 수 있어야 하니까요.

**🏢 현업에서는** AI 결과를 저장할 때 **입력 원본 + 사용한 모델·프롬프트 버전**을 같이 남기는 경우가 많아요. 나중에 프롬프트를 바꿨을 때 결과가 좋아졌는지 비교(평가, eval)하는 데 필요하거든요.

**⑤ API 2개**

```python
@router.get("/job-postings/{posting_id}")
def detail(posting_id: str, user: dict = Depends(get_current_user)):
    return ok(to_api(get_own_posting(posting_id, user["id"])))


@router.patch("/job-postings/{posting_id}/questions")
def update_questions(posting_id: str, body: QuestionsUpdate, user: dict = Depends(get_current_user)):
    get_own_posting(posting_id, user["id"])
    questions = [q.model_dump() for q in sorted(body.questions, key=lambda q: q.order)]
    db.table("job_postings").update({"questions": questions}).eq("id", posting_id).execute()
    return ok(to_api(get_own_posting(posting_id, user["id"])))
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `detail` | 내 공고 하나 조회 |
| `update_questions` | ① 내 것인지 확인 ② 순서대로 정렬 ③ 저장 ④ 최신 값 응답 |
| `sorted(..., key=lambda q: q.order)` | `order` 값 기준으로 정렬. `lambda q: q.order`는 "문항을 받아서 order를 돌려주는 짧은 함수" |
| `q.model_dump()` | Pydantic 모델 → dict (DB에 jsonb로 저장하려면 dict여야 함) |

**🤔 왜 이렇게?** 프론트가 순서를 섞어 보내도 서버가 **항상 정렬해서 저장**하면, 읽는 쪽(A, 자소서 화면)은 정렬을 신경 쓸 필요가 없어요. "데이터는 저장할 때 정리한다"는 원칙이에요.

### 8-3. main.py 연결

`job_postings.py`를 다 친 다음 `main.py`에 추가:

```python
from app.routers import auth, experiences, files, job_postings, users
...
for r in [auth, users, files, experiences, job_postings]:
```

### 8-4. 테스트

**① 크롤러 직접 실행** (서버 끄지 않고 **새 터미널**에서, `server` 폴더 + 가상환경)

```bash
python -c "from app.services.crawler import fetch_posting; t = fetch_posting('https://www.python.org/'); print(len(t)); print(t[:300])"
```

→ 글자 수와 앞부분 텍스트가 나오면 성공. `https://example.com/`(내용이 짧은 페이지)은 `ApiError`가 나야 정상이에요.

**② 공고 하나 만들기** (A 대신 SQL로) — Supabase **SQL Editor**:

```sql
insert into job_postings (user_id, source_type, raw_text, company, position, required_competencies, questions)
select id, 'TEXT', '테스트 공고 원문', '네이버', '서비스 기획',
       '["데이터 분석", "커뮤니케이션", "사용자 리서치"]'::jsonb,
       '[{"order": 1, "text": "지원 동기를 작성해 주세요", "charLimit": 500},
         {"order": 2, "text": "협업 경험을 작성해 주세요", "charLimit": 700}]'::jsonb
from profiles where student_id = '22016007'
returning id;
```

→ 나온 `id`를 복사해 두세요 (아래에서 계속 `postingId`로 씀).

> `select id ... from profiles where student_id = ...` : 내 user id를 직접 복사하지 않고 학번으로 찾아서 넣는 방법이에요.

**③ Swagger** (Authorize 된 상태)

| 순서 | API | 넣을 값 | 기대 결과 |
|---|---|---|---|
| 1 | `GET /job-postings/{postingId}` | | 네이버 · 문항 2개 |
| 2 | `PATCH /job-postings/{postingId}/questions` | `{"questions": [{"order": 2, "text": "협업 경험", "charLimit": 600}, {"order": 1, "text": "지원 동기", "charLimit": 500}]}` | order 1, 2 순서로 정렬돼서 저장 |
| 3 | `GET /job-postings/00000000-0000-0000-0000-000000000000` | | **404** `POSTING_NOT_FOUND` |

---

## STEP 9. 자소서 저장 · 수정 — CL-01·05 (2일)

### 기능 설명

```
① POST /cover-letters {postingId}           (B)  빈 자소서 생성, status = SELECTING
② 경험 추천 → 사용자가 고름 → 초안 생성      (A)  update_cl(id, {"selections", "answers", "status": "DRAFT"})
③ PATCH /cover-letters/{id}/answers/{order} (B)  사용자가 답변 직접 수정 → 글자수 다시 계산
④ POST /cover-letters/{id}/save             (B)  status = SAVED
⑤ GET /cover-letters                        (B)  내 자소서 목록 (회사·직무 같이)
```

**상태(status) 흐름**

```
SELECTING ──(A: 초안 생성)──▶ DRAFT ──(사용자: 저장)──▶ SAVED
 경험 고르는 중                  수정 중                    완료 (다시 수정 가능)
```

**🏢 현업에서는** 이렇게 정해진 상태와 이동 규칙을 **상태 머신(state machine)** 이라고 해요. 주문(결제 대기 → 결제 완료 → 배송 중 → 배송 완료), 결재(초안 → 상신 → 승인) 등 거의 모든 업무 시스템에 있어요. 규모가 커지면 "SAVED에서 SELECTING으로는 못 돌아간다" 같은 **허용된 이동만** 코드로 강제합니다.

### 9-1. `app/routers/cover_letters.py`

**① import**

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common import ApiError, now_iso, ok
from app.db import db
from app.deps import get_current_user
from app.routers.job_postings import get_own_posting

router = APIRouter(tags=["cover-letters"])
```

**📖 한 줄씩** `from app.routers.job_postings import get_own_posting` → STEP 8에서 만든 "내 공고 확인" 함수를 가져다 씀. **그래서 `job_postings.py`를 먼저 쳐야 해요.**

**② 요청 모양**

```python
class CreateRequest(BaseModel):
    postingId: str


class AnswerEdit(BaseModel):
    content: str
```

**📖 한 줄씩**
- `CreateRequest`: 어느 공고로 자소서를 만들지
- `AnswerEdit`: 수정할 답변 내용 (몇 번 문항인지는 URL에)

**③ 응답 · 내 자소서 찾기 · A가 부르는 저장 함수**

```python
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
```

**📖 한 줄씩**

| 함수 | 설명 |
|---|---|
| `to_api` | DB → API 모양 |
| `get_own_cl` | id + user_id로 찾기, 없으면 404 |
| `update_cl(cl_id, changes)` | 바꿀 칸만 받아서 저장 + `updated_at` 갱신 → 최신 값 반환. **A가 초안을 저장할 때도 이 함수** |

**🤔 왜 이렇게?** `update_cl`은 주인 확인을 **안 해요.** 부르는 쪽(라우터의 `get_own_cl`, A의 코드)이 먼저 확인하는 구조예요. 같은 확인을 두 번 하지 않으려고 역할을 나눈 건데, 그래서 **이 함수를 부르기 전에는 반드시 주인 확인**을 해야 한다는 약속이 생겨요. (함수 설명에 적어두는 이유)

**🏢 현업에서는** "확인은 바깥(API 계층), 저장은 안쪽(서비스 계층)"으로 나누는 게 흔해요. 다만 보안 관련 확인은 안쪽에 한 번 더 두는 팀도 많아요(**심층 방어, defense in depth**). 한 겹이 실수로 빠져도 다른 겹이 막아주니까요.

**④ 만들기 · 목록 · 상세**

```python
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
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `get_own_posting(body.postingId, ...)` | 남의 공고나 없는 공고로 자소서를 못 만들게 |
| `insert({"user_id", "posting_id"})` | 나머지 칸(status, answers…)은 DB 기본값으로 |
| `select("*, job_postings(company, position)")` | **조인(join)**: 자소서와 연결된 공고의 회사·직무를 한 번에 가져옴 |
| `r["job_postings"]["company"]` | 조인 결과는 `job_postings`라는 칸 안에 dict로 들어옴 |

**🤔 왜 이렇게?** 목록 화면에 "네이버 · 서비스 기획"을 보여줘야 하는데, 자소서마다 공고를 따로 조회하면 10개면 DB 요청 11번(**N+1 문제**)이에요. 조인으로 **1번**에 가져옵니다. Supabase는 `posting_id`가 `job_postings(id)`를 참조하는 걸 알아서 이 문법이 가능해요.

**🏢 현업에서는** N+1 문제는 ORM(JPA, Django ORM)을 쓸 때 가장 흔한 성능 문제이고, 면접 단골 질문이에요. `select_related`(Django), `fetch join`(JPA), 우리처럼 embed 문법으로 해결합니다.

**⑤ 답변 수정 · 저장**

```python
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
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `{order}` in URL | 몇 번 문항 답변을 고칠지. `order: int`로 받으면 숫자가 아니면 자동 422 |
| `next((a for a in answers if ...), None)` | 목록에서 **조건에 맞는 첫 번째**를 찾고, 없으면 None |
| `target["content"] = ...` | 찾은 답변 dict를 직접 수정 (`answers` 목록 안의 그 dict가 바뀜) |
| `charCount = len(...)` | 글자수 다시 계산 → 화면의 "480/500자" |
| `update_cl(cl_id, {"answers": answers})` | 수정된 목록 전체 저장 |
| `save` | status만 SAVED로 |

**🤔 왜 이렇게?**
- 글자수를 **서버가 계산**하는 이유: 프론트가 보낸 숫자를 믿으면 틀린 값이 저장될 수 있어요. 계산할 수 있는 값은 서버가 직접 계산합니다.
- 글자수 제한을 넘어도 **저장은 막지 않아요.** 쓰는 중에는 넘었다 줄였다 하니까요. 화면에서 빨간 글씨로 알려주는 건 프론트 몫.

**🏢 현업에서는**
- 한국 채용 사이트마다 글자수 세는 방식이 달라요(공백 포함/제외, 줄바꿈을 1자/2자, 바이트 기준). 실제 서비스라면 `charCountNoSpace` 같은 값도 같이 줘요.
- 긴 글 편집은 **자동 저장(autosave)** 이 기본이에요. 프론트가 입력이 멈추고 1~2초 뒤(**디바운스**)에 이 PATCH를 호출하는 식으로 붙입니다.

### 9-2. main.py 연결

```python
from app.routers import auth, cover_letters, experiences, files, job_postings, users
...
for r in [auth, users, files, experiences, job_postings, cover_letters]:
```

### 9-3. 테스트

| 순서 | 할 일 | 기대 결과 |
|---|---|---|
| 1 | `POST /cover-letters` `{"postingId": "STEP 8의 postingId"}` | `status: SELECTING`, `answers: []` → `id` 복사 (`clId`) |
| 2 | 아래 SQL로 **A가 초안을 만든 것처럼** 넣기 | |
| 3 | `GET /cover-letters/{clId}` | `status: DRAFT`, 답변 2개 |
| 4 | `PATCH /cover-letters/{clId}/answers/1` `{"content": "직접 고친 지원 동기입니다."}` | 1번 답변 바뀜, `charCount` 다시 계산 |
| 5 | `PATCH /cover-letters/{clId}/answers/9` `{"content": "x"}` | **404** `ANSWER_NOT_FOUND` |
| 6 | `POST /cover-letters/{clId}/save` | `status: SAVED` |
| 7 | `GET /cover-letters` | 목록에 `company: 네이버`, `position: 서비스 기획` |
| 8 | `POST /cover-letters` `{"postingId": "00000000-0000-0000-0000-000000000000"}` | **404** `POSTING_NOT_FOUND` |

2번 SQL (`clId` 부분을 바꿔서 실행):

```sql
update cover_letters
set status = 'DRAFT',
    answers = '[{"questionOrder": 1, "content": "AI가 쓴 지원 동기 초안", "charCount": 13, "charLimit": 500},
                {"questionOrder": 2, "content": "AI가 쓴 협업 경험 초안", "charCount": 14, "charLimit": 600}]'::jsonb
where id = '여기에_clId';
```

---

## STEP 10. 포트폴리오 저장 · PPTX/PDF 내보내기 — PF-01·05 (4일)

### 기능 설명

```
① POST /portfolios {postingId, length, format}     (B)  빈 포폴 생성
② 경험 고르기 → 구성안(outline) 생성                 (A)  update_pf(id, {"experience_ids", "outline"})
③ PUT /portfolios/{id}/outline                     (B)  사용자가 순서 바꾸기·빼기 → 번호 다시 매김
④ 슬라이드 내용(slides) 생성                         (A)  update_pf(id, {"slides"})
⑤ PATCH /portfolios/{id}/slides/{no}               (B)  사용자가 제목·본문·숫자 수정
⑥ POST /portfolios/{id}/export {format}            (B)  JSON → PPTX(→ PDF) → Storage → 다운로드 링크
```

### 내보내기 구조

```
slides JSON (DB)
   │  build_file(slides, "PPTX" 또는 "PDF")
   ▼
render_pptx  ── python-pptx로 슬라이드 한 장씩 그림 ──▶  임시폴더/portfolio.pptx
   │                                                       │ PDF면
   │                                                       ▼
   │                                         pptx_to_pdf ── LibreOffice(soffice) ──▶ portfolio.pdf
   ▼
upload_bytes → Storage: {user_id}/exports/{포폴id}.pptx   → signed_url (1시간) → 프론트가 다운로드
```

**슬라이드 JSON 한 장** (A의 결과 모양과 같음)

```json
{"slideNo": 3, "layout": "RESULT_WITH_CHART", "section": "프로젝트 A · 성과",
 "title": "MAU 1,200명 달성", "body": "설문 120명으로 문제를 정의하고...",
 "metrics": [{"value": "1,200명", "label": "월간 사용자"}, {"value": "+40%", "label": "재방문율"}]}
```

`layout`: `COVER`, `INTRO`, `OVERVIEW`, `PROBLEM_PROCESS`, `RESULT_WITH_CHART`, `SUMMARY`, `CLOSING`
→ 지금 그리는 코드는 **`COVER`/`CLOSING`(표지·마지막)** 과 **나머지(제목+숫자카드+본문)** 두 가지 모양만 있어요. 디자인을 늘릴 때 레이아웃별로 나누면 됩니다.

### 10-1. `app/services/pptx_render.py` — JSON을 PPT 파일로

**① 준비 · 색 · 글꼴**

```python
import subprocess
import tempfile
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

from app.config import SOFFICE_PATH

NAVY = RGBColor(0x0B, 0x1B, 0x3F)
BLUE = RGBColor(0x2F, 0x6B, 0xF2)
GRAY = RGBColor(0x55, 0x5E, 0x6E)
FONT = "맑은 고딕"  
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `subprocess` | 파이썬에서 다른 프로그램(LibreOffice)을 실행 |
| `tempfile` | 임시 폴더 만들기 |
| `Presentation` | python-pptx의 "PPT 파일" 객체 |
| `RGBColor(0x0B, 0x1B, 0x3F)` | 색을 빨강·초록·파랑 16진수로 (`#0B1B3F` 남색) |
| `Inches`, `Pt` | 위치·크기 단위 (인치), 글자 크기 단위 (포인트) |
| `NAVY/BLUE/GRAY` | 제목·강조·본문 색. Figma 색과 맞추면 됨 |
| `FONT = "맑은 고딕"` | 한글 글꼴 |

**🤔 왜 이렇게?** 색·글꼴을 맨 위 상수로 모아두면 디자이너가 "파란색 좀 바꿔주세요" 할 때 한 줄만 고치면 돼요. 이런 값 모음을 **디자인 토큰(design token)** 이라고 합니다.

**🏢 현업에서는** 미리 디자인한 **PPT 템플릿 파일(.potx)** 을 열어서 자리표시자(placeholder)에 내용만 채우는 방식을 많이 써요. 디자이너가 PowerPoint로 직접 템플릿을 고칠 수 있어서 개발자가 좌표를 만질 일이 줄어들어요. 우리는 템플릿 없이 좌표로 그리는 가장 단순한 방식입니다.

**② 글상자 하나 그리기**

```python
def add_text(slide, text, left, top, width, height, size, color=NAVY, bold=False):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    frame = box.text_frame
    frame.word_wrap = True
    for i, line in enumerate(str(text).split("\n")):
        p = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        p.text = line
        p.font.size, p.font.bold, p.font.color.rgb, p.font.name = Pt(size), bold, color, FONT
    return box
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `add_textbox(left, top, width, height)` | 슬라이드에 글상자 추가 (왼쪽 위 기준, 인치) |
| `word_wrap = True` | 글상자 폭을 넘으면 자동 줄바꿈 |
| `str(text).split("\n")` | 줄바꿈마다 문단을 나눔 (숫자가 와도 `str`로) |
| `paragraphs[0] if i == 0 else add_paragraph()` | 글상자는 문단 1개를 기본으로 갖고 있어서 첫 줄은 그걸 쓰고, 나머지는 추가 |
| `p.font.size, ... = Pt(size), ...` | 여러 값을 한 줄에 동시에 넣기 (튜플 대입) |

**🤔 왜 이렇게?** 슬라이드마다 글상자를 수십 번 만들어야 해서, 반복되는 6~7줄을 함수 하나로 묶었어요. 기본값(`color=NAVY, bold=False`)을 둬서 대부분은 짧게 부를 수 있어요.

**③ 슬라이드 그리기**

```python
def render_pptx(slides: list[dict], out_path: Path) -> Path:
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)  # 16:9
    blank = prs.slide_layouts[6]

    for s in slides:
        slide = prs.slides.add_slide(blank)
        if s["layout"] in ("COVER", "CLOSING"):
            add_text(slide, s["title"], 1, 2.6, 11.3, 1.5, 40, bold=True)
            add_text(slide, s.get("body", ""), 1, 4.2, 11.3, 1.5, 18, GRAY)
            continue

        add_text(slide, s.get("section", ""), 0.8, 0.5, 11.7, 0.5, 14, BLUE, bold=True)
        add_text(slide, s["title"], 0.8, 0.9, 11.7, 1.0, 30, bold=True)

        metrics = s.get("metrics") or []
        for i, m in enumerate(metrics[:4]):  # 숫자 카드는 최대 4개
            left = 0.8 + i * 3.0
            add_text(slide, m["value"], left, 2.2, 2.8, 0.9, 32, BLUE, bold=True)
            add_text(slide, m["label"], left, 3.1, 2.8, 0.5, 14, GRAY)

        body_top = 3.9 if metrics else 2.3
        add_text(slide, s.get("body", ""), 0.8, body_top, 11.7, 3.0, 18, GRAY)

    prs.save(out_path)
    return out_path
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `Inches(13.333), Inches(7.5)` | 16:9 와이드 크기 (기본은 4:3이라 바꿔줌) |
| `slide_layouts[6]` | 기본 템플릿의 7번째 레이아웃 = **빈 슬라이드** |
| `if s["layout"] in ("COVER", "CLOSING")` | 표지·마지막 장: 큰 제목 + 부제만, `continue`로 다음 장으로 |
| `s.get("section", "")` | 칸이 없어도 에러 대신 빈 글자 |
| `metrics[:4]` | 숫자 카드는 최대 4개 (넘치면 화면 밖으로 나가니까) |
| `left = 0.8 + i * 3.0` | 카드마다 3인치씩 오른쪽으로 |
| `body_top = 3.9 if metrics else 2.3` | 숫자 카드가 있으면 본문을 아래로, 없으면 위로 |
| `prs.save(out_path)` | 파일로 저장 |

**🤔 왜 이렇게?**
- `s["title"]`은 대괄호(없으면 에러), `s.get("body", "")`는 `.get`(없으면 빈 글자)으로 **필수/선택**을 구분했어요. 제목이 없는 슬라이드는 데이터가 잘못된 거라 에러를 내는 게 맞아요.
- 좌표를 숫자로 직접 쓰는 방식은 단순하지만 글이 길면 넘칠 수 있어요. A가 "본문 2~4줄"로 짧게 만들도록 약속한 이유예요.

**🏢 현업에서는** 문서 자동 생성(보고서, 견적서, 증명서)은 흔한 백엔드 업무예요. PDF는 **HTML+CSS → PDF**(WeasyPrint, Puppeteer)로 많이 만들고, PPT·엑셀은 python-pptx·openpyxl·Apache POI 같은 라이브러리를 씁니다. 글이 넘치는 문제는 글자 수에 따라 폰트 크기를 줄이는 **auto-fit** 로직을 넣기도 해요.

**④ PDF 변환 · 진입 함수**

```python
def pptx_to_pdf(pptx_path: Path) -> Path:
    subprocess.run([SOFFICE_PATH, "--headless", "--convert-to", "pdf", "--outdir",
                    str(pptx_path.parent), str(pptx_path)], check=True, timeout=180, capture_output=True)
    pdf = pptx_path.with_suffix(".pdf")
    if not pdf.exists():
        raise RuntimeError("PDF 변환에 실패했어요.")
    return pdf


def build_file(slides: list[dict], fmt: str) -> Path:
    work = Path(tempfile.mkdtemp())
    pptx = render_pptx(slides, work / "portfolio.pptx")
    return pptx if fmt == "PPTX" else pptx_to_pdf(pptx)
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `subprocess.run([...])` | 명령 프롬프트에서 `soffice --headless --convert-to pdf ...`를 친 것과 같음 |
| `--headless` | 화면 창 없이 실행 |
| `--outdir` | 결과 PDF를 PPTX와 같은 폴더에 |
| `check=True` | 프로그램이 실패하면 파이썬 에러 |
| `timeout=180` | 3분 넘으면 포기 |
| `capture_output=True` | LibreOffice가 출력하는 글자를 터미널에 뿌리지 않음 |
| `with_suffix(".pdf")` | `portfolio.pptx` → `portfolio.pdf` 경로 |
| `tempfile.mkdtemp()` | 요청마다 **새 임시 폴더** |
| `build_file` | 바깥에서 부르는 함수: PPTX면 그대로, PDF면 변환까지 |

**🤔 왜 이렇게?**
- 명령을 **리스트**로 넘기는 이유: 문자열 하나로 넘기면(`shell=True`) 파일 이름에 특수문자가 있을 때 명령이 엉뚱하게 해석될 수 있어요(**명령어 주입, command injection**). 리스트면 각 값이 그대로 전달돼서 안전해요.
- 요청마다 새 임시 폴더: 두 사람이 동시에 내보내도 파일이 섞이지 않아요.
- PPT → PDF를 파이썬만으로 하는 라이브러리는 품질이 낮아서, 무료 오피스(LibreOffice)에 변환을 맡겨요.

**🏢 현업에서는**
- 파일 변환처럼 **오래 걸리고 무거운 작업**은 API 요청 안에서 바로 하지 않고 **작업 큐**(Celery, RQ, AWS SQS)에 넣은 뒤, 완료되면 알림/폴링으로 알려줘요. A가 AI 분석에 쓰는 `jobs` 방식과 같은 개념이에요.
- 임시 파일은 주기적으로 지우거나 `with tempfile.TemporaryDirectory()`로 자동 삭제해요. 우리 코드는 임시 폴더를 지우지 않아서, 운영 전에 정리 로직을 넣는 게 좋아요.
- 서버(리눅스)에는 "맑은 고딕"이 없어서 PDF가 다른 글꼴로 나와요. Docker 이미지에 한글 폰트(나눔고딕, Noto Sans KR)를 넣는 게 필수예요.

### 10-2. `app/routers/portfolios.py`

**① import · 파일 종류**

```python
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
```

**📖 한 줄씩**
- `Literal["PDF", "PPTX"]`: **이 값들만 허용**. 다른 값이 오면 자동 422 (2주차 경험 카테고리보다 엄격한 방식)
- `CONTENT_TYPES`: Storage에 저장할 때 붙일 파일 종류 (MIME 타입). PPTX의 공식 이름이 길어요.
- `build_file`, `signed_url`, `upload_bytes`: 10-1과 2주차 `storage.py`에서 가져옴

**② 요청 모양**

```python
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
```

**📖 한 줄씩**

| 모델 | 설명 |
|---|---|
| `CreateRequest` | 공고 + 분량(6/10/14장) + 형식. 분량·형식은 기본값이 있어서 안 보내도 됨 |
| `OutlineUpdate` | 구성안 **전체 목록** (순서를 바꾸거나 뺀 결과) |
| `SlideEdit` | 슬라이드에서 바꿀 칸만 (제목·본문·숫자) |
| `ExportRequest` | 내보낼 형식. 안 보내면 포폴 만들 때 정한 형식 |

**🤔 왜 이렇게?** `OutlineUpdate`의 `list[dict]`는 일부러 느슨하게 받았어요. 구성안 한 장의 칸(`layout`, `section`, `experienceId`...)은 A가 정하는 거라, B가 칸을 하나하나 정해두면 A가 칸을 추가할 때마다 B도 고쳐야 하거든요. 대신 저장할 때 `slideNo`만 B가 다시 매깁니다.

**🏢 현업에서는** 팀 간 데이터 모양을 **누가 정하는지(소유권)** 를 명확히 하는 게 중요해요. 지금은 "슬라이드 모양은 A가 정한다"고 약속한 거고, 규모가 커지면 공용 스키마 파일(JSON Schema, OpenAPI, protobuf)을 하나 두고 양쪽이 같이 씁니다.

**③ 응답 · 내 포폴 찾기 · A가 부르는 저장 함수**

```python
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
```

**📖 한 줄씩** 자소서의 `to_api` / `get_own_cl` / `update_cl`과 똑같은 구조예요. A는 `update_pf(pf_id, {"outline": ...})`, `update_pf(pf_id, {"slides": ...})`로 저장합니다.

> 공고·자소서·포폴에서 **같은 3종 세트(to_api, get_own_*, update_*)** 가 반복되는 게 보이죠? 현업에서는 이 반복을 공통 클래스(`BaseRepository`, 제네릭 CRUD)로 묶기도 해요. 지금은 각 파일을 읽기 쉽게 그대로 두었어요.

**④ 만들기 · 목록 · 상세**

```python
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
```

**📖 한 줄씩** 자소서와 같아요. 만들 때 `get_own_posting`으로 공고 주인 확인.

**⑤ 구성안 순서 · 슬라이드 수정**

```python
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
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `enumerate(body.outline)` | `(0, 첫장), (1, 둘째장)...` 번호와 같이 돌기 |
| `{**s, "slideNo": i + 1}` | 원래 칸은 그대로 + `slideNo`만 1, 2, 3...으로 새로 |
| `PUT` | 구성안 **전체 교체**라서 PATCH 대신 PUT |
| `next((s for s in slides if s["slideNo"] == slide_no), None)` | 그 번호 슬라이드 찾기 |
| `target.update(body.model_dump(exclude_none=True))` | 보낸 칸만 덮어쓰기 (dict의 `update`) |

**🤔 왜 이렇게?** 사용자가 3번 장을 지우면 번호가 1, 2, 4, 5가 돼요. 서버가 **항상 1부터 다시 매기면** 화면·PPT의 페이지 번호가 꼬이지 않아요. PUT과 PATCH를 구분한 건 REST 관례(전체 교체 vs 일부 수정)를 따른 거예요.

**⑥ 내보내기**

```python
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
```

**📖 한 줄씩**

| 순서 | 코드 | 설명 |
|---|---|---|
| 1 | `if not pf["slides"]` | 슬라이드가 없으면 그릴 게 없음 → 400 |
| 2 | `body.format or pf["format"]` | 요청에 형식이 있으면 그걸로, 없으면 원래 형식 |
| 3 | `build_file(...)` | PPTX(→PDF) 만들기 |
| 4 | `except Exception` → 500 `EXPORT_FAILED` | LibreOffice 없음·변환 실패·데이터 이상 |
| 5 | `storage_path = f"{user_id}/exports/{pf_id}.pptx"` | 사용자 폴더 안 `exports`. 포폴 id로 이름을 고정 |
| 6 | `upload_bytes(...)` | 업로드 (`upsert`라서 다시 내보내면 덮어씀) |
| 7 | `export_path` 저장 | 탈퇴할 때 이 파일도 지우려고 (2주차 `remove_all_user_files`) |
| 8 | `signed_url` | 1시간짜리 다운로드 링크 응답 |

**🤔 왜 이렇게?**
- 여기서는 예외적으로 `except Exception`을 써요. 변환 실패 원인이 여러 가지(프로그램 없음, 시간 초과, 이상한 데이터)인데 사용자에게는 전부 "파일을 만들지 못했어요"가 맞기 때문이에요. 대신 **개발 중엔 원인을 알기 어려우니** 막히면 `except Exception as e:` 다음 줄에 `print(e)`를 넣어 터미널에서 확인하세요.
- 파일 이름을 포폴 id로 고정해서, 여러 번 내보내도 Storage에 파일이 쌓이지 않아요.

**🏢 현업에서는** 에러를 사용자에게는 뭉뚱그려 보여주되, 서버 로그에는 **자세히 남기는 것**(`logger.exception(...)`)이 원칙이에요. 그리고 Sentry 같은 에러 추적 도구로 알림을 받아요. `print`는 개발 중에만 쓰고 운영에서는 `logging`을 씁니다.

### 10-3. main.py 연결 (3주차 완성)

```python
from app.routers import auth, cover_letters, experiences, files, job_postings, portfolios, users
...
for r in [auth, users, files, experiences, job_postings, cover_letters, portfolios]:
```

### 10-4. LibreOffice 설치 (PDF가 필요할 때)

1. https://www.libreoffice.org/download/ → Windows x86_64 설치
2. 설치 경로 확인: `C:\Program Files\LibreOffice\program\soffice.exe`
3. `server/.env`의 `SOFFICE_PATH`가 이 경로인지 확인 → 서버 재시작

PPTX 내보내기는 LibreOffice 없이 됩니다. **PPTX부터 테스트**하세요.

### 10-5. 테스트

| 순서 | 할 일 | 기대 결과 |
|---|---|---|
| 1 | `POST /portfolios` `{"postingId": "STEP 8의 postingId", "length": "SHORT_6", "format": "PPTX"}` | `outline: []`, `slides: []` → `id` 복사 (`pfId`) |
| 2 | `POST /portfolios/{pfId}/export` `{}` | **400** `NO_SLIDES` |
| 3 | 아래 SQL로 **A가 구성안·슬라이드를 만든 것처럼** 넣기 | |
| 4 | `PUT /portfolios/{pfId}/outline` — 3번에서 넣은 outline 순서를 바꿔서 전체 보내기 | `slideNo`가 1, 2, 3으로 다시 매겨짐 |
| 5 | `PATCH /portfolios/{pfId}/slides/2` `{"title": "MAU 1,500명 달성"}` | 2번 슬라이드 제목만 바뀜 |
| 6 | `PATCH /portfolios/{pfId}/slides/9` `{"title": "x"}` | **404** `SLIDE_NOT_FOUND` |
| 7 | `POST /portfolios/{pfId}/export` `{"format": "PPTX"}` | `downloadUrl` → 브라우저로 열어서 PPT 다운로드, 3장 확인 |
| 8 | Storage `files` 버킷 → `내 user id/exports/` | `{pfId}.pptx` 있음 |
| 9 | (LibreOffice 설치 후) `{"format": "PDF"}` | PDF 다운로드. 미설치면 **500** `EXPORT_FAILED` |
| 10 | `GET /portfolios` | 목록에 1개 |

3번 SQL (`pfId` 부분을 바꿔서 실행):

```sql
update portfolios
set outline = '[{"slideNo": 1, "layout": "COVER", "section": "", "title": "김수원 포트폴리오", "experienceId": null},
                {"slideNo": 2, "layout": "RESULT_WITH_CHART", "section": "프로젝트 · 성과", "title": "MAU 1,200명 달성", "experienceId": null},
                {"slideNo": 3, "layout": "CLOSING", "section": "", "title": "감사합니다", "experienceId": null}]'::jsonb,
    slides  = '[{"slideNo": 1, "layout": "COVER", "section": "", "title": "김수원 포트폴리오", "body": "서비스 기획자 지원", "metrics": []},
                {"slideNo": 2, "layout": "RESULT_WITH_CHART", "section": "프로젝트 · 성과", "title": "MAU 1,200명 달성",
                 "body": "설문 120명으로 문제를 정의하고\n핵심 기능 3개를 기획했습니다.",
                 "metrics": [{"value": "1,200명", "label": "월간 사용자"}, {"value": "+40%", "label": "재방문율"}]},
                {"slideNo": 3, "layout": "CLOSING", "section": "", "title": "감사합니다", "body": "kimk123654@suwon.ac.kr", "metrics": []}]'::jsonb
where id = '여기에_pfId';
```

> ⚠️ 슬라이드 칸 이름은 **`layout`** 이에요 (`type` 아님). `type`으로 넣으면 내보내기가 `EXPORT_FAILED`가 납니다.

---

## 3주차 끝 점검표

- [ ] 크롤러: python.org는 텍스트가 나오고, 짧은 페이지는 `ApiError`
- [ ] 공고 조회 · 문항 순서 수정 · 없는 id 404
- [ ] 자소서: 만들기 → (SQL 초안) → 답변 수정(글자수 갱신) → 저장(SAVED) → 목록에 회사·직무
- [ ] 포폴: 만들기 → 슬라이드 없이 내보내기 400 → (SQL) → 구성 순서 변경 → 슬라이드 수정 → **PPTX 다운로드**
- [ ] Storage `exports` 폴더에 파일 생김
- [ ] (선택) LibreOffice 설치 후 PDF
- [ ] `main.py`에 라우터 7개, 서버 재시작해도 에러 없음

## 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| 서버가 안 켜지고 `has no attribute 'router'` | `main.py`에 추가한 파일이 아직 비어 있거나 `router = APIRouter(...)` 줄이 없음 |
| `ImportError: cannot import name 'get_own_posting'` | `job_postings.py`를 아직 안 쳤거나 함수 이름 오타 |
| `ModuleNotFoundError: No module named 'bs4'` / `'pptx'` | `server\.venv`가 아닌 다른 가상환경 → `cd server` → `.venv\Scripts\Activate.ps1` |
| 크롤러가 항상 `POSTING_FETCH_FAILED` | 그 사이트가 JS로 그리거나 봇 차단 → 텍스트 붙여넣기로 안내하는 게 정상 동작 |
| 목록에서 `KeyError: 'job_postings'` | `select("*, job_postings(company, position)")` 오타 |
| 답변 수정 404 `ANSWER_NOT_FOUND` | 아직 초안(answers)이 없음 → 9-3의 SQL 먼저 / URL의 번호가 `questionOrder`와 다름 |
| 내보내기 500 `EXPORT_FAILED` (PPTX) | 슬라이드에 `title`이나 `layout` 칸이 없음 → SQL 확인 / 원인은 `print(e)`로 |
| 내보내기 500 `EXPORT_FAILED` (PDF) | LibreOffice 미설치 · `SOFFICE_PATH` 오타 |
| PPT 글자가 상자 밖으로 넘침 | 본문이 너무 김 → A에게 "본문 2~4줄" 약속 확인 / `add_text`의 size 줄이기 |
| SQL `invalid input syntax for type json` | JSON 안 따옴표가 `"`(큰따옴표)인지, 쉼표 빠졌는지 |
| SQL `0 rows` | `where id = '...'`에 붙여넣은 id가 틀림 |

## 다음 주 (4주차) 예고

탐색 탭(교내외 공고 · 취업 통계 · 선배 커리어 · 질문, `explore.py`) → 홈(`home.py`) → A 코드와 합치기 → 배포. 4주차 파일도 비워둔 채로 가이드만 드릴게요.
