import { ArrowLeft, Archive, ClipboardList, ListTodo, Settings2, TicketCheck } from 'lucide-react';
import { PORTAL_QUEUE_ROLES, PORTAL_SETUP_ROLES } from '@/config/routeRoles';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { canAccessMainApp } from '@/lib/portalAccess';
import type { AppShellNavItem, AppShellRouteChromeMatch } from './types';

const baseNavItems: AppShellNavItem[] = [
  { label: 'New Request', path: '/portal/tickets/new', icon: TicketCheck, end: true },
  { label: 'My Requests', path: '/portal/tickets', icon: ClipboardList, end: true },
];

const queueNavItems: AppShellNavItem[] = [
  { label: 'Request Queue', path: '/portal/queue', icon: ListTodo },
  { label: 'Request History', path: '/portal/history', icon: Archive },
];

const setupNavItem: AppShellNavItem = { label: 'Request Setup', path: '/portal/setup', icon: Settings2 };

const portalQueueRoles = new Set<string>(PORTAL_QUEUE_ROLES);
const portalSetupRoles = new Set<string>(PORTAL_SETUP_ROLES);

const INTERNAL_REQUESTS_ROUTE_CHROME: AppShellRouteChromeMatch[] = [
  { pattern: /^\/portal\/tickets\/new/, title: 'New Request', kicker: 'Submit and track internal support demand' },
  { pattern: /^\/portal\/tickets$/, title: 'My Requests', kicker: 'Requester history and updates' },
  { pattern: /^\/portal\/queue/, title: 'Request Queue', kicker: 'Triage, assign, and resolve requests' },
  { pattern: /^\/portal\/history/, title: 'Request History', kicker: 'Resolved and closed requests' },
  { pattern: /^\/portal\/setup/, title: 'Request Setup', kicker: 'Configure categories, routing, and forms' },
];

export function useInternalRequestsShellConfig() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const userRole = user?.role ?? '';
  const navItems = [
    ...baseNavItems,
    ...(portalQueueRoles.has(userRole) ? queueNavItems : []),
    ...(portalSetupRoles.has(userRole) ? [setupNavItem] : []),
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
        showGroupLabels: false,
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