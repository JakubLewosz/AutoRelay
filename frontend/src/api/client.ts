import type { ApiErrorPayload } from "../types/api";

let csrfToken: string | null = null;

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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrf) {
    if (!csrfToken)
      throw new ApiError("Your session could not be verified. Refresh and try again.", 403);
    headers.set("X-CSRF-Token", csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: "include",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
