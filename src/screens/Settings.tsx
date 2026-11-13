import { demoMode } from '../services/http';
import { useEffect, useState } from 'react';
import Icon, { type IconName } from '../components/Icon';
import { backend, logout, setSession } from '../services/backend';
import type { Experience, Profile } from '../types';

/* ---------- 서버 데이터 (데모 모드에서는 이 기기 값만 써요) ---------- */
type Consents = { termsAgreedAt: string; privacyAgreedAt: string; aiQualityImprovement: boolean; jobAlert: boolean; publicCareerProfile: boolean; updatedAt: string };
type ConsentKey = 'aiQualityImprovement' | 'jobAlert' | 'publicCareerProfile';
type Verification = { verified: boolean; schoolEmail: string; verifiedAt: string | null; studentId: string | null };
type Policy = { type: string; version: string; effectiveDate: string; body: string };
type PolicyPageId = 'privacyPolicy' | 'terms' | 'aiPolicy';
const POLICY_TYPE: Record<PolicyPageId, string> = { privacyPolicy: 'privacy', terms: 'terms', aiPolicy: 'ai-data' };

const ymd = (iso?: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '-');
const errText = (e: unknown) => (e instanceof Error ? e.message : '요청에 실패했어요.');

function useServer<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!path) return;
    let alive = true;
    backend<T>(path).then((v) => { if (alive) setData(v); }).catch((e) => { if (alive) setError(errText(e)); });
    return () => { alive = false; };
  }, [path]);
  return { data, setData, error };
}

// 서버 본문 형식: 안내문 + "## 제목\n내용" 묶음
function parsePolicy(body: string) {
  const [intro, ...rest] = body.split(/\n*^## /m);
  const sections = rest.map((chunk) => {
    const [title, ...lines] = chunk.split('\n');
    return { title: title.trim(), body: lines.join('\n').trim() };
  });
  return { intro: intro.trim(), sections, toc: sections.map((x) => x.title) };
}

type Route = 'menu' | 'privacy' | 'privacyPolicy' | 'terms' | 'aiPolicy' | 'consents' | 'account' | 'school' | 'guide' | 'guideDetail' | 'withdraw' | 'withdrawComplete';

interface SettingsProps {
  profile: Profile;
  experiences: Experience[];
  onClose: () => void;
  onGoHome: () => void;
  onEditProfile: () => void;
  onToast: (message: string) => void;
}

const POLICY_CONTENT: Record<'privacyPolicy' | 'terms' | 'aiPolicy', { title: string; toc: string[]; intro: string; sections: { title: string; body: string }[] }> = {
  privacyPolicy: {
    title: '개인정보 처리방침',
    toc: ['수집하는 개인정보 항목', '수집 및 이용 목적', '보유 및 이용 기간', '개인정보의 파기', '제3자 제공 및 처리 위탁', '이용자의 권리와 행사 방법', '안전성 확보 조치', '개인정보 보호책임자 및 문의처'],
    intro: 'STACK(이하 “서비스”)은 이용자의 개인정보를 소중히 다루며, 개인정보 보호법에 따라 개인정보를 어떻게 처리하는지 안내합니다.',
    sections: [
      { title: '수집하는 개인정보 항목', body: '필수: 학번, 이름, 소속 학과, 학년(수원대학교 포털 인증으로 확인)\n서비스 이용 중: 희망 직무, 목표 기업, 업로드한 파일과 AI 분석 결과\n자동 수집: 접속 기록, 기기 정보, 서비스 이용 기록' },
      { title: '수집 및 이용 목적', body: '수원대학교 재학생·졸업생 본인 확인과 회원 관리, 경험 자료 정리, 맞춤 공고 제공 및 AI 분석 결과 생성에 이용합니다.' },
      { title: '보유 및 이용 기간', body: '회원 탈퇴 시 개인정보를 지체 없이 파기합니다. 관계 법령에 따라 보관이 필요한 정보는 해당 법령에서 정한 기간 동안 보관합니다.' },
      { title: '개인정보의 파기', body: '목적이 달성된 개인정보는 복구할 수 없는 방법으로 파기합니다.' },
      { title: '제3자 제공 및 처리 위탁', body: '서비스 운영에 필요한 경우 제공 항목과 수탁자, 목적을 사전에 안내하고 동의를 받습니다.' },
      { title: '이용자의 권리와 행사 방법', body: '이용자는 개인정보 열람, 정정, 삭제 및 처리 정지를 요청할 수 있습니다. 서비스 내 계정 관리 또는 문의를 이용해 주세요.' },
      { title: '안전성 확보 조치', body: '개인정보의 안전한 처리를 위해 접근 통제와 보호 조치를 적용합니다.' },
      { title: '개인정보 보호책임자 및 문의처', body: '개인정보 관련 문의는 서비스 내 문의 경로를 통해 접수해 주세요.' },
    ],
  },
  terms: {
    title: '서비스 이용약관',
    toc: ['제1조 (목적)', '제2조 (용어의 정의)', '제3조 (약관의 효력 및 변경)', '제4조 (서비스의 제공 및 변경)', '제5조 (회원의 의무)', '제6조 (이용 제한 및 계약 해지)'],
    intro: 'STACK 서비스를 이용하기 전에 아래 약관을 확인해 주세요. 회원 가입 시 약관에 동의한 것으로 봅니다.',
    sections: [
      { title: '제1조 (목적)', body: '이 약관은 STACK의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정하는 것을 목적으로 합니다.' },
      { title: '제2조 (용어의 정의)', body: '회원은 수원대학교 포털 인증을 마치고 약관에 동의한 이용자입니다. 마스터 경험은 회원이 올린 파일을 바탕으로 정리·저장한 경험 기록입니다.' },
      { title: '제3조 (약관의 효력 및 변경)', body: '약관은 서비스 화면에 게시하고 이용자가 동의하면 효력이 발생합니다. 약관을 바꿀 때에는 시행일과 변경 내용을 사전에 안내합니다.' },
      { title: '제4조 (서비스의 제공 및 변경)', body: '서비스는 경험 자료의 정리, 분석 결과 제공, 공고 탐색 기능을 제공합니다. 운영상 필요한 경우 일부 기능이 변경될 수 있습니다.' },
      { title: '제5조 (회원의 의무)', body: '회원은 타인의 권리를 침해하거나 서비스 운영을 방해하는 방식으로 서비스를 이용해서는 안 됩니다.' },
      { title: '제6조 (이용 제한 및 계약 해지)', body: '회원은 언제든지 회원 탈퇴를 요청할 수 있습니다. 탈퇴가 완료되면 서비스 이용 계약이 종료됩니다.' },
    ],
  },
  aiPolicy: {
    title: 'AI 데이터 처리 및 활용 안내',
    toc: ['AI가 처리하는 데이터', '처리 목적 (경험 추출·서류 초안 생성)', '외부 AI 서비스 이용 여부', '학습 활용 여부와 선택권', 'AI 결과의 한계와 사용자 확인', '문의 및 처리 중단 요청'],
    intro: 'STACK은 경험 정리와 서류 초안 작성을 돕기 위해 AI를 사용합니다. AI가 어떤 데이터를 어떻게 다루는지 안내합니다.',
    sections: [
      { title: 'AI가 처리하는 데이터', body: '업로드한 파일(PPT·PDF·문서·이미지), 직접 입력한 메모와 목표 공고, 저장된 마스터 경험을 처리할 수 있습니다.' },
      { title: '처리 목적 (경험 추출·서류 초안 생성)', body: '파일에서 경험·역할·성과·역량을 추출하고, 이력서·포트폴리오·자기소개서 초안을 만드는 데 사용합니다.' },
      { title: '외부 AI 서비스 이용 여부', body: '분석에 외부 AI 서비스를 사용할 수 있으며, 이용하는 서비스와 데이터 보관 여부는 확정 후 안내합니다.' },
      { title: '학습 활용 여부와 선택권', body: 'AI 분석 품질 개선을 위한 데이터 활용은 동의 내역에서 선택할 수 있습니다.' },
      { title: 'AI 결과의 한계와 사용자 확인', body: 'AI 결과에는 오류나 누락이 있을 수 있습니다. 제출 전에 내용을 확인하고 직접 수정해 주세요.' },
      { title: '문의 및 처리 중단 요청', body: 'AI 데이터 처리에 대한 문의와 중단 요청은 서비스 내 문의 경로를 이용해 주세요.' },
    ],
  },
};

export default function SettingsScreen({ profile, experiences, onClose, onGoHome, onEditProfile, onToast }: SettingsProps) {
  const [route, setRoute] = useState<Route>('menu');
  const [reason, setReason] = useState('');
  const [withdrawAgreed, setWithdrawAgreed] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const consents = useServer<Consents>(demoMode ? null : '/users/me/consents');
  const verification = useServer<Verification>(demoMode ? null : '/users/me/school-verification');
  const [demoConsents, setDemoConsents] = useState({ aiQualityImprovement: false, jobAlert: false, publicCareerProfile: false });

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await work(); } catch (e) { onToast(errText(e)); } finally { setBusy(false); }
  };
  const toggleConsent = (key: ConsentKey, value: boolean) => {
    if (demoMode) return setDemoConsents({ ...demoConsents, [key]: value });
    void run(async () => {
      consents.setData(await backend<Consents>('/users/me/consents', { method: 'PATCH', body: JSON.stringify({ [key]: value }) }));
      onToast(value ? '동의했어요' : '동의를 철회했어요');
    });
  };
  // 탈퇴: 서버에서 계정·파일·데이터를 지운 뒤 완료 화면 → 로그인 화면
  const withdraw = () => run(async () => {
    if (!demoMode) await backend('/users/me', { method: 'DELETE' });
    setConfirmWithdraw(false);
    setRoute('withdrawComplete');
  });
  const finishWithdraw = () => (demoMode ? onClose() : setSession(null));

  const back = () => {
    if (route === 'menu') onClose();
    else if (route === 'privacyPolicy' || route === 'terms' || route === 'aiPolicy' || route === 'consents' || route === 'account') setRoute('privacy');
    else if (route === 'guideDetail') setRoute('guide');
    else setRoute('menu');
  };

  // 서버에 저장된 내 데이터 전체(프로필·동의·파일 목록·경험·공고·자소서·포폴·선배 질문)를 JSON으로
  const downloadData = () => void run(async () => {
    const data = demoMode ? { profile, experiences } : await backend('/users/me/data-export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'STACK_my_data.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('내 데이터 파일을 내려받았어요');
  });

  const pageTitle: Partial<Record<Route, string>> = {
    menu: '설정 및 계정 관리', privacy: '개인정보 보호 및 보안', privacyPolicy: '개인정보 처리방침', terms: '서비스 이용약관',
    aiPolicy: 'AI 데이터 처리 및 활용 안내', consents: '동의 내역', account: '계정·개인정보 관리', school: '학교 인증 관리',
    guide: '서비스 이용 가이드', guideDetail: '경험 등록 방법', withdraw: '회원 탈퇴', withdrawComplete: '탈퇴 완료',
  };

  return (
    <div className="settings-route">
      <header className="settings-topbar">
        {route !== 'withdrawComplete' && (
          <button className="back-btn" onClick={back} aria-label={route === 'menu' ? '설정 닫기' : '뒤로'}>
            <Icon name="chevronL" size={18} /> {route === 'menu' ? '닫기' : route === 'privacyPolicy' || route === 'terms' || route === 'aiPolicy' || route === 'consents' || route === 'account' ? '개인정보 보호' : route === 'guideDetail' ? '이용 가이드' : '설정'}
          </button>
        )}
        <h1>{pageTitle[route]}</h1>
      </header>

      <div className="settings-route__scroll">
        {route === 'menu' && <SettingsMenu onNavigate={setRoute} busy={busy} onLogout={() => void run(() => logout())} />}
        {route === 'privacy' && <PrivacyHub onNavigate={setRoute} />}
        {(route === 'privacyPolicy' || route === 'terms' || route === 'aiPolicy') && <PolicyPage key={route} page={route} />}
        {route === 'consents' && (
          demoMode ? <ConsentHistory consents={{ termsAgreedAt: '', privacyAgreedAt: '', updatedAt: '', ...demoConsents }} verifiedAt={null} busy={busy} onToggle={toggleConsent} onNavigate={setRoute} />
            : consents.data ? <ConsentHistory consents={consents.data} verifiedAt={verification.data?.verifiedAt ?? null} busy={busy} onToggle={toggleConsent} onNavigate={setRoute} />
              : <p className="t-caption" role={consents.error ? 'alert' : 'status'}>{consents.error || '동의 내역을 불러오는 중'}</p>
        )}
        {route === 'account' && <AccountManagement onNavigate={setRoute} onEditProfile={onEditProfile} onDownload={downloadData} />}
        {route === 'school' && <SchoolPage profile={profile} verification={verification.data} error={verification.error} onEditProfile={onEditProfile} busy={busy} onReverify={() => void run(() => logout())} />}
        {route === 'guide' && <GuidePage onNavigate={setRoute} onGoHome={onGoHome} />}
        {route === 'guideDetail' && <GuideDetail onGoHome={onClose} />}
        {route === 'withdraw' && (
          <WithdrawPage reason={reason} setReason={setReason} agreed={withdrawAgreed} setAgreed={setWithdrawAgreed} onConfirm={() => setConfirmWithdraw(true)} counts={{ experiences: experiences.length }} />
        )}
        {route === 'withdrawComplete' && <WithdrawComplete onDone={finishWithdraw} />}
      </div>

      {confirmWithdraw && (
        <div className="settings-confirm-backdrop" role="presentation">
          <div className="settings-confirm" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-confirm-title">
            <span className="settings-confirm__icon"><Icon name="info" size={22} /></span>
            <h2 id="withdraw-confirm-title">정말 탈퇴할까요?</h2>
            <p>저장한 경험, 업로드한 파일, 서류 초안이 모두 삭제되고 되돌릴 수 없어요.</p>
            <div className="grid-2">
              <button className="btn btn--ghost" disabled={busy} onClick={() => setConfirmWithdraw(false)}>취소</button>
              <button className="btn btn--danger" disabled={busy} onClick={() => void withdraw()}>{busy ? '삭제 중' : '탈퇴하기'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsMenu({ onNavigate, onLogout, busy }: { onNavigate: (route: Route) => void; onLogout: () => void; busy: boolean }) {
  return (
    <div className="screen settings-content">
      <button className="settings-menu-row" onClick={() => onNavigate('privacy')}><Icon name="shield" /><span><b>개인정보 보호 및 보안</b><small>개인정보 처리방침 · 동의 내역</small></span><Icon name="chevronR" size={16} /></button>
      <button className="settings-menu-row" onClick={() => onNavigate('school')}><Icon name="building" /><span><b>학교 인증 관리 (수원대학교)</b><small>학교 메일 인증 정보 확인</small></span><Icon name="chevronR" size={16} /></button>
      <button className="settings-menu-row" onClick={() => onNavigate('guide')}><Icon name="book" /><span><b>서비스 이용 가이드</b><small>경험 등록 및 AI 분석 이용 방법</small></span><Icon name="chevronR" size={16} /></button>
      {!demoMode && <button className="settings-menu-row" disabled={busy} onClick={onLogout}><Icon name="logout" /><span><b>로그아웃</b><small>이 기기에서 로그아웃해요</small></span><Icon name="chevronR" size={16} /></button>}
      <button className="settings-menu-row is-danger" onClick={() => onNavigate('withdraw')}><Icon name="trash" /><span><b>회원 탈퇴 및 데이터 삭제</b><small>탈퇴 전 삭제 정보를 확인해 주세요</small></span><Icon name="chevronR" size={16} /></button>
    </div>
  );
}

function PrivacyHub({ onNavigate }: { onNavigate: (route: Route) => void }) {
  return (
    <div className="screen settings-content">
      <p className="t-caption">STACK의 정책 문서와 내가 동의한 내역을 확인할 수 있어요.</p>
      <section className="settings-card">
        <p className="settings-eyebrow">정책 및 약관</p>
        <SettingsLink icon="shield" title="개인정보 처리방침" subtitle="시행일 확정 전 · 초안" onClick={() => onNavigate('privacyPolicy')} />
        <SettingsLink icon="info" title="서비스 이용약관" subtitle="시행일 확정 전 · 초안" onClick={() => onNavigate('terms')} />
        <SettingsLink icon="sparkle" title="AI 데이터 처리 및 활용 안내" subtitle="업로드 파일·분석 결과를 AI가 다루는 방식" onClick={() => onNavigate('aiPolicy')} />
      </section>
      <section className="settings-card">
        <p className="settings-eyebrow">내 정보</p>
        <SettingsLink icon="list" title="개인정보 수집 및 이용 동의 내역" subtitle="필수 2 · 선택 3 · 선택 항목은 변경 가능" onClick={() => onNavigate('consents')} />
        <SettingsLink icon="user" title="계정 및 개인정보 관리 안내" subtitle="열람 · 정정 · 내려받기 · 삭제 요청 방법" onClick={() => onNavigate('account')} />
      </section>
      <p className="settings-note"><Icon name="info" size={14} /> 정책 문서는 현재 초안이며, 확정된 내용으로 교체할 예정입니다.</p>
    </div>
  );
}

function SettingsLink({ icon, title, subtitle, onClick }: { icon: IconName; title: string; subtitle: string; onClick: () => void }) {
  return <button className="settings-link" onClick={onClick}><span className="settings-link__icon"><Icon name={icon} size={18} /></span><span className="settings-link__copy"><b>{title}</b><small>{subtitle}</small></span><Icon name="chevronR" size={16} /></button>;
}

function PolicyPage({ page }: { page: PolicyPageId }) {
  const server = useServer<Policy>(demoMode ? null : `/policies/${POLICY_TYPE[page]}`);
  if (!demoMode && !server.data) return <p className="t-caption" role={server.error ? 'alert' : 'status'}>{server.error || '문서를 불러오는 중'}</p>;
  const policy = server.data ? { title: POLICY_CONTENT[page].title, ...parsePolicy(server.data.body) } : POLICY_CONTENT[page];
  const version = server.data?.version ?? 'v0.1';
  const draft = version.startsWith('v0.');
  return (
    <div className="screen settings-content">
      <div className="settings-policy-meta">
        <div>{draft && <span className="badge badge--point">초안 · 확정 전</span>}<span className="badge badge--blue">버전 {version}</span></div>
        <small>{server.data ? `기준일 ${ymd(server.data.effectiveDate)}` : '시행일: 확정 후 기재'}{draft && ' · 확정되면 새 버전으로 바뀌어요'}</small>
      </div>
      <section className="settings-card">
        <p className="settings-eyebrow">목차</p>
        <ol className="settings-toc">{policy.toc.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, '0')}</b>{item}</li>)}</ol>
      </section>
      <section className="settings-card settings-policy-copy">
        <p>{policy.intro}</p>
        {policy.sections.map((section, index) => <article key={section.title}><h2><b>{String(index + 1).padStart(2, '0')}</b>{section.title}</h2><p style={{ whiteSpace: 'pre-line' }}>{section.body}</p></article>)}
      </section>
    </div>
  );
}

function ConsentHistory({ consents, verifiedAt, busy, onToggle, onNavigate }: {
  consents: Consents; verifiedAt: string | null; busy: boolean; onToggle: (key: ConsentKey, value: boolean) => void; onNavigate: (route: Route) => void;
}) {
  const required: [string, string, Route][] = [
    ['서비스 이용약관 동의', consents.termsAgreedAt, 'terms'],
    ['개인정보 수집 및 이용 동의', consents.privacyAgreedAt, 'privacyPolicy'],
  ];
  const optional: [ConsentKey, string, string][] = [
    ['aiQualityImprovement', 'AI 분석 품질 개선을 위한 데이터 활용', '업로드 파일·분석 결과를 품질 개선에 쓰는 것에 동의해요 (AI 데이터 처리 안내 참고)'],
    ['jobAlert', '맞춤 공고 알림 수신', '희망 직무에 맞는 교내외 공고 알림을 받아요'],
    ['publicCareerProfile', '커리어 프로필 공개', '내 커리어 정보를 다른 학생에게 보여 주는 것에 동의해요'],
  ];
  return (
    <div className="screen settings-content">
      <section className="settings-card settings-consent-summary"><Icon name="check" size={20} /><div><b>가입 시 동의한 항목이에요</b><small>최초 동의일 {ymd(consents.termsAgreedAt)}{verifiedAt && ` · 학교 메일 인증 ${ymd(verifiedAt)}`}</small></div></section>
      <section className="settings-card">
        <h2 className="settings-section-title">필수 동의 <span className="badge badge--navy">필수</span></h2>
        {required.map(([title, at, page]) => <div className="consent-row" key={title}><span><b>{title}</b><small>동의일 {ymd(at)}</small></span><b className="settings-consent-state">동의함</b><button onClick={() => onNavigate(page)}>보기</button></div>)}
        <p className="settings-note"><Icon name="info" size={14} /> 필수 동의는 철회할 수 없어요. 철회를 원하면 회원 탈퇴를 진행해 주세요.</p>
        <button className="settings-text-link" onClick={() => onNavigate('withdraw')}>회원 탈퇴 및 데이터 삭제 →</button>
      </section>
      <section className="settings-card">
        <h2 className="settings-section-title">선택 동의 <span className="badge badge--blue">언제든 변경 가능</span></h2>
        {optional.map(([key, title, detail]) => <ConsentToggle key={key} title={title} detail={detail} value={consents[key]} at={consents.updatedAt} busy={busy} onChange={(v) => onToggle(key, v)} />)}
        <button className="settings-text-link" onClick={() => onNavigate('aiPolicy')}>AI 데이터 처리 및 활용 안내 보기 →</button>
      </section>
    </div>
  );
}

function ConsentToggle({ title, detail, value, at, busy, onChange }: { title: string; detail: string; value: boolean; at: string; busy: boolean; onChange: (value: boolean) => void }) {
  return <div className="consent-toggle"><div><b>{title}</b><small>{detail}</small><small>{value ? `동의함${at ? ` · ${ymd(at)} 기준` : ''}` : '미동의'}</small></div><button className={`toggle ${value ? 'is-on' : ''}`} role="switch" aria-checked={value} aria-label={title} disabled={busy} onClick={() => onChange(!value)}><span /></button></div>;
}

function AccountManagement({ onNavigate, onEditProfile, onDownload }: { onNavigate: (route: Route) => void; onEditProfile: () => void; onDownload: () => void }) {
  return (
    <div className="screen settings-content">
      <p className="t-body">내 정보를 확인하고, 고치고, 내려받거나 삭제를 요청하는 방법이에요.</p>
      <AccountCard icon="search" title="내 정보 확인" detail="프로필과 학교 인증 정보는 설정에서 바로 확인할 수 있어요." action="학교 인증 관리 →" onClick={() => onNavigate('school')} />
      <AccountCard icon="edit" title="정보 수정" detail="희망 직무·목표 기업은 직접 수정할 수 있어요. 학과는 처음 등록한 뒤에는 바꿀 수 없어요." action="프로필 수정 →" onClick={onEditProfile} />
      <AccountCard icon="download" title="내 데이터 내려받기" detail="서버에 저장된 프로필·동의 내역·경험·공고·자소서·포트폴리오·선배 질문을 JSON 파일로 바로 받아요." action="지금 내려받기 →" onClick={onDownload} />
      <AccountCard icon="info" title="처리 정지 · 삭제 요청" detail="개인정보 처리 정지나 삭제를 요청할 수 있어요. 계정 전체 삭제는 회원 탈퇴로 진행돼요." action="회원 탈퇴 및 데이터 삭제 →" onClick={() => onNavigate('withdraw')} />
      <p className="settings-note"><Icon name="mail" size={14} /> 개인정보 보호책임자 · 문의처<br />담당자와 연락처는 서비스 확정 후 기재돼요.</p>
    </div>
  );
}

function AccountCard({ icon, title, detail, action, onClick }: { icon: IconName; title: string; detail: string; action: string; onClick: () => void }) {
  return <section className="settings-card settings-account-card"><span className="settings-link__icon"><Icon name={icon} size={18} /></span><div><b>{title}</b><p>{detail}</p><button className="settings-text-link" onClick={onClick}>{action}</button></div></section>;
}

function SchoolPage({ profile, verification, error, busy, onEditProfile, onReverify }: {
  profile: Profile; verification: Verification | null; error: string; busy: boolean; onEditProfile: () => void; onReverify: () => void;
}) {
  const v = verification;
  const verified = demoMode || Boolean(v?.verified);
  return (
    <div className="screen settings-content">
      <section className="settings-card school-card">
        <div className="school-card__title"><span className="school-emblem"><Icon name="graduation" size={22} /></span><span><small>인증 학교</small><b>수원대학교</b></span><span className={`badge ${verified ? 'badge--success' : 'badge--point'}`}>{verified ? '✓ 인증 완료' : '인증 필요'}</span></div>
        <div className="divider" />
        {!demoMode && !v && <p className="t-caption" role={error ? 'alert' : 'status'}>{error || '인증 정보를 불러오는 중'}</p>}
        <p className="settings-eyebrow">가입 정보</p>
        <LockedInfo label="학과" value={profile.department} tag="변경 불가" />
        <LockedInfo label="학년" value={profile.grade} tag="가입 시 등록" />
        {v?.studentId && <LockedInfo label="학번" value={v.studentId} tag="로그인 ID" />}
        <p className="settings-note"><Icon name="lock" size={14} /> 학과는 처음 등록한 뒤에는 바꿀 수 없어요. 잘못 등록했다면 아래 안내를 확인해 주세요.</p>
        <div className="school-meta">
          <span>인증 방식<b>수원대 학교 메일 인증 (@suwon.ac.kr)</b></span>
          {v && <span>인증 메일<b>{v.schoolEmail}</b></span>}
          {v && <span>인증 일자<b>{ymd(v.verifiedAt)}</b></span>}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-section-title">직접 수정할 수 있는 정보 <span className="badge badge--blue">학교 인증 정보 아님</span></div>
        <p className="school-profile-row"><span>희망 직무</span><b>{profile.job || '미설정'}</b></p>
        <p className="school-profile-row"><span>목표 기업</span><b>{profile.targetCompany || '미설정'}</b></p>
        <button className="btn btn--soft btn--block" onClick={onEditProfile}><Icon name="edit" size={15} /> 프로필에서 수정하기</button>
      </section>
      <section className="settings-card stack-8">
        <h2 className="h-sub">인증 정보에 문제가 있나요?</h2>
        <p className="t-caption">학교 메일로 다시 인증하려면 로그아웃한 뒤 로그인 화면에서 학교 메일 인증을 진행해 주세요. 학적 정보(학과·학년) 자체가 틀렸다면 수원대 포털에서 확인해 주세요.</p>
        {!demoMode && <button className="settings-text-link" disabled={busy} onClick={onReverify}>로그아웃하고 다시 인증하기 →</button>}
        <a className="settings-text-link" href="https://portal.suwon.ac.kr" target="_blank" rel="noreferrer">수원대 포털 열기 →</a>
      </section>
    </div>
  );
}

function LockedInfo({ label, value, tag }: { label: string; value: string; tag: string }) {
  return <div className="locked-info"><Icon name="lock" size={15} /><span><small>{label}</small><b>{value}</b></span><small>{tag}</small></div>;
}

function GuidePage({ onNavigate, onGoHome }: { onNavigate: (route: Route) => void; onGoHome: () => void }) {
  return (
    <div className="screen settings-content">
      <section className="guide-hero"><span>① STACK 서비스 소개</span><h2>쌓아온 경험을, 필요한 순간 꺼내 쓰다</h2><p>대학생활에서 쌓은 경험을 AI가 정리하고, 이력서·포트폴리오·취업 준비에 바로 활용할 수 있는 서비스예요.</p><div><b>파일 올리기</b><Icon name="arrowR" size={14} /><b>AI 정리</b><Icon name="arrowR" size={14} /><b>서류·질문에 활용</b></div></section>
      <section className="settings-card"><h2 className="h-sub">② 경험 등록 방법</h2><p className="guide-item">파일 업로드 · 발표 자료, 결과 보고서, 수료증 등</p><p className="guide-item">AI가 파일을 분석해 경험과 역량을 추출</p><p className="guide-item">확인이 필요한 정보만 고친 뒤 마스터 경험 보관함에 저장</p><button className="settings-text-link" onClick={() => onNavigate('guideDetail')}>자세한 가이드 보기 →</button></section>
      <section className="settings-card"><h2 className="h-sub">③ AI 활용 모드 안내</h2><p className="t-caption" style={{ marginTop: 6 }}>이력서 · 포트폴리오 · 스펙업은 같은 파일을 목적에 맞게 정리해요.</p><p className="guide-item"><b>이력서 모드</b> 활동·역할·성과·스킬 정리</p><p className="guide-item"><b>포트폴리오 모드</b> 개요·문제·역할·과정·성과 정리</p><p className="guide-item"><b>스펙업 모드</b> 보유 자격·활동 정리, 목표 직무 기준 보완 항목 확인</p><button className="settings-text-link" onClick={onGoHome}>모드 체험하러 가기 →</button></section>
    </div>
  );
}

function GuideDetail({ onGoHome }: { onGoHome: () => void }) {
  const steps = [
    ['파일 올리기', '홈에서 발표 자료(PPT), 결과 보고서(PDF), 수료증(이미지) 등을 올려요. 최대 5개, 파일당 20MB까지 가능해요.', 'PPT · PDF · DOCX · HWP · 이미지'],
    ['AI 분석', '이력서·포트폴리오·스펙업 중 모드를 고르면, AI가 파일 속 경험·성과·역량을 찾아 그 모드에 맞게 정리해요.'],
    ['확인 후 저장', '주황색 “확인 필요” 칸만 확인해서 고친 뒤, 마스터 경험 보관함에 저장해요.'],
  ];
  return (
    <div className="screen settings-content">
      <p className="t-caption">3단계면 끝나요. 직접 많이 쓰지 않아도 돼요.</p>
      {steps.map(([title, desc, tags], index) => <section className="settings-card guide-detail-card" key={title}><span className="guide-step-number">{index + 1}</span><div><h2 className="h-sub">{title}</h2><p className="t-caption">{desc}</p>{tags && <div className="guide-tags">{tags.split(' · ').map((tag) => <span className="badge badge--blue" key={tag}>{tag}</span>)}</div>}</div></section>)}
      <section className="settings-card"><h2 className="h-sub">이런 파일이 잘 정리돼요</h2><ul className="settings-bullets"><li>역할과 성과 수치가 들어간 발표 자료</li><li>팀원·기간이 적힌 결과 보고서</li><li>발급 기관이 보이는 수료증·자격증</li></ul></section>
      <button className="btn btn--primary btn--block" onClick={onGoHome}><Icon name="upload" size={16} /> 지금 파일 올리러 가기</button>
    </div>
  );
}

function WithdrawPage({ reason, setReason, agreed, setAgreed, onConfirm, counts }: {
  reason: string; setReason: (value: string) => void; agreed: boolean; setAgreed: (value: boolean) => void; onConfirm: () => void; counts: { experiences: number };
}) {
  const reasons = ['자주 사용하지 않아요', '원하는 기능이 없어요', '개인정보가 걱정돼요', '졸업·취업을 했어요', '기타 (직접 입력)'];
  const [other, setOther] = useState('');
  const items: [IconName, string][] = [
    ['list', `저장된 마스터 경험 ${counts.experiences}개 및 경험 분석 결과`], ['upload', '업로드한 원본 파일'],
    ['edit', '생성한 자기소개서 및 포트폴리오 초안'], ['user', '개인 프로필 및 목표 설정 정보'], ['info', '동의 내역 · 선배에게 남긴 질문 등 계정에 연결된 데이터'],
  ];
  return (
    <div className="screen settings-content">
      <section className="withdraw-warning"><b><Icon name="info" size={17} /> 탈퇴 전 꼭 확인해 주세요</b><ul><li>탈퇴하면 이 계정으로 다시 로그인할 수 없어요.</li><li>삭제된 데이터는 복구할 수 없어요.</li><li>탈퇴 즉시 서버의 계정과 데이터가 함께 삭제돼요.</li><li>필요한 자료는 먼저 '계정·개인정보 관리'에서 내려받아 두세요.</li></ul></section>
      <section className="settings-card"><h2 className="h-sub">삭제되는 데이터</h2>{items.map(([icon, item]) => <p className="delete-item" key={item}><Icon name={icon} size={16} />{item}</p>)}</section>
      <section className="settings-card"><h2 className="h-sub">탈퇴 사유 <small>(선택)</small></h2>{reasons.map((item) => <label className="radio-row" key={item}><input type="radio" name="withdraw-reason" checked={reason === item} onChange={() => setReason(item)} />{item}</label>)}
        {reason.startsWith('기타') && <textarea className="input" aria-label="탈퇴 사유 직접 입력" maxLength={300} placeholder="불편했던 점을 알려 주세요" value={other} onChange={(e) => setOther(e.target.value)} />}
      </section>
      <label className="withdraw-agree"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />위 내용을 모두 확인했으며, 계정과 데이터 삭제에 동의합니다.</label>
      <button className="btn btn--danger btn--block" disabled={!agreed} onClick={onConfirm}>탈퇴 진행하기</button>
    </div>
  );
}

function WithdrawComplete({ onDone }: { onDone: () => void }) {
  const [left, setLeft] = useState(3);
  useEffect(() => {
    if (left <= 0) { onDone(); return; }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onDone]);
  return <div className="withdraw-complete"><span><Icon name="check" size={30} /></span><h2>탈퇴가 완료되었어요</h2><p>그동안 STACK을 이용해 주셔서 감사합니다.</p><small>계정과 저장된 데이터가 서버에서 삭제되었어요.</small><button className="btn btn--primary btn--block" onClick={onDone}>로그인 화면으로</button><small>{left}초 후 로그인 화면으로 자동 이동해요</small></div>;
}
