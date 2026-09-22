#!/usr/bin/env bash
set -euo pipefail

EXPECTED_FILE="${1:-/tmp/flc-expected-migrations.txt}"
DB_CONTAINER_PATTERN="${DB_CONTAINER_PATTERN:-^supabase_db_}"

if [[ ! -f "$EXPECTED_FILE" ]]; then
  echo "Expected migration manifest not found: $EXPECTED_FILE" >&2
  exit 1
fi

mapfile -t expected < <(grep -E '^[0-9]{14}$' "$EXPECTED_FILE" | sort -u)
if [[ "${#expected[@]}" -eq 0 ]]; then
  echo "Expected migration manifest is empty or invalid: $EXPECTED_FILE" >&2
  exit 1
fi

db_container="$(docker ps --format '{{.Names}}' | grep -E "$DB_CONTAINER_PATTERN" | head -1 || true)"
if [[ -z "$db_container" ]]; then
  echo "No running database container matched $DB_CONTAINER_PATTERN" >&2
  exit 1
fi

if ! docker exec "$db_container" psql -U postgres -d postgres -Atqc   "select to_regclass('supabase_migrations.schema_migrations') is not null" | grep -qx "t"; then
  echo "supabase_migrations.schema_migrations is unavailable in $db_container" >&2
  exit 1
fi

mapfile -t applied < <(
  docker exec "$db_container" psql -U postgres -d postgres -Atqc     "select version from supabase_migrations.schema_migrations order by version"
)

declare -A applied_set=()
for version in "${applied[@]}"; do
  [[ -n "$version" ]] && applied_set["$version"]=1
done

missing=()
for version in "${expected[@]}"; do
  if [[ -z "${applied_set[$version]:-}" ]]; then
    missing+=("$version")
  fi
done

if [[ "${#missing[@]}" -gt 0 ]]; then
  echo "Production database is missing repository migrations:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo "Deployment blocked before container promotion." >&2
  exit 1
fi

latest_expected="${expected[${#expected[@]}-1]}"
latest_applied="${applied[${#applied[@]}-1]:-unknown}"

echo "Migration ledger compatible."
echo "Expected repository migrations: ${#expected[@]}"
echo "Applied production migrations: ${#applied[@]}"
echo "Latest expected migration: $latest_expected"
echo "Latest applied migration: $latest_applied"
