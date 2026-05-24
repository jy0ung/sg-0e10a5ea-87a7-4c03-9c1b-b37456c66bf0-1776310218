-- ─── Global Search RPC ──────────────────────────────────────────────────────
--
-- Replaces the four ad-hoc Cmd+K queries in
-- src/components/layout/app-shell/mainShellConfig.ts (searchVehicles +
-- local-array filter for customers + local-array filter for sales orders
-- + listProfiles + client-side filter) with one server-side union.
--
-- Why:
--   • One network round-trip instead of up to four.
--   • Profiles can be searched without loading the full company roster
--     into the browser (the admin search currently fetches every profile
--     and filters client-side).
--   • RLS is consistent: each subquery runs as the caller, so a non-admin
--     who could not previously see a row through the page still cannot
--     see it through the command palette.
--
-- Security model:
--   • SECURITY INVOKER. RLS does the company / role filtering on every
--     table; no per-call company_id parameter is needed (and would be a
--     trust anchor we don't want).
--   • Profiles search is naturally admin-only because the existing
--     `profiles` SELECT policy already restricts cross-row visibility.
--
-- Ranking:
--   • Exact-prefix matches on the entity's primary identifier (chassis_no,
--     name, order_no, email) rank above substring matches.
--   • Score: 100 = exact, 90 = prefix, 50 = contains.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.global_search(
  p_query text,
  p_limit integer DEFAULT 6
) RETURNS TABLE (
  entity_type  text,
  entity_id    text,
  label        text,
  description  text,
  href         text,
  rank_score   integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT
      btrim(p_query)                  AS term,
      lower(btrim(p_query))           AS lterm,
      LEAST(GREATEST(p_limit, 1), 25) AS lim
  )
  SELECT * FROM (
    -- ── vehicles ──────────────────────────────────────────────────────
    (
      SELECT
        'vehicle'::text                                                AS entity_type,
        v.id::text                                                     AS entity_id,
        COALESCE(NULLIF(v.chassis_no, ''), 'Vehicle record')           AS label,
        NULLIF(
          concat_ws(' - ',
            NULLIF(v.model, ''),
            NULLIF(v.branch_code, ''),
            NULLIF(v.customer_name, '')
          ), ''
        )                                                              AS description,
        '/auto-aging/vehicles?search=' ||
          encode(convert_to(COALESCE(v.chassis_no, q.term), 'UTF8'), 'escape') AS href,
        (CASE
          WHEN lower(v.chassis_no) = q.lterm                    THEN 100
          WHEN lower(v.chassis_no) LIKE q.lterm || '%'          THEN 90
          ELSE 50
        END)::int                                                      AS rank_score
      FROM vehicles v, q
      WHERE v.deleted_at IS NULL
        AND (
          v.chassis_no    ILIKE '%' || q.term || '%'
          OR v.customer_name ILIKE '%' || q.term || '%'
          OR v.owner_name    ILIKE '%' || q.term || '%'
          OR v.model         ILIKE '%' || q.term || '%'
          OR v.branch_code   ILIKE '%' || q.term || '%'
        )
      ORDER BY rank_score DESC
      LIMIT (SELECT lim FROM q)
    )
    UNION ALL
    -- ── customers ─────────────────────────────────────────────────────
    (
      SELECT
        'customer'::text                                               AS entity_type,
        c.id::text                                                     AS entity_id,
        c.name                                                         AS label,
        NULLIF(concat_ws(' - ', NULLIF(c.phone, ''), NULLIF(c.email, '')), '') AS description,
        '/sales/customers?search=' ||
          encode(convert_to(c.name, 'UTF8'), 'escape')                 AS href,
        (CASE
          WHEN lower(c.name)  = q.lterm                          THEN 100
          WHEN lower(c.name)  LIKE q.lterm || '%'                THEN 90
          WHEN lower(c.email) = q.lterm                          THEN 80
          ELSE 50
        END)::int                                                      AS rank_score
      FROM customers c, q
      WHERE
            c.name  ILIKE '%' || q.term || '%'
        OR c.phone ILIKE '%' || q.term || '%'
        OR c.email ILIKE '%' || q.term || '%'
        OR c.ic_no ILIKE '%' || q.term || '%'
      ORDER BY rank_score DESC
      LIMIT (SELECT lim FROM q)
    )
    UNION ALL
    -- ── sales_orders ──────────────────────────────────────────────────
    (
      SELECT
        'sales_order'::text                                            AS entity_type,
        so.id::text                                                    AS entity_id,
        COALESCE(NULLIF(so.order_no, ''), 'Sales order')               AS label,
        NULLIF(concat_ws(' - ', NULLIF(so.customer_name, ''), NULLIF(so.model, '')), '') AS description,
        '/sales/orders?search=' ||
          encode(convert_to(COALESCE(so.order_no, q.term), 'UTF8'), 'escape') AS href,
        (CASE
          WHEN lower(so.order_no)   = q.lterm                    THEN 100
          WHEN lower(so.order_no)   LIKE q.lterm || '%'          THEN 90
          ELSE 50
        END)::int                                                      AS rank_score
      FROM sales_orders so, q
      WHERE
            so.order_no       ILIKE '%' || q.term || '%'
        OR so.customer_name   ILIKE '%' || q.term || '%'
        OR so.model           ILIKE '%' || q.term || '%'
        OR so.chassis_no      ILIKE '%' || q.term || '%'
        OR so.vso_no          ILIKE '%' || q.term || '%'
        OR so.plate_no        ILIKE '%' || q.term || '%'
      ORDER BY rank_score DESC
      LIMIT (SELECT lim FROM q)
    )
    UNION ALL
    -- ── profiles (admin-only via RLS) ─────────────────────────────────
    (
      SELECT
        'profile'::text                                                AS entity_type,
        p.id::text                                                     AS entity_id,
        COALESCE(NULLIF(p.name, ''), p.email)                          AS label,
        NULLIF(concat_ws(' - ', p.email, replace(p.role::text, '_', ' ')), '') AS description,
        '/admin/users?search=' ||
          encode(convert_to(p.email, 'UTF8'), 'escape')                AS href,
        (CASE
          WHEN lower(p.email) = q.lterm                          THEN 100
          WHEN lower(p.email) LIKE q.lterm || '%'                THEN 90
          WHEN lower(p.name)  = q.lterm                          THEN 80
          ELSE 50
        END)::int                                                      AS rank_score
      FROM profiles p, q
      WHERE
            p.email ILIKE '%' || q.term || '%'
        OR p.name  ILIKE '%' || q.term || '%'
      ORDER BY rank_score DESC
      LIMIT (SELECT lim FROM q)
    )
  ) results
  WHERE (SELECT length(term) FROM q) >= 2
  ORDER BY rank_score DESC, label ASC;
$$;

REVOKE ALL ON FUNCTION public.global_search(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_search(text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.global_search(text, integer) IS
  'Cmd+K global entity search. Returns up to p_limit matches per entity type from vehicles, customers, sales_orders, profiles. SECURITY INVOKER: RLS does the company / role filtering. Min query length: 2.';

-- ─── Indexes for ILIKE substring search ──────────────────────────────────────
--
-- ILIKE '%foo%' cannot use a btree index. The pg_trgm extension provides
-- GIN indexes that accelerate it. The extension is already in use by other
-- migrations; we add it idempotently here for clarity.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_vehicles_search_trgm
  ON public.vehicles
  USING gin (chassis_no gin_trgm_ops, customer_name gin_trgm_ops, owner_name gin_trgm_ops, model gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_search_trgm
  ON public.customers
  USING gin (name gin_trgm_ops, phone gin_trgm_ops, email gin_trgm_ops, ic_no gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_sales_orders_search_trgm
  ON public.sales_orders
  USING gin (order_no gin_trgm_ops, customer_name gin_trgm_ops, model gin_trgm_ops, chassis_no gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_search_trgm
  ON public.profiles
  USING gin (name gin_trgm_ops, email gin_trgm_ops);
