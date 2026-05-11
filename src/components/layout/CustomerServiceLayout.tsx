import { AppShell } from './app-shell';
import { useInternalRequestsShellConfig } from './app-shell/internalRequestsShellConfig';

export default function CustomerServiceLayout() {
  const shellConfig = useInternalRequestsShellConfig();

  return <AppShell {...shellConfig} mobileSheetTitle="Internal Requests navigation" />;
}
