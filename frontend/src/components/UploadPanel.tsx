import { BookMarked, ExternalLink, Files, FileText, Library, Loader2, Save, Settings2, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deleteReference, listReferences, saveReference, type RefSource } from "../api";
import { load, save } from "../storage";
import { DEFAULT_OPTIONS, type Options, type Reference } from "../types";

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

function Drop({ label, hint, files, multiple, onFiles }: {
  label: string; hint: string; files: File[]; multiple?: boolean; onFiles: (f: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const accept = (list?: FileList | null) => {
    const pdfs = Array.from(list ?? []).filter(isPdf);
    if (pdfs.length) onFiles(multiple ? [...files, ...pdfs] : pdfs.slice(0, 1));
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files); }}
      onClick={() => input.current?.click()}
      className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition
        ${over ? "border-indigo-400 bg-indigo-500/10" : files.length ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/15 hover:border-indigo-400/60 hover:bg-white/5"}`}
    >
      <input ref={input} type="file" accept="application/pdf" multiple={multiple} hidden
        onChange={(e) => { accept(e.target.files); e.target.value = ""; }} />
      {files.length === 1 && !multiple ? (
        <div className="flex items-center justify-center gap-3">
          <FileText className="h-8 w-8 text-emerald-400" />
          <div className="min-w-0 text-left">
            <div className="truncate text-sm font-medium text-slate-100">{files[0].name}</div>
            <div className="text-xs text-slate-400">{kb(files[0].size)} · {label}</div>
          </div>
          <button className="ml-2 rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={(e) => { e.stopPropagation(); onFiles([]); }} aria-label="Remove file"><X className="h-4 w-4" /></button>
        </div>
      ) : files.length ? (
        <div className="text-left" onClick={(e) => e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-100">
            <span className="flex items-center gap-2"><Files className="h-4 w-4 text-emerald-400" /> {files.length} candidate PDFs</span>
            <button className="text-xs font-normal text-indigo-300 hover:underline" onClick={() => input.current?.click()}>Add more</button>
          </div>
          <ul className="max-h-32 space-y-1 overflow-auto text-xs">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1">
                <span className="truncate text-slate-200">{f.name}</span>
                <button className="text-slate-400 hover:text-white" aria-label={`Remove ${f.name}`}
                  onClick={() => onFiles(files.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <Upload className="mx-auto mb-2 h-7 w-7 text-slate-400 transition group-hover:text-indigo-300" />
          <div className="text-sm font-semibold text-slate-100">{label}</div>
          <div className="mt-1 text-xs text-slate-400">{hint}</div>
        </>
      )}
    </div>
  );
}

function Num({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input type="number" min={0} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-400" />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
      <span className="text-slate-200">{label}</span>
      <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${value ? "bg-indigo-500" : "bg-slate-600"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition left-0.5 ${value ? "translate-x-4" : ""}`} />
      </button>
    </label>
  );
}

// ---- presets -------------------------------------------------------------------
interface Preset { name: string; opts: Partial<Options>; custom?: boolean }
const BUILTIN: Preset[] = [
  { name: "Strict print", opts: { pos_tol: 0.5, size_tol: 0.1, margin_tol: 1, color_tol: 8, dpi: 150, ignore_case: false } },
  { name: "Balanced", opts: { ...DEFAULT_OPTIONS } },
  { name: "Loose web", opts: { pos_tol: 6, size_tol: 1, margin_tol: 10, color_tol: 48, dpi: 80, ignore_case: true } },
];
const PRESET_KEY = "pdfv.presets";

const TOGGLES: [keyof Options, string][] = [
  ["visual", "Visual comparison"], ["ignore_case", "Ignore text case"], ["highlight", "Highlighted PDF"],
  ["links", "Check hyperlinks"], ["placeholders", "Find unfilled placeholders"], ["formats", "Dates, amounts & IDs format"],
  ["spelling", "Spell-check changed text"], ["table_cells", "Compare table cells"], ["images", "Image quality & swaps"],
  ["accessibility", "Accessibility"], ["security", "Security & metadata"], ["outline_forms", "Bookmarks & form fields"],
  ["ocr", "OCR scanned pages"],
];

const lines = (t: string) => t.split("\n").map((s) => s.trim()).filter(Boolean);

export default function UploadPanel({ busy, onSubmit, onBatch }: {
  busy: boolean;
  onSubmit: (r: RefSource, c: File, o: Options) => void;
  onBatch: (r: RefSource, c: File[], o: Options) => void;
}) {
  const [ref, setRef] = useState<File[]>([]);
  const [libRef, setLibRef] = useState<Reference | null>(null);
  const [cands, setCands] = useState<File[]>([]);
  const [batch, setBatch] = useState(false);
  const [opts, setOpts] = useState<Options>(DEFAULT_OPTIONS);
  const [must, setMust] = useState("");
  const [mustNot, setMustNot] = useState("");
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<Preset[]>(() => load<Preset[]>(PRESET_KEY, []));
  const [preset, setPreset] = useState("Balanced");
  const [lib, setLib] = useState<Reference[] | null>(null);
  const [libErr, setLibErr] = useState<string | null>(null);
  const [showLib, setShowLib] = useState(false);
  const set = <K extends keyof Options>(k: K, v: Options[K]) => { setOpts((o) => ({ ...o, [k]: v })); setPreset(""); };

  const refreshLib = () => listReferences().then((l) => { setLib(l); setLibErr(null); }).catch((e: Error) => setLibErr(e.message));
  useEffect(() => { void refreshLib(); }, []);

  const applyPreset = (p: Preset) => {
    const next = { ...DEFAULT_OPTIONS, ...opts, ...p.opts };
    setOpts(next);
    setMust(next.must_contain.join("\n"));
    setMustNot(next.must_not_contain.join("\n"));
    setPreset(p.name);
  };
  const savePreset = () => {
    const name = window.prompt("Name this preset")?.trim();
    if (!name) return;
    const next = [...custom.filter((p) => p.name !== name),
      { name, custom: true, opts: { ...opts, must_contain: lines(must), must_not_contain: lines(mustNot), ignore_regions: [] } }];
    setCustom(next); save(PRESET_KEY, next); setPreset(name);
  };
  const dropPreset = (name: string) => {
    const next = custom.filter((p) => p.name !== name);
    setCustom(next); save(PRESET_KEY, next);
  };

  const source: RefSource | null = ref[0] ?? libRef;
  const final = (): Options => ({ ...opts, must_contain: lines(must), must_not_contain: lines(mustNot) });
  const ready = !!source && (batch ? cands.length > 0 : cands.length === 1) && !busy;
  const go = () => {
    if (!source) return;
    if (batch) onBatch(source, cands, final());
    else if (cands[0]) onSubmit(source, cands[0], final());
  };

  const toLibrary = async () => {
    if (!ref[0]) return;
    try {
      const saved = await saveReference(ref[0]);
      await refreshLib();
      setRef([]); setLibRef(saved);
    } catch (e) { setLibErr((e as Error).message); }
  };

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-0.5 text-xs">
          {([[false, "Single"], [true, "Batch"]] as const).map(([b, label]) => (
            <button key={label} onClick={() => { setBatch(b); setCands((c) => (b ? c : c.slice(0, 1))); }}
              className={`rounded-lg px-3 py-1.5 font-medium ${batch === b ? "bg-indigo-500 text-white" : "text-slate-300 hover:text-white"}`}>{label}</button>
          ))}
        </div>
        <button className="btn-ghost !py-1.5 text-xs" onClick={() => setShowLib((v) => !v)}>
          <Library className="h-4 w-4" /> Reference library {lib ? `(${lib.length})` : ""}
        </button>
      </div>

      {showLib && (
        <div className="mb-4 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          {libErr && <div className="mb-2 text-xs text-red-300">{libErr}</div>}
          {lib && lib.length === 0 && <div className="text-xs text-slate-400">No saved references yet. Upload one and click “Save to library”.</div>}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lib?.map((r) => (
              <li key={r.id}>
                <div role="button" tabIndex={0} onClick={() => { setLibRef(r); setRef([]); }}
                  onKeyDown={(e) => e.key === "Enter" && (setLibRef(r), setRef([]))}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${libRef?.id === r.id ? "border-indigo-400 bg-indigo-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                  <BookMarked className="h-4 w-4 shrink-0 text-indigo-300" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-100">{r.name}</div>
                    <div className="text-slate-500">{kb(r.size)} · {new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <a href={`/api/references/${r.id}/file`} target="_blank" rel="noreferrer" aria-label={`Preview ${r.name}`}
                    onClick={(e) => e.stopPropagation()} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"><ExternalLink className="h-3.5 w-3.5" /></a>
                  <button aria-label={`Delete ${r.name}`} className="rounded p-1 text-slate-500 hover:bg-red-500/15 hover:text-red-300"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try { await deleteReference(r.id); if (libRef?.id === r.id) setLibRef(null); await refreshLib(); }
                      catch (err) { setLibErr((err as Error).message); }
                    }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          {libRef && !ref.length ? (
            <div className="flex h-full min-h-[7.5rem] items-center justify-center gap-3 rounded-2xl border-2 border-indigo-400/40 bg-indigo-500/5 p-6">
              <BookMarked className="h-8 w-8 text-indigo-300" />
              <div className="min-w-0 text-left">
                <div className="truncate text-sm font-medium text-slate-100">{libRef.name}</div>
                <div className="text-xs text-slate-400">Reference from library</div>
              </div>
              <button className="ml-2 rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => setLibRef(null)} aria-label="Clear reference"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <Drop label="Reference PDF" hint="The base / golden document" files={ref} onFiles={(f) => { setRef(f); setLibRef(null); }} />
          )}
          {ref[0] && (
            <button className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-300 hover:underline" onClick={toLibrary}>
              <Save className="h-3 w-3" /> Save to library
            </button>
          )}
        </div>
        <Drop label={batch ? "Customized PDFs" : "Customized PDF"} hint={batch ? "Drop several documents to validate" : "The document to validate"}
          files={cands} multiple={batch} onFiles={setCands} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost" onClick={() => setOpen((v) => !v)}><Settings2 className="h-4 w-4" /> Tolerances, checks &amp; rules</button>
        <button className="btn-primary" disabled={!ready} onClick={go}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</> : batch ? `Validate ${cands.length || ""} PDFs` : "Validate PDFs"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Presets:</span>
            {[...BUILTIN, ...custom].map((p) => (
              <span key={p.name} className={`inline-flex items-center rounded-full border ${preset === p.name ? "border-indigo-400 bg-indigo-500/20 text-white" : "border-white/10 bg-white/5 text-slate-300"}`}>
                <button className="px-3 py-1" onClick={() => applyPreset(p)}>{p.name}</button>
                {p.custom && <button className="pr-2 text-slate-500 hover:text-red-300" aria-label={`Delete preset ${p.name}`} onClick={() => dropPreset(p.name)}><X className="h-3 w-3" /></button>}
              </span>
            ))}
            <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-3 py-1 text-slate-300 hover:text-white" onClick={savePreset}>
              <Save className="h-3 w-3" /> Save current
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Num label="Position tolerance (pt)" value={opts.pos_tol} step={0.5} onChange={(v) => set("pos_tol", v)} />
            <Num label="Font size tolerance (pt)" value={opts.size_tol} step={0.25} onChange={(v) => set("size_tol", v)} />
            <Num label="Margin tolerance (pt)" value={opts.margin_tol} step={0.5} onChange={(v) => set("margin_tol", v)} />
            <Num label="Colour tolerance (RGB)" value={opts.color_tol} step={4} onChange={(v) => set("color_tol", v)} />
            <Num label="Render DPI" value={opts.dpi} step={10} onChange={(v) => set("dpi", v)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TOGGLES.map(([k, label]) => (
              <Toggle key={k} label={label} value={opts[k] as boolean} onChange={(v) => set(k, v as never)} />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {([["Must contain", must, setMust, "Authorised signatory\n/INV-\\d{4}-\\d{3}/"], ["Must not contain", mustNot, setMustNot, "DRAFT\nConfidential - internal"]] as const).map(([label, val, setter, ph]) => (
              <label key={label} className="block text-xs text-slate-400">
                {label} <span className="text-slate-500">(one per line, /regex/ allowed)</span>
                <textarea rows={3} value={val} placeholder={ph} onChange={(e) => { setter(e.target.value); setPreset(""); }}
                  className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-indigo-400" />
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
