import "@/index.css";
import "@/i18n";

import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthProvider, ProtectedRoute } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { ModuleAccessProvider } from "@/contexts/ModuleAccessContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RequireRole } from "@/components/shared/RequireRole";
import { RequireActiveModule } from "@/components/shared/RequireActiveModule";
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary";
import AppLayout from "./components/layout/AppLayout";
import SalesLayout from "./components/layout/SalesLayout";
import { SalesProvider } from "./contexts/SalesContext";
import { errorTrackingService } from "@/services/errorTrackingService";
import {
  ADMIN_ONLY,
  ADMIN_AND_DIRECTOR,
  EXECUTIVE,
  MANAGER_AND_UP,
  HRMS_ADMIN,
  HRMS_PAYROLL,
  HRMS_LEAVE,
} from "@/config/routeRoles";

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
const AccountPending = lazy(() => import("./pages/AccountPending"));
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
const HrmsAdmin = lazy(() => import('./pages/hrms/HrmsAdmin'));
const ApprovalFlows = lazy(() => import('./pages/hrms/ApprovalFlows'));
const RolePermissionsPage = lazy(() => import('./pages/admin/RolePermissions'));
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

/**
 * Phase 3 #19: wrap a route element with a per-route error boundary so a single
 * page crash is contained and the rest of the shell (sidebar, toasts, nav) keeps
 * working. Use at the route element level, inside any RequireRole/module gates.
 */
function R({ scope, children }: { scope: string; children: React.ReactNode }) {
  return <RouteErrorBoundary scope={scope}>{children}</RouteErrorBoundary>;
}

function ProtectedAppShell({ redirectTo = "/login" }: { redirectTo?: string | ((pathname: string) => string) }) {
  return (
    <ProtectedRoute redirectTo={redirectTo}>
      <ModuleAccessProvider>
        <DataProvider>
          {/*
            Phase 2 #16: a single SalesProvider at the shell level so the `/`
            (Executive Dashboard) and `/sales/*` subtrees share one instance
            rather than mounting duplicate providers with their own realtime
            subscriptions. Sales data only fetches when companyId is set.
          */}
          <SalesProvider>
            <AppLayout />
          </SalesProvider>
        </DataProvider>
      </ModuleAccessProvider>
    </ProtectedRoute>
  );
}

function withModuleAccess(moduleId: string, element: React.ReactNode) {
  return <RequireActiveModule moduleId={moduleId}>{element}</RequireActiveModule>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 60s — avoids refetch storms when users
      // navigate between pages or components mount in quick succession.
      staleTime: 60_000,
      // Keep unused data in memory for 5 minutes so the cache can satisfy
      // repeat visits without hitting the network.
      gcTime: 5 * 60_000,
      // Most dashboards don't need to refetch when the tab regains focus —
      // DataContext already subscribes to realtime updates for the critical tables.
      refetchOnWindowFocus: false,
      // Retry once on transient network errors rather than the default 3x
      // exponential backoff, which can make failures feel sluggish.
      retry: 1,
    },
  },
});

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
      { index: true, element: <R scope="Executive Dashboard"><S><ExecutiveDashboard /></S></R> },
      { path: "profile", element: <Navigate to="/admin/settings" replace /> },
      { path: "modules", element: <S><ModuleDirectory /></S> },
      { path: "notifications", element: <S><Notifications /></S> },
      { path: "auto-aging", element: withModuleAccess('auto-aging', <R scope="Auto-Aging"><S><AutoAgingDashboard /></S></R>) },
      { path: "auto-aging/vehicles", element: withModuleAccess('auto-aging', <R scope="Vehicle Explorer"><S><VehicleExplorer /></S></R>) },
      { path: "auto-aging/vehicles/:id", element: withModuleAccess('auto-aging', <R scope="Vehicle Detail"><S><VehicleDetail /></S></R>) },
      { path: "auto-aging/import", element: withModuleAccess('auto-aging', <RequireRole roles={MANAGER_AND_UP}><R scope="Import Center"><S><ImportCenter /></S></R></RequireRole>) },
      { path: "auto-aging/quality", element: withModuleAccess('auto-aging', <R scope="Data Quality"><S><DataQuality /></S></R>) },
      { path: "auto-aging/sla", element: withModuleAccess('auto-aging', <RequireRole roles={EXECUTIVE}><R scope="SLA Admin"><S><SLAAdmin /></S></R></RequireRole>) },
      { path: "auto-aging/mappings", element: withModuleAccess('auto-aging', <RequireRole roles={EXECUTIVE}><R scope="Mapping Admin"><S><MappingAdmin /></S></R></RequireRole>) },
      { path: "auto-aging/history", element: withModuleAccess('auto-aging', <R scope="Import History"><S><ImportHistory /></S></R>) },
      { path: "auto-aging/commissions", element: withModuleAccess('auto-aging', <RequireRole roles={MANAGER_AND_UP}><R scope="Commissions"><S><CommissionDashboard /></S></R></RequireRole>) },
      { path: "auto-aging/reports", element: withModuleAccess('auto-aging', <R scope="Auto-Aging Reports"><S><ReportCenter /></S></R>) },
      {
        path: "sales",
        element: withModuleAccess('sales', <SalesLayout />),
        children: [
          { index: true, element: <R scope="Sales Dashboard"><S><SalesDashboard /></S></R> },
          { path: "pipeline", element: <RequireRole roles={MANAGER_AND_UP}><R scope="Deal Pipeline"><S><DealPipeline /></S></R></RequireRole> },
          { path: "orders", element: <R scope="Sales Orders"><S><SalesOrders /></S></R> },
          { path: "customers", element: <R scope="Customers"><S><Customers /></S></R> },
          { path: "invoices", element: <RequireRole roles={MANAGER_AND_UP}><R scope="Invoices"><S><Invoices /></S></R></RequireRole> },
          { path: "performance", element: <R scope="Salesman Performance"><S><SalesmanPerformancePage /></S></R> },
          { path: "advisors", element: <RequireRole roles={MANAGER_AND_UP}><R scope="Sales Advisors"><S><SalesAdvisors /></S></R></RequireRole> },
          { path: "margin", element: <RequireRole roles={EXECUTIVE}><R scope="Margin Analysis"><S><MarginAnalysis /></S></R></RequireRole> },
          { path: "outstanding", element: <R scope="Outstanding"><S><OutstandingCollection /></S></R> },
          { path: "dealer-invoices", element: <RequireRole roles={MANAGER_AND_UP}><R scope="Dealer Invoices"><S><DealerInvoices /></S></R></RequireRole> },
          { path: "verify-or", element: <RequireRole roles={MANAGER_AND_UP}><R scope="Verify OR"><S><VerifyOR /></S></R></RequireRole> },
        ],
      },
      { path: "inventory/stock", element: withModuleAccess('inventory', <R scope="Stock Balance"><S><StockBalance /></S></R>) },
      { path: "inventory/transfers", element: withModuleAccess('inventory', <RequireRole roles={MANAGER_AND_UP}><R scope="Vehicle Transfer"><S><VehicleTransfer /></S></R></RequireRole>) },
      { path: "inventory/chassis", element: withModuleAccess('inventory', <R scope="Chassis Movement"><S><ChassisMovement /></S></R>) },
      { path: "purchasing/invoices", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP}><R scope="Purchase Invoices"><S><PurchaseInvoices /></S></R></RequireRole>) },
      { path: "admin/activity", element: <RequireRole roles={EXECUTIVE}><S><ActivityDashboard /></S></RequireRole> },
      { path: "admin/users", element: <RequireRole roles={ADMIN_ONLY}><S><UserManagement /></S></RequireRole> },
      { path: "admin/audit", element: <RequireRole roles={ADMIN_AND_DIRECTOR}><S><AuditLog /></S></RequireRole> },
      { path: "admin/settings", element: <S><SettingsPage /></S> },
      { path: "admin/branches", element: <RequireRole roles={ADMIN_ONLY}><S><BranchManagement /></S></RequireRole> },
      { path: "admin/master-data", element: <RequireRole roles={ADMIN_ONLY}><S><MasterData /></S></RequireRole> },
      { path: "admin/suppliers", element: <RequireRole roles={ADMIN_ONLY}><S><Suppliers /></S></RequireRole> },
      { path: "admin/dealers", element: <RequireRole roles={ADMIN_ONLY}><S><Dealers /></S></RequireRole> },
      { path: "admin/user-groups", element: <RequireRole roles={ADMIN_ONLY}><S><UserGroups /></S></RequireRole> },
      { path: 'admin/role-permissions', element: <RequireRole roles={ADMIN_ONLY}><S><RolePermissionsPage /></S></RequireRole> },
      { path: "reports", element: withModuleAccess('reports', <S><ReportsCenter /></S>) },
      { path: "inventory/chassis-filter", element: withModuleAccess('inventory', <S><ChassisFilter /></S>) },
      { path: "hrms/employees", element: withModuleAccess('hrms', <RequireRole roles={MANAGER_AND_UP}><S><EmployeeDirectory /></S></RequireRole>) },
      { path: "hrms/leave", element: withModuleAccess('hrms', <RequireRole roles={HRMS_LEAVE}><S><LeaveManagement /></S></RequireRole>) },
      { path: "hrms/leave-calendar", element: withModuleAccess('hrms', <RequireRole roles={MANAGER_AND_UP}><S><LeaveCalendar /></S></RequireRole>) },
      { path: "hrms/attendance", element: withModuleAccess('hrms', <RequireRole roles={MANAGER_AND_UP}><S><AttendanceLog /></S></RequireRole>) },
      { path: "hrms/payroll", element: withModuleAccess('hrms', <RequireRole roles={HRMS_PAYROLL}><S><PayrollSummary /></S></RequireRole>) },
      { path: "hrms/appraisals", element: withModuleAccess('hrms', <RequireRole roles={MANAGER_AND_UP}><S><PerformanceAppraisals /></S></RequireRole>) },
      { path: "hrms/announcements", element: withModuleAccess('hrms', <RequireRole roles={MANAGER_AND_UP}><S><HrmsAnnouncements /></S></RequireRole>) },
      { path: "hrms/admin", element: withModuleAccess('hrms', <RequireRole roles={HRMS_ADMIN}><S><HrmsAdmin /></S></RequireRole>) },
      { path: "hrms/approval-flows", element: withModuleAccess('hrms', <RequireRole roles={HRMS_ADMIN}><S><ApprovalFlows /></S></RequireRole>) },
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
        <ModuleAccessProvider>
          <RequireActiveModule moduleId="support">
            <Suspense fallback={<PageSpinner />}>
              <CustomerServiceLayout />
            </Suspense>
          </RequireActiveModule>
        </ModuleAccessProvider>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="tickets/new" replace /> },
      { path: "tickets", element: <S><R scope="My Tickets"><MyTickets /></R></S> },
      { path: "tickets/new", element: <S><R scope="New Ticket"><NewTicket /></R></S> },
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
    path: "/account-pending",
    element: <S><AccountPending /></S>,
  },
  {
    path: "*",
    element: <S><NotFound /></S>,
  },
]);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="flc-ui-theme" disableTransitionOnChange>
        <TooltipProvider>
          <Sonner />
          <ErrorBoundary>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

// Detect invite/signup callback tokens landing on the wrong page and redirect
// to /signup BEFORE React or Supabase JS processes (and consumes) the tokens.
function shouldRedirectInviteToSignup(): boolean {
  const { pathname, hash, search } = window.location;
  // Already on signup or reset-password — nothing to do
  if (pathname === '/signup' || pathname === '/reset-password') return false;

  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(search);
  const type = hashParams.get('type') || searchParams.get('type');

  if (type === 'invite' || type === 'signup' || type === 'magiclink') {
    // Hard redirect preserving both search and hash so tokens survive
    window.location.replace(`/signup${search}${hash}`);
    return true;
  }
  return false;
}

if (!shouldRedirectInviteToSignup()) {
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
}

// After a redeploy, hashed asset filenames change. Any tab that was open
// before the deploy still holds the old index.html → when React tries to
// lazy-load a route chunk it gets a 404 and throws:
//   "Failed to fetch dynamically imported module: .../assets/xxx.js"
// We catch that one specific error and do a single auto-reload so users
// silently pick up the new build instead of seeing an error page. Uses
// sessionStorage to prevent an infinite loop if the reload itself fails.
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg)
    || /Importing a module script failed/i.test(msg)
    || /ChunkLoadError/i.test(msg)
  );
}
function reloadOnce() {
  const key = 'flc.chunk-reloaded';
  if (sessionStorage.getItem(key) === '1') return;
  sessionStorage.setItem(key, '1');
  window.location.reload();
}
window.addEventListener('error', (e) => {
  if (isChunkLoadError(e.error ?? e.message)) reloadOnce();
});
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadError(e.reason)) reloadOnce();
});

export default App;