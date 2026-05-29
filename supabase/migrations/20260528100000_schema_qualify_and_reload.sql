-- ─────────────────────────────────────────────────────────────────────────────
-- Production regression recovery: schema-qualify Phase-3-and-later RPCs and
-- explicitly reload the PostgREST schema cache.
--
-- This is the second half of the fix for the "Could not find the function
-- public.get_role_home_kpis(...)" outage. The first half (operational) is
-- `supabase db push --local --yes` on the host. This second half is a defense-
-- in-depth re-publication so that:
--
--   1. Any function that landed in a non-public schema due to search_path
--      drift gets dropped from there. The canonical public.* copies remain
--      in their original migrations (20260525*, 20260526*, 20260527*).
--   2. The PostgREST schema cache is forcibly reloaded at migration end so
--      a self-hosted stack without the pgrst event trigger still picks up
--      the new functions.
--   3. The function bodies are NOT changed here. We only assert presence
--      and reload the cache. Re-publication of bodies is the job of the
--      original migrations, which any production environment must already
--      have run via `supabase db push` before this migration is meaningful.
--
-- Safe to apply on environments where the previous migrations already ran:
-- the DROP-stray loop is a no-op when nothing landed outside public, the
-- presence assertions read pg_catalog only, and NOTIFY pgrst is idempotent
-- on both hosted and self-hosted Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL search_path = public, pg_catalog;

-- ─── 1. Drop stray non-public copies of at-risk RPCs ─────────────────────────
-- These names are all the Phase 3+/4+/5+/6+ frontend-callable RPCs. If any
-- earlier migration ran with a non-default search_path, the function landed
-- in the wrong schema and PostgREST cannot resolve it through /rest/v1/rpc/*.
-- This block removes any such stray copies so the canonical public.* version
-- becomes the only resolution candidate.
DO $$
DECLARE
  r record;
  target_names text[] := ARRAY[
    -- Phase 4b / 5a — Role-aware Home
    'get_role_home_kpis','upsert_role_kpi_defaults',
    -- Phase 3b — Financial reports
    'get_profit_loss','get_balance_sheet',
    'get_ar_aging_by_branch','get_ap_aging_by_branch',
    'get_cash_position','get_period_close_summary','get_period_close_unposted',
    -- Phase 3c — DMS Sync Ops
    'get_dms_sync_runs_summary','get_dms_raw_staging_counts','mark_sync_run_for_retry',
    -- Phase 3d — Reconciliation review
    'get_reconciliation_queue','get_reconciliation_status_counts',
    'get_reconciliation_match_detail','decide_reconciliation_match',
    -- Phase 3f — Lead intake
    'get_leads_feed','get_lead_detail','add_lead_followup',
    -- Phase 3e — Purchase Orders + GRN + 3-way match
    'create_purchase_order','transition_po_status',
    'create_grn','get_po_line_receipts',
    'get_three_way_match_status_counts','get_three_way_match_queue','get_three_way_match_status',
    -- Phase 6a — Webhook outbox
    'emit_webhook_event','upsert_webhook_endpoint','requeue_webhook_delivery',
    -- Phase 1 — Rate limiting (used by every edge fn)
    'bump_rate_limit',
    -- Phase 2 sales pipeline foundation
    'get_sales_dashboard_summary','get_sales_pipeline_summary','transition_sales_order_stage'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = ANY(target_names)
       AND n.nspname NOT IN ('public', 'pg_catalog', 'information_schema')
  LOOP
    EXECUTE format(
      'DROP FUNCTION %I.%I(%s)',
      r.schema, r.name, r.args
    );
    RAISE NOTICE 'Dropped stray %.%(%) — canonical copy is public.%',
      r.schema, r.name, r.args, r.name;
  END LOOP;
END$$;

-- ─── 2. Verify ledger state before declaring success ─────────────────────────
-- If any of these are still missing, the operator forgot to run
-- `supabase db push --local --yes` first. Fail the migration with a clear
-- message rather than letting the runtime "schema cache" error reach users.
DO $$
DECLARE
  required text[] := ARRAY[
    'get_role_home_kpis','upsert_role_kpi_defaults',
    'get_profit_loss','get_balance_sheet',
    'get_ar_aging_by_branch','get_ap_aging_by_branch',
    'get_cash_position','get_period_close_summary','get_period_close_unposted',
    'get_dms_sync_runs_summary','get_dms_raw_staging_counts','mark_sync_run_for_retry',
    'get_reconciliation_queue','get_reconciliation_status_counts',
    'get_reconciliation_match_detail','decide_reconciliation_match',
    'get_leads_feed','get_lead_detail','add_lead_followup',
    'create_purchase_order','transition_po_status',
    'create_grn','get_po_line_receipts',
    'get_three_way_match_status_counts','get_three_way_match_queue','get_three_way_match_status',
    'emit_webhook_event','upsert_webhook_endpoint','requeue_webhook_delivery',
    'bump_rate_limit',
    'get_sales_dashboard_summary','get_sales_pipeline_summary','transition_sales_order_stage'
  ];
  missing text[] := ARRAY[]::text[];
  fn_name text;
BEGIN
  FOREACH fn_name IN ARRAY required LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = fn_name
    ) THEN
      missing := array_append(missing, fn_name);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration ledger out of sync. Missing public RPCs: %. '
      'Run `supabase db push --local --yes` to apply pending migrations BEFORE this one.',
      array_to_string(missing, ', ');
  END IF;
END$$;

-- ─── 3. Force PostgREST to reload its schema cache ───────────────────────────
-- On hosted Supabase, the pgrst event trigger already fires automatically
-- on DDL. On the self-hosted host-local stack used by production, this
-- explicit notify is the only reliable way to guarantee the new functions
-- become visible at /rest/v1/rpc/* immediately after migration apply.
-- Sending it twice (once here, once via the trigger) is harmless.
NOTIFY pgrst, 'reload schema';
