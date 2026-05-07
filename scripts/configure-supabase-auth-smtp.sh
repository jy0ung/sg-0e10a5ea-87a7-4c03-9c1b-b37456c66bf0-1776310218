#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: AUTH_SMTP_HOST=... AUTH_SMTP_USER=... AUTH_SMTP_PASS=... \
       AUTH_SMTP_ADMIN_EMAIL=... AUTH_SMTP_SENDER_NAME=... \
       bash scripts/configure-supabase-auth-smtp.sh [repo-root]

Examples:
  cp scripts/configure-supabase-auth-smtp.env.example ~/flc-bi-smtp.env
  set -a && source ~/flc-bi-smtp.env && set +a
  bash scripts/configure-supabase-auth-smtp.sh /srv/flc-bi

Environment:
  APP_URL                    Public main app origin. Defaults to the current
                             site_url in supabase/config.toml.
  HRMS_APP_URL               Public HRMS origin. Defaults to <APP_URL>/hrms.
  AUTH_SMTP_HOST             SMTP relay hostname, e.g. smtp.resend.com.
  AUTH_SMTP_PORT             SMTP relay port. Defaults to 587.
  AUTH_SMTP_USER             SMTP username.
  AUTH_SMTP_PASS             SMTP password or API key. Stored in the systemd
                             environment file instead of git-tracked config.
  AUTH_SMTP_ADMIN_EMAIL      From address shown to recipients.
  AUTH_SMTP_SENDER_NAME      Sender name shown to recipients.
  SYSTEMD_ENV_FILE           Secure env file read by flc-bi-supabase.service.
                             Defaults to /etc/flc-bi/supabase.env.
  SUPABASE_SERVICE_FILE      Systemd unit file to patch. Defaults to
                             /etc/systemd/system/flc-bi-supabase.service.
  SUDO_BIN                   Override the privilege escalation command.
                             Defaults to sudo. Set to an empty value for dry runs.
  RESTART_SUPABASE_SERVICE   Set to 0 to skip restarting the systemd service.
                             Defaults to 1.
EOF
}

log() {
  printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"
}

prompt_for_secret() {
  local variable_name="$1"
  local prompt_label="$2"

  if [[ -n "${!variable_name:-}" ]]; then
    return
  fi

  if [[ ! -t 0 ]]; then
    die "${variable_name} is required"
  fi

  read -rsp "${prompt_label}: " "$variable_name"
  printf '\n'

  if [[ -z "${!variable_name}" ]]; then
    die "${variable_name} is required"
  fi
}

run_root() {
  if [[ -n "${SUDO_BIN}" ]]; then
    "$SUDO_BIN" "$@"
  else
    "$@"
  fi
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

if [[ $# -gt 1 ]]; then
  usage
  exit 1
fi

ROOT_DIR="${1:-$(pwd)}"
CONFIG_FILE="${ROOT_DIR}/supabase/config.toml"
SYSTEMD_ENV_FILE="${SYSTEMD_ENV_FILE:-/etc/flc-bi/supabase.env}"
SUPABASE_SERVICE_FILE="${SUPABASE_SERVICE_FILE:-/etc/systemd/system/flc-bi-supabase.service}"
SUDO_BIN="${SUDO_BIN-sudo}"
AUTH_SMTP_PORT="${AUTH_SMTP_PORT:-587}"
RESTART_SUPABASE_SERVICE="${RESTART_SUPABASE_SERVICE:-1}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  die "No supabase/config.toml found in ${ROOT_DIR}"
fi

current_site_url="$(sed -n 's/^site_url = "\(.*\)"$/\1/p' "$CONFIG_FILE" | head -n 1)"
APP_URL="${APP_URL:-$current_site_url}"
HRMS_APP_URL="${HRMS_APP_URL:-${APP_URL%/}/hrms}"

prompt_for_secret AUTH_SMTP_PASS "SMTP password/API key"

for required_var in APP_URL AUTH_SMTP_HOST AUTH_SMTP_USER AUTH_SMTP_PASS AUTH_SMTP_ADMIN_EMAIL AUTH_SMTP_SENDER_NAME; do
  if [[ -z "${!required_var:-}" ]]; then
    die "${required_var} is required"
  fi
done

if [[ ! "$AUTH_SMTP_PORT" =~ ^[0-9]+$ ]]; then
  die "AUTH_SMTP_PORT must be numeric"
fi

build_redirects_toml() {
  local redirect_urls=(
    "${APP_URL}/signup"
    "${APP_URL}/reset-password"
    "${APP_URL}/hrms/signup"
    "${APP_URL}/hrms/forgot-password"
    "${APP_URL}/hrms/reset-password"
  )

  if [[ "$HRMS_APP_URL" != "${APP_URL%/}/hrms" ]]; then
    redirect_urls+=(
      "${HRMS_APP_URL}/signup"
      "${HRMS_APP_URL}/forgot-password"
      "${HRMS_APP_URL}/reset-password"
    )
  fi

  printf 'additional_redirect_urls = [\n'
  local index
  for index in "${!redirect_urls[@]}"; do
    if [[ "$index" -eq $((${#redirect_urls[@]} - 1)) ]]; then
      printf '  "%s"\n' "${redirect_urls[$index]}"
    else
      printf '  "%s",\n' "${redirect_urls[$index]}"
    fi
  done
  printf ']'
}

build_smtp_block() {
  cat <<EOF
[auth.email.smtp]
enabled = true
host = "${AUTH_SMTP_HOST}"
port = ${AUTH_SMTP_PORT}
user = "${AUTH_SMTP_USER}"
pass = "env(AUTH_SMTP_PASS)"
admin_email = "${AUTH_SMTP_ADMIN_EMAIL}"
sender_name = "${AUTH_SMTP_SENDER_NAME}"
EOF
}

log "Updating auth URLs in supabase/config.toml"
SITE_URL_VALUE="$APP_URL" perl -0pi -e 's{^site_url = ".*?"$}{site_url = "$ENV{SITE_URL_VALUE}"}m;' "$CONFIG_FILE"
REDIRECTS_TOML="$(build_redirects_toml)" perl -0pi -e 's{^additional_redirect_urls = \[(?:.|\n)*?^\]}{$ENV{REDIRECTS_TOML}}ms' "$CONFIG_FILE"

if ! grep -q '^# BEGIN managed auth SMTP relay$' "$CONFIG_FILE"; then
  die "supabase/config.toml is missing the managed auth SMTP relay markers"
fi

log "Enabling managed Supabase auth SMTP relay block"
tmp_config_file="$(mktemp)"
awk -v block="$(build_smtp_block)" '
  $0 == "# BEGIN managed auth SMTP relay" {
    print
    print block
    skip = 1
    next
  }
  $0 == "# END managed auth SMTP relay" {
    skip = 0
    print
    next
  }
  !skip { print }
' "$CONFIG_FILE" >"$tmp_config_file"
install -m 0644 "$tmp_config_file" "$CONFIG_FILE"
rm -f "$tmp_config_file"

log "Writing SMTP secret to ${SYSTEMD_ENV_FILE}"
tmp_env_file="$(mktemp)"
printf 'AUTH_SMTP_PASS=%q\n' "$AUTH_SMTP_PASS" >"$tmp_env_file"
run_root install -d -m 0750 "$(dirname "$SYSTEMD_ENV_FILE")"
run_root install -m 0600 "$tmp_env_file" "$SYSTEMD_ENV_FILE"
rm -f "$tmp_env_file"

service_path="$SUPABASE_SERVICE_FILE"
if [[ -f "$service_path" ]]; then
  log "Ensuring flc-bi-supabase.service reads ${SYSTEMD_ENV_FILE}"
  tmp_service_file="$(mktemp)"
  run_root cat "$service_path" | awk -v env_line="EnvironmentFile=-${SYSTEMD_ENV_FILE}" '
    $0 ~ /^EnvironmentFile=/ { next }
    $0 == "[Service]" {
      print
      print env_line
      next
    }
    { print }
  ' >"$tmp_service_file"
  run_root install -m 0644 "$tmp_service_file" "$service_path"
  rm -f "$tmp_service_file"
  run_root systemctl daemon-reload

  if [[ "$RESTART_SUPABASE_SERVICE" == "1" ]]; then
    log "Restarting flc-bi-supabase.service"
    run_root systemctl restart flc-bi-supabase.service
  fi
else
  log "No flc-bi-supabase.service found; skipping systemd patch"
fi

cat <<EOF

Supabase auth SMTP relay configured.

Applied values:
  App URL: ${APP_URL}
  HRMS App URL: ${HRMS_APP_URL}
  SMTP host: ${AUTH_SMTP_HOST}:${AUTH_SMTP_PORT}
  SMTP user: ${AUTH_SMTP_USER}
  From address: ${AUTH_SMTP_ADMIN_EMAIL}
  Sender name: ${AUTH_SMTP_SENDER_NAME}
  Systemd env file: ${SYSTEMD_ENV_FILE}

Next checks:
  1. sudo systemctl status flc-bi-supabase.service
  2. Trigger an admin invite from the app and confirm delivery
  3. Trigger a password reset and confirm the reset link lands on the correct host
EOF