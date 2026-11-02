"""Storage abstraction: local disk by default, S3-compatible (AWS S3 / MinIO / R2) when S3_BUCKET is set."""
from __future__ import annotations

import os
from pathlib import Path

from fastapi.responses import FileResponse, RedirectResponse, Response

from .config import settings


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root)

    def _p(self, job_id: str, name: str) -> Path:
        return self.root / job_id / name

    def put_file(self, job_id: str, name: str, src: str) -> None:
        dst = self._p(job_id, name)
        dst.parent.mkdir(parents=True, exist_ok=True)
        with open(src, "rb") as a, open(dst, "wb") as b:
            while chunk := a.read(1 << 20):
                b.write(chunk)

    def put_bytes(self, job_id: str, name: str, data: bytes) -> None:
        dst = self._p(job_id, name)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)

    def download(self, job_id: str, name: str, dst: str) -> None:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        self.put_file_to(self._p(job_id, name), dst)

    def get_bytes(self, job_id: str, name: str) -> bytes:
        return self._p(job_id, name).read_bytes()

    def delete(self, job_id: str, name: str) -> None:
        self._p(job_id, name).unlink(missing_ok=True)

    @staticmethod
    def put_file_to(src: Path, dst: str) -> None:
        Path(dst).write_bytes(src.read_bytes())

    def usage(self) -> tuple[int, int]:
        """(total bytes, number of report.pdf files)"""
        size = reports = 0
        if self.root.exists():
            for f in self.root.rglob("*"):
                if f.is_file():
                    size += f.stat().st_size
                    reports += f.name == "report.pdf"
        return size, reports

    def response(self, job_id: str, name: str, download: bool = False) -> Response | None:
        p = self._p(job_id, name)
        if not p.exists():
            return None
        return FileResponse(p, filename=name if download else None)


class S3Storage:
    def __init__(self):
        import boto3

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )

    def _k(self, job_id: str, name: str) -> str:
        return f"{job_id}/{name}"

    def put_file(self, job_id: str, name: str, src: str) -> None:
        self.client.upload_file(src, self.bucket, self._k(job_id, name))

    def put_bytes(self, job_id: str, name: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=self._k(job_id, name), Body=data)

    def download(self, job_id: str, name: str, dst: str) -> None:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        self.client.download_file(self.bucket, self._k(job_id, name), dst)

    def get_bytes(self, job_id: str, name: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=self._k(job_id, name))["Body"].read()

    def delete(self, job_id: str, name: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=self._k(job_id, name))

    def usage(self) -> tuple[int, int]:
        size = reports = 0
        for page in self.client.get_paginator("list_objects_v2").paginate(Bucket=self.bucket):
            for o in page.get("Contents", []):
                size += o["Size"]
                reports += o["Key"].endswith("/report.pdf")
        return size, reports

    def response(self, job_id: str, name: str, download: bool = False) -> Response | None:
        try:
            self.client.head_object(Bucket=self.bucket, Key=self._k(job_id, name))
        except Exception:  # noqa: BLE001
            return None
        params = {"Bucket": self.bucket, "Key": self._k(job_id, name)}
        if download:
            params["ResponseContentDisposition"] = f'attachment; filename="{name}"'
        return RedirectResponse(self.client.generate_presigned_url("get_object", Params=params, ExpiresIn=600))


def _make():
    return S3Storage() if settings.s3_bucket else LocalStorage(settings.storage_dir)


storage = _make()
