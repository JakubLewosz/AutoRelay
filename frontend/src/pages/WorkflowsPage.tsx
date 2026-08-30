import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, GitBranch, Plus, Webhook, Zap } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { workflowsApi } from "../api/workflows";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingScreen } from "../components/LoadingScreen";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { formatRelativeTime } from "../lib/format";

export function WorkflowsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 12;
  const query = useQuery({
    queryKey: ["workflows", { page, page_size: pageSize }],
    queryFn: () => workflowsApi.list({ page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  });
  if (query.isPending) return <LoadingScreen label="Loading workflows" />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const workflows = query.data?.items ?? [];
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Automations"
        title="Workflows"
        description="One incoming webhook, an optional condition, and one dependable action."
        actions={
          <Link
            to="/workflows/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            <Plus className="size-4" aria-hidden="true" /> New workflow
          </Link>
        }
      />
      {workflows.length ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Workflow list">
            {workflows.map((workflow) => (
              <article
                key={workflow.id}
                className="group rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-slate-700 hover:bg-slate-900/75"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-10 place-items-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-sky-300">
                    <Webhook className="size-5" aria-hidden="true" />
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${workflow.is_enabled ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-slate-600 bg-slate-700/30 text-slate-400"}`}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {workflow.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <h2 className="mt-5 text-base font-semibold text-white">{workflow.name}</h2>
                <p className="mt-2 min-h-10 line-clamp-2 text-sm leading-5 text-slate-400">
                  {workflow.description || "No description provided."}
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-950/60 px-2 py-1">
                    <GitBranch className="size-3.5" />
                    {workflow.condition ? "1 condition" : "No condition"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-950/60 px-2 py-1">
                    <Zap className="size-3.5" />
                    {workflow.action.action_type === "HTTP_POST" ? "HTTP POST" : "Discord"}
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
                  <span className="text-xs text-slate-600">
                    Updated {formatRelativeTime(workflow.updated_at)}
                  </span>
                  <Link
                    to={`/workflows/${workflow.id}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-sky-300 hover:text-sky-200"
                  >
                    Open <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </section>
          {query.data.pages > 1 ? (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/45">
              <Pagination
                page={query.data.page}
                pages={query.data.pages}
                total={query.data.total}
                onPageChange={(nextPage) =>
                  setSearchParams(nextPage === 1 ? {} : { page: String(nextPage) })
                }
              />
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={Webhook}
          title="Build your first workflow"
          description="Create a unique webhook URL, add an optional JSON condition, and choose one delivery action."
          action={
            <Link
              to="/workflows/new"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950"
            >
              <Plus className="size-4" /> New workflow
            </Link>
          }
        />
      )}
    </div>
  );
}
