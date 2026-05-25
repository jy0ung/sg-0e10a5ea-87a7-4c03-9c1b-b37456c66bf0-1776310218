import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
  Car,
  Database,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Gauge,
  GitBranch,
  Grid3X3,
  HeadphonesIcon,
  History,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  Map as MapIcon,
  Package,
  Receipt,
  Scale,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Truck,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useFocusedMode } from '@/hooks/useFocusedMode';
import { useRoleSectionMatrix } from '@/hooks/usePermissions';
import { STALE } from '@/lib/queryClient';
import { getDedicatedHrmsWorkspacePath, HRMS_PATHS, isHrmsWorkspacePath } from '@/lib/hrmsWorkspace';
import { getModuleIdForPath, getModuleIdForSection } from '@/lib/moduleAccess';
import { getNotifications } from '@/services/notificationService';
import type { AppRole } from '@/types';
import type { AppShellNavItem, AppShellNavSection, AppShellRouteChromeMatch } from '@flc/shell';

interface MainNavItem extends AppShellNavItem {
  section: string;
  roles?: AppRole[];
}

interface MainSectionDef {
  name: string;
  icon: AppShellNavSection['icon'];
  path?: string;
  external?: boolean;
}

const sectionDefs: MainSectionDef[] = [
  { name: 'Platform', icon: LayoutDashboard },
  { name: 'Auto Aging', icon: Timer, path: '/auto-aging' },
  { name: 'Sales', icon: TrendingUp, path: '/sales' },
  { name: 'Inventory', icon: Package, path: '/inventory/stock' },
  { name: 'Purchasing', icon: Truck, path: '/purchasing/invoices' },
  { name: 'Accounts', icon: Landmark, path: '/accounts/chart' },
  { name: 'Reports', icon: BarChart3, path: '/reports' },
  { name: 'HRMS', icon: Briefcase, path: `${HRMS_PATHS.root}/`, external: true },
  { name: 'Admin', icon: Shield, path: '/admin/settings' },
];

const navItems: MainNavItem[] = [
  { label: 'My Dashboard', path: '/', icon: LayoutDashboard, section: 'Platform', end: true },
  { label: 'Module Directory', path: '/modules', icon: Grid3X3, section: 'Platform' },
  { label: 'Notifications', path: '/notifications', icon: Bell, section: 'Platform' },
  { label: 'Internal Requests', path: '/portal/tickets/new', icon: HeadphonesIcon, section: 'Platform' },

  { label: 'Auto Aging Overview', path: '/auto-aging', icon: Timer, section: 'Auto Aging', group: 'Overview', end: true },
  { label: 'Vehicle Explorer', path: '/auto-aging/vehicles', icon: Car, section: 'Auto Aging', group: 'Overview' },
  { label: 'Import Center', path: '/auto-aging/import', icon: Upload, section: 'Auto Aging', group: 'Data Import', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Review Queue', path: '/auto-aging/review', icon: Search, section: 'Auto Aging', group: 'Data Import', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Import History', path: '/auto-aging/history', icon: History, section: 'Auto Aging', group: 'Data Import' },
  { label: 'Data Quality', path: '/auto-aging/quality', icon: AlertTriangle, section: 'Auto Aging', group: 'Configuration' },
  { label: 'SLA Policies', path: '/auto-aging/sla', icon: Gauge, section: 'Auto Aging', group: 'Configuration', roles: ['super_admin', 'company_admin', 'director', 'general_manager'] },
  { label: 'Mappings', path: '/auto-aging/mappings', icon: MapIcon, section: 'Auto Aging', group: 'Configuration', roles: ['super_admin', 'company_admin', 'director', 'general_manager'] },
  { label: 'Commissions', path: '/auto-aging/commissions', icon: DollarSign, section: 'Auto Aging', group: 'Insights', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Aging Reports', path: '/auto-aging/reports', icon: FileSpreadsheet, section: 'Auto Aging', group: 'Insights' },

  { label: 'Sales Overview', path: '/sales', icon: TrendingUp, section: 'Sales', group: 'Overview', end: true },
  { label: 'Deal Pipeline', path: '/sales/pipeline', icon: KanbanSquare, section: 'Sales', group: 'Overview', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Performance', path: '/sales/performance', icon: Target, section: 'Sales', group: 'Analytics', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Margin Analysis', path: '/sales/margin', icon: TrendingDown, section: 'Sales', group: 'Analytics', roles: ['super_admin', 'company_admin', 'director', 'general_manager'] },
  { label: 'Sales Orders', path: '/sales/orders', icon: ShoppingCart, section: 'Sales', group: 'Transactions' },
  { label: 'Invoices', path: '/sales/invoices', icon: Receipt, section: 'Sales', group: 'Transactions', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Dealer Invoices', path: '/sales/dealer-invoices', icon: FileText, section: 'Sales', group: 'Operations', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Official Receipts', path: '/sales/verify-or', icon: Receipt, section: 'Sales', group: 'Operations', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Sales Advisors', path: '/sales/advisors', icon: UserCheck, section: 'Sales', group: 'Team', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },

  { label: 'Stock Balance', path: '/inventory/stock', icon: Package, section: 'Inventory', group: 'Overview' },
  { label: 'Advanced Search', path: '/inventory/chassis-filter', icon: KanbanSquare, section: 'Inventory', group: 'Overview' },
  { label: 'Vehicle Transfer', path: '/inventory/transfers', icon: ArrowLeftRight, section: 'Inventory', group: 'Movement', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },

  { label: 'Purchase Invoices', path: '/purchasing/invoices', icon: Truck, section: 'Purchasing', group: 'Operations', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },

  { label: 'Chart of Accounts', path: '/accounts/chart', icon: BookOpen, section: 'Accounts', group: 'Ledger', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'] },
  { label: 'Accounting Periods', path: '/accounts/periods', icon: Calendar, section: 'Accounts', group: 'Ledger', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'] },
  { label: 'Trial Balance', path: '/accounts/trial-balance', icon: Scale, section: 'Accounts', group: 'Reports', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'] },
  { label: 'Journal Entries', path: '/accounts/journal', icon: FileText, section: 'Accounts', group: 'Reports', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'] },

  { label: 'Business Reports', path: '/reports', icon: BarChart3, section: 'Reports', group: 'Workspace', end: true },
  { label: 'Open HRMS Workspace', path: `${HRMS_PATHS.root}/`, href: getDedicatedHrmsWorkspacePath(HRMS_PATHS.root), icon: Briefcase, section: 'HRMS', group: 'Workspace', external: true },

  { label: 'Activity Overview', path: '/admin/activity', icon: BarChart3, section: 'Admin', group: 'Governance', roles: ['super_admin', 'company_admin', 'director', 'general_manager'] },
  { label: 'Audit Log', path: '/admin/audit', icon: FileText, section: 'Admin', group: 'Governance', roles: ['super_admin', 'company_admin', 'director'] },
  { label: 'Users & Roles', path: '/admin/users', icon: Shield, section: 'Admin', group: 'Access', roles: ['super_admin', 'company_admin'] },
  { label: 'User Groups', path: '/admin/user-groups', icon: Shield, section: 'Admin', group: 'Access', roles: ['super_admin', 'company_admin'] },
  { label: 'Role Permissions', path: '/admin/role-permissions', icon: Shield, section: 'Admin', group: 'Access', roles: ['super_admin', 'company_admin'] },
  { label: 'Branch Management', path: '/admin/branches', icon: GitBranch, section: 'Admin', group: 'Master Data', roles: ['super_admin', 'company_admin'] },
  { label: 'Master Data', path: '/admin/master-data', icon: Database, section: 'Admin', group: 'Master Data', roles: ['super_admin', 'company_admin'] },
  { label: 'Suppliers', path: '/admin/suppliers', icon: Truck, section: 'Admin', group: 'Master Data', roles: ['super_admin', 'company_admin'] },
  { label: 'Dealers', path: '/admin/dealers', icon: Users, section: 'Admin', group: 'Master Data', roles: ['super_admin', 'company_admin'] },
  { label: 'Settings', path: '/admin/settings', icon: Settings, section: 'Admin', group: 'Configuration' },
];

const PATH_TO_SECTION: Record<string, string> = {
  '/auto-aging': 'Auto Aging',
  '/sales': 'Sales',
  '/inventory': 'Inventory',
  '/purchasing': 'Purchasing',
  '/accounts': 'Accounts',
  '/reports': 'Reports',
  '/hrms': 'HRMS',
  '/admin': 'Admin',
};

const MAIN_ROUTE_CHROME: AppShellRouteChromeMatch[] = [
  { pattern: /^\/$/, title: 'Executive Dashboard', kicker: 'Company-wide KPI cockpit' },
  { pattern: /^\/modules/, title: 'Module Directory', kicker: 'Active workspaces' },
  { pattern: /^\/notifications/, title: 'Notifications', kicker: 'Operational alerts' },
  { pattern: /^\/auto-aging\/vehicles/, title: 'Vehicle Explorer', kicker: 'Aging drilldown' },
  { pattern: /^\/auto-aging\/reports/, title: 'Auto Aging Reports', kicker: 'Report builder' },
  { pattern: /^\/auto-aging/, title: 'Auto Aging', kicker: 'Inventory aging operations' },
  { pattern: /^\/sales\/pipeline/, title: 'Deal Pipeline', kicker: 'Sales execution' },
  { pattern: /^\/sales\/orders/, title: 'Sales Orders', kicker: 'Order management' },
  { pattern: /^\/sales\/customers/, title: 'Customers', kicker: 'Customer records' },
  { pattern: /^\/sales/, title: 'Sales', kicker: 'Revenue workspace' },
  { pattern: /^\/inventory/, title: 'Inventory', kicker: 'Stock and movement' },
  { pattern: /^\/purchasing/, title: 'Purchasing', kicker: 'Vendor operations' },
  { pattern: /^\/accounts/, title: 'Accounts', kicker: 'Financial reporting' },
  { pattern: /^\/reports/, title: 'Business Reports', kicker: 'Cross-module reporting' },
  { pattern: /^\/admin/, title: 'Administration', kicker: 'Controls and governance' },
  { pattern: /^\/hrms/, title: 'HRMS', kicker: 'Workforce workspace' },
];

function getFocusedSection(pathname: string): string | null {
  for (const [prefix, section] of Object.entries(PATH_TO_SECTION)) {
    if (pathname.startsWith(prefix)) return section;
  }
  return null;
}

function resolveNavigationHref(path: string): string {
  return isHrmsWorkspacePath(path) ? getDedicatedHrmsWorkspacePath(path) : path;
}

export function useMainAppShellConfig() {
  const { user, logout, hasRole } = useAuth();
  const { branding } = useBranding();
  const { isFocused } = useFocusedMode();
  const { isModuleActive } = useModuleAccess();
  const { pathname } = useLocation();
  const rolePermissions = useRoleSectionMatrix();
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id ?? ''],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await getNotifications(user.id);
      return data;
    },
    enabled: Boolean(user?.id),
    staleTime: STALE.notifications,
  });
  const allowedSections: string[] = user?.role
    ? (rolePermissions[user.role] ?? sectionDefs.map((section) => section.name))
    : sectionDefs.map((section) => section.name);
  const focusedSection = isFocused ? getFocusedSection(pathname) : null;

  const sectionIsVisible = (section: MainSectionDef) => {
    const moduleId = getModuleIdForSection(section.name);
    return !moduleId || isModuleActive(moduleId);
  };

  const itemIsVisible = (item: MainNavItem) => {
    const moduleId = getModuleIdForPath(item.path);
    if (moduleId && !isModuleActive(moduleId)) return false;
    if (!item.roles) return true;
    return hasRole(item.roles);
  };

  const visibleSections = focusedSection
    ? sectionDefs.filter((section) => section.name === focusedSection && sectionIsVisible(section))
    : sectionDefs.filter((section) => allowedSections.includes(section.name) && sectionIsVisible(section));

  const sections = visibleSections
    .map((section): AppShellNavSection => {
      const items = navItems
        .filter((item) => item.section === section.name)
        .filter(itemIsVisible)
        .map((item) => ({
          ...item,
          href: item.external ? resolveNavigationHref(item.path) : item.href,
        }));

      return {
        name: section.name,
        icon: section.icon,
        path: section.path,
        href: section.external && section.path ? resolveNavigationHref(section.path) : undefined,
        external: section.external,
        items,
        showItems: !section.path || (isFocused && focusedSection === section.name),
        showGroupLabels: true,
      };
    })
    .filter((section) => section.items.length > 0);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return {
    brand: {
      title: branding.appShortName || branding.appName,
      subtitle: 'Operations intelligence',
      logoSrc: branding.logoUrl ?? undefined,
      logoAlt: branding.companyName,
    },
    sections,
    routeChrome: MAIN_ROUTE_CHROME,
    fallbackChrome: MAIN_ROUTE_CHROME[0],
    user: user ? { name: user.name, email: user.email, role: user.role, profilePath: '/profile' } : undefined,
    onSignOut: () => void logout(),
    topbarActions: [{ label: 'Open notifications', icon: Bell, to: '/notifications', badge: unreadCount || undefined }],
    focusedBackLink: isFocused && focusedSection ? { label: 'All modules', to: '/modules', icon: ArrowLeft } : null,
    searchPlaceholder: 'Search workspace...',
    widthMode: 'full' as const,
  };
}
