#!/usr/bin/env bash
# Configure the existing UAT cloudflared tunnel to route a dedicated HRMS
# hostname to the standalone HRMS container.

set -euo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-flc-bi-uat}"
HRMS_HOSTNAME="${HRMS_HOSTNAME:-}"
HRMS_SERVICE="${HRMS_SERVICE:-http://127.0.0.1:8082}"
CONFIG_PATH="${CONFIG_PATH:-/etc/cloudflared/config.yml}"

log() { printf '\033[1;34m[hrms-tunnel]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[hrms-tunnel]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -n "$HRMS_HOSTNAME" ]] || die "Missing HRMS_HOSTNAME, for example HRMS_HOSTNAME=hrms-uat.protonfookloi.com"
[[ -f "$CONFIG_PATH" ]] || die "Cannot find cloudflared config at $CONFIG_PATH"
command -v cloudflared >/dev/null || die "cloudflared is not installed"

if [[ $EUID -ne 0 ]]; then
  die "Run with sudo so the script can update $CONFIG_PATH and restart cloudflared"
fi

if grep -qE "hostname:[[:space:]]+${HRMS_HOSTNAME//./\.}\b" "$CONFIG_PATH"; then
  log "Ingress rule for $HRMS_HOSTNAME already exists"
else
  backup_path="$CONFIG_PATH.bak.$(date +%s)"
  log "Backing up $CONFIG_PATH to $backup_path"
  cp "$CONFIG_PATH" "$backup_path"

  tmp_path="$(mktemp)"
  awk -v rule="  - hostname: ${HRMS_HOSTNAME}\n    service: ${HRMS_SERVICE}" '
    /service:[[:space:]]+http_status:404/ && !spliced {
      print rule
      spliced = 1
    }
    { print }
    END {
      if (!spliced) exit 42
    }
  ' "$CONFIG_PATH" > "$tmp_path" || {
    rm -f "$tmp_path"
    die "Could not find the required final http_status:404 catch-all ingress rule"
  }

  mv "$tmp_path" "$CONFIG_PATH"
  log "Added ingress: $HRMS_HOSTNAME -> $HRMS_SERVICE"
fi

log "Validating cloudflared ingress config"
cloudflared tunnel --config "$CONFIG_PATH" ingress validate

log "Restarting cloudflared"
systemctl restart cloudflared
systemctl is-active --quiet cloudflared || die "cloudflared failed to restart; check journalctl -u cloudflared -n 50"

cat <<MSG

Host-side ingress is ready.

If DNS has not been created yet, run this as a Cloudflare-authenticated user:

  cloudflared tunnel route dns ${TUNNEL_NAME} ${HRMS_HOSTNAME}

Then verify:

  UAT_APP=hrms-web \\
  UAT_URL=https://${HRMS_HOSTNAME} \\
  UAT_EXPECTED_SUPABASE_URL=https://uat.protonfookloi.com \\
  npm run verify:uat

MSG
