const base = (import.meta.env.VITE_AI_API_BASE_URL || '/ai-api').replace(/\/$/, '');
export const assetUrl = (path: string) => path.startsWith('/') ? `${base}${path}` : path;
export const demoMode = import.meta.env.VITE_API_MOCK === 'true';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new Error('백엔드에 연결하지 못했어요. 서버 주소와 실행 상태를 확인해 주세요.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error?.message ?? body?.detail;
    throw new Error(typeof detail === 'string' ? detail : `요청에 실패했어요 (${response.status}).`);
  }
  if (body === null) throw new Error('서버가 올바른 JSON을 반환하지 않았어요.');
  return body as T;
}

export interface Job {
  jobId: string;
  status: string;
  stage?: 'queued' | 'extracting' | 'analyzing' | 'validating' | 'completed' | 'failed';
  files?: { error?: { message?: string }; fileName?: string }[];
  analysisId?: string | null;
  postingId?: string | null;
  taskId?: string | null;
  error?: { message?: string };
}

export async function waitForJob(initial: Job, onStep: (step: number) => void = () => {}): Promise<Job> {
  if (!initial.jobId) throw new Error('서버 응답에 jobId가 없어요.');
  const deadline = Date.now() + 10 * 60_000;
  let job = initial;
  while (Date.now() < deadline) {
    if (job.status === 'SUCCEEDED' || job.status === 'PARTIAL_FAILED') {
      onStep(3);
      return { ...initial, ...job };
    }
    if (job.status === 'FAILED') throw new Error(job.error?.message || 'AI 작업에 실패했어요. 새 요청으로 다시 시도해 주세요.');
    const stages = { queued: 0, extracting: 1, analyzing: 2, validating: 3, completed: 3, failed: 3 };
    onStep(job.stage ? stages[job.stage] : 0);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    job = await request<Job>(`/jobs/${encodeURIComponent(initial.jobId)}`);
  }
  throw new Error('분석 대기 시간이 초과됐어요. 서버 작업 상태를 확인해 주세요.');
}

export const jobHeaders = () => ({ 'Idempotency-Key': crypto.randomUUID() });

