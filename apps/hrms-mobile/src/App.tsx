import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }                  from '@/contexts/AuthContext';
import { useAppLifecycle }                         from '@/hooks/useAppLifecycle';
import LoginScreen        from '@/screens/LoginScreen';
import DashboardScreen    from '@/screens/DashboardScreen';
import LeaveScreen        from '@/screens/LeaveScreen';
import LeaveHistoryScreen from '@/screens/LeaveHistoryScreen';
import AttendanceScreen   from '@/screens/AttendanceScreen';
import AnnouncementsScreen from '@/screens/AnnouncementsScreen';
import AppraisalsScreen   from '@/screens/AppraisalsScreen';
import PayslipScreen      from '@/screens/PayslipScreen';
import ProfileScreen      from '@/screens/ProfileScreen';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-foreground">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Inner component that has access to router context for lifecycle hooks. */
function AppRoutes() {
  useAppLifecycle();

  return (
    <Routes>
      <Route path="/login"         element={<LoginScreen />} />
      <Route path="/"              element={<ProtectedRoute><DashboardScreen /></ProtectedRoute>} />
      <Route path="/leave"         element={<ProtectedRoute><LeaveScreen /></ProtectedRoute>} />
      <Route path="/leave/history" element={<ProtectedRoute><LeaveHistoryScreen /></ProtectedRoute>} />
      <Route path="/attendance"    element={<ProtectedRoute><AttendanceScreen /></ProtectedRoute>} />
      <Route path="/announcements" element={<ProtectedRoute><AnnouncementsScreen /></ProtectedRoute>} />
      <Route path="/appraisals"    element={<ProtectedRoute><AppraisalsScreen /></ProtectedRoute>} />
      <Route path="/payslip"       element={<ProtectedRoute><PayslipScreen /></ProtectedRoute>} />
      <Route path="/profile"       element={<ProtectedRoute><ProfileScreen /></ProtectedRoute>} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
