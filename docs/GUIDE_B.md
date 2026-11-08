# B(백엔드) 구현 가이드 — 처음부터 순서대로

> 담당 기능: 로그인·회원(AU), 설정·동의(ST), 파일(FI-01·02·04), 경험 DB(EX-01·02·04), 공고 저장(JP-01·03), 자소서 저장·수정(CL-01·05), 포폴 저장·내보내기(PF-01·05), 탐색 탭(EP), 홈(HM)
> 스택: **Python 3.11+ · FastAPI · Supabase(Postgres + Auth + Storage)**
> 아래 코드는 전부 실제로 실행해서 확인한 코드입니다. 순서대로 직접 타이핑하면서 따라오세요.

## B가 하는 일 한 줄 요약

**"AI가 아닌 모든 것"** — 로그인, DB 저장/조회/수정/삭제, 파일 보관, 크롤링, PPTX/PDF 파일 만들기.
A(AI)는 B가 만든 함수(`save_experiences`, `download_file`, `update_cl` …)를 불러서 결과를 저장합니다.

## 왜 Supabase인가

- **DB + 로그인(이메일 인증코드) + 파일 저장소**를 한 번에 줌 → 메일 서버, S3를 따로 붙일 필요 없음
- 무료 플랜으로 졸업작품 규모는 충분 (DB 500MB, 파일 1GB)
- 화면에서 테이블 내용을 바로 볼 수 있어서 디버깅이 쉬움

## 전체 구조

```
프론트 ──(Authorization: Bearer 토큰)──▶ FastAPI 서버 (B + A 코드)
                                          │  service_role 키로 접속
                                          ▼
                                   Supabase ─ Postgres (테이블)
                                            ─ Auth (이메일 인증코드)
                                            ─ Storage (업로드 파일, 내보낸 PPTX/PDF)
```

**중요한 규칙 3가지**
1. 프론트는 Supabase에 **직접 접속하지 않고** 무조건 우리 FastAPI를 거칩니다.
2. `service_role` 키는 모든 권한을 가진 키라 **서버의 `.env`에만** 둡니다. 프론트/깃허브에 올라가면 DB 전체가 털립니다.
3. 모든 쿼리에 `.eq("user_id", user["id"])`를 붙여서 남의 데이터를 못 보게 합니다. (service_role은 RLS를 무시하기 때문에 이게 유일한 방어선)

## 최종 폴더 구조

```
server/
├─ .env                     ← 키 (절대 커밋 금지)
├─ .gitignore
├─ requirements.txt
├─ sql/
│  ├─ 01_schema.sql         ← 테이블 만들기
│  └─ 02_seed.sql           ← 예시 데이터
└─ app/
   ├─ __init__.py           ← 빈 파일
   ├─ main.py               ← 서버 시작점
   ├─ config.py             ← 설정값
   ├─ db.py                 ← Supabase 연결
   ├─ common.py             ← 공통 응답/에러 모양
   ├─ deps.py               ← 로그인 확인
   ├─ services/             ← 여러 곳에서 쓰는 로직 (+ __init__.py)
   └─ routers/              ← API 엔드포인트 (+ __init__.py)
```

## 진행 순서 한눈에

| 주차 | STEP | 끝나면 되는 것 |
|---|---|---|
| 1주 | 0~4 | Supabase 준비, 테이블 생성, 서버 실행, **로그인** |
| 2주 | 5~7 | 내 정보·동의·약관, **파일 업로드**, **경험 DB** |
| 3주 | 8~10 | 공고 저장·크롤링, 자소서 저장/수정, 포폴 저장/**PPTX 내보내기** |
| 4주 | 11~14 | 탐색 탭, 홈, A와 합치기, 배포 |

---

## STEP 0. 준비물 설치 (30분)

1. **Python 3.11 이상** — https://www.python.org/downloads/ 설치할 때 **"Add python.exe to PATH" 체크**
   ```bash
   python --version
   ```
2. **VS Code** + 확장 "Python"
3. **LibreOffice** (PPTX → PDF 변환용) — https://www.libreoffice.org/download/
   설치 후 경로 확인: 보통 `C:\Program Files\LibreOffice\program\soffice.exe`
4. **Git** — 이미 있으면 패스

## STEP 1. Supabase 프로젝트 만들기 (30분)

1. https://supabase.com 가입 → **New project**. 다른 앱에서 쓰던 프로젝트 말고 **STACK 전용으로 새로** 만드세요.

   | 항목 | 설정 |
   |---|---|
   | GitHub (optional) | 비워두기 (SQL Editor로 직접 만들 거라 필요 없음) |
   | Project name | `stack_project` |
   | Database password | **Copy 눌러서 메모장에 저장** |
   | Region | `Need a specific region?` → **Northeast Asia (Seoul)** |
   | Enable Data API | ✅ **꼭 체크** (서버가 이걸로 DB에 접속함. 끄면 서버가 안 돌아감) |
   | Automatically expose new tables | ✅ 체크 유지 (끄면 서버 키도 `permission denied`) |
   | Enable automatic RLS | ✅ 체크 (선택) |

   > "expose를 끄라"는 안내는 프론트가 Supabase에 직접 붙는 앱 기준이에요. 우리는 RLS를 켜고 정책을 안 만들어서 publishable 키로는 아무것도 못 읽어요.

2. 만들어지면(2~3분) 3개를 복사해 메모장에:

   | `.env` 항목 | 어디서 |
   |---|---|
   | `SUPABASE_URL` | **Project Settings → General**의 Project ID로 `https://프로젝트ID.supabase.co` (또는 상단 **Connect** 버튼) |
   | `SUPABASE_ANON_KEY` | **Project Settings → API Keys → Publishable key** (`sb_publishable_...`) |
   | `SUPABASE_SERVICE_KEY` | 같은 화면 **Secret keys**에서 👁 눌러서 복사 (`sb_secret_...`) ← **절대 공유 금지** |

   > **Legacy API keys(anon/service_role)는 쓰지 마세요.** 2027년 초에 없어집니다. 새 키를 그대로 넣어도 코드는 안 바꿔도 돼요.
   > secret 키가 노출되면 그 화면에서 지우고 **New secret key**로 새로 만들면 됩니다.
3. **Storage → New bucket**
   - 이름: `files`
   - **Public bucket: 끔** (비공개). 다운로드는 서버가 만든 임시 링크(signed URL)로만 함
4. **Authentication → Sign In / Providers → Email**
   - Enable Email provider: 켬
   - **Confirm email: 켬**
5. **Authentication → Emails → Templates → Magic Link** (인증코드 메일 내용)
   기본 템플릿은 링크만 보내므로, 6자리 코드가 보이게 아래로 바꿉니다:
   ```html
   <h2>STACK 로그인 인증코드</h2>
   <p>아래 6자리 코드를 앱에 입력해 주세요.</p>
   <h1>{{ .Token }}</h1>
   <p>10분 안에 입력해야 해요.</p>
   ```
   **Confirm signup** 템플릿도 같은 내용으로 바꿔 두세요 (첫 가입자는 이 템플릿이 나감).
6. **Authentication → Emails → SMTP Settings**
   Supabase 기본 메일 서버는 **시간당 몇 통**밖에 못 보내서 테스트만 가능합니다. 실제 사용 전에 Gmail(앱 비밀번호)이나 Resend 같은 SMTP를 넣어주세요. 개발 중에는 기본 메일로 충분합니다.

> 왜 학교 포털(SSO) 로그인이 아니냐면: 수원대 포털 SSO는 교내 서비스용이라 외부 앱에 열어주는 API가 없습니다. 그래서 **@suwon.ac.kr 메일로 인증코드를 보내서 재학생 확인**을 합니다.

## STEP 2. 테이블 만들기 (20분)

Supabase 왼쪽 **SQL Editor → New query** 에 아래를 붙여넣고 **Run**.

**`sql/01_schema.sql`**

```sql
-- STACK 테이블 (Supabase > SQL Editor에 붙여넣고 Run)
-- 모든 사용자 데이터는 auth.users(Supabase 로그인 계정)에 연결되고, 탈퇴하면 같이 지워진다(on delete cascade).

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  department text,
  grade int,
  desired_job text,
  target_company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_agreed_at timestamptz not null default now(),
  privacy_agreed_at timestamptz not null default now(),
  ai_quality_improvement boolean not null default false,
  job_alert boolean not null default false,
  public_career_profile boolean not null default false,
  updated_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  size bigint not null,
  storage_path text not null,
  last_mode text,
  uploaded_at timestamptz not null default now()
);

create table experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'ETC',
  tags text[] not null default '{}',
  organization text,
  period_start text,
  period_end text,
  role text,
  achievements jsonb not null default '[]',
  skills jsonb not null default '[]',
  portfolio jsonb,
  source_file_id uuid references files(id) on delete set null,
  job_fit_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_postings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  url text,
  raw_text text,
  company text,
  position text,
  required_competencies jsonb not null default '[]',
  questions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_id uuid not null references job_postings(id) on delete cascade,
  status text not null default 'SELECTING',
  selections jsonb not null default '[]',
  answers jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_id uuid not null references job_postings(id) on delete cascade,
  length text not null default 'BASIC_10',
  format text not null default 'PDF',
  experience_ids jsonb not null default '[]',
  outline jsonb not null default '[]',
  slides jsonb not null default '[]',
  export_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table policies (
  type text not null,
  version text not null,
  effective_date date not null,
  body text not null,
  primary key (type, version)
);

-- ---------- 탐색 탭 (관리자가 넣는 데이터) ----------
create table explore_postings (
  id uuid primary key default gen_random_uuid(),
  type text not null,               -- CAMPUS | EXTERNAL
  tag text,                          -- 특강, 비교과, 대외활동 ...
  title text not null,
  organization text,
  description text not null,
  deadline date,
  url text,
  created_at timestamptz not null default now()
);

create table employment_stats (
  id bigint generated always as identity primary key,
  year int not null,
  scope text not null,               -- SCHOOL | DEPARTMENT_JOB
  label text not null,               -- 예: 취업률, 기획, IT 전산
  value numeric not null,
  unit text not null,                -- %, 명
  source text
);

create table seniors (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,        -- 예: 김OO
  company text not null,
  position text not null,
  career_years int,
  department text,
  grad_year int,
  job_category text,
  verified boolean not null default false,
  linkedin_url text,
  hire_specs jsonb not null default '[]',   -- 입사 당시 스펙 태그
  timeline jsonb not null default '[]',     -- [{"grade":"1~2학년","text":"..."}]
  created_at timestamptz not null default now()
);

create table senior_questions (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references seniors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  answer text,
  created_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  url text,
  active boolean not null default true
);

-- 보안: 서버(service_role 키)만 DB에 접근하게 하고, 브라우저에서 직접 접근은 막는다.
alter table profiles enable row level security;
alter table consents enable row level security;
alter table files enable row level security;
alter table experiences enable row level security;
alter table job_postings enable row level security;
alter table cover_letters enable row level security;
alter table portfolios enable row level security;
alter table policies enable row level security;
alter table explore_postings enable row level security;
alter table employment_stats enable row level security;
alter table seniors enable row level security;
alter table senior_questions enable row level security;
alter table programs enable row level security;
```

포인트:
- `profiles.id`가 `auth.users(id)`를 참조하고 `on delete cascade` → **회원 탈퇴 때 로그인 계정만 지우면 그 사람 데이터가 전부 같이 지워짐**
- `enable row level security`만 켜고 정책(policy)은 안 만듦 → 프론트가 anon 키로 직접 DB를 읽는 길을 막음. 서버는 service_role이라 영향 없음

이어서 새 쿼리로 예시 데이터:

**`sql/02_seed.sql`**

```sql
-- 개발용 예시 데이터 (Figma 화면에 나온 값). 실제 데이터는 나중에 교체.
insert into policies (type, version, effective_date, body) values
  ('privacy', 'v0.1', '2026-11-01', '1. 수집하는 개인정보 항목 ... (초안)'),
  ('terms',   'v0.1', '2026-11-01', '제1조 (목적) ... (초안)'),
  ('ai-data', 'v0.1', '2026-11-01', '01 AI가 처리하는 데이터 ... (초안)');

insert into explore_postings (type, tag, title, organization, description, deadline) values
  ('CAMPUS',   '특강',     '수원대학교 ADsP 자격증 특강', '수원대학교', '데이터 분석 역량 강화, 비교과 포인트 인정', '2026-11-13'),
  ('CAMPUS',   '비교과',   '2026 하반기 실무 마케팅 부트캠프', '수원대학교 취업지원팀', '현직 컨설턴트 무료 자소서 코칭 연계', '2026-11-18'),
  ('EXTERNAL', '대외활동', 'IT 서비스 기획 서포터즈 5기 모집', 'OO기업', '서비스 기획, 사용자 리서치 활동', '2026-11-09');

insert into employment_stats (year, scope, label, value, unit, source) values
  (2025, 'SCHOOL', '취업률', 0, '%', '수원대학교 대학 정보공시 (값 입력 필요)'),
  (2025, 'DEPARTMENT_JOB', '기획', 19, '%', '예시 값'),
  (2025, 'DEPARTMENT_JOB', '연구개발', 13, '%', '예시 값'),
  (2025, 'DEPARTMENT_JOB', 'IT 전산', 17, '%', '예시 값');

insert into seniors (display_name, company, position, career_years, department, grad_year, job_category, verified, hire_specs, timeline) values
  ('김OO', '네이버', '서비스 기획자', 2, '경영학과', 2023, 'IT 플랫폼', true,
   '["ADsP", "IT 스타트업 인턴 6개월", "데이터분석 대상", "TOEIC 870"]',
   '[{"grade":"1~2학년","text":"교내 비교과 프로그램·경영 동아리 활동"},{"grade":"3학년","text":"수원대 공모전 참가 및 대상 수상"},{"grade":"4학년","text":"IT 서비스 기획 인턴 6개월"},{"grade":"현재","text":"네이버 서비스 기획자 (정규직)"}]'),
  ('이OO', '카카오페이', '프론트엔드 개발자', 1, '컴퓨터학부', 2024, 'IT 플랫폼', true,
   '["정보처리기사", "오픈소스 기여", "부트캠프 수료"]', '[]');

insert into programs (title, description) values
  ('현직 컨설턴트 무료 자소서 코칭', '수원대 취업지원팀 추천 프로그램');
```

`02_seed.sql`은 **개발용 임의 데이터**(Figma 화면 값)예요. 약관 초안, 교내외 공고 3개, 가짜 취업 통계, 선배 2명, 프로그램 1개가 들어가요. 실제 서비스 전에는 Table Editor에서 진짜 데이터로 바꾸고, 특히 **취업 통계 숫자는 꼭 교체**하세요. 사용자 데이터(회원·파일·경험)는 안 들어가요.

**Table Editor**에 들어가서 테이블 13개가 보이면 성공.

**학번·비밀번호 로그인용** 칸 추가 (2주차 가이드 STEP 4-2에서 자세히):

**`sql/03_student_login.sql`**

```sql
-- 학번·비밀번호 로그인용 (01, 02를 실행한 뒤에 실행)
-- 학번은 로그인 아이디라서 사람마다 달라야 함 → unique. 아직 등록 안 한 사람은 null (null끼리는 중복 OK)
alter table profiles add column if not exists student_id text unique;
```

> `relation "profiles" already exists` 에러가 나면: 이미 한 번 실행했거나, 다른 앱에서 쓰던 프로젝트라 같은 이름 테이블이 있는 거예요. 아래로 확인하세요.
> ```sql
> select table_name from information_schema.tables where table_schema = 'public' order by table_name;
> ```
> 우리 13개만 있으면 이미 된 것(02만 실행). 다른 테이블이 섞여 있으면 **지우지 말고** 새 프로젝트를 만드세요.

## STEP 3. 프로젝트 만들고 서버 띄우기 (30분)

VS Code에서 **File → Open Folder**로 `C:\dev\stack_project`를 열고, **Terminal → New Terminal**로 터미널을 엽니다.

**반드시 `server` 폴더로 들어가서** 시작하세요. (밖에서 하면 `No such file or directory: 'requirements.txt'` 에러)

```bash
mkdir server
cd server
```

줄 앞이 `PS C:\dev\stack_project\server>`로 바뀌었는지 확인하고:

```bash
python -m venv .venv
```

가상환경 켜기 (Windows PowerShell):

```bash
.venv\Scripts\Activate.ps1
```

> "스크립트를 실행할 수 없습니다" 에러가 나면 한 번만: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
> Git Bash라면 `source .venv/Scripts/activate`

**`requirements.txt`**

```text
fastapi
uvicorn[standard]
supabase
python-dotenv
python-multipart
httpx
beautifulsoup4
python-pptx
```

```bash
pip install -r requirements.txt
```

> 줄 앞에 `(.venv)`가 붙어 있어야 해요. `[notice] To update, run: ... pip` 문구는 에러가 아니니 무시.

**`.env`** — STEP 1에서 메모한 값으로 채우기

```text
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_KEY=sb_secret_...
ALLOWED_EMAIL_DOMAIN=suwon.ac.kr
STORAGE_BUCKET=files
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
SOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe
```

**`.gitignore`** — 키가 깃허브에 올라가는 사고 방지 (**제일 먼저** 만드세요)

```text
.env
.venv/
__pycache__/
*.pyc
```

### 파일 만들기

**방법 1 — 마우스로**: 왼쪽 탐색기에서 폴더를 선택 → 📄+(새 파일) / 📁+(새 폴더). 이름에 `/`를 넣으면 중간 폴더까지 한 번에 생겨요 (예: `app/routers/auth.py`).

**방법 2 — 터미널로 한 번에** (`server` 폴더에서, PowerShell):

```powershell
mkdir sql, app\services, app\routers
"sql\01_schema.sql","sql\02_seed.sql","app\__init__.py","app\main.py","app\config.py","app\db.py","app\common.py","app\deps.py","app\services\__init__.py","app\services\storage.py","app\services\experiences.py","app\services\crawler.py","app\services\pptx_render.py","app\routers\__init__.py","app\routers\auth.py","app\routers\users.py","app\routers\files.py","app\routers\experiences.py","app\routers\job_postings.py","app\routers\cover_letters.py","app\routers\portfolios.py","app\routers\explore.py","app\routers\home.py" | ForEach-Object { New-Item $_ -ItemType File }
```

> `__init__.py`는 밑줄이 앞뒤 **2개씩**, 내용은 비워둠. 이게 있어야 `from app.routers import auth`가 됨.
> 저장은 `Ctrl+S` (탭에 ●가 있으면 저장 안 된 것). **File → Auto Save** 켜두면 편함.

**`app/config.py`** — `.env` 값을 읽어옴

```python
import os

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"] 
ALLOWED_EMAIL_DOMAIN = os.getenv("ALLOWED_EMAIL_DOMAIN", "suwon.ac.kr")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "files")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
SOFFICE_PATH = os.getenv("SOFFICE_PATH", "soffice")
```

**`app/db.py`** — Supabase 연결

```python
from supabase import Client, ClientOptions, create_client

from app.config import SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_URL

_NO_SESSION = ClientOptions(auto_refresh_token=False, persist_session=False)

db: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY, options=_NO_SESSION)


def auth_client() -> Client: 
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY, options=_NO_SESSION)
```

> **함정 주의**: `db`(service_role)로 `db.auth.sign_in...`, `verify_otp`를 부르면 그 클라이언트가 **사용자 권한으로 바뀌어버려서** 이후 DB 쿼리가 막힙니다. 로그인 관련은 꼭 `auth_client()`로 새로 만들어서 쓰세요.

**`app/common.py`** — 모든 응답을 `{"success": true, "data": ...}` / `{"success": false, "error": {...}}` 모양으로 통일 (A와 같은 포맷)

```python
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError as PostgrestError
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

logger = logging.getLogger("stack")


def ok(data):
    return {"success": True, "data": data}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"success": False, "error": {"code": code, "message": message}})


def register_error_handlers(app: FastAPI):
    @app.exception_handler(ApiError)
    async def api_error(_: Request, e: ApiError):
        return _error(e.status, e.code, e.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, e: RequestValidationError):
        first = e.errors()[0]
        field = ".".join(str(x) for x in first["loc"][1:])
        return _error(422, "VALIDATION_ERROR", f"{field}: {first['msg']}")

    @app.exception_handler(PostgrestError)
    async def db_error(_: Request, e: PostgrestError):
        if e.code == "22P02":  # id 자리에 uuid가 아닌 글자 → 그런 데이터는 없음
            return _error(404, "NOT_FOUND", "요청한 데이터를 찾을 수 없어요.")
        logger.error("DB 에러 %s: %s", e.code, e.message)
        return _error(500, "DB_ERROR", "서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def page_params(page: int, size: int) -> tuple[int, int]:
    size = max(1, min(size, 50))
    start = max(page, 0) * size
    return start, start + size - 1


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def camel_keys(value):
    if isinstance(value, list):
        return [camel_keys(v) for v in value]
    if isinstance(value, dict):
        return {to_camel(k): camel_keys(v) for k, v in value.items()}
    return value
```

- `ApiError(404, "NOT_FOUND", "메시지")`를 `raise`하면 알아서 에러 응답이 나감
- `CamelModel`: 파이썬에선 `desired_job`, JSON에선 `desiredJob`으로 자동 변환
- `camel_keys`: DB에서 꺼낸 dict를 통째로 camelCase로

일단 서버가 뜨는지만 보기 위해 **`app/main.py`** 를 이렇게 시작:

```python
from fastapi import FastAPI

app = FastAPI(title="STACK API")


@app.get("/health")
def health():
    return {"status": "ok"}
```

```bash
uvicorn app.main:app --reload
```

브라우저에서 http://localhost:8000/health → `{"status":"ok"}`, http://localhost:8000/docs → Swagger 화면이 나오면 성공.

> 반드시 `server` 폴더 안에서 실행해야 `.env`와 `app`을 찾습니다.

## STEP 4. 로그인 — AU-01~04 (3일)

흐름: **이메일 입력 → 인증코드 메일 → 코드 입력 → 토큰 발급 → 이후 모든 요청에 `Authorization: Bearer 토큰`**

**`app/deps.py`** — "로그인한 사람만" 쓰는 API에 붙이는 문지기

```python
"""로그인한 사용자 꺼내기 (JWT 인증). API 함수에 user: dict = Depends(get_current_user)만 붙이면 끝."""
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.common import ApiError
from app.db import auth_client

bearer = HTTPBearer(auto_error=False)  # Swagger에 Authorize 버튼이 생김


def get_current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if cred is None:
        raise ApiError(401, "UNAUTHORIZED", "로그인이 필요해요.")
    try:
        res = auth_client().auth.get_user(cred.credentials)
    except Exception:
        raise ApiError(401, "INVALID_TOKEN", "로그인이 만료됐어요. 다시 로그인해 주세요.")
    if res is None or res.user is None:
        raise ApiError(401, "INVALID_TOKEN", "로그인이 만료됐어요. 다시 로그인해 주세요.")
    return {"id": res.user.id, "email": res.user.email}
```

API에서 `user: dict = Depends(get_current_user)`라고 쓰면 `user["id"]`, `user["email"]`을 꺼낼 수 있습니다.

**`app/routers/auth.py`**

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

STUDENT_ID_RE = re.compile(r"\d{8}")                        # 수원대 학번: 숫자 8자리 (예: 22016007)
PASSWORD_RE = re.compile(r"(?=.*[A-Za-z])(?=.*\d)\S{8,64}")  # 8~64자, 영문+숫자 포함, 공백 없음


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


def token_response(session) -> dict:
    return {"accessToken": session.access_token, "refreshToken": session.refresh_token,
            "expiresIn": session.expires_in}


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

- 처음 인증한 사람이면 `profiles`, `consents`에 빈 줄을 만들고 `isNewUser: true` → 프론트가 온보딩(이름·학과·약관) 화면으로 보냄
- Supabase가 같은 이메일로 짧은 시간에 여러 번 보내면 429를 주므로 `TOO_MANY_REQUESTS`로 변환

**`app/main.py`** 에 라우터 연결 (STEP마다 import와 목록에 하나씩 추가):

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.common import register_error_handlers
from app.config import CORS_ORIGINS
from app.routers import auth

app = FastAPI(title="STACK API")

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
register_error_handlers(app)

for r in [auth]:
    app.include_router(r.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
```

### 테스트 (Swagger)

1. `/docs` → `POST /api/v1/auth/email/send-code` → Try it out
   ```json
   {"email": "내학번@suwon.ac.kr"}
   ```
2. 메일함에서 6자리 코드 확인 → `POST /api/v1/auth/email/verify`
   ```json
   {"email": "내학번@suwon.ac.kr", "code": "123456"}
   ```
3. 응답의 `accessToken` 복사 → Swagger 오른쪽 위 **Authorize** 버튼 → 붙여넣기
   이제부터 자물쇠 달린 API는 전부 내 계정으로 호출됩니다.
4. `gmail.com`으로 보내면 400 `NOT_SCHOOL_EMAIL`이 나와야 정상.

> 메일이 안 오면: 스팸함 → Supabase **Authentication → Users**에 생겼는지 → **Logs**의 Auth 로그 확인.
> 개발 중 메일 횟수 제한이 답답하면 **Authentication → Users → Add user**로 직접 만들어도 됩니다.

## STEP 5. 내 정보 · 동의 · 약관 · 탈퇴 — AU-05, ST-01~05 (2일)

탈퇴 때 파일도 지워야 해서 storage 함수를 먼저 만듭니다.

**`app/services/storage.py`**

```python
from app.common import ApiError
from app.config import STORAGE_BUCKET
from app.db import db


def bucket():
    return db.storage.from_(STORAGE_BUCKET)


def upload_bytes(path: str, data: bytes, content_type: str):
    bucket().upload(path, data, {"content-type": content_type, "upsert": "true"})


def signed_url(path: str, expires_in: int = 3600) -> str:
    return bucket().create_signed_url(path, expires_in)["signedURL"]


def download_file(file_id: str, user_id: str) -> tuple[bytes, str]:
    res = db.table("files").select("*").eq("id", file_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "FILE_NOT_FOUND", "파일을 찾을 수 없어요.")
    return bucket().download(res.data["storage_path"]), res.data["name"]


def remove_all_user_files(user_id: str):
    res = db.table("files").select("storage_path").eq("user_id", user_id).execute()
    paths = [row["storage_path"] for row in res.data]
    res = db.table("portfolios").select("export_path").eq("user_id", user_id).execute()
    paths += [row["export_path"] for row in res.data if row["export_path"]]
    if paths:
        bucket().remove(paths)
```

- `download_file`: **A가 파일을 분석할 때** 부르는 함수
- `signed_url`: 1시간짜리 임시 다운로드 링크 (비공개 버킷이라 이걸로만 받을 수 있음)

**`app/routers/users.py`**

```python
"""내 정보 · 목표 직무 · 동의 · 약관 · 탈퇴 (US-01~05)"""
from typing import Optional

from fastapi import APIRouter, Depends

from app.common import ApiError, CamelModel, camel_keys, now_iso, ok
from app.db import db
from app.deps import get_current_user
from app.services.storage import remove_all_user_files

router = APIRouter(tags=["users"])


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


def get_profile(user_id: str) -> dict:
    res = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "PROFILE_NOT_FOUND", "프로필이 없어요. 다시 로그인해 주세요.")
    return Profile.model_validate(res.data).model_dump(by_alias=True)


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


@router.get("/users/me/consents")
def get_consents(user: dict = Depends(get_current_user)):
    res = db.table("consents").select("*").eq("user_id", user["id"]).single().execute()
    return ok(Consents.model_validate(res.data).model_dump(by_alias=True))


@router.patch("/users/me/consents")
def update_consents(body: ConsentUpdate, user: dict = Depends(get_current_user)):
    changes = body.model_dump(exclude_none=True)
    res = db.table("consents").update({**changes, "updated_at": now_iso()}).eq("user_id", user["id"]).execute()
    return ok(Consents.model_validate(res.data[0]).model_dump(by_alias=True))


@router.delete("/users/me")
def withdraw(user: dict = Depends(get_current_user)):
    remove_all_user_files(user["id"])        # 저장소 파일 먼저 삭제
    db.auth.admin.delete_user(user["id"])    # 계정 삭제 → 모든 테이블 데이터 자동 삭제(cascade)
    return ok({"deleted": True})


@router.get("/policies/{policy_type}")
def get_policy(policy_type: str):
    res = (db.table("policies").select("*").eq("type", policy_type)
           .order("effective_date", desc=True).limit(1).execute())
    if not res.data:
        raise ApiError(404, "POLICY_NOT_FOUND", "약관을 찾을 수 없어요.")
    return ok(camel_keys(res.data[0]))
```

- `DELETE /users/me`: Storage 파일 삭제 → 로그인 계정 삭제 → 테이블은 cascade로 자동 삭제
- `PATCH`는 보낸 값만 바꿈 (`exclude_unset=True`)

`main.py`의 import와 목록에 `users` 추가 → `/docs`에서 `GET /users/me`, `PATCH /users/me`(이름·학과), `PATCH /users/me/consents`, `GET /policies/privacy` 확인.

## STEP 6. 파일 업로드 — FI-01·02·04 (2일)

**`app/routers/files.py`**

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


def to_api(row: dict) -> dict:
    return {"fileId": row["id"], "name": row["name"], "type": row["type"], "size": row["size"],
            "uploadedAt": row["uploaded_at"], "lastMode": row["last_mode"]}


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

- 한 번에 최대 5개, 개당 20MB, 허용 확장자만. **전부 검사한 다음에** 저장 (하나라도 틀리면 아무것도 안 올라감)
- 저장 경로 `{user_id}/{랜덤}.확장자` → 한글 파일명 문제 없음, 원래 이름은 DB에

`main.py`에 `files` 추가 → `/docs`의 `POST /files`에서 **Add string item**으로 파일 여러 개 선택해서 업로드 → Supabase **Storage → files** 에 들어갔는지 확인.

## STEP 7. 경험 DB — EX-01·02·04 (3일)

AI가 분석한 경험이 쌓이는 "마스터 경험 DB"입니다. A가 저장할 때 쓰는 함수도 여기 있어요.

**`app/services/experiences.py`**

```python
from typing import Any, Optional

from app.common import ApiError, CamelModel
from app.db import db


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


def get_own_experience(exp_id: str, user_id: str) -> dict:
    res = db.table("experiences").select("*").eq("id", exp_id).eq("user_id", user_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "EXPERIENCE_NOT_FOUND", "경험을 찾을 수 없어요.")
    return res.data
```

**`app/routers/experiences.py`**

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


@router.get("/experiences/categories")
def categories(user: dict = Depends(get_current_user)):
    res = db.table("experiences").select("category").eq("user_id", user["id"]).execute()
    counts = Counter(r["category"] for r in res.data)
    return ok({"total": len(res.data), "categories": [{"category": c, "count": n} for c, n in counts.items()]})


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

- 목록은 `count="exact"` + `range`로 페이지네이션 (`total` 같이 내려줌)
- `/experiences/categories`가 `/experiences/{id}`보다 **위에** 있어야 함 (아니면 "categories"를 id로 착각)

`main.py`에 `experiences` 추가 → `POST /experiences`로 하나 만들고 → 목록·수정·삭제 확인.

## STEP 8. 공고 저장 · 크롤링 — JP-01·03 (2일)

공고 URL을 주면 본문 텍스트를 긁어오고(B), 그 텍스트를 AI가 분석(A)한 뒤 B 함수로 저장합니다.

**`app/services/crawler.py`**

```python
import httpx
from bs4 import BeautifulSoup

from app.common import ApiError

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; STACK-bot/0.1)"}
MAX_CHARS = 30000


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

> 사람인·잡코리아 같은 사이트는 본문을 자바스크립트로 그리거나 막는 경우가 있습니다. 그럴 땐 `POSTING_FETCH_FAILED`가 나가고, 프론트는 "공고 내용을 복사해서 붙여넣어 주세요"로 안내하면 됩니다.

**`app/routers/job_postings.py`**

```python
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common import ApiError, ok
from app.db import db
from app.deps import get_current_user

router = APIRouter(tags=["job-postings"])


class Question(BaseModel):
    order: int
    text: str
    charLimit: Optional[int] = None


class QuestionsUpdate(BaseModel):
    questions: list[Question]


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


def save_posting(user_id: str, source_type: str, url: Optional[str], raw_text: str, analysis: dict) -> dict:
    row = db.table("job_postings").insert({
        "user_id": user_id, "source_type": source_type, "url": url, "raw_text": raw_text,
        "company": analysis["company"], "position": analysis["position"],
        "required_competencies": analysis["requiredCompetencies"], "questions": analysis["questions"],
    }).execute().data[0]
    return to_api(row)


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

- 분석(`POST /job-postings/analyze`)은 A 담당. A가 분석 끝나면 `save_posting(...)`을 부름
- B는 조회와 **문항 순서 수정**(JP-03) 담당

## STEP 9. 자소서 저장 · 수정 — CL-01·05 (2일)

**`app/routers/cover_letters.py`**

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common import ApiError, now_iso, ok
from app.db import db
from app.deps import get_current_user
from app.routers.job_postings import get_own_posting

router = APIRouter(tags=["cover-letters"])


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
```

- 상태: `SELECTING`(경험 고르는 중) → A가 초안 생성 → `DRAFT` → 사용자가 저장 → `SAVED`
- 사용자가 직접 고치면 `charCount`도 다시 계산

## STEP 10. 포트폴리오 저장 · PPTX/PDF 내보내기 — PF-01·05 (4일)

A가 만든 슬라이드 JSON(`[{slideNo, type, section, title, body, metrics}]`)을 실제 파일로 그립니다.

**`app/services/pptx_render.py`**

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


def add_text(slide, text, left, top, width, height, size, color=NAVY, bold=False):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    frame = box.text_frame
    frame.word_wrap = True
    for i, line in enumerate(str(text).split("\n")):
        p = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        p.text = line
        p.font.size, p.font.bold, p.font.color.rgb, p.font.name = Pt(size), bold, color, FONT
    return box


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

**`app/routers/portfolios.py`**

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

### 혼자 테스트하는 법

A 코드 없이도 확인할 수 있게, Supabase **Table Editor → portfolios**에서 한 줄의 `slides` 칸에 이걸 넣어보세요:

```json
[{"slideNo":1,"layout":"COVER","title":"김OO 포트폴리오","body":"서비스 기획자 지원"},
 {"slideNo":2,"layout":"RESULT_WITH_CHART","section":"프로젝트","title":"캠퍼스 앱 기획","body":"설문 120명 → 기능 3개 도출","metrics":[{"label":"사용자","value":"1,200명"}]},
 {"slideNo":3,"layout":"CLOSING","title":"감사합니다","body":"kim@suwon.ac.kr"}]
```

→ `POST /portfolios/{id}/export` `{"format":"PPTX"}` → 응답의 `downloadUrl` 열기.
PDF가 실패(`EXPORT_FAILED`)하면 `.env`의 `SOFFICE_PATH` 확인.

> 디자인을 바꾸고 싶으면 `pptx_render.py`의 색(NAVY/BLUE/GRAY)과 위치(Inches) 숫자만 바꾸면 됩니다. Figma 디자인에 맞춰 조금씩 조정하세요.

## STEP 11. 탐색 탭 — EP-01~05 (3일)

**`app/routers/explore.py`**

```python
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.common import ApiError, camel_keys, ok
from app.db import db
from app.deps import get_current_user

router = APIRouter(tags=["explore"])


class QuestionCreate(BaseModel):
    content: str


def d_day(deadline: Optional[str]) -> Optional[int]:
    return None if deadline is None else (date.fromisoformat(deadline) - date.today()).days


@router.get("/explore/postings")
def postings(type: Optional[Literal["CAMPUS", "EXTERNAL"]] = None, user: dict = Depends(get_current_user)):
    query = db.table("explore_postings").select("*")
    if type:
        query = query.eq("type", type)
    res = query.gte("deadline", date.today().isoformat()).order("deadline").execute()
    return ok(camel_keys({"items": [{**r, "dDay": d_day(r["deadline"])} for r in res.data]}))


@router.get("/explore/postings/{posting_id}")
def posting_detail(posting_id: str, user: dict = Depends(get_current_user)):
    res = db.table("explore_postings").select("*").eq("id", posting_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "NOT_FOUND", "공고를 찾을 수 없어요.")
    return ok(camel_keys({**res.data, "dDay": d_day(res.data["deadline"])}))


@router.post("/explore/postings/{posting_id}/job-posting")
def to_document_flow(posting_id: str, user: dict = Depends(get_current_user)):
    """'이 공고로 맞춤 서류 만들기': 프론트가 이 text로 A의 /job-postings/analyze를 부르면 됨"""
    res = db.table("explore_postings").select("*").eq("id", posting_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "NOT_FOUND", "공고를 찾을 수 없어요.")
    p = res.data
    text = f"{p['title']}\n{p['organization'] or ''}\n{p['description']}"
    return ok(camel_keys({"sourceType": "TEXT", "text": text}))


@router.get("/explore/employment-stats")
def employment_stats(year: Optional[int] = None, user: dict = Depends(get_current_user)):
    query = db.table("employment_stats").select("*").eq("scope", "SCHOOL")
    res = (query.eq("year", year) if year else query).execute()
    return ok(camel_keys({"items": res.data}))


@router.get("/explore/employment-stats/by-job")
def stats_by_job(year: Optional[int] = None, user: dict = Depends(get_current_user)):
    query = db.table("employment_stats").select("*").eq("scope", "DEPARTMENT_JOB")
    res = (query.eq("year", year) if year else query).order("value", desc=True).execute()
    return ok(camel_keys({"items": res.data}))


@router.get("/explore/seniors")
def seniors(jobCategory: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = db.table("seniors").select("id, display_name, company, position, career_years, "
                                       "grad_year, job_category, verified, hire_specs")
    res = (query.eq("job_category", jobCategory) if jobCategory else query).execute()
    return ok(camel_keys({"items": res.data}))


@router.get("/explore/seniors/{senior_id}")
def senior_detail(senior_id: str, user: dict = Depends(get_current_user)):
    res = db.table("seniors").select("*").eq("id", senior_id).maybe_single().execute()
    if res is None or res.data is None:
        raise ApiError(404, "NOT_FOUND", "선배 정보를 찾을 수 없어요.")
    return ok(camel_keys(res.data))


@router.post("/explore/seniors/{senior_id}/questions")
def ask_senior(senior_id: str, body: QuestionCreate, user: dict = Depends(get_current_user)):
    senior_detail(senior_id, user)  # 존재 확인
    if not body.content.strip():
        raise ApiError(400, "EMPTY_QUESTION", "질문 내용을 입력해 주세요.")
    row = db.table("senior_questions").insert({"senior_id": senior_id, "user_id": user["id"],
                                               "content": body.content.strip()}).execute().data[0]
    return ok(camel_keys(row))


@router.get("/explore/questions")
def my_questions(user: dict = Depends(get_current_user)):
    res = (db.table("senior_questions").select("*, seniors(display_name, company)")
           .eq("user_id", user["id"]).order("created_at", desc=True).execute())
    return ok(camel_keys({"items": res.data}))
```

- 교내외 공고·취업 통계·선배 데이터는 **관리자가 Supabase Table Editor로 직접 넣는 방식**이 제일 빠릅니다 (관리자 페이지는 시간 남으면)
- "이 공고로 서류 만들기" 버튼은 텍스트만 돌려주고, 프론트가 그걸로 A의 공고 분석 API를 부름

## STEP 12. 홈 — HM-01·02 (반나절)

**`app/routers/home.py`**

```python
"""홈 한 번에 조회 (HM-01, HM-02)"""
from fastapi import APIRouter, Depends

from app.common import camel_keys, ok
from app.db import db
from app.deps import get_current_user
from app.routers.files import to_api as file_to_api
from app.routers.users import get_profile

router = APIRouter(tags=["home"])


@router.get("/home")
def home(user: dict = Depends(get_current_user)):
    files = (db.table("files").select("*").eq("user_id", user["id"])
             .order("uploaded_at", desc=True).limit(3).execute())
    return ok({"profile": get_profile(user["id"]),
               "recentFiles": [file_to_api(r) for r in files.data],
               "programs": recommended_programs()["data"]})


@router.get("/programs/recommended")
def recommended_programs():
    res = db.table("programs").select("*").eq("active", True).limit(5).execute()
    return ok(camel_keys(res.data))
```

## STEP 13. main.py 완성

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
```

여기까지 하면 B의 P0 기능이 전부 동작합니다. `/docs`에서 위에서부터 한 번씩 눌러보세요.

## STEP 14. A와 합치기

같은 `server/` 프로젝트 하나에 A의 코드도 넣는 걸 추천합니다 (서버 1개 = 배포 1번).

A에게 알려줄 것:

| A가 하던 것 | B 쪽에서 쓸 것 |
|---|---|
| `store.py` 메모리 저장 | 삭제. 아래 함수들로 교체 |
| `dev_files.py` 업로드 | B의 `/files` 사용. 분석할 때 `services/storage.py`의 `download_file(file_id, user_id)` |
| `experience_client.py` | `services/experiences.py`의 `save_experiences(user_id, items)`, `list_experiences(user_id)` |
| 공고 분석 결과 저장 | `routers/job_postings.py`의 `save_posting(user_id, source_type, url, raw_text, analysis)` |
| 자소서 초안 저장 | `routers/cover_letters.py`의 `update_cl(cl_id, {"selections":..., "answers":..., "status":"DRAFT"})` |
| 포폴 구성안·슬라이드 저장 | `routers/portfolios.py`의 `update_pf(pf_id, {"outline":...})` / `{"slides":...}` |
| `USER_ID = "dev-user"` | `user: dict = Depends(get_current_user)` → `user["id"]` |
| A의 `common.py` | B의 `common.py` 하나로 통일 (같은 모양이라 그대로 바꿔도 됨) |
| URL 공고 | `services/crawler.py`의 `fetch_posting(url)`로 텍스트 받은 다음 분석 |

A의 job 기록(분석 진행 상태)도 DB에 남기고 싶으면 `jobs` 테이블(`id, user_id, type, status, result jsonb, error, created_at`)을 하나 추가하면 됩니다.

## STEP 15. 배포 (반나절)

- **Render** 또는 **Railway** (GitHub 연결 → 자동 배포, 무료/저가 플랜)
  - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - 환경변수: `.env` 내용을 대시보드에 그대로 입력 (`.env` 파일은 올리지 않음)
  - `CORS_ORIGINS`에 프론트 배포 주소 추가
- PDF 내보내기가 필요하면 서버에 LibreOffice가 있어야 함 → Dockerfile에 `apt-get install -y libreoffice-impress fonts-nanum` 추가. 어려우면 **PPTX만 먼저** 지원
- 한글 폰트: 리눅스 서버엔 "맑은 고딕"이 없으므로 PDF 변환 시 나눔고딕으로 대체됨 (PPTX는 사용자 PC 폰트로 열려서 문제 없음)

## 프론트에 알려줄 것

- 로그인 후 받은 `accessToken`을 모든 요청 헤더에 `Authorization: Bearer ...`
- 401 `INVALID_TOKEN`이 오면 `POST /auth/refresh {refreshToken}`로 새 토큰 받고 재시도, 그것도 실패하면 로그인 화면
- 에러는 항상 `{"success": false, "error": {"code", "message"}}` → `message`를 그대로 토스트로 띄워도 됨
- 파일 다운로드는 `downloadUrl`(1시간 유효)을 그대로 열기

## 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| `KeyError: 'SUPABASE_URL'` | `.env`가 없거나 `server` 폴더 밖에서 실행함 |
| 모든 API가 401 `INVALID_TOKEN` | Authorize에 `Bearer ` 없이 토큰만 넣었는지 확인 / 토큰 만료(1시간) → 다시 로그인 |
| 인증 메일이 안 옴 / 429 | 기본 SMTP 시간당 제한. 몇 분 기다리거나 STEP 1-6의 SMTP 설정 |
| 메일에 코드 대신 링크만 옴 | STEP 1-5 템플릿에 `{{ .Token }}` 안 넣음 (Magic Link·Confirm signup 둘 다) |
| 로그인 후 DB 조회가 갑자기 빈 값/권한 에러 | `db.auth.…`를 불러서 service 클라이언트가 사용자 권한으로 바뀜 → `auth_client()` 사용 |
| `new row violates row-level security` / `permission denied` | `SUPABASE_SERVICE_KEY`에 publishable 키를 넣음 → `sb_secret_` 키로 / 프로젝트 만들 때 "expose new tables"를 끔 |
| `relation "..." already exists` | STEP 2의 확인 쿼리로 테이블 목록 확인 |
| `No such file or directory: 'requirements.txt'` | `cd server` 안 함 |
| Storage 업로드 `Bucket not found` | 버킷 이름이 `files`인지, `.env`의 `STORAGE_BUCKET` 확인 |
| `invalid input syntax for type uuid` | 존재하지 않는 형식의 id로 호출. 실제 id 복사해서 테스트 |
| PDF 내보내기 `EXPORT_FAILED` | LibreOffice 미설치 또는 `SOFFICE_PATH` 오타 |
| 프론트에서 CORS 에러 | `.env`의 `CORS_ORIGINS`에 프론트 주소(포트까지) 추가 후 서버 재시작 |
