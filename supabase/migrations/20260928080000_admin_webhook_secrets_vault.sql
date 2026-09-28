-- Store webhook HMAC keys in encrypted Supabase Vault and remove ordinary
-- browser reads of endpoint rows. Endpoint metadata is exposed by a guarded
-- projection RPC; creation and rotation reveal a new key once.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

ALTER TABLE public.webhook_endpoints ADD COLUMN secret_id uuid;
DO $$
DECLARE
  endpoint record;
  vault_id uuid;
BEGIN
  FOR endpoint IN SELECT id, secret FROM public.webhook_endpoints LOOP
    SELECT vault.create_secret(endpoint.secret, 'webhook-endpoint-' || endpoint.id::text)
      INTO vault_id;
    UPDATE public.webhook_endpoints SET secret_id = vault_id WHERE id = endpoint.id;
  END LOOP;
END;
$$;
ALTER TABLE public.webhook_endpoints ALTER COLUMN secret_id SET NOT NULL;
ALTER TABLE public.webhook_endpoints DROP COLUMN secret;

CREATE OR REPLACE FUNCTION public.delete_webhook_vault_secret()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = OLD.secret_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_webhook_vault_secret() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_delete_webhook_vault_secret
AFTER DELETE ON public.webhook_endpoints
FOR EACH ROW EXECUTE FUNCTION public.delete_webhook_vault_secret();

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_webhook_endpoints(p_company_id text)
RETURNS TABLE (
  id uuid, company_id text, name text, url text, event_types text[], active boolean,
  last_success_at timestamptz, last_failure_at timestamptz, consecutive_failures integer,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = auth.uid() AND actor.status = 'active'
      AND actor.role IN ('super_admin', 'company_admin')
      AND (
        actor.company_id = p_company_id
        OR (actor.role = 'super_admin' AND actor.access_scope = 'global')
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to list webhook endpoints' USING errcode = '42501';
  END IF;

  RETURN QUERY SELECT ep.id, ep.company_id, ep.name, ep.url, ep.event_types, ep.active,
    ep.last_success_at, ep.last_failure_at, ep.consecutive_failures,
    ep.created_at, ep.updated_at
    FROM public.webhook_endpoints ep
   WHERE ep.company_id = p_company_id
   ORDER BY ep.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_webhook_endpoints(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_webhook_endpoints(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_webhook_endpoint(
  p_company_id text, p_name text, p_url text, p_event_types text[], p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid := pg_catalog.gen_random_uuid();
  v_secret text := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_secret_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = v_actor AND actor.status = 'active'
      AND actor.role IN ('super_admin', 'company_admin')
      AND (
        actor.company_id = p_company_id
        OR (actor.role = 'super_admin' AND actor.access_scope = 'global')
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to create webhook endpoint' USING errcode = '42501';
  END IF;
  IF NULLIF(pg_catalog.btrim(p_name), '') IS NULL OR p_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Webhook name and HTTPS URL are required';
  END IF;

  SELECT vault.create_secret(v_secret, 'webhook-endpoint-' || v_id::text)
    INTO v_secret_id;
  INSERT INTO public.webhook_endpoints (
    id, company_id, name, url, secret_id, event_types, active, created_by
  ) VALUES (
    v_id, p_company_id, pg_catalog.btrim(p_name), p_url, v_secret_id,
    COALESCE(p_event_types, '{}'), COALESCE(p_active, true), v_actor
  );
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'create', 'webhook_endpoint', v_id, 'webhook_endpoints',
    pg_catalog.jsonb_build_object('company_id', p_company_id, 'url', p_url, 'event_types', p_event_types));
  RETURN pg_catalog.jsonb_build_object('id', v_id, 'secret', v_secret);
END;
$$;
REVOKE ALL ON FUNCTION public.create_webhook_endpoint(text, text, text, text[], boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_webhook_endpoint(text, text, text, text[], boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_webhook_endpoint(
  p_id uuid, p_company_id text, p_name text, p_url text, p_event_types text[], p_active boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_before public.webhook_endpoints%ROWTYPE;
BEGIN
  SELECT * INTO v_before FROM public.webhook_endpoints ep
   WHERE ep.id = p_id AND ep.company_id = p_company_id FOR UPDATE;
  IF v_before.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = v_actor AND actor.status = 'active'
      AND actor.role IN ('super_admin', 'company_admin')
      AND (
        actor.company_id = p_company_id
        OR (actor.role = 'super_admin' AND actor.access_scope = 'global')
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to update webhook endpoint' USING errcode = '42501';
  END IF;
  IF NULLIF(pg_catalog.btrim(p_name), '') IS NULL OR p_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Webhook name and HTTPS URL are required';
  END IF;

  UPDATE public.webhook_endpoints SET
    name = pg_catalog.btrim(p_name), url = p_url,
    event_types = COALESCE(p_event_types, '{}'), active = p_active,
    updated_at = now()
   WHERE id = p_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'update', 'webhook_endpoint', p_id, 'webhook_endpoints',
    pg_catalog.jsonb_build_object(
      'before', pg_catalog.jsonb_build_object('name', v_before.name, 'url', v_before.url,
        'event_types', v_before.event_types, 'active', v_before.active),
      'after', pg_catalog.jsonb_build_object('name', p_name, 'url', p_url,
        'event_types', p_event_types, 'active', p_active)
    ));
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_webhook_endpoint(uuid, text, text, text, text[], boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_webhook_endpoint(uuid, text, text, text, text[], boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.rotate_webhook_endpoint_secret(p_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_endpoint public.webhook_endpoints%ROWTYPE;
  v_secret text := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  SELECT * INTO v_endpoint FROM public.webhook_endpoints WHERE id = p_id FOR UPDATE;
  IF v_endpoint.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = v_actor AND actor.status = 'active'
      AND actor.role IN ('super_admin', 'company_admin')
      AND (
        actor.company_id = v_endpoint.company_id
        OR (actor.role = 'super_admin' AND actor.access_scope = 'global')
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to rotate webhook secret' USING errcode = '42501';
  END IF;
  PERFORM vault.update_secret(v_endpoint.secret_id, v_secret);
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, table_name, changes)
  VALUES (v_actor, 'rotate_secret', 'webhook_endpoint', p_id, 'webhook_endpoints',
    pg_catalog.jsonb_build_object('company_id', v_endpoint.company_id));
  RETURN v_secret;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_webhook_endpoint_secret(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_webhook_endpoint_secret(uuid) TO authenticated;

-- Delivery code uses a service-role client and receives the key only inside
-- the Edge Function. This RPC is never executable by a browser JWT.
CREATE OR REPLACE FUNCTION public.get_webhook_delivery_secret(p_endpoint_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_secret text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized to read webhook signing secret' USING errcode = '42501';
  END IF;
  SELECT decrypted.decrypted_secret INTO v_secret
    FROM public.webhook_endpoints ep
    JOIN vault.decrypted_secrets decrypted ON decrypted.id = ep.secret_id
   WHERE ep.id = p_endpoint_id;
  IF v_secret IS NULL THEN RAISE EXCEPTION 'Webhook signing secret unavailable'; END IF;
  RETURN v_secret;
END;
$$;
REVOKE ALL ON FUNCTION public.get_webhook_delivery_secret(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_delivery_secret(uuid) TO service_role;

-- Old browser clients must fail closed instead of writing a secret-bearing row.
DROP FUNCTION public.upsert_webhook_endpoint(uuid, text, text, text, text, text[], boolean);
