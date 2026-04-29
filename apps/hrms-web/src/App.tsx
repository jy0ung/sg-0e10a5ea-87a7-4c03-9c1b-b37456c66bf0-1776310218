import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AuthProvider, ProtectedRoute } from '@/contexts/AuthContext';
import { ModuleAccessProvider, useModuleAccess } from '@/contexts/ModuleAccessContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorBoundary } from '@/components/shared/RouteErrorBoundary';
import { LocationPreservingNavigate } from '@/components/shared/LocationPreservingNavigate';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { RequireRole } from '@/components/shared/RequireRole';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { env } from '@/config/env';
import { createAppQueryClient } from '@/lib/queryClient';
import { errorTrackingService } from '@/services/errorTrackingService';
import {
  HRMS_ADMIN,
  HRMS_APPRAISALS,
  HRMS_APPROVAL_INBOX,
  HRMS_LEAVE,
  HRMS_PAYROLL,
  MANAGER_AND_UP,
} from '@/config/routeRoles';
import HrmsLayout from './layout/HrmsLayout';
import ProfilePage from './pages/ProfilePage';
import { getHrmsRouterBaseName, hrmsCompatibilityRedirects } from './routes';

errorTrackingService.init({
  dsn: env.VITE_SENTRY_DSN,
  environment: env.VITE_APP_ENV,
  release: env.VITE_APP_VERSION,
  tracesSampleRate: env.VITE_SENTRY_TRACES_SAMPLE_RATE,
});

const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const SignUpPage = lazy(() => import('@/pages/SignUpPage'));
const AccountPending = lazy(() => import('@/pages/AccountPending'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const ApprovalInbox = lazy(() => import('@/pages/hrms/ApprovalInbox'));
const LeaveManagement = lazy(() => import('@/pages/hrms/LeaveManagement'));
const LeaveCalendar = lazy(() => import('@/pages/hrms/LeaveCalendar'));
const AttendanceLog = lazy(() => import('@/pages/hrms/AttendanceLog'));
const PayrollSummary = lazy(() => import('@/pages/hrms/PayrollSummary'));
const PerformanceAppraisals = lazy(() => import('@/pages/hrms/PerformanceAppraisals'));
const HrmsAnnouncements = lazy(() => import('@/pages/hrms/Announcements'));
const EmployeeDirectory = lazy(() => import('@/pages/hrms/EmployeeDirectory'));
const HrmsAdmin = lazy(() => import('@/pages/hrms/HrmsAdmin'));
const ApprovalFlows = lazy(() => import('@/pages/hrms/ApprovalFlows'));

const queryClient = createAppQueryClient();

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
}

function R({ scope, children }: { scope: string; children: React.ReactNode }) {
  return <RouteErrorBoundary scope={`HRMS Web: ${scope}`}>{children}</RouteErrorBoundary>;
}

function RequireHrmsModule({ children }: { children: React.ReactNode }) {
  const { loading, isModuleActive } = useModuleAccess();

  if (loading) return <PageSpinner />;
  if (!isModuleActive('hrms')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-md border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-xl font-semibold">HRMS is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            HRMS access is disabled for your company. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedHrmsShell() {
  return (
    <ProtectedRoute>
      <ModuleAccessProvider>
        <RequireHrmsModule>
          <HrmsLayout />
        </RequireHrmsModule>
      </ModuleAccessProvider>
    </ProtectedRoute>
  );
}

const routerBaseName = getHrmsRouterBaseName(import.meta.env.BASE_URL);

const router = createBrowserRouter([
  {
    path: '/',
    element: <ProtectedHrmsShell />,
    children: [
      { index: true, element: <Navigate to="leave" replace /> },
      { path: 'profile', element: <R scope="Profile"><ProfilePage /></R> },
      { path: 'leave', element: <RequireRole roles={HRMS_LEAVE}><R scope="Leave"><S><LeaveManagement /></S></R></RequireRole> },
      { path: 'leave/calendar', element: <RequireRole roles={MANAGER_AND_UP}><R scope="Leave Calendar"><S><LeaveCalendar /></S></R></RequireRole> },
      { path: 'attendance', element: <RequireRole roles={MANAGER_AND_UP}><R scope="Attendance"><S><AttendanceLog /></S></R></RequireRole> },
      { path: 'approvals', element: <RequireRole roles={HRMS_APPROVAL_INBOX}><R scope="Approvals"><S><ApprovalInbox /></S></R></RequireRole> },
      { path: 'appraisals', element: <RequireRole roles={HRMS_APPRAISALS}><R scope="Appraisals"><S><PerformanceAppraisals /></S></R></RequireRole> },
      { path: 'announcements', element: <RequireRole roles={MANAGER_AND_UP}><R scope="Announcements"><S><HrmsAnnouncements /></S></R></RequireRole> },
      { path: 'employees', element: <RequireRole roles={MANAGER_AND_UP}><R scope="Employees"><S><EmployeeDirectory /></S></R></RequireRole> },
      { path: 'payroll', element: <RequireRole roles={HRMS_PAYROLL}><R scope="Payroll"><S><PayrollSummary /></S></R></RequireRole> },
      { path: 'settings', element: <RequireRole roles={HRMS_ADMIN}><R scope="Settings"><S><HrmsAdmin /></S></R></RequireRole> },
      { path: 'approval-flows', element: <RequireRole roles={HRMS_ADMIN}><R scope="Approval Flows"><S><ApprovalFlows /></S></R></RequireRole> },
      { path: 'unauthorized', element: <UnauthorizedAccess /> },
      ...hrmsCompatibilityRedirects.map((route) => ({
        path: route.path,
        element: <LocationPreservingNavigate to={route.to} />,
      })),
    ],
  },
  { path: '/login', element: <S><LoginPage /></S> },
  { path: '/forgot-password', element: <S><ForgotPasswordPage /></S> },
  { path: '/reset-password', element: <S><ResetPasswordPage /></S> },
  { path: '/signup', element: <S><SignUpPage /></S> },
  { path: '/account-pending', element: <S><AccountPending /></S> },
  { path: '*', element: <S><NotFound /></S> },
], { basename: routerBaseName });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="flc-hrms-theme" disableTransitionOnChange>
        <TooltipProvider>
          <Toaster />
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
}