import { backend } from './backend';
import type { Club, Notice, SchoolStats, Senior, StatGroup } from '../types';

type PostingDto = { id: string; type: 'CAMPUS' | 'EXTERNAL'; tag: string | null; title: string; organization: string | null; description: string; dDay: number | null; url: string | null; jobFit?: boolean; category?: string | null; postedAt?: string | null };
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
  jobFit: p.jobFit,
  scope: p.type === 'CAMPUS' ? '교내' : '교외',
  org: p.organization ?? '',
  postedAt: p.postedAt ?? null,
});

export async function loadNotices(): Promise<{ items: Notice[]; myJobs: string[] }> {
  const res = await backend<{ items: PostingDto[]; myJobs: string[] }>('/explore/postings');
  return { items: res.items.map(toNotice), myJobs: res.myJobs };
}

export async function loadMyJobs(): Promise<string[]> {
  return (await backend<{ myJobs: string[] }>('/explore/my-jobs')).myJobs;
}

const toClub = (p: PostingDto): Club => ({
  id: p.id,
  name: p.organization ?? '',
  scope: p.tag === '교내동아리' ? '교내' : '연합',
  category: p.category ?? '기타',
  title: p.description,
  dday: p.dDay,
  url: p.url,
});

export async function loadClubs(): Promise<Club[]> {
  return (await backend<{ items: PostingDto[] }>('/explore/clubs')).items.map(toClub);
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
  const shown = [['취업률', '취업률'], ['졸업자 수', '졸업자'], ['4대보험 직장취업자', '직장 취업'],
    ['취업대상자 수', '취업 대상자'], ['프리랜서', '프리랜서'], ['1인창업·개인창작·해외취업', '창업·창작·해외']] as const;
  return {
    year: String(year),
    source: pick('취업률')?.source ?? '수원대학교 취업통계 공시',
    updateCycle: '매년 공시 후 갱신',
    overall: shown.map(([label, title]) => { const s = pick(label); return { label: title, value: s ? fmt(s) : null }; }),
    trend: school.items.filter(s => s.label === '취업률').sort((a, b) => a.year - b.year)
      .map(s => ({ year: s.year, value: s.value, source: s.source })),
    byJob: byJob.items.filter(s => s.year === year).slice(0, 6).map(s => ({ label: s.label, value: s.value })),
    groups: statGroups(school.items.filter(s => s.year === year), byJob.items.filter(s => s.year === year)),
  };
}

// 급여 구간을 낮은 금액부터: "100만원 이하" < "100~200만원" < … < "400만원 이상"
const salaryRank = (label: string) => (parseInt(label) || 0) * 10 + (label.includes('이하') ? 0 : label.includes('이상') ? 9 : 5);

// 공시 자료를 주제별로 묶어요 (라벨 모양으로 구분)
function statGroups(school: StatDto[], byJob: StatDto[]): StatGroup[] {
  const sorted = (rows: StatDto[]) => [...rows].sort((a, b) => b.value - a.value).map(s => ({ label: s.label, value: s.value }));
  const COMPANY = ['중소기업', '중견기업', '공기업·공공기관', '대기업', '공무원', '비영리법인', '기타'];
  const pick = (test: (s: StatDto) => boolean) => school.filter(test);
  const salary = pick(s => s.label.startsWith('급여'));
  const college = pick(s => s.label.endsWith('대학 취업률'));
  const company = pick(s => COMPANY.includes(s.label));
  const groups: StatGroup[] = [
    { id: 'industry', title: '산업별 진출', desc: '선배들이 어떤 산업으로 취업했는지', unit: '%', source: byJob[0]?.source ?? null, rows: sorted(byJob) },
    { id: 'company', title: '기업 유형', desc: '중소·중견·대기업·공공기관 비율', unit: '%', source: company[0]?.source ?? null, rows: sorted(company) },
    { id: 'salary', title: '급여 구간', desc: '첫 직장 월 급여 (만원)', unit: '%', source: salary[0]?.source ?? null,
      rows: salary.map(s => ({ label: s.label.replace('급여 ', ''), value: s.value }))
        .sort((a, b) => salaryRank(a.label) - salaryRank(b.label)) },
    { id: 'college', title: '단과대학별 취업률', desc: '단과대학 단위 공시 취업률', unit: '%', source: college[0]?.source ?? null,
      rows: sorted(college).map(r => ({ ...r, label: r.label.replace(' 취업률', '') })) },
  ];
  return groups.filter(g => g.rows.length > 0);
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

/** '이 공고로 맞춤 서류 만들기': 공고 제목·기관·내용을 자소서/포폴 흐름에 넣을 텍스트로 받아요 */
export async function loadPostingText(id: string): Promise<string> {
  return (await backend<{ text: string }>(`/explore/postings/${encodeURIComponent(id)}/job-posting`, { method: 'POST' })).text;
}
