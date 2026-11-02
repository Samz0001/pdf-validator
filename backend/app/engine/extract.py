"""PDF extraction: PyMuPDF (text/spans/blocks), pdfplumber (tables), pikepdf (structure/fonts)."""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

import pdfplumber
import pikepdf
import pymupdf

_SUBSET = re.compile(r"^[A-Z]{6}\+")


def clean_font(name: str | None) -> str:
    return _SUBSET.sub("", name or "") or "unknown"


@dataclass
class Line:
    page: int
    text: str
    bbox: tuple[float, float, float, float]
    font: str
    size: float
    color: str
    bold: bool
    italic: bool


@dataclass
class ImageInfo:
    bbox: tuple[float, float, float, float]
    px_w: int
    px_h: int
    digest: str
    xref: int


@dataclass
class TableGrid:
    bbox: tuple[float, float, float, float]
    rows: list[list[tuple[str, tuple[float, float, float, float]] | None]]


@dataclass
class PageData:
    number: int
    width: float
    height: float
    rotation: int
    lines: list[Line] = field(default_factory=list)
    images: int = 0
    drawings: int = 0
    tables: int = 0
    image_info: list[ImageInfo] = field(default_factory=list)
    grids: list[TableGrid] = field(default_factory=list)
    ocr: bool = False

    @property
    def margins(self) -> tuple[float, float, float, float] | None:
        """(left, top, right_edge, bottom_edge) of the text content box."""
        if not self.lines:
            return None
        return (
            min(l.bbox[0] for l in self.lines),
            min(l.bbox[1] for l in self.lines),
            max(l.bbox[2] for l in self.lines),
            max(l.bbox[3] for l in self.lines),
        )

    @property
    def chars(self) -> int:
        return sum(len(l.text) for l in self.lines)


@dataclass
class DocData:
    pages: list[PageData]
    font_chars: Counter
    size_chars: Counter
    color_chars: Counter
    embedded_fonts: dict[str, bool]
    metadata: dict[str, str]
    path: str = ""


def _structure(path: str) -> tuple[dict[str, bool], dict[str, str]]:
    fonts: dict[str, bool] = {}
    meta: dict[str, str] = {}
    try:
        with pikepdf.open(path) as pdf:
            meta = {str(k).lstrip("/"): str(v) for k, v in pdf.docinfo.items()}
            for page in pdf.pages:
                res = page.get("/Resources")
                f = res.get("/Font") if res is not None else None
                if f is None:
                    continue
                for _, font in f.items():
                    base = clean_font(str(font.get("/BaseFont", "")).lstrip("/"))
                    desc = font.get("/FontDescriptor")
                    if desc is None and "/DescendantFonts" in font:
                        desc = font["/DescendantFonts"][0].get("/FontDescriptor")
                    emb = desc is not None and any(k in desc for k in ("/FontFile", "/FontFile2", "/FontFile3"))
                    fonts[base] = fonts.get(base, False) or emb
    except Exception:  # noqa: BLE001 - structure info is best-effort
        pass
    return fonts, meta


def _ocr_dict(page: pymupdf.Page) -> dict | None:
    """Text dict from Tesseract OCR (needs the tesseract binary; returns None when unavailable)."""
    try:
        tp = page.get_textpage_ocr(dpi=200, full=True)
        return page.get_text("dict", textpage=tp)
    except Exception:  # noqa: BLE001
        return None


def _images(page: pymupdf.Page) -> list[ImageInfo]:
    out = []
    try:
        for im in page.get_image_info(hashes=True, xrefs=True):
            b = im["bbox"]
            if b[2] - b[0] < 2 or b[3] - b[1] < 2:
                continue
            dg = im.get("digest") or b""
            out.append(ImageInfo(tuple(round(v, 2) for v in b), im["width"], im["height"],
                                 dg.hex() if isinstance(dg, bytes) else str(dg), im.get("xref", 0)))
    except Exception:  # noqa: BLE001
        pass
    return out


def extract_document(path: str, detect_tables: bool = True, ocr: bool = False) -> DocData:
    pages: list[PageData] = []
    font_chars: Counter = Counter()
    size_chars: Counter = Counter()
    color_chars: Counter = Counter()

    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            rect = page.rect
            pd = PageData(number=i, width=rect.width, height=rect.height, rotation=page.rotation)
            d = page.get_text("dict")
            if ocr and not page.get_text("text").strip() and (od := _ocr_dict(page)):
                d, pd.ocr = od, True
            pd.image_info = _images(page)
            for block in d["blocks"]:
                if block["type"] == 1:
                    pd.images += 1
                    continue
                for ln in block.get("lines", []):
                    spans = [s for s in ln["spans"] if s["text"].strip()]
                    if not spans:
                        continue
                    text = "".join(s["text"] for s in ln["spans"]).strip()
                    dom = max(spans, key=lambda s: len(s["text"].strip()))
                    n = len(text)
                    font = clean_font(dom["font"])
                    size = round(dom["size"], 2)
                    color = f"#{dom['color']:06x}"
                    pd.lines.append(
                        Line(
                            page=i,
                            text=text,
                            bbox=tuple(round(v, 2) for v in ln["bbox"]),
                            font=font,
                            size=size,
                            color=color,
                            bold=bool(dom["flags"] & 16),
                            italic=bool(dom["flags"] & 2),
                        )
                    )
                    font_chars[font] += n
                    size_chars[f"{size:g}pt"] += n
                    color_chars[color] += n
            # reading order: top-to-bottom, left-to-right
            pd.lines.sort(key=lambda l: (round(l.bbox[1] / 3), l.bbox[0]))
            try:
                pd.drawings = len(page.get_drawings())
            except Exception:  # noqa: BLE001
                pd.drawings = 0
            pages.append(pd)

    if detect_tables:
        try:
            with pdfplumber.open(path) as pl:
                for pd, pg in zip(pages, pl.pages):
                    try:
                        found = pg.find_tables()
                        pd.tables = len(found)
                        pd.grids = [_grid(pg, t) for t in found]
                    except Exception:  # noqa: BLE001
                        pd.tables = 0
        except Exception:  # noqa: BLE001
            pass

    fonts, meta = _structure(path)
    return DocData(pages, font_chars, size_chars, color_chars, fonts, meta, path)


def _grid(pg, table) -> TableGrid:
    rows = []
    for row in table.rows:
        cells = []
        for c in row.cells:
            if c is None:
                cells.append(None)
                continue
            text = " ".join((pg.crop(c, strict=False).extract_text() or "").split())
            cells.append((text, tuple(round(v, 2) for v in c)))
        rows.append(cells)
    return TableGrid(tuple(round(v, 2) for v in table.bbox), rows)
