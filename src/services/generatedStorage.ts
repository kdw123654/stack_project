import { backend, BackendError } from './backend';
import { postingPayload } from './career';
import { assetUrl } from './http';
import type { CoverDraft, Experience, Posting, SlideItem } from '../types';

export type ExportFormat = 'PDF' | 'PPTX';
export interface ProjectRef {
  id: string;
  postingId: string;
  updatedAt: string;
  length?: 'SHORT_6' | 'BASIC_10' | 'DETAIL_14';
}

type StoredAnswer = { questionId: string; content: string };
type StoredSlide = { id: string; slideNo: number; title: string; body: string; imageIds?: string[] };
type CoverProject = ProjectRef & { answers: StoredAnswer[] };
type PortfolioProject = ProjectRef & { slides: StoredSlide[] };
type Checkpoint = (project: ProjectRef) => void;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function storePosting(posting: Posting) {
  if (!posting.source) throw new Error('이전 초안은 공고를 다시 분석한 뒤 서버에 저장할 수 있어요.');
  const imported = await backend<{ postingId: string; questions: Record<string, unknown>[] }>('/job-postings', json('POST', posting.source));
  const questions = postingPayload(posting).questions.map(q => ({
    id: q.id, order: q.no, text: q.title, charLimit: q.limit, countUnit: q.countUnit,
    includesSpaces: q.includesSpaces, needsCheck: q.needsCheck,
  })).sort((a, b) => a.order - b.order);
  if (questions.length !== imported.questions.length ||
      questions.some((q, i) => Object.entries(q).some(([key, value]) => imported.questions[i]?.[key] !== value))) {
    await backend(`/job-postings/${encodeURIComponent(imported.postingId)}/questions`, json('PATCH', { questions }));
  }
  return imported.postingId;
}

export async function storeCover(posting: Posting, drafts: CoverDraft[], current: ProjectRef | undefined, checkpoint: Checkpoint) {
  const sourceTaskId = drafts[0]?.generation?.taskId;
  if (!sourceTaskId || drafts.some(d => !d.generation || d.generation.taskId !== sourceTaskId)) {
    throw new Error('이전 초안은 다시 생성한 뒤 서버에 저장할 수 있어요.');
  }
  if (drafts.some(d => !d.text.trim())) throw new Error('비어 있는 답변을 입력해 주세요.');
  const postingId = await storePosting(posting);
  let project = current?.postingId === postingId ? current : await backend<ProjectRef>('/cover-letters', json('POST', { postingId }));
  checkpoint(project);
  const path = `/cover-letters/${encodeURIComponent(project.id)}`;
  let stored = await backend<CoverProject>(`${path}/answers`, json('PUT', {
    sourceTaskId, expectedUpdatedAt: project.updatedAt, answers: drafts.map(d => d.generation!.original),
  }));
  checkpoint(stored);
  for (const draft of drafts) {
    if (stored.answers.find(answer => answer.questionId === draft.id)?.content !== draft.text) {
      stored = await backend<CoverProject>(`${path}/answers/${draft.no}`, json('PATCH', { content: draft.text }));
      checkpoint(stored);
    }
  }
  project = await backend<ProjectRef>(`${path}/save`, json('POST'));
  checkpoint(project);
  return project;
}

export function analysisImageUrl(imageId: string, experiences: Experience[]) {
  for (const experience of experiences) {
    if (!experience.assets?.some(asset => asset.id === imageId)) continue;
    const portfolio = experience.backendData?.portfolio as { analysisId?: string } | undefined;
    if (portfolio?.analysisId) return assetUrl(`/analyses/${encodeURIComponent(portfolio.analysisId)}/assets/${encodeURIComponent(imageId)}`);
  }
  return undefined;
}

export const readProjectImage = (projectId: string, imageId: string) =>
  backend<Blob>(`/portfolios/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`);

export async function storePortfolio(
  posting: Posting, slides: SlideItem[], format: ExportFormat, current: ProjectRef | undefined,
  checkpoint: Checkpoint, experiences: Experience[], pendingImages: ReadonlyMap<string, File>,
) {
  const length = ({ 6: 'SHORT_6', 10: 'BASIC_10', 14: 'DETAIL_14' } as const)[slides.length as 6 | 10 | 14];
  const sourceTaskId = slides[0]?.generation?.taskId;
  if (!length || !sourceTaskId || slides.some(slide => slide.generation?.taskId !== sourceTaskId)) {
    throw new Error('슬라이드 구성을 생성한 뒤 서버에 저장해 주세요.');
  }
  const postingId = await storePosting(posting);
  const project = current?.postingId === postingId && current.length === length
    ? current : await backend<ProjectRef>('/portfolios', json('POST', { postingId, length, format }));
  checkpoint(project);
  const path = `/portfolios/${encodeURIComponent(project.id)}`;
  let stored = await backend<PortfolioProject>(`${path}/slides`, json('PUT', {
    sourceTaskId, expectedUpdatedAt: project.updatedAt, size: slides.length,
    slides: slides.map(slide => slide.generation!.original),
  }));
  checkpoint(stored);
  for (const slide of slides) {
    const previous = stored.slides.find(item => item.id === slide.id);
    if (!previous) throw new Error('저장된 슬라이드의 순서나 ID가 바뀌었습니다.');
    if (slide.replacement) {
      stored = await backend<PortfolioProject>(`${path}/slides/${previous.slideNo}/generated`, json('PUT', {
        sourceTaskId: slide.replacement.taskId, expectedUpdatedAt: stored.updatedAt, slide: slide.replacement.original,
      }));
      checkpoint(stored);
    }
    const latest = stored.slides.find(item => item.id === slide.id)!;
    const imageIds = slide.imageIds ?? [];
    if (latest.title !== slide.title || latest.body !== slide.desc ||
        JSON.stringify(latest.imageIds ?? []) !== JSON.stringify(imageIds)) {
      stored = await backend<PortfolioProject>(`${path}/slides/${latest.slideNo}`, json('PATCH', {
        title: slide.title, body: slide.desc, imageIds,
      }));
      checkpoint(stored);
    }
  }
  for (const id of new Set(slides.flatMap(slide => slide.imageIds ?? []))) {
    let image: Blob | undefined = pendingImages.get(id);
    if (!image) {
      try { await readProjectImage(project.id, id); continue; }
      catch (error) {
        if (!(error instanceof BackendError) || error.code !== 'IMAGE_NOT_UPLOADED') throw error;
      }
      const url = analysisImageUrl(id, experiences);
      if (url) {
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (response.ok) image = await response.blob();
      }
      if (!image) throw new Error('원본 이미지가 만료됐어요. 해당 슬라이드에서 이미지를 다시 선택해 주세요.');
    }
    const form = new FormData();
    form.append('imageId', id);
    form.append('file', image, 'slide-image');
    await backend(`${path}/images`, { method: 'POST', body: form });
  }
  const result = await backend<ProjectRef>(path);
  checkpoint(result);
  return result;
}

export const exportPortfolio = (projectId: string, format: ExportFormat) =>
  backend<{ downloadUrl: string }>(`/portfolios/${encodeURIComponent(projectId)}/export`, {
    ...json('POST', { format }), signal: AbortSignal.timeout(240_000),
  });
