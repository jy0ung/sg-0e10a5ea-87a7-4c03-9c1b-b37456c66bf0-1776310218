import React from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, Clock3, ShieldOff } from 'lucide-react';
import {
  getPlatformUnavailableCopy,
  type PlatformUnavailableReason,
} from '@flc/shell';

interface FeatureUnavailableStateProps {
  featureName?: string;
  flagName?: string;
  reason?: PlatformUnavailableReason;
  description?: string;
  'data-testid'?: string;
}

const ICONS: Record<PlatformUnavailableReason, typeof AlertTriangle> = {
  disabledModule: AlertTriangle,
  missingPermission: ShieldOff,
  planned: Clock3,
};

export function FeatureUnavailableState({
  featureName,
  flagName,
  reason = 'disabledModule',
  description,
  'data-testid': testId,
}: FeatureUnavailableStateProps) {
  const location = useLocation();
  const copy = getPlatformUnavailableCopy(location.pathname, reason, { featureName, flagName });
  const Icon = ICONS[reason];

  return (
    <div className="glass-panel p-10 text-center max-w-xl mx-auto" data-testid={testId}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description ?? copy.description}
      </p>
    </div>
  );
}
