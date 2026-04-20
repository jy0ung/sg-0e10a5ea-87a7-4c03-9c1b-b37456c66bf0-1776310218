import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { updateContactNo } from '@/services/hrmsService';

export default function ProfileScreen() {
  const { employee, signOut } = useAuth();
  const navigate = useNavigate();
  const [contactNo, setContactNo] = useState(employee?.contactNo ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function handleSave() {
    if (!employee) return;
    setSaving(true);
    await updateContactNo(employee.id, contactNo).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!employee) return null;

  const initials = employee.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('');

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
        <h1 className="text-lg font-bold text-foreground">My Profile</h1>
      </header>

      <main className="flex-1 px-5 pb-6 space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-foreground">
            {initials}
          </div>
          <div>
            <p className="font-semibold text-foreground">{employee.name}</p>
            {employee.jobTitleName  && <p className="text-xs text-muted-foreground">{employee.jobTitleName}</p>}
            {employee.departmentName && <p className="text-xs text-muted-foreground">{employee.departmentName}</p>}
          </div>
        </div>

        {/* Info rows */}
        <div className="space-y-3">
          <InfoRow label="Staff Code" value={employee.staffCode    ?? '—'} />
          <InfoRow label="Email"      value={employee.email        ?? '—'} />
          <InfoRow label="IC No"      value={employee.icNo         ?? '—'} />
          <InfoRow label="Join Date"  value={employee.joinDate     ?? '—'} />
          <InfoRow label="Status"     value={employee.status}              />
        </div>

        {/* Editable contact number */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Contact No</label>
          <input
            type="tel"
            value={contactNo}
            onChange={e => setContactNo(e.target.value)}
            className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="+60 12 345 6789"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </button>

        <button
          onClick={() => signOut()}
          className="w-full rounded-lg border border-destructive/50 py-3 text-sm font-medium text-destructive"
        >
          Sign Out
        </button>
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
