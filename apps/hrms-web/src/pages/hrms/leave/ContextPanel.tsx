import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  return (
    <aside className="flex flex-col gap-5">
      {/* Apply for leave */}
      <Button className="w-full gap-2" size="sm" onClick={onApplyLeave}>
        <Plus className="h-4 w-4" /> Apply for Leave
      </Button>

      {/* Leave balances */}
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Leave Balances — {leaveYear}
        </p>
        <LeaveBalanceCards
          leaveTypes={leaveTypes}
          leaveBalances={leaveBalances}
          leaveYear={leaveYear}
          isLoading={isLoading}
        />
      </section>

      {/* Approval guide */}
      {approvalPreview && !isLoading && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Approval Flow
          </p>
          <div className="rounded-lg border bg-blue-50/50 px-3 py-2 text-xs dark:bg-blue-950/20">
            <p className="font-medium">{approvalPreview.nextStepLabel ?? 'Direct review'}</p>
            {approvalPreview.fullFlow.length > 1 && (
              <p className="mt-1 text-muted-foreground">{approvalPreview.fullFlow.join(' → ')}</p>
            )}
          </div>
        </section>
      )}

      {/* Status legend */}
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Status Guide</p>
        <div className="space-y-1.5 text-xs">
          {[
            { label: 'Pending Approval', color: 'bg-amber-400', desc: 'Waiting for review' },
            { label: 'Approved', color: 'bg-emerald-500', desc: 'All steps passed' },
            { label: 'Rejected', color: 'bg-red-500', desc: 'Declined at a step' },
            { label: 'Cancelled', color: 'bg-gray-400', desc: 'Withdrawn by employee' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.color}`} />
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground">— {s.desc}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
