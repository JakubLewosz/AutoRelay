import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-12 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-11 place-items-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-100">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
