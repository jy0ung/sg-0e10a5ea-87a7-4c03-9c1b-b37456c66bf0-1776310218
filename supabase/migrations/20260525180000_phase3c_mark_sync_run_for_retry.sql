-- Phase 3c.2: Manual replay — mark_sync_run_for_retry
-- Operator action that resets a failed/cancelled sync_run back to 'pending'
-- so the next worker pass picks it up. Until the captcha-gated Proton service
-- account is provisioned (per Decision #7), the actual worker is on the
-- operator-assisted / manual-upload path; this RPC is the deliberate
-- hand-off that signals "retry this".
--
-- Guards:
--   • Caller must be admin or director (table-level RLS) AND same-company.
--   • Current status MUST be 'failed' or 'cancelled'. Resetting a 'succeeded'
--     or 'running' run is rejected to prevent duplicate ingestion.
--   • SECURITY DEFINER with explicit company match on the row.

CREATE OR REPLACE FUNCTION mark_sync_run_for_retry(
  p_company_id text,
  p_run_id     uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id      uuid := auth.uid();
  v_caller_role    text;
  v_current_status text;
BEGIN
  -- Caller must belong to the company (or have global scope)
  SELECT role INTO v_caller_role
    FROM profiles
   WHERE id = v_caller_id
     AND (company_id = p_company_id OR access_scope = 'global');

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Admin / director gate (matches the ADMIN_AND_DIRECTOR route guard
  -- on the UI side; both layers enforce so RLS isn't the only line of defence)
  IF v_caller_role NOT IN ('super_admin', 'company_admin', 'director') THEN
    RAISE EXCEPTION 'Insufficient role for sync run retry: %', v_caller_role;
  END IF;

  -- Verify the run exists, belongs to the company, and is in a retryable state
  SELECT status INTO v_current_status
    FROM sync_runs
   WHERE id = p_run_id AND company_id = p_company_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Sync run % not found for company %', p_run_id, p_company_id;
  END IF;

  IF v_current_status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'Sync run % is in status % and cannot be retried (must be failed or cancelled)',
      p_run_id, v_current_status;
  END IF;

  -- Reset state. Keep started_at so the audit trail preserves the original
  -- attempt; the next worker pass will overwrite started_at when it begins.
  UPDATE sync_runs
     SET status         = 'pending',
         error_code     = NULL,
         error_message  = NULL,
         finished_at    = NULL,
         updated_at     = now()
   WHERE id = p_run_id AND company_id = p_company_id;

  -- Audit
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes, table_name)
  VALUES (
    v_caller_id,
    'sync_run_retry',
    'sync_run',
    p_run_id,
    jsonb_build_object(
      'previous_status', v_current_status,
      'new_status',      'pending'
    ),
    'sync_runs'
  );

  RETURN p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_sync_run_for_retry(text, uuid) TO authenticated;
