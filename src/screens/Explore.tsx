import { useEffect, useState } from 'react';
import Icon, { GitHubIcon } from '../components/Icon';
import { SegmentTabs, SubHeader, Sheet } from '../components/Layout';
import { askSenior, loadNotices, loadSchoolStats, loadSenior, loadSeniors } from '../services/explore';
import type { Profile, Senior, TabId, Toast } from '../types';
import { useHideHeader } from '../components/HeaderContext';

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    load().then(v => { if (active) setData(v); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '불러오지 못했어요.'); });
    return () => { active = false; };
  }, [retry]);
  const status = error
    ? <div className="notice notice--point" role="alert">{error} <button className="link" onClick={() => setRetry(n => n + 1)}>다시 시도</button></div>
    : data === null ? <p className="t-caption" role="status">불러오는 중</p> : null;
  return { data, status };
}

type ExploreTab = 'notice' | 'stats' | 'senior';
const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'notice', label: '교내외 공고' },
  { id: 'stats', label: '학교 취업 통계' },
  { id: 'senior', label: '선배 Q&A' },
];

/* ================= DS: 탐색 ================= */
interface ExploreProps {
  profile: Profile;
  goTab: (tab: TabId) => void;
  toast: Toast;
}

export default function Explore({ profile, goTab, toast }: ExploreProps) {
  const [tab, setTab] = useState<ExploreTab>('notice');
  const [senior, setSenior] = useState<Senior | null>(null);
  useHideHeader(Boolean(senior));

  if (senior) return <SeniorDetail summary={senior} onBack={() => setSenior(null)} toast={toast} />;

  return (
    <div className="screen">
      <div className="row row--between">
        <h1 className="h-title">교내외 탐색</h1>
        <span className="badge badge--blue">{tab === 'stats' ? '수원대학교 전체' : `${profile.department} 기준`}</span>
      </div>
      <SegmentTabs items={TABS} value={tab} onChange={setTab} />
      {tab === 'notice' && <NoticeList goTab={goTab} />}
      {tab === 'stats' && <SchoolStatsView />}
      {tab === 'senior' && <SeniorList onOpen={setSenior} />}
    </div>
  );
}

/* DS-01/02 */
function NoticeList({ goTab }: { goTab: (tab: TabId) => void }) {
  const { data: notices, status } = useLoad(loadNotices);
  if (!notices) return status;
  return (
    <div className="stack-8">
      {status}
      {notices.length === 0 && <p className="t-caption">지금 모집 중인 공고가 없어요.</p>}
      {notices.map((n) => (
        <article key={n.id} className="card stack-8">
          <div className="row row--between">
            <span className="badge badge--blue">{n.type}</span>
            {n.dday !== null && <span className={`badge ${n.dday <= 7 ? 'badge--point' : 'badge--gray'}`}>{n.dday === 0 ? '오늘 마감' : `D-${n.dday} 마감`}</span>}
          </div>
          <div className="t-strong" style={{ fontSize: 15 }}>{n.title}</div>
          <div className="t-caption">{n.desc}</div>
          {n.url && /^https?:\/\//i.test(n.url) && <a className="link" href={n.url} target="_blank" rel="noreferrer">원문 보기 <Icon name="external" size={12} /></a>}
          <button className="btn btn--soft btn--sm btn--block" onClick={() => goTab('experience')}>
            이 공고로 맞춤 서류 만들기 <Icon name="chevronR" size={14} />
          </button>
        </article>
      ))}
    </div>
  );
}

/* DS-03 학교 취업 통계: 수원대학교 전체 단위 공식 자료만. 학과별 통계·비교는 제공하지 않음 */
function SchoolStatsView() {
  const { data: schoolStats, status } = useLoad(loadSchoolStats);
  if (!schoolStats) return status;
  const max = Math.max(1, ...schoolStats.byJob.map((r) => r.value));
  return (
    <>
      <section className="card stack-12">
        <div className="row row--between">
          <h2 className="h-sub">수원대학교 취업 현황</h2>
          <span className="badge badge--blue">기준 연도 {schoolStats.year}</span>
        </div>
        <p className="t-caption">수원대학교 전체 단위의 공식 자료만 보여 드려요.</p>
        <div className="metrics">
          {schoolStats.overall.map((o) => (
            <div key={o.label} className="metric" style={{ background: 'var(--surface-2)' }}>
              <b style={{ color: o.value ? 'var(--navy-900)' : 'var(--text-3)' }}>{o.value ?? '—'}</b>
              <span>{o.label}</span>
              {!o.value && <span className="badge badge--gray" style={{ marginTop: 4 }}>자료 준비 중</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="card stack-12">
        <div className="row row--between">
          <h2 className="h-sub">직무별 진출 현황</h2>
          <span className="badge badge--point">{schoolStats.year}년도</span>
        </div>
        <p className="t-caption">선배들이 어떤 직무로 진출했는지 한눈에 확인하세요.</p>
        <div className="stack-12">
          {schoolStats.byJob.map((r) => (
            <div key={r.label} className="stat-row">
              <span className="t-strong">{r.label}</span>
              <div className="meter"><div className="meter__fill" style={{ width: `${(r.value / max) * 100}%` }} /></div>
              <span className="t-caption" style={{ textAlign: 'right' }}>{r.value}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack-8">
        <h2 className="t-strong" style={{ fontSize: 14 }}>자료 기준 및 업데이트 안내</h2>
        {[
          ['집계 단위', '수원대학교 전체'],
          ['기준 연도', `${schoolStats.year}년도`],
          ['출처', schoolStats.source],
          ['업데이트', schoolStats.updateCycle],
        ].map(([k, v]) => (
          <div key={k} className="kv-row"><span>{k}</span><b style={{ color: 'var(--text-1)', fontSize: 13 }}>{v}</b></div>
        ))}
        <div className="notice"><Icon name="info" size={16} />학과별 취업률과 학과 간 비교는 제공하지 않아요. 공식 자료가 없는 항목은 ‘자료 준비 중’으로 표시돼요.</div>
      </section>
    </>
  );
}

/* DS-04/05 선배 카드: 현재 근무 기업·직무가 가장 먼저 */
function SeniorList({ onOpen }: { onOpen: (s: Senior) => void }) {
  const { data: seniors, status } = useLoad(loadSeniors);
  const [ind, setInd] = useState('전체');
  if (!seniors) return status;
  const industries = ['전체', ...new Set(seniors.map((s) => s.industry))];
  const list = ind === '전체' ? seniors : seniors.filter((s) => s.industry === ind);
  return (
    <div className="stack-8">
      <section className="card card--tint row">
        <div className="grow">
          <div className="t-strong" style={{ fontSize: 14 }}>취업지원처 공식 선배 멘토링</div>
          <div className="t-caption">현직 선배에게 직접 질문하고 1:1 조언을 받아요</div>
        </div>
        <a className="btn btn--primary btn--sm" href="#" onClick={(e) => e.preventDefault()}>
          Q&A 사이트 <Icon name="external" size={14} />
        </a>
      </section>
      <div className="chips">
        {industries.map((i) => (
          <button key={i} className={`chip ${ind === i ? 'is-active' : ''}`} onClick={() => setInd(i)}>{i}</button>
        ))}
      </div>
      {list.map((s) => <SeniorCard key={s.id} s={s} onOpen={() => onOpen(s)} />)}
    </div>
  );
}

function SeniorCard({ s, onOpen }: { s: Senior; onOpen: () => void }) {
  const hasLink = Boolean(s.links.github);
  return (
    <button className="card card--click stack-12" onClick={onOpen}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="avatar">{s.initial}</span>
        <div className="grow">
          <div className="row">
            <span className="senior__company">{s.company}</span>
            {s.verified && <span className="badge badge--success"><Icon name="check" size={10} stroke={3} />재직 확인</span>}
          </div>
          <div className="senior__role">{s.role} · {s.position}</div>
          <div className="t-caption">{s.dept} · {s.classOf}</div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          {s.links.github && <GitHubIcon size={18} />}
          {!hasLink && <span className="t-caption" style={{ fontSize: 10 }}>프로필 미등록</span>}
        </div>
      </div>
      <div className="row"><span className="badge badge--blue">{s.industry}</span></div>
      <div>
        <div className="t-caption" style={{ fontWeight: 700, marginBottom: 6 }}>입사 당시 스펙</div>
        <div className="spec-list">
          {s.specs.slice(0, 3).map((sp) => <span key={sp} className="tag">{sp}</span>)}
          {s.specs.length > 3 && <span className="tag" style={{ background: 'var(--surface)' }}>+{s.specs.length - 3}</span>}
        </div>
      </div>
    </button>
  );
}

/* DS-05/06 선배 상세 + 외부 프로필 */
function SeniorDetail({ summary, onBack, toast }: { summary: Senior; onBack: () => void; toast: Toast }) {
  const { data: detail } = useLoad(() => loadSenior(summary.id));
  const s = detail ?? summary;
  const [ask, setAsk] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { await askSenior(s.id, q.trim()); setAsk(false); setQ(''); toast('질문을 등록했어요'); }
    catch (e) { toast(e instanceof Error ? e.message : '질문을 등록하지 못했어요.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="screen">
      <SubHeader backLabel="탐색" onBack={onBack} title="선배 커리어 상세" right={<span style={{ width: 52 }} />} />

      <section className="card stack-12">
        <div className="row">
          <span className="avatar avatar--lg">{s.initial}</span>
          <div className="grow">
            <div className="senior__company" style={{ fontSize: 20 }}>{s.company}</div>
            <div className="senior__role">{s.role} · {s.position}</div>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="badge badge--blue">{s.industry}</span>
              {s.verified ? <span className="badge badge--success">취업지원처 재직 확인</span> : <span className="badge badge--gray">재직 확인 대기</span>}
            </div>
          </div>
        </div>
        <div className="t-caption">{s.name} 선배 · {s.dept} · {s.classOf}</div>

        {/* 외부 프로필(GitHub): 없으면 비활성(점선) 표시. LinkedIn은 표시하지 않음 */}
        <div className="stack-8">
          {s.links.github ? (
            <a className="ext-link" style={{ justifyContent: 'center' }} href={s.links.github} target="_blank" rel="noreferrer"><GitHubIcon />GitHub <Icon name="external" size={14} /></a>
          ) : (
            <span className="ext-link is-empty" style={{ justifyContent: 'center' }}><GitHubIcon />GitHub 미등록</span>
          )}
        </div>
      </section>

      <section className="card stack-12">
        <h2 className="h-sub">이 직무로 입사할 때 스펙</h2>
        <div className="spec-list">{s.specs.map((sp) => <span key={sp} className="tag">{sp}</span>)}</div>
      </section>

      <section className="card stack-12">
        <h2 className="h-sub">학년별 활동 타임라인</h2>
        <div className="timeline">
          {s.timeline.map((t, i) => (
            <div key={t.when} className={`timeline__item ${i === s.timeline.length - 1 ? 'is-now' : ''}`}>
              <div className="t-caption" style={{ fontWeight: 700 }}>{t.when}</div>
              <div className="t-strong" style={{ fontSize: 14, fontWeight: 600 }}>{t.what}</div>
            </div>
          ))}
        </div>
      </section>

      <button className="btn btn--primary btn--block" onClick={() => setAsk(true)}>
        <Icon name="message" size={18} /> 이 선배에게 질문 남기기
      </button>

      {ask && (
        <Sheet onClose={() => setAsk(false)}>
          <h2 className="h-title">{s.company} {s.role} 선배에게 질문</h2>
          <textarea className="input" placeholder="예) 3학년 때 인턴 지원은 어떻게 준비하셨나요?" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} />
          <p className="t-caption">질문은 취업지원처 선배 Q&A로 전달되고, 답변이 오면 알려드려요.</p>
          <button className="btn btn--primary btn--block" disabled={!q.trim() || busy} onClick={() => void submit()}>{busy ? '등록 중' : '질문 등록'}</button>
        </Sheet>
      )}
    </div>
  );
}
