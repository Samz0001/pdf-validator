from __future__ import annotations

import json
import re
import uuid
from collections import Counter
from datetime import timedelta
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .config import settings
from .db import Job, Reference, SessionLocal, init_db, utcnow
from .demo import make_demo_pdfs
from .jobs import process_job
from .schemas import BatchOut, CompareOptions, DailyPoint, StorageUsage, CompareResult, JobOut, RecentJob, ReferenceOut, Stats, TrendPoint
from .storage import storage

LIBRARY = "library"  # storage folder for saved reference PDFs
ID_RE = re.compile(r"^[0-9a-f-]{36}$")
MAX_BATCH = 50
FILE_RE = re.compile(r"^(reference\.pdf|candidate\.pdf|highlighted\.pdf|report\.pdf|result\.json|diff_\d+\.png)$")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="DocuDiff", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])


def _to_out(j: Job) -> JobOut:
    return JobOut(
        id=j.id,
        status=j.status,
        reference_name=j.reference_name,
        candidate_name=j.candidate_name,
        error=j.error,
        created_at=j.created_at.isoformat(),
        finished_at=j.finished_at.isoformat() if j.finished_at else None,
        options=j.options,
        result=CompareResult(**j.result) if j.result else None,
    )


async def _read_pdf(f: UploadFile, label: str) -> bytes:
    data = await f.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"{label} exceeds {settings.max_upload_mb} MB")
    if not data.lstrip()[:5] == b"%PDF-":
        raise HTTPException(400, f"{label} is not a valid PDF")
    return data


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _options(raw: str) -> CompareOptions:
    try:
        return CompareOptions(**json.loads(raw or "{}"))
    except (json.JSONDecodeError, ValidationError, TypeError) as e:
        raise HTTPException(422, f"Invalid options: {e}") from e


async def _reference(reference: UploadFile | None, reference_id: str | None) -> tuple[bytes, str]:
    """The reference comes from an upload or from the saved library."""
    if reference is not None and reference.filename:
        return await _read_pdf(reference, "Reference"), reference.filename or "reference.pdf"
    if reference_id:
        if not ID_RE.match(reference_id):
            raise HTTPException(400, "Invalid reference_id")
        with SessionLocal() as db:
            ref = db.get(Reference, reference_id)
        if ref is None:
            raise HTTPException(404, "Saved reference not found")
        return storage.get_bytes(LIBRARY, f"{ref.id}.pdf"), ref.name
    raise HTTPException(422, "Provide a reference file or a reference_id")


@app.post("/api/jobs", response_model=JobOut, status_code=202)
async def create_job(
    background: BackgroundTasks,
    candidate: UploadFile = File(...),
    reference: UploadFile | None = File(None),
    reference_id: str | None = Form(None),
    options: str = Form("{}"),
):
    opts = _options(options)
    ref_bytes, ref_name = await _reference(reference, reference_id)
    test_bytes = await _read_pdf(candidate, "Candidate")
    return _enqueue(background, ref_bytes, test_bytes, ref_name, candidate.filename or "candidate.pdf", opts)


@app.post("/api/jobs/{job_id}/rerun", response_model=JobOut, status_code=202)
def rerun_job(job_id: str, background: BackgroundTasks, options: CompareOptions = Body(...)):
    """Validate the same two PDFs again with new options (e.g. ignore regions drawn in the inspector)."""
    with SessionLocal() as db:
        job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return _enqueue(background, storage.get_bytes(job_id, "reference.pdf"), storage.get_bytes(job_id, "candidate.pdf"),
                    job.reference_name, job.candidate_name, options)


@app.post("/api/batch", response_model=BatchOut, status_code=202)
async def create_batch(
    background: BackgroundTasks,
    candidates: list[UploadFile] = File(...),
    reference: UploadFile | None = File(None),
    reference_id: str | None = Form(None),
    options: str = Form("{}"),
):
    """One reference against many customised PDFs."""
    if len(candidates) > MAX_BATCH:
        raise HTTPException(413, f"At most {MAX_BATCH} candidates per batch")
    opts = _options(options)
    ref_bytes, ref_name = await _reference(reference, reference_id)
    files = [(await _read_pdf(c, c.filename or "Candidate"), c.filename or f"candidate-{i + 1}.pdf")
             for i, c in enumerate(candidates)]
    batch_id = str(uuid.uuid4())
    for data, name in files:
        _enqueue(background, ref_bytes, data, ref_name, name, opts, batch_id)
    return get_batch(batch_id)


@app.get("/api/batch/{batch_id}", response_model=BatchOut)
def get_batch(batch_id: str):
    with SessionLocal() as db:
        rows = db.query(Job).filter(Job.batch_id == batch_id).order_by(Job.created_at.asc()).all()
    if not rows:
        raise HTTPException(404, "Batch not found")
    return BatchOut(batch_id=batch_id, jobs=[_recent(j) for j in rows])


@app.get("/api/references", response_model=list[ReferenceOut])
def list_references():
    with SessionLocal() as db:
        rows = db.query(Reference).order_by(Reference.created_at.desc()).all()
    return [_ref_out(r) for r in rows]


@app.post("/api/references", response_model=ReferenceOut, status_code=201)
async def save_reference(file: UploadFile = File(...), name: str | None = Form(None)):
    data = await _read_pdf(file, "Reference")
    ref = Reference(id=str(uuid.uuid4()), name=(name or file.filename or "reference.pdf")[:255], size=len(data))
    storage.put_bytes(LIBRARY, f"{ref.id}.pdf", data)
    with SessionLocal() as db:
        db.add(ref)
        db.commit()
        db.refresh(ref)
    return _ref_out(ref)


@app.get("/api/references/{ref_id}/file")
def reference_file(ref_id: str):
    if not ID_RE.match(ref_id):
        raise HTTPException(400, "Invalid id")
    resp = storage.response(LIBRARY, f"{ref_id}.pdf")
    if resp is None:
        raise HTTPException(404, "File not found")
    return resp


@app.delete("/api/references/{ref_id}", status_code=204)
def delete_reference(ref_id: str):
    with SessionLocal() as db:
        ref = db.get(Reference, ref_id)
        if not ref:
            raise HTTPException(404, "Reference not found")
        db.delete(ref)
        db.commit()
    try:
        storage.delete(LIBRARY, f"{ref_id}.pdf")
    except Exception:  # noqa: BLE001 - the DB row is what the UI lists
        pass


def _ref_out(r: Reference) -> ReferenceOut:
    return ReferenceOut(id=r.id, name=r.name, size=r.size, created_at=r.created_at.isoformat())


def _recent(j: Job) -> RecentJob:
    s = j.result["summary"] if j.status == "done" and j.result else None
    return RecentJob(id=j.id, status=j.status, reference_name=j.reference_name, candidate_name=j.candidate_name,
                     created_at=j.created_at.isoformat(), score=s["overall_score"] if s else None,
                     verdict=s["verdict"] if s else None, issues=s["total_issues"] if s else None)


def _enqueue(background: BackgroundTasks, ref_bytes: bytes, test_bytes: bytes, ref_name: str, test_name: str,
             opts: CompareOptions, batch_id: str | None = None) -> JobOut:
    job_id = str(uuid.uuid4())
    storage.put_bytes(job_id, "reference.pdf", ref_bytes)
    storage.put_bytes(job_id, "candidate.pdf", test_bytes)
    with SessionLocal() as db:
        job = Job(id=job_id, reference_name=ref_name, candidate_name=test_name, options=opts.model_dump(),
                  batch_id=batch_id)
        db.add(job)
        db.commit()
        db.refresh(job)

    if settings.use_celery:
        from .tasks import run_job

        run_job.delay(job_id)
    else:
        background.add_task(process_job, job_id)
    return _to_out(job)


@app.post("/api/demo", response_model=JobOut, status_code=202)
def create_demo(background: BackgroundTasks):
    """Run a validation on two built-in sample PDFs (offer letter: original vs customised)."""
    ref, test = make_demo_pdfs()
    return _enqueue(background, ref, test, "offer-letter-original.pdf", "offer-letter-customised.pdf", CompareOptions())


@app.get("/api/stats", response_model=Stats)
def get_stats():
    with SessionLocal() as db:
        rows = db.query(Job).order_by(Job.created_at.asc()).all()

    done = [j for j in rows if j.status == "done" and j.result]
    verdicts: Counter = Counter()
    sev: Counter = Counter()
    cats: Counter = Counter()
    dims = {"text": 0.0, "format": 0.0, "layout": 0.0, "visual": 0.0}
    dim_n = {"visual": 0}
    trend: list[TrendPoint] = []
    total_issues = 0
    for j in done:
        s = j.result["summary"]
        verdicts[s["verdict"]] += 1
        sev.update(s["by_severity"])
        cats.update(s["by_category"])
        total_issues += s["total_issues"]
        dims["text"] += s["text_score"]
        dims["format"] += s["format_score"]
        dims["layout"] += s["layout_score"]
        if s.get("visual_score") is not None:
            dims["visual"] += s["visual_score"]
            dim_n["visual"] += 1
        trend.append(TrendPoint(id=j.id, label=j.created_at.strftime("%d %b %H:%M"), score=s["overall_score"],
                                issues=s["total_issues"], verdict=s["verdict"]))
    n = len(done)
    dim_avg = {
        "text": dims["text"] / n if n else 0.0,
        "format": dims["format"] / n if n else 0.0,
        "layout": dims["layout"] / n if n else 0.0,
        "visual": dims["visual"] / dim_n["visual"] if dim_n["visual"] else 0.0,
    }
    recent = [_recent(j) for j in reversed(rows[-12:])]
    # last 14 days, one point per day (zero-filled) for the dashboard trend
    today = utcnow().date()
    days = [(today - timedelta(days=d)).isoformat() for d in range(13, -1, -1)]
    per_day = {d: [0, 0] for d in days}
    for j in rows:
        key = j.created_at.date().isoformat()
        if key in per_day:
            per_day[key][0] += 1
            if j.status == "done" and j.result:
                per_day[key][1] += j.result["summary"]["total_issues"]
    daily = [DailyPoint(date=d, comparisons=c, differences=n) for d, (c, n) in per_day.items()]

    with SessionLocal() as db:
        refs = db.query(Reference).count()
    try:
        size, reports = storage.usage()
        usage = StorageUsage(bytes=size, documents=2 * len(rows) + refs, reports=reports)
    except Exception:  # noqa: BLE001 - usage is informational
        usage = None

    return Stats(
        daily=daily, storage=usage,
        total=len(rows), completed=n, failed=sum(1 for j in rows if j.status == "failed"),
        avg_score=sum(t.score for t in trend) / n if n else 0.0,
        pass_rate=verdicts["PASS"] / n if n else 0.0, total_issues=total_issues,
        verdicts={k: verdicts.get(k, 0) for k in ("PASS", "REVIEW", "FAIL")},
        severities={k: sev.get(k, 0) for k in ("critical", "major", "minor")},
        categories=dict(cats), dimensions=dim_avg, trend=trend[-20:], recent=recent,
    )


@app.get("/api/history", response_model=list[RecentJob])
def history(limit: int = 200):
    """All comparisons, newest first, with their headline numbers (no full results)."""
    with SessionLocal() as db:
        rows = db.query(Job).order_by(Job.created_at.desc()).limit(min(max(limit, 1), 1000)).all()
    return [_recent(j) for j in rows]


@app.get("/api/jobs", response_model=list[JobOut])
def list_jobs(limit: int = 20):
    with SessionLocal() as db:
        rows = db.query(Job).order_by(Job.created_at.desc()).limit(min(limit, 100)).all()
        out = []
        for j in rows:
            o = _to_out(j)
            o.result = None  # keep the list light
            out.append(o)
        return out


@app.get("/api/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str):
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        return _to_out(job)


@app.get("/api/jobs/{job_id}/files/{name}")
def get_file(job_id: str, name: str, download: bool = False):
    if not FILE_RE.match(name) or not ID_RE.match(job_id):
        raise HTTPException(400, "Invalid file")
    resp = storage.response(job_id, name, download)
    if resp is None:
        raise HTTPException(404, "File not found")
    return resp


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str):
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        db.delete(job)
        db.commit()
