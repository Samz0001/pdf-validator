"""End-to-end validation pipeline: extract -> compare -> visual -> analyse -> highlight -> report."""
from __future__ import annotations

import os

from ..schemas import CompareOptions, CompareResult
from .analysis import build_result
from .compare import Comparer
from .extract import extract_document
from .highlight import write_highlighted
from .checks import drop_ignored
from .integrity import build_checks, run_integrity
from .report import write_report
from .visual import compare_documents


def run_validation(
    ref_path: str,
    test_path: str,
    out_dir: str,
    opts: CompareOptions | None = None,
    ref_name: str = "reference.pdf",
    test_name: str = "candidate.pdf",
) -> CompareResult:
    opts = opts or CompareOptions()
    os.makedirs(out_dir, exist_ok=True)

    ref = extract_document(ref_path, opts.tables or opts.table_cells, opts.ocr)
    test = extract_document(test_path, opts.tables or opts.table_cells, opts.ocr)

    cmp = Comparer(opts)
    cmp.run(ref, test)
    link_counts = run_integrity(cmp, ref, test, ref_path, test_path, opts)
    cmp.issues = drop_ignored(cmp.issues, opts.ignore_regions)

    visual = compare_documents(ref_path, test_path, opts.dpi, opts.diff_threshold) if opts.visual else None
    result = build_result(ref_name, test_name, ref, test, cmp, visual, opts.ignore_regions)
    result.ocr_pages = sorted({p.number for p in (*ref.pages, *test.pages) if p.ocr})
    result.checks = build_checks(result.issues, ref, test, opts, link_counts)

    files: dict[str, object] = {}
    if visual:
        pmap = {p.page: p for p in result.pages}
        for v in visual:
            name = f"diff_{v.page}.png"
            v.overlay.save(os.path.join(out_dir, name), optimize=True)
            pmap[v.page].diff_image = name
        files["diff_images"] = [f"diff_{v.page}.png" for v in visual]

    if opts.highlight:
        write_highlighted(test_path, os.path.join(out_dir, "highlighted.pdf"), result.issues)
        files["highlighted"] = "highlighted.pdf"

    result.files = files
    write_report(result, os.path.join(out_dir, "report.pdf"), out_dir)
    files["report"] = "report.pdf"
    result.files = files

    with open(os.path.join(out_dir, "result.json"), "w", encoding="utf-8") as f:
        f.write(result.model_dump_json(indent=1))
    return result
