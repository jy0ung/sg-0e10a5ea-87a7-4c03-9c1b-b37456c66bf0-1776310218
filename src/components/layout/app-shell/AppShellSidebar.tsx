import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AppShellNavLink } from './AppShellNavLink';
import { isAppShellNavItemActive } from './navUtils';
import type { AppShellAction, AppShellBackLink, AppShellBrand, AppShellNavItem, AppShellNavSection, AppShellUser } from './types';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
}

function groupItems(items: AppShellNavItem[]) {
  const groups = new Map<string, AppShellNavItem[]>();
  items.forEach((item) => {
    const group = item.group ?? 'Pages';
    groups.set(group, [...(groups.get(group) ?? []), item]);
  });
  return Array.from(groups.entries()).map(([group, groupedItems]) => ({ group, items: groupedItems }));
}

function ShellActionLink({ action, collapsed, onNavigate }: { action: AppShellAction; collapsed: boolean; onNavigate?: () => void }) {
  if (action.render) return <>{action.render}</>;
  const Icon = action.icon;
  const content = (
    <>
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {!collapsed && <span className="truncate">{action.label}</span>}
    </>
  );
  const className = cn(
    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    collapsed && 'justify-center px-2 py-2',
    action.className,
  );
  const link = action.href || action.external ? (
    <a href={action.href ?? action.to ?? '#'} className={className} onClick={onNavigate}>
      {content}
    </a>
  ) : action.to ? (
    <Link to={action.to} className={className} onClick={onNavigate}>
      {content}
    </Link>
  ) : (
    <button type="button" className={cn(className, 'w-full text-left')} onClick={action.onClick}>
      {content}
    </button>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{action.label}</TooltipContent>
    </Tooltip>
  );
}

interface AppShellSidebarProps {
  brand: AppShellBrand;
  sections: AppShellNavSection[];
  pathname: string;
  collapsed: boolean;
  collapsible?: boolean;
  showCollapseToggle?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
  user?: AppShellUser;
  onSignOut?: () => void;
  footerActions?: AppShellAction[];
  focusedBackLink?: AppShellBackLink | null;
}

export function AppShellSidebar({
  brand,
  sections,
  pathname,
  collapsed,
  collapsible = false,
  showCollapseToggle = false,
  onCollapseChange,
  onNavigate,
  user,
  onSignOut,
  footerActions = [],
  focusedBackLink,
}: AppShellSidebarProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300',
          collapsed ? 'w-14' : 'w-[17rem]',
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border', collapsed ? 'justify-center px-3' : 'px-3.5')}>
          {brand.logoSrc && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/20 bg-white shadow-sm">
              <img src={brand.logoSrc} alt={brand.logoAlt ?? brand.title} className="h-7 w-7 object-contain" />
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-sidebar-accent-foreground">{brand.title}</p>
              {brand.subtitle && <p className="truncate text-[10px] leading-tight text-sidebar-foreground/65">{brand.subtitle}</p>}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {focusedBackLink && (
            <div className="mb-2">
              <ShellActionLink
                collapsed={collapsed}
                onNavigate={onNavigate}
                action={{
                  label: focusedBackLink.label,
                  to: focusedBackLink.to,
                  href: focusedBackLink.href,
                  external: !!focusedBackLink.href,
                  icon: focusedBackLink.icon ?? ArrowLeft,
                }}
              />
            </div>
          )}

          {sections.map((section, index) => {
            if (section.items.length === 0) return null;
            const showHeader = section.showHeader ?? true;
            const showItems = section.showItems ?? true;
            const grouped = groupItems(section.items);
            const showGroupLabels = !collapsed && section.showGroupLabels !== false && grouped.length > 1;
            const hasActive = section.activeMatch?.(pathname) ?? section.items.some((item) => isAppShellNavItemActive(item, pathname));
            const SectionIcon = section.icon;
            const headerClassName = cn(
              'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors',
              hasActive ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
              collapsed && 'justify-center px-2',
            );
            const headerContent = (
              <>
                {SectionIcon && <SectionIcon className="h-3.5 w-3.5 shrink-0" />}
                {!collapsed && <span className="min-w-0 flex-1 truncate">{section.name}</span>}
                {!collapsed && section.path && <ChevronRight className="h-3 w-3 opacity-40" />}
              </>
            );

            return (
              <div key={section.name} className="mb-3">
                {collapsed && index > 0 && <div className="mx-1 my-2 h-px bg-sidebar-border/60" />}
                {showHeader && section.path && (section.external || section.href ? (
                  <a href={section.href ?? section.path} onClick={onNavigate} className={headerClassName} aria-label={collapsed ? section.name : undefined}>
                    {headerContent}
                  </a>
                ) : (
                  <Link to={section.path} onClick={onNavigate} className={headerClassName} aria-label={collapsed ? section.name : undefined}>
                    {headerContent}
                  </Link>
                ))}
                {showHeader && !section.path && !collapsed && (
                  <div className={cn('mb-1 flex items-center gap-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]', hasActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/45')}>
                    {SectionIcon && <SectionIcon className="h-3.5 w-3.5 shrink-0" />}
                    <span>{section.name}</span>
                  </div>
                )}

                {showItems && (
                  <div className="space-y-0.5">
                    {showGroupLabels ? grouped.map((group) => (
                      <div key={group.group} className="space-y-0.5">
                        <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">{group.group}</p>
                        {group.items.map((item) => (
                          <AppShellNavLink key={item.path} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
                        ))}
                      </div>
                    )) : section.items.map((item) => (
                      <AppShellNavLink key={item.path} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border">
          {footerActions.length > 0 && (
            <div className="space-y-1 border-b border-sidebar-border/60 px-2 py-2">
              {footerActions.map((action) => (
                <ShellActionLink key={action.label} action={action} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          )}
          {user && (
            <div className={cn('flex items-center gap-2 px-3 py-3', collapsed && 'justify-center px-2')}>
              {user.profilePath ? (
                <Link to={user.profilePath} className="flex min-w-0 flex-1 items-center gap-2.5 group">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20 transition-colors group-hover:bg-primary/30">
                    <span className="text-xs font-bold text-sidebar-accent-foreground">{getInitials(user.name)}</span>
                  </div>
                  {!collapsed && (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-tight text-sidebar-accent-foreground">{user.name}</p>
                      <p className="truncate text-[10px] capitalize text-sidebar-foreground/60">{user.role?.replace(/_/g, ' ')}</p>
                    </div>
                  )}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20">
                    <span className="text-xs font-bold text-sidebar-accent-foreground">{getInitials(user.name)}</span>
                  </div>
                  {!collapsed && (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-tight text-sidebar-accent-foreground">{user.name}</p>
                      <p className="truncate text-[10px] capitalize text-sidebar-foreground/60">{user.role?.replace(/_/g, ' ')}</p>
                    </div>
                  )}
                </div>
              )}
              {onSignOut && !collapsed && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Sign out</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
          {onSignOut && collapsed && (
            <div className="px-2 pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="flex w-full justify-center rounded-md py-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          )}
          {collapsible && showCollapseToggle && (
            <div className="border-t border-sidebar-border/50 p-2">
              <button
                type="button"
                onClick={() => onCollapseChange?.(!collapsed)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground', collapsed && 'justify-center')}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse sidebar</span></>}
              </button>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}