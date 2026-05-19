-- ============================================================
-- Migration: RLS company-scoping for master-data tables
-- Date: 2026-05-18
-- Scope: Replace USING(true) SELECT policies with tenant-scoped
--        policies on all master-data tables that hold company_id.
--        Also scope WRITE policies to the authenticated user's company.
-- ============================================================

-- ── Helper: the current user's company_id ────────────────────────────────
-- We use a subquery pattern (rather than a stable function) so Postgres can
-- inline it and use the index on profiles(id).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. payment_types
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pay_types_read"            ON public.payment_types;
DROP POLICY IF EXISTS "pay_types_manage"           ON public.payment_types;
DROP POLICY IF EXISTS "pay_types_tenant_select"    ON public.payment_types;
DROP POLICY IF EXISTS "pay_types_admin_write"      ON public.payment_types;

CREATE POLICY "pay_types_tenant_select" ON public.payment_types
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "pay_types_admin_write" ON public.payment_types
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. banks
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "banks_read"            ON public.banks;
DROP POLICY IF EXISTS "banks_manage"           ON public.banks;
DROP POLICY IF EXISTS "banks_tenant_select"    ON public.banks;
DROP POLICY IF EXISTS "banks_admin_write"      ON public.banks;

CREATE POLICY "banks_tenant_select" ON public.banks
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "banks_admin_write" ON public.banks
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. suppliers
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "suppliers_read"            ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_manage"           ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_tenant_select"    ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_admin_write"      ON public.suppliers;

CREATE POLICY "suppliers_tenant_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "suppliers_admin_write" ON public.suppliers
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4. dealers
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dealers_read"            ON public.dealers;
DROP POLICY IF EXISTS "dealers_manage"           ON public.dealers;
DROP POLICY IF EXISTS "dealers_tenant_select"    ON public.dealers;
DROP POLICY IF EXISTS "dealers_admin_write"      ON public.dealers;

CREATE POLICY "dealers_tenant_select" ON public.dealers
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "dealers_admin_write" ON public.dealers
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5. finance_companies
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fin_cos_read"                                    ON public.finance_companies;
DROP POLICY IF EXISTS "fin_cos_manage"                                  ON public.finance_companies;
DROP POLICY IF EXISTS "Authenticated users can read finance_companies"  ON public.finance_companies;
DROP POLICY IF EXISTS "Admins can manage finance_companies"             ON public.finance_companies;
DROP POLICY IF EXISTS "fin_cos_tenant_select"                           ON public.finance_companies;
DROP POLICY IF EXISTS "fin_cos_admin_write"                             ON public.finance_companies;

CREATE POLICY "fin_cos_tenant_select" ON public.finance_companies
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "fin_cos_admin_write" ON public.finance_companies
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 6. insurance_companies
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ins_cos_read"                                       ON public.insurance_companies;
DROP POLICY IF EXISTS "ins_cos_manage"                                     ON public.insurance_companies;
DROP POLICY IF EXISTS "Authenticated users can read insurance_companies"   ON public.insurance_companies;
DROP POLICY IF EXISTS "Admins can manage insurance_companies"              ON public.insurance_companies;
DROP POLICY IF EXISTS "ins_cos_tenant_select"                              ON public.insurance_companies;
DROP POLICY IF EXISTS "ins_cos_admin_write"                                ON public.insurance_companies;

CREATE POLICY "ins_cos_tenant_select" ON public.insurance_companies
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "ins_cos_admin_write" ON public.insurance_companies
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 7. vehicle_models
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vehicle_models_read"                           ON public.vehicle_models;
DROP POLICY IF EXISTS "vehicle_models_manage"                         ON public.vehicle_models;
DROP POLICY IF EXISTS "Authenticated users can read vehicle_models"   ON public.vehicle_models;
DROP POLICY IF EXISTS "Admins can manage vehicle_models"              ON public.vehicle_models;
DROP POLICY IF EXISTS "vehicle_models_tenant_select"                  ON public.vehicle_models;
DROP POLICY IF EXISTS "vehicle_models_admin_write"                    ON public.vehicle_models;

CREATE POLICY "vehicle_models_tenant_select" ON public.vehicle_models
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "vehicle_models_admin_write" ON public.vehicle_models
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 8. vehicle_colours
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vehicle_colours_read"                           ON public.vehicle_colours;
DROP POLICY IF EXISTS "vehicle_colours_manage"                         ON public.vehicle_colours;
DROP POLICY IF EXISTS "Authenticated users can read vehicle_colours"   ON public.vehicle_colours;
DROP POLICY IF EXISTS "Admins can manage vehicle_colours"              ON public.vehicle_colours;
DROP POLICY IF EXISTS "vehicle_colours_tenant_select"                  ON public.vehicle_colours;
DROP POLICY IF EXISTS "vehicle_colours_admin_write"                    ON public.vehicle_colours;

CREATE POLICY "vehicle_colours_tenant_select" ON public.vehicle_colours
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "vehicle_colours_admin_write" ON public.vehicle_colours
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 9. dealer_invoices
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dealer_inv_read"            ON public.dealer_invoices;
DROP POLICY IF EXISTS "dealer_inv_manage"           ON public.dealer_invoices;
DROP POLICY IF EXISTS "dealer_inv_tenant_select"    ON public.dealer_invoices;
DROP POLICY IF EXISTS "dealer_inv_write"            ON public.dealer_invoices;

CREATE POLICY "dealer_inv_tenant_select" ON public.dealer_invoices
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "dealer_inv_write" ON public.dealer_invoices
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin', 'director', 'general_manager')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin', 'director', 'general_manager')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 10. official_receipts
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "or_read"                           ON public.official_receipts;
DROP POLICY IF EXISTS "or_manage"                         ON public.official_receipts;
DROP POLICY IF EXISTS "or_tenant_select"                  ON public.official_receipts;
DROP POLICY IF EXISTS "or_write"                          ON public.official_receipts;

CREATE POLICY "or_tenant_select" ON public.official_receipts
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "or_write" ON public.official_receipts
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin', 'director', 'general_manager')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin', 'director', 'general_manager')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 11. branches  (was "Authenticated users can read branches")
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read branches" ON public.branches;
DROP POLICY IF EXISTS "Admins can manage branches"            ON public.branches;
DROP POLICY IF EXISTS "branches_tenant_select"                ON public.branches;
DROP POLICY IF EXISTS "branches_admin_write"                  ON public.branches;

CREATE POLICY "branches_tenant_select" ON public.branches
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "branches_admin_write" ON public.branches
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 12. purchase_invoices
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "purchase_invoices_read"             ON public.purchase_invoices;
DROP POLICY IF EXISTS "purchase_invoices_manage"           ON public.purchase_invoices;
DROP POLICY IF EXISTS "purchase_invoices_tenant_select"    ON public.purchase_invoices;
DROP POLICY IF EXISTS "purchase_invoices_write"            ON public.purchase_invoices;

CREATE POLICY "purchase_invoices_tenant_select" ON public.purchase_invoices
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (is_deleted IS NULL OR is_deleted = false)
  );

CREATE POLICY "purchase_invoices_write" ON public.purchase_invoices
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 13. user_groups (also had USING(true) — fix for completeness)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_groups_read"            ON public.user_groups;
DROP POLICY IF EXISTS "user_groups_manage"           ON public.user_groups;
DROP POLICY IF EXISTS "user_groups_tenant_select"    ON public.user_groups;
DROP POLICY IF EXISTS "user_groups_admin_write"      ON public.user_groups;

CREATE POLICY "user_groups_tenant_select" ON public.user_groups
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "user_groups_admin_write" ON public.user_groups
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'company_admin')
  );
