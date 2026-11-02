"""Visual engine: render pages, SSIM + pixel diff, region detection, overlay images."""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
import pymupdf
from PIL import Image
from skimage.metrics import structural_similarity


@dataclass
class VisualPage:
    page: int
    ssim: float
    diff_pct: float
    regions: list[list[float]]  # PDF points, reference coordinate space
    overlay: Image.Image


def render(doc: pymupdf.Document, idx: int, dpi: int) -> np.ndarray:
    pix = doc[idx].get_pixmap(dpi=dpi, colorspace=pymupdf.csRGB, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3).copy()


def compare_page(ref: np.ndarray, test: np.ndarray, page: int, dpi: int, threshold: int, tol_pt: float = 0.0) -> VisualPage:
    h, w = ref.shape[:2]
    if test.shape[:2] != (h, w):
        test = cv2.resize(test, (w, h), interpolation=cv2.INTER_AREA)

    g1 = cv2.cvtColor(ref, cv2.COLOR_RGB2GRAY)
    g2 = cv2.cvtColor(test, cv2.COLOR_RGB2GRAY)
    score, full = structural_similarity(g1, g2, full=True, data_range=255)

    b1, b2 = cv2.GaussianBlur(g1, (3, 3), 0), cv2.GaussianBlur(g2, (3, 3), 0)
    r = int(round(tol_pt * dpi / 72.0))
    if r >= 1:
        # forgive sub-tolerance shifts: a pixel only differs if it is outside the range of the other
        # page's pixels within r px, so a slightly moved glyph is not a visual mismatch
        ker = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * r + 1, 2 * r + 1))
        lo, hi = cv2.erode(b2, ker), cv2.dilate(b2, ker)
        lo1, hi1 = cv2.erode(b1, ker), cv2.dilate(b1, ker)
        absdiff = np.maximum(np.maximum(b1.astype(np.int16) - hi, lo.astype(np.int16) - b1), 0)
        absdiff = np.minimum(absdiff, np.maximum(np.maximum(b2.astype(np.int16) - hi1, lo1.astype(np.int16) - b2), 0))
        absdiff = absdiff.astype(np.uint8)
    else:
        absdiff = cv2.absdiff(b1, b2)
    mask = (absdiff > threshold).astype(np.uint8) * 255
    diff_pct = float(np.count_nonzero(mask)) / mask.size * 100

    k = max(9, dpi // 6)
    merged = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k * 2, k)))
    contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    scale = 72.0 / dpi
    min_area = (dpi / 25) ** 2
    regions, boxes = [], []
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        if bw * bh < min_area:
            continue
        boxes.append((x, y, bw, bh))
        regions.append([round(x * scale, 1), round(y * scale, 1), round((x + bw) * scale, 1), round((y + bh) * scale, 1)])

    # overlay: faded candidate + red diff pixels + boxes
    base = (test.astype(np.float32) * 0.55 + 255 * 0.45).astype(np.uint8)
    base[mask > 0] = (0.35 * base[mask > 0] + 0.65 * np.array([239, 68, 68])).astype(np.uint8)
    for x, y, bw, bh in boxes:
        cv2.rectangle(base, (x - 2, y - 2), (x + bw + 2, y + bh + 2), (220, 38, 38), 2)

    return VisualPage(page, float(score), diff_pct, regions, Image.fromarray(base))


def compare_documents(ref_path: str, test_path: str, dpi: int, threshold: int, tol_pt: float = 0.0) -> list[VisualPage]:
    out: list[VisualPage] = []
    with pymupdf.open(ref_path) as rd, pymupdf.open(test_path) as td:
        for i in range(min(len(rd), len(td))):
            out.append(compare_page(render(rd, i, dpi), render(td, i, dpi), i + 1, dpi, threshold, tol_pt))
    return out
