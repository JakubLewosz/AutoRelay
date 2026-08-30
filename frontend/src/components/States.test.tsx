import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ErrorState } from "./ErrorState";
import { LoadingScreen } from "./LoadingScreen";

describe("loading and error states", () => {
  it("announces loading progress", () => {
    render(<LoadingScreen label="Loading workflows" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading workflows");
  });

  it("shows a safe API message and exposes retry", async () => {
    const retry = vi.fn();
    render(
      <ErrorState
        error={new ApiError("Service is temporarily unavailable.", 503)}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Service is temporarily unavailable.");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
