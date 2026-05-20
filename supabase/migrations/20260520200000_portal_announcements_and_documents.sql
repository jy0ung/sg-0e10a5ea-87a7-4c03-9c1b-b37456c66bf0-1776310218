-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Portal Announcements + Document Station
-- Scope: Internal Request module only — separate from HRMS announcements
-- ─────────────────────────────────────────────────────────────────────────────

-- ── portal_announcements ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_announcements (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  body              text        NOT NULL,
  announcement_type text        NOT NULL DEFAULT 'general'
    CHECK (announcement_type IN ('general','process_update','reminder','policy_note','maintenance','deadline')),
  priority          text        NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  audience_scope    text        NOT NULL DEFAULT 'all'
    CHECK (audience_scope IN ('all','admin_approver','requester_staff')),
  status            text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  is_pinned         boolean     NOT NULL DEFAULT false,
  publish_at        timestamptz,
  expires_at        timestamptz,
  created_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz
);

CREATE INDEX IF NOT EXISTS portal_announcements_company_status_idx
  ON public.portal_announcements (company_id, status);

CREATE INDEX IF NOT EXISTS portal_announcements_company_pinned_idx
  ON public.portal_announcements (company_id, is_pinned);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.portal_announcements_set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER portal_announcements_updated_at
  BEFORE UPDATE ON public.portal_announcements
  FOR EACH ROW EXECUTE FUNCTION public.portal_announcements_set_updated_at();

-- ── RLS: portal_announcements ────────────────────────────────────────────────

ALTER TABLE public.portal_announcements ENABLE ROW LEVEL SECURITY;

-- Setup roles (super_admin, company_admin, portal_admin) can read everything in their company
CREATE POLICY "portal_announcements: admin read all"
  ON public.portal_announcements FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- All other authenticated users can read published, non-expired announcements scoped to their company
CREATE POLICY "portal_announcements: member read published"
  ON public.portal_announcements FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND status = 'published'
    AND (publish_at IS NULL OR publish_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Only setup roles may insert
CREATE POLICY "portal_announcements: setup roles insert"
  ON public.portal_announcements FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- Only setup roles may update
CREATE POLICY "portal_announcements: setup roles update"
  ON public.portal_announcements FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- Only setup roles may delete
CREATE POLICY "portal_announcements: setup roles delete"
  ON public.portal_announcements FOR DELETE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- ── portal_documents ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_documents (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       text        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title            text        NOT NULL,
  description      text,
  category         text        NOT NULL DEFAULT 'general'
    CHECK (category IN ('form','template','sop','guideline','checklist','policy','general')),
  file_path        text,
  file_name        text,
  file_type        text,
  file_size        bigint,
  version          text        NOT NULL DEFAULT '1.0',
  effective_date   date,
  expires_at       date,
  is_pinned        boolean     NOT NULL DEFAULT false,
  status           text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','archived')),
  visibility_scope text        NOT NULL DEFAULT 'all'
    CHECK (visibility_scope IN ('all','admin_approver','requester_staff')),
  uploaded_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz
);

CREATE INDEX IF NOT EXISTS portal_documents_company_status_idx
  ON public.portal_documents (company_id, status);

CREATE INDEX IF NOT EXISTS portal_documents_company_category_idx
  ON public.portal_documents (company_id, category);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.portal_documents_set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER portal_documents_updated_at
  BEFORE UPDATE ON public.portal_documents
  FOR EACH ROW EXECUTE FUNCTION public.portal_documents_set_updated_at();

-- ── RLS: portal_documents ────────────────────────────────────────────────────

ALTER TABLE public.portal_documents ENABLE ROW LEVEL SECURITY;

-- Setup roles can read everything in their company
CREATE POLICY "portal_documents: admin read all"
  ON public.portal_documents FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- All authenticated members can read active documents in their company
CREATE POLICY "portal_documents: member read active"
  ON public.portal_documents FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > CURRENT_DATE)
  );

-- Only setup roles may insert
CREATE POLICY "portal_documents: setup roles insert"
  ON public.portal_documents FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- Only setup roles may update
CREATE POLICY "portal_documents: setup roles update"
  ON public.portal_documents FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- Only setup roles may delete
CREATE POLICY "portal_documents: setup roles delete"
  ON public.portal_documents FOR DELETE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- ── Storage: portal-documents bucket ─────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portal-documents',
  'portal-documents',
  false,
  52428800,  -- 50 MB
  ARRAY[
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
    'application/zip'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: all authenticated company members can download (read objects)
CREATE POLICY "portal_documents bucket: company member read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'portal-documents'
    AND (storage.foldername(name))[1] = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Storage RLS: setup roles can upload
CREATE POLICY "portal_documents bucket: setup roles upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portal-documents'
    AND (storage.foldername(name))[1] = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );

-- Storage RLS: setup roles can delete
CREATE POLICY "portal_documents bucket: setup roles delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portal-documents'
    AND (storage.foldername(name))[1] = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin','company_admin','portal_admin')
  );
