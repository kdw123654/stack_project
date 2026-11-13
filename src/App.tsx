import { LiveMindmap } from './screens/LiveData';
import Login from './screens/Login';
import { demoMode } from './services/http';
import { getSession, loadMe, listExperiences, saveTarget, logout } from './services/backend';
import BasicInfo from './screens/BasicInfo';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import Icon from './components/Icon';
import { AppHeader, TabBar, Sheet, Toast } from './components/Layout';
import Home from './screens/Home';
import MyExperience from './screens/MyExperience';
import Explore from './screens/Explore';
import Mindmap from './screens/Mindmap';
import Splash from './screens/Splash';
import SettingsScreen from './screens/Settings';
import { HeaderContext } from './components/HeaderContext';
import { initialProfile, JOB_SUGGESTIONS, experiences as seedExperiences } from './data/mock';
import type { Experience, Profile, TabId, Toast as ToastFn } from './types';

type ModalId = 'profile' | null;

export default function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(getSession()));
  const [loading, setLoading] = useState(!demoMode && Boolean(getSession()));
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<TabId>('home');
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [experiences, setExperiences] = useState<Experience[]>(demoMode ? seedExperiences : []);
  const [modal, setModal] = useState<ModalId>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [booting, setBooting] = useState(true); // CM-01 스플래시
  const [hideHeader, setHideHeader] = useState(false);
  const [needsBasicInfo, setNeedsBasicInfo] = useState(false);
  const [suggestedGrade, setSuggestedGrade] = useState<number | null>(null);
  const toast = useCallback<ToastFn>((msg) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(''), 1800);
  }, []);

  useEffect(() => {
    const changed = () => setAuthenticated(Boolean(getSession()));
    window.addEventListener('stack-auth', changed);
    return () => window.removeEventListener('stack-auth', changed);
  }, []);
  useEffect(() => {
    if (demoMode || !authenticated) return;
    let active = true;
    setLoading(true); setLoadError(''); setExperiences([]);
    Promise.all([loadMe(), listExperiences()]).then(([me, e]) => {
      if (active) { setProfile(me.profile); setNeedsBasicInfo(me.needsBasicInfo); setSuggestedGrade(me.suggestedGrade); setExperiences(e); }
    }).catch(e => { if (active) setLoadError(e instanceof Error ? e.message : '정보를 불러오지 못했어요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authenticated, reload]);
  const persistTarget = async (p: Profile) => {
    try { setProfile(demoMode ? p : await saveTarget(p)); setModal(null); toast('목표를 저장했어요'); }
    catch (e) { toast(e instanceof Error ? e.message : '저장에 실패했어요.'); }
  };
  if (!demoMode && !authenticated) return <Login />;
  if (!demoMode && (loading || loadError)) return <div className="screen"><p role="status">{loadError || '내 정보를 불러오는 중'}</p>{loadError && <button className="btn" onClick={() => setReload(n => n + 1)}>다시 시도</button>}<button className="link" onClick={() => void logout().catch(() => {})}>로그아웃</button></div>;
  if (!demoMode && needsBasicInfo) return <BasicInfo suggestedGrade={suggestedGrade} onSaved={p => { setProfile(p); setNeedsBasicInfo(false); }} />;
  const screens: Record<TabId, ReactElement> = {
    home: (
      <Home
        profile={profile}
        onEditProfile={() => setModal('profile')}
        goTab={setTab}
        onSaved={(exp) => {
          setExperiences((prev) => [exp, ...prev]);
          toast('마스터 경험 보관함에 저장했어요');
        }}
      />
    ),
    experience: <MyExperience list={experiences} setList={setExperiences} toast={toast} />,
    explore: <Explore profile={profile} goTab={setTab} toast={toast} />,
    mindmap: demoMode ? <Mindmap profile={profile} setProfile={p => { void persistTarget(p); }} goTab={setTab} toast={toast} /> : <LiveMindmap key={profile.job + profile.targetCompany} profile={profile} experiences={experiences} editTarget={() => setModal('profile')} />,
  };

  return (
    <div className="app">
      {/* 메인 탭: 로고 헤더가 내용과 함께 스크롤되어 사라짐 / 상세 화면: 헤더 숨김 + 뒤로 줄 고정 */}
      <HeaderContext.Provider value={setHideHeader}>
        <main key={tab} className="scroller">
          {settingsOpen ? (
            <SettingsScreen
              profile={profile}
              experiences={experiences}
              onClose={() => setSettingsOpen(false)}
              onGoHome={() => { setTab('home'); setSettingsOpen(false); setHideHeader(false); }}
              onEditProfile={() => setModal('profile')}
              onToast={toast}
            />
          ) : (
            <>
              {!hideHeader && <AppHeader profile={profile} onMenu={() => { setHideHeader(false); setSettingsOpen(true); }} />}
              {screens[tab]}
            </>
          )}
        </main>
      </HeaderContext.Provider>
      <TabBar active={tab} onChange={setTab} />

      {modal === 'profile' && (
        <ProfileModal
          profile={profile}
          onClose={() => setModal(null)}
          onSave={p => { void persistTarget(p); }}
        />
      )}
      <Toast message={toastMsg} />
      {booting && <Splash onDone={() => setBooting(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
 * CM-03 프로필 설정
 * - 소속 학과·학년: 수원대학교 포털 연동 값 → 읽기 전용
 * - 희망 직무·목표 기업: 사용자가 직접 텍스트 입력 (추천 칩은 보조 수단)
 * --------------------------------------------------------- */
interface ProfileModalProps {
  profile: Profile;
  onClose: () => void;
  onSave: (profile: Profile) => void;
}

function ProfileModal({ profile, onClose, onSave }: ProfileModalProps) {
  const [job, setJob] = useState(profile.job);
  const [company, setCompany] = useState(profile.targetCompany);
  const canSave = job.trim().length > 0;

  return (
    <Sheet center onClose={onClose}>
      <div>
        <h2 className="h-title">프로필 설정</h2>
        <p className="t-caption" style={{ marginTop: 4 }}>
          희망 직무와 목표 기업을 입력하면 맞춤 공고와 역량 분석에 반영돼요.
        </p>
      </div>

      {/* 포털 연동 · 수정 불가 */}
      <div className="locked-fields">
        <LockedField label="소속 학과" value={profile.department} />
        <LockedField label="학년" value={profile.grade} />
        <p className="locked-fields__note">
          <Icon name="info" size={14} /> 가입할 때 등록한 정보예요. 학과를 바꾸려면 문의해 주세요.
          </p>
      </div>

      <div>
        <label className="label" htmlFor="p-job">희망 직무</label>
        <input
          id="p-job"
          className="input"
          placeholder="예) IT 서비스 기획자"
          value={job}
          maxLength={30}
          onChange={(e) => setJob(e.target.value)}
        />
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          {JOB_SUGGESTIONS.map((j) => (
            <button key={j} type="button" className={`chip ${job === j ? 'is-active' : ''}`} onClick={() => setJob(j)}>
              {j}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="p-company">목표 기업 (선택)</label>
        <input
          id="p-company"
          className="input"
          placeholder="예) 네이버"
          value={company}
          maxLength={30}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <button
        className="btn btn--primary btn--block"
        disabled={!canSave}
        onClick={() => onSave({ ...profile, job: job.trim(), targetCompany: company.trim() })}
      >
        저장하기
      </button>
    </Sheet>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="locked-field" aria-readonly="true">
      <span className="locked-field__label">{label}</span>
      <span className="locked-field__value">{value}</span>
      <Icon name="lock" size={16} />
    </div>
  );
}

