import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Clock3, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { executionsApi } from "../api/executions";
import { workflowsApi } from "../api/workflows";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { ErrorState } from "../components/ErrorState";
import { JsonViewer } from "../components/JsonViewer";
import { LoadingScreen } from "../components/LoadingScreen";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatDuration } from "../lib/format";

export function ExecutionDetailPage() {
  const { executionId = "" } = useParams();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const executionQuery = useQuery({
    queryKey: ["execution", executionId],
    queryFn: () => executionsApi.get(executionId),
    enabled: Boolean(executionId),
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.status ?? "") ? 2500 : false,
  });
  const workflowId = executionQuery.data?.workflow_id;
  const workflowQuery = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => workflowsApi.get(workflowId ?? ""),
    enabled: Boolean(workflowId),
  });
  const retryMutation = useMutation({ mutationFn: () => executionsApi.retry(executionId) });

  if (executionQuery.isPending) return <LoadingScreen label="Loading execution" />;
  if (executionQuery.error || !executionQuery.data)
    return (
      <ErrorState error={executionQuery.error} onRetry={() => void executionQuery.refetch()} />
    );
  const execution = executionQuery.data;
  const workflowName = execution.workflow_name ?? workflowQuery.data?.name ?? "Workflow";

  const retry = async () => {
    setRetryError(null);
    setFeedback(null);
    try {
      const retried = await retryMutation.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: ["executions"] });
      if (retried.id !== execution.id) {
        void navigate(`/executions/${retried.id}`, { replace: true });
      } else {
        await executionQuery.refetch();
        setFeedback("Execution queued for another attempt.");
      }
    } catch (error) {
      setRetryError(
        error instanceof ApiError ? error.message : "The execution could not be retried.",
      );
    }
  };

  const facts = [
    {
      label: "Received",
      value: formatDateTime(execution.queued_at ?? execution.created_at),
      icon: CalendarClock,
    },
    { label: "Duration", value: formatDuration(execution.duration_ms), icon: Clock3 },
    {
      label: "Attempts",
      value: `${execution.attempt_count} of ${execution.max_attempts}`,
      icon: RefreshCw,
    },
  ];

  return (
    <div className="space-y-8">
      <Link
        to="/executions"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white"
      >
        <ArrowLeft className="size-4" /> Execution history
      </Link>
      <PageHeader
        eyebrow="Execution details"
        title={`${workflowName} event`}
        description={`Execution ${execution.id}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={execution.status} />
            {execution.status === "failed" ? (
              <Button size="sm" busy={retryMutation.isPending} onClick={() => void retry()}>
                <RotateCcw className="size-4" /> Retry execution
              </Button>
            ) : null}
          </div>
        }
      />
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {retryError ? <Alert>{retryError}</Alert> : null}
      <section className="grid gap-3 sm:grid-cols-3">
        {facts.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <Icon className="size-4 text-sky-300" />
            <p className="mt-4 text-xs uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1.5 font-medium text-slate-200">{value}</p>
          </article>
        ))}
      </section>
      {execution.status === "failed" ? (
        <section className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-5">
          <h2 className="font-semibold text-rose-100">Safe error information</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-rose-200/60">Error code</dt>
            <dd className="font-mono text-rose-100">
              {execution.error_code ?? "unclassified_error"}
            </dd>
            <dt className="text-rose-200/60">Message</dt>
            <dd className="text-rose-100">
              {execution.error_message ?? "No additional safe details were recorded."}
            </dd>
          </dl>
        </section>
      ) : null}
      <section className="grid gap-6 xl:grid-cols-2">
        <JsonViewer label="Input JSON" value={execution.input_payload} />
        <JsonViewer label="Safe result" value={execution.safe_result} />
      </section>
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h2 className="font-semibold text-white">Timeline</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Timeline label="Queued" value={execution.queued_at} />
          <Timeline label="Started" value={execution.started_at} />
          <Timeline label="Completed" value={execution.completed_at} />
          <Timeline label="Next attempt" value={execution.next_attempt_at} />
        </dl>
      </section>
    </div>
  );
}

function Timeline({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1.5 text-slate-300">{formatDateTime(value)}</dd>
    </div>
  );
}
