#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-uat-hrms}"
CHECK_SCOPE="${2:-all}"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v gh >/dev/null || die "GitHub CLI is required: https://cli.github.com/"
gh auth status >/dev/null || die "GitHub CLI is not authenticated"

case "$CHECK_SCOPE" in
  all|release|deploy) ;;
  *) die "Unsupported check scope '$CHECK_SCOPE'. Expected all, release, or deploy." ;;
esac

release_required=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
  VITE_APP_URL
)

deploy_required=(
  SSH_HOST
  SSH_USER
  SSH_PRIVATE_KEY
  SSH_KNOWN_HOSTS
  CF_ACCESS_CLIENT_ID
  CF_ACCESS_CLIENT_SECRET
  DEPLOY_CONTAINER_NAME
  DEPLOY_HOST_PORT
)

case "$ENVIRONMENT" in
  uat-hrms)
    uat_required=(
      UAT_URL
      UAT_EXPECTED_SUPABASE_URL
      UAT_HEALTH_URL
    )
    ;;
  production-hrms)
    uat_required=()
    ;;
  *)
    die "Unsupported environment '$ENVIRONMENT'. Expected uat-hrms or production-hrms."
    ;;
esac

required=()
if [[ "$CHECK_SCOPE" == "all" || "$CHECK_SCOPE" == "release" ]]; then
  required+=("${release_required[@]}")
fi
if [[ "$CHECK_SCOPE" == "all" || "$CHECK_SCOPE" == "deploy" ]]; then
  required+=("${deploy_required[@]}" "${uat_required[@]}")
fi

mapfile -t present < <(gh secret list --env "$ENVIRONMENT" --json name --jq '.[].name')

missing=()
for name in "${required[@]}"; do
  found=0
  for existing in "${present[@]}"; do
    if [[ "$existing" == "$name" ]]; then
      found=1
      break
    fi
  done
  if [[ "$found" == "0" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Missing required %s %s secrets:\n' "$ENVIRONMENT" "$CHECK_SCOPE" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

printf 'All required %s %s secrets are present.\n' "$ENVIRONMENT" "$CHECK_SCOPE"