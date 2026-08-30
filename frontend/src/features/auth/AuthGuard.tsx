import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingScreen } from "../../components/LoadingScreen";
import { useAuth } from "./AuthProvider";

export function AuthGuard() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen label="Restoring your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

export function GuestGuard() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen label="Restoring your session" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
