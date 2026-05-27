import { fireEvent, render, screen } from '@testing-library/react';
import { LayoutDashboard, Settings } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { resolveRouteChrome } from '@flc/shell';
import type { AppShellRouteChromeMatch } from '@flc/shell';

let isMobile = false;
let isTablet = false;

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobile,
  useIsTablet: () => isTablet,
}));

vi.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

const routeChrome: AppShellRouteChromeMatch[] = [
  { pattern: /^\/$/, title: 'Dashboard', kicker: 'Executive view' },
  { pattern: /^\/settings/, title: 'Settings', kicker: 'Configuration' },
];

function renderShell(path = '/', widthMode: 'contained' | 'wide' | 'full' = 'contained') {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        brand={{ title: 'FLC BI', subtitle: 'Operations intelligence' }}
        sections={[
          {
            name: 'Workspace',
            items: [
              { label: 'Dashboard', path: '/', icon: LayoutDashboard, end: true },
              { label: 'Settings', path: '/settings', icon: Settings },
            ],
          },
        ]}
        routeChrome={routeChrome}
        fallbackChrome={{ title: 'Fallback', kicker: 'Fallback workspace' }}
        user={{ name: 'Shell Tester', email: 'shell@example.com', role: 'company_admin', profilePath: '/profile' }}
        searchPlaceholder="Search shell"
        commandItems={[
          { id: 'dashboard', label: 'Dashboard', section: 'Navigation', to: '/', icon: LayoutDashboard },
          { id: 'settings', label: 'Settings', section: 'Navigation', to: '/settings', icon: Settings },
        ]}
        widthMode={widthMode}
      >
        <div>Shell content</div>
      </AppShell>
    </MemoryRouter>,
  );

  return result;
}

describe('AppShell', () => {
  beforeEach(() => {
    isMobile = false;
    isTablet = false;
  });

  it('resolves route chrome using ordered matchers', () => {
    expect(resolveRouteChrome('/settings/users', routeChrome, { title: 'Fallback' })).toEqual({
      pattern: /^\/settings/,
      title: 'Settings',
      kicker: 'Configuration',
    });
    expect(resolveRouteChrome('/missing', routeChrome, { title: 'Fallback' })).toEqual({ title: 'Fallback' });
  });

  it('renders shared sidebar, topbar, command search, profile, and content', () => {
    renderShell('/settings');

    expect(screen.getByText('FLC BI')).toBeInTheDocument();
    expect(screen.getAllByText('Configuration').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Search shell' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveClass('nav-item-active');
    expect(screen.getByRole('link', { name: 'Open profile' })).toBeInTheDocument();
    expect(screen.getByText('Shell content')).toBeInTheDocument();
  });

  it('opens the command palette from the search control and Cmd+K', () => {
    renderShell('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Search shell' }));
    expect(screen.getByRole('combobox', { name: 'Search shell' })).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.queryByRole('combobox', { name: 'Search shell' })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByRole('combobox', { name: 'Search shell' })).toBeInTheDocument();
  });

  it('applies the full-width workbench content mode', () => {
    const { container } = renderShell('/settings', 'full');
    const contentFrame = container.querySelector('main > div');

    expect(contentFrame).toHaveClass('h-full');
    expect(contentFrame).not.toHaveClass('max-w-[1680px]');
  });

  it('uses the mobile drawer navigation when the viewport is mobile', async () => {
    isMobile = true;
    renderShell('/');

    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });
});
