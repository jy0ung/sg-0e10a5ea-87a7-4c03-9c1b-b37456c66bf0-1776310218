import React, { useState } from 'react';
import { Download, Loader2, Paperclip } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { getAttachmentSignedUrl, type TicketAttachmentRecord } from '@flc/platform-services';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TicketAttachmentList({ attachments }: { attachments: TicketAttachmentRecord[] }) {
  const [openingId, setOpeningId] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  const openAttachment = async (attachment: TicketAttachmentRecord) => {
    setOpeningId(attachment.id);
    const { data, error } = await getAttachmentSignedUrl(attachment.file_path);
    setOpeningId(null);

    if (error || !data) {
      toast.error(error ?? 'Unable to open attachment');
      return;
    }

    window.open(data, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="eyebrow flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5" />
        Attachments ({attachments.length})
      </p>
      <div className="mt-2 divide-y divide-border">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{attachment.file_name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file_size)}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-2"
              onClick={() => void openAttachment(attachment)}
              disabled={openingId === attachment.id}
            >
              {openingId === attachment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Open
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}