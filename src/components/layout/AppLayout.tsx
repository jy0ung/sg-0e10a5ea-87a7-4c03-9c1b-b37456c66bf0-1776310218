import React, { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { Bell, Menu } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusedMode } from '@/hooks/useFocusedMode';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const { isFocused } = useFocusedMode();
  const isMobile = useIsMobile();

  const sidebar = (
    <AppSidebar
      collapsed={isMobile ? false : collapsed}
      setCollapsed={setCollapsed}
      isFocused={isFocused}
      onNavigate={isMobile ? () => setMobileOpen(false) : undefined}
    />
  );

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      {/* Desktop sidebar */}
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

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top bar */}
        <header className="h-14 border-b border-border/80 flex items-center justify-between px-4 md:px-6 bg-background/85 backdrop-blur-md shadow-[0_1px_0_hsl(var(--border))] flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to="/notifications" className="relative rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Open notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border border-primary/15 bg-primary/10 flex items-center justify-center shadow-sm">
                <span className="text-primary text-xs font-semibold">{user?.name?.charAt(0)}</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium text-foreground">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
