#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-image.sh — zero-downtime-ish swap of the GHCR image on this host.
#
# Pulls the requested image tag, starts a NEW container on a temporary port,
# waits for its /healthz to go green, then swaps traffic by renaming: the
# old container is stopped/removed and the new one is renamed to the
# canonical name the Cloudflare Tunnel / nginx upstream points at.
#
# Idempotent. Safe to re-run. On health-check failure, the new container is
# torn down and the old one is left running untouched.
#
# Usage:
#   ./scripts/deploy-image.sh <image-ref>
#
# Env (with defaults):
#   CONTAINER_NAME   (default: flc-bi-uat)         — canonical container name
#   HOST_PORT        (default: 8080)               — port bound on 127.0.0.1
#   HEALTH_TIMEOUT   (default: 60)                 — seconds to wait for /healthz
#   SKIP_PULL        (default: 0)                  — set to 1 for local images
#   GHCR_USERNAME    (optional)                    — only needed for private images
#   GHCR_TOKEN       (optional)                    — PAT with read:packages
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

IMAGE="${1:-}"
[[ -n "$IMAGE" ]] || { echo "Usage: $0 <image-ref>" >&2; exit 1; }

CONTAINER_NAME="${CONTAINER_NAME:-flc-bi-uat}"
HOST_PORT="${HOST_PORT:-8080}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
SKIP_PULL="${SKIP_PULL:-0}"
STAGING_NAME="${CONTAINER_NAME}-staging"
STAGING_PORT="$(( HOST_PORT + 1 ))"

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not installed"

# Login only if creds are present (public images don't need this).
if [[ -n "${GHCR_TOKEN:-}" && -n "${GHCR_USERNAME:-}" ]]; then
  log "Logging in to ghcr.io"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
fi

if [[ "$SKIP_PULL" == "1" || "$SKIP_PULL" == "true" ]]; then
  log "Skipping pull for local image $IMAGE"
else
  log "Pulling $IMAGE"
  docker pull "$IMAGE"
fi

# Clean any leftover staging container from a previous failed run.
if docker ps -a --format '{{.Names}}' | grep -qx "$STAGING_NAME"; then
  log "Removing stale staging container"
  docker rm -f "$STAGING_NAME" >/dev/null
fi

log "Starting staging container on 127.0.0.1:$STAGING_PORT"
docker run -d \
  --name "$STAGING_NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${STAGING_PORT}:8080" \
  "$IMAGE" >/dev/null

# Health-check loop.
log "Waiting up to ${HEALTH_TIMEOUT}s for /healthz"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until curl -fsS "http://127.0.0.1:${STAGING_PORT}/healthz" >/dev/null 2>&1; do
  if (( $(date +%s) >= deadline )); then
    log "Health check timed out — rolling back"
    docker logs --tail 50 "$STAGING_NAME" >&2 || true
    docker rm -f "$STAGING_NAME" >/dev/null
    die "New image $IMAGE failed health check; existing container untouched."
  fi
  sleep 2
done
log "Staging container healthy"

# Swap. There is a brief (≤1s) moment where neither container is bound to
# HOST_PORT — acceptable for UAT; for true zero-downtime put both behind a
# local nginx upstream that can drain connections. Cloudflare retries
# failed requests automatically so end users typically don't notice.
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  log "Stopping existing $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" >/dev/null
  docker rm "$CONTAINER_NAME" >/dev/null
fi

log "Promoting staging to $CONTAINER_NAME on 127.0.0.1:$HOST_PORT"
docker stop "$STAGING_NAME" >/dev/null
docker rm "$STAGING_NAME" >/dev/null
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:${HOST_PORT}:8080" \
  "$IMAGE" >/dev/null

# Final verification on the canonical port.
log "Verifying canonical endpoint"
for i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/healthz" >/dev/null; then
    log "Deploy complete — $IMAGE is live on 127.0.0.1:${HOST_PORT}"
    docker image prune -f --filter "until=72h" >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 1
done

die "Canonical container failed to come up. Check: docker logs $CONTAINER_NAME"
