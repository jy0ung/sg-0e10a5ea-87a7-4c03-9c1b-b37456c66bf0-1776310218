// Compatibility shim: routes legacy `useToast({ title, description, variant })`
// calls through the single `sonner` toast system.
import { toast as sonnerToast } from 'sonner';
import type { ReactNode } from 'react';

type ToastVariant = 'default' | 'destructive' | 'success';

interface ToastArgs {
  title?: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

function renderToast(args: ToastArgs): string | number {
  const title = typeof args.title === 'string' ? args.title : (args.title ?? '');
  const description = typeof args.description === 'string' ? args.description : args.description;
  const opts = {
    description,
    duration: args.duration,
    action: args.action,
  };
  if (args.variant === 'destructive') return sonnerToast.error(title as string, opts);
  if (args.variant === 'success') return sonnerToast.success(title as string, opts);
  return sonnerToast(title as string, opts);
}

export function toast(args: ToastArgs) {
  const id = renderToast(args);
  return {
    id: String(id),
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: ToastArgs) => {
      sonnerToast.dismiss(id);
      return renderToast(next);
    },
  };
}

export function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
    toasts: [] as Array<never>,
  };
}
