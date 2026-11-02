"""Built-in sample PDFs so the tool can be tried with one click."""
from __future__ import annotations

import pymupdf

NAVY = (0.10, 0.18, 0.45)
GREY = (0.35, 0.38, 0.45)
RED = (0.80, 0.10, 0.10)


def _page1(doc: pymupdf.Document, custom: bool) -> None:
    p = doc.new_page()
    p.draw_rect(pymupdf.Rect(0, 0, 595, 48), color=None, fill=NAVY)
    p.insert_text((72, 32), "EXAMPLE COMPANY LTD.", fontsize=12, fontname="hebo", color=(1, 1, 1))
    p.insert_text((72, 100), "Offer Letter", fontsize=26 if custom else 22, fontname="hebo", color=RED if custom else NAVY)
    p.insert_text((72, 124), "Confidential - for the addressee only", fontsize=9, fontname="heit", color=GREY)

    body = [
        "Date: 10/29/26" if custom else "Date: 29 October 2026",
        "Dear Applicant," if custom else "Dear Candidate,",
        "We are pleased to offer you the position of Junior QA Engineer at our Chandigarh office.",
        "Your employment will begin on 1 November 2026 and is subject to the terms below.",
        "You will report to the Head of Quality and work with the product and engineering teams.",
        "Your probation period will be three months from the date of joining.",
        "Please sign and return a copy of this letter within seven days of recieving it." if custom
        else "Please sign and return a copy of this letter within seven days of receiving it.",
    ]
    y = 160
    for i, t in enumerate(body):
        if custom and i == 4:
            continue  # content removed
        font = "tiro" if (custom and i == 3) else "helv"
        p.insert_text((72, y), t, fontsize=11, fontname=font, color=(0, 0, 0))
        y += 28 if custom and i >= 4 else 24
    if custom:
        p.insert_text((72, y), "Note: this offer is valid for 7 days only.", fontsize=11, fontname="hebo", color=RED)

    p.insert_text((72, 350), "Employee ID: [EMPLOYEE ID]" if custom else "Employee ID: ZG-1042", fontsize=11,
                  fontname="helv")

    rows = [("Designation", "Junior QA Engineer"), ("Location", "Chandigarh"), ("Notice period", "30 days")]
    ty = 400
    p.draw_rect(pymupdf.Rect(72, ty - 18, 523, ty + 3 * 28 - 14), color=(0.75, 0.78, 0.85))
    for i, (k, v) in enumerate(rows):
        yy = ty + i * (34 if custom else 28)
        p.insert_text((84, yy), k, fontsize=11, fontname="hebo", color=NAVY)
        p.insert_text((250 + (16 if custom else 0), yy), v, fontsize=11, fontname="helv")
    p.draw_line((72, 700), (260, 700), color=(0, 0, 0), width=0.8)
    p.insert_text((72, 716), "Authorised signatory", fontsize=9, fontname="helv", color=GREY)


def _page2(doc: pymupdf.Document, custom: bool) -> None:
    p = doc.new_page()
    x = 90 if custom else 72
    p.insert_text((x, 90), "Terms & Conditions", fontsize=18, fontname="hebo", color=NAVY)
    clauses = [
        "1. The employee shall devote full working time to the company.",
        "2. Working hours are 9:30 AM to 6:30 PM, Monday to Friday.",
        "3. The employee is entitled to 18 days of paid leave per year." if not custom
        else "3. The employee is entitled to 12 days of paid leave per year.",
        "4. All work product remains the intellectual property of the company.",
        "5. Either party may terminate employment with 30 days written notice.",
        "6. The employee must keep company information strictly confidential.",
    ]
    y = 130
    for t in clauses:
        p.insert_text((x, y), t, fontsize=11, fontname="helv")
        y += 26
    p.insert_text((x, 300), "Benefits handbook: examplecompany.com/handbook", fontsize=11, fontname="helv",
                  color=(0.1, 0.3, 0.8))
    url = "http://example-company.com/handbook" if custom else "https://examplecompany.com/handbook"
    p.insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(x, 288, x + 250, 304), "uri": url})
    p.insert_text((72, 780), "Example Company Ltd. - Chandigarh, India", fontsize=8, fontname="helv",
                  color=(0, 0, 0) if custom else GREY)


def make_demo_pdfs() -> tuple[bytes, bytes]:
    out = []
    for custom in (False, True):
        doc = pymupdf.open()
        _page1(doc, custom)
        _page2(doc, custom)
        out.append(doc.tobytes())
        doc.close()
    return out[0], out[1]
