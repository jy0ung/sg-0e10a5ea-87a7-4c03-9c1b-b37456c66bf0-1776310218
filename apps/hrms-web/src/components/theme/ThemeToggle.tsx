import * as React from 'react';
import { Moon, SunMedium } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('h-9 gap-2 border-border/80 bg-background/80 shadow-sm', className)}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} mode` : 'Toggle color mode'}
      title={mounted ? `Switch to ${isDark ? 'light' : 'dark'} mode` : 'Toggle color mode'}
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        <SunMedium
          className={cn(
            'absolute h-4 w-4 transition-all duration-200',
            isDark ? 'scale-0 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100 text-amber-500',
          )}
        />
        <Moon
          className={cn(
            'absolute h-4 w-4 transition-all duration-200',
            isDark ? 'scale-100 rotate-0 opacity-100 text-sky-400' : 'scale-0 -rotate-90 opacity-0',
          )}
        />
      </span>
      <span className="hidden md:inline">{mounted ? (isDark ? 'Dark mode' : 'Light mode') : 'Theme'}</span>
    </Button>
  );
}