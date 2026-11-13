import { useEffect, useState } from 'react';
import Icon, { GitHubIcon } from '../components/Icon';
import { SegmentTabs, SubHeader, Sheet } from '../components/Layout';
import { askSenior, loadClubs, loadMyJobs, loadNotices, loadPostingText, loadSchoolStats, loadSenior, loadSeniors } from '../services/explore';
import { clubCategoriesFor, collegeOf, industriesFor, seniorFieldsFor } from '../data/relevance';
import type { Club, Notice, Profile, Senior, StatGroup, TabId, Toast } from '../types';
import { useHideHeader } from '../components/HeaderContext';
import { setPendingPosting } from '../services/pendingPosting';

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

function SearchBar({ value, onChange, placeholder, sort, sorts, onSort }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  sort?: string; sorts?: string[]; onSort?: (v: string) => void;
}) {
  return (
    <div className="filter-bar">
      <label className="search">
        <Icon name="search" size={16} />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        {value && <button className="text-btn" onClick={() => onChange('')} aria-label="검색어 지우기">✕</button>}
      </label>
      {sorts && onSort && (
        <select className="select" value={sort} onChange={(e) => onSort(e.target.value)} aria-label="정렬">
          {sorts.map((s) => <option key={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}

const has = (q: string, ...texts: (string | undefined | null)[]) =>
  !q.trim() || texts.some((t) => (t ?? '').toLowerCase().includes(q.trim().toLowerCase()));
const byDeadline = (a: number | null, b: number | null) => (a ?? 9999) - (b ?? 9999);

// 희망 직무 → 14개 직무 분류 (서버 계산). 실패해도 화면은 그대로 써요.
function useMyJobs() {
  const [jobs, setJobs] = useState<string[]>([]);
  useEffect(() => { loadMyJobs().then(setJobs).catch(() => setJobs([])); }, []);
  return jobs;
}

function MineToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row row--between">
      <span className="t-caption">{label}</span>
      <button className={`toggle ${on ? 'is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><span /></button>
    </div>
  );
}

function DdayBadge({ dday }: { dday: number | null }) {
  if (dday === null) return null;
  return <span className={`badge ${dday <= 7 ? 'badge--point' : 'badge--gray'}`}>{dday === 0 ? '오늘 마감' : `D-${dday} 마감`}</span>;
}

/* ================= DS: 탐색 ================= */
interface ExploreProps {
  profile: Profile;
  goTab: (tab: TabId) => void;
  toast: Toast;
}

export default function Explore({ profile, goTab, toast }: ExploreProps) {
  const [tab, setTab] = useState<ExploreTab>('notice');
  const [senior, setSenior] = useState<Senior | null>(null);
  const myJobs = useMyJobs();
  useHideHeader(Boolean(senior));

  if (senior) return <SeniorDetail summary={senior} onBack={() => setSenior(null)} toast={toast} />;

  return (
    <div className="screen">
      <div className="row row--between">
        <h1 className="h-title">교내외 탐색</h1>
        <span className="badge badge--blue">{tab === 'stats' ? '수원대학교 전체' : tab === 'club' ? '수도권 대학생' : `${profile.department} 기준`}</span>
      </div>
      <SegmentTabs items={TABS} value={tab} onChange={setTab} />
      {tab === 'notice' && <NoticeList goTab={goTab} />}
      {tab === 'club' && <ClubList myJobs={myJobs} />}
      {tab === 'stats' && <SchoolStatsView profile={profile} myJobs={myJobs} />}
      {tab === 'senior' && <SeniorList profile={profile} myJobs={myJobs} onOpen={setSenior} />}
    </div>
  );
}

/* DS-01/02 */
function NoticeList({ goTab }: { goTab: (tab: TabId) => void }) {
  // 공고 내용을 받아 두고 나의 경험(자소서·포폴)으로 이동 — 실패해도 이동은 해요
  const toDocs = async (n: Notice) => {
    try { setPendingPosting({ title: n.title, text: await loadPostingText(n.id), url: n.url }); } catch { /* 직접 붙여넣기 */ }
    goTab('experience');
  };
  const { data, status } = useLoad(loadNotices);
  const [kind, setKind] = useState('전체');
  const [scope, setScope] = useState('전체');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('마감 임박순');
  const [onlyMine, setOnlyMine] = useState(false);
  const [soon, setSoon] = useState(false);
  if (!data) return status;
  const inScope = data.items.filter((n) => scope === '전체' || n.scope === scope);
  const kinds = ['전체', ...KIND_ORDER.filter((k) => inScope.some((n) => kindOf(n) === k))];
  const list = inScope
    .filter((n) => (kind === '전체' || kindOf(n) === kind) && (!onlyMine || n.jobFit)
      && (!soon || (n.dday !== null && n.dday <= 7)) && has(q, n.title, n.desc))
    .sort(sort === '최신 등록순' ? (a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '') : (a, b) => byDeadline(a.dday, b.dday));
  return (
    <div className="stack-8">
      <SegmentTabs items={NOTICE_SCOPES} value={scope} onChange={(v) => { setScope(v); setKind('전체'); }} />
      <SearchBar value={q} onChange={setQ} placeholder="공고 이름·기관 검색" sort={sort} sorts={['마감 임박순', '최신 등록순']} onSort={setSort} />
      <Chips items={kinds} value={kind} onChange={setKind} />
      <div className="row row--between">
        <span className="t-caption">7일 안에 마감되는 공고만</span>
        <button className={`toggle ${soon ? 'is-on' : ''}`} role="switch" aria-checked={soon} aria-label="7일 안에 마감되는 공고만 보기" onClick={() => setSoon(!soon)}><span /></button>
      </div>
      {data.myJobs.length > 0 ? (
        <div className="row row--between">
          <span className="t-caption">내 직무({data.myJobs.join(', ')}) 관련 공고만 보기</span>
          <button className={`toggle ${onlyMine ? 'is-on' : ''}`} role="switch" aria-checked={onlyMine} aria-label="내 직무 관련 공고만 보기" onClick={() => setOnlyMine(!onlyMine)}><span /></button>
        </div>
      ) : (
        <p className="t-caption">희망 직무를 입력하면 내 직무 관련 공고만 골라 볼 수 있어요.</p>
      )}
      <p className="result-count">공고 {list.length}개 · {sort}</p>
      {list.length === 0 && <p className="t-caption">조건에 맞는 공고가 없어요.</p>}
      {list.map((n) => (
        <article key={n.id} className="card stack-8">
          <div className="row row--between">
            <div className="row">
              <span className="badge badge--blue">{n.type}</span>
              {n.jobFit && <span className="badge badge--success">내 직무 관련</span>}
            </div>
            <DdayBadge dday={n.dday} />
          </div>
          <div className="t-strong" style={{ fontSize: 15 }}>{n.title}</div>
          <div className="t-caption">{n.desc}</div>
          {n.url && /^https?:\/\//i.test(n.url) && <a className="link" href={n.url} target="_blank" rel="noreferrer">원문 보기 <Icon name="external" size={12} /></a>}
          <button className="btn btn--soft btn--sm btn--block" onClick={() => void toDocs(n)}>
            이 공고로 맞춤 서류 만들기 <Icon name="chevronR" size={14} />
          </button>
        </article>
      ))}
    </div>
  );
}

const KIND_GROUP: Record<string, string> = {
  채용: '채용·인턴', '인턴·현장실습': '채용·인턴', 인턴십: '채용·인턴', 현장실습: '채용·인턴',
  '특강·교육': '교육·특강', 특강: '교육·특강', 교육: '교육·특강', 부트캠프: '교육·특강', '박람회·설명회': '교육·특강',
  멘토링: '비교과', 클리닉: '비교과',
  공모전: '공모전', 대외활동: '대외활동', 비교과: '비교과', 창업: '창업',
};
const kindOf = (n: Notice) => KIND_GROUP[n.tags[0] ?? ''] ?? '기타';
const KIND_ORDER = ['채용·인턴', '공모전', '대외활동', '교육·특강', '비교과', '창업', '기타'];
const NOTICE_SCOPES = [
  { id: '전체', label: '전체' },
  { id: '교내', label: '교내' },
  { id: '교외', label: '교외' },
];

const SCOPES = [
  { id: '전체', label: '전체' },
  { id: '연합', label: '연합동아리' },
  { id: '교내', label: '교내동아리' },
];

function ClubList({ myJobs }: { myJobs: string[] }) {
  const fit = clubCategoriesFor(myJobs);
  const [mine, setMine] = useState(false);
  const { data: clubs, status } = useLoad(loadClubs);
  const [scope, setScope] = useState('전체');
  const [category, setCategory] = useState('전체');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('마감 임박순');
  const [recruiting, setRecruiting] = useState(false);
  if (!clubs) return status;
  const inScope = clubs.filter((c) => scope === '전체' || c.scope === scope);
  const counts = inScope.reduce<Record<string, number>>((m, c) => ({ ...m, [c.category]: (m[c.category] ?? 0) + 1 }), {});
  const categories = ['전체', ...Object.keys(counts).sort((a, b) => counts[b] - counts[a])];
  const list = inScope
    .filter((c) => (category === '전체' || c.category === category) && (!recruiting || c.dday !== null) && (!mine || fit.has(c.category)) && has(q, c.name, c.title))
    .sort(sort === '이름순' ? (a, b) => a.name.localeCompare(b.name, 'ko') : (a, b) => byDeadline(a.dday, b.dday));
  return (
    <div className="stack-8">
      <SegmentTabs items={SCOPES} value={scope} onChange={(v) => { setScope(v); setCategory('전체'); }} />
      <SearchBar value={q} onChange={setQ} placeholder="동아리 이름·활동 검색" sort={sort} sorts={['마감 임박순', '이름순']} onSort={setSort} />
      <Chips items={categories} value={category} onChange={setCategory} />
      <div className="row row--between">
        <span className="t-caption">모집 기간이 정해진 동아리만 (상시 모집 제외)</span>
        <button className={`toggle ${recruiting ? 'is-on' : ''}`} role="switch" aria-checked={recruiting} aria-label="모집 기간이 정해진 동아리만 보기" onClick={() => setRecruiting(!recruiting)}><span /></button>
      </div>
      {fit.size > 0 ? (
        <MineToggle label={`내 직무(${myJobs.join(', ')})에 도움 되는 동아리만 · ${[...fit].join(', ')}`} on={mine} onChange={setMine} />
      ) : (
        <p className="t-caption">희망 직무를 입력하면 내 직무에 도움 되는 동아리를 골라 볼 수 있어요.</p>
      )}
      <p className="result-count">동아리 {list.length}개 · {sort}</p>
      {list.length === 0 && <p className="t-caption">조건에 맞는 동아리가 없어요.</p>}
      {list.map((c) => <ClubCard key={c.id} c={c} fit={fit.has(c.category)} />)}
    </div>
  );
}

// 공식 링크가 있으면 그곳, 없으면(캠퍼스픽 화면에서 본 연합동아리) 이름으로 검색한 결과로 보내요.
const clubLink = (c: Club) =>
  c.url && /^https?:\/\//i.test(c.url)
    ? c.url
    : `https://www.google.com/search?q=${encodeURIComponent(`${c.name} ${c.scope}동아리 모집`)}`;

function ClubCard({ c, fit }: { c: Club; fit: boolean }) {
  return (
    <article className="card stack-8">
      <div className="row row--between">
        <div className="row">
          <span className="badge badge--blue">{c.scope} · {c.category}</span>
          {fit && <span className="badge badge--success">내 직무 관련</span>}
        </div>
        <DdayBadge dday={c.dday} />
      </div>
      <div className="t-strong" style={{ fontSize: 15 }}>{c.name}</div>
      <div className="t-caption">{c.title}</div>
      <a className="link" href={clubLink(c)} target="_blank" rel="noreferrer">자세히 보기 <Icon name="external" size={12} /></a>
    </article>
  );
}

/* DS-03 학교 취업 통계: 수원대학교 전체 단위 공식 자료만. 학과별 통계·비교는 제공하지 않음 */
/* 공시 통계 상세: 산업·기업 유형·급여·단과대학 중 골라서 전체 항목을 막대로 */
function StatDetail({ groups, year, mine }: { groups: StatGroup[]; year: string; mine: Record<string, string> }) {
  const [id, setId] = useState(groups[0].id);
  const [showAll, setShowAll] = useState(false);
  const g = groups.find((x) => x.id === id) ?? groups[0];
  const max = Math.max(1, ...g.rows.map((r) => r.value));
  const top = [...g.rows].sort((a, b) => b.value - a.value)[0];
  // 접혀 있어도 '내 단과대·내 직무' 항목은 항상 보여요
  const rows = showAll ? g.rows : g.rows.filter((r, i) => i < 6 || mine[r.label]);
  return (
    <section className="card stack-12">
      <div className="row row--between">
        <h2 className="h-sub">상세 취업 현황</h2>
        <span className="badge badge--point">{year}년도</span>
      </div>
      <Chips items={groups.map((x) => x.title)} value={g.title} onChange={(t) => { setId(groups.find((x) => x.title === t)!.id); setShowAll(false); }} />
      <p className="t-caption">{g.desc} · 가장 많은 항목은 <b className="t-strong">{top.label} {top.value}{g.unit}</b></p>
      <div className="stack-12">
        {rows.map((r) => (
          <div key={r.label} className={`stat-row ${mine[r.label] ? 'is-mine' : ''}`}>
            <span className="t-strong">{r.label}{mine[r.label] && <span className="badge badge--success" style={{ marginLeft: 6 }}>{mine[r.label]}</span>}</span>
            <div className="meter"><div className="meter__fill" style={{ width: `${(r.value / max) * 100}%` }} /></div>
            <span className="t-caption" style={{ textAlign: 'right' }}>{r.value}{g.unit}</span>
          </div>
        ))}
      </div>
      {g.rows.length > 6 && (
        <button className="btn btn--ghost btn--sm btn--block" onClick={() => setShowAll(!showAll)}>
          {showAll ? '접기' : `전체 ${g.rows.length}개 항목 보기`}
        </button>
      )}
      {g.source && <p className="t-caption" style={{ fontSize: 11 }}>출처: {g.source}</p>}
    </section>
  );
}

function SchoolStatsView({ profile, myJobs }: { profile: Profile; myJobs: string[] }) {
  const { data: schoolStats, status } = useLoad(loadSchoolStats);
  if (!schoolStats) return status;
  const college = collegeOf(profile.department);
  const industries = industriesFor(myJobs);
  const rowsOf = (id: string) => schoolStats.groups?.find((g) => g.id === id)?.rows ?? [];
  const myCollege = rowsOf('college').find((r) => r.label === college);
  const industryRows = rowsOf('industry');
  const myIndustries = industryRows.filter((r) => industries.has(r.label));
  const schoolRate = schoolStats.trend[schoolStats.trend.length - 1]?.value;
  const mine: Record<string, string> = {
    ...(college ? { [college]: '내 단과대' } : {}),
    ...Object.fromEntries(myIndustries.map((r) => [r.label, '내 직무'])),
  };
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

      {(myCollege || myIndustries.length > 0) && (
        <section className="card card--tint stack-12">
          <div className="row row--between">
            <h2 className="h-sub">나와 관련된 통계</h2>
            <span className="badge badge--blue">{profile.department}</span>
          </div>
          {myCollege && (
            <div className="kv-row">
              <span>{college} 취업률</span>
              <b style={{ color: 'var(--text-1)' }}>
                {myCollege.value}%{schoolRate !== undefined && <span className="t-caption"> (학교 전체 {schoolRate}%, {myCollege.value >= schoolRate ? '+' : ''}{(myCollege.value - schoolRate).toFixed(1)}%p)</span>}
              </b>
            </div>
          )}
          {myIndustries.map((r) => (
            <div key={r.label} className="kv-row">
              <span>내 직무 관련 산업 · {r.label}</span>
              <b style={{ color: 'var(--text-1)' }}>{r.value}% <span className="t-caption">({industryRows.indexOf(r) + 1}위 / {industryRows.length}개 산업)</span></b>
            </div>
          ))}
          <p className="t-caption" style={{ fontSize: 11 }}>학과 단위가 아닌 단과대학·학교 전체 공시 자료 기준이에요.</p>
        </section>
      )}

      {schoolStats.trend.length > 1 && (
        <section className="card stack-12">
          <div className="row row--between">
            <h2 className="h-sub">연도별 취업률</h2>
            <span className="badge badge--blue">{schoolStats.trend[0].year}~{schoolStats.trend[schoolStats.trend.length - 1].year}</span>
          </div>
          <p className="t-caption">최근 {schoolStats.trend.length}개년 공시 취업률이에요.</p>
          <div className="trend">
            {schoolStats.trend.map((t, i) => (
              <div key={t.year} className={`trend__col ${i === schoolStats.trend.length - 1 ? 'is-latest' : ''}`}>
                <b>{t.value}%</b>
                <div className="trend__bar" style={{ height: `${t.value}%` }} />
                <span>{t.year}</span>
              </div>
            ))}
          </div>
          <p className="t-caption" style={{ fontSize: 11 }}>{schoolStats.trend.map((t) => `${t.year}: ${t.source ?? '공시'}`).join(' · ')}</p>
        </section>
      )}

      {schoolStats.groups && schoolStats.groups.length > 0 ? (
        <StatDetail groups={schoolStats.groups} year={schoolStats.year} mine={mine} />
      ) : (
        <section className="card stack-12">
          <div className="row row--between">
            <h2 className="h-sub">직무별 진출 현황</h2>
            <span className="badge badge--point">{schoolStats.year}년도</span>
          </div>
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
      )}

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
const SENIOR_SCOPES = [
  { id: '전체', label: '전체' },
  { id: '학과', label: '내 학과' },
  { id: '단과대', label: '내 단과대' },
  { id: '직무', label: '내 직무' },
];

function SeniorList({ profile, myJobs, onOpen }: { profile: Profile; myJobs: string[]; onOpen: (s: Senior) => void }) {
  const { data: seniors, status } = useLoad(loadSeniors);
  const [mine, setMine] = useState('전체');
  const fields = seniorFieldsFor(myJobs);
  const college = collegeOf(profile.department);
  const tagOf = (s: Senior) =>
    s.dept === profile.department ? '같은 학과'
      : college && collegeOf(s.dept) === college ? '같은 단과대'
        : fields.has(s.industry) ? '내 직무 관련' : '';
  const [ind, setInd] = useState('전체');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('최근 졸업순');
  if (!seniors) return status;
  const industries = ['전체', ...new Set(seniors.map((s) => s.industry))];
  const years = (s: Senior) => parseInt(s.position.replace(/\D/g, '')) || 0;
  const list = seniors
    .filter((s) => (ind === '전체' || s.industry === ind) && has(q, s.company, s.role, s.dept, ...s.specs)
      && (mine === '전체'
        || (mine === '학과' && s.dept === profile.department)
        || (mine === '단과대' && college !== null && collegeOf(s.dept) === college)
        || (mine === '직무' && fields.has(s.industry))))
    .sort(sort === '경력 많은 순' ? (a, b) => years(b) - years(a) : (a, b) => b.classOf.localeCompare(a.classOf));
  return (
    <div className="stack-8">
      <section className="card card--tint row">
        <div className="grow">
          <div className="t-strong" style={{ fontSize: 14 }}>취업지원처 공식 선배 멘토링</div>
          <div className="t-caption">현직 선배에게 직접 질문하고 1:1 조언을 받아요</div>
        </div>
        <a className="btn btn--primary btn--sm" href="https://career.suwon.ac.kr" target="_blank" rel="noreferrer">
          Q&A 사이트 <Icon name="external" size={14} />
        </a>
      </section>
      <SegmentTabs items={SENIOR_SCOPES} value={mine} onChange={setMine} />
      {mine === '직무' && fields.size === 0 && <p className="t-caption">희망 직무를 입력하면 내 직무 선배를 골라 볼 수 있어요.</p>}
      <SearchBar value={q} onChange={setQ} placeholder="회사·직무·학과·스펙 검색" sort={sort} sorts={['최근 졸업순', '경력 많은 순']} onSort={setSort} />
      <Chips items={industries} value={ind} onChange={setInd} />
      <p className="result-count">선배 {list.length}명 · {sort}{mine === '단과대' && college ? ` · ${college}` : ''}</p>
      {list.length === 0 && <p className="t-caption">조건에 맞는 선배가 없어요.</p>}
      {list.map((s) => <SeniorCard key={s.id} s={s} tag={tagOf(s)} onOpen={() => onOpen(s)} />)}
    </div>
  );
}

function SeniorCard({ s, tag, onOpen }: { s: Senior; tag: string; onOpen: () => void }) {
  const hasLink = Boolean(s.links.github);
  return (
    <button className="card card--click stack-12" onClick={onOpen}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="avatar">{s.initial}</span>
        <div className="grow">
          <div className="row">
            <span className="senior__company">{s.company}</span>
            {tag && <span className="badge badge--success">{tag}</span>}
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
