import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilterBar } from '@/components/shared/FilterBar';
import { PageHeader } from '@/components/shared/PageHeader';
import { StandardTable, type StandardTableColumn } from '@/components/shared/StandardTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TableSkeleton } from '@/components/shared/TableSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Download } from 'lucide-react';
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
    <div className="w-full space-y-4">
      <PageHeader
        title="Attendance Log"
        description="Track daily attendance records"
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(Object.entries(counts) as [AttendanceStatus, number][]).map(([status, cnt]) => (
          <Card key={status} className="shadow-sm">
            <CardHeader className="px-3 pb-1 pt-3">
              <CardTitle className="text-xs capitalize text-muted-foreground">{status.replace('_', ' ')}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-2xl font-semibold tabular-nums">{cnt}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
        </div>
      </FilterBar>

      {/* Table */}
      {loading ? (
        <TableSkeleton cols={canAccessTeamAttendance ? 7 : 6} />
      ) : (
        <StandardTable
          data={tableRows}
          columns={columns}
          searchPlaceholder="Search records…"
          emptyMessage="No records found"
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
