#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

log()  { printf '\033[1;34m[rpc-smoke]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[rpc-smoke]\033[0m %s\n' "$*" >&2; exit "${2:-1}"; }

DB_MODE="url"
DB_TARGET="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker-container)
      [[ $# -ge 2 ]] || die "--docker-container requires a container name" 1
      DB_MODE="docker"
      DB_TARGET="$2"
      shift 2
      ;;
    --help|-h)
      cat <<'EOF'
Usage:
  verify-import-rpc-contracts.sh <db-url>
  verify-import-rpc-contracts.sh --docker-container <container-name>

Environment fallbacks:
  SUPABASE_DB_URL / DATABASE_URL
EOF
      exit 0
      ;;
    *)
      if [[ -z "$DB_TARGET" ]]; then
        DB_TARGET="$1"
      else
        die "Unexpected argument: $1" 1
      fi
      shift
      ;;
  esac
done

[[ -n "$DB_TARGET" ]] || die "Usage: $0 <db-url> or $0 --docker-container <container-name>" 1

log "Running import RPC contract smoke tests"

if [[ "$DB_MODE" == "docker" ]]; then
  command -v docker >/dev/null 2>&1 || die "docker is required for --docker-container mode" 2
  SQL_RUNNER=(docker exec -i "$DB_TARGET" psql -U postgres -d postgres -v ON_ERROR_STOP=1)
else
  command -v psql >/dev/null 2>&1 || die "psql is required for DB URL mode" 2
  SQL_RUNNER=(psql "$DB_TARGET" -v ON_ERROR_STOP=1)
fi

"${SQL_RUNNER[@]}" <<'SQL'
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

log "Import RPC contract smoke tests passed"