import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CalendarPlus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import LeaveBalanceCards from './LeaveBalanceCards';
import type { LeaveBalance, LeaveType } from '@/types';

interface ContextPanelProps {
  balances: LeaveBalance[];
  leaveTypes: LeaveType[];
  onApplyLeave: () => void;
  isManager: boolean;
}

export default function ContextPanel({
  balances,
  leaveTypes,
  onApplyLeave,
  isManager,
}: ContextPanelProps) {
  return (
    <div className="space-y-4">
      {/* Apply Button */}
      <Button
        onClick={onApplyLeave}
        className="w-full h-10 gap-2 shadow-sm"
      >
        <CalendarPlus className="h-4 w-4" />
        Apply for Leave
      </Button>

      {/* Leave Balances */}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Leave Balances
        </h4>
        <LeaveBalanceCards balances={balances} leaveTypes={leaveTypes} compact />
      </div>

      <Separator className="opacity-50" />

      {/* Policy Notices */}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Quick Reference
        </h4>
        <div className="space-y-1.5">
          <PolicyNotice>
            Annual leave requires 7 days advance notice
          </PolicyNotice>
          <PolicyNotice>
            Unpaid leave is subject to manager approval
          </PolicyNotice>
          <PolicyNotice>
            Medical leave requires supporting documentation
          </PolicyNotice>
          {isManager && (
            <PolicyNotice>
              Approving leave updates employee balance automatically
            </PolicyNotice>
          )}
        </div>
      </div>

      <Separator className="opacity-50" />

      {/* Status Legend */}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Status Guide
        </h4>
        <div className="space-y-1.5">
          <StatusLegend color="bg-amber-500" label="Pending" desc="Awaiting approval" />
          <StatusLegend color="bg-emerald-500" label="Approved" desc="Leave confirmed" />
          <StatusLegend color="bg-red-500" label="Rejected" desc="Request denied" />
          <StatusLegend color="bg-gray-400" label="Cancelled" desc="Withdrawn by employee" />
        </div>
      </div>
    </div>
  );
}

function PolicyNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[11px] text-muted-foreground/80">
      <Info className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/40" />
      <span>{children}</span>
    </div>
  );
}

function StatusLegend({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={cn('h-2 w-2 rounded-full shrink-0', color)} />
      <span className="font-medium text-foreground/80">{label}</span>
      <span className="text-muted-foreground/60">— {desc}</span>
    </div>
  );
}
