import { CATEGORY_LABEL } from "./theme";
import type { Issue } from "./types";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Download issues as CSV (with a BOM so Excel picks up UTF-8). */
export function downloadIssuesCsv(issues: Issue[], name: string, accepted: Set<string>, fp: (i: Issue) => string) {
  const head = ["ID", "Page", "Severity", "Category", "Message", "Expected", "Actual", "Status", "Ref bbox", "Candidate bbox"];
  const rows = issues.map((i) => [
    i.id, i.page || "Doc", i.severity, CATEGORY_LABEL[i.category] ?? i.category, i.message, i.expected, i.actual,
    accepted.has(fp(i)) ? "accepted" : "open", i.bbox_ref?.join(" "), i.bbox_test?.join(" "),
  ]);
  const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
