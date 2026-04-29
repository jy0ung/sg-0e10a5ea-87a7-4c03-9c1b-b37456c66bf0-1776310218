import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  acknowledgeAppraisalItem,
  getMyAppraisalItems,
  submitAppraisalSelfReview,
  type SelfServiceAppraisalItem,
} from '@/services/hrmsService';

const STATUS_CLASSES: Record<SelfServiceAppraisalItem['status'], string> = {
  pending:       'bg-yellow-900/30 text-yellow-400',
  self_reviewed: 'bg-primary/10 text-primary',
  reviewed:      'bg-blue-900/30 text-blue-400',
  acknowledged:  'bg-green-900/30 text-green-400',
};

function formatDate(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function emptyForm(item?: SelfServiceAppraisalItem) {
  return {
    goals:            item?.goals ?? '',
    achievements:     item?.achievements ?? '',
    areasToImprove:   item?.areasToImprove ?? '',
    employeeComments: item?.employeeComments ?? '',
  };
}

export default function AppraisalsScreen() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<SelfServiceAppraisalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<SelfServiceAppraisalItem | null>(null);
  const [action, setAction] = useState<'self_review' | 'acknowledge' | null>(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(() => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    getMyAppraisalItems(employee.id, employee.companyId)
      .then(setItems)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load appraisals.'))
      .finally(() => setLoading(false));
  }, [employee]);

  useEffect(load, [load]);

  function openAction(item: SelfServiceAppraisalItem, nextAction: 'self_review' | 'acknowledge') {
    setActiveItem(item);
    setAction(nextAction);
    setForm(emptyForm(item));
    setError(null);
  }

  function closeAction() {
    setActiveItem(null);
    setAction(null);
    setForm(emptyForm());
    setSaving(false);
  }

  async function handleSave() {
    if (!employee || !activeItem || !action) return;

    setSaving(true);
    setError(null);
    try {
      if (action === 'self_review') {
        await submitAppraisalSelfReview(activeItem.id, employee.id, form);
      } else {
        await acknowledgeAppraisalItem(activeItem.id, employee.id, form.employeeComments);
      }
      closeAction();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save appraisal.');
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Appraisals</h1>
          <p className="text-xs text-muted-foreground">Self review and acknowledgement</p>
        </div>
      </header>

      <main className="flex-1 px-5 pb-6">
        {error && !activeItem && (
          <div className="mb-4 rounded-2xl bg-secondary p-4 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-5 text-sm text-muted-foreground">No appraisals assigned yet.</div>
        ) : (
          <ul className="space-y-3">
            {items.map(item => {
              const canSelfReview = item.appraisalStatus === 'open' && ['pending', 'self_reviewed'].includes(item.status);
              const canAcknowledge = item.appraisalStatus === 'open' && item.status === 'reviewed';

              return (
                <li key={item.id} className="rounded-2xl bg-secondary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">{item.appraisalTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(item.periodStart)} - {formatDate(item.periodEnd)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASSES[item.status]}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {item.rating && <p>Rating: {item.rating} / 5</p>}
                    {item.reviewerName && <p>Reviewer: {item.reviewerName}</p>}
                    {item.reviewerComments && <p>Manager: {item.reviewerComments}</p>}
                    {item.employeeComments && <p>Employee: {item.employeeComments}</p>}
                  </div>

                  <div className="mt-4 flex gap-2">
                    {canSelfReview && (
                      <button
                        onClick={() => openAction(item, 'self_review')}
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                      >
                        Self Review
                      </button>
                    )}
                    {canAcknowledge && (
                      <button
                        onClick={() => openAction(item, 'acknowledge')}
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                      >
                        Acknowledge
                      </button>
                    )}
                    {!canSelfReview && !canAcknowledge && (
                      <span className="text-xs text-muted-foreground">No action available</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {activeItem && action && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-background p-5 safe-bottom">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {action === 'self_review' ? 'Self Review' : 'Acknowledge Review'}
                </h2>
                <p className="text-xs text-muted-foreground">{activeItem.appraisalTitle}</p>
              </div>
              <button onClick={closeAction} className="text-sm text-muted-foreground">Close</button>
            </div>

            {error && <div className="mb-4 rounded-xl bg-secondary p-3 text-sm text-destructive">{error}</div>}

            {action === 'self_review' && (
              <div className="space-y-4">
                <TextAreaField label="Goals" value={form.goals} onChange={value => setForm(prev => ({ ...prev, goals: value }))} />
                <TextAreaField label="Achievements" value={form.achievements} onChange={value => setForm(prev => ({ ...prev, achievements: value }))} />
                <TextAreaField label="Areas To Improve" value={form.areasToImprove} onChange={value => setForm(prev => ({ ...prev, areasToImprove: value }))} />
              </div>
            )}

            {action === 'acknowledge' && activeItem.reviewerComments && (
              <div className="mb-4 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
                {activeItem.reviewerComments}
              </div>
            )}

            <div className="mt-4">
              <TextAreaField
                label="Employee Comments"
                value={form.employeeComments}
                onChange={value => setForm(prev => ({ ...prev, employeeComments: value }))}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? 'Saving…' : action === 'self_review' ? 'Submit Self Review' : 'Acknowledge Review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}