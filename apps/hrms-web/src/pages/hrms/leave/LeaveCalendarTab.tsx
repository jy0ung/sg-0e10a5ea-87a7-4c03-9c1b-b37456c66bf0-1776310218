import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, FilterX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { listEmployeeDirectory, listLeaveRequests } from '@/services/hrmsService';
import type { Employee } from '@/types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-500',
  pending: 'bg-yellow-400',
  rejected: 'bg-red-400',
  cancelled: 'bg-gray-400',
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function LeaveCalendarTab() {
  const { user } = useAuth();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [empFilter, setEmpFilter] = useState<string>('all');

  const dateFrom = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
  const dateTo = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(
    daysInMonth(viewYear, viewMonth),
  ).padStart(2, '0')}`;

  const { data: leaveRequests = [], isPending: isRequestsLoading } = useQuery({
    queryKey: ['leave-calendar-tab', user?.companyId, dateFrom, dateTo],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const { data } = await listLeaveRequests(user.companyId, {
        dateFrom,
        dateTo,
      });
      return data;
    },
    enabled: !!user?.companyId,
  });

  const { data: employees = [], isPending: isEmployeesLoading } = useQuery({
    queryKey: ['employees-for-leave-calendar', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const { data } = await listEmployeeDirectory(user.companyId);
      return (data ?? []) as Employee[];
    },
    enabled: !!user?.companyId,
  });

  const filtered = empFilter === 'all'
    ? leaveRequests
    : leaveRequests.filter(r => r.employeeId === empFilter);

  const numDays = daysInMonth(viewYear, viewMonth);
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();

  const statusCounts = useMemo(() => ({
    approved: filtered.filter(r => r.status === 'approved').length,
    pending: filtered.filter(r => r.status === 'pending').length,
    rejected: filtered.filter(r => r.status === 'rejected').length,
    cancelled: filtered.filter(r => r.status === 'cancelled').length,
  }), [filtered]);

  const activeDaysInMonth = useMemo(() => {
    const activeDays = new Set<string>();
    for (let day = 1; day <= numDays; day += 1) {
      const dateStr = isoDate(viewYear, viewMonth, day);
      if (filtered.some(r => r.startDate <= dateStr && r.endDate >= dateStr)) {
        activeDays.add(dateStr);
      }
    }
    return activeDays.size;
  }, [filtered, numDays, viewMonth, viewYear]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  }

  function jumpToToday() {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  const isLoading = isRequestsLoading || isEmployeesLoading;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Leave Calendar Planner</h3>
            <p className="text-xs text-muted-foreground">
              Visualize team coverage across the month and identify concentration days quickly.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={jumpToToday}>
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEmpFilter('all')}
              disabled={empFilter === 'all'}
            >
              <FilterX className="mr-1.5 h-3.5 w-3.5" />
              Clear filter
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Records this month</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{filtered.length}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Active leave days</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">{activeDaysInMonth}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pending requests</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{statusCounts.pending}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Approved requests</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{statusCounts.approved}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-36 text-center text-sm font-semibold">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="All employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name ?? e.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex flex-wrap gap-2 text-xs">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <span key={status} className="flex items-center gap-1 capitalize text-muted-foreground">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
                {status}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-auto rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b bg-muted/30 text-center">
          {WEEKDAYS.map(day => (
            <div key={day} className="py-2 text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>
        {isLoading ? (
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="min-h-[92px] animate-pulse border-b border-r bg-muted/20 p-1" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[92px] border-b border-r bg-muted/10 p-1" />
            ))}
            {Array.from({ length: numDays }).map((_, i) => {
              const day = i + 1;
              const dateStr = isoDate(viewYear, viewMonth, day);
              const dayLeave = filtered.filter(r => r.startDate <= dateStr && r.endDate >= dateStr);
              const isToday = dateStr === todayIso;

              return (
                <div
                  key={dateStr}
                  className={[
                    'min-h-[92px] border-b border-r p-1.5',
                    isToday ? 'bg-primary/5' : '',
                  ].join(' ')}
                >
                  <p
                    className={[
                      'mb-1 text-xs font-medium',
                      isToday ? 'text-primary' : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    {day}
                  </p>
                  <div className="space-y-1">
                    {dayLeave.slice(0, 3).map(r => (
                      <div
                        key={r.id}
                        className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-xs text-white ${STATUS_COLORS[r.status] ?? 'bg-gray-400'}`}
                        title={`${r.employeeName ?? ''} - ${r.leaveTypeName ?? ''}`}
                      >
                        <span className="truncate">{r.employeeName ?? r.leaveTypeName ?? 'Leave'}</span>
                      </div>
                    ))}
                    {dayLeave.length > 3 && (
                      <p className="text-xs text-muted-foreground">+{dayLeave.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2.5 text-xs text-muted-foreground shadow-sm">
        {filtered.length === 0 ? (
          <span>No leave requests for this period.</span>
        ) : (
          <span>{filtered.length} leave record{filtered.length !== 1 ? 's' : ''} in this view</span>
        )}
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {empFilter === 'all' ? 'Showing all employees' : 'Filtered to selected employee'}
        </span>
      </section>
    </div>
  );
}
