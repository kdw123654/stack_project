import { listFiles, storeFiles, reuseFile, type StoredFile } from '../services/backend';
import { demoMode } from '../services/http';
import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Sheet, SubHeader, EditableField } from '../components/Layout';
import { MODES, recentFiles, notices } from '../data/mock';
import { analyzeFiles, saveExperience, UPLOAD_LIMIT } from '../services/api';
import PortfolioResult from './PortfolioResult';
import { useHideHeader } from '../components/HeaderContext';
import type {
  FileKind, ModeId, Profile, TabId, UploadItem, RecentFile, TaggedResult, SpecupResult, Experience,
} from '../types';

const fileKind = (name: string): FileKind => {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'img';
  return 'doc';
};
const KIND_LABEL: Record<FileKind, string> = { ppt: 'PPT', pdf: 'PDF', img: 'IMG', doc: 'DOC' };
// 모드별 분석 단계 (Figma: v2 / 홈 — AI 분석 중 (○○ 모드))

export function FileIcon({ name, type }: { name: string; type?: FileKind }) {
  const k = type || fileKind(name);
  return <span className={`file-ico file-ico--${k}`}>{KIND_LABEL[k]}</span>;
}

/* ================= HM: 홈 (파일 업데이트 중심) ================= */
interface HomeProps {
  profile: Profile;
  onEditProfile: () => void;
  goTab: (tab: TabId) => void;
  onSaved: (exp: Experience) => void;
}
type View = 'home' | 'analyzing' | 'result';

export default function Home({ profile, onEditProfile, goTab, onSaved }: HomeProps) {
  const [stored, setStored] = useState<StoredFile[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [analysisId, setAnalysisId] = useState('');
  const [sourceFileId, setSourceFileId] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');
  const [files, setFiles] = useState<(File | UploadItem)[]>([]);
  const [memo, setMemo] = useState('');
  const [memoOpen, setMemoOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<ModeId>('resume');
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<TaggedResult | null>(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useHideHeader(view === 'result');

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    listFiles().then(value => { if (active) setStored(value); }).catch(e => { if (active) setFileError(e.message); });
    return () => { active = false; };
  }, []);
  const shownRecent: RecentFile[] = demoMode ? recentFiles : stored.map(f => ({ id: f.fileId, name: f.name, type: fileKind(f.name), updatedAt: f.uploadedAt.slice(0, 10), mode: f.lastMode ?? '미분석' }));
  const keepOriginals = async () => {
    if (fileBusy) return;
    if (!files.every(file => file instanceof File)) return setError('원본 파일을 선택해 주세요.');
    setFileBusy(true); setError('');
    try {
      const saved = await storeFiles(files as File[]);
      setSourceFileId(saved[0]?.fileId ?? null);
      setStored(current => [...saved, ...current].slice(0, 20));
      setFileError('');
      setError('선택한 원본을 보관함에 저장했어요.');
    } catch (e) { setError(e instanceof Error ? e.message : '원본 저장에 실패했어요.'); }
    finally { setFileBusy(false); }
  };
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > UPLOAD_LIMIT.maxSizeMB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name}: 파일당 ${UPLOAD_LIMIT.maxSizeMB}MB까지 올릴 수 있어요.`);
    const next = [...files, ...incoming].slice(0, UPLOAD_LIMIT.maxFiles);
    setError('');
    setFiles(next);
    setAnalysisId('');
    setSourceFileId(null);
    if (next.length) setSheetOpen(true);
  };

  // 최근 파일 "다시 추출": 같은 파일로 다른 모드 결과를 뽑을 때
  const reuseRecent = async (f: RecentFile) => {
    if (fileBusy) return;
    setFileBusy(true); setError('');
    try {
      setFiles(demoMode ? [{ name: f.name, size: 0, recent: true }] : [await reuseFile(f.id)]);
      setSourceFileId(demoMode ? null : f.id); setAnalysisId(''); setSheetOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : '원본을 불러오지 못했어요.'); }
    finally { setFileBusy(false); }
  };

  const start = async (m: ModeId = mode, remode = false) => {
    setSheetOpen(false);
    setView('analyzing');
    setMode(m);
    setStep(0);
    setWarnings([]);
    setError('');
    try {
      // 모드별로 결과 타입이 정확히 좁혀지도록 태그를 붙여 저장
      if (m === 'resume') setResult({ mode: m, data: await analyzeFiles(files, m, memo, setStep, profile.job, setWarnings, { sourceAnalysisId: remode ? analysisId : undefined, onAnalysis: setAnalysisId }) });
      else if (m === 'portfolio') setResult({ mode: m, data: await analyzeFiles(files, m, memo, setStep, profile.job, setWarnings, { sourceAnalysisId: remode ? analysisId : undefined, onAnalysis: setAnalysisId }) });
      else setResult({ mode: m, data: await analyzeFiles(files, m, memo, setStep, profile.job, setWarnings, { sourceAnalysisId: remode ? analysisId : undefined, onAnalysis: setAnalysisId }) });
      setView('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석에 실패했어요. 다시 시도해 주세요.');
      setView('home');
    }
  };

  const reset = () => {
    setView('home');
    setFiles([]);
    setMemo('');
    setMemoOpen(false);
    setResult(null);
    setStep(0);
    setAnalysisId('');
    setSourceFileId(null);
  };

  if (view === 'analyzing') return <Analyzing step={step} mode={mode} files={files} />;
  if (view === 'result' && result)
    return (
      <>
      {warnings.length > 0 && <div className="notice notice--point" role="status">{warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div>}
      <ModeResult
        result={result}
        setResult={setResult}
        files={files}
        onBack={reset}
        onChangeMode={(m) => {
          setMode(m);
          start(m, true);
        }}
        onSave={async () => {
          if (result.mode === 'specup') return;
          try {
          const source = files[0]?.name ?? '';
          const saved =
            result.mode === 'portfolio'
              ? await saveExperience({
                  backendData: { sourceFileId, portfolio: { analysisId, analysis: result } },
                  category: result.data.category,
                  title: result.data.summary,
                  summary: result.data.metrics.map((x) => `${x.label} ${x.value}`).join(' · '),
                  contribution: result.data.role.contribution,
                  source,
                  period: result.data.period,
                  skills: result.data.skills,
                  role: result.data.role.title,
                  achievements: result.data.metrics.map(x => `${x.label} ${x.value}`),
                  assets: result.data.images.map(image => ({ id: image.id, label: image.label })),
                })
              : await saveExperience({
                  backendData: { sourceFileId, portfolio: { analysisId, analysis: result } },
                  category: 'ETC',
                  role: result.data.sections.find(x => x.key === 'role')?.value ?? '',
                  achievements: result.data.sections.filter(x => ['achievement', 'outcome', 'achieve'].includes(x.key)).map(x => x.value),
                  title: result.data.summary,
                  summary: result.data.sections.filter(x => ['achievement', 'outcome', 'achieve'].includes(x.key)).map(x => x.value).join(' · '),
                  contribution: null,
                  source,
                  period: result.data.sections.find((x) => x.key === 'period')?.value ?? '',
                  skills: result.data.skills,
                });
          onSaved(saved);
          reset();
          goTab('experience');
          } catch (e) { window.alert(e instanceof Error ? e.message : '저장에 실패했어요.'); }
        }}
        goTab={goTab}
      />
      </>
    );

  return (
    <div className="screen">
      {/* HM-01 프로필 카드 (희망 직무 단일 값) */}
      <section className="card card--navy">
        <div className="row row--between" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', opacity: 0.8 }}>MY TARGET & PROFILE</span>
          <button className="text-btn" onClick={onEditProfile} style={{ color: '#C9DBFF', paddingInline: 8, marginRight: -8 }}>
            프로필 수정
          </button>
        </div>
        <div className="profile-strip__grid">
          <div className="kv">전공<b>{profile.department}</b></div>
          <div className="kv">학년<b>{profile.grade}</b></div>
          <div className="kv">희망 직무<b>{profile.job}</b></div>
          <div className="kv">목표 기업<b>{profile.targetCompany || '미설정'}</b></div>
        </div>
      </section>

      {/* HM-02/03 파일 업데이트 (메인) */}
      <section className="stack-12">
        <div>
          <h1 className="h-display">파일만 올리면, AI가 정리해요</h1>
          <p className="t-body" style={{ marginTop: 4 }}>
            발표 자료·결과 보고서·수료증을 올리고 <b className="t-strong">이력서 / 포트폴리오 / 스펙업</b> 중 원하는 모드를 고르세요.
          </p>
        </div>

        <div
          className={`dropzone ${drag ? 'is-drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <div className="dropzone__icon">
            <Icon name="upload" size={24} />
          </div>
          <div className="h-sub">파일 업데이트</div>
          <p className="t-caption">드래그하거나 버튼을 눌러 올려 주세요 · 최대 {UPLOAD_LIMIT.maxFiles}개, 파일당 {UPLOAD_LIMIT.maxSizeMB}MB</p>
          <div className="file-types">
            {['PPT', 'PDF', 'DOCX', 'HWP', '이미지'].map((t) => (
              <span key={t} className="badge badge--outline">{t}</span>
            ))}
          </div>
          <button className="btn btn--primary btn--block" style={{ marginTop: 8 }} onClick={() => inputRef.current?.click()}>
            <Icon name="plus" size={18} /> 파일 선택하기
          </button>
          <input ref={inputRef} type="file" multiple hidden accept={UPLOAD_LIMIT.accept} onChange={(e) => addFiles(e.target.files)} />
        </div>
        {error && <div className="notice notice--point"><Icon name="info" size={16} />{error}</div>}
      </section>

      {/* 최근 업데이트 파일 → 다른 모드로 재추출 */}
      <section className="stack-8">
        <div className="section-head">
          <h2 className="h-sub">최근 업데이트한 파일</h2>
          <button className="link" onClick={() => goTab('experience')}>보관함 →</button>
        </div>
        {fileError && <p className="notice notice--point" role="alert">{fileError}</p>}
        {fileBusy && <p role="status">파일을 처리하는 중입니다.</p>}
        {!shownRecent.length && !fileError && <p className="t-caption">보관한 원본 파일이 없습니다.</p>}
        {shownRecent.map((f) => (
          <div key={f.id} className="file-row">
            <FileIcon name={f.name} type={f.type} />
            <div className="grow">
              <div className="t-strong" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div className="t-caption">{f.updatedAt} · {f.mode} 모드로 정리됨</div>
            </div>
            <button className="btn btn--soft btn--sm" disabled={fileBusy} onClick={() => { void reuseRecent(f); }}>
              <Icon name="refresh" size={14} /> 다른 모드
            </button>
          </div>
        ))}
      </section>

      {/* HM-06 취업지원처 추천 공고 (매칭 % 대신 일치 태그 표기) */}
      {demoMode && <button className="card card--click stack-8" onClick={() => goTab('explore')}>
        <div className="row row--between">
          <span className="badge badge--success">수원대 취업지원처 추천</span>
          <span className="badge badge--point">D-{notices[1].dday}</span>
        </div>
        <div className="t-strong" style={{ fontSize: 15 }}>{notices[1].title}</div>
        <div className="t-caption">내 역량 태그 <b style={{ color: 'var(--blue-600)' }}>#{notices[1].tags[0]}</b> 와 관련된 프로그램</div>
      </button>

      }
      {/* HM-07 마인드맵 안내 */}
      <button className="card card--tint card--click row" onClick={() => goTab('mindmap')}>
        <div className="mode-card__ico"><Icon name="target" /></div>
        <div className="grow">
          <div className="t-strong" style={{ fontSize: 14 }}>{profile.targetCompany ? `${profile.targetCompany} 목표까지 무엇이 부족할까요?` : '목표 직무까지 무엇이 부족할까요?'}</div>
          <div className="t-caption">{profile.grade} 기준 보완 역량 진단하기</div>
        </div>
        <Icon name="chevronR" size={18} style={{ color: 'var(--text-3)' }} />
      </button>

      {/* 모드 선택 바텀시트 */}
      {sheetOpen && (
        <Sheet onClose={() => setSheetOpen(false)}>
          <div>
            <h2 className="h-title">어떤 용도로 정리할까요?</h2>
            <p className="t-caption" style={{ marginTop: 2 }}>같은 파일로 나중에 다른 모드도 다시 뽑을 수 있어요.</p>
          </div>

          <div className="stack-8">
            {files.map((f, i) => (
              <div key={f.name + i} className="file-row" style={{ padding: 10 }}>
                <FileIcon name={f.name} />
                <span className="grow t-strong" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                {!("recent" in f && f.recent) && (
                  <button className="icon-btn" aria-label="파일 빼기" onClick={() => { setFiles(files.filter((_, j) => j !== i)); setSourceFileId(null); setAnalysisId(''); }}>
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="stack-8" role="radiogroup">
            {MODES.map((m) => (
              <button key={m.id} role="radio" aria-checked={mode === m.id} className={`mode-card ${mode === m.id ? 'is-active' : ''}`} onClick={() => setMode(m.id)}>
                <span className="mode-card__ico"><Icon name={m.icon} /></span>
                <span className="grow">
                  <span className="t-strong" style={{ display: 'block', fontSize: 15 }}>{m.title}</span>
                  <span className="t-caption">{m.desc}</span>
                </span>
                <span className="mode-card__radio" />
              </button>
            ))}
          </div>

          {!demoMode && <button className="btn btn--soft" disabled={fileBusy || !files.length || Boolean(sourceFileId)} onClick={() => { void keepOriginals(); }}>{sourceFileId ? '원본 보관 완료' : fileBusy ? '원본 보관 중' : '선택 파일 원본 보관하기'}</button>}
          {error && <p className="notice notice--point" role="status">{error}</p>}
          {/* 직접 입력은 선택 사항으로 접어 둠 */}
          {memoOpen ? (
            <textarea className="memo" placeholder="파일에 없는 내용만 짧게 적어 주세요. 예) 팀 5명 중 콘텐츠 리드" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} />
          ) : (
            <button className="memo-toggle" onClick={() => setMemoOpen(true)}>
              <Icon name="plus" size={16} /> 한 줄 메모 추가 (선택)
            </button>
          )}

          <button className="btn btn--primary btn--block" disabled={!files.length || fileBusy} onClick={() => start()}>
            <Icon name="sparkle" size={18} /> AI로 정리 시작
          </button>
        </Sheet>
      )}
    </div>
  );
}

/* ================= HM-04 분석 중 ================= */
function Analyzing({ step, mode, files }: { step: number; mode: ModeId; files: (File | UploadItem)[] }) {
  const m = MODES.find((x) => x.id === mode) ?? MODES[0];
  const STEPS = ['작업 대기 중', '문서 내용 추출 중', 'AI 분석 중', '결과 검증 중'];
  return (
    <div className="screen" style={{ justifyContent: 'center' }}>
      <div className="card stack-12" style={{ padding: 24 }}>
        <div className="row">
          <span className="mode-card__ico" style={{ background: 'var(--navy-900)', color: '#fff' }}>
            <Icon name="loader" className="spin" />
          </span>
          <div>
            <div className="h-sub">{m.title}로 정리하고 있어요</div>
            <div className="t-caption">파일 {files.length}개 · 서버에서 처리 중입니다</div>
          </div>
        </div>
        <p className="t-caption" role="status">{STEPS[step]}</p>
        <ul className="step-list">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
              <span className="step-dot">{i < step ? <Icon name="check" size={12} stroke={3} /> : <small>{i + 1}</small>}</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ================= HM-05 모드별 결과 확인·수정 ================= */
interface ModeResultProps {
  result: TaggedResult;
  setResult: (r: TaggedResult) => void;
  files: (File | UploadItem)[];
  onBack: () => void;
  onChangeMode: (m: ModeId) => void;
  onSave: () => void;
  goTab: (tab: TabId) => void;
}

function ModeResult({ result, setResult, files, onBack, onChangeMode, onSave, goTab }: ModeResultProps) {
  const { mode } = result;
  const m = MODES.find((x) => x.id === mode) ?? MODES[0];
  const checkCount =
    result.mode === 'specup'
      ? 0
      : result.data.sections.filter((s) => s.needsCheck).length +
        (result.mode === 'portfolio' ? result.data.metrics.filter((x) => x.needsCheck).length : 0);

  return (
    <div className="screen">
      <SubHeader
        backLabel="취소"
        onBack={onBack}
        right={
          mode !== 'specup' && (
            <button className="btn btn--primary btn--sm" onClick={onSave}>마스터 DB 저장</button>
          )
        }
      />

      {/* 모드 전환 칩: 같은 파일로 바로 다른 모드 결과 확인 */}
      <div className="chips">
        {MODES.map((x) => (
          <button key={x.id} className={`chip ${x.id === mode ? 'is-active' : ''}`} onClick={() => x.id !== mode && onChangeMode(x.id)}>
            {x.title}
          </button>
        ))}
      </div>

      <div className="notice">
        <Icon name="sparkle" size={16} />
        <span>
          <b className="t-strong">{files[0]?.name}</b>{files.length > 1 && ` 외 ${files.length - 1}개`}에서 {m.title} 결과를 뽑았어요.
          {checkCount > 0 && <> <b style={{ color: 'var(--point-600)' }}>주황색 칸 {checkCount}개</b>만 확인해 주세요.</>}
        </span>
      </div>

      {result.mode === 'specup' ? (
        <SpecUpResult result={result.data} goTab={goTab} />
      ) : result.mode === 'portfolio' ? (
        <PortfolioResult result={result.data} setResult={(data) => setResult({ mode: 'portfolio', data })} files={files} onSave={onSave} />
      ) : (
        <section className="card stack-12">
          <h2 className="h-sub">{result.data.summary}</h2>
          {result.data.sections.map((s) => (
            <EditableField
              key={s.key}
              label={s.label}
              value={s.value}
              needsCheck={s.needsCheck}
              long={s.long}
              onChange={(v) =>
                setResult({
                  mode: 'resume',
                  data: { ...result.data, sections: result.data.sections.map((x) => (x.key === s.key ? { ...x, value: v, needsCheck: false } : x)) },
                })
              }
            />
          ))}
          <div className="field">
            <div className="field__label">보유 스킬</div>
            <div className="row wrap">
              {result.data.skills.map((t) => <span key={t} className="tag">#{t}</span>)}
              <button className="tag" style={{ background: 'var(--surface)', borderStyle: 'dashed' }} onClick={() => setResult({ mode: 'resume', data: { ...result.data, skills: [...result.data.skills, '새 태그'] } })}>+ 추가</button>
            </div>
          </div>
          <div className="field">
            <div className="field__label">첨부 파일</div>
            {files.map((f, i) => (
              <div key={i} className="file-row" style={{ padding: 10 }}>
                <FileIcon name={f.name} />
                <span className="t-strong" style={{ fontSize: 13 }}>{f.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SpecUpResult({ result, goTab }: { result: SpecupResult; goTab: (tab: TabId) => void }) {
  const total = result.owned.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <section className="card stack-12">
        <div className="row row--between">
          <h2 className="h-sub">보유 스펙 정리</h2>
          <span className="badge badge--blue">총 {total}개</span>
        </div>
        {result.owned.map((g) => (
          <div key={g.group} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="t-caption" style={{ width: 56, paddingTop: 4, fontWeight: 700 }}>{g.group}</span>
            <div className="row wrap grow">
              {g.items.length ? g.items.map((it) => <span key={it} className="tag">{it}</span>) : <span className="badge badge--point">찾지 못함</span>}
            </div>
          </div>
        ))}
      </section>

      <section className="stack-8">
        <h2 className="h-sub">보완하면 좋은 항목</h2>
        {result.gaps.map((g) => (
          <div key={g.title} className="card row" style={{ padding: 14 }}>
            <span className={`badge ${g.level === 'point' ? 'badge--point' : 'badge--blue'}`}>{g.level === 'point' ? '보완 필요' : '권장'}</span>
            <div className="grow">
              <div className="t-strong" style={{ fontSize: 14 }}>{g.title}</div>
              <div className="t-caption">{g.reason}</div>
            </div>
            <button className="link" onClick={() => goTab(g.action.includes('직접') ? 'experience' : 'explore')}>{g.action}</button>
          </div>
        ))}
        <button className="btn btn--ghost btn--block" onClick={() => goTab('mindmap')}>역량 마인드맵에서 자세히 보기</button>
      </section>
    </>
  );
}
