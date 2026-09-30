import { AppShell } from './app-shell';
import { useMainAppShellConfig } from './app-shell/mainShellConfig';
import { useLocation } from 'react-router-dom';
import { useDiagnosticMount, useDiagnosticRoute } from '@/hooks/useLifecycleDiagnostics';

export default function AppLayout() {
  const location = useLocation();
  useDiagnosticMount('shell');
  useDiagnosticRoute(location.pathname, location.key);
  const shellConfig = useMainAppShellConfig();

  return (
    <AppShell
      {...shellConfig}
      collapsibleSidebar
      autoCollapseOnTablet
      mobileSheetTitle="Navigation"
    />
  );
}
