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
  AUTH_EXTERNAL_URL          Public Supabase Auth API base URL used in email
                             action links. Defaults to <APP_URL>/auth/v1.
  SUPABASE_API_EXTERNAL_URL  Public Supabase API origin. Defaults to <APP_URL>.
  HRMS_APP_URL               Public HRMS origin. Defaults to <APP_URL>/hrms.
  AUTH_RATE_LIMIT_EMAIL_SENT Auth emails per hour allowed by GoTrue. Defaults
                             to 30 when production SMTP is configured.
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
RECOVERY_TEMPLATE_FILE="${ROOT_DIR}/supabase/templates/recovery.html"
SYSTEMD_ENV_FILE="${SYSTEMD_ENV_FILE:-/etc/flc-bi/supabase.env}"
SUPABASE_SERVICE_FILE="${SUPABASE_SERVICE_FILE:-/etc/systemd/system/flc-bi-supabase.service}"
SUDO_BIN="${SUDO_BIN-sudo}"
AUTH_SMTP_PORT="${AUTH_SMTP_PORT:-587}"
AUTH_RATE_LIMIT_EMAIL_SENT="${AUTH_RATE_LIMIT_EMAIL_SENT:-30}"
RESTART_SUPABASE_SERVICE="${RESTART_SUPABASE_SERVICE:-1}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  die "No supabase/config.toml found in ${ROOT_DIR}"
fi

if [[ ! -f "$RECOVERY_TEMPLATE_FILE" ]]; then
  die "No recovery email template found at ${RECOVERY_TEMPLATE_FILE}"
fi

current_site_url="$(sed -n 's/^site_url = "\(.*\)"$/\1/p' "$CONFIG_FILE" | head -n 1)"
APP_URL="${APP_URL:-$current_site_url}"
AUTH_EXTERNAL_URL="${AUTH_EXTERNAL_URL:-${APP_URL%/}/auth/v1}"
AUTH_EXTERNAL_URL="${AUTH_EXTERNAL_URL%/}"
SUPABASE_API_EXTERNAL_URL="${SUPABASE_API_EXTERNAL_URL:-${APP_URL%/}}"
SUPABASE_API_EXTERNAL_URL="${SUPABASE_API_EXTERNAL_URL%/}"
HRMS_APP_URL="${HRMS_APP_URL:-${APP_URL%/}/hrms}"

prompt_for_secret AUTH_SMTP_PASS "SMTP password/API key"

for required_var in APP_URL AUTH_EXTERNAL_URL SUPABASE_API_EXTERNAL_URL AUTH_SMTP_HOST AUTH_SMTP_USER AUTH_SMTP_PASS AUTH_SMTP_ADMIN_EMAIL AUTH_SMTP_SENDER_NAME; do
  if [[ -z "${!required_var:-}" ]]; then
    die "${required_var} is required"
  fi
done

if [[ ! "$AUTH_EXTERNAL_URL" =~ ^https?:// ]]; then
  die "AUTH_EXTERNAL_URL must start with http:// or https://"
fi

if [[ ! "$SUPABASE_API_EXTERNAL_URL" =~ ^https?:// ]]; then
  die "SUPABASE_API_EXTERNAL_URL must start with http:// or https://"
fi

if [[ ! "$AUTH_SMTP_PORT" =~ ^[0-9]+$ ]]; then
  die "AUTH_SMTP_PORT must be numeric"
fi

if [[ ! "$AUTH_RATE_LIMIT_EMAIL_SENT" =~ ^[0-9]+$ || "$AUTH_RATE_LIMIT_EMAIL_SENT" -lt 1 ]]; then
  die "AUTH_RATE_LIMIT_EMAIL_SENT must be a positive integer"
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

build_recovery_template_block() {
  cat <<'EOF'
[auth.email.template.recovery]
subject = "Reset your FLC BI password"
content_path = "./supabase/templates/recovery.html"
EOF
}

log "Updating auth URLs in supabase/config.toml"
SUPABASE_API_EXTERNAL_URL_VALUE="$SUPABASE_API_EXTERNAL_URL" perl -0pi -e '
  my $value = $ENV{SUPABASE_API_EXTERNAL_URL_VALUE};
  s{^(\[api\]\n(?:(?!^\[).)*?^external_url = ").*?("$)}{$1$value$2}ms
    or s{^(\[api\]\n)}{$1external_url = "$value"\n}m
    or s{^(project_id = ".*?"\n)}{$1\n[api]\nexternal_url = "$value"\n}m;
' "$CONFIG_FILE"
if ! awk -v expected="$SUPABASE_API_EXTERNAL_URL" '
  /^\[api\]$/ { in_api = 1; next }
  /^\[/ { in_api = 0 }
  in_api && $0 == "external_url = \"" expected "\"" { found = 1 }
  END { exit found ? 0 : 1 }
' "$CONFIG_FILE"; then
  die "Unable to set api.external_url in ${CONFIG_FILE}"
fi
SITE_URL_VALUE="$APP_URL" perl -0pi -e 's{^site_url = ".*?"$}{site_url = "$ENV{SITE_URL_VALUE}"}m;' "$CONFIG_FILE"
AUTH_EXTERNAL_URL_VALUE="$AUTH_EXTERNAL_URL" perl -0pi -e '
  my $value = $ENV{AUTH_EXTERNAL_URL_VALUE};
  s{^(\[auth\]\n(?:(?!^\[).)*?^external_url = ").*?("$)}{$1$value$2}ms
    or s{^(\[auth\]\n(?:(?!^\[).)*?^site_url = ".*?"\n)}{$1external_url = "$value"\n}ms;
' "$CONFIG_FILE"
if ! awk -v expected="$AUTH_EXTERNAL_URL" '
  /^\[auth\]$/ { in_auth = 1; next }
  /^\[/ { in_auth = 0 }
  in_auth && $0 == "external_url = \"" expected "\"" { found = 1 }
  END { exit found ? 0 : 1 }
' "$CONFIG_FILE"; then
  die "Unable to set auth.external_url in ${CONFIG_FILE}"
fi
REDIRECTS_TOML="$(build_redirects_toml)" perl -0pi -e 's{^additional_redirect_urls = \[(?:.|\n)*?^\]}{$ENV{REDIRECTS_TOML}}ms' "$CONFIG_FILE"

log "Setting Supabase Auth email rate limit"
AUTH_RATE_LIMIT_EMAIL_SENT_VALUE="$AUTH_RATE_LIMIT_EMAIL_SENT" perl -0pi -e '
  my $value = $ENV{AUTH_RATE_LIMIT_EMAIL_SENT_VALUE};
  s{^(\[auth\.rate_limit\]\n(?:(?!^\[).)*?^email_sent = )\d+}{$1$value}ms
    or s{^(\[auth\.rate_limit\]\n)}{$1email_sent = $value\n}m
    or s{^(\[auth\.email\]\n)}{[auth.rate_limit]\nemail_sent = $value\n\n$1}m
    or die "Unable to locate [auth.email] to insert [auth.rate_limit]\n";
' "$CONFIG_FILE"
if ! awk -v expected="$AUTH_RATE_LIMIT_EMAIL_SENT" '
  /^\[auth\.rate_limit\]$/ { in_rate_limit = 1; next }
  /^\[/ { in_rate_limit = 0 }
  in_rate_limit && $0 == "email_sent = " expected { found = 1 }
  END { exit found ? 0 : 1 }
' "$CONFIG_FILE"; then
  die "Unable to set auth.rate_limit.email_sent in ${CONFIG_FILE}"
fi

log "Ensuring Supabase recovery email template is configured"
RECOVERY_TEMPLATE_BLOCK="$(build_recovery_template_block)"
if grep -q '^\[auth\.email\.template\.recovery\]$' "$CONFIG_FILE"; then
  RECOVERY_TEMPLATE_BLOCK="$RECOVERY_TEMPLATE_BLOCK" perl -0pi -e '
    my $block = $ENV{RECOVERY_TEMPLATE_BLOCK};
    s{^\[auth\.email\.template\.recovery\]\n(?:(?!^\[).)*}{$block . "\n\n"}mse;
  ' "$CONFIG_FILE"
else
  printf '\n%s\n' "$RECOVERY_TEMPLATE_BLOCK" >>"$CONFIG_FILE"
fi
if ! awk '
  /^\[auth\.email\.template\.recovery\]$/ { in_template = 1; next }
  /^\[/ { in_template = 0 }
  in_template && $0 == "content_path = \"./supabase/templates/recovery.html\"" { content_path = 1 }
  in_template && $0 == "subject = \"Reset your FLC BI password\"" { subject = 1 }
  END { exit content_path && subject ? 0 : 1 }
' "$CONFIG_FILE"; then
  die "Unable to configure auth.email.template.recovery in ${CONFIG_FILE}"
fi

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
  Supabase API external URL: ${SUPABASE_API_EXTERNAL_URL}
  Auth external URL: ${AUTH_EXTERNAL_URL}
  HRMS App URL: ${HRMS_APP_URL}
  Auth email rate limit: ${AUTH_RATE_LIMIT_EMAIL_SENT}/hour
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
