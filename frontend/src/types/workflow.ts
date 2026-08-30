export const conditionOperators = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "exists",
  "does_not_exist",
] as const;

export type ConditionOperator = (typeof conditionOperators)[number];
export type ActionType = "HTTP_POST" | "DISCORD_WEBHOOK";

export type WorkflowCondition = {
  id?: string;
  field_path: string;
  operator: ConditionOperator;
  comparison_value?: unknown;
};

export type SafeActionConfig = Record<string, unknown> & {
  target_url?: string;
  webhook_url?: string;
  message_template?: string;
  timeout_seconds?: number;
  headers?: Record<string, string>;
  custom_headers?: Record<string, string>;
};

export type WorkflowAction = {
  id?: string;
  action_type: ActionType;
  safe_display_config?: SafeActionConfig;
  config?: SafeActionConfig;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  is_enabled: boolean;
  webhook_url: string;
  condition: WorkflowCondition | null;
  action: WorkflowAction;
  created_at: string;
  updated_at: string;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  description: string;
  is_enabled: boolean;
  condition: WorkflowCondition | null;
  action: Pick<WorkflowAction, "action_type">;
  created_at: string;
  updated_at: string;
};

export type HttpPostActionConfig = {
  target_url: string;
  headers?: Record<string, string>;
  timeout_seconds: number;
};

export type DiscordActionConfig = {
  webhook_url: string;
  message_template: string;
};

export type WorkflowInput = {
  name: string;
  description: string;
  is_enabled: boolean;
  condition: Omit<WorkflowCondition, "id"> | null;
  action: {
    action_type: ActionType;
    config: HttpPostActionConfig | DiscordActionConfig;
  };
};

export type WorkflowTestResponse = {
  execution_id: string;
  status: "queued";
};
