import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDuration, formatRelativeTime } from "../../lib/format";
import type { ExecutionSummary } from "../../types/execution";
import { StatusBadge } from "../../components/StatusBadge";

export function ExecutionTable({
  executions,
  workflowNames = {},
}: {
  executions: ExecutionSummary[];
  workflowNames?: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead className="border-b border-slate-800 bg-slate-950/30 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Workflow</th>
            <th className="px-4 py-3 font-medium">Received</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            <th className="px-4 py-3 font-medium">Attempts</th>
            <th className="px-4 py-3 font-medium">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {executions.map((execution) => (
            <tr key={execution.id} className="transition hover:bg-slate-800/25">
              <td className="px-4 py-3.5">
                <StatusBadge status={execution.status} />
              </td>
              <td className="px-4 py-3.5">
                <Link
                  to={`/workflows/${execution.workflow_id}`}
                  className="font-medium text-slate-200 hover:text-emerald-300"
                >
                  {execution.workflow_name ?? workflowNames[execution.workflow_id] ?? "Workflow"}
                </Link>
              </td>
              <td className="px-4 py-3.5 text-slate-400" title={execution.created_at}>
                {formatRelativeTime(execution.created_at)}
              </td>
              <td className="px-4 py-3.5 font-mono text-xs text-slate-400">
                {formatDuration(execution.duration_ms)}
              </td>
              <td className="px-4 py-3.5 text-slate-400">
                {execution.attempt_count} / {execution.max_attempts}
              </td>
              <td className="px-4 py-3.5 text-right">
                <Link
                  to={`/executions/${execution.id}`}
                  aria-label={`View execution ${execution.id}`}
                  className="inline-grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
                >
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
