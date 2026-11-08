# B 2주차 가이드 — 학번·비밀번호 로그인 · 내 정보 · 파일 업로드 · 경험 DB

> 대상 기능: AU-06·07 (학번·비밀번호) / AU-05, ST-01~05 (내 정보·동의·약관·탈퇴) / FI-01·02·04 (파일) / EX-01·02·04 (경험 DB)
> 1주차(Supabase 연결, 테이블, 메일 인증 로그인)가 끝난 상태에서 시작합니다.
> 이 문서의 코드는 실제로 돌려서 확인한 코드이고, `server/` 폴더의 파일과 한 글자도 다르지 않습니다.

## 이 문서 읽는 법

코드 블록마다 아래 3가지가 붙어 있어요.

| 표시 | 내용 |
|---|---|
| **📖 한 줄씩** | 이 코드가 무슨 일을 하는지 |
| **🤔 왜 이렇게?** | 다른 방법도 있는데 왜 이 방법을 골랐는지 |
| **🏢 현업에서는** | 실제 회사 서비스에서는 어떻게 하는지, 면접에서 물어볼 만한 개념 |

### 직접 타이핑하는 법

`server/` 안 파일에는 이미 완성 코드가 들어 있어요. 직접 쳐보고 싶으면:

1. 파일을 열고 `Ctrl+A` → `Delete`로 비우기
2. 이 문서의 코드 블록을 **위에서부터 순서대로** 타이핑 (블록과 블록 사이는 빈 줄 2개)
3. 파일 하나를 다 쳤으면 `Ctrl+S` → 서버가 자동 재시작(`--reload`)되면서 에러가 있으면 터미널에 빨갛게 나옴

> 타이핑 중간에 저장하면 서버가 import 에러를 낼 수 있어요. 파일 하나를 다 치고 나서 확인하면 됩니다.
> 오타를 찾기 어려우면: 터미널 에러 맨 아래 줄에 **파일 이름과 줄 번호**가 나와요. 그 줄과 문서를 비교하세요.

---

## 0. 2주차 전체 그림

### 이번 주에 만드는 것

| 화면(Figma) | API | 파일 |
|---|---|---|
| 로그인 (학번·비밀번호) | `POST /auth/login` | `routers/auth.py` |
| 온보딩 > 비밀번호 설정 / 설정 > 비밀번호 변경 | `POST /auth/password` | `routers/auth.py` |
| 온보딩 / 마이페이지 | `GET·PATCH /users/me`, `PATCH /users/me/target` | `routers/users.py` |
| 설정 > 동의 관리 | `GET·PATCH /users/me/consents` | `routers/users.py` |
| 약관 보기 | `GET /policies/{type}` | `routers/users.py` |
| 설정 > 회원 탈퇴 | `DELETE /users/me` | `routers/users.py` + `services/storage.py` |
| 파일 업로드 / 최근 파일 | `POST·GET /files`, `GET·DELETE /files/{id}` | `routers/files.py` + `services/storage.py` |
| 나의 경험 보관함 | `GET·POST /experiences`, `GET·PATCH·DELETE /experiences/{id}`, `GET /experiences/categories` | `routers/experiences.py` + `services/experiences.py` |

**만드는 순서**: `03 SQL` → `auth.py` → `storage.py` → `users.py` → `files.py` → `services/experiences.py` → `routers/experiences.py`
(탈퇴가 파일 삭제를 쓰고, 경험 라우터가 경험 서비스를 쓰기 때문에 "쓰이는 쪽"부터 만듭니다.)

### 요청 하나가 처리되는 구조

모든 API가 똑같은 길을 지나갑니다. 이것만 이해하면 나머지는 반복이에요.

```
프론트: PATCH /api/v1/users/me   헤더 Authorization: Bearer eyJ...   바디 {"name":"김수원"}
   │
   ▼
① main.py          라우터 찾기 (prefix /api/v1 + users.py의 "/users/me")
   ▼
② deps.py          Depends(get_current_user): 토큰 검사 → user = {"id", "email"}   실패하면 401
   ▼
③ Pydantic 모델     바디를 ProfileUpdate로 검사 (grade가 숫자인지 등)          실패하면 422
   ▼
④ 라우터 함수       실제 로직: db.table("profiles").update(...).eq("id", user["id"])
   │   (복잡하거나 여러 곳에서 쓰는 로직은 services/로 뺌)
   ▼
⑤ Supabase         Postgres에 SQL 실행
   ▼
⑥ ok(data)         {"success": true, "data": {...}} 로 감싸서 응답
   (중간 어디서든 raise ApiError(...) → common.py가 {"success": false, "error": {...}} 로 바꿔줌)
```

### 현업에서는 이 구조를 뭐라고 부르나

| 우리 코드 | 현업 용어 | 하는 일 |
|---|---|---|
| `routers/*.py` | **Controller** (Spring), View (Django), Handler | HTTP 요청/응답만 담당. URL, 입력 검사, 상태코드 |
| `services/*.py` | **Service** 계층 | 비즈니스 로직. 여러 라우터·다른 팀원(A)이 같이 쓰는 함수 |
| `db.table(...)` | **Repository** / DAO / ORM | DB 접근 |
| Pydantic 모델 (`ProfileUpdate` 등) | **DTO** (Data Transfer Object), Request/Response 스키마 | 들어오고 나가는 데이터의 모양 |
| `deps.py` | **미들웨어** / 인증 필터 / Guard | 공통 전처리 (로그인 확인) |
| `ok()` / `ApiError` | 공통 응답 포맷 / 글로벌 예외 핸들러 | 모든 API 응답 모양 통일 |

회사 규모가 커지면 이 계층이 더 엄격하게 나뉘고(라우터는 DB를 직접 만지지 않음), 지금 우리처럼 작은 팀은 **간단한 CRUD는 라우터에서 바로, 공유 로직만 services로** 빼는 실용적인 방식을 많이 씁니다.

### REST API 설계 규칙

| 규칙 | 예시 |
|---|---|
| URL은 **명사(자원)**, 동작은 **HTTP 메서드** | `GET /files`(목록), `POST /files`(생성), `DELETE /files/{id}`(삭제) |
| `GET` 조회 · `POST` 생성 · `PATCH` 일부 수정 · `PUT` 전체 교체 · `DELETE` 삭제 | 이름만 바꿀 땐 `PATCH /users/me` |
| 로그인한 본인은 `me` | `/users/{id}` 대신 `/users/me` → 남의 id를 넣어볼 여지 자체가 없음 |
| JSON 키는 **camelCase**, DB 컬럼은 **snake_case** | DB `desired_job` ↔ API `desiredJob` |
| 에러는 **상태코드 + 에러코드** | 404 + `FILE_NOT_FOUND` → 프론트는 code로 분기, message는 그대로 토스트 |
| 로그인처럼 "자원"이 아닌 동작은 동사도 OK | `POST /auth/login` (업계 관례) |

### 상태코드 정리

| 코드 | 뜻 | 우리 서버에서 언제 |
|---|---|---|
| 200 | 성공 | 대부분 |
| 400 | 요청이 규칙 위반 | 파일 6개 이상, 학번 형식 틀림, 약한 비밀번호 |
| 401 | 로그인 안 됨 / 로그인 실패 | 토큰 없음·만료, 학번·비밀번호 틀림 |
| 404 | 없음 (또는 **내 것이 아님**) | 남의 파일 id로 조회 |
| 409 | 충돌 | 이미 다른 사람이 등록한 학번 |
| 422 | 입력 모양이 틀림 | `grade`에 "삼학년", 필수 칸 누락 |
| 429 | 너무 많이 요청함 | 메일 재전송·로그인 시도 연타 |
| 500 | 서버 버그 | 터미널 로그 확인 |

> 남의 데이터를 조회했을 때 403(권한 없음) 대신 **404**를 주는 이유: 403을 주면 "그 id가 존재한다"는 정보가 새요.

### 시작 전 확인

- [ ] Supabase **Storage → `files` 버킷**(Public 끔)이 있다
- [ ] `/docs`에서 메일 인증 로그인 → **Authorize**에 토큰 넣기까지 된다
- [ ] 서버가 켜져 있다 (`server` 폴더에서 `uvicorn app.main:app --reload`)

---

## STEP 4-2. 학번 · 비밀번호 로그인 — AU-06·07 (2일)

### 기능 설명

매번 메일 인증코드를 받는 건 불편하니까, **처음 한 번만 메일로 재학생 인증**을 하고 그다음부터는 **학번 + 비밀번호**로 로그인하게 합니다.

```
[처음 가입]
  메일 인증 (send-code → verify)  →  isNewUser: true, hasPassword: false
        ↓ 받은 토큰으로
  POST /auth/password  {studentId: "22016007", password: "abcd1234"}   ← 학번·비밀번호 등록
        ↓
[다음부터]
  POST /auth/login     {studentId: "22016007", password: "abcd1234"}   → 토큰

[비밀번호를 잊었을 때]
  메일 인증으로 로그인 → POST /auth/password 로 새 비밀번호 등록 (같은 API 재사용)
```

| API | 로그인 필요 | 하는 일 |
|---|---|---|
| `POST /auth/password` | ✅ | 학번·비밀번호 등록 또는 변경 |
| `POST /auth/login` | ❌ | 학번·비밀번호로 로그인 → 토큰 |
| `POST /auth/email/verify` (수정) | ❌ | 응답에 `hasPassword`, `user.studentId` 추가 → 프론트가 "비밀번호 설정 화면"으로 보낼지 판단 |

### 구조: 학번은 "별명", 진짜 아이디는 이메일

Supabase 로그인은 **이메일 + 비밀번호** 방식만 지원해요(학번 칸이 없음). 그래서:

```
profiles 테이블                              Supabase auth.users
┌──────────┬──────────────────────┐          ┌──────────────────────┬─────────────────────┐
│student_id│ email                │          │ email                │ encrypted_password  │
├──────────┼──────────────────────┤  ──▶     ├──────────────────────┼─────────────────────┤
│ 22016007 │ 22016007@suwon.ac.kr │  이메일로 │ 22016007@suwon.ac.kr │ $2a$10$Xk...(해시)  │
└──────────┴──────────────────────┘  로그인   └──────────────────────┴─────────────────────┘
① 학번으로 이메일을 찾고                       ② 그 이메일 + 비밀번호로 Supabase에 로그인
```

**비밀번호는 우리 DB에 저장하지 않아요.** Supabase Auth가 bcrypt로 해시해서 보관하고, 우리는 "맞는지 확인해줘"라고 부탁만 합니다.

### 4-2-1. DB에 학번 칸 추가 — `sql/03_student_login.sql`

Supabase **SQL Editor → New query**에 붙여넣고 **Run**.

```sql
-- 학번·비밀번호 로그인용 (01, 02를 실행한 뒤에 실행)
-- 학번은 로그인 아이디라서 사람마다 달라야 함 → unique. 아직 등록 안 한 사람은 null (null끼리는 중복 OK)
alter table profiles add column if not exists student_id text unique;
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `alter table profiles add column` | 이미 있는 테이블에 칸 추가 (데이터는 그대로 유지) |
| `if not exists` | 두 번 실행해도 에러 안 남 |
| `text` | 숫자가 아니라 **문자**로 저장. `00123456`처럼 0으로 시작하는 학번도 안전하고, 학번으로 계산할 일이 없으니까 |
| `unique` | 같은 학번이 두 줄 생기면 DB가 거절 → 로그인 아이디가 겹치는 사고를 DB 차원에서 막음 |

**🤔 왜 이렇게?**
- 01 SQL을 고치지 않고 **새 파일(03)** 로 만든 이유: 01은 이미 실행했어요. 테이블을 지우고 다시 만들면 데이터가 날아가니까, **바뀐 부분만** 실행하는 파일을 순서대로 쌓습니다.
- `unique` 칸에 `null`은 여러 개 있어도 돼요. 아직 비밀번호를 안 만든 사람들은 전부 `null`.

**🏢 현업에서는**
- 이렇게 DB 구조 변경을 번호 붙은 파일로 쌓는 걸 **마이그레이션(migration)** 이라고 해요. Flyway, Alembic, Prisma Migrate, `supabase migration` 같은 도구가 "어디까지 실행했는지"를 기록해서 팀원·서버마다 자동으로 맞춰줍니다.
- 운영 중인 큰 테이블에 칸을 추가할 땐 잠금(lock) 시간을 걱정해서 새벽에 하거나, 기본값 없이 먼저 추가하고 나중에 채우는 식으로 나눠서 합니다.

> ⚠️ **이 SQL을 실행하기 전에는** `POST /auth/login`, `POST /auth/password`가 500 에러(`column profiles.student_id does not exist`)를 냅니다.

### 4-2-2. `app/routers/auth.py` — 전체 다시 치기

1주차 코드에 학번 기능이 섞여 들어가서, 파일 전체를 다시 칩니다. 1주차에 이미 친 부분도 설명을 붙였으니 복습한다고 생각하세요.

**① import와 라우터**

```python
import re

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError as PostgrestError
from pydantic import BaseModel
from supabase_auth.errors import AuthApiError

from app.common import ApiError, now_iso, ok
from app.config import ALLOWED_EMAIL_DOMAIN
from app.db import auth_client, db
from app.deps import bearer, get_current_user

router = APIRouter(tags=["auth"])
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `import re` | 정규식(regular expression). "숫자 8자리" 같은 **문자열 규칙 검사**용 |
| `from postgrest.exceptions import APIError as PostgrestError` | DB(Postgres) 에러. 이름이 `ApiError`(우리 것)와 헷갈려서 `as`로 별명을 붙임 |
| `AuthApiError` | Supabase 로그인 관련 에러 (비밀번호 틀림, 너무 많은 요청 등) |
| `now_iso` | 현재 시각 문자열 (수정 시각 기록) |
| `auth_client, db` | `auth_client()`는 로그인용 새 클라이언트, `db`는 관리자 권한 클라이언트 |
| `bearer, get_current_user` | 토큰 꺼내기 / 로그인한 사용자 확인 |

**🤔 왜 이렇게?** 에러 종류(Supabase Auth 에러, DB 에러)를 **정확한 클래스로** 잡아야, 예상한 에러만 친절한 메시지로 바꾸고 예상 못 한 버그는 그대로 터뜨려서 발견할 수 있어요.

**🏢 현업에서는** `except Exception:`으로 전부 삼키는 코드는 리뷰에서 거의 항상 지적받아요. 버그가 "아무 일도 없었던 것처럼" 숨어버리기 때문입니다.

**② 학번·비밀번호 규칙**

```python
STUDENT_ID_RE = re.compile(r"\d{8}")                        # 수원대 학번: 숫자 8자리 (예: 22016007)
PASSWORD_RE = re.compile(r"(?=.*[A-Za-z])(?=.*\d)\S{8,64}")  # 8~64자, 영문+숫자 포함, 공백 없음
```

**📖 한 줄씩**

| 코드 | 의미 |
|---|---|
| `\d{8}` | 숫자(`\d`) 정확히 8개 |
| `(?=.*[A-Za-z])` | "앞으로 보기(lookahead)": 어딘가에 영문자가 **최소 1개** 있어야 함 |
| `(?=.*\d)` | 어딘가에 숫자가 최소 1개 |
| `\S{8,64}` | 공백이 아닌 글자(`\S`) 8~64개 |
| `re.compile(...)` | 규칙을 미리 한 번 준비해두고 재사용 (요청마다 다시 해석하지 않음) |
| `r"..."` | raw 문자열. `\d`의 `\`를 파이썬이 건드리지 않게 |

**🤔 왜 이렇게?**
- 규칙을 **파일 맨 위 상수**로 둬서, "학번이 10자리로 바뀌었어요" 같은 요청이 오면 한 줄만 고치면 됩니다.
- 최대 64자: 아주 긴 문자열(예: 100만 글자)을 보내서 서버를 느리게 만드는 공격을 막고, bcrypt는 72바이트까지만 쓰기 때문.
- 공백 금지: 복사·붙여넣기할 때 앞뒤 공백이 섞여 "맞게 쳤는데 로그인이 안 돼요" 문의가 생기는 걸 방지.

**🏢 현업에서는**
- 최신 보안 가이드(NIST SP 800-63B)는 "특수문자 필수" 같은 복잡한 규칙보다 **길이(8자 이상, 가능하면 더 길게)** 와 **유출된 비밀번호 목록 차단**을 더 중요하게 봐요. 한국 서비스는 관행적으로 "영문+숫자+특수문자 조합"을 많이 요구합니다.
- 정규식은 프론트에서도 똑같이 검사해서 사용자가 버튼을 누르기 전에 알려주지만, **서버 검사가 진짜 방어선**이에요. 프론트 검사는 개발자도구로 쉽게 건너뛸 수 있으니까요.

**③ 요청 모양 (DTO)**

```python
class SendCodeRequest(BaseModel):
    email: str


class VerifyRequest(BaseModel):
    email: str
    code: str


class RefreshRequest(BaseModel):
    refreshToken: str


class PasswordSetRequest(BaseModel):
    studentId: str
    password: str


class LoginRequest(BaseModel):
    studentId: str
    password: str
```

**📖 한 줄씩**
- `BaseModel`을 상속한 클래스 = "이 API는 이런 JSON을 받는다"는 설명서. 칸이 빠지거나 타입이 틀리면 FastAPI가 자동으로 **422**를 돌려줘요.
- `PasswordSetRequest`와 `LoginRequest`는 칸이 똑같지만 **일부러 따로** 만들었어요.

**🤔 왜 이렇게?** 지금은 같아도 나중에 "비밀번호 변경 시 현재 비밀번호 확인", "로그인 유지 체크박스" 같은 칸이 각각 추가될 수 있어요. 처음부터 나눠두면 한쪽을 고쳐도 다른 쪽이 안 깨집니다.

**🏢 현업에서는** API마다 Request/Response 모델을 따로 두는 게 일반적이고, 이 모델들로 **Swagger 문서가 자동 생성**돼서 프론트 개발자와의 약속(계약, contract) 역할을 합니다. 지금 `/docs` 화면이 바로 그거예요.

**④ 입력 검사 함수**

```python
def normalize_school_email(email: str) -> str:
    email = email.strip().lower()
    if not email.endswith("@" + ALLOWED_EMAIL_DOMAIN):
        raise ApiError(400, "NOT_SCHOOL_EMAIL", f"@{ALLOWED_EMAIL_DOMAIN} 학교 이메일만 가입할 수 있어요.")
    return email


def check_student_id(student_id: str) -> str:
    student_id = student_id.strip()
    if not STUDENT_ID_RE.fullmatch(student_id):
        raise ApiError(400, "INVALID_STUDENT_ID", "학번은 숫자 8자리로 입력해 주세요.")
    return student_id


def check_password(password: str) -> str:
    if not PASSWORD_RE.fullmatch(password):
        raise ApiError(400, "WEAK_PASSWORD", "비밀번호는 영문과 숫자를 섞어 8자 이상(공백 없이)으로 만들어 주세요.")
    return password
```

**📖 한 줄씩**

| 함수 | 하는 일 |
|---|---|
| `normalize_school_email` | 앞뒤 공백 제거 + 소문자로 통일 → `@suwon.ac.kr`로 끝나는지 확인 |
| `check_student_id` | 앞뒤 공백 제거 → 숫자 8자리인지 (`fullmatch` = 처음부터 끝까지 전부 일치) |
| `check_password` | 규칙에 맞는지. 비밀번호는 **공백을 지우지 않음** (사용자가 친 그대로 검사) |

**🤔 왜 이렇게?**
- `match` 대신 `fullmatch`: `match`는 앞부분만 맞아도 통과해서 `22016007abc`가 통과돼요.
- 검사 함수가 **깨끗해진 값을 돌려주는** 구조 → `student_id = check_student_id(body.studentId)` 한 줄로 검사와 정리를 동시에.
- 에러 메시지를 사용자가 바로 이해할 수 있는 한국어로 → 프론트는 `message`를 그대로 띄우면 끝.

**🏢 현업에서는** 이런 함수를 **validator**라고 부르고, Pydantic의 `@field_validator`로 모델 안에 넣기도 해요. 우리는 에러 코드(`INVALID_STUDENT_ID`)를 우리 형식으로 주고 싶어서 함수로 뺐습니다. 이메일을 소문자로 통일하는 **정규화(normalization)** 는 거의 모든 서비스가 해요. 안 하면 `Kim@...`과 `kim@...`이 다른 계정이 됩니다.

**⑤ 토큰 응답 모양**

```python
def token_response(session) -> dict:
    return {"accessToken": session.access_token, "refreshToken": session.refresh_token,
            "expiresIn": session.expires_in}
```

**📖 한 줄씩**

| 값 | 설명 |
|---|---|
| `accessToken` | API 호출할 때 쓰는 **출입증**. 1시간이면 만료 |
| `refreshToken` | 출입증 재발급용 **재발급권**. 오래 유지됨 |
| `expiresIn` | accessToken 남은 시간(초) |

**🤔 왜 이렇게?** 메일 로그인·학번 로그인·토큰 갱신 3곳에서 똑같은 모양으로 내려줘야 프론트가 한 가지 방식으로 저장할 수 있어서 함수 하나로 묶었어요.

**🏢 현업에서는** accessToken은 **JWT**(JSON Web Token)예요. 서버가 서명한 문자열이라 DB 조회 없이 위조 여부를 확인할 수 있어요. 짧은 accessToken + 긴 refreshToken 조합이 업계 표준이고, 웹에서는 refreshToken을 자바스크립트가 못 읽는 **httpOnly 쿠키**에 넣어 XSS 공격으로부터 보호하는 경우가 많습니다.

**⑥ 메일 인증 (1주차, `verify`에 3줄 추가)**

```python
@router.post("/auth/email/send-code")
def send_code(body: SendCodeRequest):
    email = normalize_school_email(body.email)
    try:
        auth_client().auth.sign_in_with_otp({"email": email, "options": {"should_create_user": True}})
    except AuthApiError as e:
        if e.status == 429:
            raise ApiError(429, "TOO_MANY_REQUESTS", "잠시 후 다시 시도해 주세요.")
        raise ApiError(400, "SEND_CODE_FAILED", "인증 메일을 보내지 못했어요.")
    return ok({"sent": True})


@router.post("/auth/email/verify")
def verify_code(body: VerifyRequest):
    email = normalize_school_email(body.email)
    try:
        res = auth_client().auth.verify_otp({"email": email, "token": body.code.strip(), "type": "email"})
    except AuthApiError:
        raise ApiError(400, "INVALID_CODE", "인증 코드가 틀렸거나 만료됐어요.")
    if res.session is None or res.user is None:
        raise ApiError(400, "INVALID_CODE", "인증 코드가 틀렸거나 만료됐어요.")

    user_id = res.user.id
    profile = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    is_new = profile is None or profile.data is None
    if is_new:
        db.table("profiles").insert({"id": user_id, "email": email}).execute()
        db.table("consents").insert({"user_id": user_id}).execute()
    student_id = None if is_new else profile.data.get("student_id")

    return ok({**token_response(res.session), "isNewUser": is_new,
               "hasPassword": student_id is not None,
               "user": {"id": user_id, "email": email, "studentId": student_id}})
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `sign_in_with_otp` | Supabase가 인증코드 메일 발송. `should_create_user: True` → 처음 보는 이메일이면 계정 생성 |
| `e.status == 429` | Supabase가 "너무 자주 보냄" → 우리 에러 코드로 바꿔서 전달 |
| `verify_otp(... "type": "email")` | 6자리 코드 확인 → 맞으면 세션(토큰) 발급 |
| `is_new` | `profiles` 줄이 없으면 처음 온 사람 → 빈 프로필·동의 줄 생성 |
| `student_id = None if is_new else profile.data.get("student_id")` | **(추가)** 기존 회원이면 학번 꺼내기. `.get`은 칸이 없어도 에러 대신 `None` |
| `"hasPassword": student_id is not None` | **(추가)** 학번(=비밀번호)을 등록했는지 |
| `"studentId": student_id` | **(추가)** 응답에 학번 포함 |

**🤔 왜 이렇게?**
- 로그인용 클라이언트는 **매번 새로 만드는** `auth_client()`. 관리자 클라이언트 `db`로 로그인하면 그 클라이언트가 사용자 권한으로 바뀌어 다른 사람 요청까지 망가져요(1주차 함정).
- 틀린 코드든 만료된 코드든 **같은 메시지**: 공격자에게 힌트를 주지 않기 위해.
- `hasPassword`를 응답에 넣으면 프론트가 추가 API 호출 없이 바로 "비밀번호 설정" 화면으로 보낼지 결정할 수 있어요.

**🏢 현업에서는** 이메일 OTP(One-Time Password)는 Slack, Notion, 토스 등이 쓰는 **비밀번호 없는(passwordless) 로그인**이에요. 우리처럼 "처음엔 OTP로 본인 확인, 이후엔 비밀번호"를 섞는 방식도 흔합니다.

**⑦ 학번·비밀번호 등록/변경 (새로 추가)**

```python
@router.post("/auth/password")
def set_password(body: PasswordSetRequest, user: dict = Depends(get_current_user)):
    student_id = check_student_id(body.studentId)
    password = check_password(body.password)

    taken = db.table("profiles").select("id").eq("student_id", student_id).neq("id", user["id"]).execute()
    if taken.data:
        raise ApiError(409, "STUDENT_ID_TAKEN", "이미 다른 계정에 등록된 학번이에요.")
    try:
        db.table("profiles").update({"student_id": student_id, "updated_at": now_iso()}).eq("id", user["id"]).execute()
    except PostgrestError as e:
        if e.code == "23505":  # unique 위반: 거의 동시에 같은 학번이 등록된 경우
            raise ApiError(409, "STUDENT_ID_TAKEN", "이미 다른 계정에 등록된 학번이에요.")
        raise

    try:
        db.auth.admin.update_user_by_id(user["id"], {"password": password})
    except AuthApiError:
        raise ApiError(400, "WEAK_PASSWORD", "사용할 수 없는 비밀번호예요. 다른 비밀번호로 바꿔 주세요.")
    return ok({"studentId": student_id, "hasPassword": True})
```

**📖 한 줄씩**

| 순서 | 코드 | 설명 |
|---|---|---|
| 0 | `Depends(get_current_user)` | **메일 인증으로 로그인한 사람만** 등록 가능 → 재학생 확인을 거친 사람만 |
| 1 | `check_student_id`, `check_password` | 형식 검사 (400) |
| 2 | `.eq("student_id", ...).neq("id", user["id"])` | 이 학번을 **나 말고 다른 사람이** 쓰고 있는지. `neq` = not equal. 내가 다시 등록하는 건 OK |
| 3 | `raise ApiError(409, ...)` | 이미 있으면 충돌 |
| 4 | `update({"student_id": ...})` | 내 프로필에 학번 저장 |
| 5 | `except PostgrestError ... "23505"` | 2번 검사와 4번 저장 **사이에** 누가 같은 학번을 먼저 등록한 경우, DB의 `unique`가 거절함 → 그것도 409로 |
| 6 | `raise` | 23505가 아닌 DB 에러는 숨기지 않고 그대로 (500으로 보여야 버그를 발견) |
| 7 | `db.auth.admin.update_user_by_id(... {"password": ...})` | Supabase 계정에 비밀번호 설정. 관리자 기능이라 `db`(secret 키)로 |
| 8 | `except AuthApiError` | Supabase 자체 비밀번호 규칙(대시보드 설정)에 걸린 경우 |

**🤔 왜 이렇게?**
- **검사를 2번(코드 + DB unique)** 하는 이유: 2번만 하면 동시에 두 요청이 들어올 때 둘 다 "없음"을 보고 통과할 수 있어요(**경쟁 상태, race condition**). 그래서 최종 방어는 DB가 하고, 코드 검사는 친절한 에러 메시지용입니다.
- 학번 저장을 비밀번호보다 **먼저** 하는 이유: 학번이 겹치면 비밀번호를 바꾸기 전에 멈춰야 하니까요.
- 등록과 변경을 **같은 API**로: 비밀번호 찾기도 "메일 인증 → 이 API"로 해결돼서 API가 하나 줄어요.
- 비밀번호 변경에 현재 비밀번호를 요구하지 않는 이유: 이 API를 부르려면 이미 로그인(토큰)이 필요하고, 비밀번호를 잊은 사람도 써야 하니까요.

**🏢 현업에서는**
- 비밀번호 변경 시 **"현재 비밀번호 다시 입력"**(재인증)이나 **"비밀번호가 변경되었습니다" 알림 메일**을 보내는 게 일반적이에요. 누가 내 폰을 잠깐 쓴 사이 비밀번호를 바꾸는 걸 막기 위해서죠.
- 비밀번호 변경 후 **다른 기기의 로그인을 모두 끊는** 기능도 흔해요 (`admin.sign_out`).
- 비밀번호는 절대 로그에 찍지 않아요. 요청 바디 전체를 로그로 남기는 코드가 있으면 비밀번호가 평문으로 남는 사고가 납니다.

> ⚠️ **학번 자체는 검증되지 않아요.** 메일 인증은 "이 사람이 수원대 메일을 쓴다"까지만 증명하고, 입력한 학번이 진짜 그 사람 것인지는 모릅니다. 졸업작품에서는 "먼저 등록한 사람이 임자 + 중복 불가"로 충분하지만, 학교 학사 시스템과 연동할 수 있다면 그쪽에서 확인하는 게 정석이에요. (학번 메일 `22016007@suwon.ac.kr`로 인증한 경우에만 그 학번을 허용하는 규칙을 추가하는 방법도 있어요.)

**⑧ 학번 로그인 (새로 추가)**

```python
@router.post("/auth/login")
def login(body: LoginRequest):
    fail = ApiError(401, "INVALID_CREDENTIALS", "학번 또는 비밀번호가 틀렸어요.")
    student_id = body.studentId.strip()
    if not STUDENT_ID_RE.fullmatch(student_id) or not body.password:
        raise fail

    profile = db.table("profiles").select("id, email").eq("student_id", student_id).maybe_single().execute()
    if profile is None or profile.data is None:
        raise fail
    try:
        res = auth_client().auth.sign_in_with_password({"email": profile.data["email"], "password": body.password})
    except AuthApiError as e:
        if e.status == 429:
            raise ApiError(429, "TOO_MANY_REQUESTS", "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.")
        raise fail
    if res.session is None:
        raise fail

    return ok({**token_response(res.session), "isNewUser": False, "hasPassword": True,
               "user": {"id": res.user.id, "email": profile.data["email"], "studentId": student_id}})
```

**📖 한 줄씩**

| 순서 | 코드 | 설명 |
|---|---|---|
| 0 | `fail = ApiError(401, ...)` | 실패 에러를 미리 하나 만들어두고 여러 곳에서 재사용 |
| 1 | 형식이 틀리면 바로 `fail` | `abc` 같은 학번은 DB까지 갈 필요 없음 |
| 2 | `select("id, email").eq("student_id", ...)` | 학번 → 이메일 찾기. 필요한 칸만 |
| 3 | 없으면 `fail` | 등록 안 된 학번 |
| 4 | `sign_in_with_password({"email", "password"})` | Supabase에 "이 이메일+비밀번호 맞아?" → 맞으면 토큰 |
| 5 | `e.status == 429` | 너무 많이 시도 → 429 |
| 6 | 그 밖의 에러 → `fail` | 비밀번호 틀림 |

**🤔 왜 이렇게?**
- **"학번이 없음"과 "비밀번호 틀림"에 같은 메시지**(`학번 또는 비밀번호가 틀렸어요`): 메시지가 다르면 공격자가 어떤 학번이 가입돼 있는지 하나씩 알아낼 수 있어요(**계정 열거, user enumeration**).
- 401을 쓰는 이유: "인증 실패"의 표준 코드. 프론트는 `code`가 `INVALID_CREDENTIALS`인지로 "토큰 만료(INVALID_TOKEN)"와 구분합니다.
- 로그인에 `auth_client()`(새 클라이언트): ⑥과 같은 이유.

**🏢 현업에서는**
- **로그인 시도 제한(brute-force 방어)**: 같은 아이디로 5~10번 틀리면 일정 시간 잠금, 또는 CAPTCHA 표시. Supabase는 IP 단위로 기본 제한이 있고(대시보드 **Authentication → Rate Limits**), 그 이상은 직접 "실패 횟수 테이블"을 만들어 구현해요.
- **응답 시간 차이**도 정보가 될 수 있어요. 없는 학번은 Supabase를 안 거쳐서 응답이 더 빠르거든요. 큰 서비스는 이것까지 맞추지만, 졸업작품에서는 메시지 통일로 충분합니다.
- 로그인 성공·실패 기록(시각, IP, 기기)을 남기는 **감사 로그(audit log)** 를 두고, 새 기기 로그인 시 알림을 보내기도 해요.

**⑨ 토큰 갱신 · 로그아웃 (1주차 그대로)**

```python
@router.post("/auth/refresh")
def refresh(body: RefreshRequest):
    try:
        res = auth_client().auth.refresh_session(body.refreshToken)
    except AuthApiError:
        raise ApiError(401, "INVALID_REFRESH_TOKEN", "다시 로그인해 주세요.")
    return ok(token_response(res.session))


@router.post("/auth/logout")
def logout(cred=Depends(bearer)):
    if cred is not None:
        try:
            db.auth.admin.sign_out(cred.credentials)  # 이 사용자의 refresh 토큰 무효화
        except AuthApiError:
            pass
    return ok({"loggedOut": True})
```

**📖 한 줄씩**
- `refresh`: 만료된 accessToken 대신 refreshToken으로 새 토큰 받기. 프론트는 401 `INVALID_TOKEN`을 받으면 이걸 부르고 원래 요청을 재시도.
- `logout`: `admin.sign_out`으로 **refreshToken을 무효화** → 이 토큰으로는 더 이상 재발급 불가. 토큰이 없거나 이미 무효여도 에러 없이 "로그아웃됨".

**🤔 왜 이렇게?** 로그아웃은 실패해도 사용자 입장에선 "로그아웃된 것"이어야 해요. 그래서 에러를 무시(`pass`)하는 몇 안 되는 곳입니다. 다만 accessToken은 만료(1시간) 전까지 살아 있어서, 프론트도 저장된 토큰을 지워야 해요.

**🏢 현업에서는** "로그아웃했는데 accessToken이 1시간 살아있다"는 JWT 방식의 알려진 단점이에요. 보안이 중요한 서비스는 accessToken을 5~15분으로 짧게 하거나, 무효화 목록(블랙리스트)을 Redis에 둡니다.

### 4-2-3. `app/routers/users.py`에 한 줄 추가

`Profile` 모델에 `student_id`를 추가해서 `GET /users/me` 응답에 `studentId`가 나오게 합니다. (아래 STEP 5에서 파일 전체를 칠 때 이미 들어 있어요.)

```python
class Profile(CamelModel):
    id: str
    email: str
    student_id: Optional[str] = None   # ← 추가
    ...
```

### 4-2-4. Supabase 설정 확인

**Authentication → Sign In / Providers → Email**에서:
- **Enable Email provider**: 켬 (이메일+비밀번호 로그인도 이 설정에 포함)
- **Minimum password length**: 기본 6 → **8**로 맞추면 우리 서버 규칙과 같아짐 (선택)
- **Secure password change**: 켜져 있어도 괜찮아요. 우리는 관리자 기능(`admin.update_user_by_id`)으로 바꾸기 때문에 영향 없음

### 4-2-5. 테스트 (`/docs`)

| 순서 | API | 넣을 값 | 기대 결과 |
|---|---|---|---|
| 0 | — | **03 SQL 실행했는지** 확인 | |
| 1 | `POST /auth/email/verify` | 메일 인증 | `hasPassword: false` |
| 2 | **Authorize**에 accessToken | | |
| 3 | `POST /auth/password` | `{"studentId": "2201", "password": "abcd1234"}` | **400** `INVALID_STUDENT_ID` |
| 4 | `POST /auth/password` | `{"studentId": "본인학번", "password": "12345678"}` | **400** `WEAK_PASSWORD` (영문 없음) |
| 5 | `POST /auth/password` | `{"studentId": "본인학번", "password": "abcd1234"}` | 200 `hasPassword: true` |
| 6 | `GET /users/me` | | `studentId`가 보임 |
| 7 | **Authorize → Logout**(토큰 지우기) | | |
| 8 | `POST /auth/login` | `{"studentId": "본인학번", "password": "틀린비번1"}` | **401** `INVALID_CREDENTIALS` |
| 9 | `POST /auth/login` | `{"studentId": "99999999", "password": "abcd1234"}` | **401** 같은 메시지 |
| 10 | `POST /auth/login` | `{"studentId": "본인학번", "password": "abcd1234"}` | 200, 새 accessToken |
| 11 | 새 토큰으로 Authorize → `GET /users/me` | | 200 |

Supabase **Authentication → Users**에서 내 계정의 **Providers**에 email이, **Last sign in**이 방금 시각으로 바뀌었는지도 확인해 보세요.

### 프론트에 알려줄 것

```
앱 시작
 ├─ 저장된 토큰 있음 → 홈
 └─ 없음 → 로그인 화면
       ├─ [학번·비밀번호 로그인]  POST /auth/login
       └─ [처음이에요 / 비밀번호를 잊었어요] → 메일 인증
              verify 응답의 hasPassword
                ├─ false → 비밀번호 설정 화면 → POST /auth/password
                └─ true  → 홈 (비밀번호 찾기로 온 경우엔 설정 화면)
```

---

## STEP 5. 내 정보 · 동의 · 약관 · 탈퇴 (2일)

### 기능 설명

| 기능 | 화면에서 | 동작 |
|---|---|---|
| 내 정보 조회/수정 | 마이페이지, 온보딩 | 이름·학과·학년 저장. 로그인 때 만든 빈 `profiles` 줄을 채움 |
| 목표 직무 설정 | 온보딩, 홈 상단 | 희망 직무(필수) + 목표 기업. AI 분석·경험 추천의 기준 |
| 동의 관리 | 설정 > 개인정보 | 선택 동의 3개 on/off (AI 품질 개선, 채용 알림, 커리어 공개) |
| 약관 보기 | 가입/설정 | 최신 버전 약관 본문 |
| 회원 탈퇴 | 설정 > 탈퇴 | 업로드 파일 + 계정 + 모든 데이터 삭제 |

### 데이터 구조

```
auth.users (Supabase가 관리하는 로그인 계정: 이메일, 비밀번호 해시)
   │ id
   ├── profiles   (1:1)  id = auth.users.id       학번, 이름, 학과, 학년, 희망 직무, 목표 기업
   ├── consents   (1:1)  user_id = auth.users.id  필수 동의 시각 2개 + 선택 동의 3개
   ├── files      (1:N)
   ├── experiences(1:N)
   └── ...        모두 on delete cascade → auth.users 한 줄 지우면 전부 지워짐

policies (사용자와 무관)  (type, version) 이 기본키 → 버전별로 쌓임
```

**왜 로그인 계정(`auth.users`)과 프로필(`profiles`)을 나누나?**
`auth.users`는 Supabase가 관리하는 테이블이라 우리가 칸을 추가할 수 없어요. 같은 id로 우리 테이블을 하나 더 두는 게 Supabase·Firebase·Auth0 등 외부 인증을 쓰는 서비스의 표준 패턴입니다. 현업에서도 "인증(누구인가)"과 "회원 정보(어떤 사람인가)"를 분리해서, 인증 방식을 바꿔도(예: 카카오 로그인 추가) 회원 정보는 그대로 두는 설계를 많이 해요.

### 5-1. `app/services/storage.py` — 파일 저장소 도우미

Supabase Storage는 **AWS S3 같은 오브젝트 스토리지**예요. 폴더처럼 보이지만 실제로는 `경로 → 파일 내용`을 저장하는 거대한 사전입니다. 탈퇴(파일 지우기)와 STEP 6(업로드)에서 같이 쓰기 때문에 먼저 만듭니다.

**① 버킷 가리키기**

```python
from app.common import ApiError
from app.config import STORAGE_BUCKET
from app.db import db


def bucket():
    return db.storage.from_(STORAGE_BUCKET)
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `from app.db import db` | 관리자(secret) 키 클라이언트. 비공개 버킷에도 접근 가능 |
| `bucket()` | `files` 버킷 객체. 이름은 `.env`(`STORAGE_BUCKET`)에서 |

**🤔 왜 이렇게?** `db.storage.from_("files")`를 여기저기 쓰면 버킷 이름을 바꿀 때 전부 찾아 고쳐야 해요. 한 함수로 감싸두면 한 곳만 고치면 됩니다.

**🏢 현업에서는** 이렇게 외부 서비스(S3, 결제, 메일)를 감싸는 얇은 함수/클래스를 **어댑터(adapter)** 또는 **래퍼(wrapper)** 라고 해요. Supabase에서 AWS S3로 옮기더라도 이 파일만 바꾸면 나머지 코드는 그대로입니다.

**② 올리기 · 임시 링크**

```python
def upload_bytes(path: str, data: bytes, content_type: str):
    bucket().upload(path, data, {"content-type": content_type, "upsert": "true"})


def signed_url(path: str, expires_in: int = 3600) -> str:
    return bucket().create_signed_url(path, expires_in)["signedURL"]
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `upload(path, data, {...})` | `path` 위치에 바이트 저장 |
| `"content-type"` | 파일 종류(PDF, PNG…)를 같이 저장 → 다운로드 시 브라우저가 알맞게 열어줌 |
| `"upsert": "true"` | 같은 경로가 있으면 덮어씀 (포폴 다시 내보내기할 때 필요) |
| `create_signed_url(path, 3600)` | **3600초(1시간)만 유효한 다운로드 링크** |
| `["signedURL"]` | 결과 dict에서 링크만 꺼냄 |

**🤔 왜 이렇게?** 버킷을 **비공개**로 두고 필요할 때만 짧은 링크를 주면, 링크가 카톡 등으로 퍼져도 1시간 뒤엔 못 열어요. 공개 버킷이면 주소만 알면 누구나 영원히 볼 수 있습니다(이력서가 담긴 파일인데!).

**🏢 현업에서는** AWS에서는 **Presigned URL**이라고 불러요. 개인 파일(서류, 영수증, 의료 기록)은 거의 다 이 방식이고, 프로필 사진처럼 공개돼도 되는 파일만 공개 버킷 + CDN을 씁니다.

**③ A가 쓰는 다운로드**

```python
def download_file(file_id: str, user_id: str) -> tuple[bytes, str]:
    res = db.table("files").select("*").eq("id", file_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "FILE_NOT_FOUND", "파일을 찾을 수 없어요.")
    return bucket().download(res.data["storage_path"]), res.data["name"]
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `.eq("id", file_id).eq("user_id", user_id)` | **id와 주인을 같이** 조건으로 → 남의 파일 id면 결과 없음 |
| `.maybe_single()` | 0개면 `None`, 1개면 그 줄 (`single()`은 0개일 때 에러) |
| `res is None or res.data is None` | supabase-py 버전에 따라 `res` 자체가 `None`일 수 있어서 둘 다 확인 |
| `tuple[bytes, str]` | (파일 내용, 원래 이름) 두 개를 돌려줌 |

**🤔 왜 이렇게?** A(AI 담당)는 Storage 경로나 버킷을 몰라도 `download_file(file_id, user_id)`만 부르면 돼요. 그리고 이 함수 안에서 **주인 확인까지** 해버리니까 A가 실수로 남의 파일을 분석할 일이 없어요.

**🏢 현업에서는** 팀 간 경계에 이런 **인터페이스 함수**를 두고 "이 함수 이름과 입출력은 바꾸지 않는다"고 약속해요. 큰 회사에선 이게 함수가 아니라 내부 API(마이크로서비스)가 됩니다.

**④ 탈퇴용 전체 삭제**

```python
def remove_all_user_files(user_id: str):
    res = db.table("files").select("storage_path").eq("user_id", user_id).execute()
    paths = [row["storage_path"] for row in res.data]
    res = db.table("portfolios").select("export_path").eq("user_id", user_id).execute()
    paths += [row["export_path"] for row in res.data if row["export_path"]]
    if paths:
        bucket().remove(paths)
```

**📖 한 줄씩**
- 그 사람의 업로드 파일 경로 + 내보낸 포폴 파일 경로를 모아서 `remove`로 한 번에 삭제
- `if row["export_path"]`: 포폴을 아직 안 내보냈으면 경로가 비어 있어서 건너뜀

**🤔 왜 이렇게?** DB의 `files` 줄은 "파일이 어디 있는지" 메모일 뿐이에요. 탈퇴 때 DB만 cascade로 지우면 Storage에 **주인 없는 파일(고아 파일)** 이 남습니다. 이력서·포트폴리오는 개인정보라 반드시 같이 지워야 해요.

**🏢 현업에서는** 개인정보보호법상 탈퇴 시 지체 없이 파기해야 해요. 큰 서비스는 삭제 요청을 **큐(queue)** 에 넣고 백그라운드 작업이 DB·스토리지·백업·검색엔진·분석 도구까지 순서대로 지우고, 다 지웠는지 기록을 남깁니다.

### 5-2. `app/routers/users.py` — 내 정보 · 동의 · 약관 · 탈퇴

**① import와 라우터**

```python
"""내 정보 · 목표 직무 · 동의 · 약관 · 탈퇴 (US-01~05)"""
from typing import Optional

from fastapi import APIRouter, Depends

from app.common import ApiError, CamelModel, camel_keys, now_iso, ok
from app.db import db
from app.deps import get_current_user
from app.services.storage import remove_all_user_files

router = APIRouter(tags=["users"])
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `Optional[str]` | "문자열 또는 None" (값이 없어도 됨) |
| `APIRouter(tags=["users"])` | 이 파일의 API 묶음. `tags`는 Swagger 그룹 이름 |
| `Depends` | "이 함수 실행 전에 저 함수를 먼저 실행해서 결과를 넣어줘" |
| `camel_keys` | DB dict를 통째로 camelCase로 (약관 응답에 사용) |

**🏢 현업에서는** `Depends`는 **의존성 주입(DI, Dependency Injection)** 이에요. Spring의 `@Autowired`, NestJS의 Guard와 같은 개념. 테스트할 때 진짜 로그인 대신 가짜 사용자를 넣을 수 있어서 테스트가 쉬워져요.

**② 데이터 모양 (DTO)**

```python
class Profile(CamelModel):
    id: str
    email: str
    student_id: Optional[str] = None
    name: Optional[str] = None
    department: Optional[str] = None
    grade: Optional[int] = None
    desired_job: Optional[str] = None
    target_company: Optional[str] = None


class TargetUpdate(CamelModel):
    desired_job: str
    target_company: Optional[str] = None


class ProfileUpdate(CamelModel):
    name: Optional[str] = None
    department: Optional[str] = None
    grade: Optional[int] = None


class ConsentUpdate(CamelModel):
    ai_quality_improvement: Optional[bool] = None
    job_alert: Optional[bool] = None
    public_career_profile: Optional[bool] = None


class Consents(CamelModel):
    terms_agreed_at: str
    privacy_agreed_at: str
    ai_quality_improvement: bool
    job_alert: bool
    public_career_profile: bool
    updated_at: str
```

**📖 한 줄씩**

| 모델 | 용도 |
|---|---|
| `Profile` | **응답용**. DB 줄 중 프론트에 보여줄 칸만. `student_id`가 여기 추가됨 |
| `TargetUpdate` | 목표 직무 수정. `desired_job`은 기본값이 없으니 **필수** → 안 보내면 422 |
| `ProfileUpdate` | 내 정보 수정. 전부 선택 → 바꾸고 싶은 칸만 |
| `ConsentUpdate` | 선택 동의 3개만. **필수 동의(약관·개인정보)는 일부러 뺌** → 끄려면 탈퇴 |
| `Consents` | 동의 응답용 |

**🤔 왜 이렇게?**
- `CamelModel`을 상속하면 파이썬에선 `desired_job`, JSON에선 `desiredJob`으로 자동 변환.
- **학번은 `ProfileUpdate`에 없어요.** 학번은 로그인 아이디라 중복 검사가 필요해서, 반드시 `/auth/password`로만 바꾸게 했습니다. 아무 API에서나 바꿀 수 있으면 중복 검사를 빼먹는 구멍이 생겨요.
- 응답 모델을 따로 두는 이유: DB 줄을 그대로 내보내면 나중에 내부용 칸(관리자 메모 등)을 추가했을 때 실수로 노출돼요.

**🏢 현업에서는** 요청 모델에 수정 가능한 칸만 두는 걸 **화이트리스트** 방식이라 해요. 반대로 DB 줄 전체를 받아서 업데이트하면, 사용자가 `{"role": "admin"}`을 끼워 넣어 관리자가 되는 **Mass Assignment** 취약점이 생깁니다(실제로 GitHub에서 2012년에 터졌던 사고).

**③ 프로필 조회 함수**

```python
def get_profile(user_id: str) -> dict:
    res = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "PROFILE_NOT_FOUND", "프로필이 없어요. 다시 로그인해 주세요.")
    return Profile.model_validate(res.data).model_dump(by_alias=True)
```

**📖 한 줄씩**
- `model_validate(res.data)` → DB dict를 `Profile`로 검사하면서 필요한 칸만 남김
- `model_dump(by_alias=True)` → 다시 dict로, 키는 camelCase로

**🤔 왜 이렇게?** 홈 API(4주차)에서도 프로필이 필요해서 API 함수와 분리했어요. 여러 곳에서 쓰는 로직을 함수로 빼는 게 **DRY**(Don't Repeat Yourself) 원칙입니다.

**④ 내 정보 / 목표 직무**

```python
@router.get("/users/me")
def me(user: dict = Depends(get_current_user)):
    return ok(get_profile(user["id"]))


@router.patch("/users/me/target")
def update_target(body: TargetUpdate, user: dict = Depends(get_current_user)):
    db.table("profiles").update({**body.model_dump(), "updated_at": now_iso()}).eq("id", user["id"]).execute()
    return ok(get_profile(user["id"]))


@router.patch("/users/me")
def update_me(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    changes = body.model_dump(exclude_none=True)
    if changes:
        db.table("profiles").update({**changes, "updated_at": now_iso()}).eq("id", user["id"]).execute()
    return ok(get_profile(user["id"]))
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `user: dict = Depends(get_current_user)` | 토큰 검사를 통과해야만 실행. `user["id"]`가 로그인한 사람 |
| `body: TargetUpdate` | 요청 바디를 자동 검사해서 넣어줌 |
| `.eq("id", user["id"])` | **항상 본인 줄만** 수정. 이 조건을 빼먹으면 전체 사용자 정보가 바뀜! |
| `model_dump(exclude_none=True)` | 안 보낸(None) 칸은 빼고 보낸 칸만 수정 (PATCH의 의미) |
| `if changes:` | 아무것도 안 보냈으면 DB 호출 생략 |
| `"updated_at": now_iso()` | 수정 시각 기록. 문자열 `"now()"`를 넣으면 SQL 함수가 아니라 글자로 들어가서 에러 |
| 수정 후 `get_profile` 다시 호출 | 수정된 최신 값을 응답 → 프론트가 화면을 바로 갱신 |

**🤔 왜 이렇게?** 수정 API가 "성공"만 돌려주면 프론트가 다시 조회해야 해요. 최신 값을 바로 돌려주면 요청이 1번 줄어듭니다.

**🏢 현업에서는** `updated_at`은 거의 모든 테이블에 둬요. 버그 추적("언제 바뀌었지?"), 데이터 동기화("마지막 동기화 이후 바뀐 것만"), 캐시 무효화에 쓰입니다. 보통 DB 트리거로 자동 갱신하기도 해요.

**⑤ 동의**

```python
@router.get("/users/me/consents")
def get_consents(user: dict = Depends(get_current_user)):
    res = db.table("consents").select("*").eq("user_id", user["id"]).single().execute()
    return ok(Consents.model_validate(res.data).model_dump(by_alias=True))


@router.patch("/users/me/consents")
def update_consents(body: ConsentUpdate, user: dict = Depends(get_current_user)):
    changes = body.model_dump(exclude_none=True)
    res = db.table("consents").update({**changes, "updated_at": now_iso()}).eq("user_id", user["id"]).execute()
    return ok(Consents.model_validate(res.data[0]).model_dump(by_alias=True))
```

**📖 한 줄씩**
- `.single()`: 동의 줄은 로그인 때 반드시 만들어지므로 "정확히 1개"를 기대
- `res.data[0]`: `update()`는 바뀐 줄 **목록**을 돌려줘서 첫 번째 사용

**🏢 현업에서는** 개인정보보호법상 **필수 동의와 선택 동의를 분리**해야 하고, 선택 동의를 안 해도 서비스를 쓸 수 있어야 해요. 마케팅 수신 동의는 **2년마다 재확인** 의무도 있습니다. 그래서 동의 테이블에 "언제 동의/철회했는지"를 남기는 거예요.

**⑥ 탈퇴**

```python
@router.delete("/users/me")
def withdraw(user: dict = Depends(get_current_user)):
    remove_all_user_files(user["id"])        # 저장소 파일 먼저 삭제
    db.auth.admin.delete_user(user["id"])    # 계정 삭제 → 모든 테이블 데이터 자동 삭제(cascade)
    return ok({"deleted": True})
```

**📖 한 줄씩**
1. **Storage 파일 먼저** 삭제 (DB가 먼저 지워지면 파일 경로를 알 방법이 없음)
2. `db.auth.admin.delete_user` → Supabase 계정 삭제 → `on delete cascade`로 profiles(학번 포함), consents, files, experiences… 전부 자동 삭제

**🤔 왜 이렇게?** 순서를 바꾸면 고아 파일이 생겨요. 그리고 `admin` 기능은 클라이언트 상태를 바꾸지 않아서 `db`로 불러도 안전합니다.

**🏢 현업에서는** 바로 지우는 **hard delete** 대신 `deleted_at`만 기록하는 **soft delete** 후 30일 유예(실수 복구) → 배치 작업으로 완전 삭제하는 경우가 많아요. 결제 기록처럼 법적으로 보관해야 하는 정보(전자상거래법 5년)는 따로 분리 보관합니다.

**⑦ 약관**

```python
@router.get("/policies/{policy_type}")
def get_policy(policy_type: str):
    res = (db.table("policies").select("*").eq("type", policy_type)
           .order("effective_date", desc=True).limit(1).execute())
    if not res.data:
        raise ApiError(404, "POLICY_NOT_FOUND", "약관을 찾을 수 없어요.")
    return ok(camel_keys(res.data[0]))
```

**📖 한 줄씩**
- `user`가 없음 → **로그인 안 해도** 볼 수 있음 (가입 전에 보여줘야 하니까)
- `order("effective_date", desc=True).limit(1)` → 시행일이 가장 최근인 버전 1개
- `camel_keys` → `effective_date`를 `effectiveDate`로
- 약관 종류: `privacy`, `terms`, `ai-data`

**🏢 현업에서는** 약관은 **버전 관리**가 핵심이에요. 개정 시 시행 7일 전(불리한 변경은 30일 전) 공지하고, 사용자가 **어느 버전에 동의했는지** 기록합니다. 그래서 `(type, version)`을 기본키로 버전을 쌓는 구조예요.

### 5-3. main.py 연결

`main.py`에 이미 들어 있어요. 직접 쳐서 만드는 중이라면 import와 목록에 추가:

```python
from app.routers import auth, users
...
for r in [auth, users]:
```

### 5-4. 테스트 (Authorize 된 상태)

| 순서 | API | 넣을 값 | 기대 결과 |
|---|---|---|---|
| 1 | `GET /users/me` | — | 내 프로필 (`studentId` 포함) |
| 2 | `PATCH /users/me` | `{"name": "김수원", "department": "컴퓨터학부", "grade": 3}` | 바뀐 프로필 |
| 3 | `PATCH /users/me` | `{"grade": "삼학년"}` | **422** `VALIDATION_ERROR` |
| 4 | `PATCH /users/me/target` | `{"desiredJob": "서비스 기획자", "targetCompany": "네이버"}` | `desiredJob` 채워짐 |
| 5 | `PATCH /users/me/target` | `{}` | **422** (희망 직무 필수) |
| 6 | `GET /users/me/consents` | — | 선택 동의 전부 `false` |
| 7 | `PATCH /users/me/consents` | `{"jobAlert": true}` | `jobAlert`만 `true` |
| 8 | `GET /policies/privacy` | — | 개인정보 처리방침 v0.1, `effectiveDate` |
| 9 | `GET /policies/abc` | — | **404** `POLICY_NOT_FOUND` |

Supabase **Table Editor → profiles / consents**에서 실제로 바뀌었는지도 확인.
**탈퇴(`DELETE /users/me`)는 마지막에 테스트용 계정으로** 하세요. 지금 계정이 사라집니다.

---

## STEP 6. 파일 업로드 — FI-01·02·04 (2일)

### 기능 설명

| 기능 | 화면 | 동작 |
|---|---|---|
| 업로드 | 홈 > 파일 올리기 | PPT·PDF·DOCX·HWP·이미지를 **한 번에 최대 5개, 개당 20MB** |
| 최근 파일 | 홈 하단 | 최근 올린 순서로 목록 |
| 파일 상세 | 파일 클릭 | 정보 + 1시간짜리 다운로드 링크 |
| 삭제 | 파일 메뉴 | Storage 파일 + DB 줄 삭제 |

업로드된 파일은 A가 `download_file()`로 받아서 AI 분석(이력서/스펙업/포트폴리오 모드)을 합니다.

### 구조: 파일은 두 군데에 나눠 저장

```
POST /files  (multipart/form-data: 파일 여러 개)
   │
   ├─▶ ① 전부 검사 (개수, 확장자, 크기)   하나라도 실패 → 400, 아무것도 저장 안 함
   │
   ├─▶ ② Storage:  files 버킷 / {user_id}/{랜덤uuid}.pdf      ← 실제 파일 (무거움)
   │
   └─▶ ③ DB:       files 테이블 한 줄                          ← 파일 정보 (가벼움)
                   id, user_id, name="자기소개서.pdf", type="PDF", size, storage_path
```

**왜 나누나?** DB는 검색·정렬이 빠르지만 큰 파일 저장엔 비싸고 느려요. 오브젝트 스토리지는 큰 파일을 싸게 저장하지만 검색이 안 돼요. **"파일은 스토리지, 정보(메타데이터)는 DB"** 가 업계 표준입니다 (유튜브 영상, 인스타 사진, 노션 첨부 전부 이 구조).

**왜 경로에 원래 파일 이름을 안 쓰나?**
- 한글·공백·특수문자 파일명은 URL에서 깨지기 쉬움
- 같은 이름(`이력서.pdf`)을 두 번 올리면 덮어써짐
- 랜덤 uuid는 추측 불가 → 보안에도 유리
- 맨 앞을 `user_id/`로 → 사람별 폴더 → 탈퇴 정리, 용량 계산이 쉬움

### 6-1. `app/routers/files.py`

**① 설정값**

```python
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile

from app.common import ApiError, ok
from app.db import db
from app.deps import get_current_user
from app.services.storage import bucket, signed_url, upload_bytes

router = APIRouter(tags=["files"])

MAX_FILES = 5
MAX_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED = {".ppt": "PPT", ".pptx": "PPTX", ".pdf": "PDF", ".doc": "DOC", ".docx": "DOCX",
           ".hwp": "HWP", ".hwpx": "HWPX", ".png": "IMAGE", ".jpg": "IMAGE", ".jpeg": "IMAGE"}
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `uuid` | 겹치지 않는 랜덤 id (`3f2b...`) |
| `Path(...).suffix` | 파일 이름에서 확장자만 (`.pdf`) |
| `UploadFile` | FastAPI 업로드 파일 객체. `python-multipart` 패키지가 있어야 동작 |
| `MAX_SIZE = 20 * 1024 * 1024` | 20MB를 바이트로 (1KB=1024B, 1MB=1024KB) |
| `ALLOWED` | 허용 확장자 → DB에 저장할 종류 이름. jpg/png는 `IMAGE`로 묶음 |

**🤔 왜 이렇게?** 설정값을 맨 위 **대문자 상수**로 두는 게 파이썬 관례. "10개까지 올리게 해주세요" 요청이 오면 숫자 하나만 바꾸면 돼요. 허용 목록(**화이트리스트**)을 쓰는 이유: "`.exe`, `.js`는 금지" 같은 금지 목록은 빠뜨린 확장자가 생기기 쉬워요.

**🏢 현업에서는** 이런 값은 환경변수나 설정 서버로 빼서, 코드 배포 없이 바꾸기도 해요. 요금제별로 업로드 한도를 다르게 주는 서비스(무료 5개/유료 50개)도 흔합니다.

**② 응답 모양**

```python
def to_api(row: dict) -> dict:
    return {"fileId": row["id"], "name": row["name"], "type": row["type"], "size": row["size"],
            "uploadedAt": row["uploaded_at"], "lastMode": row["last_mode"]}
```

**📖 한 줄씩** DB 컬럼명(`uploaded_at`) → API 이름(`uploadedAt`)으로 바꾸고, 내부 정보인 `storage_path`, `user_id`는 **빼고** 내보냅니다.

**🤔 왜 이렇게?** 저장 경로가 노출되면 구조를 추측할 단서가 되고, 나중에 저장소를 바꿀 때 프론트까지 영향이 가요. 프론트는 `fileId`만 알면 충분합니다.

**③ 업로드**

```python
@router.post("/files")
def upload(files: list[UploadFile], user: dict = Depends(get_current_user)):
    if len(files) > MAX_FILES:
        raise ApiError(400, "TOO_MANY_FILES", f"파일은 한 번에 {MAX_FILES}개까지 올릴 수 있어요.")

    checked = []
    for f in files:  # 먼저 전부 검사하고 나서 저장 (중간에 실패하면 아무것도 저장 안 됨)
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED:
            raise ApiError(400, "UNSUPPORTED_TYPE", f"지원하지 않는 형식이에요: {f.filename}")
        data = f.file.read()
        if len(data) > MAX_SIZE:
            raise ApiError(400, "FILE_TOO_LARGE", f"20MB를 넘는 파일이에요: {f.filename}")
        checked.append((f, ext, data))

    saved = []
    for f, ext, data in checked:
        file_id = str(uuid.uuid4())
        path = f"{user['id']}/{file_id}{ext}"
        upload_bytes(path, data, f.content_type or "application/octet-stream")
        row = db.table("files").insert({"id": file_id, "user_id": user["id"], "name": f.filename,
                                        "type": ALLOWED[ext], "size": len(data),
                                        "storage_path": path}).execute().data[0]
        saved.append(to_api(row))
    return ok({"files": saved})
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `files: list[UploadFile]` | 파일 **여러 개**를 `files`라는 이름으로 받음 |
| 첫 번째 `for` | **검사만** 하고 `checked`에 모아둠 |
| `.lower()` | `.PDF`, `.Pdf`도 허용 |
| `f.file.read()` | 파일 내용을 메모리로 읽음 (20MB 제한이 있어서 괜찮음) |
| 두 번째 `for` | 실제 저장: uuid → Storage 업로드 → DB 한 줄 |
| `"id": file_id` | Storage 경로의 uuid와 DB id를 **같게** → 찾기 쉬움 |
| `f.content_type or "application/octet-stream"` | 브라우저가 알려준 파일 종류. 없으면 "그냥 바이너리" |

**🤔 왜 이렇게?**
- **검사 → 저장 2단계**: 3번째 파일이 틀렸는데 1·2번째가 이미 저장돼 있으면 사용자는 "실패"라는 메시지만 보고 다시 올려서 중복이 생겨요. **전부 성공 또는 전부 실패**(원자성, atomicity)에 가깝게 만든 것.
- Storage 먼저, DB 나중: DB에 줄이 있는데 파일이 없으면 다운로드 시 에러가 나요. 반대(파일은 있는데 DB 줄이 없음)는 사용자에게 안 보일 뿐이라 덜 위험합니다.

**🏢 현업에서는**
- 큰 파일은 서버를 거치지 않고 **프론트가 S3에 직접** 올려요(presigned upload URL). 서버는 링크만 발급 → 서버 메모리·대역폭 절약.
- 확장자는 이름만 바꾸면 속일 수 있어서, 파일 앞부분 바이트(**매직 넘버**: PDF는 `%PDF`)로 진짜 형식을 확인하고, **바이러스 검사**(ClamAV)를 거칩니다.
- 업로드 도중 실패로 생긴 고아 파일을 주기적으로 청소하는 배치 작업을 둬요.

**④ 목록 · 상세 · 삭제**

```python
@router.get("/files")
def recent_files(limit: int = 20, user: dict = Depends(get_current_user)):
    res = (db.table("files").select("*").eq("user_id", user["id"])
           .order("uploaded_at", desc=True).limit(min(limit, 50)).execute())
    return ok({"files": [to_api(r) for r in res.data]})


def get_own_file(file_id: str, user_id: str) -> dict:
    res = db.table("files").select("*").eq("id", file_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "FILE_NOT_FOUND", "파일을 찾을 수 없어요.")
    return res.data


@router.get("/files/{file_id}")
def file_detail(file_id: str, user: dict = Depends(get_current_user)):
    row = get_own_file(file_id, user["id"])
    return ok({**to_api(row), "downloadUrl": signed_url(row["storage_path"])})


@router.delete("/files/{file_id}")
def delete_file(file_id: str, user: dict = Depends(get_current_user)):
    row = get_own_file(file_id, user["id"])
    bucket().remove([row["storage_path"]])
    db.table("files").delete().eq("id", file_id).execute()
    return ok({"deleted": True})
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `limit: int = 20` | 쿼리 파라미터 `GET /files?limit=3` (홈은 3개만) |
| `min(limit, 50)` | 누가 `limit=999999`를 보내도 50개까지만 → 서버 보호 |
| `get_own_file` | "id로 찾되 **내 것만**" — 상세와 삭제가 같이 씀 |
| `{**to_api(row), "downloadUrl": ...}` | `**`는 dict 펼치기. 기본 정보 + 다운로드 링크 |
| 삭제 순서 | Storage 파일 → DB 줄 |

**🤔 왜 이렇게?** 목록에는 `downloadUrl`을 안 넣고 상세에서만 만들어요. 링크 생성은 Storage에 요청을 보내는 거라, 목록 20개마다 만들면 느려지거든요. 필요할 때만 만드는 **지연 생성(lazy)** 입니다.

**🏢 현업에서는** "남의 파일 id로 조회"는 **IDOR** 공격의 대표 예시예요(아래 STEP 7 참고). 어떤 서비스든 코드 리뷰에서 "주인 확인했어?"를 가장 먼저 봅니다.

### 6-2. main.py 연결

```python
from app.routers import auth, users, files
...
for r in [auth, users, files]:
```

### 6-3. 테스트

1. `POST /files` → Try it out → **Add string item**으로 파일 칸 2개 → PDF와 이미지 선택 → Execute
   → `files` 배열에 2개. Supabase **Storage → files → (내 user id 폴더)** 에 생겼는지 확인
2. 같은 API에 `.txt` 파일 → **400** `UNSUPPORTED_TYPE`, Storage에 아무것도 안 생김
3. `GET /files?limit=3` → 최근 순
4. `GET /files/{fileId}` → `downloadUrl`을 브라우저 주소창에 붙여넣으면 다운로드
5. `DELETE /files/{fileId}` → 다시 상세 조회 → **404** `FILE_NOT_FOUND`
6. 아무 uuid(`00000000-0000-0000-0000-000000000000`)로 상세 조회 → **404**

---

## STEP 7. 경험 DB — EX-01·02·04 (3일)

### 기능 설명

STACK의 핵심 데이터예요. 사용자의 모든 활동(프로젝트, 인턴, 공모전, 동아리…)이 **경험 카드** 한 장씩으로 쌓이는 **마스터 경험 DB**입니다.

```
[파일 업로드] → A의 AI 분석 → save_experiences() ─┐
[직접 입력]  → POST /experiences ──────────────────┼─▶ experiences 테이블
                                                    │
         나의 경험 보관함 화면 ◀── GET /experiences ─┤
         자소서·포폴 만들 때 A ◀── list_experiences()┘  (공고에 맞는 경험 추천)
```

| 기능 | 화면 | API |
|---|---|---|
| 경험 목록 (카테고리 필터, 페이지) | 나의 경험 보관함 | `GET /experiences?category=PROJECT&page=0&size=20` |
| 카테고리별 개수 | 보관함 상단 탭 | `GET /experiences/categories` |
| 상세 | 카드 클릭 | `GET /experiences/{id}` |
| 직접 추가 / 수정 / 삭제 | 카드 편집 | `POST`, `PATCH`, `DELETE` |

### 데이터 구조 (경험 카드 한 장)

```json
{
  "id": "uuid",
  "title": "캠퍼스 중고거래 앱 기획",
  "category": "PROJECT",
  "tags": ["기획", "UX리서치"],
  "organization": "수원대 창업동아리",
  "period": {"start": "2025-03", "end": "2025-06"},
  "role": "PM",
  "achievements": ["설문 120명 진행", "MAU 1,200명 달성"],
  "skills": ["Figma", "SQL"],
  "portfolio": {"problem": "...", "action": "...", "result": "..."},
  "sourceFileId": "어느 파일에서 AI가 뽑았는지 (직접 입력이면 null)",
  "jobFitScore": 82
}
```

DB에서는 `period`가 `period_start`, `period_end` 두 칸으로, `tags`는 `text[]`(문자열 배열), `achievements`·`skills`·`portfolio`는 `jsonb`로 저장돼요.

**`jsonb`가 뭐고 왜 쓰나?** Postgres에서 JSON을 그대로 저장하는 칸이에요. 성과 목록처럼 개수가 정해지지 않고 AI 결과 모양이 바뀔 수 있는 데이터는 칸을 미리 다 정하기(정규화) 어렵죠. 현업에서는 **"검색·정렬에 쓰는 값은 일반 칸, 화면에 보여주기만 하는 덩어리는 jsonb"** 로 섞어 씁니다.

### 7-1. `app/services/experiences.py` — 경험 저장소 (A와 같이 씀)

라우터가 아니라 **서비스**에 두는 이유: B의 API(직접 입력)와 A의 AI 분석이 **같은 저장 함수**를 써야 데이터 모양이 어긋나지 않아요.

**① import**

```python
from typing import Any, Optional
from postgrest.exceptions import APIError as PostgrestError
from app.common import ApiError, CamelModel
from app.db import db
```

**📖 한 줄씩** `Any`: 어떤 타입이든 OK (portfolio 안의 값들은 모양이 자유로움)

**② 경험 데이터 모양**

```python
class Period(CamelModel):
    start: Optional[str] = None
    end: Optional[str] = None


class ExperienceIn(CamelModel):
    title: str
    category: str = "ETC"
    tags: list[str] = []
    organization: Optional[str] = None
    period: Period = Period()
    role: Optional[str] = None
    achievements: list[str] = []
    skills: list[str] = []
    portfolio: Optional[dict[str, Any]] = None
    source_file_id: Optional[str] = None
    job_fit_score: Optional[int] = None
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `Period` | 기간을 `{"start", "end"}` 묶음으로. 문자열이라 `"2025-03"`처럼 월까지만 있어도 OK |
| `title: str` | **유일한 필수 칸** |
| `category: str = "ETC"` | 안 보내면 기타 |
| `tags: list[str] = []` | 안 보내면 빈 목록 |
| `period: Period = Period()` | 안 보내면 `{start: null, end: null}` |

**🤔 왜 이렇게?** AI 결과는 칸이 빠져 있을 때가 많아서, 필수는 최소한으로 하고 **기본값을 넉넉히** 두는 게 안전해요. 날짜를 `date` 타입이 아니라 문자열로 받는 이유: 이력서에는 "2025.03"처럼 일(day)이 없는 경우가 대부분이라서.

**🏢 현업에서는** "들어오는 데이터에는 관대하게, 내보내는 데이터는 엄격하게"(**Postel의 법칙**)라는 말이 있어요. 외부(AI, 다른 시스템)에서 오는 데이터를 받을 때 특히 이렇게 설계합니다. 다만 `category`처럼 값이 정해진 칸은 `Literal["PROJECT", "INTERN", ...]`이나 Enum으로 제한하는 게 더 안전해요 (지금은 A와 카테고리 목록이 확정되면 바꾸기로).

**③ 변환 함수 (API 모양 ↔ DB 모양)**

```python
def to_row(exp: ExperienceIn, user_id: str) -> dict:
    data = exp.model_dump(exclude={"period"})
    return {**data, "user_id": user_id, "period_start": exp.period.start, "period_end": exp.period.end}


def to_api(row: dict) -> dict:
    return {
        "id": row["id"], "title": row["title"], "category": row["category"], "tags": row["tags"],
        "organization": row["organization"],
        "period": {"start": row["period_start"], "end": row["period_end"]},
        "role": row["role"], "achievements": row["achievements"], "skills": row["skills"],
        "portfolio": row["portfolio"], "sourceFileId": row["source_file_id"],
        "jobFitScore": row["job_fit_score"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }
```

**📖 한 줄씩**

| 함수 | 방향 | 하는 일 |
|---|---|---|
| `to_row` | API → DB | `period`를 빼고(`exclude`) `period_start`/`period_end`로 풀고, `user_id`를 붙임 |
| `to_api` | DB → API | 반대로 묶고 camelCase로 |

**🤔 왜 이렇게?** API 모양과 DB 모양을 **한 곳에서만** 변환해요. DB 칸 이름을 바꿔도 이 두 함수만 고치면 프론트는 그대로입니다.

**🏢 현업에서는** 이걸 **매퍼(Mapper)** 라고 불러요. Java의 MapStruct, TypeScript의 class-transformer 같은 도구가 이 역할을 합니다. `user_id`를 요청 바디에서 받지 않고 **서버가 토큰에서 꺼내 붙이는** 것도 중요해요. 바디에서 받으면 남의 id를 넣어서 남의 경험으로 저장할 수 있거든요.

**④ A가 부르는 함수 2개**

```python
def save_experiences(user_id: str, items: list[dict]) -> list[str]:
    """A가 부르는 함수: AI 분석 결과 여러 개를 한 번에 저장하고 id 목록을 돌려줌"""
    rows = [to_row(ExperienceIn.model_validate(item), user_id) for item in items]
    if not rows:
        return []
    res = db.table("experiences").insert(rows).execute()
    return [r["id"] for r in res.data]


def list_experiences(user_id: str) -> list[dict]:
    """A가 부르는 함수: 경험 추천·자소서 생성에 넘길 전체 경험"""
    res = db.table("experiences").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return [to_api(r) for r in res.data]
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `ExperienceIn.model_validate(item)` | A가 넘긴 dict도 똑같이 검사 → 이상한 데이터가 DB에 못 들어감 |
| `insert(rows)` | **여러 줄을 한 번에** (파일 1개 분석에 경험 5개면 DB 호출 1번) |
| `return [r["id"] ...]` | 저장된 id 목록 → A가 "어떤 경험이 만들어졌는지" 프론트에 알려줌 |
| `list_experiences` | 그 사람 경험 전체 → A가 공고와 비교해서 추천 |

**🤔 왜 이렇게?** 한 줄씩 5번 insert하면 네트워크 왕복이 5번이고, 중간에 실패하면 일부만 저장돼요. 한 번에 넣으면 빠르고 전부 성공/전부 실패입니다.

**🏢 현업에서는** 이걸 **배치 insert(bulk insert)** 라고 해요. 수천 줄을 넣을 때는 1000개씩 끊어서 넣는 식으로 조절합니다.

**⑤ 내 경험 하나 찾기**

```python
def get_own_experience(exp_id: str, user_id: str) -> dict:
    res = db.table("experiences").select("*").eq("id", exp_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "EXPERIENCE_NOT_FOUND", "경험을 찾을 수 없어요.")
    return res.data
```

**📖 한 줄씩** 파일의 `get_own_file`과 같은 패턴: **id + user_id**로 찾고 없으면 404.

### 7-2. `app/routers/experiences.py` — 경험 보관함 API

**① import**

```python
"""나의 경험 보관함 (EX-01, EX-02)"""
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError as PostgrestError

from app.common import ok, now_iso, page_params
from app.db import db
from app.deps import get_current_user
from app.services.experiences import ExperienceIn, get_own_experience, save_experiences, to_api, to_row

router = APIRouter(tags=["experiences"])
```

**📖 한 줄씩** `Counter`: 개수 세기 (`Counter(["A","B","A"])` → `{"A": 2, "B": 1}`)

**② 목록 (필터 + 페이지네이션)**

```python
def my_experiences_query(user_id: str, category: Optional[str]):
    query = db.table("experiences").select("*", count="exact").eq("user_id", user_id)
    return query.eq("category", category.upper()) if category else query


@router.get("/experiences")
def list_my_experiences(category: Optional[str] = None, page: int = 0, size: int = 20,
                        user: dict = Depends(get_current_user)):
    start, end = page_params(page, size)
    try:
        res = my_experiences_query(user["id"], category).order("created_at", desc=True).range(start, end).execute()
    except PostgrestError as e:
        if e.code != "PGRST103":  # PGRST103 = 마지막 페이지를 넘어간 요청
            raise
        total = my_experiences_query(user["id"], category).limit(1).execute().count
        return ok({"items": [], "page": page, "size": size, "totalCount": total})
    return ok({"items": [to_api(r) for r in res.data], "page": page, "size": size,
               "totalCount": res.count})
```

**📖 한 줄씩**

| 코드 | 설명 |
|---|---|
| `category`, `page`, `size` | 쿼리 파라미터 `?category=PROJECT&page=1&size=10` |
| `page_params(page, size)` | `page=1,size=10` → `(10, 19)` (11~20번째). size는 최대 50 |
| `count="exact"` | 결과와 함께 **조건에 맞는 전체 개수**도 → 프론트가 "총 37개", 페이지 수 계산 |
| `my_experiences_query` | "내 경험 + 카테고리 필터" 조건을 함수로 묶음. 에러 때 같은 조건으로 개수만 다시 세려고 |
| `category.upper()` | `project`로 보내도 `PROJECT`로 찾음 (DB에는 대문자로 저장) |
| `if category else query` | 필터가 있을 때만 조건 추가 (쿼리를 조립하는 방식) |
| `.range(start, end)` | SQL의 `OFFSET/LIMIT` |
| `except PostgrestError` + `PGRST103` | **마지막 페이지를 넘어간 요청**이면 Supabase가 에러를 냄 → 500 대신 빈 목록 + 전체 개수 |
| `if e.code != "PGRST103": raise` | 그 에러만 빈 목록으로 바꾸고, 다른 DB 에러는 숨기지 않고 그대로 |

**🤔 왜 이렇게?** 경험이 100개가 되면 한 번에 다 보내는 건 느려요. 페이지로 끊되, `size` 최대값을 둬서 `size=100000` 같은 요청을 막아요.
페이지를 넘긴 요청(무한 스크롤의 마지막+1 페이지, 경험 0개인데 `page=1`)은 사용자 잘못이 아니라서 에러가 아니라 **빈 목록**이 맞는 응답이에요. 실제로 처음 만든 코드는 이 경우 500이 났고, 테스트 중에 발견해서 고쳤어요. 데이터가 0개일 때·마지막 페이지·마지막+1 페이지 같은 **경계값 테스트**가 중요한 이유예요.

**🏢 현업에서는** 페이지 번호 방식(**offset**)은 "3페이지로 이동"이 필요한 게시판·관리자 표에 쓰고, 무한 스크롤(인스타, 유튜브)은 **커서 방식**(`?after=마지막id`)을 써요. offset은 중간에 새 글이 들어오면 같은 글이 두 번 보이거나 빠지는 문제가 있고, 데이터가 많을수록 느려지거든요.

**③ 카테고리별 개수**

```python
@router.get("/experiences/categories")
def categories(user: dict = Depends(get_current_user)):
    res = db.table("experiences").select("category").eq("user_id", user["id"]).execute()
    counts = Counter(r["category"] for r in res.data)
    return ok({"total": len(res.data), "categories": [{"category": c, "count": n} for c, n in counts.items()]})
```

**📖 한 줄씩**
- `select("category")`: 필요한 칸 하나만 → 가볍게
- **이 API는 반드시 `/experiences/{exp_id}`보다 위에.** FastAPI는 위에서부터 URL을 맞춰보는데, 아래에 있으면 `categories`라는 글자를 경험 id로 착각해요.

**🏢 현업에서는** 집계는 보통 DB에서 `group by`로 해요(데이터를 서버로 다 가져오지 않음). 우리는 사람당 경험이 수십 개라 서버에서 세도 충분하고, supabase-py로 group by를 쓰려면 DB 함수(RPC)를 따로 만들어야 해서 단순한 방법을 골랐어요.

**④ 상세 · 추가 · 수정 · 삭제**

```python
@router.get("/experiences/{exp_id}")
def detail(exp_id: str, user: dict = Depends(get_current_user)):
    return ok(to_api(get_own_experience(exp_id, user["id"])))


@router.post("/experiences")
def create(body: ExperienceIn, user: dict = Depends(get_current_user)):
    new_id = save_experiences(user["id"], [body.model_dump(by_alias=True)])[0]
    return ok(to_api(get_own_experience(new_id, user["id"])))


@router.patch("/experiences/{exp_id}")
def update(exp_id: str, body: ExperienceIn, user: dict = Depends(get_current_user)):
    get_own_experience(exp_id, user["id"])  # 본인 것인지 확인
    db.table("experiences").update({**to_row(body, user["id"]), "updated_at": now_iso()}).eq("id", exp_id).execute()
    return ok(to_api(get_own_experience(exp_id, user["id"])))


@router.delete("/experiences/{exp_id}")
def delete(exp_id: str, user: dict = Depends(get_current_user)):
    get_own_experience(exp_id, user["id"])
    db.table("experiences").delete().eq("id", exp_id).execute()
    return ok({"deleted": True})
```

**📖 한 줄씩**

| API | 흐름 |
|---|---|
| 상세 | 내 것인지 확인하며 조회 → 변환 |
| 추가 | **A와 같은 `save_experiences`** 재사용 → 저장된 id로 다시 조회해서 응답 |
| 수정 | ① 내 것인지 확인 ② 수정 ③ 최신 값 응답 |
| 삭제 | 확인 → 삭제 |

**🤔 왜 이렇게?** 수정·삭제 전에 `get_own_experience`로 **먼저 확인**하는 이유: 업데이트 쿼리는 조건에 맞는 줄이 없어도 에러 없이 "0줄 수정"으로 끝나요. 확인을 먼저 해야 남의 id·없는 id에 정확히 404를 줄 수 있어요.

**🏢 현업에서는**
- **IDOR**(Insecure Direct Object Reference): URL의 id만 바꿔서 남의 데이터를 보거나 고치는 공격. OWASP Top 10 1위(접근 제어 실패)에 해당하는 가장 흔한 보안 사고예요. 우리 서버는 secret 키로 DB에 접속해서 RLS가 막아주지 않으므로, **모든 조회·수정·삭제에 `user_id` 조건**이 유일한 방어선입니다.
- 동시에 두 기기에서 수정하면 나중 것이 덮어써요. 협업 도구는 `updated_at`이나 버전 번호로 충돌을 감지합니다(**낙관적 잠금**).

> 수정(`PATCH`)은 `ExperienceIn` 전체를 받아서 **보낸 값으로 카드 전체를 덮어써요.** 프론트는 편집 화면의 모든 칸을 같이 보내야 해요. (안 보낸 칸은 기본값으로 초기화)

### 7-3. main.py 연결

```python
from app.routers import auth, users, files, experiences
...
for r in [auth, users, files, experiences]:
```

### 7-4. 테스트

1. `POST /experiences`
   ```json
   {"title": "캠퍼스 중고거래 앱 기획", "category": "PROJECT", "tags": ["기획"],
    "organization": "창업동아리", "period": {"start": "2025-03", "end": "2025-06"},
    "role": "PM", "achievements": ["설문 120명", "MAU 1,200명"], "skills": ["Figma"]}
   ```
   → `id`가 붙은 카드
2. 같은 방식으로 `"category": "INTERN"` 하나 더
3. `GET /experiences` → `totalCount: 2`
4. `GET /experiences?category=PROJECT` → 1개
5. `GET /experiences?size=1&page=1` → 두 번째 카드만, `totalCount: 2`
6. `GET /experiences/categories` → `total: 2`, PROJECT 1 · INTERN 1
7. `PATCH /experiences/{id}` → 바디에 `title`만 바꿔서 전체 보내기 → 바뀐 카드
8. `POST /experiences` 에 `{}` → **422** (`title` 필수)
9. `DELETE` 후 상세 조회 → **404** `EXPERIENCE_NOT_FOUND`

---

## 2주차 끝 점검표

- [ ] `03_student_login.sql` 실행 → Table Editor `profiles`에 `student_id` 칸 있음
- [ ] 학번·비밀번호 등록 → 로그아웃 → 학번으로 로그인 성공
- [ ] 틀린 비밀번호 / 없는 학번 → 둘 다 같은 401 메시지
- [ ] `files` 버킷 존재 + 비공개
- [ ] 내 정보 / 목표 직무 / 동의 수정이 Table Editor에 반영됨
- [ ] 약관 3종(`privacy`, `terms`, `ai-data`) 조회됨
- [ ] 파일 2개 업로드 → Storage + `files` 테이블 둘 다 생김, 잘못된 확장자 → 400
- [ ] `downloadUrl`로 다운로드됨
- [ ] 경험 추가 → 목록·필터·페이지·카테고리 개수가 맞음
- [ ] 없는 id / 남의 id → 404
- [ ] (마지막에, 테스트 계정으로) 탈퇴 → Storage 내 폴더 + 모든 테이블에서 사라짐

## 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| `column profiles.student_id does not exist` (500) | `03_student_login.sql` 안 돌림 |
| `POST /auth/password`가 401 | Authorize에 메일 인증 토큰을 안 넣음 (로그인 필요한 API) |
| 409 `STUDENT_ID_TAKEN` | 다른 계정이 그 학번을 먼저 등록함. Table Editor `profiles`에서 확인 |
| 비밀번호 맞는데 401 `INVALID_CREDENTIALS` | 비밀번호 앞뒤 공백, 학번 오타, 등록을 다른 계정(다른 메일)으로 했음 |
| 400 `WEAK_PASSWORD` "사용할 수 없는 비밀번호" | Supabase 대시보드의 비밀번호 규칙이 더 엄격함 (Minimum length, 문자 조합) |
| 로그인 429 | 짧은 시간에 너무 많이 시도. 잠시 후 다시 / **Rate Limits** 확인 |
| `Bucket not found` | Storage에 `files` 버킷 없음 / 이름 오타 |
| 업로드 API에 파일 선택 칸이 안 보임 | `python-multipart` 미설치 → `pip install -r requirements.txt` |
| 업로드 400 `UNSUPPORTED_TYPE`인데 PDF임 | 파일 이름에 확장자가 없거나 `.pdf.exe` 같은 이름 |
| `invalid input syntax for type uuid` (500) | id 칸에 uuid가 아닌 글자(`abc`) → 실제 id 복사 |
| 목록이 500, 로그에 `PGRST103` | 페이지 범위 처리(`except PostgrestError`)를 안 넣음 |
| `/experiences/categories`가 404 | `categories` 함수가 `/{exp_id}` 함수보다 아래에 있음 |
| PATCH 했는데 다른 칸이 비어버림 | 경험 수정은 전체 덮어쓰기 → 모든 칸 같이 보내기 |
| 422 `body.title: Field required` | 필수 칸 누락. 메시지 앞부분이 어느 칸인지 알려줌 |
| `period.start`가 저장 안 됨 | `periodStart`가 아니라 `"period": {"start": ...}` 모양으로 |

## 다음 주 (3주차) 예고

공고 저장·크롤링(`crawler.py`, `job_postings.py`) → 자소서 저장·수정(`cover_letters.py`) → 포폴 PPTX/PDF 내보내기(`pptx_render.py`, `portfolios.py`). 이번 주의 "내 것만 조회 + 서비스 함수로 A와 공유" 패턴이 그대로 반복됩니다.
