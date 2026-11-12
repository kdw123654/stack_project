import { backend } from './backend';
import type { Notice, SchoolStats, Senior } from '../types';

type PostingDto = { id: string; type: 'CAMPUS' | 'EXTERNAL'; tag: string | null; title: string; organization: string | null; description: string; dDay: number | null; url: string | null };
type StatDto = { year: number; label: string; value: number; unit: string; source: string | null };
type SeniorDto = {
  id: string; displayName: string; company: string; position: string; careerYears: number | null;
  department: string | null; gradYear: number | null; jobCategory: string | null; verified: boolean;
  hireSpecs: string[]; timeline?: { grade: string; text: string }[];
};

/* ---------- 공고 ---------- */
const toNotice = (p: PostingDto): Notice => ({
  id: p.id,
  type: p.tag ?? (p.type === 'CAMPUS' ? '교내' : '교외'),
  title: p.title,
  desc: [p.organization, p.description].filter(Boolean).join(' · '),
  dday: p.dDay,
  tags: p.tag ? [p.tag] : [],
  url: p.url,
});

export async function loadNotices(): Promise<Notice[]> {
  return (await backend<{ items: PostingDto[] }>('/explore/postings')).items.map(toNotice);
}

/* ---------- 학교 취업 통계 ---------- */
const fmt = (s: StatDto) => `${s.value.toLocaleString()}${s.unit}`;

export async function loadSchoolStats(): Promise<SchoolStats> {
  const [school, byJob] = await Promise.all([
    backend<{ items: StatDto[] }>('/explore/employment-stats'),
    backend<{ items: StatDto[] }>('/explore/employment-stats/by-job'),
  ]);
  const year = Math.max(...school.items.map(s => s.year), ...byJob.items.map(s => s.year));
  const pick = (label: string) => school.items.find(s => s.year === year && s.label === label);
  const shown = [['취업률', '취업률'], ['졸업자 수', '졸업자'], ['4대보험 직장취업자', '직장 취업']] as const;
  return {
    year: String(year),
    source: pick('취업률')?.source ?? '수원대학교 취업통계 공시',
    updateCycle: '매년 공시 후 갱신',
    overall: shown.map(([label, title]) => { const s = pick(label); return { label: title, value: s ? fmt(s) : null }; }),
    byJob: byJob.items.filter(s => s.year === year).slice(0, 6).map(s => ({ label: s.label, value: s.value })),
  };
}

/* ---------- 선배 ---------- */
const toSenior = (s: SeniorDto): Senior => ({
  id: s.id,
  name: s.displayName,
  initial: s.displayName.slice(0, 1),
  company: s.company,
  role: s.position,
  position: s.careerYears ? `경력 ${s.careerYears}년차` : '경력 정보 없음',
  industry: s.jobCategory ?? '기타',
  dept: s.department ?? '학과 미공개',
  classOf: s.gradYear ? `${s.gradYear}년 졸업` : '',
  verified: s.verified,
  specs: s.hireSpecs,
  links: { github: '' },
  timeline: (s.timeline ?? []).map(t => ({ when: t.grade, what: t.text })),
});

export async function loadSeniors(): Promise<Senior[]> {
  return (await backend<{ items: SeniorDto[] }>('/explore/seniors')).items.map(toSenior);
}

export async function loadSenior(id: string): Promise<Senior> {
  return toSenior(await backend<SeniorDto>(`/explore/seniors/${encodeURIComponent(id)}`));
}

export async function askSenior(id: string, content: string) {
  await backend(`/explore/seniors/${encodeURIComponent(id)}/questions`, { method: 'POST', body: JSON.stringify({ content }) });
}
