"""Text / formatting / layout / structure comparison between a reference and a candidate PDF."""
from __future__ import annotations

import difflib
import math
import re
from functools import reduce
from collections import Counter, defaultdict

from ..schemas import Category as C
from ..schemas import CompareOptions, Issue
from ..schemas import Severity as S
from .extract import DocData, Line, PageData


def _norm(text: str, ignore_case: bool) -> str:
    t = " ".join(text.split())
    return t.lower() if ignore_case else t


_NUM = re.compile(r"\d+(?:[.,]\d+)*")


def _numbers(text: str) -> list[str]:
    return _NUM.findall(text)


def _rgb(h: str) -> tuple[int, int, int]:
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def _color_dist(a: str, b: str) -> float:
    return math.dist(_rgb(a), _rgb(b))


def _union(a: tuple, b: tuple) -> list[float]:
    return [round(v, 1) for v in (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))]


def _box(b: tuple) -> list[float]:
    return [round(v, 1) for v in b]


def _short(t: str, n: int = 90) -> str:
    return t if len(t) <= n else t[: n - 1] + "…"


def _alignment(line: Line, page: PageData) -> str:
    m = page.margins
    if not m:
        return "left"
    lg, rg = line.bbox[0] - m[0], m[2] - line.bbox[2]
    # a line spanning (nearly) the whole text block can't be told apart from left-aligned
    if (line.bbox[2] - line.bbox[0]) > 0.85 * (m[2] - m[0]):
        return "left"
    if lg > 8 and abs(lg - rg) < 4:
        return "center"
    if lg > 8 and rg < 4:
        return "right"
    return "left"


class Comparer:
    def __init__(self, opts: CompareOptions):
        self.o = opts
        self.issues: list[Issue] = []
        self.page_stats: dict[int, dict] = {}
        self.font_map: Counter = Counter()
        self.size_map: Counter = Counter()
        self.color_map: Counter = Counter()
        self.pairs: list[tuple[int, Line, Line]] = []  # (page, reference line, candidate line)

    # -- helpers -----------------------------------------------------------------
    def add(self, page, category, severity, message, bbox_ref=None, bbox_test=None, expected=None, actual=None):
        self.issues.append(
            Issue(
                id=f"I{len(self.issues) + 1:04d}",
                page=page,
                category=category,
                severity=severity,
                message=message,
                bbox_ref=bbox_ref,
                bbox_test=bbox_test,
                expected=expected,
                actual=actual,
            )
        )

    # -- document level ----------------------------------------------------------
    def run(self, ref: DocData, test: DocData) -> None:
        nr, nt = len(ref.pages), len(test.pages)
        if nr != nt:
            self.add(0, C.page_structure, S.critical, f"Page count differs: reference has {nr}, candidate has {nt}",
                     expected=str(nr), actual=str(nt))
        for fname, emb in ref.embedded_fonts.items():
            if fname not in test.embedded_fonts and test.embedded_fonts:
                self.add(0, C.font, S.major, f"Font '{fname}' used in reference is not present in candidate",
                         expected=fname)
            elif emb and test.embedded_fonts.get(fname) is False:
                self.add(0, C.font, S.minor, f"Font '{fname}' is embedded in reference but not in candidate",
                         expected="embedded", actual="not embedded")

        for i in range(max(nr, nt)):
            pn = i + 1
            if i >= nt:
                self.add(pn, C.page_structure, S.critical, f"Page {pn} is missing in candidate")
                self.page_stats[pn] = dict(text_sim=0.0, matched=0, fmt_bad=0, layout_bad=0,
                                           w=max(ref.pages[i].chars, 1), in_test=False, in_ref=True)
                continue
            if i >= nr:
                self.add(pn, C.page_structure, S.major, f"Page {pn} is extra in candidate")
                self.page_stats[pn] = dict(text_sim=0.0, matched=0, fmt_bad=0, layout_bad=0,
                                           w=max(test.pages[i].chars, 1), in_test=True, in_ref=False)
                continue
            self._page(ref.pages[i], test.pages[i])

    # -- page level --------------------------------------------------------------
    def _page(self, rp: PageData, tp: PageData) -> None:
        pn, o = rp.number, self.o
        if abs(rp.width - tp.width) > 1 or abs(rp.height - tp.height) > 1:
            self.add(pn, C.page_structure, S.major,
                     f"Page size differs: {rp.width:.0f}×{rp.height:.0f}pt vs {tp.width:.0f}×{tp.height:.0f}pt",
                     expected=f"{rp.width:.0f}x{rp.height:.0f}", actual=f"{tp.width:.0f}x{tp.height:.0f}")
        if rp.rotation != tp.rotation:
            self.add(pn, C.page_structure, S.major, f"Page rotation differs: {rp.rotation}° vs {tp.rotation}°")
        if rp.images != tp.images:
            self.add(pn, C.page_structure, S.major, f"Image count differs: {rp.images} vs {tp.images}",
                     expected=str(rp.images), actual=str(tp.images))
        if rp.tables != tp.tables:
            self.add(pn, C.page_structure, S.major, f"Table count differs: {rp.tables} vs {tp.tables}",
                     expected=str(rp.tables), actual=str(tp.tables))
        if rp.drawings and abs(rp.drawings - tp.drawings) > max(5, 0.15 * rp.drawings):
            self.add(pn, C.page_structure, S.minor,
                     f"Vector graphics count differs: {rp.drawings} vs {tp.drawings} (lines/boxes/shapes)",
                     expected=str(rp.drawings), actual=str(tp.drawings))

        rk = [_norm(l.text, o.ignore_case) for l in rp.lines]
        tk = [_norm(l.text, o.ignore_case) for l in tp.lines]
        if rk and rk != tk and " ".join(rk).split() == " ".join(tk).split():
            self._reflowed(pn, rp, tp)
            return
        sm = difflib.SequenceMatcher(None, rk, tk, autojunk=False)

        pairs: list[tuple[Line, Line, float]] = []
        matched_chars = 0.0
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                for a, b in zip(rp.lines[i1:i2], tp.lines[j1:j2]):
                    pairs.append((a, b, 1.0))
                    matched_chars += len(a.text) * 2
            elif tag == "delete":
                for a in rp.lines[i1:i2]:
                    self._missing(pn, a)
            elif tag == "insert":
                for b in tp.lines[j1:j2]:
                    self._extra(pn, b)
            else:  # replace -> pair by similarity
                used: set[int] = set()
                for a in rp.lines[i1:i2]:
                    best, best_r = None, 0.0
                    for j in range(j1, j2):
                        if j in used:
                            continue
                        r = difflib.SequenceMatcher(None, _norm(a.text, o.ignore_case),
                                                    _norm(tp.lines[j].text, o.ignore_case)).ratio()
                        if r > best_r:
                            best, best_r = j, r
                    if best is not None and best_r >= 0.55:
                        used.add(best)
                        b = tp.lines[best]
                        pairs.append((a, b, best_r))
                        matched_chars += best_r * (len(a.text) + len(b.text))
                        num_changed = _numbers(a.text) != _numbers(b.text)
                        # a changed figure (amount, date, id) is high-risk even when the line is 98% identical
                        sev = S.major if best_r < 0.85 or num_changed else S.minor
                        msg = f"Text changed ({best_r:.0%} similar)"
                        if num_changed:
                            msg = f"Number/date changed ({best_r:.0%} similar)"
                        self.add(pn, C.text_changed, sev, msg,
                                 _box(a.bbox), _box(b.bbox), _short(a.text), _short(b.text))
                    else:
                        self._missing(pn, a)
                for j in range(j1, j2):
                    if j not in used:
                        self._extra(pn, tp.lines[j])

        total_chars = sum(len(l.text) for l in rp.lines) + sum(len(l.text) for l in tp.lines)
        text_sim = matched_chars / total_chars if total_chars else 1.0

        fmt_bad = layout_bad = 0
        prev_dy: float | None = None
        for a, b, _r in pairs:
            self.pairs.append((pn, a, b))
            f, l = self._pair(pn, rp, tp, a, b, prev_dy)
            fmt_bad += f
            layout_bad += l
            prev_dy = b.bbox[1] - a.bbox[1]

        self._margins(pn, rp, tp)
        self.page_stats[pn] = dict(text_sim=text_sim, matched=len(pairs), fmt_bad=fmt_bad, layout_bad=layout_bad,
                                   w=max(rp.chars, tp.chars, 1), in_test=True, in_ref=True)

    def _reflowed(self, pn, rp: PageData, tp: PageData) -> None:
        """Same words in the same order, only the line breaks moved: report once instead of per line."""
        ub = lambda lines: _box(reduce(lambda x, y: _union(x, y), (l.bbox for l in lines)))
        self.add(pn, C.spacing, S.minor, "Text is identical but wraps onto different lines (reflowed)",
                 ub(rp.lines), ub(tp.lines), f"{len(rp.lines)} lines", f"{len(tp.lines)} lines")
        self._margins(pn, rp, tp)
        self.page_stats[pn] = dict(text_sim=1.0, matched=len(rp.lines), fmt_bad=0, layout_bad=1,
                                   w=max(rp.chars, tp.chars, 1), in_test=True, in_ref=True)

    def _missing(self, pn, a: Line):
        sev = S.critical if len(a.text) > 20 else S.major
        self.add(pn, C.text_missing, sev, "Content missing in candidate", _box(a.bbox), None, _short(a.text))

    def _extra(self, pn, b: Line):
        self.add(pn, C.text_extra, S.major, "Extra content in candidate", None, _box(b.bbox), None, _short(b.text))

    def _pair(self, pn, rp, tp, a: Line, b: Line, prev_dy):
        o = self.o
        fmt = layout = 0
        ba, bb = _box(a.bbox), _box(b.bbox)
        label = f"“{_short(a.text, 40)}”"

        if a.font.lower() != b.font.lower() or a.bold != b.bold or a.italic != b.italic:
            self.font_map[(a.font, b.font)] += 1
            self.add(pn, C.font, S.major, f"Font differs on {label}", ba, bb, a.font, b.font)
            fmt = 1
        if abs(a.size - b.size) > o.size_tol:
            self.size_map[(f"{a.size:g}", f"{b.size:g}")] += 1
            sev = S.major if abs(a.size - b.size) > 2 else S.minor
            self.add(pn, C.font_size, sev, f"Font size differs on {label}", ba, bb, f"{a.size:g}pt", f"{b.size:g}pt")
            fmt = 1
        d = _color_dist(a.color, b.color)
        if d > o.color_tol:
            self.color_map[(a.color, b.color)] += 1
            self.add(pn, C.color, S.major if d > 150 else S.minor, f"Text colour differs on {label}", ba, bb,
                     a.color, b.color)
            fmt = 1
        aa, ab = _alignment(a, rp), _alignment(b, tp)
        if aa != ab:
            self.add(pn, C.alignment, S.major, f"Alignment differs on {label}", ba, bb, aa, ab)
            layout = 1

        dx, dy = b.bbox[0] - a.bbox[0], b.bbox[1] - a.bbox[1]
        if aa == ab == "left" and abs(dx) > o.pos_tol:
            self.add(pn, C.position, S.major if abs(dx) > 10 else S.minor,
                     f"Horizontal shift of {dx:+.1f}pt on {label}", ba, bb, f"x={a.bbox[0]:.1f}", f"x={b.bbox[0]:.1f}")
            layout = 1
        if prev_dy is None:
            if abs(dy) > o.pos_tol:
                self.add(pn, C.position, S.major if abs(dy) > 10 else S.minor,
                         f"Vertical shift of {dy:+.1f}pt on {label}", ba, bb, f"y={a.bbox[1]:.1f}", f"y={b.bbox[1]:.1f}")
                layout = 1
        elif abs(dy - prev_dy) > o.pos_tol:
            gap = dy - prev_dy
            self.add(pn, C.spacing, S.major if abs(gap) > 8 else S.minor,
                     f"Line spacing changed by {gap:+.1f}pt before {label}", ba, bb,
                     f"y={a.bbox[1]:.1f}", f"y={b.bbox[1]:.1f}")
            layout = 1
        return fmt, layout

    def _margins(self, pn, rp: PageData, tp: PageData):
        mr, mt = rp.margins, tp.margins
        if not mr or not mt:
            return
        names = ("left", "top", "right", "bottom")
        vals_r = (mr[0], mr[1], rp.width - mr[2], rp.height - mr[3])
        vals_t = (mt[0], mt[1], tp.width - mt[2], tp.height - mt[3])
        for n, vr, vt in zip(names, vals_r, vals_t):
            if abs(vr - vt) > self.o.margin_tol:
                self.add(pn, C.margin, S.major if abs(vr - vt) > 12 else S.minor,
                         f"{n.capitalize()} margin differs by {vt - vr:+.1f}pt",
                         _box(mr), _box(mt), f"{vr:.1f}pt", f"{vt:.1f}pt")
