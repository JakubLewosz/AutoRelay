import type { ExecutionStatus } from "../types/execution";

const styles: Record<ExecutionStatus, string> = {
  queued: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  running: "border-indigo-400/25 bg-indigo-400/10 text-indigo-200",
  succeeded: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  failed: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  skipped: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

export function StatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${styles[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}
