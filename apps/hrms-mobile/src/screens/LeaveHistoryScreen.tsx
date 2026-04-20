import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getMyLeaveRequests, cancelLeaveRequest } from '@/services/hrmsService';
import type { LeaveRequest }                      from '@flc/types';

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-900/30 text-yellow-400',
  approved:  'bg-green-900/30 text-green-400',
  rejected:  'bg-red-900/30 text-red-400',
  cancelled: 'bg-secondary text-muted-foreground',
};

export default function LeaveHistoryScreen() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading]   = useState(true);

  function load() {
    if (!employee) return;
    getMyLeaveRequests(employee.id, employee.companyId)
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [employee?.id]);

  async function handleCancel(id: string) {
    await cancelLeaveRequest(id).catch(() => {});
    load();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
        <h1 className="text-lg font-bold text-foreground">Leave History</h1>
      </header>

      <main className="flex-1 px-5 pb-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leave requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map(req => (
              <li key={req.id} className="rounded-2xl bg-secondary p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {(req as any).leaveTypeName ?? 'Leave'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {req.startDate} → {req.endDate}
                    </p>
                    {req.reason && <p className="mt-1 text-xs text-muted-foreground">{req.reason}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[req.status] ?? ''}`}>
                    {req.status}
                  </span>
                </div>
                {req.status === 'pending' && (
                  <button
                    onClick={() => handleCancel(req.id)}
                    className="mt-3 rounded-lg border border-destructive/50 px-3 py-1.5 text-xs text-destructive"
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
