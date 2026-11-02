from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Category(str, Enum):
    text_missing = "text_missing"
    text_extra = "text_extra"
    text_changed = "text_changed"
    font = "font"
    font_size = "font_size"
    color = "color"
    alignment = "alignment"
    spacing = "spacing"
    margin = "margin"
    position = "position"
    page_structure = "page_structure"
    visual = "visual"
    link = "link"
    placeholder = "placeholder"
    data_format = "data_format"
    spelling = "spelling"
    table = "table"
    image = "image"
    accessibility = "accessibility"
    security = "security"
    outline = "outline"
    form_field = "form_field"
    rule = "rule"


class Severity(str, Enum):
    critical = "critical"
    major = "major"
    minor = "minor"


class IgnoreRegion(BaseModel):
    page: int = Field(0, ge=0, description="1-based page; 0 = every page")
    bbox: list[float] = Field(..., min_length=4, max_length=4, description="[x0, y0, x1, y1] in PDF points")


class CompareOptions(BaseModel):
    pos_tol: float = Field(2.0, ge=0, description="Horizontal/vertical shift tolerance (pt)")
    size_tol: float = Field(0.5, ge=0, description="Font size tolerance (pt)")
    margin_tol: float = Field(3.0, ge=0, description="Margin tolerance (pt)")
    color_tol: float = Field(24.0, ge=0, description="RGB distance tolerance")
    ignore_case: bool = False
    visual: bool = True
    dpi: int = Field(100, ge=50, le=200)
    diff_threshold: int = Field(40, ge=5, le=255)
    tables: bool = True
    highlight: bool = True
    links: bool = True
    placeholders: bool = True
    formats: bool = True
    spelling: bool = True
    table_cells: bool = True
    images: bool = True
    accessibility: bool = True
    security: bool = True
    outline_forms: bool = True
    ocr: bool = False
    must_contain: list[str] = []
    must_not_contain: list[str] = []
    ignore_regions: list[IgnoreRegion] = []


class Issue(BaseModel):
    id: str
    page: int  # 1-based; 0 = document level
    category: Category
    severity: Severity
    message: str
    bbox_ref: list[float] | None = None  # [x0, y0, x1, y1] in PDF points (top-left origin)
    bbox_test: list[float] | None = None
    expected: str | None = None
    actual: str | None = None


class PageSummary(BaseModel):
    page: int
    in_reference: bool = True
    in_candidate: bool = True
    text_similarity: float = 0.0
    ssim: float | None = None
    diff_pct: float | None = None
    issue_count: int = 0
    score: float = 0.0
    by_category: dict[str, int] = {}
    ref_size: list[float] | None = None
    test_size: list[float] | None = None
    diff_image: str | None = None


class UsageRow(BaseModel):
    name: str
    reference: int
    candidate: int


class Check(BaseModel):
    key: str
    label: str
    status: str  # pass | warn | fail
    detail: str


class Summary(BaseModel):
    overall_score: float
    text_score: float
    format_score: float
    layout_score: float
    visual_score: float | None
    verdict: str  # PASS | REVIEW | FAIL
    total_issues: int
    by_severity: dict[str, int]
    by_category: dict[str, int]
    pages_reference: int
    pages_candidate: int


class CompareResult(BaseModel):
    reference_name: str
    candidate_name: str
    summary: Summary
    pages: list[PageSummary]
    issues: list[Issue]
    insights: list[str]
    font_usage: list[UsageRow]
    size_usage: list[UsageRow]
    color_usage: list[UsageRow]
    checks: list[Check] = []
    ocr_pages: list[int] = []
    files: dict[str, Any] = {}


class RecentJob(BaseModel):
    id: str
    status: str
    reference_name: str
    candidate_name: str
    created_at: str
    score: float | None = None
    verdict: str | None = None
    issues: int | None = None


class TrendPoint(BaseModel):
    id: str
    label: str
    score: float
    issues: int
    verdict: str


class DailyPoint(BaseModel):
    date: str  # YYYY-MM-DD (UTC)
    comparisons: int
    differences: int


class StorageUsage(BaseModel):
    bytes: int
    documents: int  # uploaded PDFs (2 per comparison) + saved references
    reports: int


class Stats(BaseModel):
    total: int
    completed: int
    failed: int
    avg_score: float
    pass_rate: float
    total_issues: int
    verdicts: dict[str, int]
    severities: dict[str, int]
    categories: dict[str, int]
    dimensions: dict[str, float]
    trend: list[TrendPoint]
    recent: list[RecentJob]
    daily: list[DailyPoint] = []
    storage: StorageUsage | None = None


class ReferenceOut(BaseModel):
    id: str
    name: str
    size: int
    created_at: str


class BatchOut(BaseModel):
    batch_id: str
    jobs: list[RecentJob]


class JobOut(BaseModel):
    id: str
    status: str
    reference_name: str
    candidate_name: str
    error: str | None = None
    created_at: str
    finished_at: str | None = None
    options: dict | None = None
    result: CompareResult | None = None
