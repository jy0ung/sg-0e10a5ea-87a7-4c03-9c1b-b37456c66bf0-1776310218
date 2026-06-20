import { ArrowLeft, Archive, BarChart3, ClipboardList, FileSpreadsheet, FolderOpen, Home, ListTodo, Megaphone, Settings2, TicketCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { canAccessMainApp, canManagePortalQueue, canManagePortalSetup } from '@/lib/portalAccess';
import type { AppShellNavItem, AppShellRouteChromeMatch } from '@flc/shell';

const baseNavItems: AppShellNavItem[] = [
  { label: 'Overview', path: '/portal', icon: Home, group: 'My Work', end: true },
  { label: 'New Request', path: '/portal/tickets/new', icon: TicketCheck, group: 'My Work', end: true },
  { label: 'Pending Requests', path: '/portal/tickets', icon: ClipboardList, group: 'My Work', end: true },
  { label: 'Completed Requests', path: '/portal/tickets/completed', icon: Archive, group: 'My Work', end: true },
];

const resourceNavItems: AppShellNavItem[] = [
  { label: 'Announcements', path: '/portal/announcements', icon: Megaphone, group: 'Resources' },
  { label: 'Documents & Forms', path: '/portal/documents', icon: FolderOpen, group: 'Resources' },
];

const queueNavItems: AppShellNavItem[] = [
  { label: 'Manager Dashboard', path: '/portal/dashboard', icon: BarChart3, group: 'Operations' },
  { label: 'Pending / Active Requests', path: '/portal/queue', icon: ListTodo, group: 'Operations' },
  { label: 'Completed Requests', path: '/portal/history', icon: Archive, group: 'Operations' },
  { label: 'Reports', path: '/portal/reports', icon: FileSpreadsheet, group: 'Operations' },
];

const setupNavItem: AppShellNavItem = { label: 'Request Setup', path: '/portal/setup', icon: Settings2, group: 'Administration' };

const INTERNAL_REQUESTS_ROUTE_CHROME: AppShellRouteChromeMatch[] = [
  { pattern: /^\/portal\/?$/, title: 'Overview', kicker: 'Internal requests workspace' },
  { pattern: /^\/portal\/tickets\/new/, title: 'New Request', kicker: 'Submit and track internal support demand' },
  { pattern: /^\/portal\/tickets\/completed/, title: 'Completed Requests', kicker: 'Closed requester-confirmed requests' },
  { pattern: /^\/portal\/tickets\/[^/]+/, title: 'Ticket Workspace', kicker: 'Full request handling and accountability view' },
  { pattern: /^\/portal\/tickets$/, title: 'Pending Requests', kicker: 'Requester actions and active updates' },
  { pattern: /^\/portal\/dashboard/, title: 'Manager Dashboard', kicker: 'SLA, workload, and bottleneck visibility' },
  { pattern: /^\/portal\/queue/, title: 'Pending / Active Requests', kicker: 'Triage, assign, and resolve requests' },
  { pattern: /^\/portal\/history/, title: 'Completed Requests', kicker: 'Closed requester-confirmed requests' },
  { pattern: /^\/portal\/reports/, title: 'Reports', kicker: 'SLA, owner, category, aging, and export views' },
  { pattern: /^\/portal\/setup/, title: 'Request Setup', kicker: 'Configure categories, routing, and forms' },
  { pattern: /^\/portal\/announcements/, title: 'Announcements', kicker: 'Internal Request notices, process updates, and memos' },
  { pattern: /^\/portal\/documents/, title: 'Documents & Forms', kicker: 'Downloadable forms, templates, SOPs, and supporting documents' },
];

export function useInternalRequestsShellConfig() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const navItems = [
    ...baseNavItems,
    ...(canManagePortalQueue(user) ? queueNavItems : []),
    ...resourceNavItems,
    ...(canManagePortalSetup(user) ? [setupNavItem] : []),
  ];

  return {
    brand: {
      title: 'Internal Requests',
      subtitle: 'Service operations',
      logoSrc: branding.logoUrl ?? undefined,
      logoAlt: branding.companyName,
    },
    sections: [
      {
        name: 'Requests',
        items: navItems,
        showHeader: true,
        showItems: true,
        showGroupLabels: true,
      },
    ],
    routeChrome: INTERNAL_REQUESTS_ROUTE_CHROME,
    fallbackChrome: { title: 'Internal Requests', kicker: 'Support workspace' },
    user: user ? { name: user.name, email: user.email, role: user.role } : undefined,
    onSignOut: () => void logout(),
    footerActions: canAccessMainApp(user)
      ? [{ label: 'Back to App', to: '/', icon: ArrowLeft }]
      : [],
    searchPlaceholder: 'Search requests...',
    widthMode: 'full' as const,
    contentClassName: 'h-full',
    collapsibleSidebar: false,
  };
}
