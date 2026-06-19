import "@/index.css";

import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthProvider, ProtectedRoute, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { ModuleAccessProvider } from "@/contexts/ModuleAccessContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { useApplyBranding } from "@/hooks/useApplyBranding";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { PlatformHealthBanner } from "@/components/shared/PlatformHealthBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RequireRole } from "@/components/shared/RequireRole";
import { RequireActiveModule } from "@/components/shared/RequireActiveModule";
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary";
import { LocationPreservingNavigate } from "@/components/shared/LocationPreservingNavigate";
import { PageSpinner } from "@/components/shared/PageSpinner";
import AppLayout from "./components/layout/AppLayout";
import SalesLayout from "./components/layout/SalesLayout";
import { SalesProvider } from "./contexts/SalesContext";
import { errorTrackingService } from "@flc/platform-services";
import { subscribeWebVitals } from "@/services/webVitalsService";
import { env } from "@/config/env";
import { createAppQueryClient } from "@/lib/queryClient";
import { hasPortalSpecificRole, isPortalOnlyUser } from '@/lib/portalAccess';
import { getDedicatedHrmsWorkspacePath, HRMS_PATHS } from '@/lib/hrmsWorkspace';
import {
  ADMIN_ONLY,
  ADMIN_AND_DIRECTOR,
  ACCOUNTS_AND_UP,
  EXECUTIVE,
  MANAGER_AND_UP,
  PORTAL_QUEUE_ROLES,
  PORTAL_SETUP_ROLES,
} from "@/config/routeRoles";

errorTrackingService.init({
  dsn: env.VITE_SENTRY_DSN,
  environment: env.VITE_APP_ENV,
  release: env.VITE_APP_VERSION,
  tracesSampleRate: env.VITE_SENTRY_TRACES_SAMPLE_RATE,
});

// Ship all five Core Web Vitals to Sentry RUM (CLS, FCP, INP, LCP, TTFB).
// Implementation lives in webVitalsService so the subscription set is
// unit-testable and adding a metric does not require editing the entry point.
subscribeWebVitals();

// Route-level code splitting — all pages are loaded on demand
const LandingPage = lazy(() => import("./pages/LandingPage"));
const CustomerServiceLayout = lazy(() => import("./components/layout/CustomerServiceLayout"));
const MyTickets = lazy(() => import("./pages/tickets/MyTickets"));
const CompletedRequests = lazy(() => import("./pages/tickets/CompletedRequests"));
const NewTicket = lazy(() => import("./pages/tickets/NewTicket"));
const ManagerDashboard = lazy(() => import("./pages/tickets/ManagerDashboard"));
const RequestReports = lazy(() => import("./pages/tickets/RequestReports"));
const RequestQueue = lazy(() => import("./pages/tickets/RequestQueue"));
const RequestSetup = lazy(() => import("./pages/tickets/RequestSetup"));
const RequestHistory = lazy(() => import("./pages/tickets/RequestHistory"));const PortalLanding = lazy(() => import('./pages/tickets/PortalLanding'));const PortalAnnouncements = lazy(() => import('./pages/tickets/PortalAnnouncements'));const PortalDocuments = lazy(() => import('./pages/tickets/PortalDocuments'));const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const AuthVerifyPage = lazy(() => import("./pages/AuthVerifyPage"));
const AccountPending = lazy(() => import("./pages/AccountPending"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Inbox = lazy(() => import("./pages/Inbox"));
const Home = lazy(() => import("./pages/Home"));
const KpiStudio = lazy(() => import("./pages/admin/KpiStudio"));
const WebhookOutbox = lazy(() => import("./pages/admin/WebhookOutbox"));
const AutoAgingDashboard = lazy(() => import("./pages/auto-aging/AutoAgingDashboard"));
const VehicleExplorer = lazy(() => import("./pages/auto-aging/VehicleExplorer"));
const ImportCenter = lazy(() => import("./pages/auto-aging/ImportCenter"));
const ImportReviewQueue = lazy(() => import("./pages/auto-aging/ImportReviewQueue"));
const ImportReviewDetail = lazy(() => import("./pages/auto-aging/ImportReviewDetail"));
const SLAAdmin = lazy(() => import("./pages/auto-aging/SLAAdmin"));
const MappingAdmin = lazy(() => import("./pages/auto-aging/MappingAdmin"));
const VehicleDetail = lazy(() => import("./pages/auto-aging/VehicleDetail"));
const CommissionDashboard = lazy(() => import("./pages/auto-aging/CommissionDashboard"));
const ReportCenter = lazy(() => import("./pages/auto-aging/ReportCenter"));
const DataQuality = lazy(() => import("./pages/auto-aging/DataQuality"));
const ImportHistory = lazy(() => import("./pages/auto-aging/ImportHistory"));
const ActivityDashboard = lazy(() => import("./pages/admin/ActivityDashboard"));
const DmsSyncOps = lazy(() => import("./pages/admin/DmsSyncOps"));
const ReconciliationQueue = lazy(() => import("./pages/admin/ReconciliationQueue"));
const ReconciliationDetail = lazy(() => import("./pages/admin/ReconciliationDetail"));
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
const PurchaseInvoiceDetail = lazy(() => import("./pages/purchasing/PurchaseInvoiceDetail"));
const PurchaseOrders = lazy(() => import("./pages/purchasing/PurchaseOrders"));
const PurchaseOrderNew = lazy(() => import("./pages/purchasing/PurchaseOrderNew"));
const PurchaseOrderDetail = lazy(() => import("./pages/purchasing/PurchaseOrderDetail"));
const GoodsReceiptNotes = lazy(() => import("./pages/purchasing/GoodsReceiptNotes"));
const GoodsReceiptNoteNew = lazy(() => import("./pages/purchasing/GoodsReceiptNoteNew"));
const GoodsReceiptNoteDetail = lazy(() => import("./pages/purchasing/GoodsReceiptNoteDetail"));
const ThreeWayMatch = lazy(() => import("./pages/purchasing/ThreeWayMatch"));
const ChartOfAccounts = lazy(() => import("./pages/accounts/ChartOfAccounts"));
const AccountingPeriods = lazy(() => import("./pages/accounts/AccountingPeriods"));
const TrialBalance = lazy(() => import("./pages/accounts/TrialBalance"));
const ProfitLoss = lazy(() => import("./pages/accounts/ProfitLoss"));
const BalanceSheet = lazy(() => import("./pages/accounts/BalanceSheet"));
const AgingByBranch = lazy(() => import("./pages/accounts/AgingByBranch"));
const CashPosition = lazy(() => import("./pages/accounts/CashPosition"));
const PeriodCloseDrilldown = lazy(() => import("./pages/accounts/PeriodCloseDrilldown"));
const JournalEntries = lazy(() => import("./pages/accounts/JournalEntries"));
const MarginAnalysis = lazy(() => import("./pages/sales/MarginAnalysis"));
const LeadIntake = lazy(() => import("./pages/sales/LeadIntake"));
const LeadIntakeDetail = lazy(() => import("./pages/sales/LeadIntakeDetail"));
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
const RolePermissionsPage = lazy(() => import('./pages/admin/RolePermissions'));
const HrmsWorkspaceRedirect = lazy(() => import('./pages/hrms/HrmsWorkspaceRedirect'));

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
  const { user } = useAuth();
  const location = useLocation();

  if (isPortalOnlyUser(user)) {
    // Portal-specific roles (internal requests) → keep going to /portal.
    // Other portal-only users (HRMS portal_access_only flag) fall through to
    // the HRMS workspace redirect below.
    if (hasPortalSpecificRole(user)) {
      return <Navigate to="/portal" state={{ from: location }} replace />;
    }
    // HRMS-only users (portal_access_only flag) → redirect to HRMS workspace
    const hrmsPath = getDedicatedHrmsWorkspacePath(HRMS_PATHS.root);
    if (!hrmsPath.startsWith('http')) {
      return <Navigate to={hrmsPath} state={{ from: location }} replace />;
    }
    window.location.replace(hrmsPath);
    return null;
  }

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

const queryClient = createAppQueryClient();

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
      { index: true, element: <Navigate to="/home" replace /> },
      { path: "profile", element: <Navigate to="/admin/settings" replace /> },
      // Legacy /modules URL — collapsed into /home (Phase 4 unification, 2026-05-28)
      { path: "modules", element: <Navigate to="/home" replace /> },
      { path: "notifications", element: <S><Notifications /></S> },
      { path: "inbox", element: <R scope="Inbox"><S><Inbox /></S></R> },
      { path: "home", element: <R scope="Home"><S><Home /></S></R> },
      { path: "auto-aging", element: withModuleAccess('auto-aging', <R scope="Auto-Aging"><S><AutoAgingDashboard /></S></R>) },
      { path: "auto-aging/vehicles", element: withModuleAccess('auto-aging', <R scope="Vehicle Explorer"><S><VehicleExplorer /></S></R>) },
      { path: "auto-aging/vehicles/:chassisNo", element: withModuleAccess('auto-aging', <R scope="Vehicle Detail"><S><VehicleDetail /></S></R>) },
      { path: "auto-aging/import", element: withModuleAccess('auto-aging', <RequireRole roles={MANAGER_AND_UP} section="Auto Aging"><R scope="Import Center"><S><ImportCenter /></S></R></RequireRole>) },
      { path: "auto-aging/review", element: withModuleAccess('auto-aging', <RequireRole roles={MANAGER_AND_UP} section="Auto Aging"><R scope="Import Review Queue"><S><ImportReviewQueue /></S></R></RequireRole>) },
      { path: "auto-aging/review/:batchId", element: withModuleAccess('auto-aging', <RequireRole roles={MANAGER_AND_UP} section="Auto Aging"><R scope="Import Review Detail"><S><ImportReviewDetail /></S></R></RequireRole>) },
      { path: "auto-aging/sla", element: withModuleAccess('auto-aging', <RequireRole roles={EXECUTIVE} section="Auto Aging"><R scope="SLA Admin"><S><SLAAdmin /></S></R></RequireRole>) },
      { path: "auto-aging/mappings", element: withModuleAccess('auto-aging', <RequireRole roles={EXECUTIVE} section="Auto Aging"><R scope="Mapping Admin"><S><MappingAdmin /></S></R></RequireRole>) },
      { path: "auto-aging/commissions", element: withModuleAccess('auto-aging', <RequireRole roles={MANAGER_AND_UP} section="Auto Aging"><R scope="Commissions"><S><CommissionDashboard /></S></R></RequireRole>) },
      { path: "auto-aging/quality", element: withModuleAccess('auto-aging', <R scope="Data Quality"><S><DataQuality /></S></R>) },
      { path: "auto-aging/history", element: withModuleAccess('auto-aging', <R scope="Import History"><S><ImportHistory /></S></R>) },
      { path: "auto-aging/reports", element: withModuleAccess('auto-aging', <R scope="Auto-Aging Reports"><S><ReportCenter /></S></R>) },
      {
        path: "sales",
        element: withModuleAccess('sales', <SalesLayout />),
        children: [
          { index: true, element: <R scope="Sales Dashboard"><S><SalesDashboard /></S></R> },
          { path: "pipeline", element: <RequireRole roles={MANAGER_AND_UP} section="Sales"><R scope="Deal Pipeline"><S><DealPipeline /></S></R></RequireRole> },
          { path: "lead-intake", element: <RequireRole roles={MANAGER_AND_UP} section="Sales"><R scope="Lead Intake"><S><LeadIntake /></S></R></RequireRole> },
          { path: "lead-intake/:kind/:rawId", element: <RequireRole roles={MANAGER_AND_UP} section="Sales"><R scope="Lead Detail"><S><LeadIntakeDetail /></S></R></RequireRole> },
          { path: "orders", element: <R scope="Sales Orders"><S><SalesOrders /></S></R> },
          { path: "customers", element: <R scope="Customers"><S><Customers /></S></R> },
          { path: "invoices", element: <RequireRole roles={MANAGER_AND_UP} section="Sales"><R scope="Invoices"><S><Invoices /></S></R></RequireRole> },
          { path: "performance", element: <RequireRole roles={MANAGER_AND_UP} section="Sales"><R scope="Salesman Performance"><S><SalesmanPerformancePage /></S></R></RequireRole> },
          { path: "advisors", element: <RequireRole roles={MANAGER_AND_UP} section="Sales"><R scope="Sales Advisors"><S><SalesAdvisors /></S></R></RequireRole> },
          { path: "margin", element: <RequireRole roles={EXECUTIVE} section="Sales"><R scope="Margin Analysis"><S><MarginAnalysis /></S></R></RequireRole> },
          { path: "outstanding", element: <R scope="Outstanding"><S><OutstandingCollection /></S></R> },
          { path: "dealer-invoices", element: <RequireRole roles={MANAGER_AND_UP} section="Sales"><R scope="Dealer Invoices"><S><DealerInvoices /></S></R></RequireRole> },
          { path: "verify-or", element: <RequireRole roles={MANAGER_AND_UP} section="Sales"><R scope="Verify OR"><S><VerifyOR /></S></R></RequireRole> },
        ],
      },
      { path: "inventory/stock", element: withModuleAccess('inventory', <R scope="Stock Balance"><S><StockBalance /></S></R>) },
      { path: "inventory/transfers", element: withModuleAccess('inventory', <RequireRole roles={MANAGER_AND_UP} section="Inventory"><R scope="Vehicle Transfer"><S><VehicleTransfer /></S></R></RequireRole>) },
      { path: "inventory/chassis", element: withModuleAccess('inventory', <R scope="Chassis Movement"><S><ChassisMovement /></S></R>) },
      { path: "purchasing/invoices", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="Purchase Invoices"><S><PurchaseInvoices /></S></R></RequireRole>) },
      { path: "purchasing/invoices/:id", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="Purchase Invoice Detail"><S><PurchaseInvoiceDetail /></S></R></RequireRole>) },
      { path: "purchasing/orders", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="Purchase Orders"><S><PurchaseOrders /></S></R></RequireRole>) },
      { path: "purchasing/orders/new", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="New Purchase Order"><S><PurchaseOrderNew /></S></R></RequireRole>) },
      { path: "purchasing/orders/:id", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="Purchase Order Detail"><S><PurchaseOrderDetail /></S></R></RequireRole>) },
      { path: "purchasing/grn", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="Goods Receipt Notes"><S><GoodsReceiptNotes /></S></R></RequireRole>) },
      { path: "purchasing/grn/new", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="New GRN"><S><GoodsReceiptNoteNew /></S></R></RequireRole>) },
      { path: "purchasing/grn/:id", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="GRN Detail"><S><GoodsReceiptNoteDetail /></S></R></RequireRole>) },
      { path: "purchasing/three-way-match", element: withModuleAccess('purchasing', <RequireRole roles={MANAGER_AND_UP} section="Purchasing"><R scope="3-way Match"><S><ThreeWayMatch /></S></R></RequireRole>) },
      { path: "accounts/chart", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Chart of Accounts"><S><ChartOfAccounts /></S></R></RequireRole> },
      { path: "accounts/periods", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Accounting Periods"><S><AccountingPeriods /></S></R></RequireRole> },
      { path: "accounts/trial-balance", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Trial Balance"><S><TrialBalance /></S></R></RequireRole> },
      { path: "accounts/profit-loss", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Profit & Loss"><S><ProfitLoss /></S></R></RequireRole> },
      { path: "accounts/balance-sheet", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Balance Sheet"><S><BalanceSheet /></S></R></RequireRole> },
      { path: "accounts/aging-by-branch", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Aging by Branch"><S><AgingByBranch /></S></R></RequireRole> },
      { path: "accounts/cash-position", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Cash Position"><S><CashPosition /></S></R></RequireRole> },
      { path: "accounts/period-close", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Period Close"><S><PeriodCloseDrilldown /></S></R></RequireRole> },
      { path: "accounts/journal", element: <RequireRole roles={ACCOUNTS_AND_UP} section="Accounts"><R scope="Journal Entries"><S><JournalEntries /></S></R></RequireRole> },
      { path: "admin/activity", element: <RequireRole roles={EXECUTIVE} section="Admin"><R scope="Activity Dashboard"><S><ActivityDashboard /></S></R></RequireRole> },
      { path: "admin/kpi-studio", element: <RequireRole roles={ADMIN_AND_DIRECTOR} section="Admin"><R scope="KPI Studio"><S><KpiStudio /></S></R></RequireRole> },
      { path: "admin/webhooks",   element: <RequireRole roles={ADMIN_ONLY} section="Admin"><R scope="Webhook Outbox"><S><WebhookOutbox /></S></R></RequireRole> },
      { path: "admin/dms-sync", element: <RequireRole roles={ADMIN_AND_DIRECTOR} section="Admin"><R scope="DMS Sync Ops"><S><DmsSyncOps /></S></R></RequireRole> },
      { path: "admin/reconciliation", element: <RequireRole roles={ADMIN_AND_DIRECTOR} section="Admin"><R scope="Reconciliation Queue"><S><ReconciliationQueue /></S></R></RequireRole> },
      { path: "admin/reconciliation/:matchId", element: <RequireRole roles={ADMIN_AND_DIRECTOR} section="Admin"><R scope="Reconciliation Match"><S><ReconciliationDetail /></S></R></RequireRole> },
      { path: "admin/users", element: <RequireRole roles={ADMIN_ONLY} section="Admin"><R scope="Users"><S><UserManagement /></S></R></RequireRole> },
      { path: "admin/audit", element: <RequireRole roles={ADMIN_AND_DIRECTOR} section="Admin"><R scope="Audit Log"><S><AuditLog /></S></R></RequireRole> },
      // admin/settings intentionally has NO RequireRole guard — it doubles as
      // the /profile redirect target (personal name/password/branch editing).
      // Admin-only features (branding, modules, user roles) are gated internally
      // via isAdmin checks in SettingsPage and by RLS on the backend tables.
      { path: "admin/settings", element: <R scope="Settings"><S><SettingsPage /></S></R> },
      { path: "admin/branches", element: <RequireRole roles={ADMIN_ONLY} section="Admin"><R scope="Branches"><S><BranchManagement /></S></R></RequireRole> },
      { path: "admin/master-data", element: <RequireRole roles={ADMIN_ONLY} section="Admin"><R scope="Master Data"><S><MasterData /></S></R></RequireRole> },
      { path: "admin/suppliers", element: <RequireRole roles={ADMIN_ONLY} section="Admin"><R scope="Suppliers"><S><Suppliers /></S></R></RequireRole> },
      { path: "admin/dealers", element: <RequireRole roles={ADMIN_ONLY} section="Admin"><R scope="Dealers"><S><Dealers /></S></R></RequireRole> },
      { path: "admin/user-groups", element: <RequireRole roles={ADMIN_ONLY} section="Admin"><R scope="User Groups"><S><UserGroups /></S></R></RequireRole> },
      { path: 'admin/role-permissions', element: <RequireRole roles={ADMIN_ONLY} section="Admin"><R scope="Role Permissions"><S><RolePermissionsPage /></S></R></RequireRole> },
      { path: "reports", element: withModuleAccess('reports', <R scope="Reports"><S><ReportsCenter /></S></R>) },
      { path: "inventory/chassis-filter", element: withModuleAccess('inventory', <R scope="Advanced Search"><S><ChassisFilter /></S></R>) },
      { path: "hrms", element: withModuleAccess('hrms', <R scope="HRMS Workspace"><S><HrmsWorkspaceRedirect /></S></R>) },
      { path: "hrms/admin", element: <LocationPreservingNavigate to={HRMS_PATHS.settings} /> },
      { path: "hrms/leave-calendar", element: <LocationPreservingNavigate to={HRMS_PATHS.leaveCalendar} /> },
      { path: "hrms/*", element: withModuleAccess('hrms', <R scope="HRMS Workspace"><S><HrmsWorkspaceRedirect /></S></R>) },
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
      { index: true, element: <S><PortalLanding /></S> },
      { path: "tickets", element: <S><R scope="Pending Requests"><MyTickets /></R></S> },
      { path: "tickets/completed", element: <S><R scope="Completed Requests"><CompletedRequests /></R></S> },
      { path: "tickets/new", element: <S><R scope="New Ticket"><NewTicket /></R></S> },
      { path: "dashboard", element: <RequireRole roles={PORTAL_QUEUE_ROLES} section="Platform"><S><R scope="Manager Dashboard"><ManagerDashboard /></R></S></RequireRole> },
      { path: "queue", element: <RequireRole roles={PORTAL_QUEUE_ROLES} section="Platform"><S><R scope="Pending / Active Requests"><RequestQueue /></R></S></RequireRole> },
      { path: "history", element: <RequireRole roles={PORTAL_QUEUE_ROLES} section="Platform"><S><R scope="Completed Requests"><RequestHistory /></R></S></RequireRole> },
      { path: "reports", element: <RequireRole roles={PORTAL_QUEUE_ROLES} section="Platform"><S><R scope="Reports"><RequestReports /></R></S></RequireRole> },
      { path: "setup", element: <RequireRole roles={PORTAL_SETUP_ROLES} section="Platform"><S><R scope="Request Setup"><RequestSetup /></R></S></RequireRole> },
      { path: "announcements", element: <S><R scope="Portal Announcements"><PortalAnnouncements /></R></S> },
      { path: "documents", element: <S><R scope="Portal Documents"><PortalDocuments /></R></S> },
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
    path: "/auth/v1/verify",
    element: <S><AuthVerifyPage /></S>,
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

function BrandedShellEffect() {
  useApplyBranding();
  return null;
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="flc-ui-theme" disableTransitionOnChange>
        <TooltipProvider>
          <Sonner />
          <ErrorBoundary>
            <AuthProvider>
              <BrandingProvider>
                <BrandedShellEffect />
                <PlatformHealthBanner />
                <OfflineBanner />
                <RouterProvider router={router} />
              </BrandingProvider>
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
