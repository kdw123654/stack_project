import { demoMode } from '../services/http';
import { updateExperience, deleteExperience } from '../services/backend';
import { useState } from 'react';
import Icon from '../components/Icon';
import { Sheet, SubHeader, EditableField } from '../components/Layout';
import { FileIcon } from './Home';
import CoverLetterFlow from './CoverLetterFlow';
import PortfolioFlow from './PortfolioFlow';
import { useHideHeader } from '../components/HeaderContext';
import type { Experience, Toast, Posting, CoverDraft, MatchedExperience, SlideItem } from '../types';

interface MyExperienceProps {
  list: Experience[];
  setList: (list: Experience[]) => void;
  toast: Toast;
}

/* ================= EX: 나의 경험 ================= */
export default function MyExperience({ list, setList, toast }: MyExperienceProps) {
  const [savedCover, setSavedCover] = useState<{ posting: Posting; drafts: CoverDraft[]; picked: MatchedExperience[] } | undefined>();
  const [savedSlides, setSavedSlides] = useState<{ posting: Posting; slides: SlideItem[]; picked: MatchedExperience[] } | undefined>();
  const [filter, setFilter] = useState('전체');
  const [detail, setDetail] = useState<Experience | null>(null);
  const [builder, setBuilder] = useState<'cover' | 'slides' | null>(null);
  useHideHeader(Boolean(detail || builder));

  // EX-03 / EX-04: 버튼을 누르면 4단계 전용 화면으로 전환
  if (builder === 'cover') return <CoverLetterFlow initial={savedCover} experiences={list} onExit={() => setBuilder(null)} toast={toast} />;
  if (builder === 'slides') return <PortfolioFlow initial={savedSlides} experiences={list} onExit={() => setBuilder(null)} toast={toast} />;

  if (detail)
    return (
      <ExperienceDetail
        exp={detail}
        onBack={() => setDetail(null)}
        onSave={async (next) => {
          try {
            const saved = demoMode ? next : await updateExperience(next);
            setList(list.map(e => e.id === saved.id ? saved : e)); setDetail(null); toast('수정 내용을 저장했어요');
          } catch (e) { toast(e instanceof Error ? e.message : '저장에 실패했어요.'); }
        }}
        onDelete={async () => {
          try {
            if (!demoMode) await deleteExperience(detail.id);
            setList(list.filter(e => e.id !== detail.id)); setDetail(null); toast('경험을 삭제했어요');
          } catch (e) { toast(e instanceof Error ? e.message : '삭제에 실패했어요.'); }
        }}
      />
    );

  const FILTERS = ['전체', ...new Set(list.map((e) => e.category))];
  const shown = filter === '전체' ? list : list.filter((e) => e.category === filter);

  return (
    <div className="screen">
      {/* EX-03/04 AI 서류 빌더 */}
      <section className="card card--navy stack-12">
        <div className="row row--between">
          <span className="badge" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}>AI 서류 빌더</span>
          <span style={{ fontSize: 12, color: '#C9DBFF' }}>저장된 경험 {list.length}개 연동 중</span>
        </div>
        <div>
          <div className="h-sub" style={{ color: '#fff' }}>지원 공고 맞춤 자소서 & 포폴 초안</div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', marginTop: 4, lineHeight: 1.5 }}>
            공고를 붙여넣으면 보관함에서 가장 잘 맞는 경험을 골라 초안을 만들어요.
          </p>
        </div>
        <div className="grid-2">
          <button className="btn btn--sm" style={{ background: '#fff', color: 'var(--navy-900)' }} disabled={!list.length} onClick={() => { setSavedCover(undefined); setBuilder('cover'); }}>
            공고 맞춤 자소서
          </button>
          <button className="btn btn--sm btn--blue" disabled={!list.length} onClick={() => { setSavedSlides(undefined); setBuilder('slides'); }}>
            포폴 슬라이드
          </button>
        </div>
      </section>

      <section className="card stack-8"><h2 className="h-sub">이 기기에 저장한 최근 초안</h2><p className="t-caption">서버에 저장되지 않습니다. 같은 기기와 계정에서 다시 열 수 있습니다.</p>
        <button className="btn" onClick={() => {
          try { const data = JSON.parse(localStorage.getItem('stack.cover.' + (sessionStorage.getItem('stack.userId') || 'demo')) || 'null'); if (!data?.drafts?.length) return toast('저장한 자소서 초안이 없어요.'); setSavedCover(data); setBuilder('cover'); } catch { toast('초안을 열 수 없어요.'); }
        }}>저장한 자소서 열기</button>
        <button className="btn" onClick={() => {
          try { const data = JSON.parse(localStorage.getItem('stack.slides.' + (sessionStorage.getItem('stack.userId') || 'demo')) || 'null'); if (!data?.slides?.length) return toast('저장한 포트폴리오 초안이 없어요.'); setSavedSlides(data); setBuilder('slides'); } catch { toast('초안을 열 수 없어요.'); }
        }}>저장한 포트폴리오 열기</button>
      </section>
      {/* EX-05 취업지원처 코칭 */}
      <section className="card row">
        <div className="grow">
          <span className="badge badge--success">수원대 취업지원처 연동</span>
          <div className="t-strong" style={{ fontSize: 14, marginTop: 6 }}>현직 컨설턴트 무료 자소서 코칭</div>
          <div className="t-caption">정리한 초안을 보내고 피드백을 받아요</div>
        </div>
        <button className="btn btn--point btn--sm" onClick={() => toast('코칭 신청은 취업지원처에 문의해 주세요. 현재 앱에서는 접수하지 않습니다.')}>신청하기</button>
      </section>

      {/* EX-01 마스터 경험 보관함 */}
      <section className="stack-8">
        <div className="section-head">
          <h2 className="h-sub">내 마스터 경험 보관함 <span style={{ color: 'var(--blue-600)' }}>{list.length}</span></h2>
        </div>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${filter === f ? 'is-active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        {shown.length === 0 && (
          <div className="card t-body" style={{ textAlign: 'center' }}>아직 저장된 경험이 없어요. 홈에서 파일을 올려 보세요.</div>
        )}
        {shown.map((e) => (
          <button key={e.id} className="card card--click stack-8" onClick={() => setDetail(e)}>
            <div className="row row--between">
              <span className="badge badge--blue">{e.category}</span>
              <span className="badge badge--gray">기여도 {e.contribution === null ? '확인 필요' : e.contribution + '%'}</span>
            </div>
            <div className="t-strong" style={{ fontSize: 15 }}>{e.title}</div>
            <div className="t-caption">{e.summary}</div>
            <div className="row" style={{ marginTop: 2 }}>
              <FileIcon name={e.source} />
              <span className="t-caption grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.source}</span>
              <span className="t-caption">{e.period}</span>
            </div>
          </button>
        ))}
      </section>

    </div>
  );
}

/* EX-02 저장된 경험 상세 — 보관함 맥락의 헤더(← 보관함 / 삭제 / 저장) */
interface ExperienceDetailProps {
  exp: Experience;
  onBack: () => void;
  onSave: (exp: Experience) => void;
  onDelete: () => void;
}

function ExperienceDetail({ exp, onBack, onSave, onDelete }: ExperienceDetailProps) {
  const [form, setForm] = useState<Experience>(exp);
  const [confirm, setConfirm] = useState(false);
  const set = (k: 'title' | 'summary' | 'period') => (v: string) => setForm({ ...form, [k]: v });
  return (
    <div className="screen">
      <SubHeader
        backLabel="보관함"
        onBack={onBack}
        right={
          <>
            <button className="icon-btn" aria-label="삭제" onClick={() => setConfirm(true)}><Icon name="trash" size={16} /></button>
            <button className="btn btn--primary btn--sm" onClick={() => onSave(form)}>저장</button>
          </>
        }
      />
      <section className="card stack-12">
        <div className="row row--between">
          <span className="badge badge--blue">{form.category}</span>
          <span className="badge badge--navy">기여도 {form.contribution === null ? '확인 필요' : form.contribution + '%'}</span>
        </div>
        <EditableField label="제목" value={form.title} onChange={set('title')} />
        <EditableField label="한 줄 요약" value={form.summary} onChange={set('summary')} long />
        <EditableField label="활동 기간" value={form.period} onChange={set('period')} />
        <div className="field">
          <div className="field__label">원본 파일</div>
          <div className="file-row" style={{ padding: 10 }}>
            <FileIcon name={form.source} />
            <span className="t-strong" style={{ fontSize: 13 }}>{form.source}</span>
          </div>
        </div>
      </section>
      {confirm && (
        <Sheet center onClose={() => setConfirm(false)}>
          <h2 className="h-title">이 경험을 삭제할까요?</h2>
          <p className="t-body">삭제하면 연결된 원본 파일 기록도 함께 지워져요.</p>
          <div className="grid-2">
            <button className="btn btn--ghost" onClick={() => setConfirm(false)}>취소</button>
            <button className="btn btn--point" onClick={onDelete}>삭제</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
