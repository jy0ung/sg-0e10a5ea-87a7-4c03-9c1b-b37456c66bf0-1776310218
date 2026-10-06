import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cn as sharedCn } from './utils';
import { cn as rootCn } from '../../../../src/lib/utils';
import { cn as hrmsCn } from '../../../../apps/hrms-web/src/lib/utils';
import { Button } from '../button';
import { Input } from '../input';

describe.each([['shared UI', sharedCn], ['UBS', rootCn], ['HRMS web', hrmsCn]] as const)('%s class composition', (_name, cn) => {
  it('accepts conditional consumer padding without erasing unrelated vertical padding or custom surfaces', () => {
    const classes = cn('surface-card p-4 px-2', [false, { 'px-6': true }]);
    expect(classes.split(' ')).toEqual(['surface-card', 'p-4', 'px-6']);
  });
  it('overrides font size independently of custom token color and arbitrary color values', () => {
    expect(cn('text-sm text-warning', 'text-lg')).toBe('text-warning text-lg');
    expect(cn('text-[13px] text-[color:hsl(var(--foreground))]', 'text-[15px]')).toBe('text-[color:hsl(var(--foreground))] text-[15px]');
  });
  it('keeps border and focus-ring widths while replacing their custom token colors', () => {
    expect(cn('border-2 border-input focus-visible:ring-2 focus-visible:ring-ring', 'border-destructive focus-visible:ring-primary'))
      .toBe('border-2 focus-visible:ring-2 border-destructive focus-visible:ring-primary');
  });
  it('merges overrides inside the same responsive/state variant without removing other states', () => {
    expect(cn('px-2 md:px-4 data-[state=open]:bg-muted dark:bg-background', 'md:px-6 data-[state=open]:bg-accent'))
      .toBe('px-2 dark:bg-background md:px-6 data-[state=open]:bg-accent');
  });
});

it('the actual Button consumer applies caller size, spacing and token-color overrides', () => {
  render(<Button className="h-10 px-6 text-lg text-warning">Override witness</Button>);
  const button = screen.getByRole('button', { name: 'Override witness' });
  expect(button).toHaveClass('h-10', 'px-6', 'text-lg', 'text-warning');
  expect(button).not.toHaveClass('h-9', 'px-4', 'text-sm');
});

it('the actual Input consumer retains border/ring sizes and disabled behavior with caller token colors', () => {
  render(<Input aria-label="Override input" disabled className="border-destructive focus-visible:ring-primary" />);
  const input = screen.getByRole('textbox', { name: 'Override input' });
  expect(input).toBeDisabled();
  expect(input).toHaveClass('border', 'border-destructive', 'focus-visible:ring-2', 'focus-visible:ring-primary');
  expect(input).not.toHaveClass('border-input', 'focus-visible:ring-ring');
});
