import { supabase } from '@/integrations/supabase/client';

export interface RecoveryJob {
  id: string;
  state: 'running' | 'validating' | 'completed' | 'failed';
  destination: 'manual_export';
  startedAt: string;
  finishedAt?: string;
  sizeBytes?: number;
  sha256?: string;
  databaseVersion?: string | null;
  schemaVersion?: string | null;
  applicationVersion?: string | null;
  error?: string;
}

export interface RecoveryCapabilities {
  destinations: Array<{ type: string; label: string; available: boolean }>;
  restoreAvailable: boolean;
}

export const recoveryApiConfigured = Boolean(import.meta.env.VITE_RECOVERY_API_URL);

function endpoint(path: string): string {
  const base = import.meta.env.VITE_RECOVERY_API_URL as string | undefined;
  if (!base) throw new Error('Backup & Recovery service is not configured');
  const url = new URL(base, window.location.origin);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('Backup & Recovery service requires HTTPS');
  }
  return `${url.href.replace(/\/$/, '')}${path}`;
}

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Sign in to access Backup & Recovery');
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(details.error ?? `Backup & Recovery request failed (${response.status})`);
  }
  return response;
}

export async function getRecoveryCapabilities(): Promise<RecoveryCapabilities> {
  const response = await authorizedFetch('/capabilities');
  return response.json() as Promise<RecoveryCapabilities>;
}

export async function listRecoveryJobs(): Promise<RecoveryJob[]> {
  const response = await authorizedFetch('/jobs');
  const result = await response.json() as { jobs: RecoveryJob[] };
  return result.jobs;
}

export async function startManualBackup(): Promise<RecoveryJob> {
  const response = await authorizedFetch('/jobs', {
    method: 'POST', body: JSON.stringify({ destination: 'manual_export' }),
  });
  const result = await response.json() as { job: RecoveryJob };
  return result.job;
}

interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{ createWritable(): Promise<WritableStream> }>;
}

export async function downloadManualBackup(job: RecoveryJob): Promise<void> {
  const filename = `ubs-backup-${job.id}.dump.gpg`;
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  // Invoke the picker before the first await so the browser retains the click gesture.
  const handle = picker ? await picker.call(window, {
    suggestedName: filename,
    types: [{ description: 'Encrypted database backup', accept: { 'application/octet-stream': ['.gpg'] } }],
  }) : null;
  const response = await authorizedFetch(`/jobs/${job.id}/download`);
  if (handle) {
    const file = await handle;
    const writable = await file.createWritable();
    if (!response.body) throw new Error('The backup download has no body');
    await response.body.pipeTo(writable);
    return;
  }
  if (Number(response.headers.get('Content-Length') ?? 0) > 200_000_000) {
    await response.body?.cancel();
    throw new Error('Use a browser with streamed file saving for backups over 200 MB');
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
