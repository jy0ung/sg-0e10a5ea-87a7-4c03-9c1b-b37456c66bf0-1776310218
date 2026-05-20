import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Megaphone, Pin, Plus, Pencil, Trash2, Archive, Loader2,
  ChevronDown, ChevronUp, Search, X,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { PORTAL_SETUP_ROLES } from '@/config/routeRoles';
import {
  listPortalAnnouncements,
  createPortalAnnouncement,
  updatePortalAnnouncement,
  archivePortalAnnouncement,
  deletePortalAnnouncement,
  type PortalAnnouncementRecord,
  type PortalAnnouncementType,
  type PortalAnnouncementPriority,
  type PortalAnnouncementAudience,
  type PortalAnnouncementStatus,
  type CreatePortalAnnouncementInput,
} from '@/services/portalAnnouncementService';

// ── Constants ─────────────────────────────────────────────────────────────────

const PORTAL_SETUP_ROLES_SET = new Set<string>(PORTAL_SETUP_ROLES);

const TYPE_LABELS: Record<PortalAnnouncementType, string> = {
  general:        'General',
  process_update: 'Process Update',
  reminder:       'Reminder',
  policy_note:    'Policy Note',
  maintenance:    'Maintenance',
  deadline:       'Deadline',
};

const PRIORITY_COLORS: Record<PortalAnnouncementPriority, string> = {
  low:    'bg-gray-100 text-gray-600 border-gray-200',
  normal: 'bg-blue-50 text-blue-700 border-blue-200',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_COLORS: Record<PortalAnnouncementStatus, string> = {
  draft:     'bg-yellow-50 text-yellow-700 border-yellow-200',
  published: 'bg-green-50 text-green-700 border-green-200',
  archived:  'bg-gray-100 text-gray-500 border-gray-200',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isExpired(record: PortalAnnouncementRecord): boolean {
  return !!record.expires_at && new Date(record.expires_at) <= new Date();
}

// ── Empty form defaults ───────────────────────────────────────────────────────

type FormState = CreatePortalAnnouncementInput;

const EMPTY_FORM: FormState = {
  title:             '',
  body:              '',
  announcement_type: 'general',
  priority:          'normal',
  audience_scope:    'all',
  status:            'draft',
  is_pinned:         false,
  publish_at:        null,
  expires_at:        null,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PortalAnnouncements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = PORTAL_SETUP_ROLES_SET.has(user?.role ?? '');

  // ── Data ──────────────────────────────────────────────────────────────────
  const queryKey = ['portal-announcements', user?.companyId] as const;
  const { data: all = [], isPending: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await listPortalAnnouncements(user!.companyId);
      if (res.error) toast.error('Failed to load announcements', { description: res.error });
      return res.data ?? [];
    },
    enabled: !!user?.companyId,
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [search, setSearch]                   = useState('');
  const [filterType, setFilterType]           = useState<PortalAnnouncementType | 'all'>('all');
  const [filterPriority, setFilterPriority]   = useState<PortalAnnouncementPriority | 'all'>('all');
  const [filterStatus, setFilterStatus]       = useState<PortalAnnouncementStatus | 'all'>('all');
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [showForm, setShowForm]               = useState(false);
  const [editingId, setEditingId]             = useState<string | null>(null);
  const [deletingId, setDeletingId]           = useState<string | null>(null);
  const [archivingId, setArchivingId]         = useState<string | null>(null);
  const [saving, setSaving]                   = useState(false);
  const [form, setForm]                       = useState<FormState>(EMPTY_FORM);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    return all
      .filter(a => {
        // Non-admins only see published, non-expired announcements
        if (!canManage) {
          if (a.status !== 'published') return false;
          if (a.publish_at && new Date(a.publish_at) > new Date()) return false;
          if (isExpired(a)) return false;
        }
        if (filterStatus !== 'all' && a.status !== filterStatus) return false;
        if (filterType !== 'all' && a.announcement_type !== filterType) return false;
        if (filterPriority !== 'all' && a.priority !== filterPriority) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          if (!a.title.toLowerCase().includes(q) && !a.body.toLowerCase().includes(q)) return false;
        }
        return true;
      });
  }, [all, canManage, filterStatus, filterType, filterPriority, search]);

  const pinned   = useMemo(() => visible.filter(a => a.is_pinned), [visible]);
  const unpinned = useMemo(() => visible.filter(a => !a.is_pinned), [visible]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(record: PortalAnnouncementRecord) {
    setForm({
      title:             record.title,
      body:              record.body,
      announcement_type: record.announcement_type,
      priority:          record.priority,
      audience_scope:    record.audience_scope,
      status:            record.status,
      is_pinned:         record.is_pinned,
      publish_at:        record.publish_at,
      expires_at:        record.expires_at,
    });
    setEditingId(record.id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function setFormField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !user.id) return;
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await updatePortalAnnouncement(editingId, user.companyId, user.id, form);
        if (error) throw new Error(error);
        toast.success('Announcement updated');
      } else {
        const { error } = await createPortalAnnouncement(user.companyId, user.id, form);
        if (error) throw new Error(error);
        toast.success('Announcement created');
      }
      closeForm();
      void queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(editingId ? 'Failed to update' : 'Failed to create', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!archivingId || !user?.companyId || !user.id) return;
    const { error } = await archivePortalAnnouncement(archivingId, user.companyId, user.id);
    if (error) toast.error('Failed to archive', { description: error });
    else toast.success('Announcement archived');
    setArchivingId(null);
    void queryClient.invalidateQueries({ queryKey });
  }

  async function handleDelete() {
    if (!deletingId || !user?.companyId) return;
    const { error } = await deletePortalAnnouncement(deletingId, user.companyId);
    if (error) toast.error('Failed to delete', { description: error });
    else toast.success('Announcement deleted');
    setDeletingId(null);
    void queryClient.invalidateQueries({ queryKey });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Announcements"
        description="Internal Request notices, process updates, and memos"
        breadcrumbs={[{ label: 'Internal Requests' }, { label: 'Announcements' }]}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Announcement
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search announcements..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={filterType} onValueChange={v => setFilterType(v as typeof filterType)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(Object.keys(TYPE_LABELS) as PortalAnnouncementType[]).map(t => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={v => setFilterPriority(v as typeof filterPriority)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        {canManage && (
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading announcements…
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center text-muted-foreground">
            <Megaphone className="h-10 w-10 opacity-30" />
            <p className="text-sm">No announcements found.</p>
            {canManage && (
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create the first one
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Pinned */}
          {pinned.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
                <Pin className="h-3.5 w-3.5" /> Pinned
              </p>
              {pinned.map(a => (
                <AnnouncementCard
                  key={a.id}
                  record={a}
                  canManage={canManage}
                  expanded={expandedId === a.id}
                  onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  onEdit={() => openEdit(a)}
                  onArchive={() => setArchivingId(a.id)}
                  onDelete={() => setDeletingId(a.id)}
                  pinned
                />
              ))}
            </div>
          )}

          {/* Regular */}
          {unpinned.map(a => (
            <AnnouncementCard
              key={a.id}
              record={a}
              canManage={canManage}
              expanded={expandedId === a.id}
              onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
              onEdit={() => openEdit(a)}
              onArchive={() => setArchivingId(a.id)}
              onDelete={() => setDeletingId(a.id)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Announcement' : 'New Announcement'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="ann-title"
                value={form.title}
                onChange={e => setFormField('title', e.target.value)}
                placeholder="Announcement title"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ann-body">Body <span className="text-destructive">*</span></Label>
              <Textarea
                id="ann-body"
                value={form.body}
                onChange={e => setFormField('body', e.target.value)}
                placeholder="Write the announcement content here…"
                rows={5}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.announcement_type}
                  onValueChange={v => setFormField('announcement_type', v as PortalAnnouncementType)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as PortalAnnouncementType[]).map(t => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={v => setFormField('priority', v as PortalAnnouncementPriority)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select
                  value={form.audience_scope}
                  onValueChange={v => setFormField('audience_scope', v as PortalAnnouncementAudience)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="admin_approver">Admins &amp; Approvers</SelectItem>
                    <SelectItem value="requester_staff">Requesters &amp; Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={v => setFormField('status', v as PortalAnnouncementStatus)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ann-publish">Publish At</Label>
                <Input
                  id="ann-publish"
                  type="datetime-local"
                  value={form.publish_at ? form.publish_at.slice(0, 16) : ''}
                  onChange={e => setFormField('publish_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-expires">Expires At</Label>
                <Input
                  id="ann-expires"
                  type="datetime-local"
                  value={form.expires_at ? form.expires_at.slice(0, 16) : ''}
                  onChange={e => setFormField('expires_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="ann-pinned"
                checked={form.is_pinned}
                onCheckedChange={v => setFormField('is_pinned', v)}
              />
              <Label htmlFor="ann-pinned">Pin this announcement</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {editingId ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <AlertDialog open={!!archivingId} onOpenChange={open => { if (!open) setArchivingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              The announcement will be hidden from all users. You can restore it by editing its status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={open => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The announcement will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── AnnouncementCard ──────────────────────────────────────────────────────────

interface AnnouncementCardProps {
  record: PortalAnnouncementRecord;
  canManage: boolean;
  expanded: boolean;
  pinned?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function AnnouncementCard({
  record, canManage, expanded, pinned = false,
  onToggle, onEdit, onArchive, onDelete,
}: AnnouncementCardProps) {
  const expired = isExpired(record);

  return (
    <Card className={[
      'transition-all',
      pinned ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/10' : '',
      expired ? 'opacity-60' : '',
    ].join(' ')}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-start gap-2">
          {pinned && <Pin className="h-3.5 w-3.5 mt-1 text-amber-600 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold leading-snug flex-1 min-w-0 break-words">
                {record.title}
              </CardTitle>
              <div className="flex gap-1.5 flex-wrap shrink-0">
                <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[record.priority]}`}>
                  {record.priority.charAt(0).toUpperCase() + record.priority.slice(1)}
                </Badge>
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  {TYPE_LABELS[record.announcement_type]}
                </Badge>
                {canManage && (
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[record.status]}`}>
                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                  </Badge>
                )}
                {expired && (
                  <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500 border-gray-200">
                    Expired
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {timeAgo(record.created_at)}
              {record.expires_at && !expired && (
                <> · Expires {new Date(record.expires_at).toLocaleDateString()}</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {canManage && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {record.status !== 'archived' && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onArchive} title="Archive">
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={onDelete} title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-3 pt-0">
          <div className="border-t pt-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {record.body}
          </div>
          {(record.audience_scope !== 'all') && (
            <p className="mt-2 text-xs text-muted-foreground">
              Audience: {record.audience_scope === 'admin_approver' ? 'Admins & Approvers' : 'Requesters & Staff'}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
