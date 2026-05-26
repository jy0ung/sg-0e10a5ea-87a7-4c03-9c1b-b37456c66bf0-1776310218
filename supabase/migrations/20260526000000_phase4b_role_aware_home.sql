-- Phase 4b: Role-aware Home + KPI Definition Studio
--
-- Two tables back a single feature surface:
--   • kpi_definitions       — formula catalogue (code, label, formula_jsonb).
--                             Reused by both the role-aware Home page and the
--                             existing ExecutiveDashboard custom-KPI engine.
--   • kpi_role_defaults     — per-role curated KPI codes. The studio is the
--                             admin tool that writes here.
--
-- Resolution order, mirroring feature_flags:
--   per-company row (company_id, role) > global default (company_id IS NULL).
--
-- Default-off in production via the existing phase4.role-home feature flag.

CREATE TABLE IF NOT EXISTS public.kpi_definitions (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text         REFERENCES public.companies(id) ON DELETE CASCADE,
  code          text         NOT NULL,
  label         text         NOT NULL,
  description   text,
  formula       jsonb        NOT NULL,        -- CustomKpiFormula (source, aggregation, filters)
  version       int          NOT NULL DEFAULT 1,
  is_active     boolean      NOT NULL DEFAULT true,
  created_by    uuid         REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_definitions_global_code
  ON public.kpi_definitions (code)
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_definitions_company_code
  ON public.kpi_definitions (company_id, code)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kpi_definitions_active
  ON public.kpi_definitions (is_active)
  WHERE is_active;

COMMENT ON TABLE public.kpi_definitions IS
  'Curated KPI formula catalogue. Per-company rows override the NULL-company global defaults by (code).';

ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;

-- Everyone in the same company sees the catalogue; globals are visible to all.
CREATE POLICY "kpi_definitions_select" ON public.kpi_definitions
  FOR SELECT USING (
    company_id IS NULL
    OR company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

-- Writes are gated to admins. Super-admins may manage global rows; company
-- admins may manage their own company rows. The studio uses the RPC instead
-- of direct DML, but we keep RLS-correct policies as a safety net.
CREATE POLICY "kpi_definitions_admin_write" ON public.kpi_definitions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin', 'company_admin')
         AND (company_id = kpi_definitions.company_id OR kpi_definitions.company_id IS NULL OR access_scope = 'global')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin', 'company_admin')
         AND (company_id = kpi_definitions.company_id OR kpi_definitions.company_id IS NULL OR access_scope = 'global')
    )
  );

CREATE TABLE IF NOT EXISTS public.kpi_role_defaults (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    text         REFERENCES public.companies(id) ON DELETE CASCADE,
  role          text         NOT NULL,
  kpi_codes     text[]       NOT NULL DEFAULT '{}',
  updated_by    uuid         REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_role_defaults_global_role
  ON public.kpi_role_defaults (role)
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_role_defaults_company_role
  ON public.kpi_role_defaults (company_id, role)
  WHERE company_id IS NOT NULL;

COMMENT ON TABLE public.kpi_role_defaults IS
  'Per-role curated KPI defaults. The Role-aware Home reads this to decide which kpi_definitions to surface for the signed-in user.';

ALTER TABLE public.kpi_role_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_role_defaults_select" ON public.kpi_role_defaults
  FOR SELECT USING (
    company_id IS NULL
    OR company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND access_scope = 'global')
  );

CREATE POLICY "kpi_role_defaults_admin_write" ON public.kpi_role_defaults
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin', 'company_admin')
         AND (company_id = kpi_role_defaults.company_id OR kpi_role_defaults.company_id IS NULL OR access_scope = 'global')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin', 'company_admin')
         AND (company_id = kpi_role_defaults.company_id OR kpi_role_defaults.company_id IS NULL OR access_scope = 'global')
    )
  );

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Resolve which KPIs the Home page should render for (company, role). Picks
-- the per-company row first, falls back to the global default, and joins
-- against kpi_definitions to return label / formula payloads in one round-trip.
CREATE OR REPLACE FUNCTION get_role_home_kpis(
  p_company_id text,
  p_role       text
)
RETURNS TABLE (
  code        text,
  label       text,
  description text,
  formula     jsonb,
  position    int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_codes     text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = v_caller_id
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Per-company override beats global default.
  SELECT kpi_codes
    INTO v_codes
    FROM kpi_role_defaults
   WHERE role = p_role
     AND (company_id = p_company_id OR company_id IS NULL)
   ORDER BY (company_id IS NULL) ASC  -- per-company first
   LIMIT 1;

  IF v_codes IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT d.code,
           d.label,
           d.description,
           d.formula,
           array_position(v_codes, d.code) AS position
      FROM kpi_definitions d
     WHERE d.code = ANY(v_codes)
       AND d.is_active
       AND (d.company_id = p_company_id OR d.company_id IS NULL)
     ORDER BY array_position(v_codes, d.code);
END;
$$;

GRANT EXECUTE ON FUNCTION get_role_home_kpis(text, text) TO authenticated;

-- Admin upsert for role defaults. Super-admin / company-admin only.
CREATE OR REPLACE FUNCTION upsert_role_kpi_defaults(
  p_company_id text,
  p_role       text,
  p_kpi_codes  text[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_id        uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = v_caller_id
       AND role IN ('super_admin', 'company_admin')
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO kpi_role_defaults (company_id, role, kpi_codes, updated_by)
  VALUES (p_company_id, p_role, p_kpi_codes, v_caller_id)
  ON CONFLICT (company_id, role) WHERE company_id IS NOT NULL
  DO UPDATE SET
    kpi_codes  = EXCLUDED.kpi_codes,
    updated_by = v_caller_id,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_role_kpi_defaults(text, text, text[]) TO authenticated;

-- ── Seeds: minimum-viable global catalogue and role defaults ─────────────────
-- These give the Role-aware Home something to render out of the box on
-- enable. Companies can override either layer (definitions or role
-- defaults) without touching code.

INSERT INTO public.kpi_definitions (company_id, code, label, description, formula)
VALUES
  (NULL, 'vehicles.total_stock', 'Vehicles in stock',
    'Count of vehicles currently in stock (excludes sold/delivered).',
    jsonb_build_object(
      'source', 'vehicles',
      'aggregation', 'count',
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'status', 'op', 'eq', 'value', 'in_stock')
      )
    )
  ),
  (NULL, 'vehicles.aged_over_180', 'Aged > 180 days',
    'Vehicles in stock with age over 180 days — escalates for management review.',
    jsonb_build_object(
      'source', 'vehicles',
      'aggregation', 'count',
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'age_days', 'op', 'gt', 'value', 180)
      )
    )
  ),
  (NULL, 'sales.open_orders', 'Open sales orders',
    'Sales orders that are not yet closed or cancelled.',
    jsonb_build_object(
      'source', 'sales_orders',
      'aggregation', 'count',
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'stage', 'op', 'not_in', 'value', jsonb_build_array('closed', 'cancelled'))
      )
    )
  ),
  (NULL, 'sales.weekly_revenue', 'Sales (last 7 days)',
    'Sum of sales order amounts created in the last 7 days.',
    jsonb_build_object(
      'source', 'sales_orders',
      'aggregation', 'sum',
      'field', 'total_amount',
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'created_at', 'op', 'gte', 'value', 'now-7d')
      )
    )
  ),
  (NULL, 'customers.new_this_month', 'New customers (MTD)',
    'New customer records created month-to-date.',
    jsonb_build_object(
      'source', 'customers',
      'aggregation', 'count',
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'created_at', 'op', 'gte', 'value', 'now-30d')
      )
    )
  )
ON CONFLICT (code) WHERE company_id IS NULL DO NOTHING;

-- Role defaults — sensible starting set per persona.
INSERT INTO public.kpi_role_defaults (company_id, role, kpi_codes) VALUES
  (NULL, 'super_admin',     ARRAY['vehicles.total_stock', 'vehicles.aged_over_180', 'sales.open_orders', 'sales.weekly_revenue', 'customers.new_this_month']),
  (NULL, 'company_admin',   ARRAY['vehicles.total_stock', 'vehicles.aged_over_180', 'sales.open_orders', 'sales.weekly_revenue', 'customers.new_this_month']),
  (NULL, 'director',        ARRAY['vehicles.total_stock', 'vehicles.aged_over_180', 'sales.weekly_revenue']),
  (NULL, 'general_manager', ARRAY['vehicles.total_stock', 'vehicles.aged_over_180', 'sales.open_orders', 'sales.weekly_revenue']),
  (NULL, 'manager',         ARRAY['vehicles.total_stock', 'sales.open_orders', 'sales.weekly_revenue']),
  (NULL, 'sales',           ARRAY['sales.open_orders', 'sales.weekly_revenue', 'customers.new_this_month']),
  (NULL, 'accounts',        ARRAY['sales.weekly_revenue']),
  (NULL, 'analyst',         ARRAY['vehicles.total_stock', 'vehicles.aged_over_180', 'sales.open_orders', 'sales.weekly_revenue']),
  (NULL, 'creator_updater', ARRAY['vehicles.total_stock'])
ON CONFLICT (role) WHERE company_id IS NULL DO NOTHING;
