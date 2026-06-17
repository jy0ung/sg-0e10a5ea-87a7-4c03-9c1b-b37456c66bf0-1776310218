import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAttachmentSettings } from '@/hooks/useAttachmentSettings';

interface Props {
  companyId: string | undefined;
  actorId: string;
}

/**
 * Attachment Settings tab content. Self-contained:
 *  - fetches settings via useAttachmentSettings
 *  - keeps a local edit buffer that syncs when server state arrives
 *  - persists via the hook's save() and toasts the outcome
 *
 * The per-tab content lived inline in RequestSetup.tsx before it grew past
 * 2,500 LOC. Moving each tab into its own component makes the shell a thin
 * orchestrator and lets each editor own its loading/error/empty states.
 */
export function AttachmentSettingsEditor({ companyId, actorId }: Props) {
  const { settings, loading, save } = useAttachmentSettings(companyId);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(3);
  const [maxFiles, setMaxFiles] = useState(3);
  const [saving, setSaving] = useState(false);

  // Sync local buffer when the server snapshot changes (initial load or
  // post-save reload). useAttachmentSettings does not return a setter so we
  // mirror the values into local state to allow edits.
  useEffect(() => {
    setMaxFileSizeMb(settings.max_file_size_mb);
    setMaxFiles(settings.max_files_per_ticket);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save(
      { max_file_size_mb: maxFileSizeMb, max_files_per_ticket: maxFiles },
      actorId,
    );
    if (error) toast.error('Failed to save settings', { description: error });
    else toast.success('Attachment settings saved');
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Attachment Settings</p>
        <p className="text-sm text-muted-foreground">
          Control how many files requesters can attach and the per-file size cap. Changes take effect immediately.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings…
        </div>
      ) : (
        <div className="max-w-lg space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="attach-max-size">Maximum file size per attachment (MB)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="attach-max-size"
                type="number"
                min={1}
                max={50}
                value={maxFileSizeMb}
                onChange={(event) =>
                  setMaxFileSizeMb(
                    Math.min(50, Math.max(1, Number.parseInt(event.target.value, 10) || 1)),
                  )
                }
                className="h-9 w-24"
              />
              <span className="text-sm text-muted-foreground">MB (1 – 50)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Files larger than this will be rejected at upload time.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="attach-max-files">Maximum files per request</Label>
            <div className="flex items-center gap-3">
              <Input
                id="attach-max-files"
                type="number"
                min={1}
                max={10}
                value={maxFiles}
                onChange={(event) =>
                  setMaxFiles(
                    Math.min(10, Math.max(1, Number.parseInt(event.target.value, 10) || 1)),
                  )
                }
                className="h-9 w-24"
              />
              <span className="text-sm text-muted-foreground">files (1 – 10)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              How many files a requester can attach to a single request.
            </p>
          </div>

          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
