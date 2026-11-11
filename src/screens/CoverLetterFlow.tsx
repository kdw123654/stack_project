import { storeCover, type ProjectRef } from '../services/generatedStorage';
import { rewrite } from '../services/career';
import { demoMode } from '../services/http';
import { useState } from 'react';
import Icon from '../components/Icon';
import { questionCount, questionLimitLabel } from '../services/questions';
import { FlowHeader, Stepper, TitleBlock, Checkbox, PostingInput, ProgressCard } from '../components/Flow';
import { FIT_META } from '../data/mock';
import { parsePosting, matchExperiences, generateCoverLetter } from '../services/api';
import type { Experience, Posting, PostingInput as PostingInputValue, MatchedExperience, CoverDraft, Toast } from '../types';

interface CoverLetterFlowProps {
  experiences: Experience[];
  initial?: { posting: Posting; drafts: CoverDraft[]; picked: MatchedExperience[]; project?: ProjectRef };
  onExit: () => void;
  onSaved?: (payload: { kind: 'cover'; posting: Posting; drafts: CoverDraft[] }) => void;
  toast: Toast;
}
type Step = 1 | 2 | 3 | 4;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : '요청에 실패했어요. 다시 시도해 주세요.');

/**
 * EX-03 공고 맞춤 자소서 쓰기 — 4단계
 * Figma: FLOW 2 · 자소서 ①공고 입력 → ②경험 자동 선별 → ③초안 생성 중 → ④문항별 초안 확인·수정
 */
const LABELS = ['공고 입력', '경험 선별', '초안 생성', '확인·수정'];
const GEN_STEPS = ['작업 대기', 'AI 초안 생성', '결과 검증'];

export default function CoverLetterFlow({ experiences, onExit, onSaved, toast, initial }: CoverLetterFlowProps) {
  const [project, setProject] = useState(initial?.project);
  const [saving, setSaving] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [step, setStep] = useState<Step>(initial ? 4 : 1);
  const [posting, setPosting] = useState<Posting | null>(initial?.posting ?? null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [matched, setMatched] = useState<MatchedExperience[]>(initial?.picked ?? []);
  const [genStep, setGenStep] = useState(0);
  const [drafts, setDrafts] = useState<CoverDraft[]>(initial?.drafts ?? []);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState(false);

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

  const goSelect = async () => {
    if (!posting) return;
    if (!posting.questions.length) return toast('자소서 문항을 먼저 추가해 주세요.');
    if (posting.questions.some(q => !q.title.trim())) return toast('빈 문항 내용을 입력해 주세요.');
    try {
      setMatched(await matchExperiences(posting, 'cover', experiences));
      setStep(2);
    } catch (e) { toast(errMsg(e)); }
  };

  const picked = matched.filter((m) => m.selected);

  const generate = async () => {
    if (!posting) return;
    setGenStep(0);
    setStep(3);
    try {
    const result = await generateCoverLetter(posting, picked, setGenStep);
    setDrafts(result);
    setActive(0);
    setStep(4);
    } catch (e) { toast(errMsg(e)); setStep(2); }
  };

  const rewriteAnswer = async (instructions = '') => {
    if (!posting || rewriting || saving) return;
    if (demoMode) return toast('샘플 모드에서는 재생성을 지원하지 않아요.');
    const original = drafts[active];
    setRewriting(true);
    try {
      const next = await rewrite(posting, picked, original, instructions);
      setDrafts(current => current.map(d => {
        const draft = d.id === next.id ? next : d;
        return draft.generation && next.generation
          ? { ...draft, generation: { ...draft.generation, taskId: next.generation.taskId } }
          : draft;
      }));
      toast('새 초안을 반영했어요');
    } catch (e) { toast(errMsg(e)); }
    finally { setRewriting(false); }
  };
  const canSaveToServer = !demoMode && Boolean(posting?.source && drafts.length && drafts.every(d => d.generation));
  const save = async () => {
    if (!posting || saving || rewriting) return;
    const storageKey = 'stack.cover.' + (sessionStorage.getItem('stack.userId') || 'demo');
    const remember = (ref?: ProjectRef) => {
      const checkpoint = ref && { id: ref.id, postingId: ref.postingId, updatedAt: ref.updatedAt };
      setProject(checkpoint);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ posting, drafts, picked, project: checkpoint }));
      } catch {
        if (!canSaveToServer) throw new Error('기기 저장 공간을 확인해 주세요.');
      }
    };
    setSaving(true);
    try {
      remember(project);
      if (canSaveToServer) await storeCover(posting, drafts, project, remember);
      onSaved?.({ kind: 'cover', posting, drafts });
      toast(canSaveToServer ? '자소서 초안을 서버에 저장했어요' : '이 기기에 자소서 초안을 저장했어요');
      onExit();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const back: Record<Step, [string, () => void]> = {
    1: ['나의 경험', onExit],
    2: ['공고 입력', () => setStep(1)],
    3: ['경험 선별', () => setStep(2)],
    4: ['경험 선별', () => setStep(2)],
  };
  const [backLabel, onBack] = back[step];

  return (
    <div className="screen">
      <FlowHeader
        backLabel={backLabel}
        onBack={() => { if (!saving && !rewriting) onBack(); }}
        title="공고 맞춤 자소서"
        right={step === 4 && <button className="btn btn--primary btn--sm" disabled={saving || rewriting} onClick={save}>저장</button>}
      />
      <Stepper labels={LABELS} current={step} />

      {/* ① 공고 입력 */}
      {step === 1 && (
        <>
          <TitleBlock title="어떤 공고에 지원하나요?" desc="채용공고 링크나 내용을 붙여넣으면 AI가 요구 역량과 자소서 문항을 읽어 와요." />
          <PostingInput
            kind="cover"
            posting={posting}
            loading={parsing}
            error={error}
            onParse={parse}
            onQuestionChange={next => posting && setPosting({ ...posting, questions: posting.questions.map(q => q.id === next.id ? next : q) })}
            onAddQuestion={() => {
              if (!posting) return;
              const title = window.prompt('공고에 있는 자소서 문항을 입력해 주세요.');
              if (!title?.trim()) return;
              setPosting({
                ...posting,
                needsManualQuestions: false,
                questions: [...posting.questions, { id: crypto.randomUUID(), no: posting.questions.length + 1, title: title.trim(), limit: null, countUnit: 'unknown', includesSpaces: null, needsCheck: true }],
              });
            }}
          />
          <div className="notice"><Icon name="info" size={16} />문항을 찾지 못하면 공고 원문을 확인하고 직접 추가해 주세요.</div>
          <button className="btn btn--primary btn--block" disabled={!posting} onClick={goSelect}>
            <Icon name="arrowR" size={18} /> 다음 · 맞는 경험 고르기
          </button>
        </>
      )}

      {/* ② 경험 자동 선별 */}
      {step === 2 && (
        <>
          <TitleBlock
            title={`공고에 맞는 경험 ${matched.filter((m) => m.fit !== 'low').length}개를 골랐어요`}
            desc={`마스터 경험 ${experiences.length}개 중 요구 역량과 겹치는 경험이에요. 빼거나 더할 수 있어요.`}
          />
          {matched.map((m) => (
            <div key={m.id} className={`card row pick ${m.selected ? '' : 'is-off'}`} style={{ alignItems: 'flex-start' }}>
              <Checkbox
                checked={m.selected}
                label={`${m.title} 선택`}
                onChange={(v) => setMatched(matched.map((x) => (x.id === m.id ? { ...x, selected: v } : x)))}
              />
              <div className="grow stack-8" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge badge--gray">{m.category}</span>
                  <span className={`badge ${FIT_META[m.fit].cls}`}>{FIT_META[m.fit].label}</span>
                </div>
                <div className="t-strong" style={{ fontSize: 14 }}>{m.title}</div>
                <div className="t-caption" style={{ color: 'var(--text-2)' }}>{m.reason}</div>
                {m.selected && m.question && (
                  <span className="assign">
                    <Icon name="arrowR" size={12} stroke={2.2} />
                    문항 {posting?.questions.find((q) => q.id === m.question)?.no} · {posting?.questions.find((q) => q.id === m.question)?.title}에 사용
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="row" style={{ gap: 12 }}>
            <span className="t-strong" style={{ fontSize: 13, color: 'var(--text-2)' }}>선택 {picked.length}개</span>
            <button className="btn btn--primary grow" disabled={!picked.length} onClick={generate}>
              <Icon name="sparkle" size={18} /> 자소서 초안 생성하기
            </button>
          </div>
        </>
      )}

      {/* ③ 초안 생성 중 */}
      {step === 3 && (
        <div style={{ marginTop: 64 }}>
          <ProgressCard
            title="자소서 초안을 쓰고 있어요"
            caption={`문항 ${posting?.questions.length ?? 0}개 · 경험 ${picked.length}개 사용`}
            steps={GEN_STEPS}
            step={genStep}
          />
          <p className="t-caption" style={{ textAlign: 'center', marginTop: 12 }}>완료되면 문항별 초안 화면으로 이동해요</p>
        </div>
      )}

      {/* ④ 문항별 초안 확인·수정 */}
      {step === 4 && drafts[active] && (
        <>
          <div className="chips">
            {drafts.map((d, i) => (
              <button key={d.id} className={`chip ${i === active ? 'is-active' : ''}`} onClick={() => { setActive(i); setEditing(false); }}>
                문항 {d.no} · {d.title.length > 6 ? d.title.slice(0, 6) + '…' : d.title}
              </button>
            ))}
          </div>
          {rewriting && <p role="status">문항을 다시 작성하는 중입니다. 완료 후 새 초안을 반영합니다.</p>}
          <DraftCard
            draft={drafts[active]}
            editing={editing}
            setEditing={setEditing}
            onChange={(text: string) => !saving && !rewriting && setDrafts(drafts.map((d, i) => (i === active ? { ...d, text } : d)))}
            onRewrite={() => { void rewriteAnswer(); }}
            onPolish={() => { void rewriteAnswer('기존 근거를 유지하면서 문장을 자연스럽게 다듬어 주세요.'); }}
            onCopy={() => { navigator.clipboard?.writeText(drafts[active].text); toast('복사했어요'); }}
          />
          <button className="btn btn--primary btn--block" disabled={saving || rewriting} onClick={save}>{saving ? '저장 중' : canSaveToServer ? '자소서 초안 서버 저장' : '이 기기에 자소서 초안 저장'}</button>
          <button className="link" style={{ alignSelf: 'center', fontSize: 13 }} onClick={() => toast('코칭 신청 화면으로 이동')}>취업지원처 무료 코칭 받기 →</button>
        </>
      )}
    </div>
  );
}

interface DraftCardProps {
  draft: CoverDraft;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onChange: (text: string) => void;
  onRewrite: () => void;
  onPolish: () => void;
  onCopy: () => void;
}

function DraftCard({ draft, editing, setEditing, onChange, onRewrite, onPolish, onCopy }: DraftCardProps) {
  const len = questionCount(draft.text, draft);
  const over = len !== null && draft.limit !== null && len > draft.limit;
  return (
    <section className="card stack-12">
      <h2 className="t-strong" style={{ fontSize: 15 }}>{draft.title}을(를) 작성해 주세요.</h2>
      <div className="row" style={{ gap: 10 }}>
        <div className="meter grow"><div className="meter__fill" style={{ width: `${draft.limit && len !== null ? Math.min(100, (len / draft.limit) * 100) : 0}%`, background: over ? 'var(--point-500)' : undefined }} /></div>
        <span className="t-strong" style={{ fontSize: 12, color: over ? 'var(--point-600)' : 'var(--navy-900)' }}>{len === null ? '분량 기준 확인 필요' : len} · {questionLimitLabel(draft)}</span>
      </div>
      <div className="draft">
        <div className="row row--between">
          <span className="badge badge--blue">AI 초안</span>
          <button className="field__edit" style={{ position: 'static' }} onClick={() => setEditing(!editing)} aria-label="초안 수정">
            <Icon name={editing ? 'check' : 'edit'} size={16} />
          </button>
        </div>
        {editing ? (
          <textarea className="draft__input" autoFocus value={draft.text} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <p className="draft__text">{draft.text || '이 문항은 초안이 없어요. 직접 쓰거나 “다시 쓰기”를 눌러 주세요.'}</p>
        )}
      </div>
      {draft.keywords.length > 0 && (
        <div className="stack-8" style={{ gap: 6 }}>
          <div className="row row--between">
            <span className="t-caption" style={{ fontWeight: 700, color: 'var(--text-2)' }}>공고 키워드 반영</span>
            {draft.keywords.some((k) => !k.covered) && <button className="link" onClick={onPolish}>보완하기 →</button>}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {draft.keywords.map((k) => (
              <span key={k.label} className={`badge ${k.covered ? 'badge--blue' : 'badge--point'}`}>
                {k.covered && <Icon name="check" size={10} stroke={3} />}
                {k.covered ? k.label : `${k.label} 미반영`}
              </span>
            ))}
          </div>
        </div>
      )}
      {draft.usedExperiences.length > 0 && (
        <div className="stack-8" style={{ gap: 6 }}>
          <span className="t-caption" style={{ fontWeight: 700, color: 'var(--text-2)' }}>사용한 경험</span>
          <div className="row wrap" style={{ gap: 6 }}>{draft.usedExperiences.map((t) => <span key={t} className="badge badge--gray">{t}</span>)}</div>
        </div>
      )}
      <div className="grid-3">
        <button className="btn btn--ghost btn--sm" onClick={onRewrite}><Icon name="refresh" size={14} />다시 쓰기</button>
        <button className="btn btn--soft btn--sm" onClick={onPolish}><Icon name="sparkle" size={14} />문장 다듬기</button>
        <button className="btn btn--ghost btn--sm" onClick={onCopy}><Icon name="copy" size={14} />복사</button>
      </div>
    </section>
  );
}
