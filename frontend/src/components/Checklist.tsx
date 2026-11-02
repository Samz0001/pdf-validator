import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Check } from "../types";

const STYLE = {
  pass: { Icon: CheckCircle2, color: "#10b981", ring: "border-emerald-500/20 bg-emerald-500/5" },
  warn: { Icon: AlertTriangle, color: "#f59e0b", ring: "border-amber-500/25 bg-amber-500/5" },
  fail: { Icon: XCircle, color: "#ef4444", ring: "border-red-500/25 bg-red-500/5" },
} as const;

export default function Checklist({ checks }: { checks: Check[] }) {
  if (!checks.length) return null;
  const passed = checks.filter((c) => c.status === "pass").length;
  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div>
            <div className="card-title">Document checks</div>
            <div className="text-xs text-slate-400">Structure, fonts, hyperlinks and template leftovers</div>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-lg text-white">{passed}/{checks.length}</div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(passed / checks.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {checks.map((c) => {
          const { Icon, color, ring } = STYLE[c.status];
          return (
            <div key={c.key} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${ring}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100">{c.label}</div>
                <div className="text-xs text-slate-400" title={c.detail}>{c.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
