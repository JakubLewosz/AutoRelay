import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard, GuestGuard } from "../features/auth/AuthGuard";
import { AppShell } from "../layouts/AppShell";
import { AuthLayout } from "../layouts/AuthLayout";
import { CreateWorkflowPage } from "../pages/CreateWorkflowPage";
import { DashboardPage } from "../pages/DashboardPage";
import { EditWorkflowPage } from "../pages/EditWorkflowPage";
import { ExecutionDetailPage } from "../pages/ExecutionDetailPage";
import { ExecutionsPage } from "../pages/ExecutionsPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { RegisterPage } from "../pages/RegisterPage";
import { WorkflowDetailPage } from "../pages/WorkflowDetailPage";
import { WorkflowsPage } from "../pages/WorkflowsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestGuard />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/new" element={<CreateWorkflowPage />} />
          <Route path="/workflows/:workflowId" element={<WorkflowDetailPage />} />
          <Route path="/workflows/:workflowId/edit" element={<EditWorkflowPage />} />
          <Route path="/executions" element={<ExecutionsPage />} />
          <Route path="/executions/:executionId" element={<ExecutionDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
