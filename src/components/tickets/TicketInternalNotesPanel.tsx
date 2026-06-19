import { formatDistanceToNow } from 'date-fns';
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
        <p className="eyebrow flex items-center gap-1.5">
          <LockKeyhole className="h-3 w-3" />
          Internal notes
        </p>
        {notes.length > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {notes.length}
          </span>
        )}
      </div>

      <div className="max-h-52 space-y-2 overflow-y-auto rounded-md bg-background/70 p-2">
        {notes.length === 0 ? (
          <p className="px-1 py-3 text-center text-xs text-muted-foreground">No internal notes yet.</p>
        ) : notes.map((note) => (
          <div key={note.id} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
            <p className="whitespace-pre-line leading-5 text-foreground">{note.note}</p>
            {note.mentions.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Mentions: {note.mentions.join(', ')}</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {note.author_name ?? 'Internal user'} · {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
            </p>
          </div>
        ))}
      </div>

      <Textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Add an internal note. Use @name or @email to mention someone."
        rows={3}
        disabled={saving}
      />
      <div className="flex justify-end">
        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={onSend} disabled={saving || !draft.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Add note
        </Button>
      </div>
    </section>
  );
}
