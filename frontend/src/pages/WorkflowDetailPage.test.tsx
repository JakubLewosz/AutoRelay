import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executionsApi } from "../api/executions";
import { workflowsApi } from "../api/workflows";
import { renderWithProviders } from "../test/render";
import type { Workflow } from "../types/workflow";
import { WorkflowDetailPage } from "./WorkflowDetailPage";

vi.mock("../api/workflows", () => ({
  workflowsApi: {
    get: vi.fn(),
    update: vi.fn(),
    rotateToken: vi.fn(),
    remove: vi.fn(),
    test: vi.fn(),
  },
}));
vi.mock("../api/executions", () => ({ executionsApi: { list: vi.fn() } }));

const workflow: Workflow = {
  id: "workflow-1",
  name: "Disposable workflow",
  description: "",
  is_enabled: true,
  webhook_url: "https://app.example/api/v1/hooks/workflow-1/token",
  condition: null,
  action: {
    action_type: "HTTP_POST",
    config: { target_url: "https://receiver.example/••••••", timeout_seconds: 10 },
  },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("WorkflowDetailPage deletion", () => {
  beforeEach(() => {
    vi.mocked(workflowsApi.get).mockResolvedValue(workflow);
    vi.mocked(workflowsApi.remove).mockResolvedValue(undefined);
    vi.mocked(executionsApi.list).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
      pages: 0,
    });
  });

  it("keeps the webhook token out of the shell command example", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/workflows/:workflowId" element={<WorkflowDetailPage />} />
      </Routes>,
      { route: "/workflows/workflow-1" },
    );

    expect(await screen.findByRole("heading", { name: "Disposable workflow" })).toBeVisible();
    const exampleLabel = screen.getByText("Example cURL", { exact: true });
    const example = exampleLabel.parentElement?.querySelector("code");

    expect(example).not.toBeNull();
    expect(example).not.toHaveTextContent(workflow.webhook_url);
    expect(example).toHaveTextContent("read -r -s AUTORELAY_WEBHOOK_URL");
    expect(example).toHaveTextContent("curl --config -");
    expect(example).toHaveTextContent('url = "$AUTORELAY_WEBHOOK_URL"');
    expect(example).toHaveTextContent("unset AUTORELAY_WEBHOOK_URL");
  });

  it("removes the deleted workflow detail from query cache before navigating away", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { queryClient } = renderWithProviders(
      <Routes>
        <Route path="/workflows/:workflowId" element={<WorkflowDetailPage />} />
        <Route path="/workflows" element={<p>Workflow list ready</p>} />
      </Routes>,
      { route: "/workflows/workflow-1" },
    );
    expect(await screen.findByRole("heading", { name: "Disposable workflow" })).toBeVisible();
    expect(queryClient.getQueryData(["workflow", "workflow-1"])).toEqual(workflow);

    await userEvent.click(screen.getByRole("button", { name: "Delete workflow" }));

    expect(await screen.findByText("Workflow list ready")).toBeVisible();
    expect(workflowsApi.remove).toHaveBeenCalledWith("workflow-1");
    await waitFor(() =>
      expect(queryClient.getQueryData(["workflow", "workflow-1"])).toBeUndefined(),
    );
  });
});
