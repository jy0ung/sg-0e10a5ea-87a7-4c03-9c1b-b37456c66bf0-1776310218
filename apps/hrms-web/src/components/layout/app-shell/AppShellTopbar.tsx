import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AppShellAction, AppShellRouteChrome, AppShellUser } from '@flc/shell';

function getInitial(name?: string | null): string {
  return name?.charAt(0) || '?';
}

function badgeContent(badge: AppShellAction['badge']): string | number | ReactNode | null {
  if (badge === true) return '';
  if (typeof badge === 'number') {
    if (badge <= 0) return null;
    return badge > 99 ? '99+' : badge;
  }
  return badge ?? null;
}

function TopbarAction({ action }: { action: AppShellAction }) {
  if (action.render) return <>{action.render}</>;
  const Icon = action.icon;
  const contentBadge = badgeContent(action.badge);
  const ariaLabel = typeof action.badge === 'number' && action.badge > 0
    ? `${action.label} (${action.badge} unread)`
    : action.label;
  const className = cn(
    'relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
    action.className,
  );
  const content = (
    <>
      {Icon && <Icon className="h-4 w-4" />}
      {action.badge === true && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />}
      {contentBadge !== null && action.badge !== true && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {contentBadge}
        </span>
      )}
    </>
  );

  if (action.href || action.external) {
    return <a href={action.href ?? action.to ?? '#'} className={className} aria-label={ariaLabel}>{content}</a>;
  }
  if (action.to) {
    return <Link to={action.to} className={className} aria-label={ariaLabel}>{content}</Link>;
  }
  return <button type="button" className={className} onClick={action.onClick} aria-label={ariaLabel}>{content}</button>;
}

interface AppShellTopbarProps {
  chrome: AppShellRouteChrome;
  isMobile: boolean;
  onOpenMobileSidebar: () => void;
  searchPlaceholder?: string;
  actions?: AppShellAction[];
  user?: AppShellUser;
  showThemeToggle?: boolean;
}

export function AppShellTopbar({
  chrome,
  isMobile,
  onOpenMobileSidebar,
  searchPlaceholder,
  actions = [],
  user,
  showThemeToggle = true,
}: AppShellTopbarProps) {
  const profile = user?.profilePath ? (
    <Link to={user.profilePath} className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-1.5 py-1 transition-colors hover:bg-accent" aria-label="Open profile">
      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-xs font-semibold text-primary">
        {getInitial(user.name)}
      </div>
      <div className="hidden max-w-[150px] sm:block">
        <p className="truncate text-xs font-medium leading-tight text-foreground">{user.name}</p>
        <p className="truncate text-[10px] capitalize leading-tight text-muted-foreground">{user.role?.replace(/_/g, ' ')}</p>
      </div>
    </Link>
  ) : user ? (
    <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-1.5 py-1">
      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-xs font-semibold text-primary">
        {getInitial(user.name)}
      </div>
      <div className="hidden max-w-[150px] sm:block">
        <p className="truncate text-xs font-medium leading-tight text-foreground">{user.name}</p>
        <p className="truncate text-[10px] capitalize leading-tight text-muted-foreground">{user.role?.replace(/_/g, ' ')}</p>
      </div>
    </div>
  ) : null;

  return (
    <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {isMobile && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onOpenMobileSidebar} aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold leading-tight text-foreground">{chrome.title}</div>
            {chrome.kicker && (
              <span className="hidden max-w-[26rem] truncate rounded-full border border-border/70 bg-muted/50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:inline-flex">
                {chrome.kicker}
              </span>
            )}
          </div>
          {chrome.kicker && <div className="truncate text-[11px] leading-tight text-muted-foreground sm:hidden">{chrome.kicker}</div>}
        </div>
      </div>
      {searchPlaceholder && (
        <div className="hidden min-w-[220px] max-w-md flex-1 lg:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 border-border/80 bg-background/90 pl-8 text-xs shadow-sm"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2">
        {showThemeToggle && <ThemeToggle />}
        {actions.map((action) => <TopbarAction key={action.label} action={action} />)}
        {profile}
      </div>
    </header>
  );
}
