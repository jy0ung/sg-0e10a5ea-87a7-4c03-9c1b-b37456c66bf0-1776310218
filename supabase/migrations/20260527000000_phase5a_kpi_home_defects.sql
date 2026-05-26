-- Phase 5a: close-out of three Phase 4b latent defects.
--
-- 1. upsert_role_kpi_defaults only carried the (company_id, role) WHERE
--    company_id IS NOT NULL conflict clause. Calls with p_company_id = NULL
--    (managing the global default row) hit no matching partial index and
--    therefore raised "no unique or exclusion constraint matching the
--    ON CONFLICT specification". Split into an IF/ELSE so each branch names
--    the index that actually covers it.
--
-- 2. kpi_definitions had no landing_route column, so the Home page fell back
--    to a hardcoded KPI_HREF_BY_CODE map keyed by KPI code with an `/` fallback
--    for any unknown code. Adds the column, seeds it for the five global rows,
--    and exposes it through get_role_home_kpis so new KPIs no longer require
--    a frontend code change to be reachable.
--
-- Both changes are additive. No drops. Backwards-compatible with any caller
-- that ignores landing_route.

ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS landing_route text;

COMMENT ON COLUMN public.kpi_definitions.landing_route IS
  'Optional deep-link target for the Role-aware Home card. NULL means the Home page should fall back to its default destination.';

UPDATE public.kpi_definitions
   SET landing_route = '/auto-aging/vehicles'
 WHERE code = 'vehicles.total_stock'
   AND company_id IS NULL
   AND landing_route IS NULL;

UPDATE public.kpi_definitions
   SET landing_route = '/auto-aging/vehicles?ageBucket=181%2B'
 WHERE code = 'vehicles.aged_over_180'
   AND company_id IS NULL
   AND landing_route IS NULL;

UPDATE public.kpi_definitions
   SET landing_route = '/sales/orders'
 WHERE code = 'sales.open_orders'
   AND company_id IS NULL
   AND landing_route IS NULL;

UPDATE public.kpi_definitions
   SET landing_route = '/sales'
 WHERE code = 'sales.weekly_revenue'
   AND company_id IS NULL
   AND landing_route IS NULL;

UPDATE public.kpi_definitions
   SET landing_route = '/sales/customers'
 WHERE code = 'customers.new_this_month'
   AND company_id IS NULL
   AND landing_route IS NULL;

-- Republish get_role_home_kpis to include landing_route in the return shape.
-- Same authorisation gate, same per-company-override-then-global resolution
-- order. Returning landing_route is purely additive.
CREATE OR REPLACE FUNCTION get_role_home_kpis(
  p_company_id text,
  p_role       text
)
RETURNS TABLE (
  code          text,
  label         text,
  description   text,
  formula       jsonb,
  landing_route text,
  position      int
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

  SELECT kpi_codes
    INTO v_codes
    FROM kpi_role_defaults
   WHERE role = p_role
     AND (company_id = p_company_id OR company_id IS NULL)
   ORDER BY (company_id IS NULL) ASC
   LIMIT 1;

  IF v_codes IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT d.code,
           d.label,
           d.description,
           d.formula,
           d.landing_route,
           array_position(v_codes, d.code) AS position
      FROM kpi_definitions d
     WHERE d.code = ANY(v_codes)
       AND d.is_active
       AND (d.company_id = p_company_id OR d.company_id IS NULL)
     ORDER BY array_position(v_codes, d.code);
END;
$$;

GRANT EXECUTE ON FUNCTION get_role_home_kpis(text, text) TO authenticated;

-- Split upsert_role_kpi_defaults into the two partial-index branches so the
-- NULL-company global-defaults path is reachable. Same authorisation gate.
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
       AND (
         (p_company_id IS NOT NULL AND company_id = p_company_id)
         OR access_scope = 'global'
       )
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_company_id IS NULL THEN
    -- Global default row. Matched by idx_kpi_role_defaults_global_role
    -- (UNIQUE on role WHERE company_id IS NULL).
    INSERT INTO kpi_role_defaults (company_id, role, kpi_codes, updated_by)
    VALUES (NULL, p_role, p_kpi_codes, v_caller_id)
    ON CONFLICT (role) WHERE company_id IS NULL
    DO UPDATE SET
      kpi_codes  = EXCLUDED.kpi_codes,
      updated_by = v_caller_id,
      updated_at = now()
    RETURNING id INTO v_id;
  ELSE
    -- Per-company row. Matched by idx_kpi_role_defaults_company_role.
    INSERT INTO kpi_role_defaults (company_id, role, kpi_codes, updated_by)
    VALUES (p_company_id, p_role, p_kpi_codes, v_caller_id)
    ON CONFLICT (company_id, role) WHERE company_id IS NOT NULL
    DO UPDATE SET
      kpi_codes  = EXCLUDED.kpi_codes,
      updated_by = v_caller_id,
      updated_at = now()
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_role_kpi_defaults(text, text, text[]) TO authenticated;
