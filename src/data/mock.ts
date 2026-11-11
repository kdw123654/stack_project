// =========================================================
// 화면 확인용 목업 데이터
// 실제 API 연결 시 services/api.ts 의 함수 반환값으로 교체됩니다.
// =========================================================
import type {
  Profile, Mode, RecentFile, ResultByMode, Experience, Notice, SchoolStats, Senior, Competency, TargetCompare,
  PeerCompare, RecommendAction, TimelineItem, CompetencyStatus, Posting, Fit, KeywordCoverage, SlideItem,
} from '../types';

// 희망 직무 입력칸 아래 추천 칩 (직접 입력이 기본, 칩은 빠른 입력용)
export const JOB_SUGGESTIONS: string[] = ['IT 서비스 기획자', '마케터', '데이터 분석가', '프론트엔드 개발자'];

// 학과·학년: 수원대학교 포털 연동 값 / 희망 직무·목표 기업: 사용자가 직접 입력
export const initialProfile: Profile = {
  department: '경영학과',
  grade: '3학년',
  job: 'IT 서비스 기획자',
  targetCompany: '네이버',
};

export const MODES: Mode[] = [
  {
    id: 'resume',
    icon: 'resume',
    title: '이력서 모드',
    desc: '파일에서 경험·역량을 뽑아 이력서 항목(활동·성과·스킬)으로 정리해요.',
  },
  {
    id: 'portfolio',
    icon: 'folder',
    title: '포트폴리오 모드',
    desc: '프로젝트 중심으로 문제–행동–결과(STAR)와 기여도를 정리해요.',
  },
  {
    id: 'specup',
    icon: 'rocket',
    title: '스펙업 모드',
    desc: '보유한 자격증·활동을 모으고, 목표 직무 기준으로 보완할 항목을 알려줘요.',
  },
];

export const recentFiles: RecentFile[] = [
  { id: 'f1', name: '디지털마케팅기획서_최종본.pptx', type: 'ppt', updatedAt: '어제', mode: '포트폴리오' },
  { id: 'f2', name: '숏폼공모전_결과보고서.pdf', type: 'pdf', updatedAt: '3일 전', mode: '이력서' },
];

// ---- AI 추출 결과 예시 (모드별) ----
// needsCheck: AI 확신도가 낮아 사용자 확인이 필요한 항목 → 오렌지 강조
export const resultByMode: ResultByMode = {
  resume: {
    summary: '대학생 서포터즈 SNS 콘텐츠 기획 및 운영',
    sections: [
      { key: 'org', label: '활동명 / 기관', value: '수원시 청년 서포터즈 3기 (수원시청)' },
      { key: 'period', label: '활동 기간', value: '2025.03 – 2025.08', needsCheck: true },
      { key: 'role', label: '역할', value: '인스타그램 채널 운영 담당 (팀 5명 중 콘텐츠 리드)' },
      {
        key: 'achieve',
        label: '핵심 성과 (이력서 문장)',
        value: '타깃 분석 기반 숏폼 콘텐츠를 주 3회 기획·업로드하여 조회수 4.5만 회, 팔로워 400명 증가 달성',
        long: true,
      },
    ],
    skills: ['콘텐츠 기획', '데이터 분석', 'Canva', 'Instagram Insights'],
  },
  portfolio: {
    summary: '대학생 서포터즈 SNS 콘텐츠 기획 및 운영',
    category: '마케팅 프로젝트',
    period: '2025.03 – 2025.08',
    source: { name: '디지털마케팅기획서_최종본.pptx', pages: 12 },
    // PPT에서 추출한 이미지 (kind는 미리보기용 일러스트 종류 / 실제 연결 시 url 사용)
    images: [
      { id: 'img1', kind: 'grid', page: 3, label: '피드 리뉴얼 결과' },
      { id: 'img2', kind: 'bars', page: 9, label: '월별 조회수' },
      { id: 'img3', kind: 'text', page: 5, label: '콘텐츠 캘린더' },
      { id: 'img4', kind: 'phone', page: 7, label: '릴스 화면' },
    ],
    coverId: 'img1',
    sections: [
      { key: 'overview', label: '프로젝트 개요', value: '수원시 청년 서포터즈 공식 인스타그램을 6개월간 운영하며 숏폼 중심으로 콘텐츠 전략을 바꾼 프로젝트', long: true },
      { key: 'situation', label: '문제 상황', value: '게시물 참여율이 정체되고 신규 유입이 줄어 채널 성장이 멈춘 상태', long: true },
    ],
    role: { title: '인스타그램 채널 운영 담당', team: '팀 5명 중 콘텐츠 리드', contribution: 80, duties: ['콘텐츠 기획', '업로드 운영', '성과 분석'] },
    process: [
      { title: '타깃 분석', desc: '팔로워 연령·반응 시간대를 인사이트로 분석' },
      { title: '숏폼 기획', desc: '15초 릴스 포맷과 주간 콘텐츠 캘린더 설계' },
      { title: '운영·개선', desc: '주 3회 업로드 후 지표를 보고 주제 조정' },
    ],
    // needsCheck: 파일 근거 없이 메모에서만 찾은 지표
    metrics: [
      { value: '4.5만', label: '조회수' },
      { value: '+400', label: '팔로워' },
      { value: '+30%', label: '참여율', needsCheck: true, note: '참여율은 메모에서만 찾았어요. 파일 근거가 없어 확인이 필요해요.' },
    ],
    skills: ['마케팅 기획', '데이터 분석', '콘텐츠 제작', '협업'],
  },
  specup: {
    owned: [
      { group: '자격증', items: ['컴퓨터활용능력 2급', 'GTQ 포토샵 1급'] },
      { group: '대외활동', items: ['수원시 청년 서포터즈 3기', '교내 창업동아리 기획팀'] },
      { group: '수상', items: ['수원대 전공 숏폼 공모전 최우수상'] },
      { group: '어학', items: [] },
    ],
    gaps: [
      { title: '데이터 분석 자격증', reason: 'IT 서비스 기획 공고에서 자주 요구돼요', action: 'ADsP 특강 보기', level: 'point' },
      { title: '어학 점수', reason: '파일에서 어학 정보를 찾지 못했어요', action: '직접 추가하기', level: 'point' },
      { title: '서비스 기획 실무 경험', reason: '인턴·현장실습 경험이 있으면 좋아요', action: '인턴 공고 보기', level: 'blue' },
    ],
  },
};

export const experiences: Experience[] = [
  {
    id: 'e1',
    category: '마케팅 프로젝트',
    title: '대학생 서포터즈 SNS 콘텐츠 기획 및 운영',
    summary: 'SNS 조회수 4.5만 회 기록 및 팔로워 400명 증가',
    contribution: 80,
    source: '디지털마케팅기획서_최종본.pptx',
    period: '2025.03 – 2025.08',
  },
  {
    id: 'e2',
    category: '공모전',
    title: '수원대학교 전공 숏폼 공모전 최우수상',
    summary: 'AI를 활용해 학과 홍보 영상 기획·제작',
    contribution: 60,
    source: '숏폼공모전_결과보고서.pdf',
    period: '2024.10 – 2024.11',
  },
  {
    id: 'e3',
    category: '동아리',
    title: '교내 창업동아리 서비스 기획 참여',
    summary: '캠퍼스 중고거래 서비스 MVP 화면 기획',
    contribution: 50,
    source: '창업동아리_IR자료.pdf',
    period: '2024.03 – 2024.06',
  },
  {
    id: 'e4',
    category: '학회',
    title: '교내 마케팅 학회 발표',
    summary: '브랜드 사례 분석 발표',
    contribution: 40,
    source: '학회발표.pdf',
    period: '2023.09 – 2023.12',
  },
];

export const notices: Notice[] = [
  { id: 'n1', type: '특강', title: '수원대학교 ADsP 자격증 특강', desc: '데이터 분석 역량 강화 · 비교과 포인트 인정', dday: 7, tags: ['데이터 분석'] },
  { id: 'n2', type: '비교과', title: '2026 하반기 실무 마케팅 부트캠프', desc: '현직자 멘토링 + 무료 자소서 코칭 연계', dday: 12, tags: ['마케팅 기획'] },
  { id: 'n3', type: '대외활동', title: 'IT 서비스 기획 서포터즈 5기 모집', desc: '서비스 기획 · 사용자 리서치 실무 경험', dday: 3, tags: ['서비스 기획'] },
];

// 학교 취업 통계: 수원대학교 전체 단위 공식 자료만 사용 (학과별 통계·학과 비교는 제공하지 않음)
// overall.value 가 null 이면 '자료 준비 중'으로 표시. byJob 수치는 Figma 와이어프레임 입력값 — 공식 자료로 확인 후 교체
export const schoolStats: SchoolStats = {
  year: '2025',
  source: '수원대 취업지원처 공식 자료',
  updateCycle: '매년 갱신 예정 (공식 자료 공개 시)',
  overall: [
    { label: '취업률', value: null },
    { label: '취업자 수', value: null },
    { label: '진학·기타', value: null },
  ],
  byJob: [
    { label: '품질', value: 18 },
    { label: '연구개발', value: 19 },
    { label: 'IT 전산', value: 17 },
    { label: '경영지원', value: 17 },
    { label: '영업/마케팅', value: 15 },
    { label: '생산', value: 14 },
  ],
};

// 선배 Q&A: 현재 근무 기업·직무 정보가 카드 최상단
export const seniors: Senior[] = [
  {
    id: 's1',
    name: '김민준',
    initial: '김',
    company: '네이버',
    role: '서비스 기획자',
    position: '사원 · 경력 2년차',
    industry: 'IT 플랫폼',
    dept: '경영학과',
    classOf: '2023년 졸업',
    verified: true,
    specs: ['ADsP', 'IT 스타트업 인턴 6개월', '데이터톤 대상', 'TOEIC 870'],
    links: { linkedin: 'https://www.linkedin.com/', github: '' },
    timeline: [
      { when: '1–2학년', what: '교내 비교과 프로그램 · 경영 동아리 활동' },
      { when: '3학년', what: '수원대 데이터톤 참가 및 대상 수상' },
      { when: '4학년', what: 'IT 서비스 스타트업 6개월 인턴십' },
      { when: '현재', what: '네이버 서비스 기획자 (정규직)' },
    ],
  },
  {
    id: 's2',
    name: '이서연',
    initial: '이',
    company: '카카오페이',
    role: '프론트엔드 개발자',
    position: '사원 · 경력 1년차',
    industry: '핀테크',
    dept: '컴퓨터학부',
    classOf: '2024년 졸업',
    verified: true,
    specs: ['정보처리기사', '오픈소스 기여', '부트캠프 수료'],
    links: { linkedin: 'https://www.linkedin.com/', github: 'https://github.com/' },
    timeline: [
      { when: '1–2학년', what: '전공 스터디 · 웹 프로젝트 3건' },
      { when: '3학년', what: '프론트엔드 부트캠프 수료' },
      { when: '4학년', what: '핀테크 기업 하계 인턴' },
      { when: '현재', what: '카카오페이 프론트엔드 개발자' },
    ],
  },
  {
    id: 's3',
    name: '박지호',
    initial: '박',
    company: 'CJ ENM',
    role: '디지털 마케터',
    position: '주임 · 경력 3년차',
    industry: '미디어·콘텐츠',
    dept: '경영학과',
    classOf: '2022년 졸업',
    verified: false,
    specs: ['구글 애널리틱스 자격', '대외활동 4회', '마케팅 공모전 수상'],
    links: { linkedin: '', github: '' },
    timeline: [
      { when: '1–2학년', what: '마케팅 학회 활동' },
      { when: '3학년', what: '브랜드 서포터즈 2회 · 공모전 수상' },
      { when: '4학년', what: '광고대행사 인턴' },
      { when: '현재', what: 'CJ ENM 디지털 마케터' },
    ],
  },
];

// 역량 마인드맵 (MVP): 직무별 필요 역량 vs 내 경험
// status: 'strong' 경쟁력 있음 / 'fit' 적정 / 'gap' 보완 필요
export const jobCompetencies: Competency[] = [
  { name: '서비스 기획', status: 'fit', evidence: '창업동아리 서비스 기획 1건' },
  { name: '콘텐츠·마케팅 기획', status: 'strong', evidence: '서포터즈 운영 · 공모전 수상 2건' },
  { name: '협업·커뮤니케이션', status: 'strong', evidence: '팀 프로젝트 3건' },
  { name: '데이터 분석', status: 'gap', evidence: '관련 자격증·경험 없음' },
  { name: '실무 경험(인턴)', status: 'gap', evidence: '인턴·현장실습 경험 없음' },
];

// 목표 기업 비교: 등록된 선배 데이터 기반(참고용). sampleSize 가 MIN_SAMPLE 미만이면 비교 비공개
export const MIN_SAMPLE = 3;
export const targetCompare: TargetCompare = {
  company: '네이버',
  job: 'IT 서비스 기획자',
  sampleSize: 3,
  rows: [
    { label: '자격증', mine: '2개', ref: '1–2개', status: 'fit' },
    { label: '실무 경험(인턴)', mine: '없음', ref: '대부분 1회 이상', status: 'gap' },
    { label: '프로젝트·활동', mine: '3건', ref: '2–4건', status: 'fit' },
    { label: '수상 경력', mine: '1건', ref: '0–1건', status: 'strong' },
  ],
};

// 유사 사용자 비교: 데이터 누적 전에는 상대평가 미제공
export const peerCompare: PeerCompare = {
  enabled: false,
  criteria: ['학년·전공', '자격증 보유 개수', '등록 경험·활동 수', '경험 유형·역량 태그', '수집 시점·비교 대상 규모'],
};

export const recommendActions: RecommendAction[] = [
  { id: 'a1', title: '수원대학교 ADsP 특강', desc: '데이터 분석 보완 · D-7', tag: '비교과' },
  { id: 'a2', title: 'IT 서비스 기획 서포터즈 5기', desc: '실무 경험 보완 · D-3', tag: '대외활동' },
];

export const growthTimeline: TimelineItem[] = [
  { when: '1학년 2학기', what: '교내 창업동아리 서비스 기획 참여' },
  { when: '2학년 1학기', what: '수원대 전공 홍보 공모전 참가' },
  { when: '3학년 (현재)', what: 'IT 서비스 인턴십 지원', now: true },
];

export const STATUS_META: Record<CompetencyStatus, { label: string; cls: string }> = {
  strong: { label: '경쟁력 있음', cls: 'badge--success' },
  fit: { label: '적정', cls: 'badge--blue' },
  gap: { label: '보완 필요', cls: 'badge--point' },
};

/* ---------------- 공고 맞춤 서류 (EX-03/04) 목업 ---------------- */
export const postingSample: Posting = {
  company: '네이버',
  job: '서비스 기획 (신입)',
  skills: ['데이터 기반 의사결정', '사용자 리서치', '협업·커뮤니케이션'],
  questions: [
    { id: 'q1', no: 1, title: '지원 동기와 입사 후 목표', limit: 700 },
    { id: 'q2', no: 2, title: '협업으로 문제를 해결한 경험', limit: 500 },
  ],
};

// 경험 id → 적합도·근거·배정 문항 (실제로는 서버 매칭 결과)
export const matchRules: Record<string, { fit: Fit; reason: string; question: string; assets: string }> = {
  e1: { fit: 'high', reason: "요구 역량 '데이터 기반 의사결정' — 인사이트로 반응 시간대를 분석한 과정", question: 'q1', assets: '이미지 4 · 지표 3' },
  e3: { fit: 'high', reason: "요구 역량 '사용자 리서치' — MVP 화면 기획 전 사용자 인터뷰 진행", question: 'q1', assets: '이미지 3 · 지표 1' },
  e2: { fit: 'mid', reason: "요구 역량 '협업·커뮤니케이션' — 4인 팀 역할 분담과 일정 조율", question: 'q2', assets: '이미지 2 · 수상 1' },
};

export const FIT_META: Record<Fit, { label: string; cls: string }> = {
  high: { label: '적합도 높음', cls: 'badge--success' },
  mid: { label: '적합도 보통', cls: 'badge--blue' },
  low: { label: '적합도 낮음', cls: 'badge--gray' },
};

export const coverDraftSample: Record<string, { text: string; keywords: KeywordCoverage[] }> = {
  q1: {
    text:
      '사용자의 반응을 숫자로 확인하고, 그 숫자로 다음 행동을 정하는 기획자가 되고 싶습니다. 수원시 청년 서포터즈에서 인스타그램 채널을 맡았을 때, 참여율이 정체된 원인을 인사이트 데이터로 분석하고 반응이 높은 시간대와 15초 숏폼 중심으로 운영 방식을 바꿨습니다. 6개월 동안 조회수 4.5만 회, 팔로워 400명 증가라는 결과를 얻으며 작은 가설을 빠르게 검증하는 방법을 배웠습니다.\n\n교내 창업동아리에서는 MVP 화면을 그리기 전에 사용자 인터뷰로 문제를 다시 정의했습니다. 입사 후에는 데이터와 사용자 리서치를 함께 보는 서비스 기획자로서 …',
    keywords: [
      { label: '데이터 기반 의사결정', covered: true },
      { label: '사용자 리서치', covered: true },
      { label: '협업·커뮤니케이션', covered: false },
    ],
  },
  q2: {
    text:
      '숏폼 공모전에서 4명이 기획·촬영·편집을 나눠 맡았지만, 마감 2주 전 편집 방향이 갈려 일정이 멈췄습니다. 저는 각자 원하는 레퍼런스를 모아 공통 기준표를 만들고, 하루 단위 체크인으로 진행 상황을 공유하자고 제안했습니다. 그 결과 일정 안에 영상을 완성해 최우수상을 받았고 …',
    keywords: [
      { label: '데이터 기반 의사결정', covered: false },
      { label: '사용자 리서치', covered: false },
      { label: '협업·커뮤니케이션', covered: true },
    ],
  },
};

// 선택한 경험으로 슬라이드 목차 만들기 (type: 표지|소개|프로젝트|성과|요약|마무리)
export const slideOutlineSample = (picked: { title: string }[]): SlideItem[] => {
  const [a, b, c] = picked;
  const rows: Omit<SlideItem, 'id'>[] = [
    { title: '표지', desc: '이름 · 지원 직무 · 한 줄 소개', type: '표지', kind: 'cover' },
    { title: '나를 소개합니다', desc: '공고 요구 역량에 맞춘 핵심 역량 3가지', type: '소개', kind: 'text' },
  ];
  if (a) rows.push(
    { title: '프로젝트 A · 개요', desc: `${a.title} · 대표 이미지`, type: '프로젝트', kind: 'grid' },
    { title: '프로젝트 A · 문제와 과정', desc: '참여율 정체 → 타깃 분석 → 숏폼 기획', type: '프로젝트', kind: 'text' },
    { title: '프로젝트 A · 성과', desc: '조회수 4.5만 · 팔로워 +400', type: '성과', kind: 'bars' },
  );
  if (b) rows.push(
    { title: '프로젝트 B · 개요와 과정', desc: `${b.title}`, type: '프로젝트', kind: 'phone' },
    { title: '프로젝트 B · 결과', desc: '핵심 결과와 배운 점', type: '성과', kind: 'text' },
  );
  if (c) rows.push({ title: '프로젝트 C', desc: `${c.title}`, type: '프로젝트', kind: 'bars' });
  rows.push(
    { title: '역량 요약', desc: '경험 ↔ 공고 요구 역량 연결', type: '요약', kind: 'text' },
    { title: '마무리', desc: '연락처 · 포트폴리오 링크', type: '마무리', kind: 'end' },
  );
  return rows.map((r, i) => ({ ...r, id: `s${i + 1}` }));
};
