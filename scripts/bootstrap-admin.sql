-- ─────────────────────────────────────────────────────────────────────────────
-- Bootstrap Admin — one-shot SQL to activate the first super_admin for an env.
--
-- WHY THIS EXISTS
--   handle_new_user() (see 20260421100000_phase0_rls_hotfix.sql) intentionally
--   creates every new auth user with:
--     role='analyst', company_id=NULL, status='pending'
--   AuthContext then signs such users out with "pending activation" — this is
--   correct behaviour for normal users (they must be provisioned by an admin)
--   but it means a fresh environment has a chicken-and-egg problem: there is
--   no admin to activate the first admin.
--
--   Run this snippet ONCE per environment (UAT, staging, production) in the
--   Supabase SQL editor, AFTER creating the first user via Authentication →
--   Users. Replace the two placeholders below with your values.
--
-- SAFETY
--   • Idempotent — safe to re-run.
--   • RAISEs if the auth user does not exist yet (no silent no-op).
--   • Only touches the named user and a single companies row.
-- ─────────────────────────────────────────────────────────────────────────────

-- ❯❯❯ EDIT THESE TWO VALUES, then run the whole file. ❯❯❯
--    • __ADMIN_EMAIL__     → the email you used when creating the auth user
--    • __COMPANY_NAME__    → the human-readable tenant name (e.g. 'FLC')
-- ❮❮❮ END EDIT ❮❮❮

BEGIN;

DO $$
DECLARE
  v_email        text := '__ADMIN_EMAIL__';
  v_company_name text := '__COMPANY_NAME__';
  v_company_id   text;
  v_user_id      uuid;
BEGIN
  IF v_email = '__ADMIN_EMAIL__' OR v_company_name = '__COMPANY_NAME__' THEN
    RAISE EXCEPTION 'Replace __ADMIN_EMAIL__ and __COMPANY_NAME__ placeholders before running.';
  END IF;

  v_company_id := regexp_replace(lower(v_company_name), '[^a-z0-9]+', '-', 'g');

  -- 1. Ensure a company row exists. companies.id is TEXT; derive a stable
  --    slug so re-runs land on the same tenant.
  INSERT INTO public.companies (id, name, code)
  VALUES (v_company_id, v_company_name, upper(v_company_id))
  ON CONFLICT (id) DO NOTHING;

  -- 2. Locate the auth user. Fail loudly if they haven't signed up yet.
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Auth user % not found. Create them first via Authentication → Users, then re-run.',
      v_email;
  END IF;

  -- 3. Upsert the profile row as an active super_admin with global scope.
  --    ON CONFLICT handles both paths: trigger-created pending row, OR no row.
  INSERT INTO public.profiles (id, email, name, role, company_id, access_scope, status)
  VALUES (
    v_user_id,
    v_email,
    split_part(v_email, '@', 1),
    'super_admin',
    v_company_id,
    'global',
    'active'
  )
  ON CONFLICT (id) DO UPDATE
    SET role         = 'super_admin',
        company_id   = EXCLUDED.company_id,
        access_scope = 'global',
        status       = 'active';

  RAISE NOTICE 'Bootstrapped % as super_admin in company %', v_email, v_company_id;
END $$;

COMMIT;

-- Verify (edit email to match):
-- SELECT id, email, role, company_id, access_scope, status
--   FROM public.profiles WHERE email = '__ADMIN_EMAIL__';
