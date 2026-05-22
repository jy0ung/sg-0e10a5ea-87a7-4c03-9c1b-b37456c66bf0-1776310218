import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilterBar } from '@/components/shared/FilterBar';
import { PageHeader } from '@/components/shared/PageHeader';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { listAttendanceRecords, listEmployeeDirectory, upsertAttendance } from '@/services/hrmsService';
import type { AttendanceRecord, UpsertAttendanceInput, AttendanceStatus } from '@/types';
import { CalendarDays, Download, FilterX, Plus, Users } from 'lucide-react';
import { upsertAttendanceSchema } from '@/lib/validations';

type AttendanceRow = AttendanceRecord & Record<string, unknown>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceLog() {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const { toast } = useToast();
  const canAccessTeamAttendance = hrmsAccess.canAccessAttendance;
  const canManageAttendance = hrmsAccess.canManageAttendance;
  const selfServiceEmployeeId = user?.employeeId ?? user?.id;

  const queryClient = useQueryClient();

  const [dateFrom, setDateFrom]   = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo]       = useState(todayIso);
  const [empFilter, setEmpFilter] = useState<string>('all');
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<Partial<UpsertAttendanceInput>>({
    date: todayIso(), status: 'present',
  });

  const { data: records = [], isPending: loading } = useQuery({
    queryKey: ['attendance-records', user?.companyId, canAccessTeamAttendance ? empFilter : selfServiceEmployeeId, dateFrom, dateTo],
    queryFn: async () => {
      const attRes = await listAttendanceRecords(user!.companyId, {
        employeeId: !canAccessTeamAttendance ? selfServiceEmployeeId : (empFilter === 'all' ? undefined : empFilter),
        dateFrom,
        dateTo,
      });
      if (attRes.error) toast({ title: 'Error', description: attRes.error, variant: 'destructive' });
      return attRes.data;
    },
    enabled: !!user?.companyId && (!!canAccessTeamAttendance || !!selfServiceEmployeeId),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-hrms', user?.companyId],
    queryFn: async () => { const res = await listEmployeeDirectory(user!.companyId); return res.data; },
    enabled: !!user?.companyId && canAccessTeamAttendance,
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId) return;
    const result = upsertAttendanceSchema.safeParse(form);
    if (!result.success) {
      toast({ title: 'Validation error', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }
    const { error } = await upsertAttendance(user.companyId, form as UpsertAttendanceInput);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Attendance saved' });
    setShowForm(false);
    setForm({ date: todayIso(), status: 'present' });
    void queryClient.invalidateQueries({ queryKey: ['attendance-records', user?.companyId] });
  }

  // Summary counts
  const counts = records.reduce<Record<AttendanceStatus, number>>(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    { present: 0, absent: 0, half_day: 0, on_leave: 0, public_holiday: 0 },
  );
  const totalActive = counts.present + counts.half_day + counts.on_leave + counts.public_holiday;
  const presenceRate = totalActive > 0 ? Math.round((counts.present / totalActive) * 100) : 0;

  function resetFilters() {
    setDateFrom(() => {
      const d = new Date(); d.setDate(1);
      return d.toISOString().slice(0, 10);
    });
    setDateTo(todayIso());
    setEmpFilter('all');
  }

  const columns: StandardTableColumn<AttendanceRow>[] = [
    ...(canAccessTeamAttendance ? [{
      key: 'employeeName',
      label: 'Employee',
      render: (r: AttendanceRow) => r.employeeName ?? '—',
    } satisfies StandardTableColumn<AttendanceRow>] : []),
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as string} className="capitalize" /> },
    { key: 'clockIn', label: 'Clock In', sortable: false, render: (r) => r.clockIn ?? '—' },
    { key: 'clockOut', label: 'Clock Out', sortable: false, render: (r) => r.clockOut ?? '—' },
    { key: 'hoursWorked', label: 'Hours', render: (r) => r.hoursWorked != null ? `${r.hoursWorked as number}h` : '—' },
    { key: 'notes', label: 'Notes', sortable: false, render: (r) => r.notes ?? '' },
  ];
  const tableRows: AttendanceRow[] = records.map(r => ({ ...r }));

  function exportCsv() {
    const header = 'Employee,Date,Status,Clock In,Clock Out,Hours\n';
    const rows = records.map(r =>
      `"${r.employeeName ?? r.employeeId}",${r.date},${r.status},${r.clockIn ?? ''},${r.clockOut ?? ''},${r.hoursWorked ?? ''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attendance-${dateFrom}-${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Attendance"
        description={canAccessTeamAttendance ? 'Daily workforce attendance and exceptions' : 'Your daily attendance records'}
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Attendance' }]}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Export</Button>
            {canManageAttendance && (
              <Button size="sm" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" /> Mark Attendance</Button>
            )}
          </div>
        }
      />

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Attendance Control Center</h2>
            <p className="text-xs text-muted-foreground">
              Review operational attendance, exception patterns, and the current period scope.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
            <FilterX className="mr-1.5 h-3.5 w-3.5" />
            Reset filters
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="shadow-sm"><CardContent className="flex items-start gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><CalendarDays className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div><div><p className="text-sm text-muted-foreground">Presence rate</p><p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{presenceRate}%</p><p className="text-xs text-muted-foreground">Of all active attendance records</p></div></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="flex items-start gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30"><span className="text-lg font-bold text-red-600 dark:text-red-400">✕</span></div><div><p className="text-sm text-muted-foreground">Absent</p><p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{counts.absent}</p><p className="text-xs text-muted-foreground">Requires follow-up</p></div></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="flex items-start gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30"><Users className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div><div><p className="text-sm text-muted-foreground">Tracked records</p><p className="text-2xl font-bold tabular-nums">{records.length}</p><p className="text-xs text-muted-foreground">Current date range</p></div></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="flex items-start gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30"><span className="text-lg font-bold text-violet-600 dark:text-violet-400">★</span></div><div><p className="text-sm text-muted-foreground">Half-day / leave</p><p className="text-2xl font-bold tabular-nums text-violet-600 dark:text-violet-400">{counts.half_day + counts.on_leave}</p><p className="text-xs text-muted-foreground">Exceptions and approved leave</p></div></CardContent></Card>
        </div>
      </section>

      {/* Summary strip — colour-coded by exception severity */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {([
          { status: 'present',        label: 'Present',        icon: '✓',  bg: 'bg-emerald-100 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200/60 dark:border-emerald-800/40' },
          { status: 'absent',         label: 'Absent',         icon: '✕',  bg: 'bg-red-100 dark:bg-red-900/20',         text: 'text-red-700 dark:text-red-400',         border: 'border-red-200/60 dark:border-red-800/40' },
          { status: 'half_day',       label: 'Half Day',       icon: '½',  bg: 'bg-amber-100 dark:bg-amber-900/20',     text: 'text-amber-700 dark:text-amber-400',     border: 'border-amber-200/60 dark:border-amber-800/40' },
          { status: 'on_leave',       label: 'On Leave',       icon: '↗',  bg: 'bg-blue-100 dark:bg-blue-900/20',       text: 'text-blue-700 dark:text-blue-400',       border: 'border-blue-200/60 dark:border-blue-800/40' },
          { status: 'public_holiday', label: 'Public Holiday', icon: '★',  bg: 'bg-violet-100 dark:bg-violet-900/20',   text: 'text-violet-700 dark:text-violet-400',   border: 'border-violet-200/60 dark:border-violet-800/40' },
        ] as const).map(({ status, label, icon, bg, text, border }) => (
          <Card key={status} className={`shadow-sm border ${border}`}>
            <CardContent className="flex items-center gap-3 p-3.5">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold ${bg} ${text}`}>
                {icon}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold leading-none tabular-nums ${text}`}>{counts[status]}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Exception banner — shown if >0 absent in range */}
      {counts.absent > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200/60 bg-red-50/60 px-4 py-3 dark:border-red-800/30 dark:bg-red-900/10">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            {counts.absent} absent record{counts.absent !== 1 ? 's' : ''} in this period
            {counts.half_day > 0 && ` · ${counts.half_day} half-day${counts.half_day !== 1 ? 's' : ''}`}
          </p>
        </div>
      )}

      {/* Filters */}
      <FilterBar title="Attendance filters" description="Review records by period and employee scope" countLabel={`${records.length} records`}>
        <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-9 w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-9 w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {canAccessTeamAttendance && (
          <div className="space-y-1">
            <Label className="text-xs">Employee</Label>
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger className="h-9 w-52"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={resetFilters}>
          Clear
        </Button>
        </div>
      </FilterBar>

      {/* Table — exceptions (absent/half_day) sorted first */}
      {loading ? (
        <TableSkeleton cols={canAccessTeamAttendance ? 7 : 6} />
      ) : (
        <StandardTable
          data={[
            ...tableRows.filter(r => r.status === 'absent'),
            ...tableRows.filter(r => r.status === 'half_day'),
            ...tableRows.filter(r => r.status !== 'absent' && r.status !== 'half_day'),
          ]}
          columns={columns}
          searchPlaceholder="Search records…"
          emptyMessage="No records found for this period"
        />
      )}

      {/* Mark attendance dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={form.employeeId ?? ''} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.date ?? ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status ?? 'present'} onValueChange={v => setForm(f => ({ ...f, status: v as AttendanceStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['present','absent','half_day','on_leave','public_holiday'] as const).map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Clock In</Label>
                <Input type="time" value={form.clockIn ?? ''} onChange={e => setForm(f => ({ ...f, clockIn: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Clock Out</Label>
                <Input type="time" value={form.clockOut ?? ''} onChange={e => setForm(f => ({ ...f, clockOut: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
