import { ArrowRight, Trash2 } from "lucide-react";
import { deleteJob } from "../api";
import { VERDICT_STYLE } from "../theme";
import type { RecentJob } from "../types";

/** Table of comparisons: documents, date, score bar, verdict, issues, open/delete. */
export default function RecentTable({ rows, onOpen, onChanged }: { rows: RecentJob[]; onOpen: (id: string) => void; onChanged: () => void }) {
  if (!rows.length) return <div className="py-10 text-center text-sm text-slate-500">No comparisons match.</div>;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-900 text-slate-400">
          <tr>{["Documents", "When", "Score", "Verdict", "Issues", ""].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = r.verdict ? VERDICT_STYLE[r.verdict] : null;
            const done = r.status === "done";
            return (
              <tr key={r.id} onClick={() => done && onOpen(r.id)}
                className={`border-t border-white/5 ${done ? "cursor-pointer hover:bg-white/5" : "opacity-70"}`}>
                <td className="max-w-72 truncate px-3 py-2.5 text-slate-200" title={`${r.reference_name} ↔ ${r.candidate_name}`}>
                  <span className="font-medium">{r.candidate_name}</span> <span className="text-slate-500">vs {r.reference_name}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">
                  {new Date(r.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="w-40 px-3 py-2.5">
                  {r.score != null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${r.score * 100}%`, background: v?.color }} /></div>
                      <span className="w-8 text-right text-slate-200">{Math.round(r.score * 100)}%</span>
                    </div>
                  ) : <span className="text-slate-500">{r.status}</span>}
                </td>
                <td className="px-3 py-2.5">{v && <span className={`chip border ${v.tint}`}>{v.label}</span>}</td>
                <td className="px-3 py-2.5 text-slate-300">{r.issues ?? "–"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <button className="mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Open"
                    onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}><ArrowRight className="h-4 w-4" /></button>
                  <button className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/15 hover:text-red-300" aria-label="Delete comparison"
                    onClick={async (e) => { e.stopPropagation(); await deleteJob(r.id); onChanged(); }}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
