-- Phase 3d: Reconciliation Review Queue
-- Surfaces source_reconciliation_matches (seeded by
-- seed_source_reconciliation_candidates) to reviewers and lets them
-- accept / reject / ignore a candidate. All writes go through
-- decide_reconciliation_match — a SECURITY DEFINER RPC that also records
-- an append-only source_reconciliation_events row, so the audit trail is
-- complete and bypassing the RPC is not possible from the browser.
--
-- §3.1 contract: "side-by-side DMS/UBS/legacy evidence; writes
-- reconciliation_decisions; updates canonical via SECURITY DEFINER RPCs
-- only." This migration delivers the queue list, the side-by-side detail
-- RPC, and the decision RPC.

CREATE OR REPLACE FUNCTION get_reconciliation_queue(
  p_company_id   text,
  p_object_type  text DEFAULT NULL,
  p_match_status text DEFAULT NULL,
  p_limit        int  DEFAULT 100
)
RETURNS TABLE (
  id                  uuid,
  object_type         text,
  source_system       text,
  source_table        text,
  source_record_id    uuid,
  canonical_table     text,
  canonical_record_id uuid,
  match_status        text,
  confidence_score    numeric,
  match_rule          text,
  source_priority     int,
  review_owner        uuid,
  reviewed_at         timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
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
  SELECT
    m.id,
    m.object_type,
    m.source_system,
    m.source_table,
    m.source_record_id,
    m.canonical_table,
    m.canonical_record_id,
    m.match_status,
    m.confidence_score,
    m.match_rule,
    m.source_priority,
    m.review_owner,
    m.reviewed_at,
    m.created_at,
    m.updated_at
  FROM source_reconciliation_matches m
  WHERE m.company_id = p_company_id
    AND (p_object_type  IS NULL OR m.object_type  = p_object_type)
    AND (p_match_status IS NULL OR m.match_status = p_match_status)
  ORDER BY
    -- Action-needed states first, then by priority (lower = higher), then newest first
    CASE m.match_status
      WHEN 'conflict'   THEN 0
      WHEN 'candidate'  THEN 1
      WHEN 'auto_matched' THEN 2
      WHEN 'accepted'   THEN 3
      WHEN 'rejected'   THEN 4
      WHEN 'ignored'    THEN 5
      ELSE 6
    END,
    m.source_priority,
    m.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_reconciliation_queue(text, text, text, int) TO authenticated;

-- Per-status counts for the dashboard header. Keeps the queue list page
-- responsive even at high volumes (operators care most about candidate +
-- conflict totals).
CREATE OR REPLACE FUNCTION get_reconciliation_status_counts(
  p_company_id text
)
RETURNS TABLE (
  match_status text,
  total        int
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
  SELECT m.match_status, COUNT(*)::int
  FROM source_reconciliation_matches m
  WHERE m.company_id = p_company_id
  GROUP BY m.match_status
  ORDER BY m.match_status;
END;
$$;

GRANT EXECUTE ON FUNCTION get_reconciliation_status_counts(text) TO authenticated;

-- Side-by-side detail: returns the match row plus the source raw payload
-- and the canonical record (when present) as jsonb. The page builds the
-- two-column diff view from this single call.
--
-- We use dynamic SQL because source_table and canonical_table are
-- variable; the set of allowed table names is constrained to the staging
-- + canonical tables the foundation defines, so injection is bounded.

CREATE OR REPLACE FUNCTION get_reconciliation_match_detail(
  p_company_id text,
  p_match_id   uuid
)
RETURNS TABLE (
  id                  uuid,
  object_type         text,
  source_system       text,
  source_table        text,
  source_record_id    uuid,
  canonical_table     text,
  canonical_record_id uuid,
  match_status        text,
  confidence_score    numeric,
  match_rule          text,
  match_basis         jsonb,
  conflict_payload    jsonb,
  source_priority     int,
  review_owner        uuid,
  reviewed_at         timestamptz,
  review_notes        text,
  source_payload      jsonb,
  canonical_payload   jsonb,
  created_at          timestamptz,
  updated_at          timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_match           source_reconciliation_matches%rowtype;
  v_source_payload  jsonb;
  v_canonical_payload jsonb;
  v_allowed_source_tables    text[] := ARRAY[
    'dms_raw_sales_orders', 'dms_raw_vehicle_stock', 'dms_raw_collections',
    'dms_raw_order_vehicle_matches', 'dms_raw_deliveries', 'dms_raw_leads',
    'dms_raw_prospects', 'dms_raw_soa_snapshots', 'dms_raw_master_data',
    'legacy_staging_customers', 'legacy_staging_sales_invoices', 'legacy_staging_records'
  ];
  v_allowed_canonical_tables text[] := ARRAY[
    'sales_orders', 'vehicles', 'customers', 'invoices'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (company_id = p_company_id OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_match
  FROM source_reconciliation_matches
  WHERE source_reconciliation_matches.id = p_match_id
    AND source_reconciliation_matches.company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation match % not found for company %', p_match_id, p_company_id;
  END IF;

  -- Validate table names before any dynamic SQL
  IF NOT (v_match.source_table = ANY(v_allowed_source_tables)) THEN
    RAISE EXCEPTION 'Disallowed source_table: %', v_match.source_table;
  END IF;

  IF v_match.canonical_table IS NOT NULL
     AND NOT (v_match.canonical_table = ANY(v_allowed_canonical_tables)) THEN
    RAISE EXCEPTION 'Disallowed canonical_table: %', v_match.canonical_table;
  END IF;

  -- Fetch source row as jsonb
  EXECUTE format(
    'SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1 AND t.company_id = $2',
    v_match.source_table
  )
  INTO v_source_payload
  USING v_match.source_record_id, p_company_id;

  -- Fetch canonical row as jsonb (only if linked)
  IF v_match.canonical_table IS NOT NULL AND v_match.canonical_record_id IS NOT NULL THEN
    EXECUTE format(
      'SELECT to_jsonb(t.*) FROM public.%I t WHERE t.id = $1 AND t.company_id = $2',
      v_match.canonical_table
    )
    INTO v_canonical_payload
    USING v_match.canonical_record_id, p_company_id;
  END IF;

  RETURN QUERY
  SELECT
    v_match.id,
    v_match.object_type,
    v_match.source_system,
    v_match.source_table,
    v_match.source_record_id,
    v_match.canonical_table,
    v_match.canonical_record_id,
    v_match.match_status,
    v_match.confidence_score,
    v_match.match_rule,
    v_match.match_basis,
    v_match.conflict_payload,
    v_match.source_priority,
    v_match.review_owner,
    v_match.reviewed_at,
    v_match.review_notes,
    COALESCE(v_source_payload, '{}'::jsonb),
    COALESCE(v_canonical_payload, '{}'::jsonb),
    v_match.created_at,
    v_match.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_reconciliation_match_detail(text, uuid) TO authenticated;

-- Decision RPC. Allowed transitions:
--   candidate / auto_matched / conflict → accepted | rejected | ignored
-- Disallowed: anything → candidate (system-owned initial state).
-- Disallowed: reversing terminal decisions in the same RPC (use a follow-up).
-- Writes a source_reconciliation_events row with event_type = decision.

CREATE OR REPLACE FUNCTION decide_reconciliation_match(
  p_company_id text,
  p_match_id   uuid,
  p_decision   text,          -- 'accepted' | 'rejected' | 'ignored'
  p_notes      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_caller_role  text;
  v_current      text;
BEGIN
  SELECT role INTO v_caller_role
    FROM profiles
   WHERE id = v_caller_id
     AND (company_id = p_company_id OR access_scope = 'global');

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_caller_role NOT IN ('super_admin', 'company_admin', 'director', 'general_manager', 'accounts') THEN
    RAISE EXCEPTION 'Insufficient role for reconciliation decision: %', v_caller_role;
  END IF;

  IF p_decision NOT IN ('accepted', 'rejected', 'ignored') THEN
    RAISE EXCEPTION 'Invalid decision: % (must be accepted, rejected, or ignored)', p_decision;
  END IF;

  SELECT match_status INTO v_current
    FROM source_reconciliation_matches
   WHERE id = p_match_id AND company_id = p_company_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Reconciliation match % not found for company %', p_match_id, p_company_id;
  END IF;

  IF v_current NOT IN ('candidate', 'auto_matched', 'conflict') THEN
    RAISE EXCEPTION 'Match % is in terminal state % and cannot be re-decided',
      p_match_id, v_current;
  END IF;

  UPDATE source_reconciliation_matches
     SET match_status = p_decision,
         review_owner = v_caller_id,
         reviewed_at  = now(),
         review_notes = COALESCE(p_notes, review_notes),
         updated_at   = now()
   WHERE id = p_match_id AND company_id = p_company_id;

  INSERT INTO source_reconciliation_events (
    company_id, match_id, event_type, event_payload, created_by
  ) VALUES (
    p_company_id, p_match_id, p_decision,
    jsonb_build_object(
      'previous_status', v_current,
      'new_status',      p_decision,
      'notes',           p_notes
    ),
    v_caller_id
  );

  RETURN p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION decide_reconciliation_match(text, uuid, text, text) TO authenticated;

-- Phase 3d feature flag (global, default-off).
INSERT INTO public.feature_flags (company_id, code, enabled, description)
VALUES (NULL, 'phase3d.reconciliation-review-v2', false, 'Reconciliation Review Queue UI for source_reconciliation_matches.')
ON CONFLICT DO NOTHING;
