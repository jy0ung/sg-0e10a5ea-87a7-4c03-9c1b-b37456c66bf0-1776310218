-- ─── Rate Limits ─────────────────────────────────────────────────────────────
--
-- Durable rate-limit store for edge functions. Replaces the in-memory
-- sliding windows in invite-user / send-push-notification /
-- rollover-leave-balances, which lose state on isolate cold starts and do
-- not share across replicas.
--
-- Model: fixed-window counter keyed by (caller_id, action). The counter is
-- bumped through bump_rate_limit() which is SECURITY DEFINER so edge
-- functions can call it with the caller's JWT without needing direct
-- INSERT/UPDATE privileges on the table.
--
-- Window semantics:
--   • window_seconds defines the rolling reset interval.
--   • A row's window_start is the wall-clock anchor of the current window.
--     When it has elapsed, the next bump resets count to 1 and advances
--     window_start to now().
--   • The function returns { allowed, remaining, reset_at } so the
--     edge function can stamp standard Retry-After / X-RateLimit headers.
--
-- Tenancy: the table has no company_id. Counters are per-caller. A
-- super_admin probing many companies will share their own counter — that
-- is intentional, since the limit protects function compute, not data.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limits (
  caller_id      uuid          NOT NULL,
  action         text          NOT NULL,
  window_start   timestamptz   NOT NULL DEFAULT now(),
  count          integer       NOT NULL DEFAULT 0,
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (caller_id, action)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No client-side INSERT/UPDATE/DELETE. All writes flow through
-- bump_rate_limit(). SELECT is allowed for the caller's own rows so an
-- admin UI can show "you have N invites remaining this hour."
CREATE POLICY "Callers read own rate_limits"
  ON public.rate_limits FOR SELECT
  USING (caller_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.rate_limits FROM anon, authenticated;

-- ─── bump_rate_limit() ───────────────────────────────────────────────────────
--
-- Atomic increment-or-reset. Returns:
--   allowed     = true if the caller is within budget after this call
--   remaining   = budget left in the current window (>= 0)
--   reset_at    = when the current window expires
--
-- Safe to call from any edge function. RLS doesn't apply because the
-- function is SECURITY DEFINER and runs as the table owner.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bump_rate_limit(
  p_caller_id      uuid,
  p_action         text,
  p_max_calls      integer,
  p_window_seconds integer
) RETURNS TABLE (
  allowed     boolean,
  remaining   integer,
  reset_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now          timestamptz := now();
  v_window_start timestamptz;
  v_count        integer;
  v_reset_at     timestamptz;
BEGIN
  -- Validate inputs to avoid runaway budgets if a caller passes nonsense.
  IF p_max_calls IS NULL OR p_max_calls <= 0 THEN
    RAISE EXCEPTION 'bump_rate_limit: p_max_calls must be > 0';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'bump_rate_limit: p_window_seconds must be > 0';
  END IF;
  IF p_action IS NULL OR length(p_action) = 0 THEN
    RAISE EXCEPTION 'bump_rate_limit: p_action must be non-empty';
  END IF;
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'bump_rate_limit: p_caller_id must be non-null';
  END IF;

  -- Upsert and atomically increment / reset.
  INSERT INTO public.rate_limits (caller_id, action, window_start, count, updated_at)
  VALUES (p_caller_id, p_action, v_now, 1, v_now)
  ON CONFLICT (caller_id, action) DO UPDATE
    SET count =
          CASE
            WHEN public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now THEN 1
            ELSE public.rate_limits.count + 1
          END,
        window_start =
          CASE
            WHEN public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now THEN v_now
            ELSE public.rate_limits.window_start
          END,
        updated_at = v_now
  RETURNING public.rate_limits.window_start, public.rate_limits.count
  INTO v_window_start, v_count;

  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  RETURN QUERY SELECT
    (v_count <= p_max_calls),                   -- allowed
    GREATEST(p_max_calls - v_count, 0),         -- remaining
    v_reset_at;                                 -- reset_at
END;
$$;

REVOKE ALL ON FUNCTION public.bump_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(uuid, text, integer, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.bump_rate_limit(uuid, text, integer, integer) IS
  'Atomic fixed-window rate-limit bump. Returns allowed/remaining/reset_at. Called by edge functions before processing a request.';

COMMENT ON TABLE public.rate_limits IS
  'Per-caller, per-action fixed-window rate-limit counters. Written only by bump_rate_limit().';
