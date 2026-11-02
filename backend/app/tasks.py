from celery import Celery

from .config import settings

celery_app = Celery("pdfvalidator", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(task_track_started=True, task_time_limit=900, worker_prefetch_multiplier=1)


@celery_app.task(name="run_job", autoretry_for=(), acks_late=True)
def run_job(job_id: str) -> None:
    from .jobs import process_job

    process_job(job_id)
