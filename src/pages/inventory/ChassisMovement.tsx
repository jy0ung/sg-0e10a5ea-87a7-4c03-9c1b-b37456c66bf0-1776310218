import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Search, ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react';

interface VehicleRow { id: string; chassisNo: string; model: string; branchCode: string; bgDate: string }
interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  changes: Record<string, unknown>;
  createdAt: string;
  userName?: string;
}

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
  const { user } = useAuth();
  const companyId = user?.company_id ?? 'c1';

  const [query, setQuery] = useState('');
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    const chassis = query.trim().toUpperCase();
    if (!chassis) return;
    setLoading(true);
    setError(null);
    setVehicle(null);
    setEvents([]);
    setSearched(true);

    // Find vehicle by chassis_no
    const { data: vData, error: vErr } = await supabase
      .from('vehicles')
      .select('id, chassis_no, model, branch_code, bg_date')
      .ilike('chassis_no', chassis)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();

    if (vErr) { setError(vErr.message); setLoading(false); return; }
    if (!vData) { setLoading(false); return; }

    const v = vData as Record<string, unknown>;
    setVehicle({ id: v.id as string, chassisNo: v.chassis_no as string, model: v.model as string, branchCode: v.branch_code as string, bgDate: v.bg_date as string });

    // Fetch audit logs for this vehicle
    const { data: logData, error: logErr } = await supabase
      .from('audit_logs')
      .select('id, action, entity_type, changes, created_at, profiles(full_name, email)')
      .eq('entity_id', v.id as string)
      .order('created_at', { ascending: true })
      .limit(200);

    if (logErr) { setError(logErr.message); setLoading(false); return; }

    setEvents(
      ((logData ?? []) as Record<string, unknown>[]).map(r => {
        const profile = r.profiles as Record<string, unknown> | null;
        return {
          id: r.id as string,
          action: r.action as string,
          entityType: r.entity_type as string,
          changes: r.changes as Record<string, unknown>,
          createdAt: r.created_at as string,
          userName: (profile?.full_name ?? profile?.email ?? 'System') as string,
        };
      })
    );
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
            { label: 'Chassis No', value: vehicle.chassisNo },
            { label: 'Model', value: vehicle.model },
            { label: 'Branch', value: vehicle.branchCode },
            { label: 'BG Date', value: vehicle.bgDate },
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
          <h3 className="text-sm font-medium text-muted-foreground">{events.length} audit event{events.length !== 1 ? 's' : ''}</h3>
          <div className="relative pl-6 space-y-4">
            {/* Vertical line */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

            {events.map((ev, idx) => {
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
