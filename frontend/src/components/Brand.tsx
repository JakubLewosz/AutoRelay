import { Link } from "react-router-dom";

export function Brand({ linked = true }: { linked?: boolean }) {
  const content = (
    <span className="inline-flex items-center gap-3">
      <span className="relative grid size-9 place-items-center rounded-xl bg-emerald-400 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(52,211,153,0.16)]">
        A
        <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-slate-950 bg-sky-400" />
      </span>
      <span className="text-lg font-semibold tracking-[-0.025em] text-white">AutoRelay</span>
    </span>
  );
  return linked ? (
    <Link to="/dashboard" aria-label="AutoRelay dashboard">
      {content}
    </Link>
  ) : (
    content
  );
}
