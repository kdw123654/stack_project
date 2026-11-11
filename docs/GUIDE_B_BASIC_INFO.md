# B 추가 가이드: 로그인 후 학과·학년 1회 등록

## 이 문서 읽는 법

- 코드 블록은 **직접 쳐요.** 블록 아래 설명을 읽고 다음 블록으로 넘어가요.
- 📖 설명: 코드가 무슨 뜻인지
- 🤔 왜: 왜 이렇게 짰는지
- 🏢 현업: 실제 회사에서는 어떻게 하는지
- 순서: **STEP 1(백엔드) → STEP 2(Swagger 테스트) → STEP 3(프론트) → STEP 4(화면 테스트)**

---

## 0. 무엇을 만드나

### 지금 문제

```
가입 (이메일 인증) ─→ profiles에 id, email만 저장
학번·비밀번호 등록 ─→ student_id만 저장
                        department = null, grade = null  ← 아무도 안 채움
화면 ─→ "미등록"
```

수원대 포털에서 학과·학년을 받아오는 공식 API가 없어요. 그래서 **로그인한 뒤 학과·학년이 비어 있으면 한 번만 입력받아요.**

### 바뀐 뒤 흐름

```
로그인 (학번·비밀번호 또는 이메일 인증)
   │
   ▼
GET /users/me ──→ department나 grade가 비어 있나?
   │                 │ 예
   │ 아니요           ▼
   │           [기본 정보 등록 화면]
   │             학과: 입력 + 자동완성 후보
   │             학년: 학번으로 추정해서 미리 선택 (바꿀 수 있음)
   │                 │ PATCH /users/me
   ▼                 ▼
 홈 화면 ◀──────────┘
```

### 규칙

| 항목 | 규칙 |
|---|---|
| 학과 | 2~30자. **처음 한 번만** 등록 가능. 다른 학과로 바꾸려 하면 409 에러 |
| 학년 | 1~5 (건축학부 같은 5년제 고려). 학년은 해마다 바뀌니까 잠그지 않음 |
| 학년 추정 | 학번 앞 2자리 = 입학년도. 22학번이면 2026년엔 4학년. 휴학·편입은 반영 못 해서 **미리 골라만 두고** 사용자가 바꿀 수 있게 함 |

### 바꾸는 파일

| 파일 | 담당 | 할 일 |
|---|---|---|
| `server/app/routers/users.py` | B (나) | 입력 검사 + 학과 잠금 |
| `src/services/backend.ts` | 프론트 | 학년 추정, 내 정보 불러오기, 저장 함수 |
| `src/data/departments.ts` | 프론트 | **새 파일.** 학과 자동완성 후보 |
| `src/screens/BasicInfo.tsx` | 프론트 | **새 파일.** 기본 정보 등록 화면 |
| `src/App.tsx` | 프론트 | 비어 있으면 등록 화면 먼저 보여주기 |

> 프론트 파일은 FE 팀원 담당이에요. 고치기 전에 "App.tsx, backend.ts 건드린다"고 한마디 해 두면 나중에 합칠 때 충돌이 안 나요.

---

## STEP 1. 백엔드: `server/app/routers/users.py`

이미 있는 `PATCH /users/me`(내 정보 수정)를 그대로 써요. 새 API를 만들지 않고 **검사 규칙만 추가**해요.

### 1-① import 한 줄 추가

`from fastapi.responses import JSONResponse` 바로 아래에:

```python
from pydantic import ConfigDict, Field
```

- 📖 `Field`: 값의 범위(최소·최대 길이, 최소·최대 숫자)를 정할 때 써요.
- 📖 `ConfigDict`: 모델 전체 설정을 바꿀 때 써요. 여기서는 앞뒤 공백 자동 제거에 써요.

### 1-② `ProfileUpdate` 클래스 바꾸기

원래 코드:

```python
class ProfileUpdate(CamelModel):
    name: Optional[str] = None
    department: Optional[str] = None
    grade: Optional[int] = None
```

이렇게 바꿔요:

```python
class ProfileUpdate(CamelModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(default=None, min_length=1, max_length=20)
    department: Optional[str] = Field(default=None, min_length=2, max_length=30)
    grade: Optional[int] = Field(default=None, ge=1, le=5)
```

- 📖 `str_strip_whitespace=True`: `"  정보보호학과 "`처럼 앞뒤에 붙은 공백을 자동으로 지워요. 공백을 먼저 지우고 나서 길이를 검사해요.
- 📖 `ge=1, le=5`: greater or equal 1, less or equal 5. 1~5만 통과해요.
- 📖 범위를 벗어나면 FastAPI가 알아서 **422** 에러를 돌려줘요. 우리가 if문을 쓸 필요가 없어요.
- 🤔 `model_config`를 새로 써도 부모(`CamelModel`)의 camelCase 설정은 그대로 남아요. pydantic이 부모 설정과 **합쳐** 줘요.
- 🤔 왜 서버에서도 검사하나요? 프론트에서 막아도, Swagger나 다른 프로그램으로 API를 직접 부르면 프론트 검사를 건너뛸 수 있어요. **서버 검사가 진짜 방어선**이에요.
- 🏢 현업에서는 "프론트 검사는 사용자 편의, 서버 검사는 보안"이라고 해요. 둘 다 해요.

### 1-③ `update_me` 함수에 학과 잠금 추가

원래 코드:

```python
@router.patch("/users/me")
def update_me(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    changes = body.model_dump(exclude_none=True)
    if changes:
        db.table("profiles").update({**changes, "updated_at": now_iso()}).eq("id", user["id"]).execute()
    return ok(get_profile(user["id"]))
```

`changes = ...` 줄과 `if changes:` 줄 **사이에** 4줄을 넣어요:

```python
    if "department" in changes:
        current = get_profile(user["id"])["department"]
        if current and current != changes["department"]:
            raise ApiError(409, "DEPARTMENT_LOCKED", "학과는 처음 한 번만 등록할 수 있어요. 바꾸려면 문의해 주세요.")
```

- 📖 `"department" in changes`: 이번 요청에 학과가 들어 있을 때만 검사해요. 학년만 바꾸는 요청은 그냥 통과해요.
- 📖 `get_profile(...)["department"]`: DB에 지금 저장된 학과예요. 이 파일 위쪽에 이미 있는 함수를 재사용해요.
- 📖 `current and current != ...`: **이미 학과가 있는데 다른 값으로** 바꾸려 할 때만 막아요.
  - 처음 등록(`current`가 None) → 통과
  - 같은 학과를 다시 보냄 → 통과 (프론트가 한 번 더 저장해도 에러가 안 나게)
- 📖 409 Conflict: "지금 데이터 상태와 충돌해서 처리할 수 없다"는 뜻이에요. 학번 중복(`STUDENT_ID_TAKEN`)에도 409를 썼어요.
- 🤔 학년은 왜 안 잠그나요? 학년은 해마다 바뀌어요. 잠그면 내년에 3학년→4학년으로 못 바꿔요.
- 🏢 현업에서는 이렇게 "처음 한 번만 설정, 이후 변경은 관리자 문의"인 값을 **write-once 필드**라고 해요. 실명, 생년월일 같은 값이 보통 이래요.

---

## STEP 2. Swagger로 백엔드 먼저 테스트

B 서버를 켜고(`--port 8001`) http://127.0.0.1:8001/docs 를 열어요.

1. `POST /api/v1/auth/login`으로 로그인해서 `accessToken`을 복사한 뒤, **Authorize**에 붙여 넣어요.
2. `PATCH /api/v1/users/me`에 아래 4가지를 차례로 보내요.

| 보낼 값 | 기대 결과 |
|---|---|
| `{ "grade": 6 }` | 422 (학년 범위 밖) |
| `{ "department": " " }` | 422 (공백을 지우면 0자) |
| `{ "department": "정보보호학과", "grade": 4 }` | 200. 응답의 `department`, `grade`가 채워짐 |
| `{ "department": "경영학과" }` | 409 `DEPARTMENT_LOCKED` |

> 이미 Supabase에서 학과를 직접 넣어 뒀다면, 테스트 전에 Table Editor에서 내 줄의 `department`, `grade`를 비워(NULL) 두세요. 그래야 STEP 4에서 등록 화면이 떠요.

---

## STEP 3. 프론트

### 3-① `src/services/backend.ts`

**(a) `User` 타입에 `studentId` 추가**

원래 줄:

```ts
type User = { department: string | null; grade: number | null; desiredJob: string | null; targetCompany: string | null };
```

맨 앞에 `studentId: string | null;`을 넣어요:

```ts
type User = { studentId: string | null; department: string | null; grade: number | null; desiredJob: string | null; targetCompany: string | null };
```

- 📖 `GET /users/me` 응답에는 원래 `studentId`가 들어 있었어요. 프론트 타입에만 빠져 있어서 추가해요.

**(b) `export async function loadProfile() ...` 줄 바로 아래에 함수 3개 추가**

```ts
export function estimateGrade(studentId: string | null, today = new Date()): number | null {
  if (!studentId || !/^\d{8}$/.test(studentId)) return null;
  const entryYear = 2000 + Number(studentId.slice(0, 2));
  const schoolYear = today.getMonth() < 2 ? today.getFullYear() - 1 : today.getFullYear();
  return Math.min(Math.max(schoolYear - entryYear + 1, 1), 4);
}
```

- 📖 `studentId.slice(0, 2)`: 학번 앞 2자리예요. `"22016007"` → `"22"` → 입학년도 2022.
- 📖 `today.getMonth() < 2`: 자바스크립트는 1월이 0, 2월이 1이에요. 1~2월은 아직 **이전 학년도**라서 1년을 빼요. 3월에 학년이 올라가요.
- 📖 `Math.min(Math.max(x, 1), 4)`: 결과를 1~4 사이로 자르는 방법이에요. 22학번이 2027년에 6학년으로 계산돼도 4로 맞춰요.
- 🤔 정확하지 않은 값이라 **추천값**으로만 써요. 화면에서 미리 골라 두고 사용자가 바꿀 수 있어요.

```ts
export async function loadMe() {
  const user = await backend<User>('/users/me');
  return { profile: profileFrom(user), needsBasicInfo: !user.department || !user.grade, suggestedGrade: estimateGrade(user.studentId) };
}
```

- 📖 `/users/me`를 **한 번만** 불러서 세 가지를 같이 돌려줘요.
  - `profile`: 화면에 쓰는 프로필
  - `needsBasicInfo`: 학과나 학년이 비어 있는지
  - `suggestedGrade`: 추정 학년
- 🤔 원래 있던 `profileFrom`은 빈 값을 `'미등록'` 글자로 바꿔 버려요. 그래서 "비었는지"는 바꾸기 **전의** 원본(`user`)으로 판단해요.

```ts
export async function saveBasicInfo(department: string, grade: number) {
  return profileFrom(await backend<User>('/users/me', { method: 'PATCH', body: JSON.stringify({ department, grade }) }));
}
```

- 📖 STEP 1에서 규칙을 추가한 `PATCH /users/me`를 불러요. 서버가 돌려준 최신 프로필을 화면용 모양으로 바꿔서 돌려줘요.

### 3-② 새 파일 `src/data/departments.ts`

```ts
export const DEPARTMENTS = [
  '간호학과', '건설환경공학과', '건축학부', '경영학과', '경제금융학과', '국어국문학과', '국제개발협력학과',
  '글로벌비즈니스학부', '기계공학과', '데이터과학부', '도시부동산개발학과', '문화콘텐츠테크놀로지학과',
  '미디어SW학과', '미디어커뮤니케이션학과', '바이오화학산업학부', '법학과', '사학과', '산업공학과',
  '스포츠과학부', '식품영양학과', '신소재공학과', '아동가족복지학과', '안전보건시스템학과', '영어영문학과',
  '의류학과', '일어일문학과', '전기공학과', '전자공학과', '정보보호학과', '정보통신학부', '컴퓨터SW학과',
  '커뮤니케이션디자인학과', '행정학과', '호텔관광학부', '화학공학과', '환경에너지공학과', '회계학과',
];
```

- 📖 `server/sql/suwon_seniors_full_dataset.json`(선배 데이터)에 나온 학과 이름을 모았어요.
- 🤔 **공식 전체 목록이 아니에요.** 그래서 목록에서만 고르게 하지 않고 **자동완성 후보**로만 써요. 목록에 없는 학과는 직접 쳐도 돼요.
- 🏢 나중에 학교 공식 학과 목록을 구하면 이 배열만 바꾸면 돼요. 더 나아가면 DB 테이블로 옮겨서 서버가 내려주게 해요.

### 3-③ 새 파일 `src/screens/BasicInfo.tsx`

**import와 props**

```tsx
import { useState } from 'react';
import { DEPARTMENTS } from '../data/departments';
import { logout, saveBasicInfo } from '../services/backend';
import type { Profile } from '../types';

interface Props {
  suggestedGrade: number | null;
  onSaved: (profile: Profile) => void;
}
```

- 📖 `onSaved`: 저장이 끝나면 부모(`App.tsx`)에게 새 프로필을 알려주는 함수예요. 부모가 받아서 홈 화면으로 넘어가요.

**상태와 저장 함수**

```tsx
export default function BasicInfo({ suggestedGrade, onSaved }: Props) {
  const [department, setDepartment] = useState('');
  const [grade, setGrade] = useState(suggestedGrade ? String(suggestedGrade) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true); setError('');
    try { onSaved(await saveBasicInfo(department.trim(), Number(grade))); }
    catch (e) { setError(e instanceof Error ? e.message : '저장에 실패했어요.'); }
    finally { setBusy(false); }
  }
```

- 📖 `useState(suggestedGrade ? String(...) : '')`: 추정 학년이 있으면 처음부터 그 값이 선택돼 있어요. `<select>`의 값은 글자라서 `String`으로 바꿔요.
- 📖 `busy`: 저장하는 동안 버튼을 막아서 두 번 눌리지 않게 해요.
- 📖 `catch`: 서버가 보낸 에러 문구(예: 409 학과 잠금 메시지)를 그대로 화면에 보여줘요.
- 🤔 `Login.tsx`와 똑같은 패턴(`busy` / `error` / `submit`)이에요. 같은 앱 안에서는 비슷한 화면을 비슷하게 짜야 읽기 쉬워요.

**화면**

```tsx
  return <div className="screen" style={{ maxWidth: 480, margin: 'auto', paddingTop: 60 }}>
    <h1 className="h-display">STACK</h1>
    <h2 className="h-sub">기본 정보 등록</h2>
    <form className="card stack-12" onSubmit={e => { e.preventDefault(); if (!busy) void submit(); }}>
      <label className="field">소속 학과
        <input className="input" required minLength={2} maxLength={30} list="department-options" placeholder="예) 정보보호학과" value={department} onChange={e => setDepartment(e.target.value)} />
        <datalist id="department-options">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
      </label>
      <label className="field">학년
        <select className="input" required value={grade} onChange={e => setGrade(e.target.value)}>
          <option value="" disabled>선택</option>
          {[1, 2, 3, 4, 5].map(g => <option key={g} value={g}>{g}학년</option>)}
        </select>
      </label>
      {suggestedGrade && <p className="t-caption">학번으로 추정한 학년을 미리 골라 뒀어요. 휴학·편입했다면 바꿔 주세요.</p>}
      <p className="t-caption">학과는 한 번 등록하면 바꿀 수 없어요.</p>
      {error && <p className="notice notice--point" role="alert">{error}</p>}
      <button className="btn btn--primary" disabled={busy}>{busy ? '저장 중' : '시작하기'}</button>
    </form>
    <button className="link" disabled={busy} onClick={() => void logout().catch(() => {})}>로그아웃</button>
  </div>;
}
```

- 📖 `list="department-options"` + `<datalist id="department-options">`: 브라우저 기본 **자동완성**이에요. "정보"라고 치면 "정보보호학과", "정보통신학부"가 아래에 떠요. 목록에 없는 값도 칠 수 있어요.
- 📖 `required minLength={2} maxLength={30}`: STEP 1 서버 규칙과 똑같이 맞춰요. 잘못 입력하면 서버까지 가기 전에 브라우저가 먼저 알려줘요.
- 📖 `className`(`screen`, `card`, `field`, `input`...)은 `Login.tsx`와 같은 걸 써요. 그래서 디자인이 로그인 화면과 똑같이 나와요.
- 🤔 로그아웃 버튼: 다른 계정으로 잘못 로그인했을 때 이 화면에 갇히지 않게 해요.

### 3-④ `src/App.tsx`

**(a) import 줄 바꾸기**

```tsx
import { getSession, loadProfile, listExperiences, saveTarget, logout } from './services/backend';
```

→ `loadProfile`을 `loadMe`로 바꾸고, 바로 아래에 한 줄 추가:

```tsx
import { getSession, loadMe, listExperiences, saveTarget, logout } from './services/backend';
import BasicInfo from './screens/BasicInfo';
```

**(b) 상태 2개 추가**: `const [hideHeader, setHideHeader] = useState(false);` 바로 아래에

```tsx
  const [needsBasicInfo, setNeedsBasicInfo] = useState(false);
  const [suggestedGrade, setSuggestedGrade] = useState<number | null>(null);
```

**(c) 불러오기 바꾸기**: `useEffect` 안의 이 두 줄을

```tsx
    Promise.all([loadProfile(), listExperiences()]).then(([p, e]) => {
      if (active) { setProfile(p); setExperiences(e); }
```

이렇게 바꿔요:

```tsx
    Promise.all([loadMe(), listExperiences()]).then(([me, e]) => {
      if (active) { setProfile(me.profile); setNeedsBasicInfo(me.needsBasicInfo); setSuggestedGrade(me.suggestedGrade); setExperiences(e); }
```

**(d) 등록 화면 먼저 보여주기**: `if (!demoMode && (loading || loadError)) return ...` 줄 **바로 아래에** 한 줄:

```tsx
  if (!demoMode && needsBasicInfo) return <BasicInfo suggestedGrade={suggestedGrade} onSaved={p => { setProfile(p); setNeedsBasicInfo(false); }} />;
```

- 📖 위에 있는 `if (!authenticated) return <Login />`과 같은 방식이에요. 조건에 걸리면 앱 대신 그 화면만 보여줘요.
  - 로그인 안 함 → 로그인 화면
  - 불러오는 중 → 로딩 화면
  - 학과·학년 비어 있음 → 기본 정보 화면
  - 다 통과 → 앱
- 📖 `onSaved`에서 `setNeedsBasicInfo(false)`를 하면 바로 홈 화면으로 넘어가요. 새로고침이 필요 없어요.
- 🤔 `!demoMode`: 샘플 모드(`VITE_API_MOCK=true`)에서는 서버가 없으니 이 화면을 건너뛰어요.

**(e) 프로필 모달 문구 바꾸기**: 아래 문구를

```
수원대학교 포털 연동 정보로 자동 설정된 항목입니다.
```

이렇게 바꿔요:

```
가입할 때 등록한 정보예요. 학과를 바꾸려면 문의해 주세요.
```

- 🤔 실제로 포털 연동을 안 하니까, 사용자를 헷갈리게 하는 문구는 사실대로 고쳐요.

---

## STEP 4. 화면 테스트

1. B 서버(8001)와 프론트(`npm run dev`)를 켜요.
2. 프론트 타입 검사를 해요: `npm run typecheck` → 아무 에러 없이 끝나야 해요.
3. Supabase에서 내 `department`, `grade`를 비운(NULL) 상태로 로그인해요.
4. **기본 정보 등록** 화면이 뜨고, 학년이 미리 골라져 있는지 봐요(22학번이면 4학년).
5. 학과를 고르고 **시작하기** → 홈으로 넘어가요.
6. 프로필 설정을 열어서 학과·학년이 보이는지 확인해요.
7. 새로고침해도 등록 화면이 다시 안 뜨는지 확인해요.

## 자주 막히는 곳

| 증상 | 원인 |
|---|---|
| 등록 화면이 안 뜸 | DB에 이미 학과·학년이 들어 있어요. Supabase에서 비우고 다시 로그인하세요 |
| "학과는 처음 한 번만…" 에러 | 이미 다른 학과가 저장돼 있어요(409). Supabase에서 비우고 다시 하세요 |
| `grade: Input should be less than or equal to 5` | 학년 범위 밖이에요(422). STEP 1-② 규칙대로 동작하는 거예요 |
| `loadProfile is not defined` | 3-④ (a)에서 import만 바꾸고 (c)를 안 바꿨어요 |
