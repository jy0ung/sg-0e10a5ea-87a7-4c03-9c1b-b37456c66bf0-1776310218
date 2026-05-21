import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FilterBar } from '@/components/shared/FilterBar';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp, User, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listLeaveRequests, listEmployeeDirectory } from '@/services/hrmsService';
import type { Employee } from '@/types';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS_COLORS: Record<string, string> = {
  approved:  'bg-green-500',
  pending:   'bg-yellow-400',
  rejected:  'bg-red-400',
  cancelled: 'bg-gray-300',
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function LeaveCalendar() {
  const { user } = useAuth();

  const now   = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [empFilter, setEmpFilter] = useState<string>('all');

  const dateFrom = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
  const dateTo   = new Date(viewYear, viewMonth + 1, 0).toISOString().slice(0, 10);

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-directory', user?.companyId],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const res = await listEmployeeDirectory(user.companyId);
      return res.error ? [] : res.data;
    },
    enabled: !!user?.companyId,
    staleTime: 5 * 60_000,
  });

  const { data: requests = [], isLoading: loading } = useQuery({
    queryKey: ['leave-calendar', user?.companyId, viewYear, viewMonth],
    queryFn: async () => {
      if (!user?.companyId) return [];
      const res = await listLeaveRequests(user.companyId, { status: 'approved', dateFrom, dateTo });
      return res.data;
    },
    enabled: !!user?.companyId,
    staleTime: 30_000,
  });

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstDow  = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun

  // Build lookup: date → list of employee names on leave
  const leaveMap = new Map<string, { name: string; status: string }[]>();
  for (const req of requests) {
    if (empFilter !== 'all' && req.employeeId !== empFilter) continue;
    const start = new Date(req.startDate);
    const end   = new Date(req.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      if (!leaveMap.has(key)) leaveMap.set(key, []);
      leaveMap.get(key)!.push({ name: req.employeeName ?? 'Employee', status: req.status });
    }
  }

  // Derived stats
  const today = now.toISOString().slice(0, 10);
  const uniqueOnLeave = new Set(
    requests
      .filter(r => empFilter === 'all' || r.employeeId === empFilter)
      .map(r => r.employeeId)
  ).size;
  const totalLeaveDays = Array.from(leaveMap.values()).reduce((sum, v) => sum + v.length, 0);
  const todayCount = leaveMap.get(today)?.length ?? 0;
  let peakDay = 0;
  leaveMap.forEach(v => { if (v.length > peakDay) peakDay = v.length; });

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Leave Calendar"
        description={`Team leave overview for ${MONTHS[viewMonth]} ${viewYear}`}
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Leave Calendar' }]}
      />

      {/* Stats strip */}
      {!loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Employees on Leave', value: uniqueOnLeave, helper: `This month`, icon: Users, bg: 'bg-blue-100 dark:bg-blue-900/30', fg: 'text-blue-600 dark:text-blue-400' },
            { label: 'Total Leave-Days', value: totalLeaveDays, helper: 'Across all leave requests', icon: CalendarDays, bg: 'bg-indigo-100 dark:bg-indigo-900/30', fg: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'On Leave Today', value: todayCount, helper: todayCount > 0 ? 'Currently absent' : 'Full team in', icon: User, bg: todayCount > 0 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-muted', fg: todayCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground' },
            { label: 'Peak Day', value: peakDay, helper: 'Max concurrent leave', icon: TrendingUp, bg: peakDay >= 3 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-muted', fg: peakDay >= 3 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground' },
          ].map(({ label, value, helper, icon: Icon, bg, fg }) => (
            <Card key={label} className="overflow-hidden shadow-sm">
              <div className="flex items-start gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                  <Icon className={`h-5 w-5 ${fg}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${fg}`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{helper}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Controls */}
      <FilterBar title="Calendar controls" description="Switch month and focus the team view" countLabel={`${requests.length} approved requests`}>
        <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="w-40 text-center text-sm font-semibold tabular-nums">{MONTHS[viewMonth]} {viewYear}</span>
          <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="All employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        </div>
      </FilterBar>

      {loading ? (
        <PageSpinner />
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="p-3 sm:p-4">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 mb-1">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{d}</div>
              ))}
            </div>
            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
              {cells.map((day, i) => {
                const key   = day ? isoDate(viewYear, viewMonth, day) : null;
                const items = key ? (leaveMap.get(key) ?? []) : [];
                const isToday = key === now.toISOString().slice(0, 10);
                return (
                  <div
                    key={i}
                    className={`min-h-[82px] bg-background p-1.5 ${!day ? 'opacity-30' : ''} ${isToday ? 'ring-2 ring-primary ring-inset' : ''}`}
                  >
                    {day && (
                      <>
                        <span className={`text-xs font-semibold tabular-nums ${isToday ? 'text-primary' : 'text-foreground'}`}>{day}</span>
                        <div className="mt-1 space-y-0.5">
                          {items.slice(0, 3).map((item, j) => (
                            <div key={j} className={`text-xs leading-tight px-1 py-0.5 rounded text-white truncate ${STATUS_COLORS[item.status] ?? 'bg-blue-400'}`}>
                              {item.name.split(' ')[0]}
                            </div>
                          ))}
                          {items.length > 3 && (
                            <Badge variant="outline" className="text-xs px-1 py-0">+{items.length - 3} more</Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
