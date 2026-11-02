import { Download, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getHistory } from "../api";
import type { RecentJob } from "../types";
import RecentTable from "./RecentTable";

type Verdict = "all" | "PASS" | "REVIEW" | "FAIL" | "pending";
const sel = "rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-400";

function csv(rows: RecentJob[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Created", "Reference", "Candidate", "Status", "Score", "Verdict", "Issues"].map(esc).join(",")]
    .concat(rows.map((r) => [r.created_at, r.reference_name, r.candidate_name, r.status,
      r.score != null ? Math.round(r.score * 100) + "%" : "", r.verdict ?? "", r.issues ?? ""].map(esc).join(",")));
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "comparison-history.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export default function HistoryView({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<RecentJob[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState<Verdict>("all");

  const load = useCallback(() => { getHistory().then(setRows).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (!t || `${r.reference_name} ${r.candidate_name}`.toLowerCase().includes(t)) &&
      (verdict === "all" || (verdict === "pending" ? !r.verdict : r.verdict === verdict)));
  }, [rows, q, verdict]);

  const counts = useMemo(() => {
    const c = { PASS: 0, REVIEW: 0, FAIL: 0 };
    for (const r of rows ?? []) if (r.verdict) c[r.verdict]++;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Archive</div>
        <h2 className="page-title mt-1">History</h2>
        <p className="mt-1 text-sm text-slate-400">
          {rows ? `${rows.length} comparisons · ${counts.PASS} passed · ${counts.REVIEW} need review · ${counts.FAIL} failed` : "Loading…"}
        </p>
      </div>
      <section className="card">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input className={`${sel} w-full pl-8`} placeholder="Search by file name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={sel} value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict)} aria-label="Filter by verdict">
            <option value="all">All verdicts</option>
            <option value="PASS">Passed</option>
            <option value="REVIEW">Needs review</option>
            <option value="FAIL">Failed</option>
            <option value="pending">Running / errored</option>
          </select>
          <button className="btn-ghost !px-3 !py-1.5 !text-xs" disabled={!shown.length} onClick={() => csv(shown)}><Download className="h-3.5 w-3.5" /> CSV</button>
        </div>
        {err ? <div role="alert" className="text-sm text-red-300">{err}</div>
          : rows == null ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10" />)}</div>
          : <RecentTable rows={shown} onOpen={onOpen} onChanged={load} />}
      </section>
    </div>
  );
}
