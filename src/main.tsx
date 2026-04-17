import "@/index.css";

import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RequireRole } from "@/components/shared/RequireRole";
import AppLayout from "./components/layout/AppLayout";
import SalesLayout from "./components/layout/SalesLayout";
import { SalesProvider } from "./contexts/SalesContext";
import { errorTrackingService } from "@/services/errorTrackingService";

// Initialise error tracking. Reads VITE_SENTRY_DSN if set; otherwise runs in local-only mode.
errorTrackingService.init(import.meta.env.VITE_SENTRY_DSN);

// Route-level code splitting — all pages are loaded on demand
const LandingPage = lazy(() => import("./pages/LandingPage"));
const CustomerServiceLayout = lazy(() => import("./components/layout/CustomerServiceLayout"));
const MyTickets = lazy(() => import("./pages/tickets/MyTickets"));
const NewTicket = lazy(() => import("./pages/tickets/NewTicket"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
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
const EmployeeDirectory = lazy(() => import("./pages/hrms/EmployeeDirectory"));
const LeaveManagement = lazy(() => import("./pages/hrms/LeaveManagement"));
const LeaveCalendar = lazy(() => import("./pages/hrms/LeaveCalendar"));
const AttendanceLog = lazy(() => import("./pages/hrms/AttendanceLog"));
const PayrollSummary = lazy(() => import("./pages/hrms/PayrollSummary"));
const PerformanceAppraisals = lazy(() => import("./pages/hrms/PerformanceAppraisals"));
const HrmsAnnouncements = lazy(() => import("./pages/hrms/Announcements"));

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

function ProtectedAppShell({ redirectTo = "/login" }: { redirectTo?: string | ((pathname: string) => string) }) {
  return (
    <ProtectedRoute redirectTo={redirectTo}>
      <DataProvider>
        <AppLayout />
      </DataProvider>
    </ProtectedRoute>
  );
}

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    // Unauthenticated root (/) → /welcome, any other protected path → /login
    element: <ProtectedAppShell redirectTo={(p) => (p === "/" ? "/welcome" : "/login")} />,
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
      { path: "profile", element: <Navigate to="/admin/settings" replace /> },
      { path: "modules", element: <S><ModuleDirectory /></S> },
      { path: "notifications", element: <S><Notifications /></S> },
      { path: "auto-aging", element: <S><AutoAgingDashboard /></S> },
      { path: "auto-aging/vehicles", element: <S><VehicleExplorer /></S> },
      { path: "auto-aging/vehicles/:id", element: <S><VehicleDetail /></S> },
      { path: "auto-aging/import", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager', 'manager']}><S><ImportCenter /></S></RequireRole> },
      { path: "auto-aging/quality", element: <S><DataQuality /></S> },
      { path: "auto-aging/sla", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager']}><S><SLAAdmin /></S></RequireRole> },
      { path: "auto-aging/mappings", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager']}><S><MappingAdmin /></S></RequireRole> },
      { path: "auto-aging/history", element: <S><ImportHistory /></S> },
      { path: "auto-aging/commissions", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager', 'manager']}><S><CommissionDashboard /></S></RequireRole> },
      { path: "auto-aging/reports", element: <S><ReportCenter /></S> },
      {
        path: "sales",
        element: <SalesLayout />,
        children: [
          { index: true, element: <S><SalesDashboard /></S> },
          { path: "pipeline", element: <S><DealPipeline /></S> },
          { path: "orders", element: <S><SalesOrders /></S> },
          { path: "customers", element: <S><Customers /></S> },
          { path: "invoices", element: <S><Invoices /></S> },
          { path: "performance", element: <S><SalesmanPerformancePage /></S> },
          { path: "advisors", element: <S><SalesAdvisors /></S> },
          { path: "margin", element: <S><MarginAnalysis /></S> },
          { path: "outstanding", element: <S><OutstandingCollection /></S> },
          { path: "dealer-invoices", element: <S><DealerInvoices /></S> },
          { path: "verify-or", element: <S><VerifyOR /></S> },
        ],
      },
      { path: "inventory/stock", element: <S><StockBalance /></S> },
      { path: "inventory/transfers", element: <S><VehicleTransfer /></S> },
      { path: "inventory/chassis", element: <S><ChassisMovement /></S> },
      { path: "purchasing/invoices", element: <S><PurchaseInvoices /></S> },
      { path: "admin/activity", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager']}><S><ActivityDashboard /></S></RequireRole> },
      { path: "admin/users", element: <RequireRole roles={['super_admin', 'company_admin']}><S><UserManagement /></S></RequireRole> },
      { path: "admin/audit", element: <RequireRole roles={['super_admin', 'company_admin', 'director']}><S><AuditLog /></S></RequireRole> },
      { path: "admin/settings", element: <S><SettingsPage /></S> },
      { path: "admin/branches", element: <RequireRole roles={['super_admin', 'company_admin']}><S><BranchManagement /></S></RequireRole> },
      { path: "admin/master-data", element: <RequireRole roles={['super_admin', 'company_admin']}><S><MasterData /></S></RequireRole> },
      { path: "admin/suppliers", element: <RequireRole roles={['super_admin', 'company_admin']}><S><Suppliers /></S></RequireRole> },
      { path: "admin/dealers", element: <RequireRole roles={['super_admin', 'company_admin']}><S><Dealers /></S></RequireRole> },
      { path: "admin/user-groups", element: <RequireRole roles={['super_admin', 'company_admin']}><S><UserGroups /></S></RequireRole> },
      { path: "reports", element: <S><ReportsCenter /></S> },
      { path: "inventory/chassis-filter", element: <S><ChassisFilter /></S> },
      { path: "hrms/employees", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager', 'manager']}><S><EmployeeDirectory /></S></RequireRole> },
      { path: "hrms/leave", element: <S><LeaveManagement /></S> },
      { path: "hrms/leave-calendar", element: <S><LeaveCalendar /></S> },
      { path: "hrms/attendance", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager', 'manager']}><S><AttendanceLog /></S></RequireRole> },
      { path: "hrms/payroll", element: <RequireRole roles={['super_admin', 'company_admin', 'general_manager']}><S><PayrollSummary /></S></RequireRole> },
      { path: "hrms/appraisals", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager', 'manager']}><S><PerformanceAppraisals /></S></RequireRole> },
      { path: "hrms/announcements", element: <RequireRole roles={['super_admin', 'company_admin', 'director', 'general_manager', 'manager']}><S><HrmsAnnouncements /></S></RequireRole> },
    ],
  },
  {
    path: "/welcome",
    element: <S><LandingPage /></S>,
  },
  {
    path: "/portal",
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageSpinner />}>
          <CustomerServiceLayout />
        </Suspense>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="tickets/new" replace /> },
      { path: "tickets", element: <S><MyTickets /></S> },
      { path: "tickets/new", element: <S><NewTicket /></S> },
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
    path: "/signup",
    element: <S><SignUpPage /></S>,
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