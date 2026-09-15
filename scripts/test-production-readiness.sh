#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
READINESS_PORT_BASE="${READINESS_PORT_BASE:-56320}"
READINESS_WORKDIR="$(mktemp -d "/tmp/ubs-readiness.${READINESS_PORT_BASE}.XXXXXX")"
READINESS_RUN_ID="${READINESS_WORKDIR##*.}"
READINESS_PROJECT_ID="ubs-readiness-${READINESS_PORT_BASE}-${READINESS_RUN_ID}"
STATUS_ENV_FILE="${READINESS_WORKDIR}/status.env"

cleanup() {
  # A readiness run must never preserve a database snapshot. Reusing a backup
  # can skip newly-added migrations and turn the reconstruction gate stale.
  supabase stop --workdir "$READINESS_WORKDIR" --project-id "$READINESS_PROJECT_ID" --no-backup >/dev/null 2>&1 || true
  if [[ "$READINESS_WORKDIR" == /tmp/ubs-readiness.* ]]; then
    rm -rf -- "$READINESS_WORKDIR"
  fi
}
trap cleanup EXIT

command -v docker >/dev/null || { echo 'Docker is required for production-readiness integration tests.' >&2; exit 1; }
command -v supabase >/dev/null || { echo 'Supabase CLI is required for production-readiness integration tests.' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'The Docker daemon is not available.' >&2; exit 1; }

cp -R "${ROOT_DIR}/supabase" "${READINESS_WORKDIR}/supabase"
CONFIG_FILE="${READINESS_WORKDIR}/supabase/config.toml"

if rg -q '^\[(db|studio|inbucket|analytics)\]$' "$CONFIG_FILE"; then
  echo 'The isolated-stack script must be updated because config.toml now defines local service ports.' >&2
  exit 1
fi

API_PORT=$((READINESS_PORT_BASE + 1))
DB_PORT=$((READINESS_PORT_BASE + 2))
STUDIO_PORT=$((READINESS_PORT_BASE + 3))
INBUCKET_PORT=$((READINESS_PORT_BASE + 4))
SMTP_PORT=$((READINESS_PORT_BASE + 5))
POP3_PORT=$((READINESS_PORT_BASE + 6))
ANALYTICS_PORT=$((READINESS_PORT_BASE + 7))
SHADOW_PORT=$READINESS_PORT_BASE

sed -i "s/^project_id = .*/project_id = \"${READINESS_PROJECT_ID}\"/" "$CONFIG_FILE"
sed -i "0,/^external_url = /s#^external_url = .*#external_url = \"http://127.0.0.1:${API_PORT}\"#" "$CONFIG_FILE"
sed -i "/^\[auth\]/,/^\[auth\./ { s#^site_url = .*#site_url = \"http://127.0.0.1:${API_PORT}\"#; s#^external_url = .*#external_url = \"http://127.0.0.1:${API_PORT}/auth/v1\"#; }" "$CONFIG_FILE"
sed -i "/^\[api\]/a port = ${API_PORT}" "$CONFIG_FILE"

cat >> "$CONFIG_FILE" <<EOF

[db]
port = ${DB_PORT}
shadow_port = ${SHADOW_PORT}
major_version = 15

[studio]
port = ${STUDIO_PORT}

[inbucket]
port = ${INBUCKET_PORT}
smtp_port = ${SMTP_PORT}
pop3_port = ${POP3_PORT}

[analytics]
port = ${ANALYTICS_PORT}
backend = "postgres"
EOF

echo "Starting isolated Supabase stack on API port ${API_PORT}..."
supabase start --workdir "$READINESS_WORKDIR" >/dev/null
supabase status --workdir "$READINESS_WORKDIR" -o env > "$STATUS_ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$STATUS_ENV_FILE"
set +a
export SUPABASE_URL="$API_URL"
export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export RLS_USER_A_EMAIL='a@rls.test'
export RLS_USER_A_PASSWORD='Test1234!'
export RLS_USER_B_EMAIL='b@rls.test'
export RLS_USER_B_PASSWORD='Test1234!'

echo 'Linting the migrated database...'
supabase db lint --local --workdir "$READINESS_WORKDIR" --level warning

DB_CONTAINER="supabase_db_${READINESS_PROJECT_ID}"
assert_zero() {
  local label="$1"
  local sql="$2"
  local count
  count="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc "$sql")"
  if [[ "$count" != '0' ]]; then
    echo "Database security audit failed: ${label} (${count})" >&2
    exit 1
  fi
  echo "PASS ${label}"
}

assert_zero 'public tables without RLS' \
  "select count(*) from pg_tables where schemaname='public' and not rowsecurity"
assert_zero 'SECURITY DEFINER functions without a safe search_path' \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig,'{}') && array['search_path=pg_catalog, public','search_path=pg_catalog,public']"
assert_zero 'anonymous application-owned functions' \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')"
assert_zero 'unscoped authenticated read policies' \
  "select count(*) from pg_policies where schemaname='public' and qual='true' and cmd in ('SELECT','ALL') and roles::text <> '{service_role}' and not (tablename='normalizer_column_authority' and policyname='normalizer_column_authority_select_authenticated')"

echo 'Seeding disposable tenant actors...'
npm --prefix "$ROOT_DIR" run test:rls:seed >/dev/null

echo 'Running live authentication, RLS, RPC, edge-function, and persistence tests...'
npm --prefix "$ROOT_DIR" run test:rls

echo 'Production-readiness integration gate passed.'
