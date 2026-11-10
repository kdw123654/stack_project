import { jobHeaders, request, waitForJob, type Job } from './http';
import type { CoverDraft, Experience, MatchedExperience, Posting, SlideItem } from '../types';

export const postingPayload = (posting: Posting) => ({
  company: posting.company, job: posting.job, skills: posting.skills,
  questions: posting.questions.map(q => ({ id: q.id, no: q.no, title: q.title, limit: q.limit,
    countUnit: q.countUnit ?? 'characters', includesSpaces: q.includesSpaces ?? null, needsCheck: q.needsCheck ?? true })),
});
export const experiencePayload = (e: Experience) => ({ id: e.id, title: e.title, summary: e.summary,
  role: e.role ?? '', period: e.period, achievements: e.achievements ?? [], skills: e.skills ?? [], assets: e.assets ?? [] });

async function task<T>(path: string, payload: unknown, onStep: (step: number) => void = () => {}): Promise<T> {
  const job = await waitForJob(await request<Job>(path, { method: 'POST', headers: { ...jobHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), onStep);
  if (!job.taskId) throw new Error('생성 작업 ID가 없어요.');
  return (await request<{ data: T }>(`/ai-results/${encodeURIComponent(job.taskId)}`)).data;
}

export async function recommend(posting: Posting, kind: 'cover' | 'slides', list: Experience[]): Promise<MatchedExperience[]> {
  const result = await request<{ items: { experienceId: string; fit: MatchedExperience['fit']; reason: string; recommendedQuestionIds: string[]; imageCount: number; metricCount: number; selected: boolean }[] }>(`/${kind === 'cover' ? 'cover-letters' : 'portfolios'}/recommended-experiences`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posting: postingPayload(posting), experiences: list.map(experiencePayload) }),
  });
  return result.items.map((item, order) => {
    const experience = list.find(e => e.id === item.experienceId);
    if (!experience) throw new Error('추천 결과에 알 수 없는 경험이 있어요.');
    return { ...experience, fit: item.fit, reason: item.reason, question: kind === 'cover' ? item.recommendedQuestionIds[0] ?? null : null,
      assetsLabel: `이미지 ${item.imageCount} · 성과 문장 ${item.metricCount}`, selected: item.selected, order };
  });
}

const draftPayload = (posting: Posting, picked: MatchedExperience[]) => ({
  posting: postingPayload(posting), experiences: picked.map(experiencePayload),
  questionExperienceIds: Object.fromEntries(posting.questions.flatMap(q => {
    const ids = picked.filter(e => e.question === q.id).map(e => e.id);
    return ids.length ? [[q.id, ids]] : [];
  })),
});
type Answer = Omit<CoverDraft, 'id' | 'no' | 'title'> & { questionId: string };
function answers(posting: Posting, picked: MatchedExperience[], result: { answers: Answer[] }): CoverDraft[] {
  return result.answers.map(answer => {
    const question = posting.questions.find(q => q.id === answer.questionId);
    if (!question) throw new Error('알 수 없는 자소서 문항입니다.');
    return { ...question, ...answer, usedExperiences: answer.usedExperiences.map(id => picked.find(e => e.id === id)?.title ?? id) };
  });
}
export async function cover(posting: Posting, picked: MatchedExperience[], onStep: (step: number) => void) {
  return answers(posting, picked, await task<{ answers: Answer[] }>('/cover-letters/generate', draftPayload(posting, picked), step => onStep(step === 0 ? 0 : step < 3 ? 1 : 2)));
}
export async function rewrite(posting: Posting, picked: MatchedExperience[], draft: CoverDraft, instructions = '') {
  const result = await task<{ answers: Answer[] }>(`/cover-letters/answers/${encodeURIComponent(draft.id)}/regenerate`, { ...draftPayload(posting, picked), previousText: draft.text, instructions });
  const replacement = answers(posting, picked, result).find(a => a.id === draft.id);
  if (!replacement) throw new Error('재생성한 문항을 찾을 수 없어요.');
  return replacement;
}

export async function outline(posting: Posting, picked: MatchedExperience[], size: number): Promise<SlideItem[]> {
  const data = await task<{ slides: SlideItem[] }>('/portfolios/outline', { posting: postingPayload(posting), experiences: picked.map(experiencePayload), size });
  return data.slides.map(slide => ({ ...slide, desc: '', kind: 'text' }));
}
export async function slides(outline: SlideItem[], posting: Posting, picked: MatchedExperience[]): Promise<SlideItem[]> {
  if (![6, 10, 14].includes(outline.length)) throw new Error('슬라이드는 6장, 10장, 14장으로 구성해 주세요.');
  if (outline.some(s => !s.sourceExperienceIds?.length)) throw new Error('각 슬라이드에 근거 경험이 필요해요. 구성을 다시 생성해 주세요.');
  const data = await task<{ slides: (SlideItem & { corePhrases: string[] })[] }>('/portfolios/generate', {
    posting: postingPayload(posting), experiences: picked.map(experiencePayload), size: outline.length,
    outline: outline.map(s => ({ id: s.id, type: s.type, title: s.title, sourceExperienceIds: s.sourceExperienceIds })),
  });
  return data.slides.map(slide => ({ ...slide, desc: slide.corePhrases.join('\n'), kind: 'text' }));
}
