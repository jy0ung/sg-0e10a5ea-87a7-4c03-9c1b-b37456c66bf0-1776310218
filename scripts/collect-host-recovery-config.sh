#!/usr/bin/env bash
# Collect privileged rebuild configuration. This does not back up database data.
# Usage: sudo bash scripts/collect-host-recovery-config.sh OUTPUT_DIR KEY_FILE
set -euo pipefail
umask 077

if [[ $EUID -ne 0 || $# -ne 2 ]]; then
  echo 'Usage: sudo bash scripts/collect-host-recovery-config.sh OUTPUT_DIR KEY_FILE' >&2
  exit 2
fi
output_dir=$(realpath -e -- "$1")
key_file=$(realpath -e -- "$2")
[[ -d "$output_dir" && -f "$key_file" && -s "$key_file" ]] || exit 2
[[ $(stat -c %a -- "$key_file") == 600 ]] || {
  echo 'Key file must have mode 600.' >&2
  exit 2
}
owner_uid=$(stat -c %u -- "$output_dir")
owner_gid=$(stat -c %g -- "$output_dir")
archive="$output_dir/root-configuration.tar.zst.gpg"
[[ ! -e "$archive" && ! -e "$archive.partial" ]] || {
  echo 'Output already exists; use a new output directory.' >&2
  exit 2
}
stage=$(mktemp -d /var/tmp/flc-recovery.XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
mkdir -m 700 "$stage/gnupg"

# Diagnostics do not mount, repair, restart, stop, or write to the failed disk.
{
  date -u --iso-8601=seconds
  uname -a
  lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS,MODEL
  findmnt --target /srv
  echo '--- Supabase/Docker state ---'
  systemctl is-active docker.service || true
  echo '--- Fallback Docker volumes on the OS disk ---'
  du -sh /var/lib/docker/volumes 2>/dev/null || true
  find /var/lib/docker/volumes -maxdepth 4 -name PG_VERSION -print 2>/dev/null || true
  echo '--- PostgreSQL processes (command names only) ---'
  ps -eo user,comm | awk 'NR == 1 || /postgres|postmaster/'
  echo '--- Docker failure evidence ---'
  journalctl -u docker.service --since 2026-10-07 --no-pager -o cat |
    tail -80
} > "$stage/privileged-inventory.txt" 2>&1

paths=(etc usr/local/bin usr/local/sbin var/spool/cron/crontabs)
for item in home/deploy root/.ssh root/.cloudflared root/.config/flc-bi var/lib/docker/containers; do
  if [[ -e "/$item" ]]; then paths+=("$item"); fi
done

echo 'Encrypting privileged configuration; no database recovery is claimed.'
tar --acls --xattrs --numeric-owner --one-file-system \
  --exclude='node_modules' --exclude='.cache' --exclude='.npm' \
  --exclude='.vscode-server' --exclude='.cursor-server' \
  -C / -cf - "${paths[@]}" -C "$stage" privileged-inventory.txt |
  zstd -T2 -3 -q |
  gpg --homedir "$stage/gnupg" --batch --yes --pinentry-mode loopback \
    --passphrase-file "$key_file" --symmetric --cipher-algo AES256 \
    --compress-algo none --output "$archive.partial"
mv -- "$archive.partial" "$archive"
chown "$owner_uid:$owner_gid" "$archive"
chmod 600 "$archive"
sha256sum "$archive" > "$archive.sha256"
cp "$stage/privileged-inventory.txt" "$output_dir/privileged-inventory.txt"
chown "$owner_uid:$owner_gid" "$archive.sha256" "$output_dir/privileged-inventory.txt"
echo "Created: $archive"
echo 'Keep the key separately. The archive must still be uploaded and verified.'
