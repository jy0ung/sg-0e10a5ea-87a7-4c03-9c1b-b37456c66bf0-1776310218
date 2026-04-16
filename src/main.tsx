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
import { errorTrackingService } from "@/services/errorTrackingService";

// Initialise error tracking. Reads VITE_SENTRY_DSN if set; otherwise runs in local-only mode.
errorTrackingService.init(import.meta.env.VITE_SENTRY_DSN);

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
const SalesAdvisors = lazy(() => import("./pages/sales/SalesAdvisors"));
const StockBalance = lazy(() => import("./pages/inventory/StockBalance"));
const VehicleTransfer = lazy(() => import("./pages/inventory/VehicleTransfer"));
const ChassisMovement = lazy(() => import("./pages/inventory/ChassisMovement"));
const PurchaseInvoices = lazy(() => import("./pages/purchasing/PurchaseInvoices"));
const MarginAnalysis = lazy(() => import("./pages/sales/MarginAnalysis"));
const OutstandingCollection = lazy(() => import("./pages/sales/OutstandingCollection"));
const BranchManagement = lazy(() => import("./pages/admin/BranchManagement"));
const MasterData = lazy(() => import("./pages/admin/MasterData"));
const Suppliers = lazy(() => import("./pages/admin/Suppliers"));
const Dealers = lazy(() => import("./pages/admin/Dealers"));
const UserGroups = lazy(() => import("./pages/admin/UserGroups"));
const DealerInvoices = lazy(() => import("./pages/sales/DealerInvoices"));
const VerifyOR = lazy(() => import("./pages/sales/VerifyOR"));
const ReportsCenter = lazy(() => import("./pages/reports/ReportsCenter"));
const ChassisFilter = lazy(() => import("./pages/inventory/ChassisFilter"));

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
      { index: true, element: <SalesProvider><S><ExecutiveDashboard /></S></SalesProvider> },
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
      { path: "sales/advisors", element: <SalesProvider><S><SalesAdvisors /></S></SalesProvider> },
      { path: "sales/margin", element: <SalesProvider><S><MarginAnalysis /></S></SalesProvider> },
      { path: "sales/outstanding", element: <SalesProvider><S><OutstandingCollection /></S></SalesProvider> },
      { path: "inventory/stock", element: <S><StockBalance /></S> },
      { path: "inventory/transfers", element: <S><VehicleTransfer /></S> },
      { path: "inventory/chassis", element: <S><ChassisMovement /></S> },
      { path: "purchasing/invoices", element: <S><PurchaseInvoices /></S> },
      { path: "admin/activity", element: <S><ActivityDashboard /></S> },
      { path: "admin/users", element: <S><UserManagement /></S> },
      { path: "admin/audit", element: <S><AuditLog /></S> },
      { path: "admin/settings", element: <S><SettingsPage /></S> },
      { path: "admin/branches", element: <S><BranchManagement /></S> },
      { path: "admin/master-data", element: <S><MasterData /></S> },
      { path: "admin/suppliers", element: <S><Suppliers /></S> },
      { path: "admin/dealers", element: <S><Dealers /></S> },
      { path: "admin/user-groups", element: <S><UserGroups /></S> },
      { path: "sales/dealer-invoices", element: <SalesProvider><S><DealerInvoices /></S></SalesProvider> },
      { path: "sales/verify-or", element: <SalesProvider><S><VerifyOR /></S></SalesProvider> },
      { path: "reports", element: <S><ReportsCenter /></S> },
      { path: "inventory/chassis-filter", element: <S><ChassisFilter /></S> },
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