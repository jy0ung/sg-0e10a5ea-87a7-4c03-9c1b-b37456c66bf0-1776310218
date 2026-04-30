import React, { useState, useEffect } from 'react';
import { VehicleCanonical } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';
import { Edit2, Save, X, Clock, History, CheckCircle2, Circle, ChevronLeft } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { getAuditLog, type AuditLogWithProfile } from '@/services/auditService';
import { AuditDiffTable } from '@/components/shared/AuditDiffTable';
import { useColumnPermissions, canViewField, canEditField } from '@/hooks/useColumnPermissions';
import { KPI_DEFINITIONS } from '@/data/kpi-definitions';
import { getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';

/** Lifecycle milestones in chronological order (BG → Disbursement). */
const LIFECYCLE_MILESTONES: Array<{
  key: keyof VehicleCanonical;
  label: string;
  kpiField?: keyof VehicleCanonical;
}> = [
  { key: 'bg_date', label: getAutoAgingFieldLabel('bg_date', 'BG DATE') },
  { key: 'shipment_etd_pkg', label: getAutoAgingFieldLabel('shipment_etd_pkg', 'SHIPMENT ETD PKG'), kpiField: 'bg_to_shipment_etd' },
  { key: 'shipment_eta_kk_twu_sdk', label: getAutoAgingFieldLabel('shipment_eta_kk_twu_sdk', 'DATE SHIPMENT ETA KK/TWU/SDK') },
  { key: 'date_received_by_outlet', label: getAutoAgingFieldLabel('date_received_by_outlet', 'RECEIVED BY OUTLET'), kpiField: 'etd_to_outlet' },
  { key: 'reg_date', label: getAutoAgingFieldLabel('reg_date', 'REG DATE'), kpiField: 'outlet_to_reg' },
  { key: 'delivery_date', label: getAutoAgingFieldLabel('delivery_date', 'DELIVERY DATE'), kpiField: 'reg_to_delivery' },
  { key: 'disb_date', label: getAutoAgingFieldLabel('disb_date', 'DISB. DATE'), kpiField: 'delivery_to_disb' },
];

const INFO_FIELDS: Array<{
  key: keyof VehicleCanonical;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea';
  readonly?: boolean;
}> = [
  { key: 'customer_name', label: getAutoAgingFieldLabel('customer_name', 'CUST NAME'), type: 'text' },
  { key: 'salesman_name', label: getAutoAgingFieldLabel('salesman_name', 'SA NAME'), type: 'text' },
  { key: 'branch_code', label: getAutoAgingFieldLabel('branch_code', 'BRCH K1'), type: 'text' },
  { key: 'payment_method', label: getAutoAgingFieldLabel('payment_method', 'PAYMENT METHOD'), type: 'text' },
  { key: 'model', label: getAutoAgingFieldLabel('model', 'MODEL'), type: 'text', readonly: true },
  { key: 'variant', label: getAutoAgingFieldLabel('variant', 'VAR'), type: 'text' },
  { key: 'color', label: getAutoAgingFieldLabel('color', 'COLOR'), type: 'text' },
  { key: 'reg_no', label: getAutoAgingFieldLabel('reg_no', 'REG NO'), type: 'text' },
  { key: 'invoice_no', label: getAutoAgingFieldLabel('invoice_no', 'INV No.'), type: 'text' },
  { key: 'shipment_name', label: getAutoAgingFieldLabel('shipment_name', 'SHIPMENT NAME'), type: 'text' },
  { key: 'remark', label: getAutoAgingFieldLabel('remark', 'REMARK'), type: 'textarea' },
];

interface VehicleDetailPanelProps {
  vehicle: VehicleCanonical | null;
  open: boolean;
  onClose: () => void;
  canEdit?: boolean;
  onEdit?: (id: string, updates: Partial<VehicleCanonical>) => Promise<void>;
}

export function VehicleDetailPanel({
  vehicle,
  open,
  onClose,
  canEdit = false,
  onEdit,
}: VehicleDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<VehicleCanonical>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogWithProfile[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const { permissions } = useColumnPermissions();

  useEffect(() => {
    if (vehicle && open) {
      setEditData(vehicle);
      setShowAudit(false);
      setIsEditing(false);
      loadAuditLogs(vehicle.id);
    }
  }, [vehicle, open]);

  const loadAuditLogs = async (vehicleId: string) => {
    setLoadingAudit(true);
    const { data } = await getAuditLog(vehicleId, 50);
    setAuditLogs(data || []);
    setLoadingAudit(false);
  };

  const handleSave = async () => {
    if (!vehicle || !onEdit) return;
    setIsSaving(true);
    await onEdit(vehicle.id, editData);
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(vehicle ?? {});
    setIsEditing(false);
  };

  if (!vehicle || !open) return null;

  const renderInfoValue = (field: typeof INFO_FIELDS[number]) => {
    const value = editData[field.key];
    const editable = canEditField(permissions, field.key as string);
    const readOnly = !isEditing || field.readonly || !editable;

    if (!isEditing || readOnly) {
      const display = value != null && value !== '' ? String(value) : '—';
      return (
        <p className="text-sm font-medium text-foreground truncate" title={display}>
          {display}
        </p>
      );
    }

    if (field.type === 'textarea') {
      return (
        <Textarea
          value={(value as string) || ''}
          onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
          className="h-16 text-sm"
        />
      );
    }
    return (
      <Input
        type={field.type === 'number' ? 'number' : 'text'}
        value={(value as string) || ''}
        onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
        className="h-7 text-sm"
      />
    );
  };

  const overallStatus = (vehicle.bg_to_delivery ?? 0) > 45 ? 'warning' : 'active';

  // Helper for section heading with accent bar
  const SectionHeading = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-4 rounded-full bg-primary shrink-0" />
      <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{children}</p>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setIsEditing(false);
          setShowAudit(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-5xl w-full max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Vehicle details for {vehicle.chassis_no}</DialogTitle>
        <DialogDescription className="sr-only">
          Review milestone history, audit activity, and editable vehicle fields.
        </DialogDescription>
        {/* ── Accent stripe ── */}
        <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent shrink-0" />

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 pt-4 pb-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold tracking-tight text-foreground">{vehicle.chassis_no}</h2>
              <StatusBadge status={overallStatus} />
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {vehicle.model && (
                <Badge variant="secondary" className="text-xs font-medium">{vehicle.model}</Badge>
              )}
              {vehicle.branch_code && (
                <Badge variant="outline" className="text-xs">{vehicle.branch_code}</Badge>
              )}
              {vehicle.payment_method && (
                <Badge variant="outline" className="text-xs text-muted-foreground">{vehicle.payment_method}</Badge>
              )}
              {vehicle.salesman_name && (
                <span className="text-xs text-muted-foreground">{vehicle.salesman_name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {showAudit ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAudit(false)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />Back
              </Button>
            ) : (
              <>
                {canEdit && permissions.canEdit && !isEditing && (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit2 className="h-3.5 w-3.5 mr-1.5" />Edit
                  </Button>
                )}
                {isEditing && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleCancel}>
                      <X className="h-3.5 w-3.5 mr-1" />Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      <Save className="h-3.5 w-3.5 mr-1" />{isSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowAudit(true)}>
                  <History className="h-3.5 w-3.5 mr-1" />
                  Audit
                  {auditLogs.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 leading-none">
                      {auditLogs.length}
                    </Badge>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── KPI summary strip (hidden in audit view) ── */}
        {!showAudit && (
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-muted/20 shrink-0">
            {([
              { label: 'BG → Delivery', value: vehicle.bg_to_delivery, sla: 45 },
              { label: 'BG → Disb', value: vehicle.bg_to_disb, sla: 60 },
              { label: 'Delivery → Disb', value: vehicle.delivery_to_disb, sla: 14 },
            ] as Array<{ label: string; value: number | null | undefined; sla: number }>).map(({ label, value, sla }) => {
              const over = value != null && value > sla;
              return (
                <div key={label} className="px-5 py-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                  <p
                    className={`text-2xl font-bold tabular-nums mt-1 leading-none ${
                      value == null ? 'text-muted-foreground/30' : over ? 'text-destructive' : 'text-foreground'
                    }`}
                  >
                    {value != null ? value : '—'}
                    {value != null && <span className="text-sm font-normal text-muted-foreground ml-1">d</span>}
                  </p>
                  <p className={`text-[10px] mt-1 ${over ? 'text-destructive/70 font-medium' : 'text-muted-foreground'}`}>
                    SLA {sla}d{over && value != null ? ` · ${value - sla}d over` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Audit view ── */}
        {showAudit ? (
          <ScrollArea className="flex-1">
            <div className="px-6 py-5">
              {loadingAudit ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No audit history available</p>
                  <p className="text-xs mt-1 opacity-60">Changes will appear here once edits are made</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <Card key={log.id} className="border border-border/60 shadow-sm">
                      <CardContent className="pt-3 px-4 pb-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-sm font-semibold text-foreground">
                              {log.profiles?.full_name || 'Unknown User'}
                            </span>
                            <Badge variant="outline" className="text-xs ml-2">
                              {log.profiles?.role || 'user'}
                            </Badge>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {formatDate(log.created_at)}
                            </p>
                          </div>
                          <Badge
                            variant={log.action === 'update' ? 'default' : 'secondary'}
                            className="text-xs uppercase tracking-wide"
                          >
                            {log.action}
                          </Badge>
                        </div>
                        {log.changes && Object.keys(log.changes).length > 0 && (
                          <AuditDiffTable
                            changes={log.changes as Record<string, { before: unknown; after: unknown }>}
                            className="mt-2"
                          />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          /* ── Main two-column body ── */
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-[1fr_280px] divide-x divide-border">

              {/* ── Left: info + KPI breakdown ── */}
              <div className="px-6 py-5 space-y-6">

                {/* Vehicle Information */}
                <div>
                  <SectionHeading>Vehicle Information</SectionHeading>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    {INFO_FIELDS.filter((f) => canViewField(permissions, f.key as string)).map((field) => (
                      <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                          {field.label}
                        </p>
                        {renderInfoValue(field)}
                      </div>
                    ))}
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                        D2D/Transfer
                      </p>
                      <p className="text-sm font-medium text-foreground">{vehicle.is_d2d ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                </div>

                {/* KPI Breakdown */}
                <div>
                  <SectionHeading>KPI Breakdown</SectionHeading>
                  <div className="space-y-3">
                    {KPI_DEFINITIONS.map((kpi) => {
                      const days = vehicle[kpi.computedField] as number | null | undefined;
                      const overSla = days != null && days > kpi.slaDefault;
                      const pct = days != null ? Math.min(Math.round((days / kpi.slaDefault) * 100), 100) : 0;
                      return (
                        <div key={kpi.id}>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-medium text-foreground/80">{kpi.shortLabel}</span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-bold tabular-nums ${
                                  days == null
                                    ? 'text-muted-foreground/40'
                                    : overSla
                                    ? 'text-destructive'
                                    : 'text-foreground'
                                }`}
                              >
                                {days != null ? `${days}d` : '—'}
                              </span>
                              <span className="text-muted-foreground/50 text-[10px]">/ {kpi.slaDefault}d</span>
                              {days != null && (
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    overSla
                                      ? 'bg-destructive/10 text-destructive'
                                      : 'bg-success/10 text-success'
                                  }`}
                                >
                                  {overSla ? `+${days - kpi.slaDefault}d` : 'OK'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${overSla ? 'bg-destructive' : 'bg-success'}`}
                              style={{ width: days != null ? `${pct}%` : '0%' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* ── Right: lifecycle timeline ── */}
              <div className="px-5 py-5">
                <SectionHeading>Milestone Timeline</SectionHeading>
                <div className="flex flex-col">
                  {LIFECYCLE_MILESTONES.map((milestone, idx) => {
                    const dateVal = vehicle[milestone.key] as string | null | undefined;
                    const isCompleted = !!dateVal;
                    const isLast = idx === LIFECYCLE_MILESTONES.length - 1;
                    const nextMilestone = !isLast ? LIFECYCLE_MILESTONES[idx + 1] : null;
                    const kpiDays = nextMilestone?.kpiField
                      ? (vehicle[nextMilestone.kpiField] as number | null | undefined)
                      : null;
                    const kpiSla = nextMilestone?.kpiField
                      ? (KPI_DEFINITIONS.find((k) => k.computedField === nextMilestone.kpiField)?.slaDefault ?? null)
                      : null;
                    const isOver = kpiDays != null && kpiSla != null && kpiDays > kpiSla;
                    const nextCompleted = nextMilestone ? !!vehicle[nextMilestone.key] : false;

                    return (
                      <div key={milestone.key} className="flex gap-3">
                        {/* Dot + connector */}
                        <div className="flex flex-col items-center w-7 shrink-0">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0 shadow-sm ${
                              isCompleted
                                ? 'bg-success/10 border-success text-success'
                                : 'bg-muted/60 border-border text-muted-foreground'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <Circle className="h-3.5 w-3.5" />
                            )}
                          </div>
                          {!isLast && (
                            <div className="flex flex-col items-center w-full flex-1 my-1">
                              <div
                                className={`w-0.5 flex-1 ${
                                  isOver
                                    ? 'bg-destructive/40'
                                    : nextCompleted
                                    ? 'bg-success/40'
                                    : 'bg-border'
                                }`}
                                style={{ minHeight: '14px' }}
                              />
                              {kpiDays != null && (
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums my-1 border ${
                                    isOver
                                      ? 'bg-destructive/10 text-destructive border-destructive/25'
                                      : 'bg-success/10 text-success border-success/25'
                                  }`}
                                >
                                  {kpiDays}d
                                </span>
                              )}
                              <div
                                className={`w-0.5 flex-1 ${
                                  isOver
                                    ? 'bg-destructive/40'
                                    : nextCompleted
                                    ? 'bg-success/40'
                                    : 'bg-border'
                                }`}
                                style={{ minHeight: '14px' }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Label + date */}
                        <div className={`min-w-0 pt-0.5 ${!isLast ? 'pb-1' : ''}`}>
                          <p
                            className={`text-sm font-semibold leading-tight ${
                              isCompleted ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {milestone.label}
                          </p>
                          <p
                            className={`text-xs leading-tight mt-0.5 ${
                              isCompleted
                                ? 'text-foreground/70 tabular-nums'
                                : 'text-muted-foreground/60 italic'
                            }`}
                          >
                            {isCompleted ? formatDate(dateVal) : 'Pending'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
