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
#   RUN_RPC_SMOKE    (default: auto)               — run import RPC rollback smoke before swap
#   RPC_SMOKE_SCRIPT (default: /tmp/verify-import-rpc-contracts.sh)
#   RPC_SMOKE_DB_CONTAINER_PATTERN (default: ^supabase_db_)
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
RUN_RPC_SMOKE="${RUN_RPC_SMOKE:-auto}"
RPC_SMOKE_SCRIPT="${RPC_SMOKE_SCRIPT:-/tmp/verify-import-rpc-contracts.sh}"
RPC_SMOKE_DB_CONTAINER_PATTERN="${RPC_SMOKE_DB_CONTAINER_PATTERN:-^supabase_db_}"
STAGING_NAME="${CONTAINER_NAME}-staging"
STAGING_PORT="$(( HOST_PORT + 1 ))"

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

run_inline_rpc_smoke() {
  local db_container="$1"

  docker exec -i "$db_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
begin;

do $$
declare
  actor_id uuid;
  actor_company text;
  batch_id uuid;
  commit_result jsonb;
  dashboard_result jsonb;
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'vehicles'
       and column_name = 'dealer_transfer_price'
       and data_type = 'text'
  ) then
    raise exception 'Expected public.vehicles.dealer_transfer_price to be text';
  end if;

  select p.id, p.company_id
    into actor_id, actor_company
    from public.profiles p
   where p.company_id is not null
   order by p.created_at asc nulls first, p.id asc
   limit 1;

  if actor_id is null or actor_company is null then
    raise exception 'Need at least one public.profiles row with company_id to smoke RPC contracts';
  end if;

  perform set_config('request.jwt.claim.sub', actor_id::text, true);

  insert into public.import_batches (
    file_name,
    uploaded_by,
    uploaded_at,
    status,
    total_rows,
    valid_rows,
    error_rows,
    duplicate_rows,
    company_id
  ) values (
    'rpc-contract-smoke.xlsx',
    'copilot',
    now(),
    'validated',
    1,
    1,
    0,
    0,
    actor_company
  )
  returning id into batch_id;

  commit_result := public.commit_import_batch(
    batch_id,
    jsonb_build_array(
      jsonb_build_object(
        'chassis_no', 'RPC-CONTRACT-SMOKE-001',
        'bg_date', null,
        'shipment_etd_pkg', null,
        'shipment_eta_kk_twu_sdk', null,
        'date_received_by_outlet', null,
        'reg_date', null,
        'delivery_date', null,
        'disb_date', null,
        'branch_code', 'KCH',
        'model', 'SAGA',
        'payment_method', 'CASH',
        'salesman_name', 'Pending',
        'customer_name', 'Pending',
        'remark', null,
        'vaa_date', null,
        'full_payment_date', null,
        'is_d2d', false,
        'import_batch_id', null,
        'source_row_id', 'rpc-contract-smoke-row-1',
        'variant', null,
        'dealer_transfer_price', '/',
        'full_payment_type', null,
        'shipment_name', null,
        'lou', null,
        'contra_sola', null,
        'reg_no', null,
        'invoice_no', null,
        'obr', null,
        'bg_to_delivery', null,
        'bg_to_shipment_etd', null,
        'etd_to_outlet', null,
        'outlet_to_reg', null,
        'reg_to_delivery', null,
        'bg_to_disb', null,
        'delivery_to_disb', null,
        'salesman_id', null,
        'company_id', actor_company
      )
    ),
    '[]'::jsonb,
    1,
    0
  );

  if coalesce((commit_result ->> 'vehicles_upserted')::integer, 0) <> 1 then
    raise exception 'commit_import_batch smoke expected 1 vehicle, got %', commit_result;
  end if;

  dashboard_result := public.auto_aging_dashboard_summary(null, null, null, null);

  if dashboard_result is null or jsonb_typeof(dashboard_result) <> 'object' then
    raise exception 'auto_aging_dashboard_summary returned unexpected payload: %', dashboard_result;
  end if;

  if not (dashboard_result ? 'kpi_summaries') then
    raise exception 'auto_aging_dashboard_summary missing kpi_summaries key: %', dashboard_result;
  end if;
end
$$;

rollback;
SQL
}

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

if [[ "$RUN_RPC_SMOKE" == "1" || "$RUN_RPC_SMOKE" == "true" ]]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E "$RPC_SMOKE_DB_CONTAINER_PATTERN" | head -1 || true)"
  [[ -n "$DB_CONTAINER" ]] || die "RPC smoke requested but no DB container matched $RPC_SMOKE_DB_CONTAINER_PATTERN"

  log "Running RPC smoke against DB container $DB_CONTAINER"
  if [[ -f "$RPC_SMOKE_SCRIPT" ]]; then
    if ! bash "$RPC_SMOKE_SCRIPT" --docker-container "$DB_CONTAINER"; then
      log "RPC smoke failed — rolling back"
      docker rm -f "$STAGING_NAME" >/dev/null || true
      die "New image $IMAGE failed RPC smoke; existing container untouched."
    fi
  elif ! run_inline_rpc_smoke "$DB_CONTAINER"; then
    log "RPC smoke failed — rolling back"
    docker rm -f "$STAGING_NAME" >/dev/null || true
    die "New image $IMAGE failed RPC smoke; existing container untouched."
  fi
  log "RPC smoke passed"
elif [[ "$RUN_RPC_SMOKE" == "auto" ]]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E "$RPC_SMOKE_DB_CONTAINER_PATTERN" | head -1 || true)"
  if [[ -n "$DB_CONTAINER" ]]; then
    log "Running RPC smoke against DB container $DB_CONTAINER"
    if [[ -f "$RPC_SMOKE_SCRIPT" ]]; then
      if ! bash "$RPC_SMOKE_SCRIPT" --docker-container "$DB_CONTAINER"; then
        log "RPC smoke failed — rolling back"
        docker rm -f "$STAGING_NAME" >/dev/null || true
        die "New image $IMAGE failed RPC smoke; existing container untouched."
      fi
    elif ! run_inline_rpc_smoke "$DB_CONTAINER"; then
      log "RPC smoke failed — rolling back"
      docker rm -f "$STAGING_NAME" >/dev/null || true
      die "New image $IMAGE failed RPC smoke; existing container untouched."
    fi
    log "RPC smoke passed"
  else
    log "No DB container matched $RPC_SMOKE_DB_CONTAINER_PATTERN; skipping RPC smoke"
  fi
fi

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
