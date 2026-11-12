import { useEffect, useState } from 'react';
import { backend, logout, setSession } from '../services/backend';
import Icon from '../components/Icon';
import { request } from '../services/http';
import { experiencePayload } from '../services/career';
import type { Experience, Profile, Toast } from '../types';

function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setData(null); setError('');
    backend<T>(path).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [path, retry]);
  return { data, setData, status: error ? <div role="alert"><p>{error}</p><button className="btn" onClick={() => setRetry(n => n + 1)}>다시 시도</button></div> : data === null ? <p role="status">불러오는 중</p> : null };
}

type Notice = { id: string; title: string; description: string; organization: string | null; dDay: number | null; url: string | null };
type Stat = { id: number; year: number; label: string; value: number; unit: string; source: string | null };
type Senior = { id: string; displayName: string; company: string; position: string; verified: boolean; hireSpecs: string[]; department?: string; gradYear?: number; timeline?: { grade: string; text: string }[] };

export function LiveExplore({ toast }: { toast: Toast }) {
  const [tab, setTab] = useState<'postings' | 'stats' | 'seniors'>('postings');
  return <div className="screen"><h1 className="h-title">교내외 탐색</h1><div className="chips">
    {(['postings', 'stats', 'seniors'] as const).map((t, i) => <button key={t} className={`chip ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{['교내외 공고', '학교 취업 통계', '선배 Q&A'][i]}</button>)}
  </div>{tab === 'postings' ? <LiveNotices /> : tab === 'stats' ? <LiveStats /> : <LiveSeniors toast={toast} />}</div>;
}
function LiveNotices() {
  const { data, status } = useData<{ items: Notice[] }>('/explore/postings');
  return <>{status}{data?.items.length === 0 && <p>등록된 공고가 없습니다.</p>}{data?.items.map(p => <article key={p.id} className="card stack-8"><h2 className="h-sub">{p.title}</h2><p>{p.organization}</p><p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p><p>{p.dDay === null ? '마감일 미등록' : `마감까지 ${p.dDay}일`}</p>{p.url && /^https?:\/\//i.test(p.url) && <a className="link" href={p.url} target="_blank" rel="noreferrer">공고 원문 보기</a>}<p className="t-caption">맞춤 서류를 만들려면 공고 본문을 복사해 나의 경험에서 입력하세요.</p></article>)}</>;
}
function LiveStats() {
  const { data, status } = useData<{ items: Stat[] }>('/explore/employment-stats');
  return <>{status}<p className="t-caption">서버에 등록된 수원대학교 전체 통계입니다.</p>{data?.items.length === 0 && <p>자료 준비 중입니다.</p>}{data?.items.map(s => <div key={s.id} className="card"><h2>{s.label}</h2><p>{s.value}{s.unit} · {s.year}년</p><small>{s.source || '출처 미등록'}</small></div>)}</>;
}
function LiveSeniors({ toast }: { toast: Toast }) {
  const { data, status } = useData<{ items: Senior[] }>('/explore/seniors');
  const [selected, setSelected] = useState<string | null>(null);
  return <>{selected ? <LiveSenior id={selected} back={() => setSelected(null)} toast={toast} /> : <>{status}{data?.items.length === 0 && <p>등록된 선배가 없습니다.</p>}{data?.items.map(s => <button key={s.id} className="card stack-8" onClick={() => setSelected(s.id)}><h2 className="h-sub">{s.displayName} · {s.company}</h2><p>{s.position}</p><p>{s.verified ? '재직 확인' : '재직 미확인'}</p><p>{s.hireSpecs.join(' · ')}</p></button>)}</>}</>;
}
function LiveSenior({ id, back, toast }: { id: string; back: () => void; toast: Toast }) {
  const { data, status } = useData<Senior>(`/explore/seniors/${encodeURIComponent(id)}`);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  return <><button className="link" onClick={back}>목록으로</button>{status}{data && <section className="card stack-12"><h2>{data.displayName} · {data.company}</h2><p>{data.position} · {data.department} · {data.gradYear}</p><p>{data.hireSpecs.join(' · ')}</p>{data.timeline?.map((t, i) => <p key={i}>{t.grade} · {t.text}</p>)}<textarea className="input" aria-label="선배에게 남길 질문" maxLength={500} value={content} onChange={e => setContent(e.target.value)} /><button className="btn btn--primary" disabled={busy || !content.trim()} onClick={async () => {
    setBusy(true);
    try { await backend(`/explore/seniors/${encodeURIComponent(id)}/questions`, { method: 'POST', body: JSON.stringify({ content }) }); setContent(''); toast('질문을 등록했어요'); }
    catch (e) { toast(e instanceof Error ? e.message : '질문을 등록하지 못했어요.'); }
    finally { setBusy(false); }
  }}>질문 등록</button></section>}</>;
}

type Comparison = { seniorCount: number; basis: string | null; specs: { spec: string; seniorCount: number; mine: boolean }[] };
type Diagnosis = { acquiredCount: number; requiredCount: number; scoreMeaning: string; items: { id: string; name: string; status: string; evidenceCount: number }[] };
export function LiveMindmap({ profile, experiences, editTarget }: { profile: Profile; experiences: Experience[]; editTarget: () => void }) {
  const comparison = useData<Comparison>('/competency-map/comparison');
  const [criteria, setCriteria] = useState('');
  const [data, setData] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="screen"><h1 className="h-title">역량 마인드맵</h1><section className="card stack-12"><p>목표 직무: {profile.job || '미설정'} · 목표 기업: {profile.targetCompany || '미설정'}</p><button className="btn" onClick={editTarget}>목표 변경</button></section>
    <form className="card stack-12" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(''); setData(null);
      try {
        const names = [...new Set(criteria.split(/[,\n]/).map(v => v.trim()).filter(Boolean))];
        if (!names.length || names.length > 50) throw new Error('기준은 1~50개 입력해 주세요.');
        setData(await request<Diagnosis>('/competency-map/diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetJob: profile.job, criteriaSource: '사용자가 직접 입력한 역량 태그 기준', criteriaVersion: 'user-defined-v1', criteria: names.map((name, i) => ({ id: `c${i}`, name, aliases: [], minimumEvidence: 1 })), experiences: experiences.map(experiencePayload) }) }));
      } catch (e) { setError(e instanceof Error ? e.message : '진단에 실패했어요.'); } finally { setBusy(false); }
    }}><h2 className="h-sub">내 기준으로 역량 진단</h2><p className="t-caption">비교할 역량을 쉼표로 구분해 입력하세요. 각 태그가 포함된 경험이 1개 이상이면 확보로 표시합니다. 직접 입력한 기준이며 공식 직무 기준이 아닙니다.</p><input className="input" required aria-label="진단할 역량" placeholder="Python, 협업, 데이터 분석" value={criteria} onChange={e => setCriteria(e.target.value)} /><button className="btn btn--primary" disabled={busy || !profile.job}>{busy ? '진단 중' : '진단하기'}</button>{!profile.job && <p>목표 직무를 먼저 설정해 주세요.</p>}{error && <p role="alert">{error}</p>}{data && <><p>{data.acquiredCount} / {data.requiredCount} 확보</p><p className="t-caption">{data.scoreMeaning}</p>{data.items.map(item => <p key={item.id}>{item.name} · {item.status === 'held' ? '근거 확인' : '자료 부족'} · 경험 근거 {item.evidenceCount}개</p>)}</>}</form>
    <section className="card stack-12"><h2 className="h-sub">목표 기업·직무 선배와 비교</h2>{comparison.status}{comparison.data && <><p>표본 {comparison.data.seniorCount}명 · 참고용</p>{comparison.data.specs.map((s, i) => <p key={i}>{s.spec} · 선배 {s.seniorCount}명 · {s.mine ? '내 자료에 있음' : '내 자료에서 미확인'}</p>)}{comparison.data.specs.length === 0 && <p>비교할 자료가 없습니다.</p>}</>}</section>
  </div>;
}

type Consents = { aiQualityImprovement: boolean; jobAlert: boolean; publicCareerProfile: boolean };
type Verification = { verified: boolean; schoolEmail: string; studentId: string | null };
export function LiveSettings({ onClose, onEditProfile, toast }: { onClose: () => void; onEditProfile: () => void; toast: Toast }) {
  const consents = useData<Consents>('/users/me/consents');
  const verification = useData<Verification>('/users/me/school-verification');
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState<{ version: string; body: string } | null>(null);
  async function action(work: () => Promise<void>) {
    setBusy(true); try { await work(); } catch (e) { toast(e instanceof Error ? e.message : '요청에 실패했어요.'); } finally { setBusy(false); }
  }
  const downloadData = () => void action(async () => {
    const data = await backend('/users/me/data-export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'STACK_my_data.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const withdraw = () => {
    if (window.confirm('탈퇴하면 서버에 저장한 개인 데이터가 삭제됩니다. 계속할까요?')) void action(async () => { await backend('/users/me', { method: 'DELETE' }); setSession(null); });
  };
  return <div className="settings-route">
    <header className="settings-topbar">
      <button className="back-btn" onClick={onClose} aria-label="설정 닫기"><Icon name="chevronL" size={18} /> 닫기</button>
      <h1>설정 및 계정 관리</h1>
    </header>
    <div className="settings-route__scroll"><div className="screen settings-content">
      <button className="settings-menu-row" onClick={onEditProfile}><Icon name="target" /><span><b>목표·프로필 보기</b><small>희망 직무 · 목표 기업 수정</small></span><Icon name="chevronR" size={16} /></button>
      <section className="settings-card stack-12"><p className="settings-eyebrow">학교 인증</p>{verification.status}{verification.data && <><p>{verification.data.schoolEmail} · {verification.data.studentId}</p><p className="t-caption">{verification.data.verified ? '인증 완료' : '인증 미완료'}</p></>}</section>
      <section className="settings-card stack-12"><p className="settings-eyebrow">선택 동의</p>{consents.status}{consents.data && (['aiQualityImprovement', 'jobAlert', 'publicCareerProfile'] as const).map((key, i) => <label key={key} className="row t-body"><input type="checkbox" checked={consents.data![key]} disabled={busy} onChange={e => { const checked = e.target.checked; void action(async () => { consents.setData(await backend<Consents>('/users/me/consents', { method: 'PATCH', body: JSON.stringify({ [key]: checked }) })); }); }} />{['AI 품질 개선', '공고 알림', '커리어 프로필 공개'][i]}</label>)}</section>
      <section className="settings-card"><p className="settings-eyebrow">정책 문서</p>{(['privacy', 'terms', 'ai-data'] as const).map((key, i) => <button key={key} disabled={busy} className="settings-link" onClick={() => void action(async () => { setPolicy(await backend(`/policies/${key}`)); })}><span className="settings-link__icon"><Icon name={(['shield', 'info', 'sparkle'] as const)[i]} size={16} /></span><span className="settings-link__copy"><b>{['개인정보 처리방침', '이용약관', 'AI 처리 안내'][i]}</b></span><Icon name="chevronR" size={16} /></button>)}{policy && <article style={{ whiteSpace: 'pre-wrap' }}><small>버전 {policy.version}</small><p>{policy.body}</p></article>}</section>
      <section className="settings-card"><p className="settings-eyebrow">계정</p>
        <button className="settings-link" disabled={busy} onClick={downloadData}><span className="settings-link__icon"><Icon name="download" size={16} /></span><span className="settings-link__copy"><b>내 서버 데이터 내려받기</b><small>JSON 파일로 저장돼요</small></span><Icon name="chevronR" size={16} /></button>
        <button className="settings-link" disabled={busy} onClick={() => void action(() => logout())}><span className="settings-link__icon"><Icon name="logout" size={16} /></span><span className="settings-link__copy"><b>로그아웃</b><small>이 기기에서 로그아웃해요</small></span><Icon name="chevronR" size={16} /></button>
      </section>
      <button className="settings-menu-row is-danger" disabled={busy} onClick={withdraw}><Icon name="trash" /><span><b>회원 탈퇴 및 데이터 삭제</b><small>서버에 저장한 개인 데이터가 삭제돼요</small></span><Icon name="chevronR" size={16} /></button>
    </div></div>
  </div>;
}
