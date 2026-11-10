import { demoMode } from '../services/http';
import { useState } from 'react';
import Icon, { type IconName } from '../components/Icon';
import type { Experience, Profile } from '../types';

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
  const [optionalAI, setOptionalAI] = useState(false);
  const [jobAlerts, setJobAlerts] = useState(true);
  const [peerStats, setPeerStats] = useState(true);
  const [reason, setReason] = useState('원하는 기능이 없어요');
  const [withdrawAgreed, setWithdrawAgreed] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const back = () => {
    if (route === 'menu') onClose();
    else if (route === 'privacyPolicy' || route === 'terms' || route === 'aiPolicy' || route === 'consents' || route === 'account') setRoute('privacy');
    else if (route === 'guideDetail') setRoute('guide');
    else setRoute('menu');
  };

  const downloadData = () => {
    const payload = JSON.stringify({ profile, experiences }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'STACK_my_data.json';
    anchor.click();
    URL.revokeObjectURL(url);
    onToast('내 데이터 파일을 내려받았어요');
  };

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
      {!demoMode && <p className="notice notice--point" role="status">이 화면은 아직 샘플 데이터입니다. 서버 연동 전입니다.</p>}
        {route === 'menu' && <SettingsMenu onNavigate={setRoute} />}
        {route === 'privacy' && <PrivacyHub onNavigate={setRoute} />}
        {(route === 'privacyPolicy' || route === 'terms' || route === 'aiPolicy') && <PolicyPage page={route} />}
        {route === 'consents' && (
          <ConsentHistory optionalAI={optionalAI} setOptionalAI={setOptionalAI} jobAlerts={jobAlerts} setJobAlerts={setJobAlerts} peerStats={peerStats} setPeerStats={setPeerStats} onNavigate={setRoute} />
        )}
        {route === 'account' && <AccountManagement onNavigate={setRoute} onEditProfile={onEditProfile} onDownload={downloadData} />}
        {route === 'school' && <SchoolPage profile={profile} onEditProfile={onEditProfile} onToast={onToast} />}
        {route === 'guide' && <GuidePage onNavigate={setRoute} onGoHome={onGoHome} />}
        {route === 'guideDetail' && <GuideDetail onGoHome={onClose} />}
        {route === 'withdraw' && (
          <WithdrawPage reason={reason} setReason={setReason} agreed={withdrawAgreed} setAgreed={setWithdrawAgreed} onConfirm={() => setConfirmWithdraw(true)} />
        )}
        {route === 'withdrawComplete' && <WithdrawComplete onClose={onClose} />}
      </div>

      {confirmWithdraw && (
        <div className="settings-confirm-backdrop" role="presentation">
          <div className="settings-confirm" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-confirm-title">
            <span className="settings-confirm__icon"><Icon name="info" size={22} /></span>
            <h2 id="withdraw-confirm-title">정말 탈퇴할까요?</h2>
            <p>저장한 경험, 업로드한 파일, 서류 초안이 모두 삭제되고 되돌릴 수 없어요.</p>
            <div className="grid-2">
              <button className="btn btn--ghost" onClick={() => setConfirmWithdraw(false)}>취소</button>
              <button className="btn btn--danger" onClick={() => { setConfirmWithdraw(false); setRoute('withdrawComplete'); }}>탈퇴하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsMenu({ onNavigate }: { onNavigate: (route: Route) => void }) {
  return (
    <div className="screen settings-content">
      <button className="settings-menu-row" onClick={() => onNavigate('privacy')}><Icon name="shield" /><span><b>개인정보 보호 및 보안</b><small>개인정보 처리방침 · 동의 내역</small></span><Icon name="chevronR" size={16} /></button>
      <button className="settings-menu-row" onClick={() => onNavigate('school')}><Icon name="building" /><span><b>학교 인증 관리 (수원대학교)</b><small>학교 포털 연동 정보 확인</small></span><Icon name="chevronR" size={16} /></button>
      <button className="settings-menu-row" onClick={() => onNavigate('guide')}><Icon name="book" /><span><b>서비스 이용 가이드</b><small>경험 등록 및 AI 분석 이용 방법</small></span><Icon name="chevronR" size={16} /></button>
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
        <SettingsLink icon="list" title="개인정보 수집 및 이용 동의 내역" subtitle="필수 3 · 선택 3 · 선택 항목은 변경 가능" onClick={() => onNavigate('consents')} />
        <SettingsLink icon="user" title="계정 및 개인정보 관리 안내" subtitle="열람 · 정정 · 내려받기 · 삭제 요청 방법" onClick={() => onNavigate('account')} />
      </section>
      <p className="settings-note"><Icon name="info" size={14} /> 정책 문서는 현재 초안이며, 확정된 내용으로 교체할 예정입니다.</p>
    </div>
  );
}

function SettingsLink({ icon, title, subtitle, onClick }: { icon: IconName; title: string; subtitle: string; onClick: () => void }) {
  return <button className="settings-link" onClick={onClick}><span className="settings-link__icon"><Icon name={icon} size={18} /></span><span className="settings-link__copy"><b>{title}</b><small>{subtitle}</small></span><Icon name="chevronR" size={16} /></button>;
}

function PolicyPage({ page }: { page: 'privacyPolicy' | 'terms' | 'aiPolicy' }) {
  const policy = POLICY_CONTENT[page];
  return (
    <div className="screen settings-content">
      <div className="settings-policy-meta">
        <div><span className="badge badge--point">초안 · 확정 전</span><span className="badge badge--blue">버전 v0.1</span></div>
        <small>시행일: 확정 후 기재 · 최종 수정일: 확정 후 기재</small>
      </div>
      <section className="settings-card">
        <p className="settings-eyebrow">목차</p>
        <ol className="settings-toc">{policy.toc.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, '0')}</b>{item}</li>)}</ol>
      </section>
      <section className="settings-card settings-policy-copy">
        <p>{policy.intro}</p>
        {policy.sections.map((section, index) => <article key={section.title}><h2><b>{String(index + 1).padStart(2, '0')}</b>{section.title}</h2><p>{section.body}</p></article>)}
      </section>
    </div>
  );
}

function ConsentHistory({ optionalAI, setOptionalAI, jobAlerts, setJobAlerts, peerStats, setPeerStats, onNavigate }: {
  optionalAI: boolean; setOptionalAI: (value: boolean) => void; jobAlerts: boolean; setJobAlerts: (value: boolean) => void; peerStats: boolean; setPeerStats: (value: boolean) => void; onNavigate: (route: Route) => void;
}) {
  return (
    <div className="screen settings-content">
      <section className="settings-card settings-consent-summary"><Icon name="check" size={20} /><div><b>가입 시 동의한 항목이에요</b><small>최초 동의일 2026.11.03 · 수원대학교 포털 인증으로 가입</small></div></section>
      <section className="settings-card">
        <h2 className="settings-section-title">필수 동의 <span className="badge badge--navy">필수</span></h2>
        {['서비스 이용약관 동의', '개인정보 수집 및 이용 동의', '수원대학교 포털 정보 연동 동의'].map((title) => <div className="consent-row" key={title}><span><b>{title}</b><small>동의일 2026.11.03</small></span><b className="settings-consent-state">동의함</b><button onClick={() => onNavigate(title.startsWith('서비스') ? 'terms' : 'privacyPolicy')}>보기</button></div>)}
        <p className="settings-note"><Icon name="info" size={14} /> 필수 동의는 철회할 수 없어요. 철회를 원하면 회원 탈퇴를 진행해 주세요.</p>
        <button className="settings-text-link" onClick={() => onNavigate('withdraw')}>회원 탈퇴 및 데이터 삭제 →</button>
      </section>
      <section className="settings-card">
        <h2 className="settings-section-title">선택 동의 <span className="badge badge--blue">언제든 변경 가능</span></h2>
        <ConsentToggle title="AI 분석 품질 개선을 위한 데이터 활용" detail="업로드 파일은 개인 식별 정보를 제거하고 활용돼요 (정책 확정 전)" value={optionalAI} onChange={setOptionalAI} />
        <ConsentToggle title="맞춤 공고 · 비교 알림 수신" detail="취업지원처 공고와 알림" value={jobAlerts} onChange={setJobAlerts} />
        <ConsentToggle title="유사 사용자 비교 통계 활용" detail="같은 학년 비교 기능 오픈 시 익명 통계로만 사용" value={peerStats} onChange={setPeerStats} />
      </section>
    </div>
  );
}

function ConsentToggle({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <div className="consent-toggle"><div><b>{title}</b><small>{detail}</small><small>{value ? '2026.11.03 동의' : '미동의'}</small></div><button className={`toggle ${value ? 'is-on' : ''}`} role="switch" aria-checked={value} aria-label={title} onClick={() => onChange(!value)}><span /></button></div>;
}

function AccountManagement({ onNavigate, onEditProfile, onDownload }: { onNavigate: (route: Route) => void; onEditProfile: () => void; onDownload: () => void }) {
  return (
    <div className="screen settings-content">
      <p className="t-body">내 정보를 확인하고, 고치고, 내려받거나 삭제를 요청하는 방법이에요.</p>
      <AccountCard icon="search" title="내 정보 확인" detail="프로필과 학교 인증 정보는 설정에서 바로 확인할 수 있어요." action="학교 인증 관리 →" onClick={() => onNavigate('school')} />
      <AccountCard icon="edit" title="정보 수정" detail="희망 직무·목표 기업은 직접 수정할 수 있어요. 학과·학년은 수원대학교 포털 연동 정보라 직접 수정할 수 없어요." action="프로필 수정 →" onClick={onEditProfile} />
      <AccountCard icon="download" title="내 데이터 내려받기" detail="저장한 경험과 서류 초안을 파일로 받을 수 있어요." action="요청하기 →" onClick={onDownload} />
      <AccountCard icon="info" title="처리 정지 · 삭제 요청" detail="개인정보 처리 정지나 삭제를 요청할 수 있어요. 계정 전체 삭제는 회원 탈퇴로 진행돼요." action="회원 탈퇴 및 데이터 삭제 →" onClick={() => onNavigate('withdraw')} />
      <p className="settings-note"><Icon name="mail" size={14} /> 개인정보 보호책임자 · 문의처<br />담당자와 연락처는 서비스 확정 후 기재돼요.</p>
    </div>
  );
}

function AccountCard({ icon, title, detail, action, onClick }: { icon: IconName; title: string; detail: string; action: string; onClick: () => void }) {
  return <section className="settings-card settings-account-card"><span className="settings-link__icon"><Icon name={icon} size={18} /></span><div><b>{title}</b><p>{detail}</p><button className="settings-text-link" onClick={onClick}>{action}</button></div></section>;
}

function SchoolPage({ profile, onEditProfile, onToast }: { profile: Profile; onEditProfile: () => void; onToast: (message: string) => void }) {
  return (
    <div className="screen settings-content">
      <section className="settings-card school-card">
        <div className="school-card__title"><span className="school-emblem"><Icon name="graduation" size={22} /></span><span><small>인증 학교</small><b>수원대학교</b></span><span className="badge badge--success">✓ 인증 완료</span></div>
        <div className="divider" />
        <p className="settings-eyebrow">포털 연동 정보</p>
        <LockedInfo label="학과" value={profile.department} />
        <LockedInfo label="학년" value={profile.grade} />
        <p className="settings-note"><Icon name="lock" size={14} /> 학과와 학년은 수원대학교 포털에서 확인된 값으로 고정돼요. STACK에서 직접 수정할 수 없어요.</p>
        <div className="school-meta"><span>인증 방식<b>수원대학교 포털 간편 인증</b></span><span>인증 일자<b>2026.11.03</b></span><span>최근 갱신<b>2026.11.03</b></span></div>
      </section>
      <section className="settings-card">
        <div className="settings-section-title">직접 수정할 수 있는 정보 <span className="badge badge--blue">학교 인증 정보 아님</span></div>
        <p className="school-profile-row"><span>희망 직무</span><b>{profile.job || '미설정'}</b></p>
        <p className="school-profile-row"><span>목표 기업</span><b>{profile.targetCompany || '미설정'}</b></p>
        <button className="btn btn--soft btn--block" onClick={onEditProfile}><Icon name="edit" size={15} /> 프로필에서 수정하기</button>
      </section>
      <section className="settings-card"><h2 className="h-sub">인증 정보에 문제가 있나요?</h2><p className="t-caption" style={{ marginTop: 6 }}>포털 정보가 최신이 아니거나 학교 인증에 문제가 있다면 문의해 주세요.</p><button className="settings-text-link" onClick={() => onToast('인증 문의 기능은 준비 중이에요')}>인증 문의하기 →</button></section>
    </div>
  );
}

function LockedInfo({ label, value }: { label: string; value: string }) {
  return <div className="locked-info"><Icon name="lock" size={15} /><span><small>{label}</small><b>{value}</b></span><small>포털 연동</small></div>;
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

function WithdrawPage({ reason, setReason, agreed, setAgreed, onConfirm }: { reason: string; setReason: (value: string) => void; agreed: boolean; setAgreed: (value: boolean) => void; onConfirm: () => void }) {
  const reasons = ['자주 사용하지 않아요', '원하는 기능이 없어요', '개인정보가 걱정돼요', '졸업·취업을 했어요', '기타 (직접 입력)'];
  return (
    <div className="screen settings-content">
      <section className="withdraw-warning"><b><Icon name="info" size={17} /> 탈퇴 전 꼭 확인해 주세요</b><ul><li>탈퇴하면 이 계정으로 다시 로그인할 수 없어요.</li><li>삭제된 데이터는 복구할 수 없어요.</li><li>수원대학교 포털 연동이 해제돼요.</li><li>데이터 보관·삭제 시점은 정책 확정 후 안내돼요.</li></ul></section>
      <section className="settings-card"><h2 className="h-sub">삭제되는 데이터</h2>{['저장된 마스터 경험 및 경험 분석 결과', '업로드한 원본 파일', '생성한 이력서 및 포트폴리오 초안', '개인 프로필 및 목표 설정 정보', '기타 개인 계정에 연결된 데이터'].map((item, i) => <p className="delete-item" key={item}><span>{['▣', '▤', '▧', '♙', '▱'][i]}</span>{item}</p>)}</section>
      <section className="settings-card"><h2 className="h-sub">탈퇴 사유 <small>(선택)</small></h2>{reasons.map((item) => <label className="radio-row" key={item}><input type="radio" name="withdraw-reason" checked={reason === item} onChange={() => setReason(item)} />{item}</label>)}</section>
      <label className="withdraw-agree"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />위 내용을 모두 확인했으며, 계정과 데이터 삭제에 동의합니다.</label>
      <button className="btn btn--danger btn--block" disabled={!agreed} onClick={onConfirm}>탈퇴 진행하기</button>
    </div>
  );
}

function WithdrawComplete({ onClose }: { onClose: () => void }) {
  return <div className="withdraw-complete"><span><Icon name="check" size={30} /></span><h2>탈퇴가 완료되었어요</h2><p>그동안 STACK을 이용해 주셔서 감사합니다.</p><small>데이터 삭제는 처리 정책에 따라 진행돼요. (정책 확정 후 안내)</small><button className="btn btn--primary btn--block" onClick={onClose}>로그인 화면으로</button><small>3초 후 로그인 화면으로 자동 이동해요</small></div>;
}
