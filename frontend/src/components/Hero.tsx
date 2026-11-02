import {
  AlignLeft, ArrowRight, BarChart3, FileText, Highlighter, Layers, Palette, Play, Ruler, ScanEye, Sparkles, Type, Upload, Zap,
} from "lucide-react";

const FEATURES = [
  { icon: FileText, title: "Text & content", body: "Missing, extra and changed lines, matched in reading order.", c: "#f43f5e" },
  { icon: Type, title: "Fonts & sizes", body: "Font substitution, bold/italic and point-size drift per line.", c: "#8b5cf6" },
  { icon: Palette, title: "Colours", body: "Text colour differences with an adjustable RGB tolerance.", c: "#ec4899" },
  { icon: AlignLeft, title: "Alignment & spacing", body: "Left / centre / right plus line-spacing changes.", c: "#06b6d4" },
  { icon: Ruler, title: "Margins & position", body: "Page margins and element shifts measured in points.", c: "#14b8a6" },
  { icon: Layers, title: "Page structure", body: "Page count, size, rotation, images, tables and shapes.", c: "#6366f1" },
  { icon: ScanEye, title: "Visual diff", body: "SSIM score and a pixel heatmap with merged difference regions.", c: "#f59e0b" },
  { icon: Highlighter, title: "Highlights & reports", body: "Annotated PDF, PDF report with charts, and JSON export.", c: "#10b981" },
];

const STEPS = [
  { n: "1", title: "Upload", body: "Drop the reference PDF and the customized PDF." },
  { n: "2", title: "Analyse", body: "Text, formatting, layout and pixels are compared automatically." },
  { n: "3", title: "Review", body: "Explore scores, charts, a side-by-side inspector and a filterable issue list." },
];

function Sheet({ flagged }: { flagged?: boolean }) {
  const bars = [78, 92, 64, 88, 70, 84, 56];
  return (
    <div className="relative h-60 w-44 rounded-lg bg-white p-4 shadow-2xl shadow-black/40 sm:h-72 sm:w-52">
      <div className="mb-3 h-3 w-24 rounded bg-slate-800" style={flagged ? { background: "#dc2626", width: "7.5rem", height: "0.9rem" } : undefined} />
      <div className="space-y-2.5">
        {bars.map((w, i) => (
          <div key={i} className="h-1.5 rounded bg-slate-300" style={{ width: `${flagged && i === 4 ? 0 : flagged && i === 2 ? w - 18 : w}%`, marginLeft: flagged && i === 5 ? 10 : 0 }} />
        ))}
      </div>
      <div className="mt-5 h-10 rounded border border-slate-300" />
      {flagged && (
        <>
          <span className="pulse-box absolute left-3 top-3 h-6 w-32 rounded border-2 border-red-500 bg-red-500/10" />
          <span className="pulse-box absolute left-3 top-[8.4rem] h-3.5 w-36 rounded border-2 border-amber-500 bg-amber-500/10 sm:top-[9.7rem]" />
          <span className="absolute -right-3 top-24 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-red-300 shadow-lg ring-1 ring-red-400/40">
            12pt → 14pt
          </span>
        </>
      )}
    </div>
  );
}

export default function Hero({ onDemo, onUpload, busy }: { onDemo: () => void; onUpload: () => void; busy: boolean }) {
  return (
    <div className="space-y-20">
      <section className="grid items-center gap-10 pt-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="animate-fade-up">
          <span className="chip border border-indigo-400/30 bg-indigo-500/10 text-indigo-200">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Text · fonts · layout · visuals
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Catch every difference between <span className="text-gradient">two PDFs</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
            Compare a customized document against its reference. Get a similarity score, interactive charts, a side-by-side
            inspector with highlighted changes, and a report you can share.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button className="btn-primary !px-6 !py-3 text-base" onClick={onDemo} disabled={busy}>
              <Play className="h-4 w-4" /> Try with sample PDFs
            </button>
            <button className="btn-ghost !px-6 !py-3 text-base" onClick={onUpload}>
              <Upload className="h-4 w-4" /> Upload your own <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-400" /> Results in seconds</span>
            <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-emerald-400" /> 12 issue types</span>
            <span className="flex items-center gap-1.5"><Highlighter className="h-3.5 w-3.5 text-indigo-400" /> Highlighted PDF output</span>
          </div>
        </div>

        <div className="group relative mx-auto flex items-center justify-center gap-5 py-6" aria-hidden>
          <div className="absolute inset-0 -z-10 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="animate-float-slow transition duration-500 group-hover:-rotate-3 group-hover:-translate-x-2"><Sheet /></div>
          <div className="animate-float transition duration-500 group-hover:rotate-3 group-hover:translate-x-2"><Sheet flagged /></div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-2 text-center shadow-xl backdrop-blur">
            <div className="text-2xl font-extrabold text-amber-400">81%</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">needs review</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-center text-2xl font-bold text-white">Everything it checks</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-400">Eight validation areas, each with adjustable tolerances.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card lift animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl" style={{ background: f.c + "22", color: f.c }}>
                <f.icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-white">{f.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-center text-2xl font-bold text-white">How it works</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card lift flex gap-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-500 text-lg font-bold text-white shadow-glow">{s.n}</div>
              <div>
                <div className="font-semibold text-white">{s.title}</div>
                <p className="mt-1 text-sm text-slate-400">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
