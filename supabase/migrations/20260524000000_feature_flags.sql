-- ─── Feature Flags ───────────────────────────────────────────────────────────
--
-- Owned, server-side feature-flag store for Phase 0 of the product
-- reconstruction. Every new surface shipped from Phase 1 onwards is gated
-- behind a flag and rolled out per-company.
--
-- Design notes:
--   • A flag is identified by `code` (e.g. 'phase3b.gl-reports'). Codes are
--     globally namespaced; the table holds one row per (company_id, code).
--   • `company_id` is NULL for global defaults. Resolution: per-company row
--     takes precedence; otherwise the NULL-company row is used; otherwise
--     the hook returns the default passed in.
--   • `rollout_pct` allows percentage rollouts. The hook combines it with a
--     stable hash of (user_id, code) so a given user always sees the same
--     state until the percentage moves past them.
--   • Writes are restricted to super_admin / company_admin so non-admins
--     cannot enable in-progress surfaces in the UI. RLS is the security
--     boundary; the hook only renders.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text,                                          -- NULL = global default
  code          text          NOT NULL,
  enabled       boolean       NOT NULL DEFAULT false,
  rollout_pct   integer       NOT NULL DEFAULT 100
                  CHECK (rollout_pct BETWEEN 0 AND 100),
  description   text,
  updated_by    uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

-- One row per (company_id, code). NULL company_id means "global default".
-- Partial unique indexes keep the NULL case unique without needing a sentinel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_global_code
  ON public.feature_flags (code)
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_company_code
  ON public.feature_flags (company_id, code)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feature_flags_code
  ON public.feature_flags (code);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- Authenticated members of a company can read their company's flags AND any
-- global default row. This is the resolution input for useFeatureFlag.
CREATE POLICY "Members read company and global feature_flags"
  ON public.feature_flags FOR SELECT
  USING (
    company_id IS NULL
    OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND access_scope = 'global'
    )
  );

-- Only super_admin (global) and company_admin (same company) can insert.
CREATE POLICY "Admins insert feature_flags"
  ON public.feature_flags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR (p.role = 'company_admin' AND p.company_id = public.feature_flags.company_id)
        )
    )
  );

-- Only super_admin and company_admin (same company) can update.
CREATE POLICY "Admins update feature_flags"
  ON public.feature_flags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR (p.role = 'company_admin' AND p.company_id = public.feature_flags.company_id)
        )
    )
  );

-- Only super_admin and company_admin (same company) can delete a flag row.
-- Prefer setting enabled = false over deleting, to preserve audit history.
CREATE POLICY "Admins delete feature_flags"
  ON public.feature_flags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR (p.role = 'company_admin' AND p.company_id = public.feature_flags.company_id)
        )
    )
  );

-- ─── updated_at trigger ──────────────────────────────────────────────────────

CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Seeded flags ────────────────────────────────────────────────────────────
-- These are the Phase 1+ surfaces named in PRODUCT_RECONSTRUCTION.md. All
-- default to disabled. Admins flip them on per company when ready.

INSERT INTO public.feature_flags (company_id, code, enabled, description)
VALUES
  (NULL, 'phase1.role-permissions-server', false, 'Read role section permissions from role_section_permissions table instead of localStorage.'),
  (NULL, 'phase2.shared-shell', false, 'Use the unified @flc/shell package for main + HRMS layouts.'),
  (NULL, 'phase3a.import-review-v2', false, 'Wire import review queue decisions end-to-end.'),
  (NULL, 'phase3b.gl-reports', false, 'Financial reporting UI: P&L, balance sheet, AR/AP aging, period close.'),
  (NULL, 'phase3c.dms-sync-ops', false, 'DMS Sync Operations dashboard and replay tooling.'),
  (NULL, 'phase3d.reconciliation-queue', false, 'Reconciliation review queue UI for DMS/UBS/legacy evidence.'),
  (NULL, 'phase3e.purchase-orders', false, 'Purchase orders and 3-way match.'),
  (NULL, 'phase3f.leads', false, 'Lead intake surface backed by dms_raw_leads / dms_raw_prospects.'),
  (NULL, 'phase4.unified-inbox', false, 'Unified /inbox combining approvals, reconciliation, tickets, notifications.'),
  (NULL, 'phase4.role-home', false, 'Role-aware home page with per-role curated KPI defaults.')
ON CONFLICT DO NOTHING;
