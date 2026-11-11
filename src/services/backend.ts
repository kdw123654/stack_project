import type { Experience, Profile } from '../types';

const base = (import.meta.env.VITE_BACKEND_API_BASE_URL || '/backend-api/api/v1').replace(/\/$/, '');
type Session = { accessToken: string; refreshToken: string; user?: { id: string } };
const storageKey = 'stack.session';
export function getSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { return null; }
}
export function setSession(session: Session | null) {
  if (session) { sessionStorage.setItem(storageKey, JSON.stringify(session)); if (session.user) sessionStorage.setItem('stack.userId', session.user.id); }
  else { sessionStorage.removeItem(storageKey); sessionStorage.removeItem('stack.userId'); }
  window.dispatchEvent(new Event('stack-auth'));
}
let refreshing: Promise<void> | null = null;
export class BackendError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}
export async function backend<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const session = getSession();
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  let response: Response;
  try { response = await fetch(`${base}${path}`, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(60_000) }); }
  catch { throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  if (response.status === 401 && retry && session && !path.startsWith('/auth/')) {
    refreshing ??= backend<Session>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) }, false)
      .then(value => { setSession(value); }).catch(error => { setSession(null); throw error; }).finally(() => { refreshing = null; });
    await refreshing;
    return backend<T>(path, init, false);
  }
  if (response.ok && response.headers.get('Content-Type')?.startsWith('image/png')) return await response.blob() as T;
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) throw new BackendError(body?.error?.message || `요청에 실패했어요 (${response.status}).`, body?.error?.code);
  return body.data as T;
}
export async function login(studentId: string, password: string) {
  setSession(await backend<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ studentId, password }) }));
}
export async function logout() {
  try { await backend('/auth/logout', { method: 'POST' }); } finally { setSession(null); }
}
export const sendCode = (email: string) => backend('/auth/email/send-code', { method: 'POST', body: JSON.stringify({ email }) });
export async function verifyCode(email: string, code: string) {
  const session = await backend<Session & { hasPassword: boolean }>('/auth/email/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
  // Registration must finish before notifying the app of an authenticated session.
  sessionStorage.setItem(storageKey, JSON.stringify(session));
  if (session.user) sessionStorage.setItem('stack.userId', session.user.id);
  return session;
}
export async function registerPassword(studentId: string, password: string) {
  await backend('/auth/password', { method: 'POST', body: JSON.stringify({ studentId, password }) });
  setSession(getSession());
}
type User = { department: string | null; grade: number | null; desiredJob: string | null; targetCompany: string | null };
const profileFrom = (user: User): Profile => ({ department: user.department ?? '미등록', grade: user.grade ? `${user.grade}학년` : '미등록', job: user.desiredJob ?? '', targetCompany: user.targetCompany ?? '' });
export async function loadProfile() { return profileFrom(await backend<User>('/users/me')); }
export async function saveTarget(profile: Profile) {
  return profileFrom(await backend<User>('/users/me/target', { method: 'PATCH', body: JSON.stringify({ desiredJob: profile.job, targetCompany: profile.targetCompany || null }) }));
}
type ExperienceDto = { id: string; title: string; category: string; period: { start: string | null; end: string | null }; role: string | null; achievements: string[]; skills: string[]; sourceFileId: string | null; portfolio: { frontend?: Partial<Experience> } | null };
function fromExperience(value: ExperienceDto): Experience {
  const extra = value.portfolio?.frontend;
  return { id: value.id, title: value.title, category: value.category, summary: extra?.summary ?? value.achievements.join('\n'),
    contribution: extra?.contribution ?? null, source: extra?.source ?? '', period: extra?.period ?? [value.period.start, value.period.end].filter(Boolean).join(' ~ '),
    skills: value.skills, role: value.role ?? '', achievements: value.achievements, assets: extra?.assets ?? [], backendData: value as unknown as Record<string, unknown> };
}
function toExperience(value: Omit<Experience, 'id'>) {
  const old = value.backendData ?? {};
  return { title: value.title, category: value.category, tags: old.tags ?? [], organization: old.organization ?? null,
    period: old.period ?? { start: null, end: null }, role: value.role || null, achievements: value.achievements?.length ? value.achievements : value.summary ? [value.summary] : [],
    skills: value.skills ?? [], sourceFileId: old.sourceFileId ?? null, jobFitScore: old.jobFitScore ?? null,
    portfolio: { ...(old.portfolio as Record<string, unknown> ?? {}), frontend: { summary: value.summary, period: value.period, source: value.source, contribution: value.contribution, assets: value.assets ?? [] } } };
}
export async function listExperiences(): Promise<Experience[]> {
  const items: Experience[] = [];
  for (let page = 0; ; page++) {
    const result = await backend<{ items: ExperienceDto[]; totalCount: number }>(`/experiences?page=${page}&size=50`);
    items.push(...result.items.map(fromExperience));
    if (!result.items.length || items.length >= result.totalCount) return items;
  }
}
export async function createExperience(value: Omit<Experience, 'id'>) { return fromExperience(await backend<ExperienceDto>('/experiences', { method: 'POST', body: JSON.stringify(toExperience(value)) })); }
export async function updateExperience(value: Experience) { return fromExperience(await backend<ExperienceDto>(`/experiences/${encodeURIComponent(value.id)}`, { method: 'PATCH', body: JSON.stringify(toExperience(value)) })); }
export const deleteExperience = (id: string) => backend(`/experiences/${encodeURIComponent(id)}`, { method: 'DELETE' });

export interface StoredFile { fileId: string; name: string; size: number; uploadedAt: string; lastMode: string | null }
export async function listFiles(): Promise<StoredFile[]> {
  return (await backend<{ files: StoredFile[] }>('/files?limit=20')).files;
}
export async function storeFiles(files: File[]): Promise<StoredFile[]> {
  if (!files.length || files.length > 5) throw new Error('원본 파일은 1~5개 선택해 주세요.');
  const allowed = /\.(pptx?|pdf|docx?|hwpx?|png|jpe?g)$/i;
  const form = new FormData();
  for (const file of files) {
    if (!allowed.test(file.name)) throw new Error(`${file.name}: 원본 보관은 PPT·PDF·DOC·HWP·PNG·JPG 형식을 지원합니다.`);
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('원본 파일은 0바이트보다 크고 20MB 이하여야 합니다.');
    form.append('files', file);
  }
  return (await backend<{ files: StoredFile[] }>('/files', { method: 'POST', body: form })).files;
}
export async function reuseFile(id: string): Promise<File> {
  const detail = await backend<StoredFile & { downloadUrl: string }>(`/files/${encodeURIComponent(id)}`);
  let response: Response;
  try { response = await fetch(detail.downloadUrl, { signal: AbortSignal.timeout(60_000) }); }
  catch { throw new Error('원본 파일을 받지 못했어요. 저장소 연결을 확인해 주세요.'); }
  if (!response.ok) throw new Error('보관한 파일을 받지 못했어요. 다시 시도해 주세요.');
  const blob = await response.blob();
  if (blob.size > 20 * 1024 * 1024) throw new Error('파일이 분석 제한인 20MB를 넘어요.');
  return new File([blob], detail.name, { type: blob.type });
}
