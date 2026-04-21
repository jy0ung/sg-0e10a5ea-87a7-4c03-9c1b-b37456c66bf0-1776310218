#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-ubuntu-test-server.sh <server-host> [repo-root]

Examples:
  bash scripts/setup-ubuntu-test-server.sh 192.168.1.241
  bash scripts/setup-ubuntu-test-server.sh test-server.local /srv/flc-bi
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
APP_URL="http://${SERVER_HOST}:3000"
SUPABASE_API_URL="http://${SERVER_HOST}:54321"
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

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker is already installed"
    sudo systemctl enable --now docker
  else
    log "Installing Docker Engine"
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    source /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker
  fi

  if ! id -nG "$APP_USER" | tr ' ' '\n' | grep -qx docker; then
    sudo usermod -aG docker "$APP_USER"
  fi
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

install_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    log "PM2 is already installed"
    return
  fi

  log "Installing PM2"
  sudo npm install -g pm2
}

configure_env_files() {
  log "Configuring .env.local for the LAN host"

  if [[ -f .env.local ]]; then
    :
  elif [[ -f .env ]]; then
    cp .env .env.local
  else
    # Phase 0 hardening: do not bake in demo/project-specific keys. Operator
    # must populate .env.local with the real VITE_SUPABASE_URL /
    # VITE_SUPABASE_ANON_KEY / VITE_SITE_URL before the app will boot.
    cat > .env.local <<'EOF'
# Populate these before running `npm run dev`.
VITE_SUPABASE_URL=""
VITE_SUPABASE_ANON_KEY=""
VITE_SUPABASE_PUBLISHABLE_KEY=""
VITE_SUPABASE_PROJECT_ID=""
VITE_SITE_URL="http://127.0.0.1:3000"
EOF
  fi

  sed -i \
    -e "s|^VITE_SUPABASE_URL=.*$|VITE_SUPABASE_URL=\"${SUPABASE_API_URL}\"|" \
    -e "s|^VITE_SITE_URL=.*$|VITE_SITE_URL=\"${APP_URL}\"|" \
    .env.local
}

patch_supabase_config() {
  log "Updating supabase/config.toml for the LAN host"
  sed -i \
    -e "s|^site_url = \".*\"|site_url = \"${APP_URL}\"|" \
    -e "s|^additional_redirect_urls = \[.*\]|additional_redirect_urls = [\"${APP_URL}/signup\", \"${APP_URL}/reset-password\", \"http://localhost:3000/signup\", \"http://localhost:3000/reset-password\"]|" \
    supabase/config.toml
}

install_workspace_dependencies() {
  log "Installing workspace dependencies"
  npm ci
}

print_next_steps() {
  cat <<EOF

Bootstrap complete.

Next steps:
  1. Open a new shell if the docker group was just added.
  2. From the repo root, run: supabase start
     If the shell still lacks Docker socket access, use: sg docker -c 'supabase start'
  3. Start the app with PM2: pm2 start ecosystem.config.cjs
  4. Save the PM2 process list: pm2 save
  5. If UFW is enabled, allow the exposed ports:
       sudo ufw allow 3000/tcp
       sudo ufw allow 54321/tcp
       sudo ufw allow 54323/tcp
       sudo ufw allow 54324/tcp

LAN URLs:
  App: ${APP_URL}
  Supabase API: ${SUPABASE_API_URL}
  Supabase Studio: http://${SERVER_HOST}:54323
  Mailpit: http://${SERVER_HOST}:54324

If you want Chromium for Playwright smoke tests, run:
  npx playwright install chromium
EOF
}

install_base_packages
install_swap
install_node
install_docker
install_supabase_cli
install_pm2
configure_env_files
patch_supabase_config
install_workspace_dependencies
print_next_steps
