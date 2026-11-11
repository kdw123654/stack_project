import { useState, type ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import type { Profile, TabId } from '../types';
import stackIcon from '../assets/stack-icon.svg'; // Figma 앱 아이콘(STACK_dark_mode_icon) 원본 SVG

export function AppHeader({ profile, onMenu }: { profile: Profile; onMenu: () => void }) {
  return (
    <header className="header">
      <img className="header__logo" src={stackIcon} alt="STACK" width="38" height="38" />
      <div className="header__titles">
        <div className="header__title">
          STACK
          <span className="badge badge--blue">
            {profile.department}·{profile.grade}
          </span>
        </div>
        <div className="header__sub">수원대학교 경험 아카이빙</div>
      </div>
      <button className="icon-btn" onClick={onMenu} aria-label="설정 메뉴">
        <Icon name="menu" size={18} />
      </button>
    </header>
  );
}

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'experience', label: '나의 경험', icon: 'tray' },
  { id: 'explore', label: '탐색', icon: 'search' },
  { id: 'mindmap', label: '역량 마인드맵', icon: 'chart' },
];

export function TabBar({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="tabbar" aria-label="하단 탭">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tabbar__item ${active === t.id ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <Icon name={t.icon} size={22} stroke={active === t.id ? 2.2 : 1.8} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

interface SubHeaderProps {
  backLabel: string;
  onBack: () => void;
  title?: string;
  right?: ReactNode;
}

export function SubHeader({ backLabel, onBack, title, right }: SubHeaderProps) {
  return (
    <div className="subheader">
      <button className="back-btn" onClick={onBack}>
        <Icon name="chevronL" size={18} />
        {backLabel}
      </button>
      {title && <span className="subheader__title">{title}</span>}
      <div className="row">{right}</div>
    </div>
  );
}

export function Sheet({ onClose, children, center = false }: { onClose: () => void; children: ReactNode; center?: boolean }) {
  return (
    <div className={`overlay ${center ? 'overlay--center' : ''}`} onClick={onClose}>
      <div className={center ? 'dialog' : 'sheet'} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {!center && <div className="sheet__grip" />}
        {children}
      </div>
    </div>
  );
}

interface SegmentTabsProps<T extends string> {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}

export function SegmentTabs<T extends string>({ items, value, onChange }: SegmentTabsProps<T>) {
  return (
    <div className="segment" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          className={`segment__btn ${value === it.id ? 'is-active' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** 결과 확인 화면용: 읽기 → 연필 아이콘 누르면 그 칸만 수정 */
interface EditableFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  needsCheck?: boolean;
  long?: boolean;
}

export function EditableField({ label, value, onChange, needsCheck, long }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="field">
      <div className="field__label">
        {label}
        {needsCheck && <span className="badge badge--point">확인 필요</span>}
      </div>
      <div className={`field__box ${needsCheck ? 'is-check' : ''}`}>
        {editing ? (
          long ? (
            <textarea rows={3} autoFocus value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} />
          ) : (
            <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} />
          )
        ) : (
          value || <span className="t-caption">추출된 내용이 없어요. 눌러서 추가해 주세요.</span>
        )}
        <button className="field__edit" onClick={() => setEditing(!editing)} aria-label={`${label} 수정`}>
          <Icon name={editing ? 'check' : 'edit'} size={16} />
        </button>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}
