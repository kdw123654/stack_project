# B 4주차 가이드: 탐색 탭 · 홈 · main.py 완성 · A와 합치기 · 배포

> **대상 기능**
> - EP-01~05: 교내외 공고, 취업 통계, 선배 정보·질문
> - HM-01·02: 홈 한 번에 조회, 추천 프로그램
>
> **시작 상태:** 3주차(공고·자소서·포트폴리오)가 끝났어요.
>
> **업데이트:** 요청에 따라 `routers/home.py`와 `main.py` 등록까지 코드를 채워 뒀어요. 아래 설명은 읽고 테스트만 하면 돼요.
> 그리고 명세표에 남아 있던 B 기능 3개(학교 인증 상태, 내 데이터 내려받기, 스펙 비교 통계)도 추가했어요. 맨 아래 **"추가 API"** 절을 보세요.

## 이 문서 읽는 법

| 표시 | 내용 |
|---|---|
| **📖 한 줄씩** | 이 코드가 무슨 일을 하는지 |
| **🤔 왜 이렇게?** | 다른 방법도 있는데 왜 이 방법을 골랐는지 |
| **🏢 현업에서는** | 실제 회사 서비스에서는 어떻게 하는지, 면접에 나올 만한 개념 |

---

## 0. B가 할 일 전체 지도: 15 STEP

| 주차 | STEP | 내용 | 상태 |
|---|---|---|---|
| 1주차 | 0~3 | 설치, Supabase, 테이블, 서버 띄우기 | ✅ |
| 2주차 | 4~7 | 로그인(이메일·학번), 내 정보, 파일, 경험 DB | ✅ |
| 3주차 | 8~10 | 공고, 자소서, 포트폴리오 PPTX | ✅ |
| **4주차** | **11~13** | **탐색 탭, 홈, main.py 완성** | ← 이번 주 |
| 4주차 | 14 | A의 AI 코드와 합치기 | 팀 일정에 맞춰 |
| 4주차 | 15 | 배포 (Render / Railway) | 프론트 연결 전 |

**15 STEP이면 끝이냐?** B 혼자 만드는 API(P0)는 **STEP 13에서 끝나요.** STEP 14~15는 팀 작업이에요.
- STEP 14: A의 코드를 넣고 같이 테스트해요.
- STEP 15: 서버를 인터넷에 올려서 프론트가 쓰게 해요.

그다음부터는 기능 추가가 아니라 **버그 수정, 실제 데이터 입력, 프론트 요청 대응**이 이어져요.

---

## STEP 11. 탐색 탭: EP-01~05 (`routers/explore.py`, 이미 작성됨)

### 기능 설명

```
탐색 탭
 ├─ 교내·교외 공고   GET  /explore/postings?type=CAMPUS|EXTERNAL   마감 안 지난 것만, D-day 포함
 │                   GET  /explore/postings/{id}
 │                   POST /explore/postings/{id}/job-posting       "이 공고로 서류 만들기" → 텍스트 돌려줌
 ├─ 취업 통계        GET  /explore/employment-stats?year=          학교 전체
 │                   GET  /explore/employment-stats/by-job?year=   학과 직무별 (값 큰 순)
 └─ 선배             GET  /explore/seniors?jobCategory=
                     GET  /explore/seniors/{id}
                     POST /explore/seniors/{id}/questions           선배에게 질문
                     GET  /explore/questions                        내가 한 질문 목록
```

이 데이터는 **사용자가 아니라 관리자(우리 팀)가 넣는 데이터**예요. 그래서 API는 거의 다 **읽기 전용**이고, 쓰는 건 "선배에게 질문" 하나뿐이에요.

### 이미 친 코드 다시 보기 (핵심만)

**① D-day 계산**
```python
def d_day(deadline: Optional[str]) -> Optional[int]:
    return None if deadline is None else (date.fromisoformat(deadline) - date.today()).days
```
- 📖 DB에서 온 `"2026-11-13"` 문자열을 날짜로 바꾸고, 오늘 날짜를 빼서 남은 일수를 구해요. 마감일이 없으면 `None`이에요.
- 🤔 D-day를 DB에 저장하지 않고 **조회할 때마다 계산**해요. 저장해 두면 내일 값이 틀려지니까요. 이렇게 시간에 따라 바뀌는 값은 저장하지 않고 계산하는 게 원칙이에요(파생 값).
- 🏢 서버가 한국이 아닌 곳(UTC)에 있으면 `date.today()`가 한국보다 하루 늦을 수 있어요. 현업에서는 `datetime.now(ZoneInfo("Asia/Seoul")).date()`처럼 시간대를 정해서 써요. 배포할 때 STEP 15에서 다시 볼게요.

**② 마감 안 지난 공고만, 마감 가까운 순**
```python
res = query.gte("deadline", date.today().isoformat()).order("deadline").execute()
```
- 📖 `gte` = greater than or equal (≥). 오늘 이후가 마감인 것만, 마감일 오름차순으로 가져와요.
- 🤔 지난 공고를 지우지 않고 **걸러서** 보여 줘요. 지난 데이터도 나중에 통계로 쓸 수 있어서예요.

**③ "이 공고로 서류 만들기"**
```python
text = f"{p['title']}\n{p['organization'] or ''}\n{p['description']}"
return ok(camel_keys({"sourceType": "TEXT", "text": text}))
```
- 📖 B는 공고 내용을 텍스트로 묶어서 돌려주기만 해요. 프론트가 이 텍스트로 A의 공고 분석 API를 불러요.
- 🤔 B가 직접 A의 함수를 부르지 않는 이유는 **분석이 오래 걸리기 때문**이에요. A 쪽은 진행 상태를 보여 주는 흐름이 따로 있어서, 거기로 넘기는 게 화면 흐름과 맞아요.

**④ 선배 목록은 필요한 칸만**
```python
query = db.table("seniors").select("id, display_name, company, position, career_years, "
                                   "grad_year, job_category, verified, hire_specs")
```
- 📖 목록에서는 `timeline`과 `linkedin_url`을 빼고 가져와요. 상세 화면(`/seniors/{id}`)에서만 전체를 줘요.
- 🏢 목록 API는 가볍게, 상세 API는 자세하게 만드는 게 일반적이에요. 목록에 100명이 나오면 안 쓰는 데이터 100개를 보내게 되니까요(over-fetching).

**⑤ 질문 저장 전 검사**
```python
senior_detail(senior_id, user)  # 존재 확인
if not body.content.strip():
    raise ApiError(400, "EMPTY_QUESTION", "질문 내용을 입력해 주세요.")
```
- 📖 없는 선배에게 질문하면 404, 공백만 보내면 400이에요. 저장할 때도 `.strip()`으로 앞뒤 공백을 지워요.

**⑥ 내 질문 + 선배 이름 같이**
```python
db.table("senior_questions").select("*, seniors(display_name, company)")
```
- 📖 `seniors(...)` = 외래키로 연결된 선배 테이블에서 이름과 회사를 같이 가져와요(join). 3주차 자소서 목록에서 공고 회사명을 가져온 것과 같은 방법이에요.

### 11-1. main.py에 추가

`explore.py`는 이미 쳐 두셔서 **main.py에도 추가해 뒀어요.** 지금 main.py는 이렇게 돼 있어요.

```python
from app.routers import auth, cover_letters, experiences, explore, files, job_postings, portfolios, users
...
for r in [auth, users, files, experiences, job_postings, cover_letters, portfolios, explore]:
```

### 11-2. 테스트 (Swagger, Authorize 된 상태)

| 순서 | API | 넣을 값 | 이렇게 나오면 정상 |
|---|---|---|---|
| 1 | `GET /explore/postings` | | 공고 3개, 각각 `dDay` 숫자 (오늘 마감이면 0) |
| 2 | `GET /explore/postings` | type = `CAMPUS` | 교내 공고 2개만 |
| 3 | `POST /explore/postings/{id}/job-posting` | 1번에서 나온 id | `sourceType: TEXT`, `text`에 제목·기관·설명 |
| 4 | `GET /explore/employment-stats/by-job` | | 기획 19 → IT 전산 17 → 연구개발 13 (값 큰 순) |
| 5 | `GET /explore/seniors` | | 선배 2명, `timeline` 없음 |
| 6 | `GET /explore/seniors/{id}` | 5번의 첫 번째 id | `timeline` 포함 전체 정보 |
| 7 | `POST /explore/seniors/{id}/questions` | `{"content": "   "}` | **400** `EMPTY_QUESTION` |
| 8 | `POST /explore/seniors/{id}/questions` | `{"content": "인턴 준비는 언제부터 하셨나요?"}` | 질문 저장됨 |
| 9 | `GET /explore/questions` | | 8번 질문 + `seniors: {displayName, company}` |
| 10 | `GET /explore/seniors/00000000-0000-0000-0000-000000000000` | | **404** `NOT_FOUND` |

> 공고가 0개로 나오면 seed 데이터 마감일(2026-11-09, 11-13, 11-18)이 지난 거예요. Supabase Table Editor에서 `explore_postings.deadline`을 미래 날짜로 바꿔 주세요.

---

## STEP 12. 홈: HM-01·02 (`routers/home.py`, 직접 치기)

### 기능 설명

```
홈 화면 (앱 켜면 제일 먼저)
 ┌───────────────────────────────┐
 │ 안녕하세요, OO님 · 목표 직무    │ ← profile         (users.py의 get_profile 재사용)
 ├───────────────────────────────┤
 │ 최근 올린 파일 3개              │ ← recentFiles     (files.py의 to_api 재사용)
 ├───────────────────────────────┤
 │ 추천 프로그램                   │ ← programs        (active = true 인 것 5개)
 └───────────────────────────────┘
        ↑ 이걸 API 한 번(GET /home)으로
```

🏢 **현업에서는** 이런 API를 **BFF(Backend For Frontend)** 또는 **집계(aggregation) API**라고 해요.
- 앱 첫 화면에서 API를 3번 부르면 로딩이 3번 생기고, 모바일에서는 느려요.
- 그래서 화면 하나에 필요한 걸 서버가 모아서 **한 번에** 줘요.
- 대신 각 데이터를 따로 부르는 API(`/users/me`, `/files`, `/programs/recommended`)도 남겨 둬요. 다른 화면에서 쓰니까요.

### 12-1. `app/routers/home.py`

**① import**

```python
from fastapi import APIRouter, Depends

from app.common import camel_keys, ok
from app.db import db
from app.deps import get_current_user
from app.routers.files import to_api as file_to_api
from app.routers.users import get_profile
```

- 📖 `from app.routers.files import to_api as file_to_api`: files.py에 이미 있는 "DB 한 줄 → API 모양" 변환 함수를 가져와요. `as`로 이름을 바꿔요.
- 🤔 `as`를 쓰는 이유: 다른 파일에도 `to_api`가 많아요(experiences, portfolios...). 이름이 겹치면 헷갈리니까 **어디 것인지 드러나게** 바꿔 둬요.
- 📖 `get_profile`: users.py의 `/users/me`가 쓰는 함수를 그대로 써요. 프로필이 없으면 404를 내는 처리까지 같이 따라와요.
- 🏢 같은 변환 코드를 홈에 또 쓰지 않고 **재사용**해요. 나중에 파일 응답 모양이 바뀌어도 files.py 한 곳만 고치면 홈도 같이 바뀌어요(DRY: Don't Repeat Yourself).

**② router**

```python
router = APIRouter(tags=["home"])
```

**③ 홈 한 번에 조회**

```python
@router.get("/home")
def home(user: dict = Depends(get_current_user)):
    files = (db.table("files").select("*").eq("user_id", user["id"])
             .order("uploaded_at", desc=True).limit(3).execute())
    return ok({"profile": get_profile(user["id"]),
               "recentFiles": [file_to_api(r) for r in files.data],
               "programs": recommended_programs()["data"]})
```

- 📖 `( ... )` 괄호로 감싸면 긴 체이닝을 여러 줄로 나눠 쓸 수 있어요. 파이썬은 괄호 안에서는 줄바꿈을 허용해요.
- 📖 `.order("uploaded_at", desc=True).limit(3)`: 최근에 올린 순서로 3개만 가져와요.
- 📖 `recommended_programs()["data"]`: 아래 ④ 함수를 **그냥 파이썬 함수로** 불러요. 그 함수는 `ok(...)`로 `{"success": True, "data": [...]}`를 돌려주니까, `["data"]`로 안쪽 목록만 꺼내요.
- 🤔 `.eq("user_id", user["id"])`는 2주차부터 계속 쓴 **내 것만** 조건이에요. 이게 빠지면 남의 파일이 홈에 떠요.

**④ 추천 프로그램**

```python
@router.get("/programs/recommended")
def recommended_programs():
    res = db.table("programs").select("*").eq("active", True).limit(5).execute()
    return ok(camel_keys(res.data))
```

- 📖 `active = true`인 프로그램만 최대 5개 가져와요. 관리자가 Table Editor에서 `active`를 false로 바꾸면 화면에서 바로 빠져요.
- 🤔 이 API에는 `Depends(get_current_user)`가 **없어요.** 학교 프로그램 안내는 로그인 안 한 사람이 봐도 되는 공개 정보라서요. 그래서 ③에서 `user` 없이 바로 부를 수 있어요.
- 🏢 "삭제" 대신 `active` 플래그로 숨기는 방식을 **소프트 삭제(soft delete)**라고 해요. 실수로 지워도 되살릴 수 있고, 기록도 남아요.

### 12-2. main.py에 추가 (home.py를 다 친 **다음에**)

```python
from app.routers import auth, cover_letters, experiences, explore, files, home, job_postings, portfolios, users
```

```python
for r in [auth, users, files, experiences, job_postings, cover_letters, portfolios, explore, home]:
```

- 📖 import 줄에 `home`, for 목록 끝에 `home`. 두 군데예요.

### 12-3. 테스트

| 순서 | API | 이렇게 나오면 정상 |
|---|---|---|
| 1 | `GET /programs/recommended` (자물쇠 **없음**) | Authorize 안 해도 `현직 컨설턴트 무료 자소서 코칭` 1개 |
| 2 | `GET /home` | `profile`(학번 22016007), `recentFiles`(최대 3개), `programs`(1개) |
| 3 | Authorize 지우고(Logout) `GET /home` | **401** |

> `recentFiles`가 `[]`이면 2주차 테스트 파일을 지운 상태라서 그래요. `POST /files`로 하나 올리고 다시 확인해 보세요.

---

## STEP 13. main.py 완성

STEP 12까지 하면 main.py가 이렇게 돼요. 지금 파일과 비교만 해 보세요.

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from app.common import register_error_handlers
from app.config import CORS_ORIGINS
from app.routers import auth, cover_letters, experiences, explore, files, home, job_postings, portfolios, users

app = FastAPI(title="STACK API")

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
register_error_handlers(app)

for r in [auth, users, files, experiences, job_postings, cover_letters, portfolios, explore, home]:
    app.include_router(r.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}


def openapi_with_file_picker():
    ...  # 2주차에 넣은 Swagger 파일 선택 버튼 고치는 코드 (그대로 두기)


app.openapi = openapi_with_file_picker
```

**마지막 점검:** `/docs`를 위에서부터 한 번씩 눌러 보세요. 401 외의 500 에러가 하나도 없으면 B의 P0는 완료예요.

🏢 **현업에서는** 여기서 한 번 **태그(tag)**를 찍어 둬요. 나중에 A와 합치다 뭔가 깨지면 이 시점으로 돌아올 수 있어요.

```bash
git add -A
```
```bash
git commit -m "BE: B P0 API 완료 (탐색, 홈)"
```

---

## STEP 14. A와 합치기

**방식:** 같은 `server/` 프로젝트 하나에 A의 코드도 넣어요. 서버가 1개면 배포도 1번이에요.

**Git 흐름**
```
main
 ├─ STACK_FE      (프론트)
 ├─ STACK_BE_A    (A: AI)
 └─ STACK_BE_B    (B: 나) ──┐
                            ├─▶ 둘 다 main으로 PR → 리뷰 → merge
```
- 순서는 보통 **B 먼저 main에 merge** → A가 main을 받아서(`git pull origin main`) 자기 코드를 B 함수에 맞게 고친 다음 PR을 올려요. B가 DB와 공통 코드(`common.py`, `deps.py`)의 주인이라서 이 순서가 충돌이 적어요.

**A에게 알려줄 것 (그대로 복사해서 보내도 돼요)**

| A가 하던 것 | B 쪽에서 쓸 것 |
|---|---|
| `store.py` 메모리 저장 | 삭제하고 아래 함수들로 교체 |
| `dev_files.py` 업로드 | B의 `/files` 사용. 분석할 때는 `services/storage.py`의 `download_file(file_id, user_id)` |
| `experience_client.py` | `services/experiences.py`의 `save_experiences(user_id, items)`, `list_experiences(user_id)` |
| 공고 분석 결과 저장 | `routers/job_postings.py`의 `save_posting(user_id, source_type, url, raw_text, analysis)` |
| URL 공고 | `services/crawler.py`의 `fetch_posting(url)`로 텍스트를 받은 다음 분석 |
| 자소서 초안 저장 | `routers/cover_letters.py`의 `update_cl(cl_id, {"selections": ..., "answers": ..., "status": "DRAFT"})` |
| 포폴 구성안·슬라이드 저장 | `routers/portfolios.py`의 `update_pf(pf_id, {"experience_ids": ..., "outline": ...})` / `{"slides": ...}` |
| `USER_ID = "dev-user"` | `user: dict = Depends(get_current_user)` → `user["id"]` |
| A의 `common.py` | B의 `common.py` 하나로 통일 |

**데이터 모양 약속 (3주차 테스트에서 확인한 것)**
- 자소서 답변: `{"questionOrder", "content", "charCount", "charLimit"}`
- 포폴 구성안: `[{"slideNo", "title", ...}]`. `slideNo`는 B가 순서대로 다시 매겨요.
- 포폴 슬라이드: `{"slideNo", "layout", "section", "title", "body", "metrics": [{"value", "label"}]}`
  - `layout`은 `COVER`, `INTRO`, `OVERVIEW`, `PROBLEM_PROCESS`, `RESULT_WITH_CHART`, `SUMMARY`, `CLOSING` 중 하나
  - `type`이 아니라 **`layout`**이에요. A와 꼭 맞춰야 해요.

🏢 **현업에서는** 이런 약속을 **API 계약(contract)**이라고 하고, 문서나 Pydantic 모델로 고정해 둬요. 한쪽이 키 이름 하나만 바꿔도 다른 쪽이 조용히 깨지기 때문이에요.

**합친 다음 테스트:** 3주차에서 SQL로 흉내 낸 부분(공고 넣기, 자소서 초안, 포폴 슬라이드)을 이번에는 **A의 API로** 만들고, B의 API로 조회·수정·내보내기가 되는지 확인해요.

---

## STEP 15. 배포

**어디에:** **Render** 또는 **Railway**. GitHub를 연결하면 push할 때마다 자동으로 배포돼요.

| 설정 | 값 |
|---|---|
| Root directory | `server` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| 환경변수 | `.env` 내용을 대시보드에 한 줄씩 입력 (`.env` 파일은 절대 올리지 않음) |
| `CORS_ORIGINS` | 프론트 배포 주소 추가 |

- 📖 `--host 0.0.0.0`: 내 PC에서는 `127.0.0.1`(나만 접속)이었지만, 서버에서는 외부 접속을 받아야 해요.
- 📖 `$PORT`: 배포 서비스가 정해 주는 포트 번호를 써요.

**주의할 것**
- **PDF 내보내기:** 서버에 LibreOffice가 있어야 해요. Dockerfile에 `apt-get install -y libreoffice-impress fonts-nanum`을 추가해야 하는데, 어려우면 **PPTX만 먼저** 지원해요. 지금 PC에서도 PPTX만 테스트했어요.
- **한글 폰트:** 리눅스 서버에는 "맑은 고딕"이 없어서 PDF로 바꾸면 나눔고딕으로 바뀌어요. PPTX는 사용자 PC 폰트로 열리니 문제없어요.
- **시간대:** 서버는 보통 UTC예요. 탐색 탭 D-day가 한국 시간 오전 9시 전에 하루 어긋날 수 있어요. 필요하면 STEP 11 ①의 🏢처럼 `Asia/Seoul`로 바꿔요.
- **무료 플랜:** 일정 시간 요청이 없으면 서버가 잠들어서, 첫 요청이 30초쯤 걸릴 수 있어요. 발표 전에 한 번 깨워 두세요.

---

## 추가 API (US-02, US-06, CM-02)

| ID | API | 하는 일 | 파일 |
|---|---|---|---|
| US-02 | `GET /users/me/school-verification` | 학교 메일(`@suwon.ac.kr`)로 인증을 마쳤는지, 인증 시각, 학번 | `routers/users.py` |
| US-06 | `GET /users/me/data-export` | 내 데이터(프로필·동의·파일 목록·경험·공고·자소서·포폴·질문)를 JSON 파일로 내려받기 | `routers/users.py` |
| CM-02 | `GET /competency-map/comparison` | 목표 기업(없으면 목표 직무) 입사 선배들의 입사 스펙 TOP 10, 선배 중 비율(%), 내가 가진 것인지 | `routers/competency.py` |

**US-02 학교 인증 상태**
- 📖 `db.auth.admin.get_user_by_id(...)`: Supabase Auth에 저장된 계정 정보에서 이메일 인증 시각(`email_confirmed_at`)을 꺼내요.
- 🤔 인증 여부를 profiles에 따로 저장하지 않아요. Auth가 이미 정확한 값을 갖고 있는데 따로 저장하면 두 값이 어긋날 수 있어서예요(단일 원천, single source of truth).

**US-06 내 데이터 내려받기**
- 📖 `Content-Disposition: attachment` 헤더를 붙이면 브라우저가 화면에 보여 주지 않고 `stack-my-data.json` 파일로 저장해요.
- 🏢 개인정보보호법상 "내 정보 열람·전송 요구권" 대응 기능이에요. 회사에서는 보통 데이터가 많아서 비동기 작업으로 만들고 메일로 링크를 보내요. 우리 규모에서는 바로 내려줘도 충분해요.
- ⚠️ A의 AI 작업 기록(A 서버의 sqlite)은 아직 포함되지 않아요. A와 합칠 때 A의 `/ai-data/export` 결과를 여기에 붙이면 돼요.

**CM-02 스펙 비교**
- 📖 선배를 찾는 순서는 ① 목표 기업 이름이 들어간 선배, ② 없으면 목표 직무가 직무명·직무 분류에 들어간 선배예요. `basis`가 `COMPANY` / `JOB` / `null`로 알려 줘요.
- 📖 `Counter(...).most_common(10)`: 선배들 입사 스펙을 다 모아서 많이 나온 순서로 10개를 뽑아요.
- 📖 `mine`: 내 경험의 태그·스킬에 그 스펙이 들어 있으면 true예요. `"TOEIC 870"` ↔ `"toeic"`처럼 한쪽이 다른 쪽을 포함하면 같다고 봐요(대소문자 무시).
- 🤔 `.or_(...)` 필터에 사용자가 쓴 글자를 넣기 전에 `,` `(` `)` `%` 같은 글자를 지워요. 이 글자들은 Supabase 필터 문법이라, 그대로 넣으면 쿼리가 깨지거나 의도와 다르게 동작해요(일종의 인젝션 방어).

**테스트 (실제 Supabase, 7/7 통과)**

| API | 확인한 것 |
|---|---|
| `GET /programs/recommended` | 로그인 없이도 200 |
| `GET /home` | 프로필(학번), 최근 파일, 프로그램 |
| `GET /users/me/school-verification` | `verified: true` |
| `GET /users/me/data-export` | 파일 다운로드 헤더, 테이블 7개 + 프로필 |
| `GET /competency-map/comparison` | 목표 기업 "네이버" → `COMPANY` 기준 / 없는 회사 + 직무 "프론트엔드, (개발)" → `JOB` 기준 / 맞는 선배 없음 → 0명 |
| 로그인 없이 `/home`, `/competency-map/comparison` | 401 |

## 프론트에 알려줄 것

- 로그인 후 받은 `accessToken`을 모든 요청 헤더에 `Authorization: Bearer ...`로 붙여요.
- 401 `INVALID_TOKEN`이 오면 `POST /auth/refresh {refreshToken}`로 새 토큰을 받고 다시 시도해요. 그것도 실패하면 로그인 화면으로 보내요.
- 에러는 항상 `{"success": false, "error": {"code", "message"}}` 모양이에요. `message`를 그대로 토스트로 띄워도 돼요.
- 파일·포폴 다운로드는 `downloadUrl`(1시간 유효)을 그대로 열면 돼요.
- 홈은 `GET /home` 한 번이면 돼요.

## 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| `has no attribute 'router'` | 빈 파일(home.py)을 main.py에 먼저 추가함 → 파일을 다 치고 추가 |
| 탐색 공고가 0개 | seed 마감일이 지남 → Table Editor에서 deadline 수정 |
| 홈 `profile`에서 404 `PROFILE_NOT_FOUND` | 회원가입 후 프로필이 안 만들어진 계정 → 이메일 인증(verify)부터 다시 |
| 포폴 내보내기 500 `EXPORT_FAILED` | `format: PDF`인데 LibreOffice가 없음 → `PPTX`로 |
