import { AppShell } from './app-shell';
import { useMainAppShellConfig } from './app-shell/mainShellConfig';

export default function AppLayout() {
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
