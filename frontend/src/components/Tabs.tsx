import type { ReactNode } from "react";

export interface TabDef<K extends string> { key: K; label: string; icon: ReactNode; badge?: number | string }

/** Plain underline tabs, like section headings in a document. */
export default function Tabs<K extends string>({ tabs, active, onChange, aside }: {
  tabs: TabDef<K>[]; active: K; onChange: (k: K) => void; aside?: ReactNode;
}) {
  return (
    <div className="tabbar flex items-center">
      <div role="tablist" className="flex overflow-x-auto overflow-y-hidden">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => onChange(t.key)} className="tab shrink-0">
            {t.label}
            {t.badge !== undefined && <span className="num text-[11px] text-slate-500">{t.badge}</span>}
          </button>
        ))}
      </div>
      {aside && <div className="ml-auto hidden shrink-0 pl-4 text-[11px] text-slate-500 md:block">{aside}</div>}
    </div>
  );
}
