import { useMemo } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { useApprovalInboxItems } from '@/hooks/useApprovalInboxItems';
import type { AppShellNavSection, AppShellRouteChromeMatch } from '@/components/layout/app-shell';
import { hrmsNavItems } from './navItems';

const HRMS_ROUTE_CHROME: AppShellRouteChromeMatch[] = [
  { pattern: /^\/dashboard/, title: 'My Dashboard', kicker: 'Your HRMS command centre' },
  { pattern: /^\/leave\/calendar/, title: 'Leave Calendar', kicker: 'Team leave visibility' },
  { pattern: /^\/leave$/, title: 'Leave', kicker: 'Requests, balances, and approvals' },
  { pattern: /^\/attendance/, title: 'Attendance', kicker: 'Daily workforce records' },
  { pattern: /^\/approvals/, title: 'Approval Inbox', kicker: 'Assigned HRMS decisions' },
  { pattern: /^\/appraisals/, title: 'Appraisals', kicker: 'Review cycles and outcomes' },
  { pattern: /^\/announcements/, title: 'Announcements', kicker: 'Company communications' },
  { pattern: /^\/employees\/[^/]+/, title: 'Employee Profile', kicker: 'Workforce record' },
  { pattern: /^\/employees/, title: 'Employees', kicker: 'Workforce directory' },
  { pattern: /^\/payroll/, title: 'Payroll', kicker: 'Runs, approvals, and payout status' },
  { pattern: /^\/settings/, title: 'Settings', kicker: 'Admin console and workflow governance' },
  { pattern: /^\/profile/, title: 'My Profile', kicker: 'HRMS identity and access' },
];

function groupHrmsItems(items: typeof hrmsNavItems): AppShellNavSection[] {
  const groups = new Map<string, typeof hrmsNavItems>();
  items.forEach((item) => groups.set(item.group, [...(groups.get(item.group) ?? []), item]));

  return Array.from(groups.entries()).map(([name, groupItems]) => ({
    name,
    items: groupItems.map((item) => ({
      label: item.label,
      path: item.path,
      icon: item.icon,
      end: item.path === '/leave',
      badgeCount: item.badgeCount,
    })),
    showHeader: true,
    showItems: true,
    showGroupLabels: true,
  }));
}

export function useHrmsShellConfig() {
  const { user, logout } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const { branding } = useBranding();
  const { items: approvalInboxItems } = useApprovalInboxItems({
    enabled: hrmsAccess.canAccessRoute('approvals'),
  });
  const sections = useMemo(() => {
    const visibleItems = hrmsNavItems
      .filter((item) => !item.access || hrmsAccess.canAccessRoute(item.access))
      .map((item) => item.access === 'approvals'
        ? { ...item, badgeCount: approvalInboxItems.length || undefined }
        : item);
    return groupHrmsItems(visibleItems);
  }, [approvalInboxItems.length, hrmsAccess]);

  const primaryRoleLabel = hrmsAccess.primaryRoleLabel ?? 'No HRMS role';

  return {
    brand: {
      title: branding.appShortName ? `${branding.appShortName} HRMS` : 'HRMS',
      subtitle: 'People operations',
      logoSrc: branding.logoUrl ?? undefined,
      logoAlt: branding.companyName,
    },
    sections,
    routeChrome: HRMS_ROUTE_CHROME,
    fallbackChrome: { title: 'HRMS Workspace', kicker: 'People operations' },
    user: user ? { name: user.name, email: user.email, role: `HRMS: ${primaryRoleLabel}`, profilePath: '/profile' } : undefined,
    onSignOut: () => void logout(),
    topbarActions: hrmsAccess.canAccessRoute('announcements') ? [{ label: 'Open announcements', icon: Bell, to: '/announcements' }] : [],
    searchPlaceholder: 'Search HRMS...',
    widthMode: 'full' as const,
  };
}
