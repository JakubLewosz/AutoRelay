import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "../../api/auth";
import { ApiError, apiRequest, setCsrfToken, setUnauthorizedHandler } from "../../api/client";
import type { AuthResponse } from "../../types/auth";
import { AuthProvider, useAuth } from "./AuthProvider";

vi.mock("../../api/auth", () => ({
  authApi: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

const session: AuthResponse = {
  csrf_token: "csrf-token",
  user: {
    id: "user-1",
    email: "owner@example.com",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    last_login_at: null,
  },
};

function SessionProbe() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  return (
    <div>
      <span>{user?.email ?? "Signed out"}</span>
      <span>
        {queryClient.getQueryData(["workflows"]) ? "Sensitive cache present" : "Cache clear"}
      </span>
      <button type="button" onClick={() => void logout().catch(() => undefined)}>
        Log out
      </button>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["workflows"], [{ webhook_url: "https://example.test/secret" }]);
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("AuthProvider session expiry", () => {
  beforeEach(() => {
    vi.mocked(authApi.me).mockReset().mockResolvedValue(session);
    vi.mocked(authApi.login).mockReset();
    vi.mocked(authApi.register).mockReset();
    vi.mocked(authApi.logout).mockReset().mockResolvedValue(undefined);
    setCsrfToken(null);
    setUnauthorizedHandler(null);
  });

  it("clears authentication and sensitive queries after a general API 401", async () => {
    const queryClient = renderProvider();
    expect(await screen.findByText("owner@example.com")).toBeVisible();
    expect(screen.getByText("Sensitive cache present")).toBeVisible();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Session expired" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await act(async () => {
      await expect(apiRequest("/workflows")).rejects.toMatchObject({ status: 401 });
    });

    expect(await screen.findByText("Signed out")).toBeVisible();
    expect(queryClient.getQueryData(["workflows"])).toBeUndefined();
    expect(authApi.me).toHaveBeenCalledTimes(1);
  });

  it("clears local authentication and cache when server logout fails", async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError("Server unavailable", 503));
    const queryClient = renderProvider();
    expect(await screen.findByText("owner@example.com")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(screen.getByText("Signed out")).toBeVisible());
    expect(queryClient.getQueryData(["workflows"])).toBeUndefined();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });
});
