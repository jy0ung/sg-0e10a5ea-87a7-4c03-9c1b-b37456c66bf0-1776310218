import "@/index.css";

import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AppLayout from "./components/layout/AppLayout";
import { SalesProvider } from "./contexts/SalesContext";

// Route-level code splitting — all pages are loaded on demand
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ExecutiveDashboard = lazy(() => import("./pages/ExecutiveDashboard"));
const ModuleDirectory = lazy(() => import("./pages/ModuleDirectory"));
const Notifications = lazy(() => import("./pages/Notifications"));
const AutoAgingDashboard = lazy(() => import("./pages/auto-aging/AutoAgingDashboard"));
const VehicleExplorer = lazy(() => import("./pages/auto-aging/VehicleExplorer"));
const ImportCenter = lazy(() => import("./pages/auto-aging/ImportCenter"));
const DataQuality = lazy(() => import("./pages/auto-aging/DataQuality"));
const SLAAdmin = lazy(() => import("./pages/auto-aging/SLAAdmin"));
const MappingAdmin = lazy(() => import("./pages/auto-aging/MappingAdmin"));
const ImportHistory = lazy(() => import("./pages/auto-aging/ImportHistory"));
const VehicleDetail = lazy(() => import("./pages/auto-aging/VehicleDetail"));
const CommissionDashboard = lazy(() => import("./pages/auto-aging/CommissionDashboard"));
const ReportCenter = lazy(() => import("./pages/auto-aging/ReportCenter"));
const ActivityDashboard = lazy(() => import("./pages/admin/ActivityDashboard"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const AuditLog = lazy(() => import("./pages/admin/AuditLog"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const SalesDashboard = lazy(() => import("./pages/sales/SalesDashboard"));
const DealPipeline = lazy(() => import("./pages/sales/DealPipeline"));
const SalesOrders = lazy(() => import("./pages/sales/SalesOrders"));
const Customers = lazy(() => import("./pages/sales/Customers"));
const Invoices = lazy(() => import("./pages/sales/Invoices"));
const SalesmanPerformancePage = lazy(() => import("./pages/sales/SalesmanPerformance"));

// Lightweight spinner shown while a lazy page chunk loads
const PageSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

// Shorthand Suspense wrapper used on every route element
function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
}

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
      { index: true, element: <S><ExecutiveDashboard /></S> },
      { path: "modules", element: <S><ModuleDirectory /></S> },
      { path: "notifications", element: <S><Notifications /></S> },
      { path: "auto-aging", element: <S><AutoAgingDashboard /></S> },
      { path: "auto-aging/vehicles", element: <S><VehicleExplorer /></S> },
      { path: "auto-aging/vehicles/:id", element: <S><VehicleDetail /></S> },
      { path: "auto-aging/import", element: <S><ImportCenter /></S> },
      { path: "auto-aging/quality", element: <S><DataQuality /></S> },
      { path: "auto-aging/sla", element: <S><SLAAdmin /></S> },
      { path: "auto-aging/mappings", element: <S><MappingAdmin /></S> },
      { path: "auto-aging/history", element: <S><ImportHistory /></S> },
      { path: "auto-aging/commissions", element: <S><CommissionDashboard /></S> },
      { path: "auto-aging/reports", element: <S><ReportCenter /></S> },
      { path: "sales", element: <SalesProvider><S><SalesDashboard /></S></SalesProvider> },
      { path: "sales/pipeline", element: <SalesProvider><S><DealPipeline /></S></SalesProvider> },
      { path: "sales/orders", element: <SalesProvider><S><SalesOrders /></S></SalesProvider> },
      { path: "sales/customers", element: <SalesProvider><S><Customers /></S></SalesProvider> },
      { path: "sales/invoices", element: <SalesProvider><S><Invoices /></S></SalesProvider> },
      { path: "sales/performance", element: <SalesProvider><S><SalesmanPerformancePage /></S></SalesProvider> },
      { path: "admin/activity", element: <S><ActivityDashboard /></S> },
      { path: "admin/users", element: <S><UserManagement /></S> },
      { path: "admin/audit", element: <S><AuditLog /></S> },
      { path: "admin/settings", element: <S><SettingsPage /></S> },
    ],
  },
  {
    path: "/login",
    element: <S><LoginPage /></S>,
  },
  {
    path: "/forgot-password",
    element: <S><ForgotPasswordPage /></S>,
  },
  {
    path: "/reset-password",
    element: <S><ResetPasswordPage /></S>,
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
    element: <S><NotFound /></S>,
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