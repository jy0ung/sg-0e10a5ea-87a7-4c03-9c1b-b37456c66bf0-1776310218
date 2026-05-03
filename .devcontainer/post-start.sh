#!/usr/bin/env bash
# post-start.sh – runs after each Codespace start
# Updates .env with the correct forwarded Supabase URL for this codespace.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [[ -n "${CODESPACE_NAME:-}" && -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  # Use a relative path so the URL resolves correctly regardless of whether the app is
  # accessed via http://localhost:3000 or the Codespaces forwarded domain. The Supabase
  # client (packages/supabase/src/client.ts) prepends window.location.origin at runtime.
  SUPABASE_URL="/__supabase"
  echo "Codespaces detected — setting VITE_SUPABASE_URL=$SUPABASE_URL (relative proxy path)"

  # Update or insert VITE_SUPABASE_URL in .env
  if grep -q "^VITE_SUPABASE_URL=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=\"$SUPABASE_URL\"|" "$ENV_FILE"
  else
    echo "VITE_SUPABASE_URL=\"$SUPABASE_URL\"" >> "$ENV_FILE"
  fi

  # Set port visibility to public via gh CLI (best-effort — only need port 3000)
  for PORT in 3000; do
    gh codespace ports visibility "${PORT}:public" -c "$CODESPACE_NAME" 2>/dev/null && \
      echo "Port $PORT set to public" || \
      echo "Port $PORT visibility update skipped (will auto-forward from devcontainer.json)"
  done
else
  echo "Not a Codespace — leaving .env unchanged"
fi
