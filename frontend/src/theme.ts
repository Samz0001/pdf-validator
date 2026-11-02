import type { Category, Severity } from "./types";

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#c2412d",
  major: "#8b5cf6",
  minor: "#2f86e0",
};

export const VERDICT_STYLE = {
  PASS: { color: "#3d8b5f", label: "Passed", tint: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" },
  REVIEW: { color: "#cf8f1e", label: "Needs review", tint: "bg-amber-500/10 border-amber-500/30 text-amber-300" },
  FAIL: { color: "#c2412d", label: "Failed", tint: "bg-red-500/10 border-red-500/30 text-red-300" },
} as const;

export const CATEGORY_LABEL: Record<Category, string> = {
  text_missing: "Missing text",
  text_extra: "Extra text",
  text_changed: "Changed text",
  font: "Font",
  font_size: "Font size",
  color: "Colour",
  alignment: "Alignment",
  spacing: "Spacing",
  margin: "Margins",
  position: "Position",
  page_structure: "Page structure",
  visual: "Visual",
  link: "Hyperlink",
  placeholder: "Placeholder",
  data_format: "Data format",
  spelling: "Spelling",
  table: "Table cells",
  image: "Images",
  accessibility: "Accessibility",
  security: "Security",
  outline: "Bookmarks",
  form_field: "Form fields",
  rule: "Custom rule",
};

export const CATEGORY_COLOR: Record<Category, string> = {
  text_missing: "#f43f5e",
  text_extra: "#fb7185",
  text_changed: "#f59e0b",
  font: "#8b5cf6",
  font_size: "#a78bfa",
  color: "#ec4899",
  alignment: "#06b6d4",
  spacing: "#22d3ee",
  margin: "#14b8a6",
  position: "#38bdf8",
  page_structure: "#6366f1",
  visual: "#94a3b8",
  link: "#3b82f6",
  placeholder: "#dc2626",
  data_format: "#84cc16",
  spelling: "#facc15",
  table: "#0ea5e9",
  image: "#d946ef",
  accessibility: "#10b981",
  security: "#b91c1c",
  outline: "#7c3aed",
  form_field: "#f97316",
  rule: "#e11d48",
};

export const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);

/* ---- chart families: 21 categories fold into 6 groups so charts never need more than 6 hues ---- */
export type Family = "text" | "format" | "layout" | "structure" | "visual" | "compliance";

export const FAMILIES: { key: Family; label: string; cats: Category[] }[] = [
  { key: "text", label: "Text & content", cats: ["text_missing", "text_extra", "text_changed", "spelling", "placeholder"] },
  { key: "format", label: "Formatting", cats: ["font", "font_size", "color"] },
  { key: "layout", label: "Layout", cats: ["alignment", "spacing", "margin", "position"] },
  { key: "structure", label: "Structure & links", cats: ["page_structure", "table", "outline", "form_field", "link"] },
  { key: "visual", label: "Visual & images", cats: ["visual", "image"] },
  { key: "compliance", label: "Compliance & data", cats: ["data_format", "accessibility", "security", "rule"] },
];

// Fixed categorical order, validated (CVD + normal-vision, incl. donut wrap-around) for each theme's surface.
const FAMILY_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
const FAMILY_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

export const familyOf = (c: string): Family => FAMILIES.find((f) => f.cats.includes(c as Category))?.key ?? "visual";

export function familyColor(f: Family, light: boolean): string {
  return (light ? FAMILY_LIGHT : FAMILY_DARK)[FAMILIES.findIndex((x) => x.key === f)];
}

/** Two-series comparisons (reference vs candidate, score lines) use the first slots of the same order. */
export const seriesColor = (i: number, light: boolean) => (light ? FAMILY_LIGHT : FAMILY_DARK)[i];

export const STATUS_COLOR = { pass: "#3d8b5f", warn: "#cf8f1e", fail: "#c2412d" } as const;
