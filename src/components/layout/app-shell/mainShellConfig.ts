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
  CheckSquare,
  Database,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Gauge,
  GitBranch,
  HeadphonesIcon,
  History,
  Inbox as InboxIcon,
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
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Truck,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/contexts/ModuleAccessContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useFocusedMode } from '@/hooks/useFocusedMode';
import { useRoleSectionMatrix } from '@/hooks/usePermissions';
import { getDedicatedHrmsWorkspacePath, isHrmsWorkspacePath } from '@/lib/hrmsWorkspace';
import { getModuleIdForPath, getModuleIdForSection } from '@/lib/moduleAccess';
import { STALE } from '@/lib/queryClient';
import { getNotifications } from '@/services/notificationService';
import { globalSearch, type GlobalSearchHit } from '@/services/globalSearchService';
import {
  MAIN_NAV_ROUTES,
  MAIN_ROUTE_CHROME as PLATFORM_MAIN_ROUTE_CHROME,
  PLATFORM_SECTIONS,
  getFocusedPlatformSection,
  type AppShellCommandItem,
  type AppShellNavItem,
  type AppShellNavSection,
  type AppShellRouteChromeMatch,
  type PlatformIconKey,
} from '@flc/shell';
import type { AppRole } from '@/types';

interface MainNavItem extends AppShellNavItem {
  section: string;
  roles?: readonly AppRole[];
}

interface MainSectionDef {
  name: string;
  icon: AppShellNavSection['icon'];
  path?: string;
  external?: boolean;
}

const ICONS: Record<PlatformIconKey, typeof Car> = {
  'alert-triangle': AlertTriangle,
  'arrow-left-right': ArrowLeftRight,
  'bar-chart': BarChart3,
  bell: Bell,
  'book-open': BookOpen,
  briefcase: Briefcase,
  calendar: Calendar,
  car: Car,
  'check-square': CheckSquare,
  database: Database,
  'dollar-sign': DollarSign,
  'file-spreadsheet': FileSpreadsheet,
  'file-text': FileText,
  gauge: Gauge,
  'git-branch': GitBranch,
  headphones: HeadphonesIcon,
  history: History,
  inbox: InboxIcon,
  kanban: KanbanSquare,
  landmark: Landmark,
  'layout-dashboard': LayoutDashboard,
  map: MapIcon,
  package: Package,
  receipt: Receipt,
  scale: Scale,
  search: Search,
  settings: Settings,
  shield: Shield,
  'shopping-cart': ShoppingCart,
  sparkles: Sparkles,
  target: Target,
  timer: Timer,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  truck: Truck,
  upload: Upload,
  'user-check': UserCheck,
  users: Users,
};

const sectionDefs: MainSectionDef[] = PLATFORM_SECTIONS
  .filter((section) => section.name !== 'Internal Requests')
  .map((section) => ({
    name: section.name,
    icon: ICONS[section.icon],
    path: section.path,
    external: section.external,
  }));

const navItems: MainNavItem[] = MAIN_NAV_ROUTES.map((route) => ({
  label: route.label,
  path: route.path,
  icon: ICONS[route.icon],
  section: route.section,
  group: route.group,
  external: route.external,
  roles: route.roles,
  end: route.end,
}));

const MAIN_ROUTE_CHROME: AppShellRouteChromeMatch[] = PLATFORM_MAIN_ROUTE_CHROME.map((chrome) => ({ ...chrome }));

function resolveNavigationHref(path: string): string {
  return isHrmsWorkspacePath(path) ? getDedicatedHrmsWorkspacePath(path) : path;
}

const HIT_TYPE_META: Record<GlobalSearchHit['entityType'], { section: string; icon: typeof Car }> = {
  vehicle:     { section: 'Vehicles',     icon: Car },
  customer:    { section: 'Customers',    icon: Users },
  sales_order: { section: 'Sales Orders', icon: ShoppingCart },
  profile:     { section: 'Users',        icon: Shield },
};

function toCommandItem(hit: GlobalSearchHit): AppShellCommandItem {
  const meta = HIT_TYPE_META[hit.entityType];
  return {
    id: `${hit.entityType}:${hit.entityId}`,
    label: hit.label,
    description: hit.description ?? meta.section,
    section: meta.section,
    icon: meta.icon,
    to: hit.href,
  };
}

function routeCommandItems(sections: AppShellNavSection[]): AppShellCommandItem[] {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      id: `route:${item.path}`,
      label: item.label,
      description: section.name,
      section: 'Navigation',
      icon: item.icon,
      to: item.external ? undefined : item.path,
      href: item.external ? item.href ?? resolveNavigationHref(item.path) : item.href,
      external: item.external,
    })),
  );
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
      const result = await getNotifications(user!.id);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!user?.id,
    staleTime: STALE.notifications,
  });
  const allowedSections: string[] = user?.role
    ? (rolePermissions[user.role] ?? sectionDefs.map((section) => section.name))
    : sectionDefs.map((section) => section.name);
  const focusedSection = isFocused ? getFocusedPlatformSection(pathname) : null;

  const sectionIsVisible = (section: MainSectionDef) => {
    const moduleId = getModuleIdForSection(section.name);
    return !moduleId || isModuleActive(moduleId);
  };

  const itemIsVisible = (item: MainNavItem) => {
    const moduleId = getModuleIdForPath(item.path);
    if (moduleId && !isModuleActive(moduleId)) return false;
    if (!item.roles) return true;
    return hasRole([...item.roles]);
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
  const commandItems = useMemo(() => routeCommandItems(sections), [sections]);
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const onCommandSearch = useCallback(async (query: string): Promise<AppShellCommandItem[]> => {
    const hits = await globalSearch(query, 6);
    return hits.map(toCommandItem);
  }, []);

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
    searchPlaceholder: 'Search workspace...',
    commandItems,
    onCommandSearch,
    topbarActions: [{ label: 'Open notifications', icon: Bell, to: '/notifications', badge: unreadCount || undefined }],
    focusedBackLink: isFocused && focusedSection ? { label: 'Home', to: '/home', icon: ArrowLeft } : null,
    widthMode: 'full' as const,
  };
}
