#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SUPABASE_URL="${HRMS_LOCAL_SUPABASE_URL:-http://127.0.0.1:55321}" \
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required in .env}" \
ADMIN_EMAIL="${HRMS_LOCAL_ADMIN_EMAIL:-hrms.admin@flc.local}" \
ADMIN_PASSWORD="${HRMS_LOCAL_ADMIN_PASSWORD:-LocalHrmsAdmin123!}" \
COMPANY_NAME="${HRMS_LOCAL_COMPANY_NAME:-Fook Loi HRMS Local}" \
ENABLE_MODULE_ID="hrms" \
npx tsx scripts/bootstrap-admin.ts
