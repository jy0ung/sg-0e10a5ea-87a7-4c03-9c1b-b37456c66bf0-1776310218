import React, { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TicketCheck, ClipboardList, ArrowLeft, HeadphonesIcon, Menu, X } from 'lucide-react';
import { canAccessMainApp } from '@/lib/portalAccess';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'New Request', href: '/portal/tickets/new', icon: TicketCheck },
  { label: 'My Requests', href: '/portal/tickets', icon: ClipboardList },
];

export default function CustomerServiceLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
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
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Sidebar header */}
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <HeadphonesIcon className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm text-foreground">Internal Requests</span>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="ml-auto text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(({ label, href, icon: Icon }) => (
            <NavLink
              key={href}
              to={href}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
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
          <div className="border-t border-border px-3 py-4">
            <Link
              to="/"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              className="text-muted-foreground hover:text-foreground lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-semibold text-foreground">Internal Requests</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-xs font-semibold">
                {user?.name?.charAt(0) ?? '?'}
              </span>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-medium text-foreground">{user?.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
