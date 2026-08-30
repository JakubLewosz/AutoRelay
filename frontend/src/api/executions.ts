import type { PaginatedResponse } from "../types/api";
import type { Execution, ExecutionStatus, ExecutionSummary } from "../types/execution";
import { apiRequest, toSearchParams } from "./client";

export type ExecutionListParams = {
  page?: number;
  page_size?: number;
  status?: ExecutionStatus;
  workflow_id?: string;
};

export const executionsApi = {
  list: (params: ExecutionListParams = {}) =>
    apiRequest<PaginatedResponse<ExecutionSummary>>(`/executions${toSearchParams(params)}`),
  get: (id: string) => apiRequest<Execution>(`/executions/${id}`),
  retry: (id: string) =>
    apiRequest<Execution>(`/executions/${id}/retry`, { method: "POST", csrf: true }),
};
