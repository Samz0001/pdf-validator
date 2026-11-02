import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";

export interface Slice { key: string; name: string; value: number; fill: string }

const TIP = {
  contentStyle: { background: "#221f1b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12 },
  itemStyle: { color: "#efe9dc" },
};

// The hovered slice grows outward a little; everything else stays put.
const Active = (p: any) => <Sector {...p} outerRadius={p.outerRadius + 6} />;

/** Donut with the total in the hole and a legend that carries name, count and share (identity is never colour-only). */
export default function Donut({ data, total, unit, height = 190, onPick, layout = "stack" }: {
  data: Slice[]; total?: number; unit: string; height?: number; onPick?: (key: string) => void;
  /** "row": donut beside a single-column legend (wide cards); "stack": legend in two columns below */
  layout?: "stack" | "row";
}) {
  const row = layout === "row";
  const [active, setActive] = useState<number | undefined>(undefined);
  const sum = data.reduce((a, d) => a + d.value, 0);
  const shown = data.filter((d) => d.value > 0);
  const hovered = active != null ? shown[active] : null;

  return (
    <div className={row ? "flex flex-col items-center gap-4 sm:flex-row" : "flex flex-col items-center gap-3"}>
      <div className={`relative w-full shrink-0 ${row ? "max-w-[170px]" : "max-w-[200px]"}`} style={{ height: row ? 170 : height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="88%" startAngle={90} endAngle={-270}
              paddingAngle={shown.length > 1 ? 2 : 0} cornerRadius={4} stroke="none" activeIndex={active} activeShape={Active}
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(undefined)}
              onClick={(d: Slice) => onPick?.(d.key)} className={onPick ? "cursor-pointer" : ""}
              isAnimationActive animationDuration={700}>
              {shown.map((d) => <Cell key={d.key} fill={d.fill} />)}
            </Pie>
            <Tooltip {...TIP} formatter={(v: number, n: string) => [`${v} (${Math.round((v / (sum || 1)) * 100)}%)`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="font-serif text-[2rem] leading-none text-white">{hovered ? hovered.value : total ?? sum}</div>
          <div className="max-w-[7rem] truncate text-[10px] uppercase tracking-wide text-slate-400">{hovered ? hovered.name : unit}</div>
        </div>
      </div>
      <ul className={`grid w-full min-w-0 gap-x-3 gap-y-1 text-xs ${row ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {data.map((d, i) => {
          const share = sum ? d.value / sum : 0;
          const idx = shown.indexOf(d);
          return (
            <li key={d.key}>
              <button type="button" aria-disabled={!onPick || !d.value} onClick={() => d.value && onPick?.(d.key)}
                onMouseEnter={() => idx >= 0 && setActive(idx)} onMouseLeave={() => setActive(undefined)}
                className={`w-full rounded-lg px-2 py-1 text-left transition ${active === idx && idx >= 0 ? "bg-white/10" : "hover:bg-white/5"} ${d.value ? "" : "opacity-40"}`}>
                <div className="flex items-center gap-2">
                  <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.fill }} />
                  <span className="min-w-0 flex-1 truncate text-slate-200" title={d.name}>{d.name}</span>
                  <span className="num text-slate-100">{d.value}</span>
                  <span className="w-9 text-right text-slate-500">{Math.round(share * 100)}%</span>
                </div>
                <div className="ml-[18px] mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${share * 100}%`, background: d.fill, transitionDelay: `${i * 60}ms` }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
