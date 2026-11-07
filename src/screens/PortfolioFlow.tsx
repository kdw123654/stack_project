import { useState } from 'react';
import Icon from '../components/Icon';
import { FlowHeader, Stepper, TitleBlock, Checkbox, PostingInput, MiniArt } from '../components/Flow';
import { FIT_META } from '../data/mock';
import { parsePosting, matchExperiences, buildSlideOutline, generateSlides } from '../services/api';
import type {
  Experience, Posting, PostingInput as PostingInputValue, MatchedExperience, SlideItem, SlideOptions, SlideLayout, SlideType, MiniKind, Toast,
} from '../types';

interface PortfolioFlowProps {
  experiences: Experience[];
  onExit: () => void;
  onSaved?: (payload: { kind: 'slides'; posting: Posting; slides: SlideItem[] }) => void;
  toast: Toast;
}
type Step = 1 | 2 | 3 | 4;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : '요청에 실패했어요. 다시 시도해 주세요.');

/**
 * EX-04 포폴 슬라이드 만들기 — 4단계
 * Figma: FLOW 3 · 포폴 ①공고 입력 → ②관련 경험 추출 → ③슬라이드 구성·초안 생성 → ④미리보기·수정
 */
const LABELS = ['공고 입력', '경험 추출', '슬라이드 구성', '미리보기·수정'];
const KIND_BY_FIT_TITLE = (m: { title: string }): MiniKind => (m.title.includes('SNS') ? 'grid' : m.title.includes('창업') ? 'phone' : m.title.includes('공모전') ? 'bars' : 'text');
const TYPE_BADGE: Partial<Record<SlideType, string>> = { 성과: 'badge--point', 프로젝트: 'badge--blue' };
const LAYOUTS: SlideLayout[] = ['지표 강조', '이미지 강조', '텍스트 강조'];

export default function PortfolioFlow({ experiences, onExit, onSaved, toast }: PortfolioFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [posting, setPosting] = useState<Posting | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState<SlideOptions>({ size: 10, format: 'PDF' });
  const [matched, setMatched] = useState<MatchedExperience[]>([]);
  const [outline, setOutline] = useState<SlideItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [cur, setCur] = useState(0);

  const parse = async (input: PostingInputValue) => {
    setParsing(true);
    setError('');
    try {
      setPosting(await parsePosting(input));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setParsing(false);
    }
  };

  const picked = matched.filter((m) => m.selected);
  const move = <T,>(arr: T[], i: number, d: number): T[] => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  const toExtract = async () => {
    if (!posting) return;
    // 적합도 순(이미지·지표가 있는 경험 우선)으로 정렬되어 옴
    setMatched(await matchExperiences(posting, 'slides', experiences));
    setStep(2);
  };
  const toOutline = async () => {
    if (!posting) return;
    setOutline(await buildSlideOutline(posting, picked, options.size));
    setStep(3);
  };
  const toPreview = async () => {
    setGenerating(true);
    setSlides(await generateSlides(outline));
    setGenerating(false);
    setCur(Math.min(4, outline.length - 1));
    setStep(4);
  };
  const save = () => {
    if (!posting) return;
    onSaved?.({ kind: 'slides', posting, slides });
    toast('포트폴리오 초안을 저장했어요');
    onExit();
  };

  const back: Record<Step, [string, () => void]> = {
    1: ['나의 경험', onExit],
    2: ['공고 입력', () => setStep(1)],
    3: ['경험 추출', () => setStep(2)],
    4: ['슬라이드 구성', () => setStep(3)],
  };
  const [backLabel, onBack] = back[step];
  const slide = slides[cur];
  const setSlide = (patch: Partial<SlideItem>) => setSlides(slides.map((s, i) => (i === cur ? { ...s, ...patch } : s)));

  return (
    <div className="screen">
      <FlowHeader
        backLabel={backLabel}
        onBack={onBack}
        title="포폴 슬라이드"
        right={step === 4 && <button className="btn btn--primary btn--sm" onClick={save}>저장</button>}
      />
      <Stepper labels={LABELS} current={step} />

      {/* ① 공고 입력 */}
      {step === 1 && (
        <>
          <TitleBlock title="어떤 공고에 맞춘 포트폴리오인가요?" desc="공고를 넣으면 요구 역량에 맞는 프로젝트를 골라 슬라이드 순서를 잡아 줘요." />
          <PostingInput kind="slides" posting={posting} loading={parsing} error={error} onParse={parse} options={options} setOptions={setOptions} />
          <button className="btn btn--primary btn--block" disabled={!posting} onClick={toExtract}>
            <Icon name="arrowR" size={18} /> 다음 · 관련 프로젝트 찾기
          </button>
        </>
      )}

      {/* ② 관련 경험 추출 */}
      {step === 2 && (
        <>
          <TitleBlock
            title={`관련 프로젝트 ${matched.filter((m) => m.fit !== 'low').length}개를 찾았어요`}
            desc="이미지·지표가 있는 경험을 먼저 골랐어요. 위에서부터 슬라이드에 들어가요."
          />
          {matched.map((m, i) => (
            <div key={m.id} className={`card row pick ${m.selected ? '' : 'is-off'}`}>
              <Checkbox checked={m.selected} label={`${m.title} 선택`} onChange={(v) => setMatched(matched.map((x) => (x.id === m.id ? { ...x, selected: v } : x)))} />
              <MiniArt kind={KIND_BY_FIT_TITLE(m)} w={64} h={64} />
              <div className="grow stack-8" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 4 }}>
                  {i === 0 && m.selected && <span className="badge badge--navy">대표</span>}
                  <span className={`badge ${FIT_META[m.fit].cls}`}>{FIT_META[m.fit].label}</span>
                </div>
                <div className="t-strong" style={{ fontSize: 14 }}>{m.title}</div>
                <div className="t-caption">{m.assets}</div>
              </div>
              {m.selected && (
                <div className="reorder">
                  <button aria-label="위로" onClick={() => setMatched(move(matched, i, -1))}><Icon name="arrowUp" size={14} /></button>
                  <button aria-label="아래로" onClick={() => setMatched(move(matched, i, 1))}><Icon name="arrowDown" size={14} /></button>
                </div>
              )}
            </div>
          ))}
          <div className="row" style={{ gap: 12 }}>
            <span className="t-strong" style={{ fontSize: 13, color: 'var(--text-2)' }}>선택 {picked.length}개</span>
            <button className="btn btn--primary grow" disabled={!picked.length} onClick={toOutline}>
              <Icon name="arrowR" size={18} /> 슬라이드 구성하기
            </button>
          </div>
        </>
      )}

      {/* ③ 슬라이드 구성 · 초안 생성 */}
      {step === 3 && (
        <>
          <TitleBlock title={`이렇게 ${outline.length}장으로 구성할게요`} desc="순서를 바꾸거나 빼고 싶은 슬라이드를 정리한 뒤 초안을 만드세요." />
          <section className="card" style={{ padding: '4px 12px' }}>
            {outline.map((s, i) => (
              <div key={s.id} className="outline-row">
                <div className="reorder reorder--col">
                  <button aria-label="위로" onClick={() => setOutline(move(outline, i, -1))}><Icon name="arrowUp" size={12} /></button>
                  <button aria-label="아래로" onClick={() => setOutline(move(outline, i, 1))}><Icon name="arrowDown" size={12} /></button>
                </div>
                <b className="outline-row__no">{String(i + 1).padStart(2, '0')}</b>
                <MiniArt kind={s.kind} w={48} h={27} />
                <div className="grow">
                  <div className="t-strong" style={{ fontSize: 13 }}>{s.title}</div>
                  <div className="t-caption" style={{ fontSize: 11 }}>{s.desc}</div>
                </div>
                <span className={`badge ${TYPE_BADGE[s.type] || 'badge--gray'}`}>{s.type}</span>
                <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="슬라이드 빼기" onClick={() => setOutline(outline.filter((x) => x.id !== s.id))}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </section>
          <button
            className="dashed-btn"
            onClick={() => setOutline([...outline, { id: `s${Date.now()}`, title: '새 슬라이드', desc: '내용을 입력해 주세요', type: '프로젝트' as const, kind: 'text' as const }])}
          >
            <Icon name="plus" size={16} /> 슬라이드 추가
          </button>
          <button className="btn btn--primary btn--block" disabled={!outline.length || generating} onClick={toPreview}>
            {generating ? <><Icon name="loader" className="spin" size={18} /> 슬라이드 만드는 중</> : <><Icon name="sparkle" size={18} /> 슬라이드 초안 생성하기</>}
          </button>
        </>
      )}

      {/* ④ 미리보기 · 수정 */}
      {step === 4 && slide && (
        <>
          <SlidePreview slide={slide} index={cur} />
          <div className="row">
            <span className="t-strong grow" style={{ fontSize: 13 }}>슬라이드 {cur + 1} / {slides.length} · {slide.title}</span>
            <button className="icon-btn" style={{ width: 32, height: 32 }} disabled={cur === 0} onClick={() => setCur(cur - 1)} aria-label="이전 슬라이드"><Icon name="chevronL" size={16} /></button>
            <button className="icon-btn" style={{ width: 32, height: 32 }} disabled={cur === slides.length - 1} onClick={() => setCur(cur + 1)} aria-label="다음 슬라이드"><Icon name="chevronR" size={16} /></button>
          </div>
          <div className="thumb-strip">
            {slides.map((s, i) => (
              <div key={s.id} className="thumb-strip__item">
                <MiniArt kind={s.kind} w={64} h={36} selected={i === cur} onClick={() => setCur(i)} />
                <small className={i === cur ? 'is-on' : ''}>{i + 1}</small>
              </div>
            ))}
          </div>
          <section className="card stack-12">
            <div className="row row--between">
              <h2 className="t-strong" style={{ fontSize: 14 }}>이 슬라이드 수정</h2>
              <span className="badge badge--blue">AI 초안</span>
            </div>
            <label className="field">
              <span className="field__label">제목</span>
              <input className="input" value={slide.title} onChange={(e) => setSlide({ title: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">핵심 문장</span>
              <textarea className="input" style={{ height: 72 }} value={slide.desc} onChange={(e) => setSlide({ desc: e.target.value })} />
            </label>
            <span className="field__label">레이아웃</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {LAYOUTS.map((l) => (
                <button key={l} className={`chip ${slide.layout === l ? 'is-active' : ''}`} onClick={() => setSlide({ layout: l })}>{l}</button>
              ))}
            </div>
            <div className="grid-2">
              <button className="btn btn--soft btn--sm" onClick={() => toast('이 슬라이드를 다시 만드는 중이에요 (API 연결 후 동작)')}><Icon name="sparkle" size={14} />AI로 다시 만들기</button>
              <button className="btn btn--ghost btn--sm" onClick={() => toast('보관함 이미지에서 고를 수 있어요 (API 연결 후 동작)')}><Icon name="image" size={14} />이미지 바꾸기</button>
            </div>
          </section>
          <button className="btn btn--primary btn--block" onClick={save}>포트폴리오 초안 저장</button>
          <div className="grid-2">
            <button className="btn btn--ghost" onClick={() => toast('PDF로 내보내는 중이에요')}><Icon name="download" size={18} />PDF 내보내기</button>
            <button className="btn btn--ghost" onClick={() => toast('PPT로 내보내는 중이에요')}><Icon name="download" size={18} />PPT 내보내기</button>
          </div>
        </>
      )}
    </div>
  );
}

/** 16:9 슬라이드 미리보기 — 레이아웃에 따라 구성이 바뀜 */
function SlidePreview({ slide, index }: { slide: SlideItem; index: number }) {
  const L = slide.layout;
  return (
    <div className={`slide slide--${L === '지표 강조' ? 'metric' : L === '이미지 강조' ? 'image' : 'text'}`} aria-label={`슬라이드 ${index + 1} 미리보기`}>
      <div className="slide__body">
        <span className="slide__kicker">{slide.type.toUpperCase()} · {String(index + 1).padStart(2, '0')}</span>
        <strong className="slide__title">{slide.title}</strong>
        <p className="slide__desc">{slide.desc}</p>
        {L === '지표 강조' && (
          <div className="slide__metrics">
            <span><b>+400</b>팔로워</span>
            <span><b>주 3회</b>업로드</span>
          </div>
        )}
      </div>
      {L !== '텍스트 강조' && (
        <div className="slide__visual">
          {L === '지표 강조' ? (
            <div className="slide__chart">
              {[26, 34, 30, 48, 62, 96].map((v, i) => <i key={i} style={{ height: `${v}%` }} className={i === 5 ? 'is-hi' : ''} />)}
            </div>
          ) : (
            <MiniArt kind={slide.kind === 'text' ? 'grid' : slide.kind} w="100%" h="100%" />
          )}
        </div>
      )}
    </div>
  );
}
