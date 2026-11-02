import { Loader2 } from "lucide-react";

export default function ResultSkeleton({ status }: { status?: string }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="card flex items-center gap-3 text-sm text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
        {status === "running" ? "Comparing documents — extracting text, measuring layout, rendering pages…" : "Queued — starting shortly…"}
      </div>
      <div className="card">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="skeleton h-32 w-32 shrink-0 !rounded-full" />
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16" />)}
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-64" />)}
      </div>
    </div>
  );
}
