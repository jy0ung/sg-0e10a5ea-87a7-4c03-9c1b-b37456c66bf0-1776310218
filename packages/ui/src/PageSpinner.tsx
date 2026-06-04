import { Loader2 } from 'lucide-react';

export function PageSpinner({ label }: { label?: string }) {
  const ariaLabel = label ?? 'Loading page';
  return (
    <div className="flex h-64 items-center justify-center" role="status" aria-label={ariaLabel}>
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
    </div>
  );
}
