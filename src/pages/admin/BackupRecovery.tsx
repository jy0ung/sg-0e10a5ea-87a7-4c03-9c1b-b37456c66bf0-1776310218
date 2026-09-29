import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, Download, HardDriveDownload, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  downloadManualBackup, getRecoveryCapabilities, listRecoveryJobs,
  recoveryApiConfigured, startManualBackup, type RecoveryJob,
} from '@/services/recoveryService';

const stateLabel: Record<RecoveryJob['state'], string> = {
  running: 'Creating encrypted archive',
  validating: 'Checking archive integrity',
  completed: 'Ready to export',
  failed: 'Failed',
};

function formatBytes(value?: number): string {
  if (value === undefined) return '—';
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

export default function BackupRecovery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const isRecoveryAdmin = user?.role === 'super_admin';
  const enabled = isRecoveryAdmin && recoveryApiConfigured;
  const capabilities = useQuery({
    queryKey: ['recovery-capabilities'], queryFn: getRecoveryCapabilities, enabled,
    retry: false,
  });
  const jobs = useQuery({
    queryKey: ['recovery-jobs'], queryFn: listRecoveryJobs, enabled,
    retry: false,
    refetchInterval: query => query.state.data?.some(job => job.state === 'running' || job.state === 'validating') ? 3_000 : false,
  });
  if (!isRecoveryAdmin) return <UnauthorizedAccess />;

  const manualAvailable = capabilities.data?.destinations.some(item => item.type === 'manual_export' && item.available) ?? false;
  const active = jobs.data?.some(job => job.state === 'running' || job.state === 'validating') ?? false;

  const start = async () => {
    setStarting(true);
    try {
      await startManualBackup();
      toast.success('Encrypted backup started');
      await queryClient.invalidateQueries({ queryKey: ['recovery-jobs'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backup could not be started');
    } finally { setStarting(false); }
  };

  const download = async (job: RecoveryJob) => {
    setDownloadingId(job.id);
    try {
      await downloadManualBackup(job);
      toast.success('Encrypted backup exported');
      await queryClient.invalidateQueries({ queryKey: ['recovery-jobs'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backup export failed');
    } finally { setDownloadingId(null); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Backup & Recovery" description="Create, verify and export an encrypted database archive"
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin' }, { label: 'Backup & Recovery' }]} />

      <div className="glass-panel p-5 md:p-6 space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Manual encrypted export</h2></div>
            <p className="text-sm text-muted-foreground max-w-2xl">The server creates and validates the archive. Download it only after the integrity check finishes, then store it in a location you control. Keep the decryption key separately.</p>
          </div>
          <Button onClick={start} disabled={!manualAvailable || active || starting}>
            <Archive className="h-4 w-4 mr-2" />{starting ? 'Starting…' : active ? 'Backup running' : 'Create backup'}
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-4" aria-label="Backup process">
          {[
            ['01', 'Request', 'Administrator starts the job'],
            ['02', 'Encrypt', 'Database stream becomes an encrypted archive'],
            ['03', 'Verify', 'Archive is decrypted and inspected server-side'],
            ['04', 'Export', 'Download the verified file and checksum'],
          ].map(([number, label, detail]) => (
            <div key={number} className="rounded-lg border border-border/70 bg-secondary/20 px-3 py-3">
              <p className="font-mono text-[11px] text-primary">{number} / {label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
        {!recoveryApiConfigured && <p role="status" className="text-sm text-warning">The Backup & Recovery service has not been connected to this environment.</p>}
        {recoveryApiConfigured && capabilities.isError && <p role="alert" className="text-sm text-destructive">The Backup & Recovery service is unavailable. Check the service connection.</p>}
        {recoveryApiConfigured && capabilities.data && !manualAvailable && <p role="status" className="text-sm text-warning">Manual export is unavailable until the server-side database connection, encryption key and export location are configured.</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-panel p-5 space-y-3">
          <div className="flex items-center gap-2"><HardDriveDownload className="h-4 w-4 text-primary" /><h2 className="font-semibold">Destinations</h2></div>
          <div className="space-y-2">
            {(capabilities.data?.destinations ?? [
              { type: 'manual_export', label: 'Encrypted manual export', available: false },
              { type: 'local_nas', label: 'Local or NAS', available: false },
              { type: 's3_compatible', label: 'S3-compatible storage', available: false },
              { type: 'cloud_object', label: 'Cloud object storage', available: false },
            ]).map(destination => <div key={destination.type} className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0">
              <span className="text-sm">{destination.label}</span>
              <Badge variant={destination.available ? 'default' : 'secondary'}>{destination.available ? 'Available' : 'Not configured'}</Badge>
            </div>)}
          </div>
        </div>
        <div className="glass-panel p-5 space-y-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-semibold">Restore</h2></div>
          <p className="text-sm text-muted-foreground">Restore is unavailable in this application environment. Select and verify an archive, check compatibility, and use a controlled isolated restore process before replacing any database.</p>
          <Badge variant="secondary">No automatic restore</Badge>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="border-b border-border p-5 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><h2 className="font-semibold">Backup history</h2></div>
        {jobs.isError ? <p role="alert" className="p-5 text-sm text-destructive">Backup history is unavailable.</p>
          : jobs.isPending && enabled ? <p className="p-5 text-sm text-muted-foreground">Loading backup history…</p>
          : !jobs.data?.length ? <p className="p-5 text-sm text-muted-foreground">No backup jobs have been recorded in this environment.</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary/30 text-left text-xs text-muted-foreground"><tr>
              <th className="px-4 py-3 font-medium">Started</th><th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Size</th><th className="px-4 py-3 font-medium">Schema / app</th>
              <th className="px-4 py-3 font-medium">SHA-256</th><th className="px-4 py-3 font-medium">Export</th>
            </tr></thead>
            <tbody>{jobs.data.map(job => <tr key={job.id} className="border-t border-border/60">
              <td className="px-4 py-3 whitespace-nowrap">{new Date(job.startedAt).toLocaleString()}</td>
              <td className="px-4 py-3"><Badge variant={job.state === 'completed' ? 'default' : 'secondary'}>{stateLabel[job.state]}</Badge>{job.error && <p className="mt-1 text-xs text-destructive">{job.error}</p>}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatBytes(job.sizeBytes)}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{job.schemaVersion ?? '—'} / {job.applicationVersion ?? '—'}</td>
              <td className="px-4 py-3 font-mono text-xs" title={job.sha256}>{job.sha256 ? `${job.sha256.slice(0, 12)}…` : '—'}</td>
              <td className="px-4 py-3"><Button size="sm" variant="outline" disabled={job.state !== 'completed' || downloadingId === job.id}
                onClick={() => download(job)}><Download className="h-3.5 w-3.5 mr-1" />Export</Button></td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </div>
  );
}
