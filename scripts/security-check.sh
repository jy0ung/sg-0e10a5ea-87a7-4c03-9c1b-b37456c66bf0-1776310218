#!/usr/bin/env bash
# security-check.sh — one-shot pre-release security gate.
# Runs npm audit, osv-scanner (if installed), secret scan, and a grep
# sweep for known red-flag patterns. Designed to run locally or in CI.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

FAIL=0

step "npm audit (high+ severity)"
if ! npm audit --audit-level=high; then
  red "npm audit reported high/critical findings."
  FAIL=1
else
  green "npm audit clean at high+ severity."
fi

step "Secret pattern scan"
# Fail on obvious leaked keys in tracked files. Intentionally narrow.
PATTERNS='(sk_live_|SUPABASE_SERVICE_ROLE_KEY\s*=\s*[A-Za-z0-9._-]{20,}|BEGIN (RSA |EC )?PRIVATE KEY|AWS_SECRET_ACCESS_KEY\s*=\s*[A-Za-z0-9/+=]{20,})'
if git ls-files -z | xargs -0 grep -E -n "$PATTERNS" 2>/dev/null | grep -v 'docs/\|.env.example\|.env.staging.example\|scripts/security-check.sh'; then
  red "Potential secret match above. Investigate before release."
  FAIL=1
else
  green "No obvious secrets in tracked files."
fi

step "supabase.from()/rpc() banned from pages/components"
if grep -rEn "supabase\.(from|rpc)\s*\(" src/pages src/components 2>/dev/null; then
  red "Direct supabase calls found in pages/components; use src/services/*."
  FAIL=1
else
  green "Data access layer discipline holds."
fi

step "No (supabase as any) casts"
if grep -rEn "\(supabase as any\)" src/ 2>/dev/null; then
  red "Residual (supabase as any) casts found."
  FAIL=1
else
  green "No (supabase as any) casts."
fi

step "OSV scanner (optional)"
if command -v osv-scanner >/dev/null 2>&1; then
  if ! osv-scanner --recursive --skip-git .; then
    yellow "osv-scanner reported findings (non-blocking)."
  fi
else
  yellow "osv-scanner not installed; skipping. Install: go install github.com/google/osv-scanner/cmd/osv-scanner@latest"
fi

step "Summary"
if [[ $FAIL -ne 0 ]]; then
  red "Security check FAILED."
  exit 1
fi
green "Security check passed."
