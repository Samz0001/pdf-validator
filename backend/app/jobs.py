"""Job execution. Called by Celery (production) or FastAPI BackgroundTasks (dev)."""
from __future__ import annotations

import json
import os
import tempfile
import traceback

from .db import Job, SessionLocal, utcnow
from .engine.pipeline import run_validation
from .schemas import CompareOptions
from .storage import storage


def process_job(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if job is None:
            return
        job.status = "running"
        db.commit()
        try:
            opts = CompareOptions(**(job.options or {}))
            with tempfile.TemporaryDirectory() as tmp:
                ref, test, out = (os.path.join(tmp, n) for n in ("reference.pdf", "candidate.pdf", "out"))
                storage.download(job_id, "reference.pdf", ref)
                storage.download(job_id, "candidate.pdf", test)
                result = run_validation(ref, test, out, opts, job.reference_name, job.candidate_name)
                for name in sorted(os.listdir(out)):
                    storage.put_file(job_id, name, os.path.join(out, name))
            job.result = json.loads(result.model_dump_json())
            job.status = "done"
        except Exception as e:  # noqa: BLE001
            job.status = "failed"
            job.error = f"{type(e).__name__}: {e}"
            traceback.print_exc()
        job.finished_at = utcnow()
        db.commit()
