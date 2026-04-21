-- ============================================================================
-- Phase 0 — Stop-the-bleed RLS hotfix
--
-- Closes cross-tenant read/write policies that accumulated across prior
-- migrations. Every authenticated caller is scoped to their own
-- `profiles.company_id` (or global when `access_scope = 'global'`).
--
-- Covered tables:
--   vehicles, import_batches, quality_issues, sla_policies,
--   companies, branches,
--   audit_logs, application_logs,
--   notifications,
--   finance_companies, insurance_companies, vehicle_models, vehicle_colours,
--   tin_types, registration_fees, road_tax_fees, inspection_fees,
--   handling_fees, additional_items, payment_types, banks, suppliers,
--   dealers, user_groups, dealer_invoices, official_receipts,
--   departments, job_titles, public_holidays,
--   approval_flows, approval_steps
-- ============================================================================

-- ─── 1. Helper functions (SECURITY DEFINER, no recursion) ───────────────────

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_access_scope()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT access_scope FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_same_company(target_company_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND (p.access_scope = 'global' OR p.company_id = target_company_id)
  );
$$;

-- ─── 2. vehicles / import_batches / quality_issues / sla_policies ───────────

-- Drop every known permissive policy on these tables (idempotent).
DROP POLICY IF EXISTS "vehicles_select_all"   ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_insert_auth"  ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_update_auth"  ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_delete_auth"  ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_scoped_read"  ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_scoped_write" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_scoped_update" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_scoped_delete" ON public.vehicles;

CREATE POLICY "vehicles_tenant_select" ON public.vehicles
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

CREATE POLICY "vehicles_tenant_insert" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_same_company(company_id));

CREATE POLICY "vehicles_tenant_update" ON public.vehicles
  FOR UPDATE TO authenticated
  USING      (public.is_same_company(company_id))
  WITH CHECK (public.is_same_company(company_id));

CREATE POLICY "vehicles_tenant_delete" ON public.vehicles
  FOR DELETE TO authenticated
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager')
  );

-- import_batches
DROP POLICY IF EXISTS "import_batches_select_all"  ON public.import_batches;
DROP POLICY IF EXISTS "import_batches_insert_auth" ON public.import_batches;
DROP POLICY IF EXISTS "import_batches_update_auth" ON public.import_batches;
DROP POLICY IF EXISTS "import_batches_delete_auth" ON public.import_batches;

CREATE POLICY "import_batches_tenant_select" ON public.import_batches
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));
CREATE POLICY "import_batches_tenant_insert" ON public.import_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.is_same_company(company_id));
CREATE POLICY "import_batches_tenant_update" ON public.import_batches
  FOR UPDATE TO authenticated
  USING      (public.is_same_company(company_id))
  WITH CHECK (public.is_same_company(company_id));
CREATE POLICY "import_batches_tenant_delete" ON public.import_batches
  FOR DELETE TO authenticated
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager')
  );

-- quality_issues
DROP POLICY IF EXISTS "quality_issues_select_all"  ON public.quality_issues;
DROP POLICY IF EXISTS "quality_issues_insert_auth" ON public.quality_issues;
DROP POLICY IF EXISTS "quality_issues_update_auth" ON public.quality_issues;
DROP POLICY IF EXISTS "quality_issues_delete_auth" ON public.quality_issues;

CREATE POLICY "quality_issues_tenant_select" ON public.quality_issues
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));
CREATE POLICY "quality_issues_tenant_insert" ON public.quality_issues
  FOR INSERT TO authenticated
  WITH CHECK (public.is_same_company(company_id));
CREATE POLICY "quality_issues_tenant_update" ON public.quality_issues
  FOR UPDATE TO authenticated
  USING      (public.is_same_company(company_id))
  WITH CHECK (public.is_same_company(company_id));
CREATE POLICY "quality_issues_tenant_delete" ON public.quality_issues
  FOR DELETE TO authenticated
  USING (public.is_same_company(company_id));

-- sla_policies
DROP POLICY IF EXISTS "sla_policies_select_all"  ON public.sla_policies;
DROP POLICY IF EXISTS "sla_policies_insert_auth" ON public.sla_policies;
DROP POLICY IF EXISTS "sla_policies_update_auth" ON public.sla_policies;
DROP POLICY IF EXISTS "sla_policies_delete_auth" ON public.sla_policies;

CREATE POLICY "sla_policies_tenant_select" ON public.sla_policies
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));
CREATE POLICY "sla_policies_tenant_write" ON public.sla_policies
  FOR ALL TO authenticated
  USING      (public.is_same_company(company_id) AND public.current_role() IN ('super_admin','company_admin','general_manager','manager'))
  WITH CHECK (public.is_same_company(company_id) AND public.current_role() IN ('super_admin','company_admin','general_manager','manager'));

-- ─── 3. companies / branches ────────────────────────────────────────────────

-- companies: readable only when it's the caller's company (or global scope).
DROP POLICY IF EXISTS "companies_select_all"  ON public.companies;
DROP POLICY IF EXISTS "companies_read_auth"   ON public.companies;

CREATE POLICY "companies_tenant_select" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_same_company(id));

-- No INSERT/UPDATE/DELETE policies — platform/service-role managed.

-- branches: already correctly scoped on writes. Tighten SELECT.
DROP POLICY IF EXISTS "Branch select auth"    ON public.branches;
DROP POLICY IF EXISTS "branches_select_all"   ON public.branches;
DROP POLICY IF EXISTS "Branch read"           ON public.branches;

CREATE POLICY "branches_tenant_select" ON public.branches
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

-- ─── 4. audit_logs / application_logs ───────────────────────────────────────

-- audit_logs: INSERT only under own user_id; SELECT self + admin-of-company.
DROP POLICY IF EXISTS "Users can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can view audit logs"   ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert"           ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select"           ON public.audit_logs;

CREATE POLICY "audit_logs_insert_self" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "audit_logs_select_scoped" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.profiles admin_p
        JOIN public.profiles target_p ON target_p.id = public.audit_logs.user_id
       WHERE admin_p.id = auth.uid()
         AND admin_p.role IN ('super_admin','company_admin')
         AND (admin_p.access_scope = 'global' OR admin_p.company_id = target_p.company_id)
    )
  );

-- application_logs: INSERT must match auth.uid() (or NULL for anonymous boot).
DROP POLICY IF EXISTS "insert_logs"      ON public.application_logs;
DROP POLICY IF EXISTS "admin_view_logs"  ON public.application_logs;

CREATE POLICY "application_logs_insert_self" ON public.application_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "application_logs_select_admin" ON public.application_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin','company_admin')
    )
  );

-- ─── 5. notifications — tighten INSERT ──────────────────────────────────────

DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;

-- Notifications may legitimately be written by:
--   a) the recipient themselves (self-reminders, app-generated),
--   b) company admins/managers targeting a user in the same company,
--   c) service role (bypasses RLS automatically — no policy needed).
CREATE POLICY "notifications_insert_scoped" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.profiles sender
        JOIN public.profiles recipient ON recipient.id = public.notifications.user_id
       WHERE sender.id = auth.uid()
         AND sender.role IN ('super_admin','company_admin','general_manager','manager')
         AND (sender.access_scope = 'global' OR sender.company_id = recipient.company_id)
    )
  );

-- ─── 6. Master data: finance / insurance / models / colours ─────────────────

DROP POLICY IF EXISTS "Auth read finance_companies"   ON public.finance_companies;
DROP POLICY IF EXISTS "finance_companies_read"         ON public.finance_companies;
CREATE POLICY "finance_companies_tenant_select" ON public.finance_companies
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "Auth read insurance_companies" ON public.insurance_companies;
DROP POLICY IF EXISTS "insurance_companies_read"       ON public.insurance_companies;
CREATE POLICY "insurance_companies_tenant_select" ON public.insurance_companies
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "Auth read vehicle_models" ON public.vehicle_models;
DROP POLICY IF EXISTS "vehicle_models_read"       ON public.vehicle_models;
CREATE POLICY "vehicle_models_tenant_select" ON public.vehicle_models
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "Auth read vehicle_colours" ON public.vehicle_colours;
DROP POLICY IF EXISTS "vehicle_colours_read"       ON public.vehicle_colours;
CREATE POLICY "vehicle_colours_tenant_select" ON public.vehicle_colours
  FOR SELECT TO authenticated
  USING (public.is_same_company(company_id));

-- ─── 7. Phase-10 master data (fees, banks, suppliers, dealers, etc.) ────────

DROP POLICY IF EXISTS "tin_types_read"         ON public.tin_types;
CREATE POLICY "tin_types_tenant_select" ON public.tin_types
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "reg_fees_read"          ON public.registration_fees;
CREATE POLICY "reg_fees_tenant_select" ON public.registration_fees
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "road_tax_read"          ON public.road_tax_fees;
CREATE POLICY "road_tax_tenant_select" ON public.road_tax_fees
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "insp_fees_read"         ON public.inspection_fees;
CREATE POLICY "insp_fees_tenant_select" ON public.inspection_fees
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "handling_fees_read"     ON public.handling_fees;
CREATE POLICY "handling_fees_tenant_select" ON public.handling_fees
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "add_items_read"         ON public.additional_items;
CREATE POLICY "add_items_tenant_select" ON public.additional_items
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "pay_types_read"         ON public.payment_types;
CREATE POLICY "pay_types_tenant_select" ON public.payment_types
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "banks_read"             ON public.banks;
CREATE POLICY "banks_tenant_select" ON public.banks
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "suppliers_read"         ON public.suppliers;
CREATE POLICY "suppliers_tenant_select" ON public.suppliers
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "dealers_read"           ON public.dealers;
CREATE POLICY "dealers_tenant_select" ON public.dealers
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "user_groups_read"       ON public.user_groups;
CREATE POLICY "user_groups_tenant_select" ON public.user_groups
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "dealer_inv_read"        ON public.dealer_invoices;
CREATE POLICY "dealer_inv_tenant_select" ON public.dealer_invoices
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "official_receipts_read" ON public.official_receipts;
DROP POLICY IF EXISTS "off_receipts_read"      ON public.official_receipts;
CREATE POLICY "official_receipts_tenant_select" ON public.official_receipts
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

-- Tighten WRITE policies on phase-10 tables so admins can only touch their own company.
-- We re-create the _manage policies scoped to is_same_company.
DO $$
DECLARE
  t text;
  admin_tables text[] := ARRAY[
    'tin_types','registration_fees','road_tax_fees','inspection_fees',
    'handling_fees','additional_items','payment_types','banks','suppliers',
    'dealers','user_groups','dealer_invoices','official_receipts',
    'finance_companies','insurance_companies','vehicle_models','vehicle_colours'
  ];
  pol_name text;
  old_names text[] := ARRAY[
    'tin_types_manage','reg_fees_manage','road_tax_manage','insp_fees_manage',
    'handling_fees_manage','add_items_manage','pay_types_manage','banks_manage',
    'suppliers_manage','dealers_manage','user_groups_manage','dealer_inv_manage',
    'official_receipts_manage','off_receipts_manage',
    'finance_companies_manage','insurance_companies_manage',
    'vehicle_models_manage','vehicle_colours_manage'
  ];
BEGIN
  FOREACH t IN ARRAY admin_tables LOOP
    FOREACH pol_name IN ARRAY old_names LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
    END LOOP;
    EXECUTE format($fmt$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (
          public.is_same_company(company_id)
          AND public.current_role() IN ('super_admin','company_admin','general_manager','director','manager')
        )
        WITH CHECK (
          public.is_same_company(company_id)
          AND public.current_role() IN ('super_admin','company_admin','general_manager','director','manager')
        )
    $fmt$, t || '_tenant_manage', t);
  END LOOP;
END $$;

-- ─── 8. HRMS admin / approval flows ────────────────────────────────────────

DROP POLICY IF EXISTS "Auth read departments"     ON public.departments;
CREATE POLICY "departments_tenant_select" ON public.departments
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "Admin write departments" ON public.departments;
CREATE POLICY "departments_tenant_manage" ON public.departments
  FOR ALL TO authenticated
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  );

DROP POLICY IF EXISTS "Auth read job_titles" ON public.job_titles;
CREATE POLICY "job_titles_tenant_select" ON public.job_titles
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "Admin write job_titles" ON public.job_titles;
CREATE POLICY "job_titles_tenant_manage" ON public.job_titles
  FOR ALL TO authenticated
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  );

DROP POLICY IF EXISTS "Auth read public_holidays" ON public.public_holidays;
CREATE POLICY "public_holidays_tenant_select" ON public.public_holidays
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "Admin write public_holidays" ON public.public_holidays;
CREATE POLICY "public_holidays_tenant_manage" ON public.public_holidays
  FOR ALL TO authenticated
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  );

DROP POLICY IF EXISTS "Auth read approval_flows" ON public.approval_flows;
CREATE POLICY "approval_flows_tenant_select" ON public.approval_flows
  FOR SELECT TO authenticated USING (public.is_same_company(company_id));

DROP POLICY IF EXISTS "Admin write approval_flows" ON public.approval_flows;
CREATE POLICY "approval_flows_tenant_manage" ON public.approval_flows
  FOR ALL TO authenticated
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  );

DROP POLICY IF EXISTS "Auth read approval_steps" ON public.approval_steps;
CREATE POLICY "approval_steps_tenant_select" ON public.approval_steps
  FOR SELECT TO authenticated
  USING (
    flow_id IN (
      SELECT id FROM public.approval_flows
       WHERE public.is_same_company(company_id)
    )
  );

DROP POLICY IF EXISTS "Admin write approval_steps" ON public.approval_steps;
CREATE POLICY "approval_steps_tenant_manage" ON public.approval_steps
  FOR ALL TO authenticated
  USING (
    flow_id IN (
      SELECT id FROM public.approval_flows
       WHERE public.is_same_company(company_id)
    )
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  )
  WITH CHECK (
    flow_id IN (
      SELECT id FROM public.approval_flows
       WHERE public.is_same_company(company_id)
    )
    AND public.current_role() IN ('super_admin','company_admin','general_manager','manager')
  );

-- ─── 9. Lock down handle_new_user — no metadata-driven privilege ────────────

-- Widen profiles.status check to include 'pending' (new unprovisioned users).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active','inactive','resigned','pending'));

-- Allow company_id to be NULL for unprovisioned ('pending') accounts.
-- Admin must attach the profile to a company before the user can access tenant data.
ALTER TABLE public.profiles ALTER COLUMN company_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ignore user-supplied role/company_id/access_scope from signup metadata.
  -- New users are created in a neutral "pending" state and must be
  -- provisioned by an admin (via invite-user edge function) before they
  -- can access tenant data.
  INSERT INTO public.profiles (id, email, name, role, company_id, access_scope, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'analyst',
    NULL,
    'self',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop hardcoded 'c1' default so stray inserts cannot silently land
-- on the demo tenant. Existing rows are untouched; only future inserts
-- that omit `company_id` will now fail NOT NULL — which is desired.
DO $$
DECLARE
  t text;
  master_tables text[] := ARRAY[
    'tin_types','registration_fees','road_tax_fees','inspection_fees',
    'handling_fees','additional_items','payment_types','banks','suppliers',
    'dealers','user_groups','dealer_invoices','official_receipts',
    'finance_companies','insurance_companies','vehicle_models','vehicle_colours'
  ];
BEGIN
  FOREACH t IN ARRAY master_tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id DROP DEFAULT', t);
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      -- Column absent on this table — skip.
      NULL;
    END;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.is_same_company(text) IS
  'Phase 0 hotfix: returns true when the caller belongs to target_company_id or has global access scope.';
COMMENT ON FUNCTION public.current_company_id() IS
  'Phase 0 hotfix: caller''s profile.company_id via SECURITY DEFINER to avoid policy recursion.';
COMMENT ON FUNCTION public.current_access_scope() IS
  'Phase 0 hotfix: caller''s profile.access_scope via SECURITY DEFINER to avoid policy recursion.';
COMMENT ON FUNCTION public.current_role() IS
  'Phase 0 hotfix: caller''s profile.role via SECURITY DEFINER to avoid policy recursion.';
