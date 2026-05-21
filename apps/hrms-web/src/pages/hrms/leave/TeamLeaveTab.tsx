import React, { useState } from 'react';
import { Clock, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LeaveRequest, LeaveStatus } from '@/types';
import { formatDays, fmtDateRange } from './utils';
import { SectionHeading, EmptyState, LoadingSkeleton, StatusBadge } from './shared';
import { LeaveRequestDrawer } from './LeaveRequestDrawer';
import { ReviewDialog } from './ReviewDialog';
import { isRequestAssignedToApprover, type LeaveApproverIdentity } from '../LeaveManagement';

interface TeamLeaveTabProps {
  requests: LeaveRequest[];
  selfServiceEmployeeId: string | undefined;
  approverIdentity: LeaveApproverIdentity;
  canApproveRequests: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}

export function TeamLeaveTab({
  requests,
  selfServiceEmployeeId,
  approverIdentity,
  canApproveRequests,
  isLoading,
  onRefresh,
}: TeamLeaveTabProps) {
  const [filterStatus, setFilterStatus] = useState<LeaveStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'my_queue'>('all');
  const [drawerRequest, setDrawerRequest] = useState<LeaveRequest | null>(null);
  const [reviewRequest, setReviewRequest] = useState<LeaveRequest | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  function canReview(req: LeaveRequest): boolean {
    return isRequestAssignedToApprover(req, approverIdentity, canApproveRequests);
  }

  const myQueueCount = requests.filter(r => canReview(r)).length;

  const filteredRequests = requests.filter(r => {
    if (viewMode === 'my_queue' && !canReview(r)) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(r.employeeName ?? '').toLowerCase().includes(q) && !(r.leaveTypeName ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const upcomingTeam = requests.filter(
    r => r.status === 'approved' && r.startDate > today && r.employeeId !== selfServiceEmployeeId,
  );

  const onLeaveToday = requests.filter(
    r => r.status === 'approved' && r.startDate <= today && r.endDate >= today && r.employeeId !== selfServiceEmployeeId,
  );

  return (
    <div className="space-y-5">
      {/* On leave today */}
      {(isLoading || onLeaveToday.length > 0) && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-violet-500" />
            <SectionHeading
              title="On Leave Today"
              count={onLeaveToday.length}
              colorClass="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
            />
          </div>
          {isLoading ? <LoadingSkeleton rows={1} /> : (
            <div className="flex flex-wrap gap-2">
              {onLeaveToday.map(req => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => setDrawerRequest(req)}
                  className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs transition-shadow hover:shadow"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xs font-semibold dark:bg-violet-900/40 dark:text-violet-300">
                    {(req.employeeName ?? '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="font-medium">{req.employeeName ?? 'Unknown'}</span>
                  <span className="text-muted-foreground">{req.leaveTypeName ?? 'Leave'}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Upcoming team */}
      <section className="space-y-2">
        <SectionHeading
          title="Upcoming Team Leave"
          count={upcomingTeam.length}
          colorClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        {isLoading ? <LoadingSkeleton rows={2} /> : upcomingTeam.length === 0 ? (
          <EmptyState title="No upcoming team leave scheduled." />
        ) : (
          <div className="space-y-1.5">
            {upcomingTeam.slice(0, 5).map(req => (
              <button
                key={req.id}
                type="button"
                className="w-full text-left"
                onClick={() => setDrawerRequest(req)}
              >
                <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-shadow hover:shadow">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{req.employeeName ?? 'Unknown'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{req.leaveTypeName ?? 'Leave'} · {formatDays(req.days)} day{req.days !== 1 ? 's' : ''}</span>
                    <p className="text-xs text-muted-foreground">{fmtDateRange(req.startDate, req.endDate)}</p>
                  </div>
                </div>
              </button>
            ))}
            {upcomingTeam.length > 5 && (
              <p className="text-xs text-muted-foreground">+{upcomingTeam.length - 5} more in filters below</p>
            )}
          </div>
        )}
      </section>

      {/* All records with filters */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
          {canApproveRequests && (
            <Button
              variant={viewMode === 'my_queue' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode(p => p === 'my_queue' ? 'all' : 'my_queue')}
              className={viewMode !== 'my_queue' ? 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400' : ''}
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              My Queue ({myQueueCount})
            </Button>
          )}
          {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(s => (
            <Button key={s} variant={filterStatus === s ? 'default' : 'outline'} size="sm"
              onClick={() => setFilterStatus(s)} className="capitalize">
              {s === 'all' ? 'All' : s}
            </Button>
          ))}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-40 pl-8"
            />
          </div>
          <span className="ml-1 text-xs tabular-nums text-muted-foreground">
            {filteredRequests.length} result{filteredRequests.length !== 1 ? 's' : ''}
          </span>
        </div>

        <SectionHeading title="All Team Records" count={filteredRequests.length} />
        {isLoading ? <LoadingSkeleton rows={4} /> : filteredRequests.length === 0 ? (
          <EmptyState title={viewMode === 'my_queue' ? 'No requests in your queue.' : 'No records match the filters.'} />
        ) : (
          <div className="space-y-1.5">
            {filteredRequests.map(req => {
              const needsReview = canApproveRequests && canReview(req);
              return (
                <button
                  key={req.id}
                  type="button"
                  className="w-full text-left"
                  onClick={() => setDrawerRequest(req)}
                >
                  <div className={[
                    'flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-shadow hover:shadow',
                    needsReview ? 'border-amber-200 dark:border-amber-800' : '',
                  ].join(' ')}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold">{req.employeeName ?? 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground">{req.leaveTypeName ?? 'Leave'}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">· {formatDays(req.days)} day{req.days !== 1 ? 's' : ''}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{fmtDateRange(req.startDate, req.endDate)}</p>
                    </div>
                    <StatusBadge req={req} />
                    {needsReview && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 border-amber-300 px-2 text-xs text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
                        onClick={e => { e.stopPropagation(); setReviewRequest(req); }}
                      >
                        Review
                      </Button>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <LeaveRequestDrawer
        request={drawerRequest}
        open={!!drawerRequest}
        onClose={() => setDrawerRequest(null)}
        canReview={drawerRequest ? canApproveRequests && canReview(drawerRequest) : false}
        onReview={req => { setDrawerRequest(null); setReviewRequest(req); }}
      />
      <ReviewDialog
        request={reviewRequest}
        open={!!reviewRequest}
        onClose={() => setReviewRequest(null)}
        onSuccess={() => { onRefresh(); setReviewRequest(null); }}
      />
    </div>
  );
}
