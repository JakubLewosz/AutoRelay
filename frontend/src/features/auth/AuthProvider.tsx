/* eslint-disable react-refresh/only-export-components */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import { authApi } from "../../api/auth";
import { ApiError, setCsrfToken } from "../../api/client";
import type { AuthCredentials, AuthResponse, User } from "../../types/auth";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (credentials: AuthCredentials) => Promise<AuthResponse>;
  register: (credentials: AuthCredentials) => Promise<AuthResponse>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const authQueryKey = ["auth", "me"] as const;

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const authQuery = useQuery({
    queryKey: authQueryKey,
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  useEffect(() => {
    setCsrfToken(authQuery.data?.csrf_token ?? null);
  }, [authQuery.data]);

  const establishSession = (response: AuthResponse) => {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== "auth",
    });
    setCsrfToken(response.csrf_token);
    queryClient.setQueryData(authQueryKey, response);
    return response;
  };

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: establishSession,
  });
  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: establishSession,
  });
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(authQueryKey, null);
    },
  });

  const unauthenticated =
    authQuery.error instanceof ApiError && [401, 403].includes(authQuery.error.status);
  const user = unauthenticated ? null : (authQuery.data?.user ?? null);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: authQuery.isPending,
        login: loginMutation.mutateAsync,
        register: registerMutation.mutateAsync,
        logout: logoutMutation.mutateAsync,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
