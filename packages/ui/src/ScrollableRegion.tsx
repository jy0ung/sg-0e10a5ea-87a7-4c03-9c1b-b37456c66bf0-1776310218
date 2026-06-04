/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './lib/utils';

interface ScrollableRegionProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  children: ReactNode;
}

export function ScrollableRegion({ label, className, children, ...props }: ScrollableRegionProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn('focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)}
      {...props}
    >
      {children}
    </div>
  );
}
