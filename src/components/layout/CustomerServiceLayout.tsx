import React, { useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TicketCheck, ClipboardList, ArrowLeft, Menu, X, ListTodo, Settings2, Search } from 'lucide-react';
import { ADMIN_ONLY } from '@/config/routeRoles';
import { canAccessMainApp } from '@/lib/portalAccess';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/types';
import { brandAssets } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

const baseNavItems = [
  { label: 'New Request', href: '/portal/tickets/new', icon: TicketCheck },
  { label: 'My Requests', href: '/portal/tickets', icon: ClipboardList },
];

const adminNavItems = [
  { label: 'Request Queue', href: '/portal/queue', icon: ListTodo },
  { label: 'Request Setup', href: '/portal/setup', icon: Settings2 },
];
const requestQueueRoles = new Set(ADMIN_ONLY);

const routeChrome: Array<[RegExp, string, string]> = [
  [/^\/portal\/tickets\/new/, 'New Request', 'Submit and track internal support demand'],
  [/^\/portal\/tickets$/, 'My Requests', 'Requester history and updates'],
  [/^\/portal\/queue/, 'Request Queue', 'Triage, assign, and resolve requests'],
  [/^\/portal\/setup/, 'Request Setup', 'Configure categories, routing, and forms'],
];

function getRouteChrome(pathname: string) {
  return routeChrome.find(([pattern]) => pattern.test(pathname)) ?? [/^\/portal/, 'Internal Requests', 'Support workspace'];
}

export default function CustomerServiceLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navItems = requestQueueRoles.has((user?.role ?? '') as AppRole)
    ? [...baseNavItems, ...adminNavItems]
    : baseNavItems;
  const [, pageTitle, pageKicker] = getRouteChrome(location.pathname);

  return (
    <div className="h-screen flex w-full overflow-hidden bg-background text-foreground">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[min(17rem,88vw)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:static lg:w-[17rem] lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Sidebar header */}
        <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/20 bg-white shadow-sm">
            <img src={brandAssets.compactLogo} alt="Fook Loi" className="h-7 w-7 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-sidebar-accent-foreground">Internal Requests</p>
            <p className="truncate text-[10px] leading-tight text-sidebar-foreground/65">Service operations</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close navigation menu"
            className="ml-auto h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">Requests</div>
          {navItems.map(({ label, href, icon: Icon }) => (
            <NavLink
              key={href}
              to={href}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Back to app link */}
        {canAccessMainApp(user) && (
          <div className="border-t border-sidebar-border px-2 py-3">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Back to App
            </Link>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0 h-screen">
        {/* Top bar */}
        <header className="h-14 border-b border-border/80 flex items-center justify-between gap-3 px-3 md:px-5 bg-card/95 backdrop-blur flex-shrink-0 z-10 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight text-foreground">{pageTitle}</div>
              <div className="hidden truncate text-[11px] leading-tight text-muted-foreground sm:block">{pageKicker}</div>
            </div>
          </div>
          <div className="hidden min-w-[220px] max-w-md flex-1 lg:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 border-border/80 bg-background pl-8 text-xs" placeholder="Search requests..." aria-label="Search requests" />
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-1.5 py-1">
              <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/15 flex items-center justify-center">
              <span className="text-primary text-xs font-semibold">
                {user?.name?.charAt(0) ?? '?'}
              </span>
              </div>
              <div className="hidden max-w-[150px] sm:block">
                <p className="truncate text-xs font-medium leading-tight text-foreground">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {user?.role?.replace('_', ' ')}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1680px] p-3 sm:p-4 md:p-5 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
