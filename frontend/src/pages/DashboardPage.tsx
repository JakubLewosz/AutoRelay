import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Plus, Webhook, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { dashboardApi } from "../api/dashboard";
import { workflowsApi } from "../api/workflows";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingScreen } from "../components/LoadingScreen";
import { PageHeader } from "../components/PageHeader";
import { ExecutionTable } from "../features/executions/ExecutionTable";
import { useAuth } from "../features/auth/AuthProvider";

export function DashboardPage() {
  const { user } = useAuth();
  const workflows = useQuery({
    queryKey: ["workflows", { page: 1, page_size: 100 }],
    queryFn: () => workflowsApi.list({ page: 1, page_size: 100 }),
  });
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: dashboardApi.get });

  if (workflows.isPending || dashboard.isPending)
    return <LoadingScreen label="Loading your dashboard" />;
  const error = workflows.error ?? dashboard.error;
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void workflows.refetch();
          void dashboard.refetch();
        }}
      />
    );

  const workflowItems = workflows.data?.items ?? [];
  const recentItems = dashboard.data?.recent_executions ?? [];
  const workflowNames = Object.fromEntries(
    workflowItems.map((workflow) => [workflow.id, workflow.name]),
  );
  const firstName = user?.email.split("@")[0] ?? "there";

  const stats = [
    {
      label: "Total workflows",
      value: dashboard.data?.total_workflows ?? 0,
      icon: Webhook,
      color: "text-sky-300 bg-sky-400/10",
    },
    {
      label: "Enabled workflows",
      value: dashboard.data?.enabled_workflows ?? 0,
      icon: Zap,
      color: "text-emerald-300 bg-emerald-400/10",
    },
    {
      label: "Executions · 24h",
      value: dashboard.data?.executions_last_24_hours ?? 0,
      icon: Clock3,
      color: "text-indigo-300 bg-indigo-400/10",
    },
    {
      label: "Succeeded",
      value: dashboard.data?.succeeded_executions ?? 0,
      icon: CheckCircle2,
      color: "text-emerald-300 bg-emerald-400/10",
    },
    {
      label: "Failed",
      value: dashboard.data?.failed_executions ?? 0,
      icon: AlertTriangle,
      color: "text-rose-300 bg-rose-400/10",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={`Good to see you, ${firstName}`}
        description="Monitor your automations and the events moving through them."
        actions={
          <Link
            to="/workflows/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            <Plus className="size-4" aria-hidden="true" /> Create workflow
          </Link>
        }
      />
      <section aria-label="Dashboard summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <article key={label} className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
            <span className={`grid size-9 place-items-center rounded-lg ${color}`}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <p className="mt-5 text-2xl font-semibold tracking-tight text-white">{value}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
          </article>
        ))}
      </section>
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Recent executions</h2>
            <p className="mt-1 text-sm text-slate-500">
              The newest delivery activity across your workflows.
            </p>
          </div>
          <Link to="/executions" className="text-sm font-semibold text-sky-300 hover:text-sky-200">
            View all
          </Link>
        </div>
        {recentItems.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/45">
            <ExecutionTable executions={recentItems.slice(0, 6)} workflowNames={workflowNames} />
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="No executions yet"
            description="Create a workflow and send an event to its webhook to see delivery history here."
            action={
              <Link
                to="/workflows/new"
                className="text-sm font-semibold text-emerald-300 hover:text-emerald-200"
              >
                Create your first workflow
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
