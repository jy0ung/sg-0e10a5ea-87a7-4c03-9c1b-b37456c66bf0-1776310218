import { formatDistanceToNow } from 'date-fns';
import { Loader2, MessageSquare, Paperclip, Send, SmilePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
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
  activities,
  currentUserId,
  draft,
  saving,
  onDraftChange,
  onSend,
  onReplyAndWait,
  onAttachFiles,
  readOnly = false,
}: TicketChatPanelProps) {
  const messages = activities.filter((activity) => activity.event_type === 'comment_added').slice().reverse();

  return (
    <section className="space-y-2 rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" />
          Discussion
        </p>
        {messages.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {messages.length}
          </span>
        )}
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md bg-muted/20 p-2">
        {messages.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">No discussion messages yet.</p>
        ) : messages.map((message) => {
          const mine = message.actor_id === currentUserId;
          const metadata = message.metadata ?? {};
          const attachmentNames = Array.isArray(metadata.attachment_names) ? metadata.attachment_names : [];
          return (
            <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                  mine
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm border border-border bg-card text-foreground',
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] opacity-80">
                  <span className="font-medium">{message.actor_name ?? 'User'}</span>
                  <span>Internal request</span>
                </div>
                <p className="whitespace-pre-line leading-5">{message.message}</p>
                {attachmentNames.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {attachmentNames.map((name) => (
                      <span key={String(name)} className="flex items-center gap-1 text-xs opacity-90">
                        <Paperclip className="h-3 w-3" />
                        {String(name)}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[10px] opacity-70">
                  {message.created_at ? formatDistanceToNow(new Date(message.created_at), { addSuffix: true }) : ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <>
          <Textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Write a message (Ctrl+Enter to send)"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (draft.trim() && !saving) onSend(); }}}
            rows={3}
            disabled={saving}
          />
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
