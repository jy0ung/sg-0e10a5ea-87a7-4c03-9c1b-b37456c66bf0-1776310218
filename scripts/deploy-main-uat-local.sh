#!/usr/bin/env bash
# Build and deploy the main BI app (uat.protonfookloi.com) image on the
# current host.  Mirrors deploy-hrms-uat-local.sh for the root workspace.
#
# Required env:
#   VITE_SUPABASE_ANON_KEY   Supabase anon key (or set ENV_FILE)
#   VITE_HRMS_APP_URL        Public URL of the HRMS workspace (required — the
#                            HRMS module button will be broken without it)
#
# Optional env (all have sensible defaults):
#   SUPABASE_URL             defaults to https://uat.protonfookloi.com
#   MAIN_APP_URL             defaults to https://uat.protonfookloi.com
#   APP_ENV                  defaults to staging
#   APP_VERSION              defaults to local-main-uat-<timestamp>
#   IMAGE_TAG                defaults to flc-bi-uat:main-<timestamp>
#   CONTAINER_NAME           defaults to flc-bi-uat
#   HOST_PORT                defaults to 8080
#   ENV_FILE                 path to .env file for fallback key reads
#   VERIFY_DEPLOY            set to 0 to skip post-deploy verification

set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

IMAGE_TAG="${IMAGE_TAG:-flc-bi-uat:main-$(date +%Y%m%d%H%M%S)}"
SUPABASE_URL="${SUPABASE_URL:-https://uat.protonfookloi.com}"
MAIN_APP_URL="${MAIN_APP_URL:-https://uat.protonfookloi.com}"
APP_ENV="${APP_ENV:-staging}"
APP_VERSION="${APP_VERSION:-local-main-uat-$(date +%Y%m%d%H%M%S)}"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER_NAME="${CONTAINER_NAME:-flc-bi-uat}"
HOST_PORT="${HOST_PORT:-8080}"
VERIFY_DEPLOY="${VERIFY_DEPLOY:-1}"

log() { printf '\033[1;34m[main-uat]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[main-uat]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not installed"

# ── Resolve secrets from env or .env file ────────────────────────────────────
if [[ -z "${VITE_SUPABASE_ANON_KEY:-}" && -f "$ENV_FILE" ]]; then
  VITE_SUPABASE_ANON_KEY="$(sed -n 's/^VITE_SUPABASE_ANON_KEY=//p' "$ENV_FILE" | head -1 | tr -d '"')"
fi

[[ -n "${VITE_SUPABASE_ANON_KEY:-}" ]] || \
  die "Missing VITE_SUPABASE_ANON_KEY; set it or provide ENV_FILE=.env"

# ── VITE_HRMS_APP_URL is required for the main app ───────────────────────────
# Without it the HRMS module button falls back to /hrms/ (a local path).
# The service worker has no cached entry for that route and serves the
# "FLC needs an internet connection" offline page instead.
[[ -n "${VITE_HRMS_APP_URL:-}" ]] || \
  die "Missing VITE_HRMS_APP_URL (e.g. https://hrms-uat.protonfookloi.com).
       The HRMS module button will be broken without it."

log "Building $IMAGE_TAG"
log "  APP_URL      = $MAIN_APP_URL"
log "  HRMS_APP_URL = $VITE_HRMS_APP_URL"
log "  SUPABASE_URL = $SUPABASE_URL"

docker build \
  --build-arg VITE_SUPABASE_URL="$SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  --build-arg VITE_APP_URL="$MAIN_APP_URL" \
  --build-arg VITE_HRMS_APP_URL="$VITE_HRMS_APP_URL" \
  --build-arg VITE_APP_ENV="$APP_ENV" \
  --build-arg VITE_APP_VERSION="$APP_VERSION" \
  -t "$IMAGE_TAG" .

log "Promoting $IMAGE_TAG to $CONTAINER_NAME on 127.0.0.1:$HOST_PORT"
SKIP_PULL=1 \
CONTAINER_NAME="$CONTAINER_NAME" \
HOST_PORT="$HOST_PORT" \
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}" \
  scripts/deploy-image.sh "$IMAGE_TAG"

if [[ "$VERIFY_DEPLOY" == "1" || "$VERIFY_DEPLOY" == "true" ]]; then
  log "Running main-app UAT verifier"
  UAT_APP=main \
  UAT_URL="$MAIN_APP_URL" \
  UAT_EXPECTED_SUPABASE_URL="$SUPABASE_URL" \
  UAT_HEALTH_URL="$MAIN_APP_URL/healthz" \
  UAT_EXPECTED_HRMS_APP_URL="$VITE_HRMS_APP_URL" \
    npm run verify:uat
fi

cat <<MSG

Main app UAT deploy complete.

Image:      $IMAGE_TAG
Container:  $CONTAINER_NAME
Local URL:  http://127.0.0.1:$HOST_PORT
Public URL: $MAIN_APP_URL

MSG
