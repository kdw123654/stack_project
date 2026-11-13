# 동아리 탭 + 공고 필터 만들기

## 이 문서 읽는 법

- 코드 블록은 **직접 쳐요.**
- 📖 설명 / 🤔 왜 / 🏢 현업
- **먼저 끝나 있어야 하는 것**
  - [탐색 실제 데이터 가이드](GUIDE_EXPLORE_REAL_DATA.md) 전체 (프론트가 고친 상태)
  - [공지 수집기 가이드](GUIDE_NOTICE_CRAWLER.md) STEP 1 (DB 열 추가)
- 순서: **STEP 1 DB → STEP 2~3 백엔드(B) → STEP 4~6 프론트 → STEP 7 확인**
- 이 코드는 미리 따로 적용해 봤어요. `typecheck`, `vite build`, API 테스트 25개를 통과했고, 백엔드 함수는 실제 DB로 읽기 테스트를 했어요.

---

## 0. 무엇이 바뀌나

```
탐색 탭
[ 교내외 공고 ] [ 동아리 ] [ 선배 Q&A ] [ 취업 통계 ]
   │              │
   │              └─ 새 탭. 연합/교내 전환 + 분야 칩(학술·교양, 체육 …)
   └─ 종류 칩(채용·인턴, 교육·특강, 공모전 …) + "내 직무 관련 공고만" 토글
      + 카드에 "내 직무 관련" 배지
```

| 데이터 | 어디서 |
|---|---|
| 공고 | `GET /explore/postings` (동아리 **빼고**) + 각 공고에 `jobFit`, 응답에 `myJobs` |
| 동아리 | `GET /explore/clubs` (새로 만듦) |

- 🤔 **동아리를 공고 탭에서 빼는 이유:** 동아리 43개 중 30개 정도가 밴드, 배드민턴 같은 취미예요. 공고 탭에 섞으면 학교 취업 공고가 밑으로 밀려나요.
- 🤔 **필터를 프론트에서 거르는 이유:** 공고와 동아리가 몇백 개 수준이라 한 번에 받아 두고 화면에서 거르면 칩을 누를 때마다 서버를 부르지 않아도 돼요. 천 개가 넘으면 서버 필터로 바꿔요.

---

## STEP 1. 동아리 데이터 넣기 (Supabase SQL Editor)

`server/sql/10_external_clubs.sql` 내용을 통째로 붙여 넣고 실행해요.

- 📖 맨 위의 `alter table ... add column if not exists category text`가 **동아리 분야** 열을 만들어요.
- 📖 연합동아리 43개가 `tag = '연합동아리'`로 들어가요. 교내 동아리는 나중에 `tag = '교내동아리'`로 넣으면 같은 탭에 나와요.
- 다시 실행해도 중복되지 않아요.

---

## STEP 2. 백엔드: 새 파일 `server/app/services/job_match.py`

```python
JOB_KEYWORDS = {
    "경영·기획": ["기획", "PM", "PO", "전략", "경영", "컨설"],
    "마케팅·홍보": ["마케팅", "마케터", "홍보", "광고", "브랜드", "PR"],
    "영업": ["영업", "세일즈"],
    "인사·총무": ["인사", "HR", "총무", "채용담당"],
    "재무·회계": ["재무", "회계", "세무", "금융", "재경", "증권", "은행"],
    "IT 개발": ["개발", "프론트", "백엔드", "프로그래머", "SW", "소프트웨어", "앱", "웹"],
    "데이터·AI": ["데이터", "AI", "인공지능", "머신러닝", "분석가", "애널리스트"],
    "디자인": ["디자인", "디자이너", "UX", "UI"],
    "생산·품질": ["생산", "품질", "공정", "제조", "반도체"],
    "연구개발": ["연구", "R&D"],
    "공공·행정": ["공무원", "공기업", "공공", "행정"],
    "교육": ["교사", "교육", "강사"],
    "미디어·콘텐츠": ["콘텐츠", "PD", "기자", "영상", "미디어", "작가", "에디터"],
    "의료·보건": ["간호", "의료", "보건", "병원", "약사", "제약"],
}


def job_categories(text: str | None) -> set[str]:
    if not text:
        return set()
    lowered = text.lower()
    return {job for job, words in JOB_KEYWORDS.items() if any(w.lower() in lowered for w in words)}
```

- 📖 학생의 희망 직무는 **자유롭게 쓴 글자**예요("데이터 분석가", "서비스 기획자"). 공고의 `job_tags`는 수집기가 정한 **14개 분류**예요. 이 둘을 비교하려면 학생 글자를 분류로 바꿔야 해요.
- 📖 `job_categories("데이터 분석가")` → `{"데이터·AI"}`, `"서비스 기획자"` → `{"경영·기획"}`. 실제로 돌려서 확인했어요.
- 📖 `.lower()`: "ai"라고 소문자로 써도 "AI"와 맞게요.
- 🤔 **AI를 안 쓰는 이유:** 탭을 열 때마다 Gemini를 부르면 느리고 무료 한도가 금방 차요. 단어표로 비교하면 0.001초예요.
- 🤔 **"약" 대신 "약사", "제약"인 이유:** "약"만 쓰면 "계약직"도 의료로 잡혀요. 짧은 단어는 엉뚱한 데 걸려요. 테스트 때 "반도체 공정 엔지니어"가 "엔지니어" 때문에 IT 개발로도 잡혀서 "엔지니어"는 뺐어요.
- 키워드 목록은 수집기의 `JOBS` 14개와 **이름이 똑같아야** 해요.

---

## STEP 3. 백엔드: `server/app/routers/explore.py`

### 3-① import 두 줄

```python
from datetime import date, timedelta
```

```python
from app.services.job_match import job_categories
```

### 3-② `postings` 함수를 통째로 바꾸기

수집기 가이드 STEP 5에서 고친 `postings` 함수를 **지우고** 아래로 바꿔요.

```python
CLUB_TAGS = {"연합동아리", "교내동아리"}


def open_postings() -> list[dict]:
    today = date.today().isoformat()
    recent = (date.today() - timedelta(days=30)).isoformat()
    res = (db.table("explore_postings").select("*").eq("relevant", True)
           .or_(f"deadline.gte.{today},and(deadline.is.null,posted_at.gte.{recent})")
           .order("deadline", nullsfirst=False).order("posted_at", desc=True)
           .execute())
    return [{**r, "dDay": d_day(r["deadline"])} for r in res.data]


@router.get("/explore/postings")
def postings(type: Optional[Literal["CAMPUS", "EXTERNAL"]] = None, user: dict = Depends(get_current_user)):
    profile = db.table("profiles").select("desired_job").eq("id", user["id"]).maybe_single().execute()
    my_jobs = job_categories(profile.data["desired_job"] if profile and profile.data else None)
    items = [{**r, "jobFit": bool(my_jobs & set(r["job_tags"] or []))}
             for r in open_postings()
             if r["tag"] not in CLUB_TAGS and (type is None or r["type"] == type)]
    return ok(camel_keys({"items": items, "myJobs": sorted(my_jobs)}))


@router.get("/explore/clubs")
def clubs(user: dict = Depends(get_current_user)):
    return ok(camel_keys({"items": [r for r in open_postings() if r["tag"] in CLUB_TAGS]}))
```

- 📖 `open_postings()`: "지금 모집 중인 것"을 가져오는 조건(수집기 가이드 STEP 5)을 **함수 하나로 뺐어요.** 공고와 동아리 둘 다 같은 조건을 쓰니까요.
- 📖 `my_jobs & set(r["job_tags"] or [])`: `&`는 **교집합**이에요. 내 직무 분류와 공고의 직무 태그가 하나라도 겹치면 `jobFit = True`예요.
  - 예: 내 직무 `{"데이터·AI"}`, 공고 `{"데이터·AI", "IT 개발"}` → 겹침 → `True`
- 📖 `or []`: 예전에 넣은 공고는 `job_tags`가 비어 있을 수 있어서 빈 목록으로 바꿔요.
- 📖 `profile and profile.data`: 프로필이 없는 사용자도 에러 없이 `my_jobs = set()`가 돼요.
- 📖 `"myJobs": sorted(my_jobs)`: 프론트에 "당신 직무는 이 분류로 봤어요"를 알려 줘요. 화면에 "내 직무(데이터·AI) 관련 공고만 보기"로 보여 줘요.
- 🤔 **`type`, 동아리 제외를 파이썬에서 거르는 이유:** DB 조건에 `or`가 이미 들어가 있어서, 조건을 더 붙이면 헷갈리기 쉬워요. 데이터가 수백 개라 파이썬에서 걸러도 충분히 빨라요.
- 🏢 `jobFit`처럼 **사용자마다 다른 값**을 서버에서 계산해 붙여 주는 걸 "개인화 필드"라고 해요. 직무 분류표가 바뀌어도 서버만 고치면 돼서, 프론트에 비교 로직을 두는 것보다 관리가 쉬워요.

### Swagger로 확인

- `GET /api/v1/explore/postings` → `items`에 `jobFit`, 맨 아래 `myJobs` (희망 직무가 "데이터 분석가"면 `["데이터·AI"]`)
- `GET /api/v1/explore/clubs` → 동아리 43개, 각각 `category`가 있어요.

---

## STEP 4. 프론트: `src/types.ts`

`Notice`에 한 줄 추가하고, 그 아래에 `Club`을 새로 만들어요.

```ts
  url?: string | null;
  jobFit?: boolean;
}

export interface Club {
  id: string;
  name: string;
  scope: '연합' | '교내';
  category: string;
  title: string;
  dday: number | null;
  url: string | null;
}
```

- 📖 `scope: '연합' | '교내'`: 이 두 글자 중 하나만 들어갈 수 있다는 뜻이에요. 오타를 내면 타입 검사에서 바로 잡혀요.

---

## STEP 5. 프론트: `src/services/explore.ts`

### 5-① import에 `Club` 추가

```ts
import type { Club, Notice, SchoolStats, Senior } from '../types';
```

### 5-② `PostingDto` 끝에 두 칸 추가

```ts
... dDay: number | null; url: string | null; jobFit?: boolean; category?: string | null };
```

### 5-③ `toNotice` 마지막에 한 줄

```ts
  url: p.url,
  jobFit: p.jobFit,
});
```

### 5-④ `loadNotices` 바꾸고 동아리 함수 추가

```ts
export async function loadNotices(): Promise<{ items: Notice[]; myJobs: string[] }> {
  const res = await backend<{ items: PostingDto[]; myJobs: string[] }>('/explore/postings');
  return { items: res.items.map(toNotice), myJobs: res.myJobs };
}

const toClub = (p: PostingDto): Club => ({
  id: p.id,
  name: p.organization ?? '',
  scope: p.tag === '교내동아리' ? '교내' : '연합',
  category: p.category ?? '기타',
  title: p.description,
  dday: p.dDay,
  url: p.url,
});

export async function loadClubs(): Promise<Club[]> {
  return (await backend<{ items: PostingDto[] }>('/explore/clubs')).items.map(toClub);
}
```

- 📖 `loadNotices`가 이제 공고 목록과 `myJobs`를 **함께** 돌려줘요. 그래서 STEP 6에서 `data.items`, `data.myJobs`로 꺼내 써요.
- 📖 동아리도 같은 표(`explore_postings`)에 있어서 같은 `PostingDto`를 써요. 동아리 이름은 `organization` 칸에 넣어 뒀어요.

---

## STEP 6. 프론트: `src/screens/Explore.tsx`

### 6-① import 두 줄

```tsx
import { askSenior, loadClubs, loadNotices, loadSchoolStats, loadSenior, loadSeniors } from '../services/explore';
import type { Club, Notice, Profile, Senior, TabId, Toast } from '../types';
```

### 6-② 탭 목록 바꾸고 공통 부품 두 개 추가

`type ExploreTab ...`부터 `TABS` 배열 끝(`];`)까지를 이렇게 바꿔요.

```tsx
type ExploreTab = 'notice' | 'club' | 'senior' | 'stats';
const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'notice', label: '교내외 공고' },
  { id: 'club', label: '동아리' },
  { id: 'senior', label: '선배 Q&A' },
  { id: 'stats', label: '취업 통계' },
];

function Chips({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="chips">
      {items.map((i) => (
        <button key={i} className={`chip ${value === i ? 'is-active' : ''}`} onClick={() => onChange(i)}>{i}</button>
      ))}
    </div>
  );
}

function DdayBadge({ dday }: { dday: number | null }) {
  if (dday === null) return null;
  return <span className={`badge ${dday <= 7 ? 'badge--point' : 'badge--gray'}`}>{dday === 0 ? '오늘 마감' : `D-${dday} 마감`}</span>;
}
```

- 📖 탭이 4개라 "학교 취업 통계"를 "취업 통계"로 줄였어요. 모바일 폭에서 글자가 잘리지 않게요.
- 📖 `Chips`: 선배 탭에 있던 직무 칩 모양을 **부품으로 뺀 것**이에요. 공고, 동아리 두 곳에서 같이 써요.
- 📖 `DdayBadge`: D-day 배지도 공고, 동아리 둘 다 쓰니까 부품으로 뺐어요. 마감일이 없으면(`null`) 아무것도 안 그려요.
- 🏢 같은 화면 조각이 두 군데 이상 나오면 컴포넌트로 빼는 게 React의 기본이에요. 나중에 배지 색을 바꿀 때 한 곳만 고치면 돼요.

### 6-③ `Explore` 함수 안 두 군데

오른쪽 위 배지:

```tsx
        <span className="badge badge--blue">{tab === 'stats' ? '수원대학교 전체' : tab === 'club' ? '수도권 대학생' : `${profile.department} 기준`}</span>
```

`{tab === 'notice' && ...}` 바로 아래에 한 줄:

```tsx
      {tab === 'club' && <ClubList />}
```

### 6-④ `NoticeList` 바꾸기

함수 첫 부분(`const { data: notices ...`부터 `{notices.map((n) => (`까지)를 이렇게 바꿔요.

```tsx
  const { data, status } = useLoad(loadNotices);
  const [kind, setKind] = useState('전체');
  const [onlyMine, setOnlyMine] = useState(false);
  if (!data) return status;
  const kinds = ['전체', ...new Set(data.items.map(kindOf))];
  const list = data.items.filter((n) => (kind === '전체' || kindOf(n) === kind) && (!onlyMine || n.jobFit));
  return (
    <div className="stack-8">
      <Chips items={kinds} value={kind} onChange={setKind} />
      {data.myJobs.length > 0 ? (
        <div className="row row--between">
          <span className="t-caption">내 직무({data.myJobs.join(', ')}) 관련 공고만 보기</span>
          <button className={`toggle ${onlyMine ? 'is-on' : ''}`} role="switch" aria-checked={onlyMine} aria-label="내 직무 관련 공고만 보기" onClick={() => setOnlyMine(!onlyMine)}><span /></button>
        </div>
      ) : (
        <p className="t-caption">희망 직무를 입력하면 내 직무 관련 공고만 골라 볼 수 있어요.</p>
      )}
      {list.length === 0 && <p className="t-caption">조건에 맞는 공고가 없어요.</p>}
      {list.map((n) => (
```

카드 맨 위 줄(종류 배지 + D-day 배지)을 이렇게 바꿔요.

```tsx
          <div className="row row--between">
            <div className="row">
              <span className="badge badge--blue">{n.type}</span>
              {n.jobFit && <span className="badge badge--success">내 직무 관련</span>}
            </div>
            <DdayBadge dday={n.dday} />
          </div>
```

- 📖 `useState`는 `if (!data) return` **위에** 있어야 해요(탐색 가이드 4-⑥과 같은 이유). React 훅은 매번 같은 순서로 불려야 해요.
- 📖 `kinds = ['전체', ...new Set(...)]`: **지금 있는 공고의 종류만** 칩으로 만들어요. 채용 공고가 하나도 없으면 "채용·인턴" 칩도 안 나와요. 눌렀는데 빈 화면이 뜨는 일이 없어요.
- 📖 `(!onlyMine || n.jobFit)`: 토글이 꺼져 있으면 전부 통과, 켜져 있으면 `jobFit`인 것만 통과예요.
- 📖 `role="switch" aria-checked`: 화면 읽기 프로그램이 "켜짐/꺼짐 스위치"로 읽어 줘요. 설정 화면 토글과 같은 모양이에요.
- 🤔 **희망 직무가 없을 때 토글 대신 안내 문구를 보여 주는 이유:** 켜도 아무것도 안 나오는 토글은 고장 난 것처럼 보여요.

### 6-⑤ 종류 묶기 + 동아리 목록 (`/* DS-03 학교 취업 통계` 주석 바로 위에 추가)

```tsx
const KIND_GROUP: Record<string, string> = {
  채용: '채용·인턴', '인턴·현장실습': '채용·인턴',
  '특강·교육': '교육·특강', 특강: '교육·특강', '박람회·설명회': '교육·특강',
  공모전: '공모전', 대외활동: '대외활동', 비교과: '비교과', 창업: '창업',
};
const kindOf = (n: Notice) => KIND_GROUP[n.tags[0] ?? ''] ?? '기타';

const SCOPES = [
  { id: '전체', label: '전체' },
  { id: '연합', label: '연합동아리' },
  { id: '교내', label: '교내동아리' },
];

function ClubList() {
  const { data: clubs, status } = useLoad(loadClubs);
  const [scope, setScope] = useState('전체');
  const [category, setCategory] = useState('전체');
  if (!clubs) return status;
  const inScope = clubs.filter((c) => scope === '전체' || c.scope === scope);
  const categories = ['전체', ...new Set(inScope.map((c) => c.category))];
  const list = inScope.filter((c) => category === '전체' || c.category === category);
  return (
    <div className="stack-8">
      <SegmentTabs items={SCOPES} value={scope} onChange={(v) => { setScope(v); setCategory('전체'); }} />
      <Chips items={categories} value={category} onChange={setCategory} />
      <p className="t-caption">모집 중인 동아리 {list.length}개 · 마감 임박 순</p>
      {list.map((c) => <ClubCard key={c.id} c={c} />)}
    </div>
  );
}

function ClubCard({ c }: { c: Club }) {
  return (
    <article className="card stack-8">
      <div className="row row--between">
        <span className="badge badge--blue">{c.scope} · {c.category}</span>
        <DdayBadge dday={c.dday} />
      </div>
      <div className="t-strong" style={{ fontSize: 15 }}>{c.name}</div>
      <div className="t-caption">{c.title}</div>
      {c.url && /^https?:\/\//i.test(c.url) && <a className="link" href={c.url} target="_blank" rel="noreferrer">모집 글 보기 <Icon name="external" size={12} /></a>}
    </article>
  );
}
```

- 📖 `KIND_GROUP`: 수집기는 종류를 9가지로 나누지만, 칩이 9개면 너무 많아요. "채용"과 "인턴·현장실습"을 "채용·인턴" 하나로 묶는 식으로 줄였어요. 예전 데이터의 "특강"도 같이 묶여요.
- 📖 `KIND_GROUP[...] ?? '기타'`: 표에 없는 종류는 "기타"로 모여요.
- 📖 `SegmentTabs`: 탐색 맨 위 탭과 같은 부품이에요. 연합/교내처럼 **둘 중 하나 고르는** 선택에 어울려요. 분야처럼 개수가 바뀌는 건 칩이 어울려요.
- 📖 `setScope(v); setCategory('전체')`: 연합 ↔ 교내를 바꾸면 분야를 "전체"로 되돌려요. 연합에만 있는 "친목"을 고른 채 교내로 바꾸면 빈 화면이 되니까요.
- 📖 동아리는 서버가 이미 **마감 안 지난 것만, 마감 임박 순**으로 보내요. 그래서 "모집 중만" 토글은 따로 안 만들었어요.
- 📖 지금 동아리 데이터는 링크가 비어 있어서 "모집 글 보기"가 안 보여요. 공식 인스타 주소를 채우면 나타나요.

---

## STEP 7. 확인

1. `npm run typecheck` → 에러 없음
2. B 서버 다시 시작 → 프론트에서 탐색 탭

| 화면 | 보여야 하는 것 |
|---|---|
| 탭 | 교내외 공고 / 동아리 / 선배 Q&A / 취업 통계 |
| 교내외 공고 | 종류 칩(전체, 공모전, 교육·특강 …), 동아리는 안 보임 |
| 희망 직무 입력 전 | "희망 직무를 입력하면…" 안내 |
| 희망 직무 "데이터 분석가" 입력 후 | "내 직무(데이터·AI) 관련 공고만 보기" 토글, 관련 공고에 초록 배지 |
| 동아리 | 전체/연합동아리/교내동아리, 분야 칩, "모집 중인 동아리 43개" |

> "내 직무 관련" 배지가 하나도 안 보이면 정상일 수 있어요. 지금 수집된 학교 공지 대부분이 직무와 상관없는 공모전, 특강이라 `job_tags`가 비어 있어요.

## 알아 두기

- **필터 선택은 탭을 옮기면 초기화돼요.** 각 목록 안에 `useState`를 둬서 그래요. 유지하고 싶으면 `kind`, `onlyMine` 같은 상태를 `Explore` 함수로 올리고 props로 내려 주면 돼요.
- **교내 동아리 데이터는 아직 없어요.** 출처가 정해지면 `tag = '교내동아리'`로 넣기만 하면 이 탭에 자동으로 나와요.
- **선배 Q&A의 "내 학과" 토글**은 이번에 넣지 않았어요. 선배 데이터의 학과 이름(예전 학과명 포함)과 학생 프로필의 학과 이름 표기가 다를 수 있어서, 먼저 같은 이름으로 맞춰야 해요.
- 직무 분류 단어표(`JOB_KEYWORDS`)는 쓰면서 계속 보강하면 돼요. 학생들이 실제로 입력한 희망 직무를 모아 보고, 분류가 안 되는 말이 있으면 단어를 추가해요.
