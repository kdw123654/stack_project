// =========================================================
// STACK 도메인 타입
// 백엔드 API 응답도 이 타입에 맞추면 화면 코드를 그대로 쓸 수 있어요.
// =========================================================

/* ---------- 공통 ---------- */
export type TabId = 'home' | 'experience' | 'explore' | 'mindmap';
export type ModeId = 'resume' | 'portfolio' | 'specup';
export type FileKind = 'ppt' | 'pdf' | 'img' | 'doc';
export type MiniKind = 'grid' | 'bars' | 'text' | 'phone' | 'cover' | 'end';
/** 역량·비교 상태: 경쟁력 있음 / 적정 / 보완 필요 */
export type CompetencyStatus = 'strong' | 'fit' | 'gap';
/** 공고-경험 적합도 */
export type Fit = 'high' | 'mid' | 'low';
export type Toast = (message: string) => void;

/** 학과·학년은 수원대학교 포털 연동 값(수정 불가), 희망 직무·목표 기업은 직접 입력 */
export interface Profile {
  department: string;
  grade: string;
  job: string;
  targetCompany: string;
}

export interface Mode {
  id: ModeId;
  icon: 'resume' | 'folder' | 'rocket';
  title: string;
  desc: string;
}

/** 업로드 대기 파일 (File 객체 또는 최근 파일 재사용) */
export interface UploadItem {
  name: string;
  size: number;
  recent?: boolean;
}

export interface RecentFile {
  id: string;
  name: string;
  type: FileKind;
  updatedAt: string;
  mode: string;
}

/* ---------- 모드별 AI 결과 ---------- */
/** needsCheck: AI 확신도가 낮아 사용자 확인이 필요한 항목 */
export interface ResultSection {
  key: string;
  label: string;
  value: string;
  needsCheck?: boolean;
  long?: boolean;
}

export interface ResumeResult {
  summary: string;
  sections: ResultSection[];
  skills: string[];
}

export interface ExtractedImage {
  id: string;
  kind: MiniKind;
  page: number;
  label: string;
  url?: string;
}

export interface Metric {
  value: string;
  label: string;
  needsCheck?: boolean;
  note?: string;
}

export interface PortfolioResult {
  summary: string;
  category: string;
  period: string;
  source: { name: string; pages: number };
  images: ExtractedImage[];
  coverId: string;
  sections: ResultSection[];
  role: { title: string; team: string; contribution: number | null; duties: string[] };
  process: { title: string; desc: string }[];
  metrics: Metric[];
  skills: string[];
}

export interface SpecupResult {
  owned: { group: string; items: string[] }[];
  gaps: { title: string; reason: string; action: string; level: 'point' | 'blue' }[];
}

export interface ResultByMode {
  resume: ResumeResult;
  portfolio: PortfolioResult;
  specup: SpecupResult;
}
export type AnyResult = ResultByMode[ModeId];
/** 모드와 결과를 함께 들고 다니는 태그드 유니온 (mode로 결과 타입이 좁혀짐) */
export type TaggedResult =
  | { mode: 'resume'; data: ResumeResult }
  | { mode: 'portfolio'; data: PortfolioResult }
  | { mode: 'specup'; data: SpecupResult };

/* ---------- 나의 경험 ---------- */
export interface Experience {
  id: string;
  category: string;
  title: string;
  summary: string;
  contribution: number | null;
  source: string;
  period: string;
  skills?: string[];
  role?: string;
  achievements?: string[];
  assets?: { id: string; label: string }[];
  backendData?: Record<string, unknown>;
}

/* ---------- 탐색 ---------- */
export interface Notice {
  id: string;
  type: string;
  title: string;
  desc: string;
  dday: number | null;
  tags: string[];
  url?: string | null;
}

/** 수원대학교 전체 단위 공식 자료만 사용. 값이 없으면 null → '자료 준비 중' */
export interface SchoolStats {
  year: string;
  source: string;
  updateCycle: string;
  overall: { label: string; value: string | null }[];
  byJob: { label: string; value: number }[];
}

export interface Senior {
  id: string;
  name: string;
  initial: string;
  company: string;
  role: string;
  position: string;
  industry: string;
  dept: string;
  classOf: string;
  verified: boolean;
  specs: string[];
  links: { github: string };
  timeline: { when: string; what: string }[];
}

/* ---------- 역량 마인드맵 ---------- */
export interface Competency {
  name: string;
  status: CompetencyStatus;
  evidence: string;
}

export interface TargetCompare {
  company: string;
  job: string;
  sampleSize: number;
  rows: { label: string; mine: string; ref: string; status: CompetencyStatus }[];
}

export interface PeerCompare {
  enabled: boolean;
  criteria: string[];
}

export interface RecommendAction {
  id: string;
  title: string;
  desc: string;
  tag: string;
}

export interface TimelineItem {
  when: string;
  what: string;
  now?: boolean;
}

/* ---------- 공고 맞춤 서류 ---------- */
export interface Question {
  id: string;
  no: number;
  title: string;
  limit: number | null;
  countUnit?: 'characters' | 'bytes' | 'words' | 'unknown';
  includesSpaces?: boolean | null;
  needsCheck?: boolean;
}

export interface Posting {
  source?: {
    sourcePostingId: string;
    sourceType: 'TEXT' | 'URL';
    url?: string;
    rawText: string;
    analysis: Pick<Posting, 'company' | 'job' | 'skills' | 'questions'>;
    evidence?: Record<string, unknown>;
    warnings: string[];
  };
  company: string | null;
  job: string | null;
  skills: string[];
  questions: Question[];
  needsManualQuestions?: boolean;
  missingFields?: string[];
  warnings?: string[];
}

export interface PostingInput {
  url?: string;
  text?: string;
}

export interface MatchedExperience extends Experience {
  fit: Fit;
  reason: string;
  question: string | null;
  assetsLabel: string;
  selected: boolean;
  order: number;
}

export interface KeywordCoverage {
  label: string;
  covered: boolean;
}

export interface CoverDraft extends Question {
  generation?: { taskId: string; original: Record<string, unknown> };
  text: string;
  keywords: KeywordCoverage[];
  usedExperiences: string[];
}

export type SlideType = '표지' | '소개' | '프로젝트' | '성과' | '요약' | '마무리';
export type SlideLayout = '지표 강조' | '이미지 강조' | '텍스트 강조';

export interface SlideItem {
  generation?: { taskId: string; original: Record<string, unknown> };
  replacement?: { taskId: string; original: Record<string, unknown> };
  imageIds?: string[];
  sourceExperienceIds?: string[];
  metrics?: { label: string; value: number; unit: string }[];
  id: string;
  title: string;
  desc: string;
  type: SlideType;
  kind: MiniKind;
  layout?: SlideLayout;
}

export interface SlideOptions {
  size: 6 | 10 | 14;
  format: 'PDF' | 'PPT';
}
