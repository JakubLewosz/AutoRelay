import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { workflowsApi } from "../api/workflows";
import { ErrorState } from "../components/ErrorState";
import { LoadingScreen } from "../components/LoadingScreen";
import { PageHeader } from "../components/PageHeader";
import { WorkflowForm } from "../features/workflows/WorkflowForm";
import type { WorkflowInput } from "../types/workflow";

export function EditWorkflowPage() {
  const { workflowId = "" } = useParams();
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => workflowsApi.get(workflowId),
    enabled: Boolean(workflowId),
  });
  const mutation = useMutation({
    mutationFn: (input: WorkflowInput) => workflowsApi.update(workflowId, input),
  });

  if (query.isPending) return <LoadingScreen label="Loading workflow" />;
  if (query.error || !query.data)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const submit = async (input: WorkflowInput) => {
    setError(null);
    try {
      await mutation.mutateAsync(input);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] }),
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
      ]);
      void navigate(`/workflows/${workflowId}`, { replace: true, state: { updated: true } });
    } catch (submissionError) {
      setError(
        submissionError instanceof ApiError
          ? submissionError.message
          : "The workflow could not be updated.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Workflow settings"
        title={`Edit ${query.data.name}`}
        description="Protected action values can be left empty to preserve their current encrypted values."
      />
      <WorkflowForm
        workflow={query.data}
        onSubmit={submit}
        submitLabel="Save changes"
        error={error}
      />
    </div>
  );
}
