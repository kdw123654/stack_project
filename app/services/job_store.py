"""Local AI job persistence. Does not own the application's user/experience DB."""
import json
import sqlite3
from pathlib import Path
from threading import RLock


class JobStore:
    def __init__(self, path: str):
        self._lock = RLock()
        self.connection = None
        if path:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            self.connection = sqlite3.connect(path, check_same_thread=False)
            self.connection.execute("PRAGMA journal_mode=WAL")
            self.connection.execute("""CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, job TEXT NOT NULL, result TEXT, context TEXT,
                history TEXT, request_key TEXT UNIQUE, fingerprint TEXT
            )""")
            self.connection.commit()

    def load(self):
        if self.connection is None:
            return []
        with self._lock:
            return self.connection.execute("SELECT id, job, result, context, history, request_key, fingerprint FROM jobs").fetchall()

    def create(self, job, key, fingerprint):
        if self.connection is not None:
            with self._lock, self.connection:
                self.connection.execute("INSERT INTO jobs (id, job, request_key, fingerprint) VALUES (?, ?, ?, ?)",
                                        (job.jobId, job.model_dump_json(), key, fingerprint))

    def update_job(self, job):
        if self.connection is not None:
            with self._lock, self.connection:
                self.connection.execute("UPDATE jobs SET job=? WHERE id=?", (job.model_dump_json(), job.jobId))

    def result(self, job_id, result, context=None, history=None):
        if self.connection is not None:
            with self._lock, self.connection:
                self.connection.execute("UPDATE jobs SET result=?, context=?, history=? WHERE id=?", (
                    result.model_dump_json(), json.dumps(context, ensure_ascii=False) if context is not None else None,
                    json.dumps([v.model_dump(mode="json") for v in history], ensure_ascii=False) if history is not None else None,
                    job_id,
                ))

    def complete(self, job, result, context=None, history=None):
        if self.connection is not None:
            with self._lock, self.connection:
                self.connection.execute("UPDATE jobs SET job=?, result=?, context=?, history=? WHERE id=?", (
                    job.model_dump_json(), result.model_dump_json(),
                    json.dumps(context, ensure_ascii=False) if context is not None else None,
                    json.dumps([v.model_dump(mode="json") for v in history], ensure_ascii=False) if history is not None else None,
                    job.jobId,
                ))

    def delete(self, job_id):
        if self.connection is not None:
            with self._lock, self.connection:
                self.connection.execute("DELETE FROM jobs WHERE id=?", (job_id,))

    def close(self):
        if self.connection is not None:
            self.connection.close()
