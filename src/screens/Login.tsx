import { useState } from 'react';
import { login, sendCode, verifyCode, registerPassword, setSession, getSession } from '../services/backend';

export default function Login() {
  const [step, setStep] = useState<'login' | 'email' | 'code' | 'password'>('login');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true); setError('');
    try {
      if (step === 'login') await login(studentId.trim(), password);
      else if (step === 'email') { await sendCode(email.trim()); setStep('code'); }
      else if (step === 'code') {
        const session = await verifyCode(email.trim(), code.trim());
        if (session.hasPassword) setSession(getSession());
        else setStep('password');
      } else await registerPassword(studentId.trim(), password);
    } catch (e) { setError(e instanceof Error ? e.message : '요청에 실패했어요.'); }
    finally { setBusy(false); }
  }
  return <div className="screen" style={{ maxWidth: 480, margin: 'auto', paddingTop: 60 }}>
    <h1 className="h-display">STACK</h1>
    <h2 className="h-sub">{step === 'login' ? '학번으로 로그인' : step === 'password' ? '학번·비밀번호 등록' : '학교 이메일 인증'}</h2>
    <form className="card stack-12" onSubmit={e => { e.preventDefault(); if (!busy) void submit(); }}>
      {(step === 'login' || step === 'password') && <>
        <label className="field">학번<input className="input" required inputMode="numeric" pattern="[0-9]{8}" autoComplete="username" value={studentId} onChange={e => setStudentId(e.target.value)} /></label>
        <label className="field">비밀번호<input className="input" required type="password" autoComplete={step === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
      </>}
      {step === 'email' && <label className="field">학교 이메일<input className="input" required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {step === 'code' && <label className="field">이메일로 받은 인증 코드<input className="input" required autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></label>}
      {step === 'password' && <p className="t-caption">비밀번호는 영문과 숫자를 포함해 8~64자로 입력해 주세요.</p>}
      {error && <p className="notice notice--point" role="alert">{error}</p>}
      <button className="btn btn--primary" disabled={busy}>{busy ? '처리 중' : step === 'login' ? '로그인' : step === 'email' ? '인증 코드 받기' : step === 'code' ? '인증하기' : '등록하기'}</button>
    </form>
    {step !== 'password' && <button className="link" disabled={busy} onClick={() => { setStep(step === 'login' ? 'email' : 'login'); setPassword(''); setError(''); }}>{step === 'login' ? '학교 이메일 인증 / 가입하기' : '학번 로그인으로 돌아가기'}</button>}
  </div>;
}
