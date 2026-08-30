import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "../features/auth/AuthProvider";
import { renderWithProviders } from "../test/render";
import { RegisterPage } from "./RegisterPage";

vi.mock("../features/auth/AuthProvider", () => ({ useAuth: vi.fn() }));

describe("RegisterPage", () => {
  it("rejects short and mismatched passwords before registration", async () => {
    const register = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      register,
      logout: vi.fn(),
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText("Email address"), "owner@example.com");
    await user.type(screen.getByLabelText(/^Password/), "too-short");
    await user.type(screen.getByLabelText("Confirm password"), "different-password");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText("Use at least 12 characters.")).toBeVisible();
    expect(screen.getByText("Passwords do not match.")).toBeVisible();
    expect(register).not.toHaveBeenCalled();
  });
});
