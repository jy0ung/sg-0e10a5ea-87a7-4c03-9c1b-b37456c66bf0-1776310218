import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Timer, LayoutDashboard, Bell, Settings, Shield, FileText,
  LogOut, ChevronLeft, ChevronRight, ChevronDown, Upload, Car, AlertTriangle, Gauge,
  Map, History, Grid3X3, BarChart3, DollarSign, FileSpreadsheet,
  ShoppingCart, Users, KanbanSquare, Receipt, Target, TrendingUp,
  Package, ArrowLeftRight, Truck, UserCheck, GitBranch, Database,
  TrendingDown, Landmark, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  section: string;
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
  { name: 'Admin', icon: Shield },
];

const navItems: NavItem[] = [
  { label: 'Executive Dashboard', path: '/', icon: LayoutDashboard, section: 'Platform' },
  { label: 'Module Directory', path: '/modules', icon: Grid3X3, section: 'Platform' },
  { label: 'Notifications', path: '/notifications', icon: Bell, section: 'Platform' },

  { label: 'Aging Dashboard', path: '/auto-aging', icon: Timer, section: 'Auto Aging' },
  { label: 'Vehicle Explorer', path: '/auto-aging/vehicles', icon: Car, section: 'Auto Aging' },
  { label: 'Import Center', path: '/auto-aging/import', icon: Upload, section: 'Auto Aging' },
  { label: 'Data Quality', path: '/auto-aging/quality', icon: AlertTriangle, section: 'Auto Aging' },
  { label: 'SLA Policies', path: '/auto-aging/sla', icon: Gauge, section: 'Auto Aging' },
  { label: 'Mappings', path: '/auto-aging/mappings', icon: Map, section: 'Auto Aging' },
  { label: 'Import History', path: '/auto-aging/history', icon: History, section: 'Auto Aging' },
  { label: 'Commissions', path: '/auto-aging/commissions', icon: DollarSign, section: 'Auto Aging' },
  { label: 'Reports', path: '/auto-aging/reports', icon: FileSpreadsheet, section: 'Auto Aging' },

  { label: 'Sales Dashboard', path: '/sales', icon: TrendingUp, section: 'Sales' },
  { label: 'Deal Pipeline', path: '/sales/pipeline', icon: KanbanSquare, section: 'Sales' },
  { label: 'Sales Orders', path: '/sales/orders', icon: ShoppingCart, section: 'Sales' },
  { label: 'Customers', path: '/sales/customers', icon: Users, section: 'Sales' },
  { label: 'Invoices', path: '/sales/invoices', icon: Receipt, section: 'Sales' },
  { label: 'Sales Advisors', path: '/sales/advisors', icon: UserCheck, section: 'Sales' },
  { label: 'Performance', path: '/sales/performance', icon: Target, section: 'Sales' },
  { label: 'Margin Analysis', path: '/sales/margin', icon: TrendingDown, section: 'Sales' },
  { label: 'Outstanding Collection', path: '/sales/outstanding', icon: Landmark, section: 'Sales' },
  { label: 'Dealer Invoices', path: '/sales/dealer-invoices', icon: FileText, section: 'Sales' },
  { label: 'Verify OR', path: '/sales/verify-or', icon: Receipt, section: 'Sales' },

  { label: 'Stock Balance', path: '/inventory/stock', icon: Package, section: 'Inventory' },
  { label: 'Vehicle Transfer', path: '/inventory/transfers', icon: ArrowLeftRight, section: 'Inventory' },
  { label: 'Chassis Movement', path: '/inventory/chassis', icon: Search, section: 'Inventory' },
  { label: 'Chassis Filter', path: '/inventory/chassis-filter', icon: KanbanSquare, section: 'Inventory' },

  { label: 'Purchase Invoices', path: '/purchasing/invoices', icon: Truck, section: 'Purchasing' },

  { label: 'Reports Centre', path: '/reports', icon: BarChart3, section: 'Reports' },

  { label: 'Activity Dashboard', path: '/admin/activity', icon: BarChart3, section: 'Admin', roles: ['super_admin', 'company_admin'] },
  { label: 'Users & Roles', path: '/admin/users', icon: Shield, section: 'Admin', roles: ['super_admin', 'company_admin'] },
  { label: 'Audit Log', path: '/admin/audit', icon: FileText, section: 'Admin', roles: ['super_admin', 'company_admin', 'director'] },
  { label: 'Branch Management', path: '/admin/branches', icon: GitBranch, section: 'Admin', roles: ['super_admin', 'company_admin'] },
  { label: 'Master Data', path: '/admin/master-data', icon: Database, section: 'Admin', roles: ['super_admin', 'company_admin'] },
  { label: 'Suppliers', path: '/admin/suppliers', icon: Truck, section: 'Admin', roles: ['super_admin', 'company_admin'] },
  { label: 'Dealers', path: '/admin/dealers', icon: Users, section: 'Admin', roles: ['super_admin', 'company_admin'] },
  { label: 'User Groups', path: '/admin/user-groups', icon: Shield, section: 'Admin', roles: ['super_admin', 'company_admin'] },
  { label: 'Settings', path: '/admin/settings', icon: Settings, section: 'Admin' },
];

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
}

const NavItemLink = React.memo(function NavItemLink({ item, collapsed, pathname }: NavItemLinkProps) {
  const active = isItemActive(item.path, pathname);
  const link = (
    <Link
      to={item.path}
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
}

export function AppSidebar({ collapsed, setCollapsed }: AppSidebarProps) {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const activeItem = navItems.find(item => isItemActive(item.path, pathname));
    return Object.fromEntries(sectionDefs.map(s => [s.name, s.name === activeItem?.section]));
  });

  const toggleSection = (name: string) => {
    setOpenSections(prev => ({ ...prev, [name]: !prev[name] }));
  };

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
          {sectionDefs.map(({ name, icon: SectionIcon }, index) => {
            const items = navItems.filter(n => n.section === name);
            const visibleItems = items.filter(item => {
              if (!item.roles) return true;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return hasRole(item.roles as any);
            });
            if (visibleItems.length === 0) return null;

            const isOpen = openSections[name] ?? false;
            const hasActive = visibleItems.some(item => isItemActive(item.path, pathname));
            const showItems = collapsed || isOpen;

            return (
              <div key={name}>
                {/* Section header */}
                {collapsed ? (
                  index > 0 && <div className="h-px bg-sidebar-border/50 my-2 mx-1" />
                ) : (
                  <button
                    onClick={() => toggleSection(name)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-widest mb-0.5 transition-colors",
                      hasActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    <SectionIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="flex-1 text-left">{name}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>
                )}

                {/* Section items — CSS grid trick for smooth height animation */}
                <div
                  className={cn(
                    "grid transition-all duration-200 ease-in-out",
                    showItems ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden min-h-0 space-y-0.5">
                    {visibleItems.map(item => (
                      <NavItemLink key={item.path} item={item} collapsed={collapsed} pathname={pathname} />
                    ))}
                  </div>
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
