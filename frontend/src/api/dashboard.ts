import type { ExecutionSummary } from "../types/execution";
import { apiRequest } from "./client";

export type DashboardSummary = {
  total_workflows: number;
  enabled_workflows: number;
  executions_last_24_hours: number;
  succeeded_executions: number;
  failed_executions: number;
  recent_executions: ExecutionSummary[];
};

export const dashboardApi = {
  get: () => apiRequest<DashboardSummary>("/dashboard"),
};
