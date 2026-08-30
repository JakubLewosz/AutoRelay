import { expect, test, type Route } from "@playwright/test";

const timestamp = "2026-08-30T10:00:00Z";
const workflow = {
  id: "workflow-1",
  name: "High-value lead",
  description: "Notify the receiver when a valuable lead arrives.",
  is_enabled: true,
  webhook_url: "http://127.0.0.1:8000/api/v1/hooks/workflow-1/demo-token",
  condition: {
    id: "condition-1",
    field_path: "lead.value",
    operator: "greater_than_or_equal",
    comparison_value: 1000,
  },
  action: {
    id: "action-1",
    action_type: "HTTP_POST",
    config: { target_url: "https://receiver.example/events", timeout_seconds: 10 },
  },
  created_at: timestamp,
  updated_at: timestamp,
};

const execution = {
  id: "execution-1",
  workflow_id: workflow.id,
  workflow_name: workflow.name,
  status: "succeeded",
  trigger_type: "webhook",
  input_payload: { lead: { name: "Example Company", value: 1500 } },
  safe_result: { status_code: 204 },
  error_code: null,
  error_message: null,
  attempt_count: 1,
  max_attempts: 3,
  next_attempt_at: null,
  queued_at: timestamp,
  started_at: timestamp,
  completed_at: timestamp,
  duration_ms: 83,
  created_at: timestamp,
  updated_at: timestamp,
};

const pageResponse = <T>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 20,
  pages: items.length ? 1 : 0,
});

async function apiMock(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const json = (body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  if (path.endsWith("/auth/me")) return json({ error: { message: "Not authenticated" } }, 401);
  if (path.endsWith("/auth/login")) {
    return json({
      user: {
        id: "user-1",
        email: "demo@example.com",
        is_active: true,
        created_at: timestamp,
        last_login_at: timestamp,
      },
      csrf_token: "csrf-for-browser-test",
    });
  }
  if (path.endsWith("/dashboard")) {
    return json({
      total_workflows: 1,
      enabled_workflows: 1,
      executions_last_24_hours: 1,
      succeeded_executions: 1,
      failed_executions: 0,
      recent_executions: [execution],
    });
  }
  if (path.endsWith("/workflows") && request.method() === "POST") {
    expect(request.headers()["x-csrf-token"]).toBe("csrf-for-browser-test");
    const input = request.postDataJSON() as { name: string; condition: { field_path: string } };
    expect(input.name).toBe("High-value lead");
    expect(input.condition.field_path).toBe("lead.value");
    return json(workflow, 201);
  }
  if (path.endsWith("/workflows") && request.method() === "GET") {
    return json({ ...pageResponse([workflow]), page_size: 100 });
  }
  if (path.endsWith(`/workflows/${workflow.id}`)) return json(workflow);
  if (path.endsWith("/executions")) return json(pageResponse([execution]));
  return json({ error: { message: `Unhandled test request: ${path}` } }, 500);
}

test("login, create a workflow, inspect its webhook, and view execution history", async ({
  page,
}) => {
  await page.route("**/api/v1/**", apiMock);
  await page.goto("/login");

  await page.getByLabel("Email address").fill("demo@example.com");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();

  await page.getByRole("link", { name: "Create workflow" }).click();
  await page.getByLabel("Name").fill("High-value lead");
  await page.getByLabel("Description").fill(workflow.description);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /Add a condition/ }).check();
  await page.getByLabel(/JSON field path/).fill("lead.value");
  await page.getByLabel("Operator").selectOption("greater_than_or_equal");
  await page.getByLabel(/Comparison value/).fill("1000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/Target URL/).fill("https://receiver.example/events");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review workflow" })).toBeVisible();
  await page.getByRole("button", { name: "Create workflow" }).click();

  await expect(page.getByRole("heading", { name: "High-value lead" })).toBeVisible();
  await expect(page.getByText("Webhook URL", { exact: true })).toBeVisible();
  await expect(page.getByText(workflow.webhook_url, { exact: true })).toBeVisible();
  await expect(page.getByText("Example cURL", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Workflows", exact: true }).click();
  await page.getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: "High-value lead" })).toBeVisible();

  await page.getByRole("link", { name: "Executions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Execution history" })).toBeVisible();
  await expect(page.getByRole("row", { name: /succeeded High-value lead/ })).toBeVisible();
});
