// 자소서 · 포폴 슬라이드 흐름에서 함께 쓰는 컴포넌트
// Figma: FlowStepper 컴포넌트, '공고 분석 결과' 카드, thumb/* 미니 일러스트
import { useState, type ReactNode } from 'react';
import Icon from './Icon';
import { SegmentTabs } from './Layout';
import type { MiniKind, Posting, PostingInput as PostingInputValue, SlideOptions } from '../types';

/** 상단: ← 뒤로 / 제목 / (오른쪽 액션) */
interface FlowHeaderProps {
  backLabel: string;
  onBack: () => void;
  title: string;
  right?: ReactNode;
}

export function FlowHeader({ backLabel, onBack, title, right }: FlowHeaderProps) {
  return (
    <div className="subheader">
      <button className="back-btn" onClick={onBack}>
        <Icon name="chevronL" size={18} />
        {backLabel}
      </button>
      <span className="subheader__title">{title}</span>
      <div className="row" style={{ minWidth: 72, justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
}

/** 4단계 진행 표시 (current: 1~4) */
export function Stepper({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label={`${labels.length}단계 중 ${current}단계`}>
      {labels.map((l, i) => {
        const n = i + 1;
        const st = n < current ? 'is-done' : n === current ? 'is-now' : '';
        return (
          <li key={l} className={`stepper__item ${st}`} aria-current={n === current ? 'step' : undefined}>
            <span className="stepper__bar" />
            <span className="stepper__label">
              <b>{n}</b> {l}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function TitleBlock({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="stack-8" style={{ gap: 4 }}>
      <h1 className="h-display" style={{ fontSize: 20 }}>{title}</h1>
      {desc && <p className="t-body" style={{ fontSize: 13 }}>{desc}</p>}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`checkbox ${checked ? 'is-on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      {checked && <Icon name="check" size={14} stroke={3} />}
    </button>
  );
}

/** 미니 일러스트 썸네일 (실제 연결 시 이미지 url로 교체) */
interface MiniArtProps {
  kind?: MiniKind;
  w?: number | string;
  h?: number | string;
  selected?: boolean;
  onClick?: () => void;
}

export function MiniArt({ kind = 'text', w = 64, h = 64, selected, onClick }: MiniArtProps) {
  const cls = `mini mini--${kind} ${selected ? 'is-selected' : ''}`;
  const style = { width: w, height: h };
  const inner = (
      <span className="mini__in">
        {kind === 'grid' && Array.from({ length: 6 }).map((_, i) => <i key={i} />)}
        {kind === 'bars' && [45, 65, 55, 90].map((v, i) => <i key={i} style={{ height: `${v}%` }} />)}
        {kind === 'text' && <><i /><i /><i /><i /></>}
        {kind === 'phone' && <i />}
        {kind === 'cover' && <><i /><i /></>}
        {kind === 'end' && <><i /><i /></>}
      </span>
  );
  return onClick ? (
    <button type="button" className={cls} style={style} onClick={onClick} aria-pressed={selected}>
      {inner}
    </button>
  ) : (
    <span className={cls} style={style} aria-hidden="true">
      {inner}
    </span>
  );
}

/**
 * ① 공고 입력 + AI 분석 결과 카드 (자소서·포폴 공통)
 * kind='cover' → 자소서 문항 목록 / kind='slides' → 분량·형식 옵션
 */
interface PostingInputBase {
  posting: Posting | null;
  loading: boolean;
  error: string;
  onParse: (input: PostingInputValue) => void;
}
type PostingInputProps =
  | (PostingInputBase & { kind: 'cover'; onAddQuestion: () => void })
  | (PostingInputBase & { kind: 'slides'; options: SlideOptions; setOptions: (o: SlideOptions) => void });

const SIZE_LABEL: Record<SlideOptions['size'], string> = { 6: '간단', 10: '기본', 14: '상세' };

export function PostingInput(props: PostingInputProps) {
  const { kind, posting, loading, error, onParse } = props;
  const [tab, setTab] = useState<'link' | 'text'>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');

  return (
    <>
      <SegmentTabs
        items={[{ id: 'link', label: '링크로 입력' }, { id: 'text', label: '텍스트 붙여넣기' }]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'link' ? (
        <div className="input-icon">
          <Icon name="link" size={18} />
          <input
            className="input"
            inputMode="url"
            placeholder="채용공고 링크 붙여넣기"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && url.trim() && onParse({ url })}
          />
        </div>
      ) : (
        <textarea
          className="input"
          placeholder="공고 내용을 그대로 붙여넣어 주세요 (자격 요건·우대 사항·자소서 문항 포함)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {!posting && (
        <button className="btn btn--soft btn--block" disabled={loading || !(url.trim() || text.trim())} onClick={() => onParse({ url, text })}>
          {loading ? <><Icon name="loader" className="spin" size={16} /> 공고 읽는 중</> : <><Icon name="sparkle" size={16} /> 공고 분석하기</>}
        </button>
      )}
      {error && <div className="notice notice--point"><Icon name="info" size={16} />{error}</div>}

      {posting && (
        <section className="card stack-12">
          <div className="row row--between">
            <h2 className="t-strong" style={{ fontSize: 14 }}>공고 분석 결과</h2>
            <span className="badge badge--success">AI 읽기 완료</span>
          </div>
          <div className="kv-row"><span>기업·직무</span><b>{posting.company} · {posting.job}</b></div>
          <div className="kv-row">
            <span>요구 역량</span>
            <div className="row wrap" style={{ gap: 6 }}>{posting.skills.map((s) => <span key={s} className="tag">{s}</span>)}</div>
          </div>
          {kind === 'cover' ? (
            <div className="stack-8">
              <div className="row row--between">
                <span className="t-caption" style={{ fontWeight: 700, color: 'var(--text-2)' }}>자소서 문항 {posting.questions.length}개를 찾았어요</span>
                {props.kind === 'cover' && <button className="link" onClick={props.onAddQuestion}>+ 문항 추가</button>}
              </div>
              {posting.questions.map((q) => (
                <div key={q.id} className="q-row">
                  <b>문항 {q.no}</b>
                  <span className="grow">{q.title}</span>
                  <span className="t-caption">{q.limit}자</span>
                </div>
              ))}
            </div>
          ) : props.kind === 'slides' ? (
            <div className="stack-8">
              <span className="t-caption" style={{ fontWeight: 700, color: 'var(--text-2)' }}>포트폴리오 분량</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {([6, 10, 14] as const).map((n) => (
                  <button key={n} className={`chip ${props.options.size === n ? 'is-active' : ''}`} onClick={() => props.setOptions({ ...props.options, size: n })}>
                    {SIZE_LABEL[n]} {n}장
                  </button>
                ))}
              </div>
              <span className="t-caption" style={{ fontWeight: 700, color: 'var(--text-2)' }}>내보내기 형식</span>
              <div className="row" style={{ gap: 6 }}>
                {(['PDF', 'PPT'] as const).map((f) => (
                  <button key={f} className={`chip ${props.options.format === f ? 'is-active' : ''}`} onClick={() => props.setOptions({ ...props.options, format: f })}>{f}</button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}

/** 진행 단계 카드 (분석 중 / 생성 중 공통) */
export function ProgressCard({ title, caption, steps, step }: { title: string; caption: string; steps: string[]; step: number }) {
  return (
    <div className="card stack-12" style={{ padding: 24 }}>
      <div className="row">
        <span className="mode-card__ico" style={{ background: 'var(--navy-900)', color: '#fff' }}>
          <Icon name="loader" className="spin" />
        </span>
        <div>
          <div className="h-sub">{title}</div>
          <div className="t-caption">{caption}</div>
        </div>
      </div>
      <div className="progress"><div className="progress__bar" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      <ul className="step-list">
        {steps.map((s, i) => (
          <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
            <span className="step-dot">{i < step ? <Icon name="check" size={12} stroke={3} /> : <small>{i + 1}</small>}</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
