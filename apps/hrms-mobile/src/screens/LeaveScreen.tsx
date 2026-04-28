import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { createLeaveRequestSchema, type CreateLeaveRequestFormData } from '@flc/hrms-schemas';
import { createLeaveRequest, getLeaveTypes } from '@/services/hrmsService';

type LeaveType = { id: string; name: string; daysPerYear: number };

export default function LeaveScreen() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateLeaveRequestFormData>({
    resolver: zodResolver(createLeaveRequestSchema),
  });

  useEffect(() => {
    if (employee?.companyId) {
      getLeaveTypes(employee.companyId).then(setLeaveTypes).catch(() => {});
    }
  }, [employee?.companyId]);

  async function onSubmit(data: CreateLeaveRequestFormData) {
    if (!employee) return;
    setApiError(null);
    try {
      await createLeaveRequest(employee.id, employee.companyId, data);
      setSuccess(true);
      reset();
      setTimeout(() => navigate('/leave/history'), 1500);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to submit request');
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background safe-top safe-bottom">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">←</button>
        <h1 className="text-lg font-bold text-foreground">Apply for Leave</h1>
      </header>

      <main className="flex-1 px-5">
        {success && (
          <div className="mb-4 rounded-lg bg-green-900/30 px-4 py-3 text-sm text-green-400">
            Leave request submitted successfully!
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="leave-type" className="mb-1.5 block text-sm font-medium text-foreground">Leave Type</label>
            <select
              id="leave-type"
              {...register('leaveTypeId')}
              className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select type…</option>
              {leaveTypes.map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
            {errors.leaveTypeId && <p className="mt-1 text-xs text-destructive">{errors.leaveTypeId.message}</p>}
          </div>

          <div>
            <label htmlFor="leave-start-date" className="mb-1.5 block text-sm font-medium text-foreground">Start Date</label>
            <input
              id="leave-start-date"
              type="date"
              {...register('startDate')}
              className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.startDate && <p className="mt-1 text-xs text-destructive">{errors.startDate.message}</p>}
          </div>

          <div>
            <label htmlFor="leave-end-date" className="mb-1.5 block text-sm font-medium text-foreground">End Date</label>
            <input
              id="leave-end-date"
              type="date"
              {...register('endDate')}
              className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.endDate && <p className="mt-1 text-xs text-destructive">{errors.endDate.message}</p>}
          </div>

          <div>
            <label htmlFor="leave-reason" className="mb-1.5 block text-sm font-medium text-foreground">Reason (optional)</label>
            <textarea
              id="leave-reason"
              {...register('reason')}
              rows={3}
              className="w-full rounded-lg border border-input bg-secondary px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Brief reason for leave…"
            />
          </div>

          {apiError && (
            <div className="rounded-lg bg-destructive/20 px-4 py-2.5 text-sm text-destructive">{apiError}</div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>

        <button
          onClick={() => navigate('/leave/history')}
          className="mt-4 w-full rounded-lg border border-border py-3 text-sm font-medium text-foreground"
        >
          View Leave History
        </button>
      </main>
    </div>
  );
}
