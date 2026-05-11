import { useMemo } from 'react';
import { Bell } from 'lucide-react';
import { brandAssets } from '@/config/brand';
import { useAuth } from '@/contexts/AuthContext';
import type { AppShellNavSection, AppShellRouteChromeMatch } from '@/components/layout/app-shell';
import type { AppRole } from '@/types';
import { hrmsNavItems } from './navItems';

const HRMS_ROUTE_CHROME: AppShellRouteChromeMatch[] = [
  { pattern: /^\/leave\/calendar/, title: 'Leave Calendar', kicker: 'Team leave visibility' },
  { pattern: /^\/leave$/, title: 'Leave Management', kicker: 'Requests, balances, and approvals' },
  { pattern: /^\/attendance/, title: 'Attendance Log', kicker: 'Daily workforce records' },
  { pattern: /^\/approvals/, title: 'Approval Inbox', kicker: 'Assigned HRMS decisions' },
  { pattern: /^\/appraisals/, title: 'Performance Appraisals', kicker: 'Review cycles and outcomes' },
  { pattern: /^\/announcements/, title: 'Announcements', kicker: 'Company communications' },
  { pattern: /^\/employees/, title: 'Employee Directory', kicker: 'Workforce records' },
  { pattern: /^\/payroll/, title: 'Payroll Workspace', kicker: 'Runs, approvals, and payout status' },
  { pattern: /^\/settings/, title: 'HRMS Settings', kicker: 'Departments, roles, leave, and holidays' },
  { pattern: /^\/approval-flows/, title: 'Approval Flows', kicker: 'Workflow governance' },
  { pattern: /^\/profile/, title: 'Profile', kicker: 'HRMS identity and access' },
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
    })),
    showHeader: true,
    showItems: true,
    showGroupLabels: false,
  }));
}

export function useHrmsShellConfig() {
  const { user, logout, hasRole } = useAuth();
  const sections = useMemo(() => {
    const visibleItems = hrmsNavItems.filter((item) => !item.roles || hasRole(item.roles as AppRole[]));
    return groupHrmsItems(visibleItems);
  }, [hasRole]);

  return {
    brand: {
      title: 'FLC HRMS',
      subtitle: 'People operations',
      logoSrc: brandAssets.compactLogo,
      logoAlt: 'Fook Loi',
    },
    sections,
    routeChrome: HRMS_ROUTE_CHROME,
    fallbackChrome: { title: 'HRMS Workspace', kicker: 'People operations' },
    user: user ? { name: user.name, email: user.email, role: user.role, profilePath: '/profile' } : undefined,
    onSignOut: () => void logout(),
    topbarActions: [{ label: 'Open announcements', icon: Bell, to: '/announcements' }],
    searchPlaceholder: 'Search HRMS...',
    widthMode: 'full' as const,
  };
}