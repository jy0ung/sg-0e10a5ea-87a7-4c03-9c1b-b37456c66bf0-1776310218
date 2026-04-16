import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { loggingService } from "@/services/loggingService";

import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
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
import AppLayout from "./components/layout/AppLayout";

const queryClient = new QueryClient();

const router = createBrowserRouter([
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
        <DataProvider>
          <AppLayout />
        </DataProvider>
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

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ErrorBoundary>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

export default App;