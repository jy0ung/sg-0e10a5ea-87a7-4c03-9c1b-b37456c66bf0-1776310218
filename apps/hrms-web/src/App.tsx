import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AuthProvider, ProtectedRoute } from '@/contexts/AuthContext';
import { ModuleAccessProvider, useModuleAccess } from '@/contexts/ModuleAccessContext';
import { BrandingProvider } from '@/contexts/BrandingContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorBoundary } from '@/components/shared/RouteErrorBoundary';
import { LocationPreservingNavigate } from '@/components/shared/LocationPreservingNavigate';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { RequireHrmsRouteAccess } from '@/components/shared/RequireHrmsRouteAccess';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { env } from '@/config/env';
import { createAppQueryClient } from '@/lib/queryClient';
import { errorTrackingService } from '@flc/platform-services';
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
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const SignUpPage = lazy(() => import('./pages/SignUpPage'));
const AccountPending = lazy(() => import('./pages/AccountPending'));
const NotFound = lazy(() => import('./pages/NotFound'));
const HrmsDashboard = lazy(() => import('./pages/hrms/HrmsDashboard'));
const ApprovalInbox = lazy(() => import('./pages/hrms/ApprovalInbox'));
const LeaveManagement = lazy(() => import('./pages/hrms/LeaveManagement'));
const TeamLeave = lazy(() => import('./pages/hrms/TeamLeave'));
const LeaveCalendar = lazy(() => import('./pages/hrms/LeaveCalendar'));
const AttendanceLog = lazy(() => import('./pages/hrms/AttendanceLog'));
const PayrollSummary = lazy(() => import('./pages/hrms/PayrollSummary'));
const PerformanceAppraisals = lazy(() => import('./pages/hrms/PerformanceAppraisals'));
const HrmsAnnouncements = lazy(() => import('./pages/hrms/Announcements'));
const EmployeeDirectory = lazy(() => import('./pages/hrms/EmployeeDirectory'));
const EmployeeProfile = lazy(() => import('./pages/hrms/employee/EmployeeProfile'));
const HrmsAdmin = lazy(() => import('./pages/hrms/HrmsAdmin'));

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
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard', element: <RequireHrmsRouteAccess access="dashboard"><R scope="Dashboard"><S><HrmsDashboard /></S></R></RequireHrmsRouteAccess> },
      { path: 'profile', element: <RequireHrmsRouteAccess access="profile"><R scope="Profile"><ProfilePage /></R></RequireHrmsRouteAccess> },
      { path: 'leave', element: <RequireHrmsRouteAccess access="leave"><R scope="Leave"><S><LeaveManagement /></S></R></RequireHrmsRouteAccess> },
      { path: 'leave/team', element: <RequireHrmsRouteAccess access="teamLeave"><R scope="Team Leave"><S><TeamLeave /></S></R></RequireHrmsRouteAccess> },
      { path: 'leave/calendar', element: <RequireHrmsRouteAccess access="leaveCalendar"><R scope="Leave Calendar"><S><LeaveCalendar /></S></R></RequireHrmsRouteAccess> },
      { path: 'attendance', element: <RequireHrmsRouteAccess access="attendancePage"><R scope="Attendance"><S><AttendanceLog /></S></R></RequireHrmsRouteAccess> },
      { path: 'approvals', element: <RequireHrmsRouteAccess access="approvals"><R scope="Approvals"><S><ApprovalInbox /></S></R></RequireHrmsRouteAccess> },
      { path: 'appraisals', element: <RequireHrmsRouteAccess access="appraisals"><R scope="Appraisals"><S><PerformanceAppraisals /></S></R></RequireHrmsRouteAccess> },
      { path: 'announcements', element: <RequireHrmsRouteAccess access="announcements"><R scope="Announcements"><S><HrmsAnnouncements /></S></R></RequireHrmsRouteAccess> },
      { path: 'employees', element: <RequireHrmsRouteAccess access="employees"><R scope="Employees"><S><EmployeeDirectory /></S></R></RequireHrmsRouteAccess> },
      { path: 'employees/:id', element: <RequireHrmsRouteAccess access="employees"><R scope="Employee Profile"><S><EmployeeProfile /></S></R></RequireHrmsRouteAccess> },
      { path: 'payroll', element: <RequireHrmsRouteAccess access="payroll"><R scope="Payroll"><S><PayrollSummary /></S></R></RequireHrmsRouteAccess> },
      { path: 'settings', element: <RequireHrmsRouteAccess access="settings"><R scope="Settings"><S><HrmsAdmin /></S></R></RequireHrmsRouteAccess> },
      { path: 'settings/leave-quota', element: <RequireHrmsRouteAccess access="leaveQuota"><R scope="Leave Quota Settings"><S><HrmsAdmin /></S></R></RequireHrmsRouteAccess> },
      { path: 'settings/:module', element: <RequireHrmsRouteAccess access="settings"><R scope="Settings Module"><S><HrmsAdmin /></S></R></RequireHrmsRouteAccess> },
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
              <BrandingProvider>
                <RouterProvider router={router} />
              </BrandingProvider>
            </AuthProvider>
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
