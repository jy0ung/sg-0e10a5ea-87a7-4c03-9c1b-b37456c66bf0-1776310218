import "@/index.css";

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
import CommissionDashboard from "./pages/auto-aging/CommissionDashboard";
import ReportCenter from "./pages/auto-aging/ReportCenter";
import SalesDashboard from "./pages/sales/SalesDashboard";
import DealPipeline from "./pages/sales/DealPipeline";
import SalesOrders from "./pages/sales/SalesOrders";
import Customers from "./pages/sales/Customers";
import Invoices from "./pages/sales/Invoices";
import SalesmanPerformancePage from "./pages/sales/SalesmanPerformance";
import { SalesProvider } from "./contexts/SalesContext";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <DataProvider>
          <AppLayout />
        </DataProvider>
      </ProtectedRoute>
    ),
    errorElement: (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Route Error</h1>
          <p className="text-muted-foreground">An error occurred while loading this page.</p>
          <a href="/" className="text-primary hover:underline">Go to Home</a>
        </div>
      </div>
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
            { path: "auto-aging/commissions", element: <CommissionDashboard /> },
            { path: "auto-aging/reports", element: <ReportCenter /> },
            {
              path: "sales",
              element: <SalesProvider><SalesDashboard /></SalesProvider>,
            },
            {
              path: "sales/pipeline",
              element: <SalesProvider><DealPipeline /></SalesProvider>,
            },
            {
              path: "sales/orders",
              element: <SalesProvider><SalesOrders /></SalesProvider>,
            },
            {
              path: "sales/customers",
              element: <SalesProvider><Customers /></SalesProvider>,
            },
            {
              path: "sales/invoices",
              element: <SalesProvider><Invoices /></SalesProvider>,
            },
            {
              path: "sales/performance",
              element: <SalesProvider><SalesmanPerformancePage /></SalesProvider>,
            },
      { path: "admin/activity", element: <ActivityDashboard /> },
      { path: "admin/users", element: <UserManagement /> },
      { path: "admin/audit", element: <AuditLog /> },
      { path: "admin/settings", element: <SettingsPage /> },
    ],
  },
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
    path: "/debug",
    element: (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-3xl font-bold text-primary">Debug Page</h1>
          <p className="text-muted-foreground">If you see this, React is mounting correctly.</p>
          <div className="space-y-2 text-left">
            <p><strong>Supabase URL:</strong> {import.meta.env.VITE_SUPABASE_URL || "Not configured"}</p>
            <p><strong>Supabase Key:</strong> {import.meta.env.VITE_SUPABASE_ANON_KEY ? "Configured" : "Not configured"}</p>
          </div>
          <a href="/" className="inline-block mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
            Go to Login
          </a>
        </div>
      </div>
    ),
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