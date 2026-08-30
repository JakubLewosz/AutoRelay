import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../features/auth/AuthProvider";
import { renderWithProviders } from "../test/render";
import type { AuthResponse } from "../types/auth";
import { LoginPage } from "./LoginPage";

vi.mock("../features/auth/AuthProvider", () => ({ useAuth: vi.fn() }));

const authResponse: AuthResponse = {
  csrf_token: "test-csrf",
  user: {
    id: "user-1",
    email: "owner@example.com",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    last_login_at: null,
  },
};

describe("LoginPage", () => {
  const login = vi.fn<() => Promise<AuthResponse>>();

  beforeEach(() => {
    login.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login,
      register: vi.fn(),
      logout: vi.fn(),
    });
  });

  it("shows accessible validation errors without calling the API", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Enter a valid email address.")).toBeVisible();
    expect(screen.getByText("Enter your password.")).toBeVisible();
    expect(login).not.toHaveBeenCalled();
  });

  it("submits credentials and enters the dashboard", async () => {
    login.mockResolvedValue(authResponse);
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<p>Dashboard ready</p>} />
      </Routes>,
      { route: "/login" },
    );
    await user.type(screen.getByLabelText("Email address"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Dashboard ready")).toBeVisible();
    expect(login).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "correct horse battery staple",
    });
  });
});
