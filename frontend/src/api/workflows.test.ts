import { describe, expect, it, vi } from "vitest";
import type { WorkflowSummary } from "../types/workflow";
import { workflowsApi } from "./workflows";

function workflow(id: string): WorkflowSummary {
  return {
    id,
    name: `Workflow ${id}`,
    description: "",
    is_enabled: true,
    condition: null,
    action: { action_type: "HTTP_POST" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function page(items: WorkflowSummary[], pageNumber: number, pages: number) {
  return new Response(
    JSON.stringify({ items, total: pages * 2, page: pageNumber, page_size: 2, pages }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("workflowsApi.listOptions", () => {
  it("combines summary pages and reports when the configured bound truncates options", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(page([workflow("1"), workflow("2")], 1, 3))
      .mockResolvedValueOnce(page([workflow("3"), workflow("4")], 2, 3));

    const result = await workflowsApi.listOptions({ pageSize: 2, maxPages: 2 });

    expect(result.items.map((item) => item.id)).toEqual(["1", "2", "3", "4"]);
    expect(result.truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/workflows?page=2&page_size=2");
  });
});
