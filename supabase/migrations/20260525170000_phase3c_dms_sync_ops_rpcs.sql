-- Phase 3c.1: DMS Sync Ops dashboard (read-only)
-- Surfaces sync_runs and dms_raw_* staging counts to operators so they can
-- see what's flowing from Proton DMS / legacy fookloi.net into the canonical
-- pipeline. Per Decision #7, the live captcha-gated cron is parked until
-- Proton issues a service account; until then operators use manual exports
-- (3c.2) and this dashboard to verify staging health.
--
-- Two RPCs:
--   • get_dms_sync_runs_summary    : aggregate KPIs across source_systems
--   • get_dms_raw_staging_counts   : per-staging-table row counts (incl. how
--                                    many are pending normalization)
--
-- All SECURITY DEFINER with same-company / global-scope gate.

CREATE OR REPLACE FUNCTION get_dms_sync_runs_summary(
  p_company_id text
)
RETURNS TABLE (
  source_system     text,
  total_runs        int,
  succeeded_runs    int,
  failed_runs       int,
  running_runs      int,
  pending_runs      int,
  last_run_at       timestamptz,
  last_run_status   text,
  total_record_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH per_source AS (
    SELECT
      sr.source_system,
      COUNT(*)::int                                                            AS total_runs,
      COUNT(*) FILTER (WHERE sr.status = 'succeeded')::int                     AS succeeded_runs,
      COUNT(*) FILTER (WHERE sr.status = 'failed')::int                        AS failed_runs,
      COUNT(*) FILTER (WHERE sr.status = 'running')::int                       AS running_runs,
      COUNT(*) FILTER (WHERE sr.status = 'pending')::int                       AS pending_runs,
      MAX(sr.started_at)                                                       AS last_run_at,
      COALESCE(SUM(sr.record_count), 0)::bigint                                AS total_record_count
    FROM sync_runs sr
    WHERE sr.company_id = p_company_id
    GROUP BY sr.source_system
  ),
  last_status AS (
    SELECT DISTINCT ON (sr.source_system)
      sr.source_system,
      sr.status AS last_run_status
    FROM sync_runs sr
    WHERE sr.company_id = p_company_id
    ORDER BY sr.source_system, sr.started_at DESC
  )
  SELECT
    ps.source_system,
    ps.total_runs,
    ps.succeeded_runs,
    ps.failed_runs,
    ps.running_runs,
    ps.pending_runs,
    ps.last_run_at,
    ls.last_run_status,
    ps.total_record_count
  FROM per_source ps
  LEFT JOIN last_status ls ON ls.source_system = ps.source_system
  ORDER BY ps.source_system;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dms_sync_runs_summary(text) TO authenticated;

-- Per-staging-table row counts. Each row carries:
--   • table_name              — friendly identifier
--   • total_rows              — all staged rows
--   • normalized_rows         — rows already linked to canonical (normalized_payload is not null OR canonical_*_id is not null)
--   • pending_rows            — total - normalized
--   • latest_fetched_at       — most recent fetched_at across the table
--
-- Using union-all of per-table queries keeps the function deterministic and
-- avoids dynamic SQL; staging table list is fixed by the dms_legacy_sync_foundation
-- migration.

CREATE OR REPLACE FUNCTION get_dms_raw_staging_counts(
  p_company_id text
)
RETURNS TABLE (
  table_name        text,
  total_rows        bigint,
  normalized_rows   bigint,
  pending_rows      bigint,
  latest_fetched_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT 'dms_raw_sales_orders'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_sales_orders WHERE company_id = p_company_id
  UNION ALL
  SELECT 'dms_raw_vehicle_stock'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_vehicle_stock WHERE company_id = p_company_id
  UNION ALL
  SELECT 'dms_raw_collections'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_collections WHERE company_id = p_company_id
  UNION ALL
  SELECT 'dms_raw_order_vehicle_matches'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_order_vehicle_matches WHERE company_id = p_company_id
  UNION ALL
  SELECT 'dms_raw_deliveries'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_deliveries WHERE company_id = p_company_id
  UNION ALL
  SELECT 'dms_raw_leads'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_leads WHERE company_id = p_company_id
  UNION ALL
  SELECT 'dms_raw_prospects'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_prospects WHERE company_id = p_company_id
  UNION ALL
  SELECT 'dms_raw_soa_snapshots'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_soa_snapshots WHERE company_id = p_company_id
  UNION ALL
  SELECT 'dms_raw_master_data'::text,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NOT NULL)::bigint,
         COUNT(*) FILTER (WHERE normalized_payload IS NULL)::bigint,
         MAX(fetched_at)
    FROM dms_raw_master_data WHERE company_id = p_company_id
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dms_raw_staging_counts(text) TO authenticated;

-- Phase 3c feature flag (global, default-off).
INSERT INTO public.feature_flags (company_id, code, enabled, description)
VALUES (NULL, 'phase3c.dms-sync-ops-v2', false, 'DMS Sync Ops dashboard (read-only sync runs + staging counts).')
ON CONFLICT DO NOTHING;
