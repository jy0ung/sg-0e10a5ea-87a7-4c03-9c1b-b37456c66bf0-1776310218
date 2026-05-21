import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { LeaveType, LeaveBalance } from '@/types';
import type { LeaveApprovalPreview } from '@/services/hrmsService';
import { LeaveBalanceCards } from './LeaveBalanceCards';

interface ContextPanelProps {
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  approvalPreview: LeaveApprovalPreview | null;
  isLoading: boolean;
  onApplyLeave: () => void;
}

export function ContextPanel({
  leaveTypes,
  leaveBalances,
  approvalPreview,
  isLoading,
  onApplyLeave,
}: ContextPanelProps) {
  const leaveYear = new Date().getFullYear();
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <aside className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm">
      {/* Apply for leave CTA */}
      <Button className="w-full gap-2 shadow-sm transition-shadow hover:shadow-md" onClick={onApplyLeave}>
        <Plus className="h-4 w-4" />
        Apply for Leave
      </Button>

      <Separator />

      {/* Leave balances */}
      <section className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Balances \u2014 {leaveYear}
        </p>
        <LeaveBalanceCards
          leaveTypes={leaveTypes}
          leaveBalances={leaveBalances}
          leaveYear={leaveYear}
          isLoading={isLoading}
          showUninitializedAlert
        />
      </section>

      {/* Approval flow */}
      {approvalPreview && !isLoading && (
        <>
          <Separator />
          <section className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Approval Flow
            </p>
            <ol className="flex flex-wrap items-center gap-1">
              {approvalPreview.fullFlow.map((step, i) => (
                <li key={step} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className="text-muted-foreground/50">\u2192</span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      i === 0
                        ? 'bg-primary/10 font-semibold text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <Separator />

      {/* Status legend — collapsible */}
      <section>
        <button
          type="button"
          className="flex w-full items-center justify-between"
          onClick={() => setLegendOpen(p => !p)}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Status Guide
          </p>
          {legendOpen ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {legendOpen && (
          <div className="mt-2 space-y-1.5 text-xs">
            {[
              { label: 'Pending Approval', color: 'bg-amber-400', desc: 'Waiting for review' },
              { label: 'Approved', color: 'bg-emerald-500', desc: 'All steps passed' },
              { label: 'Rejected', color: 'bg-red-500', desc: 'Declined at a step' },
              { label: 'Cancelled', color: 'bg-gray-400', desc: 'Withdrawn' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.color}`} />
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground/60">\u2014 {s.desc}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
