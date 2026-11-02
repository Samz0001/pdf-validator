import io

import pymupdf
import pytest
from PIL import Image

from app.engine.checks import _shape, _valid_date
from app.engine.pipeline import run_validation
from app.schemas import CompareOptions, IgnoreRegion

LINES = ["Invoice date: 29 October 2026", "Customer: Acme Corporation", "Total amount due: 1,250.00 USD",
         "Contact: billing@acme.example.com"]


def _make(path, lines, *, image=None, toc=None, field=None, color=(0, 0, 0)):
    doc = pymupdf.open()
    page = doc.new_page()
    y = 72
    for t in lines:
        page.insert_text((72, y), t, fontsize=12, color=color)
        y += 24
    if image is not None:
        rect, png = image
        page.insert_image(pymupdf.Rect(*rect), stream=png, keep_proportion=False)
    if toc:
        doc.set_toc(toc)
    if field:
        w = pymupdf.Widget()
        w.field_name, w.field_type = field
        w.rect = pymupdf.Rect(72, 400, 250, 420)
        page.add_widget(w)
    doc.save(path)
    doc.close()


def _png(color, size=(400, 400), half=False):
    img = Image.new("RGB", size, color)
    if half:
        img.paste((0, 0, 0), (0, 0, size[0] // 2, size[1]))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _run(tmp_path, ref_lines, test_lines, ref_kw=None, test_kw=None, **opts):
    r, t = str(tmp_path / "r.pdf"), str(tmp_path / "t.pdf")
    _make(r, ref_lines, **(ref_kw or {}))
    _make(t, test_lines, **(test_kw or {}))
    return run_validation(r, t, str(tmp_path / "out"), CompareOptions(visual=False, **opts))


def cats(res):
    return {i.category.value for i in res.issues}


def test_shapes_and_dates():
    assert _shape("29 October 2026") == _shape("1 November 2026")
    assert _shape("29 October 2026") != _shape("10/29/26")
    assert _shape("1,250.00") != _shape("1250")
    assert _valid_date("29/10/2026") and _valid_date("2026-10-29")
    assert not _valid_date("31/02/2026")


def test_data_format_mismatch_and_invalid(tmp_path):
    res = _run(tmp_path, LINES, ["Invoice date: 10/29/26", LINES[1], "Total amount due: 1250 USD",
                                 "Contact: billing@acme"])
    fmt = [i for i in res.issues if i.category.value == "data_format"]
    assert any("Date" in i.message for i in fmt)
    assert any("Amount" in i.message for i in fmt)
    assert any("email" in i.message for i in fmt)


def test_impossible_date(tmp_path):
    res = _run(tmp_path, LINES, ["Invoice date: 31/02/2026", *LINES[1:]])
    assert any(i.message == "Impossible date" for i in res.issues)


def test_spelling_only_new_words(tmp_path):
    res = _run(tmp_path, LINES, LINES + ["the paymnet is recieved"])
    sp = [i for i in res.issues if i.category.value == "spelling"]
    assert sp and "paymnet" in sp[0].message


def test_custom_rules(tmp_path):
    res = _run(tmp_path, LINES, LINES, must_contain=["Authorised signatory", "/INV-\\d+/"],
               must_not_contain=["acme corporation"])
    rules = [i for i in res.issues if i.category.value == "rule"]
    assert sum(i.message == "Required content not found" for i in rules) == 2
    assert any(i.message == "Forbidden content present" and i.page == 1 for i in rules)
    assert res.summary.verdict == "FAIL"


def test_image_replaced_and_stretched(tmp_path):
    res = _run(tmp_path, LINES, LINES,
               ref_kw={"image": ((300, 300, 400, 400), _png((200, 30, 30)))},
               test_kw={"image": ((300, 300, 500, 400), _png((200, 30, 30), half=True))})
    msgs = " ".join(i.message for i in res.issues if i.category.value == "image")
    assert "replaced" in msgs and "stretched" in msgs


def test_low_resolution_image(tmp_path):
    res = _run(tmp_path, LINES, LINES,
               ref_kw={"image": ((300, 300, 400, 400), _png((10, 100, 200)))},
               test_kw={"image": ((300, 300, 400, 400), _png((10, 100, 200), size=(60, 60)))})
    assert any("Low-resolution" in i.message for i in res.issues)


def test_bookmarks_and_form_fields(tmp_path):
    res = _run(tmp_path, LINES, LINES,
               ref_kw={"toc": [[1, "Summary", 1], [1, "Terms", 1]],
                       "field": ("signature_name", pymupdf.PDF_WIDGET_TYPE_TEXT)},
               test_kw={"toc": [[1, "Summary", 1]], "field": ("signature_name", pymupdf.PDF_WIDGET_TYPE_CHECKBOX)})
    assert {"outline", "form_field"} <= cats(res)


def test_low_contrast(tmp_path):
    res = _run(tmp_path, LINES, LINES, test_kw={"color": (0.85, 0.85, 0.85)})
    assert any("contrast" in i.message for i in res.issues)


def test_ignore_regions(tmp_path):
    changed = ["Invoice date: 30 October 2026", *LINES[1:]]
    assert "text_changed" in cats(_run(tmp_path, LINES, changed))
    res = _run(tmp_path, LINES, changed, ignore_regions=[IgnoreRegion(page=0, bbox=[60, 50, 400, 80])])
    assert "text_changed" not in cats(res)


@pytest.mark.parametrize("key", ["formats", "spelling", "tables", "images", "accessibility", "security", "outline"])
def test_checklist_has_entries(tmp_path, key):
    res = _run(tmp_path, LINES, LINES)
    assert key in {c.key for c in res.checks}
