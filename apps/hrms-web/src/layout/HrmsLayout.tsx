import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Bell,
  Briefcase,
  Calendar,
  Clock,
  CreditCard,
  GitMerge,
  LogOut,
  Megaphone,
  Menu,
  Settings2,
  ShieldCheck,
  Star,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react';
import type { AppRole } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  HRMS_ADMIN,
  HRMS_APPRAISALS,
  HRMS_APPROVAL_INBOX,
  HRMS_LEAVE,
  HRMS_PAYROLL,
  MANAGER_AND_UP,
} from '@/config/routeRoles';

interface HrmsNavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  group: string;
  roles?: readonly AppRole[];
}

const navItems: HrmsNavItem[] = [
  { label: 'Leave', path: '/leave', icon: Calendar, group: 'Self Service', roles: HRMS_LEAVE },
  { label: 'Approvals', path: '/approvals', icon: UserCheck, group: 'Self Service', roles: HRMS_APPROVAL_INBOX },
  { label: 'Appraisals', path: '/appraisals', icon: Star, group: 'Self Service', roles: HRMS_APPRAISALS },
  { label: 'Announcements', path: '/announcements', icon: Megaphone, group: 'Self Service', roles: MANAGER_AND_UP },
  { label: 'Profile', path: '/profile', icon: UserRound, group: 'Self Service' },
  { label: 'Attendance', path: '/attendance', icon: Clock, group: 'Workforce', roles: MANAGER_AND_UP },
  { label: 'Leave Calendar', path: '/leave/calendar', icon: Calendar, group: 'Workforce', roles: MANAGER_AND_UP },
  { label: 'Employees', path: '/employees', icon: Users, group: 'Workforce', roles: MANAGER_AND_UP },
  { label: 'Payroll', path: '/payroll', icon: CreditCard, group: 'Administration', roles: HRMS_PAYROLL },
  { label: 'Settings', path: '/settings', icon: Settings2, group: 'Administration', roles: HRMS_ADMIN },
  { label: 'Approval Flows', path: '/approval-flows', icon: GitMerge, group: 'Administration', roles: HRMS_ADMIN },
];

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
    () => navItems.filter((item) => !item.roles || hasRole(item.roles as AppRole[])),
    [hasRole],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Briefcase className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">FLC HRMS</p>
            <p className="truncate text-[11px] text-sidebar-foreground/65">Dedicated workspace</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {grouped(visibleItems).map(([group, items]) => (
            <div key={group} className="mb-5">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/55">{group}</p>
              <div className="space-y-1">
                {items.map((item) => {
                  const active = isActive(item.path, pathname);
                  return (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.path}
                          onClick={onNavigate}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                            active
                              ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
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
          <div className="mb-3 rounded-md bg-sidebar-accent/60 px-3 py-2">
            <p className="truncate text-xs font-medium">{user?.name ?? 'HRMS User'}</p>
            <p className="truncate text-[11px] capitalize text-sidebar-foreground/65">{user?.role?.replace(/_/g, ' ') ?? ''}</p>
          </div>
          <Button variant="ghost" className="w-full justify-start" onClick={() => void logout()}>
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

  const sidebar = <HrmsSidebar onNavigate={isMobile ? () => setMobileOpen(false) : undefined} />;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {!isMobile && sidebar}

      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">HRMS navigation</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}

      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <header className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/85 px-4 shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-md md:px-6">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="hidden items-center gap-2 text-sm font-medium text-muted-foreground sm:flex">
              <ShieldCheck className="h-4 w-4 text-primary" />
              HRMS-only access
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/announcements" className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Open announcements">
              <Bell className="h-5 w-5" />
            </Link>
            <Link to="/profile" className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent" aria-label="Open profile">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-xs font-semibold text-primary">
                {user?.name?.charAt(0) ?? 'H'}
              </div>
              <span className="hidden max-w-32 truncate text-xs font-medium sm:block">{user?.name}</span>
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}