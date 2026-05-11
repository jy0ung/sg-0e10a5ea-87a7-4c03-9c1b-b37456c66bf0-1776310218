import { AppShell } from '@/components/layout/app-shell';
import { useHrmsShellConfig } from './hrmsShellConfig';

export default function HrmsLayout() {
  const shellConfig = useHrmsShellConfig();

  return <AppShell {...shellConfig} mobileSheetTitle="HRMS navigation" />;
}