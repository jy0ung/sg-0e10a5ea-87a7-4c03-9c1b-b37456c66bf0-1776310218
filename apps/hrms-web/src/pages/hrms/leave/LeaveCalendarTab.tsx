import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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

export function LeaveCalendarTab() {
  const { user } = useAuth();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [empFilter, setEmpFilter] = useState<string>('all');

  const dateFrom = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
  const dateTo   = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInMonth(viewYear, viewMonth)).padStart(2, '0')}`;

  const { data: leaveRequests = [] } = useQuery({
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

  const { data: employees = [] } = useQuery({
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
  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
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
          <SelectTrigger className="h-8 w-48 text-xs">
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
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <span key={status} className="flex items-center gap-1 capitalize">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
              {status}
            </span>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-auto rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/30 text-center">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="py-2 text-xs font-medium text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[80px] border-b border-r bg-muted/10 p-1" />
          ))}
          {Array.from({ length: numDays }).map((_, i) => {
            const day = i + 1;
            const dateStr = isoDate(viewYear, viewMonth, day);
            const dayLeave = filtered.filter(r => r.startDate <= dateStr && r.endDate >= dateStr);
            const isToday = dateStr === new Date().toISOString().slice(0, 10);
            return (
              <div key={dateStr} className={['min-h-[80px] border-b border-r p-1', isToday ? 'bg-primary/5' : ''].join(' ')}>
                <p className={`mb-0.5 text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day}</p>
                <div className="space-y-0.5">
                  {dayLeave.slice(0, 3).map(r => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-xs text-white ${STATUS_COLORS[r.status] ?? 'bg-gray-400'}`}
                      title={`${r.employeeName ?? ''} — ${r.leaveTypeName ?? ''}`}
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
      </div>

      {/* Legend summary */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {filtered.length === 0 ? (
          <span>No leave requests for this period.</span>
        ) : (
          <span>{filtered.length} leave record{filtered.length !== 1 ? 's' : ''} this month</span>
        )}
      </div>
    </div>
  );
}
