import * as career from './career';
import { createExperience } from './backend';
// =========================================================
// API 레이어 — 분석 API 연결, 목업은 VITE_API_MOCK=true에서만 사용합니다.
// A AI API와 B 인증·경험 DB API를 각각 호출합니다.
// 반환 타입은 src/types.ts 에 정의되어 있어요.
// =========================================================
import { demoMode, request, waitForJob, jobHeaders, assetUrl, type Job } from './http';
import {
  resultByMode,
  postingSample,
  matchRules,
  coverDraftSample,
  slideOutlineSample,
  experiences as seedExperiences,
} from '../data/mock';
import type {
  ModeId,
  ResultByMode,
  Experience,
  Posting,
  PostingInput,
  MatchedExperience,
  CoverDraft,
  SlideItem,
  SlideLayout,
  UploadItem,
  Fit,
} from '../types';

export const UPLOAD_LIMIT = {
  maxFiles: 5,
  maxSizeMB: 20,
  accept: '.ppt,.pptx,.pdf,.doc,.docx,.hwp,.hwpx,.png,.jpg,.jpeg,.webp',
} as const;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type OnStep = (step: number) => void;
const warningText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value) return String(value.message);
  return JSON.stringify(value);
};

/** POST /analyses → GET /jobs/{jobId} → GET /analyses/{analysisId} */
export async function analyzeFiles<M extends ModeId>(
  _files: (File | UploadItem)[],
  mode: M,
  _memo = '',
  onStep: OnStep = () => {},
  targetJob = '',
  onWarnings: (warnings: string[]) => void = () => {},
  options: { sourceAnalysisId?: string; onAnalysis?: (id: string) => void } = {},
): Promise<ResultByMode[M]> {
  if (!demoMode) {
    if (!options.sourceAnalysisId && (!_files.length || _files.length > 5)) throw new Error('파일은 1~5개 선택해 주세요.');
    if (_memo.length > 300) throw new Error('메모는 최대 300자까지 입력해 주세요.');
    if (targetJob.length > 100) throw new Error('희망 직무는 최대 100자까지 입력해 주세요.');
    let accepted: Job;
    if (options.sourceAnalysisId) {
      accepted = await request<Job>(`/analyses/${encodeURIComponent(options.sourceAnalysisId)}/remode`, {
        method: 'POST', headers: { ...jobHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, memo: _memo, targetJob }),
      });
    } else {
    const form = new FormData();
    for (const file of _files) {
      if (!(file instanceof File)) throw new Error('원본 파일을 다시 선택해 주세요. 현재 API는 최근 파일 재사용을 지원하지 않아요.');
      if (file.size > 20 * 1024 * 1024) throw new Error('파일당 최대 20MB까지 업로드할 수 있어요.');
      form.append('files', file);
    }
    form.append('mode', mode);
    form.append('memo', _memo);
    if (targetJob.trim()) form.append('targetJob', targetJob.trim());
    accepted = await request<Job>('/analyses', { method: 'POST', headers: jobHeaders(), body: form });
    }
    onStep(0);
    const job = await waitForJob(accepted, onStep);
    if (!job.analysisId) throw new Error('분석 결과 ID가 없어요.');
    const response = await request<{ result: { mode: ModeId; data: ResultByMode[M] }; warnings?: unknown[] }>(`/analyses/${encodeURIComponent(job.analysisId)}`);
    if (response.result?.mode !== mode || !response.result.data) throw new Error('분석 결과의 모드가 요청과 다릅니다.');
    const result = response.result.data;
    if (mode === 'specup' ? !Array.isArray((result as ResultByMode['specup']).owned) : !Array.isArray((result as ResultByMode['resume']).sections)) throw new Error('분석 결과 구조가 올바르지 않아요.');
    if (mode === 'portfolio') {
      const portfolio = result as ResultByMode['portfolio'];
      portfolio.images = (portfolio.images ?? []).map(image => ({ ...image, url: image.url ? assetUrl(image.url) : undefined }));
    }
    onWarnings([
      ...(job.status === 'PARTIAL_FAILED' ? ['일부 파일 또는 페이지를 읽지 못했어요. 성공한 자료만 반영된 결과입니다.'] : []),
      ...(response.warnings ?? []).map(warningText),
      ...(job.files ?? []).filter(file => file.error).map(file => [file.fileName, file.error?.message].filter(Boolean).join(': ') || '파일 처리 오류'),
    ]);
    options.onAnalysis?.(job.analysisId);
    return result;
  }
  for (let i = 0; i < 4; i += 1) {
    onStep(i);
    await wait(650);
  }
  return structuredClone(resultByMode[mode]);
}

/** B POST /api/v1/experiences */
export async function saveExperience(payload: Omit<Experience, 'id'>): Promise<Experience> {
  if (!demoMode) return createExperience(payload);
  await wait(300);
  return { id: `e${Date.now()}`, ...payload };
}

/* ---------------- 나의 경험: 공고 맞춤 서류 (EX-03/04) ---------------- */

/** POST /job-postings/analyze → GET /job-postings/{postingId}/analysis */
export async function parsePosting({ url = '', text = '' }: PostingInput): Promise<Posting> {
  if (!demoMode) {
    if (!text.trim()) throw new Error(url.trim() ? '현재 백엔드는 URL 수집을 지원하지 않아요. 공고 본문을 붙여넣어 주세요.' : '공고 내용을 입력해 주세요.');
    if (text.trim().length > 80_000) throw new Error('공고 본문은 최대 80,000자까지 입력해 주세요.');
    const job = await waitForJob(await request<Job>('/job-postings/analyze', {
      method: 'POST', headers: { ...jobHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    }));
    if (!job.postingId) throw new Error('공고 결과 ID가 없어요.');
    const response = await request<{ data: Posting; needsManualQuestions?: boolean; missingFields?: string[]; warnings?: unknown[] }>(`/job-postings/${encodeURIComponent(job.postingId)}/analysis`);
    const result = response.data;
    if (!result || !Array.isArray(result.questions) || !Array.isArray(result.skills)) throw new Error('공고 결과 구조가 프론트 규격과 달라요. 상세 API 명세가 필요해요.');
    return { ...result, needsManualQuestions: response.needsManualQuestions, missingFields: response.missingFields, warnings: (response.warnings ?? []).map(warningText) };
  }
  await wait(900);
  if (!url.trim() && !text.trim()) throw new Error('공고 링크나 내용을 입력해 주세요.');
  return structuredClone(postingSample);
}

/**
 * ② 마스터 경험 DB에서 공고에 맞는 경험 선별 — A POST /cover-letters/recommended-experiences 또는 /portfolios/recommended-experiences
 * 반환: 경험별 적합도(high|mid|low), 근거 문장, (자소서) 배정 문항
 */
export async function matchExperiences(
  _posting: Posting,
  kind: 'cover' | 'slides',
  list: Experience[],
): Promise<MatchedExperience[]> {
  if (!demoMode) return career.recommend(_posting, kind, list);
  await wait(700);
  const FIT_ORDER: Record<Fit, number> = { high: 0, mid: 1, low: 2 };
  const seen = new Set<string>();
  return list
    .filter((e) => {
      if (seen.has(e.title)) return false; // 같은 제목 중복 제거
      seen.add(e.title);
      return true;
    })
    .map((e, i): MatchedExperience => {
      // 목업: 새로 저장한 경험도 같은 제목의 기본 경험 규칙을 따름
      const seedId = seedExperiences.find((x) => x.title === e.title)?.id;
      const rule = matchRules[e.id] ?? (seedId ? matchRules[seedId] : undefined);
      const fit: Fit = rule?.fit ?? 'low';
      return {
        ...e,
        fit,
        reason: rule?.reason ?? '공고 요구 역량과 겹치는 부분이 적어요',
        question: kind === 'cover' ? rule?.question ?? null : null,
        assetsLabel: rule?.assets ?? '이미지 0 · 지표 0',
        selected: fit !== 'low',
        order: i,
      };
    })
    .sort((a, b) => FIT_ORDER[a.fit] - FIT_ORDER[b.fit]);
}

/** ③-a 문항별 자소서 초안 생성 — A POST /cover-letters/generate */
export async function generateCoverLetter(
  posting: Posting,
  picked: MatchedExperience[],
  onStep: OnStep = () => {},
): Promise<CoverDraft[]> {
  if (!demoMode) return career.cover(posting, picked, onStep);
  for (let i = 0; i < 5; i += 1) {
    onStep(i);
    await wait(450);
  }
  return posting.questions.map((q) => ({
    ...q,
    text: coverDraftSample[q.id]?.text ?? '',
    keywords: coverDraftSample[q.id]?.keywords ?? [],
    usedExperiences: picked.filter((e) => e.question === q.id).map((e) => e.title),
  }));
}

/** ③-b 슬라이드 목차 구성 — A POST /portfolios/outline */
export async function buildSlideOutline(
  _posting: Posting,
  picked: MatchedExperience[],
  size = 10,
): Promise<SlideItem[]> {
  if (!demoMode) return career.outline(_posting, picked, size);
  await wait(500);
  return slideOutlineSample(picked).slice(0, size);
}

/** ④ 슬라이드 초안 생성 — A POST /portfolios/generate */
export async function generateSlides(outline: SlideItem[], posting?: Posting, picked: MatchedExperience[] = []): Promise<SlideItem[]> {
  if (!demoMode) {
    if (!posting) throw new Error('공고 정보가 필요해요.');
    return career.slides(outline, posting, picked);
  }
  await wait(1200);
  const layoutOf = (s: SlideItem): SlideLayout =>
    s.type === '성과' ? '지표 강조' : s.type === '프로젝트' ? '이미지 강조' : '텍스트 강조';
  return outline.map((s) => ({ ...s, layout: layoutOf(s) }));
}
