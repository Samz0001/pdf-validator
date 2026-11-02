import { AlertTriangle, ArrowLeft, BarChart3, Eye, LayoutDashboard, ListChecks, ScanEye, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fingerprint, loadAccepted, saveAccepted } from "./accepted";
import { createBatch, createDemo, createJob, getJob, rerunJob, type RefSource } from "./api";
import BatchView from "./components/BatchView";
import Charts from "./components/Charts";
import Checklist from "./components/Checklist";
import Dashboard from "./components/Dashboard";
import HistoryView from "./components/HistoryView";
import Capabilities from "./components/Capabilities";
import IssueTable, { applyFilters, type Filters } from "./components/IssueTable";
import Overview from "./components/Overview";
import PageHeatmap from "./components/PageHeatmap";
import ResultSkeleton from "./components/ResultSkeleton";
import Tabs from "./components/Tabs";
import UploadPanel from "./components/UploadPanel";
import Viewer from "./components/Viewer";
import { Sidebar, Topbar, VIEW_TITLE, type View } from "./components/Shell";
import { downloadIssuesCsv } from "./export";
import { useHotkeys } from "./hooks/useHotkeys";
import { load, save } from "./storage";
import { DEFAULT_OPTIONS, type IgnoreRegion, type Issue, type Job, type Options } from "./types";

type TabKey = "overview" | "analytics" | "inspector" | "issues";
const TAB_KEYS: TabKey[] = ["overview", "analytics", "inspector", "issues"];

const hashParams = () => new URLSearchParams(location.hash.slice(1));
const NO_FILTERS: Filters = { severity: "all", category: "all", page: "all", q: "", status: "all" };
const optsKey = (id: string) => `pdfv.opts.${id}`;

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    load<"dark" | "light" | null>("pdfv.theme", null) ?? "light");
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    save("pdfv.theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const;
}

export default function App() {
  const [view, setView] = useState<View>(() => {
    const h = hashParams();
    return h.get("job") || h.get("batch") || h.get("share") ? "validate" : "dashboard";
  });
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [job, setJob] = useState<Job | null>(null);
  const [batchId, setBatchId] = useState<string | null>(() => hashParams().get("batch"));
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [accepted, setAccepted] = useState<Set<string>>(loadAccepted);
  const [regions, setRegions] = useState<IgnoreRegion[]>([]);
  const [readOnly] = useState(() => hashParams().get("share") === "1");
  const [theme, toggleTheme] = useTheme();
  const uploadRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async (id: string) => {
    setBusy(true);
    try {
      for (;;) {
        const j = await getJob(id);
        setJob(j);
        if (j.status === "done" || j.status === "failed") {
          if (j.status === "failed") setError(j.error ?? "Validation failed");
          break;
        }
        await new Promise((r) => setTimeout(r, 900));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setError(null); setJob(null); setPage(1); setSelected(null); setFilters(NO_FILTERS); setTab("overview"); setBatchId(null);
  };

  useEffect(() => {
    const id = hashParams().get("job");
    if (id) void poll(id);
  }, [poll]);

  // follow pasted/shared links and browser back/forward between comparisons
  useEffect(() => {
    const onHash = () => {
      const id = hashParams().get("job");
      if (id && id !== job?.id && !busy) {
        reset();
        setView("validate");
        void poll(id);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });

  useEffect(() => {
    if (job?.result) {
      const saved = job.options ?? load<Partial<Options> | null>(optsKey(job.id), null);
      setRegions(saved?.ignore_regions ?? []);
    }
  }, [job?.id, job?.result, job?.options]);

  const start = async (make: () => Promise<Job>, opts?: Options) => {
    reset();
    setLastBatch(null);
    setView("validate");
    try {
      setBusy(true);
      const j = await make();
      if (opts) save(optsKey(j.id), opts);
      location.hash = `job=${j.id}`;
      await poll(j.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const submit = (r: RefSource, c: File, o: Options) => start(() => createJob(r, c, o), o);
  const demo = () => start(createDemo, DEFAULT_OPTIONS);
  const batch = async (r: RefSource, c: File[], o: Options) => {
    reset();
    try {
      setBusy(true);
      const b = await createBatch(r, c, o);
      b.jobs.forEach((j) => save(optsKey(j.id), o));
      location.hash = `batch=${b.batch_id}`;
      setBatchId(b.batch_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rerun = () => {
    if (!job) return;
    const o: Options = { ...DEFAULT_OPTIONS, ...(job.options ?? load<Partial<Options>>(optsKey(job.id), {})), ignore_regions: regions };
    const id = job.id;
    void start(() => rerunJob(id, o), o);
  };

  const open = (id: string) => {
    const from = batchId;
    reset();
    setLastBatch(from);
    setView("validate");
    location.hash = `job=${id}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    void poll(id);
  };

  const backToBatch = () => {
    if (!lastBatch) return;
    reset();
    location.hash = `batch=${lastBatch}`;
    setBatchId(lastBatch);
    setLastBatch(null);
  };

  const newValidation = () => {
    reset();
    setLastBatch(null);
    setRegions([]);
    history.replaceState(null, "", location.pathname);
    setView("validate");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleAccept = (i: Issue) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      const k = fingerprint(i);
      if (next.has(k)) next.delete(k); else next.add(k);
      saveAccepted(next);
      return next;
    });
  };

  const result = job?.status === "done" ? job.result : null;
  const filtered = useMemo(() => (result ? applyFilters(result.issues, filters, accepted) : []), [result, filters, accepted]);
  const pageNumbers = useMemo(() => result?.pages.map((p) => p.page) ?? [], [result]);

  const inspectPage = (p: number) => { setPage(p); setTab("inspector"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const pick = (i: Issue) => {
    setSelected(i.id);
    if (i.page > 0) setPage(i.page);
    setTab("inspector");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const step = (d: number) => {
    if (!filtered.length) return;
    const idx = filtered.findIndex((i) => i.id === selected);
    const next = filtered[idx < 0 ? (d > 0 ? 0 : filtered.length - 1) : (idx + d + filtered.length) % filtered.length];
    setSelected(next.id);
    if (next.page > 0) setPage(next.page);
  };

  useHotkeys((e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= TAB_KEYS.length) { setTab(TAB_KEYS[n - 1]); return; }
    if (tab !== "issues" && tab !== "inspector") return;
    const down = e.key === "j" || (tab === "issues" && e.key === "ArrowDown");
    const up = e.key === "k" || (tab === "issues" && e.key === "ArrowUp");
    if (down || up) { e.preventDefault(); step(down ? 1 : -1); return; }
    if (tab === "issues" && e.key === "Enter" && selected) {
      const i = filtered.find((x) => x.id === selected);
      if (i) pick(i);
    }
  }, view === "validate" && !!result);

  const csv = () => {
    if (result && job) downloadIssuesCsv(result.issues, `${result.candidate_name.replace(/\.pdf$/i, "")}-issues.csv`, accepted, fingerprint);
  };

  const showHero = view === "validate" && !job && !busy && !error && !batchId && !readOnly;
  const showUpload = !readOnly && !batchId && !job;

  const nav = (v: View) => {
    if (v === "validate" && view !== "validate") return newValidation();
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const title = view === "validate" && result ? `${result.candidate_name} vs ${result.reference_name}`
    : view === "validate" && batchId ? "Batch comparison" : view === "validate" && !job ? "New comparison" : VIEW_TITLE[view];

  return (
    <div className="flex min-h-screen">
      <Sidebar view={view} onNav={nav} open={menu} onClose={() => setMenu(false)} readOnly={readOnly} />

      <div className="relative min-w-0 flex-1 overflow-x-clip">
        <Topbar title={title} onMenu={() => setMenu(true)} onNew={newValidation} theme={theme} onTheme={toggleTheme} readOnly={readOnly} />

        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8">
          {readOnly && (
            <span className="chip border border-white/10 bg-white/5 text-slate-300"><Eye className="mr-1 h-3.5 w-3.5" /> Shared read-only view</span>
          )}

          {view === "dashboard" && !readOnly ? (
            <Dashboard onOpen={open} onDemo={demo} onNew={newValidation} onHistory={() => nav("history")} busy={busy} />
          ) : view === "history" && !readOnly ? (
            <HistoryView onOpen={open} />
          ) : (
            <>
              {showHero && (
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="eyebrow">Compare</div>
                    <h2 className="page-title mt-1">New comparison</h2>
                    <p className="mt-1 text-sm text-slate-400">Upload a reference and a customized PDF — or a whole batch — to find every difference.</p>
                  </div>
                  <button className="btn-ghost" onClick={demo} disabled={busy}><Sparkles className="h-4 w-4" /> Try with sample PDFs</button>
                </div>
              )}

              {showUpload && (
                <div ref={uploadRef} className="scroll-mt-20">
                  <UploadPanel busy={busy} onSubmit={submit} onBatch={batch} />
                </div>
              )}

              {showHero && <Capabilities />}

              {error && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              {batchId && <BatchView id={batchId} onOpen={open} />}

              {lastBatch && !readOnly && (
                <button className="btn-ghost" onClick={backToBatch}><ArrowLeft className="h-4 w-4" /> Back to batch</button>
              )}

              {busy && !result && !batchId && <ResultSkeleton status={job?.status} />}

              {job && result && (
                <div className="space-y-6">
                  <Tabs<TabKey>
                    active={tab}
                    onChange={setTab}
                    aside={<>Keys <kbd className="num">1</kbd>–<kbd className="num">4</kbd> switch tabs · <kbd className="num">j</kbd> / <kbd className="num">k</kbd> step through issues</>}
                    tabs={[
                      { key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
                      { key: "analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
                      { key: "inspector", label: "Inspector", icon: <ScanEye className="h-4 w-4" /> },
                      { key: "issues", label: "Issues", icon: <ListChecks className="h-4 w-4" />, badge: result.issues.length },
                    ]}
                  />
                  <div key={tab} className="animate-fade-up space-y-6">
                    {tab === "overview" && (<><Overview job={job} onCsv={csv} /><Checklist checks={result.checks ?? []} /><PageHeatmap pages={result.pages} onOpen={inspectPage} /></>)}
                    {tab === "analytics" && <Charts r={result} onSeverity={(sv) => { setFilters({ ...NO_FILTERS, severity: sv }); setTab("issues"); }} />}
                    {tab === "inspector" && (
                      <Viewer job={job} issues={filtered} selected={selected} onSelect={setSelected} page={page} setPage={setPage}
                        regions={regions} setRegions={setRegions} onRerun={rerun} rerunning={busy} readOnly={readOnly} />
                    )}
                    {tab === "issues" && (
                      <IssueTable issues={filtered} all={result.issues} filters={filters} setFilters={setFilters}
                        selected={selected} onSelect={pick} pages={pageNumbers}
                        accepted={accepted} onToggleAccept={toggleAccept} readOnly={readOnly} />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
