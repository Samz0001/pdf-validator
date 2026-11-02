import { Check, Download, FileSpreadsheet, FileText, Highlighter, Link2, ScanText } from "lucide-react";
import { useState } from "react";
import { fileUrl } from "../api";
import { VERDICT_STYLE, pct } from "../theme";
import type { Job } from "../types";

function Ring({ value, color }: { value: number; color: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" className="h-32 w-32 shrink-0 -rotate-90">
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - value)} style={{ transition: "stroke-dashoffset .8s ease" }} />
      <text x="64" y="64" textAnchor="middle" dominantBaseline="central" transform="rotate(90 64 64)"
        className="fill-white font-serif text-[30px]">{Math.round(value * 100)}</text>
    </svg>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="font-serif text-[1.65rem] leading-tight text-white" style={{ color: accent }}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

export default function Overview({ job, onCsv }: { job: Job; onCsv: () => void }) {
  const r = job.result!;
  const s = r.summary;
  const v = VERDICT_STYLE[s.verdict];
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${location.origin}${location.pathname}#job=${job.id}&share=1`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <section className="card">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex items-center gap-5">
          <Ring value={s.overall_score} color={v.color} />
          <div>
            <span className={`chip border ${v.tint}`}>{v.label}</span>
            <h2 className="mt-2 font-serif text-2xl text-white">Overall similarity</h2>
            <p className="mt-1 max-w-xs truncate text-xs text-slate-400">{r.reference_name} ↔ {r.candidate_name}</p>
            <p className="text-xs text-slate-500">{s.pages_reference} vs {s.pages_candidate} pages</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Tile label="Text" value={pct(s.text_score)} />
          <Tile label="Formatting" value={pct(s.format_score)} />
          <Tile label="Layout" value={pct(s.layout_score)} />
          <Tile label="Visual" value={pct(s.visual_score)} />
          <Tile label="Critical / Major" value={`${s.by_severity.critical} / ${s.by_severity.major}`} accent={s.by_severity.critical ? "#ef4444" : undefined} />
          <Tile label="Total issues" value={String(s.total_issues)} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 border-t border-white/10 pt-5 lg:grid-cols-[1fr_auto]">
        <ul className="space-y-2 text-sm text-slate-300">
          {r.insights.map((t, i) => (
            <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />{t}</li>
          ))}
          {r.ocr_pages?.length ? (
            <li className="flex items-center gap-2 text-xs text-sky-300">
              <ScanText className="h-3.5 w-3.5 shrink-0" /> OCR was used on page(s) {r.ocr_pages.join(", ")}; text positions there are approximate.
            </li>
          ) : null}
        </ul>
        <div className="flex flex-wrap content-start gap-2">
          <a className="btn-primary" href={fileUrl(job.id, "report.pdf", true)}><FileText className="h-4 w-4" /> Report (PDF)</a>
          {r.files.highlighted ? (
            <a className="btn-ghost" href={fileUrl(job.id, "highlighted.pdf", true)}><Highlighter className="h-4 w-4" /> Highlighted PDF</a>
          ) : null}
          <a className="btn-ghost" href={fileUrl(job.id, "result.json", true)}><Download className="h-4 w-4" /> JSON</a>
          <button className="btn-ghost" onClick={onCsv}><FileSpreadsheet className="h-4 w-4" /> Issues CSV</button>
          <button className="btn-ghost" onClick={share}>
            {copied ? <><Check className="h-4 w-4 text-emerald-400" /> Link copied</> : <><Link2 className="h-4 w-4" /> Copy share link</>}
          </button>
        </div>
      </div>
    </section>
  );
}
