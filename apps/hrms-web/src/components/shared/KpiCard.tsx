import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: number;
  subtitle?: string;
  status?: 'normal' | 'warning' | 'critical';
  validCount?: number;
  overdueCount?: number;
  onClick?: () => void;
  onVehicleDetails?: () => void;
}

export function KpiCard({ 
  label, 
  value, 
  subtitle, 
  status = 'normal', 
  validCount, 
  overdueCount,
  onClick,
  onVehicleDetails
}: KpiCardProps) {
  const statusColors = {
    normal: 'bg-success/10 border-success/20',
    warning: 'bg-warning/10 border-warning/20',
    critical: 'bg-destructive/10 border-destructive/20',
  };

  const statusIndicator = {
    normal: 'text-success',
    warning: 'text-warning',
    critical: 'text-destructive',
  };

  return (
    <Card 
      className={cn(
        'glass-panel p-4 transition-all hover:shadow-md',
        (onClick || onVehicleDetails) && 'hover:border-primary/40 cursor-pointer',
        statusColors[status]
      )}
      onClick={onClick || onVehicleDetails}
    >
      <div className="space-y-2">
        {/* KPI Name - Prominent */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </p>
        </div>

        {/* Main Value with Label */}
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground">{value}</span>
            <span className="text-xs text-muted-foreground font-medium">median days</span>
          </div>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>

        {/* Status Indicators */}
        {(validCount !== undefined || overdueCount !== undefined) && (
          <div className="flex items-center justify-between pt-1 border-t border-border/30">
            <div>
              <span className="text-[10px] text-muted-foreground">Valid: </span>
              <span className="text-xs text-foreground font-medium">{validCount}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Overdue: </span>
              <span className={cn('text-xs font-medium', statusIndicator[status])}>{overdueCount}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
