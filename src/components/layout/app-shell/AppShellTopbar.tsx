import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { AppShellAction, AppShellCommandItem, AppShellCommandSearch, AppShellRouteChrome, AppShellUser } from './types';

const COMMAND_SEARCH_MIN_LENGTH = 2;
const COMMAND_SEARCH_DEBOUNCE_MS = 250;

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
        <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground shadow-sm">
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

function itemMatchesQuery(item: AppShellCommandItem, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [item.label, item.description, item.section].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

function groupCommandItems(items: AppShellCommandItem[]): Array<[string, AppShellCommandItem[]]> {
  const groups = new Map<string, AppShellCommandItem[]>();
  for (const item of items) {
    const key = item.section ?? 'Commands';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.entries());
}

interface AppShellCommandPaletteProps {
  placeholder: string;
  staticItems: AppShellCommandItem[];
  onCommandSearch?: AppShellCommandSearch;
}

function AppShellCommandPalette({
  placeholder,
  staticItems,
  onCommandSearch,
}: AppShellCommandPaletteProps) {
  const navigate = useNavigate();
  const inputLabelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [asyncItems, setAsyncItems] = useState<AppShellCommandItem[]>([]);
  const [loading, setLoading] = useState(false);
  const hasCommands = staticItems.length > 0 || !!onCommandSearch;

  useEffect(() => {
    if (!hasCommands) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasCommands]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setAsyncItems([]);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!open || !onCommandSearch || trimmedQuery.length < COMMAND_SEARCH_MIN_LENGTH) {
      setAsyncItems([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      Promise.resolve(onCommandSearch(trimmedQuery))
        .then((items) => {
          if (!cancelled) setAsyncItems(items);
        })
        .catch(() => {
          if (!cancelled) setAsyncItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, COMMAND_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, onCommandSearch, query]);

  const commandItems = useMemo(() => {
    const visibleStaticItems = staticItems.filter((item) => itemMatchesQuery(item, query));
    return [...visibleStaticItems, ...asyncItems];
  }, [asyncItems, query, staticItems]);

  const commandGroups = useMemo(() => groupCommandItems(commandItems), [commandItems]);

  const selectItem = (item: AppShellCommandItem) => {
    setOpen(false);
    if (item.href || item.external) {
      window.location.assign(item.href ?? item.to ?? '#');
      return;
    }
    if (item.to) navigate(item.to);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="hidden h-8 min-w-[220px] max-w-md flex-1 justify-start gap-2 border-border/80 bg-background px-2.5 text-xs font-normal text-muted-foreground lg:flex"
        onClick={() => setOpen(true)}
        aria-label={placeholder}
        disabled={!hasCommands}
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        <span className="truncate">{placeholder}</span>
        <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Cmd K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} commandLabel={placeholder}>
        <span id={inputLabelId} className="sr-only">{placeholder}</span>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={placeholder}
          aria-labelledby={inputLabelId}
        />
        <CommandList>
          <CommandEmpty>{loading ? 'Searching...' : 'No results found.'}</CommandEmpty>
          {commandGroups.map(([section, items]) => (
            <CommandGroup key={section} heading={section}>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.section ?? ''} ${item.label} ${item.description ?? ''}`}
                    onSelect={() => selectItem(item)}
                  >
                    {Icon && <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />}
                    <span className="truncate">{item.label}</span>
                    {item.description && (
                      <span className="ml-auto max-w-[50%] truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

interface AppShellTopbarProps {
  chrome: AppShellRouteChrome;
  isMobile: boolean;
  onOpenMobileSidebar: () => void;
  searchPlaceholder?: string;
  commandItems?: AppShellCommandItem[];
  onCommandSearch?: AppShellCommandSearch;
  actions?: AppShellAction[];
  user?: AppShellUser;
  showThemeToggle?: boolean;
}

export function AppShellTopbar({
  chrome,
  isMobile,
  onOpenMobileSidebar,
  searchPlaceholder,
  commandItems = [],
  onCommandSearch,
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
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight text-foreground">{chrome.title}</div>
          {chrome.kicker && <div className="hidden truncate text-[11px] leading-tight text-muted-foreground sm:block">{chrome.kicker}</div>}
        </div>
      </div>
      {searchPlaceholder && (
        <AppShellCommandPalette
          placeholder={searchPlaceholder}
          staticItems={commandItems}
          onCommandSearch={onCommandSearch}
        />
      )}
      <div className="flex shrink-0 items-center gap-2">
        {showThemeToggle && <ThemeToggle />}
        {actions.map((action) => <TopbarAction key={action.label} action={action} />)}
        {profile}
      </div>
    </header>
  );
}
