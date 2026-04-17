import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { listAttendanceRecords, upsertAttendance, listEmployees } from '@/services/hrmsService';
import type { AttendanceRecord, UpsertAttendanceInput, AttendanceStatus, Employee } from '@/types';
import { Plus, Download } from 'lucide-react';

const MANAGER_ROLES = ['super_admin', 'company_admin', 'general_manager', 'manager'] as const;

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present:        'bg-green-100 text-green-700 border-green-200',
  absent:         'bg-red-100 text-red-700 border-red-200',
  half_day:       'bg-orange-100 text-orange-700 border-orange-200',
  on_leave:       'bg-blue-100 text-blue-700 border-blue-200',
  public_holiday: 'bg-purple-100 text-purple-700 border-purple-200',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceLog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManager = MANAGER_ROLES.includes(user?.role as typeof MANAGER_ROLES[number]);

  const [records, setRecords]     = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
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

  const load = useCallback(async () => {
    if (!user?.companyId) return;
    setLoading(true);
    const [attRes, empRes] = await Promise.all([
      listAttendanceRecords(user.companyId, {
        employeeId: !isManager ? user.id : (empFilter === 'all' ? undefined : empFilter),
        dateFrom,
        dateTo,
      }),
      isManager ? listEmployees(user.companyId) : Promise.resolve({ data: [], error: null }),
    ]);
    setRecords(attRes.data);
    if (isManager) setEmployees(empRes.data);
    setLoading(false);
    if (attRes.error) toast({ title: 'Error', description: attRes.error, variant: 'destructive' });
  }, [user, isManager, empFilter, dateFrom, dateTo, toast]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !form.employeeId || !form.date || !form.status) return;
    const { error } = await upsertAttendance(user.companyId, form as UpsertAttendanceInput);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Attendance saved' });
    setShowForm(false);
    setForm({ date: todayIso(), status: 'present' });
    load();
  }

  // Summary counts
  const counts = records.reduce<Record<AttendanceStatus, number>>(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    { present: 0, absent: 0, half_day: 0, on_leave: 0, public_holiday: 0 },
  );

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
    <div className="p-6 space-y-6">
      <PageHeader
        title="Attendance Log"
        description="Track daily attendance records"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Attendance' }]}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Export</Button>
            {isManager && (
              <Button size="sm" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" /> Mark Attendance</Button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.entries(counts) as [AttendanceStatus, number][]).map(([status, cnt]) => (
          <Card key={status}>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground capitalize">{status.replace('_', ' ')}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-2xl font-bold">{cnt}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {isManager && (
          <div className="space-y-1">
            <Label className="text-xs">Employee</Label>
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger className="w-52"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {isManager && <TableHead>Employee</TableHead>}
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isManager ? 7 : 6} className="text-center text-muted-foreground h-24">
                      No records found
                    </TableCell>
                  </TableRow>
                ) : records.map(r => (
                  <TableRow key={r.id}>
                    {isManager && <TableCell>{r.employeeName ?? '—'}</TableCell>}
                    <TableCell>{r.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLORS[r.status]}`}>
                        {r.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.clockIn ?? '—'}</TableCell>
                    <TableCell>{r.clockOut ?? '—'}</TableCell>
                    <TableCell>{r.hoursWorked != null ? `${r.hoursWorked}h` : '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.notes ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
