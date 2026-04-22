#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# configure-cloudflare-access-ssh.sh — host-side prep for GitHub → host
# deployments over a Cloudflare Tunnel, gated by Cloudflare Access.
#
# Run this ONCE on the deploy target (UAT or prod). Idempotent — safe to
# re-run if you change values.
#
# What it does:
#   1. Ensures cloudflared is installed (already the case on the UAT box).
#   2. Adds an SSH ingress rule to the existing tunnel config so the tunnel
#      also forwards <SSH_ACCESS_HOSTNAME> → ssh://localhost:22.
#   3. Creates/updates a dedicated deploy user with an authorized key.
#   4. Prints the next manual steps you must complete in the Cloudflare
#      dashboard (Access Application + Service Token), with the exact
#      fields pre-filled.
#
# This script does NOT talk to the Cloudflare API (keeps scope tight +
# avoids storing API tokens on the server). Dashboard steps are quick.
#
# Env (all required):
#   TUNNEL_NAME           existing tunnel, e.g. flc-bi-uat
#   SSH_ACCESS_HOSTNAME   DNS hostname for SSH, e.g. ssh.uat.protonfookloi.com
#                         (must be a subdomain of a zone on your Cloudflare
#                         account — we'll tell you to click "Create DNS
#                         record" in the Access step)
#   DEPLOY_USER           OS user to create/use, e.g. deploy
#   DEPLOY_PUBKEY         one-line SSH public key (ssh-ed25519 AAAA... comment)
#
# Example:
#   sudo TUNNEL_NAME=flc-bi-uat \
#        SSH_ACCESS_HOSTNAME=ssh.uat.protonfookloi.com \
#        DEPLOY_USER=deploy \
#        DEPLOY_PUBKEY='ssh-ed25519 AAAA... github-deploy' \
#        ./scripts/configure-cloudflare-access-ssh.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

: "${TUNNEL_NAME:?Missing TUNNEL_NAME}"
: "${SSH_ACCESS_HOSTNAME:?Missing SSH_ACCESS_HOSTNAME}"
: "${DEPLOY_USER:?Missing DEPLOY_USER}"
: "${DEPLOY_PUBKEY:?Missing DEPLOY_PUBKEY}"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

log() { printf '\033[1;34m[cf-access]\033[0m %s\n' "$*"; }

# ─── 1. cloudflared present? ─────────────────────────────────────────────────
if ! command -v cloudflared >/dev/null; then
  echo "cloudflared not installed. Install it first." >&2
  exit 1
fi

# ─── 2. Resolve tunnel config path ───────────────────────────────────────────
CONFIG_PATH="/etc/cloudflared/config.yml"
if [[ ! -f "$CONFIG_PATH" ]]; then
  # cloudflared service can also live under /root/.cloudflared; try both.
  [[ -f /root/.cloudflared/config.yml ]] && CONFIG_PATH=/root/.cloudflared/config.yml
fi
[[ -f "$CONFIG_PATH" ]] || { echo "Cannot find cloudflared config.yml" >&2; exit 1; }

log "Using cloudflared config at $CONFIG_PATH"

# ─── 3. Create deploy user + authorized key ──────────────────────────────────
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  log "Creating system user $DEPLOY_USER"
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi

# Grant docker access (required so deploy-image.sh can pull + swap containers).
if getent group docker >/dev/null; then
  usermod -aG docker "$DEPLOY_USER"
fi

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AUTH_KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$AUTH_KEYS"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

if ! grep -qxF "$DEPLOY_PUBKEY" "$AUTH_KEYS"; then
  log "Adding deploy pubkey to $AUTH_KEYS"
  printf '%s\n' "$DEPLOY_PUBKEY" >> "$AUTH_KEYS"
else
  log "Deploy pubkey already present"
fi

# ─── 4. Add SSH ingress to the tunnel config ─────────────────────────────────
#     Insert the SSH hostname BEFORE the existing catch-all (http_status:404)
#     rule that cloudflared requires as the final entry. If an ingress block
#     for this hostname already exists we leave it alone.
if grep -qE "hostname:[[:space:]]+${SSH_ACCESS_HOSTNAME//./\\.}\\b" "$CONFIG_PATH"; then
  log "SSH ingress rule already present — leaving config alone"
else
  log "Backing up $CONFIG_PATH → $CONFIG_PATH.bak.$(date +%s)"
  cp "$CONFIG_PATH" "$CONFIG_PATH.bak.$(date +%s)"

  # Build the new rule and splice it in before the http_status:404 catch-all.
  TMP="$(mktemp)"
  awk -v rule="  - hostname: ${SSH_ACCESS_HOSTNAME}\n    service: ssh://localhost:22" '
    /service:[[:space:]]+http_status:404/ && !spliced {
      print rule
      spliced = 1
    }
    { print }
  ' "$CONFIG_PATH" > "$TMP"

  # Sanity check — must still end with the catch-all.
  if ! grep -qE 'http_status:404' "$TMP"; then
    echo "Refusing to write config without catch-all rule." >&2
    rm -f "$TMP"
    exit 1
  fi

  mv "$TMP" "$CONFIG_PATH"
  log "Ingress rule added"
fi

# ─── 5. Restart cloudflared to pick up the change ────────────────────────────
log "Restarting cloudflared service"
systemctl restart cloudflared
sleep 2
systemctl is-active --quiet cloudflared || {
  echo "cloudflared failed to start — check: journalctl -u cloudflared -n 50" >&2
  exit 1
}

# ─── 6. Tell the operator what to finish in the dashboard ────────────────────
cat <<MSG

────────────────────────────────────────────────────────────────────────────
Host side done. Finish in the Cloudflare dashboard:

1. Create the DNS route (one-time):
     cloudflared tunnel route dns ${TUNNEL_NAME} ${SSH_ACCESS_HOSTNAME}

2. Create an Access Application
   (Zero Trust → Access → Applications → Add an application → Self-hosted):
     • Application domain: ${SSH_ACCESS_HOSTNAME}
     • Application type: SSH

3. Create a Service Auth policy on that application:
     • Action: Service Auth
     • Include: Service Token → Create new service token
         → Name: github-actions-deploy
       Save the Client ID and Client Secret shown ONCE — you will paste
       them into the GitHub environment secrets CF_ACCESS_CLIENT_ID and
       CF_ACCESS_CLIENT_SECRET.

4. Gather the host key for known_hosts, FROM A MACHINE THAT CAN REACH THE
   TUNNEL (typically your laptop with cloudflared installed and logged in
   interactively once):
     ssh-keyscan -T 10 ${SSH_ACCESS_HOSTNAME}
   Paste the output into the GitHub environment secret SSH_KNOWN_HOSTS.

5. Add the OpenSSH private key matching $DEPLOY_USER's authorized_keys
   entry as SSH_PRIVATE_KEY, plus SSH_USER=$DEPLOY_USER and
   SSH_HOST=${SSH_ACCESS_HOSTNAME}.
────────────────────────────────────────────────────────────────────────────
MSG
