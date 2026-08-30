import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, setUnauthorizedHandler } from "./client";

describe("API client request safety", () => {
  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
  });

  it("rejects nested non-finite numbers before sending a corrupted payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const body = JSON.parse('{"nested":{"value":1e400}}') as unknown;

    await expect(apiRequest("/workflows", { method: "POST", body })).rejects.toMatchObject({
      status: 400,
      code: "invalid_client_payload",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ends the local session for an account-disabled response", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "account_disabled", message: "This account has been disabled." },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(apiRequest("/workflows")).rejects.toMatchObject({
      status: 403,
      code: "account_disabled",
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not end the session for a CSRF rejection", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "csrf_invalid", message: "Invalid CSRF token." } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(apiRequest("/workflows")).rejects.toMatchObject({
      status: 403,
      code: "csrf_invalid",
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
