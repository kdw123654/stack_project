import hashlib
import json
import logging
import base64
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from copy import deepcopy
from datetime import datetime, timezone
from threading import BoundedSemaphore, RLock
from typing import Callable
from uuid import uuid4

from app.config import Settings
from app.errors import AppError
from app.schemas.analysis import (
    AcceptedAnalysis, AnalysisView, FileOutcome, JobStatus, JobView, Mode,
    AnalysisPatch, RemodeRequest,
)
from app.schemas.document import ErrorDetail
from app.schemas.job_posting import AcceptedPosting, PostingAnalysisView
from app.services.analysis import analyze
from app.services.documents import apply_ocr, parse_document
from app.services.llm import LLM
from app.services.job_posting import analyze_posting
from app.schemas.career import AcceptedTask, DraftRequest, RegenerateRequest, OutlineRequest, PortfolioRequest, TaskResult
from app.services.career import checked_payload, generate_cover, generate_outline, generate_portfolio, require_experiences, semantic_recommend, semantic_diagnose
from app.services.analysis import to_output
from app.services.job_store import JobStore
from app.schemas.document import ExtractedDocument

logger = logging.getLogger("stack.jobs")
TERMINAL = {JobStatus.SUCCEEDED, JobStatus.PARTIAL_FAILED, JobStatus.FAILED}


@dataclass(frozen=True)
class InputFile:
    name: str
    content: bytes


@dataclass
class AnalysisContext:
    documents: dict
    outcomes: list[FileOutcome]
    ocr_sources: set
    assets: dict


class JobManager:
    """Bounded, single-process development queue. No user/experience DB ownership."""

    def __init__(self, settings: Settings, llm: LLM):
        self.settings, self.llm = settings, llm
        self._lock = RLock()
        self._slots = BoundedSemaphore(settings.job_capacity)
        self._pool = ThreadPoolExecutor(max_workers=settings.job_workers, thread_name_prefix="stack-ai")
        self._jobs: dict[str, JobView] = {}
        self._results: dict[str, AnalysisView] = {}
        self._analyses: dict[str, str] = {}
        self._posting_jobs: dict[str, str] = {}
        self._posting_results: dict[str, PostingAnalysisView] = {}
        self._task_jobs: dict[str, str] = {}
        self._task_results: dict[str, TaskResult] = {}
        self._contexts: dict[str, AnalysisContext] = {}
        self._history: dict[str, list[AnalysisView]] = {}
        self._keys: dict[str, tuple[str, str]] = {}
        self._store = JobStore(settings.job_store_path)
        self._restore()

    def close(self) -> None:
        self._pool.shutdown(wait=True)
        self._store.close()

    @staticmethod
    def _encode_context(context):
        return {"documents": {key: doc.model_dump() for key, doc in context.documents.items()},
                "outcomes": [f.model_dump() for f in context.outcomes],
                "ocr_sources": list(context.ocr_sources),
                "assets": {key: {"metadata": a["metadata"], "content": base64.b64encode(a["content"]).decode("ascii")}
                           for key, a in context.assets.items()}}

    @staticmethod
    def _decode_context(context):
        return AnalysisContext(
            {key: ExtractedDocument.model_validate(doc) for key, doc in context["documents"].items()},
            [FileOutcome.model_validate(f) for f in context["outcomes"]],
            {tuple(source) for source in context["ocr_sources"]},
            {key: {"metadata": a["metadata"], "content": base64.b64decode(a["content"])} for key, a in context["assets"].items()},
        )

    def _restore(self):
        for job_id, job_json, result_json, context_json, history_json, key, fingerprint in self._store.load():
            job = JobView.model_validate_json(job_json)
            if job.status in TERMINAL and (datetime.now(timezone.utc) - job.updatedAt).total_seconds() >= self.settings.job_ttl_seconds:
                self._store.delete(job_id)
                continue
            interrupted = job.status not in TERMINAL
            if interrupted:
                # Never repeat a possibly-billed external request automatically.
                job.status, job.stage = JobStatus.FAILED, "failed"
                job.error = ErrorDetail(code="WORKER_RESTARTED", message="서버 재시작으로 작업이 중단되었습니다. 새 요청 키로 다시 시도해 주세요.")
                job.updatedAt = datetime.now(timezone.utc)
                self._store.update_job(job)
            self._jobs[job_id] = job
            if key:
                self._keys[key] = (fingerprint, job_id)
            if job.analysisId:
                self._analyses[job.analysisId] = job_id
                if result_json and not interrupted:
                    self._results[job.analysisId] = AnalysisView.model_validate_json(result_json)
                    self._contexts[job.analysisId] = self._decode_context(json.loads(context_json))
                    self._history[job.analysisId] = [AnalysisView.model_validate(v) for v in json.loads(history_json)]
            elif job.postingId:
                self._posting_jobs[job.postingId] = job_id
                if result_json and not interrupted:
                    self._posting_results[job.postingId] = PostingAnalysisView.model_validate_json(result_json)
            else:
                self._task_jobs[job.taskId] = job_id
                if result_json and not interrupted:
                    self._task_results[job.taskId] = TaskResult.model_validate_json(result_json)
        self._purge()

    def _purge(self) -> None:
        now = datetime.now(timezone.utc)
        expired = {job_id for job_id, job in self._jobs.items()
                   if job.status in TERMINAL
                   and (now - job.updatedAt).total_seconds() >= self.settings.job_ttl_seconds}
        for job_id in expired:
            self._store.delete(job_id)
            job = self._jobs.pop(job_id)
            if job.analysisId:
                self._analyses.pop(job.analysisId, None)
                self._results.pop(job.analysisId, None)
                self._contexts.pop(job.analysisId, None)
                self._history.pop(job.analysisId, None)
            if job.postingId:
                self._posting_jobs.pop(job.postingId, None)
                self._posting_results.pop(job.postingId, None)
            if job.taskId:
                self._task_jobs.pop(job.taskId, None)
                self._task_results.pop(job.taskId, None)
        self._keys = {key: pair for key, pair in self._keys.items() if pair[1] not in expired}

    def submit(self, files: list[InputFile], mode: Mode, memo: str, target_job: str,
               idempotency_key: str | None) -> AcceptedAnalysis:
        fingerprint = hashlib.sha256(json.dumps({
            "kind": "analysis", "mode": mode.value, "memo": memo, "targetJob": target_job,
            "files": [(file.name, hashlib.sha256(file.content).hexdigest()) for file in files],
        }, ensure_ascii=False).encode()).hexdigest()
        job = self._enqueue("analysis", fingerprint, idempotency_key, self._run, files, mode, memo, target_job)
        return self._accepted(job)

    def submit_posting(self, text: str, idempotency_key: str | None) -> AcceptedPosting:
        if len(json.dumps({"text": text}, ensure_ascii=False)) > self.settings.max_context_characters:
            raise AppError("CONTEXT_TOO_LARGE", "공고 본문이 너무 깁니다. 내용을 나누어 입력해 주세요.")
        fingerprint = hashlib.sha256(json.dumps({"kind": "job_posting", "text": text}, ensure_ascii=False).encode()).hexdigest()
        job = self._enqueue("job_posting", fingerprint, idempotency_key, self._run_posting, text)
        return AcceptedPosting(jobId=job.jobId, postingId=job.postingId, status=job.status)

    def _enqueue(self, kind: str, fingerprint: str, idempotency_key: str | None,
                 worker: Callable, *args) -> JobView:
        if not self.llm.configured:
            raise AppError("LLM_NOT_CONFIGURED", ".env에 OPENAI_API_KEY를 설정해 주세요.", 503)
        with self._lock:
            self._purge()
            if idempotency_key and idempotency_key in self._keys:
                old_fingerprint, job_id = self._keys[idempotency_key]
                if old_fingerprint != fingerprint:
                    raise AppError("IDEMPOTENCY_CONFLICT", "같은 요청 키를 다른 입력에 사용할 수 없습니다.", 409)
                return self._jobs[job_id].model_copy(deep=True)
            if len(self._jobs) >= self.settings.job_max_records or not self._slots.acquire(blocking=False):
                raise AppError("QUEUE_FULL", "분석 작업이 많습니다. 잠시 후 다시 시도해 주세요.", 503)
            now = datetime.now(timezone.utc)
            result_id = str(uuid4())
            is_task = kind not in ("analysis", "job_posting")
            job = JobView(jobId=str(uuid4()), kind=kind,
                          analysisId=result_id if kind == "analysis" else None,
                          postingId=result_id if kind == "job_posting" else None,
                          taskId=result_id if is_task else None, status=JobStatus.QUEUED,
                          stage="queued", createdAt=now, updatedAt=now)
            self._jobs[job.jobId] = job
            mapping = self._analyses if kind == "analysis" else self._posting_jobs if kind == "job_posting" else self._task_jobs
            mapping[result_id] = job.jobId
            if idempotency_key:
                self._keys[idempotency_key] = (fingerprint, job.jobId)
            accepted = job.model_copy(deep=True)
            try:
                self._store.create(job, idempotency_key, fingerprint)
                self._pool.submit(worker, job.jobId, *args)
            except (RuntimeError, sqlite3.Error, OSError):
                self._store.delete(job.jobId)
                self._jobs.pop(job.jobId)
                mapping.pop(result_id)
                if idempotency_key:
                    self._keys.pop(idempotency_key)
                self._slots.release()
                raise AppError("QUEUE_UNAVAILABLE", "분석 워커가 종료 중입니다.", 503) from None
            return accepted

    @staticmethod
    def _accepted(job: JobView) -> AcceptedAnalysis:
        return AcceptedAnalysis(jobId=job.jobId, analysisId=job.analysisId, status=job.status)

    def get_job(self, job_id: str) -> JobView:
        with self._lock:
            self._purge()
            if job_id not in self._jobs:
                raise AppError("JOB_NOT_FOUND", "작업이 없거나 보관 시간이 만료되었습니다.", 404)
            return self._jobs[job_id].model_copy(deep=True)

    def get_result(self, analysis_id: str) -> AnalysisView:
        with self._lock:
            self._purge()
            job_id = self._analyses.get(analysis_id)
            if not job_id:
                raise AppError("ANALYSIS_NOT_FOUND", "분석이 없거나 보관 시간이 만료되었습니다.", 404)
            if analysis_id not in self._results:
                code = "ANALYSIS_FAILED" if self._jobs[job_id].status == JobStatus.FAILED else "ANALYSIS_NOT_READY"
                raise AppError(code, "결과가 없습니다. 작업 상태와 오류를 확인해 주세요.", 409)
            return self._results[analysis_id].model_copy(deep=True)

    def _update(self, job_id: str, **changes) -> None:
        with self._lock:
            self._jobs[job_id] = self._jobs[job_id].model_copy(update={
                **changes, "updatedAt": datetime.now(timezone.utc),
            }, deep=True)
            self._store.update_job(self._jobs[job_id])

    def _complete(self, job_id, result, context=None, history=None, status=JobStatus.SUCCEEDED):
        job = self._jobs[job_id].model_copy(update={"status": status, "stage": "completed", "updatedAt": datetime.now(timezone.utc)})
        self._store.complete(job, result, context, history)
        self._jobs[job_id] = job

    def get_posting_result(self, posting_id: str) -> PostingAnalysisView:
        with self._lock:
            self._purge()
            job_id = self._posting_jobs.get(posting_id)
            if not job_id:
                raise AppError("POSTING_ANALYSIS_NOT_FOUND", "공고 분석이 없거나 보관 시간이 만료되었습니다.", 404)
            if posting_id not in self._posting_results:
                code = "POSTING_ANALYSIS_FAILED" if self._jobs[job_id].status == JobStatus.FAILED else "POSTING_ANALYSIS_NOT_READY"
                raise AppError(code, "결과가 없습니다. 작업 상태와 오류를 확인해 주세요.", 409)
            return self._posting_results[posting_id].model_copy(deep=True)

    def submit_career(self, kind: str, payload, question_id: str | None, key: str | None) -> AcceptedTask:
        require_experiences(payload)
        checked_payload(payload, self.settings)
        if isinstance(payload, DraftRequest):
            if not payload.posting.questions or question_id is not None and question_id not in {q.id for q in payload.posting.questions}:
                raise AppError("QUESTIONS_REQUIRED", "생성할 문항을 확인해 주세요.")
        if kind not in ("cover_generate", "cover_regenerate", "portfolio_outline", "portfolio_generate", "experience_match", "competency_diagnose"):
            raise AppError("INVALID_TASK_KIND", "지원하지 않는 작업입니다.")
        fingerprint = hashlib.sha256(json.dumps({"kind": kind, "payload": payload.model_dump(), "questionId": question_id}, ensure_ascii=False).encode()).hexdigest()
        job = self._enqueue(kind, fingerprint, key, self._run_career, kind, payload.model_copy(deep=True), question_id)
        return AcceptedTask(jobId=job.jobId, taskId=job.taskId, status=job.status)

    def get_task_result(self, task_id: str) -> TaskResult:
        with self._lock:
            self._purge()
            job_id = self._task_jobs.get(task_id)
            if not job_id:
                raise AppError("AI_RESULT_NOT_FOUND", "생성 결과가 없거나 만료되었습니다.", 404)
            if task_id not in self._task_results:
                code = "AI_TASK_FAILED" if self._jobs[job_id].status == JobStatus.FAILED else "AI_RESULT_NOT_READY"
                raise AppError(code, "작업 상태와 오류를 확인해 주세요.", 409)
            return self._task_results[task_id].model_copy(deep=True)

    def _run_career(self, job_id, kind, payload, question_id):
        try:
            self._update(job_id, status=JobStatus.RUNNING, stage="analyzing")
            if kind == "experience_match":
                data = semantic_recommend(self.llm, self.settings, payload, job_id)
            elif kind == "competency_diagnose":
                data = semantic_diagnose(self.llm, self.settings, payload, job_id)
            elif kind in ("cover_generate", "cover_regenerate"):
                data = generate_cover(self.llm, self.settings, payload, job_id, question_id)
            elif kind == "portfolio_outline":
                data = generate_outline(self.llm, self.settings, payload, job_id)
            else:
                data = generate_portfolio(self.llm, self.settings, payload, job_id)
            job = self.get_job(job_id)
            with self._lock:
                view = TaskResult(taskId=job.taskId, jobId=job_id, kind=kind, data=data)
                self._complete(job_id, view)
                self._task_results[job.taskId] = view
        except AppError as exc:
            self._update(job_id, status=JobStatus.FAILED, stage="failed", error=ErrorDetail(code=exc.code, message=exc.message))
        except Exception:
            logger.error("career_task_failed job_id=%s", job_id)
            self._update(job_id, status=JobStatus.FAILED, stage="failed", error=ErrorDetail(code="INTERNAL_ERROR", message="AI 생성 중 오류가 발생했습니다."))
        finally:
            self._slots.release()

    def submit_remode(self, analysis_id: str, request: RemodeRequest, key: str | None):
        with self._lock:
            self.get_result(analysis_id)
            context = deepcopy(self._contexts[analysis_id])
        fingerprint = hashlib.sha256(json.dumps({"kind": "remode", "source": analysis_id, **request.model_dump()}, ensure_ascii=False).encode()).hexdigest()
        job = self._enqueue("analysis", fingerprint, key, self._run_remode, analysis_id, context, request)
        return self._accepted(job)

    def _run_remode(self, job_id, source_id, context, request):
        try:
            self._update(job_id, status=JobStatus.RUNNING, stage="analyzing", files=context.outcomes)
            result, evidence, warnings = analyze(self.llm, self.settings, request.mode, context.documents,
                                                 context.ocr_sources, request.memo, request.targetJob, job_id)
            self._finish_analysis(job_id, result, evidence, warnings, context, source_id)
        except AppError as exc:
            self._update(job_id, status=JobStatus.FAILED, stage="failed", error=ErrorDetail(code=exc.code, message=exc.message))
        except Exception:
            self._update(job_id, status=JobStatus.FAILED, stage="failed", error=ErrorDetail(code="INTERNAL_ERROR", message="재분석 중 오류가 발생했습니다."))
        finally:
            self._slots.release()

    def patch_analysis(self, analysis_id: str, patch: AnalysisPatch):
        with self._lock:
            current = self.get_result(analysis_id)
            if current.version != patch.expectedVersion:
                raise AppError("VERSION_CONFLICT", "분석 결과가 변경되었습니다. 최신 버전을 다시 조회해 주세요.", 409)
            if len(self._history[analysis_id]) >= 20:
                raise AppError("VERSION_LIMIT", "로컬 수정 이력 한도(20개)에 도달했습니다.", 409)
            if len({edit.path for edit in patch.edits}) != len(patch.edits):
                raise AppError("DUPLICATE_FIELD", "같은 필드는 한 번만 수정해 주세요.")
            for edit in patch.edits:
                try:
                    field = self._review_field(current.evidence, edit.path)
                    ai_value = self._review_field(current.aiEvidence, edit.path).value
                except (IndexError, AttributeError):
                    raise AppError("INVALID_FIELD_PATH", "수정할 필드가 없습니다.") from None
                field.value, field.needsCheck, field.sources = edit.value, False, []
                current.reviews = [r for r in current.reviews if r["path"] != edit.path]
                current.reviews.append({"path": edit.path, "aiValue": ai_value, "userValue": edit.value,
                                        "status": "USER_CONFIRMED"})
            current.result = to_output(Mode(current.result.mode), current.evidence, self._contexts[analysis_id].documents)
            self._attach_assets(current, self._contexts[analysis_id])
            current.version += 1
            if len(current.model_dump_json()) > self.settings.max_context_characters * 4:
                raise AppError("EDIT_TOO_LARGE", "수정 결과가 너무 큽니다.")
            history = [*self._history[analysis_id], current.model_copy(deep=True)]
            self._store.result(current.jobId, current, self._encode_context(self._contexts[analysis_id]), history)
            self._results[analysis_id] = current
            self._history[analysis_id] = history
            self._update(current.jobId)
            return current.model_copy(deep=True)

    @staticmethod
    def _review_field(evidence, path):
        parts = path.split(".")
        if parts[0] == "summary":
            return evidence.summary
        if parts[0] == "sections":
            return evidence.sections[int(parts[1])].field
        if parts[0] == "skills":
            return evidence.skills[int(parts[1])]
        return evidence.owned[int(parts[1])].items[int(parts[3])]

    def versions(self, analysis_id):
        with self._lock:
            self.get_result(analysis_id)
            return [view.model_copy(deep=True) for view in self._history[analysis_id]]

    def experience_export(self, analysis_id):
        view = self.get_result(analysis_id)
        sections = view.evidence.sections
        first = lambda key: next((s.field.value for s in sections if s.key == key and s.field.value), None)
        return {"saveStatus": "NOT_PERSISTED", "idempotencyKey": f"{analysis_id}:{view.version}",
                "analysisId": analysis_id, "version": view.version, "title": first("title"),
                "organization": first("organization"), "period": first("period"), "role": first("role"),
                "summary": view.evidence.summary.value,
                "achievements": [s.field.value for s in sections if s.key in ("achievement", "outcome") and s.field.value],
                "skills": [s.value for s in view.evidence.skills if s.value],
                "evidence": view.evidence.model_dump(), "reviews": view.reviews, "files": [f.model_dump() for f in view.files]}

    def _attach_assets(self, view, context):
        view.assets = [asset["metadata"] for asset in context.assets.values()]
        if view.result.mode == "portfolio":
            view.result.data.images = [{"id": a["id"], "kind": "grid", "page": a["page"],
                                        "label": a["label"], "url": f"/analyses/{view.analysisId}/assets/{a['id']}"}
                                       for a in view.assets]
            view.result.data.coverId = view.assets[0]["id"] if view.assets else ""

    def get_asset(self, analysis_id, asset_id):
        with self._lock:
            self.get_result(analysis_id)
            asset = self._contexts[analysis_id].assets.get(asset_id)
            if not asset:
                raise AppError("ASSET_NOT_FOUND", "이미지가 없거나 만료되었습니다.", 404)
            return asset["content"]

    def _finish_analysis(self, job_id, result, evidence, warnings, context, source_id=None):
        job = self.get_job(job_id)
        view = AnalysisView(analysisId=job.analysisId, jobId=job_id, result=result, evidence=evidence,
                            aiEvidence=evidence.model_copy(deep=True), sourceAnalysisId=source_id,
                            files=context.outcomes, warnings=sorted(set(warnings)))
        self._attach_assets(view, context)
        with self._lock:
            status = JobStatus.PARTIAL_FAILED if any(f.status != "extracted" for f in context.outcomes) else JobStatus.SUCCEEDED
            self._complete(job_id, view, self._encode_context(context), [view], status)
            self._contexts[job.analysisId] = context
            self._results[job.analysisId] = view
            self._history[job.analysisId] = [view.model_copy(deep=True)]

    def _run_posting(self, job_id: str, text: str) -> None:
        try:
            self._update(job_id, status=JobStatus.RUNNING, stage="analyzing")
            data, evidence, missing, warnings = analyze_posting(self.llm, self.settings, text, job_id)
            self._update(job_id, stage="validating")
            job = self.get_job(job_id)
            view = PostingAnalysisView(
                postingId=job.postingId, jobId=job_id, data=data, evidence=evidence,
                missingFields=missing, needsManualQuestions=not data.questions, warnings=warnings,
            )
            with self._lock:
                self._complete(job_id, view)
                self._posting_results[job.postingId] = view
        except AppError as exc:
            self._update(job_id, status=JobStatus.FAILED, stage="failed",
                         error=ErrorDetail(code=exc.code, message=exc.message))
        except Exception:
            logger.error("posting_analysis_failed job_id=%s", job_id)
            self._update(job_id, status=JobStatus.FAILED, stage="failed",
                         error=ErrorDetail(code="INTERNAL_ERROR", message="공고 분석 중 오류가 발생했습니다."))
        finally:
            self._slots.release()

    def _run(self, job_id: str, files: list[InputFile], mode: Mode, memo: str, target_job: str) -> None:
        try:
            self._update(job_id, status=JobStatus.RUNNING, stage="extracting")
            documents, outcomes, warnings, ocr_sources, assets = {}, [], [], set(), {}
            for number, file in enumerate(files, 1):
                file_id = f"file-{number}"
                try:
                    from app.services.documents import prepare_document, validate_upload
                    validate_upload(file.content, file.name)
                    prepared_content, prepared_name = prepare_document(file.content, file.name, self.settings.document_converter)
                    document = parse_document(prepared_content, prepared_name)
                    document.fileName = file.name
                    from app.services.assets import extract_assets
                    found_assets, asset_warnings = extract_assets(prepared_content, prepared_name, file_id, file.name)
                    warnings.extend(asset_warnings)
                    # Bound all image data retained by a multi-file analysis to 10 MiB.
                    for asset_id, asset in found_assets.items():
                        if sum(len(a["content"]) for a in assets.values()) + len(asset["content"]) <= 10 * 1024 * 1024:
                            assets[asset_id] = asset
                        else:
                            warnings.append("ASSET_STORAGE_LIMIT")
                    ocr_pages, ocr_warnings = apply_ocr(document, prepared_content, self.llm, self.settings, f"{job_id}:{file_id}")
                    from app.services.documents import apply_embedded_ocr
                    embedded_pages, embedded_warnings = apply_embedded_ocr(document, found_assets, self.llm, self.settings, f"{job_id}:{file_id}", ocr_pages)
                    ocr_pages = sorted(set(ocr_pages + embedded_pages))
                    ocr_warnings.extend(embedded_warnings)
                    warnings.extend(ocr_warnings)
                    unresolved = [page.page for page in document.pages if page.needsOcr]
                    if not any(page.text for page in document.pages):
                        raise AppError("TEXT_NOT_FOUND", "읽을 수 있는 텍스트가 없습니다. OCR 설정·파일 품질을 확인해 주세요.")
                    documents[file_id] = document
                    ocr_sources.update((file_id, page) for page in ocr_pages)
                    outcomes.append(FileOutcome(fileId=file_id, fileName=file.name,
                                                status="partial" if unresolved else "extracted",
                                                unit=document.unit, unresolvedPages=unresolved, ocrPages=ocr_pages))
                except AppError as exc:
                    outcomes.append(FileOutcome(fileId=file_id, fileName=file.name, status="failed",
                                                error=ErrorDetail(code=exc.code, message=exc.message)))
                except Exception:
                    logger.error("document_extraction_failed job_id=%s file_id=%s", job_id, file_id)
                    outcomes.append(FileOutcome(fileId=file_id, fileName=file.name, status="failed",
                                                error=ErrorDetail(code="EXTRACTION_FAILED", message="문서 추출에 실패했습니다.")))
                self._update(job_id, files=outcomes)
            if not documents:
                raise AppError("ALL_FILES_FAILED", "모든 파일의 텍스트 추출에 실패했습니다.")
            self._update(job_id, stage="analyzing")
            result, evidence, analysis_warnings = analyze(
                self.llm, self.settings, mode, documents, ocr_sources, memo, target_job, job_id,
            )
            self._update(job_id, stage="validating")
            context = AnalysisContext(documents, outcomes, ocr_sources, assets)
            self._finish_analysis(job_id, result, evidence, warnings + analysis_warnings, context)
        except AppError as exc:
            self._update(job_id, status=JobStatus.FAILED, stage="failed",
                         error=ErrorDetail(code=exc.code, message=exc.message))
        except Exception:
            logger.error("analysis_failed job_id=%s", job_id)
            self._update(job_id, status=JobStatus.FAILED, stage="failed",
                         error=ErrorDetail(code="INTERNAL_ERROR", message="분석 중 오류가 발생했습니다."))
        finally:
            self._slots.release()
