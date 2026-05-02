import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PageSpinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  const ariaLabel = label ?? t('common.loadingPage');
  return (
    <div className="flex h-64 items-center justify-center" role="status" aria-label={ariaLabel}>
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
    </div>
  );
}