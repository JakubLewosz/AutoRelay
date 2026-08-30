export const executionStatuses = ["queued", "running", "succeeded", "failed", "skipped"] as const;
export type ExecutionStatus = (typeof executionStatuses)[number];

export type Execution = {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  retry_of_execution_id?: string | null;
  status: ExecutionStatus;
  trigger_type: string;
  input_payload: unknown;
  safe_result: unknown;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
};
