#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-production-host.sh <public-app-hostname> [repo-root]

Examples:
  bash scripts/setup-production-host.sh app.example.com
  APP_URL=https://app.example.com bash scripts/setup-production-host.sh app.example.com /srv/flc-bi

Environment overrides:
  APP_URL                   Public browser origin for the app. Defaults to https://<hostname>
  AUTH_EXTERNAL_URL         Public Supabase Auth API base URL used in email
                           action links. Defaults to <APP_URL>/auth/v1.
  SUPABASE_API_EXTERNAL_URL Public Supabase API origin. Defaults to <APP_URL>.
  HRMS_APP_URL              Public browser origin for the standalone HRMS app.
                            Defaults to <APP_URL>/hrms.
  AUTH_RATE_LIMIT_EMAIL_SENT Auth emails per hour allowed by GoTrue when SMTP
                            is configured. Defaults to 30.
  SUPABASE_INTERNAL_URL     Upstream URL the app container should reach. Defaults to
                            http://host.docker.internal:54321 for an all-in-one host.
  SYSTEMD_ENV_FILE          Secure env file read by the Supabase systemd service.
                            Defaults to /etc/flc-bi/supabase.env.
  AUTH_SMTP_HOST, AUTH_SMTP_PORT, AUTH_SMTP_USER, AUTH_SMTP_PASS,
  AUTH_SMTP_ADMIN_EMAIL, AUTH_SMTP_SENDER_NAME
                            If all are set, the script will configure a production
                            SMTP relay for Supabase Auth during bootstrap.
  ENABLE_SUPABASE_SERVICE   Set to 1 to install and enable a systemd oneshot that runs
                            `supabase start` from the repo root on boot. Defaults to 1.
  START_SUPABASE_SERVICE    Set to 1 to start the Supabase service immediately. Defaults to 1.
  TUNNEL_NAME, SSH_ACCESS_HOSTNAME, DEPLOY_USER, DEPLOY_PUBKEY
                            If all are set, the script will run
                            scripts/configure-cloudflare-access-ssh.sh after the base install.
EOF
}

log() {
  printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

SERVER_HOST="$1"
SERVER_HOST="${SERVER_HOST#http://}"
SERVER_HOST="${SERVER_HOST#https://}"
SERVER_HOST="${SERVER_HOST%/}"
ROOT_DIR="${2:-$(pwd)}"
APP_URL="${APP_URL:-https://${SERVER_HOST}}"
AUTH_EXTERNAL_URL="${AUTH_EXTERNAL_URL:-${APP_URL%/}/auth/v1}"
AUTH_EXTERNAL_URL="${AUTH_EXTERNAL_URL%/}"
SUPABASE_API_EXTERNAL_URL="${SUPABASE_API_EXTERNAL_URL:-${APP_URL%/}}"
SUPABASE_API_EXTERNAL_URL="${SUPABASE_API_EXTERNAL_URL%/}"
AUTH_RATE_LIMIT_EMAIL_SENT="${AUTH_RATE_LIMIT_EMAIL_SENT:-30}"
HRMS_APP_URL="${HRMS_APP_URL:-${APP_URL%/}/hrms}"
SUPABASE_INTERNAL_URL="${SUPABASE_INTERNAL_URL:-http://host.docker.internal:54321}"
SYSTEMD_ENV_FILE="${SYSTEMD_ENV_FILE:-/etc/flc-bi/supabase.env}"
AUTH_SMTP_PORT="${AUTH_SMTP_PORT:-587}"
ENABLE_SUPABASE_SERVICE="${ENABLE_SUPABASE_SERVICE:-1}"
START_SUPABASE_SERVICE="${START_SUPABASE_SERVICE:-1}"
DOCKER_DATA_ROOT="${DOCKER_DATA_ROOT:-/srv/docker}"
APP_USER="${SUDO_USER:-${USER:-}}"

if [[ -z "$APP_USER" ]]; then
  die "Unable to determine the deploy user. Run this from a sudo-capable user account."
fi

if [[ "$EUID" -eq 0 && -z "${SUDO_USER:-}" ]]; then
  die "Run this as the deploy user with sudo access, not as root."
fi

if [[ ! -f "$ROOT_DIR/package.json" ]]; then
  die "No package.json found in $ROOT_DIR"
fi

cd "$ROOT_DIR"

log "Refreshing sudo credentials"
sudo -v

install_base_packages() {
  log "Installing base OS packages"
  sudo apt-get update
  sudo apt-get install -y \
    ca-certificates \
    curl \
    git \
    gnupg \
    jq \
    lsb-release \
    build-essential \
    unzip \
    xz-utils \
    ufw
}

install_swap() {
  if sudo swapon --show | grep -q '^'; then
    log "Swap is already configured"
    return
  fi

  if [[ ! -f /swapfile ]]; then
    log "Creating 4G swap file"
    sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
  fi

  sudo swapon /swapfile
  if ! grep -q '^/swapfile none swap sw 0 0$' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
}

install_node() {
  local node_major

  if command -v node >/dev/null 2>&1; then
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
    if [[ "$node_major" -ge 20 ]]; then
      log "Node.js $(node --version) is already installed"
      return
    fi
    log "Upgrading Node.js to 20+"
  else
    log "Installing Node.js 20+"
  fi

  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
}

configure_docker_daemon() {
  log "Configuring Docker data root at ${DOCKER_DATA_ROOT}"

  sudo install -d -m 0711 "$DOCKER_DATA_ROOT"
  sudo install -d -m 0755 /etc/docker

  local tmp_json
  tmp_json="$(mktemp)"

  if [[ -f /etc/docker/daemon.json ]]; then
    sudo cat /etc/docker/daemon.json | jq --arg data_root "$DOCKER_DATA_ROOT" '. + {"data-root": $data_root}' >"$tmp_json"
  else
    jq -n --arg data_root "$DOCKER_DATA_ROOT" '{"data-root": $data_root}' >"$tmp_json"
  fi

  sudo install -m 0644 "$tmp_json" /etc/docker/daemon.json
  rm -f "$tmp_json"
}

install_docker() {
  local docker_installed=0

  if command -v docker >/dev/null 2>&1; then
    docker_installed=1
    log "Docker is already installed"
  else
    log "Installing Docker Engine"
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    source /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  configure_docker_daemon

  sudo systemctl enable docker
  if sudo systemctl is-active --quiet docker; then
    sudo systemctl restart docker
  else
    sudo systemctl start docker
  fi

  if ! id -nG "$APP_USER" | tr ' ' '\n' | grep -qx docker; then
    sudo usermod -aG docker "$APP_USER"
  fi
}

install_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    log "cloudflared is already installed"
    return
  fi

  log "Installing cloudflared"
  local arch asset_name asset_url

  arch="$(dpkg --print-architecture)"
  case "$arch" in
    amd64|arm64) ;;
    *) die "Unsupported architecture for cloudflared: $arch" ;;
  esac

  asset_name="cloudflared-linux-${arch}.deb"
  asset_url="https://github.com/cloudflare/cloudflared/releases/latest/download/${asset_name}"

  curl -fsSL "$asset_url" -o "/tmp/${asset_name}"
  sudo dpkg -i "/tmp/${asset_name}" || sudo apt-get -f install -y
}

install_supabase_cli() {
  if command -v supabase >/dev/null 2>&1; then
    log "Supabase CLI is already installed"
    return
  fi

  log "Installing Supabase CLI"
  local release_tag release_version arch asset_name asset_url

  release_tag="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest | jq -r '.tag_name')"
  release_version="${release_tag#v}"
  arch="$(dpkg --print-architecture)"

  case "$arch" in
    amd64|arm64) ;;
    *) die "Unsupported architecture for the Supabase CLI: $arch" ;;
  esac

  asset_name="supabase_${release_version}_linux_${arch}.deb"
  asset_url="https://github.com/supabase/cli/releases/download/${release_tag}/${asset_name}"

  curl -fsSL "$asset_url" -o "/tmp/${asset_name}"
  sudo dpkg -i "/tmp/${asset_name}" || sudo apt-get -f install -y
}

configure_supabase_config() {
  if [[ ! -f supabase/config.toml ]]; then
    log "No supabase/config.toml found; skipping auth redirect update"
    return
  fi

  log "Updating supabase/config.toml for ${APP_URL}"
  local redirect_urls

  if [[ "$HRMS_APP_URL" == "${APP_URL%/}/hrms" ]]; then
    redirect_urls=$(cat <<EOF
additional_redirect_urls = [
  "${APP_URL}/signup",
  "${APP_URL}/reset-password",
  "${APP_URL}/hrms/signup",
  "${APP_URL}/hrms/forgot-password",
  "${APP_URL}/hrms/reset-password"
]
EOF
)
  else
    redirect_urls=$(cat <<EOF
additional_redirect_urls = [
  "${APP_URL}/signup",
  "${APP_URL}/reset-password",
  "${APP_URL}/hrms/signup",
  "${APP_URL}/hrms/forgot-password",
  "${APP_URL}/hrms/reset-password",
  "${HRMS_APP_URL}/signup",
  "${HRMS_APP_URL}/forgot-password",
  "${HRMS_APP_URL}/reset-password"
]
EOF
)
  fi

  SUPABASE_API_EXTERNAL_URL_VALUE="$SUPABASE_API_EXTERNAL_URL" perl -0pi -e '
    my $value = $ENV{SUPABASE_API_EXTERNAL_URL_VALUE};
    s{^(\[api\]\n(?:(?!^\[).)*?^external_url = ").*?("$)}{$1$value$2}ms
      or s{^(\[api\]\n)}{$1external_url = "$value"\n}m
      or s{^(project_id = ".*?"\n)}{$1\n[api]\nexternal_url = "$value"\n}m;
  ' supabase/config.toml
  if ! awk -v expected="$SUPABASE_API_EXTERNAL_URL" '
    /^\[api\]$/ { in_api = 1; next }
    /^\[/ { in_api = 0 }
    in_api && $0 == "external_url = \"" expected "\"" { found = 1 }
    END { exit found ? 0 : 1 }
  ' supabase/config.toml; then
    die "Unable to set api.external_url in supabase/config.toml"
  fi
  SITE_URL_VALUE="$APP_URL" perl -0pi -e 's{^site_url = ".*?"$}{site_url = "$ENV{SITE_URL_VALUE}"}m;' supabase/config.toml
  AUTH_EXTERNAL_URL_VALUE="$AUTH_EXTERNAL_URL" perl -0pi -e '
    my $value = $ENV{AUTH_EXTERNAL_URL_VALUE};
    s{^(\[auth\]\n(?:(?!^\[).)*?^external_url = ").*?("$)}{$1$value$2}ms
      or s{^(\[auth\]\n(?:(?!^\[).)*?^site_url = ".*?"\n)}{$1external_url = "$value"\n}ms;
  ' supabase/config.toml
  if ! awk -v expected="$AUTH_EXTERNAL_URL" '
    /^\[auth\]$/ { in_auth = 1; next }
    /^\[/ { in_auth = 0 }
    in_auth && $0 == "external_url = \"" expected "\"" { found = 1 }
    END { exit found ? 0 : 1 }
  ' supabase/config.toml; then
    die "Unable to set auth.external_url in supabase/config.toml"
  fi
  REDIRECTS_TOML="$redirect_urls" perl -0pi -e 's{^additional_redirect_urls = \[(?:.|\n)*?^\]}{$ENV{REDIRECTS_TOML}}ms' supabase/config.toml

  if [[ ! "$AUTH_RATE_LIMIT_EMAIL_SENT" =~ ^[0-9]+$ || "$AUTH_RATE_LIMIT_EMAIL_SENT" -lt 1 ]]; then
    die "AUTH_RATE_LIMIT_EMAIL_SENT must be a positive integer"
  fi
  AUTH_RATE_LIMIT_EMAIL_SENT_VALUE="$AUTH_RATE_LIMIT_EMAIL_SENT" perl -0pi -e '
    my $value = $ENV{AUTH_RATE_LIMIT_EMAIL_SENT_VALUE};
    s{^(\[auth\.rate_limit\]\n(?:(?!^\[).)*?^email_sent = )\d+}{$1$value}ms
      or s{^(\[auth\.rate_limit\]\n)}{$1email_sent = $value\n}m
      or s{^(\[auth\.email\]\n)}{[auth.rate_limit]\nemail_sent = $value\n\n$1}m
      or die "Unable to locate [auth.email] to insert [auth.rate_limit]\n";
  ' supabase/config.toml
  if ! awk -v expected="$AUTH_RATE_LIMIT_EMAIL_SENT" '
    /^\[auth\.rate_limit\]$/ { in_rate_limit = 1; next }
    /^\[/ { in_rate_limit = 0 }
    in_rate_limit && $0 == "email_sent = " expected { found = 1 }
    END { exit found ? 0 : 1 }
  ' supabase/config.toml; then
    die "Unable to set auth.rate_limit.email_sent in supabase/config.toml"
  fi
}

configure_auth_smtp_if_requested() {
  local smtp_vars=(
    AUTH_SMTP_HOST
    AUTH_SMTP_USER
    AUTH_SMTP_PASS
    AUTH_SMTP_ADMIN_EMAIL
    AUTH_SMTP_SENDER_NAME
  )
  local provided=0
  local var_name

  for var_name in "${smtp_vars[@]}"; do
    if [[ -n "${!var_name:-}" ]]; then
      provided=$((provided + 1))
    fi
  done

  if [[ "$provided" -eq 0 ]]; then
    log "Skipping Supabase auth SMTP relay bootstrap"
    return
  fi

  if [[ "$provided" -ne "${#smtp_vars[@]}" ]]; then
    die "Set all AUTH_SMTP_* values before enabling Supabase auth SMTP relay bootstrap."
  fi

  log "Configuring Supabase auth SMTP relay"
  APP_URL="$APP_URL" \
  AUTH_EXTERNAL_URL="$AUTH_EXTERNAL_URL" \
  SUPABASE_API_EXTERNAL_URL="$SUPABASE_API_EXTERNAL_URL" \
  HRMS_APP_URL="$HRMS_APP_URL" \
  AUTH_RATE_LIMIT_EMAIL_SENT="$AUTH_RATE_LIMIT_EMAIL_SENT" \
  AUTH_SMTP_HOST="$AUTH_SMTP_HOST" \
  AUTH_SMTP_PORT="$AUTH_SMTP_PORT" \
  AUTH_SMTP_USER="$AUTH_SMTP_USER" \
  AUTH_SMTP_PASS="$AUTH_SMTP_PASS" \
  AUTH_SMTP_ADMIN_EMAIL="$AUTH_SMTP_ADMIN_EMAIL" \
  AUTH_SMTP_SENDER_NAME="$AUTH_SMTP_SENDER_NAME" \
  SYSTEMD_ENV_FILE="$SYSTEMD_ENV_FILE" \
  RESTART_SUPABASE_SERVICE=0 \
  ./scripts/configure-supabase-auth-smtp.sh "$ROOT_DIR"
}

install_workspace_dependencies() {
  log "Installing workspace dependencies"
  npm ci
}

install_supabase_service() {
  if [[ "$ENABLE_SUPABASE_SERVICE" != "1" ]]; then
    log "Skipping Supabase systemd service install"
    return
  fi

  log "Installing systemd wrapper for the local Supabase stack"
  sudo tee /usr/local/bin/flc-bi-supabase-up >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$ROOT_DIR"
supabase start
EOF
  sudo tee /usr/local/bin/flc-bi-supabase-down >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$ROOT_DIR"
supabase stop
EOF
  sudo chmod 755 /usr/local/bin/flc-bi-supabase-up /usr/local/bin/flc-bi-supabase-down

  sudo tee /etc/systemd/system/flc-bi-supabase.service >/dev/null <<EOF
[Unit]
Description=FLC BI Supabase stack
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$APP_USER
Group=$APP_USER
SupplementaryGroups=docker
EnvironmentFile=-$SYSTEMD_ENV_FILE
ExecStart=/usr/local/bin/flc-bi-supabase-up
ExecStop=/usr/local/bin/flc-bi-supabase-down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable flc-bi-supabase.service

  if [[ "$START_SUPABASE_SERVICE" == "1" ]]; then
    log "Starting Supabase systemd service"
    sudo systemctl start flc-bi-supabase.service
  fi
}

configure_cloudflare_ssh_if_requested() {
  if [[ -n "${TUNNEL_NAME:-}" && -n "${SSH_ACCESS_HOSTNAME:-}" && -n "${DEPLOY_USER:-}" && -n "${DEPLOY_PUBKEY:-}" ]]; then
    log "Configuring Cloudflare Access SSH"
    sudo env \
      TUNNEL_NAME="$TUNNEL_NAME" \
      SSH_ACCESS_HOSTNAME="$SSH_ACCESS_HOSTNAME" \
      DEPLOY_USER="$DEPLOY_USER" \
      DEPLOY_PUBKEY="$DEPLOY_PUBKEY" \
      ./scripts/configure-cloudflare-access-ssh.sh
  else
    log "Skipping Cloudflare Access SSH bootstrap; set TUNNEL_NAME, SSH_ACCESS_HOSTNAME, DEPLOY_USER, and DEPLOY_PUBKEY to enable it"
  fi
}

print_next_steps() {
  cat <<EOF

Bootstrap complete.

Next steps:
  1. Open a new shell if the docker group was just added.
  2. Confirm the local stack is reachable:
       sudo systemctl status flc-bi-supabase.service
       supabase status
    3. If SMTP relay is enabled, keep the auth secret in:
      ${SYSTEMD_ENV_FILE}
    4. Make sure the production deploy secret uses the host gateway path:
       SUPABASE_INTERNAL_URL=http://host.docker.internal:54321
    5. If you want Cloudflare Access SSH, run:
       TUNNEL_NAME=... SSH_ACCESS_HOSTNAME=... DEPLOY_USER=... DEPLOY_PUBKEY=... \
        sudo ./scripts/configure-cloudflare-access-ssh.sh
    6. Provision the database and first admin using the existing repo scripts once the local stack is healthy.
    7. Push to main and let .github/workflows/main-deploy.yml deploy the web app.

Host values:
  App URL: ${APP_URL}
    Supabase API external URL: ${SUPABASE_API_EXTERNAL_URL}
    Supabase Auth external URL: ${AUTH_EXTERNAL_URL}
    Supabase Auth email rate limit: ${AUTH_RATE_LIMIT_EMAIL_SENT}/hour
    HRMS App URL: ${HRMS_APP_URL}
  Supabase internal URL for the app container: ${SUPABASE_INTERNAL_URL}
    Supabase systemd env file: ${SYSTEMD_ENV_FILE}
  Repo root: ${ROOT_DIR}
EOF
}

install_base_packages
install_swap
install_node
install_docker
install_cloudflared
install_supabase_cli
configure_supabase_config
configure_auth_smtp_if_requested
install_workspace_dependencies
install_supabase_service
configure_cloudflare_ssh_if_requested
print_next_steps
