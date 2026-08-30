import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ExternalLink, Pencil, Power, RotateCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { executionsApi } from "../api/executions";
import { workflowsApi } from "../api/workflows";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { CopyField } from "../components/CopyField";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingScreen } from "../components/LoadingScreen";
import { PageHeader } from "../components/PageHeader";
import { Textarea } from "../components/FormField";
import { ExecutionTable } from "../features/executions/ExecutionTable";
import { formatDateTime } from "../lib/format";

const samplePayload = JSON.stringify({ lead: { name: "Example Company", value: 1500 } }, null, 2);

export function WorkflowDetailPage() {
  const { workflowId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testPayload, setTestPayload] = useState(samplePayload);

  const workflowQuery = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => workflowsApi.get(workflowId),
    enabled: Boolean(workflowId),
    // The detail response carries the capability URL, so discard it as soon as
    // the owner leaves this screen instead of retaining it in the shared cache.
    gcTime: 0,
  });
  const executionsQuery = useQuery({
    queryKey: ["executions", { workflow_id: workflowId, page: 1, page_size: 10 }],
    queryFn: () => executionsApi.list({ workflow_id: workflowId, page: 1, page_size: 10 }),
    enabled: Boolean(workflowId),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => ["queued", "running"].includes(item.status))
        ? 3000
        : false,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] }),
      queryClient.invalidateQueries({ queryKey: ["workflows"] }),
      queryClient.invalidateQueries({ queryKey: ["executions"] }),
    ]);
  };
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => workflowsApi.update(workflowId, { is_enabled: enabled }),
    onSuccess: refresh,
  });
  const rotateMutation = useMutation({
    mutationFn: () => workflowsApi.rotateToken(workflowId),
    onSuccess: refresh,
  });
  const deleteMutation = useMutation({ mutationFn: () => workflowsApi.remove(workflowId) });
  const testMutation = useMutation({
    mutationFn: (payload: unknown) => workflowsApi.test(workflowId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["executions"] });
    },
  });

  if (workflowQuery.isPending) return <LoadingScreen label="Loading workflow" />;
  if (workflowQuery.error || !workflowQuery.data)
    return <ErrorState error={workflowQuery.error} onRetry={() => void workflowQuery.refetch()} />;
  const workflow = workflowQuery.data;
  const actionConfig = workflow.action.safe_display_config ?? workflow.action.config ?? {};
  const locationState = location.state as { justCreated?: boolean; updated?: boolean } | null;
  const curl = [
    "printf 'Webhook URL: '",
    "read -r -s AUTORELAY_WEBHOOK_URL",
    "printf '\\n'",
    "curl --config - <<EOF",
    'url = "$AUTORELAY_WEBHOOK_URL"',
    'request = "POST"',
    'header = "Content-Type: application/json"',
    'data = "{\\"lead\\":{\\"name\\":\\"Example Company\\",\\"value\\":1500}}"',
    "EOF",
    "unset AUTORELAY_WEBHOOK_URL",
  ].join("\n");

  const runAction = async (operation: () => Promise<unknown>, success: string) => {
    setError(null);
    setFeedback(null);
    try {
      await operation();
      setFeedback(success);
    } catch (operationError) {
      setError(
        operationError instanceof ApiError
          ? operationError.message
          : "The operation could not be completed.",
      );
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${workflow.name}” and its configuration? This cannot be undone.`))
      return;
    await runAction(async () => {
      await deleteMutation.mutateAsync();
      const detailQuery = { queryKey: ["workflow", workflowId], exact: true } as const;
      await queryClient.cancelQueries(detailQuery);
      void navigate("/workflows", { replace: true, flushSync: true });
      queryClient.removeQueries(detailQuery);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["executions"] }),
      ]);
    }, "Workflow deleted.");
  };
  const rotate = async () => {
    if (
      !window.confirm(
        "Rotate this webhook token? The current webhook URL will stop working immediately.",
      )
    )
      return;
    await runAction(
      () => rotateMutation.mutateAsync(),
      "Webhook token rotated. Update every sender with the new URL.",
    );
  };
  const sendTest = async () => {
    setError(null);
    setFeedback(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(testPayload) as unknown;
    } catch {
      setError("The test payload must be valid JSON.");
      return;
    }
    await runAction(
      () => testMutation.mutateAsync(parsed),
      "Test execution queued. Its status will update below.",
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workflow"
        title={workflow.name}
        description={workflow.description || "No description provided."}
        actions={
          <>
            <Link
              to={`/workflows/${workflow.id}/edit`}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm font-semibold text-slate-100 hover:bg-slate-700"
            >
              <Pencil className="size-4" /> Edit
            </Link>
            <Button
              size="sm"
              variant="secondary"
              busy={toggleMutation.isPending}
              onClick={() =>
                void runAction(
                  () => toggleMutation.mutateAsync(!workflow.is_enabled),
                  workflow.is_enabled ? "Workflow disabled." : "Workflow enabled.",
                )
              }
            >
              <Power className="size-4" /> {workflow.is_enabled ? "Disable" : "Enable"}
            </Button>
          </>
        }
      />

      {locationState?.justCreated ? (
        <Alert tone="success">
          Workflow created. Connect the webhook URL below to start receiving events.
        </Alert>
      ) : null}
      {locationState?.updated ? <Alert tone="success">Workflow settings saved.</Alert> : null}
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(19rem,0.6fr)]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white">Incoming webhook</h2>
              <p className="mt-1 text-sm text-slate-500">
                Treat this URL as a secret and send JSON only.
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${workflow.is_enabled ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-slate-600 text-slate-400"}`}
            >
              {workflow.is_enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="mt-6 space-y-5">
            <CopyField label="Webhook URL" value={workflow.webhook_url} />
            <CopyField label="Example cURL" value={curl} />
          </div>
          <div className="mt-5 border-t border-slate-800 pt-5">
            <Button
              variant="secondary"
              size="sm"
              busy={rotateMutation.isPending}
              onClick={() => void rotate()}
            >
              <RotateCw className="size-4" /> Rotate webhook token
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
          <h2 className="font-semibold text-white">Configuration</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Condition</dt>
              <dd className="mt-1.5 text-slate-200">
                {workflow.condition
                  ? `${workflow.condition.field_path} · ${workflow.condition.operator.replaceAll("_", " ")}${workflow.condition.comparison_value == null ? "" : ` · ${JSON.stringify(workflow.condition.comparison_value)}`}`
                  : "Always run"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Action</dt>
              <dd className="mt-1.5 text-slate-200">
                {workflow.action.action_type === "HTTP_POST" ? "HTTP POST" : "Discord webhook"}
              </dd>
            </div>
            {typeof actionConfig.target_url === "string" ? (
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">Destination</dt>
                <dd className="mt-1.5 break-all text-slate-300">{actionConfig.target_url}</dd>
              </div>
            ) : null}
            {typeof actionConfig.message_template === "string" ? (
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">Template</dt>
                <dd className="mt-1.5 text-slate-300">{actionConfig.message_template}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Updated</dt>
              <dd className="mt-1.5 text-slate-300">{formatDateTime(workflow.updated_at)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-white">Queue a test event</h2>
            <p className="mt-1 text-sm text-slate-500">
              Test events use the same worker and action path as incoming webhooks.
            </p>
          </div>
          <Button size="sm" busy={testMutation.isPending} onClick={() => void sendTest()}>
            <ExternalLink className="size-4" /> Send test
          </Button>
        </div>
        <div className="mt-5">
          <Textarea
            label="JSON payload"
            className="min-h-40 font-mono text-xs"
            value={testPayload}
            onChange={(event) => setTestPayload(event.target.value)}
          />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Recent executions</h2>
            <p className="mt-1 text-sm text-slate-500">Latest activity for this workflow.</p>
          </div>
          <Link
            to={`/executions?workflow_id=${workflow.id}`}
            className="text-sm font-semibold text-sky-300 hover:text-sky-200"
          >
            View history
          </Link>
        </div>
        {executionsQuery.isPending ? (
          <LoadingScreen label="Loading recent executions" />
        ) : executionsQuery.error ? (
          <ErrorState
            error={executionsQuery.error}
            onRetry={() => void executionsQuery.refetch()}
          />
        ) : executionsQuery.data.items.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/45">
            <ExecutionTable
              executions={executionsQuery.data.items}
              workflowNames={{ [workflow.id]: workflow.name }}
            />
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="No events received"
            description="Send a test above or post JSON to the incoming webhook URL."
          />
        )}
      </section>

      <section className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <h2 className="font-semibold text-rose-100">Delete workflow</h2>
          <p className="mt-1 text-sm leading-6 text-rose-200/65">
            Stop accepting this webhook and remove its configuration.
          </p>
        </div>
        <Button
          variant="danger"
          size="sm"
          className="mt-4 sm:mt-0"
          busy={deleteMutation.isPending}
          onClick={() => void remove()}
        >
          <Trash2 className="size-4" /> Delete workflow
        </Button>
      </section>
    </div>
  );
}
