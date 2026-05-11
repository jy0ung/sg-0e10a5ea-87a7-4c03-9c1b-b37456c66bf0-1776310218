import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Bell,
  LogOut,
  Menu,
  Search,
} from 'lucide-react';
import type { AppRole } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { brandAssets } from '@/config/brand';
import { hrmsNavItems, type HrmsNavItem } from './navItems';

const ROUTE_CHROME: Array<[RegExp, string, string]> = [
  [/^\/leave\/calendar/, 'Leave Calendar', 'Team leave visibility'],
  [/^\/leave$/, 'Leave Management', 'Requests, balances, and approvals'],
  [/^\/attendance/, 'Attendance Log', 'Daily workforce records'],
  [/^\/approvals/, 'Approval Inbox', 'Assigned HRMS decisions'],
  [/^\/appraisals/, 'Performance Appraisals', 'Review cycles and outcomes'],
  [/^\/announcements/, 'Announcements', 'Company communications'],
  [/^\/employees/, 'Employee Directory', 'Workforce records'],
  [/^\/payroll/, 'Payroll Workspace', 'Runs, approvals, and payout status'],
  [/^\/settings/, 'HRMS Settings', 'Departments, roles, leave, and holidays'],
  [/^\/approval-flows/, 'Approval Flows', 'Workflow governance'],
  [/^\/profile/, 'Profile', 'HRMS identity and access'],
];

function getRouteChrome(pathname: string) {
  return ROUTE_CHROME.find(([pattern]) => pattern.test(pathname)) ?? ['/', 'HRMS Workspace', 'People operations'] as [string, string, string];
}

function isActive(path: string, pathname: string): boolean {
  if (path === '/leave') return pathname === '/leave';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function grouped(items: HrmsNavItem[]) {
  const groups = new Map<string, HrmsNavItem[]>();
  items.forEach((item) => groups.set(item.group, [...(groups.get(item.group) ?? []), item]));
  return Array.from(groups.entries());
}

function HrmsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { hasRole, logout, user } = useAuth();
  const { pathname } = useLocation();
  const visibleItems = useMemo(
    () => hrmsNavItems.filter((item) => !item.roles || hasRole(item.roles as AppRole[])),
    [hasRole],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="flex h-full w-[17rem] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border px-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/20 bg-white shadow-sm">
            <img src={brandAssets.compactLogo} alt="Fook Loi" className="h-7 w-7 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-sidebar-accent-foreground">FLC HRMS</p>
            <p className="truncate text-[10px] leading-tight text-sidebar-foreground/65">People operations</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {grouped(visibleItems).map(([group, items]) => (
            <div key={group} className="mb-4">
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">{group}</p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.path, pathname);
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.path}
                          onClick={onNavigate}
                          className={cn(
                            'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                            active
                              ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground shadow-sm'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 rounded-md border border-sidebar-border bg-sidebar-accent/60 px-3 py-2">
            <p className="truncate text-xs font-medium text-sidebar-accent-foreground">{user?.name ?? 'HRMS User'}</p>
            <p className="truncate text-[11px] capitalize text-sidebar-foreground/65">{user?.role?.replace(/_/g, ' ') ?? ''}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

export default function HrmsLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const location = useLocation();
  const [, pageTitle, pageKicker] = getRouteChrome(location.pathname);

  const sidebar = <HrmsSidebar onNavigate={isMobile ? () => setMobileOpen(false) : undefined} />;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {!isMobile && sidebar}

      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[17rem] p-0">
            <SheetTitle className="sr-only">HRMS navigation</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}

      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight text-foreground">{pageTitle}</div>
              <div className="hidden truncate text-[11px] leading-tight text-muted-foreground sm:block">{pageKicker}</div>
            </div>
          </div>
          <div className="hidden min-w-[220px] max-w-md flex-1 lg:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 border-border/80 bg-background pl-8 text-xs" placeholder="Search HRMS..." aria-label="Search HRMS" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link to="/announcements" className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" aria-label="Open announcements">
              <Bell className="h-4 w-4" />
            </Link>
            <Link to="/profile" className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-1.5 py-1 transition-colors hover:bg-accent" aria-label="Open profile">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-xs font-semibold text-primary">
                {user?.name?.charAt(0) ?? 'H'}
              </div>
              <div className="hidden max-w-[150px] sm:block">
                <p className="truncate text-xs font-medium leading-tight text-foreground">{user?.name}</p>
                <p className="truncate text-[10px] capitalize leading-tight text-muted-foreground">{user?.role?.replace(/_/g, ' ')}</p>
              </div>
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1680px] p-3 sm:p-4 md:p-5 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}