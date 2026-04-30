#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# provision-supabase-env.sh — idempotent end-to-end Supabase setup for an env.
#
# What this script does (safe to re-run):
#   1. Verifies required tools (supabase CLI, psql, jq, node, pnpm/npm).
#   2. Links the local repo to the target Supabase project.
#   3. Dry-runs migrations and shows the plan. Prompts before applying
#      unless --yes is passed.
#   4. Applies pending migrations via `supabase db push --linked`.
#   5. Verifies schema state (schema_migrations count, critical tables,
#      handle_new_user trigger).
#   6. Bootstraps the first super_admin by running scripts/bootstrap-admin.ts
#      with the service-role key.
#   7. Runs import RPC contract smoke tests against the target database.
#   8. Sets the SITE_URL secret on the remote project so the invite-user
#      edge function emits correct links.
#
# Secrets (NEVER paste on the CLI — load via an env file):
#   SUPABASE_ACCESS_TOKEN       — personal access token (sbp_…)
#   SUPABASE_DB_PASSWORD        — database password for the project
#   SUPABASE_SERVICE_ROLE_KEY   — service-role JWT (NOT anon / publishable)
#   SUPABASE_PROJECT_REF        — project ref, e.g. wptainexktqgfuafzrdp
#   SITE_URL                    — public origin, e.g. https://uat.protonfookloi.com
#   ADMIN_EMAIL                 — first admin's email (must already exist in auth.users
#                                 OR ADMIN_PASSWORD must be set so we create them)
#   ADMIN_PASSWORD              — optional; if set, creates the auth user when missing
#   COMPANY_NAME                — human-readable tenant name, e.g. "Fook Loi Group"
#
# Usage:
#   # 1) Copy the example and fill in secrets OUTSIDE the repo:
#   cp scripts/provision-supabase-env.env.example ~/flc-uat.env
#   chmod 600 ~/flc-uat.env
#   $EDITOR ~/flc-uat.env
#
#   # 2) Source it and run:
#   set -a; . ~/flc-uat.env; set +a
#   ./scripts/provision-supabase-env.sh            # interactive confirmation
#   ./scripts/provision-supabase-env.sh --yes      # unattended (CI)
#   ./scripts/provision-supabase-env.sh --dry-run  # plan only, no changes
#
# Exit codes:
#   0 ok / 1 misuse / 2 missing tool / 3 missing secret / 4 push failed /
#   5 verify failed / 6 bootstrap failed / 7 RPC smoke failed
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

ASSUME_YES=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      sed -n '2,50p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

log()  { printf '\033[1;34m[provision]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[provision]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[provision]\033[0m %s\n' "$*" >&2; exit "${2:-1}"; }

# ─── 1. Tool checks ──────────────────────────────────────────────────────────
log "Checking required tools"
for bin in supabase psql node jq; do
  command -v "$bin" >/dev/null 2>&1 || die "Missing tool: $bin" 2
done
if command -v pnpm >/dev/null 2>&1; then
  PKG_RUN="pnpm exec"
elif command -v npm >/dev/null 2>&1; then
  PKG_RUN="npx --no-install"
else
  die "Need pnpm or npm/npx for running the bootstrap script" 2
fi

# ─── 2. Secret checks ────────────────────────────────────────────────────────
log "Checking required secrets"
for var in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_SERVICE_ROLE_KEY \
           SUPABASE_PROJECT_REF SITE_URL ADMIN_EMAIL COMPANY_NAME; do
  [[ -n "${!var:-}" ]] || die "Missing env var: $var" 3
done

# Sanity-check the service-role key is NOT an anon/publishable key.
if [[ "$SUPABASE_SERVICE_ROLE_KEY" == sb_publishable_* ]]; then
  die "SUPABASE_SERVICE_ROLE_KEY looks like a publishable key. Use the service_role JWT." 3
fi
# Decode the JWT payload (middle segment) and check role.
payload_b64="$(printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | awk -F. '{print $2}')"
# base64url pad
pad=$(( 4 - ${#payload_b64} % 4 ))
[[ $pad -lt 4 ]] && payload_b64="${payload_b64}$(printf '=%.0s' $(seq 1 $pad))"
role_claim="$(printf '%s' "$payload_b64" | tr '_-' '/+' | base64 -d 2>/dev/null | jq -r '.role' 2>/dev/null || true)"
if [[ "$role_claim" != "service_role" ]]; then
  die "SUPABASE_SERVICE_ROLE_KEY has role=\"$role_claim\"; expected \"service_role\"." 3
fi

# ─── 3. Link the project ─────────────────────────────────────────────────────
log "Linking to Supabase project $SUPABASE_PROJECT_REF"
export SUPABASE_ACCESS_TOKEN
export SUPABASE_DB_PASSWORD
supabase link --project-ref "$SUPABASE_PROJECT_REF" >/dev/null

# Discover the pooler URL the CLI cached for us.
POOLER_URL_FILE="$REPO_ROOT/supabase/.temp/pooler-url"
[[ -f "$POOLER_URL_FILE" ]] || die "Pooler URL not cached at $POOLER_URL_FILE" 4
POOLER_URL="$(cat "$POOLER_URL_FILE")"

# ─── 4. Migration dry-run ────────────────────────────────────────────────────
log "Dry-running migrations"
set +e
DRY_OUT="$(supabase db push --linked --dry-run 2>&1)"
DRY_RC=$?
set -e
printf '%s\n' "$DRY_OUT"
[[ $DRY_RC -eq 0 ]] || die "db push --dry-run failed" 4

PENDING_COUNT="$(printf '%s\n' "$DRY_OUT" | grep -cE '^\s+•\s' || true)"
log "Pending migrations: $PENDING_COUNT"

if [[ $DRY_RUN -eq 1 ]]; then
  log "--dry-run set; stopping here."
  exit 0
fi

# ─── 5. Apply migrations ─────────────────────────────────────────────────────
if [[ $PENDING_COUNT -gt 0 ]]; then
  if [[ $ASSUME_YES -ne 1 ]]; then
    read -r -p "Apply $PENDING_COUNT migrations to $SUPABASE_PROJECT_REF? [y/N] " confirm
    [[ "$confirm" == "y" || "$confirm" == "Y" ]] || die "Aborted by user." 1
  fi
  log "Applying migrations"
  supabase db push --linked --yes
else
  log "No pending migrations"
fi

# ─── 6. Verify schema ────────────────────────────────────────────────────────
log "Verifying schema state"
VERIFY_SQL="
SELECT 'migrations_applied='||count(*) FROM supabase_migrations.schema_migrations;
SELECT 'profiles_exists='||(to_regclass('public.profiles') IS NOT NULL);
SELECT 'companies_exists='||(to_regclass('public.companies') IS NOT NULL);
SELECT 'trigger_present='||count(*) FROM pg_trigger WHERE tgname='on_auth_user_created';
"
VERIFY_OUT="$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$POOLER_URL" -tAc "$VERIFY_SQL" 2>&1)"
printf '%s\n' "$VERIFY_OUT"
echo "$VERIFY_OUT" | grep -q 'profiles_exists=t'   || die "public.profiles missing after push" 5
echo "$VERIFY_OUT" | grep -q 'companies_exists=t'  || die "public.companies missing after push" 5
echo "$VERIFY_OUT" | grep -q 'trigger_present=1'   || die "on_auth_user_created trigger missing" 5

# ─── 7. Bootstrap first admin ────────────────────────────────────────────────
log "Bootstrapping admin $ADMIN_EMAIL in company $COMPANY_NAME"
SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
ADMIN_EMAIL="$ADMIN_EMAIL" \
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" \
COMPANY_NAME="$COMPANY_NAME" \
$PKG_RUN tsx "$REPO_ROOT/scripts/bootstrap-admin.ts" || die "bootstrap-admin failed" 6

# ─── 8. Smoke fragile import RPCs ────────────────────────────────────────────
log "Running import RPC contract smoke tests"
SUPABASE_DB_URL="$POOLER_URL" \
  bash "$REPO_ROOT/scripts/verify-import-rpc-contracts.sh" || die "import RPC smoke failed" 7

# ─── 9. Set SITE_URL edge-function secret ────────────────────────────────────
log "Setting SITE_URL edge-function secret"
supabase secrets set \
  --project-ref "$SUPABASE_PROJECT_REF" \
  "SITE_URL=$SITE_URL" \
  "APP_URL=$SITE_URL" >/dev/null

log "Done. Verify:"
log "  • Sign in at $SITE_URL as $ADMIN_EMAIL"
log "  • Dashboard → URL Configuration should list $SITE_URL"
