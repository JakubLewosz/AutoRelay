import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { WorkflowForm } from "./WorkflowForm";

async function reachConditionStep() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "High-value lead");
  await user.click(screen.getByRole("button", { name: /continue/i }));
  expect(await screen.findByRole("heading", { name: "Optional condition" })).toBeVisible();
  return user;
}

describe("WorkflowForm", () => {
  it("validates the condition editor before advancing", async () => {
    renderWithProviders(<WorkflowForm onSubmit={vi.fn()} submitLabel="Create workflow" />);
    const user = await reachConditionStep();
    await user.click(screen.getByRole("checkbox", { name: /add a condition/i }));
    fireEvent.change(screen.getByLabelText(/^JSON field path/), {
      target: { value: "lead[value]" },
    });
    await user.selectOptions(screen.getByLabelText("Operator"), "greater_than");
    await user.type(screen.getByLabelText(/^Comparison value/), "not-a-number");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText("Use a safe dot path such as lead.value.")).toBeVisible();
    expect(screen.getByText("Numeric comparisons require a number.")).toBeVisible();
  });

  it("configures a Discord action and submits a reviewed workflow", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<WorkflowForm onSubmit={onSubmit} submitLabel="Create workflow" />);
    const user = await reachConditionStep();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.click(screen.getByRole("radio", { name: /discord webhook/i }));
    await user.clear(screen.getByLabelText(/^Discord webhook URL/));
    await user.type(
      screen.getByLabelText(/^Discord webhook URL/),
      "https://discord.com/api/webhooks/123/token",
    );
    fireEvent.change(screen.getByLabelText(/^Message template/), {
      target: { value: "New lead: {{lead.name}}" },
    });
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("heading", { name: "Review workflow" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /create workflow/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "High-value lead",
        condition: null,
        action: {
          action_type: "DISCORD_WEBHOOK",
          config: {
            webhook_url: "https://discord.com/api/webhooks/123/token",
            message_template: "New lead: {{lead.name}}",
          },
        },
      }),
    );
  });
});
