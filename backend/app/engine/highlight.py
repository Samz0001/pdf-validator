"""Highlighted PDF output via PyMuPDF annotations."""
from __future__ import annotations

import pymupdf

from ..schemas import Issue, Severity

COLORS = {
    Severity.critical: (0.94, 0.27, 0.27),
    Severity.major: (0.98, 0.57, 0.09),
    Severity.minor: (0.92, 0.75, 0.10),
}
MISSING_COLOR = (0.23, 0.51, 0.96)


def write_highlighted(test_path: str, out_path: str, issues: list[Issue]) -> int:
    """Annotate the candidate PDF. Missing reference content is drawn as a dashed blue box at its expected spot."""
    count = 0
    with pymupdf.open(test_path) as doc:
        for iss in issues:
            if iss.page < 1 or iss.page > len(doc):
                continue
            page = doc[iss.page - 1]
            box = iss.bbox_test
            missing = False
            if not box and iss.bbox_ref:
                box, missing = iss.bbox_ref, True
            if not box:
                continue
            rect = pymupdf.Rect(*box) & page.rect
            if rect.is_empty:
                continue
            ann = page.add_rect_annot(rect)
            color = MISSING_COLOR if missing else COLORS[iss.severity]
            ann.set_colors(stroke=color, fill=None if missing else color)
            ann.set_opacity(1.0 if missing else 0.25)
            ann.set_border(width=1.2, dashes=[3, 3] if missing else None)
            ann.set_info(title=iss.category.value, content=f"[{iss.severity.value}] {iss.message}"
                         + (f"\nExpected: {iss.expected}" if iss.expected else "")
                         + (f"\nActual: {iss.actual}" if iss.actual else ""))
            ann.update()
            count += 1
        doc.save(out_path, garbage=3, deflate=True)
    return count
