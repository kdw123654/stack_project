import { useState } from 'react';
import { DEPARTMENTS } from '../data/departments';
import { logout, saveBasicInfo } from '../services/backend';
import type { Profile } from '../types';

interface Props {
  suggestedGrade: number | null;
  onSaved: (profile: Profile) => void;
}

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