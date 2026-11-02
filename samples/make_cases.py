"""Generate a reference PDF and a set of candidate variants, then run each through the API."""
import json, sys, time, pathlib, urllib.request, uuid
import pymupdf

OUT = pathlib.Path(__file__).parent / "cases"
OUT.mkdir(exist_ok=True)
API = "http://localhost:8000/api"

LINES = [
    "Dear Priya Sharma,",
    "We are pleased to offer you the role of Junior QA Engineer.",
    "Your employment will begin on 1 November 2026.",
    "Annual salary: INR 6,00,000 payable monthly.",
    "Probation period: 90 days from the start date.",
    "Contact hr@example-company.com or call +91 98765 43210.",
]


def build(path, lines=LINES, font="helv", size=11, color=(0, 0, 0), dx=0, dy=0, extra_pages=0,
          page_size=(595, 842), rotate=0, title="Offer Letter", logo=True, footer="Example Company Ltd.", wrap=None):
    doc = pymupdf.open()
    pg = doc.new_page(width=page_size[0], height=page_size[1])
    if logo:
        pg.draw_rect(pymupdf.Rect(0, 0, page_size[0], 48), color=None, fill=(0.1, 0.18, 0.45))
        pg.insert_text((72, 32), "EXAMPLE COMPANY LTD.", fontsize=12, fontname="hebo", color=(1, 1, 1))
    pg.insert_text((72 + dx, 110 + dy), title, fontsize=22, fontname="hebo", color=(0.1, 0.18, 0.45))
    y = 160 + dy
    for t in lines:
        if wrap and len(t) > wrap:
            cut = t.rfind(" ", 0, wrap)
            for part in (t[:cut], t[cut + 1:]):
                pg.insert_text((72 + dx, y), part, fontsize=size, fontname=font, color=color)
                y += 18
            y += 8
            continue
        pg.insert_text((72 + dx, y), t, fontsize=size, fontname=font, color=color)
        y += 26
    pg.insert_text((72, page_size[1] - 50), footer, fontsize=8, fontname="helv", color=(0.4, 0.4, 0.4))
    for n in range(extra_pages):
        p = doc.new_page(width=page_size[0], height=page_size[1])
        p.insert_text((72, 100), "Appendix - additional terms", fontsize=14, fontname="hebo")
    if rotate:
        pg.set_rotation(rotate)
    doc.save(path)
    doc.close()


def sub(lines, old, new):
    return [l.replace(old, new) for l in lines]


CASES = {
    # name: (expected verdict hint, kwargs)
    "01_identical": ("PASS", {}),
    "02_tiny_shift_0.4pt": ("PASS", dict(dx=0.4)),
    "03_new_name_same_layout": ("?", dict(lines=sub(LINES, "Priya Sharma", "Rahul Verma"))),
    "04_salary_changed": ("FAIL/REVIEW", dict(lines=sub(LINES, "6,00,000", "9,00,000"))),
    "05_font_changed": ("REVIEW", dict(font="tiro")),
    "06_font_size_12": ("REVIEW", dict(size=12)),
    "07_text_colour_red": ("REVIEW", dict(color=(0.8, 0.1, 0.1))),
    "08_line_deleted": ("FAIL", dict(lines=LINES[:3] + LINES[4:])),
    "09_extra_line": ("REVIEW", dict(lines=LINES + ["Note: offer valid for 7 days only."])),
    "10_placeholder_left": ("FAIL", dict(lines=sub(LINES, "Priya Sharma", "[CANDIDATE NAME]"))),
    "11_extra_page": ("REVIEW", dict(extra_pages=1)),
    "12_page_size_letter": ("REVIEW", dict(page_size=(612, 792))),
    "13_page_rotated_90": ("REVIEW", dict(rotate=90)),
    "14_logo_banner_removed": ("REVIEW", dict(logo=False)),
    "15_reflowed_lines": ("?", dict(wrap=45)),
    "16_footer_changed": ("REVIEW", dict(footer="Other Company Pvt Ltd.")),
    "17_typo_in_text": ("REVIEW", dict(lines=sub(LINES, "pleased", "pleesed"))),
    "18_date_format_changed": ("REVIEW", dict(lines=sub(LINES, "1 November 2026", "11/01/2026"))),
    "19_everything_shifted_20pt": ("REVIEW", dict(dx=20, dy=20)),
}


def post(ref, cand):
    b = uuid.uuid4().hex
    body = b""
    for name, p in (("reference", ref), ("candidate", cand)):
        body += (f"--{b}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{p.name}\"\r\n"
                 "Content-Type: application/pdf\r\n\r\n").encode() + p.read_bytes() + b"\r\n"
    body += f"--{b}--\r\n".encode()
    req = urllib.request.Request(f"{API}/jobs", body, {"Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(req))["id"]


def wait(jid):
    for _ in range(60):
        j = json.load(urllib.request.urlopen(f"{API}/jobs/{jid}"))
        if j["status"] in ("done", "failed"):
            return j
        time.sleep(1)
    return j


ref = OUT / "reference.pdf"
build(ref)
rows = []
for name, (hint, kw) in CASES.items():
    cand = OUT / f"{name}.pdf"
    build(cand, **kw)
    j = wait(post(ref, cand))
    r = j.get("result") or {}
    s = r.get("summary", {})
    cats = {}
    for i in r.get("issues", []):
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    rows.append((name, hint, j["status"], s.get("verdict"), s.get("overall_score"), len(r.get("issues", [])), cats, j.get("error")))

print(f"{'case':30} {'hint':12} {'verdict':8} {'score':>6} {'n':>3}  categories")
for n, h, st, v, sc, k, c, e in rows:
    print(f"{n:30} {h:12} {str(v):8} {sc if sc is None else round(sc*100,1):>6} {k:>3}  {c if st=='done' else e}")
