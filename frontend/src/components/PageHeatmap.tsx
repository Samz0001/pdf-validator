import type { PageSummary } from "../types";

function tone(score: number): string {
  // red -> amber -> green on the 0.6..1.0 range
  const t = Math.max(0, Math.min(1, (score - 0.6) / 0.4));
  const hue = Math.round(t * 140);
  return `hsl(${hue} 70% 45%)`;
}

export default function PageHeatmap({ pages, onOpen }: { pages: PageSummary[]; onOpen: (page: number) => void }) {
  return (
    <section className="card">
      <div className="card-title">Page heatmap</div>
      <div className="card-sub">Colour = page score. Click a page to inspect it.</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
        {pages.map((p, i) => {
          const missing = !p.in_reference || !p.in_candidate;
          const c = missing ? "#64748b" : tone(p.score);
          return (
            <button
              key={p.page}
              onClick={() => onOpen(p.page)}
              title={`Page ${p.page}: ${Math.round(p.score * 100)}% · ${p.issue_count} issue(s)`}
              className="lift animate-pop rounded-xl border border-white/10 p-3 text-left"
              style={{ background: `linear-gradient(160deg, ${c}33, ${c}0d)`, animationDelay: `${Math.min(i, 30) * 25}ms` }}
            >
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Page {p.page}</div>
              <div className="mt-1 font-serif text-2xl leading-none" style={{ color: c }}>{missing ? "—" : `${Math.round(p.score * 100)}%`}</div>
              <div className="mt-1 text-[11px] text-slate-300">{missing ? (p.in_candidate ? "extra page" : "missing page") : `${p.issue_count} issue${p.issue_count === 1 ? "" : "s"}`}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
