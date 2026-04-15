import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Layout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import ModuleDirectory from "./pages/ModuleDirectory";
import Notifications from "./pages/Notifications";
import AutoAgingDashboard from "./pages/auto-aging/AutoAgingDashboard";
import VehicleExplorer from "./pages/auto-aging/VehicleExplorer";
import ImportCenter from "./pages/auto-aging/ImportCenter";
import DataQuality from "./pages/auto-aging/DataQuality";
import SLAAdmin from "./pages/auto-aging/SLAAdmin";
import MappingAdmin from "./pages/auto-aging/MappingAdmin";
import ImportHistory from "./pages/auto-aging/ImportHistory";
import VehicleDetail from "./pages/auto-aging/VehicleDetail";
import ActivityDashboard from "./pages/admin/ActivityDashboard";
import UserManagement from "./pages/admin/UserManagement";
import AuditLog from "./pages/admin/AuditLog";
import SettingsPage from "./pages/admin/SettingsPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { AuthProvider } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataContext";
import { ProtectedRoute } from "./contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { errorTrackingService } from "@/services/errorTrackingService";

// Initialize error tracking
errorTrackingService.init(import.meta.env.VITE_SENTRY_DSN);

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/forgot-password",
    element: <ForgotPasswordPage />,
  },
  {
    path: "/reset-password",
    element: <ResetPasswordPage />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AuthProvider>
          <DataProvider>
            <Layout />
          </DataProvider>
        </AuthProvider>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ExecutiveDashboard /> },
      { path: "modules", element: <ModuleDirectory /> },
      { path: "notifications", element: <Notifications /> },
      { path: "auto-aging", element: <AutoAgingDashboard /> },
      { path: "auto-aging/vehicles", element: <VehicleExplorer /> },
      { path: "auto-aging/vehicles/:id", element: <VehicleDetail /> },
      { path: "auto-aging/import", element: <ImportCenter /> },
      { path: "auto-aging/quality", element: <DataQuality /> },
      { path: "auto-aging/sla", element: <SLAAdmin /> },
      { path: "auto-aging/mappings", element: <MappingAdmin /> },
      { path: "auto-aging/history", element: <ImportHistory /> },
      { path: "admin/activity", element: <ActivityDashboard /> },
      { path: "admin/users", element: <UserManagement /> },
      { path: "admin/audit", element: <AuditLog /> },
      { path: "admin/settings", element: <SettingsPage /> },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);
