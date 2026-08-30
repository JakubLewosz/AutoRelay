import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { workflowsApi } from "../api/workflows";
import { ApiError } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { WorkflowForm } from "../features/workflows/WorkflowForm";
import type { WorkflowInput } from "../types/workflow";

export function CreateWorkflowPage() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({ mutationFn: workflowsApi.create });
  const submit = async (input: WorkflowInput) => {
    setError(null);
    try {
      const workflow = await mutation.mutateAsync(input);
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void navigate(`/workflows/${workflow.id}`, {
        replace: true,
        state: { justCreated: true },
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof ApiError
          ? submissionError.message
          : "The workflow could not be created.",
      );
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="New automation"
        title="Create workflow"
        description="Define the incoming event, optional rule, and single delivery destination."
      />
      <WorkflowForm onSubmit={submit} submitLabel="Create workflow" error={error} />
    </div>
  );
}
