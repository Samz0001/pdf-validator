import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar,
  RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useIsLight } from "../hooks/useIsLight";
import {
  CATEGORY_LABEL, FAMILIES, SEVERITY_COLOR, STATUS_COLOR, familyColor, familyOf, seriesColor, VERDICT_STYLE,
} from "../theme";
import type { Category, CompareResult, Severity } from "../types";
import Donut from "./Donut";

const GRID = "rgba(166,158,143,.18)";
// legend labels wear text ink; the dot beside them carries the series colour
const legendText = (v: string) => <span className="text-slate-300">{v}</span>;
const TIP = {
  contentStyle: { background: "#221f1b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "#efe9dc" },
  itemStyle: { color: "#efe9dc" },
  cursor: { fill: "rgba(166,158,143,.1)" },
};

function Card({ title, sub, children, className = "" }: {
  title: string; sub?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`card animate-fade-up ${className}`}>
      <div className="mb-4 flex items-start gap-2.5">
        <div>
          <div className="card-title !mb-0">{title}</div>
          {sub && <div className="text-xs text-slate-400">{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => (
  <div className="flex h-48 items-center justify-center text-sm text-slate-500">{text}</div>
);

/** Score ring tile: the number is the headline, the ring is a quiet gauge behind it. */
function ScoreRing({ label, value, delay }: { label: string; value: number | null; delay: number }) {
  const r = 30, c = 2 * Math.PI * r;
  const v = value ?? 0;
  const col = value == null ? "#857d70" : v >= 0.95 ? VERDICT_STYLE.PASS.color : v >= 0.8 ? VERDICT_STYLE.REVIEW.color : VERDICT_STYLE.FAIL.color;
  return (
    <div className="card lift animate-fade-up flex items-center gap-3 !p-4" style={{ animationDelay: `${delay}ms` }}>
      <svg viewBox="0 0 76 76" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(166,158,143,.2)" strokeWidth="7" />
        <circle cx="38" cy="38" r={r} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div>
        <div className="font-serif text-[1.8rem] leading-none text-white">{value == null ? "–" : `${Math.round(v * 100)}%`}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export default function Charts({ r, onSeverity }: { r: CompareResult; onSeverity?: (s: Severity) => void }) {
  const light = useIsLight();
  const surface = light ? "#fffefb" : "#221f1b";
  const axis = { stroke: light ? "#857d70" : "#857d70", fontSize: 11, tickLine: false };
  const s = r.summary;

  // ---- data -------------------------------------------------------------------------------------------------
  const famCount = (byCat: Record<string, number>) => {
    const out = Object.fromEntries(FAMILIES.map((f) => [f.key, 0])) as Record<string, number>;
    for (const [c, n] of Object.entries(byCat)) out[familyOf(c)] += n;
    return out;
  };
  const fam = famCount(s.by_category);
  const famSlices = FAMILIES.map((f) => ({ key: f.key, name: f.label, value: fam[f.key], fill: familyColor(f.key, light) }));
  const sevSlices = (["critical", "major", "minor"] as Severity[]).map((k) => ({
    key: k, name: k[0].toUpperCase() + k.slice(1), value: s.by_severity[k] ?? 0, fill: SEVERITY_COLOR[k],
  }));
  const checks = r.checks ?? [];
  const checkSlices = (["pass", "warn", "fail"] as const).map((k) => ({
    key: k, name: { pass: "Passed", warn: "Warnings", fail: "Failed" }[k], value: checks.filter((c) => c.status === k).length, fill: STATUS_COLOR[k],
  }));

  const radar = [
    { metric: "Text", value: Math.round(s.text_score * 100) },
    { metric: "Format", value: Math.round(s.format_score * 100) },
    { metric: "Layout", value: Math.round(s.layout_score * 100) },
    ...(s.visual_score != null ? [{ metric: "Visual", value: Math.round(s.visual_score * 100) }] : []),
  ];
  const pages = r.pages.map((p) => ({
    page: `Page ${p.page}`,
    score: Math.round(p.score * 100),
    text: Math.round(p.text_similarity * 100),
    ssim: p.ssim != null ? Math.round(p.ssim * 100) : undefined,
  }));
  const stacked = r.pages.map((p) => ({ page: `P${p.page}`, ...famCount(p.by_category) }));
  const usedFams = FAMILIES.filter((f) => stacked.some((row) => (row as Record<string, unknown>)[f.key]));
  const top = (Object.entries(s.by_category) as [Category, number][])
    .map(([k, v]) => ({ name: CATEGORY_LABEL[k] ?? k, value: v, fill: familyColor(familyOf(k), light) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const lines = [
    { key: "score", name: "Combined", color: seriesColor(0, light) },
    { key: "text", name: "Text", color: seriesColor(1, light) },
    ...(pages.some((p) => p.ssim != null) ? [{ key: "ssim", name: "Visual (SSIM)", color: seriesColor(2, light) }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* headline scores */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <ScoreRing label="Overall" value={s.overall_score} delay={0} />
        <ScoreRing label="Text" value={s.text_score} delay={50} />
        <ScoreRing label="Formatting" value={s.format_score} delay={100} />
        <ScoreRing label="Layout" value={s.layout_score} delay={150} />
        <ScoreRing label="Visual" value={s.visual_score} delay={200} />
      </div>

      {/* pie charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Issues by type" sub="Grouped into six families">
          {s.total_issues === 0 ? <Empty text="No issues detected" /> : <Donut data={famSlices} unit="issues" />}
        </Card>
        <Card title="Severity mix" sub={onSeverity ? "Click a slice to list those issues" : "How serious the findings are"}>
          {s.total_issues === 0 ? <Empty text="No issues detected" /> : (
            <Donut data={sevSlices} unit="issues" onPick={onSeverity ? (k) => onSeverity(k as Severity) : undefined} />
          )}
        </Card>
        <Card title="Document checks" sub="Structure, links, fonts, compliance">
          {checks.length === 0 ? <Empty text="No checks ran" /> : <Donut data={checkSlices} unit="checks" />}
        </Card>
      </div>

      {/* trend + profile */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Page-by-page similarity" sub="Higher is closer to the reference" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={pages} margin={{ right: 12, top: 8 }}>
              <defs>
                {lines.map((l) => (
                  <linearGradient key={l.key} id={`grad-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={l.color} stopOpacity={l.key === "score" ? 0.35 : 0.12} />
                    <stop offset="100%" stopColor={l.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="page" {...axis} />
              <YAxis domain={[0, 100]} unit="%" width={44} {...axis} />
              <Tooltip {...TIP} cursor={{ stroke: "rgba(166,158,143,.5)", strokeWidth: 1 }} formatter={(v: number, n: string) => [`${v}%`, n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
              {lines.map((l) => (
                <Area key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2}
                  fill={`url(#grad-${l.key})`} dot={{ r: 4, fill: l.color, stroke: surface, strokeWidth: 2 }}
                  activeDot={{ r: 6, stroke: surface, strokeWidth: 2 }} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Quality profile" sub="Score per dimension">
          <ResponsiveContainer width="100%" height={270}>
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke={GRID} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: light ? "#3f3b34" : "#d0c9bb", fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="value" name="Score" stroke={seriesColor(0, light)} strokeWidth={2} fill={seriesColor(0, light)} fillOpacity={0.25}
                dot={{ r: 4, fill: seriesColor(0, light), stroke: surface, strokeWidth: 2 }} />
              <Tooltip {...TIP} formatter={(v: number) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* bars */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Where the issues are" sub="Issues per page, stacked by type" className="lg:col-span-2">
          {usedFams.length === 0 ? <Empty text="No issues" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stacked} barCategoryGap="28%">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="page" {...axis} />
                <YAxis allowDecimals={false} width={32} {...axis} />
                <Tooltip {...TIP} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
                {usedFams.map((f, i) => (
                  <Bar key={f.key} dataKey={f.key} name={f.label} stackId="a" fill={familyColor(f.key, light)}
                    stroke={surface} strokeWidth={2} radius={i === usedFams.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={56} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Top issue categories" sub="Coloured by type family">
          {top.length === 0 ? <Empty text="Nothing to show" /> : (
            <ResponsiveContainer width="100%" height={Math.max(280, top.length * 28)}>
              <BarChart data={top} layout="vertical" margin={{ left: 8, right: 28 }} barCategoryGap="22%">
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={104} interval={0} {...axis} axisLine={false} />
                <Tooltip {...TIP} />
                <Bar dataKey="value" name="Issues" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {top.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  <LabelList dataKey="value" position="right" className="fill-slate-300" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Usage title="Font usage" sub="Characters set in each font" rows={r.font_usage} light={light} />
        <Usage title="Font sizes" sub="Characters at each size" rows={r.size_usage} light={light} />
        <Usage title="Text colours" sub="Characters in each colour" rows={r.color_usage} light={light} colourSwatch />
      </div>
    </div>
  );
}

function Usage({ title, sub, rows, light, colourSwatch }: {
  title: string; sub: string; rows: CompareResult["font_usage"]; light: boolean; colourSwatch?: boolean;
}) {
  return (
    <Card title={title} sub={sub}>
      {rows.length === 0 ? <Empty text="No text found" /> : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} barGap={2} barCategoryGap="24%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" stroke="#857d70" fontSize={11} tickLine={false} interval={0}
              tickFormatter={(v: string) => (v.length > 11 ? v.slice(0, 10) + "…" : v)} />
            <YAxis stroke="#857d70" fontSize={11} tickLine={false} width={40} />
            <Tooltip {...TIP} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
            <Bar dataKey="reference" name="Reference" fill={seriesColor(0, light)} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="candidate" name="Candidate" fill={seriesColor(1, light)} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      )}
      {colourSwatch && rows.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {rows.map((r) => (
            <span key={r.name} className="chip border border-white/10 bg-white/5 text-slate-300">
              <i className="mr-1.5 inline-block h-3 w-3 rounded-full border border-white/20" style={{ background: r.name }} />
              {r.name}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
