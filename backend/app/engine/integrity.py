"""Document integrity checks: hyperlinks, leftover template placeholders, and a pass/warn/fail checklist."""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

import pymupdf

from ..schemas import Category as C
from ..schemas import Check, CompareOptions, Issue
from ..schemas import Severity as S
from . import checks as X
from .compare import Comparer, _box, _short
from .extract import DocData

# Unfilled merge fields / dummy text typically left behind when a template is customised.
PLACEHOLDER = re.compile(
    r"\{\{[^{}]{1,40}\}\}"                 # {{name}}
    r"|\$\{[^{}]{1,40}\}"                  # ${name}
    r"|<<[^<>]{1,40}>>|«[^«»]{1,40}»"      # <<name>> «name»
    r"|\[\[[^\[\]]{1,40}\]\]"              # [[name]]
    r"|\[(?:[A-Z][A-Z0-9 _/-]{2,30})\]"    # [FIRST NAME]
    r"|%[A-Z][A-Z0-9_]{2,30}%"             # %FIELD%
    r"|\blorem ipsum\b|\bX{4,}\b|\b(?:TODO|TBD|FIXME)\b",
    re.IGNORECASE,
)
_UPPER_ONLY = re.compile(r"^\[[^a-z]+\]$")  # the [FIELD] form must stay upper-case to avoid matching [1], [a]
_SAFE_SCHEMES = ("http://", "https://", "mailto:", "tel:")
_BASE14 = {"Helvetica", "Times", "Times-Roman", "Courier", "Symbol", "ZapfDingbats"}  # always available in viewers


@dataclass
class Link:
    target: str  # "url:https://..." or "page:3"
    rect: tuple[float, float, float, float]
    text: str


def extract_links(path: str) -> list[list[Link]]:
    out: list[list[Link]] = []
    with pymupdf.open(path) as doc:
        for page in doc:
            links = []
            for ln in page.get_links():
                if ln["kind"] == pymupdf.LINK_URI:
                    target = f"url:{ln.get('uri', '').strip()}"
                elif ln["kind"] in (pymupdf.LINK_GOTO, pymupdf.LINK_NAMED) and ln.get("page", -1) >= 0:
                    target = f"page:{ln['page'] + 1}"
                else:
                    continue
                r = ln["from"]
                text = " ".join(page.get_textbox(r).split())
                links.append(Link(target, (r.x0, r.y0, r.x1, r.y1), text))
            out.append(links)
    return out


def _label(t: str) -> str:
    kind, _, v = t.partition(":")
    return v if kind == "url" else f"page {v}"


def _overlap(a: tuple, b: tuple) -> bool:
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def check_links(cmp: Comparer, ref_links: list[list[Link]], test_links: list[list[Link]]) -> None:
    for i in range(min(len(ref_links), len(test_links))):
        pn = i + 1
        rl, tl = list(ref_links[i]), list(test_links[i])
        # 1) exact target matches
        for a in list(rl):
            b = next((b for b in tl if b.target == a.target), None)
            if b:
                rl.remove(a)
                tl.remove(b)
        # 2) same spot or same anchor text but a different target -> changed
        for a in list(rl):
            b = next((b for b in tl if _overlap(a.rect, b.rect) or (a.text and a.text == b.text)), None)
            if b:
                rl.remove(a)
                tl.remove(b)
                cmp.add(pn, C.link, S.major, f"Link target changed on “{_short(a.text or b.text, 40)}”",
                        _box(a.rect), _box(b.rect), _label(a.target), _label(b.target))
        for a in rl:
            cmp.add(pn, C.link, S.major, f"Hyperlink missing in candidate ({_short(a.text, 40) or 'no anchor text'})",
                    _box(a.rect), None, _label(a.target))
        for b in tl:
            cmp.add(pn, C.link, S.minor, f"Extra hyperlink in candidate ({_short(b.text, 40) or 'no anchor text'})",
                    None, _box(b.rect), None, _label(b.target))
    # malformed / unsafe URLs in the candidate regardless of the reference
    for i, links in enumerate(test_links):
        for b in links:
            url = b.target[4:] if b.target.startswith("url:") else None
            if url is not None and (not url.lower().startswith(_SAFE_SCHEMES) or " " in url):
                cmp.add(i + 1, C.link, S.minor, "Suspicious or malformed link URL", None, _box(b.rect),
                        "http(s)/mailto/tel URL", _short(url, 60))


def check_placeholders(cmp: Comparer, ref: DocData, test: DocData) -> None:
    ref_lines = {" ".join(l.text.split()) for p in ref.pages for l in p.lines}
    for p in test.pages:
        for l in p.lines:
            if " ".join(l.text.split()) in ref_lines:
                continue  # identical to the reference -> intentional
            hits = [m.group(0) for m in PLACEHOLDER.finditer(l.text)
                    if not m.group(0).startswith("[") or m.group(0).startswith("[[") or _UPPER_ONLY.match(m.group(0))]
            if hits:
                cmp.add(p.number, C.placeholder, S.critical, f"Unfilled template placeholder: {', '.join(hits[:3])}",
                        None, _box(l.bbox), "filled-in value", _short(l.text))


def _safe(fn, *a, default=None):
    try:
        return fn(*a)
    except Exception:  # noqa: BLE001 - one failing check must not fail the whole validation
        return default


def run_integrity(cmp: Comparer, ref: DocData, test: DocData, ref_path: str, test_path: str,
                  opts: CompareOptions) -> dict:
    info: dict = {"links_reference": 0, "links_candidate": 0}
    if opts.links:
        try:
            rl, tl = extract_links(ref_path), extract_links(test_path)
            info.update(links_reference=sum(map(len, rl)), links_candidate=sum(map(len, tl)))
            check_links(cmp, rl, tl)
        except Exception:  # noqa: BLE001 - link extraction is best-effort
            pass
    if opts.placeholders:
        check_placeholders(cmp, ref, test)
    if opts.formats:
        info["formats"] = _safe(X.check_formats, cmp, ref, test, default=0)
    if opts.spelling:
        info["spelling"] = _safe(X.check_spelling, cmp, ref, test, default=-1)
    if opts.table_cells:
        info["tables"] = _safe(X.check_tables, cmp, ref, test, default=0)
    if opts.images:
        info["images"] = _safe(X.check_images, cmp, ref, test, default=0)
    if opts.accessibility:
        info["a11y"] = _safe(X.check_accessibility, cmp, ref, test, default={})
    if opts.security:
        info["security"] = _safe(X.check_security, cmp, ref, test, default={})
    if opts.outline_forms:
        info["outline"] = _safe(X.check_outline_forms, cmp, ref, test, default={})
    if opts.must_contain or opts.must_not_contain:
        info["rules"] = X.check_rules(cmp, test, opts.must_contain, opts.must_not_contain)
    return info


def build_checks(issues: list[Issue], ref: DocData, test: DocData, opts: CompareOptions,
                 counts: dict) -> list[Check]:
    by_cat = Counter(i.category for i in issues)
    nr, nt = len(ref.pages), len(test.pages)
    size_bad = sum(1 for i in issues if i.category == C.page_structure and i.message.startswith("Page size"))
    missing_fonts = [i.expected for i in issues if i.category == C.font and i.page == 0 and i.actual is None]
    unembedded = [f for f, e in test.embedded_fonts.items() if not e and f.split("-")[0] not in _BASE14]
    title_r, title_t = ref.metadata.get("Title", "").strip(), test.metadata.get("Title", "").strip()

    def chk(key, label, ok, warn, detail) -> Check:
        return Check(key=key, label=label, status="pass" if ok else ("warn" if warn else "fail"), detail=detail)

    out = [
        chk("pages", "Page count", nr == nt, False, f"{nr} expected, {nt} found"),
        chk("page_size", "Page size & orientation", size_bad == 0, False,
            "All pages match" if not size_bad else f"{size_bad} page(s) differ"),
        chk("fonts", "Fonts present", not missing_fonts, False,
            "All reference fonts used" if not missing_fonts else f"Missing: {', '.join(missing_fonts[:3])}"),
        chk("embedding", "Fonts embedded", not unembedded, True,
            "All candidate fonts embedded" if not unembedded
            else f"Not embedded: {', '.join(unembedded[:3])} (may render differently when printed)"),
        chk("metadata", "Document title", bool(title_t) or not title_r, True,
            f"“{_short(title_t, 40)}”" if title_t else ("Missing (reference has one)" if title_r else "Not set")),
    ]
    if opts.links:
        n = by_cat.get(C.link, 0)
        out.append(chk("links", "Hyperlinks", n == 0, n > 0 and not any(
            i.category == C.link and i.severity != S.minor for i in issues),
            f"{counts['links_reference']} in reference, {counts['links_candidate']} in candidate"
            + (f" · {n} issue(s)" if n else "")))
    if opts.placeholders:
        n = by_cat.get(C.placeholder, 0)
        out.append(chk("placeholders", "No template leftovers", n == 0, False,
                       "No unfilled {{fields}}, [NAME], lorem ipsum…" if not n else f"{n} line(s) with placeholders"))

    def cat(c: C) -> tuple[int, bool]:
        """(issue count, whether any of them is worse than minor)"""
        sel = [i for i in issues if i.category == c]
        return len(sel), any(i.severity != S.minor for i in sel)

    def add(key, label, c: C, ok_text: str, bad_text: str, warn_only: bool = False):
        n, serious = cat(c)
        out.append(chk(key, label, n == 0, warn_only or not serious, ok_text if not n else bad_text.format(n=n)))

    if opts.formats:
        add("formats", "Data formats", C.data_format, "Dates, amounts, emails and IDs consistent",
            "{n} format problem(s)")
    if opts.spelling:
        if counts.get("spelling") == -1:
            out.append(Check(key="spelling", label="Spelling", status="warn",
                             detail="Spell checker not installed (pip install pyspellchecker)"))
        else:
            add("spelling", "Spelling", C.spelling, "No misspellings in customised text", "{n} line(s) to review",
                warn_only=True)
    if opts.table_cells:
        add("tables", "Table cells", C.table, f"{sum(p.tables for p in ref.pages)} table(s) match cell-by-cell",
            "{n} table difference(s)")
    if opts.images:
        add("images", "Images", C.image, f"{sum(len(p.image_info) for p in test.pages)} image(s): sharp, undistorted",
            "{n} image problem(s)")
    if opts.accessibility:
        a = counts.get("a11y") or {}
        n, serious = cat(C.accessibility)
        bits = ["tagged" if a.get("tagged") else "untagged", f"lang {a.get('lang') or 'not set'}"]
        if a.get("low_contrast"):
            bits.append(f"{a['low_contrast']} low-contrast line(s)")
        out.append(chk("accessibility", "Accessibility", n == 0 and a.get("tagged", False), not serious,
                       " · ".join(bits)))
    if opts.security:
        sec = counts.get("security") or {}
        n, serious = cat(C.security)
        bits = [sec.get("pdfa") or "not PDF/A", "encrypted" if sec.get("encrypted") else "not encrypted"]
        if sec.get("javascript"):
            bits.append("JavaScript")
        if sec.get("attachments"):
            bits.append(f"{sec['attachments']} attachment(s)")
        out.append(chk("security", "Security & metadata", n == 0, not serious, " · ".join(bits)))
    if opts.outline_forms:
        o = counts.get("outline") or {}
        n1, s1 = cat(C.outline)
        n2, s2 = cat(C.form_field)
        out.append(chk("outline", "Bookmarks & form fields", n1 + n2 == 0, not (s1 or s2),
                       f"{o.get('bookmarks_candidate', 0)} bookmark(s), {o.get('fields_candidate', 0)} field(s)"
                       + (f" · {n1 + n2} difference(s)" if n1 + n2 else "")))
    if opts.must_contain or opts.must_not_contain:
        add("rules", "Custom rules", C.rule,
            f"{len(opts.must_contain) + len(opts.must_not_contain)} rule(s) satisfied", "{n} rule violation(s)")
    if opts.ocr:
        ocr = sorted({p.number for p in (*ref.pages, *test.pages) if p.ocr})
        out.append(Check(key="ocr", label="OCR", status="pass" if ocr else "warn",
                         detail=f"Used on page(s) {', '.join(map(str, ocr))}" if ocr
                         else "No scanned pages found (or Tesseract not installed)"))
    return out
