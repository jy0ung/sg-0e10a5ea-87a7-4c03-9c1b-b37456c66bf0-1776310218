import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { listLeaveRequests, listEmployees } from '@/services/hrmsService';
import type { LeaveRequest, Employee } from '@/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  const { toast } = useToast();

  const now   = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests]   = useState<LeaveRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [empFilter, setEmpFilter] = useState<string>('all');

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    setLoading(true);
    const [empRes, reqRes] = await Promise.all([
      listEmployees(user.companyId),
      listLeaveRequests(user.companyId, { status: 'approved' }),
    ]);
    setEmployees(empRes.data);
    setRequests(reqRes.data);
    setLoading(false);
    if (reqRes.error) toast({ title: 'Error', description: reqRes.error, variant: 'destructive' });
  }, [user, toast]);

  useEffect(() => { load(); }, [load]);

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
    <div className="p-6 space-y-6">
      <PageHeader
        title="Leave Calendar"
        description="Visual overview of approved leave"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Leave Calendar' }]}
      />

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-medium w-40 text-center">{MONTHS[viewMonth]} {viewYear}</span>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="All employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-4">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 mb-1">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-px bg-border rounded overflow-hidden">
              {cells.map((day, i) => {
                const key   = day ? isoDate(viewYear, viewMonth, day) : null;
                const items = key ? (leaveMap.get(key) ?? []) : [];
                const isToday = key === now.toISOString().slice(0, 10);
                return (
                  <div
                    key={i}
                    className={`min-h-[80px] p-1.5 bg-background ${!day ? 'opacity-30' : ''} ${isToday ? 'ring-2 ring-primary ring-inset' : ''}`}
                  >
                    {day && (
                      <>
                        <span className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-foreground'}`}>{day}</span>
                        <div className="mt-1 space-y-0.5">
                          {items.slice(0, 3).map((item, j) => (
                            <div key={j} className={`text-[10px] leading-tight px-1 py-0.5 rounded text-white truncate ${STATUS_COLORS[item.status] ?? 'bg-blue-400'}`}>
                              {item.name.split(' ')[0]}
                            </div>
                          ))}
                          {items.length > 3 && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">+{items.length - 3} more</Badge>
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
