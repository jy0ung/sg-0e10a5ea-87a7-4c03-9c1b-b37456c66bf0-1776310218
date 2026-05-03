import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function SLAAdmin() {
  const { slas, updateSla } = useData();
  const { toast } = useToast();
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const handleSave = async (id: string) => {
    const value = edits[id];
    if (value === undefined || value < 1) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      await updateSla(id, value);
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      toast({ title: 'SLA updated', description: 'Policy saved successfully.', variant: 'default' });
    } catch {
      toast({ title: 'Save failed', description: 'Unable to update SLA policy. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="SLA Policies"
        description="Configure target days for each KPI milestone pair"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'SLA Policies' }]}
      />

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-left">
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">KPI</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Current SLA (days)</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">New Value</th>
              <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {slas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No SLA policies configured. Contact your administrator.
                </td>
              </tr>
            ) : (
              slas.map(sla => {
                const editVal = edits[sla.id];
                const isDirty = editVal !== undefined && editVal !== sla.slaDays;
                const isInvalid = isDirty && editVal < 1;
                const isSaving = saving[sla.id] ?? false;
                return (
                  <tr key={sla.id} className="data-table-row">
                    <td className="px-4 py-3 text-foreground font-medium">{sla.label}</td>
                    <td className="px-4 py-3 text-foreground tabular-nums">{sla.slaDays} days</td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={1}
                        className={`w-24 h-8 bg-secondary text-sm ${isInvalid ? 'border-destructive ring-destructive/30' : ''}`}
                        value={editVal ?? sla.slaDays}
                        onChange={e => {
                          const parsed = parseInt(e.target.value, 10);
                          setEdits(prev => ({ ...prev, [sla.id]: isNaN(parsed) ? 0 : parsed }));
                        }}
                        disabled={isSaving}
                      />
                      {isInvalid && <p className="text-xs text-destructive mt-1">Minimum 1 day</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleSave(sla.id)}
                        disabled={!isDirty || isInvalid || isSaving}
                      >
                        {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
