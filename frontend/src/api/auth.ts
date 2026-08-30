import type { AuthCredentials, AuthResponse } from "../types/auth";
import { apiRequest } from "./client";

export const authApi = {
  register: (credentials: AuthCredentials) =>
    apiRequest<AuthResponse>("/auth/register", { method: "POST", body: credentials }),
  login: (credentials: AuthCredentials) =>
    apiRequest<AuthResponse>("/auth/login", { method: "POST", body: credentials }),
  me: () => apiRequest<AuthResponse>("/auth/me"),
  logout: () => apiRequest<void>("/auth/logout", { method: "POST", csrf: true }),
};
