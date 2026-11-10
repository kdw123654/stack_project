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
  source_analysis_id text,
  source_analysis_hash text,
  analysis_metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists job_postings_user_source_analysis_uidx
  on job_postings (user_id, source_analysis_id);

create table cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_id uuid not null references job_postings(id) on delete cascade,
  status text not null default 'SELECTING',
  selections jsonb not null default '[]',
  answers jsonb not null default '[]',
  ai_imports jsonb not null default '{}',
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
  ai_imports jsonb not null default '{}',
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
