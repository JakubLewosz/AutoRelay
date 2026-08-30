import { z } from "zod";
import type {
  ConditionOperator,
  SafeActionConfig,
  Workflow,
  WorkflowInput,
} from "../../types/workflow";

const dotPathPattern = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const discordHosts = new Set([
  "discord.com",
  "canary.discord.com",
  "ptb.discord.com",
  "discordapp.com",
]);

export type WorkflowFormValues = {
  name: string;
  description: string;
  isEnabled: boolean;
  hasCondition: boolean;
  fieldPath: string;
  operator: ConditionOperator;
  comparisonValue: string;
  actionType: "HTTP_POST" | "DISCORD_WEBHOOK";
  targetUrl: string;
  headersJson: string;
  timeoutSeconds: number;
  discordWebhookUrl: string;
  messageTemplate: string;
};

function isHttpUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isDiscordWebhook(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      discordHosts.has(url.hostname.toLowerCase()) &&
      (url.port === "" || url.port === "443") &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /^\/api(?:\/v\d+)?\/webhooks\/[0-9]+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function makeWorkflowFormSchema(preservedActionType?: "HTTP_POST" | "DISCORD_WEBHOOK") {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Enter at least 2 characters.")
        .max(120, "Use no more than 120 characters."),
      description: z.string().trim().max(500, "Use no more than 500 characters."),
      isEnabled: z.boolean(),
      hasCondition: z.boolean(),
      fieldPath: z.string(),
      operator: z.enum([
        "equals",
        "not_equals",
        "contains",
        "greater_than",
        "greater_than_or_equal",
        "less_than",
        "less_than_or_equal",
        "exists",
        "does_not_exist",
      ]),
      comparisonValue: z.string(),
      actionType: z.enum(["HTTP_POST", "DISCORD_WEBHOOK"]),
      targetUrl: z.string(),
      headersJson: z.string(),
      timeoutSeconds: z.coerce
        .number()
        .int()
        .min(1, "Minimum timeout is 1 second.")
        .max(30, "Maximum timeout is 30 seconds."),
      discordWebhookUrl: z.string(),
      messageTemplate: z.string(),
    })
    .superRefine((values, context) => {
      if (values.hasCondition) {
        if (!dotPathPattern.test(values.fieldPath.trim())) {
          context.addIssue({
            code: "custom",
            path: ["fieldPath"],
            message: "Use a safe dot path such as lead.value.",
          });
        }
        if (
          !["exists", "does_not_exist"].includes(values.operator) &&
          !values.comparisonValue.trim()
        ) {
          context.addIssue({
            code: "custom",
            path: ["comparisonValue"],
            message: "Enter a comparison value.",
          });
        }
        if (
          !["exists", "does_not_exist"].includes(values.operator) &&
          values.comparisonValue.trim() === "null"
        ) {
          context.addIssue({
            code: "custom",
            path: ["comparisonValue"],
            message: "Comparison values cannot be null.",
          });
        }
        if (values.comparisonValue.trim().startsWith('"')) {
          try {
            if (typeof JSON.parse(values.comparisonValue.trim()) !== "string") throw new Error();
          } catch {
            context.addIssue({
              code: "custom",
              path: ["comparisonValue"],
              message: 'Use valid JSON string syntax, for example "123" or "".',
            });
          }
        }
        if (
          ["greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"].includes(
            values.operator,
          ) &&
          !Number.isFinite(Number(values.comparisonValue))
        ) {
          context.addIssue({
            code: "custom",
            path: ["comparisonValue"],
            message: "Numeric comparisons require a number.",
          });
        }
      }

      if (values.actionType === "HTTP_POST") {
        if (
          !(preservedActionType === "HTTP_POST" && !values.targetUrl.trim()) &&
          !isHttpUrl(values.targetUrl)
        ) {
          context.addIssue({
            code: "custom",
            path: ["targetUrl"],
            message: "Enter a valid HTTP or HTTPS URL.",
          });
        }
        if (values.headersJson.trim()) {
          try {
            const parsed = JSON.parse(values.headersJson) as unknown;
            if (
              !parsed ||
              Array.isArray(parsed) ||
              typeof parsed !== "object" ||
              Object.values(parsed).some((value) => typeof value !== "string")
            ) {
              throw new Error("invalid");
            }
          } catch {
            context.addIssue({
              code: "custom",
              path: ["headersJson"],
              message: "Use a JSON object with string values.",
            });
          }
        }
      }

      if (values.actionType === "DISCORD_WEBHOOK") {
        if (
          !(preservedActionType === "DISCORD_WEBHOOK" && !values.discordWebhookUrl.trim()) &&
          !isDiscordWebhook(values.discordWebhookUrl)
        ) {
          context.addIssue({
            code: "custom",
            path: ["discordWebhookUrl"],
            message: "Enter a recognised Discord webhook URL.",
          });
        }
        if (!values.messageTemplate.trim()) {
          context.addIssue({
            code: "custom",
            path: ["messageTemplate"],
            message: "Enter a message template.",
          });
        }
        if (values.messageTemplate.length > 2000) {
          context.addIssue({
            code: "custom",
            path: ["messageTemplate"],
            message: "Use no more than 2,000 characters.",
          });
        }
      }
    });
}

function parseComparison(value: string, operator: ConditionOperator): unknown {
  if (["exists", "does_not_exist"].includes(operator)) return null;
  if (
    ["greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"].includes(operator)
  )
    return Number(value);
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

export function toWorkflowInput(values: WorkflowFormValues): WorkflowInput {
  const condition = values.hasCondition
    ? {
        field_path: values.fieldPath.trim(),
        operator: values.operator,
        comparison_value: parseComparison(values.comparisonValue, values.operator),
      }
    : null;

  const config =
    values.actionType === "HTTP_POST"
      ? {
          target_url: values.targetUrl.trim(),
          ...(values.headersJson.trim()
            ? { headers: JSON.parse(values.headersJson) as Record<string, string> }
            : {}),
          timeout_seconds: values.timeoutSeconds,
        }
      : {
          webhook_url: values.discordWebhookUrl.trim(),
          message_template: values.messageTemplate,
        };

  return {
    name: values.name.trim(),
    description: values.description.trim(),
    is_enabled: values.isEnabled,
    condition,
    action: { action_type: values.actionType, config },
  };
}

function displayConfig(workflow?: Workflow): SafeActionConfig {
  return workflow?.action.safe_display_config ?? workflow?.action.config ?? {};
}

export function workflowFormDefaults(workflow?: Workflow): WorkflowFormValues {
  const config = displayConfig(workflow);
  const headers = config.headers ?? config.custom_headers;
  const comparison = workflow?.condition?.comparison_value;
  return {
    name: workflow?.name ?? "",
    description: workflow?.description ?? "",
    isEnabled: workflow?.is_enabled ?? true,
    hasCondition: Boolean(workflow?.condition),
    fieldPath: workflow?.condition?.field_path ?? "",
    operator: workflow?.condition?.operator ?? "equals",
    comparisonValue:
      comparison === undefined || comparison === null ? "" : JSON.stringify(comparison),
    actionType: workflow?.action.action_type ?? "HTTP_POST",
    targetUrl: workflow ? "" : (config.target_url ?? ""),
    headersJson: workflow ? "" : headers ? JSON.stringify(headers, null, 2) : "",
    timeoutSeconds: config.timeout_seconds ?? 10,
    discordWebhookUrl: workflow ? "" : (config.webhook_url ?? ""),
    messageTemplate: config.message_template ?? "New event from {{lead.name}}",
  };
}
