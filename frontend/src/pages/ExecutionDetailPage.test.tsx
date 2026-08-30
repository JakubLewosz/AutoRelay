import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executionsApi } from "../api/executions";
import { workflowsApi } from "../api/workflows";
import { renderWithProviders } from "../test/render";
import type { Execution } from "../types/execution";
import type { Workflow } from "../types/workflow";
import { ExecutionDetailPage } from "./ExecutionDetailPage";

vi.mock("../api/executions", () => ({ executionsApi: { get: vi.fn(), retry: vi.fn() } }));
vi.mock("../api/workflows", () => ({ workflowsApi: { get: vi.fn() } }));

const failedExecution: Execution = {
  id: "execution-1",
  workflow_id: "workflow-1",
  workflow_name: "Lead relay",
  status: "failed",
  trigger_type: "webhook",
  input_payload: { lead: { value: 1500 } },
  safe_result: { status_code: 503 },
  error_code: "target_unavailable",
  error_message: "The target returned a retryable response.",
  attempt_count: 3,
  max_attempts: 3,
  next_attempt_at: null,
  queued_at: "2026-01-01T00:00:00Z",
  started_at: "2026-01-01T00:00:01Z",
  completed_at: "2026-01-01T00:00:02Z",
  duration_ms: 1000,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:02Z",
};

describe("ExecutionDetailPage", () => {
  beforeEach(() => {
    vi.mocked(executionsApi.get).mockResolvedValue(failedExecution);
    vi.mocked(executionsApi.retry).mockResolvedValue(failedExecution);
    vi.mocked(workflowsApi.get).mockResolvedValue({ name: "Lead relay" } as Workflow);
  });

  it("shows safe failure details and retries a failed execution", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/executions/:executionId" element={<ExecutionDetailPage />} />
      </Routes>,
      { route: "/executions/execution-1" },
    );
    expect(await screen.findByText("target_unavailable")).toBeVisible();
    expect(screen.getByText("The target returned a retryable response.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /retry execution/i }));
    expect(executionsApi.retry).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Execution queued for another attempt.")).toBeVisible();
  });
});
