import { Loader2, LockKeyhole, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TicketInternalNoteRecord } from '@/services/ticketService';

interface TicketInternalNotesPanelProps {
  notes: TicketInternalNoteRecord[];
  draft: string;
  saving: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}

export function TicketInternalNotesPanel({
  notes,
  draft,
  saving,
  onDraftChange,
  onSend,
}: TicketInternalNotesPanelProps) {
  return (
    <section className="space-y-2 rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-1.5 text-amber-700 dark:text-amber-500">
          <LockKeyhole className="h-3 w-3" />
          Private Internal Notes
        </p>
        {notes.length > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {notes.length}
          </span>
        )}
      </div>

      {/* Composer only */}

      <div className="rounded-md border-2 border-amber-200 dark:border-amber-900/50 bg-background/50 p-2 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 transition-colors">
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Add an internal note. (Not visible to requester)"
          rows={3}
          disabled={saving}
          className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-1 resize-none placeholder:text-amber-900/40 dark:placeholder:text-amber-200/40"
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={onSend} disabled={saving || !draft.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Add note
        </Button>
      </div>
    </section>
  );
}
