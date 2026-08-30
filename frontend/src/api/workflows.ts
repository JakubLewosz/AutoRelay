import type { PaginatedResponse } from "../types/api";
import type { Workflow, WorkflowInput, WorkflowTestResponse } from "../types/workflow";
import { apiRequest, toSearchParams } from "./client";

export const workflowsApi = {
  list: (params: { page?: number; page_size?: number } = {}) =>
    apiRequest<PaginatedResponse<Workflow>>(`/workflows${toSearchParams(params)}`),
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
