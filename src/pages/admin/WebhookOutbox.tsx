import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Plus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { EmptyState, PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import {
  listWebhookDeliveries,
  listWebhookEndpoints,
  requeueWebhookDelivery,
  upsertWebhookEndpoint,
  type WebhookDelivery,
  type WebhookEndpoint,
} from '@/services/webhookOutboxService';

const STATUS_LABEL: Record<WebhookDelivery['status'], string> = {
  pending:    'Pending',
  delivering: 'Delivering',
  delivered:  'Delivered',
  failed:     'Failed',
  dead:       'Dead',
};

const STATUS_CLASS: Record<WebhookDelivery['status'], string> = {
  pending:    'text-muted-foreground',
  delivering: 'text-blue-500',
  delivered:  'text-emerald-600',
  failed:     'text-amber-600',
  dead:       'text-destructive font-semibold',
};

interface EndpointForm {
  id:         string | null;
  name:       string;
  url:        string;
  secret:     string;
  eventTypes: string;     // comma-separated in the form; split on save
  active:     boolean;
}

const EMPTY_FORM: EndpointForm = {
  id: null, name: '', url: 'https://', secret: '', eventTypes: '', active: true,
};

export default function WebhookOutbox() {
  const queryClient = useQueryClient();
  const companyId   = useCompanyId();
  const canUseOutbox = useFeatureFlag('phase6.webhook-outbox', false);

  const [dialogOpen, setDialogOpen]   = useState(false);
  const [saving,     setSaving]       = useState(false);
  const [form,       setForm]         = useState<EndpointForm>(EMPTY_FORM);

  const endpointsQuery = useQuery({
    queryKey: ['webhook-endpoints', companyId],
    queryFn:  async () => {
      const r = await listWebhookEndpoints(companyId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled:    !!companyId && canUseOutbox,
    staleTime:  30_000,
  });

  const deliveriesQuery = useQuery({
    queryKey: ['webhook-deliveries', companyId],
    queryFn:  async () => {
      const r = await listWebhookDeliveries(companyId, 100);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled:    !!companyId && canUseOutbox,
    staleTime:  10_000,
    refetchInterval: 15_000,    // operator surface — show progress live
  });

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, secret: crypto.randomUUID().replace(/-/g, '') });
    setDialogOpen(true);
  };

  const openEdit = (ep: WebhookEndpoint) => {
    setForm({
      id:         ep.id,
      name:       ep.name,
      url:        ep.url,
      secret:     ep.secret,
      eventTypes: ep.eventTypes.join(', '),
      active:     ep.active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.url.trim() || !form.secret.trim()) {
      toast.error('Name, URL, and secret are required');
      return;
    }
    if (!form.url.startsWith('https://')) {
      toast.error('URL must use HTTPS');
      return;
    }
    setSaving(true);
    const result = await upsertWebhookEndpoint({
      id:         form.id,
      companyId,
      name:       form.name.trim(),
      url:        form.url.trim(),
      secret:     form.secret.trim(),
      eventTypes: form.eventTypes.split(',').map(s => s.trim()).filter(Boolean),
      active:     form.active,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(form.id ? 'Endpoint updated' : 'Endpoint created');
    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['webhook-endpoints', companyId] });
  };

  const handleRequeue = async (id: string) => {
    const r = await requeueWebhookDelivery(id);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success('Requeued for delivery');
    queryClient.invalidateQueries({ queryKey: ['webhook-deliveries', companyId] });
  };

  const endpointColumns: StandardTableColumn<WebhookEndpoint>[] = useMemo(() => [
    { key: 'name',        label: 'Name' },
    { key: 'url',         label: 'URL',
      render: ep => <span className="font-mono text-xs break-all">{ep.url}</span> },
    { key: 'eventTypes',  label: 'Events',
      render: ep => ep.eventTypes.length === 0
        ? <span className="text-xs text-muted-foreground italic">all</span>
        : <span className="text-xs">{ep.eventTypes.join(', ')}</span> },
    { key: 'active',      label: 'Active',
      render: ep => ep.active
        ? <span className="text-emerald-600 text-xs font-medium">Active</span>
        : <span className="text-muted-foreground text-xs">Inactive</span>,
    },
    { key: 'consecutiveFailures', label: 'Recent failures',
      render: ep => ep.consecutiveFailures > 0
        ? <span className="text-amber-600 text-xs font-medium">{ep.consecutiveFailures}</span>
        : <span className="text-muted-foreground text-xs">0</span>,
    },
    { key: 'actions', label: '', sortable: false,
      render: ep => (
        <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openEdit(ep); }}>
          Edit
        </Button>
      ),
    },
  ], []);

  const deliveryColumns: StandardTableColumn<WebhookDelivery>[] = useMemo(() => [
    { key: 'createdAt', label: 'Created',
      render: d => <span className="text-xs">{new Date(d.createdAt).toLocaleString()}</span> },
    { key: 'eventType', label: 'Event',
      render: d => <span className="font-mono text-xs">{d.eventType}</span> },
    { key: 'status', label: 'Status',
      render: d => <span className={STATUS_CLASS[d.status]}>{STATUS_LABEL[d.status]}</span> },
    { key: 'attempts',           label: 'Attempts' },
    { key: 'lastResponseStatus', label: 'HTTP',
      render: d => d.lastResponseStatus == null ? '—' : <code className="text-xs">{d.lastResponseStatus}</code> },
    { key: 'lastError', label: 'Last error',
      render: d => d.lastError
        ? <span className="text-xs text-destructive break-words">{d.lastError}</span>
        : <span className="text-xs text-muted-foreground">—</span> },
    { key: 'actions', label: '', sortable: false,
      render: d => (d.status === 'failed' || d.status === 'dead') ? (
        <Button variant="ghost" size="sm" onClick={() => handleRequeue(d.id)}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Requeue
        </Button>
      ) : null,
    },
  ], []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!canUseOutbox) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Webhook Outbox"
          description="Durable event fan-out to external HTTPS consumers"
          breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Webhooks' }]}
        />
        <FeatureUnavailableState routeId="admin-webhooks" data-testid="webhook-outbox-feature-off" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Webhook Outbox"
        description="Durable event fan-out to external HTTPS consumers"
        breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Webhooks' }]}
      />

      {/* Endpoints */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Endpoints</h2>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Register endpoint
          </Button>
        </div>

        {endpointsQuery.isLoading ? (
          <TableSkeleton />
        ) : endpointsQuery.isError ? (
          <PageErrorState error={endpointsQuery.error} />
        ) : (endpointsQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No endpoints registered"
            description="Register an HTTPS URL to start receiving domain events. Each endpoint can subscribe to all events or a filtered list."
            icon={<KeyRound className="h-5 w-5" aria-hidden />}
          />
        ) : (
          <StandardTable
            data={endpointsQuery.data ?? []}
            columns={endpointColumns}
            rowKey="id"
            emptyMessage="No endpoints"
            hideSearch
          />
        )}
      </section>

      {/* Deliveries */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Recent deliveries</h2>
        {deliveriesQuery.isLoading ? (
          <TableSkeleton />
        ) : deliveriesQuery.isError ? (
          <PageErrorState error={deliveriesQuery.error} />
        ) : (deliveriesQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No deliveries yet"
            description="Once feature code emits an event, deliveries appear here with their HMAC-signed status and retry history."
          />
        ) : (
          <StandardTable
            data={deliveriesQuery.data ?? []}
            columns={deliveryColumns}
            rowKey="id"
            emptyMessage="No deliveries"
            searchPlaceholder="Search by event…"
            pageSizes={[25, 50, 100]}
          />
        )}
      </section>

      {/* Endpoint form */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit endpoint' : 'Register endpoint'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ep-name">Name</Label>
              <Input id="ep-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ep-url">URL (HTTPS only)</Label>
              <Input id="ep-url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ep-secret">HMAC secret</Label>
              <Input id="ep-secret" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} className="font-mono text-xs" />
              <p className="text-[10px] text-muted-foreground">
                Used to sign each delivery as <code>HMAC-SHA256(secret, "&lt;unix&gt;.&lt;body&gt;")</code>.
                Rotate by editing and re-saving.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ep-events">Event types (comma-separated; empty = all)</Label>
              <Input id="ep-events" value={form.eventTypes} onChange={e => setForm({ ...form, eventTypes: e.target.value })} placeholder="vehicle.transferred, sales_order.created" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ep-active" checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              <Label htmlFor="ep-active" className="text-sm">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {form.id ? 'Save changes' : 'Register endpoint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
