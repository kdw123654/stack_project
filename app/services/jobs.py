import hashlib
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import BoundedSemaphore, RLock
from uuid import uuid4

from app.config import Settings
from app.errors import AppError
from app.schemas.analysis import (
    AcceptedAnalysis, AnalysisView, FileOutcome, JobStatus, JobView, Mode,
)
from app.schemas.document import ErrorDetail
from app.services.analysis import analyze
from app.services.documents import apply_ocr, parse_document
from app.services.llm import LLM

logger = logging.getLogger("stack.jobs")
TERMINAL = {JobStatus.SUCCEEDED, JobStatus.PARTIAL_FAILED, JobStatus.FAILED}


@dataclass(frozen=True)
class InputFile:
    name: str
    content: bytes


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
        self._keys: dict[str, tuple[str, str]] = {}

    def close(self) -> None:
        self._pool.shutdown(wait=True)

    def _purge(self) -> None:
        now = datetime.now(timezone.utc)
        expired = {job_id for job_id, job in self._jobs.items()
                   if job.status in TERMINAL
                   and (now - job.updatedAt).total_seconds() >= self.settings.job_ttl_seconds}
        for job_id in expired:
            job = self._jobs.pop(job_id)
            self._analyses.pop(job.analysisId, None)
            self._results.pop(job.analysisId, None)
        self._keys = {key: pair for key, pair in self._keys.items() if pair[1] not in expired}

    def submit(self, files: list[InputFile], mode: Mode, memo: str, target_job: str,
               idempotency_key: str | None) -> AcceptedAnalysis:
        if not self.llm.configured:
            raise AppError("LLM_NOT_CONFIGURED", ".env에 OPENAI_API_KEY를 설정해 주세요.", 503)
        fingerprint = hashlib.sha256(json.dumps({
            "mode": mode.value, "memo": memo, "targetJob": target_job,
            "files": [(file.name, hashlib.sha256(file.content).hexdigest()) for file in files],
        }, ensure_ascii=False).encode()).hexdigest()
        with self._lock:
            self._purge()
            if idempotency_key and idempotency_key in self._keys:
                old_fingerprint, job_id = self._keys[idempotency_key]
                if old_fingerprint != fingerprint:
                    raise AppError("IDEMPOTENCY_CONFLICT", "같은 요청 키를 다른 입력에 사용할 수 없습니다.", 409)
                return self._accepted(self._jobs[job_id])
            if len(self._jobs) >= self.settings.job_max_records or not self._slots.acquire(blocking=False):
                raise AppError("QUEUE_FULL", "분석 작업이 많습니다. 잠시 후 다시 시도해 주세요.", 503)
            now = datetime.now(timezone.utc)
            job = JobView(jobId=str(uuid4()), analysisId=str(uuid4()), status=JobStatus.QUEUED,
                          stage="queued", createdAt=now, updatedAt=now)
            self._jobs[job.jobId] = job
            self._analyses[job.analysisId] = job.jobId
            if idempotency_key:
                self._keys[idempotency_key] = (fingerprint, job.jobId)
            accepted = self._accepted(job)
            try:
                self._pool.submit(self._run, job.jobId, files, mode, memo, target_job)
            except RuntimeError:
                self._jobs.pop(job.jobId)
                self._analyses.pop(job.analysisId)
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

    def _run(self, job_id: str, files: list[InputFile], mode: Mode, memo: str, target_job: str) -> None:
        try:
            self._update(job_id, status=JobStatus.RUNNING, stage="extracting")
            documents, outcomes, warnings, ocr_sources = {}, [], [], set()
            for number, file in enumerate(files, 1):
                file_id = f"file-{number}"
                try:
                    document = parse_document(file.content, file.name)
                    ocr_pages, ocr_warnings = apply_ocr(document, file.content, self.llm, self.settings, f"{job_id}:{file_id}")
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
            job = self.get_job(job_id)
            view = AnalysisView(analysisId=job.analysisId, jobId=job_id, result=result, evidence=evidence,
                                files=outcomes, warnings=sorted(set(warnings + analysis_warnings)))
            with self._lock:
                self._results[job.analysisId] = view
                status = JobStatus.PARTIAL_FAILED if any(f.status != "extracted" for f in outcomes) else JobStatus.SUCCEEDED
                self._update(job_id, status=status, stage="completed")
        except AppError as exc:
            self._update(job_id, status=JobStatus.FAILED, stage="failed",
                         error=ErrorDetail(code=exc.code, message=exc.message))
        except Exception:
            logger.error("analysis_failed job_id=%s", job_id)
            self._update(job_id, status=JobStatus.FAILED, stage="failed",
                         error=ErrorDetail(code="INTERNAL_ERROR", message="분석 중 오류가 발생했습니다."))
        finally:
            self._slots.release()
