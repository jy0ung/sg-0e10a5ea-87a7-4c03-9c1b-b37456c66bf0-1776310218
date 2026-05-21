import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useHrmsAccess } from '@/hooks/useHrmsAccess';
import { listAnnouncements, createAnnouncement, deleteAnnouncement } from '@/services/hrmsService';
import type { CreateAnnouncementInput, AnnouncementCategory, AnnouncementPriority } from '@/types';
import { Pin, Plus, Trash2, Megaphone } from 'lucide-react';

const PRIORITY_COLORS: Record<AnnouncementPriority, string> = {
  low:    'bg-gray-100 text-gray-500 border-gray-200',
  normal: 'bg-blue-50 text-blue-600 border-blue-100',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
};

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  general:   'General',
  policy:    'Policy',
  event:     'Event',
  emergency: 'Emergency',
  holiday:   'Holiday',
};

function timeAgo(isoDate: string) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 60)   return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)  return `${hours}h ago`;
  const days  = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Announcements() {
  const { user } = useAuth();
  const hrmsAccess = useHrmsAccess();
  const { toast } = useToast();
  const canManageAnnouncements = hrmsAccess.canManageAnnouncements;

  const queryClient = useQueryClient();
  const { data: announcements = [], isPending: loading } = useQuery({
    queryKey: ['announcements', user?.companyId],
    queryFn: async () => {
      const res = await listAnnouncements(user!.companyId);
      if (res.error) toast({ title: 'Error', description: res.error, variant: 'destructive' });
      return res.data;
    },
    enabled: !!user?.companyId,
  });
  const [showCreate, setShowCreate]       = useState(false);
  const [deleting, setDeleting]           = useState<string | null>(null);
  const [catFilter, setCatFilter]         = useState<AnnouncementCategory | 'all'>('all');

  const [form, setForm] = useState<Partial<CreateAnnouncementInput>>({
    category: 'general', priority: 'normal', pinned: false,
  });

  const filtered = catFilter === 'all' ? announcements : announcements.filter(a => a.category === catFilter);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !user.id || !form.title || !form.body) return;
    const { error } = await createAnnouncement(user.companyId, user.id, form as CreateAnnouncementInput);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Announcement posted' });
    setShowCreate(false);
    setForm({ category: 'general', priority: 'normal', pinned: false });
    void queryClient.invalidateQueries({ queryKey: ['announcements', user?.companyId] });
  }

  async function handleDelete(id: string) {
    const { error } = await deleteAnnouncement(id, user!.companyId, user?.id);
    if (error) { toast({ title: 'Error', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Announcement deleted' });
    setDeleting(null);
    void queryClient.invalidateQueries({ queryKey: ['announcements', user?.companyId] });
  }

  const pinned = filtered.filter((a) => a.pinned);
  const regular = filtered.filter((a) => !a.pinned);
  const sorted = [...pinned, ...regular];

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Announcements"
        description="Company-wide communications and notices"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Announcements' }]}
        actions={
          canManageAnnouncements ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Post Announcement
            </Button>
          ) : undefined
        }
      />

      {/* Category filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'general', 'policy', 'event', 'emergency', 'holiday'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCatFilter(cat)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              catFilter === cat
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {cat === 'all' ? `All (${announcements.length})` : CATEGORY_LABELS[cat as AnnouncementCategory]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-2 shadow-sm">
              <div className="flex gap-2 mb-3">
                <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                <div className="h-5 w-12 rounded-full bg-muted animate-pulse" />
              </div>
              <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-muted/60 animate-pulse" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Megaphone className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No announcements</p>
            <p className="text-sm text-muted-foreground">
              {catFilter === 'all' ? 'There are no announcements yet.' : `No ${CATEGORY_LABELS[catFilter as AnnouncementCategory]} announcements.`}
            </p>
          </div>
          {canManageAnnouncements && (
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Post first announcement
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sorted.map((ann) => (
            <Card
              key={ann.id}
              className={`group overflow-hidden shadow-sm transition-all hover:shadow-md ${
                ann.pinned
                  ? 'border-primary/40 bg-gradient-to-br from-primary/4 via-background to-background'
                  : ann.priority === 'urgent'
                    ? 'border-red-200/60 dark:border-red-800/30'
                    : ''
              }`}
            >
              <CardContent className="p-5">
                {/* Meta row */}
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {ann.pinned && (
                    <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5">
                      <Pin className="h-2.5 w-2.5" /> Pinned
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] capitalize px-1.5 bg-muted/50">
                    {CATEGORY_LABELS[ann.category]}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] capitalize px-1.5 ${PRIORITY_COLORS[ann.priority]}`}>
                    {ann.priority}
                  </Badge>
                </div>

                {/* Title */}
                <h3 className="mb-1.5 font-semibold leading-snug text-foreground">{ann.title}</h3>

                {/* Body */}
                <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{ann.body}</p>

                {/* Footer */}
                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <div className="text-xs text-muted-foreground/70">
                    <span className="font-medium text-muted-foreground">{ann.authorName ?? 'HR'}</span>
                    {' · '}{timeAgo(ann.createdAt)}
                    {ann.expiresAt && ` · Expires ${ann.expiresAt.slice(0, 10)}`}
                  </div>
                  {canManageAnnouncements && (
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={() => setDeleting(ann.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Post Announcement</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title ?? ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="Announcement title" />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea value={form.body ?? ''} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required rows={5} placeholder="Write your announcement here..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category ?? 'general'} onValueChange={v => setForm(f => ({ ...f, category: v as AnnouncementCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['general','policy','event','emergency','holiday'] as AnnouncementCategory[]).map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority ?? 'normal'} onValueChange={v => setForm(f => ({ ...f, priority: v as AnnouncementPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['low','normal','high','urgent'] as AnnouncementPriority[]).map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-expires-at">Expires At (optional)</Label>
              <Input id="announcement-expires-at" type="date" value={form.expiresAt ?? ''} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value || undefined }))} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pinned"
                checked={form.pinned ?? false}
                onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="pinned">Pin this announcement</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit">Post</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleting} onOpenChange={v => { if (!v) setDeleting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Announcement</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this announcement? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleting && handleDelete(deleting)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
