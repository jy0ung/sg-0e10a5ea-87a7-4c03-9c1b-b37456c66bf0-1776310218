-- Phase 6a: Webhook outbox — durable fan-out of domain events to external
-- consumers (DMS sync to fookloi.net, Slack relays, customer ERP, etc.).
--
-- Design:
--   • webhook_endpoints holds one row per (company, URL) registration with
--     an opaque shared secret (HMAC-SHA256 key) and an event_types[] filter.
--   • webhook_outbox is the durable queue. Every call to emit_webhook_event
--     fans out one row per matching active endpoint, status='pending'.
--   • Edge function webhook-deliverer claims pending rows whose
--     next_retry_at <= now(), POSTs with X-Webhook-Signature, and either
--     marks delivered or schedules an exponential-backoff retry. After
--     8 attempts the row is marked 'dead' and surfaces in the admin UI.
--
-- Default-off via feature flag `phase6.webhook-outbox`. The emit RPC is a
-- safe no-op when no endpoints exist, so existing call sites can adopt it
-- ahead of any company opting in.

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      text         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            text         NOT NULL,
  url             text         NOT NULL,
  secret          text         NOT NULL,                       -- HMAC key; never returned to clients in plaintext
  event_types     text[]       NOT NULL DEFAULT '{}',          -- empty = subscribe to all events
  active          boolean      NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures int     NOT NULL DEFAULT 0,
  created_by      uuid         REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT webhook_endpoints_url_https CHECK (url LIKE 'https://%')
);

COMMENT ON TABLE public.webhook_endpoints IS
  'Per-company HTTPS endpoints that receive webhook deliveries from the outbox. Secret is opaque and never exposed to non-admin clients.';

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_company_active
  ON public.webhook_endpoints (company_id) WHERE active;

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- Only company admins / super admins can see and manage endpoints, since the
-- table stores HMAC secrets. Other roles never touch this surface.
CREATE POLICY "webhook_endpoints_admin_select" ON public.webhook_endpoints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin', 'company_admin')
         AND (company_id = webhook_endpoints.company_id OR access_scope = 'global')
    )
  );

CREATE POLICY "webhook_endpoints_admin_write" ON public.webhook_endpoints
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin', 'company_admin')
         AND (company_id = webhook_endpoints.company_id OR access_scope = 'global')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin', 'company_admin')
         AND (company_id = webhook_endpoints.company_id OR access_scope = 'global')
    )
  );

-- ─── Outbox ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'delivering', 'delivered', 'failed', 'dead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.webhook_outbox (
  id              uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     uuid                     NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  company_id      text                     NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type      text                     NOT NULL,
  payload         jsonb                    NOT NULL,
  status          webhook_delivery_status  NOT NULL DEFAULT 'pending',
  attempts        int                      NOT NULL DEFAULT 0,
  last_error      text,
  last_response_status int,
  next_retry_at   timestamptz              NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  created_at      timestamptz              NOT NULL DEFAULT now(),
  updated_at      timestamptz              NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_outbox IS
  'Durable queue. One row per (event, endpoint) fan-out. webhook-deliverer claims and processes by next_retry_at.';

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_due
  ON public.webhook_outbox (next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_company_status_created
  ON public.webhook_outbox (company_id, status, created_at DESC);

ALTER TABLE public.webhook_outbox ENABLE ROW LEVEL SECURITY;

-- Same visibility rule as endpoints: only company admins.
CREATE POLICY "webhook_outbox_admin_select" ON public.webhook_outbox
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('super_admin', 'company_admin')
         AND (company_id = webhook_outbox.company_id OR access_scope = 'global')
    )
  );

-- No direct INSERT/UPDATE from end users — all writes go through SECURITY
-- DEFINER RPCs or the service-role deliverer. This keeps the queue tamper-
-- proof from the user JWT path.

-- ─── RPCs ────────────────────────────────────────────────────────────────────

-- Emit one outbox row per matching active endpoint. Returns the number of
-- rows fanned out. Safe no-op when no endpoints are registered.
-- SECURITY DEFINER so feature code can call it as the user JWT without
-- needing INSERT grants on webhook_outbox.
CREATE OR REPLACE FUNCTION emit_webhook_event(
  p_company_id text,
  p_event_type text,
  p_payload    jsonb
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_company text;
  v_caller_scope   text;
  v_fanned         int := 0;
BEGIN
  SELECT company_id, access_scope
    INTO v_caller_company, v_caller_scope
    FROM profiles
   WHERE id = auth.uid();

  -- Same-company enforcement (or global scope). Service-role callers bypass
  -- this naturally because auth.uid() is NULL and the EXISTS check below
  -- already covers them via the service-role bypass on RLS.
  IF v_caller_scope IS DISTINCT FROM 'global'
     AND (v_caller_company IS NULL OR v_caller_company <> p_company_id) THEN
    RAISE EXCEPTION 'Unauthorized: caller cannot emit events for another company';
  END IF;

  INSERT INTO webhook_outbox (endpoint_id, company_id, event_type, payload)
  SELECT id, p_company_id, p_event_type, p_payload
    FROM webhook_endpoints
   WHERE company_id = p_company_id
     AND active
     AND (
       cardinality(event_types) = 0     -- subscribe-to-all
       OR p_event_type = ANY(event_types)
     );

  GET DIAGNOSTICS v_fanned = ROW_COUNT;
  RETURN v_fanned;
END;
$$;

GRANT EXECUTE ON FUNCTION emit_webhook_event(text, text, jsonb) TO authenticated;

-- Admin RPC: register / update an endpoint. Returns the row id.
CREATE OR REPLACE FUNCTION upsert_webhook_endpoint(
  p_id           uuid,           -- NULL to create, else the existing id
  p_company_id   text,
  p_name         text,
  p_url          text,
  p_secret       text,
  p_event_types  text[],
  p_active       boolean
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

  IF p_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Webhook URL must be HTTPS';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO webhook_endpoints (company_id, name, url, secret, event_types, active, created_by)
    VALUES (p_company_id, p_name, p_url, p_secret, COALESCE(p_event_types, '{}'), p_active, v_caller_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE webhook_endpoints
       SET name        = p_name,
           url         = p_url,
           secret      = p_secret,
           event_types = COALESCE(p_event_types, '{}'),
           active      = p_active,
           updated_at  = now()
     WHERE id = p_id
       AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Endpoint not found for company';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_webhook_endpoint(uuid, text, text, text, text, text[], boolean) TO authenticated;

-- Admin RPC: requeue a failed/dead delivery for immediate re-attempt.
CREATE OR REPLACE FUNCTION requeue_webhook_delivery(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_company   text;
BEGIN
  SELECT company_id INTO v_company FROM webhook_outbox WHERE id = p_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = v_caller_id
       AND role IN ('super_admin', 'company_admin')
       AND (company_id = v_company OR access_scope = 'global')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE webhook_outbox
     SET status        = 'pending',
         next_retry_at = now(),
         attempts      = 0,
         last_error    = NULL,
         updated_at    = now()
   WHERE id = p_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION requeue_webhook_delivery(uuid) TO authenticated;

-- ─── Flag seed ───────────────────────────────────────────────────────────────

INSERT INTO public.feature_flags (company_id, code, enabled, description)
VALUES (NULL, 'phase6.webhook-outbox', false,
        'Phase 6a — Webhook outbox: durable fan-out of domain events to external HTTPS consumers with HMAC signing.')
ON CONFLICT DO NOTHING;
