#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
WORK_DIR="$(mktemp -d "/tmp/ubs-staging-qualification.${RUN_ID}.XXXXXX")"
SEEDED=0

required=(STAGING_APP_URL STAGING_SUPABASE_URL STAGING_SUPABASE_ANON_KEY STAGING_SUPABASE_SERVICE_ROLE_KEY STAGING_DB_URL STAGING_LOGIN_EMAIL STAGING_LOGIN_PASSWORD CONFIRM_STAGING_TARGET)
missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then missing+=("$name"); fi
done
if (( ${#missing[@]} > 0 )); then
  echo "Missing staging configuration names: ${missing[*]}" >&2
  exit 2
fi

if [[ "$CONFIRM_STAGING_TARGET" != 'isolated-staging' ]]; then
  echo 'Refusing remote qualification without CONFIRM_STAGING_TARGET=isolated-staging.' >&2
  exit 2
fi

node - "$STAGING_APP_URL" "$STAGING_SUPABASE_URL" <<'NODE'
const knownProductionHosts = new Set(['ubs.protonfookloi.com', 'hrms.protonfookloi.com']);
for (const raw of process.argv.slice(2)) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error(`Staging URL must use HTTPS: ${url.hostname}`);
  if (knownProductionHosts.has(url.hostname)) throw new Error(`Refusing known production host: ${url.hostname}`);
}
NODE

if [[ "${STAGING_APPLY_MIGRATIONS:-0}" != '1' && "${STAGING_SCHEMA_ALREADY_CURRENT:-0}" != '1' ]]; then
  echo 'Set STAGING_APPLY_MIGRATIONS=1 to apply the candidate, or STAGING_SCHEMA_ALREADY_CURRENT=1 for a pre-migrated isolated target.' >&2
  exit 2
fi

cleanup() {
  if [[ "$SEEDED" == '1' ]]; then
    SUPABASE_URL="$STAGING_SUPABASE_URL" \
    SUPABASE_SERVICE_ROLE_KEY="$STAGING_SUPABASE_SERVICE_ROLE_KEY" \
    RLS_COMPANY_A_ID="$RLS_COMPANY_A_ID" RLS_COMPANY_B_ID="$RLS_COMPANY_B_ID" \
    RLS_USER_A_EMAIL="$RLS_USER_A_EMAIL" RLS_USER_A_PASSWORD="$RLS_USER_A_PASSWORD" \
    RLS_USER_B_EMAIL="$RLS_USER_B_EMAIL" RLS_USER_B_PASSWORD="$RLS_USER_B_PASSWORD" \
    CONFIRM_RLS_TEST_CLEANUP=delete-rls-test-data \
      npm --prefix "$ROOT_DIR" run test:rls:cleanup >/dev/null || \
      echo 'WARNING: automatic staging fixture cleanup failed; run the documented cleanup command.' >&2
  fi
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT

cp -R "$ROOT_DIR/supabase" "$WORK_DIR/supabase"

echo 'Planning candidate migrations against the confirmed isolated staging database...'
supabase db push --db-url "$STAGING_DB_URL" --dry-run --workdir "$WORK_DIR"
if [[ "${STAGING_APPLY_MIGRATIONS:-0}" == '1' ]]; then
  echo 'Applying candidate migrations to isolated staging...'
  supabase db push --db-url "$STAGING_DB_URL" --workdir "$WORK_DIR" --yes
fi

echo 'Verifying migration history and database lint...'
supabase migration list --db-url "$STAGING_DB_URL" --workdir "$WORK_DIR"
supabase db lint --db-url "$STAGING_DB_URL" --level warning --fail-on warning --workdir "$WORK_DIR"
command -v psql >/dev/null || { echo 'psql is required for staging catalog assertions.' >&2; exit 2; }

assert_count() {
  local expected="$1" label="$2" sql="$3" count
  count="$(psql "$STAGING_DB_URL" -XAtc "$sql")"
  if [[ "$count" != "$expected" ]]; then
    echo "FAIL ${label} (${count})" >&2
    exit 1
  fi
  echo "PASS ${label}"
}

assert_count 1 'latest approval compatibility migration applied' \
  "select count(*) from supabase_migrations.schema_migrations where version='20260915100000'"
assert_count 1 'approval decision target constraint present' \
  "select count(*) from pg_constraint where conrelid='public.approval_decisions'::regclass and conname='approval_decisions_exactly_one_target' and convalidated"
assert_count 1 'approval_request_id is nullable' \
  "select count(*) from information_schema.columns where table_schema='public' and table_name='approval_decisions' and column_name='approval_request_id' and is_nullable='YES'"
assert_count 0 'public tables without RLS' \
  "select count(*) from pg_tables where schemaname='public' and not rowsecurity"
assert_count 0 'unsafe SECURITY DEFINER search paths' \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig,'{}') && array['search_path=pg_catalog, public','search_path=pg_catalog,public']"
assert_count 0 'anonymous application-owned functions' \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')"
assert_count 0 'unscoped authenticated read policies' \
  "select count(*) from pg_policies where schemaname='public' and qual='true' and cmd in ('SELECT','ALL') and roles::text <> '{service_role}' and not (tablename='normalizer_column_authority' and policyname='normalizer_column_authority_select_authenticated')"

export RLS_COMPANY_A_ID="release-a-${RUN_ID}"
export RLS_COMPANY_B_ID="release-b-${RUN_ID}"
export RLS_USER_A_EMAIL="release-a-${RUN_ID}@rls.test"
export RLS_USER_B_EMAIL="release-b-${RUN_ID}@rls.test"
export RLS_USER_A_PASSWORD="${STAGING_RLS_USER_A_PASSWORD:-Test1234!${RUN_ID}}"
export RLS_USER_B_PASSWORD="${STAGING_RLS_USER_B_PASSWORD:-Test1234!${RUN_ID}}"

echo 'Seeding isolated staging qualification actors...'
SUPABASE_URL="$STAGING_SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$STAGING_SUPABASE_SERVICE_ROLE_KEY" \
ALLOW_REMOTE_RLS_SEED=1 npm --prefix "$ROOT_DIR" run test:rls:seed >/dev/null
SEEDED=1

echo 'Running live Auth, RLS, RPC, persistence, HRMS, AP, and sales checks...'
SUPABASE_URL="$STAGING_SUPABASE_URL" VITE_SUPABASE_URL="$STAGING_SUPABASE_URL" \
VITE_SUPABASE_ANON_KEY="$STAGING_SUPABASE_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$STAGING_SUPABASE_SERVICE_ROLE_KEY" \
RLS_USER_A_EMAIL="$RLS_USER_A_EMAIL" RLS_USER_A_PASSWORD="$RLS_USER_A_PASSWORD" \
RLS_USER_B_EMAIL="$RLS_USER_B_EMAIL" RLS_USER_B_PASSWORD="$RLS_USER_B_PASSWORD" \
  npm --prefix "$ROOT_DIR" run test:rls

echo 'Running deployed browser, transport, bundle, session, and logout checks...'
PROD_URL="$STAGING_APP_URL" PROD_HEALTH_URL="${STAGING_HEALTH_URL:-${STAGING_APP_URL%/}/healthz}" \
PROD_EXPECTED_SUPABASE_URL="$STAGING_SUPABASE_URL" \
PROD_EXPECTED_HRMS_APP_URL="${STAGING_HRMS_APP_URL:-${STAGING_APP_URL%/}/hrms/}" \
PROD_LOGIN_EMAIL="$STAGING_LOGIN_EMAIL" PROD_LOGIN_PASSWORD="$STAGING_LOGIN_PASSWORD" \
PROD_LOGIN_REQUIRED=1 npm --prefix "$ROOT_DIR" run verify:production

echo 'Running anonymous and invalid-token edge-function checks...'
SMOKE_SUPABASE_URL="$STAGING_SUPABASE_URL" npm --prefix "$ROOT_DIR" run security:smoke

echo 'Staging automated qualification passed. Complete the manual evidence items in docs/STAGING_QUALIFICATION.md.'
