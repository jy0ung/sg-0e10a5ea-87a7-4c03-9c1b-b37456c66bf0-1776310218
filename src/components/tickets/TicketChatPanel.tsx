import { Loader2, MessageSquare, Paperclip, Send, SmilePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TicketActivityRecord } from '@/services/ticketService';

interface TicketChatPanelProps {
  activities: TicketActivityRecord[];
  currentUserId?: string | null;
  draft: string;
  saving: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onReplyAndWait?: () => void;
  onAttachFiles?: (files: File[]) => void;
  readOnly?: boolean;
}

const EMOJI_CHOICES = ['👍', '🙏', '✅', '⚠️'];

export function TicketChatPanel({
  draft,
  saving,
  onDraftChange,
  onSend,
  onReplyAndWait,
  onAttachFiles,
  readOnly = false,
}: TicketChatPanelProps) {
  return (
    <section className="space-y-2 rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-1.5 text-blue-600 dark:text-blue-500">
          <MessageSquare className="h-3 w-3" />
          Public Reply to Requester
        </p>
      </div>

      {/* Composer only */}

      {!readOnly && (
        <>
          <div className="rounded-md border-2 border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
            <Textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder="Write a message"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (draft.trim() && !saving) onSend(); }}}
              rows={3}
              disabled={saving}
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 py-1 resize-none placeholder:text-blue-900/40 dark:placeholder:text-blue-200/40"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {EMOJI_CHOICES.map((emoji) => (
                <Button
                  key={emoji}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onDraftChange(`${draft}${draft ? ' ' : ''}${emoji}`)}
                  disabled={saving}
                  aria-label={`Insert ${emoji}`}
                >
                  <SmilePlus className="sr-only" />
                  <span aria-hidden>{emoji}</span>
                </Button>
              ))}
              {onAttachFiles && (
                <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      if (event.target.files) onAttachFiles(Array.from(event.target.files));
                      event.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onReplyAndWait && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onReplyAndWait} disabled={saving || !draft.trim()}>
                  Reply & Wait
                </Button>
              )}
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onSend} disabled={saving || !draft.trim()}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Send message
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
