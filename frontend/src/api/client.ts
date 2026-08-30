import type { ApiErrorPayload } from "../types/api";

let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function errorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  if (payload?.error?.message) return payload.error.message;
  if (typeof payload?.detail === "string") return payload.detail;
  if (Array.isArray(payload?.detail)) {
    const messages = payload.detail.flatMap((item) => (item.msg ? [item.msg] : []));
    if (messages.length) return messages.join(". ");
  }
  return payload?.message ?? fallback;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  csrf?: boolean;
};

function serializeBody(body: unknown): string {
  try {
    const serialized = JSON.stringify(body, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new ApiError(
          "Request data contains a number outside the supported finite range.",
          400,
          "invalid_client_payload",
        );
      }
      return value;
    });
    if (serialized === undefined) {
      throw new ApiError(
        "Request data could not be encoded as JSON.",
        400,
        "invalid_client_payload",
      );
    }
    return serialized;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Request data could not be encoded as JSON.", 400, "invalid_client_payload");
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrf) {
    if (!csrfToken)
      throw new ApiError("Your session could not be verified. Refresh and try again.", 403);
    headers.set("X-CSRF-Token", csrfToken);
  }

  const body = options.body === undefined ? undefined : serializeBody(options.body);

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: "include",
      headers,
      body,
    });
  } catch {
    throw new ApiError(
      "AutoRelay could not reach the server. Check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // The response may intentionally have no JSON body.
    }
    if (
      response.status === 401 ||
      (response.status === 403 && payload?.error?.code === "account_disabled")
    ) {
      unauthorizedHandler?.();
    }
    throw new ApiError(
      errorMessage(payload, `Request failed with status ${response.status}.`),
      response.status,
      payload?.error?.code,
      payload?.error?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function toSearchParams(values: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
