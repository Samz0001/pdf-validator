import { ArrowRight, Files, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getBatch } from "../api";
import { VERDICT_STYLE } from "../theme";
import type { Batch } from "../types";

const pending = (b: Batch) => b.jobs.some((j) => j.status === "queued" || j.status === "running");

export default function BatchView({ id, onOpen }: { id: string; onOpen: (jobId: string) => void }) {
  const [b, setB] = useState<Batch | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const next = await getBatch(id);
        if (!alive) return;
        setB(next);
        if (pending(next)) timer = setTimeout(tick, 1200);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);

  if (err) return <div role="alert" className="card text-sm text-red-300">{err}</div>;
  if (!b) return <div className="skeleton h-48" />;

  const done = b.jobs.filter((j) => j.status === "done");
  const count = (v: "PASS" | "REVIEW" | "FAIL") => done.filter((j) => j.verdict === v).length;
  const avg = done.length ? done.reduce((s, j) => s + (j.score ?? 0), 0) / done.length : null;

  return (
    <section className="card animate-fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Files className="h-5 w-5 text-indigo-300" />
          <div>
            <div className="card-title">Batch validation</div>
            <div className="text-xs text-slate-400">{b.jobs[0]?.reference_name ?? "Reference"} vs {b.jobs.length} document(s)</div>
          </div>
        </div>
        {pending(b) && <span className="flex items-center gap-2 text-xs text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> {done.length}/{b.jobs.length} done</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([["Documents", String(b.jobs.length), undefined], ["Average score", avg == null ? "–" : `${Math.round(avg * 100)}%`, undefined],
          ["Passed", String(count("PASS")), VERDICT_STYLE.PASS.color], ["Review", String(count("REVIEW")), VERDICT_STYLE.REVIEW.color],
          ["Failed", String(count("FAIL") + b.jobs.filter((j) => j.status === "failed").length), VERDICT_STYLE.FAIL.color]] as const).map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="font-serif text-[1.8rem] leading-none text-white" style={{ color }}>{value}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900 text-slate-400">
            <tr>{["Document", "Status", "Score", "Verdict", "Issues", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {b.jobs.map((j) => {
              const v = j.verdict ? VERDICT_STYLE[j.verdict] : null;
              const ok = j.status === "done";
              return (
                <tr key={j.id} onClick={() => ok && onOpen(j.id)} className={`border-t border-white/5 ${ok ? "cursor-pointer hover:bg-white/5" : ""}`}>
                  <td className="max-w-72 truncate px-3 py-2.5 text-slate-200" title={j.candidate_name}>{j.candidate_name}</td>
                  <td className="px-3 py-2.5 text-slate-400">
                    {j.status === "queued" || j.status === "running" ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {j.status}</span>
                      : <span className={j.status === "failed" ? "text-red-300" : ""}>{j.status}</span>}
                  </td>
                  <td className="w-40 px-3 py-2.5">
                    {j.score != null ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${j.score * 100}%`, background: v?.color }} /></div>
                        <span className="w-8 text-right text-slate-200">{Math.round(j.score * 100)}%</span>
                      </div>
                    ) : <span className="text-slate-500">–</span>}
                  </td>
                  <td className="px-3 py-2.5">{v && <span className={`chip border ${v.tint}`}>{v.label}</span>}</td>
                  <td className="px-3 py-2.5 text-slate-300">{j.issues ?? "–"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {ok && <button className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Open" onClick={(e) => { e.stopPropagation(); onOpen(j.id); }}><ArrowRight className="h-4 w-4" /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
