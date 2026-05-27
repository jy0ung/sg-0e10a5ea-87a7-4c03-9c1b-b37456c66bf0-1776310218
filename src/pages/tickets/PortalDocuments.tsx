import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FolderOpen, Pin, Pencil, Trash2, Archive, Loader2,
  Download, Search, X, Upload, FileText, File,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { canManagePortalSetup } from '@/lib/portalAccess';
import {
  listPortalDocuments,
  uploadPortalDocument,
  updatePortalDocument,
  archivePortalDocument,
  deletePortalDocument,
  getPortalDocumentSignedUrl,
  type PortalDocumentRecord,
  type PortalDocumentCategory,
  type PortalDocumentStatus,
  type PortalDocumentVisibility,
  type CreatePortalDocumentInput,
} from '@/services/portalDocumentService';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'application/zip',
]);

const CATEGORY_LABELS: Record<PortalDocumentCategory, string> = {
  form:      'Form',
  template:  'Template',
  sop:       'SOP',
  guideline: 'Guideline',
  checklist: 'Checklist',
  policy:    'Policy',
  general:   'General',
};

const CATEGORY_COLORS: Record<PortalDocumentCategory, string> = {
  form:      'bg-blue-50 text-blue-700 border-blue-200',
  template:  'bg-violet-50 text-violet-700 border-violet-200',
  sop:       'bg-orange-50 text-orange-700 border-orange-200',
  guideline: 'bg-teal-50 text-teal-700 border-teal-200',
  checklist: 'bg-green-50 text-green-700 border-green-200',
  policy:    'bg-red-50 text-red-700 border-red-200',
  general:   'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_COLORS: Record<PortalDocumentStatus, string> = {
  active:   'bg-green-50 text-green-700 border-green-200',
  inactive: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  archived: 'bg-gray-100 text-gray-500 border-gray-200',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.startsWith('image/')) return File;
  return File;
}

function isDocExpired(record: PortalDocumentRecord): boolean {
  return !!record.expires_at && new Date(record.expires_at) <= new Date();
}

// ── Empty form defaults ───────────────────────────────────────────────────────

interface UploadForm extends CreatePortalDocumentInput {
  file: File | null;
}

const EMPTY_UPLOAD_FORM: UploadForm = {
  title:            '',
  description:      null,
  category:         'general',
  version:          '1.0',
  effective_date:   null,
  expires_at:       null,
  is_pinned:        false,
  status:           'active',
  visibility_scope: 'all',
  file:             null,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PortalDocuments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = canManagePortalSetup(user);

  // ── Data ──────────────────────────────────────────────────────────────────
  const queryKey = ['portal-documents', user?.companyId] as const;
  const { data: all = [], isPending: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await listPortalDocuments(user!.companyId);
      if (res.error) toast.error('Failed to load documents', { description: res.error });
      return res.data ?? [];
    },
    enabled: !!user?.companyId,
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [search, setSearch]                 = useState('');
  const [filterCategory, setFilterCategory] = useState<PortalDocumentCategory | 'all'>('all');
  const [filterStatus, setFilterStatus]     = useState<PortalDocumentStatus | 'all'>('all');
  const [showUpload, setShowUpload]         = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<PortalDocumentRecord | null>(null);
  const [archivingId, setArchivingId]       = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [downloading, setDownloading]       = useState<string | null>(null);
  const [form, setForm]                     = useState<UploadForm>(EMPTY_UPLOAD_FORM);
  const fileInputRef                        = useRef<HTMLInputElement>(null);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    return all.filter(d => {
      if (!canManage) {
        if (d.status !== 'active') return false;
        if (isDocExpired(d)) return false;
      }
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (filterCategory !== 'all' && d.category !== filterCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !d.title.toLowerCase().includes(q) &&
          !(d.description ?? '').toLowerCase().includes(q) &&
          !(d.file_name ?? '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [all, canManage, filterStatus, filterCategory, search]);

  const pinned   = useMemo(() => visible.filter(d => d.is_pinned), [visible]);
  const unpinned = useMemo(() => visible.filter(d => !d.is_pinned), [visible]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openUpload() {
    setForm(EMPTY_UPLOAD_FORM);
    setEditingId(null);
    setShowUpload(true);
  }

  function openEdit(record: PortalDocumentRecord) {
    setForm({
      title:            record.title,
      description:      record.description,
      category:         record.category,
      version:          record.version,
      effective_date:   record.effective_date,
      expires_at:       record.expires_at,
      is_pinned:        record.is_pinned,
      status:           record.status,
      visibility_scope: record.visibility_scope,
      file:             null, // Cannot change file in edit — upload new version instead
    });
    setEditingId(record.id);
    setShowUpload(true);
  }

  function closeForm() {
    setShowUpload(false);
    setEditingId(null);
    setForm(EMPTY_UPLOAD_FORM);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function setFormField<K extends keyof UploadForm>(key: K, value: UploadForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast.error('File type not supported');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('File exceeds 50 MB limit');
      e.target.value = '';
      return;
    }
    setFormField('file', file);
    if (!form.title) setFormField('title', file.name.replace(/\.[^.]+$/, ''));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.companyId || !user.id) return;
    if (!form.title.trim()) { toast.error('Title is required'); return; }

    const { file, ...input } = form;

    setSaving(true);
    try {
      if (editingId) {
        // Update metadata only
        const { error } = await updatePortalDocument(editingId, user.companyId, user.id, input);
        if (error) throw new Error(error);
        toast.success('Document updated');
      } else {
        // New upload requires a file
        if (!file) { toast.error('Please select a file'); setSaving(false); return; }
        const { error } = await uploadPortalDocument(file, user.companyId, user.id, input);
        if (error) throw new Error(error);
        toast.success('Document uploaded');
      }
      closeForm();
      void queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(editingId ? 'Failed to update' : 'Failed to upload', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(record: PortalDocumentRecord) {
    if (!record.file_path) { toast.error('No file attached to this document'); return; }
    setDownloading(record.id);
    const { data: url, error } = await getPortalDocumentSignedUrl(record.file_path);
    setDownloading(null);
    if (error || !url) { toast.error('Failed to generate download link', { description: error ?? undefined }); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = record.file_name ?? 'download';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleArchive() {
    if (!archivingId || !user?.companyId || !user.id) return;
    const { error } = await archivePortalDocument(archivingId, user.companyId, user.id);
    if (error) toast.error('Failed to archive', { description: error });
    else toast.success('Document archived');
    setArchivingId(null);
    void queryClient.invalidateQueries({ queryKey });
  }

  async function handleDelete() {
    if (!deletingId || !user?.companyId) return;
    const { error } = await deletePortalDocument(deletingId, user.companyId, deletingRecord?.file_path ?? null);
    if (error) toast.error('Failed to delete', { description: error });
    else toast.success('Document deleted');
    setDeletingId(null);
    setDeletingRecord(null);
    void queryClient.invalidateQueries({ queryKey });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Documents &amp; Forms"
        description="Downloadable forms, templates, SOPs, and supporting documents"
        breadcrumbs={[{ label: 'Internal Requests' }, { label: 'Documents & Forms' }]}
        actions={
          canManage ? (
            <Button size="sm" onClick={openUpload}>
              <Upload className="h-4 w-4 mr-1.5" />
              Upload Document
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents…"
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

        <Select value={filterCategory} onValueChange={v => setFilterCategory(v as typeof filterCategory)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.keys(CATEGORY_LABELS) as PortalDocumentCategory[]).map(c => (
              <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canManage && (
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading documents…
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 opacity-30" />
            <p className="text-sm">No documents found.</p>
            {canManage && (
              <Button variant="outline" size="sm" onClick={openUpload}>
                <Upload className="h-4 w-4 mr-1.5" />
                Upload the first document
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
              {pinned.map(d => (
                <DocumentRow
                  key={d.id}
                  record={d}
                  canManage={canManage}
                  downloading={downloading === d.id}
                  pinned
                  onDownload={() => handleDownload(d)}
                  onEdit={() => openEdit(d)}
                  onArchive={() => setArchivingId(d.id)}
                  onDelete={() => { setDeletingId(d.id); setDeletingRecord(d); }}
                />
              ))}
            </div>
          )}

          {unpinned.map(d => (
            <DocumentRow
              key={d.id}
              record={d}
              canManage={canManage}
              downloading={downloading === d.id}
              onDownload={() => handleDownload(d)}
              onEdit={() => openEdit(d)}
              onArchive={() => setArchivingId(d.id)}
              onDelete={() => { setDeletingId(d.id); setDeletingRecord(d); }}
            />
          ))}
        </div>
      )}

      {/* Upload / Edit Dialog */}
      <Dialog open={showUpload} onOpenChange={open => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Document Metadata' : 'Upload Document'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {!editingId && (
              <div className="space-y-1.5">
                <Label htmlFor="doc-file">File <span className="text-destructive">*</span></Label>
                <Input
                  id="doc-file"
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.zip"
                  onChange={handleFileChange}
                  required={!editingId}
                />
                <p className="text-xs text-muted-foreground">
                  Max 50 MB · PDF, Word, Excel, PowerPoint, TXT, CSV, PNG, JPG, ZIP
                </p>
                {form.file && (
                  <p className="text-xs text-green-700">
                    {form.file.name} ({formatBytes(form.file.size)})
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="doc-title"
                value={form.title}
                onChange={e => setFormField('title', e.target.value)}
                placeholder="Document title"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-description">Description</Label>
              <Textarea
                id="doc-description"
                value={form.description ?? ''}
                onChange={e => setFormField('description', e.target.value || null)}
                placeholder="Brief description of this document"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={v => setFormField('category', v as PortalDocumentCategory)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_LABELS) as PortalDocumentCategory[]).map(c => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-version">Version</Label>
                <Input
                  id="doc-version"
                  value={form.version}
                  onChange={e => setFormField('version', e.target.value)}
                  placeholder="e.g. 1.0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="doc-effective">Effective Date</Label>
                <Input
                  id="doc-effective"
                  type="date"
                  value={form.effective_date ?? ''}
                  onChange={e => setFormField('effective_date', e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-expires">Expires At</Label>
                <Input
                  id="doc-expires"
                  type="date"
                  value={form.expires_at ?? ''}
                  onChange={e => setFormField('expires_at', e.target.value || null)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={v => setFormField('status', v as PortalDocumentStatus)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Visibility</Label>
                <Select
                  value={form.visibility_scope}
                  onValueChange={v => setFormField('visibility_scope', v as PortalDocumentVisibility)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="admin_approver">Admins &amp; Approvers</SelectItem>
                    <SelectItem value="requester_staff">Requesters &amp; Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="doc-pinned"
                checked={form.is_pinned}
                onCheckedChange={v => setFormField('is_pinned', v)}
              />
              <Label htmlFor="doc-pinned">Pin this document</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {editingId ? 'Save Changes' : 'Upload'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <AlertDialog open={!!archivingId} onOpenChange={open => { if (!open) setArchivingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive document?</AlertDialogTitle>
            <AlertDialogDescription>
              The document will be hidden from users. You can restore it by editing its status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={open => { if (!open) { setDeletingId(null); setDeletingRecord(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the document and its uploaded file. This action cannot be undone.
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

// ── DocumentRow ───────────────────────────────────────────────────────────────

interface DocumentRowProps {
  record: PortalDocumentRecord;
  canManage: boolean;
  downloading: boolean;
  pinned?: boolean;
  onDownload: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function DocumentRow({
  record, canManage, downloading, pinned = false,
  onDownload, onEdit, onArchive, onDelete,
}: DocumentRowProps) {
  const expired = isDocExpired(record);
  const FileIcon = fileIcon(record.file_type);

  return (
    <Card className={[
      pinned ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/10' : '',
      expired ? 'opacity-60' : '',
    ].join(' ')}>
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <div className="shrink-0 text-muted-foreground">
          <FileIcon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {pinned && <Pin className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
            <p className="text-sm font-medium truncate">{record.title}</p>
            <Badge variant="outline" className={`text-xs shrink-0 ${CATEGORY_COLORS[record.category]}`}>
              {CATEGORY_LABELS[record.category]}
            </Badge>
            {canManage && (
              <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[record.status]}`}>
                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
              </Badge>
            )}
            {expired && (
              <Badge variant="outline" className="text-xs shrink-0 bg-gray-100 text-gray-500 border-gray-200">
                Expired
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
            {record.description && (
              <span className="truncate max-w-xs">{record.description}</span>
            )}
            <span>v{record.version}</span>
            {record.file_name && <span>{record.file_name}</span>}
            {record.file_size && <span>{formatBytes(record.file_size)}</span>}
            {record.effective_date && (
              <span>Effective: {new Date(record.effective_date).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {record.file_path && (
            <Button
              variant="outline" size="sm"
              className="h-7 px-2 text-xs"
              onClick={onDownload}
              disabled={downloading}
            >
              {downloading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              <span className="ml-1 hidden sm:inline">Download</span>
            </Button>
          )}

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
        </div>
      </CardContent>
    </Card>
  );
}
