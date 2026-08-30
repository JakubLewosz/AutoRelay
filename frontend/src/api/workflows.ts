import type { PaginatedResponse } from "../types/api";
import type {
  Workflow,
  WorkflowInput,
  WorkflowSummary,
  WorkflowTestResponse,
} from "../types/workflow";
import { apiRequest, toSearchParams } from "./client";

const listWorkflows = (params: { page?: number; page_size?: number } = {}) =>
  apiRequest<PaginatedResponse<WorkflowSummary>>(`/workflows${toSearchParams(params)}`);

async function listWorkflowOptions({
  pageSize = 100,
  maxPages = 20,
}: { pageSize?: number; maxPages?: number } = {}) {
  const pageLimit = Math.max(1, maxPages);
  const firstPage = await listWorkflows({ page: 1, page_size: pageSize });
  const items = [...firstPage.items];
  for (let page = 2; page <= Math.min(firstPage.pages, pageLimit); page += 1) {
    const response = await listWorkflows({ page, page_size: pageSize });
    items.push(...response.items);
  }
  return { items, truncated: firstPage.pages > pageLimit };
}

export const workflowsApi = {
  list: listWorkflows,
  listOptions: listWorkflowOptions,
  get: (id: string) => apiRequest<Workflow>(`/workflows/${id}`),
  create: (input: WorkflowInput) =>
    apiRequest<Workflow>("/workflows", { method: "POST", body: input, csrf: true }),
  update: (id: string, input: Partial<WorkflowInput>) =>
    apiRequest<Workflow>(`/workflows/${id}`, { method: "PATCH", body: input, csrf: true }),
  remove: (id: string) => apiRequest<void>(`/workflows/${id}`, { method: "DELETE", csrf: true }),
  rotateToken: (id: string) =>
    apiRequest<Workflow>(`/workflows/${id}/rotate-token`, { method: "POST", csrf: true }),
  test: (id: string, payload: unknown) =>
    apiRequest<WorkflowTestResponse>(`/workflows/${id}/test`, {
      method: "POST",
      body: { payload },
      csrf: true,
    }),
};
