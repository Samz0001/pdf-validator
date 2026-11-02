import pymupdf
import pytest

from app.engine.pipeline import run_validation
from app.schemas import CompareOptions


def _make(path, lines, *, size=12, font="helv", color=(0, 0, 0), x=72, y0=72, gap=24, pages=1):
    doc = pymupdf.open()
    for _ in range(pages):
        page = doc.new_page()
        y = y0
        for t in lines:
            page.insert_text((x, y), t, fontsize=size, fontname=font, color=color)
            y += gap
    doc.save(path)
    doc.close()


LINES = ["Invoice Number: INV-2026-001", "Customer: Acme Corporation", "Total amount due: 1,250.00 USD",
         "Payment terms: net 30 days from issue date"]


@pytest.fixture
def ref(tmp_path):
    p = str(tmp_path / "ref.pdf")
    _make(p, LINES)
    return p


def _run(tmp_path, ref, test, **kw):
    return run_validation(ref, test, str(tmp_path / "out"), CompareOptions(**kw))


def cats(res):
    return {i.category.value for i in res.issues}


def test_identical_pdfs_pass(tmp_path, ref):
    res = _run(tmp_path, ref, ref)
    assert res.summary.verdict == "PASS"
    assert res.summary.total_issues == 0
    assert res.summary.overall_score > 0.99
    assert (tmp_path / "out" / "report.pdf").exists()


def test_detects_text_missing_and_changed(tmp_path, ref):
    t = str(tmp_path / "t.pdf")
    _make(t, [LINES[0], "Customer: Acme Corp", LINES[2]])  # changed line 2, dropped line 4
    res = _run(tmp_path, ref, t)
    assert {"text_changed", "text_missing"} <= cats(res)
    assert res.summary.verdict in {"FAIL", "REVIEW"}


def test_detects_extra_text(tmp_path, ref):
    t = str(tmp_path / "t.pdf")
    _make(t, LINES + ["Thank you for your business and have a great day"])
    res = _run(tmp_path, ref, t)
    assert "text_extra" in cats(res)


def test_detects_font_size_color(tmp_path, ref):
    t = str(tmp_path / "t.pdf")
    _make(t, LINES, size=16, font="tiro", color=(1, 0, 0))
    res = _run(tmp_path, ref, t)
    assert {"font", "font_size", "color"} <= cats(res)
    assert any("→" in i for i in res.insights)


def test_detects_position_and_margin(tmp_path, ref):
    t = str(tmp_path / "t.pdf")
    _make(t, LINES, x=110, y0=100)
    res = _run(tmp_path, ref, t)
    assert {"position", "margin"} <= cats(res)


def test_detects_spacing(tmp_path, ref):
    t = str(tmp_path / "t.pdf")
    _make(t, LINES, gap=40)
    res = _run(tmp_path, ref, t)
    assert "spacing" in cats(res)


def test_page_structure(tmp_path, ref):
    t = str(tmp_path / "t.pdf")
    _make(t, LINES, pages=2)
    res = _run(tmp_path, ref, t)
    assert "page_structure" in cats(res)
    assert res.summary.pages_candidate == 2


def test_outputs_written(tmp_path, ref):
    t = str(tmp_path / "t.pdf")
    _make(t, LINES, size=14)
    res = _run(tmp_path, ref, t)
    out = tmp_path / "out"
    for name in ("highlighted.pdf", "report.pdf", "result.json", "diff_1.png"):
        assert (out / name).exists(), name
    with pymupdf.open(out / "highlighted.pdf") as d:
        assert len(list(d[0].annots())) > 0
    assert res.pages[0].ssim is not None


def _with_link(path, uri, lines=LINES):
    _make(path, lines)
    with pymupdf.open(path) as d:
        d[0].insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(72, 60, 300, 76), "uri": uri})
        d.saveIncr()


def test_detects_link_changes(tmp_path):
    r, t = str(tmp_path / "r.pdf"), str(tmp_path / "t.pdf")
    _with_link(r, "https://example.com/pay")
    _with_link(t, "https://example.org/pay")
    res = _run(tmp_path, r, t, visual=False)
    links = [i for i in res.issues if i.category.value == "link"]
    assert links and links[0].expected == "https://example.com/pay"
    assert next(c for c in res.checks if c.key == "links").status == "fail"


def test_detects_placeholders(tmp_path, ref):
    t = str(tmp_path / "t.pdf")
    _make(t, [LINES[0], "Customer: {{customer_name}}", LINES[2], LINES[3]])
    res = _run(tmp_path, ref, t, visual=False)
    assert "placeholder" in cats(res)
    assert res.summary.verdict == "FAIL"
    assert next(c for c in res.checks if c.key == "placeholders").status == "fail"


def test_checks_all_pass_on_identical(tmp_path, ref):
    res = _run(tmp_path, ref, ref)
    assert {c.key for c in res.checks} >= {"pages", "fonts", "links", "placeholders"}
    assert all(c.status != "fail" for c in res.checks)
