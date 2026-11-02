import { FilePlus2, History, LayoutDashboard, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { health } from "../api";

export type View = "dashboard" | "validate" | "history";

const NAV: { key: View; label: string; Icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "validate", label: "New comparison", Icon: FilePlus2 },
  { key: "history", label: "History", Icon: History },
];

export const VIEW_TITLE: Record<View, string> = {
  dashboard: "Dashboard",
  validate: "Comparison",
  history: "History",
};

function useEngineStatus() {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () => health().then((ok) => alive && setUp(ok));
    check();
    const t = setInterval(check, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return up;
}

/** Dark navy sidebar: brand, primary navigation and the validation-engine status. Same look in both themes. */
export function Sidebar({ view, onNav, open, onClose, readOnly }: {
  view: View; onNav: (v: View) => void; open: boolean; onClose: () => void; readOnly: boolean;
}) {
  const up = useEngineStatus();
  return (
    <>
      <div className={`fixed inset-0 z-30 bg-black/40 lg:hidden ${open ? "" : "hidden"}`} onClick={onClose} aria-hidden />
      <aside className={`side fixed inset-y-0 left-0 z-40 flex w-60 flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center px-5">
          <span className="side-brand">Docu<span className="marker">Diff</span></span>
          <button className="side-link ml-auto !w-auto !p-1.5 lg:hidden" onClick={onClose} aria-label="Close menu"><X className="h-4 w-4" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          <div className="side-section mb-2">Workspace</div>
          {NAV.filter((n) => !readOnly || n.key === "validate").map(({ key, label, Icon }) => (
            <button key={key} onClick={() => { onNav(key); onClose(); }} className={`side-link ${view === key ? "side-link-active" : ""}`}
              aria-current={view === key ? "page" : undefined}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
        <div className="side-foot px-5 py-4">
          <div className="flex items-center gap-2 text-xs">
            <span className={`h-1.5 w-1.5 rounded-full ${up == null ? "bg-slate-500" : up ? "bg-emerald-400" : "bg-red-400"}`} />
            Engine {up == null ? "…" : up ? "online" : "offline"}
          </div>
          <div className="side-muted mt-1 font-mono text-[10.5px]">{up === false ? "start the API on :8000" : "v1.0 · local"}</div>
        </div>
      </aside>
    </>
  );
}

export function Topbar({ title, onMenu, onNew, theme, onTheme, readOnly }: {
  title: string; onMenu: () => void; onNew: () => void; theme: "dark" | "light"; onTheme: () => void; readOnly: boolean;
}) {
  return (
    <header className="topbar sticky top-0 z-20 flex h-16 items-center gap-3 px-4 sm:px-8">
      <button className="btn-ghost !px-2 lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu className="h-4 w-4" /></button>
      <h1 className="truncate text-[13px] text-slate-400"><span className="text-slate-500">DocuDiff /</span> <span className="text-white">{title}</span></h1>
      <div className="ml-auto flex items-center gap-2">
        {!readOnly && (
          <button className="btn-primary !px-3 !py-1.5 !text-xs" onClick={onNew}><FilePlus2 className="h-3.5 w-3.5" /> New comparison</button>
        )}
        <button className="btn-ghost !border-transparent !px-2 !py-1.5" onClick={onTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Light theme" : "Dark theme"}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
