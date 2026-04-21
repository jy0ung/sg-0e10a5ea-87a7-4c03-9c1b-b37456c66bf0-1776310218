-- ============================================================
-- Phase 2 — role_sections: DB-backed section permission matrix
-- ============================================================
-- Replaces the client-side localStorage matrix in
-- src/config/rolePermissions.ts with an authoritative,
-- company-scoped table. The existing defaults are seeded in
-- on first migration, but the matrix is editable per company.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.role_sections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  TEXT        NOT NULL,
  role        TEXT        NOT NULL,
  section     TEXT        NOT NULL,
  allowed     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, role, section)
);

CREATE INDEX IF NOT EXISTS idx_role_sections_company_role
  ON public.role_sections (company_id, role);

ALTER TABLE public.role_sections ENABLE ROW LEVEL SECURITY;

-- Drop any prior permissive policies (idempotent).
DROP POLICY IF EXISTS role_sections_select ON public.role_sections;
DROP POLICY IF EXISTS role_sections_manage ON public.role_sections;

-- Tenant read: any authenticated user in the same company can read the matrix
-- (sidebar needs it). Uses the Phase 0 SECURITY DEFINER helper.
CREATE POLICY role_sections_select ON public.role_sections
  FOR SELECT
  USING (public.is_same_company(company_id));

-- Tenant manage: only super_admin / company_admin / director / GM in the same
-- company may edit the matrix.
CREATE POLICY role_sections_manage ON public.role_sections
  FOR ALL
  USING (
    public.is_same_company(company_id)
    AND public.current_role() IN (
      'super_admin', 'company_admin', 'director', 'general_manager'
    )
  )
  WITH CHECK (
    public.is_same_company(company_id)
    AND public.current_role() IN (
      'super_admin', 'company_admin', 'director', 'general_manager'
    )
  );

-- ---------------------------------------------------------------
-- Seed defaults: mirror DEFAULT_ROLE_SECTIONS from rolePermissions.ts
-- for every existing company. New companies get the defaults via a
-- trigger on companies INSERT (below).
-- ---------------------------------------------------------------
DO $$
DECLARE
  cid TEXT;
  mapping JSONB := jsonb_build_object(
    'super_admin', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'company_admin', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'director', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'general_manager', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'manager', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Reports','HRMS','Admin'),
    'sales', jsonb_build_array('Platform','Sales','Admin'),
    'accounts', jsonb_build_array('Platform','Sales','Purchasing','Reports','HRMS','Admin'),
    'analyst', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Reports','Admin'),
    'creator_updater', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Admin')
  );
  role_name TEXT;
  section_name TEXT;
BEGIN
  FOR cid IN SELECT id FROM public.companies LOOP
    FOR role_name IN SELECT jsonb_object_keys(mapping) LOOP
      FOR section_name IN SELECT jsonb_array_elements_text(mapping -> role_name) LOOP
        INSERT INTO public.role_sections (company_id, role, section)
        VALUES (cid, role_name, section_name)
        ON CONFLICT (company_id, role, section) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Trigger so newly-created companies get the default matrix.
CREATE OR REPLACE FUNCTION public.seed_role_sections_for_new_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapping JSONB := jsonb_build_object(
    'super_admin', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'company_admin', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'director', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'general_manager', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Reports','HRMS','Admin'),
    'manager', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Reports','HRMS','Admin'),
    'sales', jsonb_build_array('Platform','Sales','Admin'),
    'accounts', jsonb_build_array('Platform','Sales','Purchasing','Reports','HRMS','Admin'),
    'analyst', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Reports','Admin'),
    'creator_updater', jsonb_build_array('Platform','Auto Aging','Sales','Inventory','Purchasing','Admin')
  );
  role_name TEXT;
  section_name TEXT;
BEGIN
  FOR role_name IN SELECT jsonb_object_keys(mapping) LOOP
    FOR section_name IN SELECT jsonb_array_elements_text(mapping -> role_name) LOOP
      INSERT INTO public.role_sections (company_id, role, section)
      VALUES (NEW.id, role_name, section_name)
      ON CONFLICT (company_id, role, section) DO NOTHING;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_role_sections ON public.companies;
CREATE TRIGGER trg_seed_role_sections
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_role_sections_for_new_company();

COMMENT ON TABLE public.role_sections IS
  'Authoritative role → section visibility matrix. Replaces client-side localStorage matrix. Phase 2 rebuild.';
