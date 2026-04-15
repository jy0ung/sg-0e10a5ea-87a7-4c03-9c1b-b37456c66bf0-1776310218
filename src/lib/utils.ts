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
