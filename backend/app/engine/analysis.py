"""Scoring + human-readable analysis."""
from __future__ import annotations

from collections import Counter

from ..schemas import Category, CompareResult, IgnoreRegion, Issue, PageSummary, Severity, Summary, UsageRow
from .checks import in_ignored
from .compare import Comparer
from .extract import DocData
from .visual import VisualPage

WEIGHTS = {"text": 0.35, "format": 0.25, "layout": 0.15, "visual": 0.25}


def _usage(ref: Counter, test: Counter, top: int = 8) -> list[UsageRow]:
    names = sorted(set(ref) | set(test), key=lambda n: -max(ref.get(n, 0), test.get(n, 0)))[:top]
    return [UsageRow(name=n, reference=ref.get(n, 0), candidate=test.get(n, 0)) for n in names]


def build_result(
    ref_name: str,
    test_name: str,
    ref: DocData,
    test: DocData,
    cmp: Comparer,
    visual: list[VisualPage] | None,
    ignore: list[IgnoreRegion] | None = None,
) -> CompareResult:
    issues: list[Issue] = cmp.issues
    stats = cmp.page_stats
    vmap = {v.page: v for v in (visual or [])}

    # ---- scores ----------------------------------------------------------------
    wsum = sum(s["w"] for s in stats.values()) or 1
    text_score = sum(s["text_sim"] * s["w"] for s in stats.values()) / wsum if stats else 1.0
    matched = sum(s["matched"] for s in stats.values())
    ref_has_text = any(p.lines for p in ref.pages)
    fmt_bad = sum(s["fmt_bad"] for s in stats.values())
    lay_bad = sum(s["layout_bad"] for s in stats.values())
    format_score = 1 - fmt_bad / matched if matched else (0.0 if ref_has_text else 1.0)
    struct_n = sum(1 for i in issues if i.category == Category.page_structure)
    layout_score = max(0.0, (1 - lay_bad / matched if matched else (0.0 if ref_has_text else 1.0)) - min(0.3, 0.1 * struct_n))

    visual_score = None
    if visual is not None:
        n_ref = max(len(ref.pages), 1)
        visual_score = sum(v.ssim for v in visual) / max(n_ref, len(test.pages))
    parts = {"text": text_score, "format": format_score, "layout": layout_score}
    if visual_score is not None:
        parts["visual"] = visual_score
    wtot = sum(WEIGHTS[k] for k in parts)
    overall = sum(parts[k] * WEIGHTS[k] for k in parts) / wtot

    # ---- visual regions -> issues (only those not already explained by a located issue) ----
    if visual:
        for v in visual:
            for r in v.regions:
                if _covered(r, [i for i in issues if i.page == v.page]) or in_ignored(v.page, r, ignore or []):
                    continue
                area = (r[2] - r[0]) * (r[3] - r[1])
                page_area = ref.pages[v.page - 1].width * ref.pages[v.page - 1].height or 1
                sev = Severity.major if area / page_area > 0.03 else Severity.minor
                cmp.add(v.page, Category.visual, sev, "Visual mismatch (pixel/structural difference)", r, r)
        issues = cmp.issues

    by_sev = Counter(i.severity.value for i in issues)
    by_cat = Counter(i.category.value for i in issues)
    verdict = "PASS"
    if by_sev["critical"] or overall < 0.80:
        verdict = "FAIL"
    elif by_sev["major"] or overall < 0.95:
        verdict = "REVIEW"

    # ---- per page ---------------------------------------------------------------
    pages: list[PageSummary] = []
    for pn in sorted(stats):
        s = stats[pn]
        pi = [i for i in issues if i.page == pn]
        v = vmap.get(pn)
        rp = ref.pages[pn - 1] if pn <= len(ref.pages) else None
        tp = test.pages[pn - 1] if pn <= len(test.pages) else None
        page_matched = max(s["matched"], 1)
        fmt_s = 1 - s["fmt_bad"] / page_matched
        lay_s = 1 - s["layout_bad"] / page_matched
        comps = [s["text_sim"], fmt_s, lay_s] + ([v.ssim] if v else [])
        pages.append(
            PageSummary(
                page=pn,
                in_reference=s["in_ref"],
                in_candidate=s["in_test"],
                text_similarity=round(s["text_sim"], 4),
                ssim=round(v.ssim, 4) if v else None,
                diff_pct=round(v.diff_pct, 3) if v else None,
                issue_count=len(pi),
                score=round(sum(comps) / len(comps), 4) if s["in_ref"] and s["in_test"] else 0.0,
                by_category=dict(Counter(i.category.value for i in pi)),
                ref_size=[round(rp.width, 1), round(rp.height, 1)] if rp else None,
                test_size=[round(tp.width, 1), round(tp.height, 1)] if tp else None,
            )
        )

    summary = Summary(
        overall_score=round(overall, 4),
        text_score=round(text_score, 4),
        format_score=round(format_score, 4),
        layout_score=round(layout_score, 4),
        visual_score=round(visual_score, 4) if visual_score is not None else None,
        verdict=verdict,
        total_issues=len(issues),
        by_severity={k: by_sev.get(k, 0) for k in ("critical", "major", "minor")},
        by_category=dict(by_cat),
        pages_reference=len(ref.pages),
        pages_candidate=len(test.pages),
    )
    return CompareResult(
        reference_name=ref_name,
        candidate_name=test_name,
        summary=summary,
        pages=pages,
        issues=issues,
        insights=_insights(summary, pages, cmp, by_cat),
        font_usage=_usage(ref.font_chars, test.font_chars),
        size_usage=_usage(ref.size_chars, test.size_chars),
        color_usage=_usage(ref.color_chars, test.color_chars),
    )


def _covered(region: list[float], issues: list[Issue]) -> bool:
    ra = max((region[2] - region[0]) * (region[3] - region[1]), 1e-6)
    for i in issues:
        for b in (i.bbox_ref, i.bbox_test):
            if not b:
                continue
            w = min(region[2], b[2]) - max(region[0], b[0])
            h = min(region[3], b[3]) - max(region[1], b[1])
            if w > 0 and h > 0 and w * h / ra > 0.35:
                return True
    return False


def _insights(sm: Summary, pages: list[PageSummary], cmp: Comparer, by_cat: Counter) -> list[str]:
    out: list[str] = []
    pct = f"{sm.overall_score:.0%}"
    if sm.verdict == "PASS":
        out.append(f"Candidate matches the reference closely (overall {pct}) with no critical or major differences.")
    elif sm.verdict == "REVIEW":
        out.append(f"Candidate is close to the reference (overall {pct}) but has {sm.by_severity['major']} major and "
                   f"{sm.by_severity['minor']} minor differences that need review.")
    else:
        out.append(f"Candidate deviates significantly from the reference (overall {pct}); "
                   f"{sm.by_severity['critical']} critical issue(s) found.")
    if sm.pages_reference != sm.pages_candidate:
        out.append(f"Page count mismatch: {sm.pages_reference} expected vs {sm.pages_candidate} found.")
    if by_cat:
        cat, n = by_cat.most_common(1)[0]
        out.append(f"Most frequent issue type: {cat.replace('_', ' ')} ({n} of {sm.total_issues}).")
    if by_cat.get("text_missing"):
        out.append(f"{by_cat['text_missing']} line(s) from the reference are missing in the candidate.")
    if by_cat.get("text_extra"):
        out.append(f"{by_cat['text_extra']} extra line(s) appear in the candidate that are not in the reference.")
    if cmp.font_map:
        (a, b), n = cmp.font_map.most_common(1)[0]
        out.append(f"Font substitution detected: {a} → {b} on {n} line(s).")
    if cmp.size_map:
        (a, b), n = cmp.size_map.most_common(1)[0]
        out.append(f"Most common size change: {a}pt → {b}pt on {n} line(s).")
    if cmp.color_map:
        (a, b), n = cmp.color_map.most_common(1)[0]
        out.append(f"Most common colour change: {a} → {b} on {n} line(s).")
    if by_cat.get("placeholder"):
        out.append(f"{by_cat['placeholder']} line(s) still contain unfilled template placeholders — "
                   "the document was not fully customised.")
    if by_cat.get("link"):
        out.append(f"{by_cat['link']} hyperlink issue(s): missing, changed or malformed link targets.")
    for key, text in (("data_format", "data format problem(s) (dates, amounts, emails or IDs)"),
                      ("spelling", "line(s) with possible misspellings in customised text"),
                      ("table", "table cell/shape difference(s)"),
                      ("image", "image problem(s) (replaced, stretched, resized or low resolution)"),
                      ("accessibility", "accessibility finding(s)"),
                      ("security", "security / metadata finding(s)"),
                      ("rule", "custom rule violation(s)")):
        if by_cat.get(key):
            out.append(f"{by_cat[key]} {text}.")
    if by_cat.get("margin"):
        out.append(f"Margins differ on {len({i.page for i in cmp.issues if i.category == Category.margin})} page(s); "
                   "check page template or export settings.")
    ranked = [p for p in pages if p.in_reference and p.in_candidate]
    if ranked:
        worst = min(ranked, key=lambda p: p.score)
        if worst.score < 0.95:
            out.append(f"Weakest page: page {worst.page} (score {worst.score:.0%}, {worst.issue_count} issues).")
    return out
