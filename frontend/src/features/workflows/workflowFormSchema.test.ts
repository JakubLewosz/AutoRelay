import { describe, expect, it } from "vitest";
import type { Workflow } from "../../types/workflow";
import {
  makeWorkflowFormSchema,
  toWorkflowInput,
  workflowFormDefaults,
} from "./workflowFormSchema";

describe("workflow form validation", () => {
  it("requires a numeric value for numeric conditions", () => {
    const values = {
      ...workflowFormDefaults(),
      name: "High-value lead",
      hasCondition: true,
      fieldPath: "lead.value",
      operator: "greater_than_or_equal" as const,
      comparisonValue: "many",
      targetUrl: "https://example.com/events",
    };
    const result = makeWorkflowFormSchema().safeParse(values);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["comparisonValue"] })]),
      );
    }
  });

  it("converts a valid condition and HTTP action to the API contract", () => {
    const input = toWorkflowInput({
      ...workflowFormDefaults(),
      name: "High-value lead",
      hasCondition: true,
      fieldPath: "lead.value",
      operator: "greater_than_or_equal",
      comparisonValue: "1000",
      targetUrl: "https://example.com/events",
      headersJson: '{"X-Source":"AutoRelay"}',
    });
    expect(input.condition).toEqual({
      field_path: "lead.value",
      operator: "greater_than_or_equal",
      comparison_value: 1000,
    });
    expect(input.action).toEqual({
      action_type: "HTTP_POST",
      config: {
        target_url: "https://example.com/events",
        headers: { "X-Source": "AutoRelay" },
        timeout_seconds: 10,
      },
    });
  });

  it("never reuses redacted secrets when preparing an edit", () => {
    const workflow = {
      id: "workflow-1",
      name: "Protected relay",
      description: "",
      is_enabled: true,
      webhook_url: "https://app.example/hooks/workflow-1/token",
      condition: null,
      action: {
        action_type: "HTTP_POST",
        config: {
          target_url: "https://receiver.example/••••••",
          target_url_configured: true,
          headers: { Authorization: "••••••" },
          timeout_seconds: 10,
        },
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } satisfies Workflow;

    const defaults = workflowFormDefaults(workflow);
    expect(defaults.targetUrl).toBe("");
    expect(defaults.headersJson).toBe("");
    const input = toWorkflowInput(defaults);
    expect(input.action.config).toEqual({ target_url: "", timeout_seconds: 10 });
  });

  it.each([
    ['"123"', "123"],
    ['""', ""],
    ["1e3", 1000],
  ])("parses the JSON scalar %s", (comparisonValue, expected) => {
    const values = {
      ...workflowFormDefaults(),
      name: "String comparison",
      hasCondition: true,
      fieldPath: "lead.code",
      operator: "equals" as const,
      comparisonValue,
      targetUrl: "https://example.com/events",
    };
    expect(makeWorkflowFormSchema().safeParse(values).success).toBe(true);
    expect(toWorkflowInput(values).condition?.comparison_value).toBe(expected);
  });

  it.each(["123", "null", "", "ordinary text"])(
    "preserves the existing string comparison %j through an edit",
    (comparisonValue) => {
      const workflow = {
        id: "workflow-1",
        name: "String-preserving relay",
        description: "",
        is_enabled: true,
        webhook_url: "https://app.example/hooks/workflow-1/token",
        condition: {
          field_path: "lead.code",
          operator: "equals" as const,
          comparison_value: comparisonValue,
        },
        action: {
          action_type: "HTTP_POST" as const,
          config: {
            target_url: "https://receiver.example/••••••",
            timeout_seconds: 10,
          },
        },
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      } satisfies Workflow;

      const defaults = workflowFormDefaults(workflow);
      expect(defaults.comparisonValue).toBe(JSON.stringify(comparisonValue));
      expect(makeWorkflowFormSchema("HTTP_POST").safeParse(defaults).success).toBe(true);
      expect(toWorkflowInput(defaults).condition?.comparison_value).toBe(comparisonValue);
    },
  );

  it("rejects an explicit null comparison before submission", () => {
    const result = makeWorkflowFormSchema().safeParse({
      ...workflowFormDefaults(),
      name: "Null comparison",
      hasCondition: true,
      fieldPath: "lead.value",
      operator: "equals",
      comparisonValue: "null",
      targetUrl: "https://example.com/events",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["comparisonValue"],
            message: "Comparison values cannot be null.",
          }),
        ]),
      );
    }
  });
});
