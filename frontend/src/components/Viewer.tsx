import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Layer, Rect, Stage } from "react-konva";
import { ChevronLeft, ChevronRight, EyeOff, Loader2, Pause, Play, RefreshCw, X } from "lucide-react";
import { fileUrl } from "../api";
import { CATEGORY_LABEL, SEVERITY_COLOR } from "../theme";
import type { IgnoreRegion, Issue, Job } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Mode = "side" | "slider" | "blink" | "diff";
const MODES: [Mode, string][] = [["side", "Side by side"], ["slider", "Slider"], ["blink", "Blink"], ["diff", "Diff heatmap"]];
const REGION = "#64748b";

function usePdf(url: string) {
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  useEffect(() => {
    let alive = true;
    const task = pdfjs.getDocument(url);
    task.promise.then((d) => alive && setDoc(d)).catch(() => alive && setDoc(null));
    return () => { alive = false; task.destroy(); };
  }, [url]);
  return doc;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(480);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Render one page of a PDF into a canvas at a CSS width; returns the drawn size and PDF-point scale. */
function usePage(doc: pdfjs.PDFDocumentProxy | null, page: number, width: number, canvas: RefObject<HTMLCanvasElement>) {
  const [dims, setDims] = useState({ w: 0, h: 0, scale: 1 });
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!doc) return;
    if (page > doc.numPages) { setMissing(true); return; }
    setMissing(false);
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const scale = width / base.width;
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * dpr });
      const c = canvas.current;
      if (!c || cancelled) return;
      c.width = vp.width; c.height = vp.height;
      c.style.width = `${width}px`; c.style.height = `${vp.height / dpr}px`;
      setDims({ w: width, h: vp.height / dpr, scale });
      await p.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [doc, page, width, canvas]);
  return { dims, missing };
}

interface PaneProps {
  title: string;
  url: string;
  page: number;
  issues: Issue[];
  side: "ref" | "test";
  selected: string | null;
  onSelect: (id: string | null) => void;
  show: boolean;
  regions: IgnoreRegion[];
  draw?: boolean;
  onRegion?: (bbox: number[]) => void;
}

function Pane({ title, url, page, issues, side, selected, onSelect, show, regions, draw, onRegion }: PaneProps) {
  const doc = usePdf(url);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, width] = useWidth();
  const { dims, missing } = usePage(doc, page, width, canvas);
  const [hover, setHover] = useState<Issue | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const pos = (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } }) =>
    e.target.getStage()?.getPointerPosition() ?? { x: 0, y: 0 };
  const finish = () => {
    if (drag && onRegion) {
      const [x0, x1] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
      const [y0, y1] = [Math.min(drag.y0, drag.y1), Math.max(drag.y0, drag.y1)];
      if (x1 - x0 > 4 && y1 - y0 > 4) onRegion([x0, y0, x1, y1].map((v) => Math.round((v / dims.scale) * 10) / 10));
    }
    setDrag(null);
  };

  return (
    <div ref={box} className="min-w-0">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        {title}{draw && <span className="ml-2 normal-case text-indigo-300">drag to mark an ignore region</span>}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl">
        {missing ? (
          <div className="flex h-72 items-center justify-center bg-slate-900 text-sm text-slate-400">Page not present</div>
        ) : (
          <>
            <canvas ref={canvas} className="block" />
            {dims.w > 0 && (show || draw || regions.length > 0) && (
              <div className={`absolute left-0 top-0 ${draw ? "cursor-crosshair" : ""}`}>
                <Stage width={dims.w} height={dims.h}
                  onMouseDown={(e) => { if (draw) { const p = pos(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); } }}
                  onMouseMove={(e) => { if (draw && drag) { const p = pos(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } }}
                  onMouseUp={finish} onMouseLeave={() => drag && finish()}>
                  <Layer>
                    {regions.map((r, k) => (
                      <Rect key={`r${k}`} x={r.bbox[0] * dims.scale} y={r.bbox[1] * dims.scale}
                        width={(r.bbox[2] - r.bbox[0]) * dims.scale} height={(r.bbox[3] - r.bbox[1]) * dims.scale}
                        stroke={REGION} strokeWidth={1.5} dash={[6, 4]} fill={REGION + "40"} listening={false} />
                    ))}
                    {show && issues.map((i) => {
                      const b = side === "ref" ? i.bbox_ref : i.bbox_test;
                      if (!b) return null;
                      const sel = i.id === selected;
                      const col = SEVERITY_COLOR[i.severity];
                      return (
                        <Rect key={i.id} x={b[0] * dims.scale - 1} y={b[1] * dims.scale - 1}
                          width={(b[2] - b[0]) * dims.scale + 2} height={(b[3] - b[1]) * dims.scale + 2}
                          stroke={col} strokeWidth={sel ? 3 : 1.25} fill={col + (sel ? "55" : "1f")}
                          shadowBlur={sel ? 12 : 0} shadowColor={col} listening={!draw}
                          onClick={() => onSelect(sel ? null : i.id)}
                          onMouseEnter={(e) => { setHover(i); const c = e.target.getStage()?.container(); if (c) c.style.cursor = "pointer"; }}
                          onMouseLeave={(e) => { setHover(null); const c = e.target.getStage()?.container(); if (c) c.style.cursor = "default"; }} />
                      );
                    })}
                    {drag && (
                      <Rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)}
                        height={Math.abs(drag.y1 - drag.y0)} stroke="#6366f1" strokeWidth={1.5} dash={[4, 3]} fill="#6366f133" listening={false} />
                    )}
                  </Layer>
                </Stage>
              </div>
            )}
            {hover && !draw && (
              <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-lg bg-slate-950/95 p-2 text-xs text-slate-100 shadow-xl">
                <b style={{ color: SEVERITY_COLOR[hover.severity] }}>{CATEGORY_LABEL[hover.category] ?? hover.category}</b> — {hover.message}
                {(hover.expected || hover.actual) && (
                  <div className="mt-0.5 text-slate-400">{hover.expected} {hover.expected && hover.actual && "→"} {hover.actual}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Reference and candidate stacked on top of each other: a draggable divider or a blink loop. */
function Overlay({ job, page, mode }: { job: Job; page: number; mode: "slider" | "blink" }) {
  const refDoc = usePdf(fileUrl(job.id, "reference.pdf"));
  const testDoc = usePdf(fileUrl(job.id, "candidate.pdf"));
  const refCanvas = useRef<HTMLCanvasElement>(null);
  const testCanvas = useRef<HTMLCanvasElement>(null);
  const [box, width] = useWidth();
  const w = Math.min(width, 760);
  const a = usePage(refDoc, page, w, refCanvas);
  const b = usePage(testDoc, page, w, testCanvas);
  const [split, setSplit] = useState(50);
  const [showTest, setShowTest] = useState(true);
  const [playing, setPlaying] = useState(true);
  const dragging = useRef(false);

  useEffect(() => {
    if (mode !== "blink" || !playing) return;
    const t = setInterval(() => setShowTest((v) => !v), 700);
    return () => clearInterval(t);
  }, [mode, playing]);

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };

  if (a.missing || b.missing) {
    return <div className="py-16 text-center text-sm text-slate-400">Page {page} exists in only one document — nothing to overlay.</div>;
  }
  return (
    <div ref={box}>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          {mode === "slider" ? (
            <><span>◀ Reference</span><span>Drag the divider</span><span>Candidate ▶</span></>
          ) : (
            <>
              <span>Showing: <b className={showTest ? "text-amber-300" : "text-sky-300"}>{showTest ? "Candidate" : "Reference"}</b></span>
              <div className="flex gap-1">
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setPlaying((p) => !p)}>
                  {playing ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Play</>}
                </button>
                {!playing && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setShowTest((v) => !v)}>Swap</button>}
              </div>
            </>
          )}
        </div>
        <div className="relative select-none overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl"
          style={{ height: Math.max(a.dims.h, b.dims.h) || 400, touchAction: "none", cursor: mode === "slider" ? "ew-resize" : undefined }}
          onPointerDown={(e) => { if (mode === "slider") { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e); } }}
          onPointerMove={move}
          onPointerUp={() => { dragging.current = false; }}>
          <canvas ref={refCanvas} className="absolute left-0 top-0 block" />
          <canvas ref={testCanvas} className="absolute left-0 top-0 block"
            style={mode === "slider" ? { clipPath: `inset(0 0 0 ${split}%)` } : { opacity: showTest ? 1 : 0 }} />
          {mode === "slider" && (
            <div className="pointer-events-none absolute inset-y-0" style={{ left: `${split}%` }}>
              <div className="h-full w-0.5 -translate-x-1/2 bg-indigo-500" />
              <div className="absolute top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-indigo-500 text-[10px] font-bold text-white shadow-glow">⇆</div>
            </div>
          )}
        </div>
        {mode === "slider" && (
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Reveal position" className="mt-3 w-full accent-indigo-500" />
        )}
      </div>
    </div>
  );
}

export default function Viewer({ job, issues, selected, onSelect, page, setPage, regions, setRegions, onRerun, rerunning, readOnly }: {
  job: Job; issues: Issue[]; selected: string | null; onSelect: (id: string | null) => void;
  page: number; setPage: (p: number) => void;
  regions: IgnoreRegion[]; setRegions: (r: IgnoreRegion[]) => void; onRerun: () => void; rerunning: boolean; readOnly: boolean;
}) {
  const r = job.result!;
  const [mode, setMode] = useState<Mode>("side");
  const [show, setShow] = useState(true);
  const [draw, setDraw] = useState(false);
  const [allPages, setAllPages] = useState(false);
  const total = Math.max(r.summary.pages_reference, r.summary.pages_candidate);
  const pageIssues = issues.filter((i) => i.page === page);
  const diff = r.pages.find((p) => p.page === page)?.diff_image;
  const here = regions.filter((g) => g.page === 0 || g.page === page);
  const addRegion = (bbox: number[]) => setRegions([...regions, { page: allPages ? 0 : page, bbox }]);

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="card-title">Visual inspector</div>
          <div className="text-xs text-slate-400">
            {pageIssues.length} issue(s) on this page · click a box to select
            <span className="ml-2 hidden text-slate-500 sm:inline">· <kbd className="rounded bg-white/10 px-1">j</kbd>/<kbd className="rounded bg-white/10 px-1">k</kbd> next/prev issue</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-0.5 text-xs">
            {MODES.map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 ${mode === m ? "bg-indigo-500 text-white" : "text-slate-300 hover:text-white"}`}>{label}</button>
            ))}
          </div>
          {mode === "side" && (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-indigo-500" /> Highlights
            </label>
          )}
          <div className="flex items-center gap-1">
            <button className="btn-ghost !px-2 !py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-16 text-center text-xs text-slate-300">Page {page} / {total}</span>
            <button className="btn-ghost !px-2 !py-1.5" disabled={page >= total} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {mode === "side" && !readOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
          <button onClick={() => setDraw((d) => !d)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium ${draw ? "bg-indigo-500 text-white" : "text-slate-200 hover:bg-white/10"}`}>
            <EyeOff className="h-3.5 w-3.5" /> {draw ? "Drawing… (click to stop)" : "Draw ignore region"}
          </button>
          <label className="flex items-center gap-1.5 text-slate-300">
            <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} className="accent-indigo-500" /> apply to all pages
          </label>
          {here.map((g) => {
            const k = regions.indexOf(g);
            return (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-500/20 px-2 py-0.5 text-slate-300">
                {g.page === 0 ? "All pages" : `P${g.page}`} · {Math.round(g.bbox[2] - g.bbox[0])}×{Math.round(g.bbox[3] - g.bbox[1])}pt
                <button aria-label="Remove region" className="text-slate-500 hover:text-red-300" onClick={() => setRegions(regions.filter((_, j) => j !== k))}><X className="h-3 w-3" /></button>
              </span>
            );
          })}
          <button className="btn-primary ml-auto !px-3 !py-1 text-xs" disabled={!regions.length || rerunning} onClick={onRerun}>
            {rerunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-run with {regions.length} ignore region{regions.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {mode === "side" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Pane title="Reference" url={fileUrl(job.id, "reference.pdf")} page={page} issues={pageIssues} side="ref" selected={selected} onSelect={onSelect} show={show} regions={here} />
          <Pane title="Candidate" url={fileUrl(job.id, "candidate.pdf")} page={page} issues={pageIssues} side="test" selected={selected} onSelect={onSelect} show={show}
            regions={here} draw={draw && !readOnly} onRegion={addRegion} />
        </div>
      ) : mode === "slider" || mode === "blink" ? (
        <Overlay key={mode} job={job} page={page} mode={mode} />
      ) : diff ? (
        <div className="mx-auto max-w-2xl">
          <img src={fileUrl(job.id, diff)} alt={`Visual diff page ${page}`} className="w-full rounded-xl border border-white/10 bg-white" />
          <p className="mt-2 text-center text-xs text-slate-400">Red = pixels that differ · boxes = merged difference regions</p>
        </div>
      ) : (
        <div className="py-16 text-center text-sm text-slate-400">No visual diff for this page (page missing in one document, or visual comparison disabled).</div>
      )}
    </section>
  );
}
