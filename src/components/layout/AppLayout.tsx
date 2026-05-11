import React, { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { Bell, Menu, Search } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusedMode } from '@/hooks/useFocusedMode';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PAGE_TITLES: Array<[RegExp, string, string]> = [
  [/^\/$/, 'Executive Dashboard', 'Company-wide KPI cockpit'],
  [/^\/modules/, 'Module Directory', 'Active workspaces'],
  [/^\/notifications/, 'Notifications', 'Operational alerts'],
  [/^\/auto-aging\/vehicles/, 'Vehicle Explorer', 'Aging drilldown'],
  [/^\/auto-aging\/reports/, 'Auto Aging Reports', 'Report builder'],
  [/^\/auto-aging/, 'Auto Aging', 'Inventory aging operations'],
  [/^\/sales\/pipeline/, 'Deal Pipeline', 'Sales execution'],
  [/^\/sales\/orders/, 'Sales Orders', 'Order management'],
  [/^\/sales\/customers/, 'Customers', 'Customer records'],
  [/^\/sales/, 'Sales', 'Revenue workspace'],
  [/^\/inventory/, 'Inventory', 'Stock and movement'],
  [/^\/purchasing/, 'Purchasing', 'Vendor operations'],
  [/^\/reports/, 'Business Reports', 'Cross-module reporting'],
  [/^\/admin/, 'Administration', 'Controls and governance'],
  [/^\/hrms/, 'HRMS', 'Workforce workspace'],
];

function getRouteChrome(pathname: string) {
  return PAGE_TITLES.find(([pattern]) => pattern.test(pathname)) ?? PAGE_TITLES[0]!;
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const { isFocused } = useFocusedMode();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const location = useLocation();
  const [, pageTitle, pageKicker] = getRouteChrome(location.pathname);

  // Tablet auto-collapses sidebar to icon-rail; user cannot override
  const effectiveCollapsed = isTablet ? true : collapsed;

  const sidebar = (
    <AppSidebar
      collapsed={isMobile ? false : effectiveCollapsed}
      setCollapsed={isTablet ? () => {} : setCollapsed}
      isFocused={isFocused}
      onNavigate={isMobile ? () => setMobileOpen(false) : undefined}
      showCollapseToggle={!isTablet}
    />
  );

  return (
    <div className="h-screen flex w-full overflow-hidden bg-background text-foreground">
      {/* Desktop / tablet sidebar */}
      {!isMobile && sidebar}

      {/* Mobile sidebar sheet */}
      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-72">
            <VisuallyHidden><SheetTitle>Navigation</SheetTitle></VisuallyHidden>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-screen bg-background">
        {/* Top bar */}
        <header className="h-14 border-b border-border/80 flex items-center justify-between gap-3 px-3 md:px-5 bg-card/95 backdrop-blur flex-shrink-0 z-10 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex min-w-0 items-center gap-3">
            {isMobile && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                className="h-8 w-8 flex-shrink-0"
                aria-label="Open navigation menu"
              >
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
              <Input className="h-8 border-border/80 bg-background pl-8 text-xs" placeholder="Search workspace..." aria-label="Search workspace" />
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link to="/notifications" className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" aria-label="Open notifications">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
            </Link>
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-1.5 py-1">
              <div className="w-7 h-7 rounded-md border border-primary/15 bg-primary/10 flex items-center justify-center shadow-sm">
                <span className="text-primary text-xs font-semibold">{user?.name?.charAt(0)}</span>
              </div>
              <div className="hidden max-w-[150px] sm:block">
                <p className="truncate text-xs font-medium leading-tight text-foreground">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
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
