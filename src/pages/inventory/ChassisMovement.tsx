import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  findVehicleByChassis,
  fetchVehicleAuditPage,
  type AuditEventRecord,
} from '@/services/inventoryService';
import { useCompanyId } from '@/hooks/useCompanyId';
import { Search, ArrowRight, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';

const AUDIT_PAGE_SIZE = 50;

interface VehicleRow { id: string; chassisNo: string; model: string; branchCode: string; bgDate: string }
type AuditEvent = AuditEventRecord;

const ACTION_ICON: Record<string, React.FC<{ className?: string }>> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
};

const ACTION_COLOR: Record<string, string> = {
  create: 'text-emerald-600 dark:text-emerald-400',
  update: 'text-blue-600 dark:text-blue-400',
  delete: 'text-red-600 dark:text-red-400',
};

export default function ChassisMovement() {
  const { user: _user } = useAuth();
  const companyId = useCompanyId();

  const [query, setQuery] = useState('');
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentVehicleId, setCurrentVehicleId] = useState<string | null>(null);

  const totalAuditPages = Math.ceil(totalEvents / AUDIT_PAGE_SIZE) || 1;

  const loadAuditPage = async (vehicleId: string, p: number) => {
    const { events: pageEvents, total, error: logErr } = await fetchVehicleAuditPage(vehicleId, p, AUDIT_PAGE_SIZE);
    if (logErr) { setError(logErr.message); return; }
    setTotalEvents(total);
    setAuditPage(p);
    setEvents(pageEvents);
  };

  const handleSearch = async () => {
    const chassis = query.trim().toUpperCase();
    if (!chassis) return;
    setLoading(true);
    setError(null);
    setVehicle(null);
    setEvents([]);
    setSearched(true);

    // Find vehicle by chassis_no
    const { data: vData, error: vErr } = await findVehicleByChassis(chassis, companyId ?? '');

    if (vErr) { setError(vErr.message); setLoading(false); return; }
    if (!vData) { setLoading(false); return; }

    setVehicle(vData);
    setCurrentVehicleId(vData.id);

    // Fetch audit logs — page 0
    await loadAuditPage(vData.id, 0);
    setLoading(false);
  };

  const formatChanges = (changes: Record<string, unknown>): string => {
    try {
      const keys = Object.keys(changes).filter(k => k !== 'id' && k !== 'company_id');
      if (keys.length === 0) return 'No field changes recorded';
      return keys.map(k => {
        const v = changes[k] as { before?: unknown; after?: unknown };
        if (v && typeof v === 'object' && 'before' in v && 'after' in v) {
          return `${k.replace(/_/g, ' ')}: ${v.before ?? 'empty'} → ${v.after ?? 'empty'}`;
        }
        return `${k.replace(/_/g, ' ')}: ${JSON.stringify(changes[k])}`;
      }).join(' | ');
    } catch {
      return JSON.stringify(changes);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Chassis Movement Log"
        description="Full audit trail for any vehicle chassis number"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Inventory' }, { label: 'Chassis Movement' }]}
      />

      {/* Search bar */}
      <div className="glass-panel p-4">
        <div className="flex gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Enter chassis number…"
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button size="sm" onClick={handleSearch} disabled={loading}>
            {loading ? <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : 'Search'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Vehicle summary */}
      {vehicle && (
        <div className="glass-panel p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: getAutoAgingFieldLabel('chassis_no', 'CHASSIS NO.'), value: vehicle.chassisNo },
            { label: getAutoAgingFieldLabel('model', 'MODEL'), value: vehicle.model },
            { label: getAutoAgingFieldLabel('branch_code', 'BRCH K1'), value: vehicle.branchCode },
            { label: getAutoAgingFieldLabel('bg_date', 'BG DATE'), value: vehicle.bgDate },
          ].map(f => (
            <div key={f.label}>
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="font-semibold mt-0.5">{f.value}</p>
            </div>
          ))}
        </div>
      )}

      {searched && !vehicle && !loading && (
        <p className="text-sm text-muted-foreground">No vehicle found for chassis number <strong>{query}</strong>.</p>
      )}

      {/* Timeline */}
      {events.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {totalEvents.toLocaleString()} audit event{totalEvents !== 1 ? 's' : ''}
            </h3>
            {totalAuditPages > 1 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={auditPage === 0 || loading} onClick={() => currentVehicleId && loadAuditPage(currentVehicleId, auditPage - 1)}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="px-2">Page {auditPage + 1} of {totalAuditPages}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={auditPage >= totalAuditPages - 1 || loading} onClick={() => currentVehicleId && loadAuditPage(currentVehicleId, auditPage + 1)}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="relative pl-6 space-y-4">
            {/* Vertical line */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

            {events.map((ev, _idx) => {
              const Icon = ACTION_ICON[ev.action] ?? ArrowRight;
              const color = ACTION_COLOR[ev.action] ?? 'text-muted-foreground';
              return (
                <div key={ev.id} className="relative">
                  {/* Dot */}
                  <div className={`absolute -left-4 top-1 h-4 w-4 rounded-full border-2 border-background bg-current ${color}`} />
                  <div className="glass-panel p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <span className={`text-xs font-semibold capitalize ${color}`}>{ev.action}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{ev.entityType}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleString()}</span>
                    </div>
                    {ev.userName && (
                      <p className="text-xs text-muted-foreground">By: {ev.userName}</p>
                    )}
                    <p className="text-xs text-foreground/80 break-all">{formatChanges(ev.changes)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vehicle && events.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">No audit events found for this vehicle.</p>
      )}
    </div>
  );
}
