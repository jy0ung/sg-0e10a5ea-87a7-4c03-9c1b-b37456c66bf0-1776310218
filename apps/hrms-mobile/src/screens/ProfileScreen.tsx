import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { updateContactNo } from '@/services/hrmsService';

const STATUS_CLASSES = {
  active: 'bg-green-900/30 text-green-400',
  inactive: 'bg-yellow-900/30 text-yellow-400',
  resigned: 'bg-red-900/30 text-red-400',
} as const;

function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export default function ProfileScreen() {
  const { employee, signOut, refreshEmployee } = useAuth();
  const navigate = useNavigate();
  const [contactNo, setContactNo] = useState(employee?.contactNo ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    setContactNo(employee?.contactNo ?? '');
  }, [employee?.contactNo]);

  async function handleSave() {
    if (!employee) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateContactNo(employee.id, contactNo.trim());
      await refreshEmployee();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!employee) return null;

  const initials = employee.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('');

  const hasChanges = contactNo.trim() !== (employee.contactNo ?? '').trim();
  const statusClass = STATUS_CLASSES[employee.status];
  const summaryRows = [
    { label: 'Staff Code', value: employee.staffCode ?? '—' },
    { label: 'Department', value: employee.departmentName ?? '—' },
    { label: 'Job Title', value: employee.jobTitleName ?? '—' },
    { label: 'Join Date', value: formatDate(employee.joinDate) },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
        <div>
          <h1 className="text-lg font-bold text-foreground">My Profile</h1>
          <p className="text-xs text-muted-foreground">Personal details, work profile, and contact info</p>
        </div>
      </header>

      <main className="flex-1 px-5 pb-6 space-y-5">
        <div className="flex items-center gap-4 rounded-3xl bg-secondary p-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{employee.name}</p>
            <p className="text-xs text-muted-foreground">{employee.email || 'No email recorded'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {employee.jobTitleName && <span className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground">{employee.jobTitleName}</span>}
              {employee.departmentName && <span className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted-foreground">{employee.departmentName}</span>}
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass}`}>{employee.status}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {summaryRows.map(row => (
            <div key={row.label} className="rounded-2xl bg-secondary px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{row.label}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{row.value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-3xl bg-secondary p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-foreground">Employment Details</h2>
            <p className="text-xs text-muted-foreground">Current work record synced from HRMS.</p>
          </div>
          <div className="space-y-3">
            <InfoRow label="Email" value={employee.email ?? '—'} />
            <InfoRow label="IC No" value={employee.icNo ?? '—'} />
            <InfoRow label="Role" value={employee.role.replace(/_/g, ' ')} />
            <InfoRow label="Resign Date" value={formatDate(employee.resignDate)} />
          </div>
        </section>

        <section className="rounded-3xl bg-secondary p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-foreground">Contact</h2>
            <p className="text-xs text-muted-foreground">Keep your phone number current for HR and approval follow-up.</p>
          </div>
          <label htmlFor="profile-contact-no" className="mb-1.5 block text-sm font-medium text-foreground">Contact No</label>
          <input
            id="profile-contact-no"
            type="tel"
            value={contactNo}
            onChange={e => setContactNo(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="+60 12 345 6789"
          />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          {saved && <p className="mt-2 text-xs text-green-400">Profile updated.</p>}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="mt-4 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </section>

        <section className="rounded-3xl border border-destructive/30 p-4">
          <h2 className="text-sm font-semibold text-foreground">Account</h2>
          <p className="mt-1 text-xs text-muted-foreground">End your current mobile HRMS session on this device.</p>
          <button
            onClick={() => signOut()}
            className="mt-4 w-full rounded-lg border border-destructive/50 py-3 text-sm font-medium text-destructive"
          >
            Sign Out
          </button>
        </section>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
