import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Compile production modules in memory; replace only Vite's environment injection.
function moduleUrl(path, dependencies = {}) {
  let source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  source = source.replaceAll('import.meta.env', '({})');
  let output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [name, url] of Object.entries(dependencies)) output = output.replaceAll(`'${name}'`, JSON.stringify(url));
  return 'data:text/javascript;base64,' + Buffer.from(output).toString('base64');
}
const httpUrl = moduleUrl('src/services/http.ts');
const http = await import(httpUrl);
const backendUrl = moduleUrl('src/services/backend.ts');
const careerUrl = moduleUrl('src/services/career.ts', { './http': httpUrl });
const backend = await import(backendUrl);
const career = await import(careerUrl);
const api = await import(moduleUrl('src/services/api.ts', { './http': httpUrl, './backend': backendUrl, './career': careerUrl, '../data/mock': moduleUrl('src/data/mock.ts') }));
const memory = new Map();
globalThis.sessionStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.window = new EventTarget();
const questions = await import(moduleUrl('src/services/questions.ts'));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; memory.clear(); });
function respond(sequence) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.ok(sequence.length, 'unexpected extra request');
    const body = sequence.shift();
    return new Response(JSON.stringify(body), { status: body.httpStatus ?? 200 });
  };
  return calls;
}

test('analysis reads result.data and submits multipart targetJob', async () => {
  const expected = { summary: '근거 요약', sections: [], skills: [] };
  const calls = respond([
    { jobId: 'job', analysisId: 'analysis', status: 'SUCCEEDED' },
    { result: { mode: 'resume', data: expected }, warnings: [] },
  ]);
  assert.deepEqual(await api.analyzeFiles([new File(['sample'], 'sample.pdf')], 'resume', '역할', () => {}, '개발자'), expected);
  assert.equal(calls[0].url, '/ai-api/analyses');
  assert.equal(calls[0].options.body.get('targetJob'), '개발자');
  assert.equal(calls[0].options.body.get('files').name, 'sample.pdf');
  assert.ok(calls[0].options.headers['Idempotency-Key']);
  assert.equal(calls[1].url, '/ai-api/analyses/analysis');
});

test('partial failure preserves successful result and reports warnings', async () => {
  let warnings;
  respond([
    { jobId: 'j', analysisId: 'a', status: 'PARTIAL_FAILED', files: [{ fileName: 'bad.pdf', error: { message: '손상된 파일' } }] },
    { result: { mode: 'specup', data: { owned: [], gaps: [] } }, warnings: [{ message: 'OCR 확인 필요' }] },
  ]);
  await api.analyzeFiles([new File(['x'], 'x.pdf')], 'specup', '', () => {}, '', value => { warnings = value; });
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some(value => value.includes('손상된 파일')));
});

test('polling uses actual stage and stops on success', async () => {
  const stages = [];
  const calls = respond([{ jobId: 'j', status: 'SUCCEEDED', stage: 'completed' }]);
  await http.waitForJob({ jobId: 'j', analysisId: 'a', status: 'RUNNING', stage: 'validating' }, value => stages.push(value));
  assert.deepEqual(stages, [3, 3]);
  assert.equal(calls.length, 1);
});

test('failed job reports backend reason without requesting a result', async () => {
  respond([]);
  await assert.rejects(http.waitForJob({ jobId: 'j', status: 'FAILED', error: { message: 'WORKER_RESTARTED' } }), /WORKER_RESTARTED/);
});

test('posting preserves nullable fields, units, and missing-question metadata', async () => {
  const data = { company: null, job: null, skills: [], questions: [{ id: 'q1', no: 1, title: '동기', limit: null, countUnit: 'unknown', includesSpaces: null, needsCheck: true }] };
  respond([{ jobId: 'j', postingId: 'p', status: 'SUCCEEDED' }, { data, needsManualQuestions: true, missingFields: ['company'], warnings: [] }]);
  const result = await api.parsePosting({ text: '공고 본문' });
  assert.equal(result.company, null);
  assert.equal(result.questions[0].limit, null);
  assert.equal(result.needsManualQuestions, true);
});

test('portfolio resolves image paths and retains unknown contribution', async () => {
  respond([{ jobId: 'j', analysisId: 'a', status: 'SUCCEEDED' }, { result: { mode: 'portfolio', data: { sections: [], images: [{ id: 'im', url: '/analyses/a/assets/im' }], role: { contribution: null } } } }]);
  const result = await api.analyzeFiles([new File(['x'], 'x.pdf')], 'portfolio');
  assert.equal(result.images[0].url, '/ai-api/analyses/a/assets/im');
  assert.equal(result.role.contribution, null);
});

test('input errors do not create backend jobs', async () => {
  respond([]);
  await assert.rejects(api.parsePosting({ url: 'https://example.com' }), /본문/);
  await assert.rejects(api.parsePosting({ text: 'x'.repeat(80001) }), /80,000/);
  await assert.rejects(api.analyzeFiles([{ name: 'recent.pdf', size: 0 }], 'resume'), /원본/);
});

test('HTTP errors retain backend message', async () => {
  respond([{ httpStatus: 503, error: { code: 'QUEUE_FULL', message: '작업 큐가 가득 찼어요' } }]);
  await assert.rejects(http.request('/health'), /작업 큐가 가득/);
});

test('unknown and byte limits are never displayed as character counts', () => {
  const question = { limit: 500, countUnit: 'bytes', includesSpaces: true };
  assert.match(questions.questionLimitLabel(question), /500바이트/);
  assert.equal(questions.questionCount('한글', question), 6);
  assert.match(questions.questionLimitLabel({ limit: null }), /확인 필요/);
  assert.equal(questions.questionCount('가 나', { countUnit: 'characters', includesSpaces: false }), 2);
});

const posting = { company: null, job: null, skills: ['Python'], questions: [{ id: 'q1', no: 1, title: '역할', limit: null, countUnit: 'unknown', includesSpaces: null, needsCheck: true }], warnings: ['metadata must not reach strict model'] };
const experience = { id: 'e1', title: 'API 개발', summary: 'Python API를 개발했습니다.', skills: ['Python'], role: '', achievements: [], period: '', contribution: null, category: 'ETC', source: '' };
test('recommendation removes FE metadata and maps API experience IDs', async () => {
  const calls = respond([{ items: [{ experienceId: 'e1', fit: 'high', reason: '태그 일치', recommendedQuestionIds: ['q1'], imageCount: 0, metricCount: 0, selected: true }] }]);
  const result = await api.matchExperiences(posting, 'cover', [experience]);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, '/ai-api/cover-letters/recommended-experiences');
  assert.equal(payload.posting.warnings, undefined);
  assert.equal(payload.experiences[0].contribution, undefined);
  assert.equal(result[0].question, 'q1');
});
test('cover generation joins task lookup with question and experience metadata', async () => {
  const calls = respond([{ jobId: 'j', taskId: 't', status: 'SUCCEEDED' }, { data: { answers: [{ questionId: 'q1', text: '근거 초안', usedExperiences: ['e1'], keywords: [] }] } }]);
  const result = await api.generateCoverLetter(posting, [{ ...experience, question: 'q1' }]);
  assert.equal(calls[1].url, '/ai-api/ai-results/t');
  assert.deepEqual(JSON.parse(calls[0].options.body).questionExperienceIds, { q1: ['e1'] });
  assert.equal(result[0].id, 'q1');
  assert.deepEqual(result[0].usedExperiences, ['API 개발']);
});
test('slide generation preserves evidence links and only submits strict outline fields', async () => {
  const outline = Array.from({ length: 6 }, (_, i) => ({ id: 's' + i, title: '프로젝트', type: '프로젝트', desc: '', kind: 'text', sourceExperienceIds: ['e1'] }));
  const calls = respond([{ jobId: 'j', taskId: 't', status: 'SUCCEEDED' }, { data: { slides: [{ ...outline[0], corePhrases: ['원문 기반 내용'], metrics: [], layout: '텍스트 강조' }] } }]);
  const result = await api.generateSlides(outline, posting, [experience]);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.size, 6);
  assert.equal(payload.outline[0].desc, undefined);
  assert.deepEqual(payload.outline[0].sourceExperienceIds, ['e1']);
  assert.equal(result[0].desc, '원문 기반 내용');
});
test('login uses B API and experience save sends bearer token and B schema', async () => {
  const dto = { id: 'uuid', title: experience.title, category: 'ETC', period: { start: null, end: null }, achievements: [experience.summary], skills: ['Python'], role: null, portfolio: null, sourceFileId: null };
  const calls = respond([{ success: true, data: { accessToken: 'access', refreshToken: 'refresh', user: { id: 'user1' } } }, { success: true, data: dto }]);
  await backend.login('22016007', 'password123');
  const saved = await api.saveExperience(experience);
  assert.equal(calls[0].url, '/backend-api/api/v1/auth/login');
  assert.equal(calls[1].options.headers.get('Authorization'), 'Bearer access');
  assert.equal(saved.id, 'uuid');
  assert.deepEqual(JSON.parse(calls[1].options.body).period, { start: null, end: null });
});
test('expired B token refreshes once then retries original request', async () => {
  backend.setSession({ accessToken: 'old', refreshToken: 'refresh' });
  const calls = respond([{ httpStatus: 401, success: false }, { success: true, data: { accessToken: 'new', refreshToken: 'next' } }, { success: true, data: { ready: true } }]);
  assert.deepEqual(await backend.backend('/users/me'), { ready: true });
  assert.equal(calls[1].url, '/backend-api/api/v1/auth/refresh');
  assert.equal(calls[2].options.headers.get('Authorization'), 'Bearer new');
});

test('remode reuses cached analysis without uploading files again', async () => {
  let analysisId;
  const calls = respond([
    { jobId: 'j', analysisId: 'new-analysis', status: 'SUCCEEDED' },
    { result: { mode: 'specup', data: { owned: [], gaps: [] } }, warnings: [] },
  ]);
  await api.analyzeFiles([], 'specup', '새 메모', () => {}, '개발자', () => {}, { sourceAnalysisId: 'old-analysis', onAnalysis: id => { analysisId = id; } });
  assert.equal(calls[0].url, '/ai-api/analyses/old-analysis/remode');
  assert.deepEqual(JSON.parse(calls[0].options.body), { mode: 'specup', memo: '새 메모', targetJob: '개발자' });
  assert.equal(analysisId, 'new-analysis');
});

test('original file storage sends multipart without forcing JSON content type', async () => {
  const calls = respond([{ success: true, data: { files: [{ fileId: 'file1', name: 'sample.pdf' }] } }]);
  const files = await backend.storeFiles([new File(['pdf'], 'sample.pdf')]);
  assert.equal(calls[0].url, '/backend-api/api/v1/files');
  assert.equal(calls[0].options.headers.has('Content-Type'), false);
  assert.equal(calls[0].options.body.get('files').name, 'sample.pdf');
  assert.equal(files[0].fileId, 'file1');
});

test('reuse retrieves owned file then downloads its signed URL without the API token', async () => {
  backend.setSession({ accessToken: 'private-token', refreshToken: 'refresh' });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? new Response(JSON.stringify({ success: true, data: { name: 'saved.pdf', downloadUrl: 'https://storage.example/file?signature=example' } }))
      : new Response('original bytes', { headers: { 'Content-Type': 'application/pdf' } });
  };
  const file = await backend.reuseFile('file1');
  assert.equal(file.name, 'saved.pdf');
  assert.equal(await file.text(), 'original bytes');
  assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer private-token');
  assert.equal(calls[1].options.headers, undefined);
});

test('unsupported B storage format is rejected before creating a file', async () => {
  respond([]);
  await assert.rejects(backend.storeFiles([new File(['webp'], 'sample.webp')]), /원본 보관/);
});

test('word limits preserve word boundaries even when spaces are excluded', () => {
  assert.equal(questions.questionCount('협업 경험\n두 가지', { countUnit: 'words', includesSpaces: false }), 4);
  assert.equal(questions.questionCount('협업 경험\n두 가지', { countUnit: 'words', includesSpaces: true }), 4);
});

test('cover progress maps server stages to queue, generation, validation', async () => {
  const stages = [];
  respond([{ jobId: 'j', taskId: 't', status: 'RUNNING', stage: 'analyzing' }, { jobId: 'j', taskId: 't', status: 'SUCCEEDED', stage: 'completed' }, { data: { answers: [{ questionId: 'q1', text: '초안', usedExperiences: ['e1'], keywords: [] }] } }]);
  await api.generateCoverLetter(posting, [{ ...experience, question: 'q1' }], stage => stages.push(stage));
  assert.deepEqual(stages, [1, 2]);
});

test('regeneration sends the current user text and only returns the requested replacement', async () => {
  const original = { ...posting.questions[0], text: '사용자가 수정한 원본', usedExperiences: ['API 개발'], keywords: [] };
  const calls = respond([{ jobId: 'j', taskId: 't', status: 'SUCCEEDED' }, { data: { answers: [{ questionId: 'q1', text: '새 초안', usedExperiences: ['e1'], keywords: [] }], replacementApplied: false } }]);
  const result = await career.rewrite(posting, [{ ...experience, question: 'q1' }], original, '간결하게');
  assert.equal(JSON.parse(calls[0].options.body).previousText, '사용자가 수정한 원본');
  assert.equal(result.id, 'q1');
  assert.equal(result.text, '새 초안');
  assert.equal(original.text, '사용자가 수정한 원본');
});
