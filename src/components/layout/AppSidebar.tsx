import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Timer, LayoutDashboard, Bell, Settings, Shield, FileText,
  LogOut, ChevronLeft, ChevronRight, Upload, Car, AlertTriangle, Gauge, ArrowLeft,
  Map as MapIcon, History, Grid3X3, BarChart3, DollarSign, FileSpreadsheet,
  ShoppingCart, Users, KanbanSquare, Receipt, Target, TrendingUp,
  Package, ArrowLeftRight, Truck, UserCheck, GitBranch, Database,
  TrendingDown, Landmark, Search, HeadphonesIcon, Briefcase,
  Calendar, Clock, CreditCard, Star, Megaphone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { loadRolePermissions } from '@/config/rolePermissions';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  section: string;
  group?: string;
  roles?: string[];
}

interface SectionDef {
  name: string;
  icon: React.ElementType;
}

const sectionDefs: SectionDef[] = [
  { name: 'Platform', icon: LayoutDashboard },
  { name: 'Auto Aging', icon: Timer },
  { name: 'Sales', icon: TrendingUp },
  { name: 'Inventory', icon: Package },
  { name: 'Purchasing', icon: Truck },
  { name: 'Reports', icon: BarChart3 },
  { name: 'HRMS', icon: Briefcase },
  { name: 'Admin', icon: Shield },
];

const navItems: NavItem[] = [
  { label: 'Company Overview', path: '/', icon: LayoutDashboard, section: 'Platform' },
  { label: 'Module Directory', path: '/modules', icon: Grid3X3, section: 'Platform' },
  { label: 'Notifications', path: '/notifications', icon: Bell, section: 'Platform' },
  { label: 'Customer Service', path: '/portal/tickets/new', icon: HeadphonesIcon, section: 'Platform' },

  { label: 'Auto Aging Overview', path: '/auto-aging', icon: Timer, section: 'Auto Aging', group: 'Overview' },
  { label: 'Vehicle Explorer', path: '/auto-aging/vehicles', icon: Car, section: 'Auto Aging', group: 'Overview' },
  { label: 'Import Center', path: '/auto-aging/import', icon: Upload, section: 'Auto Aging', group: 'Data Pipeline', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager', 'creator_updater'] },
  { label: 'Import History', path: '/auto-aging/history', icon: History, section: 'Auto Aging', group: 'Data Pipeline' },
  { label: 'Data Quality', path: '/auto-aging/quality', icon: AlertTriangle, section: 'Auto Aging', group: 'Controls' },
  { label: 'SLA Policies', path: '/auto-aging/sla', icon: Gauge, section: 'Auto Aging', group: 'Controls', roles: ['super_admin', 'company_admin', 'director', 'general_manager'] },
  { label: 'Mappings', path: '/auto-aging/mappings', icon: MapIcon, section: 'Auto Aging', group: 'Controls', roles: ['super_admin', 'company_admin', 'director', 'general_manager'] },
  { label: 'Commissions', path: '/auto-aging/commissions', icon: DollarSign, section: 'Auto Aging', group: 'Insights', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Aging Reports', path: '/auto-aging/reports', icon: FileSpreadsheet, section: 'Auto Aging', group: 'Insights' },

  { label: 'Sales Overview', path: '/sales', icon: TrendingUp, section: 'Sales', group: 'Overview' },
  { label: 'Deal Pipeline', path: '/sales/pipeline', icon: KanbanSquare, section: 'Sales', group: 'Overview' },
  { label: 'Performance', path: '/sales/performance', icon: Target, section: 'Sales', group: 'Analytics' },
  { label: 'Margin Analysis', path: '/sales/margin', icon: TrendingDown, section: 'Sales', group: 'Analytics' },
  { label: 'Sales Orders', path: '/sales/orders', icon: ShoppingCart, section: 'Sales', group: 'Transactions' },
  { label: 'Invoices', path: '/sales/invoices', icon: Receipt, section: 'Sales', group: 'Transactions' },
  { label: 'Customers', path: '/sales/customers', icon: Users, section: 'Sales', group: 'Transactions' },
  { label: 'Dealer Invoices', path: '/sales/dealer-invoices', icon: FileText, section: 'Sales', group: 'Operations' },
  { label: 'Verify OR', path: '/sales/verify-or', icon: Receipt, section: 'Sales', group: 'Operations' },
  { label: 'Outstanding Collection', path: '/sales/outstanding', icon: Landmark, section: 'Sales', group: 'Operations' },
  { label: 'Sales Advisors', path: '/sales/advisors', icon: UserCheck, section: 'Sales', group: 'Team' },

  { label: 'Stock Balance', path: '/inventory/stock', icon: Package, section: 'Inventory', group: 'Overview' },
  { label: 'Chassis Filter', path: '/inventory/chassis-filter', icon: KanbanSquare, section: 'Inventory', group: 'Overview' },
  { label: 'Vehicle Transfer', path: '/inventory/transfers', icon: ArrowLeftRight, section: 'Inventory', group: 'Movement' },
  { label: 'Chassis Movement', path: '/inventory/chassis', icon: Search, section: 'Inventory', group: 'Movement' },

  { label: 'Purchase Invoices', path: '/purchasing/invoices', icon: Truck, section: 'Purchasing', group: 'Operations' },

  { label: 'Business Reports', path: '/reports', icon: BarChart3, section: 'Reports', group: 'Workspace' },

  { label: 'Employee Directory', path: '/hrms/employees', icon: Users, section: 'HRMS', group: 'Staff', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Leave Management', path: '/hrms/leave', icon: Calendar, section: 'HRMS', group: 'Leave' },
  { label: 'Leave Calendar', path: '/hrms/leave-calendar', icon: Calendar, section: 'HRMS', group: 'Leave' },
  { label: 'Attendance Log', path: '/hrms/attendance', icon: Clock, section: 'HRMS', group: 'Attendance', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Payroll Summary', path: '/hrms/payroll', icon: CreditCard, section: 'HRMS', group: 'Payroll', roles: ['super_admin', 'company_admin', 'general_manager'] },
  { label: 'Performance Appraisals', path: '/hrms/appraisals', icon: Star, section: 'HRMS', group: 'Performance', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { label: 'Announcements', path: '/hrms/announcements', icon: Megaphone, section: 'HRMS', group: 'Communications', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },

  { label: 'Activity Overview', path: '/admin/activity', icon: BarChart3, section: 'Admin', group: 'Governance', roles: ['super_admin', 'company_admin'] },
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

/** Maps a URL path prefix to the sidebar section name it belongs to. */
const PATH_TO_SECTION: Record<string, string> = {
  '/auto-aging': 'Auto Aging',
  '/sales': 'Sales',
  '/inventory': 'Inventory',
  '/purchasing': 'Purchasing',
  '/reports': 'Reports',
  '/hrms': 'HRMS',
  '/admin': 'Admin',
};

function getFocusedSection(pathname: string): string | null {
  for (const [prefix, section] of Object.entries(PATH_TO_SECTION)) {
    if (pathname.startsWith(prefix)) return section;
  }
  return null;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function isItemActive(path: string, pathname: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname.startsWith(path);
}

interface NavItemLinkProps {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}

function groupItems(items: NavItem[]): Array<{ group: string; items: NavItem[] }> {
  const groups = new Map<string, NavItem[]>();

  items.forEach((item) => {
    const group = item.group ?? 'Pages';
    const existing = groups.get(group) ?? [];
    existing.push(item);
    groups.set(group, existing);
  });

  return Array.from(groups.entries()).map(([group, groupedItems]) => ({
    group,
    items: groupedItems,
  }));
}

const NavItemLink = React.memo(function NavItemLink({ item, collapsed, pathname, onNavigate }: NavItemLinkProps) {
  const active = isItemActive(item.path, pathname);
  const link = (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150",
        collapsed && "justify-center px-2 py-2.5",
        active
          ? "nav-item-active"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
    </Tooltip>
  );
});

interface AppSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  isFocused?: boolean;
  onNavigate?: () => void;
}

export function AppSidebar({ collapsed, setCollapsed, isFocused, onNavigate }: AppSidebarProps) {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  // Role-based section filtering from permission matrix (persisted to localStorage)
  const rolePermissions = loadRolePermissions();
  const allowedSections: string[] = user?.role
    ? (rolePermissions[user.role] ?? sectionDefs.map(s => s.name))
    : sectionDefs.map(s => s.name);

  // In focused mode, only render the section that matches the current URL.
  const focusedSection = isFocused ? getFocusedSection(pathname) : null;
  const visibleSections = focusedSection
    ? sectionDefs.filter(s => s.name === focusedSection)
    : sectionDefs.filter(s => allowedSections.includes(s.name));

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "h-screen flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 flex-shrink-0 sticky top-0",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "h-14 flex items-center border-b border-sidebar-border flex-shrink-0 gap-3",
          collapsed ? "px-4 justify-center" : "px-4"
        )}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-bold text-sm">F</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-foreground font-bold text-sm leading-tight tracking-tight">FLC BI</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Business Intelligence</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {/* Focused mode: back link to Module Directory */}
          {isFocused && focusedSection && (
            collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/modules"
                    className="w-full flex justify-center py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors mb-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">All modules</TooltipContent>
              </Tooltip>
            ) : (
              <Link
                to="/modules"
                className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5 flex-shrink-0" />
                <span>All modules</span>
              </Link>
            )
          )}

          {visibleSections.map(({ name, icon: SectionIcon }, index) => {
            const items = navItems.filter(n => n.section === name);
            const visibleItems = items.filter(item => {
              if (!item.roles) return true;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return hasRole(item.roles as any);
            });
            if (visibleItems.length === 0) return null;

            const hasActive = visibleItems.some(item => isItemActive(item.path, pathname));
            const grouped = groupItems(visibleItems);
            const showGroupLabels = !collapsed && grouped.length > 1;

            return (
              <div key={name}>
                {/* Section header — flat, non-collapsible */}
                {collapsed ? (
                  index > 0 && <div className="h-px bg-sidebar-border/50 my-2 mx-1" />
                ) : (
                  <div
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-widest mb-0.5",
                      hasActive ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <SectionIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{name}</span>
                  </div>
                )}

                {/* Section items — always visible */}
                <div className="space-y-0.5">
                  {showGroupLabels ? (
                    grouped.map((g, gi) => (
                      <div key={g.group} className={cn("space-y-0.5", gi > 0 && "mt-2")}>
                        <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {g.group}
                        </p>
                        {g.items.map(item => (
                          <NavItemLink key={item.path} item={item} collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
                        ))}
                      </div>
                    ))
                  ) : (
                    visibleItems.map(item => (
                      <NavItemLink key={item.path} item={item} collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border flex-shrink-0">
          {/* User profile row */}
          <div className={cn("flex items-center gap-2 px-3 py-3", collapsed && "justify-center px-2")}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/profile"
                    className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center hover:bg-primary/30 transition-colors flex-shrink-0"
                  >
                    <span className="text-primary text-xs font-bold">{getInitials(user?.name)}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace(/_/g, ' ')}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                <Link to="/profile" className="flex items-center gap-2.5 min-w-0 flex-1 group">
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/30 transition-colors">
                    <span className="text-primary text-xs font-bold">{getInitials(user?.name)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-sidebar-accent-foreground truncate leading-tight">{user?.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize truncate">{user?.role?.replace(/_/g, ' ')}</p>
                  </div>
                </Link>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={logout}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Sign out</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>

          {/* Logout in collapsed mode */}
          {collapsed && (
            <div className="px-2 pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={logout}
                    className="w-full flex justify-center py-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Collapse toggle */}
          <div className="border-t border-sidebar-border/50 p-2">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "w-full flex items-center gap-2 py-1.5 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors text-xs",
                collapsed ? "justify-center" : ""
              )}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" />
                  <span>Collapse sidebar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
