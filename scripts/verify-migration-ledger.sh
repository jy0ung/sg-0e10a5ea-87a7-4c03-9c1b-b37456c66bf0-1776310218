#!/usr/bin/env bash
set -euo pipefail

MANIFEST=""
DB_CONTAINER=""
APPLIED_VERSIONS_FILE=""
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

usage() {
  cat <<'EOF'
Usage:
  verify-migration-ledger.sh --manifest <migration-filenames.txt> --docker-container <name>
  verify-migration-ledger.sh --manifest <migration-filenames.txt> --applied-versions-file <versions.txt>

The manifest must contain one supabase/migrations SQL filename per line.
The check fails when any migration required by the release is missing from
supabase_migrations.schema_migrations. Extra applied DB migrations are reported
but do not fail the check so an older compatible application image can be used
for rollback.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      MANIFEST="${2:-}"
      shift 2
      ;;
    --docker-container)
      DB_CONTAINER="${2:-}"
      shift 2
      ;;
    --applied-versions-file)
      APPLIED_VERSIONS_FILE="${2:-}"
      shift 2
      ;;
    --db-user)
      DB_USER="${2:-}"
      shift 2
      ;;
    --db-name)
      DB_NAME="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ -n "$MANIFEST" ]] || { echo "Missing --manifest" >&2; exit 2; }
[[ -f "$MANIFEST" ]] || { echo "Migration manifest not found: $MANIFEST" >&2; exit 2; }

if [[ -n "$DB_CONTAINER" && -n "$APPLIED_VERSIONS_FILE" ]]; then
  echo "Provide only one applied-version source: --docker-container or --applied-versions-file" >&2
  exit 2
fi

if [[ -z "$DB_CONTAINER" && -z "$APPLIED_VERSIONS_FILE" ]]; then
  echo "Provide --docker-container or --applied-versions-file" >&2
  exit 2
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

expected="$tmp_dir/expected.txt"
applied="$tmp_dir/applied.txt"
missing="$tmp_dir/missing.txt"
extra="$tmp_dir/extra.txt"

line_no=0
while IFS= read -r filename || [[ -n "$filename" ]]; do
  line_no=$((line_no + 1))
  [[ -n "$filename" ]] || continue
  if [[ ! "$filename" =~ ^([0-9]{14})_.+\.sql$ ]]; then
    echo "Invalid migration filename at manifest line $line_no: $filename" >&2
    exit 2
  fi
  printf '%s\n' "${BASH_REMATCH[1]}"
done < "$MANIFEST" | sort -u > "$expected"

expected_count="$(wc -l < "$expected" | tr -d ' ')"
[[ "$expected_count" -gt 0 ]] || { echo "Migration manifest contains no valid migrations" >&2; exit 2; }

version_count="$(awk 'NF {print substr($0,1,14)}' "$MANIFEST" | sort | uniq -d | wc -l | tr -d ' ')"
if [[ "$version_count" -gt 0 ]]; then
  echo "Migration manifest contains duplicate 14-digit migration versions" >&2
  awk 'NF {print substr($0,1,14)}' "$MANIFEST" | sort | uniq -d >&2
  exit 2
fi

if [[ -n "$APPLIED_VERSIONS_FILE" ]]; then
  [[ -f "$APPLIED_VERSIONS_FILE" ]] || { echo "Applied versions file not found: $APPLIED_VERSIONS_FILE" >&2; exit 2; }
  awk 'NF {print $1}' "$APPLIED_VERSIONS_FILE" | sort -u > "$applied"
else
  command -v docker >/dev/null || { echo "docker not installed" >&2; exit 2; }
  if ! docker exec "$DB_CONTAINER" psql       -U "$DB_USER"       -d "$DB_NAME"       -t -A       -v ON_ERROR_STOP=1       -c "select version from supabase_migrations.schema_migrations order by version;"       | sed '/^[[:space:]]*$/d'       | sort -u > "$applied"; then
    echo "Unable to read supabase_migrations.schema_migrations from $DB_CONTAINER" >&2
    exit 1
  fi
fi

applied_count="$(wc -l < "$applied" | tr -d ' ')"
[[ "$applied_count" -gt 0 ]] || { echo "Production migration ledger is empty or unreadable" >&2; exit 1; }

comm -23 "$expected" "$applied" > "$missing"
comm -13 "$expected" "$applied" > "$extra"

if [[ -s "$missing" ]]; then
  echo "Migration compatibility FAILED." >&2
  echo "Release requires migration versions not present in the production ledger:" >&2
  sed 's/^/  - /' "$missing" >&2
  echo "Do not promote the application image until the database migration phase is completed and verified." >&2
  exit 1
fi

echo "Migration compatibility passed: $expected_count release migrations are present in the database ledger."

if [[ -s "$extra" ]]; then
  extra_count="$(wc -l < "$extra" | tr -d ' ')"
  echo "Database contains $extra_count migration version(s) not present in this release; allowed for rollback compatibility."
fi
