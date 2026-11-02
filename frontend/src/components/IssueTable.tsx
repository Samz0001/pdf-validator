import { Check, RotateCcw, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { fingerprint } from "../accepted";
import { CATEGORY_COLOR, CATEGORY_LABEL, SEVERITY_COLOR } from "../theme";
import type { Category, Issue, Severity } from "../types";

export interface Filters {
  severity: Severity | "all"; category: Category | "all"; page: "all" | number; q: string; status: "all" | "open" | "accepted";
}

export function applyFilters(issues: Issue[], f: Filters, accepted: Set<string>) {
  const q = f.q.trim().toLowerCase();
  return issues.filter(
    (i) =>
      (f.severity === "all" || i.severity === f.severity) &&
      (f.category === "all" || i.category === f.category) &&
      (f.page === "all" || i.page === f.page) &&
      (f.status === "all" || (f.status === "accepted") === accepted.has(fingerprint(i))) &&
      (!q || `${i.message} ${i.expected ?? ""} ${i.actual ?? ""}`.toLowerCase().includes(q)),
  );
}

const sel = "rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-400";

export default function IssueTable({ issues, all, filters, setFilters, selected, onSelect, pages, accepted, onToggleAccept, readOnly }: {
  issues: Issue[]; all: Issue[]; filters: Filters; setFilters: (f: Filters) => void;
  selected: string | null; onSelect: (i: Issue) => void; pages: number[];
  accepted: Set<string>; onToggleAccept: (i: Issue) => void; readOnly: boolean;
}) {
  const cats = Array.from(new Set(all.map((i) => i.category)));
  const open = all.filter((i) => !accepted.has(fingerprint(i))).length;
  const body = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    body.current?.querySelector(`[data-id="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="card-title">Detected issues</div>
          <div className="text-xs text-slate-400">
            Showing {issues.length} of {all.length} · <span className="text-slate-200">{open} open</span>, {all.length - open} accepted
            <span className="ml-2 hidden text-slate-500 sm:inline">· <kbd className="rounded bg-white/10 px-1">j</kbd>/<kbd className="rounded bg-white/10 px-1">k</kbd> to move, Enter to inspect</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-500" />
            <input className={`${sel} pl-7`} placeholder="Search…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </div>
          <select className={sel} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters["status"] })}>
            <option value="all">Show: all</option>
            <option value="open">Show: open</option>
            <option value="accepted">Show: accepted</option>
          </select>
          <select className={sel} value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value as Filters["severity"] })}>
            <option value="all">All severities</option>
            {(["critical", "major", "minor"] as Severity[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={sel} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value as Filters["category"] })}>
            <option value="all">All categories</option>
            {cats.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>)}
          </select>
          <select className={sel} value={String(filters.page)} onChange={(e) => setFilters({ ...filters, page: e.target.value === "all" ? "all" : Number(e.target.value) })}>
            <option value="all">All pages</option>
            {pages.map((p) => <option key={p} value={p}>Page {p}</option>)}
          </select>
        </div>
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr>{["Page", "Severity", "Category", "Details", "Expected", "Actual", ""].map((h, k) => <th key={k} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody ref={body}>
            {issues.slice(0, 500).map((i) => {
              const ok = accepted.has(fingerprint(i));
              const color = CATEGORY_COLOR[i.category] ?? "#6366f1";
              return (
                <tr key={i.id} data-id={i.id} onClick={() => onSelect(i)}
                  className={`cursor-pointer border-t border-white/5 hover:bg-white/5 ${selected === i.id ? "bg-indigo-500/15" : ""} ${ok ? "opacity-45" : ""}`}>
                  <td className="px-3 py-2 text-slate-300">{i.page || "Doc"}</td>
                  <td className="px-3 py-2">
                    <span className="chip" style={{ background: SEVERITY_COLOR[i.severity] + "22", color: SEVERITY_COLOR[i.severity] }}>{i.severity}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="chip" style={{ background: color + "22", color }}>{CATEGORY_LABEL[i.category] ?? i.category}</span>
                  </td>
                  <td className={`px-3 py-2 text-slate-200 ${ok ? "line-through" : ""}`}>{i.message}</td>
                  <td className="max-w-48 truncate px-3 py-2 font-mono text-slate-400" title={i.expected ?? ""}>{i.expected}</td>
                  <td className="max-w-48 truncate px-3 py-2 font-mono text-slate-400" title={i.actual ?? ""}>{i.actual}</td>
                  <td className="px-2 py-2 text-right">
                    {!readOnly && (
                      <button title={ok ? "Re-open issue" : "Accept / mark as false positive"} aria-label={ok ? "Re-open issue" : "Accept issue"}
                        onClick={(e) => { e.stopPropagation(); onToggleAccept(i); }}
                        className={`rounded-lg p-1.5 ${ok ? "text-slate-400 hover:bg-white/10 hover:text-white" : "text-emerald-400 hover:bg-emerald-500/15"}`}>
                        {ok ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {issues.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">No issues match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
