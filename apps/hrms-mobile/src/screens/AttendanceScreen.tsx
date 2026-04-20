import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getMyAttendance, clockIn, clockOut } from '@/services/hrmsService';
import type { AttendanceRecord } from '@flc/types';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export default function AttendanceScreen() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);

  const today = todayISO();
  const todayRecord = records.find(r => r.date === today);
  const hasCheckedIn  = !!todayRecord?.clockIn;
  const hasCheckedOut = !!todayRecord?.clockOut;

  function load() {
    if (!employee) return;
    const from = new Date();
    from.setDate(from.getDate() - 30);
    getMyAttendance(employee.id, employee.companyId, {
      from: from.toISOString().split('T')[0],
      to:   today,
    })
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [employee?.id]);

  async function handleClockIn() {
    if (!employee) return;
    setActionPending(true);
    await clockIn(employee.id, employee.companyId, today).catch(() => {});
    load();
    setActionPending(false);
  }

  async function handleClockOut() {
    if (!employee) return;
    setActionPending(true);
    await clockOut(employee.id, employee.companyId, today).catch(() => {});
    load();
    setActionPending(false);
  }

  function fmtTime(iso: string | undefined) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
        <h1 className="text-lg font-bold text-foreground">Attendance</h1>
      </header>

      <main className="flex-1 px-5 pb-6 space-y-4">
        {/* Today card */}
        <div className="rounded-2xl bg-secondary p-5">
          <p className="mb-1 text-xs text-muted-foreground">Today · {today}</p>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl bg-background p-3">
              <p className="text-xs text-muted-foreground">Clock-in</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{fmtTime(todayRecord?.clockIn)}</p>
            </div>
            <div className="flex-1 rounded-xl bg-background p-3">
              <p className="text-xs text-muted-foreground">Clock-out</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{fmtTime(todayRecord?.clockOut)}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            {!hasCheckedIn && (
              <button
                disabled={actionPending}
                onClick={handleClockIn}
                className="flex-1 rounded-lg bg-green-800 py-3 text-sm font-semibold text-green-100 disabled:opacity-60"
              >
                Clock In
              </button>
            )}
            {hasCheckedIn && !hasCheckedOut && (
              <button
                disabled={actionPending}
                onClick={handleClockOut}
                className="flex-1 rounded-lg bg-orange-800 py-3 text-sm font-semibold text-orange-100 disabled:opacity-60"
              >
                Clock Out
              </button>
            )}
            {hasCheckedIn && hasCheckedOut && (
              <div className="flex-1 rounded-lg bg-secondary py-3 text-center text-sm text-muted-foreground">
                Done for today ✓
              </div>
            )}
          </div>
        </div>

        {/* History */}
        <h2 className="text-sm font-semibold text-foreground">Last 30 days</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {records.filter(r => r.date !== today).slice(0, 20).map(r => (
              <li key={r.id} className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                <span className="text-sm text-foreground">{r.date}</span>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{fmtTime(r.clockIn)} → {fmtTime(r.clockOut)}</p>
                  {r.hoursWorked != null && (
                    <p>{r.hoursWorked.toFixed(1)}h</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
