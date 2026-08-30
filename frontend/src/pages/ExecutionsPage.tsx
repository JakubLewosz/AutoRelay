import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, FilterX } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { executionsApi } from "../api/executions";
import { workflowsApi } from "../api/workflows";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingScreen } from "../components/LoadingScreen";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { Select } from "../components/FormField";
import { ExecutionTable } from "../features/executions/ExecutionTable";
import { executionStatuses, type ExecutionStatus } from "../types/execution";

const pageSize = 20;

export function ExecutionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const statusValue = searchParams.get("status") ?? "";
  const status = executionStatuses.includes(statusValue as ExecutionStatus)
    ? (statusValue as ExecutionStatus)
    : undefined;
  const workflowId = searchParams.get("workflow_id") ?? undefined;

  const executions = useQuery({
    queryKey: ["executions", { page, page_size: pageSize, status, workflow_id: workflowId }],
    queryFn: () =>
      executionsApi.list({ page, page_size: pageSize, status, workflow_id: workflowId }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => ["queued", "running"].includes(item.status))
        ? 3000
        : false,
  });
  const workflows = useQuery({
    queryKey: ["workflows", { page: 1, page_size: 100 }],
    queryFn: () => workflowsApi.list({ page: 1, page_size: 100 }),
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setSearchParams(next);
  };
  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage === 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  };

  if (executions.isPending || workflows.isPending)
    return <LoadingScreen label="Loading execution history" />;
  const error = executions.error ?? workflows.error;
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void executions.refetch();
          void workflows.refetch();
        }}
      />
    );
  const workflowItems = workflows.data?.items ?? [];
  const workflowNames = Object.fromEntries(
    workflowItems.map((workflow) => [workflow.id, workflow.name]),
  );
  const hasFilters = Boolean(status || workflowId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Delivery log"
        title="Execution history"
        description="Inspect every queued, delivered, failed, or skipped event without exposing action secrets."
      />
      <section className="rounded-xl border border-slate-800 bg-slate-900/45">
        <div className="grid gap-4 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-[14rem_18rem_auto]">
          <Select
            label="Status"
            value={status ?? ""}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {executionStatuses.map((item) => (
              <option key={item} value={item}>
                {item[0]?.toUpperCase()}
                {item.slice(1)}
              </option>
            ))}
          </Select>
          <Select
            label="Workflow"
            value={workflowId ?? ""}
            onChange={(event) => setFilter("workflow_id", event.target.value)}
          >
            <option value="">All workflows</option>
            {workflowItems.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </Select>
          {hasFilters ? (
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
                <FilterX className="size-4" /> Clear filters
              </Button>
            </div>
          ) : null}
        </div>
        {executions.data?.items.length ? (
          <>
            <ExecutionTable executions={executions.data.items} workflowNames={workflowNames} />
            <Pagination
              page={executions.data.page}
              pages={executions.data.pages}
              total={executions.data.total}
              onPageChange={setPage}
            />
          </>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={Activity}
              title={hasFilters ? "No matching executions" : "No execution history"}
              description={
                hasFilters
                  ? "Try a different workflow or status filter."
                  : "Executions will appear here after a workflow receives or tests an event."
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
