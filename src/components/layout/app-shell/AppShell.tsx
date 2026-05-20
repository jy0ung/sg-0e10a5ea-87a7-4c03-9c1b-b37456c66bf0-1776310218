import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { AppShellSidebar } from './AppShellSidebar';
import { AppShellTopbar } from './AppShellTopbar';
import { resolveRouteChrome } from './routeChrome';
import type {
  AppShellAction,
  AppShellBackLink,
  AppShellBrand,
  AppShellCommandItem,
  AppShellCommandSearch,
  AppShellNavSection,
  AppShellRouteChrome,
  AppShellRouteChromeMatch,
  AppShellUser,
  AppShellWidthMode,
} from './types';

const contentWidthClasses: Record<AppShellWidthMode, string> = {
  contained: 'mx-auto min-h-full w-full max-w-[1680px] p-3 sm:p-4 md:p-5 lg:p-6',
  wide: 'mx-auto min-h-full w-full max-w-[1920px] p-3 sm:p-4 md:p-5 lg:p-6',
  full: 'h-full min-h-0 w-full p-2 sm:p-3 md:p-4',
};

interface AppShellProps {
  brand: AppShellBrand;
  sections: AppShellNavSection[];
  routeChrome: AppShellRouteChromeMatch[];
  fallbackChrome: AppShellRouteChrome;
  user?: AppShellUser;
  onSignOut?: () => void;
  topbarActions?: AppShellAction[];
  footerActions?: AppShellAction[];
  focusedBackLink?: AppShellBackLink | null;
  searchPlaceholder?: string;
  commandItems?: AppShellCommandItem[];
  onCommandSearch?: AppShellCommandSearch;
  widthMode?: AppShellWidthMode;
  contentClassName?: string;
  children?: React.ReactNode;
  collapsibleSidebar?: boolean;
  defaultCollapsed?: boolean;
  autoCollapseOnTablet?: boolean;
  showThemeToggle?: boolean;
  mobileSheetTitle?: string;
}

export function AppShell({
  brand,
  sections,
  routeChrome,
  fallbackChrome,
  user,
  onSignOut,
  topbarActions = [],
  footerActions = [],
  focusedBackLink,
  searchPlaceholder,
  commandItems,
  onCommandSearch,
  widthMode = 'contained',
  contentClassName,
  children,
  collapsibleSidebar = false,
  defaultCollapsed = false,
  autoCollapseOnTablet = false,
  showThemeToggle = true,
  mobileSheetTitle = 'Navigation',
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const location = useLocation();
  const effectiveCollapsed = !isMobile && autoCollapseOnTablet && isTablet ? true : collapsed;
  const chrome = resolveRouteChrome(location.pathname, routeChrome, fallbackChrome);
  const sidebar = (
    <AppShellSidebar
      brand={brand}
      sections={sections}
      pathname={location.pathname}
      collapsed={isMobile ? false : effectiveCollapsed}
      collapsible={collapsibleSidebar}
      showCollapseToggle={collapsibleSidebar && !(autoCollapseOnTablet && isTablet)}
      onCollapseChange={setCollapsed}
      onNavigate={isMobile ? () => setMobileOpen(false) : undefined}
      user={user}
      onSignOut={onSignOut}
      footerActions={footerActions}
      focusedBackLink={focusedBackLink}
    />
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Skip to main content
      </a>

      {!isMobile && sidebar}

      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[17rem] p-0">
            <SheetTitle className="sr-only">{mobileSheetTitle}</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}

      <div className="flex h-screen min-w-0 flex-1 flex-col bg-background">
        <AppShellTopbar
          chrome={chrome}
          isMobile={isMobile}
          onOpenMobileSidebar={() => setMobileOpen(true)}
          searchPlaceholder={searchPlaceholder}
          commandItems={commandItems}
          onCommandSearch={onCommandSearch}
          actions={topbarActions}
          user={user}
          showThemeToggle={showThemeToggle}
        />
        <main id="main-content" className="min-h-0 flex-1 overflow-auto">
          <div className={cn(contentWidthClasses[widthMode], contentClassName)}>
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
