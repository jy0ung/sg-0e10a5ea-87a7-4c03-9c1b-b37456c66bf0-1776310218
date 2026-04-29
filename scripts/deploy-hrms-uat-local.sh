#!/usr/bin/env bash
# Build and deploy the standalone HRMS UAT image on the current host.
#
# This is the local-host counterpart to the GitHub Release + Deploy Image
# workflows. It exists for UAT break/fix runs where we need to validate a
# standalone HRMS fix before publishing an immutable GHCR release.

set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

IMAGE_TAG="${IMAGE_TAG:-flc-bi-uat:hrms-web-uat-$(date +%Y%m%d%H%M%S)}"
HRMS_APP_URL="${HRMS_APP_URL:-https://hrms-uat.protonfookloi.com}"
SUPABASE_URL="${SUPABASE_URL:-https://uat.protonfookloi.com}"
APP_ENV="${APP_ENV:-staging}"
APP_VERSION="${APP_VERSION:-local-hrms-uat-$(date +%Y%m%d%H%M%S)}"
ENV_FILE="${ENV_FILE:-.env}"
CONTAINER_NAME="${CONTAINER_NAME:-flc-bi-hrms-uat}"
HOST_PORT="${HOST_PORT:-8082}"
VERIFY_DEPLOY="${VERIFY_DEPLOY:-1}"

log() { printf '\033[1;34m[hrms-uat]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[hrms-uat]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not installed"

if [[ -z "${VITE_SUPABASE_ANON_KEY:-}" && -f "$ENV_FILE" ]]; then
  VITE_SUPABASE_ANON_KEY="$(sed -n 's/^VITE_SUPABASE_ANON_KEY=//p' "$ENV_FILE" | head -1 | tr -d '"')"
fi

[[ -n "${VITE_SUPABASE_ANON_KEY:-}" ]] || die "Missing VITE_SUPABASE_ANON_KEY; set it or provide ENV_FILE=.env"

log "Building $IMAGE_TAG for $HRMS_APP_URL"
docker build \
  --build-arg BUILD_WORKSPACE=apps/hrms-web \
  --build-arg BUILD_OUTPUT_DIR=apps/hrms-web/dist \
  --build-arg BUILD_HRMS_WEB=false \
  --build-arg VITE_SUPABASE_URL="$SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  --build-arg VITE_APP_ENV="$APP_ENV" \
  --build-arg VITE_APP_URL="$HRMS_APP_URL" \
  --build-arg VITE_APP_VERSION="$APP_VERSION" \
  -t "$IMAGE_TAG" .

log "Promoting $IMAGE_TAG to $CONTAINER_NAME on 127.0.0.1:$HOST_PORT"
SKIP_PULL=1 \
CONTAINER_NAME="$CONTAINER_NAME" \
HOST_PORT="$HOST_PORT" \
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}" \
  scripts/deploy-image.sh "$IMAGE_TAG"

if [[ "$VERIFY_DEPLOY" == "1" || "$VERIFY_DEPLOY" == "true" ]]; then
  log "Running HRMS UAT verifier"
  UAT_APP=hrms-web \
  UAT_URL="$HRMS_APP_URL" \
  UAT_EXPECTED_SUPABASE_URL="$SUPABASE_URL" \
  UAT_HEALTH_URL="$HRMS_APP_URL/healthz" \
    npm run verify:uat
fi

cat <<MSG

HRMS UAT deploy complete.

Image:      $IMAGE_TAG
Container:  $CONTAINER_NAME
Local URL:  http://127.0.0.1:$HOST_PORT
Public URL: $HRMS_APP_URL

MSG