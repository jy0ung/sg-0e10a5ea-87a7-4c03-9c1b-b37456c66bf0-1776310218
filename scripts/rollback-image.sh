#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-flc-bi-uat}"
HOST_PORT="${HOST_PORT:-8080}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
ROLLBACK_NAME="${CONTAINER_NAME}-rollback"

log() { printf '\033[1;34m[rollback]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[rollback]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[rollback]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not installed"

if ! docker ps -a --format '{{.Names}}' | grep -qx "$ROLLBACK_NAME"; then
  die "No preserved rollback container named $ROLLBACK_NAME"
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  log "Removing failed/current candidate $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

log "Restoring preserved container $ROLLBACK_NAME to $CONTAINER_NAME"
docker rename "$ROLLBACK_NAME" "$CONTAINER_NAME"
docker start "$CONTAINER_NAME" >/dev/null

log "Waiting up to ${HEALTH_TIMEOUT}s for restored /healthz"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until curl -fsS "http://127.0.0.1:${HOST_PORT}/healthz" >/dev/null 2>&1; do
  if (( $(date +%s) >= deadline )); then
    docker logs --tail 100 "$CONTAINER_NAME" >&2 || true
    die "Rollback container failed health verification"
  fi
  sleep 2
done

log "Rollback complete — previous production container is healthy"
