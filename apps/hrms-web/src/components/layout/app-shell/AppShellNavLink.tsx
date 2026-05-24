import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isAppShellNavItemActive } from '@flc/shell';
import type { AppShellNavItem } from '@flc/shell';

interface AppShellNavLinkProps {
  item: AppShellNavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}

export function AppShellNavLink({ item, pathname, collapsed, onNavigate }: AppShellNavLinkProps) {
  const active = isAppShellNavItemActive(item, pathname);
  const badgeLabel = item.badgeCount ? (item.badgeCount > 99 ? '99+' : String(item.badgeCount)) : null;
  const linkClassName = cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-150',
    collapsed && 'justify-center px-2 py-2',
    active
      ? 'nav-item-active'
      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  );
  const Icon = item.icon;
  const content = (
    <>
      <span className="relative flex items-center">
        <Icon className="h-4 w-4 flex-shrink-0" />
        {collapsed && badgeLabel && (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {badgeLabel}
          </span>
        )}
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && badgeLabel && (
        <span
          className={cn(
            'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
            active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
          )}
        >
          {badgeLabel}
        </span>
      )}
    </>
  );
  const href = item.href ?? item.path;
  const link = item.external ? (
    <a href={href} onClick={onNavigate} className={linkClassName} aria-label={collapsed ? item.label : undefined}>
      {content}
    </a>
  ) : (
    <Link to={item.path} onClick={onNavigate} className={linkClassName} aria-label={collapsed ? item.label : undefined}>
      {content}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
    </Tooltip>
  );
}