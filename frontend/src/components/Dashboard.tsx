import { ArrowRight, Database, FileStack, Play, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getStats } from "../api";
import { Count } from "../hooks/useCountUp";
import { useIsLight } from "../hooks/useIsLight";
import { FAMILIES, SEVERITY_COLOR, VERDICT_STYLE, familyColor, familyOf, seriesColor } from "../theme";
import type { Severity, Stats } from "../types";
import Donut from "./Donut";
import RecentTable from "./RecentTable";

const GRID = "rgba(166,158,143,.22)";
const TIP = {
  contentStyle: { background: "#221f1b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "#efe9dc" },
  itemStyle: { color: "#efe9dc" },
  cursor: { stroke: "rgba(166,158,143,.55)", strokeWidth: 1 },
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const fmtBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;

/** One cell of the stats strip: small label, big serif figure, quiet footnote. */
function Stat({ label, hint, children, tone }: { label: string; hint: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 font-serif text-[2.4rem] leading-none text-white" style={tone ? { color: tone } : undefined}>{children}</div>
      <div className="mt-2 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Panel({ title, sub, action, children, className = "" }: {
  title: React.ReactNode; sub?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`card animate-fade-up ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="card-title !mb-0">{title}</div>
          {sub && <div className="text-xs text-slate-400">{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded border border-white/10 text-[11px]" role="tablist">
      {options.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`px-2.5 py-1 transition-colors first:border-r first:border-white/10 ${value === k ? "bg-white/10 font-medium text-white" : "text-slate-500 hover:text-white"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard({ onOpen, onDemo, onNew, onHistory, busy }: {
  onOpen: (id: string) => void; onDemo: () => void; onNew: () => void; onHistory: () => void; busy: boolean;
}) {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<"comparisons" | "differences">("comparisons");
  const light = useIsLight();

  const load = useCallback(() => {
    getStats().then(setS).catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
        <h2 className="page-title mt-1">{greeting()}.</h2>
        <p className="mt-1 text-sm text-slate-400">Where your documents stand, and what still needs a second look.</p>
      </div>
    </div>
  );

  if (err) return <div className="space-y-6">{header}<div role="alert" className="card text-sm text-red-300">{err}</div></div>;
  if (!s) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28" />)}</div>
        <div className="grid gap-4 lg:grid-cols-3"><div className="skeleton h-80 lg:col-span-2" /><div className="skeleton h-80" /></div>
      </div>
    );
  }

  if (s.total === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="card animate-fade-up mx-auto max-w-xl py-14 text-center">
          <FileStack className="mx-auto h-8 w-8 text-slate-500" strokeWidth={1.5} />
          <h3 className="mt-4 font-serif text-2xl text-white">Nothing compared yet</h3>
          <p className="mt-2 text-sm text-slate-400">Run your first comparison and this dashboard fills with trends and statistics.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button className="btn-primary" onClick={onDemo} disabled={busy}><Play className="h-4 w-4" /> Run sample</button>
            <button className="btn-ghost" onClick={onNew}><Upload className="h-4 w-4" /> Upload PDFs</button>
          </div>
        </div>
      </div>
    );
  }

  const highSev = (s.severities.critical ?? 0) + (s.severities.major ?? 0);
  const daily = (s.daily ?? []).map((d) => ({
    ...d, label: new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  }));
  const sevSlices = (["critical", "major", "minor"] as Severity[]).map((k) => ({
    key: k, name: k[0].toUpperCase() + k.slice(1), value: s.severities[k] ?? 0, fill: SEVERITY_COLOR[k],
  }));
  const famTotals = Object.fromEntries(FAMILIES.map((f) => [f.key, 0])) as Record<string, number>;
  for (const [c, n] of Object.entries(s.categories)) famTotals[familyOf(c)] += n;
  const byType = FAMILIES.map((f) => ({ name: f.label, value: famTotals[f.key], fill: familyColor(f.key, light) }));
  const verdictSlices = (["PASS", "REVIEW", "FAIL"] as const).map((k) => ({
    key: k, name: VERDICT_STYLE[k].label, value: s.verdicts[k], fill: VERDICT_STYLE[k].color,
  }));
  const radar = [
    { metric: "Text", value: Math.round(s.dimensions.text * 100) },
    { metric: "Format", value: Math.round(s.dimensions.format * 100) },
    { metric: "Layout", value: Math.round(s.dimensions.layout * 100) },
    { metric: "Visual", value: Math.round(s.dimensions.visual * 100) },
  ];
  const line = seriesColor(0, light);
  const axis = { stroke: "#a69e8f", fontSize: 11, tickLine: false, axisLine: false };

  return (
    <div className="space-y-6">
      {header}

      <div className="card grid !p-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-white/10 sm:[&>*:nth-child(odd)]:border-r xl:[&>*]:border-r xl:[&>*:last-child]:border-r-0 [&>*:nth-child(-n+2)]:border-b xl:[&>*]:!border-b-0">
        <Stat label="Comparisons" hint={s.failed ? `${s.failed} run(s) errored` : "all time"}><Count value={s.total} /></Stat>
        <Stat label="Completed" hint={`${Math.round(s.pass_rate * 100)}% passed clean`}><Count value={s.completed} /></Stat>
        <Stat label="High severity" hint="critical and major differences" tone={highSev ? "#c2412d" : undefined}><Count value={highSev} /></Stat>
        <Stat label="Avg. similarity" hint={`${s.total_issues} differences in total`}><Count value={s.avg_score * 100} suffix="%" /></Stat>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Comparison trend" sub="Last 14 days" className="lg:col-span-2"
          action={<Segmented value={metric} onChange={setMetric} options={[["comparisons", "Comparisons"], ["differences", "Differences"]]} />}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={daily} margin={{ top: 8, right: 20, left: -12 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={line} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={line} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
              <YAxis allowDecimals={false} {...axis} width={36} />
              <Tooltip {...TIP} formatter={(v: number) => [v, metric === "comparisons" ? "Comparisons" : "Differences"]} />
              <Area key={metric} type="monotone" dataKey={metric} stroke={line} strokeWidth={2} fill="url(#trendFill)"
                dot={false} activeDot={{ r: 5, stroke: light ? "#fffefb" : "#221f1b", strokeWidth: 2 }} animationDuration={600} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Severity distribution" sub="All differences detected">
          <Donut data={sevSlices} unit="total" layout="row" />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Differences by type" sub="Text, formatting, layout, structure, visual and compliance" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byType} margin={{ top: 20, right: 8, left: -12 }} barCategoryGap="30%">
              <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="name" {...axis} interval={0} tickFormatter={(v: string) => v.split(" ")[0]} />
              <YAxis allowDecimals={false} {...axis} width={36} />
              <Tooltip {...TIP} cursor={{ fill: "rgba(166,158,143,.1)" }} />
              <Bar dataKey="value" name="Differences" radius={[4, 4, 0, 0]} maxBarSize={44}>
                {byType.map((d) => <Cell key={d.name} fill={d.fill} />)}
                <LabelList dataKey="value" position="top" className="fill-slate-300" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title={<span className="flex items-center gap-2"><Database className="h-4 w-4 text-slate-400" /> Storage usage</span>} sub="Documents and generated reports">
          {s.storage ? (
            <div>
              <div className="font-serif text-[2.4rem] leading-none text-white">{fmtBytes(s.storage.bytes)}</div>
              <div className="mt-1 text-xs text-slate-400">Uploaded PDFs, highlighted copies, diffs and reports</div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-[11px] text-slate-400">Documents</div>
                  <div className="num text-lg text-white">{s.storage.documents}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-[11px] text-slate-400">Reports</div>
                  <div className="num text-lg text-white">{s.storage.reports}</div>
                </div>
              </div>
              <div className="mt-4 text-[11px] text-slate-500">Average {fmtBytes(s.total ? s.storage.bytes / s.total : 0)} per comparison</div>
            </div>
          ) : <div className="py-10 text-center text-sm text-slate-500">Storage usage unavailable</div>}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Verdicts" sub="Outcome of every completed run">
          <Donut data={verdictSlices} unit="runs" layout="row" />
        </Panel>
        <Panel title="Average quality profile" sub="Mean score per dimension">
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke={GRID} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: light ? "#6b6458" : "#d0c9bb", fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="value" name="Score" stroke={line} strokeWidth={2} fill={line} fillOpacity={0.2}
                dot={{ r: 3.5, fill: line, stroke: light ? "#fffefb" : "#221f1b", strokeWidth: 2 }} />
              <Tooltip {...TIP} formatter={(v: number) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Score trend" sub="Overall similarity of the latest runs">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={s.trend.map((t) => ({ ...t, pct: Math.round(t.score * 100) }))} margin={{ top: 8, right: 8, left: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="label" hide />
              <YAxis domain={[0, 100]} unit="%" {...axis} width={44} />
              <Tooltip {...TIP} formatter={(v: number) => [`${v}%`, "Score"]} />
              <Area type="monotone" dataKey="pct" stroke={seriesColor(2, light)} strokeWidth={2} fill={seriesColor(2, light)} fillOpacity={0.12}
                dot={{ r: 3, fill: seriesColor(2, light), stroke: light ? "#fffefb" : "#221f1b", strokeWidth: 1.5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Recent comparisons" sub="Click a row to reopen its full analysis"
        action={<button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={onHistory}>View all <ArrowRight className="h-3.5 w-3.5" /></button>}>
        <RecentTable rows={s.recent.slice(0, 6)} onOpen={onOpen} onChanged={load} />
      </Panel>
    </div>
  );
}
