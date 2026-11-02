export type Severity = "critical" | "major" | "minor";
export type Category =
  | "text_missing" | "text_extra" | "text_changed" | "font" | "font_size" | "color"
  | "alignment" | "spacing" | "margin" | "position" | "page_structure" | "visual" | "link" | "placeholder"
  | "data_format" | "spelling" | "table" | "image" | "accessibility" | "security" | "outline" | "form_field" | "rule";

export interface Issue {
  id: string;
  page: number;
  category: Category;
  severity: Severity;
  message: string;
  bbox_ref: number[] | null;
  bbox_test: number[] | null;
  expected: string | null;
  actual: string | null;
}

export interface PageSummary {
  page: number;
  in_reference: boolean;
  in_candidate: boolean;
  text_similarity: number;
  ssim: number | null;
  diff_pct: number | null;
  issue_count: number;
  score: number;
  by_category: Record<string, number>;
  ref_size: number[] | null;
  test_size: number[] | null;
  diff_image: string | null;
}

export interface UsageRow { name: string; reference: number; candidate: number }

export interface Check { key: string; label: string; status: "pass" | "warn" | "fail"; detail: string }

export interface Summary {
  overall_score: number;
  text_score: number;
  format_score: number;
  layout_score: number;
  visual_score: number | null;
  verdict: "PASS" | "REVIEW" | "FAIL";
  total_issues: number;
  by_severity: Record<Severity, number>;
  by_category: Record<string, number>;
  pages_reference: number;
  pages_candidate: number;
}

export interface CompareResult {
  reference_name: string;
  candidate_name: string;
  summary: Summary;
  pages: PageSummary[];
  issues: Issue[];
  insights: string[];
  font_usage: UsageRow[];
  size_usage: UsageRow[];
  color_usage: UsageRow[];
  checks?: Check[];
  ocr_pages?: number[];
  files: Record<string, unknown>;
}

export interface Job {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  reference_name: string;
  candidate_name: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  result: CompareResult | null;
  options?: Partial<Options> | null;
}

export interface Options {
  pos_tol: number;
  size_tol: number;
  margin_tol: number;
  color_tol: number;
  ignore_case: boolean;
  visual: boolean;
  dpi: number;
  tables: boolean;
  highlight: boolean;
  links: boolean;
  placeholders: boolean;
  formats: boolean;
  spelling: boolean;
  table_cells: boolean;
  images: boolean;
  accessibility: boolean;
  security: boolean;
  outline_forms: boolean;
  ocr: boolean;
  must_contain: string[];
  must_not_contain: string[];
  ignore_regions: IgnoreRegion[];
}

export interface IgnoreRegion { page: number; bbox: number[] }

export const DEFAULT_OPTIONS: Options = {
  pos_tol: 2, size_tol: 0.5, margin_tol: 3, color_tol: 24,
  ignore_case: false, visual: true, dpi: 100, tables: true, highlight: true, links: true, placeholders: true,
  formats: true, spelling: true, table_cells: true, images: true, accessibility: true, security: true, outline_forms: true,
  ocr: false, must_contain: [], must_not_contain: [], ignore_regions: [],
};

export interface RecentJob {
  id: string;
  status: string;
  reference_name: string;
  candidate_name: string;
  created_at: string;
  score: number | null;
  verdict: "PASS" | "REVIEW" | "FAIL" | null;
  issues: number | null;
}

export interface TrendPoint { id: string; label: string; score: number; issues: number; verdict: string }

export interface Stats {
  total: number;
  completed: number;
  failed: number;
  avg_score: number;
  pass_rate: number;
  total_issues: number;
  verdicts: Record<"PASS" | "REVIEW" | "FAIL", number>;
  severities: Record<Severity, number>;
  categories: Record<string, number>;
  dimensions: Record<"text" | "format" | "layout" | "visual", number>;
  trend: TrendPoint[];
  recent: RecentJob[];
  daily?: DailyPoint[];
  storage?: StorageUsage | null;
}

export interface DailyPoint { date: string; comparisons: number; differences: number }
export interface StorageUsage { bytes: number; documents: number; reports: number }

export interface Reference { id: string; name: string; size: number; created_at: string }
export interface Batch { batch_id: string; jobs: RecentJob[] }
