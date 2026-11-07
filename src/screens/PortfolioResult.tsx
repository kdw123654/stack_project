import { useState } from 'react';
import Icon from '../components/Icon';
import { EditableField } from '../components/Layout';
import { MiniArt } from '../components/Flow';
import type { PortfolioResult as PortfolioResultData, UploadItem, Metric as MetricData } from '../types';

type Role = PortfolioResultData['role'];
type ProcessItem = PortfolioResultData['process'][number];

interface PortfolioResultProps {
  result: PortfolioResultData;
  setResult: (r: PortfolioResultData) => void;
  files: UploadItem[];
  onSave: () => void;
}

/**
 * HM-05 포트폴리오 모드 결과 — 시각화 이미지 중심
 * Figma: "v2 / 홈 — 결과 확인 (포트폴리오 모드)"
 * 대표 이미지 · 추출 이미지 → 개요 → 문제 → 역할·기여도 → 수행 과정 → 핵심 성과 → 관련 역량 → 첨부 파일
 */
export default function PortfolioResult({ result, setResult, files, onSave }: PortfolioResultProps) {
  const set = (patch: Partial<PortfolioResultData>) => setResult({ ...result, ...patch });
  const cover = result.images.find((i) => i.id === result.coverId) || result.images[0];
  const updateSection = (key: string, value: string) =>
    set({ sections: result.sections.map((s) => (s.key === key ? { ...s, value, needsCheck: false } : s)) });

  return (
    <>
      {/* 대표 이미지 + 추출 이미지 */}
      <section className="card stack-12">
        <div className={`cover cover--${cover.kind}`}>
          <div className="cover__text">
            <span className="cover__tag">SNS 콘텐츠 운영</span>
            <strong>{result.summary}</strong>
            <small>{result.period} · 팀 5명</small>
          </div>
          <div className="cover__art"><MiniArt kind={cover.kind} w={108} h={108} /></div>
          <span className="cover__badge"><Icon name="image" size={12} />대표 이미지 · PPT {cover.page}p에서 추출</span>
        </div>
        <div className="stack-8" style={{ gap: 6 }}>
          <div className="row row--between">
            <span className="field__label">PPT에서 추출한 이미지 {result.images.length}</span>
            <span className="t-caption">눌러서 대표 이미지로</span>
          </div>
          <div className="thumbs">
            {result.images.map((img) => (
              <MiniArt key={img.id} kind={img.kind} w="100%" h={50} selected={img.id === result.coverId} onClick={() => set({ coverId: img.id })} />
            ))}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="badge badge--blue">{result.category}</span>
          <span className="badge badge--gray">{result.period}</span>
        </div>
        <h2 className="h-sub" style={{ fontSize: 17 }}>{result.summary}</h2>
      </section>

      <section className="card stack-12" style={{ gap: 16 }}>
        {result.sections.map((s) => (
          <EditableField key={s.key} label={s.label} value={s.value} needsCheck={s.needsCheck} long={s.long} onChange={(v) => updateSection(s.key, v)} />
        ))}

        {/* 본인 역할 및 기여도 */}
        <RoleBlock role={result.role} onChange={(role) => set({ role })} />

        {/* 수행 과정 */}
        <div className="field">
          <div className="field__label">수행 과정</div>
          <ol className="process">
            {result.process.map((p, i) => (
              <ProcessStep
                key={i}
                no={i + 1}
                step={p}
                onChange={(next) => set({ process: result.process.map((x, j) => (j === i ? next : x)) })}
              />
            ))}
          </ol>
        </div>

        {/* 핵심 성과 */}
        <div className="field">
          <div className="field__label">
            핵심 성과
            {result.metrics.some((m) => m.needsCheck) && <span className="badge badge--point">확인 필요</span>}
          </div>
          <div className="metrics">
            {result.metrics.map((m, i) => (
              <Metric key={m.label} m={m} onChange={(value) => set({ metrics: result.metrics.map((x, j) => (j === i ? { ...x, value, needsCheck: false } : x)) })} />
            ))}
          </div>
          {result.metrics.filter((m) => m.needsCheck && m.note).map((m) => (
            <span key={m.label} className="t-caption" style={{ fontSize: 11 }}>{m.note}</span>
          ))}
        </div>

        <div className="field">
          <div className="field__label">관련 역량</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {result.skills.map((t) => <span key={t} className="tag">#{t}</span>)}
            <button className="tag" style={{ background: 'var(--surface)', borderStyle: 'dashed' }} onClick={() => set({ skills: [...result.skills, '새 태그'] })}>+ 추가</button>
          </div>
        </div>

        <div className="field">
          <div className="field__label">첨부 파일</div>
          <div className="file-row" style={{ padding: 10 }}>
            <span className="file-ico file-ico--ppt">PPT</span>
            <span className="t-strong" style={{ fontSize: 13 }}>{files[0]?.name || result.source.name} · {result.source.pages}장</span>
          </div>
        </div>
      </section>

      <div className="stack-8" style={{ alignItems: 'center' }}>
        <button className="btn btn--primary btn--block" onClick={onSave}><Icon name="save" size={18} />마스터 DB에 저장</button>
        <span className="t-caption" style={{ fontSize: 11 }}>저장하면 나의 경험 보관함에 포트폴리오용 카드로 추가돼요</span>
      </div>
    </>
  );
}

function Donut({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`기여도 ${value}%`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--blue-100)" strokeWidth="10" />
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--blue-600)" strokeWidth="10" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      <text x="38" y="43" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--navy-900)">{value}%</text>
    </svg>
  );
}

function RoleBlock({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="field">
      <div className="field__label">
        본인 역할 및 기여도
        <button className="field__edit" style={{ position: 'static' }} onClick={() => setEditing(!editing)} aria-label="역할 수정">
          <Icon name={editing ? 'check' : 'edit'} size={16} />
        </button>
      </div>
      <div className="role">
        <Donut value={role.contribution} />
        <div className="grow stack-8" style={{ gap: 4 }}>
          {editing ? (
            <>
              <input className="input" style={{ height: 36 }} value={role.title} onChange={(e) => onChange({ ...role, title: e.target.value })} />
              <label className="row t-caption" style={{ gap: 6 }}>
                기여도
                <input type="range" min="0" max="100" step="5" value={role.contribution} onChange={(e) => onChange({ ...role, contribution: Number(e.target.value) })} />
              </label>
            </>
          ) : (
            <>
              <span className="t-strong" style={{ fontSize: 14 }}>{role.title}</span>
              <span className="t-caption" style={{ color: 'var(--text-2)' }}>{role.team}</span>
            </>
          )}
          <div className="row wrap" style={{ gap: 4 }}>{role.duties.map((d) => <span key={d} className="badge badge--gray">{d}</span>)}</div>
        </div>
      </div>
      <span className="t-caption" style={{ fontSize: 11 }}>기여도는 AI가 파일 속 역할 표기를 보고 추정한 값이에요. 연필을 눌러 바꿀 수 있어요.</span>
    </div>
  );
}

function ProcessStep({ no, step, onChange }: { no: number; step: ProcessItem; onChange: (p: ProcessItem) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="process__item">
      <b className="process__no">{no}</b>
      <div className="grow">
        {editing ? (
          <>
            <input className="input" style={{ height: 34, marginBottom: 4 }} value={step.title} onChange={(e) => onChange({ ...step, title: e.target.value })} />
            <input className="input" style={{ height: 34 }} value={step.desc} onChange={(e) => onChange({ ...step, desc: e.target.value })} />
          </>
        ) : (
          <>
            <div className="t-strong" style={{ fontSize: 14 }}>{step.title}</div>
            <div className="t-caption">{step.desc}</div>
          </>
        )}
      </div>
      <button className="field__edit" style={{ position: 'static' }} onClick={() => setEditing(!editing)} aria-label={`${no}단계 수정`}>
        <Icon name={editing ? 'check' : 'edit'} size={14} />
      </button>
    </li>
  );
}

function Metric({ m, onChange }: { m: MetricData; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <button className={`metric ${m.needsCheck ? 'is-check' : ''}`} onClick={() => !editing && setEditing(true)}>
      {editing ? (
        <input autoFocus className="metric__input" value={m.value} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} />
      ) : (
        <b>{m.value}</b>
      )}
      <span>{m.label}{m.needsCheck ? ' · 확인 필요' : ''}</span>
    </button>
  );
}
