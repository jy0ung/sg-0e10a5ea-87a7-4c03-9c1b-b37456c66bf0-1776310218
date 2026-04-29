#!/usr/bin/env bash
set -euo pipefail

TAG="${TAG:-v0.1.0}"
IMAGE_TAG="${IMAGE_TAG:-${TAG#v}}"
RELEASE_ENVIRONMENT="${RELEASE_ENVIRONMENT:-uat-hrms}"
DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-$RELEASE_ENVIRONMENT}"
REF="${REF:-main}"
DEPLOY_AFTER_RELEASE="${DEPLOY_AFTER_RELEASE:-0}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v gh >/dev/null || die "GitHub CLI is required: https://cli.github.com/"
gh auth status >/dev/null || die "GitHub CLI is not authenticated"

cd "$REPO_ROOT"

case "$RELEASE_ENVIRONMENT" in
  uat-hrms|production-hrms) ;;
  *) die "Unsupported RELEASE_ENVIRONMENT '$RELEASE_ENVIRONMENT'. Expected uat-hrms or production-hrms." ;;
esac

case "$DEPLOY_ENVIRONMENT" in
  uat-hrms|production-hrms) ;;
  *) die "Unsupported DEPLOY_ENVIRONMENT '$DEPLOY_ENVIRONMENT'. Expected uat-hrms or production-hrms." ;;
esac

scripts/check-hrms-github-env.sh "$RELEASE_ENVIRONMENT" release

printf 'Dispatching Release workflow: tag=%s environment=%s build_target=hrms-web ref=%s\n' \
  "$TAG" "$RELEASE_ENVIRONMENT" "$REF"
gh workflow run release.yml \
  --ref "$REF" \
  --field tag="$TAG" \
  --field environment="$RELEASE_ENVIRONMENT" \
  --field build_target=hrms-web

cat <<EOF

Release workflow dispatched.

Watch it with:
  gh run list --workflow release.yml --limit 5
  gh run watch <run-id> --exit-status
EOF

if [[ "$DEPLOY_AFTER_RELEASE" == "1" || "$DEPLOY_AFTER_RELEASE" == "true" ]]; then
  scripts/check-hrms-github-env.sh "$DEPLOY_ENVIRONMENT" deploy
  printf 'Dispatching Deploy Image workflow: environment=%s app=hrms-web image_tag=%s ref=%s\n' \
    "$DEPLOY_ENVIRONMENT" "$IMAGE_TAG" "$REF"
  gh workflow run deploy-image.yml \
    --ref "$REF" \
    --field environment="$DEPLOY_ENVIRONMENT" \
    --field app=hrms-web \
    --field image_tag="$IMAGE_TAG"

  cat <<EOF

Deploy workflow dispatched.

Watch it with:
  gh run list --workflow deploy-image.yml --limit 5
  gh run watch <run-id> --exit-status
EOF
else
  cat <<EOF

After the Release workflow succeeds, deploy with:
  DEPLOY_AFTER_RELEASE=1 TAG=$TAG IMAGE_TAG=$IMAGE_TAG RELEASE_ENVIRONMENT=$RELEASE_ENVIRONMENT DEPLOY_ENVIRONMENT=$DEPLOY_ENVIRONMENT scripts/release-hrms-web.sh

Or dispatch Deploy Image manually with:
  gh workflow run deploy-image.yml --ref $REF --field environment=$DEPLOY_ENVIRONMENT --field app=hrms-web --field image_tag=$IMAGE_TAG
EOF
fi