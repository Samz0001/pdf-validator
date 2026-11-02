import os
import time

import pymupdf
import pytest

os.environ["DATABASE_URL"] = "sqlite:///./data/test.db"
os.environ["STORAGE_DIR"] = "./data/test_storage"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def _pdf(lines, size=12):
    doc = pymupdf.open()
    p = doc.new_page()
    y = 72
    for t in lines:
        p.insert_text((72, y), t, fontsize=size)
        y += 24
    data = doc.tobytes()
    doc.close()
    return data


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _wait(client, job_id, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "failed"):
            return j
        time.sleep(0.3)
    raise AssertionError("job timed out")


def test_full_flow(client):
    ref = _pdf(["Hello world line one", "Second line of the document"])
    cand = _pdf(["Hello world line one", "Second line of the document"], size=16)
    r = client.post("/api/jobs", files={"reference": ("a.pdf", ref, "application/pdf"),
                                        "candidate": ("b.pdf", cand, "application/pdf")})
    assert r.status_code == 202
    job = _wait(client, r.json()["id"])
    assert job["status"] == "done", job.get("error")
    assert job["result"]["summary"]["total_issues"] > 0
    for name in ("report.pdf", "highlighted.pdf", "diff_1.png", "reference.pdf"):
        f = client.get(f"/api/jobs/{job['id']}/files/{name}")
        assert f.status_code == 200, name


def test_rejects_non_pdf(client):
    r = client.post("/api/jobs", files={"reference": ("a.pdf", b"nope", "application/pdf"),
                                        "candidate": ("b.pdf", b"%PDF-1.4", "application/pdf")})
    assert r.status_code == 400


def test_rejects_path_traversal(client):
    r = client.get("/api/jobs/00000000-0000-0000-0000-000000000000/files/..%2F..%2Fetc%2Fpasswd")
    assert r.status_code in (400, 404)


def test_demo_job_and_stats(client):
    r = client.post("/api/demo")
    assert r.status_code == 202
    job = _wait(client, r.json()["id"])
    assert job["status"] == "done", job.get("error")
    s = job["result"]["summary"]
    assert s["total_issues"] >= 8
    assert len(job["result"]["pages"]) == 2

    st = client.get("/api/stats").json()
    assert st["completed"] >= 1
    assert set(st["verdicts"]) == {"PASS", "REVIEW", "FAIL"}
    assert st["recent"][0]["score"] is not None
    assert len(st["trend"]) >= 1
    assert len(st["daily"]) == 14 and st["daily"][-1]["comparisons"] >= 1
    assert st["storage"]["bytes"] > 0 and st["storage"]["reports"] >= 1
    hist = client.get("/api/history").json()
    assert hist and hist[0]["id"] and "verdict" in hist[0]


def _files(**kw):
    return {k: (f"{k}.pdf", v, "application/pdf") for k, v in kw.items()}


def test_reference_library_batch_and_rerun(client):
    ref = _pdf(["Golden reference line", "Second line"])
    r = client.post("/api/references", files={"file": ("golden.pdf", ref, "application/pdf")}, data={"name": "Golden"})
    assert r.status_code == 201
    rid = r.json()["id"]
    assert any(x["id"] == rid for x in client.get("/api/references").json())

    r = client.post("/api/jobs", files=_files(candidate=_pdf(["Golden reference line", "Second line"])),
                    data={"reference_id": rid})
    assert r.status_code == 202
    job = _wait(client, r.json()["id"])
    assert job["status"] == "done" and job["reference_name"] == "Golden"

    cands = [("candidates", (f"c{i}.pdf", _pdf(["Golden reference line", f"Variant {i}"]), "application/pdf"))
             for i in range(3)]
    r = client.post("/api/batch", files=cands, data={"reference_id": rid})
    assert r.status_code == 202
    bid = r.json()["batch_id"]
    assert len(r.json()["jobs"]) == 3
    for j in r.json()["jobs"]:
        _wait(client, j["id"])
    b = client.get(f"/api/batch/{bid}").json()
    assert all(j["status"] == "done" and j["score"] is not None for j in b["jobs"])

    r = client.post(f"/api/jobs/{job['id']}/rerun", json={"visual": False, "ignore_regions": [{"page": 0, "bbox": [0, 0, 600, 800]}]})
    assert r.status_code == 202
    rerun = _wait(client, r.json()["id"])
    assert rerun["status"] == "done" and rerun["options"]["visual"] is False

    assert client.delete(f"/api/references/{rid}").status_code == 204
    assert client.post("/api/jobs", files=_files(candidate=ref), data={"reference_id": rid}).status_code == 404
    assert client.post("/api/jobs", files=_files(candidate=ref)).status_code == 422
