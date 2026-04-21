import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(d.getTime())) return '—';
  
  return d.toLocaleDateString('en-SG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(d.getTime())) return '—';
  
  return d.toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Accounting-style number format: thousand separators, 2 decimals,
 * negatives wrapped in parentheses. Empty/null/non-numeric → ''.
 *
 *   1234.5   → "1,234.50"
 *   -1234.5  → "(1,234.50)"
 *   0        → "0.00"
 *   null     → ""
 */
export function formatAccounting(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${abs})` : abs;
}

