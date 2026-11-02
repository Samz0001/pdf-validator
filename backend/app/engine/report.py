"""Professional PDF report (ReportLab) with charts and issue tables."""
from __future__ import annotations

import os
from datetime import datetime

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..schemas import CompareResult

INDIGO = colors.HexColor("#4F46E5")
SLATE = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#64748B")
SEV = {"critical": colors.HexColor("#EF4444"), "major": colors.HexColor("#F59E0B"), "minor": colors.HexColor("#EAB308")}
VERDICT = {"PASS": colors.HexColor("#10B981"), "REVIEW": colors.HexColor("#F59E0B"), "FAIL": colors.HexColor("#EF4444")}


def _bar(title: str, labels: list[str], values: list[float], w=480, h=200, color=INDIGO) -> Drawing:
    d = Drawing(w, h)
    d.add(String(0, h - 12, title, fontName="Helvetica-Bold", fontSize=10, fillColor=SLATE))
    c = VerticalBarChart()
    c.x, c.y, c.width, c.height = 30, 40, w - 50, h - 70
    c.data = [values or [0]]
    c.categoryAxis.categoryNames = labels or [""]
    c.categoryAxis.labels.fontSize = 7
    c.categoryAxis.labels.angle = 25
    c.categoryAxis.labels.boxAnchor = "ne"
    c.valueAxis.valueMin = 0
    c.valueAxis.labels.fontSize = 7
    c.bars[0].fillColor = color
    c.bars[0].strokeColor = None
    c.barLabelFormat = "%d" if all(float(v).is_integer() for v in values) else "%.0f"
    c.barLabels.fontSize = 7
    c.barLabels.nudge = 6
    d.add(c)
    return d


def _pie(title: str, data: dict[str, int], w=230, h=170) -> Drawing:
    d = Drawing(w, h)
    d.add(String(0, h - 12, title, fontName="Helvetica-Bold", fontSize=10, fillColor=SLATE))
    items = [(k, v) for k, v in data.items() if v]
    if not items:
        d.add(String(10, h / 2, "No issues", fontSize=9, fillColor=MUTED))
        return d
    p = Pie()
    p.x, p.y, p.width, p.height = 20, 15, 110, 110
    p.data = [v for _, v in items]
    p.labels = [f"{k} ({v})" for k, v in items]
    p.sideLabels = True
    p.slices.fontSize = 7
    for i, (k, _) in enumerate(items):
        p.slices[i].fillColor = SEV.get(k, INDIGO)
        p.slices[i].strokeColor = colors.white
    d.add(p)
    return d


def write_report(result: CompareResult, out_path: str, diff_dir: str | None = None) -> None:
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], textColor=SLATE, fontSize=22, alignment=0, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=INDIGO, fontSize=13, spaceBefore=10, spaceAfter=6)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=9, leading=13, textColor=SLATE)
    small = ParagraphStyle("s", parent=body, fontSize=7.5, leading=10, textColor=MUTED)

    doc = SimpleDocTemplate(out_path, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm, title="DocuDiff Report")
    s = result.summary
    el: list = [
        Paragraph("DocuDiff Report", h1),
        Paragraph(f"Reference: <b>{result.reference_name}</b> &nbsp;|&nbsp; Candidate: <b>{result.candidate_name}</b>"
                  f" &nbsp;|&nbsp; {datetime.now():%d %b %Y, %H:%M}", small),
        Spacer(1, 8),
    ]

    # KPI strip
    def kpi(label: str, val: str, col=SLATE):
        return [Paragraph(f'<font size="17" color="{col.hexval()}"><b>{val}</b></font>', body),
                Paragraph(label, small)]

    cells = [
        kpi("Verdict", s.verdict, VERDICT[s.verdict]),
        kpi("Overall", f"{s.overall_score:.0%}", INDIGO),
        kpi("Text", f"{s.text_score:.0%}"),
        kpi("Format", f"{s.format_score:.0%}"),
        kpi("Layout", f"{s.layout_score:.0%}"),
        kpi("Visual", f"{s.visual_score:.0%}" if s.visual_score is not None else "–"),
        kpi("Issues", str(s.total_issues)),
    ]
    t = Table([[c[0] for c in cells], [c[1] for c in cells]], colWidths=[26 * mm] * 7)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
                           ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                           ("LINEAFTER", (0, 0), (-2, -1), 0.5, colors.white),
                           ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    el += [t, Paragraph("Key findings", h2)]
    el += [Paragraph(f"• {i}", body) for i in result.insights]

    el += [Paragraph("Charts", h2)]
    cats = sorted(s.by_category.items(), key=lambda kv: -kv[1])
    pies = Table([[_pie("Issues by severity", s.by_severity),
                   _bar("Issues by category", [k.replace("_", " ") for k, _ in cats], [v for _, v in cats], 270, 170)]])
    el += [pies, Spacer(1, 6)]
    el += [_bar("Page score (%)", [f"P{p.page}" for p in result.pages], [round(p.score * 100) for p in result.pages],
                480, 170, colors.HexColor("#10B981"))]
    el += [_bar("Font usage — reference vs candidate (characters)", [r.name[:18] for r in result.font_usage],
                [r.candidate for r in result.font_usage], 480, 170, colors.HexColor("#6366F1"))]

    # issue table
    el += [PageBreak(), Paragraph("Detected issues", h2)]
    rows = [["#", "Pg", "Severity", "Category", "Details", "Expected → Actual"]]
    order = {"critical": 0, "major": 1, "minor": 2}
    for i in sorted(result.issues, key=lambda x: (order[x.severity.value], x.page))[:150]:
        ea = " → ".join(v for v in (i.expected, i.actual) if v) or ""
        rows.append([i.id[1:], str(i.page or "–"), i.severity.value, i.category.value.replace("_", " "),
                     Paragraph(i.message, small), Paragraph(ea[:110], small)])
    tbl = Table(rows, colWidths=[10 * mm, 9 * mm, 17 * mm, 24 * mm, 66 * mm, 50 * mm], repeatRows=1)
    st = [("BACKGROUND", (0, 0), (-1, 0), SLATE), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
          ("FONTSIZE", (0, 0), (-1, -1), 7.5), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
          ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0"))]
    for r, i in enumerate(sorted(result.issues, key=lambda x: (order[x.severity.value], x.page))[:150], start=1):
        st.append(("TEXTCOLOR", (2, r), (2, r), SEV[i.severity.value]))
    tbl.setStyle(TableStyle(st))
    el += [tbl]
    if len(result.issues) > 150:
        el += [Paragraph(f"… and {len(result.issues) - 150} more issues (see the web dashboard).", small)]

    # visual diffs
    if diff_dir:
        shown = [p for p in result.pages if p.diff_image and p.ssim is not None and p.ssim < 0.995][:8]
        if shown:
            el += [PageBreak(), Paragraph("Visual differences", h2)]
            for p in shown:
                path = os.path.join(diff_dir, p.diff_image)
                if os.path.exists(path):
                    el += [Paragraph(f"Page {p.page} — SSIM {p.ssim:.3f}, changed pixels {p.diff_pct:.2f}%", body),
                           Image(path, width=95 * mm, height=95 * mm * (p.ref_size[1] / p.ref_size[0])), Spacer(1, 8)]
    doc.build(el)
