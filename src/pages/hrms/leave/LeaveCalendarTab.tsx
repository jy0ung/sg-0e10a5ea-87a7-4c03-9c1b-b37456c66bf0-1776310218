import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { listLeaveRequests, listEmployeeDirectory } from '@/services/hrmsService';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { LeaveRequest, Employee } from '@/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_BG: Record<string, string> = {
  approved:  'bg-emerald-500',
  pending:   'bg-amber-400',
  rejected:  'bg-red-400',
  cancelled: 'bg-gray-300 dark:bg-gray-600',
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function LeaveCalendarTab() {
  const { user } = useAuth();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [empFilter, setEmpFilter] = useState<string>('all');

  useEffect(() => {
    if (!user?.companyId) return;
    listEmployeeDirectory(user.companyId).then(res => {
      if (!res.error) setEmployees(res.data);
    });
  }, [user?.companyId]);

  const loadRequests = useCallback(async () => {
    if (!user?.companyId) return;
    setLoading(true);
    const dateFrom = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const dateTo = new Date(viewYear, viewMonth + 1, 0).toISOString().slice(0, 10);
    const reqRes = await listLeaveRequests(user.companyId, { status: 'approved', dateFrom, dateTo });
    setRequests(reqRes.data);
    setLoading(false);
  }, [user?.companyId, viewYear, viewMonth]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();

  const leaveMap = useMemo(() => {
    const map = new Map<string, { name: string; status: string }[]>();
    for (const req of requests) {
      if (empFilter !== 'all' && req.employeeId !== empFilter) continue;
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ name: req.employeeName ?? 'Employee', status: req.status });
      }
    }
    return map;
  }, [requests, empFilter]);

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
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold w-36 text-center">{MONTHS[viewMonth]} {viewYear}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="All employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-border/40">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-2 bg-muted/30">
                {d}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-border/40">
            {cells.map((day, i) => {
              const key = day ? isoDate(viewYear, viewMonth, day) : null;
              const items = key ? (leaveMap.get(key) ?? []) : [];
              const isToday = key === todayStr;
              return (
                <div
                  key={i}
                  className={`min-h-[72px] p-1.5 bg-background ${!day ? 'bg-muted/10' : ''} ${isToday ? 'ring-1 ring-primary ring-inset' : ''}`}
                >
                  {day && (
                    <>
                      <span className={`text-[11px] font-medium ${isToday ? 'text-primary font-bold' : 'text-foreground/80'}`}>
                        {day}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {items.slice(0, 3).map((item, j) => (
                          <div
                            key={j}
                            className={`text-[9px] leading-tight px-1 py-px rounded text-white truncate ${STATUS_BG[item.status] ?? 'bg-blue-400'}`}
                          >
                            {item.name.split(' ')[0]}
                          </div>
                        ))}
                        {items.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{items.length - 3} more</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Approved</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Pending</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Rejected</span>
      </div>
    </div>
  );
}
