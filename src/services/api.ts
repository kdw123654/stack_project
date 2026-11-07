// =========================================================
// API 레이어 — 지금은 목업을 반환합니다.
// 백엔드가 준비되면 각 함수 내부만 fetch 호출로 바꾸면 화면 코드는 그대로 동작합니다.
// 반환 타입은 src/types.ts 에 정의되어 있어요.
// =========================================================
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
  accept: '.ppt,.pptx,.pdf,.doc,.docx,.hwp,.png,.jpg,.jpeg',
} as const;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type OnStep = (step: number) => void;

/**
 * 파일 업로드 + 모드별 AI 분석
 *
 * 실제 연결 예시:
 *   const form = new FormData();
 *   files.forEach((f) => form.append('files', f));
 *   form.append('mode', mode); form.append('memo', memo);
 *   const res = await fetch('/api/experiences/analyze', { method: 'POST', body: form });
 *   if (!res.ok) throw new Error('분석에 실패했어요. 잠시 후 다시 시도해 주세요.');
 *   return (await res.json()) as ResultByMode[M];
 */
export async function analyzeFiles<M extends ModeId>(
  _files: (File | UploadItem)[],
  mode: M,
  _memo = '',
  onStep: OnStep = () => {},
): Promise<ResultByMode[M]> {
  for (let i = 0; i < 4; i += 1) {
    onStep(i);
    await wait(650);
  }
  return structuredClone(resultByMode[mode]);
}

/** 결과를 마스터 경험 DB에 저장 — POST /api/experiences */
export async function saveExperience(payload: Omit<Experience, 'id'>): Promise<Experience> {
  await wait(300);
  return { id: `e${Date.now()}`, ...payload };
}

/* ---------------- 나의 경험: 공고 맞춤 서류 (EX-03/04) ---------------- */

/** ① 공고 분석: 링크 또는 텍스트 → 기업·직무·요구 역량·자소서 문항 — POST /api/postings/parse */
export async function parsePosting({ url = '', text = '' }: PostingInput): Promise<Posting> {
  await wait(900);
  if (!url.trim() && !text.trim()) throw new Error('공고 링크나 내용을 입력해 주세요.');
  return structuredClone(postingSample);
}

/**
 * ② 마스터 경험 DB에서 공고에 맞는 경험 선별 — POST /api/postings/:id/match { kind }
 * 반환: 경험별 적합도(high|mid|low), 근거 문장, (자소서) 배정 문항
 */
export async function matchExperiences(
  _posting: Posting,
  kind: 'cover' | 'slides',
  list: Experience[],
): Promise<MatchedExperience[]> {
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
        assets: rule?.assets ?? '이미지 0 · 지표 0',
        selected: fit !== 'low',
        order: i,
      };
    })
    .sort((a, b) => FIT_ORDER[a.fit] - FIT_ORDER[b.fit]);
}

/** ③-a 문항별 자소서 초안 생성 — POST /api/drafts/cover { postingId, experienceIds, questions } */
export async function generateCoverLetter(
  posting: Posting,
  picked: MatchedExperience[],
  onStep: OnStep = () => {},
): Promise<CoverDraft[]> {
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

/** ③-b 슬라이드 목차 구성 — POST /api/drafts/slides/outline */
export async function buildSlideOutline(
  _posting: Posting,
  picked: MatchedExperience[],
  size = 10,
): Promise<SlideItem[]> {
  await wait(500);
  return slideOutlineSample(picked).slice(0, size);
}

/** ④ 슬라이드 초안 생성 — POST /api/drafts/slides */
export async function generateSlides(outline: SlideItem[]): Promise<SlideItem[]> {
  await wait(1200);
  const layoutOf = (s: SlideItem): SlideLayout =>
    s.type === '성과' ? '지표 강조' : s.type === '프로젝트' ? '이미지 강조' : '텍스트 강조';
  return outline.map((s) => ({ ...s, layout: layoutOf(s) }));
}
