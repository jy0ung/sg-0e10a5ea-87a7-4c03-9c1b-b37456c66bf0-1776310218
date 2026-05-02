import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { listAnnouncements, createAnnouncement, deleteAnnouncement } from '@/services/hrmsService';
import type { CreateAnnouncementInput, AnnouncementCategory, AnnouncementPriority } from '@/types';
import { Pin, Plus, Trash2, Megaphone } from 'lucide-react';
import { HRMS_MANAGER_ROLES } from '@/config/hrmsConfig';

const MANAGER_ROLES = HRMS_MANAGER_ROLES;

const PRIORITY_COLORS: Record<AnnouncementPriority, string> = {
  low:    'bg-gray-100 text-gray-500 border-gray-200',
  normal: 'bg-blue-50 text-blue-600 border-blue-100',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
};

const CATEGORY_ICONS: Record<AnnouncementCategory, string> = {
  general:   '📢',
  policy:    '📋',
  event:     '🎉',
  emergency: '🚨',
  holiday:   '🏖️',
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
  const { toast } = useToast();
  const isManager = MANAGER_ROLES.includes(user?.role as typeof MANAGER_ROLES[number]);

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

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Announcements"
        description="Company-wide communications and notices"
        breadcrumbs={[{ label: 'HRMS' }, { label: 'Announcements' }]}
        actions={
          isManager ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Post Announcement
            </Button>
          ) : undefined
        }
      />

      {/* Category filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'general', 'policy', 'event', 'emergency', 'holiday'] as const).map(cat => (
          <Button
            key={cat}
            variant={catFilter === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCatFilter(cat)}
            className="capitalize"
          >
            {cat !== 'all' && CATEGORY_ICONS[cat as AnnouncementCategory]} {cat}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <Megaphone className="h-8 w-8 opacity-30" />
            <p>No announcements</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(ann => (
            <Card key={ann.id} data-pinned={ann.pinned ? 'true' : 'false'} className={ann.pinned ? 'border-primary/50 shadow-sm' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CATEGORY_ICONS[ann.category]}</span>
                    <div>
                      <CardTitle className="text-base flex items-center gap-1.5">
                        {ann.pinned && <Pin aria-label="Pinned announcement" className="h-3.5 w-3.5 text-primary" />}
                        {ann.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {ann.authorName ?? 'HR'} · {timeAgo(ann.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`capitalize text-xs ${PRIORITY_COLORS[ann.priority]}`}>
                      {ann.priority}
                    </Badge>
                    {isManager && (
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(ann.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{ann.body}</p>
                {ann.expiresAt && (
                  <p className="text-xs text-muted-foreground mt-2">Expires: {ann.expiresAt.slice(0, 10)}</p>
                )}
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
                      <SelectItem key={c} value={c} className="capitalize">{CATEGORY_ICONS[c]} {c}</SelectItem>
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
              <Label>Expires At (optional)</Label>
              <Input type="date" value={form.expiresAt ?? ''} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value || undefined }))} />
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
