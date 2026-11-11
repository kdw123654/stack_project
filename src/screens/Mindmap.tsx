import { demoMode } from '../services/http';
import { useState } from 'react';
import Icon from '../components/Icon';
import { Sheet } from '../components/Layout';
import {
  jobCompetencies, targetCompare, peerCompare, recommendActions, growthTimeline, STATUS_META, MIN_SAMPLE, JOB_SUGGESTIONS,
} from '../data/mock';
import type { Profile, TabId, Toast } from '../types';

interface MindmapProps {
  profile: Profile;
  setProfile: (p: Profile) => void;
  goTab: (tab: TabId) => void;
  toast: Toast;
}

/* ================= MP: 역량 마인드맵 ================= */
export default function Mindmap({ profile, setProfile, goTab, toast }: MindmapProps) {
  const [editTarget, setEditTarget] = useState(false);
  const owned = jobCompetencies.filter((c) => c.status !== 'gap').length;
  const compareReady = targetCompare.sampleSize >= MIN_SAMPLE && profile.targetCompany === targetCompare.company;

  return (
    <div className="screen">
      {!demoMode && <p className="notice notice--point" role="status">이 화면은 아직 샘플 데이터입니다. 서버 연동 전입니다.</p>}
      <div className="row row--between">
        <h1 className="h-title">역량 마인드맵</h1>
        <span className="badge badge--blue">{profile.grade} 맞춤</span>
      </div>

      {/* 목표 설정 (직무 + 기업) */}
      <section className="card card--navy stack-12">
        <div className="grid-2">
          <div className="kv">목표 직무<b>{profile.job}</b></div>
          <div className="kv">목표 기업<b>{profile.targetCompany || '아직 없어요'}</b></div>
        </div>
        <button className="btn btn--sm" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }} onClick={() => setEditTarget(true)}>
          <Icon name="target" size={16} /> 목표 변경하기
        </button>
      </section>

      {/* ① 직무 필요 역량 vs 내 경험 (MVP 핵심) */}
      <section className="card stack-12">
        <div className="row row--between">
          <h2 className="h-sub">직무 필요 역량 진단</h2>
          <span className="t-caption"><b style={{ color: 'var(--navy-900)' }}>{owned}</b> / {jobCompetencies.length} 확보</span>
        </div>
        <div className="meter"><div className="meter__fill" style={{ width: `${(owned / jobCompetencies.length) * 100}%` }} /></div>
        <div className="stack-8">
          {jobCompetencies.map((c) => (
            <div key={c.name} className="comp-row">
              <div className="grow">
                <div className="t-strong" style={{ fontSize: 14 }}>{c.name}</div>
                <div className="t-caption">근거: {c.evidence}</div>
              </div>
              <span className={`badge ${STATUS_META[c.status].cls}`}>{STATUS_META[c.status].label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ② 목표 기업 입사자 스펙 비교 (선배 등록 데이터 기반 · 참고용) */}
      <section className="card stack-12">
        <div className="row row--between">
          <h2 className="h-sub">{profile.targetCompany || '목표 기업'} 입사자와 비교</h2>
          <span className="badge badge--gray">참고용</span>
        </div>
        {!profile.targetCompany ? (
          <button className="btn btn--soft btn--block" onClick={() => setEditTarget(true)}>목표 기업 설정하고 비교하기</button>
        ) : compareReady ? (
          <>
            <p className="t-caption">재직 확인된 선배 {targetCompare.sampleSize}명의 입사 당시 스펙 기준이에요.</p>
            <div>
              {targetCompare.rows.map((r) => (
                <div key={r.label} className="compare-row">
                  <span className="t-strong" style={{ fontSize: 14 }}>{r.label}</span>
                  <span className={`badge ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</span>
                  <span className="t-caption">나 <b style={{ color: 'var(--text-1)' }}>{r.mine}</b> · 입사자 {r.ref}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="notice"><Icon name="info" size={16} />{profile.targetCompany} 입사 선배 데이터가 {MIN_SAMPLE}명 이상 모이면 비교 결과를 보여드려요.</div>
        )}
      </section>

      {/* ③ 유사 사용자 비교 (장기) — 데이터 누적 전에는 상대평가 미제공 */}
      <section className="card stack-12 locked">
        <h2 className="h-sub">같은 학년 사용자와 비교</h2>
        <div className="stack-8" aria-hidden="true">
          {peerCompare.criteria.slice(0, 3).map((c) => (
            <div key={c} className="comp-row"><span className="grow t-strong" style={{ fontSize: 14 }}>{c}</span><span className="badge badge--gray">—</span></div>
          ))}
        </div>
        {!peerCompare.enabled && (
          <div className="locked__veil">
            <span className="mode-card__ico"><Icon name="lock" /></span>
            <div className="t-strong">데이터를 모으는 중이에요</div>
            <p className="t-caption">
              같은 학년·전공 사용자가 충분히 쌓이면 자격증 수, 경험 수, 역량 태그를 기준으로 내 위치를 알려드려요.
            </p>
          </div>
        )}
      </section>

      {/* MP-04 추천 액션 */}
      <section className="stack-8">
        <h2 className="h-sub">지금 하면 좋은 활동</h2>
        {recommendActions.map((a) => (
          <div key={a.id} className="card row" style={{ padding: 14 }}>
            <span className="badge badge--point">{a.tag}</span>
            <div className="grow">
              <div className="t-strong" style={{ fontSize: 14 }}>{a.title}</div>
              <div className="t-caption">{a.desc}</div>
            </div>
            <button className="btn btn--primary btn--sm" onClick={() => goTab('explore')}>신청하기</button>
          </div>
        ))}
      </section>

      {/* MP-05 경험 축적 타임라인 */}
      <section className="card stack-12">
        <h2 className="h-sub">나의 경험 축적 타임라인</h2>
        <div className="timeline">
          {growthTimeline.map((t) => (
            <div key={t.when} className={`timeline__item ${t.now ? 'is-now' : ''}`}>
              <div className="t-caption" style={{ fontWeight: 700 }}>{t.when}</div>
              <div className="t-strong" style={{ fontSize: 14, fontWeight: 600 }}>{t.what}</div>
            </div>
          ))}
        </div>
      </section>

      {editTarget && (
        <TargetSheet
          profile={profile}
          onClose={() => setEditTarget(false)}
          onSave={(p) => {
            setProfile(p);
            setEditTarget(false);
            toast('목표를 바꿨어요');
          }}
        />
      )}
    </div>
  );
}

/** 희망 직무·목표 기업은 직접 입력 (드롭다운 아님) */
function TargetSheet({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (p: Profile) => void }) {
  const [job, setJob] = useState(profile.job);
  const [company, setCompany] = useState(profile.targetCompany);
  return (
    <Sheet onClose={onClose}>
      <h2 className="h-title">목표 설정</h2>
      <div>
        <label className="label" htmlFor="t-job">목표 직무</label>
        <input id="t-job" className="input" placeholder="예) IT 서비스 기획자" value={job} maxLength={30} onChange={(e) => setJob(e.target.value)} />
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          {JOB_SUGGESTIONS.map((j) => (
            <button key={j} type="button" className={`chip ${job === j ? 'is-active' : ''}`} onClick={() => setJob(j)}>{j}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="t-co">목표 기업 (선택)</label>
        <input id="t-co" className="input" placeholder="예) 네이버" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <button className="btn btn--primary btn--block" disabled={!job.trim()} onClick={() => onSave({ ...profile, job: job.trim(), targetCompany: company.trim() })}>저장</button>
    </Sheet>
  );
}
