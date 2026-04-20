import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getMyPayslips, type PayslipSummary } from '@/services/hrmsService';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function PayslipScreen() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!employee) return;
    getMyPayslips(employee.id, employee.companyId)
      .then(setPayslips)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee?.id]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(n);

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
        <h1 className="text-lg font-bold text-foreground">Payslips</h1>
      </header>

      <main className="flex-1 px-5 pb-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : payslips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payslips available yet.</p>
        ) : (
          <ul className="space-y-3">
            {payslips.map(ps => (
              <li key={ps.id} className="rounded-2xl bg-secondary p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {MONTHS[(ps.periodMonth - 1) % 12]} {ps.periodYear}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground capitalize">{ps.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{fmt(ps.netPay)}</p>
                    <p className="text-xs text-muted-foreground">Gross: {fmt(ps.grossPay)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
