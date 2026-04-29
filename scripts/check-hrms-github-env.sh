#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-uat-hrms}"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v gh >/dev/null || die "GitHub CLI is required: https://cli.github.com/"
gh auth status >/dev/null || die "GitHub CLI is not authenticated"

case "$ENVIRONMENT" in
  uat-hrms)
    required=(
      VITE_SUPABASE_URL
      VITE_SUPABASE_ANON_KEY
      VITE_APP_URL
      SSH_HOST
      SSH_USER
      SSH_PRIVATE_KEY
      SSH_KNOWN_HOSTS
      CF_ACCESS_CLIENT_ID
      CF_ACCESS_CLIENT_SECRET
      DEPLOY_CONTAINER_NAME
      DEPLOY_HOST_PORT
      UAT_URL
      UAT_EXPECTED_SUPABASE_URL
      UAT_HEALTH_URL
    )
    ;;
  production-hrms)
    required=(
      VITE_SUPABASE_URL
      VITE_SUPABASE_ANON_KEY
      VITE_APP_URL
      SSH_HOST
      SSH_USER
      SSH_PRIVATE_KEY
      SSH_KNOWN_HOSTS
      CF_ACCESS_CLIENT_ID
      CF_ACCESS_CLIENT_SECRET
      DEPLOY_CONTAINER_NAME
      DEPLOY_HOST_PORT
    )
    ;;
  *)
    die "Unsupported environment '$ENVIRONMENT'. Expected uat-hrms or production-hrms."
    ;;
esac

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
  printf 'Missing required %s secrets:\n' "$ENVIRONMENT" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

printf 'All required %s secrets are present.\n' "$ENVIRONMENT"