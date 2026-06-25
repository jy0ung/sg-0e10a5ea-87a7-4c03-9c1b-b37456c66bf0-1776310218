import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { ScrollableRegion } from '@/components/shared/ScrollableRegion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { addLeadFollowup, getLeadDetail } from '@/services/leadIntakeService';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { PageErrorState } from '@/components/shared/PageState';
import { FeatureUnavailableState } from '@/components/shared/FeatureUnavailableState';
import { ArrowLeft, Loader2, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadFollowupOutcome, LeadSourceKind } from '@/types';

const OUTCOMES: { value: LeadFollowupOutcome; label: string }[] = [
  { value: 'contacted',          label: 'Contacted' },
  { value: 'no_answer',          label: 'No answer' },
  { value: 'callback_scheduled', label: 'Callback scheduled' },
  { value: 'not_interested',     label: 'Not interested' },
  { value: 'qualified',          label: 'Qualified' },
  { value: 'converted',          label: 'Converted' },
  { value: 'lost',               label: 'Lost' },
];

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function LeadIntakeDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { kind = 'lead', rawId = '' } = useParams<{ kind: LeadSourceKind; rawId: string }>();
  const companyId = useCompanyId();
  const canUseLeads = useFeatureFlag('phase3f.lead-intake-v2', false);

  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<LeadFollowupOutcome | ''>('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [saving, setSaving] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['lead_detail', companyId, kind, rawId],
    queryFn: async () => {
      const r = await getLeadDetail(companyId, kind as LeadSourceKind, rawId);
      if (r.error) throw r.error;
      return r.data;
    },
    enabled: !!companyId && !!rawId && canUseLeads,
    staleTime: 10_000,
  });

  async function handleAdd() {
    if (!notes.trim()) {
      toast.error('Notes are required');
      return;
    }
    setSaving(true);
    const result = await addLeadFollowup(companyId, kind as LeadSourceKind, rawId, notes.trim(), {
      outcome:        outcome || undefined,
      nextActionDate: nextActionDate || undefined,
    });
    setSaving(false);
    if (result.error) {
      toast.error('Failed to save follow-up', { description: result.error.message });
      return;
    }
    toast.success('Follow-up recorded');
    setNotes('');
    setOutcome('');
    setNextActionDate('');
    void queryClient.invalidateQueries({ queryKey: ['lead_detail', companyId, kind, rawId] });
    void queryClient.invalidateQueries({ queryKey: ['leads_feed', companyId] });
  }

  if (!canUseLeads) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Lead Detail"
          description="DMS lead/prospect detail and follow-up timeline"
          breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Sales' }, { label: 'Lead Intake' }, { label: 'Detail' }]}
        />
        <FeatureUnavailableState routeId="sales-lead-detail" />
      </div>
    );
  }

  if (detailQuery.isLoading) return <TableSkeleton />;
  if (detailQuery.isError)   return <PageErrorState error={detailQuery.error} />;
  const detail = detailQuery.data;
  if (!detail) return (
    <div className="glass-panel py-16 text-center text-sm text-muted-foreground">
      Lead not found, or no longer in the staged feed.
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`${detail.sourceKind === 'lead' ? 'Lead' : 'Prospect'} ${detail.dmsExternalId ?? rawId.slice(0, 8)}`}
        description={`${detail.branchCode ?? '—'} · ${detail.salespersonCode ?? '—'} · status: ${detail.status ?? '—'}`}
        breadcrumbs={[
          { label: 'FLC BI', path: '/' },
          { label: 'Sales' },
          { label: 'Lead Intake', path: '/sales/lead-intake' },
          { label: detail.dmsExternalId ?? 'Detail' },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/sales/lead-intake')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(`/sales/deals/new?dmsCustomerId=${encodeURIComponent(detail.dmsCustomerId ?? '')}`)}
              data-testid="convert-to-so"
            >
              <ShoppingCart className="h-3.5 w-3.5 mr-1" />Convert to Sales Order
            </Button>
          </div>
        }
      />

      {/* Metadata */}
      <div className="glass-panel p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">DMS Customer ID</p>
          <p className="mt-1 text-sm font-mono">{detail.dmsCustomerId ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Source Created</p>
          <p className="mt-1 text-sm">{fmtDateTime(detail.sourceCreatedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Last Fetched</p>
          <p className="mt-1 text-sm">{fmtDateTime(detail.fetchedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Follow-ups</p>
          <p className="mt-1 text-sm font-semibold tabular-nums" data-testid="followup-count">{detail.followups.length}</p>
        </div>
      </div>

      {/* New follow-up form */}
      <div className="glass-panel p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add follow-up</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What was discussed?"
              rows={3}
              data-testid="followup-notes"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Outcome (optional)</Label>
            <Select value={outcome} onValueChange={v => setOutcome(v as LeadFollowupOutcome | '')}>
              <SelectTrigger className="h-9"><SelectValue placeholder="No outcome set" /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Next action date (optional)</Label>
            <Input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} className="h-9" />
          </div>
        </div>
        <Button onClick={() => void handleAdd()} disabled={saving} data-testid="save-followup">
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Add follow-up
        </Button>
      </div>

      {/* Follow-up timeline */}
      <ScrollableRegion label="Follow-up timeline">
        <h3 className="mb-3 text-sm font-semibold">Timeline</h3>
        {detail.followups.length === 0 ? (
          <div className="glass-panel py-10 text-center text-sm text-muted-foreground">
            No follow-ups yet.
          </div>
        ) : (
          <ol className="space-y-3">
            {detail.followups.map(f => (
              <li key={f.id} className="glass-panel p-3" data-testid={`followup-${f.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm whitespace-pre-wrap">{f.notes}</p>
                    <div className="mt-2 flex flex-wrap gap-2 items-center text-xs">
                      {f.outcome && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {f.outcome.replace(/_/g, ' ')}
                        </span>
                      )}
                      {f.nextActionDate && (
                        <span className="text-muted-foreground">Next action: {f.nextActionDate}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDateTime(f.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </ScrollableRegion>
    </div>
  );
}
