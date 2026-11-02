"""Extra validations: data formats, spelling, table cells, images, accessibility, security, bookmarks & forms,
custom rules and ignore regions. Each check adds issues to the Comparer and returns facts for the checklist."""
from __future__ import annotations

import re
from datetime import datetime
from functools import lru_cache

import numpy as np
import pikepdf
import pymupdf
from PIL import Image

from ..schemas import Category as C
from ..schemas import IgnoreRegion, Issue
from ..schemas import Severity as S
from .compare import Comparer, _box, _short
from .extract import DocData, Line

# ---- data formats --------------------------------------------------------------------------------------------
_MON = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?"
FORMATS: dict[str, re.Pattern] = {
    "date": re.compile(rf"\b\d{{4}}-\d{{2}}-\d{{2}}\b|\b\d{{1,2}}[/.-]\d{{1,2}}[/.-]\d{{2,4}}\b"
                       rf"|\b\d{{1,2}}(?:st|nd|rd|th)?\s{_MON}\s\d{{4}}\b|\b{_MON}\s\d{{1,2}},?\s\d{{4}}\b"),
    "amount": re.compile(r"\b\d[\d,]*(?:\.\d+)?\s?(?:INR|USD|EUR|GBP|Rs)\b"
                         r"|(?:[₹$€£]|\b(?:INR|USD|EUR|GBP|Rs\.?)\s?)\d[\d,]*(?:\.\d+)?"
                         r"|\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b|\b\d+\.\d{2}\b"),
    "percent": re.compile(r"\b\d+(?:\.\d+)?\s?%"),
    "email": re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)*"),
    "phone": re.compile(r"(?<!\w)\+?\d[\d\s().-]{8,}\d(?!\w)"),
    "gstin": re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b"),
    "pan": re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),
}
_LABEL = {"date": "Date", "amount": "Amount", "percent": "Percentage", "email": "Email", "phone": "Phone number",
          "gstin": "GSTIN", "pan": "PAN"}
_EMAIL_OK = re.compile(r"^[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}$")
_MONTH_WORD = re.compile(_MON, re.IGNORECASE)


def _shape(tok: str) -> str:
    t = _MONTH_WORD.sub(lambda m: "MMM" if len(m.group(0).rstrip(".")) <= 4 else "MMMM", tok)
    t = re.sub(r"\d+", lambda m: "9" if len(m.group(0)) <= 2 else "9" * min(len(m.group(0)), 4), t)
    return re.sub(r"(st|nd|rd|th)\b", "", t)


def _valid_date(tok: str) -> bool:
    if not re.fullmatch(r"\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}", tok):
        return True  # textual dates are not re-parsed
    parts = [int(x) for x in re.split(r"[/.-]", tok)]
    if len(tok.split("-")[0]) == 4:
        y, m, d = parts
        cands = [(m, d)]
    else:
        a, b, y = parts
        cands = [(b, a), (a, b)]  # (month, day) for dd/mm and mm/dd
    y = y + 2000 if y < 100 else y
    for m, d in cands:
        try:
            datetime(y, m, d)
            return True
        except ValueError:
            continue
    return False


def _tokens(kind: str, text: str) -> list[str]:
    toks = FORMATS[kind].findall(text)
    if kind == "phone":  # a phone number has at least 10 digits and is not an ISO date
        toks = [t for t in toks if sum(c.isdigit() for c in t) >= 10 and not FORMATS["date"].fullmatch(t.strip())]
    return [t.strip() for t in toks]


def check_formats(cmp: Comparer, ref: DocData, test: DocData) -> int:
    n0 = len(cmp.issues)
    for pn, a, b in cmp.pairs:
        if a.text == b.text:
            continue
        for kind in FORMATS:
            ta, tb = _tokens(kind, a.text), _tokens(kind, b.text)
            if not ta or not tb:
                continue
            ra = {_shape(t) for t in ta}
            bad = [t for t in tb if _shape(t) not in ra]
            if bad:
                cmp.add(pn, C.data_format, S.major if kind in ("amount", "date") else S.minor,
                        f"{_LABEL[kind]} format differs from reference", _box(a.bbox), _box(b.bbox), ta[0], bad[0])
    ref_lines = {l.text for p in ref.pages for l in p.lines}
    for p in test.pages:
        for l in p.lines:
            if l.text in ref_lines:
                continue
            for tok in _tokens("date", l.text):
                if not _valid_date(tok):
                    cmp.add(p.number, C.data_format, S.critical, "Impossible date", None, _box(l.bbox),
                            "valid calendar date", tok)
            for tok in _tokens("email", l.text):
                if not _EMAIL_OK.match(tok.rstrip(".")):
                    cmp.add(p.number, C.data_format, S.major, "Malformed email address", None, _box(l.bbox),
                            "name@domain.tld", tok)
    return len(cmp.issues) - n0


# ---- spelling ------------------------------------------------------------------------------------------------
@lru_cache(maxsize=1)
def _speller():
    from spellchecker import SpellChecker

    return SpellChecker()


_WORD = re.compile(r"[A-Za-z]+(?:'[a-z]+)?")


def check_spelling(cmp: Comparer, ref: DocData, test: DocData) -> int:
    """Only words the customisation introduced are checked; reference vocabulary and Capitalised names are trusted."""
    try:
        sp = _speller()
    except Exception:  # noqa: BLE001 - optional dependency
        return -1
    ref_words = {w.lower() for p in ref.pages for l in p.lines for w in _WORD.findall(l.text)}
    n = 0
    for p in test.pages:
        for l in p.lines:
            words = [w for w in _WORD.findall(l.text)
                     if len(w) >= 4 and w.islower() and w not in ref_words and "'" not in w]
            bad = sorted(sp.unknown(words))
            if bad:
                fix = [f"{w}→{sp.correction(w) or '?'}" for w in bad[:3]]
                cmp.add(p.number, C.spelling, S.minor, f"Possible misspelling: {', '.join(fix)}", None,
                        _box(l.bbox), None, _short(l.text))
                n += 1
    return n


# ---- table cells ---------------------------------------------------------------------------------------------
def _overlaps(a, b) -> bool:
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def check_tables(cmp: Comparer, ref: DocData, test: DocData) -> int:
    n0 = len(cmp.issues)
    text_issues = [i for i in cmp.issues if i.category in (C.text_changed, C.text_missing, C.text_extra)]
    for rp, tp in zip(ref.pages, test.pages):
        for k, (gr, gt) in enumerate(zip(rp.grids, tp.grids), start=1):
            shape_r = (len(gr.rows), max((len(r) for r in gr.rows), default=0))
            shape_t = (len(gt.rows), max((len(r) for r in gt.rows), default=0))
            if shape_r != shape_t:
                cmp.add(rp.number, C.table, S.major, f"Table {k} shape differs (rows × columns)",
                        _box(gr.bbox), _box(gt.bbox), f"{shape_r[0]}×{shape_r[1]}", f"{shape_t[0]}×{shape_t[1]}")
            for ri, (row_r, row_t) in enumerate(zip(gr.rows, gt.rows), start=1):
                for ci, (cr, ct) in enumerate(zip(row_r, row_t), start=1):
                    if cr is None or ct is None or " ".join(cr[0].split()) == " ".join(ct[0].split()):
                        continue
                    if any(i.page == rp.number and i.bbox_test and _overlaps(i.bbox_test, ct[1]) for i in text_issues):
                        continue  # already reported as a text change
                    cmp.add(rp.number, C.table, S.major, f"Table {k} cell R{ri}C{ci} differs",
                            _box(cr[1]), _box(ct[1]), _short(cr[0], 60) or "(empty)", _short(ct[0], 60) or "(empty)")
    return len(cmp.issues) - n0


# ---- images --------------------------------------------------------------------------------------------------
def _ahash(doc: pymupdf.Document, xref: int) -> np.ndarray | None:
    """8×8 average hash: robust to re-encoding/resizing, changes when the picture itself changes."""
    try:
        pix = pymupdf.Pixmap(doc, xref)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        if pix.n not in (1, 3):
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        img = Image.frombytes("L" if pix.n == 1 else "RGB", (pix.width, pix.height), pix.samples)
        a = np.asarray(img.convert("L").resize((8, 8), Image.Resampling.LANCZOS), dtype=float)
        return a > a.mean()
    except Exception:  # noqa: BLE001
        return None


def _dpi(im) -> float:
    w_in = (im.bbox[2] - im.bbox[0]) / 72
    return im.px_w / w_in if w_in > 0 else 0


def _distortion(im) -> float:
    bw, bh = im.bbox[2] - im.bbox[0], im.bbox[3] - im.bbox[1]
    return (bw / bh) / (im.px_w / im.px_h) if bh and im.px_h and im.px_w else 1.0


def check_images(cmp: Comparer, ref: DocData, test: DocData, min_dpi: int = 150) -> int:
    n0 = len(cmp.issues)
    with pymupdf.open(ref.path) as dr, pymupdf.open(test.path) as dt:
        for rp, tp in zip(ref.pages, test.pages):
            free = list(tp.image_info)
            for a in rp.image_info:
                if not free:
                    break
                ca = ((a.bbox[0] + a.bbox[2]) / 2, (a.bbox[1] + a.bbox[3]) / 2)
                b = min(free, key=lambda x: (ca[0] - (x.bbox[0] + x.bbox[2]) / 2) ** 2
                        + (ca[1] - (x.bbox[1] + x.bbox[3]) / 2) ** 2)
                free.remove(b)
                ba, bb = _box(a.bbox), _box(b.bbox)
                if a.digest != b.digest:
                    ha, hb = _ahash(dr, a.xref), _ahash(dt, b.xref)
                    if ha is not None and hb is not None and int((ha != hb).sum()) > 12:
                        cmp.add(rp.number, C.image, S.major, "Image content replaced (different picture)", ba, bb)
                da, db = _distortion(a), _distortion(b)
                if abs(db - 1) > 0.05 and abs(da - 1) <= 0.05:
                    cmp.add(rp.number, C.image, S.major, f"Image stretched / distorted ({db:.2f}× aspect)", ba, bb,
                            "original aspect ratio", f"{db:.2f}×")
                wa, ha_, wb, hb_ = ba[2] - ba[0], ba[3] - ba[1], bb[2] - bb[0], bb[3] - bb[1]
                if abs(wa - wb) > max(3, 0.05 * wa) or abs(ha_ - hb_) > max(3, 0.05 * ha_):
                    cmp.add(rp.number, C.image, S.minor, "Image resized", ba, bb, f"{wa:.0f}×{ha_:.0f}pt",
                            f"{wb:.0f}×{hb_:.0f}pt")
                if _dpi(b) < min_dpi <= _dpi(a):
                    cmp.add(rp.number, C.image, S.minor, f"Low-resolution image ({_dpi(b):.0f} DPI)", ba, bb,
                            f"≥{min_dpi} DPI", f"{_dpi(b):.0f} DPI")
            for b in free:
                if _dpi(b) < min_dpi:
                    cmp.add(tp.number, C.image, S.minor, f"Low-resolution image ({_dpi(b):.0f} DPI)", None,
                            _box(b.bbox), f"≥{min_dpi} DPI", f"{_dpi(b):.0f} DPI")
    return len(cmp.issues) - n0


# ---- accessibility -------------------------------------------------------------------------------------------
def _struct(path: str) -> dict:
    info = {"tagged": False, "lang": "", "figures": 0, "figures_alt": 0}
    try:
        with pikepdf.open(path) as pdf:
            root = pdf.Root
            mi = root.get("/MarkInfo")
            info["tagged"] = bool(mi is not None and mi.get("/Marked", False)) or "/StructTreeRoot" in root
            info["lang"] = str(root.get("/Lang", "") or "")
            stack, seen = [root.get("/StructTreeRoot")], 0
            while stack and seen < 20000:
                node = stack.pop()
                seen += 1
                if isinstance(node, pikepdf.Array):
                    stack.extend(node)
                    continue
                if not isinstance(node, pikepdf.Dictionary):
                    continue
                if node.get("/S") == pikepdf.Name("/Figure"):
                    info["figures"] += 1
                    info["figures_alt"] += 1 if str(node.get("/Alt", "")).strip() else 0
                k = node.get("/K")
                if k is not None:
                    stack.append(k)
    except Exception:  # noqa: BLE001
        pass
    return info


def _lum(rgb) -> float:
    c = [v / 255 for v in rgb]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b) -> float:
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _line_contrasts(doc: DocData) -> dict[tuple[int, str], tuple[float, Line]]:
    out = {}
    with pymupdf.open(doc.path) as d:
        for p in doc.pages:
            if not p.lines:
                continue
            pix = d[p.number - 1].get_pixmap(dpi=72)
            arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[..., :3]
            for l in p.lines:
                x0, y0, x1, y1 = (max(0, int(v)) for v in l.bbox)
                crop = arr[y0:max(y1, y0 + 1), x0:max(x1, x0 + 1)].reshape(-1, 3)
                if not len(crop):
                    continue
                q = (crop // 16).astype(np.int32)
                keys, counts = np.unique(q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2], return_counts=True)
                k = int(keys[counts.argmax()])
                bg = ((k // 256) * 16 + 8, ((k // 16) % 16) * 16 + 8, (k % 16) * 16 + 8)
                fg = tuple(int(l.color[i:i + 2], 16) for i in (1, 3, 5))
                out[(p.number, l.text)] = (contrast(fg, bg), l)
    return out


def check_accessibility(cmp: Comparer, ref: DocData, test: DocData) -> dict:
    sr, st = _struct(ref.path), _struct(test.path)
    if sr["tagged"] and not st["tagged"]:
        cmp.add(0, C.accessibility, S.major, "Reference is a tagged PDF but candidate lost its tags (screen readers)",
                expected="tagged", actual="untagged")
    if sr["lang"] and not st["lang"]:
        cmp.add(0, C.accessibility, S.minor, "Document language not set (reference declares one)",
                expected=sr["lang"], actual="none")
    if st["figures"] > st["figures_alt"]:
        cmp.add(0, C.accessibility, S.minor, f"{st['figures'] - st['figures_alt']} figure(s) without alt text",
                expected="alt text on every figure", actual=f"{st['figures_alt']}/{st['figures']}")
    low = 0
    try:
        cr, ct = _line_contrasts(ref), _line_contrasts(test)
        for (pn, text), (ratio, l) in ct.items():
            need = 3.0 if l.size >= 18 or (l.bold and l.size >= 14) else 4.5
            ref_ratio = cr.get((pn, text), (99.0, None))[0]
            if ratio < need <= ref_ratio:
                low += 1
                cmp.add(pn, C.accessibility, S.minor, f"Low text contrast {ratio:.1f}:1 (WCAG needs {need:g}:1)",
                        None, _box(l.bbox), f"≥{need:g}:1", f"{ratio:.1f}:1")
    except Exception:  # noqa: BLE001
        pass
    return {**st, "low_contrast": low}


# ---- security & metadata -------------------------------------------------------------------------------------
_LEAK = re.compile(r"[A-Za-z]:\\|/Users/|/home/|[\w.+-]+@[\w-]+\.[\w.]+")


def _sec(path: str) -> dict:
    info = {"encrypted": False, "javascript": False, "launch": False, "attachments": 0, "pdfa": "", "meta": {}}
    try:
        with pymupdf.open(path) as d:
            info["encrypted"] = bool(d.is_encrypted or d.metadata.get("encryption"))
            info["attachments"] = d.embfile_count()
        with pikepdf.open(path) as pdf:
            info["meta"] = {str(k).lstrip("/"): str(v) for k, v in pdf.docinfo.items()}
            names = pdf.Root.get("/Names")
            if names is not None and "/JavaScript" in names:
                info["javascript"] = True
            for obj in pdf.objects:
                if isinstance(obj, pikepdf.Dictionary):
                    s = obj.get("/S")
                    if s == pikepdf.Name("/JavaScript") or "/JS" in obj:
                        info["javascript"] = True
                    if s == pikepdf.Name("/Launch"):
                        info["launch"] = True
            try:
                with pdf.open_metadata() as xmp:
                    part = xmp.get("pdfaid:part")
                    info["pdfa"] = f"PDF/A-{part}{(xmp.get('pdfaid:conformance') or '').lower()}" if part else ""
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        pass
    return info


def check_security(cmp: Comparer, ref: DocData, test: DocData) -> dict:
    sr, st = _sec(ref.path), _sec(test.path)
    if st["launch"]:
        cmp.add(0, C.security, S.critical, "Candidate contains a Launch action (can start external programs)")
    if st["javascript"] and not sr["javascript"]:
        cmp.add(0, C.security, S.major, "Candidate contains JavaScript that the reference does not",
                expected="no JavaScript", actual="JavaScript present")
    if st["attachments"] > sr["attachments"]:
        cmp.add(0, C.security, S.major, f"Candidate has {st['attachments']} embedded file(s)",
                expected=str(sr["attachments"]), actual=str(st["attachments"]))
    if st["encrypted"] != sr["encrypted"]:
        cmp.add(0, C.security, S.minor, "Encryption differs from reference",
                expected="encrypted" if sr["encrypted"] else "not encrypted",
                actual="encrypted" if st["encrypted"] else "not encrypted")
    if sr["pdfa"] and not st["pdfa"]:
        cmp.add(0, C.security, S.major, "Reference is PDF/A (archival) but candidate is not",
                expected=sr["pdfa"], actual="not PDF/A")
    leaks = {k: v for k, v in st["meta"].items() if _LEAK.search(v) and v != sr["meta"].get(k)}
    for k, v in list(leaks.items())[:3]:
        cmp.add(0, C.security, S.minor, f"Metadata '{k}' may leak a local path or email", actual=_short(v, 60))
    return {**st, "leaks": len(leaks)}


# ---- bookmarks & form fields ---------------------------------------------------------------------------------
def _widgets(path: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    with pymupdf.open(path) as d:
        for page in d:
            for w in page.widgets() or []:
                out.setdefault(w.field_name or f"unnamed@{page.number + 1}", {
                    "type": w.field_type_string, "required": bool(w.field_flags & 2),
                    "page": page.number + 1, "rect": tuple(w.rect)})
    return out


def check_outline_forms(cmp: Comparer, ref: DocData, test: DocData) -> dict:
    with pymupdf.open(ref.path) as d:
        toc_r = d.get_toc(simple=True)
    with pymupdf.open(test.path) as d:
        toc_t = d.get_toc(simple=True)
    tmap = {}
    for lvl, title, pg in toc_t:
        tmap.setdefault(title.strip(), (lvl, pg))
    rtitles = {t.strip() for _, t, _ in toc_r}
    for lvl, title, pg in toc_r:
        t = title.strip()
        if t not in tmap:
            cmp.add(0, C.outline, S.major, f"Bookmark missing: “{_short(t, 50)}”", expected=f"→ page {pg}")
        elif tmap[t][1] != pg:
            cmp.add(0, C.outline, S.minor, f"Bookmark “{_short(t, 40)}” points to another page",
                    expected=f"page {pg}", actual=f"page {tmap[t][1]}")
        elif tmap[t][0] != lvl:
            cmp.add(0, C.outline, S.minor, f"Bookmark “{_short(t, 40)}” nesting level changed",
                    expected=f"level {lvl}", actual=f"level {tmap[t][0]}")
    for _, title, pg in toc_t:
        if title.strip() not in rtitles:
            cmp.add(0, C.outline, S.minor, f"Extra bookmark: “{_short(title.strip(), 50)}”", actual=f"→ page {pg}")

    fr, ft = _widgets(ref.path), _widgets(test.path)
    for name, a in fr.items():
        b = ft.get(name)
        if b is None:
            cmp.add(a["page"], C.form_field, S.major, f"Form field '{name}' missing", _box(a["rect"]), None,
                    a["type"])
            continue
        if a["type"] != b["type"]:
            cmp.add(b["page"], C.form_field, S.major, f"Form field '{name}' type changed", _box(a["rect"]),
                    _box(b["rect"]), a["type"], b["type"])
        if a["required"] != b["required"]:
            cmp.add(b["page"], C.form_field, S.minor, f"Form field '{name}' required flag changed", _box(a["rect"]),
                    _box(b["rect"]), "required" if a["required"] else "optional",
                    "required" if b["required"] else "optional")
    for name, b in ft.items():
        if name not in fr:
            cmp.add(b["page"], C.form_field, S.minor, f"Extra form field '{name}'", None, _box(b["rect"]), None,
                    b["type"])
    return {"bookmarks_reference": len(toc_r), "bookmarks_candidate": len(toc_t),
            "fields_reference": len(fr), "fields_candidate": len(ft)}


# ---- custom rules --------------------------------------------------------------------------------------------
def _rx(rule: str) -> re.Pattern | None:
    rule = rule.strip()
    if not rule:
        return None
    try:
        if len(rule) > 2 and rule.startswith("/") and rule.endswith("/"):
            return re.compile(rule[1:-1])
        return re.compile(r"\s+".join(map(re.escape, rule.split())), re.IGNORECASE)
    except re.error:
        return None


def check_rules(cmp: Comparer, test: DocData, must: list[str], must_not: list[str]) -> int:
    n0 = len(cmp.issues)
    full = "\n".join(l.text for p in test.pages for l in p.lines)
    for rule in must:
        rx = _rx(rule)
        if rx and not rx.search(full):
            cmp.add(0, C.rule, S.critical, "Required content not found", expected=_short(rule.strip(), 60))
    for rule in must_not:
        rx = _rx(rule)
        if not rx:
            continue
        for p in test.pages:
            for l in p.lines:
                if m := rx.search(l.text):
                    cmp.add(p.number, C.rule, S.critical, "Forbidden content present", None, _box(l.bbox),
                            f"not “{_short(rule.strip(), 40)}”", m.group(0))
    return len(cmp.issues) - n0


# ---- ignore regions ------------------------------------------------------------------------------------------
def in_ignored(page: int, box: list[float] | None, regions: list[IgnoreRegion]) -> bool:
    if not box or page < 1:
        return False
    area = max((box[2] - box[0]) * (box[3] - box[1]), 1e-6)
    for r in regions:
        if r.page not in (0, page):
            continue
        g = r.bbox
        w = min(box[2], g[2]) - max(box[0], g[0])
        h = min(box[3], g[3]) - max(box[1], g[1])
        if w > 0 and h > 0 and w * h / area > 0.5:
            return True
    return False


def drop_ignored(issues: list[Issue], regions: list[IgnoreRegion]) -> list[Issue]:
    if not regions:
        return issues
    return [i for i in issues
            if not (in_ignored(i.page, i.bbox_test, regions) or (not i.bbox_test and in_ignored(i.page, i.bbox_ref, regions)))]
